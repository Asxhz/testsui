'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Settings2, MessageSquare, X } from 'lucide-react';
import gsap from 'gsap';
import { FinancialMetrics } from '@/components/FinancialMetrics';
import { BundleViewer } from '@/components/BundleViewer';
import { HedgeResponse, PortfolioMetrics } from '@/lib/types';
import { generateHedgeStream } from '@/lib/api';
import { ProgressTracker } from '@/components/ProgressTracker';

export default function ResultsPage() {
    const [data, setData] = useState<HedgeResponse | null>(null);
    const [concern, setConcern] = useState<string>('');
    const [openBundleIndex, setOpenBundleIndex] = useState<number | null>(0);
    const [originalBundles, setOriginalBundles] = useState<any[]>([]);
    const [currentBundles, setCurrentBundles] = useState<any[]>([]);
    const [metrics, setMetrics] = useState<PortfolioMetrics | null>(null);
    const [budgetInput, setBudgetInput] = useState<string>('');

    // New state
    const [showRefine, setShowRefine] = useState(false);
    const [showChat, setShowChat] = useState(false);
    const [refineConcern, setRefineConcern] = useState('');
    const [refineNumMarkets, setRefineNumMarkets] = useState(500);
    const [refineMaxPerBundle, setRefineMaxPerBundle] = useState(10);
    const [isRerunning, setIsRerunning] = useState(false);
    const [rerunProgress, setRerunProgress] = useState<string[]>([]);
    const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
    const [chatInput, setChatInput] = useState('');
    const statsRef = useRef<HTMLDivElement>(null);

    // Existing handlers (keep all)
    const handleSelectBundle = (index: number) => {
        setOpenBundleIndex(index);
        setTimeout(() => {
            const el = document.getElementById(`bundle-${index}`);
            if (el) {
                const offset = el.getBoundingClientRect().top + window.pageYOffset - 100;
                window.scrollTo({ top: offset, behavior: 'smooth' });
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
                ...b, allocation: b.allocation * scale, potential_payout: b.potential_payout * scale
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
            ...bundle, budget: newBudget,
            bets: bundle.bets.map((bet: any) => ({
                ...bet, allocation: bet.allocation * scale, potential_payout: bet.potential_payout * scale
            }))
        }));
        recalculatemetrics(updatedBundles);
    };

    const handleUpdateBet = (bundleIndex: number, betIndex: number, field: 'allocation' | 'multiplier', value: number) => {
        const updatedBundles = [...currentBundles];
        const bundle = { ...updatedBundles[bundleIndex] };
        const bets = [...bundle.bets];
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
                    const share = currentSumOthers > 0 ? bet.allocation / currentSumOthers : 1 / otherBets.length;
                    bet.allocation = remainder * share;
                    bet.potential_payout = bet.allocation * bet.payout_multiplier;
                }
            });
            bundle.bets = bets;
            bundle.total_allocated = totalBudget;
        } else if (field === 'multiplier') {
            bets[betIndex].payout_multiplier = value;
            bets[betIndex].potential_payout = bets[betIndex].allocation * value;
            bundle.bets = bets;
        }
        updatedBundles[bundleIndex] = bundle;
        recalculatemetrics(updatedBundles);
    };

    // NEW: Exclude market handler
    const handleExcludeMarket = (bundleIndex: number, betIndex: number) => {
        const updatedBundles = [...currentBundles];
        const bundle = { ...updatedBundles[bundleIndex] };
        const bet = bundle.bets[betIndex];
        const removedAlloc = bet.allocation;
        const marketId = bet.market.market.id;

        // Remove the bet
        const remainingBets = bundle.bets.filter((_: any, i: number) => i !== betIndex);

        // Redistribute allocation
        const totalRemaining = remainingBets.reduce((s: number, b: any) => s + b.allocation, 0);
        if (totalRemaining > 0 && remainingBets.length > 0) {
            remainingBets.forEach((b: any) => {
                const share = b.allocation / totalRemaining;
                b.allocation += removedAlloc * share;
                b.potential_payout = b.allocation * b.payout_multiplier;
            });
        }

        bundle.bets = remainingBets;
        updatedBundles[bundleIndex] = bundle;
        setExcludedIds(prev => { const next = new Set(Array.from(prev)); next.add(marketId); return next; });
        recalculatemetrics(updatedBundles);
    };

    // NEW: Re-run handler
    const handleRerun = async () => {
        setIsRerunning(true);
        setRerunProgress([]);
        try {
            await generateHedgeStream(
                { concern: refineConcern || concern, budget: parseFloat(budgetInput) || 100, num_markets: refineNumMarkets },
                (event) => {
                    if (event.type === 'progress') {
                        setRerunProgress(prev => [...prev, event.data.message]);
                    } else if (event.type === 'search_complete') {
                        setRerunProgress(prev => [...prev, `Found ${event.data.markets_found} markets`]);
                    } else if (event.type === 'filter_complete') {
                        setRerunProgress(prev => [...prev, `Filtered to ${event.data.markets_filtered} relevant markets`]);
                    } else if (event.type === 'bundles_complete') {
                        setRerunProgress(prev => [...prev, `Created ${event.data.num_bundles} strategies`]);
                    } else if (event.type === 'complete') {
                        const parsed = event.data;
                        setData(parsed);
                        setOriginalBundles(JSON.parse(JSON.stringify(parsed.bundles)));
                        setCurrentBundles(parsed.bundles);
                        setMetrics(parsed.metrics);
                        setExcludedIds(new Set());
                        setShowRefine(false);
                        setIsRerunning(false);
                    } else if (event.type === 'error') {
                        alert(`Error: ${event.data.message}`);
                        setIsRerunning(false);
                    }
                }
            );
        } catch (e) {
            console.error(e);
            setIsRerunning(false);
        }
    };

    // Load from sessionStorage
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
            } catch (e) { console.error('Failed to parse', e); }
        }
        if (storedConcern) { setConcern(storedConcern); setRefineConcern(storedConcern); }
    }, []);

    // GSAP animations
    useEffect(() => {
        if (currentBundles.length && metrics && statsRef.current) {
            gsap.fromTo('.stat-card', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.08, ease: 'power2.out' });
            gsap.fromTo('.status-dot', { scale: 0 }, { scale: 1, duration: 0.3, stagger: 0.1, ease: 'back.out(2)', delay: 0.3 });
        }
    }, [currentBundles.length, metrics]);

    if (!currentBundles.length || !metrics) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="relative mb-6">
                        <div className="h-12 w-12 rounded-full border-2 border-zinc-800 mx-auto" />
                        <div className="absolute inset-0 h-12 w-12 rounded-full border-2 border-emerald-500 border-t-transparent mx-auto animate-spin" />
                    </div>
                    <p className="text-sm font-mono text-zinc-400 mb-1">Analyzing markets</p>
                    <p className="text-[10px] font-mono text-zinc-600">Building hedge strategies from 52,000+ prediction markets</p>
                </div>
            </div>
        );
    }

    const totalPayout = currentBundles.reduce((sum, b) => sum + b.bets.reduce((s: number, bet: any) => s + (bet.potential_payout || 0), 0), 0);
    const totalMarkets = currentBundles.reduce((sum, b) => sum + b.bets.length, 0);
    const avgMultiplier = metrics.weighted_avg_multiplier || 1;

    return (
        <main className="min-h-screen bg-zinc-950 bg-dot-pattern pb-20">
            {/* Top Nav */}
            <div className="bg-zinc-900/80 border-b border-zinc-800 sticky top-0 z-10 backdrop-blur-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-14">
                        <Link href="/" className="flex items-center gap-2 text-zinc-500 hover:text-zinc-300 text-sm font-mono transition-colors">
                            <ArrowLeft className="h-4 w-4" />
                            <span className="hidden sm:inline">ActuaryAI</span>
                        </Link>
                        <div className="flex items-center gap-3">
                            <button onClick={() => { setShowRefine(!showRefine); setShowChat(false); }}
                                className={`flex items-center gap-1.5 text-[10px] font-mono px-3 py-1.5 rounded border transition-colors ${showRefine ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'text-zinc-500 border-zinc-800 hover:border-zinc-600'}`}>
                                <Settings2 className="h-3 w-3" /> Refine
                            </button>
                            <button onClick={() => { setShowChat(!showChat); setShowRefine(false); }}
                                className={`flex items-center gap-1.5 text-[10px] font-mono px-3 py-1.5 rounded border transition-colors ${showChat ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'text-zinc-500 border-zinc-800 hover:border-zinc-600'}`}>
                                <MessageSquare className="h-3 w-3" /> Ask
                            </button>
                            <div className="flex items-center gap-2 bg-zinc-800/50 px-3 py-1.5 rounded-lg border border-zinc-700">
                                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Budget</span>
                                <div className="relative">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-600 text-xs font-mono">$</span>
                                    <input type="number" value={budgetInput} onChange={(e) => handleUpdateBudget(e.target.value)}
                                        className="w-28 pl-5 pr-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-right text-zinc-200 text-sm font-mono focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50" />
                                </div>
                            </div>
                            <Link href="/ledger" className="text-[10px] font-mono text-zinc-600 hover:text-emerald-400 transition-colors uppercase tracking-wider">Ledger</Link>
                        </div>
                    </div>
                </div>
            </div>

            {/* Refine Panel */}
            {showRefine && (
                <div className="bg-zinc-900/90 border-b border-zinc-800 backdrop-blur-sm">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-semibold text-zinc-200">Refine Strategy</h3>
                            <button onClick={() => setShowRefine(false)} className="text-zinc-600 hover:text-zinc-400"><X className="h-4 w-4" /></button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                            <div>
                                <label className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider block mb-1">Concern</label>
                                <input value={refineConcern} onChange={e => setRefineConcern(e.target.value)}
                                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-xs font-mono text-zinc-200" />
                            </div>
                            <div>
                                <label className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider block mb-1">Markets to Search</label>
                                <input type="number" value={refineNumMarkets} onChange={e => setRefineNumMarkets(Number(e.target.value))}
                                    min={50} max={1000} step={50}
                                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-xs font-mono text-zinc-200" />
                            </div>
                            <div>
                                <label className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider block mb-1">Max Per Strategy</label>
                                <input type="number" value={refineMaxPerBundle} onChange={e => setRefineMaxPerBundle(Number(e.target.value))}
                                    min={3} max={25}
                                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-xs font-mono text-zinc-200" />
                            </div>
                            <div className="flex items-end">
                                <button onClick={handleRerun} disabled={isRerunning}
                                    className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 text-xs font-mono font-semibold rounded transition-colors">
                                    {isRerunning ? 'Analyzing...' : 'Re-run Analysis'}
                                </button>
                            </div>
                        </div>
                        {excludedIds.size > 0 && (
                            <p className="text-[10px] font-mono text-zinc-600">{excludedIds.size} market(s) excluded from current view</p>
                        )}
                        {isRerunning && rerunProgress.length > 0 && (
                            <div className="mt-3 border-t border-zinc-800 pt-3">
                                <ProgressTracker steps={rerunProgress} />
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Ask Panel */}
            {showChat && (
                <div className="bg-zinc-900/90 border-b border-zinc-800 backdrop-blur-sm">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-semibold text-zinc-200">Ask About Your Strategy</h3>
                            <button onClick={() => setShowChat(false)} className="text-zinc-600 hover:text-zinc-400"><X className="h-4 w-4" /></button>
                        </div>
                        <div className="flex flex-wrap gap-2 mb-3">
                            {['Why these markets?', 'Which positions are riskiest?', 'What if I double my budget?', 'Explain the risk score', 'Summarize my strategy'].map(q => (
                                <button key={q} onClick={() => setChatInput(q)}
                                    className="text-[10px] font-mono text-zinc-500 border border-zinc-800 hover:border-zinc-600 hover:text-zinc-300 px-2.5 py-1.5 rounded transition-colors">
                                    {q}
                                </button>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Ask anything about your hedge strategy..."
                                className="flex-1 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-xs font-mono text-zinc-200 placeholder-zinc-700" />
                            <button className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-zinc-950 text-xs font-mono font-semibold rounded transition-colors">
                                Ask
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Title */}
                <div className="mb-6">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-mono uppercase tracking-widest rounded mb-3 border border-emerald-500/20">
                        Risk Analysis Complete
                    </div>
                    <h1 className="text-2xl font-semibold text-zinc-100">{concern || "Your Risk Profile"}</h1>
                </div>

                {/* Summary Stats */}
                <div ref={statsRef} className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
                    <div className="stat-card border border-zinc-800 rounded-lg bg-zinc-900/50 p-4">
                        <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider block mb-1">Strategies</span>
                        <p className="text-2xl font-mono font-bold text-zinc-100">{currentBundles.length}</p>
                    </div>
                    <div className="stat-card border border-zinc-800 rounded-lg bg-zinc-900/50 p-4">
                        <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider block mb-1">Markets</span>
                        <p className="text-2xl font-mono font-bold text-zinc-100">{totalMarkets}</p>
                    </div>
                    <div className="stat-card border border-zinc-800 rounded-lg bg-zinc-900/50 p-4">
                        <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider block mb-1">Max Payout</span>
                        <p className="text-2xl font-mono font-bold text-emerald-400">${totalPayout.toLocaleString(undefined, {maximumFractionDigits: 0})}</p>
                    </div>
                    <div className="stat-card border border-zinc-800 rounded-lg bg-zinc-900/50 p-4">
                        <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider block mb-1">Avg Multiplier</span>
                        <p className="text-2xl font-mono font-bold text-zinc-100">{avgMultiplier.toFixed(1)}x</p>
                    </div>
                    <div className="stat-card border border-zinc-800 rounded-lg bg-zinc-900/50 p-4">
                        <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider block mb-1">Risk Score</span>
                        <p className={`text-2xl font-mono font-bold ${metrics.overall_risk_score > 70 ? 'text-rose-400' : metrics.overall_risk_score > 40 ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {metrics.overall_risk_score.toFixed(0)}
                        </p>
                    </div>
                </div>

                {/* Status Row */}
                <div className="flex items-center gap-4 mb-8 flex-wrap">
                    <div className="status-dot flex items-center gap-1.5">
                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        <span className="text-[10px] font-mono text-zinc-500">Polymarket live</span>
                    </div>
                    <div className="status-dot flex items-center gap-1.5">
                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        <span className="text-[10px] font-mono text-zinc-500">XRPL ready</span>
                    </div>
                    <div className="status-dot flex items-center gap-1.5">
                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        <span className="text-[10px] font-mono text-zinc-500">Sui connected</span>
                    </div>
                    {data?.execution_time_seconds && (
                        <span className="text-[10px] font-mono text-zinc-600 ml-auto">Analyzed in {data.execution_time_seconds.toFixed(1)}s</span>
                    )}
                </div>

                {/* Strategy Cards */}
                <div className="mb-10">
                    <FinancialMetrics metrics={metrics} onSelectBundle={handleSelectBundle} />
                </div>

                {/* Bundle Details */}
                <BundleViewer
                    bundles={currentBundles}
                    metrics={metrics.bundle_metrics}
                    activeIndex={openBundleIndex}
                    onToggle={handleToggleBundle}
                    onUpdateBet={handleUpdateBet}
                    onReset={handleReset}
                    onExcludeMarket={handleExcludeMarket}
                />
            </div>

            <div className="border-t border-zinc-900 mt-16">
                <div className="max-w-7xl mx-auto px-4 py-6 text-center">
                    <p className="text-[10px] font-mono text-zinc-700">Powered by Polymarket &bull; ActuaryAI Risk Engine</p>
                </div>
            </div>
        </main>
    );
}
