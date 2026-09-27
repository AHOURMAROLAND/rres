import React, { useState, useMemo } from 'react';
import { Users, ArrowUpRight, Flame, CheckCircle2, TrendingUp, Sparkles } from 'lucide-react';
import { LivePlayerBet, GameStatus } from '../types';

interface LiveBetsTabProps {
  bets: LivePlayerBet[];
  gameStatus: GameStatus;
  currentMultiplier: number;
}

export const LiveBetsTab: React.FC<LiveBetsTabProps> = ({ bets, gameStatus, currentMultiplier }) => {
  const [filter, setFilter] = useState<'all' | 'active' | 'cashed'>('all');

  const totalWagered = useMemo(() => bets.reduce((acc, b) => acc + b.betAmount, 0), [bets]);
  
  const totalWon = useMemo(() => {
    return bets
      .filter((b) => b.status === 'cashed_out' && b.winAmount)
      .reduce((acc, b) => acc + (b.winAmount || 0), 0);
  }, [bets]);

  const inFlightBets = useMemo(() => bets.filter((b) => b.status === 'betting'), [bets]);
  const cashedBets = useMemo(() => bets.filter((b) => b.status === 'cashed_out'), [bets]);

  const filteredBets = useMemo(() => {
    // Sort: user bets first, then cashed out (highest win first), then in-flight
    const sorted = [...bets].sort((a, b) => {
      if (a.isCurrentUser && !b.isCurrentUser) return -1;
      if (!a.isCurrentUser && b.isCurrentUser) return 1;
      if (a.status === 'cashed_out' && b.status !== 'cashed_out') return -1;
      if (a.status !== 'cashed_out' && b.status === 'cashed_out') return 1;
      return (b.winAmount || b.betAmount) - (a.winAmount || a.betAmount);
    });

    if (filter === 'active') return sorted.filter((b) => b.status === 'betting');
    if (filter === 'cashed') return sorted.filter((b) => b.status === 'cashed_out');
    return sorted;
  }, [bets, filter]);

  return (
    <div className="bg-[#0B0F19] rounded-2xl border border-slate-800 p-3 sm:p-4 flex flex-col h-full shadow-lg">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex items-center justify-center">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span className="absolute w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
          </div>
          <span className="font-display font-bold text-sm text-white flex items-center gap-1.5">
            <Users className="w-4 h-4 text-orange-400" />
            Tous les Paris en Direct
            <span className="px-1.5 py-0.2 rounded-md bg-orange-500/20 text-orange-400 text-xs font-mono-num font-bold">
              {bets.length} joueurs
            </span>
          </span>
        </div>

        {/* Global Volume Metrics */}
        <div className="flex items-center gap-4 text-xs">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block leading-tight">
              Mises en jeu
            </span>
            <span className="font-mono-num font-bold text-xs text-orange-400">
              {totalWagered.toLocaleString('fr-FR')} FCFA
            </span>
          </div>
          {totalWon > 0 && (
            <div className="border-l border-slate-800 pl-4">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block leading-tight">
                Gains distribués
              </span>
              <span className="font-mono-num font-bold text-xs text-emerald-400">
                +{totalWon.toLocaleString('fr-FR')} FCFA
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Sub-filters bar */}
      <div className="flex items-center justify-between gap-2 my-2.5">
        <div className="flex items-center gap-1 bg-slate-900/80 p-0.5 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={() => setFilter('all')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
              filter === 'all'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Tous ({bets.length})
          </button>
          <button
            onClick={() => setFilter('active')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 ${
              filter === 'active'
                ? 'bg-slate-800 text-amber-400 shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Flame className="w-3 h-3 text-amber-400" />
            En vol ({inFlightBets.length})
          </button>
          <button
            onClick={() => setFilter('cashed')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 ${
              filter === 'cashed'
                ? 'bg-slate-800 text-emerald-400 shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            Retirés ({cashedBets.length})
          </button>
        </div>

        {gameStatus === 'flying' && (
          <div className="text-[11px] font-mono-num font-bold text-amber-300 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
            Vol en direct : {currentMultiplier.toFixed(2)}x
          </div>
        )}
      </div>

      {/* Bets list table */}
      <div className="overflow-y-auto max-h-[380px] sm:max-h-[420px] pr-1 space-y-1.5 no-scrollbar">
        {filteredBets.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs">
            Aucun pari dans cette catégorie pour le moment.
          </div>
        ) : (
          filteredBets.map((b) => {
            const isCashed = b.status === 'cashed_out';
            const isCrashed = b.status === 'crashed';
            const isMe = Boolean(b.isCurrentUser);

            return (
              <div
                key={b.id}
                className={`flex items-center justify-between p-2 sm:p-2.5 rounded-xl text-xs transition-all ${
                  isMe
                    ? 'bg-gradient-to-r from-orange-950/40 via-slate-900 to-amber-950/30 border-2 border-orange-500/80 shadow-md shadow-orange-500/10 ring-1 ring-orange-400/50'
                    : isCashed
                    ? 'bg-emerald-950/25 border border-emerald-800/40 text-emerald-300'
                    : isCrashed
                    ? 'bg-slate-900/40 border border-slate-850 text-slate-400 opacity-65'
                    : 'bg-slate-900/80 border border-slate-800 text-slate-200 hover:border-slate-700'
                }`}
              >
                {/* User Avatar + Username */}
                <div className="flex items-center gap-2 min-w-0">
                  <div className="relative">
                    <span className="text-base shrink-0">{b.avatar}</span>
                    {isMe && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                    )}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`font-semibold truncate max-w-[100px] sm:max-w-[150px] ${
                        isMe ? 'text-orange-300 font-extrabold' : 'text-slate-200'
                      }`}>
                        {b.username}
                      </span>
                      {isMe && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-black uppercase tracking-wider bg-orange-500 text-white shrink-0">
                          VOUS
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Stake amount */}
                <div className="font-mono-num text-slate-300 text-right pr-2 shrink-0">
                  <span className="font-bold">{b.betAmount.toLocaleString('fr-FR')}</span>{' '}
                  <span className="text-[10px] text-slate-400">FCFA</span>
                </div>

                {/* Status / Win outcome */}
                <div className="text-right min-w-[95px] sm:min-w-[110px] shrink-0">
                  {isCashed ? (
                    <div className="flex flex-col items-end">
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono-num font-bold text-[11px] leading-tight flex items-center gap-0.5">
                        {b.cashoutMultiplier?.toFixed(2)}x
                        <ArrowUpRight className="w-2.5 h-2.5" />
                      </span>
                      <span className="font-mono-num font-bold text-xs text-white">
                        +{(b.winAmount || 0).toLocaleString('fr-FR')} F
                      </span>
                    </div>
                  ) : isCrashed ? (
                    <span className="px-2 py-0.5 rounded bg-red-950/40 text-red-400 font-semibold text-[10px] uppercase border border-red-900/30">
                      Non retiré
                    </span>
                  ) : gameStatus === 'flying' ? (
                    <div className="flex flex-col items-end">
                      <span className="text-[11px] text-amber-400 font-mono-num font-bold animate-pulse flex items-center gap-1">
                        <Flame className="w-3 h-3 text-orange-400" />
                        En vol...
                      </span>
                      <span className="font-mono-num text-[10px] text-slate-400">
                        val: ~{Math.floor(b.betAmount * currentMultiplier).toLocaleString('fr-FR')} F
                      </span>
                    </div>
                  ) : (
                    <span className="text-[11px] text-slate-400 font-mono-num">
                      Pari validé
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
