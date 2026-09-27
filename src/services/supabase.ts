/**
 * Supabase Client & Synchronization Service for AeroCrash
 * Manages users/profiles, wallet balances in FCFA, transactions, bets and game rounds.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { User, PaymentTransaction, RoundHistoryItem } from '../types';
import { SavedBetRecord } from './storage';

// Extract environment variables safely
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl.startsWith('https://') &&
  supabaseAnonKey.length > 20
);

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!supabaseInstance) {
    try {
      supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      });
    } catch (err) {
      console.warn('Failed to initialize Supabase client:', err);
      return null;
    }
  }
  return supabaseInstance;
}

export class SupabaseService {
  /**
   * Syncs user profile with Supabase
   */
  public static async syncUserProfile(user: User): Promise<User | null> {
    const client = getSupabase();
    if (!client) return null;

    try {
      const { data, error } = await client
        .from('profiles')
        .upsert(
          {
            id: user.id,
            name: user.name,
            phone_or_email: user.phoneOrEmail,
            is_activated: user.isActivated,
            balance: user.balance,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        )
        .select()
        .single();

      if (error) {
        console.warn('Supabase syncUserProfile error:', error.message);
        return null;
      }

      if (data) {
        return {
          id: data.id,
          name: data.name,
          phoneOrEmail: data.phone_or_email || user.phoneOrEmail,
          isActivated: data.is_activated,
          balance: Number(data.balance),
          createdAt: new Date(data.created_at).getTime(),
        };
      }
    } catch (err) {
      console.warn('Supabase syncUserProfile exception:', err);
    }
    return null;
  }

  /**
   * Fetches user profile from Supabase
   */
  public static async fetchUserProfile(userId: string): Promise<User | null> {
    const client = getSupabase();
    if (!client) return null;

    try {
      const { data, error } = await client
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.warn('Supabase fetchUserProfile error:', error.message);
        return null;
      }

      if (data) {
        return {
          id: data.id,
          name: data.name,
          phoneOrEmail: data.phone_or_email,
          isActivated: data.is_activated,
          balance: Number(data.balance),
          createdAt: new Date(data.created_at).getTime(),
        };
      }
    } catch (err) {
      console.warn('Supabase fetchUserProfile exception:', err);
    }
    return null;
  }

  /**
   * Updates balance in Supabase
   */
  public static async updateBalance(userId: string, newBalance: number): Promise<boolean> {
    const client = getSupabase();
    if (!client) return false;

    try {
      const { error } = await client
        .from('profiles')
        .update({
          balance: newBalance,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) {
        console.warn('Supabase updateBalance error:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('Supabase updateBalance exception:', err);
      return false;
    }
  }

  /**
   * Logs a payment or activation transaction to Supabase
   */
  public static async logTransaction(tx: PaymentTransaction): Promise<boolean> {
    const client = getSupabase();
    if (!client) return false;

    try {
      const { error } = await client.from('transactions').insert({
        id: tx.id,
        user_id: tx.userId,
        type: tx.type,
        amount: tx.amount,
        method: tx.method,
        phone_number: tx.phoneNumber || null,
        reference: tx.reference,
        status: tx.status,
        created_at: new Date(tx.timestamp).toISOString(),
      });

      if (error) {
        console.warn('Supabase logTransaction error:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('Supabase logTransaction exception:', err);
      return false;
    }
  }

  /**
   * Logs a bet to Supabase
   */
  public static async logBet(record: SavedBetRecord, userId: string, gameMode: 'real' | 'demo'): Promise<boolean> {
    const client = getSupabase();
    if (!client) return false;

    try {
      const { error } = await client.from('bets').insert({
        id: record.id,
        user_id: userId,
        round_id: record.roundId,
        game_mode: gameMode,
        amount: record.amount,
        crash_multiplier: record.multiplier,
        cashout_multiplier: record.cashoutMultiplier,
        gross_profit: record.grossProfit,
        fee: record.fee,
        net_profit: record.netProfit,
        won: record.won,
        created_at: new Date(record.timestamp).toISOString(),
      });

      if (error) {
        console.warn('Supabase logBet error:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('Supabase logBet exception:', err);
      return false;
    }
  }

  /**
   * Logs a completed crash round to Supabase
   */
  public static async logRound(round: RoundHistoryItem): Promise<boolean> {
    const client = getSupabase();
    if (!client) return false;

    try {
      const { error } = await client.from('rounds').upsert(
        {
          round_id: round.roundId,
          crash_multiplier: round.crashMultiplier,
          server_seed: round.serverSeed,
          server_seed_hash: round.serverSeedHash,
          client_seed: round.clientSeed,
          nonce: round.nonce,
          created_at: new Date(round.timestamp).toISOString(),
        },
        { onConflict: 'round_id' }
      );

      if (error) {
        console.warn('Supabase logRound error:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('Supabase logRound exception:', err);
      return false;
    }
  }

  /**
   * Fetches latest rounds from Supabase
   */
  public static async fetchRecentRounds(limit = 30): Promise<RoundHistoryItem[] | null> {
    const client = getSupabase();
    if (!client) return null;

    try {
      const { data, error } = await client
        .from('rounds')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.warn('Supabase fetchRecentRounds error:', error.message);
        return null;
      }

      if (data && data.length > 0) {
        return data.map((item) => ({
          roundId: item.round_id,
          crashMultiplier: Number(item.crash_multiplier),
          timestamp: new Date(item.created_at).getTime(),
          serverSeedHash: item.server_seed_hash,
          serverSeed: item.server_seed,
          clientSeed: item.client_seed,
          nonce: Number(item.nonce),
        }));
      }
    } catch (err) {
      console.warn('Supabase fetchRecentRounds exception:', err);
    }
    return null;
  }
}
