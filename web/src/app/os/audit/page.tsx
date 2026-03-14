'use client';

import { useEffect, useState } from 'react';
import { fetchAuditLogs, AuditLog } from '@/lib/os-api';

const ENTITY_TYPES = [
  'all',
  'pool',
  'policy',
  'claim',
  'payment',
  'integration',
] as const;

function formatDate(d: any): string {
  if (!d) return '\u2014';
  const date = new Date(d);
  if (isNaN(date.getTime())) return String(d).slice(0, 19);
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function truncatePayload(payload?: Record<string, unknown>): string {
  if (!payload) return '--';
  const str = JSON.stringify(payload);
  if (str.length <= 80) return str;
  return str.slice(0, 77) + '...';
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { limit: '200' };
      if (filter !== 'all') {
        params.entity_type = filter;
      }
      const data = await fetchAuditLogs(params);
      setLogs(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [filter]);

  return (
    <div className="px-8 py-8 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-mono uppercase tracking-widest rounded mb-3 border border-emerald-500/20">
            Audit Trail
          </div>
          <h1 className="text-2xl font-semibold text-zinc-100">Audit Log</h1>
        </div>

        {/* Filter */}
        <div>
          <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-600 mb-1.5">
            Filter Entity
          </label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 font-mono text-xs focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-colors"
          >
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t === 'all' ? 'All Entities' : t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-32">
          <div className="text-center">
            <div className="animate-spin h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-xs font-mono text-zinc-600">
              Loading audit logs...
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

      {/* Terminal-style log */}
      {!loading && !error && (
        <div className="border border-zinc-800 rounded-lg bg-zinc-950 overflow-hidden">
          {/* Terminal header bar */}
          <div className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900/80 border-b border-zinc-800">
            <div className="h-2.5 w-2.5 rounded-full bg-rose-500/60" />
            <div className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/60" />
            <span className="ml-2 text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
              audit-trail -- {logs.length} entries
            </span>
          </div>

          {/* Logs */}
          <div className="p-4 max-h-[70vh] overflow-y-auto space-y-0">
            {logs.length === 0 && (
              <p className="text-sm font-mono text-zinc-600 py-8 text-center">
                No audit entries found.
              </p>
            )}

            {logs.map((log, idx) => (
              <div
                key={log.id || idx}
                className="flex items-start gap-3 py-1.5 border-b border-zinc-900 last:border-0 group hover:bg-zinc-900/30 px-1 rounded transition-colors"
              >
                {/* Timestamp */}
                <span className="text-[11px] font-mono text-emerald-400/70 whitespace-nowrap flex-shrink-0">
                  {formatDate(log.timestamp)}
                </span>

                {/* Actor */}
                <span className="text-[11px] font-mono text-zinc-500 w-20 flex-shrink-0 truncate">
                  {log.actor}
                </span>

                {/* Event type */}
                <span className="text-[11px] font-mono text-amber-400/80 w-28 flex-shrink-0 truncate uppercase">
                  {log.event_type}
                </span>

                {/* Entity */}
                <span className="text-[11px] font-mono text-zinc-400 w-28 flex-shrink-0 truncate">
                  {log.entity}
                </span>

                {/* Payload */}
                <span className="text-[11px] font-mono text-zinc-600 flex-1 truncate">
                  {truncatePayload(log.payload)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
