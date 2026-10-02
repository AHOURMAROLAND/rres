// Shared JSON database and JWT helper for Netlify serverless functions
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// Determine database file path (works locally and in serverless environments)
function getDbFilePath() {
  const localDataDir = path.join(process.cwd(), 'data');
  const localDbFile = path.join(localDataDir, 'users.json');

  try {
    if (!fs.existsSync(localDataDir)) {
      fs.mkdirSync(localDataDir, { recursive: true });
    }
    if (!fs.existsSync(localDbFile)) {
      fs.writeFileSync(localDbFile, JSON.stringify({ users: [] }, null, 2), 'utf8');
    }
    return localDbFile;
  } catch (e) {
    // In read-only serverless lambdas, fall back to /tmp
    const tmpFile = path.join('/tmp', 'users.json');
    if (!fs.existsSync(tmpFile)) {
      try {
        fs.writeFileSync(tmpFile, JSON.stringify({ users: [] }, null, 2), 'utf8');
      } catch (err) {}
    }
    return tmpFile;
  }
}

const DB_FILE = getDbFilePath();

function readDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      return { users: [] };
    }
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('Error reading DB:', e);
    return { users: [] };
  }
}

function writeDB(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing DB:', e);
  }
}

let neonSql = null;
function getNeon() {
  if (!neonSql && process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== '') {
    try {
      const { neon } = require('@neondatabase/serverless');
      neonSql = neon(process.env.DATABASE_URL);
    } catch (e) {
      console.warn('Neon serverless driver not loaded:', e.message);
    }
  }
  return neonSql;
}

function findByEmail(email) {
  const db = readDB();
  const cleanEmail = String(email).trim().toLowerCase();
  return db.users.find((u) => u.email && u.email.toLowerCase() === cleanEmail);
}

function findById(id) {
  const db = readDB();
  return db.users.find((u) => u.id === id);
}

function createUser(user) {
  const db = readDB();
  db.users.push(user);
  writeDB(db);

  const sql = getNeon();
  if (sql) {
    sql`
      INSERT INTO public.users (id, name, email, password_hash, country, balance, is_activated)
      VALUES (${user.id}, ${user.name}, ${user.email.toLowerCase().trim()}, ${user.password}, ${user.country || 'CI'}, ${user.balance || 0}, ${Boolean(user.isActivated)})
      ON CONFLICT (id) DO NOTHING
    `.catch((err) => console.warn('Neon createUser error in lambda:', err.message));
  }

  return user;
}

function updateUser(id, updates) {
  const db = readDB();
  const index = db.users.findIndex((u) => u.id === id);
  if (index === -1) return null;

  db.users[index] = {
    ...db.users[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  writeDB(db);

  const sql = getNeon();
  if (sql) {
    if (typeof updates.balance === 'number') {
      const isAct = updates.isActivated !== undefined ? updates.isActivated : null;
      sql`
        UPDATE public.users 
        SET 
          balance = ${updates.balance},
          is_activated = CASE WHEN ${isAct === true} THEN true ELSE is_activated END,
          updated_at = NOW()
        WHERE id = ${id}
      `.catch((err) => console.warn('Neon updateBalance error in lambda:', err.message));
    }
  }

  return db.users[index];
}

function addBet(userId, bet) {
  const db = readDB();
  const user = db.users.find((u) => u.id === userId);
  if (user) {
    if (!user.bets) user.bets = [];
    user.bets.unshift(bet);
    user.bets = user.bets.slice(0, 100);
    user.updatedAt = new Date().toISOString();
    writeDB(db);

    const sql = getNeon();
    if (sql) {
      sql`
        INSERT INTO public.bets (
          id, user_id, round_id, game_mode, amount, 
          crash_multiplier, cashout_multiplier, gross_profit, fee, net_profit, won
        ) VALUES (
          ${bet.id || 'b_' + Date.now()}, ${userId}, ${bet.roundId || 'R-0'}, ${bet.gameMode || 'real'}, ${Number(bet.amount) || 0},
          ${Number(bet.multiplier) || 1}, ${bet.cashoutMultiplier ? Number(bet.cashoutMultiplier) : null}, ${Number(bet.grossProfit) || 0}, 
          ${Number(bet.fee) || 0}, ${Number(bet.netProfit) || 0}, ${Boolean(bet.won)}
        )
      `.catch(() => {});
    }
  }
}

function addTransaction(userId, tx) {
  const db = readDB();
  const user = db.users.find((u) => u.id === userId);
  if (user) {
    if (!user.transactions) user.transactions = [];
    user.transactions.unshift(tx);
    user.transactions = user.transactions.slice(0, 50);
    user.updatedAt = new Date().toISOString();
    writeDB(db);

    const sql = getNeon();
    if (sql) {
      sql`
        INSERT INTO public.transactions (
          id, user_id, type, amount, currency, method, 
          phone_number, reference, status, saspay_payment_id, saspay_payout_id, checkout_url
        ) VALUES (
          ${tx.id}, ${userId}, ${tx.type || 'deposit'}, ${Number(tx.amount) || 0}, ${tx.currency || 'XOF'}, ${tx.method || 'wave'},
          ${tx.phone || tx.phoneNumber || ''}, ${tx.reference || ''}, ${tx.status || 'pending'}, 
          ${tx.saspayPaymentId || null}, ${tx.saspayPayoutId || null}, ${tx.checkoutUrl || null}
        )
      `.catch(() => {});
    }
  }
}

function findBySaspayPaymentId(paymentId) {
  const db = readDB();
  for (const u of db.users) {
    if (u.transactions) {
      const tx = u.transactions.find((t) => t.saspayPaymentId === paymentId || t.id === paymentId || t.reference === paymentId);
      if (tx) {
        return { user: u, transaction: tx };
      }
    }
  }
  return null;
}

function updateTransaction(userId, txIdOrSaspayId, updates) {
  const db = readDB();
  const user = db.users.find((u) => u.id === userId);
  if (!user || !user.transactions) return null;

  const txIndex = user.transactions.findIndex((t) => t.id === txIdOrSaspayId || t.saspayPaymentId === txIdOrSaspayId);
  if (txIndex === -1) return null;

  user.transactions[txIndex] = {
    ...user.transactions[txIndex],
    ...updates,
  };
  user.updatedAt = new Date().toISOString();
  writeDB(db);

  const sql = getNeon();
  if (sql && updates.status) {
    sql`
      UPDATE public.transactions 
      SET status = ${updates.status}, updated_at = NOW()
      WHERE saspay_payment_id = ${txIdOrSaspayId} OR id = ${txIdOrSaspayId}
    `.catch(() => {});
  }

  return user;
}

function sanitizeUser(user) {
  if (!user) return null;
  const { password, ...safe } = user;
  return safe;
}

// Token helper
function generateToken(user) {
  const payload = {
    id: user.id,
    email: user.email,
    name: user.name,
    time: Date.now(),
  };
  return 'aerocrash_jwt_' + Buffer.from(JSON.stringify(payload)).toString('base64');
}

function verifyToken(token) {
  if (!token) return null;
  try {
    if (token.startsWith('Bearer ')) {
      token = token.slice(7).trim();
    }
    if (token.startsWith('aerocrash_jwt_')) {
      const base64 = token.replace('aerocrash_jwt_', '');
      const json = Buffer.from(base64, 'base64').toString('utf8');
      return JSON.parse(json);
    }
    return null;
  } catch (e) {
    return null;
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
};

module.exports = {
  readDB,
  writeDB,
  findByEmail,
  findById,
  createUser,
  updateUser,
  addBet,
  addTransaction,
  findBySaspayPaymentId,
  updateTransaction,
  sanitizeUser,
  generateToken,
  verifyToken,
  corsHeaders,
  bcrypt,
};
