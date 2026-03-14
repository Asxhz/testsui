"""Pydantic models for ActuaryOS domain entities."""

from __future__ import annotations

import json
from datetime import datetime
from enum import Enum
from typing import Any, Literal, Optional
from uuid import uuid4

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class PoolStatus(str, Enum):
    active = "active"
    paused = "paused"
    closed = "closed"


class DepositStatus(str, Enum):
    pending = "pending"
    confirmed = "confirmed"
    failed = "failed"


class PolicyStatus(str, Enum):
    pending = "pending"
    active = "active"
    expired = "expired"
    claimed = "claimed"
    cancelled = "cancelled"


class ClaimStatus(str, Enum):
    pending = "pending"
    approved = "approved"
    denied = "denied"
    paid = "paid"


class TriggerOutcome(str, Enum):
    triggered = "triggered"
    not_triggered = "not_triggered"
    pending = "pending"


class ReserveActionType(str, Enum):
    deposit = "deposit"
    withdrawal = "withdrawal"
    rebalance = "rebalance"
    yield_accrual = "yield_accrual"


class ReserveActionStatus(str, Enum):
    pending = "pending"
    executed = "executed"
    failed = "failed"


# ---------------------------------------------------------------------------
# Domain Models
# ---------------------------------------------------------------------------

class Pool(BaseModel):
    """A risk-pooling capital pool."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    slug: str = ""
    coverage_type: str = Field(description="Type of risk covered (e.g. flight_delay, weather)")
    reserve_balance: float = Field(default=0.0, ge=0)
    committed_liabilities: float = Field(default=0.0, ge=0)
    reserve_target_ratio: float = Field(default=1.5, description="Target reserves / liabilities")
    solvency_score: float = Field(default=1.0, ge=0, le=1.0)
    status: PoolStatus = PoolStatus.active
    sui_object_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class Deposit(BaseModel):
    """A capital deposit into a pool."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    pool_id: str
    depositor_address: str
    amount: float = Field(gt=0)
    shares_minted: float = Field(default=0.0, ge=0)
    status: DepositStatus = DepositStatus.pending
    sui_tx_digest: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Policy(BaseModel):
    """An insurance-style policy backed by a pool."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: str
    pool_id: str
    source_bundle_id: Optional[str] = None
    policy_type: str = Field(description="Type of policy (e.g. parametric, indemnity)")
    trigger_definition: dict[str, Any] = Field(default_factory=dict)
    coverage_amount: float = Field(gt=0)
    premium: float = Field(gt=0)
    status: PolicyStatus = PolicyStatus.pending
    xrpl_premium_tx_hash: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Claim(BaseModel):
    """A claim filed against a policy."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    policy_id: str
    trigger_event_id: Optional[str] = None
    payout_amount: float = Field(default=0.0, ge=0)
    status: ClaimStatus = ClaimStatus.pending
    xrpl_payout_tx_hash: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TriggerEvent(BaseModel):
    """An external event that may trigger policy payouts."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    event_type: str
    external_source: str = Field(description="Source system (e.g. polymarket, chainlink)")
    raw_payload: dict[str, Any] = Field(default_factory=dict)
    normalized_payload: dict[str, Any] = Field(default_factory=dict)
    outcome: TriggerOutcome = TriggerOutcome.pending
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ReserveAction(BaseModel):
    """A reserve management action (deposit, withdrawal, rebalance)."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    pool_id: str
    action_type: ReserveActionType
    provider: str = ""
    quoted_amount: float = Field(default=0.0)
    executed_amount: float = Field(default=0.0)
    cost_estimate: float = Field(default=0.0)
    tx_reference: Optional[str] = None
    status: ReserveActionStatus = ReserveActionStatus.pending
    created_at: datetime = Field(default_factory=datetime.utcnow)


class PoolSnapshot(BaseModel):
    """Point-in-time snapshot of a pool's financial state."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    pool_id: str
    reserve_balance: float = Field(default=0.0, ge=0)
    committed_liabilities: float = Field(default=0.0, ge=0)
    reserve_ratio: float = Field(default=0.0, ge=0)
    solvency_buffer: float = Field(default=0.0)
    sui_reference: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AuditLog(BaseModel):
    """Immutable audit trail entry."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    actor_type: str = Field(description="system | user | service")
    actor_id: str = ""
    event_type: str = Field(description="e.g. pool.created, deposit.confirmed")
    entity_type: str = Field(description="e.g. pool, deposit, policy")
    entity_id: str = ""
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ActuarialAssessment(BaseModel):
    """Result of an actuarial assessment for a given scenario."""

    probability_of_trigger: float = Field(ge=0, le=1)
    expected_payout: float = Field(ge=0)
    expected_loss: float = Field(ge=0)
    risk_load: float = Field(ge=0)
    expense_load: float = Field(ge=0)
    buffer_load: float = Field(ge=0)
    premium: float = Field(ge=0)
    reserve_requirement: float = Field(ge=0)
    solvency_impact: float = Field(ge=0)
    concentration_risk: float = Field(ge=0, le=1)
    confidence_level: float = Field(ge=0, le=1)
    classification: Literal["hedge_only", "protection_candidate", "hybrid"]
    viable: bool
