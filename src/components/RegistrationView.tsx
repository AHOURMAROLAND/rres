import React, { useState } from 'react';
import {
  User as UserIcon,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Globe,
  ArrowRight,
  Plane,
  Zap,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Smartphone,
} from 'lucide-react';
import { User } from '../types';
import { AuthApi, getApiBaseUrl } from '../services/authApi';
import { COUNTRIES } from '../data/countries';
import { soundManager } from '../services/sound';

interface RegistrationViewProps {
  onAuthSuccess: (user: User, bets?: any[], transactions?: any[]) => void;
}

export const RegistrationView: React.FC<RegistrationViewProps> = ({ onAuthSuccess }) => {
  const [activeTab, setActiveTab] = useState<'signup' | 'login'>('signup');

  // Sign Up fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState("Côte d'Ivoire");
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Login fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isNetworkError, setIsNetworkError] = useState(false);

  const currentApiBase = getApiBaseUrl() || (typeof window !== 'undefined' ? window.location.origin : '');

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsNetworkError(false);

    // 1. Validation
    if (!name.trim()) {
      setErrorMessage('Veuillez renseigner votre nom complet.');
      return;
    }
    if (!email.trim()) {
      setErrorMessage('Veuillez renseigner votre adresse email.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
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
      const response = await AuthApi.register({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        country,
        password,
      });

      if (!response.success || !response.user) {
        setErrorMessage(response.message || "Échec de l'inscription. Veuillez réessayer.");
        setIsNetworkError(Boolean(response.isNetworkError));
        setIsLoading(false);
        return;
      }

      setIsNetworkError(false);
      setSuccessMessage(response.message || 'Inscription réussie ! Bienvenue sur AeroCrash.');
      soundManager.playCashout();

      // Clean delay so the user sees explicit success confirmation
      setTimeout(() => {
        onAuthSuccess(response.user!, response.bets, response.transactions);
      }, 500);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Erreur réseau : Impossible de contacter le serveur.');
      setIsNetworkError(true);
      setIsLoading(false);
    }
  };

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
              Jeu de Crash Multijoueur en Ligne
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

            {activeTab === 'signup' ? (
              /* ========================================================= */
              /* 1. FORMULAIRE D'INSCRIPTION                               */
              /* ========================================================= */
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <h1 className="text-xl font-display font-black text-white">
                    Créer votre compte
                  </h1>
                  <p className="text-xs text-slate-400 mt-1">
                    Inscrivez-vous pour accéder à l'interface de jeu AeroCrash.
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
                      placeholder="ex: Amadou Traoré"
                      className="w-full bg-slate-900/90 border border-slate-700/90 rounded-xl py-2.5 pl-10 pr-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Adresse Email <span className="text-orange-400">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="ex: joueur@gmail.com"
                      className="w-full bg-slate-900/90 border border-slate-700/90 rounded-xl py-2.5 pl-10 pr-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
                    />
                  </div>
                </div>

                {/* Pays */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Pays de résidence <span className="text-orange-400">*</span>
                  </label>
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
                          {c.flag} {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Mot de passe */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Mot de passe (6 caractères min.) <span className="text-orange-400">*</span>
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

                {/* Confirmation Mot de passe */}
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

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-display font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 shadow-xl shadow-orange-600/30 transition-all active:scale-98 cursor-pointer disabled:opacity-50 mt-2"
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Création du compte...
                    </span>
                  ) : (
                    <>
                      <span>Créer mon compte & Jouer</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                {/* Switch to login prompt */}
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
              /* ========================================================= */
              /* 2. FORMULAIRE DE CONNEXION                                */
              /* ========================================================= */
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
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Mot de passe
                  </label>
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
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Connexion en cours...
                    </span>
                  ) : (
                    <>
                      <span>Se connecter & Jouer</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                {/* Switch to sign up */}
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
