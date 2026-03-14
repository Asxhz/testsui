'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { ChatInterface } from '@/components/ChatInterface';
import gsap from 'gsap';

export default function Home() {
    const heroRef = useRef<HTMLDivElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const [showAdvisor, setShowAdvisor] = useState(false);
    const showAdvisorRef = useRef(false);
    const [systemStatus, setSystemStatus] = useState<any>(null);

    // Keep ref in sync
    useEffect(() => {
        showAdvisorRef.current = showAdvisor;
    }, [showAdvisor]);

    useEffect(() => {
        fetch('http://localhost:8000/api/os/status').then(r => r.json()).then(setSystemStatus).catch(() => {});
        fetch('http://localhost:8000/health').then(r => r.json()).catch(() => {});
    }, []);

    // GSAP hero animation
    useEffect(() => {
        if (!showAdvisor) {
            const tl = gsap.timeline();
            tl.fromTo('.hero-badge', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' })
              .fromTo('.hero-title', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.8, ease: 'power2.out' }, '-=0.3')
              .fromTo('.hero-subtitle', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }, '-=0.4')
              .fromTo('.hero-stats', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out', stagger: 0.1 }, '-=0.3')
              .fromTo('.hero-cta', { opacity: 0, scale: 0.95 }, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.7)' }, '-=0.2');
        }
    }, [showAdvisor]);

    // Scroll-to-reveal
    useEffect(() => {
        const handleWheel = (e: WheelEvent) => {
            if (!showAdvisorRef.current && e.deltaY > 10) {
                setShowAdvisor(true);
            }
        };
        window.addEventListener('wheel', handleWheel, { passive: true });
        return () => window.removeEventListener('wheel', handleWheel);
    }, []);

    // Animate advisor card in
    useEffect(() => {
        if (showAdvisor && cardRef.current) {
            gsap.fromTo(cardRef.current,
                { y: 60, opacity: 0 },
                { y: 0, opacity: 1, duration: 0.8, ease: 'power3.out' }
            );
        }
    }, [showAdvisor]);

    const launchAdvisor = useCallback(() => {
        setShowAdvisor(true);
    }, []);

    return (
        <div className="min-h-screen relative overflow-hidden">
            {/* Background - pointer-events-none so clicks pass through */}
            <div className="absolute inset-0 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 pointer-events-none">
                <div className="absolute inset-0 bg-dot-pattern opacity-40" />
                <div className="absolute top-1/4 -left-32 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl animate-pulse" />
                <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-emerald-400/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/[0.03] rounded-full blur-[120px]" />
            </div>

            {/* Top bar */}
            <div className="fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-6 py-4">
                <Link href="/" className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-sm font-bold text-zinc-50">Actuary<span className="text-emerald-400">AI</span></span>
                </Link>
                <Link href="/ledger" className="text-[10px] font-mono text-zinc-600 hover:text-emerald-400 transition-colors uppercase tracking-wider">
                    Ledger
                </Link>
            </div>

            <div className="relative z-10">
                {!showAdvisor ? (
                    <div ref={heroRef} className="flex flex-col items-center justify-center min-h-screen px-8 text-center">
                        <div className="hero-badge inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full mb-8">
                            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest">Live Risk Engine</span>
                        </div>

                        <h1 className="hero-title text-5xl md:text-7xl font-bold tracking-tight text-zinc-50 mb-6 leading-[1.1]">
                            Actuary<span className="text-emerald-400">AI</span>
                        </h1>

                        <p className="hero-subtitle text-lg md:text-xl text-zinc-400 max-w-xl mb-12 leading-relaxed font-light">
                            Real-world risk modeling powered by prediction markets.
                            <br />
                            <span className="text-zinc-500">Hedge. Settle. Prove.</span>
                        </p>

                        <div className="flex items-center gap-8 mb-12">
                            <div className="hero-stats text-center">
                                <p className="text-2xl font-mono font-bold text-emerald-400">52,000+</p>
                                <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider mt-1">Live Markets</p>
                            </div>
                            <div className="h-8 w-px bg-zinc-800" />
                            <div className="hero-stats text-center">
                                <p className="text-2xl font-mono font-bold text-zinc-200">XRPL</p>
                                <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider mt-1">Settlement</p>
                            </div>
                            <div className="h-8 w-px bg-zinc-800" />
                            <div className="hero-stats text-center">
                                <p className="text-2xl font-mono font-bold text-zinc-200">Sui</p>
                                <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider mt-1">Registry</p>
                            </div>
                            <div className="h-8 w-px bg-zinc-800" />
                            <div className="hero-stats text-center">
                                <p className="text-2xl font-mono font-bold text-zinc-200">Solana</p>
                                <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider mt-1">Anchoring</p>
                            </div>
                        </div>

                        {/* System Status */}
                        {systemStatus && (
                            <div className="flex items-center gap-4 mb-8 px-4 py-2 bg-zinc-900/50 border border-zinc-800 rounded-lg">
                                {Object.entries(systemStatus).map(([key, val]) => (
                                    <div key={key} className="flex items-center gap-1.5">
                                        <div className={`h-1.5 w-1.5 rounded-full ${val === 'available' ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                                        <span className="text-[9px] font-mono text-zinc-500 uppercase">{key}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <button
                            onClick={launchAdvisor}
                            className="hero-cta relative px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-semibold rounded-lg transition-all hover:shadow-[0_0_40px_rgba(52,211,153,0.2)] text-sm font-mono uppercase tracking-wider cursor-pointer z-20"
                        >
                            Launch Advisor
                        </button>

                        <div className="absolute bottom-8 flex flex-col items-center gap-2 animate-bounce pointer-events-none">
                            <span className="text-[9px] font-mono text-zinc-700 uppercase tracking-widest">or scroll</span>
                            <svg className="w-4 h-4 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                            </svg>
                        </div>
                    </div>
                ) : (
                    <div ref={cardRef} className="max-w-4xl mx-auto px-4 py-8">
                        <button
                            onClick={() => setShowAdvisor(false)}
                            className="mb-6 text-xs font-mono text-zinc-600 hover:text-emerald-400 transition-colors flex items-center gap-1 cursor-pointer"
                        >
                            ← Back to overview
                        </button>
                        <ChatInterface />
                    </div>
                )}
            </div>
        </div>
    );
}
