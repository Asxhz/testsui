'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Layers, RotateCcw } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { BundleMetrics, HedgeBundle } from '@/lib/types';
import { MarketCard } from './MarketCard';

interface Props {
    bundles: HedgeBundle[];
    metrics?: BundleMetrics[];
    activeIndex?: number | null;
    onToggle?: (index: number) => void;
    onUpdateBet?: (bundleIndex: number, betIndex: number, field: 'allocation' | 'multiplier', value: number) => void;
    onReset?: (bundleIndex: number) => void;
}

const COLORS = ['#34d399', '#fbbf24', '#60a5fa', '#f472b6', '#a78bfa', '#2dd4bf', '#fb923c'];

export function BundleViewer({ bundles, metrics, activeIndex, onToggle, onUpdateBet, onReset }: Props) {
    const [internalIndex, setInternalIndex] = useState<number | null>(0);
    const openIndex = activeIndex !== undefined ? activeIndex : internalIndex;
    const [expandedCardIndex, setExpandedCardIndex] = useState<number | null>(null);

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
                const headerOffset = 150;
                const elementPosition = element.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
                window.scrollTo({ top: offsetPosition, behavior: "smooth" });
            }
        }, 100);
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
                    <Layers className="h-5 w-5 text-emerald-400" />
                    Strategy Options
                </h2>
                <p className="text-xs font-mono text-zinc-600 mt-1">
                    Each strategy uses your full ${bundles[0]?.budget?.toFixed(0) || '100'} budget.
                </p>
            </div>

            <div className="space-y-3">
                {bundles.map((bundle, index) => {
                    const isOpen = openIndex === index;
                    const themeName = bundle.coverage_summary.split(':')[0] || `Strategy ${index + 1}`;
                    const bundleMetric = metrics ? metrics[index] : null;

                    const allocationData = bundle.bets.map((bet, betIndex) => ({
                        name: bet.market.market.question.length > 25
                            ? bet.market.market.question.substring(0, 25) + '...'
                            : bet.market.market.question,
                        value: bet.allocation,
                        color: COLORS[betIndex % COLORS.length]
                    }));

                    return (
                        <div
                            key={index}
                            id={`bundle-${index}`}
                            className={`border rounded-lg overflow-hidden transition-all duration-200 ${
                                isOpen ? 'border-zinc-700 ring-1 ring-emerald-500/20' : 'border-zinc-800 hover:border-zinc-700'
                            }`}
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
                                                    <span className="text-zinc-400">
                                                        Max: ${bundleMetric.total_max_payout?.toFixed(0)}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                {isOpen ? <ChevronUp className="h-4 w-4 text-zinc-500" /> : <ChevronDown className="h-4 w-4 text-zinc-600" />}
                            </button>

                            {isOpen && (
                                <div className="p-4 pt-0 border-t border-zinc-800 bg-zinc-950/50">
                                    {/* Pie Chart */}
                                    <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-800 my-4">
                                        <h4 className="text-xs font-mono text-zinc-500 uppercase tracking-wider mb-2">Portfolio Diversity</h4>
                                        <div className="h-[180px] w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie
                                                        data={allocationData}
                                                        cx="50%"
                                                        cy="50%"
                                                        innerRadius={45}
                                                        outerRadius={65}
                                                        paddingAngle={2}
                                                        dataKey="value"
                                                    >
                                                        {allocationData.map((entry, idx) => (
                                                            <Cell key={`cell-${idx}`} fill={entry.color} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip
                                                        formatter={(value: number) => `$${value.toFixed(0)}`}
                                                        contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '6px', fontSize: '11px' }}
                                                        itemStyle={{ color: '#a1a1aa' }}
                                                    />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>

                                    {/* Table Header */}
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Allocation & Multipliers</h4>
                                        {onReset && (
                                            <button
                                                onClick={() => onReset(index)}
                                                className="text-[10px] font-mono flex items-center gap-1 text-zinc-500 hover:text-emerald-400 px-2 py-1 rounded border border-zinc-800 hover:border-zinc-600 transition-colors"
                                            >
                                                <RotateCcw className="h-3 w-3" />
                                                Reset
                                            </button>
                                        )}
                                    </div>

                                    {/* Allocation Table */}
                                    <div className="rounded-lg border border-zinc-800 overflow-hidden mb-4">
                                        <table className="min-w-full divide-y divide-zinc-800">
                                            <thead className="bg-zinc-900">
                                                <tr>
                                                    <th className="px-3 py-2 text-left text-[10px] font-mono text-zinc-600 uppercase tracking-wider w-1/3">Market</th>
                                                    <th className="px-3 py-2 text-right text-[10px] font-mono text-zinc-600 uppercase tracking-wider">Prob</th>
                                                    <th className="px-3 py-2 text-right text-[10px] font-mono text-zinc-600 uppercase tracking-wider">Alloc</th>
                                                    <th className="px-3 py-2 text-right text-[10px] font-mono text-zinc-600 uppercase tracking-wider">Multi</th>
                                                    <th className="px-3 py-2 text-right text-[10px] font-mono text-zinc-600 uppercase tracking-wider">Payout</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-zinc-800/50">
                                                {bundle.bets.map((bet, betIndex) => (
                                                    <tr
                                                        key={betIndex}
                                                        onClick={() => handleMarketClick(betIndex)}
                                                        className="hover:bg-zinc-800/30 cursor-pointer transition-colors"
                                                    >
                                                        <td className="px-3 py-2.5">
                                                            <div className="flex items-center gap-2 max-w-[280px]">
                                                                <span className="text-xs text-zinc-300 truncate flex-1" title={bet.market.market.question}>
                                                                    {bet.market.market.question}
                                                                </span>
                                                                <span className={`shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                                                    bet.outcome === 'Yes' ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'
                                                                }`}>
                                                                    {bet.outcome}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right text-xs font-mono text-zinc-500">
                                                            {(bet.current_price * 100).toFixed(0)}%
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right text-xs font-mono text-zinc-300">
                                                            ${Number(bet.allocation).toFixed(0)}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right text-xs font-mono text-zinc-400">
                                                            {Number(bet.payout_multiplier).toFixed(1)}x
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right text-xs font-mono text-emerald-400">
                                                            ${Number(bet.potential_payout).toFixed(0)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Market Cards */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {bundle.bets.map((bet, betIndex) => (
                                            <div key={bet.market.market.id + betIndex} id={`market-card-${index}-${betIndex}`} className={expandedCardIndex === betIndex ? "col-span-1 md:col-span-2" : ""}>
                                                <MarketCard
                                                    bet={bet}
                                                    isExpanded={expandedCardIndex === betIndex}
                                                    onToggle={() => {
                                                        const isOpening = expandedCardIndex !== betIndex;
                                                        setExpandedCardIndex(isOpening ? betIndex : null);
                                                        if (isOpening) {
                                                            setTimeout(() => {
                                                                const element = document.getElementById(`market-card-${index}-${betIndex}`);
                                                                if (element) {
                                                                    element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                                                                }
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
