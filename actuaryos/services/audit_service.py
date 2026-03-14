"""Audit logging service for ActuaryOS."""

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

from actuaryos.database import DB_PATH, execute_query, fetch_all
from actuaryos.models import AuditLog

logger = get_logger("actuaryos.services.audit")


class AuditService:
    """Immutable audit-trail service backed by SQLite."""

    def __init__(self, db_path: Optional[Path] = None) -> None:
        self.db_path = db_path or DB_PATH

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------

    def log(
        self,
        actor_type: str,
        actor_id: str,
        event_type: str,
        entity_type: str,
        entity_id: str,
        payload: dict[str, Any] | None = None,
    ) -> AuditLog:
        """Create an audit-log entry and persist it."""
        entry = AuditLog(
            actor_type=actor_type,
            actor_id=actor_id,
            event_type=event_type,
            entity_type=entity_type,
            entity_id=entity_id,
            payload=payload or {},
        )

        execute_query(
            """
            INSERT INTO audit_logs (id, actor_type, actor_id, event_type,
                                    entity_type, entity_id, payload, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                entry.id,
                entry.actor_type,
                entry.actor_id,
                entry.event_type,
                entry.entity_type,
                entry.entity_id,
                json.dumps(entry.payload),
                entry.created_at.isoformat(),
            ),
            db_path=self.db_path,
        )

        logger.info(
            "Audit: %s %s %s/%s by %s/%s",
            entry.event_type,
            entry.entity_type,
            entry.entity_id,
            entry.id,
            entry.actor_type,
            entry.actor_id,
        )
        return entry

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    def list_logs(
        self,
        entity_type: Optional[str] = None,
        entity_id: Optional[str] = None,
        limit: int = 100,
    ) -> list[AuditLog]:
        """Retrieve audit-log entries with optional filters."""
        clauses: list[str] = []
        params: list[Any] = []

        if entity_type is not None:
            clauses.append("entity_type = ?")
            params.append(entity_type)
        if entity_id is not None:
            clauses.append("entity_id = ?")
            params.append(entity_id)

        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        sql = f"SELECT * FROM audit_logs {where} ORDER BY created_at DESC LIMIT ?"
        params.append(limit)

        rows = fetch_all(sql, tuple(params), db_path=self.db_path)
        return [self._row_to_audit_log(r) for r in rows]

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _row_to_audit_log(row: dict[str, Any]) -> AuditLog:
        payload = row.get("payload", "{}")
        if isinstance(payload, str):
            payload = json.loads(payload)
        return AuditLog(
            id=row["id"],
            actor_type=row["actor_type"],
            actor_id=row["actor_id"],
            event_type=row["event_type"],
            entity_type=row["entity_type"],
            entity_id=row["entity_id"],
            payload=payload,
            created_at=datetime.fromisoformat(row["created_at"]),
        )
