'use client';

import { useEffect, useState } from 'react';
import { fetchPools, createPool, Pool } from '@/lib/os-api';

const COVERAGE_TYPES = ['crypto', 'weather', 'health', 'market', 'custom'] as const;

function computeRatio(pool: Pool): number {
  const raw = pool.reserve_ratio;
  if (raw != null && !isNaN(raw)) return raw;
  if (pool.committed_liabilities > 0) {
    return pool.reserve_balance / pool.committed_liabilities;
  }
  return pool.reserve_balance > 0 ? 999 : 0;
}

function ratioColor(ratio: number) {
  if (ratio >= 1.5) return 'bg-emerald-500';
  if (ratio >= 1.0) return 'bg-amber-500';
  return 'bg-rose-500';
}

function ratioTextColor(ratio: number) {
  if (ratio >= 1.5) return 'text-emerald-400';
  if (ratio >= 1.0) return 'text-amber-400';
  return 'text-rose-400';
}

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === 'active')
    return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  if (s === 'warning')
    return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  if (s === 'critical')
    return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
  return 'bg-zinc-800 text-zinc-400 border-zinc-700';
}

export default function PoolsPage() {
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<string>('crypto');
  const [formReserve, setFormReserve] = useState<number>(10000);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPools();
      setPools(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load pools');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;
    setCreating(true);
    try {
      await createPool({
        name: formName,
        coverage_type: formType,
        initial_reserve: formReserve,
      });
      setShowCreate(false);
      setFormName('');
      setFormReserve(10000);
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create pool');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="px-8 py-8 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-mono uppercase tracking-widest rounded mb-3 border border-emerald-500/20">
            Pool Dashboard
          </div>
          <h1 className="text-2xl font-semibold text-zinc-100">
            Insurance Pools
          </h1>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-semibold py-2 px-5 rounded-lg transition-all text-sm font-mono hover:glow-emerald"
        >
          + Create Pool
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-32">
          <div className="text-center">
            <div className="animate-spin h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-xs font-mono text-zinc-600">Loading pools...</p>
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

      {/* Pool Grid */}
      {!loading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {pools.map((pool) => (
            <div
              key={pool.id}
              className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-5 hover:border-zinc-700 transition-colors"
            >
              {/* Top row */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100 mb-1">
                    {pool.name}
                  </h3>
                  <span className="inline-block px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider bg-zinc-800 text-zinc-400 rounded border border-zinc-700">
                    {pool.coverage_type}
                  </span>
                </div>
                <span
                  className={`inline-block px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded border ${statusBadge(pool.status)}`}
                >
                  {pool.status}
                </span>
              </div>

              {/* Reserve balance */}
              <div className="mb-4">
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 block mb-1">
                  Reserve Balance
                </span>
                <p className="text-2xl font-mono font-semibold text-zinc-100">
                  $
                  {pool.reserve_balance.toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}
                </p>
              </div>

              {/* Committed liabilities */}
              <div className="mb-4">
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 block mb-1">
                  Committed Liabilities
                </span>
                <p className="text-sm font-mono text-zinc-300">
                  $
                  {pool.committed_liabilities.toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}
                </p>
              </div>

              {/* Reserve ratio bar */}
              {(() => {
                const ratio = computeRatio(pool);
                const displayPct = Math.min(ratio * 100, 999);
                return (
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600">
                        Reserve Ratio
                      </span>
                      <span
                        className={`text-xs font-mono font-semibold ${ratioTextColor(ratio)}`}
                      >
                        {displayPct.toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${ratioColor(ratio)}`}
                        style={{
                          width: `${Math.min(ratio * 100, 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })()}

              {/* Solvency score */}
              <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600">
                  Solvency Score
                </span>
                <span className="text-sm font-mono font-semibold text-zinc-200">
                  {pool.solvency_score.toFixed(1)}
                </span>
              </div>

              {/* On-chain proof */}
              {pool.sui_object_id && (
                <div className="mt-3 pt-3 border-t border-zinc-800">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-500 block mb-1">
                    ✓ On-Chain Proof (XRPL Testnet)
                  </span>
                  <a
                    href={`https://testnet.xrpl.org/transactions/${pool.sui_object_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-emerald-400 hover:text-emerald-300 transition-colors truncate block"
                  >
                    {pool.sui_object_id.slice(0, 12)}...
                    {pool.sui_object_id.slice(-8)}
                  </a>
                </div>
              )}
            </div>
          ))}

          {pools.length === 0 && (
            <div className="col-span-full text-center py-20 text-zinc-600 font-mono text-sm">
              No pools found. Create one to get started.
            </div>
          )}
        </div>
      )}

      {/* Create Pool Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowCreate(false)}
          />
          <div className="relative w-full max-w-md mx-4 border border-zinc-800 rounded-lg bg-zinc-900 p-6">
            <h2 className="text-lg font-semibold text-zinc-100 mb-1">
              Create Pool
            </h2>
            <p className="text-xs font-mono text-zinc-500 mb-6">
              Initialize a new insurance reserve pool
            </p>

            <form onSubmit={handleCreate} className="space-y-5">
              {/* Name */}
              <div>
                <label className="block text-[10px] font-mono text-zinc-600 uppercase tracking-wider mb-1.5">
                  Pool Name
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Crypto Shield Pool"
                  className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 font-mono text-sm transition-colors"
                  required
                />
              </div>

              {/* Coverage type */}
              <div>
                <label className="block text-[10px] font-mono text-zinc-600 uppercase tracking-wider mb-1.5">
                  Coverage Type
                </label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                  className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 font-mono text-sm transition-colors"
                >
                  {COVERAGE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Initial reserve */}
              <div>
                <label className="block text-[10px] font-mono text-zinc-600 uppercase tracking-wider mb-1.5">
                  Initial Reserve ($)
                </label>
                <input
                  type="number"
                  value={formReserve}
                  onChange={(e) => setFormReserve(Number(e.target.value))}
                  min={0}
                  step={100}
                  className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 font-mono text-sm focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-colors"
                  required
                />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={creating || !formName.trim()}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed text-zinc-950 font-semibold py-2.5 rounded-lg transition-all text-sm font-mono flex items-center justify-center gap-2"
                >
                  {creating ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-zinc-950 border-t-transparent rounded-full" />
                      Creating...
                    </>
                  ) : (
                    'Create Pool'
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-5 py-2.5 text-sm font-mono text-zinc-400 hover:text-zinc-200 border border-zinc-800 rounded-lg hover:border-zinc-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
