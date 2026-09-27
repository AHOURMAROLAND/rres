import React, { useState } from 'react';
import { History, ArrowUpRight, ArrowDownRight, Filter, TrendingUp, CheckCircle, XCircle } from 'lucide-react';
import { SavedBetRecord } from '../services/storage';
import { PlayerStats } from '../types';

interface HistoryTabProps {
  history: SavedBetRecord[];
  stats: PlayerStats;
}

export const HistoryTab: React.FC<HistoryTabProps> = ({ history, stats }) => {
  const [filter, setFilter] = useState<'all' | 'won' | 'lost'>('all');

  const filteredHistory = history.filter((item) => {
    if (filter === 'won') return item.won;
    if (filter === 'lost') return !item.won;
    return true;
  });

  const netBalanceProfit = stats.totalWon - stats.totalWagered;

  return (
    <div className="bg-[#0B0F19] rounded-2xl border border-slate-800 p-3 sm:p-4 flex flex-col h-full">
      {/* Stats Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pb-3 mb-3 border-b border-slate-800">
        <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
          <span className="text-[10px] text-slate-400 uppercase font-semibold block">Total Misé</span>
          <span className="font-mono-num font-bold text-sm text-white">
            {stats.totalWagered.toLocaleString('fr-FR')} <span className="text-[10px] text-slate-400">FCFA</span>
          </span>
        </div>

        <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
          <span className="text-[10px] text-slate-400 uppercase font-semibold block">Total Gagné</span>
          <span className="font-mono-num font-bold text-sm text-emerald-400">
            {stats.totalWon.toLocaleString('fr-FR')} <span className="text-[10px] text-slate-400">FCFA</span>
          </span>
        </div>

        <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
          <span className="text-[10px] text-slate-400 uppercase font-semibold block">Plus Gros Gain</span>
          <span className="font-mono-num font-bold text-sm text-orange-400">
            {stats.biggestWin > 0 ? stats.biggestWin.toLocaleString('fr-FR') : '0'} <span className="text-[10px] text-slate-400">FCFA</span>
          </span>
        </div>

        <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
          <span className="text-[10px] text-slate-400 uppercase font-semibold block">Meilleur Multi.</span>
          <span className="font-mono-num font-bold text-sm text-amber-300">
            {stats.biggestMultiplier > 0 ? stats.biggestMultiplier.toFixed(2) + 'x' : '-'}
          </span>
        </div>
      </div>

      {/* Filter Header */}
      <div className="flex items-center justify-between pb-2">
        <span className="font-display font-bold text-xs uppercase tracking-wider text-slate-400 flex items-center gap-1">
          <History className="w-3.5 h-3.5 text-orange-400" />
          Mes Derniers Paris ({filteredHistory.length})
        </span>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setFilter('all')}
            className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${
              filter === 'all' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Tous
          </button>
          <button
            onClick={() => setFilter('won')}
            className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${
              filter === 'won' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Gagnés
          </button>
          <button
            onClick={() => setFilter('lost')}
            className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${
              filter === 'lost' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Perdus
          </button>
        </div>
      </div>

      {/* History List */}
      <div className="overflow-y-auto max-h-[220px] pr-1 space-y-1.5 no-scrollbar">
        {filteredHistory.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            Aucun pari enregistré pour le moment. Placez un pari pour démarrer !
          </div>
        ) : (
          filteredHistory.map((item) => (
            <div
              key={item.id}
              className={`p-2 rounded-xl text-xs flex items-center justify-between border transition-colors ${
                item.won
                  ? 'bg-emerald-950/20 border-emerald-800/30 text-slate-200'
                  : 'bg-slate-900/60 border-slate-800 text-slate-400'
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`p-1.5 rounded-lg ${
                    item.won ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                  }`}
                >
                  {item.won ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                </div>
                <div>
                  <div className="font-semibold text-white">
                    Mise : <span className="font-mono-num font-bold">{item.amount.toLocaleString('fr-FR')} FCFA</span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono-num">
                    Tour {item.roundId} • {new Date(item.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>

              <div className="text-right">
                {item.won ? (
                  <>
                    <span className="font-mono-num font-bold text-xs text-emerald-400 block">
                      +{item.netProfit.toLocaleString('fr-FR')} FCFA
                    </span>
                    <span className="text-[10px] font-mono-num text-slate-400">
                      Encaissé à {item.cashoutMultiplier?.toFixed(2)}x (frais: {item.fee}F)
                    </span>
                  </>
                ) : (
                  <>
                    <span className="font-mono-num font-bold text-xs text-red-400 block">
                      -{item.amount.toLocaleString('fr-FR')} FCFA
                    </span>
                    <span className="text-[10px] text-slate-400">Crashé</span>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
