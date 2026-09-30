import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createServer as createViteServer } from 'vite';
import { UserDatabase, DbUser } from './server/db.js';
import {
  isSaspayConfigured,
  createSaspayPayment,
  verifySaspayPayment,
  createSaspayPayout,
  verifySaspayWebhookSignature,
} from './server/saspay.js';
import { isNeonConfigured, NeonDatabase } from './server/neon.js';

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'aerocrash_super_secret_jwt_key_2026';

// Configurable Business Rules
const MIN_DEPOSIT_FCFA = Number(process.env.MIN_DEPOSIT_FCFA || 500);
const MIN_WITHDRAW_FCFA = Number(process.env.MIN_WITHDRAW_FCFA || 1000);
const PLATFORM_FEE_PERCENT = Number(process.env.PLATFORM_FEE_PERCENT || 0.025);

// 1. Enable CORS for all origins, allowing frontend-backend communication across domains
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Webhook-Signature', 'X-Webhook-Timestamp', 'X-Webhook-Event', 'Idempotency-Key'],
}));

// Preflight requests handling
app.options('*', cors());

// Middleware for parsing JSON with limit and preserving raw body buffer for SasPay webhook HMAC verification
app.use(express.json({
  limit: '5mb',
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  },
}));

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
    let existing = UserDatabase.findByEmail(cleanEmail);
    if (!existing && isNeonConfigured()) {
      const neonFound = await NeonDatabase.findByEmail(cleanEmail);
      if (neonFound) {
        existing = {
          id: neonFound.id,
          name: neonFound.name,
          email: neonFound.email,
          password: neonFound.password_hash,
          country: neonFound.country,
          balance: Number(neonFound.balance),
          isActivated: neonFound.is_activated,
          createdAt: neonFound.created_at,
          updatedAt: neonFound.updated_at,
          bets: [],
          transactions: [],
        };
      }
    }

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

    if (isNeonConfigured()) {
      try {
        await NeonDatabase.createUser({
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          password_hash: hashedPassword,
          country: newUser.country,
          balance: 0,
          is_activated: false,
        });
      } catch (neonErr) {
        console.warn('Neon database user sync warning:', neonErr);
      }
    }

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

    // Find user by email (in local DB or Neon)
    let user = UserDatabase.findByEmail(cleanEmail);
    if (!user && isNeonConfigured()) {
      const neonFound = await NeonDatabase.findByEmail(cleanEmail);
      if (neonFound) {
        user = {
          id: neonFound.id,
          name: neonFound.name,
          email: neonFound.email,
          password: neonFound.password_hash,
          country: neonFound.country,
          balance: Number(neonFound.balance),
          isActivated: neonFound.is_activated,
          createdAt: neonFound.created_at,
          updatedAt: neonFound.updated_at,
          bets: [],
          transactions: [],
        };
        UserDatabase.create(user);
      }
    }

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

    let bets = user.bets || [];
    let transactions = user.transactions || [];
    if (isNeonConfigured()) {
      try {
        transactions = await NeonDatabase.getUserTransactions(user.id);
        bets = await NeonDatabase.getUserBets(user.id);
      } catch (err) {}
    }

    res.json({
      success: true,
      message: `Connexion réussie. Bon retour parmi nous, ${user.name} !`,
      token,
      user: sanitizeUser(user),
      bets,
      transactions,
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
const handleMe = async (req: Request, res: Response): Promise<void> => {
  const decoded = authenticateToken(req);
  if (!decoded) {
    res.status(401).json({ success: false, message: 'Session invalide ou expirée.' });
    return;
  }

  let user = UserDatabase.findById(decoded.id);
  let bets = user?.bets || [];
  let transactions = user?.transactions || [];

  if (isNeonConfigured()) {
    try {
      const neonUser = await NeonDatabase.findById(decoded.id);
      if (neonUser) {
        user = {
          id: neonUser.id,
          name: neonUser.name,
          email: neonUser.email,
          password: neonUser.password_hash,
          country: neonUser.country,
          balance: Number(neonUser.balance),
          isActivated: neonUser.is_activated,
          createdAt: neonUser.created_at,
          updatedAt: neonUser.updated_at,
        };
        transactions = await NeonDatabase.getUserTransactions(decoded.id);
        bets = await NeonDatabase.getUserBets(decoded.id);
      }
    } catch (err) {}
  }

  if (!user) {
    res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });
    return;
  }

  res.json({
    success: true,
    user: sanitizeUser(user),
    bets,
    transactions,
  });
};

// Route bindings with aliases for maximum compatibility across Netlify, Render, Railway, etc.
app.post('/api/register', handleRegister);
app.post('/api/auth/register', handleRegister);
app.post('/api/user/register', handleRegister);
app.post('/.netlify/functions/register', handleRegister);

app.post('/api/login', handleLogin);
app.post('/api/auth/login', handleLogin);
app.post('/api/user/login', handleLogin);
app.post('/.netlify/functions/login', handleLogin);

app.get('/api/me', handleMe);
app.get('/api/auth/me', handleMe);
app.get('/api/user/me', handleMe);
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

// Deposit Route (Mandatory deposit to unlock real game, supports SasPay and simulated fallback)
const handleDeposit = async (req: Request, res: Response): Promise<void> => {
  const decoded = authenticateToken(req);
  if (!decoded) {
    res.status(401).json({ success: false, message: 'Non autorisé. Veuillez vous connecter.' });
    return;
  }

  const { amount, method = 'wave', phone, country, otp } = req.body;
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount < MIN_DEPOSIT_FCFA) {
    res.status(400).json({ success: false, message: `Montant de dépôt invalide (minimum ${MIN_DEPOSIT_FCFA.toLocaleString('fr-FR')} FCFA).` });
    return;
  }

  const user = UserDatabase.findById(decoded.id);
  if (!user) {
    res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });
    return;
  }

  const cleanPhone = (phone || user.email || '').toString().trim();
  const txId = 'tx_dep_' + Math.random().toString(36).substring(2, 9);
  const reference = 'DEP-' + Date.now().toString().slice(-6);

  // 1. If SasPay is configured, initiate real payment on SasPay
  if (isSaspayConfigured()) {
    try {
      const saspayResult = await createSaspayPayment({
        amount: numAmount,
        country: country || user.country || 'CI',
        method,
        customer: {
          first_name: user.name.split(' ')[0] || 'Joueur',
          last_name: user.name.split(' ').slice(1).join(' ') || 'AeroCrash',
          email: user.email,
          phone: cleanPhone,
        },
        description: `Dépôt AeroCrash ${numAmount.toLocaleString('fr-FR')} FCFA`,
        returnUrl: `${process.env.APP_URL || ''}?payment=success&payment_id=`,
        otp,
      });

      if (!saspayResult.success || !saspayResult.paymentId) {
        res.status(400).json({
          success: false,
          message: saspayResult.message || 'Échec de l\'initialisation du paiement SasPay.',
        });
        return;
      }

      const tx = {
        id: txId,
        userId: decoded.id,
        type: 'deposit',
        amount: numAmount,
        method,
        phone: cleanPhone,
        reference,
        status: 'pending',
        timestamp: Date.now(),
        saspayPaymentId: saspayResult.paymentId,
        checkoutUrl: saspayResult.checkoutUrl,
      };

      UserDatabase.addTransaction(decoded.id, tx);
      if (isNeonConfigured()) {
        try {
          await NeonDatabase.addTransaction({
            id: tx.id,
            user_id: decoded.id,
            type: 'deposit',
            amount: numAmount,
            currency: 'XOF',
            method,
            phone_number: cleanPhone,
            reference,
            status: 'pending',
            saspay_payment_id: saspayResult.paymentId,
            checkout_url: saspayResult.checkoutUrl,
          });
        } catch (err) {}
      }

      res.json({
        success: true,
        pending: true,
        paymentId: saspayResult.paymentId,
        checkoutUrl: saspayResult.checkoutUrl,
        instructions: saspayResult.instructions,
        message: saspayResult.checkoutUrl
          ? 'Redirection vers la page de paiement sécurisée SasPay...'
          : 'Demande envoyée sur votre téléphone. Veuillez valider avec votre code PIN secret.',
        transaction: tx,
      });
      return;
    } catch (err: any) {
      console.error('SasPay deposit error:', err);
      res.status(500).json({
        success: false,
        message: err?.message || 'Erreur lors de la communication avec SasPay.',
      });
      return;
    }
  }

  // 2. Offline / Simulation fallback if SASPAY_API_KEY is not configured
  const newBalance = Math.round(((user.balance || 0) + numAmount) * 100) / 100;
  const updated = UserDatabase.update(decoded.id, {
    balance: newBalance,
    isActivated: true,
  });

  const tx = {
    id: txId,
    userId: decoded.id,
    type: 'deposit',
    amount: numAmount,
    method,
    phone: cleanPhone,
    reference,
    status: 'success',
    timestamp: Date.now(),
  };
  UserDatabase.addTransaction(decoded.id, tx);
  if (isNeonConfigured()) {
    try {
      await NeonDatabase.updateBalance(decoded.id, newBalance, true);
      await NeonDatabase.addTransaction({
        id: tx.id,
        user_id: decoded.id,
        type: 'deposit',
        amount: numAmount,
        currency: 'XOF',
        method,
        phone_number: cleanPhone,
        reference,
        status: 'success',
      });
    } catch (err) {}
  }

  res.json({
    success: true,
    message: `Dépôt de ${numAmount.toLocaleString('fr-FR')} FCFA validé avec succès (Mode Démo / Test) ! Jeu débloqué.`,
    balance: newBalance,
    user: updated ? sanitizeUser(updated) : null,
    transaction: tx,
  });
};
app.post('/api/user/deposit', handleDeposit);
app.post('/.netlify/functions/deposit', handleDeposit);

// Check Payment Status endpoint (for frontend polling and post-redirect verification)
const handlePaymentStatus = async (req: Request, res: Response): Promise<void> => {
  const paymentId = (req.params.paymentId || (req.query.paymentId as string) || '').trim();
  if (!paymentId) {
    res.status(400).json({ success: false, message: 'Identifiant de paiement requis.' });
    return;
  }

  // 1. If not configured, check existing transaction
  if (!isSaspayConfigured()) {
    const found = UserDatabase.findBySaspayPaymentId(paymentId);
    if (found) {
      res.json({
        success: true,
        status: found.transaction.status || 'SUCCESS',
        balance: found.user.balance,
      });
      return;
    }
    res.json({ success: true, status: 'SUCCESS' });
    return;
  }

  try {
    const verifyRes = await verifySaspayPayment(paymentId);
    const found = UserDatabase.findBySaspayPaymentId(paymentId);

    if (verifyRes.status === 'SUCCESS' && found) {
      if (found.transaction.status === 'pending') {
        const addedAmount = Number(found.transaction.amount) || Number(verifyRes.amount) || 0;
        const newBalance = Math.round(((found.user.balance || 0) + addedAmount) * 100) / 100;

        UserDatabase.update(found.user.id, {
          balance: newBalance,
          isActivated: true,
        });

        UserDatabase.updateTransaction(found.user.id, paymentId, {
          status: 'success',
          completedAt: new Date().toISOString(),
        });

        if (isNeonConfigured()) {
          try {
            await NeonDatabase.updateBalance(found.user.id, newBalance, true);
            await NeonDatabase.updateTransactionStatus(paymentId, 'success');
          } catch (err) {}
        }

        const freshUser = UserDatabase.findById(found.user.id);
        res.json({
          success: true,
          status: 'SUCCESS',
          balance: newBalance,
          user: freshUser ? sanitizeUser(freshUser) : null,
          message: 'Paiement confirmé avec succès ! Jeu débloqué.',
        });
        return;
      }

      res.json({
        success: true,
        status: 'SUCCESS',
        balance: found.user.balance,
      });
      return;
    }

    if (verifyRes.status === 'FAILED' && found) {
      UserDatabase.updateTransaction(found.user.id, paymentId, { status: 'failed' });
      if (isNeonConfigured()) {
        try {
          await NeonDatabase.updateTransactionStatus(paymentId, 'failed');
        } catch (err) {}
      }
    }

    res.json({
      success: true,
      status: verifyRes.status,
      message: verifyRes.message,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Erreur vérification SasPay' });
  }
};
app.get('/api/user/payment-status/:paymentId', handlePaymentStatus);
app.get('/api/user/payment-status', handlePaymentStatus);
app.get('/.netlify/functions/payment-status', handlePaymentStatus);

// Withdraw Route
const handleWithdraw = async (req: Request, res: Response): Promise<void> => {
  const decoded = authenticateToken(req);
  if (!decoded) {
    res.status(401).json({ success: false, message: 'Non autorisé.' });
    return;
  }

  const { amount, method = 'wave', phone, country } = req.body;
  const numAmount = Number(amount);
  const user = UserDatabase.findById(decoded.id);
  if (!user) {
    res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });
    return;
  }

  if (isNaN(numAmount) || numAmount < MIN_WITHDRAW_FCFA || numAmount > user.balance) {
    res.status(400).json({ success: false, message: `Solde insuffisant ou montant invalide (minimum ${MIN_WITHDRAW_FCFA.toLocaleString('fr-FR')} FCFA).` });
    return;
  }

  const cleanPhone = (phone || user.email || '').toString().trim();
  const txId = 'tx_wth_' + Math.random().toString(36).substring(2, 9);
  const reference = 'RET-' + Date.now().toString().slice(-6);

  // 1. If SasPay is configured, initiate real payout
  if (isSaspayConfigured()) {
    try {
      const payoutRes = await createSaspayPayout({
        amount: numAmount,
        country: country || user.country || 'CI',
        method,
        phone: cleanPhone,
        customer: {
          first_name: user.name.split(' ')[0] || 'Joueur',
          last_name: user.name.split(' ').slice(1).join(' ') || 'AeroCrash',
          email: user.email,
          phone: cleanPhone,
        },
        description: `Retrait gains AeroCrash ${numAmount.toLocaleString('fr-FR')} FCFA`,
      });

      if (!payoutRes.success) {
        res.status(400).json({
          success: false,
          message: payoutRes.message || 'Échec de l\'envoi du retrait via SasPay.',
        });
        return;
      }

      // Deduct balance
      const newBalance = Math.round((user.balance - numAmount) * 100) / 100;
      const updated = UserDatabase.update(decoded.id, { balance: newBalance });

      const tx = {
        id: txId,
        userId: decoded.id,
        type: 'withdraw',
        amount: numAmount,
        method,
        phone: cleanPhone,
        reference,
        status: 'pending',
        timestamp: Date.now(),
        saspayPayoutId: payoutRes.payoutId,
      };
      UserDatabase.addTransaction(decoded.id, tx);

      if (isNeonConfigured()) {
        try {
          await NeonDatabase.updateBalance(decoded.id, newBalance);
          await NeonDatabase.addTransaction({
            id: tx.id,
            user_id: decoded.id,
            type: 'withdraw',
            amount: numAmount,
            currency: 'XOF',
            method,
            phone_number: cleanPhone,
            reference,
            status: 'pending',
            saspay_payout_id: payoutRes.payoutId,
          });
        } catch (err) {}
      }

      res.json({
        success: true,
        message: `Demande de retrait de ${numAmount.toLocaleString('fr-FR')} FCFA transférée vers votre compte Mobile Money.`,
        balance: newBalance,
        user: updated ? sanitizeUser(updated) : null,
        transaction: tx,
      });
      return;
    } catch (err: any) {
      console.error('SasPay payout error:', err);
      res.status(500).json({
        success: false,
        message: err?.message || 'Erreur lors du traitement du retrait SasPay.',
      });
      return;
    }
  }

  // 2. Offline simulation fallback
  const newBalance = Math.round((user.balance - numAmount) * 100) / 100;
  const updated = UserDatabase.update(decoded.id, { balance: newBalance });

  const tx = {
    id: txId,
    userId: decoded.id,
    type: 'withdraw',
    amount: numAmount,
    method,
    phone: cleanPhone,
    reference,
    status: 'success',
    timestamp: Date.now(),
  };
  UserDatabase.addTransaction(decoded.id, tx);
  if (isNeonConfigured()) {
    try {
      await NeonDatabase.updateBalance(decoded.id, newBalance);
      await NeonDatabase.addTransaction({
        id: tx.id,
        user_id: decoded.id,
        type: 'withdraw',
        amount: numAmount,
        currency: 'XOF',
        method,
        phone_number: cleanPhone,
        reference,
        status: 'success',
      });
    } catch (err) {}
  }

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

// SasPay Webhook Endpoint
const handleSaspayWebhook = async (req: Request, res: Response): Promise<void> => {
  const sig = (req.headers['x-webhook-signature'] as string) || '';
  const timestamp = (req.headers['x-webhook-timestamp'] as string) || '';
  const rawBody = (req as any).rawBody || JSON.stringify(req.body);

  if (process.env.SASPAY_WEBHOOK_SECRET) {
    const isValid = verifySaspayWebhookSignature(rawBody, sig, timestamp);
    if (!isValid) {
      console.warn('SasPay Webhook: Invalid signature or timestamp rejected');
      res.status(403).json({ error: 'Signature invalide ou délai dépassé' });
      return;
    }
  }

  const { event, data } = req.body || {};
  console.log(`[SasPay Webhook] Event received: ${event}`, data?.id);

  if (event === 'transaction.success' && data?.id) {
    const found = UserDatabase.findBySaspayPaymentId(data.id);
    if (found && found.transaction.status === 'pending') {
      const addedAmount = Number(found.transaction.amount) || Number(data.net_amount || data.amount) || 0;
      const newBalance = Math.round(((found.user.balance || 0) + addedAmount) * 100) / 100;

      UserDatabase.update(found.user.id, {
        balance: newBalance,
        isActivated: true,
      });

      UserDatabase.updateTransaction(found.user.id, data.id, {
        status: 'success',
        completedAt: new Date().toISOString(),
      });

      if (isNeonConfigured()) {
        try {
          await NeonDatabase.updateBalance(found.user.id, newBalance, true);
          await NeonDatabase.updateTransactionStatus(data.id, 'success');
        } catch (err) {}
      }
    }
  } else if (event === 'transaction.failed' && data?.id) {
    const found = UserDatabase.findBySaspayPaymentId(data.id);
    if (found) {
      UserDatabase.updateTransaction(found.user.id, data.id, {
        status: 'failed',
      });
      if (isNeonConfigured()) {
        try {
          await NeonDatabase.updateTransactionStatus(data.id, 'failed');
        } catch (err) {}
      }
    }
  }

  res.status(200).json({ received: true });
};
app.post('/api/webhook/saspay', handleSaspayWebhook);
app.post('/.netlify/functions/webhook-saspay', handleSaspayWebhook);

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
const handleBet = async (req: Request, res: Response): Promise<void> => {
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
  if (isNeonConfigured()) {
    try {
      await NeonDatabase.addBet({
        id: bet.id || 'bet_' + Date.now().toString(36),
        user_id: decoded.id,
        round_id: bet.roundId || 'R-0',
        game_mode: bet.gameMode || 'real',
        amount: Number(bet.amount) || 0,
        crash_multiplier: Number(bet.multiplier) || 1,
        cashout_multiplier: bet.cashoutMultiplier ? Number(bet.cashoutMultiplier) : null,
        gross_profit: Number(bet.grossProfit) || 0,
        fee: Number(bet.fee) || 0,
        net_profit: Number(bet.netProfit) || 0,
        won: Boolean(bet.won),
      });
    } catch (err) {}
  }

  res.json({ success: true });
};
app.post('/api/user/bets', handleBet);
app.post('/.netlify/functions/bets', handleBet);

// Log Transaction
const handleTx = async (req: Request, res: Response): Promise<void> => {
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
  if (isNeonConfigured()) {
    try {
      await NeonDatabase.addTransaction({
        id: transaction.id,
        user_id: decoded.id,
        type: transaction.type || 'deposit',
        amount: Number(transaction.amount) || 0,
        currency: 'XOF',
        method: transaction.method || 'wave',
        phone_number: transaction.phoneNumber || transaction.phone,
        reference: transaction.reference,
        status: transaction.status || 'success',
        saspay_payment_id: transaction.saspayPaymentId,
        checkout_url: transaction.checkoutUrl,
      });
    } catch (err) {}
  }

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
