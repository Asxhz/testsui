'use client';

import { useEffect, useState, useCallback } from 'react';

const API = 'http://localhost:8000';

interface Transaction {
  id?: string;
  type: 'premium' | 'payout';
  amount: number;
  currency: string;
  status: 'pending' | 'confirmed' | 'failed';
  tx_hash: string;
  time: string;
  destination?: string;
  memo?: string;
}

interface Balance {
  xrp?: number;
  balances?: Array<{ currency: string; value: string | number }>;
  [key: string]: any;
}

interface XrplStatus {
  xrpl?: boolean;
  xrpl_connected?: boolean;
  connected?: boolean;
  message?: string;
}

function Spinner() {
  return (
    <div className="animate-spin h-4 w-4 border-2 border-emerald-500 border-t-transparent rounded-full" />
  );
}

function ConnectionDot({ connected }: { connected: boolean }) {
  return (
    <span className={`inline-block h-2.5 w-2.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    confirmed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    failed: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded border ${colors[status] || colors.pending}`}>
      {status}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const isPremium = type === 'premium';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded border ${
      isPremium ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-sky-500/10 text-sky-400 border-sky-500/20'
    }`}>
      {type}
    </span>
  );
}

export default function XrplSettlementsPage() {
  const [status, setStatus] = useState<XrplStatus | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [activeTab, setActiveTab] = useState<'premiums' | 'payouts' | 'all'>('all');
  const [loading, setLoading] = useState(true);

  // Send payment form state
  const [destination, setDestination] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [currency, setCurrency] = useState('RLUSD');
  const [memo, setMemo] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [sendResult, setSendResult] = useState<{ tx_hash?: string; error?: string } | null>(null);
  const [error, setError] = useState('');

  const xrplConnected = status?.xrpl || status?.xrpl_connected || status?.connected || false;

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [statusRes, balanceRes] = await Promise.all([
        fetch(`${API}/api/os/status`),
        fetch(`${API}/api/os/xrpl/balance`),
      ]);

      if (statusRes.ok) {
        const sData = await statusRes.json();
        setStatus(sData);
      }
      if (balanceRes.ok) {
        const bData = await balanceRes.json();
        setBalance(bData);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch transactions - simulated since there's no specific endpoint
  // We'll try a general transactions endpoint
  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const res = await fetch(`${API}/api/os/xrpl/transactions`);
        if (res.ok) {
          const data = await res.json();
          setTransactions(Array.isArray(data) ? data : data.transactions || []);
        }
      } catch {
        // Transactions endpoint may not exist yet
      }
    };
    fetchTransactions();
  }, []);

  const filteredTransactions = activeTab === 'all'
    ? transactions
    : transactions.filter((tx) => tx.type === (activeTab === 'premiums' ? 'premium' : 'payout'));

  const handleSend = async () => {
    if (!destination || !sendAmount) return;
    try {
      setSendLoading(true);
      setSendResult(null);
      setError('');

      const res = await fetch(`${API}/api/os/xrpl/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination,
          amount: parseFloat(sendAmount),
          currency,
          memo: memo || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || 'Send failed');
      setSendResult(data);
      // Refresh balance
      fetchData();
    } catch (e: any) {
      setSendResult({ error: e.message });
    } finally {
      setSendLoading(false);
    }
  };

  const truncateHash = (hash: string) => {
    if (!hash || hash.length <= 16) return hash;
    return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="text-center">
          <div className="animate-spin h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-xs font-mono text-zinc-600">Loading XRPL settlements...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 bg-dot-pattern">
      {/* Header */}
      <div className="bg-zinc-900/80 border-b border-zinc-800 sticky top-0 z-20 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-12">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-2.5 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-indigo-400">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <path d="M8 9L12 5L16 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M8 15L12 19L16 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="text-xs font-mono text-indigo-400 font-medium">XRPL</span>
            </div>
            <span className="text-sm font-mono text-zinc-300 tracking-wide">XRPL Settlements</span>
          </div>
          <div className="flex items-center gap-2">
            <ConnectionDot connected={xrplConnected} />
            <span className="text-[10px] font-mono text-zinc-500">
              {xrplConnected ? 'Connected to Testnet' : 'Disconnected'}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Status + Balance Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Status */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 flex items-center gap-4">
            <ConnectionDot connected={xrplConnected} />
            <div>
              <div className="text-sm font-mono text-zinc-200">
                {xrplConnected ? 'XRPL Testnet Active' : 'XRPL Disconnected'}
              </div>
              <div className="text-[10px] font-mono text-zinc-600 mt-0.5">
                {xrplConnected
                  ? 'Settlement layer operational'
                  : status?.message || 'Unable to connect to XRPL testnet'}
              </div>
            </div>
          </div>

          {/* Balance Display */}
          <div className="lg:col-span-2 bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 mb-3">Available Balances</div>
            {balance ? (
              <div className="flex flex-wrap gap-6">
                {balance.xrp !== undefined && (
                  <div>
                    <div className="text-xl font-mono text-zinc-100">
                      {typeof balance.xrp === 'number' ? balance.xrp.toLocaleString(undefined, { minimumFractionDigits: 2 }) : balance.xrp}
                    </div>
                    <div className="text-[10px] font-mono text-zinc-600">XRP</div>
                  </div>
                )}
                {balance.balances?.map((b, i) => (
                  <div key={i}>
                    <div className="text-xl font-mono text-zinc-100">
                      {typeof b.value === 'number' ? b.value.toLocaleString(undefined, { minimumFractionDigits: 2 }) : b.value}
                    </div>
                    <div className="text-[10px] font-mono text-zinc-600">{b.currency}</div>
                  </div>
                ))}
                {!balance.xrp && !balance.balances?.length && (
                  <div className="text-xs font-mono text-zinc-500">
                    <pre className="text-[11px] leading-relaxed">{JSON.stringify(balance, null, 2)}</pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs font-mono text-zinc-600">Unable to fetch balance</div>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg px-4 py-3 text-rose-400 text-xs font-mono">
            {error}
          </div>
        )}

        {/* Main Content: Table + Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Settlements Table (left) */}
          <div className="lg:col-span-2 bg-zinc-900/50 border border-zinc-800 rounded-lg overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-zinc-800">
              {(['all', 'premiums', 'payouts'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 px-4 py-3 text-[10px] font-mono uppercase tracking-wider transition-colors ${
                    activeTab === tab
                      ? 'bg-emerald-500/10 text-emerald-400 border-b-2 border-emerald-500'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {tab === 'all' ? 'All Transactions' : tab}
                </button>
              ))}
            </div>

            {/* Table */}
            {filteredTransactions.length === 0 ? (
              <div className="text-center py-16 text-xs font-mono text-zinc-600">
                No transactions found
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-900/30">
                      <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-zinc-600 font-normal">Type</th>
                      <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-zinc-600 font-normal">Amount</th>
                      <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-zinc-600 font-normal">Currency</th>
                      <th className="text-center px-4 py-3 text-[10px] uppercase tracking-wider text-zinc-600 font-normal">Status</th>
                      <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-zinc-600 font-normal">Tx Hash</th>
                      <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-zinc-600 font-normal">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.map((tx, idx) => (
                      <tr key={tx.id || idx} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                        <td className="px-4 py-3"><TypeBadge type={tx.type} /></td>
                        <td className="px-4 py-3 text-right text-zinc-200">
                          {tx.amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-zinc-400">{tx.currency}</td>
                        <td className="px-4 py-3 text-center"><StatusBadge status={tx.status} /></td>
                        <td className="px-4 py-3">
                          {tx.tx_hash ? (
                            <a
                              href={`https://testnet.xrpl.org/transactions/${tx.tx_hash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-400 hover:underline"
                              title={tx.tx_hash}
                            >
                              {truncateHash(tx.tx_hash)}
                            </a>
                          ) : (
                            <span className="text-zinc-600">---</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-zinc-500 whitespace-nowrap">
                          {tx.time ? new Date(tx.time).toLocaleString('en-US', { hour12: false, month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '---'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Quick Actions Panel (right) */}
          <div className="space-y-4">
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 mb-4">Send Payment</div>

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 block mb-1.5">Destination</label>
                  <input
                    type="text"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="rAddress..."
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-xs font-mono text-zinc-200 focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 block mb-1.5">Amount</label>
                  <input
                    type="number"
                    value={sendAmount}
                    onChange={(e) => setSendAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-xs font-mono text-zinc-200 focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 block mb-1.5">Currency</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-xs font-mono text-zinc-200 focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50"
                  >
                    <option value="RLUSD">RLUSD</option>
                    <option value="XRP">XRP</option>
                    <option value="USD">USD</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 block mb-1.5">Memo (optional)</label>
                  <input
                    type="text"
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    placeholder="Payment memo..."
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-xs font-mono text-zinc-200 focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50"
                  />
                </div>

                <button
                  onClick={handleSend}
                  disabled={sendLoading || !destination || !sendAmount}
                  className="w-full py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs font-mono uppercase tracking-wider text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {sendLoading ? <Spinner /> : null}
                  Send Payment
                </button>
              </div>

              {/* Send Result */}
              {sendResult && (
                <div className={`mt-4 rounded-lg px-4 py-3 text-xs font-mono ${
                  sendResult.error
                    ? 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
                    : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                }`}>
                  {sendResult.error ? (
                    <>Error: {sendResult.error}</>
                  ) : (
                    <div className="space-y-1">
                      <div>Payment sent successfully</div>
                      {sendResult.tx_hash && (
                        <div>
                          Tx:{' '}
                          <a
                            href={`https://testnet.xrpl.org/transactions/${sendResult.tx_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline"
                          >
                            {truncateHash(sendResult.tx_hash)}
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-900 pt-6 text-center">
          <p className="text-[10px] font-mono text-zinc-700">ActuaryOS XRPL Integration &bull; Testnet</p>
        </div>
      </div>
    </main>
  );
}
