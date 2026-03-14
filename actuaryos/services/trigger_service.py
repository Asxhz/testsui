"""Trigger event service for ActuaryOS."""

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from uuid import uuid4
from typing import Optional
import logging

from actuaryos.models import TriggerEvent
from actuaryos.database import DB_PATH

logger = logging.getLogger(__name__)


class TriggerService:
    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = db_path

    def create_trigger(
        self,
        event_type: str,
        external_source: str,
        raw_payload: dict,
        outcome: str = "pending"
    ) -> TriggerEvent:
        trigger = TriggerEvent(
            id=str(uuid4()),
            event_type=event_type,
            external_source=external_source,
            raw_payload=raw_payload,
            normalized_payload=raw_payload,
            outcome=outcome,
            created_at=datetime.utcnow()
        )

        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                """INSERT INTO trigger_events (id, event_type, external_source, raw_payload, normalized_payload, outcome, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (trigger.id, trigger.event_type, trigger.external_source,
                 json.dumps(trigger.raw_payload), json.dumps(trigger.normalized_payload),
                 trigger.outcome, trigger.created_at.isoformat())
            )
            conn.commit()

        logger.info(f"Trigger event created: {trigger.id}")
        return trigger

    def resolve_trigger(self, trigger_id: str, outcome: str) -> Optional[TriggerEvent]:
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                "UPDATE trigger_events SET outcome = ? WHERE id = ?",
                (outcome, trigger_id)
            )
            conn.commit()
            row = conn.execute(
                "SELECT id, event_type, external_source, raw_payload, normalized_payload, outcome, created_at FROM trigger_events WHERE id = ?",
                (trigger_id,)
            ).fetchone()

        if not row:
            return None

        return TriggerEvent(
            id=row[0], event_type=row[1], external_source=row[2],
            raw_payload=json.loads(row[3]) if row[3] else {},
            normalized_payload=json.loads(row[4]) if row[4] else {},
            outcome=row[5], created_at=datetime.fromisoformat(row[6])
        )

    def get_trigger(self, trigger_id: str) -> Optional[TriggerEvent]:
        with sqlite3.connect(str(self.db_path)) as conn:
            row = conn.execute(
                "SELECT id, event_type, external_source, raw_payload, normalized_payload, outcome, created_at FROM trigger_events WHERE id = ?",
                (trigger_id,)
            ).fetchone()

        if not row:
            return None

        return TriggerEvent(
            id=row[0], event_type=row[1], external_source=row[2],
            raw_payload=json.loads(row[3]) if row[3] else {},
            normalized_payload=json.loads(row[4]) if row[4] else {},
            outcome=row[5], created_at=datetime.fromisoformat(row[6])
        )

    def list_triggers(self, limit: int = 50) -> list[TriggerEvent]:
        with sqlite3.connect(str(self.db_path)) as conn:
            rows = conn.execute(
                "SELECT id, event_type, external_source, raw_payload, normalized_payload, outcome, created_at FROM trigger_events ORDER BY created_at DESC LIMIT ?",
                (limit,)
            ).fetchall()

        return [
            TriggerEvent(
                id=r[0], event_type=r[1], external_source=r[2],
                raw_payload=json.loads(r[3]) if r[3] else {},
                normalized_payload=json.loads(r[4]) if r[4] else {},
                outcome=r[5], created_at=datetime.fromisoformat(r[6])
            ) for r in rows
        ]
