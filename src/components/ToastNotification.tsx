import React from 'react';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';
import { ToastMessage } from '../types';

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastNotification: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 sm:translate-x-0 sm:left-auto sm:right-4 z-50 flex flex-col gap-2 max-w-[94vw] sm:max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto p-3.5 rounded-2xl shadow-2xl backdrop-blur-md border flex items-start gap-3 animate-in slide-in-from-bottom-5 duration-200 ${
            toast.type === 'success'
              ? 'bg-[#0B1A14]/95 border-emerald-500/50 text-emerald-300 shadow-emerald-950/50'
              : toast.type === 'error'
              ? 'bg-[#1C0F0F]/95 border-red-500/50 text-red-300 shadow-red-950/50'
              : toast.type === 'warning'
              ? 'bg-[#1F190B]/95 border-amber-500/50 text-amber-300 shadow-amber-950/50'
              : 'bg-[#0E1322]/95 border-sky-500/50 text-sky-300 shadow-slate-950/50'
          }`}
        >
          <div className="shrink-0 mt-0.5">
            {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
            {toast.type === 'error' && <XCircle className="w-5 h-5 text-red-400" />}
            {toast.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-400" />}
            {toast.type === 'info' && <Info className="w-5 h-5 text-sky-400" />}
          </div>

          <div className="flex-1 min-w-0">
            <h4 className="font-display font-bold text-xs text-white leading-tight">
              {toast.title}
            </h4>
            <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">
              {toast.message}
            </p>
          </div>

          <button
            onClick={() => onDismiss(toast.id)}
            className="shrink-0 p-1 rounded-lg text-slate-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
