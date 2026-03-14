'use client';

import { useEffect, useState } from 'react';

const API = 'http://localhost:8000';

export default function SolanaPage() {
  const [status, setStatus] = useState<any>(null);
  const [balance, setBalance] = useState<any>(null);
  const [recording, setRecording] = useState(false);
  const [recordResult, setRecordResult] = useState<any>(null);
  const [eventType, setEventType] = useState('pool_created');
  const [eventData, setEventData] = useState('{"pool_id": "test", "amount": 1000}');
  const [txLookup, setTxLookup] = useState('');
  const [txResult, setTxResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/os/solana/status`).then(r => r.json()).catch(() => ({ status: 'unavailable' })),
      fetch(`${API}/api/os/solana/balance`).then(r => r.json()).catch(() => null),
    ]).then(([s, b]) => {
      setStatus(s);
      setBalance(b);
      setLoading(false);
    });
  }, []);

  const handleRecord = async () => {
    setRecording(true);
    setRecordResult(null);
    try {
      let parsedData = {};
      try { parsedData = JSON.parse(eventData); } catch {}
      const res = await fetch(`${API}/api/os/solana/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: eventType, data: parsedData }),
      });
      const data = await res.json();
      setRecordResult(data);
      // Refresh balance
      fetch(`${API}/api/os/solana/balance`).then(r => r.json()).then(setBalance).catch(() => {});
    } catch (e: any) {
      setRecordResult({ status: 'error', reason: e.message });
    } finally {
      setRecording(false);
    }
  };

  const handleLookup = async () => {
    if (!txLookup.trim()) return;
    try {
      const res = await fetch(`${API}/api/os/solana/tx/${txLookup}`);
      const data = await res.json();
      setTxResult(data);
    } catch (e: any) {
      setTxResult({ status: 'error', reason: e.message });
    }
  };

  const isConnected = status?.status === 'available';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-xs font-mono text-zinc-600">Connecting to Solana...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 py-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <span className="px-2.5 py-1 text-xs font-mono font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded">SOL</span>
          <h1 className="text-xl font-semibold text-zinc-100">Solana Devnet</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-rose-400'}`} />
          <span className="text-xs font-mono text-zinc-500">{isConnected ? 'Connected to Devnet' : 'Not Connected'}</span>
        </div>
      </div>

      {/* Status + Balance */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 block mb-2">Connection Status</span>
          <div className="flex items-center gap-2 mb-3">
            <div className={`h-3 w-3 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
            <span className="text-sm font-mono text-zinc-200">{isConnected ? 'Solana Devnet Active' : 'Disconnected'}</span>
          </div>
          <p className="text-[10px] font-mono text-zinc-600">RPC: {status?.rpc_url || 'N/A'}</p>
        </div>

        <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 block mb-2">Wallet Balance</span>
          {balance?.status === 'success' ? (
            <>
              <p className="text-2xl font-mono font-semibold text-zinc-100 mb-1">{balance.balance_sol?.toFixed(4)} SOL</p>
              <p className="text-[10px] font-mono text-zinc-600 truncate">Address: {balance.address}</p>
              <a href={`https://explorer.solana.com/address/${balance.address}?cluster=devnet`} target="_blank" rel="noopener noreferrer" className="text-[10px] font-mono text-purple-400 hover:text-purple-300">View on Explorer →</a>
            </>
          ) : (
            <p className="text-sm font-mono text-zinc-500">{balance?.reason || 'No wallet configured'}</p>
          )}
        </div>
      </div>

      {/* Record Event */}
      <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-5 mb-8">
        <h2 className="text-sm font-semibold text-zinc-200 mb-4">Record Event on Solana</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider block mb-1">Event Type</label>
            <select value={eventType} onChange={e => setEventType(e.target.value)} className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm font-mono text-zinc-200">
              <option value="pool_created">Pool Created</option>
              <option value="policy_issued">Policy Issued</option>
              <option value="claim_approved">Claim Approved</option>
              <option value="reserve_deposit">Reserve Deposit</option>
              <option value="payout_sent">Payout Sent</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider block mb-1">Event Data (JSON)</label>
            <input value={eventData} onChange={e => setEventData(e.target.value)} className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm font-mono text-zinc-200" />
          </div>
        </div>
        <button onClick={handleRecord} disabled={recording || !isConnected} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-sm font-mono rounded transition-colors">
          {recording ? 'Recording...' : 'Record on Solana Devnet'}
        </button>

        {recordResult && (
          <div className={`mt-4 p-3 rounded border ${recordResult.status === 'success' ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-rose-500/20 bg-rose-500/5'}`}>
            {recordResult.status === 'success' ? (
              <>
                <p className="text-xs font-mono text-emerald-400 mb-1">Transaction recorded on Solana devnet</p>
                <p className="text-[10px] font-mono text-zinc-400 break-all">Signature: {recordResult.signature}</p>
                <a href={recordResult.explorer_url} target="_blank" rel="noopener noreferrer" className="text-[10px] font-mono text-purple-400 hover:text-purple-300 mt-1 inline-block">View on Solana Explorer →</a>
              </>
            ) : (
              <p className="text-xs font-mono text-rose-400">{recordResult.reason || 'Recording failed'}</p>
            )}
          </div>
        )}
      </div>

      {/* Transaction Lookup */}
      <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-5">
        <h2 className="text-sm font-semibold text-zinc-200 mb-4">Transaction Lookup</h2>
        <div className="flex gap-3">
          <input value={txLookup} onChange={e => setTxLookup(e.target.value)} placeholder="Enter transaction signature..." className="flex-1 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm font-mono text-zinc-200 placeholder-zinc-600" />
          <button onClick={handleLookup} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-mono rounded transition-colors">Lookup</button>
        </div>
        {txResult && (
          <div className="mt-4 p-3 bg-zinc-950 rounded border border-zinc-800 overflow-auto max-h-48">
            <pre className="text-[10px] font-mono text-zinc-400 whitespace-pre-wrap">{JSON.stringify(txResult, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
