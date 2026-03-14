'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { FinancialMetrics } from '@/components/FinancialMetrics';
import { BundleViewer } from '@/components/BundleViewer';
import { HedgeResponse, PortfolioMetrics } from '@/lib/types';

export default function ResultsPage() {
    const [data, setData] = useState<HedgeResponse | null>(null);
    const [concern, setConcern] = useState<string>('');
    const [openBundleIndex, setOpenBundleIndex] = useState<number | null>(0);

    const [originalBundles, setOriginalBundles] = useState<any[]>([]);
    const [currentBundles, setCurrentBundles] = useState<any[]>([]);
    const [metrics, setMetrics] = useState<PortfolioMetrics | null>(null);
    const [budgetInput, setBudgetInput] = useState<string>('');

    const handleSelectBundle = (index: number) => {
        setOpenBundleIndex(index);
        setTimeout(() => {
            const element = document.getElementById(`bundle-${index}`);
            if (element) {
                const headerOffset = 100;
                const elementPosition = element.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
                window.scrollTo({ top: offsetPosition, behavior: "smooth" });
            }
        }, 100);
    };

    const handleToggleBundle = (index: number) => {
        setOpenBundleIndex(openBundleIndex === index ? null : index);
    };

    const recalculatemetrics = async (bundles: any[]) => {
        const { calculatePortfolioMetrics } = await import('@/lib/metrics');
        const newMetrics = calculatePortfolioMetrics(bundles);
        setMetrics(newMetrics);
        setCurrentBundles(bundles);
    };

    const handleReset = (bundleIndex: number) => {
        if (!originalBundles.length) return;

        const updatedBundles = [...currentBundles];
        updatedBundles[bundleIndex] = JSON.parse(JSON.stringify(originalBundles[bundleIndex]));

        const intendedBudget = parseFloat(budgetInput) || 100;
        const originalBudget = updatedBundles[bundleIndex].budget || 100;

        if (intendedBudget !== originalBudget && originalBudget > 0) {
            const scale = intendedBudget / originalBudget;
            updatedBundles[bundleIndex].budget = intendedBudget;
            updatedBundles[bundleIndex].bets = updatedBundles[bundleIndex].bets.map((b: any) => ({
                ...b,
                allocation: b.allocation * scale,
                potential_payout: b.potential_payout * scale
            }));
        }

        recalculatemetrics(updatedBundles);
    };

    const handleUpdateBudget = (val: string) => {
        setBudgetInput(val);
        const newBudget = parseFloat(val);

        if (!currentBundles.length || isNaN(newBudget) || newBudget <= 0) return;

        const oldBudget = currentBundles[0].budget || 100;
        if (oldBudget <= 0) return;

        const scale = newBudget / oldBudget;

        const updatedBundles = currentBundles.map(bundle => ({
            ...bundle,
            budget: newBudget,
            bets: bundle.bets.map((bet: any) => ({
                ...bet,
                allocation: bet.allocation * scale,
                potential_payout: bet.potential_payout * scale
            }))
        }));

        recalculatemetrics(updatedBundles);
    };

    const handleUpdateBet = (bundleIndex: number, betIndex: number, field: 'allocation' | 'multiplier', value: number) => {
        const updatedBundles = [...currentBundles];
        const bundle = { ...updatedBundles[bundleIndex] };
        const bets = [...bundle.bets];
        const targetBet = bets[betIndex];

        if (field === 'allocation') {
            const totalBudget = bundle.budget || 100;
            const newAllocation = Math.min(Math.max(value, 0), totalBudget);
            const remainder = totalBudget - newAllocation;
            const otherBets = bets.filter((_, idx) => idx !== betIndex);
            const currentSumOthers = otherBets.reduce((sum, b) => sum + b.allocation, 0);

            bets.forEach((bet, idx) => {
                if (idx === betIndex) {
                    bet.allocation = newAllocation;
                    bet.potential_payout = newAllocation * bet.payout_multiplier;
                } else {
                    let share = currentSumOthers > 0 ? bet.allocation / currentSumOthers : 1 / otherBets.length;
                    const newAlloc = remainder * share;
                    bet.allocation = newAlloc;
                    bet.potential_payout = newAlloc * bet.payout_multiplier;
                }
            });

            bundle.bets = bets;
            bundle.total_allocated = totalBudget;
        } else if (field === 'multiplier') {
            targetBet.payout_multiplier = value;
            targetBet.potential_payout = targetBet.allocation * value;
            bets[betIndex] = targetBet;
            bundle.bets = bets;
        }

        updatedBundles[bundleIndex] = bundle;
        recalculatemetrics(updatedBundles);
    };

    useEffect(() => {
        const storedData = sessionStorage.getItem('hedgeResults');
        const storedConcern = sessionStorage.getItem('hedgeConcern');

        if (storedData) {
            try {
                const parsed = JSON.parse(storedData);
                setData(parsed);
                setOriginalBundles(JSON.parse(JSON.stringify(parsed.bundles)));
                setCurrentBundles(parsed.bundles);
                setMetrics(parsed.metrics);
                setBudgetInput(parsed.metrics.total_budget?.toFixed(0) || '100');
            } catch (e) {
                console.error('Failed to parse hedge results', e);
            }
        }

        if (storedConcern) {
            setConcern(storedConcern);
        }
    }, []);

    if (!currentBundles.length || !metrics) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-zinc-950">
                <div className="text-center">
                    <div className="animate-spin h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-3" />
                    <p className="text-xs font-mono text-zinc-600">Loading strategy...</p>
                </div>
            </div>
        );
    }

    return (
        <main className="min-h-screen bg-zinc-950 bg-dot-pattern pb-20">
            {/* Header */}
            <div className="bg-zinc-900/80 border-b border-zinc-800 sticky top-0 z-10 backdrop-blur-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-14">
                        <Link
                            href="/"
                            className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 text-sm font-mono transition-colors"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Back
                        </Link>

                        <div className="flex items-center gap-2.5 bg-zinc-800/50 px-3 py-1.5 rounded-lg border border-zinc-700">
                            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Budget</span>
                            <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-600 text-xs font-mono">$</span>
                                <input
                                    type="number"
                                    value={budgetInput}
                                    onChange={(e) => handleUpdateBudget(e.target.value)}
                                    className="w-24 pl-5 pr-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-right text-zinc-200 text-sm font-mono focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Title */}
                <div className="mb-8">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-mono uppercase tracking-widest rounded mb-3 border border-emerald-500/20">
                        Risk Analysis
                    </div>
                    <h1 className="text-2xl font-semibold text-zinc-100 mb-1">
                        {concern || "Your Risk Profile"}
                    </h1>
                </div>

                {/* Strategy Cards */}
                <div className="mb-10">
                    <FinancialMetrics
                        metrics={metrics}
                        onSelectBundle={handleSelectBundle}
                    />
                </div>

                {/* Bundle Details */}
                <div>
                    <BundleViewer
                        bundles={currentBundles}
                        metrics={metrics.bundle_metrics}
                        activeIndex={openBundleIndex}
                        onToggle={handleToggleBundle}
                        onUpdateBet={handleUpdateBet}
                        onReset={handleReset}
                    />
                </div>
            </div>

            {/* Footer */}
            <div className="border-t border-zinc-900 mt-16">
                <div className="max-w-7xl mx-auto px-4 py-6 text-center">
                    <p className="text-[10px] font-mono text-zinc-700">
                        Powered by Polymarket &bull; ActuaryAI Risk Engine
                    </p>
                </div>
            </div>
        </main>
    );
}
