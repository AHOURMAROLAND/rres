import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
  Smartphone,
  Loader2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Globe,
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
  transactionId: string;
  checkoutUrl?: string;
  instructions?: string;
  amount: number;
  method: PaymentMethod;
  phone: string;
}

interface PendingWithdrawalState {
  transactionId: string;
  idempotencyKey: string;
  idempotencyStorageKey: string;
  amount: number;
  method: PaymentMethod;
  phone: string;
  country: string;
  retryable: boolean;
}

interface MethodOption {
  id: PaymentMethod;
  label: string;
  icon: string;
  badge?: string;
}

const PRESET_AMOUNTS_WITHDRAW = [2000, 5000, 10000, 25000, 50000];
const inMemoryIdempotencyKeys = new Map<string, { key: string; signature: string; transactionId?: string }>();

function requestIdempotencyKey(
  userId: string,
  kind: string,
  fields: string[],
): { storageKey: string; key: string; blocked: boolean } {
  const storageKey = `aerocrash-idempotency:${userId}:${kind}`;
  const signature = JSON.stringify(fields);
  const inMemory = inMemoryIdempotencyKeys.get(storageKey);
  if (inMemory) {
    return {
      storageKey,
      key: inMemory.key,
      blocked: inMemory.signature !== signature,
    };
  }
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const previous = JSON.parse(stored) as { key?: string; signature?: string; transactionId?: string };
      if (previous.key && previous.signature === signature) {
        inMemoryIdempotencyKeys.set(storageKey, {
          key: previous.key,
          signature,
          transactionId: previous.transactionId,
        });
        return { storageKey, key: previous.key, blocked: false };
      }
      if (previous.key) {
        inMemoryIdempotencyKeys.set(storageKey, {
          key: previous.key,
          signature: previous.signature || '',
          transactionId: previous.transactionId,
        });
        return { storageKey, key: previous.key, blocked: true };
      }
    }
  } catch {
    // The generated key still protects retries within this request attempt.
  }
  const key = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  inMemoryIdempotencyKeys.set(storageKey, { key, signature });
  try {
    localStorage.setItem(storageKey, JSON.stringify({ key, signature }));
  } catch {
    // The API will still receive the key generated for this attempt.
  }
  return { storageKey, key, blocked: false };
}

function clearIdempotencyKey(storageKey: string): void {
  inMemoryIdempotencyKeys.delete(storageKey);
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // Local storage may be disabled; the server remains authoritative.
  }
}

function associateIdempotencyKeyWithTransaction(storageKey: string, key: string, transactionId: string): void {
  const current = inMemoryIdempotencyKeys.get(storageKey);
  if (!current || current.key !== key) return;
  const updated = { ...current, transactionId };
  inMemoryIdempotencyKeys.set(storageKey, updated);
  try {
    localStorage.setItem(storageKey, JSON.stringify(updated));
  } catch {
    // The in-memory association remains available for this page session.
  }
}

export function clearWithdrawalIdempotencyKey(userId: string, transactionId: string): void {
  const storageKey = `aerocrash-idempotency:${userId}:withdraw`;
  const inMemory = inMemoryIdempotencyKeys.get(storageKey);
  if (inMemory?.transactionId === transactionId) {
    clearIdempotencyKey(storageKey);
    return;
  }
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return;
    const previous = JSON.parse(stored) as { transactionId?: string };
    if (previous.transactionId === transactionId) clearIdempotencyKey(storageKey);
  } catch {
    // Keep an unrecognized pending request rather than clearing the wrong idempotency key.
  }
}

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
  const [tab, setTab] = useState<'deposit' | 'withdraw'>('withdraw');
  const [country, setCountry] = useState<string>(() => {
    const found = COUNTRIES.find((c) => c.name.toLowerCase() === (user.country || '').toLowerCase());
    return found ? found.code : 'CI';
  });
  const [method, setMethod] = useState<PaymentMethod>('wave');
  const [otp, setOtp] = useState<string>('');
  const [amount, setAmount] = useState<number>(5000);
  const [phone, setPhone] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pendingPayment, setPendingPayment] = useState<PendingPaymentState | null>(null);
  const [pendingWithdrawal, setPendingWithdrawal] = useState<PendingWithdrawalState | null>(null);
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
    if (!pendingWithdrawal && !pendingPayment) stopPolling();
    setErrorMessage(null);
    setSuccessMessage(null);
    setOtp('');
    onClose();
  };

  if (!isOpen) return null;

  const handleCountryChange = (newCountry: string) => {
    setCountry(newCountry);
    const available = getPaymentMethodsForCountry(newCountry).filter(
      (option) => tab === 'deposit' || (option.id !== 'card' && option.id !== 'crypto'),
    );
    if (!available.some((m) => m.id === method)) {
      setMethod(available[0]?.id || 'card');
    }
  };

  const handleTabChange = (newTab: 'deposit' | 'withdraw') => {
    if (pendingPayment || pendingWithdrawal) return;
    soundManager.playClick();
    setTab(newTab);
    if (newTab === 'withdraw' && (method === 'card' || method === 'crypto')) {
      setMethod(getPaymentMethodsForCountry(country).find((option) => option.id !== 'card' && option.id !== 'crypto')?.id || 'wave');
    }
    setErrorMessage(null);
    setSuccessMessage(null);
    setOtp('');
    if (newTab === 'withdraw' && amount < 2000) {
      setAmount(2000);
    } else if (newTab === 'deposit' && amount < 1000) {
      setAmount(1000);
    }
  };

  // Start polling status for pending payments
  const startStatusPolling = (transactionId: string, depositAmount: number, payMethod: PaymentMethod, depositPhone: string) => {
    stopPolling();

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await AuthApi.checkPaymentStatus(transactionId);
        if (res.success && res.status === 'SUCCESS') {
          stopPolling();
          setPendingPayment(null);
          soundManager.playCashout();
          const creditedAmount = res.creditedAmount ?? depositAmount;
          const tx = { ...res.transaction, balance: res.balance };
          setCompletedTx(tx);
          onDepositSuccess(creditedAmount, payMethod, depositPhone, tx);
          setSuccessMessage(`Dépôt confirmé : ${creditedAmount.toLocaleString('fr-FR')} FCFA nets crédités.`);
          setTimeout(() => {
            handleClose();
          }, 1800);
        } else if (res.success && (res.status === 'FAILED' || res.status === 'CANCELLED')) {
          stopPolling();
          setPendingPayment(null);
          setErrorMessage('Le paiement n\'a pas pu être validé ou a été annulé.');
        }
      } catch {
        // Silently continue polling
      }
    }, 3500);
  };

  const startWithdrawalStatusPolling = (withdrawal: PendingWithdrawalState) => {
    stopPolling();
    pollIntervalRef.current = setInterval(async () => {
      const res = await AuthApi.checkWithdrawalStatus(withdrawal.transactionId);
      if (!res.success || (res.status !== 'SUCCESS' && res.status !== 'FAILED')) {
        if (res.retryable) {
          setPendingWithdrawal((current) => current
            ? { ...current, retryable: true }
            : current);
        }
        return;
      }

      stopPolling();
      setPendingWithdrawal(null);
      clearIdempotencyKey(withdrawal.idempotencyStorageKey);
      const tx = {
        ...res.transaction,
        amount: withdrawal.amount,
        method: withdrawal.method,
        phone: withdrawal.phone,
        phoneNumber: withdrawal.phone,
        type: 'withdraw',
        status: res.status.toLowerCase(),
        balance: res.balance,
      };
      onWithdrawSuccess(withdrawal.amount, withdrawal.method, withdrawal.phone, tx);
      if (res.status === 'SUCCESS') {
        soundManager.playCashout();
        setCompletedTx(tx);
        setSuccessMessage(`Retrait de ${withdrawal.amount.toLocaleString('fr-FR')} FCFA confirmé par SasPay.`);
      } else {
        setErrorMessage('Le retrait a échoué. Les fonds réservés ont été restitués à votre solde.');
      }
    }, 5000);
  };

  const handleManualCheckStatus = async () => {
    if (!pendingPayment) return;
    setIsCheckingStatus(true);
    try {
      const res = await AuthApi.checkPaymentStatus(pendingPayment.transactionId);
      if (res.success && res.status === 'SUCCESS') {
        stopPolling();
        setPendingPayment(null);
        soundManager.playCashout();
        const txObj = {
          ...res.transaction,
          amount: pendingPayment.amount,
          method: pendingPayment.method,
          phoneNumber: pendingPayment.phone,
          type: 'deposit',
          status: 'success',
          balance: res.balance !== undefined ? res.balance : user.balance,
        };
        const creditedAmount = res.creditedAmount ?? pendingPayment.amount;
        setCompletedTx(txObj);
        onDepositSuccess(creditedAmount, pendingPayment.method, pendingPayment.phone, txObj);
        setSuccessMessage(`Dépôt confirmé : ${creditedAmount.toLocaleString('fr-FR')} FCFA nets crédités.`);
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

  const handleRetryWithdrawal = async () => {
    if (!pendingWithdrawal) return;
    setIsCheckingStatus(true);
    try {
      const res = await AuthApi.withdraw(
        pendingWithdrawal.amount,
        pendingWithdrawal.method,
        pendingWithdrawal.phone,
        pendingWithdrawal.country,
        pendingWithdrawal.idempotencyKey,
      );
      if (res.transactionId) {
        associateIdempotencyKeyWithTransaction(
          pendingWithdrawal.idempotencyStorageKey,
          pendingWithdrawal.idempotencyKey,
          res.transactionId,
        );
      }
      if (res.success && res.transactionId) {
        const updated = {
          ...pendingWithdrawal,
          transactionId: res.transactionId,
          retryable: Boolean(res.retryable),
        };
        if (!updated.retryable) clearIdempotencyKey(pendingWithdrawal.idempotencyStorageKey);
        setPendingWithdrawal(updated);
        startWithdrawalStatusPolling(updated);
        setErrorMessage(null);
        return;
      }
      if (res.status === 'FAILED') {
        await handleManualCheckWithdrawal();
        return;
      }
      setErrorMessage(res.message || 'État du retrait toujours incertain. Réessayez sans changer la demande.');
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleManualCheckWithdrawal = async () => {
    if (!pendingWithdrawal) return;
    setIsCheckingStatus(true);
    try {
      const res = await AuthApi.checkWithdrawalStatus(pendingWithdrawal.transactionId);
      if (!res.success || (res.status !== 'SUCCESS' && res.status !== 'FAILED')) {
        if (res.retryable) {
          setPendingWithdrawal((current) => current ? { ...current, retryable: true } : current);
        }
        setErrorMessage(res.message || 'Le retrait est toujours en attente de confirmation.');
        return;
      }
      stopPolling();
      setPendingWithdrawal(null);
      clearIdempotencyKey(pendingWithdrawal.idempotencyStorageKey);
      const tx = {
        ...res.transaction,
        amount: pendingWithdrawal.amount,
        method: pendingWithdrawal.method,
        phone: pendingWithdrawal.phone,
        phoneNumber: pendingWithdrawal.phone,
        type: 'withdraw',
        status: res.status.toLowerCase(),
        balance: res.balance,
      };
      onWithdrawSuccess(pendingWithdrawal.amount, pendingWithdrawal.method, pendingWithdrawal.phone, tx);
      if (res.status === 'SUCCESS') {
        soundManager.playCashout();
        setCompletedTx(tx);
        setSuccessMessage(`Retrait de ${pendingWithdrawal.amount.toLocaleString('fr-FR')} FCFA confirmé par SasPay.`);
      } else {
        setErrorMessage('Le retrait a échoué. Les fonds réservés ont été restitués à votre solde.');
      }
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
    const minAmount = tab === 'deposit' ? 1000 : 2000;
    if (isNaN(cleanAmount) || cleanAmount < minAmount) {
      setErrorMessage(`Le montant minimum pour un ${tab === 'deposit' ? 'dépôt' : 'retrait'} est de ${minAmount.toLocaleString('fr-FR')} FCFA.`);
      return;
    }

    if (cleanAmount > 1000000) {
      setErrorMessage('Le montant maximum par transaction est de 1 000 000 FCFA.');
      return;
    }

    if (!phone || phone.trim().replace(/\D/g, '').length < 6) {
      setErrorMessage('Veuillez renseigner un numéro de téléphone valide.');
      return;
    }

    if (tab === 'withdraw' && cleanAmount > user.balance) {
      setErrorMessage(`Solde insuffisant. Votre solde disponible est de ${user.balance.toLocaleString('fr-FR')} FCFA.`);
      return;
    }

    setIsProcessing(true);
    const fullPhone = phone.trim().startsWith('+') ? phone.trim() : `${selectedCountry.dialCode} ${phone.trim()}`;
    const checkoutWindow = tab === 'deposit' ? window.open('about:blank', '_blank') : null;
    if (checkoutWindow) checkoutWindow.opener = null;
    const request = requestIdempotencyKey(
      user.id,
      tab,
      [String(cleanAmount), method, country, fullPhone.replace(/[\s\-().]/g, ''), tab === 'deposit' ? otp.trim() : ''],
    );
    if (request.blocked) {
      setIsProcessing(false);
      checkoutWindow?.close();
      setErrorMessage('Une demande précédente reste incertaine. Réessayez exactement les mêmes détails avant d’en créer une nouvelle.');
      return;
    }

    try {
      if (tab === 'deposit') {
        const res = await AuthApi.deposit(cleanAmount, method, fullPhone, country, otp.trim() || undefined, request.key);

        if (!res.success) {
          checkoutWindow?.close();
          setIsProcessing(false);
          if (!res.pending) clearIdempotencyKey(request.storageKey);
          setErrorMessage(res.message || 'Échec du dépôt. Veuillez vérifier vos informations.');
          return;
        }

        // If SasPay requires pending action (checkout URL or Push USSD)
        if (res.pending && res.paymentId && res.transactionId) {
          setIsProcessing(false);
          clearIdempotencyKey(request.storageKey);
          const pendingState: PendingPaymentState = {
            paymentId: res.paymentId,
            transactionId: res.transactionId,
            checkoutUrl: res.checkoutUrl,
            instructions: res.instructions,
            amount: cleanAmount,
            method,
            phone: phone.trim(),
          };
          setPendingPayment(pendingState);

          // Reserve a tab during the user gesture so popup blockers do not hide checkout.
          if (res.checkoutUrl) {
            if (checkoutWindow && !checkoutWindow.closed) {
              checkoutWindow.location.replace(res.checkoutUrl);
            }
          } else {
            checkoutWindow?.close();
          }

          // Start polling in background
          startStatusPolling(res.transactionId, cleanAmount, method, phone.trim());
          return;
        }

        // Instant validation (simulation or instant provider)
        setIsProcessing(false);
        clearIdempotencyKey(request.storageKey);
        soundManager.playCashout();
        const creditedAmount = res.creditedAmount ?? cleanAmount;
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
        onDepositSuccess(creditedAmount, method, phone.trim(), { ...txObj, balance: res.balance });
        setSuccessMessage(`Dépôt confirmé : ${creditedAmount.toLocaleString('fr-FR')} FCFA nets crédités.`);
      } else {
        checkoutWindow?.close();
        const res = await AuthApi.withdraw(cleanAmount, method, fullPhone, country, request.key);
        if (res.transactionId) {
          associateIdempotencyKeyWithTransaction(request.storageKey, request.key, res.transactionId);
        }

        if (!res.success) {
          setIsProcessing(false);
          if (!res.pending) clearIdempotencyKey(request.storageKey);
          if (res.transaction && typeof res.balance === 'number') {
            onWithdrawSuccess(cleanAmount, method, fullPhone, {
              ...res.transaction,
              balance: res.balance,
            });
          }
          setErrorMessage(res.message || 'Échec du retrait. Veuillez vérifier vos informations.');
          return;
        }

        setIsProcessing(false);
        if (res.status === 'SUCCESS' && res.transactionId) {
          clearIdempotencyKey(request.storageKey);
          const txObj = { ...res.transaction, balance: res.balance };
          soundManager.playCashout();
          setCompletedTx(txObj);
          onWithdrawSuccess(cleanAmount, method, fullPhone, txObj);
          setSuccessMessage(res.message || `Retrait de ${cleanAmount.toLocaleString('fr-FR')} FCFA confirmé.`);
          return;
        }
        if (!res.transactionId) {
          setErrorMessage(res.message || 'Retrait accepté mais son état est incertain. Réessayez avec la même demande.');
          return;
        }
        const withdrawal: PendingWithdrawalState = {
          transactionId: res.transactionId,
          idempotencyKey: request.key,
          idempotencyStorageKey: request.storageKey,
          amount: cleanAmount,
          method,
          phone: fullPhone,
          country,
          retryable: Boolean(res.retryable),
        };
        if (!withdrawal.retryable) clearIdempotencyKey(request.storageKey);
        setPendingWithdrawal(withdrawal);
        startWithdrawalStatusPolling(withdrawal);
      }
    } catch (err: any) {
      checkoutWindow?.close();
      setIsProcessing(false);
      setErrorMessage(err?.message || 'Erreur réseau ou communication impossible avec le serveur.');
    }
  };

  const paymentMethodsList = getPaymentMethodsForCountry(country).filter(
    (option) => tab === 'deposit' || (option.id !== 'card' && option.id !== 'crypto'),
  );

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
                  Paiement Sécurisé SSL
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
                  {tab === 'deposit' ? 'Dépôt confirmé' : 'Retrait confirmé'}
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
                  Paiement sécurisé en cours...
                </h3>
                <p className="text-xs text-slate-300">
                  Montant à régler : <span className="text-emerald-400 font-bold font-mono-num">{pendingPayment.amount.toLocaleString('fr-FR')} FCFA</span>
                </p>
                <p className="text-[11px] text-slate-400 max-w-xs pt-1">
                  {pendingPayment.checkoutUrl
                    ? 'Une page de paiement sécurisée a été ouverte. Si la fenêtre a été bloquée, cliquez ci-dessous :'
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
                  <span>Ouvrir la page de paiement sécurisée</span>
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
                  onClick={handleClose}
                  className="text-xs text-slate-500 hover:text-slate-400 py-1 transition-colors"
                >
                  Fermer la fenêtre (paiement toujours en attente)
                </button>
              </div>
            </div>
          ) : pendingWithdrawal ? (
            <div className="py-6 flex flex-col items-center text-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center animate-pulse">
                  <ArrowUpCircle className="w-8 h-8" />
                </div>
                <div className="absolute -bottom-1 -right-1 p-1 bg-slate-900 rounded-full">
                  <Loader2 className="w-5 h-5 text-orange-400 animate-spin" />
                </div>
              </div>
              <div className="space-y-1">
                <h3 className="font-display font-black text-base text-white">Retrait en attente de SasPay</h3>
                <p className="text-xs text-slate-300">
                  {pendingWithdrawal.amount.toLocaleString('fr-FR')} FCFA vers {pendingWithdrawal.phone}
                </p>
                <p className="text-[11px] text-slate-400 max-w-xs pt-1">
                  Les fonds sont réservés jusqu’à confirmation. Ne créez pas un nouveau retrait. La vérification continue même si vous fermez cette fenêtre.
                </p>
              </div>
              <div className="w-full flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleManualCheckWithdrawal}
                  disabled={isCheckingStatus}
                  className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl flex items-center justify-center gap-2 border border-slate-700 cursor-pointer transition-all"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isCheckingStatus ? 'animate-spin' : ''}`} />
                  <span>{isCheckingStatus ? 'Vérification...' : 'Vérifier le statut'}</span>
                </button>
                {pendingWithdrawal.retryable && (
                  <button
                    type="button"
                    onClick={handleRetryWithdrawal}
                    disabled={isCheckingStatus}
                    className="w-full py-2.5 px-4 bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isCheckingStatus ? 'animate-spin' : ''}`} />
                    <span>Réessayer la même demande sans nouveau débit</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleClose}
                  className="text-xs text-slate-500 hover:text-slate-400 py-1 transition-colors"
                >
                  Fermer la fenêtre
                </button>
              </div>
            </div>
          ) : tab === 'deposit' ? (
            <div className="rounded-2xl border border-amber-700/50 bg-amber-950/30 p-4 text-sm text-amber-100">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 shrink-0 text-amber-400" />
                <p>
                  Les dépôts sont suspendus. Le jeu en argent réel restera désactivé jusqu’à ce que les manches soient réglées entièrement côté serveur.
                </p>
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

              {/* Amount Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Montant en FCFA
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={2000}
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
                  {PRESET_AMOUNTS_WITHDRAW.map((p) => (
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

              {/* Submit CTA */}
              <button
                type="submit"
                disabled={isProcessing}
                className="w-full py-3 rounded-2xl bg-orange-600 hover:bg-orange-500 text-white shadow-orange-600/30 font-display font-black text-base shadow-xl flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Traitement sécurisé en cours...</span>
                  </>
                ) : (
                  <span>
                    {`Retirer ${amount.toLocaleString('fr-FR')} FCFA`}
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
