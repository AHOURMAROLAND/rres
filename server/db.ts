import fs from 'fs';
import path from 'path';

export interface DbUser {
  id: string;
  name: string;
  email: string;
  password: string; // bcrypt hash
  country: string;
  balance: number; // in FCFA
  isActivated: boolean;
  createdAt: string;
  updatedAt: string;
  bets?: any[];
  transactions?: any[];
}

interface DatabaseSchema {
  users: DbUser[];
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'users.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {
    console.error('Failed to create data directory:', e);
  }
}

// Initial DB template if not exists
if (!fs.existsSync(DB_FILE)) {
  try {
    const initialData: DatabaseSchema = { users: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to initialize db file:', e);
  }
}

export class UserDatabase {
  private static readDB(): DatabaseSchema {
    try {
      if (!fs.existsSync(DB_FILE)) {
        return { users: [] };
      }
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      console.error('Error reading database:', e);
      return { users: [] };
    }
  }

  private static writeDB(data: DatabaseSchema): void {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.error('Error writing database:', e);
    }
  }

  public static findByEmail(email: string): DbUser | undefined {
    const db = this.readDB();
    const cleanEmail = email.trim().toLowerCase();
    return db.users.find((u) => u.email.toLowerCase() === cleanEmail);
  }

  public static findById(id: string): DbUser | undefined {
    const db = this.readDB();
    return db.users.find((u) => u.id === id);
  }

  public static create(user: DbUser): DbUser {
    const db = this.readDB();
    db.users.push(user);
    this.writeDB(db);
    return user;
  }

  public static update(id: string, updates: Partial<DbUser>): DbUser | undefined {
    const db = this.readDB();
    const index = db.users.findIndex((u) => u.id === id);
    if (index === -1) return undefined;

    db.users[index] = {
      ...db.users[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.writeDB(db);
    return db.users[index];
  }

  public static addBet(userId: string, bet: any): void {
    const db = this.readDB();
    const user = db.users.find((u) => u.id === userId);
    if (user) {
      if (!user.bets) user.bets = [];
      user.bets.unshift(bet);
      user.bets = user.bets.slice(0, 100);
      user.updatedAt = new Date().toISOString();
      this.writeDB(db);
    }
  }

  public static addTransaction(userId: string, tx: any): void {
    const db = this.readDB();
    const user = db.users.find((u) => u.id === userId);
    if (user) {
      if (!user.transactions) user.transactions = [];
      user.transactions.unshift(tx);
      user.transactions = user.transactions.slice(0, 50);
      user.updatedAt = new Date().toISOString();
      this.writeDB(db);
    }
  }

  public static findBySaspayPaymentId(paymentId: string): { user: DbUser; transaction: any } | null {
    const db = this.readDB();
    for (const u of db.users) {
      if (u.transactions) {
        const tx = u.transactions.find((t: any) => t.saspayPaymentId === paymentId || t.id === paymentId || t.reference === paymentId);
        if (tx) {
          return { user: u, transaction: tx };
        }
      }
    }
    return null;
  }

  public static updateTransaction(userId: string, txIdOrSaspayId: string, updates: any): DbUser | null {
    const db = this.readDB();
    const user = db.users.find((u) => u.id === userId);
    if (!user || !user.transactions) return null;

    const txIndex = user.transactions.findIndex((t: any) => t.id === txIdOrSaspayId || t.saspayPaymentId === txIdOrSaspayId);
    if (txIndex === -1) return null;

    user.transactions[txIndex] = {
      ...user.transactions[txIndex],
      ...updates,
    };
    user.updatedAt = new Date().toISOString();
    this.writeDB(db);
    return user;
  }
}
