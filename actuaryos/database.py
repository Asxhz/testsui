"""SQLite database setup and helpers for ActuaryOS."""

from __future__ import annotations

import json
import sqlite3
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


logger = get_logger("actuaryos.database")

DB_PATH = Path("actuaryos.db")

# ---------------------------------------------------------------------------
# Schema DDL
# ---------------------------------------------------------------------------

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS pools (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    slug            TEXT NOT NULL DEFAULT '',
    coverage_type   TEXT NOT NULL,
    reserve_balance REAL NOT NULL DEFAULT 0.0,
    committed_liabilities REAL NOT NULL DEFAULT 0.0,
    reserve_target_ratio  REAL NOT NULL DEFAULT 1.5,
    solvency_score  REAL NOT NULL DEFAULT 1.0,
    status          TEXT NOT NULL DEFAULT 'active',
    sui_object_id   TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deposits (
    id                TEXT PRIMARY KEY,
    pool_id           TEXT NOT NULL REFERENCES pools(id),
    depositor_address TEXT NOT NULL,
    amount            REAL NOT NULL,
    shares_minted     REAL NOT NULL DEFAULT 0.0,
    status            TEXT NOT NULL DEFAULT 'pending',
    sui_tx_digest     TEXT,
    created_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS policies (
    id                    TEXT PRIMARY KEY,
    user_id               TEXT NOT NULL,
    pool_id               TEXT NOT NULL REFERENCES pools(id),
    source_bundle_id      TEXT,
    policy_type           TEXT NOT NULL,
    trigger_definition    TEXT NOT NULL DEFAULT '{}',
    coverage_amount       REAL NOT NULL,
    premium               REAL NOT NULL,
    status                TEXT NOT NULL DEFAULT 'pending',
    xrpl_premium_tx_hash  TEXT,
    created_at            TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS claims (
    id                  TEXT PRIMARY KEY,
    policy_id           TEXT NOT NULL REFERENCES policies(id),
    trigger_event_id    TEXT,
    payout_amount       REAL NOT NULL DEFAULT 0.0,
    status              TEXT NOT NULL DEFAULT 'pending',
    xrpl_payout_tx_hash TEXT,
    created_at          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trigger_events (
    id                  TEXT PRIMARY KEY,
    event_type          TEXT NOT NULL,
    external_source     TEXT NOT NULL,
    raw_payload         TEXT NOT NULL DEFAULT '{}',
    normalized_payload  TEXT NOT NULL DEFAULT '{}',
    outcome             TEXT NOT NULL DEFAULT 'pending',
    created_at          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reserve_actions (
    id              TEXT PRIMARY KEY,
    pool_id         TEXT NOT NULL REFERENCES pools(id),
    action_type     TEXT NOT NULL,
    provider        TEXT NOT NULL DEFAULT '',
    quoted_amount   REAL NOT NULL DEFAULT 0.0,
    executed_amount REAL NOT NULL DEFAULT 0.0,
    cost_estimate   REAL NOT NULL DEFAULT 0.0,
    tx_reference    TEXT,
    status          TEXT NOT NULL DEFAULT 'pending',
    created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pool_snapshots (
    id                    TEXT PRIMARY KEY,
    pool_id               TEXT NOT NULL REFERENCES pools(id),
    reserve_balance       REAL NOT NULL DEFAULT 0.0,
    committed_liabilities REAL NOT NULL DEFAULT 0.0,
    reserve_ratio         REAL NOT NULL DEFAULT 0.0,
    solvency_buffer       REAL NOT NULL DEFAULT 0.0,
    sui_reference         TEXT,
    created_at            TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id          TEXT PRIMARY KEY,
    actor_type  TEXT NOT NULL,
    actor_id    TEXT NOT NULL DEFAULT '',
    event_type  TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id   TEXT NOT NULL DEFAULT '',
    payload     TEXT NOT NULL DEFAULT '{}',
    created_at  TEXT NOT NULL
);
"""


# ---------------------------------------------------------------------------
# Connection helpers
# ---------------------------------------------------------------------------

def get_connection(db_path: Optional[Path] = None) -> sqlite3.Connection:
    """Return a new SQLite connection with row-factory enabled."""
    path = db_path or DB_PATH
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db(db_path: Optional[Path] = None) -> None:
    """Create all tables if they do not already exist."""
    conn = get_connection(db_path)
    try:
        conn.executescript(_SCHEMA_SQL)
        conn.commit()
        logger.info("Database initialised at %s", db_path or DB_PATH)
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Query helpers
# ---------------------------------------------------------------------------

def execute_query(
    sql: str,
    params: tuple[Any, ...] = (),
    db_path: Optional[Path] = None,
) -> sqlite3.Cursor:
    """Execute a write query (INSERT / UPDATE / DELETE) and return the cursor."""
    conn = get_connection(db_path)
    try:
        cursor = conn.execute(sql, params)
        conn.commit()
        return cursor
    finally:
        conn.close()


def fetch_all(
    sql: str,
    params: tuple[Any, ...] = (),
    db_path: Optional[Path] = None,
) -> list[dict[str, Any]]:
    """Execute a SELECT and return all rows as dicts."""
    conn = get_connection(db_path)
    try:
        cursor = conn.execute(sql, params)
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def fetch_one(
    sql: str,
    params: tuple[Any, ...] = (),
    db_path: Optional[Path] = None,
) -> Optional[dict[str, Any]]:
    """Execute a SELECT and return the first row as a dict, or None."""
    conn = get_connection(db_path)
    try:
        cursor = conn.execute(sql, params)
        row = cursor.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()
