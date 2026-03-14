'use client';

import { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { fetchPriceHistory } from '@/lib/api';
import { HedgeBundle } from '@/lib/types';

interface Props {
    bundle: HedgeBundle;
    budget: number;
}

interface BacktestPoint {
    date: string;
    value: number;
    pnl: number;
    pnlPercent: number;
    timestamp: number;
}

export function Backtester({ bundle, budget }: Props) {
    const [data, setData] = useState<BacktestPoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        async function runBacktest() {
            setLoading(true);
            setError('');

            try {
                // Fetch 30-day price history for each market in the bundle
                const histories = await Promise.all(
                    bundle.bets.map(async (bet) => {
                        const outcomeIdx = bet.market.market.outcomes.findIndex(
                            o => o.name.toLowerCase() === bet.outcome.toLowerCase()
                        );
                        const history = await fetchPriceHistory(
                            bet.market.market.id,
                            '1m',
                            outcomeIdx >= 0 ? outcomeIdx : 0
                        );
                        return {
                            bet,
                            history,
                            weight: bet.allocation / (budget || 1),
                        };
                    })
                );

                // Find common time range (use shortest history)
                const validHistories = histories.filter(h => h.history.length > 0);
                if (validHistories.length === 0) {
                    setError('No historical data available');
                    setLoading(false);
                    return;
                }

                // Sample at daily intervals
                const minLen = Math.min(...validHistories.map(h => h.history.length));
                const sampleRate = Math.max(1, Math.floor(minLen / 30));

                const points: BacktestPoint[] = [];
                const currentPrices = bundle.bets.map(b => b.current_price);

                for (let i = 0; i < minLen; i += sampleRate) {
                    let portfolioValue = 0;

                    validHistories.forEach((h, idx) => {
                        if (i < h.history.length) {
                            const histPrice = h.history[i].p;
                            const currentPrice = currentPrices[idx] || 0.5;
                            // If price went up, our position gained value
                            const priceChange = histPrice / (currentPrice || 0.5);
                            portfolioValue += h.weight * budget * (1 / histPrice);
                        }
                    });

                    // Normalize: current value = budget (since we're looking at what we'd have NOW)
                    const normalizedValue = (portfolioValue / validHistories.length) * validHistories.length;
                    const timestamp = validHistories[0].history[i]?.t || 0;
                    const date = new Date(timestamp * 1000);

                    points.push({
                        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                        value: Math.round(normalizedValue),
                        pnl: Math.round(normalizedValue - budget),
                        pnlPercent: ((normalizedValue - budget) / budget) * 100,
                        timestamp,
                    });
                }

                // Add current point
                const totalCurrentPayout = bundle.bets.reduce((s, b) => s + b.potential_payout, 0);
                points.push({
                    date: 'Now',
                    value: Math.round(totalCurrentPayout),
                    pnl: Math.round(totalCurrentPayout - budget),
                    pnlPercent: ((totalCurrentPayout - budget) / budget) * 100,
                    timestamp: Date.now() / 1000,
                });

                setData(points);
            } catch (e: any) {
                setError(e.message || 'Backtest failed');
            } finally {
                setLoading(false);
            }
        }

        if (bundle.bets.length > 0) {
            runBacktest();
        }
    }, [bundle, budget]);

    if (loading) {
        return (
            <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-5">
                <h4 className="text-xs font-mono text-zinc-500 uppercase tracking-wider mb-3">30-Day Backtest</h4>
                <div className="h-[200px] flex items-center justify-center">
                    <div className="flex items-center gap-2">
                        <div className="animate-spin h-4 w-4 border-2 border-emerald-500 border-t-transparent rounded-full" />
                        <span className="text-xs font-mono text-zinc-600">Running backtest on real Polymarket data...</span>
                    </div>
                </div>
            </div>
        );
    }

    if (error || data.length === 0) {
        return (
            <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-5">
                <h4 className="text-xs font-mono text-zinc-500 uppercase tracking-wider mb-3">30-Day Backtest</h4>
                <div className="h-[200px] flex items-center justify-center">
                    <span className="text-xs font-mono text-zinc-600">{error || 'Insufficient data for backtest'}</span>
                </div>
            </div>
        );
    }

    const finalPoint = data[data.length - 1];
    const isPositive = finalPoint.pnl >= 0;
    const minValue = Math.min(...data.map(d => d.value));
    const maxValue = Math.max(...data.map(d => d.value));

    return (
        <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-5">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h4 className="text-xs font-mono text-zinc-500 uppercase tracking-wider">30-Day Backtest</h4>
                    <p className="text-[9px] font-mono text-zinc-600 mt-0.5">Based on real Polymarket historical prices</p>
                </div>
                <div className="text-right">
                    <p className={`text-lg font-mono font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isPositive ? '+' : ''}{finalPoint.pnlPercent.toFixed(1)}%
                    </p>
                    <p className={`text-[10px] font-mono ${isPositive ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {isPositive ? '+' : ''}${finalPoint.pnl.toLocaleString()}
                    </p>
                </div>
            </div>

            <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                        <defs>
                            <linearGradient id="backtestGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={isPositive ? '#34d399' : '#f43f5e'} stopOpacity={0.2} />
                                <stop offset="95%" stopColor={isPositive ? '#34d399' : '#f43f5e'} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#71717a' }} tickLine={false} axisLine={{ stroke: '#3f3f46' }} interval="preserveStartEnd" />
                        <YAxis domain={[minValue * 0.95, maxValue * 1.05]} tick={{ fontSize: 10, fill: '#71717a' }} tickLine={false} axisLine={{ stroke: '#3f3f46' }} tickFormatter={(v) => `$${v >= 1000 ? (v/1000).toFixed(0) + 'k' : v}`} />
                        <ReferenceLine y={budget} stroke="#3f3f46" strokeDasharray="4 4" label={{ value: 'Invested', position: 'right', fill: '#52525b', fontSize: 9 }} />
                        <Tooltip
                            content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                    const p = payload[0].payload as BacktestPoint;
                                    return (
                                        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 shadow-xl">
                                            <p className="text-[10px] font-mono text-zinc-500 mb-1">{p.date}</p>
                                            <p className="text-sm font-mono font-semibold text-zinc-200">${p.value.toLocaleString()}</p>
                                            <p className={`text-[10px] font-mono ${p.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                {p.pnl >= 0 ? '+' : ''}{p.pnlPercent.toFixed(1)}% ({p.pnl >= 0 ? '+' : ''}${p.pnl.toLocaleString()})
                                            </p>
                                        </div>
                                    );
                                }
                                return null;
                            }}
                        />
                        <Area type="monotone" dataKey="value" stroke={isPositive ? '#34d399' : '#f43f5e'} strokeWidth={1.5} fill="url(#backtestGrad)" dot={false} activeDot={{ r: 4, fill: isPositive ? '#34d399' : '#f43f5e', stroke: '#18181b', strokeWidth: 2 }} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-zinc-800">
                <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    <span className="text-[9px] font-mono text-zinc-600">Real Polymarket data</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    <span className="text-[9px] font-mono text-zinc-600">{bundle.bets.length} markets tracked</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
                    <span className="text-[9px] font-mono text-zinc-600">Simulated returns, not financial advice</span>
                </div>
            </div>
        </div>
    );
}
