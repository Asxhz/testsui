'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Layers, RotateCcw } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { BundleMetrics, HedgeBundle } from '@/lib/types';
import { MarketCard } from './MarketCard';
import { Backtester } from './Backtester';

interface Props {
    bundles: HedgeBundle[];
    metrics?: BundleMetrics[];
    activeIndex?: number | null;
    onToggle?: (index: number) => void;
    onUpdateBet?: (bundleIndex: number, betIndex: number, field: 'allocation' | 'multiplier', value: number) => void;
    onReset?: (bundleIndex: number) => void;
    onExcludeMarket?: (bundleIndex: number, betIndex: number) => void;
}

const COLORS = ['#34d399', '#fbbf24', '#60a5fa', '#f472b6', '#a78bfa', '#2dd4bf', '#fb923c'];

function probColor(p: number) {
    if (p > 0.6) return 'text-emerald-400';
    if (p > 0.3) return 'text-amber-400';
    return 'text-rose-400';
}

function probBg(p: number) {
    if (p > 0.6) return 'bg-emerald-500';
    if (p > 0.3) return 'bg-amber-500';
    return 'bg-rose-500';
}

export function BundleViewer({ bundles, metrics, activeIndex, onToggle, onUpdateBet, onReset, onExcludeMarket }: Props) {
    const [internalIndex, setInternalIndex] = useState<number | null>(0);
    const openIndex = activeIndex !== undefined ? activeIndex : internalIndex;
    const [expandedCardIndex, setExpandedCardIndex] = useState<number | null>(null);
    const [visibleCounts, setVisibleCounts] = useState<Record<number, number>>({});
    const getVisibleCount = (idx: number) => visibleCounts[idx] || 10;
    const setVisibleCount = (idx: number, count: number) => setVisibleCounts(prev => ({ ...prev, [idx]: count }));

    const handleToggle = (index: number) => {
        if (onToggle) {
            onToggle(index);
        } else {
            setInternalIndex(internalIndex === index ? null : index);
        }
    };

    const handleMarketClick = (betIndex: number) => {
        setExpandedCardIndex(betIndex);
        setTimeout(() => {
            const targetIndex = activeIndex !== undefined ? activeIndex : (internalIndex ?? 0);
            const element = document.getElementById(`market-card-${targetIndex}-${betIndex}`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }, 100);
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
                    <Layers className="h-5 w-5 text-emerald-400" />
                    Strategy Details
                </h2>
                <p className="text-xs font-mono text-zinc-600 mt-1">
                    Click a strategy to explore positions. Each uses your full ${bundles[0]?.budget?.toFixed(0) || '100'} budget.
                </p>
            </div>

            <div className="space-y-3">
                {bundles.map((bundle, index) => {
                    const isOpen = openIndex === index;
                    const themeName = bundle.coverage_summary.split(':')[0] || `Strategy ${index + 1}`;
                    const bundleMetric = metrics ? metrics[index] : null;
                    const totalAlloc = bundle.bets.reduce((s, b) => s + b.allocation, 0);

                    const allocationData = bundle.bets.map((bet, betIndex) => ({
                        name: bet.market.market.question.length > 20 ? bet.market.market.question.substring(0, 20) + '...' : bet.market.market.question,
                        value: bet.allocation,
                        color: COLORS[betIndex % COLORS.length],
                        prob: bet.current_price,
                        multiplier: bet.payout_multiplier,
                    }));

                    const barData = bundle.bets.map((bet, i) => ({
                        name: `M${i + 1}`,
                        allocation: bet.allocation,
                        payout: bet.potential_payout,
                    }));

                    // Stats
                    const avgProb = bundle.bets.length > 0 ? bundle.bets.reduce((s, b) => s + b.current_price, 0) / bundle.bets.length : 0;
                    const bestMult = bundle.bets.length > 0 ? Math.max(...bundle.bets.map(b => b.payout_multiplier)) : 0;
                    const worstMult = bundle.bets.length > 0 ? Math.min(...bundle.bets.map(b => b.payout_multiplier)) : 0;
                    const totalPayout = bundle.bets.reduce((s, b) => s + b.potential_payout, 0);

                    return (
                        <div
                            key={index}
                            id={`bundle-${index}`}
                            className={`border rounded-lg overflow-hidden transition-all duration-200 ${isOpen ? 'border-zinc-700 ring-1 ring-emerald-500/20' : 'border-zinc-800 hover:border-zinc-700'}`}
                        >
                            <button
                                onClick={() => handleToggle(index)}
                                className="w-full flex items-center justify-between p-4 text-left bg-zinc-900/50 group"
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`p-1.5 rounded ${isOpen ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-500 group-hover:text-zinc-400'}`}>
                                        <Layers className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-semibold text-zinc-200">{themeName}</h3>
                                        <div className="flex items-center gap-2.5 mt-0.5 text-xs font-mono text-zinc-600">
                                            <span>{bundle.bets.length} positions</span>
                                            {bundleMetric && (
                                                <>
                                                    <span className="text-zinc-800">|</span>
                                                    <span className={bundleMetric.risk_score > 70 ? 'text-rose-400' : bundleMetric.risk_score > 40 ? 'text-amber-400' : 'text-emerald-400'}>
                                                        Risk: {bundleMetric.risk_score.toFixed(0)}
                                                    </span>
                                                    <span className="text-zinc-800">|</span>
                                                    <span className="text-zinc-400">Max: ${bundleMetric.total_max_payout?.toFixed(0)}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                {isOpen ? <ChevronUp className="h-4 w-4 text-zinc-500" /> : <ChevronDown className="h-4 w-4 text-zinc-600" />}
                            </button>

                            {isOpen && (
                                <div className="p-4 pt-0 border-t border-zinc-800 bg-zinc-950/50">
                                    {/* Quick Stats */}
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 my-4">
                                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
                                            <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider block">Positions</span>
                                            <span className="text-lg font-mono font-bold text-zinc-200">{bundle.bets.length}</span>
                                        </div>
                                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
                                            <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider block">Avg Probability</span>
                                            <span className={`text-lg font-mono font-bold ${probColor(avgProb)}`}>{(avgProb * 100).toFixed(0)}%</span>
                                        </div>
                                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
                                            <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider block">Best Multiplier</span>
                                            <span className="text-lg font-mono font-bold text-emerald-400">{bestMult.toFixed(1)}x</span>
                                        </div>
                                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
                                            <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider block">Worst Multiplier</span>
                                            <span className="text-lg font-mono font-bold text-zinc-400">{worstMult.toFixed(1)}x</span>
                                        </div>
                                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
                                            <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider block">Total Payout</span>
                                            <span className="text-lg font-mono font-bold text-emerald-400">${totalPayout.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                                        </div>
                                    </div>

                                    {/* Charts Row */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                        {/* Pie Chart */}
                                        <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-800">
                                            <h4 className="text-xs font-mono text-zinc-500 uppercase tracking-wider mb-2">Allocation Split</h4>
                                            <div className="h-[220px] w-full relative">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <PieChart>
                                                        <Pie data={allocationData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={2} dataKey="value">
                                                            {allocationData.map((entry, idx) => (
                                                                <Cell key={`cell-${idx}`} fill={entry.color} />
                                                            ))}
                                                        </Pie>
                                                        <Tooltip
                                                            formatter={(value: number) => [`$${value.toFixed(0)}`, 'Allocation']}
                                                            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '6px', fontSize: '11px' }}
                                                            itemStyle={{ color: '#a1a1aa' }}
                                                        />
                                                    </PieChart>
                                                </ResponsiveContainer>
                                                {/* Center label */}
                                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                    <div className="text-center">
                                                        <p className="text-lg font-mono font-bold text-zinc-200">${totalAlloc.toLocaleString(undefined, {maximumFractionDigits: 0})}</p>
                                                        <p className="text-[9px] font-mono text-zinc-600 uppercase">Total</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Bar Chart */}
                                        <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-800">
                                            <h4 className="text-xs font-mono text-zinc-500 uppercase tracking-wider mb-2">Allocation vs Payout</h4>
                                            <div className="h-[220px] w-full">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart data={barData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                                                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#71717a' }} tickLine={false} axisLine={{ stroke: '#3f3f46' }} />
                                                        <YAxis tick={{ fontSize: 10, fill: '#71717a' }} tickLine={false} axisLine={{ stroke: '#3f3f46' }} tickFormatter={(v) => `$${v >= 1000 ? (v/1000).toFixed(0) + 'k' : v}`} />
                                                        <Tooltip
                                                            formatter={(value: number, name: string) => [`$${value.toFixed(0)}`, name === 'allocation' ? 'Invested' : 'Potential Payout']}
                                                            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '6px', fontSize: '11px' }}
                                                            itemStyle={{ color: '#a1a1aa' }}
                                                        />
                                                        <Bar dataKey="allocation" fill="#3f3f46" radius={[3, 3, 0, 0]} name="allocation" />
                                                        <Bar dataKey="payout" fill="#34d399" radius={[3, 3, 0, 0]} name="payout" />
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Reset + Table Header */}
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Position Details</h4>
                                        {onReset && (
                                            <button onClick={() => onReset(index)} className="text-[10px] font-mono flex items-center gap-1 text-zinc-500 hover:text-emerald-400 px-2 py-1 rounded border border-zinc-800 hover:border-zinc-600 transition-colors">
                                                <RotateCcw className="h-3 w-3" /> Reset
                                            </button>
                                        )}
                                    </div>

                                    {/* Enhanced Table */}
                                    <div className="rounded-lg border border-zinc-800 overflow-hidden mb-4">
                                        <table className="min-w-full divide-y divide-zinc-800">
                                            <thead className="bg-zinc-900">
                                                <tr>
                                                    <th className="px-3 py-2 text-left text-[10px] font-mono text-zinc-600 uppercase tracking-wider w-[35%]">Market</th>
                                                    <th className="px-3 py-2 text-right text-[10px] font-mono text-zinc-600 uppercase tracking-wider">Prob</th>
                                                    <th className="px-3 py-2 text-right text-[10px] font-mono text-zinc-600 uppercase tracking-wider">Alloc</th>
                                                    <th className="px-3 py-2 text-[10px] font-mono text-zinc-600 uppercase tracking-wider w-[15%]"></th>
                                                    <th className="px-3 py-2 text-right text-[10px] font-mono text-zinc-600 uppercase tracking-wider">Multi</th>
                                                    <th className="px-3 py-2 text-right text-[10px] font-mono text-zinc-600 uppercase tracking-wider">Payout</th>
                                                    <th className="px-2 py-2 text-[10px] font-mono text-zinc-600 uppercase tracking-wider w-8"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-zinc-800/50">
                                                {bundle.bets.slice(0, getVisibleCount(index)).map((bet, betIndex) => {
                                                    const allocPct = totalAlloc > 0 ? (bet.allocation / totalAlloc) * 100 : 0;
                                                    return (
                                                        <tr key={betIndex} onClick={() => handleMarketClick(betIndex)} className="hover:bg-zinc-800/30 cursor-pointer transition-colors">
                                                            <td className="px-3 py-2.5">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-xs text-zinc-300 truncate" title={bet.market.market.question}>{bet.market.market.question}</span>
                                                                    <span className={`shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded ${bet.outcome === 'Yes' ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'}`}>{bet.outcome}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-3 py-2.5 text-right">
                                                                <span className={`text-xs font-mono font-semibold ${probColor(bet.current_price)}`}>{(bet.current_price * 100).toFixed(0)}%</span>
                                                            </td>
                                                            <td className="px-3 py-2.5 text-right text-xs font-mono text-zinc-300">${Number(bet.allocation).toFixed(0)}</td>
                                                            <td className="px-3 py-2.5">
                                                                <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                                                    <div className="h-full bg-emerald-500/50 rounded-full" style={{ width: `${allocPct}%` }} />
                                                                </div>
                                                            </td>
                                                            <td className="px-3 py-2.5 text-right text-xs font-mono text-zinc-400">{Number(bet.payout_multiplier).toFixed(1)}x</td>
                                                            <td className="px-3 py-2.5 text-right text-xs font-mono text-emerald-400 font-semibold">${Number(bet.potential_payout).toFixed(0)}</td>
                                                        <td className="px-2 py-2.5">
                                                            {onExcludeMarket && (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); onExcludeMarket(index, betIndex); }}
                                                                    className="text-zinc-700 hover:text-rose-400 transition-colors"
                                                                    title="Exclude this market"
                                                                >
                                                                    ×
                                                                </button>
                                                            )}
                                                        </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                    {bundle.bets.length > 10 && (
                                        <div className="flex items-center justify-center py-3">
                                            <button
                                                onClick={() => setVisibleCount(index, getVisibleCount(index) >= bundle.bets.length ? 10 : bundle.bets.length)}
                                                className="text-[10px] font-mono text-emerald-500 hover:text-emerald-400 border border-emerald-500/20 px-4 py-1.5 rounded transition-colors"
                                            >
                                                {getVisibleCount(index) >= bundle.bets.length ? 'Show less' : `Show ${bundle.bets.length - getVisibleCount(index)} more markets`}
                                            </button>
                                        </div>
                                    )}

                                    {/* Backtest */}
                                    <div className="mb-4">
                                        <Backtester bundle={bundle} budget={bundle.budget || 100} />
                                    </div>

                                    {/* Market Cards */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {bundle.bets.slice(0, getVisibleCount(index)).map((bet, betIndex) => (
                                            <div key={bet.market.market.id + betIndex} id={`market-card-${index}-${betIndex}`} className={expandedCardIndex === betIndex ? "col-span-1 md:col-span-2" : ""}>
                                                <MarketCard
                                                    bet={bet}
                                                    isExpanded={expandedCardIndex === betIndex}
                                                    onToggle={() => {
                                                        const isOpening = expandedCardIndex !== betIndex;
                                                        setExpandedCardIndex(isOpening ? betIndex : null);
                                                        if (isOpening) {
                                                            setTimeout(() => {
                                                                document.getElementById(`market-card-${index}-${betIndex}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                                                            }, 100);
                                                        }
                                                    }}
                                                    onUpdateAllocation={onUpdateBet ? (val) => onUpdateBet(index, betIndex, 'allocation', val) : undefined}
                                                    totalBudget={bundle.budget || 100}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
