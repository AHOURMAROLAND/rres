import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Globe,
  CheckCircle2,
  AlertCircle,
  LogOut,
  Wallet,
  ShieldCheck,
  ArrowRight,
  Database,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { User as UserType } from '../types';
import { soundManager } from '../services/sound';
import { AuthApi } from '../services/authApi';
import { StorageService } from '../services/storage';
import { isSupabaseConfigured } from '../services/supabase';

const WEST_AFRICA_COUNTRIES = [
  { code: 'CI', name: 'Côte d\'Ivoire', flag: '🇨🇮' },
  { code: 'SN', name: 'Sénégal', flag: '🇸🇳' },
  { code: 'ML', name: 'Mali', flag: '🇲🇱' },
  { code: 'BF', name: 'Burkina Faso', flag: '🇧🇫' },
  { code: 'BJ', name: 'Bénin', flag: '🇧🇯' },
  { code: 'TG', name: 'Togo', flag: '🇹🇬' },
  { code: 'CM', name: 'Cameroun', flag: '🇨🇲' },
  { code: 'GN', name: 'Guinée', flag: '🇬🇳' },
  { code: 'CG', name: 'Congo', flag: '🇨🇬' },
  { code: 'GA', name: 'Gabon', flag: '🇬🇦' },
  { code: 'NE', name: 'Niger', flag: '🇳🇪' },
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'BE', name: 'Belgique', flag: '🇧🇪' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦' },
  { code: 'OTHER', name: 'Autre pays', flag: '🌍' },
];

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserType;
  onUpdateUser: (updated: UserType) => void;
  onOpenActivation: () => void;
  onLogout?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUpdateUser,
  onOpenActivation,
  onLogout,
}) => {
  const isUserAuthenticated = AuthApi.isLoggedIn();

  // Tab state: 'signup' | 'login' | 'profile'
  const [tab, setTab] = useState<'signup' | 'login' | 'profile'>(
    isUserAuthenticated ? 'profile' : 'signup'
  );

  // Sign up fields
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupCountry, setSignupCountry] = useState('Côte d\'Ivoire');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');

  // Login fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Sync tab when modal opens or auth state changes
  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setSuccessMessage(null);
      setTab(AuthApi.isLoggedIn() ? 'profile' : 'signup');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Handle Sign Up
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    // Validation
    if (!signupName.trim() || !signupEmail.trim() || !signupCountry || !signupPassword) {
      setErrorMessage('Veuillez renseigner tous les champs obligatoires.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(signupEmail.trim())) {
      setErrorMessage('Format d\'adresse email invalide. Exemple: nom@domaine.com');
      return;
    }

    if (signupPassword.length < 6) {
      setErrorMessage('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }

    if (signupPassword !== signupConfirmPassword) {
      setErrorMessage('Les deux mots de passe ne correspondent pas.');
      return;
    }

    setIsLoading(true);
    soundManager.playClick();

    try {
      const response = await AuthApi.register({
        name: signupName.trim(),
        email: signupEmail.trim().toLowerCase(),
        country: signupCountry,
        password: signupPassword,
      });

      if (!response.success) {
        setErrorMessage(response.message || 'Échec de la création du compte.');
        setIsLoading(false);
        return;
      }

      soundManager.playCashout();
      setSuccessMessage('Compte créé avec succès ! Vos données sont sécurisées.');

      if (response.user) {
        const newUser: UserType = {
          id: response.user.id,
          name: response.user.name,
          email: response.user.email,
          country: response.user.country,
          phoneOrEmail: response.user.email || signupEmail.trim(),
          isActivated: response.user.isActivated || false,
          balance: response.user.balance || 0,
          createdAt: response.user.createdAt || Date.now(),
        };
        StorageService.setCurrentUser(newUser, response.bets, response.transactions);
        onUpdateUser(newUser);
      }

      setTimeout(() => {
        setIsLoading(false);
        setTab('profile');
      }, 1200);
    } catch {
      setErrorMessage('Une erreur de communication est survenue. Veuillez réessayer.');
      setIsLoading(false);
    }
  };

  // Handle Login
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!loginEmail.trim() || !loginPassword) {
      setErrorMessage('Veuillez entrer votre email et votre mot de passe.');
      return;
    }

    setIsLoading(true);
    soundManager.playClick();

    try {
      const response = await AuthApi.login({
        email: loginEmail.trim().toLowerCase(),
        password: loginPassword,
      });

      if (!response.success) {
        setErrorMessage(response.message || 'Email ou mot de passe incorrect.');
        setIsLoading(false);
        return;
      }

      soundManager.playCashout();
      setSuccessMessage(response.message || 'Connexion réussie ! Vos données ont été récupérées.');

      if (response.user) {
        const loggedUser: UserType = {
          id: response.user.id,
          name: response.user.name,
          email: response.user.email,
          country: response.user.country,
          phoneOrEmail: response.user.email || loginEmail.trim(),
          isActivated: response.user.isActivated || false,
          balance: response.user.balance || 0,
          createdAt: response.user.createdAt || Date.now(),
        };
        StorageService.setCurrentUser(loggedUser, response.bets, response.transactions);
        onUpdateUser(loggedUser);
      }

      setTimeout(() => {
        setIsLoading(false);
        setTab('profile');
      }, 1000);
    } catch {
      setErrorMessage('Erreur de connexion. Vérifiez votre réseau.');
      setIsLoading(false);
    }
  };

  // Handle Logout
  const handleLogout = () => {
    soundManager.playClick();
    AuthApi.clearToken();
    if (onLogout) {
      onLogout();
      return;
    }
    const guestUser: UserType = {
      id: 'usr_' + Math.random().toString(36).substring(2, 9),
      name: 'Pilote Invité',
      phoneOrEmail: '+225 07 00 00 00',
      isActivated: false,
      balance: 0,
      createdAt: Date.now(),
    };
    onUpdateUser(guestUser);
    setSuccessMessage('Déconnexion effectuée.');
    setTimeout(() => {
      setTab('login');
      setSuccessMessage(null);
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
      <div className="relative w-full max-w-md bg-[#0C101C] border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden max-h-[94vh] flex flex-col my-auto text-slate-200">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 text-white flex items-center justify-center shadow-lg shadow-orange-500/20 shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-bold text-lg text-white tracking-tight">
                {tab === 'signup' && 'Créer un Compte AeroCrash'}
                {tab === 'login' && 'Connexion Joueur'}
                {tab === 'profile' && 'Mon Profil & Sécurité'}
              </h2>
              <p className="text-xs text-slate-400">
                {tab === 'signup' && 'Sauvegarde de vos gains, solde et historique'}
                {tab === 'login' && 'Retrouvez votre solde et vos paris enregistrés'}
                {tab === 'profile' && 'Session active et données synchronisées'}
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

        {/* Tab Switcher (Sign Up / Login / Profil) */}
        <div className="px-4 sm:px-5 pt-3 shrink-0">
          <div className="grid grid-cols-2 p-1 rounded-2xl bg-slate-950 border border-slate-800/80 text-xs font-bold">
            <button
              onClick={() => {
                setTab('signup');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`py-2 px-3 rounded-xl transition-all cursor-pointer text-center ${
                tab === 'signup'
                  ? 'bg-orange-500 text-white shadow-md shadow-orange-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Inscription (Nouveau)
            </button>
            <button
              onClick={() => {
                setTab(AuthApi.isLoggedIn() ? 'profile' : 'login');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`py-2 px-3 rounded-xl transition-all cursor-pointer text-center ${
                tab === 'login' || tab === 'profile'
                  ? 'bg-orange-500 text-white shadow-md shadow-orange-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {AuthApi.isLoggedIn() ? 'Mon Profil Actif' : 'Connexion (Login)'}
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          {/* Notifications */}
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-red-950/50 border border-red-500/40 text-red-200 text-xs flex items-start gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 rounded-2xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2.5 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 1: INSCRIPTION (SIGN UP)                              */}
          {/* ========================================================= */}
          {tab === 'signup' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              {/* Nom complet */}
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Nom complet <span className="text-orange-400">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    required
                    placeholder="ex: Amadou Diallo"
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 text-sm font-semibold text-white placeholder:text-slate-600 outline-none focus:border-orange-500 transition-colors"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Adresse Email <span className="text-orange-400">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                  <input
                    type="email"
                    required
                    placeholder="votre.email@domaine.com"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 text-sm font-semibold text-white placeholder:text-slate-600 outline-none focus:border-orange-500 transition-colors"
                  />
                </div>
              </div>

              {/* Pays (Select) */}
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Pays de résidence <span className="text-orange-400">*</span>
                </label>
                <div className="relative">
                  <Globe className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                  <select
                    value={signupCountry}
                    onChange={(e) => setSignupCountry(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 text-sm font-semibold text-white outline-none focus:border-orange-500 appearance-none cursor-pointer transition-colors"
                  >
                    {WEST_AFRICA_COUNTRIES.map((c) => (
                      <option key={c.code} value={c.name} className="bg-slate-900 text-white">
                        {c.flag} {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Mot de passe */}
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Mot de passe sécurisé (min. 6 car.) <span className="text-orange-400">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    placeholder="••••••••"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 text-sm font-semibold text-white placeholder:text-slate-600 outline-none focus:border-orange-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-3 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirmer le mot de passe */}
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Confirmer le mot de passe <span className="text-orange-400">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    placeholder="••••••••"
                    value={signupConfirmPassword}
                    onChange={(e) => setSignupConfirmPassword(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 text-sm font-semibold text-white placeholder:text-slate-600 outline-none focus:border-orange-500 transition-colors"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-display font-bold text-sm shadow-xl shadow-orange-500/25 transition-all cursor-pointer flex items-center justify-center gap-2 mt-4 disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Création du compte en cours...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Créer mon compte</span>
                  </>
                )}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => setTab('login')}
                  className="text-xs text-slate-400 hover:text-orange-400 transition-colors cursor-pointer"
                >
                  Vous avez déjà un compte ? <span className="text-orange-400 font-bold underline">Se connecter</span>
                </button>
              </div>
            </form>
          )}

          {/* ========================================================= */}
          {/* TAB 2: CONNEXION (LOGIN)                                  */}
          {/* ========================================================= */}
          {tab === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Adresse Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                  <input
                    type="email"
                    required
                    placeholder="votre.email@domaine.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 text-sm font-semibold text-white placeholder:text-slate-600 outline-none focus:border-orange-500 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Mot de passe
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 text-sm font-semibold text-white placeholder:text-slate-600 outline-none focus:border-orange-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-3 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-display font-bold text-sm shadow-xl shadow-orange-500/25 transition-all cursor-pointer flex items-center justify-center gap-2 mt-3 disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Connexion en cours...</span>
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-4 h-4" />
                    <span>Se connecter à mon compte</span>
                  </>
                )}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => setTab('signup')}
                  className="text-xs text-slate-400 hover:text-orange-400 transition-colors cursor-pointer"
                >
                  Pas encore de compte ? <span className="text-orange-400 font-bold underline">Créer un compte</span>
                </button>
              </div>
            </form>
          )}

          {/* ========================================================= */}
          {/* TAB 3: PROFIL UTILISATEUR ACTIF                           */}
          {/* ========================================================= */}
          {tab === 'profile' && (
            <div className="space-y-4">
              {/* Carte Résumé Joueur */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-slate-800 shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center font-bold text-white text-base shadow-md shadow-orange-500/20">
                      {currentUser.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-white text-base">{currentUser.name}</div>
                      <div className="text-xs text-slate-400 font-mono-num">
                        {currentUser.email || currentUser.phoneOrEmail}
                      </div>
                      {currentUser.country && (
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          📍 {currentUser.country}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                      Statut
                    </span>
                    {currentUser.isActivated ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Actif
                      </span>
                    ) : (
                      <button
                        onClick={() => {
                          onClose();
                          onOpenActivation();
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30 animate-pulse cursor-pointer hover:bg-orange-500/30"
                      >
                        À Activer (2 000 F)
                      </button>
                    )}
                  </div>
                </div>

                {/* Solde Card */}
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs text-slate-300 font-semibold">Solde Réel Retirable :</span>
                  </div>
                  <span className="font-display font-black text-emerald-400 text-lg">
                    {currentUser.balance.toLocaleString('fr-FR')} FCFA
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-col gap-2 pt-1">
                {!currentUser.isActivated && (
                  <button
                    onClick={() => {
                      onClose();
                      onOpenActivation();
                    }}
                    className="w-full py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs shadow-md shadow-orange-500/20 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>Activer mon compte pour débloquer les retraits</span>
                  </button>
                )}

                <button
                  onClick={handleLogout}
                  className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-red-400 font-semibold text-xs border border-slate-800 transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Se déconnecter de cette session</span>
                </button>
              </div>
            </div>
          )}

          {/* Sécurité & Stockage Info */}
          <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="font-semibold text-slate-300">Sécurité & Chiffrement</span>
              </div>
              <span className="text-[10px] text-emerald-400 font-mono-num font-bold">
                bcrypt (10 rounds) + JWT
              </span>
            </div>

            <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/60">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-blue-400" />
                <span className="font-semibold text-slate-300">Persistance des Données</span>
              </div>
              <span className="text-[10px] text-slate-400">
                {isSupabaseConfigured ? '🟢 Supabase Cloud + Local' : '🟡 Base de Données Express'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
