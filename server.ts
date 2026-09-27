import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createServer as createViteServer } from 'vite';
import { UserDatabase, DbUser } from './server/db.js';

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'aerocrash_super_secret_jwt_key_2026';

// 1. Enable CORS for all origins, allowing frontend-backend communication across domains
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Preflight requests handling
app.options('*', cors());

// Middleware for parsing JSON with limit
app.use(express.json({ limit: '5mb' }));

// Helper: Sanitize user object for responses (removes hashed password)
function sanitizeUser(user: DbUser) {
  const { password, ...safeUser } = user;
  return safeUser;
}

// Helper: Verify JWT token from Authorization header
function authenticateToken(req: Request): { id: string; email: string } | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string };
    return decoded;
  } catch {
    return null;
  }
}

// ==========================================
// 1. HEALTH CHECK & API STATUS
// ==========================================
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'AeroCrash Backend API',
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

// ==========================================
// 2. AUTHENTICATION HANDLERS & ROUTES
// ==========================================

// Register Handler (supports both /api/auth/register and /api/register)
const handleRegister = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, country, password } = req.body || {};

    // Validation 1: Required fields
    if (!name || !email || !country || !password) {
      res.status(400).json({
        success: false,
        message: 'Veuillez remplir tous les champs obligatoires (nom complet, email, pays, mot de passe).',
      });
      return;
    }

    const cleanName = String(name).trim();
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanCountry = String(country).trim();
    const rawPassword = String(password);

    // Validation 2: Email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      res.status(400).json({
        success: false,
        message: 'Format d\'adresse email invalide. Veuillez entrer un email valide (ex: joueur@gmail.com).',
      });
      return;
    }

    // Validation 3: Password strength
    if (rawPassword.length < 6) {
      res.status(400).json({
        success: false,
        message: 'Le mot de passe doit comporter au moins 6 caractères pour sécuriser votre compte.',
      });
      return;
    }

    // Validation 4: Check if user already exists
    const existing = UserDatabase.findByEmail(cleanEmail);
    if (existing) {
      res.status(409).json({
        success: false,
        message: 'Un compte avec cette adresse email existe déjà. Veuillez vous connecter.',
      });
      return;
    }

    // Hash password with bcrypt
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(rawPassword, saltRounds);

    // Create unique user record
    const newUser: DbUser = {
      id: 'usr_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      name: cleanName,
      email: cleanEmail,
      password: hashedPassword,
      country: cleanCountry,
      balance: 0, // Starts at 0 FCFA until deposit
      isActivated: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      bets: [],
      transactions: [],
    };

    UserDatabase.create(newUser);

    // Generate JWT token (expires in 30 days)
    const token = jwt.sign(
      { id: newUser.id, email: newUser.email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      success: true,
      message: 'Compte créé avec succès ! Bienvenue sur AeroCrash.',
      token,
      user: sanitizeUser(newUser),
    });
  } catch (error) {
    console.error('Registration server error:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue sur le serveur lors de l\'inscription. Veuillez réessayer.',
    });
  }
};

// Login Handler (supports both /api/auth/login and /api/login)
const handleLogin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      res.status(400).json({
        success: false,
        message: 'Veuillez saisir votre email et votre mot de passe.',
      });
      return;
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const rawPassword = String(password);

    // Find user by email
    const user = UserDatabase.findByEmail(cleanEmail);
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Email ou mot de passe incorrect.',
      });
      return;
    }

    // Verify password with bcrypt
    const isMatch = await bcrypt.compare(rawPassword, user.password);
    if (!isMatch) {
      res.status(401).json({
        success: false,
        message: 'Email ou mot de passe incorrect.',
      });
      return;
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      message: `Connexion réussie. Bon retour parmi nous, ${user.name} !`,
      token,
      user: sanitizeUser(user),
      bets: user.bets || [],
      transactions: user.transactions || [],
    });
  } catch (error) {
    console.error('Login server error:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur interne est survenue sur le serveur lors de la connexion.',
    });
  }
};

// Me Handler (supports both /api/auth/me and /api/me)
const handleMe = (req: Request, res: Response): Promise<void> | void => {
  const decoded = authenticateToken(req);
  if (!decoded) {
    res.status(401).json({ success: false, message: 'Session invalide ou expirée.' });
    return;
  }

  const user = UserDatabase.findById(decoded.id);
  if (!user) {
    res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });
    return;
  }

  res.json({
    success: true,
    user: sanitizeUser(user),
    bets: user.bets || [],
    transactions: user.transactions || [],
  });
};

// Route bindings with aliases for maximum compatibility across Netlify, Render, Railway, etc.
app.post('/api/register', handleRegister);
app.post('/api/auth/register', handleRegister);
app.post('/.netlify/functions/register', handleRegister);

app.post('/api/login', handleLogin);
app.post('/api/auth/login', handleLogin);
app.post('/.netlify/functions/login', handleLogin);

app.get('/api/me', handleMe);
app.get('/api/auth/me', handleMe);
app.get('/.netlify/functions/me', handleMe);

// Update Balance (e.g. cashout, bet deduct, deposit)
const handleBalance = (req: Request, res: Response): Promise<void> | void => {
  const decoded = authenticateToken(req);
  if (!decoded) {
    res.status(401).json({ success: false, message: 'Non autorisé.' });
    return;
  }

  const { balance } = req.body;
  if (typeof balance !== 'number' || isNaN(balance) || balance < 0) {
    res.status(400).json({ success: false, message: 'Solde invalide.' });
    return;
  }

  const updated = UserDatabase.update(decoded.id, { balance: Math.round(balance * 100) / 100 });
  if (!updated) {
    res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });
    return;
  }

  res.json({ success: true, balance: updated.balance });
};
app.post('/api/user/balance', handleBalance);
app.post('/.netlify/functions/balance', handleBalance);

// Deposit Route (Mandatory deposit to unlock real game)
const handleDeposit = (req: Request, res: Response): Promise<void> | void => {
  const decoded = authenticateToken(req);
  if (!decoded) {
    res.status(401).json({ success: false, message: 'Non autorisé. Veuillez vous connecter.' });
    return;
  }

  const { amount, method = 'wave', phone } = req.body;
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount < 500) {
    res.status(400).json({ success: false, message: 'Montant de dépôt invalide (minimum 500 FCFA).' });
    return;
  }

  const user = UserDatabase.findById(decoded.id);
  if (!user) {
    res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });
    return;
  }

  const newBalance = Math.round(((user.balance || 0) + numAmount) * 100) / 100;
  const updated = UserDatabase.update(decoded.id, {
    balance: newBalance,
    isActivated: true, // Deposit automatically activates real play!
  });

  const tx = {
    id: 'tx_dep_' + Math.random().toString(36).substring(2, 9),
    userId: decoded.id,
    type: 'deposit',
    amount: numAmount,
    method,
    phone: phone || user.email,
    reference: 'DEP-' + Date.now().toString().slice(-6),
    status: 'success',
    timestamp: Date.now(),
  };
  UserDatabase.addTransaction(decoded.id, tx);

  res.json({
    success: true,
    message: `Dépôt de ${numAmount.toLocaleString('fr-FR')} FCFA validé avec succès ! Jeu débloqué.`,
    balance: newBalance,
    user: updated ? sanitizeUser(updated) : null,
    transaction: tx,
  });
};
app.post('/api/user/deposit', handleDeposit);
app.post('/.netlify/functions/deposit', handleDeposit);

// Withdraw Route
const handleWithdraw = (req: Request, res: Response): Promise<void> | void => {
  const decoded = authenticateToken(req);
  if (!decoded) {
    res.status(401).json({ success: false, message: 'Non autorisé.' });
    return;
  }

  const { amount, method = 'wave', phone } = req.body;
  const numAmount = Number(amount);
  const user = UserDatabase.findById(decoded.id);
  if (!user) {
    res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });
    return;
  }

  if (isNaN(numAmount) || numAmount <= 0 || numAmount > user.balance) {
    res.status(400).json({ success: false, message: 'Solde insuffisant pour ce montant de retrait.' });
    return;
  }

  const newBalance = Math.round((user.balance - numAmount) * 100) / 100;
  const updated = UserDatabase.update(decoded.id, { balance: newBalance });

  const tx = {
    id: 'tx_wth_' + Math.random().toString(36).substring(2, 9),
    userId: decoded.id,
    type: 'withdraw',
    amount: numAmount,
    method,
    phone: phone || user.email,
    reference: 'RET-' + Date.now().toString().slice(-6),
    status: 'success',
    timestamp: Date.now(),
  };
  UserDatabase.addTransaction(decoded.id, tx);

  res.json({
    success: true,
    message: `Retrait de ${numAmount.toLocaleString('fr-FR')} FCFA transféré vers votre compte Mobile Money.`,
    balance: newBalance,
    user: updated ? sanitizeUser(updated) : null,
    transaction: tx,
  });
};
app.post('/api/user/withdraw', handleWithdraw);
app.post('/.netlify/functions/withdraw', handleWithdraw);

// Activate Account
const handleActivate = (req: Request, res: Response): Promise<void> | void => {
  const decoded = authenticateToken(req);
  if (!decoded) {
    res.status(401).json({ success: false, message: 'Non autorisé.' });
    return;
  }

  const { initialBonus = 3000 } = req.body;
  const user = UserDatabase.findById(decoded.id);
  if (!user) {
    res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });
    return;
  }

  const newBalance = (user.balance || 0) + Number(initialBonus);
  const updated = UserDatabase.update(decoded.id, {
    isActivated: true,
    balance: newBalance,
  });

  const tx = {
    id: 'tx_act_' + Math.random().toString(36).substring(2, 9),
    userId: decoded.id,
    type: 'activation',
    amount: 2000,
    method: 'wave',
    reference: 'ACT-' + Date.now().toString().slice(-6),
    status: 'success',
    timestamp: Date.now(),
  };
  UserDatabase.addTransaction(decoded.id, tx);

  res.json({
    success: true,
    user: updated ? sanitizeUser(updated) : null,
    message: 'Compte activé avec succès ! Bonus de 3 000 FCFA crédité.',
  });
};
app.post('/api/user/activate', handleActivate);
app.post('/.netlify/functions/activate', handleActivate);

// Log Bet
const handleBet = (req: Request, res: Response): Promise<void> | void => {
  const decoded = authenticateToken(req);
  if (!decoded) {
    res.status(401).json({ success: false, message: 'Non autorisé.' });
    return;
  }

  const { bet } = req.body;
  if (!bet) {
    res.status(400).json({ success: false, message: 'Données du pari manquantes.' });
    return;
  }

  UserDatabase.addBet(decoded.id, bet);
  res.json({ success: true });
};
app.post('/api/user/bets', handleBet);
app.post('/.netlify/functions/bets', handleBet);

// Log Transaction
const handleTx = (req: Request, res: Response): Promise<void> | void => {
  const decoded = authenticateToken(req);
  if (!decoded) {
    res.status(401).json({ success: false, message: 'Non autorisé.' });
    return;
  }

  const { transaction } = req.body;
  if (!transaction) {
    res.status(400).json({ success: false, message: 'Données de transaction manquantes.' });
    return;
  }

  UserDatabase.addTransaction(decoded.id, transaction);
  res.json({ success: true });
};
app.post('/api/user/transactions', handleTx);
app.post('/.netlify/functions/transactions', handleTx);

// ==========================================
// 3. VITE MIDDLEWARE & STATIC SERVING
// ==========================================
async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AeroCrash server running on port ${PORT}`);
  });
}

start();
