import React, { useState } from 'react';
import { X, ShieldCheck, Copy, Check, Info, Lock } from 'lucide-react';
import { RoundHistoryItem } from '../types';

interface ProvablyFairModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedRound: RoundHistoryItem | null;
  clientSeed: string;
  onUpdateClientSeed: (seed: string) => void;
}

export const ProvablyFairModal: React.FC<ProvablyFairModalProps> = ({
  isOpen,
  onClose,
  selectedRound,
  clientSeed,
  onUpdateClientSeed,
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [customClientSeed, setCustomClientSeed] = useState<string>(clientSeed);

  if (!isOpen) return null;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
      <div className="relative w-full max-w-lg bg-[#0E1322] border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col my-auto">
        {/* Header */}
        <div className="p-4 sm:p-6 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-black text-lg text-white">
                Système Équité Prouvée (Provably Fair)
              </h2>
              <p className="text-xs text-slate-400">
                Transparence cryptographique garantie à 100%
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

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Concept explanation */}
          <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300 leading-relaxed">
            <div className="flex items-center gap-2 font-bold text-white mb-1">
              <Lock className="w-4 h-4 text-emerald-400" />
              <span>Pourquoi ce jeu est infalsifiable ?</span>
            </div>
            <p className="text-slate-400">
              Le résultat de chaque manche est déterminé avant même que l'avion ne décolle grâce au calcul <strong>HMAC_SHA256(ServerSeed, ClientSeed + ":" + Nonce)</strong> conforme aux standards cryptographiques. La graine serveur est publiée sous forme de hash SHA-256 avant chaque tour. L'avantage maison est fixé à <strong>3%</strong>. Ni le joueur ni la plateforme ne peuvent modifier le multiplicateur en cours de vol.
            </p>
          </div>

          {/* Selected round inspection or latest */}
          {selectedRound ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Détails du tour inspecté : <span className="text-orange-400">{selectedRound.roundId}</span>
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-slate-800 text-emerald-400 font-mono-num font-bold text-xs">
                  {selectedRound.crashMultiplier.toFixed(2)}x
                </span>
              </div>

              {/* Hash display */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Empreinte SHA-256 du Serveur :
                </label>
                <div className="flex items-center gap-1.5 p-2 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="font-mono-num text-[11px] text-slate-300 break-all select-all flex-1">
                    {selectedRound.serverSeedHash}
                  </span>
                  <button
                    onClick={() => handleCopy(selectedRound.serverSeedHash)}
                    className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
                    title="Copier le hash"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Graine Client & Nonce */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-semibold">Graine Client :</span>
                  <span className="font-mono-num text-white font-medium truncate block">
                    {selectedRound.clientSeed}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-semibold">Numéro de manche (Nonce) :</span>
                  <span className="font-mono-num text-white font-medium">
                    #{selectedRound.nonce}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-400 text-center py-2">
              Cliquez sur un multiplicateur dans le bandeau supérieur pour inspecter son empreinte SHA-256.
            </div>
          )}

          {/* Client Seed Customizer */}
          <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
            <label className="block text-xs font-bold text-white uppercase tracking-wider">
              Votre Graine Joueur Personnalisée (Client Seed)
            </label>
            <p className="text-[11px] text-slate-400">
              Vous pouvez modifier votre graine à tout moment pour influencer le générateur pseudo-aléatoire du prochain tour.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={customClientSeed}
                onChange={(e) => setCustomClientSeed(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono-num text-white outline-none focus:border-emerald-500"
              />
              <button
                onClick={() => {
                  onUpdateClientSeed(customClientSeed);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Mettre à jour
              </button>
            </div>
          </div>

          {/* Compliance & Risk Notice */}
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-center">
            <p className="text-[11px] text-slate-400 font-medium">
              Les résultats sont générés de manière aléatoire et peuvent varier. Le jeu comporte des risques.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
