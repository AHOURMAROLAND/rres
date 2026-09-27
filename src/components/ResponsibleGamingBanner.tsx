import React, { useState } from 'react';
import { AlertTriangle, ShieldCheck, HelpCircle, CheckCircle, X, Scale } from 'lucide-react';

interface ResponsibleGamingProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ResponsibleGamingModal: React.FC<ResponsibleGamingProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
      <div className="relative w-full max-w-lg bg-[#0E1322] border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col my-auto">
        {/* Header */}
        <div className="p-4 sm:p-6 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-black text-lg text-white">
                Transparence & Jeu Responsable
              </h2>
              <p className="text-xs text-slate-400">
                Principes fondamentaux • Gestion des risques
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

        {/* Modal content */}
        <div className="p-4 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Main required banner notice */}
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-200 leading-relaxed font-medium">
              <strong className="text-white block font-bold text-sm mb-1">
                Avertissement Légal & Déontologique :
              </strong>
              « Les gains dépendent de votre stratégie et comportent des risques. Ce jeu est conçu comme une plateforme de divertissement interactif et ne constitue en aucun cas un investissement ou un moyen garanti de générer des revenus. »
            </div>
          </div>

          <div className="space-y-3 text-xs text-slate-300">
            <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800">
              <h4 className="font-bold text-white text-sm mb-1 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-orange-400" />
                Comment fonctionne le multiplicateur ?
              </h4>
              <p className="text-slate-400 leading-relaxed">
                À chaque manche, l'avion décolle avec un multiplicateur initial de 1.00x. La courbe s'élève de façon exponentielle. L'instant d'arrêt (le crash) est généré selon un algorithme cryptographique public (Provably Fair) et ne dépend d'aucun facteur externe.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800">
              <h4 className="font-bold text-white text-sm mb-1 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Conseils de stratégie raisonnée
              </h4>
              <ul className="list-disc list-inside space-y-1 text-slate-400">
                <li>Fixez-vous un budget de divertissement strict et ne tentez jamais de vous refaire.</li>
                <li>Utilisez le <strong>Mode Automatique (Auto Cashout)</strong> à des multiplicateurs modestes (1.20x - 1.50x) pour sécuriser des gains réguliers.</li>
                <li>Diversifiez vos mises avec le système à double panneau (un pari défensif, un pari audacieux).</li>
              </ul>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800">
              <h4 className="font-bold text-white text-sm mb-1 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-sky-400" />
                Commission de plateforme
              </h4>
              <p className="text-slate-400 leading-relaxed">
                Une retenue transparente de <strong>2.5%</strong> est appliquée uniquement sur les gains nets afin de couvrir les frais d'infrastructure et de maintenance de la plateforme. Aucun frais caché.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-display font-bold text-sm transition-colors cursor-pointer"
          >
            J'ai compris et j'accepte les conditions de jeu
          </button>
        </div>
      </div>
    </div>
  );
};

export const ResponsibleGamingBanner: React.FC<{ onOpenModal: () => void }> = ({ onOpenModal }) => {
  return (
    <div className="w-full bg-amber-950/30 border-y border-amber-900/40 px-3 py-2 text-center">
      <div className="max-w-6xl mx-auto flex items-center justify-center gap-2 flex-wrap text-xs text-amber-300">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
        <span className="font-medium">
          « Les gains dépendent de votre stratégie et comportent des risques. Jouez avec modération. »
        </span>
        <button
          onClick={onOpenModal}
          className="underline text-amber-400 hover:text-amber-200 ml-1 font-bold cursor-pointer"
        >
          En savoir plus
        </button>
      </div>
    </div>
  );
};
