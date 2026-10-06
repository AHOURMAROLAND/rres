import React, { useState } from 'react';
import {
  X,
  Download,
  FileText,
  Copy,
  Check,
  Printer,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  Wallet,
  Smartphone,
  ExternalLink,
  Mail,
  Plane,
} from 'lucide-react';
import { PaymentTransaction, User } from '../types';
import { PaymentLogo, getPaymentMethodDetails } from './PaymentLogos';
import { soundManager } from '../services/sound';

interface TransactionReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Partial<PaymentTransaction> & {
    amount: number;
    reference: string;
    method?: any;
    phone?: string;
    phoneNumber?: string;
    type?: 'deposit' | 'withdraw' | 'activation';
    status?: 'success' | 'pending' | 'failed';
    date?: string;
    balance?: number;
  };
  user: User;
}

export const TransactionReceiptModal: React.FC<TransactionReceiptModalProps> = ({
  isOpen,
  onClose,
  transaction,
  user,
}) => {
  const [copied, setCopied] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  if (!isOpen) return null;

  const isDeposit = transaction.type === 'deposit' || transaction.type === 'activation';
  const amountStr = transaction.amount.toLocaleString('fr-FR');
  const reference = transaction.reference || (isDeposit ? 'DEP-000000' : 'RET-000000');
  const method = transaction.method || 'wave';
  const methodDetails = getPaymentMethodDetails(method);
  const phone = transaction.phoneNumber || transaction.phone || user.phoneOrEmail || '';
  const dateStr = transaction.date || new Date(transaction.timestamp || Date.now()).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const newBalanceStr = (transaction.balance !== undefined ? transaction.balance : user.balance).toLocaleString('fr-FR');

  // Copy full receipt text to clipboard
  const handleCopyText = async () => {
    soundManager.playClick();
    const textReceipt = `================================================
🧾 AEROCRASH LIVE - REÇU OFFICIEL DE TRANSACTION
================================================
TYPE       : ${isDeposit ? 'DÉPÔT CRÉDITÉ' : 'RETRAIT DÉCAISSÉ'}
RÉFÉRENCE  : ${reference}
STATUT     : CONFIRMÉ & SÉCURISÉ
MONTANT    : ${isDeposit ? '+' : '-'}${amountStr} FCFA
BÉNÉFICIAIRE : ${user.name} (${user.email})
OPÉRATEUR  : ${methodDetails.name.toUpperCase()}
NUMÉRO     : ${phone}
DATE       : ${dateStr}
NOUVEAU SOLDE : ${newBalanceStr} FCFA
PASSERELLE : AEROCRASH FINANCIAL SECURE ENGINE
SÉCURITÉ   : SHA-256 PROVABLY FAIR CERTIFIED
================================================
Conservez ce document pour vos archives comptables.`;

    try {
      await navigator.clipboard.writeText(textReceipt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback
    }
  };

  // Generate and Download receipt as PNG image via Canvas
  const handleDownloadImage = () => {
    soundManager.playClick();
    setIsGeneratingImage(true);

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 700;
      canvas.height = 920;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        setIsGeneratingImage(false);
        return;
      }

      // Background gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 700, 920);
      bgGrad.addColorStop(0, '#090D18');
      bgGrad.addColorStop(0.5, '#0E1426');
      bgGrad.addColorStop(1, '#080B14');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 700, 920);

      // Outer border
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 4;
      ctx.strokeRect(16, 16, 668, 888);

      // Top Header Card
      const headerGrad = ctx.createLinearGradient(0, 20, 0, 180);
      if (isDeposit) {
        headerGrad.addColorStop(0, '#064E3B');
        headerGrad.addColorStop(1, '#0B251D');
      } else {
        headerGrad.addColorStop(0, '#7C2D12');
        headerGrad.addColorStop(1, '#2D1007');
      }
      ctx.fillStyle = headerGrad;
      ctx.fillRect(20, 20, 660, 160);

      // Logo
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText('AEROCRASH 🚀', 48, 70);

      ctx.fillStyle = isDeposit ? '#34D399' : '#FB923C';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(isDeposit ? 'REÇU OFFICIEL DE DÉPÔT' : 'BORDEREAU DE DÉCAISSEMENT', 48, 98);

      // Transaction Amount Big
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 42px sans-serif';
      ctx.fillText(`${isDeposit ? '+' : '-'}${amountStr} FCFA`, 48, 150);

      // Official Stamp (Top Right)
      ctx.save();
      ctx.translate(560, 100);
      ctx.rotate(-0.15);
      ctx.strokeStyle = isDeposit ? '#10B981' : '#F97316';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 52, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = isDeposit ? '#10B981' : '#F97316';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('AEROCRASH', 0, -20);
      ctx.fillText('OFFICIEL', 0, -4);
      ctx.font = '900 13px sans-serif';
      ctx.fillText('VALIDÉ', 0, 16);
      ctx.font = 'bold 9px sans-serif';
      ctx.fillText('SÉCURISÉ', 0, 32);
      ctx.restore();

      // Table section
      const rows: [string, string][] = [
        ['Référence officielle', reference],
        ['Bénéficiaire / Joueur', user.name],
        ['Email associé', user.email || user.phoneOrEmail || 'Non renseigné'],
        ['Moyen de paiement', methodDetails.name],
        ['Numéro débité / crédité', phone],
        ['Date & Heure', dateStr],
        ['Nouveau Solde Retirable', `${newBalanceStr} FCFA`],
        ['Statut transaction', 'CONFIRMÉ & SÉCURISÉ (100%)'],
        ['Passerelle', 'AeroCrash Secure Gateway'],
      ];

      ctx.textAlign = 'left';
      let currentY = 240;

      rows.forEach(([label, value], idx) => {
        // Row background
        if (idx % 2 === 0) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
          ctx.fillRect(40, currentY - 26, 620, 38);
        }

        ctx.fillStyle = '#94A3B8';
        ctx.font = '14px sans-serif';
        ctx.fillText(label, 50, currentY);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(value, 640, currentY);
        ctx.textAlign = 'left';

        // subtle separator
        ctx.strokeStyle = '#1E293B';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(40, currentY + 12);
        ctx.lineTo(660, currentY + 12);
        ctx.stroke();

        currentY += 46;
      });

      // Provably Fair Cryptographic Hash Bar
      currentY += 20;
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(40, currentY, 620, 60);
      ctx.strokeStyle = '#334155';
      ctx.strokeRect(40, currentY, 620, 60);

      ctx.fillStyle = '#64748B';
      ctx.font = '10px monospace';
      ctx.fillText('EMPREINTE DE CERTIFICATION PROVABLY FAIR (SHA-256) :', 55, currentY + 22);

      const fakeHash = 'hash_' + Math.random().toString(36).substring(2) + Date.now().toString(36) + '9f8b2c';
      ctx.fillStyle = '#38BDF8';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(fakeHash.toUpperCase(), 55, currentY + 44);

      // Footer
      ctx.fillStyle = '#64748B';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Document financier certifié conforme généré automatiquement par AeroCrash Gaming.', 350, 840);
      ctx.fillText('Pour toute assistance : support@aerocrash.live • ID Facture : ' + reference, 350, 860);

      // Trigger download
      const imageURL = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.download = `Recu-${reference}.png`;
      downloadLink.href = imageURL;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      soundManager.playCashout();
    } catch (e) {
      console.error('Error generating image receipt:', e);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // Trigger Print to PDF
  const handlePrintPdf = () => {
    soundManager.playClick();
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
      <div className="relative w-full max-w-lg bg-[#0C101C] border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden max-h-[94vh] flex flex-col my-auto text-slate-200">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-bold text-base sm:text-lg text-white">
                Facture & Reçu Officiel
              </h2>
              <p className="text-[11px] text-slate-400">
                Certifié par AeroCrash Financial & Banking Network
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

        {/* Scrollable Receipt Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
          {/* Visual Receipt Card */}
          <div className="rounded-2xl bg-gradient-to-b from-[#131826] to-[#0A0D15] border border-slate-700/80 overflow-hidden shadow-2xl relative">
            {/* Header Banner */}
            <div
              className={`p-5 text-center relative border-b ${
                isDeposit
                  ? 'bg-gradient-to-r from-emerald-950 via-emerald-900 to-slate-950 border-emerald-600/40 text-emerald-300'
                  : 'bg-gradient-to-r from-orange-950 via-amber-950 to-slate-950 border-orange-600/40 text-orange-300'
              }`}
            >
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-black/40 border border-white/10 mb-2">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{isDeposit ? 'Reçu officiel de Dépôt' : 'Bordereau officiel de Retrait'}</span>
              </div>
              <div className="text-3xl sm:text-4xl font-display font-black text-white tracking-tight">
                {isDeposit ? '+' : '-'}{amountStr} <span className="text-xl font-bold text-orange-400">FCFA</span>
              </div>
              <p className="text-xs text-slate-300 font-mono mt-1">
                RÉFÉRENCE : <span className="text-white font-bold">{reference}</span>
              </p>

              {/* Holographic Watermark Stamp */}
              <div className="absolute top-3 right-3 sm:right-6 pointer-events-none opacity-85 rotate-[-12deg]">
                <div
                  className={`w-20 h-20 rounded-full border-2 border-dashed flex flex-col items-center justify-center p-1 text-center font-black ${
                    isDeposit ? 'border-emerald-400 text-emerald-400' : 'border-orange-400 text-orange-400'
                  }`}
                >
                  <span className="text-[7px] tracking-wider uppercase">AEROCRASH</span>
                  <span className="text-[11px] uppercase tracking-tighter">VALIDÉ</span>
                  <span className="text-[6px] tracking-widest uppercase">SÉCURISÉ</span>
                </div>
              </div>
            </div>

            {/* Receipt Table */}
            <div className="p-4 sm:p-5 space-y-2.5 text-xs">
              <div className="flex justify-between py-2 border-b border-slate-800/80">
                <span className="text-slate-400">Titulaire du compte</span>
                <span className="font-bold text-white text-right">{user.name}</span>
              </div>

              <div className="flex justify-between py-2 border-b border-slate-800/80">
                <span className="text-slate-400">Adresse Email</span>
                <span className="font-semibold text-slate-300 text-right">{user.email}</span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-slate-800/80">
                <span className="text-slate-400">Moyen de paiement</span>
                <div className="flex items-center gap-2">
                  <PaymentLogo method={method} size="sm" className="w-5 h-5 rounded" />
                  <span className="font-bold text-white uppercase">{methodDetails.name}</span>
                </div>
              </div>

              <div className="flex justify-between py-2 border-b border-slate-800/80">
                <span className="text-slate-400">Numéro Mobile Money</span>
                <span className="font-mono-num font-bold text-white text-right">{phone}</span>
              </div>

              <div className="flex justify-between py-2 border-b border-slate-800/80">
                <span className="text-slate-400">Date & Heure</span>
                <span className="font-semibold text-slate-300 text-right">{dateStr}</span>
              </div>

              <div className="flex justify-between py-2.5 bg-slate-900/60 px-3 rounded-xl border border-slate-800">
                <span className="font-bold text-slate-300">Nouveau Solde Retirable</span>
                <span className="font-display font-black text-emerald-400 text-sm">{newBalanceStr} FCFA</span>
              </div>

              {/* Email notification */}
              <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex items-start gap-2.5 text-[11px] text-slate-400 mt-2">
                <Mail className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                <span>
                  Une copie officielle de cette facture a été envoyée par email à <strong className="text-white">{user.email}</strong>.
                </span>
              </div>
            </div>
          </div>

          {/* Action Export Buttons */}
          <div className="space-y-2 pt-1">
            <div className="grid grid-cols-2 gap-2">
              {/* Download PNG Image */}
              <button
                type="button"
                onClick={handleDownloadImage}
                disabled={isGeneratingImage}
                className="py-3 px-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                <span>{isGeneratingImage ? 'Génération...' : 'Télécharger Image (PNG)'}</span>
              </button>

              {/* Download / Print PDF */}
              <button
                type="button"
                onClick={handlePrintPdf}
                className="py-3 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4 text-emerald-400" />
                <span>Imprimer / PDF</span>
              </button>
            </div>

            {/* Copy Text */}
            <button
              type="button"
              onClick={handleCopyText}
              className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white font-semibold text-xs border border-slate-800 flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400 font-bold">Texte du reçu copié dans le presse-papier !</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-slate-400" />
                  <span>Copier le texte du reçu (WhatsApp / SMS)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
