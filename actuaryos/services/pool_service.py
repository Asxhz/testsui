"""Pool management service for ActuaryOS."""

from __future__ import annotations

import json
import re
import sqlite3
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
from actuaryos.engine import ActuarialEngine
from actuaryos.models import Pool, PoolStatus
from actuaryos.services.audit_service import AuditService

logger = get_logger("actuaryos.services.pool")


def _slugify(text: str) -> str:
    """Create a URL-friendly slug from text."""
    slug = text.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    return re.sub(r"-+", "-", slug).strip("-")


class PoolService:
    """CRUD and business-logic operations for risk pools."""

    def __init__(self, db_path: Optional[Path] = None) -> None:
        self.db_path = db_path or DB_PATH
        self._audit = AuditService(db_path=self.db_path)
        self._engine = ActuarialEngine()

    # ------------------------------------------------------------------
    # Create
    # ------------------------------------------------------------------

    def create_pool(
        self,
        name: str,
        coverage_type: str,
        initial_reserve: float = 0.0,
    ) -> Pool:
        """Create a new risk pool."""
        pool = Pool(
            name=name,
            slug=_slugify(name),
            coverage_type=coverage_type,
            reserve_balance=initial_reserve,
        )

        execute_query(
            """
            INSERT INTO pools (id, name, slug, coverage_type, reserve_balance,
                               committed_liabilities, reserve_target_ratio,
                               solvency_score, status, sui_object_id,
                               created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                pool.id,
                pool.name,
                pool.slug,
                pool.coverage_type,
                pool.reserve_balance,
                pool.committed_liabilities,
                pool.reserve_target_ratio,
                pool.solvency_score,
                pool.status.value,
                pool.sui_object_id,
                pool.created_at.isoformat(),
                pool.updated_at.isoformat(),
            ),
            db_path=self.db_path,
        )

        self._audit.log(
            actor_type="system",
            actor_id="pool_service",
            event_type="pool.created",
            entity_type="pool",
            entity_id=pool.id,
            payload={"name": name, "coverage_type": coverage_type, "initial_reserve": initial_reserve},
        )

        logger.info("Pool created: %s (%s)", pool.name, pool.id)

        # Record pool creation on XRPL testnet as proof
        try:
            from actuaryos.adapters.xrpl_adapter import XrplSettlementAdapter
            xrpl = XrplSettlementAdapter()
            if xrpl.is_available():
                result = xrpl.send_payment(
                    destination=xrpl.default_destination or "",
                    amount="0.001",
                    currency="XRP",
                    memo=f"pool-created:{pool.id}:{name}:{coverage_type}:reserve={initial_reserve}"
                )
                if result.get("status") == "success" and result.get("tx_hash"):
                    pool.sui_object_id = result["tx_hash"]  # Store tx hash as proof
                    with sqlite3.connect(str(self.db_path)) as conn:
                        conn.execute("UPDATE pools SET sui_object_id = ? WHERE id = ?", (pool.sui_object_id, pool.id))
                        conn.commit()
                    logger.info("Pool registered on XRPL testnet: %s", result.get("tx_hash"))
                    self._audit.log(
                        actor_type="system", actor_id="pool_service",
                        event_type="pool.onchain_registered", entity_type="pool", entity_id=pool.id,
                        payload={"tx_hash": result.get("tx_hash"), "explorer_url": result.get("explorer_url")}
                    )
        except Exception as e:
            logger.warning(f"XRPL pool registration skipped: {e}")

        return pool

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    def get_pool(self, pool_id: str) -> Pool:
        """Fetch a single pool by ID.  Raises ValueError if not found."""
        row = fetch_one("SELECT * FROM pools WHERE id = ?", (pool_id,), db_path=self.db_path)
        if row is None:
            raise ValueError(f"Pool not found: {pool_id}")
        return self._row_to_pool(row)

    def list_pools(self) -> list[Pool]:
        """Return all pools ordered by creation date."""
        rows = fetch_all(
            "SELECT * FROM pools ORDER BY created_at DESC",
            db_path=self.db_path,
        )
        return [self._row_to_pool(r) for r in rows]

    # ------------------------------------------------------------------
    # Update reserves / liabilities
    # ------------------------------------------------------------------

    def update_reserve(self, pool_id: str, amount_delta: float) -> Pool:
        """Add (positive) or remove (negative) reserves from a pool."""
        pool = self.get_pool(pool_id)
        new_balance = max(pool.reserve_balance + amount_delta, 0.0)
        now = datetime.utcnow().isoformat()

        execute_query(
            "UPDATE pools SET reserve_balance = ?, updated_at = ? WHERE id = ?",
            (new_balance, now, pool_id),
            db_path=self.db_path,
        )

        self._audit.log(
            actor_type="system",
            actor_id="pool_service",
            event_type="pool.reserve_updated",
            entity_type="pool",
            entity_id=pool_id,
            payload={"delta": amount_delta, "old_balance": pool.reserve_balance, "new_balance": new_balance},
        )

        return self.get_pool(pool_id)

    def update_liabilities(self, pool_id: str, amount_delta: float) -> Pool:
        """Adjust committed liabilities for a pool."""
        pool = self.get_pool(pool_id)
        new_liabilities = max(pool.committed_liabilities + amount_delta, 0.0)
        now = datetime.utcnow().isoformat()

        execute_query(
            "UPDATE pools SET committed_liabilities = ?, updated_at = ? WHERE id = ?",
            (new_liabilities, now, pool_id),
            db_path=self.db_path,
        )

        self._audit.log(
            actor_type="system",
            actor_id="pool_service",
            event_type="pool.liabilities_updated",
            entity_type="pool",
            entity_id=pool_id,
            payload={
                "delta": amount_delta,
                "old_liabilities": pool.committed_liabilities,
                "new_liabilities": new_liabilities,
            },
        )

        return self.get_pool(pool_id)

    # ------------------------------------------------------------------
    # Health
    # ------------------------------------------------------------------

    def get_pool_health(self, pool_id: str) -> dict[str, Any]:
        """Compute and return health metrics for a pool."""
        pool = self.get_pool(pool_id)
        return self._engine.compute_pool_health(pool)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _row_to_pool(row: dict[str, Any]) -> Pool:
        return Pool(
            id=row["id"],
            name=row["name"],
            slug=row["slug"],
            coverage_type=row["coverage_type"],
            reserve_balance=row["reserve_balance"],
            committed_liabilities=row["committed_liabilities"],
            reserve_target_ratio=row["reserve_target_ratio"],
            solvency_score=row["solvency_score"],
            status=PoolStatus(row["status"]),
            sui_object_id=row.get("sui_object_id"),
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
        )
