'use client';

import { useEffect, useState } from 'react';
import { fetchPolicies, Policy } from '@/lib/os-api';

function statusClasses(status: string) {
  const s = status.toLowerCase();
  if (s === 'active')
    return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  if (s === 'pending')
    return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  if (s === 'claimed')
    return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
  if (s === 'expired')
    return 'bg-zinc-800 text-zinc-400 border-zinc-700';
  return 'bg-zinc-800 text-zinc-400 border-zinc-700';
}

function truncateId(id: string) {
  if (id.length <= 12) return id;
  return id.slice(0, 6) + '...' + id.slice(-4);
}

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPolicies();
      setPolicies(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load policies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="px-8 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-mono uppercase tracking-widest rounded mb-3 border border-emerald-500/20">
          Policy Registry
        </div>
        <h1 className="text-2xl font-semibold text-zinc-100">Policies</h1>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-32">
          <div className="text-center">
            <div className="animate-spin h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-xs font-mono text-zinc-600">
              Loading policies...
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

      {/* Table */}
      {!loading && !error && (
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-7 gap-4 px-5 py-3 bg-zinc-900/80 border-b border-zinc-800">
            {['ID', 'Type', 'Coverage', 'Premium', 'Status', 'Pool', 'Created'].map(
              (h) => (
                <span
                  key={h}
                  className="text-[10px] font-mono uppercase tracking-wider text-zinc-600"
                >
                  {h}
                </span>
              ),
            )}
          </div>

          {/* Rows */}
          {policies.length === 0 && (
            <div className="px-5 py-16 text-center text-zinc-600 font-mono text-sm">
              No policies found.
            </div>
          )}

          {policies.map((policy) => {
            const isExpanded = expandedId === policy.id;
            return (
              <div key={policy.id}>
                <div
                  onClick={() =>
                    setExpandedId(isExpanded ? null : policy.id)
                  }
                  className={`grid grid-cols-7 gap-4 px-5 py-3.5 border-b border-zinc-800/50 cursor-pointer transition-colors ${
                    isExpanded
                      ? 'bg-zinc-800/30'
                      : 'hover:bg-zinc-900/50'
                  }`}
                >
                  <span className="text-xs font-mono text-zinc-300 truncate">
                    {truncateId(policy.id)}
                  </span>
                  <span className="text-xs font-mono text-zinc-400 capitalize">
                    {policy.type}
                  </span>
                  <span className="text-xs font-mono text-zinc-200">
                    $
                    {policy.coverage_amount.toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })}
                  </span>
                  <span className="text-xs font-mono text-zinc-200">
                    $
                    {policy.premium.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </span>
                  <span>
                    <span
                      className={`inline-block px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded border ${statusClasses(policy.status)}`}
                    >
                      {policy.status}
                    </span>
                  </span>
                  <span className="text-xs font-mono text-zinc-500 truncate">
                    {truncateId(policy.pool_id)}
                  </span>
                  <span className="text-xs font-mono text-zinc-500">
                    {new Date(policy.created_at).toLocaleDateString()}
                  </span>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-5 py-4 bg-zinc-900/30 border-b border-zinc-800 space-y-3">
                    {policy.trigger_definition && (
                      <div>
                        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 block mb-1">
                          Trigger Definition
                        </span>
                        <pre className="text-xs font-mono text-zinc-400 bg-zinc-950 border border-zinc-800 rounded-lg p-3 overflow-x-auto">
                          {JSON.stringify(policy.trigger_definition, null, 2)}
                        </pre>
                      </div>
                    )}
                    {policy.xrpl_tx_hash && (
                      <div>
                        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 block mb-1">
                          XRPL Transaction
                        </span>
                        <a
                          href={`https://xrpscan.com/tx/${policy.xrpl_tx_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-mono text-emerald-400 hover:text-emerald-300 transition-colors"
                        >
                          {policy.xrpl_tx_hash}
                        </a>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 block mb-1">
                          Full Policy ID
                        </span>
                        <span className="text-xs font-mono text-zinc-400">
                          {policy.id}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 block mb-1">
                          Full Pool ID
                        </span>
                        <span className="text-xs font-mono text-zinc-400">
                          {policy.pool_id}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
