import React, { useState } from 'react';
import { X, ArrowDownCircle, ArrowUpCircle, CheckCircle2, Smartphone, ShieldCheck, CreditCard, Sparkles, Loader2, AlertCircle } from 'lucide-react';
import { PaymentMethod, User } from '../types';
import { soundManager } from '../services/sound';
import { AuthApi } from '../services/authApi';

interface DepositWithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onDepositSuccess: (amount: number, method?: PaymentMethod, phone?: string, serverTx?: any) => void;
  onWithdrawSuccess: (amount: number, method?: PaymentMethod, phone?: string, serverTx?: any) => void;
}

const PRESET_AMOUNTS = [1000, 2000, 5000, 10000, 25000];

export const DepositWithdrawModal: React.FC<DepositWithdrawModalProps> = ({
  isOpen,
  onClose,
  user,
  onDepositSuccess,
  onWithdrawSuccess,
}) => {
  const [tab, setTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [method, setMethod] = useState<PaymentMethod>('wave');
  const [amount, setAmount] = useState<number>(5000);
  const [phone, setPhone] = useState<string>(user.phoneOrEmail || '07 48 92 10 33');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleTabChange = (newTab: 'deposit' | 'withdraw') => {
    soundManager.playClick();
    setTab(newTab);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    soundManager.playClick();
    setErrorMessage(null);
    setSuccessMessage(null);

    // Validation
    const cleanAmount = Number(amount);
    if (isNaN(cleanAmount) || cleanAmount < 500) {
      setErrorMessage('Le montant minimum pour cette opération est de 500 FCFA.');
      return;
    }

    if (cleanAmount > 1000000) {
      setErrorMessage('Le montant maximum par transaction est de 1 000 000 FCFA.');
      return;
    }

    if (!phone || phone.trim().length < 6) {
      setErrorMessage('Veuillez renseigner un numéro de téléphone Mobile Money valide.');
      return;
    }

    if (tab === 'withdraw' && cleanAmount > user.balance) {
      setErrorMessage(`Solde insuffisant. Votre solde disponible est de ${user.balance.toLocaleString('fr-FR')} FCFA.`);
      return;
    }

    setIsProcessing(true);

    try {
      if (tab === 'deposit') {
        let serverTx: any = null;
        if (AuthApi.isLoggedIn()) {
          const res = await AuthApi.deposit(cleanAmount, method, phone.trim());
          if (!res.success) {
            setErrorMessage(res.message || 'Échec du dépôt. Veuillez vérifier vos informations.');
            setIsProcessing(false);
            return;
          }
          serverTx = (res as any).transaction;
        }

        setIsProcessing(false);
        soundManager.playCashout();
        onDepositSuccess(cleanAmount, method, phone.trim(), serverTx);
        setSuccessMessage(`Dépôt de ${cleanAmount.toLocaleString('fr-FR')} FCFA validé avec succès ! Jeu débloqué.`);
      } else {
        let serverTx: any = null;
        if (AuthApi.isLoggedIn()) {
          const res = await AuthApi.withdraw(cleanAmount, method, phone.trim());
          if (!res.success) {
            setErrorMessage(res.message || 'Échec du retrait. Veuillez vérifier vos informations.');
            setIsProcessing(false);
            return;
          }
          serverTx = (res as any).transaction;
        }

        setIsProcessing(false);
        soundManager.playCashout();
        onWithdrawSuccess(cleanAmount, method, phone.trim(), serverTx);
        setSuccessMessage(`Retrait de ${cleanAmount.toLocaleString('fr-FR')} FCFA transféré vers votre compte ${method.toUpperCase()} !`);
      }

      setTimeout(() => {
        setSuccessMessage(null);
        onClose();
      }, 1400);
    } catch (err: any) {
      setIsProcessing(false);
      setErrorMessage(err?.message || 'Erreur réseau ou communication impossible avec le serveur.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
      <div className="relative w-full max-w-md bg-[#0E1322] border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col my-auto">
        {/* Top Header */}
        <div className="p-4 sm:p-5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-slate-800 text-emerald-400">
              {tab === 'deposit' ? <ArrowDownCircle className="w-5 h-5" /> : <ArrowUpCircle className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="font-display font-bold text-lg text-white">
                Portefeuille FCFA
              </h2>
              <p className="text-xs text-slate-400">
                Solde actuel : <span className="text-emerald-400 font-mono-num font-bold">{user.balance.toLocaleString('fr-FR')} FCFA</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switch: Deposit vs Withdraw */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 p-1 shrink-0">
          <button
            onClick={() => handleTabChange('deposit')}
            className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              tab === 'deposit'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ArrowDownCircle className="w-4 h-4" />
            <span>Recharger (Dépôt)</span>
          </button>
          <button
            onClick={() => handleTabChange('withdraw')}
            className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              tab === 'withdraw'
                ? 'bg-orange-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ArrowUpCircle className="w-4 h-4" />
            <span>Retirer des gains</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto">
          {/* Error Message Box */}
          {errorMessage && (
            <div className="mb-4 p-3 rounded-xl bg-red-950/80 border border-red-700/60 text-red-200 text-xs flex items-start gap-2.5 animate-shake shadow-lg">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span className="leading-relaxed font-medium">{errorMessage}</span>
            </div>
          )}

          {successMessage ? (
            <div className="py-8 flex flex-col items-center text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center animate-bounce">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <p className="text-sm font-bold text-white max-w-xs">{successMessage}</p>
              <p className="text-xs text-slate-400">Mise à jour immédiate du portefeuille</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Operator choices */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Opérateur Mobile Money
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['wave', 'orange_money', 'mtn', 'moov'] as PaymentMethod[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => { soundManager.playClick(); setMethod(m); }}
                      className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                        method === m
                          ? 'bg-orange-950/60 border-orange-500 text-orange-400 font-bold'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      <span className="text-xs uppercase font-extrabold">
                        {m === 'wave' ? 'Wave' : m === 'orange_money' ? 'Orange' : m === 'mtn' ? 'MTN' : 'Moov'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Montant en FCFA
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={500}
                    max={1000000}
                    step={100}
                    required
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className="w-full pl-4 pr-16 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-lg font-mono-num font-bold text-white outline-none focus:border-orange-500"
                  />
                  <span className="absolute right-4 top-3 text-xs text-orange-400 font-bold">
                    FCFA
                  </span>
                </div>

                {/* Quick preset buttons */}
                <div className="grid grid-cols-5 gap-1.5 mt-2">
                  {PRESET_AMOUNTS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => { soundManager.playClick(); setAmount(p); }}
                      className={`py-1 rounded-lg text-xs font-mono-num font-semibold border cursor-pointer transition-all ${
                        amount === p
                          ? 'bg-slate-800 text-orange-400 border-orange-500'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      {p >= 1000 ? `${p / 1000}k` : p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Phone number */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Numéro de compte Mobile Money
                </label>
                <div className="relative">
                  <Smartphone className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="07 00 00 00 00"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm font-mono-num font-semibold text-white outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Submit CTA */}
              <button
                type="submit"
                disabled={isProcessing}
                className={`w-full py-3 rounded-2xl font-display font-black text-base shadow-xl flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98 ${
                  tab === 'deposit'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
                    : 'bg-orange-600 hover:bg-orange-500 text-white shadow-orange-600/30'
                }`}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Traitement en cours...</span>
                  </>
                ) : (
                  <span>
                    {tab === 'deposit'
                      ? `Recharger ${amount.toLocaleString('fr-FR')} FCFA`
                      : `Retirer ${amount.toLocaleString('fr-FR')} FCFA`}
                  </span>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
