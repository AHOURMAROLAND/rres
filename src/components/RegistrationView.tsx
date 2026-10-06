import React, { useState, useEffect } from 'react';
import {
  User as UserIcon,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Globe,
  ArrowRight,
  ArrowLeft,
  Plane,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  KeyRound,
  RefreshCw,
  Send,
} from 'lucide-react';
import { User } from '../types';
import { AuthApi, getApiBaseUrl } from '../services/authApi';
import { COUNTRIES, getCountryByName } from '../data/countries';
import { soundManager } from '../services/sound';

interface RegistrationViewProps {
  onAuthSuccess: (user: User, bets?: any[], transactions?: any[]) => void;
}

export const RegistrationView: React.FC<RegistrationViewProps> = ({ onAuthSuccess }) => {
  const [activeTab, setActiveTab] = useState<'signup' | 'login' | 'forgot_password'>('signup');

  // Sign Up fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState("Côte d'Ivoire");
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [signupStep, setSignupStep] = useState<'form' | 'otp'>('form');
  const [signupOtp, setSignupOtp] = useState('');
  const [otpResendCooldown, setOtpResendCooldown] = useState(0);

  // Email Ping verification state
  const [isPingingEmail, setIsPingingEmail] = useState(false);
  const [emailPingStatus, setEmailPingStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [emailPingError, setEmailPingError] = useState<string | null>(null);

  // Login fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Forgot password fields
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStep, setForgotStep] = useState<'email' | 'reset'>('email');
  const [forgotOtp, setForgotOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isNetworkError, setIsNetworkError] = useState(false);

  const currentApiBase = getApiBaseUrl() || (typeof window !== 'undefined' ? window.location.origin : '');
  const selectedCountry = getCountryByName(country);

  // Cooldown countdown effect
  useEffect(() => {
    if (otpResendCooldown <= 0) return;
    const timer = setInterval(() => {
      setOtpResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpResendCooldown]);

  // Ping email domain on blur
  const handleEmailBlur = async (emailToVerify: string) => {
    const clean = emailToVerify.trim().toLowerCase();
    if (!clean || !clean.includes('@') || !clean.includes('.')) {
      setEmailPingStatus('idle');
      setEmailPingError(null);
      return;
    }

    setIsPingingEmail(true);
    setEmailPingError(null);

    const check = await AuthApi.verifyEmailDomain(clean);
    setIsPingingEmail(false);

    if (!check.valid) {
      setEmailPingStatus('invalid');
      setEmailPingError(check.reason || "Cette adresse email ou ce nom de domaine n'existe pas.");
    } else {
      setEmailPingStatus('valid');
      setEmailPingError(null);
    }
  };

  // Step 1 of Sign Up: Ping domain & send an email OTP
  const handleInitiateSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsNetworkError(false);

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    // 1. Validations
    if (!cleanName) {
      setErrorMessage('Veuillez renseigner votre nom complet.');
      return;
    }
    if (!cleanEmail) {
      setErrorMessage('Veuillez renseigner votre adresse email.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setErrorMessage('Veuillez entrer une adresse email valide (ex: joueur@gmail.com).');
      return;
    }
    if (!country) {
      setErrorMessage('Veuillez sélectionner votre pays de résidence.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Les deux mots de passe ne correspondent pas.');
      return;
    }

    soundManager.playClick();
    setIsLoading(true);

    try {
      // Step A: Ping email domain
      const check = await AuthApi.verifyEmailDomain(cleanEmail);
      if (!check.valid) {
        setEmailPingStatus('invalid');
        setEmailPingError(check.reason || "Cette adresse email ou ce nom de domaine n'existe pas.");
        setErrorMessage(check.reason || "Cette adresse email ou ce nom de domaine n'existe pas.");
        setIsLoading(false);
        return;
      }

      setEmailPingStatus('valid');
      setEmailPingError(null);

      // Step B: Send email OTP code
      const otpRes = await AuthApi.sendRegisterOtp(cleanEmail, cleanName);
      if (!otpRes.success) {
        setErrorMessage(otpRes.message || "Erreur lors de l'envoi du code de vérification.");
        setIsLoading(false);
        return;
      }

      setSuccessMessage(`Code de confirmation envoyé à ${cleanEmail} !`);
      setSignupStep('otp');
      setOtpResendCooldown(60);
      setIsLoading(false);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Erreur réseau : Impossible de contacter le serveur.');
      setIsNetworkError(true);
      setIsLoading(false);
    }
  };

  // Step 2 of Sign Up: Validate OTP & Complete Registration
  const handleConfirmSignupOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanOtp = signupOtp.trim();
    if (!cleanOtp || cleanOtp.length < 4) {
      setErrorMessage('Veuillez saisir le code de vérification à 6 chiffres reçu par email.');
      return;
    }

    soundManager.playClick();
    setIsLoading(true);

    try {
      const response = await AuthApi.register({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        country,
        password,
        otp: cleanOtp,
      });

      if (!response.success || !response.user) {
        setErrorMessage(response.message || "Code de vérification invalide ou expiré.");
        setIsNetworkError(Boolean(response.isNetworkError));
        setIsLoading(false);
        return;
      }

      setIsNetworkError(false);
      setSuccessMessage('Compte validé avec succès ! Bienvenue à bord.');
      soundManager.playCashout();

      setTimeout(() => {
        onAuthSuccess(response.user!, response.bets, response.transactions);
      }, 500);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Erreur réseau : Impossible de contacter le serveur.');
      setIsNetworkError(true);
      setIsLoading(false);
    }
  };

  // Resend OTP
  const handleResendRegisterOtp = async () => {
    if (otpResendCooldown > 0) return;
    soundManager.playClick();
    setIsLoading(true);
    setErrorMessage(null);

    const res = await AuthApi.sendRegisterOtp(email.trim().toLowerCase(), name.trim());
    setIsLoading(false);
    if (res.success) {
      setSuccessMessage(`Nouveau code envoyé à ${email}.`);
      setOtpResendCooldown(60);
    } else {
      setErrorMessage(res.message || "Erreur lors du renvoi du code.");
    }
  };

  // Handle Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsNetworkError(false);

    if (!loginEmail.trim()) {
      setErrorMessage('Veuillez entrer votre adresse email.');
      return;
    }
    if (!loginPassword) {
      setErrorMessage('Veuillez entrer votre mot de passe.');
      return;
    }

    soundManager.playClick();
    setIsLoading(true);

    try {
      const response = await AuthApi.login({
        email: loginEmail.trim().toLowerCase(),
        password: loginPassword,
      });

      if (!response.success || !response.user) {
        setErrorMessage(response.message || 'Identifiants invalides.');
        setIsNetworkError(Boolean(response.isNetworkError));
        setIsLoading(false);
        return;
      }

      setIsNetworkError(false);
      setSuccessMessage(response.message || 'Connexion réussie ! Bon retour sur AeroCrash.');
      soundManager.playCashout();

      setTimeout(() => {
        onAuthSuccess(response.user!, response.bets, response.transactions);
      }, 500);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Erreur réseau : Impossible de contacter le serveur.');
      setIsNetworkError(true);
      setIsLoading(false);
    }
  };

  // Forgot Password Step 1: Send Reset OTP
  const handleForgotRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const clean = forgotEmail.trim().toLowerCase();
    if (!clean) {
      setErrorMessage('Veuillez entrer votre adresse email.');
      return;
    }

    soundManager.playClick();
    setIsLoading(true);

    const check = await AuthApi.verifyEmailDomain(clean);
    if (!check.valid) {
      setErrorMessage(check.reason || "Cette adresse email ou ce nom de domaine n'existe pas.");
      setIsLoading(false);
      return;
    }

    const res = await AuthApi.forgotPasswordRequest(clean);
    setIsLoading(false);

    if (res.success) {
      setSuccessMessage(`Code de réinitialisation envoyé à ${clean}.`);
      setForgotStep('reset');
      setOtpResendCooldown(60);
    } else {
      setErrorMessage(res.message || 'Impossible de réinitialiser ce compte.');
    }
  };

  // Forgot Password Step 2: Confirm OTP & Set New Password
  const handleForgotReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!forgotOtp.trim()) {
      setErrorMessage('Veuillez entrer le code de vérification reçu.');
      return;
    }
    if (newPassword.length < 6) {
      setErrorMessage('Le nouveau mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setErrorMessage('Les deux mots de passe ne correspondent pas.');
      return;
    }

    soundManager.playClick();
    setIsLoading(true);

    const res = await AuthApi.forgotPasswordReset(
      forgotEmail.trim().toLowerCase(),
      forgotOtp.trim(),
      newPassword
    );
    setIsLoading(false);

    if (res.success) {
      setSuccessMessage('Mot de passe mis à jour avec succès ! Vous pouvez maintenant vous connecter.');
      setLoginEmail(forgotEmail.trim().toLowerCase());
      setForgotStep('email');
      setForgotOtp('');
      setNewPassword('');
      setConfirmNewPassword('');
      setActiveTab('login');
    } else {
      setErrorMessage(res.message || 'Code de réinitialisation invalide ou expiré.');
    }
  };

  return (
    <div className="min-h-screen bg-[#070A11] text-slate-100 flex flex-col justify-between selection:bg-orange-500 selection:text-white relative overflow-hidden">
      {/* Dynamic Background Glows */}
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-orange-600/15 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute top-1/3 -left-32 w-80 h-80 bg-red-600/10 blur-[100px] rounded-full pointer-events-none" />
      <div className="absolute bottom-10 -right-32 w-80 h-80 bg-emerald-600/10 blur-[100px] rounded-full pointer-events-none" />

      {/* Top Brand Bar */}
      <header className="w-full max-w-7xl mx-auto px-4 py-5 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2.5 select-none">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-500 via-red-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/30 border border-orange-400/40">
            <Plane className="w-5 h-5 text-white transform -rotate-12" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-black text-2xl tracking-wider text-white">
                AERO<span className="text-orange-500">CRASH</span>
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1" />
                LIVE
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-medium tracking-wide">
              Jeu de Crash Multijoueur Provably Fair & Paiement Instantané
            </span>
          </div>
        </div>
      </header>

      {/* Main Registration / Login Screen */}
      <main className="flex-1 flex items-center justify-center px-4 py-6 sm:py-10 relative z-10">
        <div className="w-full max-w-md">
          {/* Card Container */}
          <div className="bg-[#0D121F]/90 backdrop-blur-xl border border-slate-800/90 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/80 relative">
            {/* Top Switcher: Inscription / Connexion */}
            {activeTab !== 'forgot_password' ? (
              <div className="flex rounded-xl bg-slate-950 p-1 mb-6 border border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    soundManager.playClick();
                    setActiveTab('signup');
                    setErrorMessage(null);
                  }}
                  className={`flex-1 py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                    activeTab === 'signup'
                      ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/20'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Inscription
                </button>
                <button
                  type="button"
                  onClick={() => {
                    soundManager.playClick();
                    setActiveTab('login');
                    setErrorMessage(null);
                  }}
                  className={`flex-1 py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                    activeTab === 'login'
                      ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/20'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Connexion
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-6 text-xs font-bold text-orange-400">
                <button
                  type="button"
                  onClick={() => {
                    soundManager.playClick();
                    setActiveTab('login');
                    setErrorMessage(null);
                    setSuccessMessage(null);
                  }}
                  className="flex items-center gap-1.5 hover:text-orange-300 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Retour à la connexion</span>
                </button>
              </div>
            )}

            {/* Success Message Banner */}
            {successMessage && (
              <div className="mb-5 p-3.5 rounded-xl bg-emerald-950/80 border border-emerald-500/60 text-emerald-200 text-xs flex items-center gap-2.5 animate-fadeIn shadow-lg shadow-emerald-950/40">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="leading-relaxed font-semibold">{successMessage}</span>
              </div>
            )}

            {/* Error Message Box */}
            {errorMessage && (
              <div className="mb-5 p-3.5 rounded-xl bg-red-950/70 border border-red-700/60 text-red-200 text-xs flex flex-col gap-2.5 animate-shake">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed font-medium">{errorMessage}</span>
                </div>

                {isNetworkError && (
                  <div className="pt-2.5 mt-1 border-t border-red-900/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                    <div className="text-[11px] text-red-300">
                      <span>Cible Netlify : </span>
                      <code className="bg-black/50 px-1.5 py-0.5 rounded text-amber-300 font-mono text-[10px]">
                        {currentApiBase ? `${currentApiBase}/.netlify/functions/register` : '/.netlify/functions/register'}
                      </code>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        soundManager.playCashout();
                        const fallbackUser = AuthApi.createLocalSession({
                          name: name.trim() || 'Pilote AeroCrash',
                          email: (activeTab === 'signup' ? email : loginEmail).trim() || 'joueur@aerocrash.live',
                          country,
                          password: password || '123456',
                        });
                        onAuthSuccess(fallbackUser);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-[11px] transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Continuer en mode local (Sans attente)</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ========================================================= */}
            {/* 1. INSCRIPTION                                            */}
            {/* ========================================================= */}
            {activeTab === 'signup' && (
              signupStep === 'form' ? (
                <form onSubmit={handleInitiateSignup} className="space-y-4">
                  <div>
                    <h1 className="text-xl font-display font-black text-white">
                      Créer votre compte
                    </h1>
                    <p className="text-xs text-slate-400 mt-1">
                      Inscrivez-vous pour débloquer votre portefeuille et voler en multijoueur.
                    </p>
                  </div>

                  {/* Nom complet */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Nom complet <span className="text-orange-400">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <UserIcon className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="ex: Amadou Diallo"
                        className="w-full bg-slate-900/90 border border-slate-700/90 rounded-xl py-2.5 pl-10 pr-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
                      />
                    </div>
                  </div>

                  {/* Email with Real-time Ping */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-300">
                        Adresse Email <span className="text-orange-400">*</span>
                      </label>
                      {isPingingEmail && (
                        <span className="text-[10px] text-orange-400 flex items-center gap-1">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          Vérification DNS...
                        </span>
                      )}
                      {!isPingingEmail && emailPingStatus === 'valid' && (
                        <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-semibold">
                          <CheckCircle2 className="w-3 h-3" />
                          Serveur mail actif
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        type="email"
                        required
                        value={email}
                        onBlur={(e) => handleEmailBlur(e.target.value)}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (emailPingStatus !== 'idle') {
                            setEmailPingStatus('idle');
                            setEmailPingError(null);
                          }
                        }}
                        placeholder="ex: joueur@gmail.com"
                        className={`w-full bg-slate-900/90 border rounded-xl py-2.5 pl-10 pr-3 text-sm text-white placeholder-slate-500 focus:outline-none transition-all ${
                          emailPingStatus === 'invalid'
                            ? 'border-red-500 focus:ring-1 focus:ring-red-500'
                            : emailPingStatus === 'valid'
                            ? 'border-emerald-500/80 focus:ring-1 focus:ring-emerald-500'
                            : 'border-slate-700/90 focus:border-orange-500 focus:ring-1 focus:ring-orange-500'
                        }`}
                      />
                    </div>
                    {emailPingError && (
                      <p className="text-[11px] text-red-400 mt-1.5 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        <span>{emailPingError}</span>
                      </p>
                    )}
                  </div>

                  {/* Pays & Code Téléphonique dynamique */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-300">
                        Pays de résidence <span className="text-orange-400">*</span>
                      </label>
                      <span className="text-[11px] font-mono-num font-bold text-orange-400">
                        Indicatif : {selectedCountry.dialCode}
                      </span>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Globe className="w-4 h-4" />
                      </div>
                      <select
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className="w-full bg-slate-900/90 border border-slate-700/90 rounded-xl py-2.5 pl-10 pr-3 text-sm text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all cursor-pointer"
                      >
                        {COUNTRIES.map((c) => (
                          <option key={c.code} value={c.name} className="bg-slate-900 text-white">
                            {c.flag} {c.name} ({c.dialCode})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Mot de passe */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Mot de passe (6 car. min.) <span className="text-orange-400">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-slate-900/90 border border-slate-700/90 rounded-xl py-2.5 pl-10 pr-10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirmer Mot de passe */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Confirmer le mot de passe <span className="text-orange-400">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-slate-900/90 border border-slate-700/90 rounded-xl py-2.5 pl-10 pr-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all font-mono"
                      />
                    </div>
                  </div>

                  {/* Submit Step 1 Button */}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-display font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 shadow-xl shadow-orange-600/30 transition-all active:scale-98 cursor-pointer disabled:opacity-50 mt-2"
                  >
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Vérification & Envoi du code...
                      </span>
                    ) : (
                      <>
                        <span>Continuer & Recevoir mon code</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  <div className="text-center pt-2">
                    <p className="text-xs text-slate-400">
                      Vous avez déjà un compte ?{' '}
                      <button
                        type="button"
                        onClick={() => {
                          soundManager.playClick();
                          setActiveTab('login');
                          setErrorMessage(null);
                        }}
                        className="text-orange-400 hover:text-orange-300 font-bold underline cursor-pointer"
                      >
                        Se connecter
                      </button>
                    </p>
                  </div>
                </form>
              ) : (
                /* Step 2: Saisie du code OTP */
                <form onSubmit={handleConfirmSignupOtp} className="space-y-4">
                  <div>
                    <h1 className="text-xl font-display font-black text-white flex items-center gap-2">
                      <KeyRound className="w-5 h-5 text-orange-400" />
                      <span>Confirmer votre email</span>
                    </h1>
                    <p className="text-xs text-slate-300 mt-1">
                      Un code à 6 chiffres a été envoyé par email à :
                    </p>
                    <p className="text-xs text-orange-400 font-bold font-mono mt-0.5">
                      {email}
                    </p>
                  </div>

                  {/* Input OTP 6 chiffres */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-2">
                      Code de vérification (OTP)
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      autoFocus
                      required
                      value={signupOtp}
                      onChange={(e) => setSignupOtp(e.target.value.replace(/\D/g, ''))}
                      placeholder="• • • • • •"
                      className="w-full text-center tracking-[12px] text-2xl font-mono font-black py-3 rounded-xl bg-slate-950 border-2 border-orange-500/80 text-orange-400 outline-none focus:border-orange-400 shadow-inner"
                    />
                    <p className="text-[11px] text-slate-500 text-center mt-1.5">
                      Vérifiez également votre dossier Spams / Courrier indésirable.
                    </p>
                  </div>

                  {/* Validation Button */}
                  <button
                    type="submit"
                    disabled={isLoading || signupOtp.length < 4}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-display font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 shadow-xl shadow-orange-600/30 transition-all active:scale-98 cursor-pointer disabled:opacity-50"
                  >
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Validation du code...
                      </span>
                    ) : (
                      <>
                        <CheckCircle2 className="w-5 h-5" />
                        <span>Valider le code & Jouer</span>
                      </>
                    )}
                  </button>

                  {/* Resend and back controls */}
                  <div className="flex items-center justify-between pt-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setSignupStep('form')}
                      className="text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Modifier l'email</span>
                    </button>

                    <button
                      type="button"
                      disabled={otpResendCooldown > 0 || isLoading}
                      onClick={handleResendRegisterOtp}
                      className={`font-semibold cursor-pointer ${
                        otpResendCooldown > 0
                          ? 'text-slate-600 cursor-not-allowed'
                          : 'text-orange-400 hover:text-orange-300 underline'
                      }`}
                    >
                      {otpResendCooldown > 0
                        ? `Renvoyer (${otpResendCooldown}s)`
                        : 'Renvoyer un code'}
                    </button>
                  </div>
                </form>
              )
            )}

            {/* ========================================================= */}
            {/* 2. CONNEXION                                              */}
            {/* ========================================================= */}
            {activeTab === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <h1 className="text-xl font-display font-black text-white">
                    Connexion
                  </h1>
                  <p className="text-xs text-slate-400 mt-1">
                    Connectez-vous pour retrouver votre solde et reprendre votre partie.
                  </p>
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Adresse Email
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      required
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="joueur@gmail.com"
                      className="w-full bg-slate-900/90 border border-slate-700/90 rounded-xl py-2.5 pl-10 pr-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-300">
                      Mot de passe
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        soundManager.playClick();
                        setForgotEmail(loginEmail);
                        setActiveTab('forgot_password');
                        setErrorMessage(null);
                        setSuccessMessage(null);
                      }}
                      className="text-[11px] text-orange-400 hover:text-orange-300 font-semibold cursor-pointer underline"
                    >
                      Mot de passe oublié ?
                    </button>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-slate-900/90 border border-slate-700/90 rounded-xl py-2.5 pl-10 pr-10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-display font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 shadow-xl shadow-orange-600/30 transition-all active:scale-98 cursor-pointer disabled:opacity-50 mt-2"
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Connexion en cours...
                    </span>
                  ) : (
                    <>
                      <span>Se connecter & Jouer</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <div className="text-center pt-2">
                  <p className="text-xs text-slate-400">
                    Pas encore de compte ?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        soundManager.playClick();
                        setActiveTab('signup');
                        setErrorMessage(null);
                      }}
                      className="text-orange-400 hover:text-orange-300 font-bold underline cursor-pointer"
                    >
                      S'inscrire maintenant
                    </button>
                  </p>
                </div>
              </form>
            )}

            {/* ========================================================= */}
            {/* 3. MOT DE PASSE OUBLIÉ                                    */}
            {/* ========================================================= */}
            {activeTab === 'forgot_password' && (
              forgotStep === 'email' ? (
                <form onSubmit={handleForgotRequest} className="space-y-4">
                  <div>
                    <h1 className="text-xl font-display font-black text-white">
                      Mot de passe oublié ?
                    </h1>
                    <p className="text-xs text-slate-400 mt-1">
                      Entrez votre adresse email. Nous allons vérifier son existence et vous envoyer un code sécurisé.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Votre adresse email enregistrée
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        type="email"
                        required
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="votre.email@domaine.com"
                        className="w-full bg-slate-900/90 border border-slate-700/90 rounded-xl py-2.5 pl-10 pr-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-display font-extrabold text-sm flex items-center justify-center gap-2 shadow-xl shadow-orange-600/30 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Vérification & Envoi du code...
                      </span>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Envoyer le code de réinitialisation</span>
                      </>
                    )}
                  </button>
                </form>
              ) : (
                /* Step 2: Code + Nouveau mot de passe */
                <form onSubmit={handleForgotReset} className="space-y-4">
                  <div>
                    <h1 className="text-xl font-display font-black text-white">
                      Nouveau mot de passe
                    </h1>
                    <p className="text-xs text-slate-300 mt-1">
                      Un code de réinitialisation a été envoyé à :
                    </p>
                    <p className="text-xs text-orange-400 font-bold font-mono">
                      {forgotEmail}
                    </p>
                  </div>

                  {/* Code OTP */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Code de réinitialisation (OTP)
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      required
                      value={forgotOtp}
                      onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, ''))}
                      placeholder="• • • • • •"
                      className="w-full text-center tracking-[10px] text-xl font-mono font-bold py-2.5 rounded-xl bg-slate-950 border border-orange-500/80 text-orange-400 outline-none"
                    />
                  </div>

                  {/* Nouveau mot de passe */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Nouveau mot de passe (6 car. min.)
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-slate-900/90 border border-slate-700/90 rounded-xl py-2.5 px-3 text-sm text-white placeholder-slate-500 font-mono outline-none focus:border-orange-500"
                    />
                  </div>

                  {/* Confirmer nouveau mot de passe */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Confirmer le nouveau mot de passe
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-slate-900/90 border border-slate-700/90 rounded-xl py-2.5 px-3 text-sm text-white placeholder-slate-500 font-mono outline-none focus:border-orange-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-display font-extrabold text-sm flex items-center justify-center gap-2 shadow-xl shadow-orange-600/30 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Mise à jour en cours...
                      </span>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Changer mon mot de passe</span>
                      </>
                    )}
                  </button>

                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={() => setForgotStep('email')}
                      className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
                    >
                      Renvoyer un nouveau code
                    </button>
                  </div>
                </form>
              )
            )}

            {/* Form Close */}
          </div>
        </div>
      </main>

      {/* Trust Footer */}
      <footer className="w-full max-w-7xl mx-auto px-4 py-4 text-center text-xs text-slate-500 relative z-10 border-t border-slate-850">
        <p>© {new Date().getFullYear()} AeroCrash Gaming. Jeu réservé aux personnes majeures (+18). Jouez de manière responsable.</p>
      </footer>
    </div>
  );
};
