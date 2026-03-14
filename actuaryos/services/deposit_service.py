"""Deposit service for ActuaryOS capital pool deposits."""

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
from actuaryos.models import Deposit, DepositStatus
from actuaryos.services.audit_service import AuditService
from actuaryos.services.pool_service import PoolService

logger = get_logger("actuaryos.services.deposit")


class DepositService:
    """Manages capital deposits into risk pools."""

    def __init__(self, db_path: Optional[Path] = None) -> None:
        self.db_path = db_path or DB_PATH
        self._audit = AuditService(db_path=self.db_path)
        self._pool_service = PoolService(db_path=self.db_path)

    # ------------------------------------------------------------------
    # Create
    # ------------------------------------------------------------------

    def create_deposit(
        self,
        pool_id: str,
        depositor_address: str,
        amount: float,
    ) -> Deposit:
        """Create a new deposit, compute shares, and update pool reserves.

        Shares minted are proportional to the depositor's contribution
        relative to the pool's existing reserve balance.  If the pool is
        empty the depositor receives shares equal to the deposit amount
        (1:1 bootstrapping).
        """
        pool = self._pool_service.get_pool(pool_id)

        # Compute shares to mint
        total_existing_shares = self._total_shares_for_pool(pool_id)
        if pool.reserve_balance == 0 or total_existing_shares == 0:
            shares_minted = amount  # 1:1 bootstrap
        else:
            shares_minted = (amount / pool.reserve_balance) * total_existing_shares

        deposit = Deposit(
            pool_id=pool_id,
            depositor_address=depositor_address,
            amount=amount,
            shares_minted=shares_minted,
            status=DepositStatus.confirmed,
        )

        execute_query(
            """
            INSERT INTO deposits (id, pool_id, depositor_address, amount,
                                  shares_minted, status, sui_tx_digest, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                deposit.id,
                deposit.pool_id,
                deposit.depositor_address,
                deposit.amount,
                deposit.shares_minted,
                deposit.status.value,
                deposit.sui_tx_digest,
                deposit.created_at.isoformat(),
            ),
            db_path=self.db_path,
        )

        # Update pool reserve balance
        self._pool_service.update_reserve(pool_id, amount)

        self._audit.log(
            actor_type="user",
            actor_id=depositor_address,
            event_type="deposit.created",
            entity_type="deposit",
            entity_id=deposit.id,
            payload={
                "pool_id": pool_id,
                "amount": amount,
                "shares_minted": shares_minted,
            },
        )

        logger.info(
            "Deposit %s: %.2f into pool %s, %.4f shares minted",
            deposit.id,
            amount,
            pool_id,
            shares_minted,
        )

        # After the deposit is saved to DB, attempt XRPL settlement
        try:
            from actuaryos.adapters.xrpl_adapter import XrplSettlementAdapter
            xrpl = XrplSettlementAdapter()
            if xrpl.is_available():
                result = xrpl.send_payment(
                    destination=depositor_address,
                    amount=str(amount),
                    currency="XRP",
                    memo=f"deposit:{deposit.id}:pool:{pool_id}"
                )
                if result.get("status") == "success":
                    deposit.sui_tx_digest = result.get("tx_hash", "")
                    # Update the deposit record with tx hash
                    with sqlite3.connect(str(self.db_path)) as conn:
                        conn.execute("UPDATE deposits SET sui_tx_digest = ? WHERE id = ?", (deposit.sui_tx_digest, deposit.id))
                        conn.commit()
        except Exception as e:
            logger.warning(f"XRPL deposit settlement skipped: {e}")

        return deposit

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    def list_deposits(self, pool_id: str) -> list[Deposit]:
        """List all deposits for a given pool."""
        rows = fetch_all(
            "SELECT * FROM deposits WHERE pool_id = ? ORDER BY created_at DESC",
            (pool_id,),
            db_path=self.db_path,
        )
        return [self._row_to_deposit(r) for r in rows]

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _total_shares_for_pool(self, pool_id: str) -> float:
        """Sum all shares minted for a pool."""
        row = fetch_one(
            "SELECT COALESCE(SUM(shares_minted), 0) AS total FROM deposits WHERE pool_id = ?",
            (pool_id,),
            db_path=self.db_path,
        )
        return float(row["total"]) if row else 0.0

    @staticmethod
    def _row_to_deposit(row: dict[str, Any]) -> Deposit:
        return Deposit(
            id=row["id"],
            pool_id=row["pool_id"],
            depositor_address=row["depositor_address"],
            amount=row["amount"],
            shares_minted=row["shares_minted"],
            status=DepositStatus(row["status"]),
            sui_tx_digest=row.get("sui_tx_digest"),
            created_at=datetime.fromisoformat(row["created_at"]),
        )
