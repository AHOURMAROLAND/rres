import React, { useState } from 'react';
import { Trophy, Medal, Flame, Award, Globe } from 'lucide-react';
import { LeaderboardUser } from '../types';
import { INITIAL_LEADERBOARD } from '../services/storage';

export const LeaderboardTab: React.FC = () => {
  const [period, setPeriod] = useState<'day' | 'week' | 'all'>('day');

  const getRankBadge = (rank: number) => {
    if (rank === 1) {
      return (
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 text-slate-950 font-black text-xs flex items-center justify-center shadow-md shadow-yellow-500/30">
          1
        </div>
      );
    }
    if (rank === 2) {
      return (
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-200 to-slate-400 text-slate-950 font-black text-xs flex items-center justify-center">
          2
        </div>
      );
    }
    if (rank === 3) {
      return (
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-700 to-amber-900 text-amber-200 font-black text-xs flex items-center justify-center">
          3
        </div>
      );
    }
    return (
      <div className="w-6 h-6 rounded-full bg-slate-800 text-slate-400 font-bold text-xs flex items-center justify-center">
        {rank}
      </div>
    );
  };

  return (
    <div className="bg-[#0B0F19] rounded-2xl border border-slate-800 p-3 sm:p-4 flex flex-col h-full">
      {/* Header with period toggle */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-400" />
          <span className="font-display font-bold text-sm text-white">
            Classement des Meilleurs Pilotes
          </span>
        </div>

        <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs">
          <button
            onClick={() => setPeriod('day')}
            className={`px-2 py-0.5 rounded-md font-semibold transition-all ${
              period === 'day' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Aujourd'hui
          </button>
          <button
            onClick={() => setPeriod('week')}
            className={`px-2 py-0.5 rounded-md font-semibold transition-all ${
              period === 'week' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Semaine
          </button>
        </div>
      </div>

      {/* Leaderboard rows */}
      <div className="mt-2.5 overflow-y-auto max-h-[290px] pr-1 space-y-1.5 no-scrollbar">
        {INITIAL_LEADERBOARD.map((user) => (
          <div
            key={user.username}
            className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs hover:border-slate-700 transition-colors"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {getRankBadge(user.rank)}
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-white truncate max-w-[110px] sm:max-w-[140px]">
                  {user.username}
                </span>
                <span className="text-[10px] text-slate-400">{user.country}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-mono-num font-bold text-[11px]">
                  {user.highestMultiplier.toFixed(2)}x
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Record</span>
              </div>

              <div className="text-right min-w-[90px]">
                <span className="font-mono-num font-black text-sm text-emerald-400 block">
                  {user.totalWon.toLocaleString('fr-FR')} F
                </span>
                <span className="text-[10px] text-slate-400">Gains nets</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
