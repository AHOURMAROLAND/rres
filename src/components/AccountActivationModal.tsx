import React, { useState } from 'react';
import { X, CheckCircle2, ShieldCheck, Smartphone, CreditCard, Sparkles, ArrowRight, Loader2, Receipt, FileText } from 'lucide-react';
import { PaymentMethod, User } from '../types';
import { soundManager } from '../services/sound';
import { PaymentLogo } from './PaymentLogos';
import { TransactionReceiptModal } from './TransactionReceiptModal';

interface AccountActivationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onActivateSuccess: () => void;
  user: User;
}

export const AccountActivationModal: React.FC<AccountActivationModalProps> = ({
  isOpen,
  onClose,
  onActivateSuccess,
  user,
}) => {
  const [method, setMethod] = useState<PaymentMethod>('wave');
  const [phoneNumber, setPhoneNumber] = useState<string>(user.phoneOrEmail || '07 48 92 10 33');
  const [countryCode, setCountryCode] = useState<string>('+225');
  const [step, setStep] = useState<'form' | 'processing' | 'success'>('form');
  const [txRef, setTxRef] = useState<string>('');
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  if (!isOpen) return null;

  const handleStartPayment = (e: React.FormEvent) => {
    e.preventDefault();
    soundManager.playClick();
    setStep('processing');

    const generatedRef = 'ACT-' + Math.floor(100000 + Math.random() * 900000);
    setTxRef(generatedRef);

    // Simulate realistic mobile money validation
    setTimeout(() => {
      soundManager.playCashout();
      setStep('success');
      onActivateSuccess();
    }, 2400);
  };

  const getMethodName = (m: PaymentMethod) => {
    switch (m) {
      case 'wave': return 'Wave Mobile Money';
      case 'orange_money': return 'Orange Money';
      case 'mtn': return 'MTN MoMo';
      case 'moov': return 'Moov Money';
      case 'card': return 'Carte Bancaire Visa / Mastercard';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
      <div className="relative w-full max-w-lg bg-[#0E1322] border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col my-auto">
        {/* Header */}
        <div className="p-4 sm:p-6 bg-gradient-to-r from-orange-600/20 via-amber-600/10 to-transparent border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/30 shrink-0">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-display font-black text-lg sm:text-xl text-white">
                Activation du Compte
              </h2>
              <p className="text-xs text-slate-400">
                Paiement unique de sécurité • Accès jeu illimité
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

        {/* Content Body based on step */}
        <div className="p-4 sm:p-6 overflow-y-auto">
          {step === 'form' && (
            <form onSubmit={handleStartPayment} className="space-y-4">
              {/* Value proposition pill */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-orange-500/15 via-amber-500/10 to-slate-900 border border-orange-500/30 flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
                <div className="text-xs text-slate-300 space-y-1">
                  <div className="font-bold text-white text-sm">
                    Frais d'activation : <span className="text-orange-400 font-mono-num font-black">2 000 FCFA</span>
                  </div>
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    L'activation est nécessaire pour sécuriser les retraits et valider l'accès au multiplicateur en direct. En cadeau d'accueil, un solde de <strong className="text-emerald-400">3 000 FCFA</strong> est immédiatement crédité dans votre portefeuille !
                  </p>
                </div>
              </div>

              {/* Payment Methods Grid */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Choisissez votre moyen de paiement
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {/* Wave */}
                  <button
                    type="button"
                    onClick={() => { soundManager.playClick(); setMethod('wave'); }}
                    className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                      method === 'wave'
                        ? 'bg-sky-950/60 border-sky-400 text-white shadow-md shadow-sky-500/20'
                        : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <PaymentLogo method="wave" size="sm" className="shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-white">Wave</span>
                        {method === 'wave' && <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" />}
                      </div>
                      <span className="text-[10px] text-slate-400">Mobile Money (0% frais)</span>
                    </div>
                  </button>

                  {/* Orange Money */}
                  <button
                    type="button"
                    onClick={() => { soundManager.playClick(); setMethod('orange_money'); }}
                    className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                      method === 'orange_money'
                        ? 'bg-orange-950/60 border-orange-500 text-white shadow-md shadow-orange-500/20'
                        : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <PaymentLogo method="orange_money" size="sm" className="shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-white">Orange Money</span>
                        {method === 'orange_money' && <CheckCircle2 className="w-3.5 h-3.5 text-orange-400" />}
                      </div>
                      <span className="text-[10px] text-slate-400">Maxit / Orange</span>
                    </div>
                  </button>

                  {/* MTN */}
                  <button
                    type="button"
                    onClick={() => { soundManager.playClick(); setMethod('mtn'); }}
                    className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                      method === 'mtn'
                        ? 'bg-yellow-950/60 border-yellow-400 text-white shadow-md shadow-yellow-500/20'
                        : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <PaymentLogo method="mtn" size="sm" className="shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-white">MTN MoMo</span>
                        {method === 'mtn' && <CheckCircle2 className="w-3.5 h-3.5 text-yellow-400" />}
                      </div>
                      <span className="text-[10px] text-slate-400">MTN Mobile Money</span>
                    </div>
                  </button>

                  {/* Moov */}
                  <button
                    type="button"
                    onClick={() => { soundManager.playClick(); setMethod('moov'); }}
                    className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                      method === 'moov'
                        ? 'bg-blue-950/60 border-blue-400 text-white shadow-md shadow-blue-500/20'
                        : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <PaymentLogo method="moov" size="sm" className="shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-white">Moov Money</span>
                        {method === 'moov' && <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />}
                      </div>
                      <span className="text-[10px] text-slate-400">Moov Flooz</span>
                    </div>
                  </button>

                  {/* Carte Bancaire */}
                  <button
                    type="button"
                    onClick={() => { soundManager.playClick(); setMethod('card'); }}
                    className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer col-span-2 sm:col-span-2 ${
                      method === 'card'
                        ? 'bg-indigo-950/60 border-indigo-400 text-white shadow-md shadow-indigo-500/20'
                        : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <PaymentLogo method="card" size="sm" className="shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-white">Carte Bancaire Visa / Mastercard</span>
                        {method === 'card' && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />}
                      </div>
                      <span className="text-[10px] text-slate-400">Sécurisé par 3D Secure</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Phone / Detail Input */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  {method === 'card' ? 'Numéro de Carte ou Mobile' : 'Numéro de Téléphone Mobile Money'}
                </label>
                <div className="flex gap-2">
                  <select
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    className="px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-slate-200 outline-none focus:border-orange-500"
                  >
                    <option value="+225">🇨🇮 +225 (CI)</option>
                    <option value="+221">🇸🇳 +221 (SN)</option>
                    <option value="+223">🇲🇱 +223 (ML)</option>
                    <option value="+226">🇧🇫 +226 (BF)</option>
                    <option value="+228">🇹🇬 +228 (TG)</option>
                    <option value="+229">🇧🇯 +229 (BJ)</option>
                    <option value="+237">🇨🇲 +237 (CM)</option>
                  </select>

                  <div className="relative flex-1">
                    <Smartphone className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="tel"
                      required
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="07 00 00 00 00"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm font-mono-num font-semibold text-white placeholder:text-slate-600 outline-none focus:border-orange-500"
                    />
                  </div>
                </div>
              </div>

              {/* Submit CTA */}
              <button
                type="submit"
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white font-display font-black text-base shadow-xl shadow-orange-600/30 flex items-center justify-center gap-2 cursor-pointer active:scale-98 transition-all"
              >
                <span>Payer 2 000 FCFA & Activer</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <p className="text-center text-[11px] text-slate-400">
                Paiement instantané simulé pour démonstration. Vous recevrez une validation instantanée.
              </p>
            </form>
          )}

          {step === 'processing' && (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-orange-500/20 border-t-orange-500 animate-spin flex items-center justify-center" />
                <Smartphone className="w-7 h-7 text-orange-400 absolute inset-0 m-auto animate-pulse" />
              </div>

              <div>
                <h3 className="font-display font-bold text-lg text-white">
                  Validation de la transaction en cours...
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                  Veuillez vérifier votre téléphone <span className="font-mono-num font-semibold text-slate-200">{countryCode} {phoneNumber}</span> et valider la demande de 2 000 FCFA.
                </p>
              </div>

              <div className="w-full max-w-xs bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div className="bg-orange-500 h-full w-2/3 animate-pulse rounded-full" />
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="py-4 flex flex-col items-center text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/20 animate-bounce">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <h3 className="font-display font-black text-xl text-white">
                  Compte Activé avec Succès !
                </h3>
                <p className="text-xs text-emerald-400 font-semibold mt-0.5">
                  Votre compte est maintenant vérifié et prêt pour le jeu
                </p>
              </div>

              {/* Digital receipt */}
              <div className="w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-4 text-left space-y-2 font-mono-num text-xs">
                <div className="flex items-center gap-1.5 text-slate-400 text-[11px] pb-2 border-b border-slate-800 font-sans">
                  <Receipt className="w-3.5 h-3.5 text-orange-400" />
                  <span className="font-bold uppercase tracking-wider">Reçu Officiel d'Activation</span>
                </div>

                <div className="flex justify-between py-1 text-slate-400">
                  <span>Référence :</span>
                  <span className="text-white font-bold">{txRef}</span>
                </div>
                <div className="flex justify-between py-1 text-slate-400">
                  <span>Opérateur :</span>
                  <span className="text-white capitalize">{getMethodName(method)}</span>
                </div>
                <div className="flex justify-between py-1 text-slate-400">
                  <span>Montant Débité :</span>
                  <span className="text-orange-400 font-bold">2 000 FCFA</span>
                </div>
                <div className="flex justify-between py-1 text-slate-400">
                  <span>Solde de Bienvenue Offert :</span>
                  <span className="text-emerald-400 font-bold">+3 000 FCFA</span>
                </div>
                <div className="flex justify-between py-1 text-slate-400 pt-1 border-t border-slate-800">
                  <span>Statut :</span>
                  <span className="text-emerald-400 font-bold uppercase">PAYÉ & ACTIF</span>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsReceiptOpen(true)}
                  className="w-full py-3 rounded-2xl bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-display font-extrabold text-sm flex items-center justify-center gap-2 shadow-xl shadow-orange-500/25 transition-all cursor-pointer"
                >
                  <FileText className="w-4 h-4" />
                  <span>Télécharger mon Reçu (Image PNG & PDF)</span>
                </button>

                <button
                  onClick={onClose}
                  className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-display font-bold text-sm shadow-xl shadow-emerald-600/30 cursor-pointer active:scale-98 transition-all"
                >
                  Accéder au Jeu Immédiatement
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Transaction Receipt Modal */}
      <TransactionReceiptModal
        isOpen={isReceiptOpen}
        onClose={() => setIsReceiptOpen(false)}
        transaction={{
          amount: 2000,
          reference: txRef,
          method,
          phoneNumber,
          type: 'activation',
          status: 'success',
          timestamp: Date.now(),
          balance: (user.balance || 0) + 3000,
        }}
        user={user}
      />
    </div>
  );
};
