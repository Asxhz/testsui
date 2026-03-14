'use client';

import { useState } from 'react';
import { Send, DollarSign } from 'lucide-react';
import { generateHedgeStream } from '@/lib/api';
import { ProgressTracker } from './ProgressTracker';

export function ChatInterface() {
  const [concern, setConcern] = useState('');
  const [budget, setBudget] = useState(100);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!concern.trim()) return;

    setIsLoading(true);
    setProgress([]);

    try {
      await generateHedgeStream(
        { concern, budget, num_markets: 500 },
        (event) => {
          if (event.type === 'progress') {
            console.log('[ChatInterface] Progress:', event.data.message);
            setProgress(prev => [...prev, event.data.message]);
          } else if (event.type === 'search_complete') {
            setProgress(prev => [...prev, `Found ${event.data.markets_found} markets`]);
          } else if (event.type === 'filter_complete') {
            setProgress(prev => [...prev, `Filtered to ${event.data.markets_filtered} relevant markets`]);
          } else if (event.type === 'bundles_complete') {
            setProgress(prev => [...prev, `Created ${event.data.num_bundles} strategy bundles`]);
          } else if (event.type === 'complete') {
            console.log('[ChatInterface] Complete event received', event.data);
            if (typeof window !== 'undefined') {
              sessionStorage.setItem('hedgeResults', JSON.stringify(event.data));
              sessionStorage.setItem('hedgeConcern', concern);
              window.location.href = '/results';
            }
          } else if (event.type === 'error') {
            console.error('[ChatInterface] Error event:', event.data);
            alert(`Error: ${event.data.message}`);
            setIsLoading(false);
          }
        }
      );
    } catch (error) {
      console.error('Error:', error);
      alert('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const exampleConcerns = [
    "SEC regulations impacting crypto holdings",
    "Recession hitting the tech sector",
    "Housing market correction in 2026",
    "AI disruption replacing engineering jobs"
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      {/* Header */}
      <div className="text-center mb-14">
        <div className="inline-flex items-center gap-2 mb-4">
          <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">System Online</span>
        </div>
        <h1 className="text-5xl font-bold tracking-tight text-zinc-50 mb-3">
          Actuary<span className="text-emerald-400">AI</span>
        </h1>
        <p className="text-zinc-500 font-mono text-sm">
          Real-world risk modeling. Powered by prediction markets.
        </p>
      </div>

      {/* Form */}
      <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Concern Input */}
          <div>
            <label className="block text-xs font-mono text-zinc-400 mb-2 uppercase tracking-wider">
              Risk Description
            </label>
            <textarea
              value={concern}
              onChange={(e) => setConcern(e.target.value)}
              placeholder="Describe the risk you want to hedge against..."
              className="w-full h-28 px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 resize-none font-mono text-sm transition-colors"
              disabled={isLoading}
            />
          </div>

          {/* Budget Input */}
          <div>
            <label className="block text-xs font-mono text-zinc-400 mb-2 uppercase tracking-wider">
              Hedge Budget
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-3 h-4 w-4 text-zinc-600" />
              <input
                type="number"
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
                min={10}
                step={10}
                className="w-full pl-9 pr-4 py-3 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 font-mono text-sm focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-colors"
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Example Concerns */}
          <div className="flex flex-wrap gap-2">
            {exampleConcerns.map((ex, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setConcern(ex)}
                className="px-3 py-1 text-xs font-mono text-zinc-500 border border-zinc-800 rounded-md hover:border-zinc-600 hover:text-zinc-300 transition-colors"
                disabled={isLoading}
              >
                {ex}
              </button>
            ))}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading || !concern.trim()}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed text-zinc-950 font-semibold py-3 px-6 rounded-lg transition-all flex items-center justify-center gap-2 hover:glow-emerald"
          >
            {isLoading ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-zinc-950 border-t-transparent rounded-full" />
                <span className="font-mono text-sm">Analyzing...</span>
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                <span className="font-mono text-sm">Run Analysis</span>
              </>
            )}
          </button>
        </form>

        {/* Progress */}
        {isLoading && progress.length > 0 && (
          <div className="mt-5 border-t border-zinc-800 pt-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-3 w-3 rounded-full border border-emerald-500 border-t-transparent animate-spin" />
              <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider">Processing Pipeline</span>
            </div>
            <ProgressTracker steps={progress} />
          </div>
        )}
      </div>
    </div>
  );
}
