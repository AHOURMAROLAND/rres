/**
 * Persistent Storage & Database service
 * Manages user accounts, wallet balance in FCFA, transaction logs and bet history
 */

import { User, PaymentTransaction, RoundHistoryItem, PlayerStats, LeaderboardUser } from '../types';
import { SupabaseService, isSupabaseConfigured } from './supabase';
import { AuthApi } from './authApi';

// Storage keys with user isolation support
const STORAGE_KEYS = {
  ACTIVE_USER: 'aerocrash_active_user',
  ACTIVE_USER_ID: 'aerocrash_active_user_id',
  ACCOUNTS_VAULT: 'aerocrash_accounts_vault',
  ROUNDS_HISTORY: 'aerocrash_rounds_history',
  CLIENT_SEED: 'aerocrash_client_seed',
};

export interface VaultAccount {
  user: User;
  passwordHash: string;
  bets: SavedBetRecord[];
  transactions: PaymentTransaction[];
}

// Initial default user: not activated, balance 0 until activated
const DEFAULT_USER: User = {
  id: 'usr_guest',
  name: 'Pilote AeroCrash',
  phoneOrEmail: 'joueur@aerocrash.live',
  isActivated: false,
  balance: 0,
  createdAt: Date.now(),
};

// Initial sample past rounds so ribbon has authentic data immediately
const INITIAL_ROUNDS: RoundHistoryItem[] = [
  { roundId: 'R-9981', crashMultiplier: 1.22, timestamp: Date.now() - 1000 * 60 * 15, serverSeedHash: '8f4b...3a1', serverSeed: 'seed_9981', clientSeed: 'client_base', nonce: 9981 },
  { roundId: 'R-9982', crashMultiplier: 2.45, timestamp: Date.now() - 1000 * 60 * 14, serverSeedHash: '7c2e...9d2', serverSeed: 'seed_9982', clientSeed: 'client_base', nonce: 9982 },
  { roundId: 'R-9983', crashMultiplier: 1.15, timestamp: Date.now() - 1000 * 60 * 13, serverSeedHash: '1a9f...4e3', serverSeed: 'seed_9983', clientSeed: 'client_base', nonce: 9983 },
  { roundId: 'R-9984', crashMultiplier: 5.62, timestamp: Date.now() - 1000 * 60 * 12, serverSeedHash: '3d8a...7f4', serverSeed: 'seed_9984', clientSeed: 'client_base', nonce: 9984 },
  { roundId: 'R-9985', crashMultiplier: 1.08, timestamp: Date.now() - 1000 * 60 * 11, serverSeedHash: '5e4b...2c5', serverSeed: 'seed_9985', clientSeed: 'client_base', nonce: 9985 },
  { roundId: 'R-9986', crashMultiplier: 14.80, timestamp: Date.now() - 1000 * 60 * 10, serverSeedHash: '9a1c...8e6', serverSeed: 'seed_9986', clientSeed: 'client_base', nonce: 9986 },
  { roundId: 'R-9987', crashMultiplier: 1.84, timestamp: Date.now() - 1000 * 60 * 9, serverSeedHash: '2b7d...1a7', serverSeed: 'seed_9987', clientSeed: 'client_base', nonce: 9987 },
  { roundId: 'R-9988', crashMultiplier: 3.12, timestamp: Date.now() - 1000 * 60 * 8, serverSeedHash: '4f3a...6b8', serverSeed: 'seed_9988', clientSeed: 'client_base', nonce: 9988 },
  { roundId: 'R-9989', crashMultiplier: 1.02, timestamp: Date.now() - 1000 * 60 * 7, serverSeedHash: '6d9e...5f9', serverSeed: 'seed_9989', clientSeed: 'client_base', nonce: 9989 },
  { roundId: 'R-9990', crashMultiplier: 2.10, timestamp: Date.now() - 1000 * 60 * 6, serverSeedHash: '8e2a...9c0', serverSeed: 'seed_9990', clientSeed: 'client_base', nonce: 9990 },
  { roundId: 'R-9991', crashMultiplier: 1.48, timestamp: Date.now() - 1000 * 60 * 5, serverSeedHash: '1c4f...3d1', serverSeed: 'seed_9991', clientSeed: 'client_base', nonce: 9991 },
  { roundId: 'R-9992', crashMultiplier: 21.80, timestamp: Date.now() - 1000 * 60 * 4, serverSeedHash: '3a8e...7b2', serverSeed: 'seed_9992', clientSeed: 'client_base', nonce: 9992 },
  { roundId: 'R-9993', crashMultiplier: 1.35, timestamp: Date.now() - 1000 * 60 * 3, serverSeedHash: '5b2d...1e3', serverSeed: 'seed_9993', clientSeed: 'client_base', nonce: 9993 },
  { roundId: 'R-9994', crashMultiplier: 4.20, timestamp: Date.now() - 1000 * 60 * 2, serverSeedHash: '7e9a...4f4', serverSeed: 'seed_9994', clientSeed: 'client_base', nonce: 9994 },
  { roundId: 'R-9995', crashMultiplier: 1.95, timestamp: Date.now() - 1000 * 60 * 1, serverSeedHash: '9f1c...8a5', serverSeed: 'seed_9995', clientSeed: 'client_base', nonce: 9995 },
];

export const INITIAL_LEADERBOARD: LeaderboardUser[] = [
  { rank: 1, username: 'Amadou_DKR', totalWon: 485000, highestMultiplier: 24.80, country: '🇸🇳 Sénégal' },
  { rank: 2, username: 'Kouame_CI', totalWon: 392000, highestMultiplier: 23.45, country: '🇨🇮 Côte d\'Ivoire' },
  { rank: 3, username: 'Moussa_BKO', totalWon: 275500, highestMultiplier: 22.10, country: '🇲🇱 Mali' },
  { rank: 4, username: 'Ibrahim_TG', totalWon: 198000, highestMultiplier: 19.80, country: '🇹🇬 Togo' },
  { rank: 5, username: 'Yao_Pro', totalWon: 146000, highestMultiplier: 18.90, country: '🇨🇮 Côte d\'Ivoire' },
  { rank: 6, username: 'Awa_VIP', totalWon: 112400, highestMultiplier: 17.25, country: '🇸🇳 Sénégal' },
  { rank: 7, username: 'Serge_BJ', totalWon: 95000, highestMultiplier: 15.60, country: '🇧🇯 Bénin' },
  { rank: 8, username: 'Ousmane_BF', totalWon: 82000, highestMultiplier: 14.40, country: '🇧🇫 Burkina Faso' },
];

export interface SavedBetRecord {
  id: string;
  roundId: string;
  amount: number;
  multiplier: number;
  cashoutMultiplier: number | null;
  grossProfit: number;
  fee: number; // 2.5% platform commission
  netProfit: number;
  won: boolean;
  timestamp: number;
}

export class StorageService {
  // Simple reproducible client-side password hash helper
  public static hashPassword(password: string): string {
    let hash = 5381;
    const str = 'aerocrash_salt_' + password.trim();
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return 'h_' + Math.abs(hash).toString(36);
  }

  // Read full vault of accounts
  public static getVault(): Record<string, VaultAccount> {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ACCOUNTS_VAULT);
      if (data) {
        return JSON.parse(data);
      }
    } catch {
      // ignore
    }
    return {};
  }

  // Save full vault of accounts
  public static saveVault(vault: Record<string, VaultAccount>): void {
    try {
      localStorage.setItem(STORAGE_KEYS.ACCOUNTS_VAULT, JSON.stringify(vault));
    } catch {
      // ignore
    }
  }

  // Look up account in vault by email or user ID
  public static getAccountFromVault(emailOrId: string): VaultAccount | null {
    if (!emailOrId) return null;
    const vault = this.getVault();
    const clean = emailOrId.trim().toLowerCase();

    // 1. Direct email lookup
    if (vault[clean]) return vault[clean];

    // 2. Lookup across all accounts by email or ID
    for (const key of Object.keys(vault)) {
      const acc = vault[key];
      if (
        (acc.user.email && acc.user.email.toLowerCase() === clean) ||
        (acc.user.phoneOrEmail && acc.user.phoneOrEmail.toLowerCase() === clean) ||
        acc.user.id === emailOrId
      ) {
        return acc;
      }
    }

    return null;
  }

  // Save or update an account in the vault
  public static syncToVault(
    user: User,
    rawPassword?: string,
    bets?: SavedBetRecord[],
    transactions?: PaymentTransaction[]
  ): void {
    if (!user || !user.email) return;
    const cleanEmail = user.email.trim().toLowerCase();
    const vault = this.getVault();
    const existing = vault[cleanEmail] || this.getAccountFromVault(user.id);

    const userBets = bets || (existing ? existing.bets : this.getBetHistory(user.id));
    const userTxs = transactions || (existing ? existing.transactions : this.getTransactions(user.id));

    const passwordHash = rawPassword
      ? this.hashPassword(rawPassword)
      : (existing?.passwordHash || this.hashPassword('123456'));

    vault[cleanEmail] = {
      user: { ...user },
      passwordHash,
      bets: userBets || [],
      transactions: userTxs || [],
    };

    this.saveVault(vault);
  }

  // Verify credentials in local vault
  public static verifyVaultCredentials(
    email: string,
    password: string
  ): { success: boolean; message?: string; account?: VaultAccount } {
    const cleanEmail = email.trim().toLowerCase();
    const account = this.getAccountFromVault(cleanEmail);

    if (!account) {
      return {
        success: false,
        message: 'Email ou mot de passe incorrect.',
      };
    }

    const expectedHash = this.hashPassword(password);
    if (account.passwordHash && account.passwordHash !== expectedHash) {
      return {
        success: false,
        message: 'Email ou mot de passe incorrect.',
      };
    }

    return {
      success: true,
      account,
    };
  }

  // Get currently active user (isolated per session)
  public static getUser(): User {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ACTIVE_USER);
      if (data) {
        return JSON.parse(data);
      }
    } catch {
      // fallback
    }
    return DEFAULT_USER;
  }

  // Set active user with optional initial bets and transactions from backend
  public static setCurrentUser(
    user: User,
    serverBets?: any[],
    serverTransactions?: any[],
    rawPassword?: string
  ): void {
    try {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_USER, JSON.stringify(user));
      localStorage.setItem(STORAGE_KEYS.ACTIVE_USER_ID, user.id);

      if (serverBets && Array.isArray(serverBets)) {
        this.saveBetHistory(serverBets, user.id);
      }
      if (serverTransactions && Array.isArray(serverTransactions)) {
        this.saveTransactions(serverTransactions, user.id);
      }

      // Sync into permanent vault
      this.syncToVault(user, rawPassword, serverBets, serverTransactions);

      // Sync to Supabase if configured
      if (isSupabaseConfigured) {
        SupabaseService.syncUserProfile(user).catch(() => {});
      }
    } catch {
      // ignore
    }
  }

  // Clear current user session
  public static clearActiveSession(): void {
    try {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_USER);
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_USER_ID);
    } catch {
      // ignore
    }
  }

  public static saveUser(user: User, rawPassword?: string): void {
    try {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_USER, JSON.stringify(user));
      localStorage.setItem(STORAGE_KEYS.ACTIVE_USER_ID, user.id);
      this.syncToVault(user, rawPassword);
      if (isSupabaseConfigured) {
        SupabaseService.syncUserProfile(user).catch(() => {});
      }
    } catch {
      // ignore
    }
  }

  // Update user balance (synchronizes both locally and to the backend server)
  public static updateBalance(amountDelta: number): User {
    const user = this.getUser();
    user.balance = Math.max(0, Math.round((user.balance + amountDelta) * 100) / 100);
    this.saveUser(user);
    if (isSupabaseConfigured) {
      SupabaseService.updateBalance(user.id, user.balance).catch(() => {});
    }
    if (AuthApi.isLoggedIn()) {
      AuthApi.updateBalance(user.balance, amountDelta).catch(() => {});
    }
    return user;
  }

  // Set explicit user balance directly without redundant delta sync
  public static setBalance(exactBalance: number): User {
    const user = this.getUser();
    user.balance = Math.max(0, Math.round(exactBalance * 100) / 100);
    this.saveUser(user);
    return user;
  }

  // Activate account after payment / bonus
  public static activateAccount(initialBonus = 3000): User {
    const user = this.getUser();
    user.isActivated = true;
    user.balance = (user.balance || 0) + initialBonus;
    this.saveUser(user);

    // Save activation transaction
    this.addTransaction({
      id: 'tx_act_' + Math.random().toString(36).substring(2, 9),
      userId: user.id,
      type: 'activation',
      amount: 2000,
      method: 'wave',
      reference: 'ACT-' + Date.now().toString().slice(-6),
      status: 'success',
      timestamp: Date.now(),
    });

    if (AuthApi.isLoggedIn()) {
      AuthApi.activateAccount(initialBonus).catch(() => {});
    }

    return user;
  }

  // Helper to get user-specific storage key
  private static getUserKey(prefix: string, userId?: string): string {
    const targetId = userId || this.getUser().id || 'guest';
    return `aerocrash_${prefix}_${targetId}`;
  }

  // Transactions (strictly isolated per user ID)
  public static getTransactions(userId?: string): PaymentTransaction[] {
    try {
      const key = this.getUserKey('tx', userId);
      const data = localStorage.getItem(key);
      if (data) return JSON.parse(data);
    } catch {
      // ignore
    }
    return [];
  }

  public static saveTransactions(txs: PaymentTransaction[], userId?: string): void {
    try {
      const key = this.getUserKey('tx', userId);
      localStorage.setItem(key, JSON.stringify(txs.slice(0, 50)));
    } catch {
      // ignore
    }
  }

  public static addTransaction(tx: PaymentTransaction, syncToServer = true): void {
    const user = this.getUser();
    const list = this.getTransactions(user.id);
    if (list.some((existing) => existing.id === tx.id)) {
      return;
    }
    list.unshift(tx);
    this.saveTransactions(list, user.id);

    if (syncToServer) {
      if (isSupabaseConfigured) {
        SupabaseService.logTransaction(tx).catch(() => {});
      }
      if (AuthApi.isLoggedIn()) {
        AuthApi.logTransaction(tx).catch(() => {});
      }
    }
  }

  // Personal Bet History (strictly isolated per user ID)
  public static getBetHistory(userId?: string): SavedBetRecord[] {
    try {
      const key = this.getUserKey('bets', userId);
      const data = localStorage.getItem(key);
      if (data) return JSON.parse(data);
    } catch {
      // ignore
    }
    return [];
  }

  public static saveBetHistory(bets: SavedBetRecord[], userId?: string): void {
    try {
      const key = this.getUserKey('bets', userId);
      localStorage.setItem(key, JSON.stringify(bets.slice(0, 100)));
      this.recalculateStats(bets, userId);
    } catch {
      // ignore
    }
  }

  public static addBetRecord(record: SavedBetRecord, gameMode: 'real' | 'demo' = 'real'): void {
    const user = this.getUser();
    const history = this.getBetHistory(user.id);
    history.unshift(record);
    this.saveBetHistory(history.slice(0, 100), user.id);

    if (isSupabaseConfigured) {
      SupabaseService.logBet(record, user.id, gameMode).catch(() => {});
    }
    if (AuthApi.isLoggedIn() && gameMode === 'real') {
      AuthApi.logBet(record).catch(() => {});
    }
  }

  // Stats (strictly computed per user ID)
  public static getStats(userId?: string): PlayerStats {
    try {
      const key = this.getUserKey('stats', userId);
      const data = localStorage.getItem(key);
      if (data) return JSON.parse(data);
    } catch {
      // ignore
    }
    // Recompute if not cached
    const bets = this.getBetHistory(userId);
    return this.recalculateStats(bets, userId);
  }

  private static recalculateStats(bets: SavedBetRecord[], userId?: string): PlayerStats {
    const stats: PlayerStats = {
      totalBets: bets.length,
      totalWagered: 0,
      totalWon: 0,
      biggestMultiplier: 0,
      biggestWin: 0,
    };

    for (const b of bets) {
      stats.totalWagered += b.amount || 0;
      if (b.won && b.netProfit > 0) {
        stats.totalWon += b.netProfit;
        if (b.netProfit > stats.biggestWin) {
          stats.biggestWin = b.netProfit;
        }
        const mult = b.cashoutMultiplier || b.multiplier || 0;
        if (mult > stats.biggestMultiplier) {
          stats.biggestMultiplier = mult;
        }
      }
    }

    try {
      const key = this.getUserKey('stats', userId);
      localStorage.setItem(key, JSON.stringify(stats));
    } catch {
      // ignore
    }

    return stats;
  }

  // Global game rounds history (shared across all players)
  public static getRoundsHistory(): RoundHistoryItem[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ROUNDS_HISTORY);
      if (data) return JSON.parse(data);
    } catch {
      // ignore
    }
    this.saveRoundsHistory(INITIAL_ROUNDS);
    return INITIAL_ROUNDS;
  }

  public static saveRoundsHistory(rounds: RoundHistoryItem[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.ROUNDS_HISTORY, JSON.stringify(rounds.slice(0, 40)));
    } catch {
      // ignore
    }
  }

  public static addRound(round: RoundHistoryItem): RoundHistoryItem[] {
    const rounds = this.getRoundsHistory();
    rounds.unshift(round);
    const updated = rounds.slice(0, 30);
    this.saveRoundsHistory(updated);

    if (isSupabaseConfigured) {
      SupabaseService.logRound(round).catch(() => {});
    }

    return updated;
  }

  // Client seed for provably fair
  public static getClientSeed(): string {
    let seed = localStorage.getItem(STORAGE_KEYS.CLIENT_SEED);
    if (!seed) {
      seed = 'client_' + Math.random().toString(36).substring(2, 10);
      localStorage.setItem(STORAGE_KEYS.CLIENT_SEED, seed);
    }
    return seed;
  }

  public static setClientSeed(seed: string): void {
    localStorage.setItem(STORAGE_KEYS.CLIENT_SEED, seed);
  }
}
