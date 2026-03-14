const OS_API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ── Types ──────────────────────────────────────────────────────────

export interface Pool {
  id: string;
  name: string;
  coverage_type: string;
  reserve_balance: number;
  committed_liabilities: number;
  reserve_ratio: number;
  solvency_score: number;
  status: string;
  sui_object_id?: string;
  created_at: string;
}

export interface Policy {
  id: string;
  pool_id: string;
  type: string;
  coverage_amount: number;
  premium: number;
  status: string;
  trigger_definition?: Record<string, unknown>;
  xrpl_tx_hash?: string;
  created_at: string;
}

export interface Claim {
  id: string;
  policy_id: string;
  payout_amount: number;
  status: string;
  xrpl_payout_tx_hash?: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  actor: string;
  event_type: string;
  entity: string;
  entity_type?: string;
  payload?: Record<string, unknown>;
}

export interface Assessment {
  risk_score: number;
  recommended_premium: number;
  analysis: string;
}

export interface Quote {
  premium: number;
  coverage: number;
  pool_id: string;
  details: Record<string, unknown>;
}

export interface Execution {
  policy_id: string;
  tx_hash?: string;
  status: string;
}

export interface ReserveAction {
  id: string;
  pool_id: string;
  action: string;
  amount: number;
  timestamp: string;
}

export interface SuiResult {
  object_id: string;
  digest: string;
  status: string;
}

export interface XrplResult {
  tx_hash: string;
  status: string;
}

export interface SuiObject {
  object_id: string;
  version: number;
  owner: string;
  data: Record<string, unknown>;
}

export interface XrplTx {
  hash: string;
  type: string;
  amount: string;
  destination: string;
  status: string;
  timestamp: string;
}

export interface IntegrationStatus {
  sui: { connected: boolean; network: string };
  xrpl: { connected: boolean; network: string };
  liquid: { connected: boolean };
}

// ── Helpers ────────────────────────────────────────────────────────

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${OS_API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${body || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// ── Pools ──────────────────────────────────────────────────────────

export function fetchPools(): Promise<Pool[]> {
  return request<Pool[]>('/api/os/pools');
}

export function createPool(data: {
  name: string;
  coverage_type: string;
  initial_reserve: number;
}): Promise<Pool> {
  return request<Pool>('/api/os/pools', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function fetchPoolDetail(
  poolId: string,
): Promise<Pool & { health: Record<string, unknown> }> {
  return request<Pool & { health: Record<string, unknown> }>(
    `/api/os/pools/${poolId}`,
  );
}

// ── Policies ───────────────────────────────────────────────────────

export function fetchPolicies(
  params?: Record<string, string>,
): Promise<Policy[]> {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return request<Policy[]>(`/api/os/policies${qs}`);
}

export function createPolicy(data: {
  pool_id: string;
  type: string;
  coverage_amount: number;
  premium: number;
  trigger_definition?: Record<string, unknown>;
}): Promise<Policy> {
  return request<Policy>('/api/os/policies', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ── Claims ─────────────────────────────────────────────────────────

export function fetchClaims(): Promise<Claim[]> {
  return request<Claim[]>('/api/os/claims');
}

export function approveClaim(
  claimId: string,
  payoutAmount: number,
): Promise<Claim> {
  return request<Claim>(`/api/os/claims/${claimId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ payout_amount: payoutAmount }),
  });
}

export function denyClaim(claimId: string): Promise<Claim> {
  return request<Claim>(`/api/os/claims/${claimId}/deny`, {
    method: 'POST',
  });
}

// ── Risk assessment ────────────────────────────────────────────────

export function assessScenario(data: {
  scenario: string;
  pool_id?: string;
}): Promise<Assessment> {
  return request<Assessment>('/api/os/assess', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ── Audit ──────────────────────────────────────────────────────────

export function fetchAuditLogs(
  params?: Record<string, string>,
): Promise<AuditLog[]> {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return request<AuditLog[]>(`/api/os/audit${qs}`);
}

// ── Integrations ───────────────────────────────────────────────────

export function getIntegrationStatus(): Promise<IntegrationStatus> {
  return request<IntegrationStatus>('/api/os/integrations/status');
}

// ── Terminal ───────────────────────────────────────────────────────

export function terminalQuote(data: {
  pool_id: string;
  coverage_type: string;
  coverage_amount: number;
}): Promise<Quote> {
  return request<Quote>('/api/os/terminal/quote', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function terminalExecute(data: {
  pool_id: string;
  quote_id: string;
}): Promise<Execution> {
  return request<Execution>('/api/os/terminal/execute', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function fetchTerminalHistory(poolId: string): Promise<ReserveAction[]> {
  return request<ReserveAction[]>(`/api/os/terminal/history/${poolId}`);
}

// ── Sui ────────────────────────────────────────────────────────────

export function registerPoolOnSui(poolId: string): Promise<SuiResult> {
  return request<SuiResult>(`/api/os/sui/register/${poolId}`, {
    method: 'POST',
  });
}

export function fetchSuiObject(objectId: string): Promise<SuiObject> {
  return request<SuiObject>(`/api/os/sui/object/${objectId}`);
}

// ── XRPL ───────────────────────────────────────────────────────────

export function sendXrplPayment(data: {
  destination: string;
  amount: string;
  claim_id?: string;
}): Promise<XrplResult> {
  return request<XrplResult>('/api/os/xrpl/pay', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function fetchXrplTx(txHash: string): Promise<XrplTx> {
  return request<XrplTx>(`/api/os/xrpl/tx/${txHash}`);
}
