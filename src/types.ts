/**
 * Types and interfaces for the Aviator Crash Multiplier application
 */

export interface User {
  id: string;
  name: string;
  email?: string;
  country?: string;
  phoneOrEmail: string;
  isActivated: boolean;
  balance: number; // in FCFA
  createdAt: number;
}

export type PaymentMethod = 'wave' | 'orange_money' | 'mtn' | 'moov' | 'card';

export interface PaymentTransaction {
  id: string;
  userId: string;
  type: 'activation' | 'deposit' | 'withdraw';
  amount: number; // FCFA
  method: PaymentMethod;
  phoneNumber?: string;
  reference: string;
  status: 'pending' | 'success' | 'failed';
  timestamp: number;
}

export type GameMode = 'real' | 'demo';
export type GameStatus = 'waiting' | 'flying' | 'crashed';

export interface ChatMessage {
  id: string;
  sender: string;
  avatar: string;
  text: string;
  timestamp: number;
  isUser?: boolean;
  highlight?: boolean;
}

export interface Bet {
  id: string;
  panelIndex: 0 | 1; // Panel 1 or 2
  amount: number; // FCFA
  autoCashout: number | null; // e.g. 2.00 or null if manual
  cashedOutAt: number | null; // Multiplier when cashed out
  profit: number | null; // Net gain in FCFA
  status: 'pending' | 'active' | 'cashed_out' | 'crashed';
}

export interface RoundHistoryItem {
  roundId: string;
  crashMultiplier: number;
  timestamp: number;
  serverSeedHash: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
}

export interface LivePlayerBet {
  id: string;
  username: string;
  avatar: string;
  betAmount: number;
  cashoutMultiplier: number | null;
  winAmount: number | null;
  status: 'betting' | 'cashed_out' | 'crashed';
  isCurrentUser?: boolean;
  targetMultiplier?: number;
}

export interface PlayerStats {
  totalBets: number;
  totalWagered: number;
  totalWon: number;
  biggestMultiplier: number;
  biggestWin: number;
}

export interface LeaderboardUser {
  rank: number;
  username: string;
  totalWon: number;
  highestMultiplier: number;
  country: string;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  duration?: number;
}
