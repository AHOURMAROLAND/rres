import React, { useState, useEffect } from 'react';
import { Minus, Plus, Zap, Check, AlertCircle, ArrowUpRight, Keyboard, RefreshCw, Wallet, ShieldAlert } from 'lucide-react';
import { Bet, GameStatus, User } from '../types';
import { soundManager } from '../services/sound';

interface BetPanelProps {
  user: User;
  panelIndex: 0 | 1;
  bet: Bet | null;
  gameStatus: GameStatus;
  currentMultiplier: number;
  onPlaceBet: (panelIndex: 0 | 1, amount: number, autoCashout: number | null) => void;
  onCancelBet: (panelIndex: 0 | 1) => void;
  onCashout: (panelIndex: 0 | 1) => void;
  onOpenActivation: () => void;
  onOpenDeposit: () => void;
  onInsufficientBalance?: () => void;
}

const PRESET_AMOUNTS = [200, 500, 1000, 2000, 5000];

export const BetPanel: React.FC<BetPanelProps> = ({
  user,
  panelIndex,
  bet,
  gameStatus,
  currentMultiplier,
  onPlaceBet,
  onCancelBet,
  onCashout,
  onOpenActivation,
  onOpenDeposit,
  onInsufficientBalance,
}) => {
  const [amount, setAmount] = useState<number>(500);
  const [isAuto, setIsAuto] = useState<boolean>(false);
  const [autoCashoutValue, setAutoCashoutValue] = useState<number>(2.0);
  const [autoCashoutEnabled, setAutoCashoutEnabled] = useState<boolean>(false);
  const [autoBetEnabled, setAutoBetEnabled] = useState<boolean>(false);

  // Platform commission rate: 2.5% on net profit
  const COMMISSION_RATE = 0.025;

  // Calculate live cashout value if active
  const grossCashout = bet ? Math.floor(bet.amount * currentMultiplier) : 0;
  const grossProfit = bet ? Math.max(0, grossCashout - bet.amount) : 0;
  const platformFee = Math.round(grossProfit * COMMISSION_RATE);
  const netCashout = grossCashout - platformFee;

  const handleAmountChange = (val: number) => {
    soundManager.playClick();
    const clamped = Math.max(100, Math.min(100000, Math.round(val)));
    setAmount(clamped);
  };

  const handleQuickAmount = (delta: number) => {
    soundManager.playClick();
    setAmount((prev) => Math.max(100, Math.min(100000, prev + delta)));
  };

  const handleMultiply = (factor: number) => {
    soundManager.playClick();
    setAmount((prev) => Math.max(100, Math.min(100000, Math.round(prev * factor))));
  };

  const handleMainAction = () => {
    // 1. Mandatory deposit check: if balance <= 0, block game & open deposit
    if (user.balance <= 0) {
      soundManager.playClick();
      if (onInsufficientBalance) {
        onInsufficientBalance();
      } else {
        onOpenDeposit();
      }
      return;
    }

    // 2. If flying and active bet, CASHOUT!
    if (gameStatus === 'flying' && bet && bet.status === 'active') {
      onCashout(panelIndex);
      return;
    }

    // 3. If waiting and bet pending, CANCEL!
    if (gameStatus === 'waiting' && bet && bet.status === 'pending') {
      soundManager.playClick();
      onCancelBet(panelIndex);
      return;
    }

    // 4. If waiting and no bet, PLACE BET!
    if (gameStatus === 'waiting' && !bet) {
      if (user.balance < amount) {
        soundManager.playClick();
        if (onInsufficientBalance) {
          onInsufficientBalance();
        } else {
          onOpenDeposit();
        }
        return;
      }
      const targetCashout = (isAuto || autoCashoutEnabled) ? autoCashoutValue : null;
      onPlaceBet(panelIndex, amount, targetCashout);
    }
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if (panelIndex === 0 && (e.code === 'Space' || e.code === 'Enter')) {
        e.preventDefault();
        handleMainAction();
      } else if (panelIndex === 1 && (e.code === 'KeyC')) {
        e.preventDefault();
        handleMainAction();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [panelIndex, user.isActivated, user.balance, gameStatus, bet, amount, isAuto, autoCashoutEnabled, autoCashoutValue]);

  // Auto-Bet trigger
  useEffect(() => {
    if (autoBetEnabled && gameStatus === 'waiting' && !bet && user.isActivated && user.balance >= amount) {
      const timer = setTimeout(() => {
        const targetCashout = (isAuto || autoCashoutEnabled) ? autoCashoutValue : null;
        onPlaceBet(panelIndex, amount, targetCashout);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [autoBetEnabled, gameStatus, bet, user.isActivated, user.balance, amount, isAuto, autoCashoutEnabled, autoCashoutValue, panelIndex]);

  return (
    <div className="bg-[#0D121F] border border-slate-800 rounded-2xl p-3 sm:p-4 shadow-xl flex flex-col justify-between relative overflow-hidden">
      {/* Top Header: Panel Tag & Mode selector */}
      <div className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-800 text-slate-300 uppercase tracking-wider">
            Pari #{panelIndex + 1}
          </span>
          <span className="text-xs text-slate-400 hidden xs:inline">
            Mise min: 100 FCFA
          </span>
        </div>

        {/* Right side: Auto-Bet checkbox & Mode tabs */}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer select-none px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-300 hover:text-white transition-colors" title="Parier automatiquement à chaque tour">
            <input
              type="checkbox"
              checked={autoBetEnabled}
              onChange={(e) => {
                soundManager.playClick();
                setAutoBetEnabled(e.target.checked);
              }}
              className="rounded bg-slate-950 border-slate-700 text-orange-500 focus:ring-0 w-3.5 h-3.5 cursor-pointer accent-orange-500"
            />
            <span className="flex items-center gap-1 text-[10px] font-semibold">
              <RefreshCw className={`w-3 h-3 ${autoBetEnabled ? 'text-orange-400 animate-spin' : 'text-slate-500'}`} />
              <span className="hidden sm:inline">Pari Auto</span>
            </span>
          </label>

          {/* Manuel / Auto Tabs */}
          <div className="flex items-center p-0.5 rounded-lg bg-slate-900 border border-slate-800">
            <button
              onClick={() => setIsAuto(false)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                !isAuto
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Manuel
            </button>
            <button
              onClick={() => {
                setIsAuto(true);
                setAutoCashoutEnabled(true);
              }}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1 ${
                isAuto
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Zap className="w-3 h-3" />
              <span>Auto</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Controls Left / Big Action Button Right */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch">
        {/* Left Column: Stake Input and Quick Presets */}
        <div className="flex flex-col gap-2">
          {/* Amount field */}
          <div className="flex items-center bg-slate-950/80 border border-slate-700/80 rounded-xl px-2 py-1.5 focus-within:border-orange-500 transition-colors">
            <button
              onClick={() => handleQuickAmount(-100)}
              disabled={bet !== null || amount <= 100}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 cursor-pointer"
              title="-100 FCFA"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>

            <div className="flex-1 text-center px-1">
              <span className="text-[10px] uppercase font-semibold text-slate-400 block leading-none">
                Montant de la mise
              </span>
              <div className="flex items-center justify-center gap-1">
                <input
                  type="number"
                  min={100}
                  max={100000}
                  step={100}
                  disabled={bet !== null}
                  value={amount}
                  onChange={(e) => handleAmountChange(Number(e.target.value))}
                  className="w-24 font-mono-num font-bold text-base sm:text-lg text-white text-center bg-transparent border-none outline-none disabled:opacity-60"
                />
                <span className="text-xs text-orange-400 font-bold">FCFA</span>
              </div>
            </div>

            <button
              onClick={() => handleQuickAmount(100)}
              disabled={bet !== null || amount >= 100000}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 cursor-pointer"
              title="+100 FCFA"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Quick preset chips */}
          <div className="grid grid-cols-5 gap-1">
            {PRESET_AMOUNTS.map((val) => (
              <button
                key={val}
                disabled={bet !== null}
                onClick={() => handleAmountChange(val)}
                className={`py-1 rounded-lg text-[11px] font-mono-num font-semibold transition-all cursor-pointer ${
                  amount === val
                    ? 'bg-slate-700 text-orange-400 border border-orange-500/50'
                    : 'bg-slate-900/90 text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-800'
                } disabled:opacity-40`}
              >
                {val >= 1000 ? `${val / 1000}k` : val}
              </button>
            ))}
          </div>

          {/* Halve / Double buttons */}
          <div className="flex items-center gap-1.5">
            <button
              disabled={bet !== null}
              onClick={() => handleMultiply(0.5)}
              className="flex-1 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 text-[11px] font-mono-num font-semibold disabled:opacity-40"
            >
              1/2
            </button>
            <button
              disabled={bet !== null}
              onClick={() => handleMultiply(2)}
              className="flex-1 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 text-[11px] font-mono-num font-semibold disabled:opacity-40"
            >
              2X
            </button>
            <button
              disabled={bet !== null}
              onClick={() => handleAmountChange(Math.min(50000, user.balance || 1000))}
              className="flex-1 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 text-[11px] font-mono-num font-semibold disabled:opacity-40"
            >
              MAX
            </button>
          </div>

          {/* Auto Cashout settings */}
          {(isAuto || autoCashoutEnabled) && (
            <div className="flex items-center justify-between gap-2 p-1.5 rounded-xl bg-slate-950/60 border border-slate-800 mt-0.5">
              <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoCashoutEnabled}
                  disabled={bet !== null}
                  onChange={(e) => setAutoCashoutEnabled(e.target.checked)}
                  className="rounded border-slate-700 text-orange-500 focus:ring-orange-500 h-3.5 w-3.5"
                />
                <span className="text-[11px] font-medium">Auto Cashout</span>
              </label>

              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.1"
                  min="1.05"
                  max="100"
                  disabled={bet !== null || !autoCashoutEnabled}
                  value={autoCashoutValue}
                  onChange={(e) => setAutoCashoutValue(Math.max(1.05, Number(e.target.value)))}
                  className="w-16 px-1.5 py-0.5 rounded-md bg-slate-900 border border-slate-700 text-right font-mono-num font-bold text-xs text-white outline-none disabled:opacity-50"
                />
                <span className="text-xs text-slate-400 font-bold">x</span>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Dynamic Action Button */}
        <div className="flex flex-col justify-between">
          {/* Action Button State Engine */}
          {user.balance <= 0 ? (
            /* MANDATORY DEPOSIT: GAME BLOCKED BEFORE DEPOSIT */
            <button
              onClick={handleMainAction}
              className="w-full h-full min-h-[95px] rounded-2xl bg-gradient-to-br from-amber-600 via-orange-600 to-amber-700 hover:from-amber-500 hover:to-orange-500 text-white font-display font-extrabold text-base sm:text-lg flex flex-col items-center justify-center p-3 shadow-xl shadow-orange-600/30 transition-transform active:scale-95 cursor-pointer border border-amber-400/40"
            >
              <div className="flex items-center gap-1.5">
                <Wallet className="w-5 h-5 text-amber-300 animate-pulse" />
                <span>DÉPÔT OBLIGATOIRE</span>
              </div>
              <span className="text-xs font-mono-num text-amber-200 mt-1 font-semibold">
                Solde : 0 FCFA • Recharger pour jouer
              </span>
            </button>
          ) : user.balance < amount ? (
            /* INSUFFICIENT BALANCE FOR CURRENT STAKE */
            <button
              onClick={handleMainAction}
              className="w-full h-full min-h-[95px] rounded-2xl bg-gradient-to-br from-amber-900/90 via-orange-950 to-slate-900 hover:bg-amber-900 text-white font-display font-extrabold text-base sm:text-lg flex flex-col items-center justify-center p-3 shadow-xl border border-amber-500/50 transition-transform active:scale-95 cursor-pointer"
            >
              <div className="flex items-center gap-1.5 text-amber-300">
                <ShieldAlert className="w-5 h-5" />
                <span>SOLDE INSUFFISANT</span>
              </div>
              <span className="text-xs font-mono-num text-slate-300 mt-1">
                Recharger pour miser {amount.toLocaleString('fr-FR')} FCFA
              </span>
            </button>
          ) : gameStatus === 'flying' && bet && bet.status === 'active' ? (
            /* ACTIVE BET IN FLIGHT: HUGE CASHOUT BUTTON */
            <button
              onClick={handleMainAction}
              className="w-full h-full min-h-[95px] rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-white font-display font-black text-xl sm:text-2xl flex flex-col items-center justify-center p-3 shadow-xl shadow-emerald-500/40 border-2 border-emerald-300/40 transition-transform active:scale-95 cursor-pointer animate-pulse"
            >
              <div className="flex items-center gap-1 uppercase tracking-wider text-sm font-semibold opacity-90">
                <span>RETIRER MAINTENANT</span>
                <ArrowUpRight className="w-4 h-4" />
              </div>
              <div className="font-mono-num text-2xl sm:text-3xl mt-0.5 leading-none">
                {netCashout.toLocaleString('fr-FR')} <span className="text-sm font-sans">FCFA</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-mono-num opacity-80">
                  ({currentMultiplier.toFixed(2)}x • Net)
                </span>
                <span className="px-1.5 py-0.5 rounded bg-black/30 text-[9px] font-mono font-bold tracking-wider text-emerald-200">
                  [{panelIndex === 0 ? 'ESPACE' : 'TOUCHE C'}]
                </span>
              </div>
            </button>
          ) : gameStatus === 'waiting' && bet && bet.status === 'pending' ? (
            /* BET PLACED WAITING: CANCEL BUTTON */
            <button
              onClick={handleMainAction}
              className="w-full h-full min-h-[95px] rounded-2xl bg-red-950/70 hover:bg-red-900/80 border border-red-700/80 text-red-200 font-display font-bold text-base flex flex-col items-center justify-center p-3 transition-colors cursor-pointer"
            >
              <span className="text-xs uppercase tracking-widest text-red-400">Pari Enregistré</span>
              <span className="font-mono-num font-black text-lg text-white my-0.5">
                {bet.amount.toLocaleString('fr-FR')} FCFA
              </span>
              <span className="text-[11px] underline text-red-300">Annuler [{panelIndex === 0 ? 'ESPACE' : 'C'}]</span>
            </button>
          ) : gameStatus === 'crashed' && bet && bet.status === 'cashed_out' ? (
            /* WIN CONFIRMATION */
            <div className="w-full h-full min-h-[95px] rounded-2xl bg-emerald-950/70 border border-emerald-600/70 text-emerald-300 font-display flex flex-col items-center justify-center p-3 text-center">
              <div className="flex items-center gap-1 text-emerald-400 text-xs uppercase font-bold">
                <Check className="w-4 h-4" />
                <span>Gain Sécurisé</span>
              </div>
              <span className="font-mono-num font-black text-2xl text-white my-0.5">
                +{(bet.profit || 0).toLocaleString('fr-FR')} FCFA
              </span>
              <span className="text-[11px] text-emerald-400">
                Encaissé à {(bet.cashedOutAt || 1).toFixed(2)}x
              </span>
            </div>
          ) : gameStatus === 'crashed' && bet && bet.status === 'crashed' ? (
            /* LOSS MESSAGE */
            <div className="w-full h-full min-h-[95px] rounded-2xl bg-slate-900/90 border border-red-900/50 text-slate-300 font-display flex flex-col items-center justify-center p-3 text-center">
              <span className="text-xs uppercase tracking-wider text-red-400 font-bold">Avion Crashé</span>
              <span className="text-xs text-slate-400 mt-1 font-sans">
                Mise non retirée à temps
              </span>
            </div>
          ) : (
            /* DEFAULT: PLACE BET BUTTON */
            <button
              onClick={handleMainAction}
              disabled={gameStatus === 'flying'}
              className={`w-full h-full min-h-[95px] rounded-2xl font-display font-black text-lg sm:text-xl flex flex-col items-center justify-center p-3 transition-all cursor-pointer ${
                gameStatus === 'flying'
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                  : 'bg-gradient-to-br from-orange-500 via-orange-600 to-red-600 hover:from-orange-400 hover:to-red-500 text-white shadow-xl shadow-orange-600/30 border border-orange-400/40 active:scale-95'
              }`}
            >
              <span className="uppercase tracking-wide">
                {gameStatus === 'flying' ? 'VOL EN COURS' : 'PARIER'}
              </span>
              <span className="font-mono-num font-bold text-sm sm:text-base opacity-95 mt-0.5">
                {amount.toLocaleString('fr-FR')} FCFA
              </span>
              <div className="flex items-center gap-1.5 mt-1">
                {autoCashoutEnabled && (
                  <span className="text-[10px] font-mono-num opacity-80">
                    Auto: {autoCashoutValue.toFixed(2)}x
                  </span>
                )}
                <span className="px-1.5 py-0.5 rounded bg-black/30 text-[9px] font-mono font-bold tracking-wider text-white/80">
                  [{panelIndex === 0 ? 'ESPACE' : 'C'}]
                </span>
              </div>
            </button>
          )}

          {/* Subtext info: Platform fee & disclaimer */}
          <div className="mt-2 text-center">
            <span className="text-[10px] text-slate-400">
              Commission: <span className="text-slate-300 font-medium">2.5%</span> sur gains nets
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
