'use client';

import { useEffect, useState, useCallback } from 'react';

const API = 'http://localhost:8000';

interface Pool {
  id: string;
  name: string;
  coverage_type?: string;
  total_reserves?: number;
  reserve_balance?: number;
  sui_object_id?: string;
  status?: string;
}

interface SuiStatus {
  sui?: boolean;
  sui_connected?: boolean;
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

export default function SuiRegistryPage() {
  const [pools, setPools] = useState<Pool[]>([]);
  const [status, setStatus] = useState<SuiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  const [viewingObject, setViewingObject] = useState<{ id: string; data: any } | null>(null);
  const [error, setError] = useState('');

  const suiConnected = status?.sui || status?.sui_connected || status?.connected || false;

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [statusRes, poolsRes] = await Promise.all([
        fetch(`${API}/api/os/status`),
        fetch(`${API}/api/os/pools`),
      ]);

      if (statusRes.ok) {
        const sData = await statusRes.json();
        setStatus(sData);
      }
      if (poolsRes.ok) {
        const pData = await poolsRes.json();
        setPools(Array.isArray(pData) ? pData : pData.pools || []);
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

  const [successTxHash, setSuccessTxHash] = useState<string | null>(null);

  const handleRegister = async (poolId: string) => {
    try {
      setRegisteringId(poolId);
      setError('');
      setSuccessTxHash(null);
      const res = await fetch(`${API}/api/os/sui/register-pool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pool_id: poolId }),
      });
      if (!res.ok) throw new Error('Registration failed');
      const data = await res.json();
      const txHash = data.tx_hash || data.sui_object_id || data.object_id;
      if (txHash) setSuccessTxHash(txHash);
      await fetchData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRegisteringId(null);
    }
  };

  const handleViewObject = (pool: Pool) => {
    const txHash = pool.sui_object_id!;
    setViewingObject({
      id: txHash,
      data: {
        pool_id: pool.id,
        pool_name: pool.name,
        coverage_type: pool.coverage_type || 'N/A',
        reserve_balance: pool.reserve_balance || pool.total_reserves || 0,
        status: pool.status || 'active',
        xrpl_tx_hash: txHash,
        xrpl_explorer_url: `https://testnet.xrpl.org/transactions/${txHash}`,
      },
    });
  };

  const truncateId = (id: string) => {
    if (!id || id.length <= 16) return id;
    return `${id.slice(0, 8)}...${id.slice(-8)}`;
  };

  // Recursive JSON renderer with emerald keys
  const renderJson = (obj: any, indent: number = 0): JSX.Element[] => {
    const elements: JSX.Element[] = [];
    if (typeof obj !== 'object' || obj === null) {
      const color = typeof obj === 'string' ? 'text-amber-400' : typeof obj === 'number' ? 'text-sky-400' : typeof obj === 'boolean' ? 'text-rose-400' : 'text-zinc-400';
      elements.push(<span className={color}>{JSON.stringify(obj)}</span>);
      return elements;
    }

    const isArray = Array.isArray(obj);
    const entries = isArray ? obj.map((v: any, i: number) => [i, v]) : Object.entries(obj);

    return [
      <span key="open" className="text-zinc-500">{isArray ? '[' : '{'}</span>,
      ...entries.flatMap((entry: any, idx: number) => {
        const [key, val] = entry;
        const isLast = idx === entries.length - 1;
        const line = (
          <div key={`${indent}-${key}`} style={{ paddingLeft: `${(indent + 1) * 16}px` }}>
            {!isArray && <span className="text-emerald-400">&quot;{key}&quot;</span>}
            {!isArray && <span className="text-zinc-500">: </span>}
            {typeof val === 'object' && val !== null ? (
              <span>{renderJson(val, indent + 1)}</span>
            ) : (
              <span className={
                typeof val === 'string' ? 'text-amber-400' :
                typeof val === 'number' ? 'text-sky-400' :
                typeof val === 'boolean' ? 'text-rose-400' : 'text-zinc-400'
              }>{JSON.stringify(val)}</span>
            )}
            {!isLast && <span className="text-zinc-500">,</span>}
          </div>
        );
        return [line];
      }),
      <span key="close" className="text-zinc-500">{isArray ? ']' : '}'}</span>,
    ];
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="text-center">
          <div className="animate-spin h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-xs font-mono text-zinc-600">Loading Sui registry...</p>
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
            <div className="flex items-center gap-2 px-2.5 py-1 bg-sky-500/10 border border-sky-500/20 rounded">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-sky-400">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
              </svg>
              <span className="text-xs font-mono text-sky-400 font-medium">SUI</span>
            </div>
            <span className="text-sm font-mono text-zinc-300 tracking-wide">Sui Pool Registry</span>
          </div>
          <div className="flex items-center gap-2">
            <ConnectionDot connected={suiConnected} />
            <span className="text-[10px] font-mono text-zinc-500">
              {suiConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Integration Status */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 flex items-center gap-4">
          <ConnectionDot connected={suiConnected} />
          <div>
            <div className="text-sm font-mono text-zinc-200">
              {suiConnected ? 'Sui Network Connected' : 'Sui Network Disconnected'}
            </div>
            <div className="text-[10px] font-mono text-zinc-600 mt-0.5">
              {suiConnected
                ? 'Testnet integration active — pools can be registered on-chain'
                : status?.message || 'Unable to reach Sui testnet. Check your configuration.'}
            </div>
          </div>
          <div className="ml-auto text-[10px] font-mono text-zinc-600">
            Network: <span className="text-zinc-400">Sui Testnet</span>
          </div>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg px-4 py-3 text-rose-400 text-xs font-mono">
            {error}
          </div>
        )}

        {successTxHash && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-3 text-emerald-400 text-xs font-mono flex items-center justify-between">
            <span>Pool registered on XRPL Testnet: {truncateId(successTxHash)}</span>
            <div className="flex items-center gap-3">
              <a
                href={`https://testnet.xrpl.org/transactions/${successTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-emerald-300 transition-colors"
              >
                View on XRPL Explorer
              </a>
              <button onClick={() => setSuccessTxHash(null)} className="text-emerald-500/50 hover:text-emerald-300 transition-colors">&times;</button>
            </div>
          </div>
        )}

        {/* Pool Registry Table */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800">
            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-600">Pool Registry</div>
          </div>

          {pools.length === 0 ? (
            <div className="text-center py-16 text-xs font-mono text-zinc-600">
              No pools found. Create a pool first.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/30">
                    <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider text-zinc-600 font-normal">Pool Name</th>
                    <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider text-zinc-600 font-normal">Coverage Type</th>
                    <th className="text-right px-5 py-3 text-[10px] uppercase tracking-wider text-zinc-600 font-normal">Reserve Balance</th>
                    <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider text-zinc-600 font-normal">XRPL Tx Hash</th>
                    <th className="text-center px-5 py-3 text-[10px] uppercase tracking-wider text-zinc-600 font-normal">Status</th>
                    <th className="text-right px-5 py-3 text-[10px] uppercase tracking-wider text-zinc-600 font-normal">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pools.map((pool) => (
                    <tr key={pool.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                      <td className="px-5 py-3.5 text-zinc-200">{pool.name || pool.id}</td>
                      <td className="px-5 py-3.5 text-zinc-400">{pool.coverage_type || '---'}</td>
                      <td className="px-5 py-3.5 text-right text-zinc-200">
                        ${(pool.reserve_balance || pool.total_reserves || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-5 py-3.5">
                        {pool.sui_object_id ? (
                          <a
                            href={`https://testnet.xrpl.org/transactions/${pool.sui_object_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-400 cursor-pointer hover:underline hover:text-emerald-300 transition-colors"
                            title={pool.sui_object_id}
                          >
                            {truncateId(pool.sui_object_id)}
                          </a>
                        ) : (
                          <span className="text-zinc-600">Not registered</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        {pool.sui_object_id ? (
                          <a
                            href={`https://testnet.xrpl.org/transactions/${pool.sui_object_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-mono uppercase tracking-wider rounded border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                          >
                            ON-CHAIN
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-amber-500/10 text-amber-400 text-[10px] font-mono uppercase tracking-wider rounded border border-amber-500/20">
                            PENDING
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {pool.sui_object_id ? (
                          <button
                            onClick={() => handleViewObject(pool)}
                            className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] font-mono uppercase tracking-wider text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/30 transition-colors"
                          >
                            View Details
                          </button>
                        ) : (
                          <button
                            onClick={() => handleRegister(pool.id)}
                            disabled={registeringId === pool.id || !suiConnected}
                            className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] font-mono uppercase tracking-wider text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 ml-auto"
                          >
                            {registeringId === pool.id ? <Spinner /> : null}
                            Register
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Object Detail Panel */}
        {viewingObject && (
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 mb-1">XRPL On-Chain Proof</div>
                <div className="text-xs font-mono text-emerald-400">{viewingObject.id}</div>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={`https://testnet.xrpl.org/transactions/${viewingObject.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] font-mono uppercase tracking-wider text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                >
                  View on XRPL Explorer
                </a>
                <button
                  onClick={() => setViewingObject(null)}
                  className="text-zinc-600 hover:text-zinc-300 transition-colors text-lg leading-none"
                >
                  &times;
                </button>
              </div>
            </div>
            <div className="p-5 bg-zinc-900 overflow-x-auto">
              <pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap">
                {renderJson(viewingObject.data)}
              </pre>
            </div>
          </div>
        )}

        {/* Network Info */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
          <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 mb-3">Network Information</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
            <div>
              <div className="text-zinc-600 mb-1">Network</div>
              <div className="text-zinc-300">Sui Testnet</div>
            </div>
            <div>
              <div className="text-zinc-600 mb-1">RPC URL</div>
              <div className="text-zinc-300">https://fullnode.testnet.sui.io</div>
            </div>
            <div>
              <div className="text-zinc-600 mb-1">Status</div>
              <div className="flex items-center gap-2">
                <ConnectionDot connected={suiConnected} />
                <span className={suiConnected ? 'text-emerald-400' : 'text-rose-400'}>
                  {suiConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-900 pt-6 text-center">
          <p className="text-[10px] font-mono text-zinc-700">ActuaryOS Sui Integration &bull; Testnet</p>
        </div>
      </div>
    </main>
  );
}
