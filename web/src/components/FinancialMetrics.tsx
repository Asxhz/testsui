'use client';

import { Activity, AlertTriangle, DollarSign } from 'lucide-react';
import { PortfolioMetrics, BundleMetrics } from '@/lib/types';

interface Props {
    metrics: PortfolioMetrics;
}

const ACCENT_COLORS = ['#34d399', '#fbbf24', '#60a5fa', '#f472b6', '#a78bfa'];

function BundleMetricsCard({ bundle, index, onClick }: { bundle: BundleMetrics; index: number; onClick?: () => void }) {
    const riskScore = bundle.risk_score ?? 50;
    const totalMaxPayout = bundle.total_max_payout ?? bundle.max_payout ?? 0;
    const riskColor = riskScore > 70 ? 'text-rose-400' : riskScore > 40 ? 'text-amber-400' : 'text-emerald-400';
    const riskBg = riskScore > 70 ? 'bg-rose-500' : riskScore > 40 ? 'bg-amber-500' : 'bg-emerald-500';

    return (
        <div
            onClick={onClick}
            className="glass border border-zinc-800 p-5 rounded-lg cursor-pointer transition-all hover:border-zinc-600 hover:glow-emerald group"
        >
            <div className="flex items-center gap-3 mb-4">
                <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: ACCENT_COLORS[index % ACCENT_COLORS.length] }}
                />
                <h3 className="text-sm font-semibold text-zinc-200 group-hover:text-zinc-50 transition-colors">{bundle.theme_name}</h3>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col">
                    <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Risk
                    </span>
                    <span className={`text-xl font-mono font-bold ${riskColor}`}>
                        {riskScore.toFixed(0)}
                    </span>
                </div>

                <div className="flex flex-col">
                    <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        Max Payout
                    </span>
                    <span className="text-xl font-mono font-bold text-zinc-200">
                        ${totalMaxPayout.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                </div>
            </div>

            <div className="mt-4 pt-3 border-t border-zinc-800">
                <div className="flex justify-between text-[10px] font-mono text-zinc-600 mb-1.5">
                    <span>Risk Level</span>
                    <span className={riskColor}>{riskScore > 70 ? 'High' : riskScore > 40 ? 'Moderate' : 'Low'}</span>
                </div>
                <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                        className={`h-full rounded-full ${riskBg} transition-all`}
                        style={{ width: `${riskScore}%` }}
                    />
                </div>
            </div>
        </div>
    );
}

export function FinancialMetrics({ metrics, onSelectBundle }: Props & { onSelectBundle?: (index: number) => void }) {
    return (
        <div className="space-y-5">
            <div>
                <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
                    <Activity className="h-5 w-5 text-emerald-400" />
                    Strategy Comparison
                </h2>
                <p className="text-xs font-mono text-zinc-600 mt-1">
                    Select a strategy to view holdings.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {metrics.bundle_metrics.map((bundle, index) => (
                    <BundleMetricsCard
                        key={bundle.theme_name}
                        bundle={bundle}
                        index={index}
                        onClick={() => onSelectBundle?.(index)}
                    />
                ))}
            </div>
        </div>
    );
}
