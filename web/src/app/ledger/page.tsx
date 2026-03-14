'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const API = 'http://localhost:8000';

interface LedgerEntry {
  id: string;
  chain: string;
  type: string;
  tx_hash?: string;
  explorer_url?: string;
  amount?: any;
  status: string;
  timestamp: string;
  details?: any;
}

function formatDate(d: any): string {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return String(d).slice(0, 19);
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function LedgerPage() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [xrplBalance, setXrplBalance] = useState<any>(null);
  const [solanaBalance, setSolanaBalance] = useState<any>(null);
  const [integrations, setIntegrations] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  // Quick action state
  const [actionTab, setActionTab] = useState<'xrpl' | 'pool' | null>(null);
  const [sendDest, setSendDest] = useState('');
  const [sendAmount, setSendAmount] = useState('1');
  const [sendMemo, setSendMemo] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<any>(null);
  const [poolName, setPoolName] = useState('');
  const [poolType, setPoolType] = useState('crypto');
  const [poolReserve, setPoolReserve] = useState('10000');
  const [creatingPool, setCreatingPool] = useState(false);
  const [poolResult, setPoolResult] = useState<any>(null);

  const fetchData = () => {
    Promise.all([
      fetch(`${API}/api/os/audit?limit=200`).then(r => r.json()).catch(() => []),
      fetch(`${API}/api/os/xrpl/balance`).then(r => r.json()).catch(() => null),
      fetch(`${API}/api/os/solana/balance`).then(r => r.json()).catch(() => null),
      fetch(`${API}/api/os/status`).then(r => r.json()).catch(() => null),
    ]).then(([auditLogs, xBal, sBal, status]) => {
      const ledger: LedgerEntry[] = (Array.isArray(auditLogs) ? auditLogs : []).map((log: any, i: number) => {
        const payload = typeof log.payload === 'string' ? (() => { try { return JSON.parse(log.payload); } catch { return {}; } })() : (log.payload || {});
        const isOnchain = log.event_type?.includes('onchain') || payload.tx_hash || payload.explorer_url;
        return {
          id: log.id || String(i),
          chain: isOnchain ? 'XRPL' : 'Local',
          type: log.event_type || 'unknown',
          tx_hash: payload.tx_hash || undefined,
          explorer_url: payload.explorer_url || (payload.tx_hash ? `https://testnet.xrpl.org/transactions/${payload.tx_hash}` : undefined),
          amount: payload.amount || payload.initial_reserve || undefined,
          status: isOnchain ? 'confirmed' : 'recorded',
          timestamp: log.timestamp || log.created_at || '',
          details: payload,
        };
      });
      setEntries(ledger);
      setXrplBalance(xBal);
      setSolanaBalance(sBal);
      setIntegrations(status);
      setLoading(false);
    });
  };

  useEffect(() => { fetchData(); }, []);

  const handleSendXrpl = async () => {
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch(`${API}/api/os/xrpl/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination: sendDest, amount: parseFloat(sendAmount), currency: 'XRP', memo: sendMemo || 'ledger-payment' }),
      });
      const data = await res.json();
      setSendResult(data);
      if (data.tx_hash) {
        setTimeout(fetchData, 2000);
      }
    } catch (e: any) {
      setSendResult({ status: 'error', reason: e.message });
    } finally {
      setSending(false);
    }
  };

  const handleCreatePool = async () => {
    setCreatingPool(true);
    setPoolResult(null);
    try {
      const res = await fetch(`${API}/api/os/pools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: poolName, coverage_type: poolType, initial_reserve: parseFloat(poolReserve) }),
      });
      const data = await res.json();
      setPoolResult(data);
      setTimeout(fetchData, 2000);
    } catch (e: any) {
      setPoolResult({ status: 'error', reason: e.message });
    } finally {
      setCreatingPool(false);
    }
  };

  const onchainCount = entries.filter(e => e.chain === 'XRPL').length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-xs font-mono text-zinc-600">Loading ledger...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 bg-dot-pattern">
      {/* Top bar */}
      <div className="bg-zinc-900/80 border-b border-zinc-800 sticky top-0 z-10 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-14">
          <Link href="/" className="flex items-center gap-2 text-zinc-500 hover:text-zinc-300 text-sm font-mono transition-colors">
            ← ActuaryAI
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono text-zinc-600">{entries.length} events | {onchainCount} on-chain</span>
            <button onClick={fetchData} className="text-[10px] font-mono text-emerald-500 hover:text-emerald-400 px-2 py-1 border border-emerald-500/20 rounded transition-colors">
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-mono uppercase tracking-widest rounded mb-3 border border-emerald-500/20">
            Settlement Ledger
          </div>
          <h1 className="text-2xl font-semibold text-zinc-100">On-Chain Activity</h1>
        </div>

        {/* Integration Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={`h-2 w-2 rounded-full ${integrations?.xrpl === 'available' ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
              <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">XRPL</span>
            </div>
            <p className="text-xl font-mono font-bold text-zinc-100">{xrplBalance?.balance_xrp?.toFixed(2) || '—'}</p>
            <p className="text-[9px] font-mono text-zinc-600 mt-1">XRP on testnet</p>
          </div>
          <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={`h-2 w-2 rounded-full ${integrations?.solana === 'available' ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
              <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">Solana</span>
            </div>
            <p className="text-xl font-mono font-bold text-zinc-100">{solanaBalance?.balance_sol?.toFixed(4) || '—'}</p>
            <p className="text-[9px] font-mono text-zinc-600 mt-1">SOL on devnet</p>
          </div>
          <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={`h-2 w-2 rounded-full ${integrations?.sui === 'available' ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
              <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">Sui</span>
            </div>
            <p className="text-sm font-mono text-zinc-300 mt-1">{integrations?.sui === 'available' ? 'Connected' : 'Offline'}</p>
            <p className="text-[9px] font-mono text-zinc-600 mt-1">Testnet RPC</p>
          </div>
          <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">Polymarket</span>
            </div>
            <p className="text-sm font-mono text-zinc-300 mt-1">52,000+</p>
            <p className="text-[9px] font-mono text-zinc-600 mt-1">Live markets</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-sm font-semibold text-zinc-200">Quick Actions</h2>
            <div className="flex gap-2 ml-4">
              <button onClick={() => setActionTab(actionTab === 'xrpl' ? null : 'xrpl')} className={`text-[10px] font-mono px-3 py-1.5 rounded border transition-colors ${actionTab === 'xrpl' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'text-zinc-500 border-zinc-800 hover:border-zinc-600'}`}>
                Send XRPL Payment
              </button>
              <button onClick={() => setActionTab(actionTab === 'pool' ? null : 'pool')} className={`text-[10px] font-mono px-3 py-1.5 rounded border transition-colors ${actionTab === 'pool' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'text-zinc-500 border-zinc-800 hover:border-zinc-600'}`}>
                Create Pool
              </button>
            </div>
          </div>

          {actionTab === 'xrpl' && (
            <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-5 mb-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
                <div>
                  <label className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider block mb-1">Destination</label>
                  <input value={sendDest} onChange={e => setSendDest(e.target.value)} placeholder="rAddress..." className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-xs font-mono text-zinc-200 placeholder-zinc-700" />
                </div>
                <div>
                  <label className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider block mb-1">Amount (XRP)</label>
                  <input value={sendAmount} onChange={e => setSendAmount(e.target.value)} type="number" className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-xs font-mono text-zinc-200" />
                </div>
                <div>
                  <label className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider block mb-1">Memo</label>
                  <input value={sendMemo} onChange={e => setSendMemo(e.target.value)} placeholder="Optional" className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-xs font-mono text-zinc-200 placeholder-zinc-700" />
                </div>
                <div className="flex items-end">
                  <button onClick={handleSendXrpl} disabled={sending || !sendDest} className="w-full px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 text-xs font-mono font-semibold rounded transition-colors">
                    {sending ? 'Sending...' : 'Send Payment'}
                  </button>
                </div>
              </div>
              {sendResult && (
                <div className={`p-3 rounded border text-xs font-mono ${sendResult.tx_hash ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400' : 'border-rose-500/20 bg-rose-500/5 text-rose-400'}`}>
                  {sendResult.tx_hash ? (
                    <>Sent! <a href={sendResult.explorer_url} target="_blank" rel="noopener noreferrer" className="underline hover:text-emerald-300">{sendResult.tx_hash.slice(0, 16)}...</a></>
                  ) : (sendResult.reason || 'Failed')}
                </div>
              )}
            </div>
          )}

          {actionTab === 'pool' && (
            <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-5 mb-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
                <div>
                  <label className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider block mb-1">Pool Name</label>
                  <input value={poolName} onChange={e => setPoolName(e.target.value)} placeholder="My Pool" className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-xs font-mono text-zinc-200 placeholder-zinc-700" />
                </div>
                <div>
                  <label className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider block mb-1">Type</label>
                  <select value={poolType} onChange={e => setPoolType(e.target.value)} className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-xs font-mono text-zinc-200">
                    <option value="crypto">Crypto</option>
                    <option value="market">Market</option>
                    <option value="weather">Weather</option>
                    <option value="health">Health</option>
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider block mb-1">Reserve ($)</label>
                  <input value={poolReserve} onChange={e => setPoolReserve(e.target.value)} type="number" className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-xs font-mono text-zinc-200" />
                </div>
                <div className="flex items-end">
                  <button onClick={handleCreatePool} disabled={creatingPool || !poolName} className="w-full px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 text-xs font-mono font-semibold rounded transition-colors">
                    {creatingPool ? 'Creating...' : 'Create + Register'}
                  </button>
                </div>
              </div>
              {poolResult && (
                <div className={`p-3 rounded border text-xs font-mono ${poolResult.id ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400' : 'border-rose-500/20 bg-rose-500/5 text-rose-400'}`}>
                  {poolResult.id ? (
                    <>Pool created! {poolResult.sui_object_id && <a href={`https://testnet.xrpl.org/transactions/${poolResult.sui_object_id}`} target="_blank" rel="noopener noreferrer" className="underline hover:text-emerald-300">XRPL proof →</a>}</>
                  ) : (poolResult.detail || poolResult.reason || 'Failed')}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Event Log */}
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <div className="bg-zinc-900/50 px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
            <span className="text-xs font-mono text-zinc-400">{entries.length} events</span>
            <div className="flex gap-3">
              <span className="text-[9px] font-mono text-emerald-400">{onchainCount} on-chain</span>
              <span className="text-[9px] font-mono text-zinc-500">{entries.length - onchainCount} local</span>
            </div>
          </div>
          {entries.length === 0 ? (
            <div className="p-16 text-center">
              <p className="text-sm font-mono text-zinc-500 mb-2">No activity yet</p>
              <p className="text-xs font-mono text-zinc-600">Use the Advisor to generate strategies, then lock them on-chain.</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/50">
              {entries.map((entry) => (
                <div key={entry.id} className="hover:bg-zinc-800/20 transition-colors">
                  <button
                    onClick={() => setExpandedEntry(expandedEntry === entry.id ? null : entry.id)}
                    className="w-full flex items-center px-5 py-3 text-left gap-4"
                  >
                    <span className="text-[10px] font-mono text-zinc-600 w-36 shrink-0">{formatDate(entry.timestamp)}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider shrink-0 ${
                      entry.chain === 'XRPL' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                    }`}>{entry.chain}</span>
                    <span className="text-xs font-mono text-zinc-300 flex-1 truncate">{entry.type.replace(/[._]/g, ' ')}</span>
                    {entry.amount && <span className="text-xs font-mono text-zinc-400 shrink-0">${Number(entry.amount).toLocaleString()}</span>}
                    {entry.tx_hash ? (
                      <a href={entry.explorer_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-[10px] font-mono text-emerald-400 hover:text-emerald-300 hover:underline shrink-0">
                        {entry.tx_hash.slice(0, 8)}...{entry.tx_hash.slice(-4)}
                      </a>
                    ) : <span className="text-[10px] font-mono text-zinc-700 shrink-0">—</span>}
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono uppercase shrink-0 ${
                      entry.status === 'confirmed' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-500'
                    }`}>{entry.status}</span>
                  </button>

                  {expandedEntry === entry.id && entry.details && (
                    <div className="px-5 pb-3">
                      <div className="bg-zinc-900 rounded border border-zinc-800 p-3 overflow-auto max-h-32">
                        <pre className="text-[10px] font-mono text-zinc-500 whitespace-pre-wrap">{JSON.stringify(entry.details, null, 2)}</pre>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
