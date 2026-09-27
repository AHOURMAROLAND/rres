import React, { useState } from 'react';
import { History, TrendingUp } from 'lucide-react';
import { RoundHistoryItem } from '../types';

interface HistoryRibbonProps {
  rounds: RoundHistoryItem[];
  onSelectRound?: (round: RoundHistoryItem) => void;
}

export const HistoryRibbon: React.FC<HistoryRibbonProps> = ({ rounds }) => {
  const [filter, setFilter] = useState<'all' | '2x' | '10x'>('all');

  const filteredRounds = rounds.filter((r) => {
    if (filter === '2x') return r.crashMultiplier >= 2.0;
    if (filter === '10x') return r.crashMultiplier >= 10.0;
    return true;
  });

  const avgMultiplier = rounds.length > 0
    ? (rounds.slice(0, 20).reduce((acc, r) => acc + r.crashMultiplier, 0) / Math.min(20, rounds.length)).toFixed(2)
    : '1.00';

  const getBadgeStyle = (mult: number) => {
    if (mult >= 50.0) {
      return 'bg-gradient-to-r from-rose-950/90 to-red-900/70 text-rose-300 border-rose-500/60 shadow-sm shadow-rose-900/40 font-black';
    }
    if (mult >= 10.0) {
      return 'bg-gradient-to-r from-amber-950/90 to-yellow-900/60 text-amber-300 border-amber-500/60 shadow-sm shadow-amber-900/40 font-black';
    }
    if (mult >= 2.0) {
      return 'bg-purple-950/60 text-purple-300 border-purple-600/50 font-bold';
    }
    return 'bg-slate-900/90 text-sky-400 border-slate-800 font-semibold';
  };

  return (
    <div className="w-full max-w-full bg-[#070A12] border-b border-slate-800/80 px-2 sm:px-4 py-1.5 flex items-center gap-1.5 sm:gap-2 select-none overflow-hidden cursor-default">
      {/* Left indicator */}
      <div className="flex items-center gap-1 text-slate-400 text-xs font-bold shrink-0 pr-1.5 sm:pr-2 border-r border-slate-800">
        <History className="w-3.5 h-3.5 text-orange-400" />
        <span className="hidden sm:inline text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
          Historique
        </span>
      </div>

      {/* Quick filter pills */}
      <div className="flex items-center gap-0.5 sm:gap-1 shrink-0 pr-1.5 sm:pr-2 border-r border-slate-800">
        <button
          onClick={() => setFilter('all')}
          className={`px-1.5 sm:px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
            filter === 'all'
              ? 'bg-orange-500 text-white shadow-xs'
              : 'text-slate-400 hover:text-slate-200 bg-slate-900/60'
          }`}
        >
          Tous
        </button>
        <button
          onClick={() => setFilter('2x')}
          className={`px-1.5 sm:px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
            filter === '2x'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-slate-400 hover:text-slate-200 bg-slate-900/60'
          }`}
        >
          2x+
        </button>
        <button
          onClick={() => setFilter('10x')}
          className={`px-1.5 sm:px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
            filter === '10x'
              ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
              : 'text-slate-400 hover:text-slate-200 bg-slate-900/60'
          }`}
        >
          10x+
        </button>
      </div>

      {/* Multiplier chips scroll list - Purely informative, non-clickable */}
      <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 no-scrollbar scroll-smooth flex-1 min-w-0">
        {filteredRounds.slice(0, 35).map((round, idx) => (
          <div
            key={round.roundId + '-' + idx}
            title={`Vol #${round.roundId} • Multiplicateur : ${round.crashMultiplier.toFixed(2)}x`}
            className={`px-2 sm:px-2.5 py-0.5 rounded-md border text-xs font-mono-num shrink-0 flex items-center gap-1 cursor-default select-none pointer-events-none ${getBadgeStyle(
              round.crashMultiplier
            )}`}
          >
            <span>{round.crashMultiplier.toFixed(2)}x</span>
            {round.crashMultiplier >= 10.0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
            )}
          </div>
        ))}
      </div>

      {/* Right Stats (desktop / tablet) */}
      <div className="hidden sm:flex items-center gap-2 shrink-0 pl-1.5">
        <div
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-900/90 border border-slate-800 text-[10px] font-mono-num text-slate-400"
          title="Moyenne des 20 derniers vols"
        >
          <TrendingUp className="w-3 h-3 text-emerald-400" />
          <span>
            Moy : <strong className="text-slate-200 font-bold">{avgMultiplier}x</strong>
          </span>
        </div>
      </div>
    </div>
  );
};
