import fs from 'node:fs/promises';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { Pool } from 'pg';

let pool: Pool | null = null;

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getDatabasePool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL?.trim();
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set in environment variables');
    }
    pool = new Pool({
      connectionString,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    });
  }
  return pool;
}

export async function initializeDatabaseSchema(): Promise<void> {
  const schemaPath = path.join(process.cwd(), 'database_schema.sql');
  const schema = await fs.readFile(schemaPath, 'utf8');
  await getDatabasePool().query(schema);
  console.log('Database schema applied successfully.');
}

export function getDatabaseSql() {
  return async (strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = strings[0];
    for (let index = 0; index < values.length; index += 1) {
      text += `$${index + 1}${strings[index + 1]}`;
    }
    const result = await getDatabasePool().query(text, values);
    return result.rows;
  };
}

export interface DatabaseUser {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  country: string;
  balance: number;
  is_activated: boolean;
  role: string;
  created_at: string;
  updated_at: string;
}

export interface DatabaseTransaction {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  currency: string;
  method: string;
  phone_number?: string;
  reference: string;
  status: string;
  saspay_payment_id?: string;
  saspay_payout_id?: string;
  checkout_url?: string;
  created_at: string;
}

export type EmailOtpType = 'register' | 'forgot_password';
export type EmailOtpVerificationStatus = 'missing' | 'expired' | 'incorrect' | 'too_many' | 'valid';

export class PostgresDatabase {
  public static async storeEmailOtp(
    email: string,
    type: EmailOtpType,
    codeHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await getDatabaseSql()`
      INSERT INTO public.email_otps (email, type, code_hash, attempts, expires_at)
      VALUES (${email.trim().toLowerCase()}, ${type}, ${codeHash}, 0, ${expiresAt})
      ON CONFLICT (email, type) DO UPDATE
      SET code_hash = EXCLUDED.code_hash,
          attempts = 0,
          expires_at = EXCLUDED.expires_at,
          created_at = NOW()
    `;
  }

  public static async deleteEmailOtp(email: string, type: EmailOtpType): Promise<void> {
    await getDatabaseSql()`
      DELETE FROM public.email_otps
      WHERE email = ${email.trim().toLowerCase()} AND type = ${type}
    `;
  }

  public static async verifyEmailOtp(
    email: string,
    type: EmailOtpType,
    codeHash: string,
  ): Promise<{ status: EmailOtpVerificationStatus; attempts?: number }> {
    const client = await getDatabasePool().connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `SELECT code_hash, attempts, expires_at
         FROM public.email_otps
         WHERE email = $1 AND type = $2
         FOR UPDATE`,
        [email.trim().toLowerCase(), type],
      );
      const stored = result.rows[0] as
        | { code_hash: string; attempts: number; expires_at: Date }
        | undefined;

      if (!stored) {
        await client.query('COMMIT');
        return { status: 'missing' };
      }

      if (new Date(stored.expires_at).getTime() < Date.now()) {
        await client.query(
          'DELETE FROM public.email_otps WHERE email = $1 AND type = $2',
          [email.trim().toLowerCase(), type],
        );
        await client.query('COMMIT');
        return { status: 'expired' };
      }

      const storedDigest = Buffer.from(stored.code_hash, 'hex');
      const suppliedDigest = Buffer.from(codeHash, 'hex');
      const matches = storedDigest.length === suppliedDigest.length
        && timingSafeEqual(storedDigest, suppliedDigest);

      if (!matches) {
        const attempts = Number(stored.attempts) + 1;
        if (attempts > 5) {
          await client.query(
            'DELETE FROM public.email_otps WHERE email = $1 AND type = $2',
            [email.trim().toLowerCase(), type],
          );
          await client.query('COMMIT');
          return { status: 'too_many' };
        }
        await client.query(
          `UPDATE public.email_otps SET attempts = $3
           WHERE email = $1 AND type = $2`,
          [email.trim().toLowerCase(), type, attempts],
        );
        await client.query('COMMIT');
        return { status: 'incorrect', attempts };
      }

      await client.query(
        'DELETE FROM public.email_otps WHERE email = $1 AND type = $2',
        [email.trim().toLowerCase(), type],
      );
      await client.query('COMMIT');
      return { status: 'valid' };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public static async findByEmail(email: string): Promise<DatabaseUser | null> {
    const rows = await getDatabaseSql()`
      SELECT * FROM public.users
      WHERE LOWER(email) = LOWER(${email.trim()})
      LIMIT 1
    `;
    return (rows[0] as DatabaseUser) || null;
  }

  public static async findById(id: string): Promise<DatabaseUser | null> {
    const rows = await getDatabaseSql()`
      SELECT * FROM public.users
      WHERE id = ${id}
      LIMIT 1
    `;
    return (rows[0] as DatabaseUser) || null;
  }

  public static async createUser(user: {
    id?: string;
    name: string;
    email: string;
    password_hash: string;
    country?: string;
    balance?: number;
    is_activated?: boolean;
  }): Promise<DatabaseUser> {
    const id = user.id || 'usr_' + Math.random().toString(36).substring(2, 10);
    const country = user.country || 'CI';
    const balance = user.balance || 0;
    const isActivated = user.is_activated || false;

    const rows = await getDatabaseSql()`
      INSERT INTO public.users (id, name, email, password_hash, country, balance, is_activated)
      VALUES (${id}, ${user.name}, ${user.email.toLowerCase().trim()}, ${user.password_hash}, ${country}, ${balance}, ${isActivated})
      RETURNING *
    `;
    return rows[0] as DatabaseUser;
  }

  public static async updateBalance(id: string, newBalance: number, activate = false): Promise<DatabaseUser | null> {
    const rows = await getDatabaseSql()`
      UPDATE public.users
      SET
        balance = ${newBalance},
        is_activated = CASE WHEN ${activate} THEN true ELSE is_activated END,
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
    return (rows[0] as DatabaseUser) || null;
  }

  public static async addTransaction(tx: {
    id: string;
    user_id: string;
    type: string;
    amount: number;
    currency?: string;
    method: string;
    phone_number?: string;
    reference: string;
    status?: string;
    saspay_payment_id?: string;
    saspay_payout_id?: string;
    checkout_url?: string;
  }): Promise<DatabaseTransaction> {
    const currency = tx.currency || 'XOF';
    const status = tx.status || 'pending';

    const rows = await getDatabaseSql()`
      INSERT INTO public.transactions (
        id, user_id, type, amount, currency, method,
        phone_number, reference, status, saspay_payment_id, saspay_payout_id, checkout_url
      ) VALUES (
        ${tx.id}, ${tx.user_id}, ${tx.type}, ${tx.amount}, ${currency}, ${tx.method},
        ${tx.phone_number || ''}, ${tx.reference}, ${status},
        ${tx.saspay_payment_id || null}, ${tx.saspay_payout_id || null}, ${tx.checkout_url || null}
      )
      RETURNING *
    `;
    return rows[0] as DatabaseTransaction;
  }

  public static async findTransactionBySaspayId(paymentId: string): Promise<{ transaction: DatabaseTransaction; user: DatabaseUser } | null> {
    const rows = await getDatabaseSql()`
      SELECT
        t.*,
        u.id as user_id, u.name as user_name, u.email as user_email, u.balance as user_balance, u.country as user_country
      FROM public.transactions t
      JOIN public.users u ON t.user_id = u.id
      WHERE t.saspay_payment_id = ${paymentId} OR t.id = ${paymentId} OR t.reference = ${paymentId}
      LIMIT 1
    `;
    if (rows.length === 0) return null;

    const row: any = rows[0];
    const transaction: DatabaseTransaction = {
      id: row.id,
      user_id: row.user_id,
      type: row.type,
      amount: Number(row.amount),
      currency: row.currency,
      method: row.method,
      phone_number: row.phone_number,
      reference: row.reference,
      status: row.status,
      saspay_payment_id: row.saspay_payment_id,
      saspay_payout_id: row.saspay_payout_id,
      checkout_url: row.checkout_url,
      created_at: row.created_at,
    };

    const user: DatabaseUser = {
      id: row.user_id,
      name: row.user_name,
      email: row.user_email,
      password_hash: '',
      country: row.user_country,
      balance: Number(row.user_balance),
      is_activated: true,
      role: 'player',
      created_at: '',
      updated_at: '',
    };

    return { transaction, user };
  }

  public static async updateTransactionStatus(paymentIdOrId: string, status: string): Promise<boolean> {
    await getDatabaseSql()`
      UPDATE public.transactions
      SET status = ${status}, updated_at = NOW()
      WHERE saspay_payment_id = ${paymentIdOrId} OR id = ${paymentIdOrId}
    `;
    return true;
  }

  public static async addBet(bet: {
    id: string;
    user_id: string;
    round_id: string;
    game_mode: string;
    amount: number;
    crash_multiplier: number;
    cashout_multiplier?: number | null;
    gross_profit?: number;
    fee?: number;
    net_profit?: number;
    won?: boolean;
  }): Promise<boolean> {
    await getDatabaseSql()`
      INSERT INTO public.bets (
        id, user_id, round_id, game_mode, amount,
        crash_multiplier, cashout_multiplier, gross_profit, fee, net_profit, won
      ) VALUES (
        ${bet.id}, ${bet.user_id}, ${bet.round_id}, ${bet.game_mode}, ${bet.amount},
        ${bet.crash_multiplier}, ${bet.cashout_multiplier || null}, ${bet.gross_profit || 0},
        ${bet.fee || 0}, ${bet.net_profit || 0}, ${bet.won || false}
      )
    `;
    return true;
  }

  public static async getUserTransactions(userId: string): Promise<DatabaseTransaction[]> {
    const rows = await getDatabaseSql()`
      SELECT * FROM public.transactions
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 50
    `;
    return rows.map((row: any) => ({
      id: row.id,
      user_id: row.user_id,
      type: row.type,
      amount: Number(row.amount),
      currency: row.currency,
      method: row.method,
      phone_number: row.phone_number,
      reference: row.reference,
      status: row.status,
      saspay_payment_id: row.saspay_payment_id,
      saspay_payout_id: row.saspay_payout_id,
      checkout_url: row.checkout_url,
      created_at: row.created_at,
    }));
  }

  public static async getUserBets(userId: string): Promise<any[]> {
    const rows = await getDatabaseSql()`
      SELECT * FROM public.bets
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 100
    `;
    return rows;
  }
}
