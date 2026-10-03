import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
  Smartphone,
  CreditCard,
  Loader2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Globe,
  KeyRound,
  FileText,
} from 'lucide-react';
import { PaymentMethod, User } from '../types';
import { soundManager } from '../services/sound';
import { AuthApi } from '../services/authApi';
import { COUNTRIES, getCountryByCode } from '../data/countries';
import { PaymentLogo } from './PaymentLogos';
import { TransactionReceiptModal } from './TransactionReceiptModal';

interface DepositWithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onDepositSuccess: (amount: number, method?: PaymentMethod, phone?: string, serverTx?: any) => void;
  onWithdrawSuccess: (amount: number, method?: PaymentMethod, phone?: string, serverTx?: any) => void;
}

interface PendingPaymentState {
  paymentId: string;
  checkoutUrl?: string;
  instructions?: string;
  amount: number;
  method: PaymentMethod;
  phone: string;
}

interface MethodOption {
  id: PaymentMethod;
  label: string;
  icon: string;
  badge?: string;
}

const PRESET_AMOUNTS = [1000, 2000, 5000, 10000, 25000];

function getPaymentMethodsForCountry(countryCode: string): MethodOption[] {
  const code = (countryCode || 'CI').toUpperCase().trim();

  switch (code) {
    case 'CI':
      return [
        { id: 'wave', label: 'Wave', icon: '🌊', badge: 'Sans frais' },
        { id: 'orange_money', label: 'Orange Money', icon: '🍊' },
        { id: 'mtn', label: 'MTN MoMo', icon: '🟡' },
        { id: 'moov', label: 'Moov Money', icon: '🔵' },
        { id: 'card', label: 'Carte Bancaire', icon: '💳' },
      ];
    case 'SN':
      return [
        { id: 'wave', label: 'Wave', icon: '🌊', badge: 'Populaire' },
        { id: 'orange_money', label: 'Orange Money', icon: '🍊' },
        { id: 'freemoney', label: 'Free Money', icon: '🟢' },
        { id: 'wizall', label: 'Wizall', icon: '🟣' },
        { id: 'card', label: 'Carte Bancaire', icon: '💳' },
      ];
    case 'BJ':
      return [
        { id: 'mtn', label: 'MTN MoMo', icon: '🟡', badge: 'Recommandé' },
        { id: 'moov', label: 'Moov Money', icon: '🔵' },
        { id: 'celtiis', label: 'Celtiis Cash', icon: '🟣' },
        { id: 'card', label: 'Carte Bancaire', icon: '💳' },
      ];
    case 'CM':
      return [
        { id: 'mtn', label: 'MTN MoMo', icon: '🟡', badge: 'Recommandé' },
        { id: 'orange_money', label: 'Orange Money', icon: '🍊' },
        { id: 'card', label: 'Carte Bancaire', icon: '💳' },
      ];
    case 'BF':
      return [
        { id: 'orange_money', label: 'Orange Money', icon: '🍊', badge: 'Recommandé' },
        { id: 'moov', label: 'Moov Money', icon: '🔵' },
        { id: 'card', label: 'Carte Bancaire', icon: '💳' },
      ];
    case 'TG':
      return [
        { id: 'moov', label: 'Moov Money', icon: '🔵' },
        { id: 'togocel', label: 'Togocel / T-Money', icon: '🟢', badge: 'Recommandé' },
        { id: 'card', label: 'Carte Bancaire', icon: '💳' },
      ];
    case 'ML':
      return [
        { id: 'orange_money', label: 'Orange Money', icon: '🍊', badge: 'Recommandé' },
        { id: 'moov', label: 'Moov Money', icon: '🔵' },
        { id: 'card', label: 'Carte Bancaire', icon: '💳' },
      ];
    case 'CD':
      return [
        { id: 'vodacom', label: 'Vodacom M-Pesa', icon: '🟣', badge: 'Populaire' },
        { id: 'orange_money', label: 'Orange Money', icon: '🍊' },
        { id: 'airtel', label: 'Airtel Money', icon: '🔴' },
        { id: 'card', label: 'Carte Bancaire', icon: '💳' },
      ];
    case 'GN':
      return [
        { id: 'mtn', label: 'MTN MoMo', icon: '🟡', badge: 'Recommandé' },
        { id: 'card', label: 'Carte Bancaire', icon: '💳' },
      ];
    default:
      return [
        { id: 'card', label: 'Carte Bancaire (Visa/MC)', icon: '💳', badge: 'International' },
        { id: 'crypto', label: 'Crypto (USDT)', icon: '🪙' },
        { id: 'wave', label: 'Wave Money', icon: '🌊' },
        { id: 'mtn', label: 'MTN MoMo', icon: '🟡' },
        { id: 'orange_money', label: 'Orange Money', icon: '🍊' },
      ];
  }
}

export const DepositWithdrawModal: React.FC<DepositWithdrawModalProps> = ({
  isOpen,
  onClose,
  user,
  onDepositSuccess,
  onWithdrawSuccess,
}) => {
  const [tab, setTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [country, setCountry] = useState<string>(() => {
    const found = COUNTRIES.find((c) => c.name.toLowerCase() === (user.country || '').toLowerCase());
    return found ? found.code : 'CI';
  });
  const [method, setMethod] = useState<PaymentMethod>('wave');
  const [otp, setOtp] = useState<string>('');
  const [amount, setAmount] = useState<number>(5000);
  const [phone, setPhone] = useState<string>(user.phoneOrEmail || '07 48 92 10 33');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pendingPayment, setPendingPayment] = useState<PendingPaymentState | null>(null);
  const [completedTx, setCompletedTx] = useState<any>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  const selectedCountry = getCountryByCode(country);
  const pollIntervalRef = useRef<any>(null);

  // Clear polling interval when unmounting or closing
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const handleClose = () => {
    stopPolling();
    setPendingPayment(null);
    setErrorMessage(null);
    setSuccessMessage(null);
    setOtp('');
    onClose();
  };

  if (!isOpen) return null;

  const handleCountryChange = (newCountry: string) => {
    setCountry(newCountry);
    const available = getPaymentMethodsForCountry(newCountry);
    if (!available.some((m) => m.id === method)) {
      setMethod(available[0]?.id || 'card');
    }
  };

  const handleTabChange = (newTab: 'deposit' | 'withdraw') => {
    soundManager.playClick();
    stopPolling();
    setPendingPayment(null);
    setTab(newTab);
    setErrorMessage(null);
    setSuccessMessage(null);
    setOtp('');
  };

  // Start polling status for pending SasPay payments
  const startStatusPolling = (paymentId: string, depositAmount: number, payMethod: PaymentMethod, depositPhone: string) => {
    stopPolling();

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await AuthApi.checkPaymentStatus(paymentId);
        if (res.success && res.status === 'SUCCESS') {
          stopPolling();
          setPendingPayment(null);
          soundManager.playCashout();
          onDepositSuccess(depositAmount, payMethod, depositPhone);
          setSuccessMessage(`Dépôt de ${depositAmount.toLocaleString('fr-FR')} FCFA validé avec succès ! Jeu débloqué.`);
          setTimeout(() => {
            handleClose();
          }, 1800);
        } else if (res.status === 'FAILED' || res.status === 'CANCELLED') {
          stopPolling();
          setPendingPayment(null);
          setErrorMessage('Le paiement n\'a pas pu être validé ou a été annulé.');
        }
      } catch {
        // Silently continue polling
      }
    }, 3500);
  };

  const handleManualCheckStatus = async () => {
    if (!pendingPayment) return;
    setIsCheckingStatus(true);
    try {
      const res = await AuthApi.checkPaymentStatus(pendingPayment.paymentId);
      if (res.success && res.status === 'SUCCESS') {
        stopPolling();
        setPendingPayment(null);
        soundManager.playCashout();
        const txObj = {
          amount: pendingPayment.amount,
          reference: 'DEP-' + Math.floor(100000 + Math.random() * 900000),
          method: pendingPayment.method,
          phoneNumber: pendingPayment.phone,
          type: 'deposit',
          status: 'success',
          timestamp: Date.now(),
          balance: res.balance !== undefined ? res.balance : user.balance,
        };
        setCompletedTx(txObj);
        onDepositSuccess(pendingPayment.amount, pendingPayment.method, pendingPayment.phone, txObj);
        setSuccessMessage(`Dépôt de ${pendingPayment.amount.toLocaleString('fr-FR')} FCFA validé avec succès ! Jeu débloqué.`);
      } else {
        setErrorMessage(
          res.status === 'PENDING'
            ? 'Paiement toujours en attente de confirmation. Veuillez valider sur votre téléphone.'
            : 'Le paiement n\'a pas encore été confirmé.'
        );
      }
    } catch {
      setErrorMessage('Impossible de vérifier le statut pour le moment. Veuillez patienter.');
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    soundManager.playClick();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanAmount = Number(amount);
    if (isNaN(cleanAmount) || cleanAmount < 500) {
      setErrorMessage('Le montant minimum pour cette opération est de 500 FCFA.');
      return;
    }

    if (cleanAmount > 1000000) {
      setErrorMessage('Le montant maximum par transaction est de 1 000 000 FCFA.');
      return;
    }

    if (method !== 'card' && method !== 'crypto' && (!phone || phone.trim().length < 6)) {
      setErrorMessage('Veuillez renseigner un numéro de téléphone Mobile Money valide.');
      return;
    }

    if (tab === 'withdraw' && cleanAmount > user.balance) {
      setErrorMessage(`Solde insuffisant. Votre solde disponible est de ${user.balance.toLocaleString('fr-FR')} FCFA.`);
      return;
    }

    setIsProcessing(true);
    const fullPhone = phone.trim().startsWith('+') ? phone.trim() : `${selectedCountry.dialCode} ${phone.trim()}`;

    try {
      if (tab === 'deposit') {
        const res = await AuthApi.deposit(cleanAmount, method, fullPhone, country, otp.trim() || undefined);

        if (!res.success) {
          setIsProcessing(false);
          setErrorMessage(res.message || 'Échec du dépôt. Veuillez vérifier vos informations.');
          return;
        }

        // If SasPay requires pending action (checkout URL or Push USSD)
        if (res.pending && res.paymentId) {
          setIsProcessing(false);
          const pendingState: PendingPaymentState = {
            paymentId: res.paymentId,
            checkoutUrl: res.checkoutUrl,
            instructions: res.instructions,
            amount: cleanAmount,
            method,
            phone: phone.trim(),
          };
          setPendingPayment(pendingState);

          // If checkoutUrl is returned, open it in a new window/tab
          if (res.checkoutUrl) {
            window.open(res.checkoutUrl, '_blank', 'noopener,noreferrer');
          }

          // Start polling in background
          startStatusPolling(res.paymentId, cleanAmount, method, phone.trim());
          return;
        }

        // Instant validation (simulation or instant provider)
        setIsProcessing(false);
        soundManager.playCashout();
        const txObj = (res as any).transaction || {
          amount: cleanAmount,
          reference: 'DEP-' + Math.floor(100000 + Math.random() * 900000),
          method,
          phoneNumber: fullPhone,
          type: 'deposit',
          status: 'success',
          timestamp: Date.now(),
          balance: res.balance !== undefined ? res.balance : (user.balance + cleanAmount),
        };
        setCompletedTx(txObj);
        onDepositSuccess(cleanAmount, method, phone.trim(), txObj);
        setSuccessMessage(`Dépôt de ${cleanAmount.toLocaleString('fr-FR')} FCFA validé avec succès ! Jeu débloqué.`);
      } else {
        const res = await AuthApi.withdraw(cleanAmount, method, phone.trim(), country);

        if (!res.success) {
          setIsProcessing(false);
          setErrorMessage(res.message || 'Échec du retrait. Veuillez vérifier vos informations.');
          return;
        }

        setIsProcessing(false);
        soundManager.playCashout();
        const txObj = (res as any).transaction || {
          amount: cleanAmount,
          reference: 'RET-' + Math.floor(100000 + Math.random() * 900000),
          method,
          phoneNumber: fullPhone,
          type: 'withdraw',
          status: 'success',
          timestamp: Date.now(),
          balance: res.balance !== undefined ? res.balance : Math.max(0, user.balance - cleanAmount),
        };
        setCompletedTx(txObj);
        onWithdrawSuccess(cleanAmount, method, fullPhone, txObj);
        setSuccessMessage(res.message || `Retrait de ${cleanAmount.toLocaleString('fr-FR')} FCFA transféré vers votre compte ${method.toUpperCase()} !`);
      }
    } catch (err: any) {
      setIsProcessing(false);
      setErrorMessage(err?.message || 'Erreur réseau ou communication impossible avec le serveur.');
    }
  };

  const paymentMethodsList = getPaymentMethodsForCountry(country);
  const isOrangePrepaymentOtpRequired = (country === 'CI' || country === 'BF') && method === 'orange_money' && tab === 'deposit';

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
              <div className="flex items-center gap-2">
                <h2 className="font-display font-bold text-lg text-white">
                  Portefeuille FCFA
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full">
                  SasPay Sécurisé
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Solde actuel : <span className="text-emerald-400 font-mono-num font-bold">{user.balance.toLocaleString('fr-FR')} FCFA</span>
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
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

          {/* Success Receipt View */}
          {successMessage ? (
            <div className="py-4 space-y-3.5 text-center animate-in fade-in">
              <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center animate-bounce">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-display font-black text-white">
                  {tab === 'deposit' ? 'Transaction de Dépôt Confirmée' : 'Demande de Retrait Transférée'}
                </h3>
                <p className="text-xs text-slate-300 mt-1">{successMessage}</p>
              </div>

              {completedTx && (
                <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-700/80 text-left space-y-2 text-xs">
                  <div className="flex justify-between border-b border-slate-800 pb-1.5">
                    <span className="text-slate-400">Référence officielle :</span>
                    <span className="font-mono font-bold text-orange-400">{completedTx.reference}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800 pb-1.5">
                    <span className="text-slate-400">Montant de l'opération :</span>
                    <span className="font-bold text-emerald-400 font-mono-num">{completedTx.amount?.toLocaleString('fr-FR')} FCFA</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800 pb-1.5">
                    <span className="text-slate-400">Numéro Mobile Money :</span>
                    <span className="font-mono-num text-white">{completedTx.phoneNumber}</span>
                  </div>
                  <div className="flex justify-between pt-0.5">
                    <span className="text-slate-400">Solde du Portefeuille :</span>
                    <span className="font-bold text-white font-mono-num">{completedTx.balance?.toLocaleString('fr-FR')} FCFA</span>
                  </div>
                </div>
              )}

              <div className="space-y-2 pt-1">
                {completedTx && (
                  <button
                    type="button"
                    onClick={() => setIsReceiptOpen(true)}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-display font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xl shadow-orange-500/25 transition-all cursor-pointer"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Télécharger mon Reçu (Image PNG & PDF)</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleClose}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors cursor-pointer"
                >
                  Continuer vers le Jeu
                </button>
              </div>
            </div>
          ) : pendingPayment ? (
            /* Pending SasPay Payment Waiting View */
            <div className="py-6 flex flex-col items-center text-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center animate-pulse">
                  <Smartphone className="w-8 h-8" />
                </div>
                <div className="absolute -bottom-1 -right-1 p-1 bg-slate-900 rounded-full">
                  <Loader2 className="w-5 h-5 text-orange-400 animate-spin" />
                </div>
              </div>

              <div className="space-y-1">
                <h3 className="font-display font-black text-base text-white">
                  Paiement SasPay en cours...
                </h3>
                <p className="text-xs text-slate-300">
                  Montant à régler : <span className="text-emerald-400 font-bold font-mono-num">{pendingPayment.amount.toLocaleString('fr-FR')} FCFA</span>
                </p>
                <p className="text-[11px] text-slate-400 max-w-xs pt-1">
                  {pendingPayment.checkoutUrl
                    ? 'Une page de paiement sécurisée SasPay a été ouverte. Si la fenêtre a été bloquée, cliquez ci-dessous :'
                    : 'Une notification a été envoyée sur votre téléphone. Veuillez saisir votre code secret Mobile Money pour valider.'}
                </p>
              </div>

              {pendingPayment.checkoutUrl && (
                <a
                  href={pendingPayment.checkoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Ouvrir la page de paiement SasPay</span>
                </a>
              )}

              <div className="w-full pt-2 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleManualCheckStatus}
                  disabled={isCheckingStatus}
                  className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl flex items-center justify-center gap-2 border border-slate-700 cursor-pointer transition-all"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isCheckingStatus ? 'animate-spin' : ''}`} />
                  <span>{isCheckingStatus ? 'Vérification...' : 'J\'ai validé le paiement (Vérifier)'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    stopPolling();
                    setPendingPayment(null);
                  }}
                  className="text-xs text-slate-500 hover:text-slate-400 py-1 transition-colors"
                >
                  Annuler et choisir un autre moyen
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Country Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-orange-400" />
                  <span>Pays de facturation</span>
                </label>
                <select
                  value={country}
                  onChange={(e) => handleCountryChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-semibold text-white outline-none focus:border-orange-500"
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Operator choices */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Opérateur de paiement disponible
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {paymentMethodsList.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => { soundManager.playClick(); setMethod(m.id); }}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2.5 relative ${
                        method === m.id
                          ? 'bg-orange-950/60 border-orange-500 text-orange-400 font-bold shadow-md shadow-orange-500/10'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      <PaymentLogo method={m.id} size="sm" className="shrink-0" />
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-bold truncate block">
                          {m.label}
                        </span>
                        {m.badge && (
                          <span className="text-[9px] font-semibold text-emerald-400 block truncate">
                            {m.badge}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Orange Prepayment OTP field if relevant */}
              {isOrangePrepaymentOtpRequired && (
                <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-600/40 space-y-1.5">
                  <div className="flex items-center gap-2 text-amber-400 text-xs font-bold">
                    <KeyRound className="w-4 h-4" />
                    <span>Code d'autorisation Orange Money (OTP)</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-tight">
                    {country === 'CI'
                      ? 'Composez le #144*82# sur votre téléphone pour générer un code de paiement à 4 chiffres.'
                      : 'Composez le *144*4*6# sur votre téléphone pour générer un code temporaire.'}
                  </p>
                  <input
                    type="text"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="Code OTP (ex: 1234)"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono-num font-bold text-white outline-none focus:border-amber-500"
                  />
                </div>
              )}

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

              {/* Phone number with dynamic dial code badge */}
              {method !== 'card' && method !== 'crypto' ? (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Numéro Mobile Money
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono-num">
                      Format : {selectedCountry.dialCode} {selectedCountry.example}
                    </span>
                  </div>
                  <div className="relative flex rounded-xl border border-slate-700 bg-slate-900 overflow-hidden focus-within:border-orange-500 transition-colors">
                    <div className="flex items-center gap-1.5 px-3 bg-slate-800/90 border-r border-slate-700/80 text-xs font-bold text-white select-none">
                      <span className="text-sm">{selectedCountry.flag}</span>
                      <span className="font-mono-num text-orange-400">{selectedCountry.dialCode}</span>
                    </div>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder={selectedCountry.example}
                      className="w-full px-3 py-2.5 bg-transparent text-sm font-mono-num font-semibold text-white placeholder-slate-500 outline-none"
                    />
                  </div>
                </div>
              ) : method === 'card' ? (
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Vous serez redirigé vers la page sécurisée SasPay pour régler par carte bancaire (Visa / Mastercard).</span>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
                  <span className="text-base shrink-0">🪙</span>
                  <span>Vous serez redirigé vers la page sécurisée SasPay pour sélectionner votre crypto / stablecoin (USDT).</span>
                </div>
              )}

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
                    <span>Communication avec SasPay...</span>
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

      {/* Official Transaction Receipt Modal */}
      {completedTx && (
        <TransactionReceiptModal
          isOpen={isReceiptOpen}
          onClose={() => setIsReceiptOpen(false)}
          transaction={completedTx}
          user={user}
        />
      )}
    </div>
  );
};
