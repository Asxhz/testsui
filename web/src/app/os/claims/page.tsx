'use client';

import { useEffect, useState } from 'react';
import {
  fetchClaims,
  approveClaim,
  denyClaim,
  Claim,
} from '@/lib/os-api';

const OS_API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface TriggerEvent {
  id: string;
  event_type: string;
  external_source: string;
  outcome: string;
  created_at: string;
  raw_payload: Record<string, unknown>;
}

function statusClasses(status: string) {
  const s = status.toLowerCase();
  if (s === 'approved')
    return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  if (s === 'pending')
    return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  if (s === 'denied')
    return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
  if (s === 'paid')
    return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
  return 'bg-zinc-800 text-zinc-400 border-zinc-700';
}

function truncateId(id: string) {
  if (id.length <= 12) return id;
  return id.slice(0, 6) + '...' + id.slice(-4);
}

export default function ClaimsPage() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Trigger form state
  const [showTriggerForm, setShowTriggerForm] = useState(false);
  const [triggerEventType, setTriggerEventType] = useState('');
  const [triggerDescription, setTriggerDescription] = useState('');
  const [triggerSubmitting, setTriggerSubmitting] = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [triggerSuccess, setTriggerSuccess] = useState<string | null>(null);

  // Claim form state
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [claimPolicyId, setClaimPolicyId] = useState('');
  const [claimTriggerEventId, setClaimTriggerEventId] = useState('');
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState<string | null>(null);

  // Triggers list for dropdown
  const [triggers, setTriggers] = useState<TriggerEvent[]>([]);

  const loadTriggers = async () => {
    try {
      const res = await fetch(`${OS_API}/api/os/triggers`, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        setTriggers(data.triggers || []);
      }
    } catch {
      // silently fail - triggers list is optional
    }
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchClaims();
      setClaims(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load claims');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadTriggers();
  }, []);

  const handleCreateTrigger = async () => {
    if (!triggerEventType.trim()) {
      setTriggerError('Event type is required');
      return;
    }
    setTriggerSubmitting(true);
    setTriggerError(null);
    setTriggerSuccess(null);
    try {
      const res = await fetch(`${OS_API}/api/os/triggers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: triggerEventType.trim(),
          external_source: 'operator',
          payload: { description: triggerDescription.trim() },
          outcome: 'triggered',
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`API ${res.status}: ${body || res.statusText}`);
      }
      const data = await res.json();
      setTriggerSuccess(`Trigger created: ${data.trigger?.id || 'OK'}`);
      setTriggerEventType('');
      setTriggerDescription('');
      await loadTriggers();
    } catch (e: unknown) {
      setTriggerError(e instanceof Error ? e.message : 'Failed to create trigger');
    } finally {
      setTriggerSubmitting(false);
    }
  };

  const handleFileClaim = async () => {
    if (!claimPolicyId.trim()) {
      setClaimError('Policy ID is required');
      return;
    }
    setClaimSubmitting(true);
    setClaimError(null);
    setClaimSuccess(null);
    try {
      const res = await fetch(`${OS_API}/api/os/claims`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          policy_id: claimPolicyId.trim(),
          trigger_event_id: claimTriggerEventId.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`API ${res.status}: ${body || res.statusText}`);
      }
      setClaimSuccess('Claim filed successfully');
      setClaimPolicyId('');
      setClaimTriggerEventId('');
      await load();
    } catch (e: unknown) {
      setClaimError(e instanceof Error ? e.message : 'Failed to file claim');
    } finally {
      setClaimSubmitting(false);
    }
  };

  const handleApprove = async (claim: Claim) => {
    setActionLoading(claim.id);
    try {
      await approveClaim(claim.id, claim.payout_amount);
      await load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to approve claim');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeny = async (claim: Claim) => {
    setActionLoading(claim.id);
    try {
      await denyClaim(claim.id);
      await load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to deny claim');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="px-8 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-mono uppercase tracking-widest rounded mb-3 border border-emerald-500/20">
          Claims Manager
        </div>
        <h1 className="text-2xl font-semibold text-zinc-100">Claims</h1>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={() => { setShowTriggerForm(!showTriggerForm); setShowClaimForm(false); }}
          className={`px-4 py-2 text-xs font-mono rounded-md border transition-colors ${
            showTriggerForm
              ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
              : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-600 hover:text-zinc-300'
          }`}
        >
          Create Trigger Event
        </button>
        <button
          onClick={() => { setShowClaimForm(!showClaimForm); setShowTriggerForm(false); }}
          className={`px-4 py-2 text-xs font-mono rounded-md border transition-colors ${
            showClaimForm
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
              : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-600 hover:text-zinc-300'
          }`}
        >
          File Claim
        </button>
      </div>

      {/* Create Trigger Event Form */}
      {showTriggerForm && (
        <div className="mb-6 border border-zinc-800 rounded-lg bg-zinc-900/50 p-5">
          <h2 className="text-sm font-mono font-semibold text-zinc-200 mb-4">New Trigger Event</h2>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 block mb-1">
                Event Type
              </label>
              <input
                type="text"
                value={triggerEventType}
                onChange={(e) => setTriggerEventType(e.target.value)}
                placeholder="e.g. market_crash, regulation_change"
                className="w-full px-3 py-2 text-sm font-mono bg-zinc-950 border border-zinc-800 rounded-md text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
              />
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 block mb-1">
                Description
              </label>
              <textarea
                value={triggerDescription}
                onChange={(e) => setTriggerDescription(e.target.value)}
                placeholder="Describe the trigger event..."
                rows={3}
                className="w-full px-3 py-2 text-sm font-mono bg-zinc-950 border border-zinc-800 rounded-md text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 resize-none"
              />
            </div>
            {triggerError && (
              <div className="text-xs font-mono text-rose-400">{triggerError}</div>
            )}
            {triggerSuccess && (
              <div className="text-xs font-mono text-emerald-400">{triggerSuccess}</div>
            )}
            <button
              onClick={handleCreateTrigger}
              disabled={triggerSubmitting}
              className="px-4 py-2 text-xs font-mono font-semibold bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 rounded-md transition-colors"
            >
              {triggerSubmitting ? 'Creating...' : 'Create Trigger'}
            </button>
          </div>
        </div>
      )}

      {/* File Claim Form */}
      {showClaimForm && (
        <div className="mb-6 border border-zinc-800 rounded-lg bg-zinc-900/50 p-5">
          <h2 className="text-sm font-mono font-semibold text-zinc-200 mb-4">File a Claim</h2>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 block mb-1">
                Policy ID
              </label>
              <input
                type="text"
                value={claimPolicyId}
                onChange={(e) => setClaimPolicyId(e.target.value)}
                placeholder="Enter policy ID"
                className="w-full px-3 py-2 text-sm font-mono bg-zinc-950 border border-zinc-800 rounded-md text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
              />
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 block mb-1">
                Trigger Event
              </label>
              {triggers.length > 0 ? (
                <select
                  value={claimTriggerEventId}
                  onChange={(e) => setClaimTriggerEventId(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono bg-zinc-950 border border-zinc-800 rounded-md text-zinc-200 focus:outline-none focus:border-zinc-600"
                >
                  <option value="">-- Select trigger (optional) --</option>
                  {triggers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.event_type} - {truncateId(t.id)} ({t.outcome})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={claimTriggerEventId}
                  onChange={(e) => setClaimTriggerEventId(e.target.value)}
                  placeholder="Enter trigger event ID (optional)"
                  className="w-full px-3 py-2 text-sm font-mono bg-zinc-950 border border-zinc-800 rounded-md text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
                />
              )}
            </div>
            {claimError && (
              <div className="text-xs font-mono text-rose-400">{claimError}</div>
            )}
            {claimSuccess && (
              <div className="text-xs font-mono text-emerald-400">{claimSuccess}</div>
            )}
            <button
              onClick={handleFileClaim}
              disabled={claimSubmitting}
              className="px-4 py-2 text-xs font-mono font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 rounded-md transition-colors"
            >
              {claimSubmitting ? 'Filing...' : 'File Claim'}
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-32">
          <div className="text-center">
            <div className="animate-spin h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-xs font-mono text-zinc-600">
              Loading claims...
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="border border-rose-500/20 bg-rose-500/10 rounded-lg p-4 text-sm text-rose-400 font-mono">
          {error}
          <button
            onClick={load}
            className="ml-4 underline hover:text-rose-300 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Claims list */}
      {!loading && !error && (
        <div className="space-y-3">
          {claims.length === 0 && (
            <div className="text-center py-20 text-zinc-600 font-mono text-sm">
              No claims found.
            </div>
          )}

          {claims.map((claim) => {
            const isPending = claim.status.toLowerCase() === 'pending';
            const isActionLoading = actionLoading === claim.id;

            return (
              <div
                key={claim.id}
                className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-5 hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Left info */}
                  <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 block mb-1">
                        Claim ID
                      </span>
                      <span className="text-sm font-mono text-zinc-200">
                        {truncateId(claim.id)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 block mb-1">
                        Policy ID
                      </span>
                      <span className="text-sm font-mono text-zinc-400">
                        {truncateId(claim.policy_id)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 block mb-1">
                        Payout Amount
                      </span>
                      <span className="text-sm font-mono font-semibold text-zinc-100">
                        $
                        {claim.payout_amount.toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 block mb-1">
                        Status
                      </span>
                      <span
                        className={`inline-block px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded border ${statusClasses(claim.status)}`}
                      >
                        {claim.status}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  {isPending && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleApprove(claim)}
                        disabled={isActionLoading}
                        className="px-3 py-1.5 text-xs font-mono bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 font-semibold rounded-md transition-colors"
                      >
                        {isActionLoading ? '...' : 'Approve'}
                      </button>
                      <button
                        onClick={() => handleDeny(claim)}
                        disabled={isActionLoading}
                        className="px-3 py-1.5 text-xs font-mono bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-md transition-colors disabled:opacity-50"
                      >
                        Deny
                      </button>
                    </div>
                  )}
                </div>

                {/* XRPL payout link */}
                {claim.xrpl_payout_tx_hash && (
                  <div className="mt-3 pt-3 border-t border-zinc-800">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 mr-2">
                      XRPL Payout TX:
                    </span>
                    <a
                      href={`https://xrpscan.com/tx/${claim.xrpl_payout_tx_hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-mono text-emerald-400 hover:text-emerald-300 transition-colors"
                    >
                      {truncateId(claim.xrpl_payout_tx_hash)}
                    </a>
                  </div>
                )}

                {/* Timestamp */}
                <div className="mt-2 text-[10px] font-mono text-zinc-600">
                  {new Date(claim.created_at).toLocaleString()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
