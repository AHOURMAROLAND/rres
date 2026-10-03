import React from 'react';
import { PaymentMethod } from '../types';

interface PaymentLogoProps {
  method: PaymentMethod | string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const PaymentLogo: React.FC<PaymentLogoProps> = ({ method, className = '', size = 'md' }) => {
  const m = (method || '').toLowerCase().trim();

  const sizeClasses = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-9 h-9 text-sm',
    lg: 'w-11 h-11 text-base',
  }[size];

  // 1. WAVE (Cyan #00D2FF & Dark Blue)
  if (m.includes('wave')) {
    return (
      <div className={`relative flex items-center justify-center rounded-xl bg-gradient-to-br from-[#1AD7FF] to-[#0094D9] shadow-md shadow-cyan-500/20 text-white font-black overflow-hidden shrink-0 ${sizeClasses} ${className}`}>
        <svg viewBox="0 0 32 32" fill="none" className="w-6 h-6 drop-shadow">
          {/* Wave Penguin / Wave Water Shape */}
          <path d="M7 19C10 14 14 14 16 17C18 20 22 20 25 15C26 21 21 26 16 26C11 26 7 22 7 19Z" fill="white" />
          <path d="M16 6C13.8 6 12 7.8 12 10C12 11.8 13.2 13.3 14.8 13.8C15.2 13.9 15.6 14 16 14C16.4 14 16.8 13.9 17.2 13.8C18.8 13.3 20 11.8 20 10C20 7.8 18.2 6 16 6Z" fill="#0D2E5C" />
          <circle cx="16" cy="10" r="1.5" fill="#1AD7FF" />
          <path d="M10 20C12 21.5 15 22 16 22C17 22 20 21.5 22 20" stroke="#0D2E5C" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  // 2. ORANGE MONEY (Deep Orange #FF7900 & Charcoal)
  if (m.includes('orange')) {
    return (
      <div className={`relative flex items-center justify-center rounded-xl bg-[#111113] border border-orange-500/40 shadow-md shadow-orange-500/20 overflow-hidden shrink-0 ${sizeClasses} ${className}`}>
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/30 via-transparent to-transparent"></div>
        <div className="w-5 h-5 rounded-md bg-[#FF7900] flex items-center justify-center shadow">
          <span className="text-[10px] font-black text-black tracking-tighter">om</span>
        </div>
      </div>
    );
  }

  // 3. MTN MOBILE MONEY (Vibrant Yellow #FFCC00 & Navy)
  if (m.includes('mtn')) {
    return (
      <div className={`relative flex items-center justify-center rounded-xl bg-[#FFCC00] shadow-md shadow-yellow-500/30 overflow-hidden shrink-0 ${sizeClasses} ${className}`}>
        <div className="flex flex-col items-center justify-center leading-none">
          <span className="text-[9px] font-black text-[#002B49] tracking-tighter uppercase">MTN</span>
          <span className="text-[7px] font-extrabold text-[#D9001B] tracking-tight">MoMo</span>
        </div>
      </div>
    );
  }

  // 4. MOOV MONEY (Blue #005BAC & Bright Green)
  if (m.includes('moov')) {
    return (
      <div className={`relative flex items-center justify-center rounded-xl bg-gradient-to-br from-[#005BAC] to-[#003B70] shadow-md shadow-blue-500/20 overflow-hidden shrink-0 ${sizeClasses} ${className}`}>
        <div className="flex items-center justify-center gap-0.5">
          <span className="text-[10px] font-black text-white tracking-tight">moov</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#8BC53F] shadow-sm"></span>
        </div>
      </div>
    );
  }

  // 5. FREE MONEY (Senegal) (Red #E41B23)
  if (m.includes('free')) {
    return (
      <div className={`relative flex items-center justify-center rounded-xl bg-gradient-to-br from-[#E41B23] to-[#B00E15] shadow-md shadow-red-500/20 overflow-hidden shrink-0 ${sizeClasses} ${className}`}>
        <span className="text-[10px] font-black text-white italic tracking-tighter">free</span>
      </div>
    );
  }

  // 6. TOGOCEL / T-MONEY (Togo) (Forest Green & Gold)
  if (m.includes('togo') || m.includes('t-money') || m.includes('tmoney')) {
    return (
      <div className={`relative flex items-center justify-center rounded-xl bg-gradient-to-br from-[#008542] to-[#005A2D] shadow-md shadow-emerald-500/20 overflow-hidden shrink-0 ${sizeClasses} ${className}`}>
        <div className="flex flex-col items-center justify-center leading-none">
          <span className="text-[9px] font-black text-white tracking-tighter">T-Money</span>
          <span className="text-[6px] font-semibold text-[#FFD100]">TOGO</span>
        </div>
      </div>
    );
  }

  // 7. CELTIIS CASH (Benin) (Purple #5A2D81)
  if (m.includes('celtiis')) {
    return (
      <div className={`relative flex items-center justify-center rounded-xl bg-gradient-to-br from-[#6C2586] to-[#451259] shadow-md shadow-purple-500/20 overflow-hidden shrink-0 ${sizeClasses} ${className}`}>
        <span className="text-[9px] font-black text-white tracking-tight">celtiis</span>
      </div>
    );
  }

  // 8. AIRTEL MONEY (Red & White)
  if (m.includes('airtel')) {
    return (
      <div className={`relative flex items-center justify-center rounded-xl bg-gradient-to-br from-[#FF0000] to-[#C40000] shadow-md shadow-red-500/20 overflow-hidden shrink-0 ${sizeClasses} ${className}`}>
        <div className="flex flex-col items-center justify-center leading-none">
          <span className="text-[9px] font-black text-white tracking-tighter">airtel</span>
          <span className="text-[6px] font-bold text-white/90">money</span>
        </div>
      </div>
    );
  }

  // 9. VODACOM M-PESA (Red & Green)
  if (m.includes('vodacom') || m.includes('mpesa')) {
    return (
      <div className={`relative flex items-center justify-center rounded-xl bg-gradient-to-br from-[#E60000] to-[#990000] shadow-md shadow-red-500/20 overflow-hidden shrink-0 ${sizeClasses} ${className}`}>
        <div className="flex flex-col items-center justify-center leading-none">
          <span className="text-[9px] font-black text-white tracking-tighter">M-PESA</span>
          <span className="text-[6px] font-bold text-[#43B02A]">vodacom</span>
        </div>
      </div>
    );
  }

  // 10. WIZALL (Senegal)
  if (m.includes('wizall')) {
    return (
      <div className={`relative flex items-center justify-center rounded-xl bg-gradient-to-br from-[#4A154B] to-[#2B0C2C] shadow-md overflow-hidden shrink-0 ${sizeClasses} ${className}`}>
        <span className="text-[9px] font-black text-[#00D2FF] tracking-tighter">wizall</span>
      </div>
    );
  }

  // 11. CARTE BANCAIRE (Visa / MasterCard)
  if (m === 'card' || m === 'carte') {
    return (
      <div className={`relative flex items-center justify-center rounded-xl bg-gradient-to-br from-[#1E293B] to-[#0F172A] border border-slate-700 shadow-md overflow-hidden shrink-0 ${sizeClasses} ${className}`}>
        <div className="flex items-center gap-0.5">
          <span className="w-3 h-3 rounded-full bg-[#EB001B] opacity-90"></span>
          <span className="w-3 h-3 rounded-full bg-[#F79E1B] opacity-90 -ml-1.5"></span>
        </div>
      </div>
    );
  }

  // 12. CRYPTO (USDT Tether)
  if (m === 'crypto' || m === 'usdt') {
    return (
      <div className={`relative flex items-center justify-center rounded-xl bg-gradient-to-br from-[#26A17B] to-[#1A6B52] shadow-md shadow-teal-500/20 text-white overflow-hidden shrink-0 ${sizeClasses} ${className}`}>
        <span className="text-[11px] font-black tracking-tighter">₮</span>
      </div>
    );
  }

  // Default fallback
  return (
    <div className={`flex items-center justify-center rounded-xl bg-slate-800 text-slate-300 font-bold border border-slate-700 shrink-0 ${sizeClasses} ${className}`}>
      💳
    </div>
  );
};
