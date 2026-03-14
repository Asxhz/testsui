"""Policy management service for ActuaryOS."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

try:
    from actuaryai.logger import get_logger
except ImportError:
    import logging

    def get_logger(name: str) -> logging.Logger:
        logger = logging.getLogger(name)
        if not logger.handlers:
            logger.setLevel(logging.DEBUG)
            handler = logging.StreamHandler()
            handler.setFormatter(
                logging.Formatter("%(asctime)s | %(name)s | %(levelname)s | %(message)s")
            )
            logger.addHandler(handler)
            logger.propagate = False
        return logger

from actuaryos.database import DB_PATH, execute_query, fetch_all, fetch_one
from actuaryos.models import Policy, PolicyStatus
from actuaryos.services.audit_service import AuditService
from actuaryos.services.pool_service import PoolService

logger = get_logger("actuaryos.services.policy")


class PolicyService:
    """Manages insurance-style policies backed by risk pools."""

    def __init__(self, db_path: Optional[Path] = None) -> None:
        self.db_path = db_path or DB_PATH
        self._audit = AuditService(db_path=self.db_path)
        self._pool_service = PoolService(db_path=self.db_path)

    # ------------------------------------------------------------------
    # Create
    # ------------------------------------------------------------------

    def create_policy(
        self,
        user_id: str,
        pool_id: str,
        source_bundle_id: Optional[str],
        policy_type: str,
        trigger_definition: dict[str, Any],
        coverage_amount: float,
        premium: float,
    ) -> Policy:
        """Create a new policy in *pending* status."""
        # Validate pool exists
        self._pool_service.get_pool(pool_id)

        policy = Policy(
            user_id=user_id,
            pool_id=pool_id,
            source_bundle_id=source_bundle_id,
            policy_type=policy_type,
            trigger_definition=trigger_definition,
            coverage_amount=coverage_amount,
            premium=premium,
            status=PolicyStatus.pending,
        )

        execute_query(
            """
            INSERT INTO policies (id, user_id, pool_id, source_bundle_id,
                                  policy_type, trigger_definition,
                                  coverage_amount, premium, status,
                                  xrpl_premium_tx_hash, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                policy.id,
                policy.user_id,
                policy.pool_id,
                policy.source_bundle_id,
                policy.policy_type,
                json.dumps(policy.trigger_definition),
                policy.coverage_amount,
                policy.premium,
                policy.status.value,
                policy.xrpl_premium_tx_hash,
                policy.created_at.isoformat(),
            ),
            db_path=self.db_path,
        )

        self._audit.log(
            actor_type="user",
            actor_id=user_id,
            event_type="policy.created",
            entity_type="policy",
            entity_id=policy.id,
            payload={
                "pool_id": pool_id,
                "coverage_amount": coverage_amount,
                "premium": premium,
                "policy_type": policy_type,
            },
        )

        logger.info("Policy created: %s for user %s", policy.id, user_id)
        return policy

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    def get_policy(self, policy_id: str) -> Policy:
        """Fetch a single policy by ID.  Raises ValueError if not found."""
        row = fetch_one(
            "SELECT * FROM policies WHERE id = ?",
            (policy_id,),
            db_path=self.db_path,
        )
        if row is None:
            raise ValueError(f"Policy not found: {policy_id}")
        return self._row_to_policy(row)

    def list_policies(
        self,
        pool_id: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> list[Policy]:
        """List policies with optional filters."""
        clauses: list[str] = []
        params: list[Any] = []

        if pool_id is not None:
            clauses.append("pool_id = ?")
            params.append(pool_id)
        if user_id is not None:
            clauses.append("user_id = ?")
            params.append(user_id)

        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        sql = f"SELECT * FROM policies {where} ORDER BY created_at DESC"

        rows = fetch_all(sql, tuple(params), db_path=self.db_path)
        return [self._row_to_policy(r) for r in rows]

    # ------------------------------------------------------------------
    # Activate
    # ------------------------------------------------------------------

    def activate_policy(self, policy_id: str) -> Policy:
        """Move a policy from *pending* to *active* and commit liabilities.

        This increases the backing pool's committed liabilities by the
        policy's coverage amount.
        """
        policy = self.get_policy(policy_id)
        if policy.status != PolicyStatus.pending:
            raise ValueError(
                f"Cannot activate policy {policy_id}: current status is {policy.status.value}"
            )

        execute_query(
            "UPDATE policies SET status = ? WHERE id = ?",
            (PolicyStatus.active.value, policy_id),
            db_path=self.db_path,
        )

        # Increase pool committed liabilities
        self._pool_service.update_liabilities(policy.pool_id, policy.coverage_amount)

        self._audit.log(
            actor_type="system",
            actor_id="policy_service",
            event_type="policy.activated",
            entity_type="policy",
            entity_id=policy_id,
            payload={"coverage_amount": policy.coverage_amount, "pool_id": policy.pool_id},
        )

        logger.info("Policy activated: %s", policy_id)
        return self.get_policy(policy_id)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _row_to_policy(row: dict[str, Any]) -> Policy:
        trigger_def = row.get("trigger_definition", "{}")
        if isinstance(trigger_def, str):
            trigger_def = json.loads(trigger_def)

        return Policy(
            id=row["id"],
            user_id=row["user_id"],
            pool_id=row["pool_id"],
            source_bundle_id=row.get("source_bundle_id"),
            policy_type=row["policy_type"],
            trigger_definition=trigger_def,
            coverage_amount=row["coverage_amount"],
            premium=row["premium"],
            status=PolicyStatus(row["status"]),
            xrpl_premium_tx_hash=row.get("xrpl_premium_tx_hash"),
            created_at=datetime.fromisoformat(row["created_at"]),
        )
