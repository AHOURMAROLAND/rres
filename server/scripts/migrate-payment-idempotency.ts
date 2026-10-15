import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getDatabasePool, isDatabaseConfigured } from '../database.js';

async function migratePaymentIdempotency() {
  if (!isDatabaseConfigured()) {
    throw new Error('DATABASE_URL is not configured.');
  }

  const pool = getDatabasePool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const duplicatePayments = await client.query(
      `SELECT saspay_payment_id, COUNT(*)::int AS count
       FROM public.transactions
       WHERE saspay_payment_id IS NOT NULL
       GROUP BY saspay_payment_id
       HAVING COUNT(*) > 1
       LIMIT 5`,
    );
    const duplicatePayouts = await client.query(
      `SELECT saspay_payout_id, COUNT(*)::int AS count
       FROM public.transactions
       WHERE saspay_payout_id IS NOT NULL
       GROUP BY saspay_payout_id
       HAVING COUNT(*) > 1
       LIMIT 5`,
    );
    if (duplicatePayments.rows.length || duplicatePayouts.rows.length) {
      throw new Error('Duplicate SasPay payment or payout IDs exist; reconcile them before applying the unique indexes.');
    }

    const migrationPath = path.join(
      process.cwd(),
      'database_migrations',
      '20261015_payment_idempotency.sql',
    );
    const migration = await fs.readFile(migrationPath, 'utf8');
    await client.query(migration);
    await client.query('COMMIT');
    console.log('Payment idempotency migration applied successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migratePaymentIdempotency().catch((error: unknown) => {
  console.error('Payment idempotency migration failed:', error);
  process.exitCode = 1;
});
