'use client';

import { useRef, useEffect } from 'react';
import { Target, ChevronDown, ChevronUp } from 'lucide-react';
import { HedgeBet } from '@/lib/types';
import { PriceChart } from './PriceChart';

interface Props {
  bet: HedgeBet;
  className?: string;
  onUpdateAllocation?: (value: number) => void;
  totalBudget?: number;
  isExpanded?: boolean;
  onToggle?: () => void;
}

export function MarketCard({ bet, className = '', onUpdateAllocation, totalBudget, isExpanded = false, onToggle }: Props) {
  const { market, outcome, allocation, allocation_percent, current_price, potential_payout, payout_multiplier } = bet;
  const cardRef = useRef<HTMLDivElement>(null);
  const wasExpandedRef = useRef(isExpanded);
  const expandedHeightRef = useRef<number>(0);

  useEffect(() => {
    if (!cardRef.current) return;

    if (!wasExpandedRef.current && isExpanded) {
      setTimeout(() => {
        if (cardRef.current) {
          expandedHeightRef.current = cardRef.current.offsetHeight;
          cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }
      }, 50);
    }

    if (wasExpandedRef.current && !isExpanded) {
      const card = cardRef.current;
      const rectBefore = card.getBoundingClientRect();
      setTimeout(() => {
        if (cardRef.current) {
          const rectAfter = cardRef.current.getBoundingClientRect();
          const heightDelta = rectBefore.height - rectAfter.height;
          if (heightDelta > 100) {
            cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          }
        }
      }, 320);
    }

    wasExpandedRef.current = isExpanded;
  }, [isExpanded]);

  const handleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('a') || (e.target as HTMLElement).closest('input[type="range"]')) return;
    if (onToggle) onToggle();
  };

  const isNo = outcome.toLowerCase() === 'no';

  return (
    <div
      ref={cardRef}
      className={`border border-zinc-800 rounded-lg p-4 transition-all duration-300 ease-in-out bg-zinc-900/50 cursor-pointer ${
        isExpanded ? 'ring-1 ring-emerald-500/30 border-zinc-700' : 'hover:border-zinc-700'
      } ${className}`}
      onClick={handleClick}
    >
      <div className="flex justify-between items-start gap-3">
        <div className="flex-1 min-w-0">
          <h4 className={`font-medium text-zinc-200 mb-1.5 transition-all duration-200 ${isExpanded ? 'text-base' : 'text-sm'}`}>
            <a
              href={`https://polymarket.com/event/${market.market.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-emerald-400 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              {market.market.question}
            </a>
          </h4>
          <p className={`text-xs text-zinc-500 ${isExpanded ? '' : 'line-clamp-1'}`}>
            {market.correlation_explanation}
          </p>
        </div>

        <div className="flex-shrink-0 mt-0.5">
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-emerald-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-zinc-600" />
          )}
        </div>
      </div>

      {/* Outcome Badge */}
      <div className={`mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono ${
        isNo ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
      }`}>
        <Target className="h-3 w-3" />
        <span className="font-semibold">{outcome}</span>
        <span className="text-zinc-500">@</span>
        <span>{(current_price * 100).toFixed(0)}%</span>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-zinc-800">
        <div>
          <span className="text-[10px] font-mono text-zinc-600 uppercase block mb-0.5">Alloc</span>
          <p className="text-sm font-mono font-semibold text-zinc-300">
            ${allocation.toFixed(0)}
          </p>
          <p className="text-[10px] font-mono text-zinc-600">
            {totalBudget && totalBudget > 0 ? ((allocation / totalBudget) * 100).toFixed(1) : allocation_percent.toFixed(1)}%
          </p>
        </div>
        <div>
          <span className="text-[10px] font-mono text-zinc-600 uppercase block mb-0.5">Multi</span>
          <p className="text-sm font-mono font-semibold text-zinc-300">
            {payout_multiplier.toFixed(1)}x
          </p>
        </div>
        <div>
          <span className="text-[10px] font-mono text-zinc-600 uppercase block mb-0.5">Payout</span>
          <p className="text-sm font-mono font-semibold text-emerald-400">
            ${potential_payout.toFixed(0)}
          </p>
        </div>
      </div>

      {/* Expanded Content */}
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="mt-4 pt-4 border-t border-zinc-800 space-y-4">
          {/* Allocation Slider */}
          {onUpdateAllocation && totalBudget && (
            <div className="bg-zinc-800/50 p-4 rounded-lg border border-zinc-700" onClick={(e) => e.stopPropagation()}>
              <label className="block text-xs font-mono text-zinc-400 mb-2 uppercase tracking-wider">
                Adjust Allocation
              </label>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono text-zinc-600 w-8 text-right">$0</span>
                <input
                  type="range"
                  min="0"
                  max={totalBudget}
                  step={totalBudget / 100}
                  value={allocation}
                  onChange={(e) => onUpdateAllocation(parseFloat(e.target.value))}
                  className="flex-1 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
                <span className="text-[10px] font-mono text-zinc-600 w-16">${totalBudget.toFixed(0)}</span>
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-[10px] font-mono text-zinc-500">
                  ${allocation.toFixed(0)} ({((allocation / totalBudget) * 100).toFixed(1)}%)
                </span>
                <span className="text-[10px] font-mono text-emerald-500">
                  Payout: ${(allocation * (payout_multiplier || 1)).toFixed(0)}
                </span>
              </div>
            </div>
          )}

          {/* Price Chart */}
          <div onClick={(e) => e.stopPropagation()}>
            {(() => {
              const outcomeIdx = market.market.outcomes.findIndex(
                (o) => o.name.toLowerCase() === outcome.toLowerCase()
              );
              return <PriceChart marketId={market.market.id} outcomeIndex={outcomeIdx >= 0 ? outcomeIdx : 0} outcomeName={outcome} />;
            })()}
          </div>

          {/* Market Details */}
          <div className="bg-zinc-900 p-4 rounded-lg border border-zinc-800">
            <h5 className="text-xs font-mono text-zinc-400 uppercase tracking-wider mb-3">Market Details</h5>
            <div className="grid grid-cols-3 gap-3 text-xs font-mono">
              <div>
                <span className="text-zinc-600 block mb-0.5">Liquidity</span>
                <span className="text-zinc-300">${(market.market.liquidity || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
              <div>
                <span className="text-zinc-600 block mb-0.5">Volume</span>
                <span className="text-zinc-300">${(market.market.volume || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
              <div>
                <span className="text-zinc-600 block mb-0.5">24h Vol</span>
                <span className="text-zinc-300">${(market.market.volume_24hr || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
          </div>

          {market.market.description && (
            <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
              <p className="text-xs text-zinc-500 leading-relaxed">{market.market.description}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
