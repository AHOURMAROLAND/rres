import React from 'react';
import { Plane, Volume2, VolumeX, Wallet, User as UserIcon, PlusCircle, CheckCircle2, RefreshCw, Sparkles, LogOut } from 'lucide-react';
import { User, GameMode } from '../types';
import { soundManager } from '../services/sound';

interface NavbarProps {
  user: User;
  gameMode: GameMode;
  demoBalance: number;
  soundEnabled: boolean;
  onToggleGameMode: (mode: GameMode) => void;
  onResetDemoBalance: () => void;
  onToggleSound: () => void;
  onOpenActivation: () => void;
  onOpenDeposit: () => void;
  onOpenResponsibleGaming?: () => void;
  onOpenAuth: () => void;
  onLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  gameMode,
  demoBalance,
  soundEnabled,
  onToggleGameMode,
  onResetDemoBalance,
  onToggleSound,
  onOpenActivation,
  onOpenDeposit,
  onOpenAuth,
  onLogout,
}) => {
  return (
    <header className="w-full max-w-full bg-[#080C15]/95 backdrop-blur-md border-b border-slate-800/80 sticky top-0 z-30 px-3 sm:px-4 md:px-6 py-2.5 select-none shadow-md shadow-black/40">
      {/* ========================================================= */}
      {/* 1. MOBILE HEADER (Screens < 768px / md) - 2 ROWS LAYOUT  */}
      {/* ========================================================= */}
      <div className="flex md:hidden flex-col gap-2 w-full">
        {/* ROW 1: Logo à gauche + Outils / Profil à droite */}
        <div className="flex items-center justify-between w-full">
          {/* Brand Logo */}
          <div
            className="flex items-center gap-2 cursor-pointer group shrink-0"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 via-red-500 to-amber-600 flex items-center justify-center shadow-md shadow-orange-500/25 shrink-0 border border-orange-400/30 group-active:scale-95 transition-transform">
              <Plane className="w-4 h-4 text-white transform -rotate-12" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-display font-black text-lg tracking-wider text-white whitespace-nowrap">
                AERO<span className="text-orange-500">CRASH</span>
              </span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1" />
                LIVE
              </span>
            </div>
          </div>

          {/* Right Tools: Sound Toggle, User Profile & Logout */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Sound toggle */}
            <button
              onClick={onToggleSound}
              className="w-8 h-8 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 flex items-center justify-center text-slate-300 transition-colors cursor-pointer active:scale-95 shadow-inner"
              title={soundEnabled ? 'Désactiver le son' : 'Activer le son'}
              aria-label="Activer ou désactiver les effets sonores"
            >
              {soundEnabled ? (
                <Volume2 className="w-4 h-4 text-orange-400" />
              ) : (
                <VolumeX className="w-4 h-4 text-slate-500" />
              )}
            </button>

            {/* User Profile Button & Logout */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={onOpenAuth}
                className="flex items-center gap-1.5 h-8 px-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-slate-200 transition-colors shrink-0 cursor-pointer active:scale-95 shadow-inner"
                title="Mon profil et historique"
              >
                <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 border border-slate-700 flex items-center justify-center text-slate-300">
                  <UserIcon className="w-3 h-3" />
                </div>
                <span className="text-xs font-bold text-slate-200 max-w-[75px] truncate">
                  {user.name.split(' ')[0]}
                </span>
              </button>
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="w-8 h-8 rounded-xl bg-slate-900/90 hover:bg-red-950/60 border border-slate-800 hover:border-red-800/80 text-slate-400 hover:text-red-400 flex items-center justify-center transition-colors cursor-pointer active:scale-95 shadow-inner shrink-0"
                  title="Se déconnecter"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ROW 2: Segmented Mode Switcher + Balance Card & Action Button */}
        <div className="flex items-center justify-between w-full gap-2 pt-1.5 border-t border-slate-800/60">
          {/* Segmented Mode Switcher */}
          <div className="flex items-center p-0.5 rounded-xl bg-[#0B0F1A] border border-slate-800/90 shadow-inner shrink-0">
            <button
              onClick={() => {
                soundManager.playClick();
                onToggleGameMode('real');
              }}
              className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                gameMode === 'real'
                  ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-white shadow-sm shadow-orange-600/30 font-extrabold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {gameMode === 'real' && (
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              )}
              <span>Réel</span>
            </button>
            <button
              onClick={() => {
                soundManager.playClick();
                onToggleGameMode('demo');
              }}
              className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                gameMode === 'demo'
                  ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30 font-extrabold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {gameMode === 'demo' && (
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              )}
              <span>Démo</span>
            </button>
          </div>

          {/* Solde & Action Button */}
          <div className="flex items-center gap-1.5 shrink-0">
            {gameMode === 'demo' ? (
              /* Solde Démo Mobile */
              <div className="flex items-center bg-sky-950/50 border border-sky-600/40 rounded-xl py-1 px-2.5 gap-2 shadow-inner">
                <Wallet className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="font-mono-num font-extrabold text-xs text-sky-300 whitespace-nowrap">
                  {demoBalance.toLocaleString('fr-FR')}{' '}
                  <span className="text-[10px] text-sky-400 font-sans">FCFA</span>
                </span>
                <button
                  onClick={onResetDemoBalance}
                  className="p-1 rounded-lg bg-sky-600/30 text-sky-200 hover:bg-sky-500/50 cursor-pointer border border-sky-500/30 ml-0.5 active:scale-95"
                  title="Réinitialiser le solde d'entraînement (50 000 FCFA)"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
            ) : (
              /* Solde Réel Mobile */
              <div className="flex items-center gap-1.5">
                <div className={`flex items-center rounded-xl py-1 px-2.5 gap-1.5 shadow-inner ${
                  user.balance > 0 
                    ? 'bg-slate-900/90 border border-slate-700/80 text-emerald-400' 
                    : 'bg-amber-950/40 border border-amber-500/40 text-amber-300'
                }`}>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${user.balance > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                  <span className="font-mono-num font-extrabold text-xs whitespace-nowrap">
                    {user.balance.toLocaleString('fr-FR')}{' '}
                    <span className="text-[10px] opacity-75 font-sans">FCFA</span>
                  </span>
                </div>
                <button
                  onClick={onOpenDeposit}
                  className="flex items-center gap-1 px-3 py-1 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-emerald-950/60 cursor-pointer active:scale-95 whitespace-nowrap"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Dépôt</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. DESKTOP HEADER (Screens >= 768px / md) - 1 ROW LAYOUT  */}
      {/* ========================================================= */}
      <div className="hidden md:flex items-center justify-between gap-4 max-w-7xl mx-auto w-full">
        {/* Left: Brand Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            className="flex items-center gap-2.5 cursor-pointer group select-none"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 via-red-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/25 group-hover:scale-105 transition-transform shrink-0 border border-orange-400/30">
              <Plane className="w-5 h-5 text-white transform -rotate-12 group-hover:rotate-0 transition-transform drop-shadow" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-display font-black text-xl tracking-wider text-white whitespace-nowrap">
                AERO<span className="text-orange-500">CRASH</span>
              </span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1" />
                LIVE
              </span>
            </div>
          </div>
        </div>

        {/* Center: Premium Segmented Mode Switcher (Réel vs Démo) */}
        <div className="flex items-center justify-center shrink-0">
          <div className="flex items-center p-1 rounded-xl bg-[#0B0F1A] border border-slate-800/90 shadow-inner">
            <button
              onClick={() => {
                soundManager.playClick();
                onToggleGameMode('real');
              }}
              className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                gameMode === 'real'
                  ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-white shadow-md shadow-orange-600/30 font-extrabold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {gameMode === 'real' && (
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              )}
              <span>Réel</span>
            </button>
            <button
              onClick={() => {
                soundManager.playClick();
                onToggleGameMode('demo');
              }}
              className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                gameMode === 'demo'
                  ? 'bg-sky-600 text-white shadow-md shadow-sky-600/30 font-extrabold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {gameMode === 'demo' && (
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              )}
              <span>Démo</span>
            </button>
          </div>
        </div>

        {/* Right: Wallet Balance, Deposit, Tools & Profile */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Wallet Balance Display based on active mode */}
          {gameMode === 'demo' ? (
            /* DEMO WALLET */
            <div className="flex items-center bg-sky-950/50 border border-sky-600/40 rounded-xl p-1 px-3 shadow-inner">
              <div className="flex items-center gap-2 mr-2.5">
                <Wallet className="w-4 h-4 text-sky-400 shrink-0" />
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase tracking-wider text-sky-300/80 font-bold leading-none">
                    Solde Démo
                  </span>
                  <span className="font-mono-num font-extrabold text-sm text-sky-300 leading-tight whitespace-nowrap">
                    {demoBalance.toLocaleString('fr-FR')}{' '}
                    <span className="text-xs text-sky-400/80 font-sans">FCFA</span>
                  </span>
                </div>
              </div>

              {/* Reset demo balance button */}
              <button
                onClick={onResetDemoBalance}
                className="p-1.5 rounded-lg bg-sky-600/30 hover:bg-sky-500/50 text-sky-200 text-xs transition-colors cursor-pointer border border-sky-500/30 active:scale-95"
                title="Réinitialiser le solde d'entraînement (50 000 FCFA)"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            /* REAL WALLET: ALWAYS CLEARLY SHOW BALANCE + DEPOSIT BUTTON */
            <div className={`flex items-center rounded-xl p-1 px-3 shadow-inner gap-2.5 ${
              user.balance > 0
                ? 'bg-slate-900/90 border border-slate-700/80'
                : 'bg-gradient-to-r from-slate-900 via-amber-950/30 to-slate-900 border border-amber-500/40'
            }`}>
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
                  user.balance > 0
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                }`}>
                  <Wallet className="w-3.5 h-3.5" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold leading-none">
                    Solde Réel
                  </span>
                  <span className={`font-mono-num font-extrabold text-sm leading-tight whitespace-nowrap ${
                    user.balance > 0 ? 'text-emerald-400' : 'text-amber-300'
                  }`}>
                    {user.balance.toLocaleString('fr-FR')}{' '}
                    <span className="text-xs text-slate-400 font-sans">FCFA</span>
                  </span>
                </div>
              </div>

              {/* Deposit button */}
              <button
                onClick={onOpenDeposit}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-emerald-950/60 cursor-pointer active:scale-95 whitespace-nowrap"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Dépôt</span>
              </button>
            </div>
          )}

          {/* Sound mute/unmute toggle */}
          <button
            onClick={onToggleSound}
            className="w-9 h-9 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer active:scale-95 shadow-inner"
            title={soundEnabled ? 'Désactiver le son' : 'Activer le son'}
            aria-label="Activer ou désactiver les effets sonores"
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 text-orange-400" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-500" />
            )}
          </button>

          {/* User Profile Button & Quick Logout */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={onOpenAuth}
              className="flex items-center gap-2 h-9 px-3 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-slate-200 transition-colors shrink-0 cursor-pointer active:scale-95 shadow-inner"
              title="Mon profil et historique"
            >
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 border border-slate-700 flex items-center justify-center text-slate-300 text-xs">
                <UserIcon className="w-3.5 h-3.5" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-xs font-bold leading-tight truncate max-w-[85px] text-slate-200">
                  {user.name}
                </span>
                <span className="text-[10px] leading-tight">
                  {gameMode === 'demo' ? (
                    <span className="text-sky-400 font-semibold">Démo</span>
                  ) : user.isActivated ? (
                    <span className="text-emerald-400 font-semibold flex items-center gap-0.5">
                      <CheckCircle2 className="w-2.5 h-2.5" /> Actif
                    </span>
                  ) : (
                    <span className="text-amber-400 font-semibold">En attente</span>
                  )}
                </span>
              </div>
            </button>
            {onLogout && (
              <button
                onClick={onLogout}
                className="w-9 h-9 rounded-xl bg-slate-900/90 hover:bg-red-950/60 border border-slate-800 hover:border-red-800/80 text-slate-400 hover:text-red-400 flex items-center justify-center transition-colors cursor-pointer active:scale-95 shadow-inner shrink-0"
                title="Se déconnecter (retour à l'inscription)"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
