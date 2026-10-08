import 'dotenv/config';
import { getDatabasePool, initializeDatabaseSchema, isDatabaseConfigured } from '../database.js';

async function initDatabase() {
  if (!isDatabaseConfigured()) {
    throw new Error('DATABASE_URL is not configured.');
  }

  const pool = getDatabasePool();
  try {
    const connection = await pool.query('SELECT NOW() AS current_time, version() AS pg_version');
    console.log('PostgreSQL connection successful.');
    console.log(`Server time: ${connection.rows[0].current_time}`);
    console.log(`PostgreSQL version: ${connection.rows[0].pg_version.split(',')[0]}`);

    await initializeDatabaseSchema();

    const count = await pool.query('SELECT COUNT(*) AS count FROM public.users');
    console.log(`Users in database: ${count.rows[0].count}`);
  } finally {
    await pool.end();
  }
}

initDatabase().catch((error: unknown) => {
  console.error('Database initialization failed:', error);
  process.exitCode = 1;
});
