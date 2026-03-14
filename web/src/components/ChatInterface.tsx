'use client';

import { useState, useEffect } from 'react';
import { Send, DollarSign } from 'lucide-react';
import { generateHedgeStream } from '@/lib/api';
import { ProgressTracker } from './ProgressTracker';

export function ChatInterface() {
  const [concern, setConcern] = useState('');
  const [budget, setBudget] = useState(100);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [contextUrls, setContextUrls] = useState<string[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [recentAnalyses, setRecentAnalyses] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('actuaryai_recent');
      if (saved) setRecentAnalyses(JSON.parse(saved));
    } catch {}
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!concern.trim()) return;

    setIsLoading(true);
    setProgress([]);

    // Save to recent analyses
    try {
      const recent = JSON.parse(localStorage.getItem('actuaryai_recent') || '[]');
      const updated = [concern, ...recent.filter((r: string) => r !== concern)].slice(0, 10);
      localStorage.setItem('actuaryai_recent', JSON.stringify(updated));
      setRecentAnalyses(updated);
    } catch {}

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
              sessionStorage.setItem('hedgeContextUrls', JSON.stringify(contextUrls));
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

          {/* Context URLs */}
          <div>
            <label className="block text-xs font-mono text-zinc-400 mb-2 uppercase tracking-wider">
              Context URLs <span className="text-zinc-600">(optional)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Paste a URL for context (e.g. news article)..."
                className="flex-1 px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 font-mono text-sm focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-colors"
                disabled={isLoading}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (urlInput.trim() && urlInput.includes('.')) {
                      setContextUrls(prev => [...prev, urlInput.trim()]);
                      setUrlInput('');
                    }
                  }
                }}
              />
              <button
                type="button"
                onClick={() => {
                  if (urlInput.trim() && urlInput.includes('.')) {
                    setContextUrls(prev => [...prev, urlInput.trim()]);
                    setUrlInput('');
                  }
                }}
                disabled={isLoading || !urlInput.trim()}
                className="px-3 py-2.5 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-900 disabled:text-zinc-700 text-zinc-300 text-xs font-mono rounded-lg transition-colors"
              >
                Add
              </button>
            </div>
            {contextUrls.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {contextUrls.map((url, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-[10px] font-mono text-zinc-400">
                    {url.replace(/https?:\/\//, '').split('/')[0]}
                    <button onClick={() => setContextUrls(prev => prev.filter((_, idx) => idx !== i))} className="text-zinc-600 hover:text-rose-400 ml-0.5">×</button>
                  </span>
                ))}
              </div>
            )}
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

          {/* Recent Analyses */}
          {recentAnalyses.length > 0 && !isLoading && (
            <div>
              <label className="block text-[10px] font-mono text-zinc-600 mb-1.5 uppercase tracking-wider">Recent</label>
              <div className="flex flex-wrap gap-2">
                {recentAnalyses.slice(0, 5).map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setConcern(r)}
                    className="px-3 py-1 text-xs font-mono text-zinc-600 border border-zinc-800/50 rounded-md hover:border-zinc-700 hover:text-zinc-400 transition-colors truncate max-w-[200px]"
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}

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
