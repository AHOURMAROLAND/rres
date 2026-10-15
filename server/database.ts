import fs from 'node:fs/promises';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { Pool, PoolClient } from 'pg';

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
  idempotency_key?: string;
  request_fingerprint?: string;
  metadata?: Record<string, unknown>;
  credited_amount?: number | null;
  created_at: string;
  updated_at?: string;
}

export interface PaymentIntentInput {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  method: string;
  phone_number: string;
  reference: string;
  idempotency_key: string;
  request_fingerprint: string;
  country: string;
}

export interface PaymentIntentResult {
  transaction: DatabaseTransaction;
  balance: number;
  created: boolean;
}

export class IdempotencyConflictError extends Error {
  constructor() {
    super('Cette clé d’idempotence est déjà associée à une autre demande.');
    this.name = 'IdempotencyConflictError';
  }
}

export class InsufficientFundsError extends Error {
  constructor() {
    super('Solde insuffisant pour cette opération.');
    this.name = 'InsufficientFundsError';
  }
}

export type EmailOtpType = 'register' | 'forgot_password';
export type EmailOtpVerificationStatus = 'missing' | 'expired' | 'incorrect' | 'too_many' | 'valid';

export class PostgresDatabase {
  private static async findIntent(
    client: PoolClient,
    userId: string,
    type: 'deposit' | 'withdraw',
    idempotencyKey: string,
  ): Promise<DatabaseTransaction | null> {
    const result = await client.query(
      `SELECT * FROM public.transactions
       WHERE user_id = $1 AND type = $2 AND idempotency_key = $3
       FOR UPDATE`,
      [userId, type, idempotencyKey],
    );
    return (result.rows[0] as DatabaseTransaction) || null;
  }

  private static assertMatchingIntent(
    transaction: DatabaseTransaction,
    requestFingerprint: string,
  ): void {
    if (transaction.request_fingerprint !== requestFingerprint) {
      throw new IdempotencyConflictError();
    }
  }

  public static async createDepositIntent(input: PaymentIntentInput): Promise<PaymentIntentResult> {
    const client = await getDatabasePool().connect();
    let transactionOpen = true;
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO public.transactions (
           id, user_id, type, amount, currency, method, phone_number,
           reference, status, idempotency_key, request_fingerprint, metadata
         ) VALUES ($1, $2, 'deposit', $3, $4, $5, $6, $7, 'pending', $8, $9, $10::jsonb)
         ON CONFLICT (user_id, type, idempotency_key)
           WHERE idempotency_key IS NOT NULL DO NOTHING
         RETURNING *`,
        [
          input.id,
          input.user_id,
          input.amount,
          input.currency,
          input.method,
          input.phone_number,
          input.reference,
          input.idempotency_key,
          input.request_fingerprint,
          JSON.stringify({ country: input.country }),
        ],
      );

      if (inserted.rows[0]) {
        const user = await client.query(
          'SELECT balance FROM public.users WHERE id = $1',
          [input.user_id],
        );
        if (!user.rows[0]) {
          throw new Error('Utilisateur introuvable.');
        }
        await client.query('COMMIT');
        transactionOpen = false;
        return {
          transaction: inserted.rows[0] as DatabaseTransaction,
          balance: Number(user.rows[0].balance),
          created: true,
        };
      }

      const existing = await this.findIntent(client, input.user_id, 'deposit', input.idempotency_key);
      if (!existing) {
        throw new Error('Impossible de retrouver la demande de dépôt idempotente.');
      }
      this.assertMatchingIntent(existing, input.request_fingerprint);
      const user = await client.query(
        'SELECT balance FROM public.users WHERE id = $1',
        [input.user_id],
      );
      await client.query('COMMIT');
      transactionOpen = false;
      return {
        transaction: existing,
        balance: Number(user.rows[0]?.balance || 0),
        created: false,
      };
    } catch (error) {
      if (transactionOpen) await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public static async createWithdrawalIntent(input: PaymentIntentInput): Promise<PaymentIntentResult> {
    const client = await getDatabasePool().connect();
    let transactionOpen = true;
    try {
      await client.query('BEGIN');
      const existing = await this.findIntent(client, input.user_id, 'withdraw', input.idempotency_key);
      if (existing) {
        this.assertMatchingIntent(existing, input.request_fingerprint);
        const user = await client.query(
          'SELECT balance FROM public.users WHERE id = $1',
          [input.user_id],
        );
        await client.query('COMMIT');
        transactionOpen = false;
        return {
          transaction: existing,
          balance: Number(user.rows[0]?.balance || 0),
          created: false,
        };
      }

      const debit = await client.query(
        `UPDATE public.users
         SET balance = balance - $2, updated_at = NOW()
         WHERE id = $1 AND balance >= $2
         RETURNING balance`,
        [input.user_id, input.amount],
      );
      if (!debit.rows[0]) {
        const user = await client.query(
          'SELECT id FROM public.users WHERE id = $1',
          [input.user_id],
        );
        if (!user.rows[0]) {
          throw new Error('Utilisateur introuvable.');
        }
        throw new InsufficientFundsError();
      }

      const inserted = await client.query(
        `INSERT INTO public.transactions (
           id, user_id, type, amount, currency, method, phone_number,
           reference, status, idempotency_key, request_fingerprint, metadata
         ) VALUES ($1, $2, 'withdraw', $3, $4, $5, $6, $7, 'pending', $8, $9, $10::jsonb)
         ON CONFLICT (user_id, type, idempotency_key)
           WHERE idempotency_key IS NOT NULL DO NOTHING
         RETURNING *`,
        [
          input.id,
          input.user_id,
          input.amount,
          input.currency,
          input.method,
          input.phone_number,
          input.reference,
          input.idempotency_key,
          input.request_fingerprint,
          JSON.stringify({ country: input.country }),
        ],
      );

      if (!inserted.rows[0]) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        const retry = await getDatabasePool().query(
          `SELECT t.*, u.balance
           FROM public.transactions t
           JOIN public.users u ON u.id = t.user_id
           WHERE t.user_id = $1 AND t.type = 'withdraw' AND t.idempotency_key = $2`,
          [input.user_id, input.idempotency_key],
        );
        const transaction = retry.rows[0] as DatabaseTransaction | undefined;
        if (!transaction) {
          throw new Error('Impossible de retrouver la demande de retrait idempotente.');
        }
        this.assertMatchingIntent(transaction, input.request_fingerprint);
        return {
          transaction,
          balance: Number(retry.rows[0].balance),
          created: false,
        };
      }

      await client.query('COMMIT');
      transactionOpen = false;
      return {
        transaction: inserted.rows[0] as DatabaseTransaction,
        balance: Number(debit.rows[0].balance),
        created: true,
      };
    } catch (error) {
      if (transactionOpen) await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public static async saveSaspayPayment(
    transactionId: string,
    paymentId: string,
    checkoutUrl?: string,
  ): Promise<DatabaseTransaction | null> {
    const rows = await getDatabaseSql()`
      UPDATE public.transactions
      SET saspay_payment_id = ${paymentId},
          checkout_url = ${checkoutUrl || null},
          updated_at = NOW()
      WHERE id = ${transactionId}
        AND type = 'deposit'
        AND (saspay_payment_id IS NULL OR saspay_payment_id = ${paymentId})
      RETURNING *
    `;
    return (rows[0] as DatabaseTransaction) || null;
  }

  public static async saveSaspayPayout(
    transactionId: string,
    payoutId: string,
  ): Promise<DatabaseTransaction | null> {
    const rows = await getDatabaseSql()`
      UPDATE public.transactions
      SET saspay_payout_id = ${payoutId},
          updated_at = NOW()
      WHERE id = ${transactionId}
        AND type = 'withdraw'
        AND (saspay_payout_id IS NULL OR saspay_payout_id = ${payoutId})
      RETURNING *
    `;
    return (rows[0] as DatabaseTransaction) || null;
  }

  public static async markDepositFailed(paymentId: string): Promise<boolean> {
    const rows = await getDatabaseSql()`
      UPDATE public.transactions
      SET status = 'failed', updated_at = NOW()
      WHERE type = 'deposit'
        AND status = 'pending'
        AND (saspay_payment_id = ${paymentId} OR id = ${paymentId})
      RETURNING id
    `;
    return rows.length > 0;
  }

  public static async findTransactionForUser(
    transactionId: string,
    userId: string,
    type: 'deposit' | 'withdraw',
  ): Promise<{ transaction: DatabaseTransaction; user: DatabaseUser } | null> {
    const rows = await getDatabaseSql()`
      SELECT t.*, u.id AS account_id, u.name, u.email, u.password_hash, u.country,
             u.balance, u.is_activated, u.role, u.created_at AS user_created_at,
             u.updated_at AS user_updated_at
      FROM public.transactions t
      JOIN public.users u ON u.id = t.user_id
      WHERE t.id = ${transactionId} AND t.user_id = ${userId} AND t.type = ${type}
      LIMIT 1
    `;
    if (!rows[0]) return null;
    const row = rows[0] as any;
    return {
      transaction: row as DatabaseTransaction,
      user: {
        id: row.account_id,
        name: row.name,
        email: row.email,
        password_hash: row.password_hash,
        country: row.country,
        balance: Number(row.balance),
        is_activated: row.is_activated,
        role: row.role,
        created_at: row.user_created_at,
        updated_at: row.user_updated_at,
      },
    };
  }

  public static async claimPendingPayoutRetry(
    transactionId: string,
    userId: string,
  ): Promise<{ transaction: DatabaseTransaction; user: DatabaseUser } | null> {
    const rows = await getDatabaseSql()`
      UPDATE public.transactions
      SET updated_at = NOW()
      WHERE id = ${transactionId}
        AND user_id = ${userId}
        AND type = 'withdraw'
        AND status = 'pending'
        AND saspay_payout_id IS NULL
        AND idempotency_key IS NOT NULL
        AND updated_at <= NOW() - INTERVAL '30 seconds'
      RETURNING id
    `;
    if (!rows.length) return null;
    return this.findTransactionForUser(transactionId, userId, 'withdraw');
  }

  public static async settleDeposit(
    paymentId: string,
    netAmount: number,
    currency: string,
  ): Promise<{ user: DatabaseUser; transaction: DatabaseTransaction; credited: boolean } | null> {
    const client = await getDatabasePool().connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `SELECT t.*, u.id AS account_id, u.name, u.email, u.password_hash, u.country,
                u.balance, u.is_activated, u.role, u.created_at AS user_created_at,
                u.updated_at AS user_updated_at
         FROM public.transactions t
         JOIN public.users u ON u.id = t.user_id
         WHERE t.type = 'deposit'
           AND (t.saspay_payment_id = $1 OR t.id = $1)
         FOR UPDATE OF t, u`,
        [paymentId],
      );
      const row = result.rows[0];
      if (!row) {
        await client.query('COMMIT');
        return null;
      }

      const transaction = row as DatabaseTransaction;
      const user: DatabaseUser = {
        id: row.account_id,
        name: row.name,
        email: row.email,
        password_hash: row.password_hash,
        country: row.country,
        balance: Number(row.balance),
        is_activated: row.is_activated,
        role: row.role,
        created_at: row.user_created_at,
        updated_at: row.user_updated_at,
      };

      if (transaction.status === 'success') {
        await client.query('COMMIT');
        return { user, transaction, credited: false };
      }
      if (transaction.status !== 'pending') {
        await client.query('COMMIT');
        return null;
      }
      if (!Number.isFinite(netAmount) || netAmount <= 0 || netAmount > Number(transaction.amount)) {
        throw new Error('Le montant net confirmé par SasPay est invalide pour cette transaction.');
      }
      if (currency !== transaction.currency) {
        throw new Error('La devise confirmée par SasPay ne correspond pas à la devise de la transaction.');
      }

      const updatedUserResult = await client.query(
        `UPDATE public.users
         SET balance = balance + $2, is_activated = true, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [transaction.user_id, netAmount],
      );
      const updatedTransactionResult = await client.query(
        `UPDATE public.transactions
         SET status = 'success', credited_amount = $2, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [transaction.id, netAmount],
      );
      await client.query('COMMIT');
      return {
        user: updatedUserResult.rows[0] as DatabaseUser,
        transaction: updatedTransactionResult.rows[0] as DatabaseTransaction,
        credited: true,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public static async finalizeWithdrawal(
    transactionId: string,
    status: 'success' | 'failed',
  ): Promise<{ transaction: DatabaseTransaction; user: DatabaseUser; changed: boolean } | null> {
    const client = await getDatabasePool().connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `SELECT t.*, u.id AS account_id, u.name, u.email, u.password_hash, u.country,
                u.balance, u.is_activated, u.role, u.created_at AS user_created_at,
                u.updated_at AS user_updated_at
         FROM public.transactions t
         JOIN public.users u ON u.id = t.user_id
         WHERE t.id = $1 AND t.type = 'withdraw'
         FOR UPDATE OF t, u`,
        [transactionId],
      );
      const row = result.rows[0];
      if (!row) {
        await client.query('COMMIT');
        return null;
      }
      let transaction = row as DatabaseTransaction;
      let user: DatabaseUser = {
        id: row.account_id,
        name: row.name,
        email: row.email,
        password_hash: row.password_hash,
        country: row.country,
        balance: Number(row.balance),
        is_activated: row.is_activated,
        role: row.role,
        created_at: row.user_created_at,
        updated_at: row.user_updated_at,
      };

      if (transaction.status !== 'pending') {
        await client.query('COMMIT');
        return { transaction, user, changed: false };
      }

      if (status === 'failed') {
        const updatedUser = await client.query(
          `UPDATE public.users
           SET balance = balance + $2, updated_at = NOW()
           WHERE id = $1
           RETURNING *`,
          [transaction.user_id, transaction.amount],
        );
        user = updatedUser.rows[0] as DatabaseUser;
      }
      const updatedTransaction = await client.query(
        `UPDATE public.transactions
         SET status = $2, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [transaction.id, status],
      );
      transaction = updatedTransaction.rows[0] as DatabaseTransaction;
      await client.query('COMMIT');
      return { transaction, user, changed: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

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
        u.id as account_id, u.name as user_name, u.email as user_email, u.balance as user_balance,
        u.country as user_country, u.is_activated, u.role,
        u.created_at as user_created_at, u.updated_at as user_updated_at
      FROM public.transactions t
      JOIN public.users u ON t.user_id = u.id
      WHERE t.type = 'deposit' AND t.saspay_payment_id = ${paymentId}
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
      metadata: row.metadata,
      idempotency_key: row.idempotency_key,
      request_fingerprint: row.request_fingerprint,
      credited_amount: row.credited_amount === null ? null : Number(row.credited_amount),
      created_at: row.created_at,
    };

    const user: DatabaseUser = {
      id: row.account_id,
      name: row.user_name,
      email: row.user_email,
      password_hash: '',
      country: row.user_country,
      balance: Number(row.user_balance),
      is_activated: Boolean(row.is_activated),
      role: 'player',
      created_at: row.user_created_at,
      updated_at: row.user_updated_at,
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
