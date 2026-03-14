"""Claim management service for ActuaryOS."""

from __future__ import annotations

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
from actuaryos.models import Claim, ClaimStatus
from actuaryos.services.audit_service import AuditService

logger = get_logger("actuaryos.services.claim")


class ClaimService:
    """Manages insurance claims against policies."""

    def __init__(self, db_path: Optional[Path] = None) -> None:
        self.db_path = db_path or DB_PATH
        self._audit = AuditService(db_path=self.db_path)

    # ------------------------------------------------------------------
    # Create
    # ------------------------------------------------------------------

    def create_claim(
        self,
        policy_id: str,
        trigger_event_id: Optional[str] = None,
    ) -> Claim:
        """File a new claim against a policy."""
        claim = Claim(
            policy_id=policy_id,
            trigger_event_id=trigger_event_id,
            status=ClaimStatus.pending,
        )

        execute_query(
            """
            INSERT INTO claims (id, policy_id, trigger_event_id, payout_amount,
                                status, xrpl_payout_tx_hash, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                claim.id,
                claim.policy_id,
                claim.trigger_event_id,
                claim.payout_amount,
                claim.status.value,
                claim.xrpl_payout_tx_hash,
                claim.created_at.isoformat(),
            ),
            db_path=self.db_path,
        )

        self._audit.log(
            actor_type="system",
            actor_id="claim_service",
            event_type="claim.created",
            entity_type="claim",
            entity_id=claim.id,
            payload={"policy_id": policy_id, "trigger_event_id": trigger_event_id},
        )

        logger.info("Claim created: %s for policy %s", claim.id, policy_id)
        return claim

    # ------------------------------------------------------------------
    # Approve / Deny
    # ------------------------------------------------------------------

    def approve_claim(self, claim_id: str, payout_amount: float) -> Claim:
        """Approve a pending claim and set the payout amount."""
        claim = self._get_claim(claim_id)
        if claim.status != ClaimStatus.pending:
            raise ValueError(
                f"Cannot approve claim {claim_id}: current status is {claim.status.value}"
            )

        execute_query(
            "UPDATE claims SET status = ?, payout_amount = ? WHERE id = ?",
            (ClaimStatus.approved.value, payout_amount, claim_id),
            db_path=self.db_path,
        )

        self._audit.log(
            actor_type="system",
            actor_id="claim_service",
            event_type="claim.approved",
            entity_type="claim",
            entity_id=claim_id,
            payload={"payout_amount": payout_amount},
        )

        logger.info("Claim approved: %s, payout=%.2f", claim_id, payout_amount)

        # Attempt XRPL payout
        try:
            from actuaryos.adapters.xrpl_adapter import XrplSettlementAdapter
            xrpl = XrplSettlementAdapter()
            if xrpl.is_available():
                result = xrpl.send_payment(
                    destination="",  # Would be policy holder address
                    amount=str(payout_amount),
                    currency="XRP",
                    memo=f"payout:claim:{claim_id}"
                )
                if result.get("status") == "success":
                    # Update claim with tx hash
                    with sqlite3.connect(str(self.db_path)) as conn:
                        conn.execute("UPDATE claims SET xrpl_payout_tx_hash = ? WHERE id = ?", (result.get("tx_hash", ""), claim_id))
                        conn.commit()
        except Exception as e:
            logger.warning(f"XRPL payout skipped: {e}")

        return self._get_claim(claim_id)

    def deny_claim(self, claim_id: str) -> Claim:
        """Deny a pending claim."""
        claim = self._get_claim(claim_id)
        if claim.status != ClaimStatus.pending:
            raise ValueError(
                f"Cannot deny claim {claim_id}: current status is {claim.status.value}"
            )

        execute_query(
            "UPDATE claims SET status = ? WHERE id = ?",
            (ClaimStatus.denied.value, claim_id),
            db_path=self.db_path,
        )

        self._audit.log(
            actor_type="system",
            actor_id="claim_service",
            event_type="claim.denied",
            entity_type="claim",
            entity_id=claim_id,
            payload={},
        )

        logger.info("Claim denied: %s", claim_id)
        return self._get_claim(claim_id)

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    def list_claims(self, policy_id: Optional[str] = None) -> list[Claim]:
        """List claims with an optional policy filter."""
        if policy_id is not None:
            rows = fetch_all(
                "SELECT * FROM claims WHERE policy_id = ? ORDER BY created_at DESC",
                (policy_id,),
                db_path=self.db_path,
            )
        else:
            rows = fetch_all(
                "SELECT * FROM claims ORDER BY created_at DESC",
                db_path=self.db_path,
            )
        return [self._row_to_claim(r) for r in rows]

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _get_claim(self, claim_id: str) -> Claim:
        """Fetch a single claim by ID.  Raises ValueError if not found."""
        row = fetch_one(
            "SELECT * FROM claims WHERE id = ?",
            (claim_id,),
            db_path=self.db_path,
        )
        if row is None:
            raise ValueError(f"Claim not found: {claim_id}")
        return self._row_to_claim(row)

    @staticmethod
    def _row_to_claim(row: dict[str, Any]) -> Claim:
        return Claim(
            id=row["id"],
            policy_id=row["policy_id"],
            trigger_event_id=row.get("trigger_event_id"),
            payout_amount=row["payout_amount"],
            status=ClaimStatus(row["status"]),
            xrpl_payout_tx_hash=row.get("xrpl_payout_tx_hash"),
            created_at=datetime.fromisoformat(row["created_at"]),
        )
