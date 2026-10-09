import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Navbar } from './components/Navbar';
import { HistoryRibbon } from './components/HistoryRibbon';
import { CrashCanvas } from './components/CrashCanvas';
import { BetPanel } from './components/BetPanel';
import { AccountActivationModal } from './components/AccountActivationModal';
import { DepositWithdrawModal } from './components/DepositWithdrawModal';
import { ProvablyFairModal } from './components/ProvablyFairModal';
import { ResponsibleGamingModal } from './components/ResponsibleGamingBanner';
import { AuthModal } from './components/AuthModal';
import { LiveBetsTab } from './components/LiveBetsTab';
import { HistoryTab } from './components/HistoryTab';
import { LeaderboardTab } from './components/LeaderboardTab';
import { LiveChatTab } from './components/LiveChatTab';
import { ToastNotification } from './components/ToastNotification';
import { RegistrationView } from './components/RegistrationView';
import { User, GameStatus, Bet, RoundHistoryItem, LivePlayerBet, ToastMessage, GameMode, PaymentMethod, PaymentTransaction } from './types';
import { StorageService, SavedBetRecord } from './services/storage';
import { SupabaseService, isSupabaseConfigured } from './services/supabase';
import { AuthApi } from './services/authApi';
import { soundManager } from './services/sound';
import { calculateCrashMultiplier, calculateCrashMultiplierAsync, generateSeed, sha256 } from './services/provablyFair';
import { Users, History, Trophy, Sparkles, Smartphone, MessageSquare, Wallet, PlusCircle, ArrowRight, LogIn } from 'lucide-react';
import { generateRealisticLiveBets } from './data/virtualPlayers';

export default function App() {
  // 1. User & Wallet State
  const [user, setUser] = useState<User>(() => StorageService.getUser());
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => AuthApi.isLoggedIn());
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => soundManager.isEnabled());
  const [gameMode, setGameMode] = useState<GameMode>('real');
  const [demoBalance, setDemoBalance] = useState<number>(() => {
    const saved = localStorage.getItem('aerocrash_demo_balance');
    return saved ? Number(saved) : 50000;
  });

  // 2. Modals state
  const [isActivationOpen, setIsActivationOpen] = useState<boolean>(false);
  const [isDepositOpen, setIsDepositOpen] = useState<boolean>(false);
  const [isProvablyFairOpen, setIsProvablyFairOpen] = useState<boolean>(false);
  const [selectedInspectRound, setSelectedInspectRound] = useState<RoundHistoryItem | null>(null);
  const [isResponsibleOpen, setIsResponsibleOpen] = useState<boolean>(false);
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);

  // 3. Game Round State
  const [gameStatus, setGameStatus] = useState<GameStatus>('waiting');
  const [currentMultiplier, setCurrentMultiplier] = useState<number>(1.0);
  const [finalMultiplier, setFinalMultiplier] = useState<number>(1.0);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(5.0);
  const [roundNonce, setRoundNonce] = useState<number>(9996);
  const [clientSeed, setClientSeed] = useState<string>(() => StorageService.getClientSeed());
  const [serverSeed, setServerSeed] = useState<string>(() => generateSeed(32));
  const [serverSeedHash, setServerSeedHash] = useState<string>('');

  // 4. Bets state (Dual Panel: 0 and 1)
  const [bets, setBets] = useState<[Bet | null, Bet | null]>([null, null]);

  // 5. Rounds & Community data
  const [roundsHistory, setRoundsHistory] = useState<RoundHistoryItem[]>(() => StorageService.getRoundsHistory());
  const [livePlayerBets, setLivePlayerBets] = useState<LivePlayerBet[]>(() => generateRealisticLiveBets());
  const [activeCommunityTab, setActiveCommunityTab] = useState<'live' | 'history' | 'leaderboard' | 'chat'>('live');
  const [personalHistory, setPersonalHistory] = useState<SavedBetRecord[]>(() => StorageService.getBetHistory());
  const [playerStats, setPlayerStats] = useState(() => StorageService.getStats());

  // 6. Toasts notification queue
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (type: 'success' | 'error' | 'info' | 'warning', title: string, message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Toggle sound
  const handleToggleSound = () => {
    const nextVal = !soundEnabled;
    setSoundEnabled(nextVal);
    soundManager.setEnabled(nextVal);
  };

  // Game Mode Handlers
  const handleToggleGameMode = (mode: GameMode) => {
    setGameMode(mode);
    if (mode === 'demo') {
      addToast('info', 'Mode Démo Activé', 'Testez le jeu gratuitement avec 50 000 FCFA d\'entraînement sans risque.');
    } else {
      addToast('info', 'Mode Réel Activé', 'Participez aux vols avec vos gains réels et retraits Mobile Money.');
    }
  };

  const handleResetDemoBalance = () => {
    soundManager.playClick();
    setDemoBalance(50000);
    localStorage.setItem('aerocrash_demo_balance', '50000');
    addToast('info', 'Solde d\'entraînement rechargé', '50 000 FCFA virtuels crédités pour vos tests.');
  };

  // Generate SHA-256 hash when server seed changes
  useEffect(() => {
    sha256(serverSeed).then((hash) => setServerSeedHash(hash));
  }, [serverSeed]);

  // Initial synchronization with backend / session / Supabase
  useEffect(() => {
    // 0. Check URL query parameters for return from SasPay checkout redirect
    const urlParams = new URLSearchParams(window.location.search);
    const returnPaymentId = urlParams.get('payment_id');
    if (returnPaymentId) {
      AuthApi.checkPaymentStatus(returnPaymentId)
        .then((res) => {
          if (res.success && res.status === 'SUCCESS') {
            soundManager.playCashout();
            addToast('success', 'Paiement validé avec succès !', 'Votre solde a été crédité et votre compte est prêt à jouer.');
            if (res.user) {
              setUser(res.user);
              StorageService.saveUser(res.user);
            } else if (typeof res.balance === 'number') {
              const updated = StorageService.updateBalance(0);
              updated.balance = res.balance;
              updated.isActivated = true;
              StorageService.saveUser(updated);
              setUser({ ...updated });
            }
          }
          window.history.replaceState({}, document.title, window.location.pathname);
        })
        .catch(() => {});
    }

    // 1. If user has active JWT session, restore user account, balance & data
    if (AuthApi.isLoggedIn()) {
      AuthApi.fetchMe()
        .then((res) => {
          if (res.success && res.user) {
            setUser(res.user);
            StorageService.setCurrentUser(res.user, res.bets, res.transactions);
            setPersonalHistory(StorageService.getBetHistory(res.user.id));
            setPlayerStats(StorageService.getStats(res.user.id));
            setIsAuthenticated(true);
          } else {
            AuthApi.clearToken();
            StorageService.clearActiveSession();
            setIsAuthenticated(false);
          }
        })
        .catch(() => {
          // If network issue, restore cached session if available
          const cachedUser = StorageService.getUser();
          if (cachedUser && cachedUser.id !== 'usr_guest') {
            setUser(cachedUser);
            setPersonalHistory(StorageService.getBetHistory(cachedUser.id));
            setPlayerStats(StorageService.getStats(cachedUser.id));
            setIsAuthenticated(true);
          } else {
            setIsAuthenticated(false);
          }
        });
    } else {
      setIsAuthenticated(false);
    }

    // 2. Synchronize with Supabase if credentials are provided
    if (isSupabaseConfigured) {
      SupabaseService.fetchUserProfile(user.id)
        .then((cloudUser) => {
          if (cloudUser) {
            setUser(cloudUser);
            StorageService.saveUser(cloudUser);
          } else {
            SupabaseService.syncUserProfile(user).catch(() => {});
          }
        })
        .catch(() => {});

      SupabaseService.fetchRecentRounds(30)
        .then((cloudRounds) => {
          if (cloudRounds && cloudRounds.length > 0) {
            setRoundsHistory(cloudRounds);
            StorageService.saveRoundsHistory(cloudRounds);
          }
        })
        .catch(() => {});
    }
  }, []);

  // Generate realistic crowd of 42-65 virtual players for each round
  const generateLiveRoomBets = useCallback(() => {
    const generated = generateRealisticLiveBets();
    setLivePlayerBets(generated);
  }, []);

  // Update virtual bots cashout in real time during flight
  const updateLiveRoomBetsFlight = useCallback((mult: number, isCrash: boolean) => {
    setLivePlayerBets((prev) =>
      prev.map((bot) => {
        if (bot.status !== 'betting') return bot;

        if (isCrash) {
          return { ...bot, status: 'crashed' };
        }

        // Cash out when currentMultiplier reaches or exceeds the bot's targetMultiplier
        if (bot.targetMultiplier && mult >= bot.targetMultiplier) {
          const winAmount = Math.floor(bot.betAmount * bot.targetMultiplier * 0.975);
          return {
            ...bot,
            status: 'cashed_out',
            cashoutMultiplier: bot.targetMultiplier,
            winAmount,
          };
        }
        return bot;
      })
    );
  }, []);

  // Merge user's active bets into live bets list so the user is always displayed live in direct
  const allDisplayBets = useMemo<LivePlayerBet[]>(() => {
    const userBetsList: LivePlayerBet[] = [];
    if (bets[0]) {
      userBetsList.push({
        id: bets[0].id,
        username: `${user.name || 'Moi'} (Pari 1)`,
        avatar: '👤',
        betAmount: bets[0].amount,
        cashoutMultiplier: bets[0].cashedOutAt,
        winAmount: bets[0].profit ? bets[0].amount + bets[0].profit : null,
        status: bets[0].status === 'cashed_out' ? 'cashed_out' : bets[0].status === 'crashed' ? 'crashed' : 'betting',
        isCurrentUser: true,
      });
    }
    if (bets[1]) {
      userBetsList.push({
        id: bets[1].id,
        username: `${user.name || 'Moi'} (Pari 2)`,
        avatar: '👤',
        betAmount: bets[1].amount,
        cashoutMultiplier: bets[1].cashedOutAt,
        winAmount: bets[1].profit ? bets[1].amount + bets[1].profit : null,
        status: bets[1].status === 'cashed_out' ? 'cashed_out' : bets[1].status === 'crashed' ? 'crashed' : 'betting',
        isCurrentUser: true,
      });
    }
    return [...userBetsList, ...livePlayerBets];
  }, [bets, user.name, livePlayerBets]);

  // ==========================================
  // CORE FLIGHT & GAME LOOP ENGINE
  // ==========================================
  const gameStatusRef = useRef<GameStatus>('waiting');
  gameStatusRef.current = gameStatus;

  const gameModeRef = useRef<GameMode>(gameMode);
  gameModeRef.current = gameMode;

  const demoBalanceRef = useRef<number>(demoBalance);
  demoBalanceRef.current = demoBalance;

  const lastCountdownTickRef = useRef<number>(5);

  const betsRef = useRef<[Bet | null, Bet | null]>(bets);
  betsRef.current = bets;

  const currentMultRef = useRef<number>(1.0);
  currentMultRef.current = currentMultiplier;

  // Handle user cashout
  const handleCashout = useCallback((panelIndex: 0 | 1) => {
    const activeBet = betsRef.current[panelIndex];
    if (!activeBet || activeBet.status !== 'active' || gameStatusRef.current !== 'flying') {
      return;
    }

    const mult = currentMultRef.current;
    const grossPayout = Math.floor(activeBet.amount * mult);
    const grossProfit = Math.max(0, grossPayout - activeBet.amount);
    const platformFee = Math.round(grossProfit * 0.025); // 2.5% commission
    const netProfit = grossProfit - platformFee;
    const totalReturn = activeBet.amount + netProfit;

    if (gameModeRef.current === 'real') {
      // Credit real user wallet
      const updatedUser = StorageService.updateBalance(totalReturn);
      setUser(updatedUser);
    } else {
      // Credit demo balance
      const nextDemo = demoBalanceRef.current + totalReturn;
      setDemoBalance(nextDemo);
      localStorage.setItem('aerocrash_demo_balance', nextDemo.toString());
    }

    // Update bet record
    const updatedBet: Bet = {
      ...activeBet,
      status: 'cashed_out',
      cashedOutAt: mult,
      profit: netProfit,
    };

    setBets((prev) => {
      const next: [Bet | null, Bet | null] = [...prev];
      next[panelIndex] = updatedBet;
      return next;
    });

    // Save to permanent history
    const record: SavedBetRecord = {
      id: updatedBet.id,
      roundId: `R-${roundNonce}`,
      amount: updatedBet.amount,
      multiplier: mult,
      cashoutMultiplier: mult,
      grossProfit,
      fee: platformFee,
      netProfit,
      won: true,
      timestamp: Date.now(),
    };
    StorageService.addBetRecord(record, gameModeRef.current);
    setPersonalHistory(StorageService.getBetHistory());
    setPlayerStats(StorageService.getStats());

    // Sound and toast feedback
    soundManager.playCashout();
    addToast(
      'success',
      `Gain de +${netProfit.toLocaleString('fr-FR')} FCFA !`,
      `Retiré avec succès à ${mult.toFixed(2)}x (Pari #${panelIndex + 1}${gameModeRef.current === 'demo' ? ' - Démo' : ''})`
    );
  }, [roundNonce]);

  // Main state progression effect
  useEffect(() => {
    let timerId: NodeJS.Timeout;
    let flightAnimId: number;

    // 1. WAITING STATE: 5 seconds countdown
    if (gameStatus === 'waiting') {
      soundManager.stopFlightEngine();
      setCurrentMultiplier(1.0);
      setCountdownSeconds(5.0);
      lastCountdownTickRef.current = 5;
      generateLiveRoomBets();

      const startTime = Date.now();
      const totalCd = 5000;

      const countdownInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, (totalCd - elapsed) / 1000);
        setCountdownSeconds(remaining);

        // Sound tick on each countdown second
        const intSec = Math.ceil(remaining);
        if (intSec !== lastCountdownTickRef.current && intSec > 0 && intSec <= 5) {
          lastCountdownTickRef.current = intSec;
          soundManager.playTick();
        }

        if (remaining <= 0) {
          clearInterval(countdownInterval);

          // Calculate crash multiplier via HMAC_SHA256 (conforme cahier des charges §4)
          // Utilise la version async avec HMAC-SHA256 standard (Web Crypto API)
          // Fallback synchrone si crypto.subtle n'est pas disponible
          calculateCrashMultiplierAsync(serverSeed, clientSeed, roundNonce)
            .then((crashPoint) => {
              setFinalMultiplier(crashPoint);

              // Activate all pending bets
              setBets((prev) => {
                const next: [Bet | null, Bet | null] = [null, null];
                if (prev[0] && prev[0].status === 'pending') {
                  next[0] = { ...prev[0], status: 'active' };
                }
                if (prev[1] && prev[1].status === 'pending') {
                  next[1] = { ...prev[1], status: 'active' };
                }
                return next;
              });

              // Launch flight!
              soundManager.playTakeoff();
              setGameStatus('flying');
            })
            .catch(() => {
              // Fallback synchrone en cas d'erreur crypto
              const crashPoint = calculateCrashMultiplier(serverSeed, clientSeed, roundNonce);
              setFinalMultiplier(crashPoint);
              setBets((prev) => {
                const next: [Bet | null, Bet | null] = [null, null];
                if (prev[0] && prev[0].status === 'pending') {
                  next[0] = { ...prev[0], status: 'active' };
                }
                if (prev[1] && prev[1].status === 'pending') {
                  next[1] = { ...prev[1], status: 'active' };
                }
                return next;
              });
              soundManager.playTakeoff();
              setGameStatus('flying');
            });
        }
      }, 50);

      return () => clearInterval(countdownInterval);
    }

    // 2. FLYING STATE: exponential ascension until crashPoint
    if (gameStatus === 'flying') {
      const flightStart = Date.now();
      const crashPoint = finalMultiplier;

      const flightStep = () => {
        const elapsedSec = (Date.now() - flightStart) / 1000;

        // Exponential curve: 1.00 + (t^1.25) * 0.12 + subtle acceleration
        const mult = Math.floor((1.0 + Math.pow(elapsedSec * 0.95, 1.3) * 0.22) * 100) / 100;

        setCurrentMultiplier(mult);
        soundManager.updateFlightPitch(mult);
        soundManager.playMilestone(mult);
        updateLiveRoomBetsFlight(mult, false);

        // Auto cashout check for Panel 0 and Panel 1
        const currentBets = betsRef.current;
        [0, 1].forEach((idx) => {
          const b = currentBets[idx as 0 | 1];
          if (b && b.status === 'active' && b.autoCashout && mult >= b.autoCashout) {
            handleCashout(idx as 0 | 1);
          }
        });

        // Crash check
        if (mult >= crashPoint) {
          // CRASH TRIGGERED!
          soundManager.playCrash();
          setGameStatus('crashed');
          updateLiveRoomBetsFlight(crashPoint, true);

          // Mark uncashed bets as crashed / lost
          setBets((prev) => {
            const next: [Bet | null, Bet | null] = [...prev];
            [0, 1].forEach((idx) => {
              const b = next[idx as 0 | 1];
              if (b && b.status === 'active') {
                next[idx as 0 | 1] = { ...b, status: 'crashed' };
                // Log loss in history
                const lossRecord: SavedBetRecord = {
                  id: b.id,
                  roundId: `R-${roundNonce}`,
                  amount: b.amount,
                  multiplier: crashPoint,
                  cashoutMultiplier: null,
                  grossProfit: 0,
                  fee: 0,
                  netProfit: 0,
                  won: false,
                  timestamp: Date.now(),
                };
                StorageService.addBetRecord(lossRecord, gameModeRef.current);
              }
            });
            return next;
          });

          setPersonalHistory(StorageService.getBetHistory());
          setPlayerStats(StorageService.getStats());

          // Save round to history ribbon
          const roundItem: RoundHistoryItem = {
            roundId: `R-${roundNonce}`,
            crashMultiplier: crashPoint,
            timestamp: Date.now(),
            serverSeedHash: serverSeedHash || 'hash_' + roundNonce,
            serverSeed,
            clientSeed,
            nonce: roundNonce,
          };
          const updatedRounds = StorageService.addRound(roundItem);
          setRoundsHistory(updatedRounds);

          // Prep next seed and nonce
          setRoundNonce((prev) => prev + 1);
          setServerSeed(generateSeed(32));

          return;
        }

        flightAnimId = requestAnimationFrame(flightStep);
      };

      flightAnimId = requestAnimationFrame(flightStep);
      return () => cancelAnimationFrame(flightAnimId);
    }

    // 3. CRASHED STATE: pause 3.5 seconds to see outcome, then next waiting round
    if (gameStatus === 'crashed') {
      timerId = setTimeout(() => {
        // Reset bets
        setBets([null, null]);
        setGameStatus('waiting');
      }, 3500);

      return () => clearTimeout(timerId);
    }
  }, [gameStatus, finalMultiplier, serverSeed, clientSeed, roundNonce, serverSeedHash, generateLiveRoomBets, updateLiveRoomBetsFlight, handleCashout]);

  // Place bet action
  const handlePlaceBet = (panelIndex: 0 | 1, amount: number, autoCashout: number | null) => {
    if (gameMode === 'real') {
      if (user.balance <= 0 || user.balance < amount) {
        addToast('warning', 'Solde insuffisant', 'Solde insuffisant. Veuillez effectuer un dépôt pour jouer.');
        setIsDepositOpen(true);
        return;
      }

      soundManager.playClick();

      // Deduct stake immediately
      const updatedUser = StorageService.updateBalance(-amount);
      setUser(updatedUser);
    } else {
      // Demo mode
      if (demoBalance < amount) {
        addToast('warning', 'Solde démo insuffisant', 'Réinitialisez votre solde d\'entraînement (50 000 FCFA).');
        return;
      }

      soundManager.playClick();
      const nextDemo = demoBalance - amount;
      setDemoBalance(nextDemo);
      localStorage.setItem('aerocrash_demo_balance', nextDemo.toString());
    }

    const newBet: Bet = {
      id: 'bet_' + Date.now() + '_' + panelIndex,
      panelIndex,
      amount,
      autoCashout,
      cashedOutAt: null,
      profit: null,
      status: 'pending',
    };

    setBets((prev) => {
      const next: [Bet | null, Bet | null] = [...prev];
      next[panelIndex] = newBet;
      return next;
    });

    addToast('info', `Pari #${panelIndex + 1} placé`, `${amount.toLocaleString('fr-FR')} FCFA enregistrés pour le prochain vol`);
  };

  // Cancel bet before flight takeoff
  const handleCancelBet = (panelIndex: 0 | 1) => {
    const bet = bets[panelIndex];
    if (!bet || bet.status !== 'pending') return;

    soundManager.playClick();

    if (gameMode === 'real') {
      // Refund stake
      const updatedUser = StorageService.updateBalance(bet.amount);
      setUser(updatedUser);
    } else {
      // Refund demo balance
      const nextDemo = demoBalance + bet.amount;
      setDemoBalance(nextDemo);
      localStorage.setItem('aerocrash_demo_balance', nextDemo.toString());
    }

    setBets((prev) => {
      const next: [Bet | null, Bet | null] = [...prev];
      next[panelIndex] = null;
      return next;
    });

    addToast('info', `Pari #${panelIndex + 1} annulé`, `${bet.amount.toLocaleString('fr-FR')} FCFA recrédités sur votre solde`);
  };

  // Account activation success callback
  const handleActivateSuccess = (depositAmount: number = 1000) => {
    const updatedUser = StorageService.updateBalance(depositAmount);
    updatedUser.isActivated = true;
    StorageService.saveUser(updatedUser);
    setUser({ ...updatedUser });
    addToast('success', 'Compte Activé !', `+${depositAmount.toLocaleString('fr-FR')} FCFA crédités dans votre portefeuille.`);
  };

  // Deposit success
  const handleDepositSuccess = (amount: number, method: PaymentMethod = 'wave', phone?: string, serverTx?: any) => {
    const updatedUser = StorageService.updateBalance(amount);
    updatedUser.isActivated = true;
    StorageService.saveUser(updatedUser);
    setUser({ ...updatedUser });

    const tx: PaymentTransaction = serverTx || {
      id: 'tx_dep_' + Date.now(),
      userId: user.id,
      type: 'deposit',
      amount,
      method,
      phone: phone || '',
      reference: 'DEP-' + Math.floor(100000 + Math.random() * 900000),
      status: 'success',
      timestamp: Date.now(),
    };
    StorageService.addTransaction(tx, !serverTx);
    addToast('success', 'Dépôt confirmé !', `+${amount.toLocaleString('fr-FR')} FCFA crédités. Votre compte est activé et prêt à jouer !`);
  };

  // Withdraw success
  const handleWithdrawSuccess = (amount: number, method: PaymentMethod = 'wave', phone?: string, serverTx?: any) => {
    const updatedUser = StorageService.updateBalance(-amount);
    setUser({ ...updatedUser });

    const tx: PaymentTransaction = serverTx || {
      id: 'tx_wdr_' + Date.now(),
      userId: user.id,
      type: 'withdraw',
      amount,
      method,
      phone: phone || '',
      reference: 'WDR-' + Math.floor(100000 + Math.random() * 900000),
      status: 'success',
      timestamp: Date.now(),
    };
    StorageService.addTransaction(tx, !serverTx);
    addToast('info', 'Demande de retrait initiée', `${amount.toLocaleString('fr-FR')} FCFA envoyés vers votre compte ${method.toUpperCase()}.`);
  };

  // Auth Success Handler (Sign Up & Login)
  const handleAuthSuccess = (authedUser: User, serverBets?: any[], serverTransactions?: any[]) => {
    setUser(authedUser);
    StorageService.setCurrentUser(authedUser, serverBets, serverTransactions);
    setPersonalHistory(StorageService.getBetHistory(authedUser.id));
    setPlayerStats(StorageService.getStats(authedUser.id));
    setIsAuthenticated(true);
    addToast(
      'success',
      `Bienvenue ${authedUser.name} !`,
      authedUser.balance > 0
        ? `Solde récupéré : ${authedUser.balance.toLocaleString('fr-FR')} FCFA. Vos données sont prêtes.`
        : 'Session active. Effectuez un premier dépôt pour commencer à jouer.'
    );
  };

  // Logout Handler
  const handleLogout = () => {
    soundManager.playClick();
    AuthApi.clearToken();
    StorageService.clearActiveSession();
    setIsAuthenticated(false);
    setIsAuthOpen(false);
    setBets([null, null]);
    addToast('info', 'Déconnexion', 'Vous avez été déconnecté de votre session en toute sécurité.');
  };

  // IF NOT AUTHENTICATED: Display Registration / Sign Up screen first
  if (!isAuthenticated) {
    return (
      <>
        <RegistrationView onAuthSuccess={handleAuthSuccess} />
        <ToastNotification toasts={toasts} onDismiss={removeToast} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#070A11] text-slate-100 flex flex-col justify-between selection:bg-orange-500 selection:text-white w-full max-w-full overflow-x-hidden app-container">
      {/* 1. Header Navbar */}
      <Navbar
        user={user}
        gameMode={gameMode}
        demoBalance={demoBalance}
        soundEnabled={soundEnabled}
        onToggleGameMode={handleToggleGameMode}
        onResetDemoBalance={handleResetDemoBalance}
        onToggleSound={handleToggleSound}
        onOpenActivation={() => setIsActivationOpen(true)}
        onOpenDeposit={() => setIsDepositOpen(true)}
        onOpenResponsibleGaming={() => setIsResponsibleOpen(true)}
        onOpenAuth={() => setIsAuthOpen(true)}
        onLogout={handleLogout}
      />

      {/* 2. Top History Ribbon - Purely informative, non-clickable */}
      <HistoryRibbon rounds={roundsHistory} />

      {/* 3. Sleek Mandatory Deposit / Activation Notice Bar */}
      {gameMode === 'real' && user.balance <= 0 && (
        <div className="w-full max-w-full bg-gradient-to-r from-amber-950/90 via-orange-950/80 to-amber-950/90 border-b border-amber-500/40 px-3 py-2 text-amber-200 shadow-sm">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 flex-wrap text-xs">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Votre compte est activé,</strong> veuillez effectuer un dépôt pour commencer à jouer.
              </span>
            </div>
            <button
              onClick={() => setIsDepositOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-extrabold text-xs shadow-md shadow-emerald-950/60 cursor-pointer transition-all active:scale-95 whitespace-nowrap"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Faire un dépôt</span>
            </button>
          </div>
        </div>
      )}

      {/* 4. Sleek Demo Micro-Notice */}
      {gameMode === 'demo' && (
        <div className="w-full max-w-full bg-sky-950/40 border-b border-sky-800/30 px-3 py-1 text-sky-300/90">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 text-[11px]">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse shrink-0" />
              <span>Mode Entraînement : 50 000 FCFA virtuels pour tester vos stratégies sans risque.</span>
            </span>
            <button
              onClick={() => handleToggleGameMode('real')}
              className="text-sky-300 hover:text-white font-bold underline cursor-pointer whitespace-nowrap"
            >
              Passer en Mode Réel &rarr;
            </button>
          </div>
        </div>
      )}

      {/* 5. Main Game Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-2 sm:p-4 md:p-6 space-y-3 sm:space-y-4 min-w-0 overflow-x-hidden">
        {/* Top Section: Multiplier Canvas Stage */}
        <section aria-label="Zone de jeu multiplicateur" className="w-full max-w-full">
          <CrashCanvas
            status={gameStatus}
            currentMultiplier={currentMultiplier}
            finalMultiplier={finalMultiplier}
            countdownSeconds={countdownSeconds}
          />
        </section>

        {/* Middle Section: Dual Bet Panels (Pari 1 & Pari 2) */}
        <section aria-label="Panneaux de contrôle des paris" className="w-full max-w-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
            <BetPanel
              user={gameMode === 'demo' ? { ...user, isActivated: true, balance: demoBalance } : user}
              panelIndex={0}
              bet={bets[0]}
              gameStatus={gameStatus}
              currentMultiplier={currentMultiplier}
              onPlaceBet={handlePlaceBet}
              onCancelBet={handleCancelBet}
              onCashout={handleCashout}
              onOpenActivation={() => setIsActivationOpen(true)}
              onOpenDeposit={() => setIsDepositOpen(true)}
              onInsufficientBalance={() => {
                addToast('warning', 'Solde insuffisant', 'Solde insuffisant. Veuillez effectuer un dépôt pour jouer.');
                setIsDepositOpen(true);
              }}
            />

            <BetPanel
              user={gameMode === 'demo' ? { ...user, isActivated: true, balance: demoBalance } : user}
              panelIndex={1}
              bet={bets[1]}
              gameStatus={gameStatus}
              currentMultiplier={currentMultiplier}
              onPlaceBet={handlePlaceBet}
              onCancelBet={handleCancelBet}
              onCashout={handleCashout}
              onOpenActivation={() => setIsActivationOpen(true)}
              onOpenDeposit={() => setIsDepositOpen(true)}
              onInsufficientBalance={() => {
                addToast('warning', 'Solde insuffisant', 'Solde insuffisant. Veuillez effectuer un dépôt pour jouer.');
                setIsDepositOpen(true);
              }}
            />
          </div>
        </section>

        {/* Bottom Section: Tabs for Live Bets, Personal Bet History, Leaderboard, Live Chat */}
        <section aria-label="Tableau de bord et communauté" className="pt-2 w-full max-w-full">
          {/* Tabs bar */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3 gap-2">
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900/90 border border-slate-800 overflow-x-auto no-scrollbar max-w-full">
              <button
                onClick={() => { soundManager.playClick(); setActiveCommunityTab('live'); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                  activeCommunityTab === 'live'
                    ? 'bg-orange-500 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Paris en Direct ({allDisplayBets.length})</span>
              </button>

              <button
                onClick={() => { soundManager.playClick(); setActiveCommunityTab('chat'); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                  activeCommunityTab === 'chat'
                    ? 'bg-orange-500 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 text-orange-400" />
                <span>Tchat Pilotes</span>
              </button>

              <button
                onClick={() => { soundManager.playClick(); setActiveCommunityTab('history'); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                  activeCommunityTab === 'history'
                    ? 'bg-orange-500 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Mon Historique</span>
              </button>

              <button
                onClick={() => { soundManager.playClick(); setActiveCommunityTab('leaderboard'); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                  activeCommunityTab === 'leaderboard'
                    ? 'bg-orange-500 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                <span>Classement</span>
              </button>
            </div>

            <span className="hidden sm:block text-[11px] text-slate-400">
              Manche en cours : <span className="font-mono-num font-bold text-white">R-{roundNonce}</span>
            </span>
          </div>

          {/* Active Tab Component */}
          <div className="min-h-[260px]">
            {activeCommunityTab === 'live' && (
              <LiveBetsTab
                bets={allDisplayBets}
                gameStatus={gameStatus}
                currentMultiplier={currentMultiplier}
              />
            )}

            {activeCommunityTab === 'chat' && (
              <LiveChatTab user={user} />
            )}

            {activeCommunityTab === 'history' && (
              <HistoryTab
                history={personalHistory}
                stats={playerStats}
              />
            )}

            {activeCommunityTab === 'leaderboard' && (
              <LeaderboardTab />
            )}
          </div>
        </section>

        {/* Transparence & Avertissement Réglementaire */}
        <div className="w-full text-center py-3 px-4 border-t border-slate-800/60">
          <p className="text-[11px] sm:text-xs text-slate-500 font-medium">
            Les résultats sont générés de manière aléatoire et peuvent varier. Le jeu comporte des risques.
          </p>
        </div>
      </main>

      {/* Modals Container */}
      <AccountActivationModal
        isOpen={isActivationOpen}
        onClose={() => setIsActivationOpen(false)}
        onActivateSuccess={handleActivateSuccess}
        user={user}
      />

      <DepositWithdrawModal
        isOpen={isDepositOpen}
        onClose={() => setIsDepositOpen(false)}
        user={user}
        onDepositSuccess={handleDepositSuccess}
        onWithdrawSuccess={handleWithdrawSuccess}
      />

      <ProvablyFairModal
        isOpen={isProvablyFairOpen}
        onClose={() => setIsProvablyFairOpen(false)}
        selectedRound={selectedInspectRound}
        clientSeed={clientSeed}
        onUpdateClientSeed={(newSeed) => {
          setClientSeed(newSeed);
          StorageService.setClientSeed(newSeed);
          addToast('success', 'Graine mise à jour', 'Votre graine joueur sera appliquée aux prochains tours.');
        }}
      />

      <ResponsibleGamingModal
        isOpen={isResponsibleOpen}
        onClose={() => setIsResponsibleOpen(false)}
      />

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        currentUser={user}
        onUpdateUser={(updated) => {
          setUser(updated);
          StorageService.saveUser(updated);
          addToast('success', 'Profil synchronisé', 'Vos données ont été enregistrées.');
        }}
        onOpenActivation={() => setIsActivationOpen(true)}
        onLogout={handleLogout}
      />

      {/* Floating Notifications */}
      <ToastNotification toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
