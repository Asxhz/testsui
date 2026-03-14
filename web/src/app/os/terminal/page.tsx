'use client';

import { useEffect, useState, useCallback } from 'react';

const API = 'http://localhost:8000';

interface Pool {
  id: string;
  name: string;
  total_reserves?: number;
  locked_liabilities?: number;
  reserve_ratio?: number;
  sui_object_id?: string;
}

interface Quote {
  price: number;
  slippage: number;
  cost_estimate: number;
  pair?: string;
}

interface Impact {
  reserve_ratio_before: number;
  reserve_ratio_after: number;
  solvency_before: number;
  solvency_after: number;
  risk_delta: number;
}

interface HistoryEntry {
  id: string;
  time: string;
  action: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  tx_ref: string;
}

function Spinner() {
  return (
    <div className="animate-spin h-4 w-4 border-2 border-emerald-500 border-t-transparent rounded-full" />
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    failed: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded border ${colors[status] || colors.pending}`}>
      {status}
    </span>
  );
}

function StatCard({ label, value, prefix = '$', color = 'emerald' }: { label: string; value: number | string; prefix?: string; color?: string }) {
  const textColor = color === 'amber' ? 'text-amber-400' : color === 'rose' ? 'text-rose-400' : 'text-emerald-400';
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
      <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 mb-2">{label}</div>
      <div className={`text-2xl font-mono font-semibold ${textColor}`}>
        {prefix}{typeof value === 'number' ? value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value}
      </div>
    </div>
  );
}

export default function ReserveTerminal() {
  const [pools, setPools] = useState<Pool[]>([]);
  const [selectedPool, setSelectedPool] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'deploy' | 'unwind'>('deploy');
  const [pair, setPair] = useState('BTC-USD');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [executeLoading, setExecuteLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState('');
  const [executeResult, setExecuteResult] = useState<string | null>(null);

  // Derived reserve stats
  const totalReserves = pools.reduce((sum, p) => sum + (p.total_reserves || 0), 0);
  const lockedLiabilities = pools.reduce((sum, p) => sum + (p.locked_liabilities || 0), 0);
  const idleCapital = totalReserves - lockedLiabilities;
  const deployable = idleCapital * 0.8;

  const fetchPools = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/api/os/pools`);
      if (!res.ok) throw new Error('Failed to fetch pools');
      const data = await res.json();
      const poolList = Array.isArray(data) ? data : data.pools || [];
      setPools(poolList);
      if (poolList.length > 0 && !selectedPool) {
        setSelectedPool(poolList[0].id);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [selectedPool]);

  const fetchHistory = useCallback(async (poolId: string) => {
    if (!poolId) return;
    try {
      setHistoryLoading(true);
      const res = await fetch(`${API}/api/os/terminal/history/${poolId}`);
      if (!res.ok) throw new Error('Failed to fetch history');
      const data = await res.json();
      setHistory(Array.isArray(data) ? data : data.history || []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPools();
  }, [fetchPools]);

  useEffect(() => {
    if (selectedPool) {
      fetchHistory(selectedPool);
    }
  }, [selectedPool, fetchHistory]);

  const handleGetQuote = async () => {
    if (!selectedPool || !pair || !amount) return;
    try {
      setQuoteLoading(true);
      setQuote(null);
      setImpact(null);
      setError('');

      const [quoteRes, impactRes] = await Promise.all([
        fetch(`${API}/api/os/terminal/quote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pool_id: selectedPool,
            pair,
            amount: parseFloat(amount),
            action: activeTab,
          }),
        }),
        fetch(`${API}/api/os/terminal/compute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pool_id: selectedPool,
            amount: parseFloat(amount),
            action: activeTab,
          }),
        }),
      ]);

      if (quoteRes.ok) {
        const qData = await quoteRes.json();
        setQuote(qData);
      }
      if (impactRes.ok) {
        const iData = await impactRes.json();
        setImpact(iData);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setQuoteLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!selectedPool || !pair || !amount) return;
    try {
      setExecuteLoading(true);
      setExecuteResult(null);
      setError('');

      const res = await fetch(`${API}/api/os/terminal/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pool_id: selectedPool,
          pair,
          amount: parseFloat(amount),
          action: activeTab,
        }),
      });

      if (!res.ok) throw new Error('Execution failed');
      const data = await res.json();
      setExecuteResult(data.tx_ref || data.id || 'Executed successfully');
      // Refresh data
      fetchPools();
      fetchHistory(selectedPool);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setExecuteLoading(false);
    }
  };

  const selectedPoolData = pools.find((p) => p.id === selectedPool);

  return (
    <main className="min-h-screen bg-zinc-950 bg-dot-pattern">
      {/* Top header bar */}
      <div className="bg-zinc-900/80 border-b border-zinc-800 sticky top-0 z-20 backdrop-blur-sm">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-12">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm font-mono text-zinc-300 tracking-wide">RESERVE TERMINAL</span>
            <span className="text-[10px] font-mono text-zinc-600 ml-2">ActuaryOS v1</span>
          </div>
          <div className="text-[10px] font-mono text-zinc-600">
            {new Date().toLocaleString('en-US', { hour12: false })}
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* SECTION A: Reserve Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Reserves" value={totalReserves} color="emerald" />
          <StatCard label="Locked Liabilities" value={lockedLiabilities} color="amber" />
          <StatCard label="Idle Capital" value={idleCapital} color={idleCapital > 0 ? 'emerald' : 'rose'} />
          <StatCard label="Deployable (80%)" value={deployable} color="emerald" />
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg px-4 py-3 text-rose-400 text-xs font-mono">
            {error}
          </div>
        )}

        {/* SECTIONS B & C: Action Panel + History */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* SECTION B: Action Panel (left 60%) */}
          <div className="lg:col-span-3 space-y-4">
            {/* Tabs */}
            <div className="flex gap-0 border border-zinc-800 rounded-lg overflow-hidden w-fit">
              {(['deploy', 'unwind'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setActiveTab(tab); setQuote(null); setImpact(null); }}
                  className={`px-6 py-2 text-xs font-mono uppercase tracking-wider transition-colors ${
                    activeTab === tab
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-zinc-900/50 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Input Card */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-5 space-y-4">
              {/* Pool Selector */}
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 block mb-1.5">Pool</label>
                <select
                  value={selectedPool}
                  onChange={(e) => setSelectedPool(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm font-mono text-zinc-200 focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50"
                >
                  {pools.map((p) => (
                    <option key={p.id} value={p.id}>{p.name || p.id}</option>
                  ))}
                </select>
              </div>

              {/* Pair Input */}
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 block mb-1.5">Pair</label>
                <input
                  type="text"
                  value={pair}
                  onChange={(e) => setPair(e.target.value.toUpperCase())}
                  placeholder="BTC-USD"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm font-mono text-zinc-200 focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50"
                />
              </div>

              {/* Amount Input */}
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 block mb-1.5">Amount</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 text-sm font-mono">$</span>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-zinc-900 border border-zinc-700 rounded pl-7 pr-3 py-2 text-sm font-mono text-zinc-200 focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50"
                    />
                  </div>
                  <button
                    onClick={() => setAmount(deployable.toFixed(2))}
                    className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-[10px] font-mono uppercase tracking-wider text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/30 transition-colors"
                  >
                    Max
                  </button>
                </div>
              </div>

              {/* Get Quote Button */}
              <button
                onClick={handleGetQuote}
                disabled={quoteLoading || !amount || !pair}
                className="w-full py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs font-mono uppercase tracking-wider text-zinc-300 hover:text-emerald-400 hover:border-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {quoteLoading ? <Spinner /> : null}
                Get Quote
              </button>
            </div>

            {/* Quote Display */}
            {quote && (
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-5 space-y-3">
                <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 mb-3">Quote Details</div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 mb-1">Price</div>
                    <div className="text-lg font-mono text-zinc-100">${quote.price?.toLocaleString(undefined, { minimumFractionDigits: 2 }) ?? '---'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 mb-1">Slippage</div>
                    <div className={`text-lg font-mono ${(quote.slippage || 0) > 1 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {quote.slippage?.toFixed(3) ?? '0.000'}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 mb-1">Cost Estimate</div>
                    <div className="text-lg font-mono text-zinc-100">${quote.cost_estimate?.toLocaleString(undefined, { minimumFractionDigits: 2 }) ?? '---'}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Impact Metrics */}
            {impact && (
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-5">
                <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 mb-4">Pre/Post Impact Analysis</div>
                <div className="space-y-3">
                  {/* Reserve Ratio */}
                  <div className="flex items-center justify-between py-2 border-b border-zinc-800/50">
                    <span className="text-xs font-mono text-zinc-400">Reserve Ratio</span>
                    <div className="flex items-center gap-3 font-mono text-sm">
                      <span className="text-zinc-400">{(impact.reserve_ratio_before * 100).toFixed(1)}%</span>
                      <span className="text-zinc-600">&rarr;</span>
                      <span className={impact.reserve_ratio_after >= impact.reserve_ratio_before ? 'text-emerald-400' : 'text-rose-400'}>
                        {(impact.reserve_ratio_after * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  {/* Solvency Score */}
                  <div className="flex items-center justify-between py-2 border-b border-zinc-800/50">
                    <span className="text-xs font-mono text-zinc-400">Solvency Score</span>
                    <div className="flex items-center gap-3 font-mono text-sm">
                      <span className="text-zinc-400">{impact.solvency_before?.toFixed(2)}</span>
                      <span className="text-zinc-600">&rarr;</span>
                      <span className={impact.solvency_after >= impact.solvency_before ? 'text-emerald-400' : 'text-rose-400'}>
                        {impact.solvency_after?.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  {/* Risk Delta */}
                  <div className="flex items-center justify-between py-2">
                    <span className="text-xs font-mono text-zinc-400">Risk Delta</span>
                    <span className={`font-mono text-sm ${
                      impact.risk_delta > 0 ? 'text-rose-400' : impact.risk_delta < 0 ? 'text-emerald-400' : 'text-zinc-400'
                    }`}>
                      {impact.risk_delta > 0 ? '+' : ''}{impact.risk_delta?.toFixed(4)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Execute Button */}
            {quote && (
              <button
                onClick={handleExecute}
                disabled={executeLoading}
                className="w-full py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-sm font-mono uppercase tracking-wider text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 glow-emerald"
              >
                {executeLoading ? <Spinner /> : null}
                Execute {activeTab}
              </button>
            )}

            {executeResult && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-3 text-emerald-400 text-xs font-mono">
                Transaction submitted: {executeResult}
              </div>
            )}
          </div>

          {/* SECTION C: Execution History (right 40%) */}
          <div className="lg:col-span-2">
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-600">Execution History</div>
                <button
                  onClick={() => selectedPool && fetchHistory(selectedPool)}
                  className="text-[10px] font-mono text-zinc-600 hover:text-emerald-400 transition-colors"
                >
                  Refresh
                </button>
              </div>

              {historyLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Spinner />
                </div>
              ) : history.length === 0 ? (
                <div className="text-center py-12 text-xs font-mono text-zinc-600">
                  No execution history
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="text-left py-2 text-[10px] uppercase tracking-wider text-zinc-600 font-normal">Time</th>
                        <th className="text-left py-2 text-[10px] uppercase tracking-wider text-zinc-600 font-normal">Action</th>
                        <th className="text-right py-2 text-[10px] uppercase tracking-wider text-zinc-600 font-normal">Amount</th>
                        <th className="text-center py-2 text-[10px] uppercase tracking-wider text-zinc-600 font-normal">Status</th>
                        <th className="text-right py-2 text-[10px] uppercase tracking-wider text-zinc-600 font-normal">Tx Ref</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((entry) => (
                        <tr key={entry.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                          <td className="py-2.5 text-zinc-400 whitespace-nowrap">
                            {new Date(entry.time).toLocaleString('en-US', { hour12: false, month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="py-2.5 text-zinc-300 uppercase">{entry.action}</td>
                          <td className="py-2.5 text-right text-zinc-200">${entry.amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td className="py-2.5 text-center"><StatusBadge status={entry.status} /></td>
                          <td className="py-2.5 text-right text-zinc-500">{entry.tx_ref?.slice(0, 10)}...</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SECTION D: Reserve Risk Dashboard */}
        {pools.length > 0 && (
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 mb-4">Pool Reserve Health</div>
            <div className="space-y-3">
              {pools.map((pool) => {
                const ratio = pool.reserve_ratio ?? (pool.total_reserves && pool.locked_liabilities ? pool.total_reserves / pool.locked_liabilities : 0);
                const pct = Math.min(ratio * 100, 100);
                const barColor = ratio >= 1.5 ? 'bg-emerald-500' : ratio >= 1 ? 'bg-amber-500' : 'bg-rose-500';
                const textColor = ratio >= 1.5 ? 'text-emerald-400' : ratio >= 1 ? 'text-amber-400' : 'text-rose-400';
                return (
                  <div key={pool.id} className="flex items-center gap-4">
                    <div className="w-40 text-xs font-mono text-zinc-400 truncate">{pool.name || pool.id}</div>
                    <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div className={`h-full ${barColor} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className={`w-16 text-right text-xs font-mono ${textColor}`}>
                      {(ratio * 100).toFixed(1)}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-zinc-900 pt-6 text-center">
          <p className="text-[10px] font-mono text-zinc-700">ActuaryOS Reserve Terminal &bull; Powered by ActuaryAI Risk Engine</p>
        </div>
      </div>
    </main>
  );
}
