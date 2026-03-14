'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

const API = 'http://localhost:8000';

interface Pool {
  id: string;
  name: string;
}

interface PricingBreakdown {
  expected_loss?: number;
  risk_load?: number;
  expense_load?: number;
  buffer_load?: number;
  total_premium?: number;
  reserve_requirement?: number;
  confidence_level?: number;
}

interface AssessmentResult {
  classification?: string;
  viable?: boolean;
  viability?: boolean;
  pricing?: PricingBreakdown;
  pricing_breakdown?: PricingBreakdown;
  premium?: number;
  reserve_requirement?: number;
  confidence_level?: number;
  risk_score?: number;
  [key: string]: any;
}

function Spinner() {
  return (
    <div className="animate-spin h-4 w-4 border-2 border-emerald-500 border-t-transparent rounded-full" />
  );
}

function ClassificationBadge({ classification }: { classification: string }) {
  const styles: Record<string, string> = {
    hedge_only: 'bg-zinc-800 text-zinc-300 border-zinc-700',
    protection_candidate: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    hybrid: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  };
  return (
    <span className={`inline-flex items-center px-3 py-1 text-xs font-mono uppercase tracking-wider rounded border ${styles[classification] || styles.hedge_only}`}>
      {classification?.replace(/_/g, ' ') || 'Unknown'}
    </span>
  );
}

function ProtectionPageInner() {
  const searchParams = useSearchParams();

  const [pools, setPools] = useState<Pool[]>([]);
  const [concern, setConcern] = useState(searchParams.get('concern') || '');
  const [coverageAmount, setCoverageAmount] = useState('');
  const [selectedPool, setSelectedPool] = useState('');
  const [loading, setLoading] = useState(false);
  const [assessLoading, setAssessLoading] = useState(false);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [assessment, setAssessment] = useState<AssessmentResult | null>(null);
  const [purchaseResult, setPurchaseResult] = useState<{ policy_id?: string; error?: string } | null>(null);
  const [error, setError] = useState('');

  const fetchPools = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/api/os/pools`);
      if (!res.ok) throw new Error('Failed to fetch pools');
      const data = await res.json();
      const poolList = Array.isArray(data) ? data : data.pools || [];
      setPools(poolList);
      if (poolList.length > 0 && !selectedPool) {
        setSelectedPool(poolList[0].id);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [selectedPool]);

  useEffect(() => {
    fetchPools();
  }, [fetchPools]);

  const handleAssess = async () => {
    if (!concern || !coverageAmount) return;
    try {
      setAssessLoading(true);
      setAssessment(null);
      setPurchaseResult(null);
      setError('');

      const res = await fetch(`${API}/api/os/assess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concern: concern,
          bundle_data: { source: 'manual_assessment' },
          market_odds: [0.3, 0.45, 0.6, 0.5, 0.35],
          coverage_amount: parseFloat(coverageAmount) || 1000,
        }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(errBody || `Assessment failed (${res.status})`);
      }
      const data = await res.json();
      // Handle possible nested response structures
      const result = data.assessment || data.result || data;
      setAssessment(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAssessLoading(false);
    }
  };

  const handlePurchase = async () => {
    if (!assessment || !selectedPool) return;
    const pricing = assessment.pricing || assessment.pricing_breakdown || {};
    try {
      setPurchaseLoading(true);
      setPurchaseResult(null);
      setError('');

      const res = await fetch(`${API}/api/os/policies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pool_id: selectedPool,
          concern,
          coverage_amount: parseFloat(coverageAmount),
          premium: pricing.total_premium || assessment.premium || 0,
          classification: assessment.classification,
        }),
      });

      if (!res.ok) throw new Error('Policy creation failed');
      const data = await res.json();
      setPurchaseResult({ policy_id: data.id || data.policy_id });
    } catch (e: any) {
      setPurchaseResult({ error: e.message });
    } finally {
      setPurchaseLoading(false);
    }
  };

  const isViable = assessment?.viable ?? assessment?.viability ?? false;
  const pricing: PricingBreakdown = assessment?.pricing || assessment?.pricing_breakdown || {};
  const totalPremium = pricing.total_premium ?? assessment?.premium ?? 0;
  const reserveReq = pricing.reserve_requirement ?? assessment?.reserve_requirement ?? 0;
  const confidenceLevel = pricing.confidence_level ?? assessment?.confidence_level ?? 0;

  return (
    <main className="min-h-screen bg-zinc-950 bg-dot-pattern">
      {/* Header */}
      <div className="bg-zinc-900/80 border-b border-zinc-800 sticky top-0 z-20 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-12">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-sm font-mono text-zinc-300 tracking-wide">PROTECTION PRODUCTS</span>
          </div>
          <span className="text-[10px] font-mono text-zinc-600">ActuaryOS Risk Engine</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Page Title */}
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-mono uppercase tracking-widest rounded border border-emerald-500/20 mb-3">
            Risk Assessment
          </div>
          <h1 className="text-xl font-semibold text-zinc-100">Protection Products</h1>
          <p className="text-xs font-mono text-zinc-500 mt-1">
            Assess risk, get actuarial pricing, and purchase protection coverage
          </p>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg px-4 py-3 text-rose-400 text-xs font-mono">
            {error}
          </div>
        )}

        {/* Assessment Form */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6 space-y-4">
          <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 mb-2">Assessment Form</div>

          {/* Concern */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 block mb-1.5">
              Risk Concern
            </label>
            <textarea
              value={concern}
              onChange={(e) => setConcern(e.target.value)}
              placeholder="Describe the risk you want protection against..."
              rows={3}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm font-mono text-zinc-200 focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 resize-none"
            />
          </div>

          {/* Coverage Amount + Pool */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 block mb-1.5">
                Coverage Amount
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 text-sm font-mono">$</span>
                <input
                  type="number"
                  value={coverageAmount}
                  onChange={(e) => setCoverageAmount(e.target.value)}
                  placeholder="10,000"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded pl-7 pr-3 py-2 text-sm font-mono text-zinc-200 focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 block mb-1.5">
                Pool
              </label>
              <select
                value={selectedPool}
                onChange={(e) => setSelectedPool(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm font-mono text-zinc-200 focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50"
              >
                {pools.map((p) => (
                  <option key={p.id} value={p.id}>{p.name || p.id}</option>
                ))}
                {pools.length === 0 && <option value="">No pools available</option>}
              </select>
            </div>
          </div>

          {/* Assess Button */}
          <button
            onClick={handleAssess}
            disabled={assessLoading || !concern || !coverageAmount}
            className="w-full py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-xs font-mono uppercase tracking-wider text-zinc-300 hover:text-emerald-400 hover:border-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {assessLoading ? <Spinner /> : null}
            Assess Risk
          </button>
        </div>

        {/* Assessment Results */}
        {assessment && (
          <div className="space-y-4">
            {/* Classification + Viability */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
              <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 mb-4">Assessment Results</div>

              <div className="flex flex-wrap items-center gap-4 mb-6">
                {assessment.classification && (
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 mb-2">Classification</div>
                    <ClassificationBadge classification={assessment.classification} />
                  </div>
                )}

                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 mb-2">Viability</div>
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-mono uppercase tracking-wider rounded border ${
                    isViable
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                  }`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${isViable ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                    {isViable ? 'Viable' : 'Not Viable'}
                  </span>
                </div>
              </div>

              {/* Pricing Breakdown */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 space-y-3">
                <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 mb-2">Pricing Breakdown</div>

                <div className="space-y-2">
                  {[
                    { label: 'Expected Loss', value: pricing.expected_loss },
                    { label: 'Risk Load', value: pricing.risk_load },
                    { label: 'Expense Load', value: pricing.expense_load },
                    { label: 'Buffer Load', value: pricing.buffer_load },
                  ].filter(item => item.value !== undefined).map((item) => (
                    <div key={item.label} className="flex items-center justify-between py-1.5 border-b border-zinc-800/50">
                      <span className="text-xs font-mono text-zinc-500">{item.label}</span>
                      <span className="text-xs font-mono text-zinc-300">
                        ${(item.value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}

                  {/* Total Premium - highlighted */}
                  <div className="flex items-center justify-between pt-3 mt-2 border-t border-zinc-700">
                    <span className="text-xs font-mono text-zinc-300 uppercase tracking-wider">Total Premium</span>
                    <span className="text-2xl font-mono font-semibold text-emerald-400">
                      ${totalPremium.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* Reserve Requirement */}
                {reserveReq > 0 && (
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs font-mono text-zinc-500">Reserve Requirement</span>
                    <span className="text-sm font-mono text-amber-400">
                      ${reserveReq.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}

                {/* Confidence Level */}
                {confidenceLevel > 0 && (
                  <div className="pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono text-zinc-500">Confidence Level</span>
                      <span className="text-xs font-mono text-emerald-400">
                        {(confidenceLevel * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                        style={{ width: `${confidenceLevel * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Purchase Button */}
            {isViable && (
              <button
                onClick={handlePurchase}
                disabled={purchaseLoading}
                className="w-full py-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-sm font-mono uppercase tracking-wider text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 glow-emerald"
              >
                {purchaseLoading ? <Spinner /> : null}
                Purchase Protection
              </button>
            )}

            {/* Purchase Result */}
            {purchaseResult && (
              <div className={`rounded-lg px-5 py-4 text-xs font-mono ${
                purchaseResult.error
                  ? 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
                  : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
              }`}>
                {purchaseResult.error ? (
                  <>Error: {purchaseResult.error}</>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      <span className="text-sm">Protection purchased successfully</span>
                    </div>
                    <div className="flex items-center justify-between bg-zinc-900/50 rounded px-3 py-2 mt-2">
                      <span className="text-zinc-500">Policy ID</span>
                      <span className="text-emerald-400 font-mono">{purchaseResult.policy_id}</span>
                    </div>
                    <div className="flex items-center justify-between bg-zinc-900/50 rounded px-3 py-2">
                      <span className="text-zinc-500">Premium Paid</span>
                      <span className="text-emerald-400 font-mono">
                        ${totalPremium.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between bg-zinc-900/50 rounded px-3 py-2">
                      <span className="text-zinc-500">Coverage</span>
                      <span className="text-emerald-400 font-mono">
                        ${parseFloat(coverageAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-zinc-900 pt-6 text-center">
          <p className="text-[10px] font-mono text-zinc-700">ActuaryOS Protection Products &bull; Powered by ActuaryAI Risk Engine</p>
        </div>
      </div>
    </main>
  );
}

export default function ProtectionPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Spinner /></div>}>
      <ProtectionPageInner />
    </Suspense>
  );
}
