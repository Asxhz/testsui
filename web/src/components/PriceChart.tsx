'use client';

import { useEffect, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { fetchPriceHistory, PriceHistoryPoint } from '@/lib/api';

interface Props {
  marketId: string;
  outcomeIndex?: number;
  outcomeName?: string;
}

interface ChartDataPoint {
  date: string;
  price: number;
  timestamp: number;
  fullDate: string;
}

export function PriceChart({ marketId, outcomeIndex = 0, outcomeName = 'Yes' }: Props) {
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadHistory() {
      setLoading(true);
      setError(null);

      try {
        const history = await fetchPriceHistory(marketId, '1m', outcomeIndex);

        if (history.length === 0) {
          setError('No price history available');
          setData([]);
        } else {
          const chartData: ChartDataPoint[] = history.map((point: PriceHistoryPoint) => {
            const date = new Date(point.t * 1000);
            return {
              date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              price: point.p,
              timestamp: point.t,
              fullDate: date.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              }),
            };
          });
          setData(chartData);
        }
      } catch (err) {
        console.error('Error loading price history:', err);
        setError('Failed to load price history');
      } finally {
        setLoading(false);
      }
    }

    if (marketId) {
      loadHistory();
    }
  }, [marketId, outcomeIndex]);

  if (loading) {
    return (
      <div className="h-48 flex items-center justify-center bg-zinc-900 rounded-lg border border-zinc-800">
        <div className="flex items-center gap-2 text-zinc-500">
          <div className="animate-spin h-4 w-4 border-2 border-emerald-500 border-t-transparent rounded-full" />
          <span className="text-xs font-mono">Loading chart...</span>
        </div>
      </div>
    );
  }

  if (error || data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center bg-zinc-900 rounded-lg border border-zinc-800">
        <span className="text-xs font-mono text-zinc-600">{error || 'No price data'}</span>
      </div>
    );
  }

  const minPrice = Math.max(0, Math.min(...data.map((d) => d.price)) - 0.05);
  const maxPrice = Math.min(1, Math.max(...data.map((d) => d.price)) + 0.05);

  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
      <div className="flex justify-between items-center mb-3">
        <h5 className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
          Price History (30d)
        </h5>
        <span className="text-xs font-mono text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">
          {outcomeName}
        </span>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#34d399" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#71717a' }}
              tickLine={false}
              axisLine={{ stroke: '#3f3f46' }}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[minPrice, maxPrice]}
              tick={{ fontSize: 10, fill: '#71717a' }}
              tickLine={false}
              axisLine={{ stroke: '#3f3f46' }}
              tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const point = payload[0].payload as ChartDataPoint;
                  return (
                    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 shadow-xl">
                      <p className="text-[10px] text-zinc-500 font-mono mb-1">{point.fullDate}</p>
                      <p className="text-sm font-mono font-semibold text-emerald-400">
                        {(point.price * 100).toFixed(1)}%
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke="#34d399"
              strokeWidth={1.5}
              fill="url(#priceGradient)"
              dot={false}
              activeDot={{
                r: 4,
                fill: '#34d399',
                stroke: '#18181b',
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
