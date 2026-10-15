import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
// Note: Vite is dynamically imported in start() to prevent bundling overhead in serverless (Vercel) environments
import { UserDatabase, DbUser } from './server/db.js';
import {
  isSaspayConfigured,
  createSaspayPayment,
  verifySaspayPayment,
  createSaspayPayout,
  verifySaspayPayout,
  verifySaspayWebhookSignature,
  normalizeCountryCode,
  getCurrencyForCountry,
} from './server/saspay.js';
import {
  initializeDatabaseSchema,
  isDatabaseConfigured,
  PostgresDatabase,
  IdempotencyConflictError,
  InsufficientFundsError,
  getDatabaseSql,
} from './server/database.js';
import {
  createRequestFingerprint,
  isValidIdempotencyKey,
  parseMoney,
  validateDepositSettlement,
} from './server/payment-validation.js';
import {
  verifyEmailAddress,
  sendTransactionalEmail,
  OtpService,
  EmailTemplates,
} from './server/email.js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
const JWT_SECRET = process.env.JWT_SECRET || (isProduction ? '' : 'aerocrash_super_secret_jwt_key_2026');

if (isProduction) {
  const missingVariables = ['DATABASE_URL', 'JWT_SECRET'].filter(
    (name) => !process.env[name]?.trim(),
  );
  if (process.env.SASPAY_API_KEY?.trim() && !process.env.SASPAY_WEBHOOK_SECRET?.trim()) {
    missingVariables.push('SASPAY_WEBHOOK_SECRET (required when SASPAY_API_KEY is set)');
  }
  if (missingVariables.length > 0) {
    throw new Error(`Missing required production environment variables: ${missingVariables.join(', ')}`);
  }
}

// Helper: send deposit invoice email
function sendDepositInvoiceEmail(user: { email: string; name: string }, tx: any, newBalance: number) {
  if (!user || !user.email) return;
  sendTransactionalEmail({
    toEmail: user.email,
    toName: user.name,
    subject: `🧾 Reçu officiel de dépôt (${tx.reference}) - AeroCrash`,
    htmlContent: EmailTemplates.depositInvoice({
      name: user.name || 'Joueur AeroCrash',
      amount: Number(tx.credited_amount ?? tx.creditedAmount ?? tx.amount ?? 0),
      reference: tx.reference || 'DEP-000000',
      method: String(tx.method || 'wave').toUpperCase(),
      phone: String(tx.phone || tx.phoneNumber || tx.phone_number || ''),
      balance: newBalance,
      date: new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Abidjan' }),
    }),
  }).then((result) => {
    if (!result.success) console.warn('Failed to send deposit invoice email:', result.error);
  });
}

// Helper: send withdrawal receipt email
function sendWithdrawReceiptEmail(user: { email: string; name: string }, tx: any, newBalance: number) {
  if (!user || !user.email) return;
  sendTransactionalEmail({
    toEmail: user.email,
    toName: user.name,
    subject: `💸 Bordereau de retrait (${tx.reference}) - AeroCrash`,
    htmlContent: EmailTemplates.withdrawReceipt({
      name: user.name || 'Joueur AeroCrash',
      amount: Number(tx.amount || 0),
      reference: tx.reference || 'RET-000000',
      method: String(tx.method || 'wave').toUpperCase(),
      phone: String(tx.phone || tx.phoneNumber || tx.phone_number || ''),
      balance: newBalance,
      date: new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Abidjan' }),
    }),
  }).then((result) => {
    if (!result.success) console.warn('Failed to send withdraw receipt email:', result.error);
  });
}

// Configurable Business Rules
const MIN_DEPOSIT_FCFA = Number(process.env.MIN_DEPOSIT_FCFA || 1000);
const MIN_WITHDRAW_FCFA = Number(process.env.MIN_WITHDRAW_FCFA || 2000);
const PLATFORM_FEE_PERCENT = Number(process.env.PLATFORM_FEE_PERCENT || 0.025);
const REAL_MONEY_GAME_ENABLED = false;

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

// Serverless / Proxy Path Normalizer for Vercel & Netlify rewrites
app.use((req, res, next) => {
  const matchedPath = (req.headers['x-matched-path'] as string) || '';
  if (matchedPath && (req.url === '/' || req.url === '/api' || req.url === '/api/')) {
    req.url = matchedPath;
  }
  next();
});

// Helper: Sanitize user object for responses (removes hashed password)
function sanitizeUser(user: DbUser) {
  const { password, ...safeUser } = user;
  return safeUser;
}

function mapDatabaseUser(user: {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  country: string;
  balance: number;
  is_activated: boolean;
  created_at: string;
  updated_at: string;
}): DbUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    password: user.password_hash,
    country: user.country,
    balance: Number(user.balance),
    isActivated: user.is_activated,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
    bets: [],
    transactions: [],
  };
}

function toPublicTransaction(transaction: {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  method: string;
  phone_number?: string;
  reference: string;
  status: string;
  created_at: string;
  credited_amount?: number | null;
  saspay_payment_id?: string;
  saspay_payout_id?: string;
  checkout_url?: string;
}) {
  return {
    id: transaction.id,
    userId: transaction.user_id,
    type: transaction.type,
    amount: Number(transaction.amount),
    creditedAmount: transaction.credited_amount == null ? null : Number(transaction.credited_amount),
    method: transaction.method,
    phone: transaction.phone_number || '',
    phoneNumber: transaction.phone_number || '',
    reference: transaction.reference,
    status: transaction.status,
    timestamp: new Date(transaction.created_at).getTime(),
    paymentId: transaction.saspay_payment_id,
    payoutId: transaction.saspay_payout_id,
    checkoutUrl: transaction.checkout_url,
  };
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

// Email Domain Ping Handler
const handleVerifyEmailDomain = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body || {};
    const result = await verifyEmailAddress(email);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ valid: false, reason: err?.message || 'Erreur vérification email' });
  }
};

// Send Registration OTP Handler
const handleSendRegisterOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    if (process.env.REGISTRATION_ENABLED !== 'true') {
      res.status(503).json({
        success: false,
        message: 'Les nouvelles inscriptions sont temporairement suspendues pendant les travaux sur les paiements.',
      });
      return;
    }

    const { email, name } = req.body || {};
    if (!email) {
      res.status(400).json({ success: false, message: 'Adresse email requise.' });
      return;
    }
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanName = String(name || 'Pilote').trim();

    // 1. Verify email ping / DNS
    const verification = await verifyEmailAddress(cleanEmail);
    if (!verification.valid) {
      res.status(400).json({
        success: false,
        message: verification.reason || 'Cette adresse email est invalide ou son domaine n\'existe pas.',
      });
      return;
    }

    // 2. Check if already exists
    let existing = UserDatabase.findByEmail(cleanEmail);
    if (!existing && isDatabaseConfigured()) {
      const neonFound = await PostgresDatabase.findByEmail(cleanEmail);
      if (neonFound) existing = neonFound as any;
    }
    if (existing) {
      res.status(409).json({
        success: false,
        message: 'Un compte avec cette adresse email existe déjà. Veuillez vous connecter.',
      });
      return;
    }

    // 3. Generate and send registration OTP
    const otp = OtpService.generateCode();
    const emailResult = await sendTransactionalEmail({
      toEmail: cleanEmail,
      toName: cleanName,
      subject: `🚀 Votre code de vérification AeroCrash : ${otp}`,
      htmlContent: EmailTemplates.registerOtp(cleanName, otp),
    });
    if (!emailResult.success) {
      res.status(503).json({
        success: false,
        message: "L'envoi de l'email est temporairement indisponible. Veuillez réessayer plus tard.",
        diagnosticId: emailResult.diagnosticId,
      });
      return;
    }

    await OtpService.setOtp(cleanEmail, 'register', { name: cleanName }, otp);
    res.json({
      success: true,
      message: `Code de vérification envoyé à ${cleanEmail}. Vérifiez votre boîte de réception.`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error?.message || 'Erreur lors de l\'envoi du code.' });
  }
};

// Forgot Password - Step 1: Request Code
const handleForgotPasswordRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body || {};
    if (!email) {
      res.status(400).json({ success: false, message: 'Adresse email requise.' });
      return;
    }
    const cleanEmail = String(email).trim().toLowerCase();

    // 1. Verify email ping
    const verification = await verifyEmailAddress(cleanEmail);
    if (!verification.valid) {
      res.status(400).json({
        success: false,
        message: verification.reason || 'Cette adresse email est invalide ou n\'existe pas.',
      });
      return;
    }

    // 2. Find user
    let user = UserDatabase.findByEmail(cleanEmail);
    if (!user && isDatabaseConfigured()) {
      const neonFound = await PostgresDatabase.findByEmail(cleanEmail);
      if (neonFound) user = neonFound as any;
    }
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'Aucun compte n\'est associé à cette adresse email. Veuillez vérifier la saisie.',
      });
      return;
    }

    // 3. Generate and send password reset OTP
    const otp = OtpService.generateCode();
    const emailResult = await sendTransactionalEmail({
      toEmail: cleanEmail,
      toName: user.name,
      subject: `🛡️ Réinitialisation de votre mot de passe AeroCrash : ${otp}`,
      htmlContent: EmailTemplates.forgotPasswordOtp(user.name, otp),
    });
    if (!emailResult.success) {
      res.status(503).json({
        success: false,
        message: "L'envoi de l'email est temporairement indisponible. Veuillez réessayer plus tard.",
        diagnosticId: emailResult.diagnosticId,
      });
      return;
    }

    await OtpService.setOtp(cleanEmail, 'forgot_password', { userId: user.id }, otp);
    res.json({
      success: true,
      message: `Un code de réinitialisation a été envoyé à ${cleanEmail}.`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error?.message || 'Erreur serveur.' });
  }
};

// Forgot Password - Step 2: Reset Password with OTP
const handleForgotPasswordReset = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, otp, newPassword } = req.body || {};
    if (!email || !otp || !newPassword) {
      res.status(400).json({ success: false, message: 'Email, code de vérification et nouveau mot de passe requis.' });
      return;
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const rawPassword = String(newPassword);

    if (rawPassword.length < 6) {
      res.status(400).json({ success: false, message: 'Le mot de passe doit comporter au moins 6 caractères.' });
      return;
    }

    // Verify OTP
    const otpCheck = await OtpService.verifyOtp(cleanEmail, String(otp), 'forgot_password');
    if (!otpCheck.valid) {
      res.status(400).json({
        success: false,
        message: otpCheck.message || 'Code de vérification invalide ou expiré.',
      });
      return;
    }

    // Hash new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(rawPassword, saltRounds);

    let user = UserDatabase.findByEmail(cleanEmail);
    if (user) {
      UserDatabase.update(user.id, { password: hashedPassword });
    }

    if (isDatabaseConfigured()) {
      try {
        const sql = getDatabaseSql();
        await sql`UPDATE public.users SET password_hash = ${hashedPassword}, updated_at = NOW() WHERE LOWER(email) = ${cleanEmail}`;
      } catch (err) {}
    }

    res.json({
      success: true,
      message: 'Votre mot de passe a été modifié avec succès ! Vous pouvez maintenant vous connecter.',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error?.message || 'Erreur serveur.' });
  }
};

// Register Handler (supports both /api/auth/register and /api/register)
const handleRegister = async (req: Request, res: Response): Promise<void> => {
  try {
    if (process.env.REGISTRATION_ENABLED !== 'true') {
      res.status(503).json({
        success: false,
        message: 'Les nouvelles inscriptions sont temporairement suspendues pendant les travaux sur les paiements.',
      });
      return;
    }

    const { name, email, country, password, otp } = req.body || {};

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

    // Validation 2: Email format & DNS Ping
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      res.status(400).json({
        success: false,
        message: 'Format d\'adresse email invalide. Veuillez entrer un email valide (ex: joueur@gmail.com).',
      });
      return;
    }

    const emailCheck = await verifyEmailAddress(cleanEmail);
    if (!emailCheck.valid) {
      res.status(400).json({
        success: false,
        message: emailCheck.reason || 'Cette adresse email est invalide ou son domaine n\'existe pas.',
      });
      return;
    }

    // Optional / Enforced OTP check if OTP is provided
    if (otp) {
      const otpCheck = await OtpService.verifyOtp(cleanEmail, String(otp), 'register');
      if (!otpCheck.valid) {
        res.status(400).json({
          success: false,
          message: otpCheck.message || 'Code de vérification OTP incorrect ou expiré.',
        });
        return;
      }
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
    if (!existing && isDatabaseConfigured()) {
      const neonFound = await PostgresDatabase.findByEmail(cleanEmail);
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

    if (isDatabaseConfigured()) {
      try {
        await PostgresDatabase.createUser({
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
    if (!user && isDatabaseConfigured()) {
      const neonFound = await PostgresDatabase.findByEmail(cleanEmail);
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
    if (isDatabaseConfigured()) {
      try {
        transactions = await PostgresDatabase.getUserTransactions(user.id);
        bets = await PostgresDatabase.getUserBets(user.id);
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

  if (isDatabaseConfigured()) {
    try {
      const neonUser = await PostgresDatabase.findById(decoded.id);
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
        transactions = await PostgresDatabase.getUserTransactions(decoded.id);
        bets = await PostgresDatabase.getUserBets(decoded.id);
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

// Route bindings with aliases for maximum compatibility across Netlify, Vercel, Render, Railway, etc.
app.post('/api/verify-email-domain', handleVerifyEmailDomain);
app.post('/api/auth/verify-email-domain', handleVerifyEmailDomain);
app.post('/.netlify/functions/verify-email-domain', handleVerifyEmailDomain);
app.post('/verify-email-domain', handleVerifyEmailDomain);

app.post('/api/send-register-otp', handleSendRegisterOtp);
app.post('/api/auth/send-register-otp', handleSendRegisterOtp);
app.post('/.netlify/functions/send-register-otp', handleSendRegisterOtp);
app.post('/send-register-otp', handleSendRegisterOtp);

app.post('/api/forgot-password-request', handleForgotPasswordRequest);
app.post('/api/auth/forgot-password-request', handleForgotPasswordRequest);
app.post('/.netlify/functions/forgot-password-request', handleForgotPasswordRequest);
app.post('/forgot-password-request', handleForgotPasswordRequest);

app.post('/api/forgot-password-reset', handleForgotPasswordReset);
app.post('/api/auth/forgot-password-reset', handleForgotPasswordReset);
app.post('/.netlify/functions/forgot-password-reset', handleForgotPasswordReset);
app.post('/forgot-password-reset', handleForgotPasswordReset);

app.post('/api/register', handleRegister);
app.post('/api/auth/register', handleRegister);
app.post('/api/user/register', handleRegister);
app.post('/.netlify/functions/register', handleRegister);
app.post('/register', handleRegister);

app.post('/api/login', handleLogin);
app.post('/api/auth/login', handleLogin);
app.post('/api/user/login', handleLogin);
app.post('/.netlify/functions/login', handleLogin);
app.post('/login', handleLogin);

app.get('/api/me', handleMe);
app.get('/api/auth/me', handleMe);
app.get('/api/user/me', handleMe);
app.get('/.netlify/functions/me', handleMe);
app.get('/me', handleMe);

// Update Balance (e.g. game cashout, bet deduct)
const handleBalance = async (req: Request, res: Response): Promise<void> => {
  const decoded = authenticateToken(req);
  if (!decoded) {
    res.status(401).json({ success: false, message: 'Non autorisé.' });
    return;
  }
  if (!REAL_MONEY_GAME_ENABLED) {
    res.status(503).json({
      success: false,
      message: 'Le jeu en argent réel est suspendu jusqu’à ce que les manches soient réglées côté serveur.',
    });
    return;
  }

  let user = UserDatabase.findById(decoded.id);
  if (!user && isDatabaseConfigured()) {
    try {
      const neonUser = await PostgresDatabase.findById(decoded.id);
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
          bets: [],
          transactions: [],
        };
        UserDatabase.create(user);
      }
    } catch (err) {}
  }

  if (!user) {
    res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });
    return;
  }

  const { balance, delta } = req.body;
  const currentBalance = user.balance || 0;
  let targetBalance: number;

  if (typeof delta === 'number' && !isNaN(delta)) {
    if (delta < 0) {
      if (Math.abs(delta) > currentBalance) {
        res.status(400).json({ success: false, message: 'Solde insuffisant pour cette opération.' });
        return;
      }
      targetBalance = Math.max(0, currentBalance + delta);
    } else {
      // Limit single flight round gain jump to 1,000,000 FCFA max
      if (delta > 1000000) {
        console.warn(`[Anti-Fraud] Blocked excessive win delta of ${delta} for user ${decoded.id}`);
        res.status(400).json({ success: false, message: 'Gain anormal détecté. Requête rejetée par le contrôle de sécurité.' });
        return;
      }
      targetBalance = currentBalance + delta;
    }
  } else if (typeof balance === 'number' && !isNaN(balance) && balance >= 0) {
    const diff = balance - currentBalance;
    // Disallow sudden positive balance injection over 200,000 FCFA without an official deposit transaction
    if (diff > 200000) {
      console.warn(`[Anti-Fraud] Blocked arbitrary balance jump from ${currentBalance} to ${balance} for user ${decoded.id}`);
      res.status(400).json({ success: false, message: 'Modification directe du solde non autorisée. Veuillez passer par les canaux de dépôt officiels.' });
      return;
    }
    targetBalance = balance;
  } else {
    res.status(400).json({ success: false, message: 'Paramètre de solde invalide.' });
    return;
  }

  const cleanBalance = Math.round(targetBalance * 100) / 100;
  const updated = UserDatabase.update(decoded.id, { balance: cleanBalance });

  if (isDatabaseConfigured()) {
    try {
      await PostgresDatabase.updateBalance(decoded.id, cleanBalance);
    } catch (neonErr) {
      console.warn('Neon balance sync warning:', neonErr);
    }
  }

  res.json({ success: true, balance: cleanBalance, user: updated ? sanitizeUser(updated) : null });
};
app.post('/api/user/balance', handleBalance);
app.post('/api/balance', handleBalance);
app.post('/.netlify/functions/balance', handleBalance);
app.post('/balance', handleBalance);

function getSaspayProxyStatus(status?: number): number {
  return status && [400, 404, 409, 410, 422, 429].includes(status) ? status : 502;
}

async function initializeStoredPayout(
  transaction: {
    amount: number;
    idempotency_key?: string;
    phone_number?: string;
    method: string;
    metadata?: Record<string, unknown>;
  },
  user: { name: string; email: string; phone?: string; country: string },
) {
  const formattedAmount = parseMoney(transaction.amount)?.formatted;
  if (!formattedAmount || !transaction.idempotency_key) {
    throw new Error('Le retrait ne possède pas de montant ou de clé d’idempotence réutilisable.');
  }
  const names = user.name.trim().split(/\s+/);
  const country = normalizeCountryCode(
    typeof transaction.metadata?.country === 'string' ? transaction.metadata.country : user.country,
  );
  const phone = transaction.phone_number || user.phone || '';
  return createSaspayPayout({
    amount: formattedAmount,
    country,
    method: transaction.method,
    idempotencyKey: transaction.idempotency_key,
    phone,
    customer: {
      first_name: names[0] || 'Joueur',
      last_name: names.slice(1).join(' ') || 'AeroCrash',
      email: user.email,
      phone,
    },
    description: `Retrait AeroCrash ${formattedAmount} ${getCurrencyForCountry(country)}`,
  });
}

// Deposit Route (real-money deposits stay disabled until server-side round settlement is implemented)
const handleDeposit = async (req: Request, res: Response): Promise<void> => {
  const decoded = authenticateToken(req);
  if (!decoded) {
    res.status(401).json({ success: false, message: 'Non autorisé. Veuillez vous connecter.' });
    return;
  }

  if (!REAL_MONEY_GAME_ENABLED) {
    res.status(503).json({
      success: false,
      message: 'Les dépôts sont temporairement suspendus jusqu’à la mise en place du règlement serveur des manches.',
    });
    return;
  }
  if (!isDatabaseConfigured()) {
    res.status(503).json({ success: false, message: 'La base de données des paiements est indisponible.' });
    return;
  }
  if (!isSaspayConfigured()) {
    res.status(503).json({ success: false, message: 'La passerelle SasPay n’est pas configurée.' });
    return;
  }

  const { amount, method = 'wave', phone, country, otp } = req.body || {};
  const parsedAmount = parseMoney(amount);
  if (!parsedAmount || parsedAmount.amount < MIN_DEPOSIT_FCFA || parsedAmount.amount > 1000000) {
    res.status(400).json({ success: false, message: `Montant de dépôt invalide (minimum ${MIN_DEPOSIT_FCFA.toLocaleString('fr-FR')} FCFA).` });
    return;
  }

  const cleanPhone = typeof phone === 'string' ? phone.trim() : '';
  if (cleanPhone.replace(/\D/g, '').length < 6 || cleanPhone.includes('@')) {
    res.status(400).json({ success: false, message: 'Veuillez renseigner un numéro de téléphone valide.' });
    return;
  }

  const idempotencyKey = req.get('Idempotency-Key');
  if (!isValidIdempotencyKey(idempotencyKey)) {
    res.status(400).json({ success: false, message: 'Une clé Idempotency-Key valide est obligatoire.' });
    return;
  }

  const cleanMethod = typeof method === 'string' ? method.trim().toLowerCase() : '';
  const normalizedCountry = normalizeCountryCode(typeof country === 'string' ? country : '');
  const paymentCountry = cleanMethod === 'card' || cleanMethod === 'crypto' ? 'XX' : normalizedCountry;
  const currency = getCurrencyForCountry(paymentCountry, cleanMethod);
  const cleanOtp = typeof otp === 'string' ? otp.trim() : '';
  const fingerprint = createRequestFingerprint(JWT_SECRET, {
    amount: parsedAmount.formatted,
    country: normalizedCountry,
    method: cleanMethod,
    phone: cleanPhone.replace(/[\s\-().]/g, ''),
    otp: cleanOtp,
  });
  const diagnosticId = randomUUID();

  try {
    const dbUser = await PostgresDatabase.findById(decoded.id);
    if (!dbUser) {
      res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });
      return;
    }

    const intent = await PostgresDatabase.createDepositIntent({
      id: `tx_dep_${randomUUID()}`,
      user_id: decoded.id,
      amount: parsedAmount.amount,
      currency,
      method: cleanMethod,
      phone_number: cleanPhone,
      reference: `DEP-${randomUUID()}`,
      idempotency_key: idempotencyKey,
      request_fingerprint: fingerprint,
      country: normalizedCountry,
    });

    if (intent.transaction.status === 'success') {
      res.json({
        success: true,
        pending: false,
        status: 'SUCCESS',
        balance: intent.balance,
        creditedAmount: Number(intent.transaction.credited_amount || 0),
        transaction: toPublicTransaction(intent.transaction),
      });
      return;
    }
    if (intent.transaction.status !== 'pending') {
      res.status(409).json({ success: false, status: intent.transaction.status, message: 'Cette intention de dépôt est terminée. Créez une nouvelle demande.' });
      return;
    }

    if (intent.transaction.saspay_payment_id) {
      res.status(202).json({
        success: true,
        pending: true,
        paymentId: intent.transaction.saspay_payment_id,
        transactionId: intent.transaction.id,
        checkoutUrl: intent.transaction.checkout_url,
        transaction: toPublicTransaction(intent.transaction),
      });
      return;
    }

    const names = dbUser.name.trim().split(/\s+/);
    const appUrl = process.env.APP_URL?.trim().replace(/\/+$/, '');
    const saspayResult = await createSaspayPayment({
      amount: parsedAmount.formatted,
      country: normalizedCountry,
      method: cleanMethod,
      idempotencyKey,
      diagnosticId,
      customer: {
        first_name: names[0] || 'Joueur',
        last_name: names.slice(1).join(' ') || 'AeroCrash',
        email: dbUser.email,
        phone: cleanPhone,
      },
      description: `Dépôt AeroCrash ${parsedAmount.formatted} ${currency}`,
      returnUrl: appUrl ? `${appUrl}/?transaction_id=${encodeURIComponent(intent.transaction.id)}` : undefined,
      otp: cleanOtp || undefined,
    });

    if (!saspayResult.success) {
      if ([400, 401, 403, 404, 410, 422].includes(saspayResult.gatewayStatus || 0)) {
        await PostgresDatabase.markDepositFailed(intent.transaction.id);
      }
      res.status(getSaspayProxyStatus(saspayResult.gatewayStatus)).json({
        success: false,
        pending: [409, 429].includes(saspayResult.gatewayStatus || 0),
        message: saspayResult.message || 'SasPay n’a pas confirmé la création du paiement.',
        gatewayStatus: saspayResult.gatewayStatus,
        diagnosticId,
      });
      return;
    }
    if (!saspayResult.paymentId) {
      console.error(JSON.stringify({ event: 'saspay.payment_id_missing', diagnosticId, transactionId: intent.transaction.id }));
      res.status(502).json({ success: false, pending: true, transactionId: intent.transaction.id, message: 'SasPay n’a pas renvoyé de référence. Réessayez avec la même clé d’idempotence.', diagnosticId });
      return;
    }

    const saved = await PostgresDatabase.saveSaspayPayment(
      intent.transaction.id,
      saspayResult.paymentId,
      saspayResult.checkoutUrl,
    );
    if (!saved) {
      throw new Error('Le paiement SasPay a été créé mais sa référence n’a pas pu être enregistrée.');
    }

    res.status(202).json({
      success: true,
      pending: true,
      paymentId: saspayResult.paymentId,
      transactionId: saved.id,
      checkoutUrl: saspayResult.checkoutUrl,
      instructions: saspayResult.instructions,
      transaction: toPublicTransaction(saved),
    });
  } catch (error) {
    if (error instanceof IdempotencyConflictError) {
      res.status(409).json({ success: false, message: error.message });
      return;
    }
    console.error(JSON.stringify({
      event: 'saspay.payment_intent_failed',
      diagnosticId,
      userId: decoded.id,
      errorName: error instanceof Error ? error.name : 'Error',
      errorMessage: error instanceof Error ? error.message : String(error),
    }));
    res.status(503).json({
      success: false,
      pending: true,
      message: 'État du paiement incertain. Ne créez pas une nouvelle demande ; réessayez avec la même clé d’idempotence.',
      diagnosticId,
    });
  }
};
app.post('/api/user/deposit', handleDeposit);
app.post('/api/deposit', handleDeposit);
app.post('/.netlify/functions/deposit', handleDeposit);
app.post('/deposit', handleDeposit);

async function settleVerifiedDeposit(paymentId: string, diagnosticId: string) {
  const found = await PostgresDatabase.findTransactionBySaspayId(paymentId);
  if (!found) return null;

  const verification = await verifySaspayPayment(paymentId, diagnosticId);
  if (!verification.success || verification.status !== 'SUCCESS') {
    return { verification, result: null, found };
  }
  const matchesRequest = validateDepositSettlement({
    requestedAmount: Number(found.transaction.amount),
    verifiedRequestedAmount: verification.requestedAmount,
    netAmount: verification.netAmount,
    expectedCurrency: found.transaction.currency,
    verifiedCurrency: verification.currency,
  });
  if (!matchesRequest || verification.netAmount === undefined || !verification.currency) {
    console.error(JSON.stringify({
      event: 'saspay.payment_settlement_mismatch',
      diagnosticId,
      paymentId,
      transactionId: found.transaction.id,
      requestedAmount: found.transaction.amount,
      verifiedRequestedAmount: verification.requestedAmount,
      netAmount: verification.netAmount,
      expectedCurrency: found.transaction.currency,
      verifiedCurrency: verification.currency,
    }));
    return { verification: { ...verification, success: false, status: 'PENDING', message: 'Les données vérifiées ne correspondent pas à la demande ; le crédit est suspendu.' }, result: null, found };
  }

  const result = await PostgresDatabase.settleDeposit(paymentId, verification.netAmount, verification.currency);
  if (result?.credited) {
    sendDepositInvoiceEmail(
      { email: result.user.email, name: result.user.name },
      result.transaction,
      result.user.balance,
    );
  }
  return { verification, result, found };
}

// Checks provider status only after proving the transaction belongs to the caller.
const handlePaymentStatus = async (req: Request, res: Response): Promise<void> => {
  const decoded = authenticateToken(req);
  if (!decoded) {
    res.status(401).json({ success: false, message: 'Session invalide ou expirée.' });
    return;
  }
  if (!isDatabaseConfigured()) {
    res.status(503).json({ success: false, message: 'La base de données des paiements est indisponible.' });
    return;
  }

  const transactionId = String(req.query.transactionId || '').trim();
  const paymentId = String(req.params.paymentId || req.query.paymentId || '').trim();
  if (!transactionId && !paymentId) {
    res.status(400).json({ success: false, message: 'Identifiant de transaction requis.' });
    return;
  }

  const diagnosticId = randomUUID();
  try {
    const owned = transactionId
      ? await PostgresDatabase.findTransactionForUser(transactionId, decoded.id, 'deposit')
      : null;
    const found = owned || (!transactionId ? await PostgresDatabase.findTransactionBySaspayId(paymentId) : null);
    if (!found || found.user.id !== decoded.id) {
      res.status(404).json({ success: false, status: 'FAILED', message: 'Transaction introuvable.' });
      return;
    }

    const transaction = found.transaction;
    const user = found.user;
    if (transaction.status === 'success') {
      res.json({
        success: true,
        status: 'SUCCESS',
        balance: user.balance,
        creditedAmount: Number(transaction.credited_amount || 0),
        user: sanitizeUser(mapDatabaseUser(user)),
        transaction: toPublicTransaction(transaction),
      });
      return;
    }
    if (transaction.status !== 'pending') {
      res.json({ success: true, status: transaction.status.toUpperCase(), balance: user.balance });
      return;
    }
    if (!transaction.saspay_payment_id) {
      res.status(202).json({ success: true, status: 'PENDING', balance: user.balance });
      return;
    }

    const settled = await settleVerifiedDeposit(transaction.saspay_payment_id, diagnosticId);
    if (!settled) {
      res.status(404).json({ success: false, message: 'Référence SasPay introuvable.' });
      return;
    }
    if (!settled.verification.success) {
      res.status(502).json({
        success: false,
        status: 'PENDING',
        message: settled.verification.message || 'Vérification SasPay temporairement indisponible.',
        diagnosticId,
      });
      return;
    }
    if (settled.verification.status === 'FAILED' || settled.verification.status === 'CANCELLED') {
      await PostgresDatabase.markDepositFailed(transaction.saspay_payment_id);
      res.json({ success: true, status: 'FAILED', balance: user.balance, message: 'Le paiement a échoué.' });
      return;
    }
    if (!settled.result) {
      res.status(202).json({
        success: true,
        status: 'PENDING',
        balance: user.balance,
        message: settled.verification.message || 'Paiement en attente de confirmation.',
      });
      return;
    }

    res.json({
      success: true,
      status: 'SUCCESS',
      balance: settled.result.user.balance,
      creditedAmount: Number(settled.result.transaction.credited_amount || 0),
      user: sanitizeUser(mapDatabaseUser(settled.result.user)),
      transaction: toPublicTransaction(settled.result.transaction),
      message: 'Paiement confirmé et crédité.',
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: 'saspay.payment_status_failed',
      diagnosticId,
      userId: decoded.id,
      errorName: error instanceof Error ? error.name : 'Error',
      errorMessage: error instanceof Error ? error.message : String(error),
    }));
    res.status(503).json({ success: false, status: 'PENDING', message: 'La vérification est temporairement indisponible.', diagnosticId });
  }
};
app.get('/api/user/payment-status/:paymentId', handlePaymentStatus);
app.get('/api/payment-status/:paymentId', handlePaymentStatus);
app.get('/payment-status/:paymentId', handlePaymentStatus);
app.get('/api/user/payment-status', handlePaymentStatus);
app.get('/api/payment-status', handlePaymentStatus);
app.get('/.netlify/functions/payment-status', handlePaymentStatus);
app.get('/payment-status', handlePaymentStatus);

// Withdraw Route
const handleWithdraw = async (req: Request, res: Response): Promise<void> => {
  const decoded = authenticateToken(req);
  if (!decoded) {
    res.status(401).json({ success: false, message: 'Non autorisé.' });
    return;
  }

  if (!isDatabaseConfigured()) {
    res.status(503).json({ success: false, message: 'La base de données des retraits est indisponible.' });
    return;
  }
  if (!isSaspayConfigured()) {
    res.status(503).json({ success: false, message: 'Le service de retrait SasPay n’est pas configuré.' });
    return;
  }

  const { amount, method = 'wave', phone, country } = req.body || {};
  const parsedAmount = parseMoney(amount);
  const MAX_WITHDRAW_FCFA = 500000;
  if (!parsedAmount || parsedAmount.amount < MIN_WITHDRAW_FCFA) {
    res.status(400).json({ success: false, message: `Montant minimum de retrait : ${MIN_WITHDRAW_FCFA.toLocaleString('fr-FR')} FCFA.` });
    return;
  }

  if (parsedAmount.amount > MAX_WITHDRAW_FCFA) {
    res.status(400).json({ success: false, message: `Montant maximum par retrait : ${MAX_WITHDRAW_FCFA.toLocaleString('fr-FR')} FCFA.` });
    return;
  }

  const cleanPhone = typeof phone === 'string' ? phone.trim() : '';
  if (cleanPhone.replace(/\D/g, '').length < 6 || cleanPhone.includes('@')) {
    res.status(400).json({ success: false, message: 'Numéro de téléphone Mobile Money invalide.' });
    return;
  }

  const idempotencyKey = req.get('Idempotency-Key');
  if (!isValidIdempotencyKey(idempotencyKey)) {
    res.status(400).json({ success: false, message: 'Une clé Idempotency-Key valide est obligatoire.' });
    return;
  }

  const cleanMethod = typeof method === 'string' ? method.trim().toLowerCase() : '';
  const normalizedCountry = normalizeCountryCode(typeof country === 'string' ? country : '');
  const currency = getCurrencyForCountry(normalizedCountry);
  const fingerprint = createRequestFingerprint(JWT_SECRET, {
    amount: parsedAmount.formatted,
    country: normalizedCountry,
    method: cleanMethod,
    phone: cleanPhone.replace(/[\s\-().]/g, ''),
  });
  const diagnosticId = randomUUID();
  let transactionId: string | undefined;
  try {
    const dbUser = await PostgresDatabase.findById(decoded.id);
    if (!dbUser) {
      res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });
      return;
    }
    const intent = await PostgresDatabase.createWithdrawalIntent({
      id: `tx_wth_${randomUUID()}`,
      user_id: decoded.id,
      amount: parsedAmount.amount,
      currency,
      method: cleanMethod,
      phone_number: cleanPhone,
      reference: `RET-${randomUUID()}`,
      idempotency_key: idempotencyKey,
      request_fingerprint: fingerprint,
      country: normalizedCountry,
    });
    transactionId = intent.transaction.id;

    if (intent.transaction.status !== 'pending') {
      res.status(intent.transaction.status === 'success' ? 200 : 409).json({
        success: intent.transaction.status === 'success',
        status: intent.transaction.status.toUpperCase(),
        balance: intent.balance,
        transactionId: intent.transaction.id,
        transaction: toPublicTransaction(intent.transaction),
        message: intent.transaction.status === 'failed' ? 'Ce retrait a échoué. Créez une nouvelle demande si vous souhaitez réessayer.' : undefined,
      });
      return;
    }
    if (intent.transaction.saspay_payout_id) {
      res.status(202).json({
        success: true,
        pending: true,
        status: 'PENDING',
        balance: intent.balance,
        transactionId: intent.transaction.id,
        transaction: toPublicTransaction(intent.transaction),
      });
      return;
    }

    const payoutRes = await initializeStoredPayout(intent.transaction, {
      name: dbUser.name,
      email: dbUser.email,
      country: normalizedCountry,
    });
    if (!payoutRes.success) {
      if ([400, 401, 403, 404, 410, 422].includes(payoutRes.gatewayStatus || 0)) {
        const finalized = await PostgresDatabase.finalizeWithdrawal(intent.transaction.id, 'failed');
        res.status(getSaspayProxyStatus(payoutRes.gatewayStatus)).json({
          success: false,
          pending: false,
          status: 'FAILED',
          balance: finalized?.user.balance ?? intent.balance,
          transactionId: finalized?.transaction.id,
          transaction: finalized ? toPublicTransaction(finalized.transaction) : undefined,
          message: payoutRes.message || 'SasPay a refusé le retrait ; le solde réservé a été libéré.',
          gatewayStatus: payoutRes.gatewayStatus,
          diagnosticId,
        });
        return;
      }
      res.status(202).json({
        success: true,
        pending: true,
        retryable: true,
        status: 'PENDING',
        balance: intent.balance,
        transactionId: intent.transaction.id,
        transaction: toPublicTransaction(intent.transaction),
        message: 'Résultat du retrait incertain. Réessayez uniquement avec la même clé d’idempotence.',
      });
      return;
    }

    if (!payoutRes.payoutId) {
      res.status(202).json({
        success: true,
        pending: true,
        retryable: true,
        status: 'PENDING',
        balance: intent.balance,
        transactionId: intent.transaction.id,
        message: 'SasPay n’a pas renvoyé de référence. Réessayez uniquement avec la même clé d’idempotence.',
      });
      return;
    }
    const saved = await PostgresDatabase.saveSaspayPayout(intent.transaction.id, payoutRes.payoutId);
    if (!saved) {
      throw new Error('Le retrait SasPay a été créé mais sa référence n’a pas pu être enregistrée.');
    }
    res.status(202).json({
      success: true,
      pending: true,
      status: 'PENDING',
      balance: intent.balance,
      transactionId: saved.id,
      transaction: toPublicTransaction(saved),
      message: 'Demande de retrait enregistrée ; le virement reste en attente de confirmation SasPay.',
    });
  } catch (error) {
    if (error instanceof IdempotencyConflictError) {
      res.status(409).json({ success: false, message: error.message });
      return;
    }
    if (error instanceof InsufficientFundsError) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    console.error(JSON.stringify({
      event: 'saspay.payout_intent_uncertain',
      diagnosticId,
      userId: decoded.id,
      transactionId,
      errorName: error instanceof Error ? error.name : 'Error',
      errorMessage: error instanceof Error ? error.message : String(error),
    }));
    if (!transactionId) {
      res.status(503).json({
        success: false,
        message: 'La demande de retrait n’a pas pu être enregistrée ; aucun transfert n’a été envoyé.',
        diagnosticId,
      });
      return;
    }
    res.status(202).json({
      success: true,
      pending: true,
      retryable: true,
      transactionId,
      message: 'Résultat du retrait incertain. Réessayez uniquement avec la même clé d’idempotence.',
      diagnosticId,
    });
  }
};
app.post('/api/user/withdraw', handleWithdraw);
app.post('/api/withdraw', handleWithdraw);
app.post('/.netlify/functions/withdraw', handleWithdraw);
app.post('/withdraw', handleWithdraw);

const handleWithdrawalStatus = async (req: Request, res: Response): Promise<void> => {
  const decoded = authenticateToken(req);
  if (!decoded) {
    res.status(401).json({ success: false, message: 'Session invalide ou expirée.' });
    return;
  }
  if (!isDatabaseConfigured()) {
    res.status(503).json({ success: false, message: 'La base de données des retraits est indisponible.' });
    return;
  }

  const transactionId = String(req.params.transactionId || req.query.transactionId || '').trim();
  if (!transactionId) {
    res.status(400).json({ success: false, message: 'Identifiant de retrait requis.' });
    return;
  }

  const diagnosticId = randomUUID();
  try {
    const found = await PostgresDatabase.findTransactionForUser(transactionId, decoded.id, 'withdraw');
    if (!found) {
      res.status(404).json({ success: false, message: 'Retrait introuvable.' });
      return;
    }
    if (found.transaction.status !== 'pending') {
      res.json({
        success: true,
        status: found.transaction.status.toUpperCase(),
        balance: found.user.balance,
        transaction: toPublicTransaction(found.transaction),
      });
      return;
    }
    if (!found.transaction.saspay_payout_id) {
      if (!found.transaction.idempotency_key) {
        res.json({
          success: true,
          status: 'PENDING',
          balance: found.user.balance,
          retryable: false,
          message: 'Ce retrait historique doit être rapproché manuellement par le support.',
        });
        return;
      }
      const retry = await PostgresDatabase.claimPendingPayoutRetry(transactionId, decoded.id);
      if (!retry) {
        res.status(202).json({ success: true, status: 'PENDING', balance: found.user.balance, retryable: true });
        return;
      }
      const retryResult = await initializeStoredPayout(retry.transaction, retry.user);
      if (!retryResult.success) {
        if ([400, 401, 403, 404, 410, 422].includes(retryResult.gatewayStatus || 0)) {
          const finalized = await PostgresDatabase.finalizeWithdrawal(transactionId, 'failed');
          res.json({
            success: true,
            status: 'FAILED',
            balance: finalized?.user.balance ?? retry.user.balance,
            transaction: finalized ? toPublicTransaction(finalized.transaction) : undefined,
          });
          return;
        }
        res.status(202).json({
          success: true,
          status: 'PENDING',
          balance: retry.user.balance,
          retryable: true,
          message: retryResult.message || 'Résultat SasPay incertain ; une nouvelle vérification sera tentée.',
        });
        return;
      }
      if (!retryResult.payoutId) {
        res.status(202).json({
          success: true,
          status: 'PENDING',
          balance: retry.user.balance,
          retryable: true,
        });
        return;
      }
      const saved = await PostgresDatabase.saveSaspayPayout(transactionId, retryResult.payoutId);
      if (!saved) throw new Error('La référence du retrait n’a pas pu être enregistrée.');
      res.status(202).json({
        success: true,
        status: 'PENDING',
        balance: retry.user.balance,
        transaction: toPublicTransaction(saved),
        retryable: false,
      });
      return;
    }

    const verified = await verifySaspayPayout(found.transaction.saspay_payout_id, diagnosticId);
    if (!verified.success) {
      res.status(502).json({
        success: false,
        status: 'PENDING',
        message: verified.message || 'Vérification SasPay temporairement indisponible.',
        diagnosticId,
      });
      return;
    }
    if (verified.status !== 'SUCCESS' && verified.status !== 'FAILED' && verified.status !== 'CANCELLED') {
      res.json({ success: true, status: 'PENDING', balance: found.user.balance });
      return;
    }

    const finalized = await PostgresDatabase.finalizeWithdrawal(
      found.transaction.id,
      verified.status === 'SUCCESS' ? 'success' : 'failed',
    );
    if (!finalized) {
      res.status(503).json({ success: false, status: 'PENDING', message: 'Impossible de régler ce retrait.' });
      return;
    }
    if (finalized.changed && verified.status === 'SUCCESS') {
      sendWithdrawReceiptEmail(
        { email: finalized.user.email, name: finalized.user.name },
        finalized.transaction,
        finalized.user.balance,
      );
    }
    res.json({
      success: true,
      status: finalized.transaction.status.toUpperCase(),
      balance: finalized.user.balance,
      transaction: toPublicTransaction(finalized.transaction),
      message: verified.status !== 'SUCCESS' ? 'Le retrait a échoué ; les fonds ont été libérés.' : 'Retrait confirmé.',
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: 'saspay.payout_status_failed',
      diagnosticId,
      transactionId,
      userId: decoded.id,
      errorName: error instanceof Error ? error.name : 'Error',
      errorMessage: error instanceof Error ? error.message : String(error),
    }));
    res.status(503).json({ success: false, status: 'PENDING', message: 'La vérification est temporairement indisponible.', diagnosticId });
  }
};
app.get('/api/withdrawal-status/:transactionId', handleWithdrawalStatus);
app.get('/api/withdrawal-status', handleWithdrawalStatus);

// SasPay Webhook Endpoint (Strict idempotency & HMAC verification)
const handleSaspayWebhook = async (req: Request, res: Response): Promise<void> => {
  const diagnosticId = randomUUID();
  const sig = (req.headers['x-webhook-signature'] as string) || '';
  const timestamp = (req.headers['x-webhook-timestamp'] as string) || '';
  const eventHeader = (req.headers['x-webhook-event'] as string) || '';
  const rawBody = (req as any).rawBody;
  const secret = process.env.SASPAY_WEBHOOK_SECRET?.trim();

  if (!secret) {
    console.error(JSON.stringify({ event: 'saspay.webhook_secret_missing', diagnosticId }));
    res.status(503).json({ error: 'Webhook SasPay non configuré.', diagnosticId });
    return;
  }
  if (!Buffer.isBuffer(rawBody) || !eventHeader) {
    res.status(400).json({ error: 'Corps brut ou événement webhook manquant.', diagnosticId });
    return;
  }
  if (!verifySaspayWebhookSignature(rawBody, sig, timestamp, secret)) {
    console.warn(JSON.stringify({
      event: 'saspay.webhook_signature_rejected',
      diagnosticId,
      signaturePresent: Boolean(sig),
      timestampPresent: Boolean(timestamp),
    }));
    res.status(403).json({ error: 'Signature invalide ou délai dépassé', diagnosticId });
    return;
  }

  const { event, data } = req.body || {};
  if (event !== eventHeader) {
    res.status(400).json({ error: 'L’événement webhook ne correspond pas à son en-tête.', diagnosticId });
    return;
  }
  console.info(JSON.stringify({
    event: 'saspay.webhook_received',
    diagnosticId,
    webhookEvent: event || 'unknown',
    paymentId: data?.id,
  }));

  if (event === 'transaction.success' || event === 'transaction.failed' || event === 'transaction.cancelled') {
    if (typeof data?.id !== 'string' || !data.id) {
      res.status(400).json({ error: 'Identifiant de paiement manquant.', diagnosticId });
      return;
    }
    if (!isDatabaseConfigured()) {
      res.status(503).json({ error: 'Base de données des paiements indisponible.', diagnosticId });
      return;
    }
    try {
      const found = await PostgresDatabase.findTransactionBySaspayId(data.id);
      if (!found) {
        console.warn(JSON.stringify({ event: 'saspay.webhook_transaction_not_found', diagnosticId, paymentId: data.id }));
        res.status(503).json({ error: 'Transaction non encore disponible.', diagnosticId });
        return;
      }

      if (event === 'transaction.success') {
        const settled = await settleVerifiedDeposit(data.id, diagnosticId);
        if (!settled?.verification.success) {
          res.status(503).json({ error: settled?.verification.message || 'Vérification SasPay temporairement indisponible.', diagnosticId });
          return;
        }
        if (settled.verification.status !== 'SUCCESS') {
          if (settled.verification.status === 'FAILED' || settled.verification.status === 'CANCELLED') {
            await PostgresDatabase.markDepositFailed(data.id);
          }
          res.status(200).json({ received: true, status: settled.verification.status });
          return;
        }
        if (!settled.result) {
          res.status(409).json({ error: 'Règlement suspendu : les montants ou devises ne correspondent pas.', diagnosticId });
          return;
        }
        res.status(200).json({ received: true, credited: settled.result.credited });
        return;
      }

      await PostgresDatabase.markDepositFailed(data.id);
  } catch (error) {
    console.error(JSON.stringify({
      event: 'saspay.webhook_settlement_failed',
      diagnosticId,
      paymentId: data?.id,
      errorName: error instanceof Error ? error.name : 'Error',
      errorMessage: error instanceof Error ? error.message : String(error),
    }));
    res.status(503).json({ error: 'Échec du traitement du webhook.', diagnosticId });
    return;
  }
  }

  res.status(200).json({ received: true });
};
app.post('/api/webhook/saspay', handleSaspayWebhook);
app.post('/api/webhook-saspay', handleSaspayWebhook);
app.post('/.netlify/functions/webhook-saspay', handleSaspayWebhook);
app.post('/webhook-saspay', handleSaspayWebhook);

// Activate Account (Strict: max 3000 FCFA bonus, one-time only)
const handleActivate = async (req: Request, res: Response): Promise<void> => {
  const decoded = authenticateToken(req);
  if (!decoded) {
    res.status(401).json({ success: false, message: 'Non autorisé.' });
    return;
  }
  if (!REAL_MONEY_GAME_ENABLED) {
    res.status(503).json({
      success: false,
      message: 'Les bonus et l’activation monétaire sont suspendus avec le jeu en argent réel.',
    });
    return;
  }

  let user = UserDatabase.findById(decoded.id);
  if (!user && isDatabaseConfigured()) {
    try {
      const neonUser = await PostgresDatabase.findById(decoded.id);
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
          bets: [],
          transactions: [],
        };
        UserDatabase.create(user);
      }
    } catch (err) {}
  }

  if (!user) {
    res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });
    return;
  }

  // Prevent multiple claims of activation bonus
  if (user.isActivated) {
    res.status(400).json({
      success: false,
      message: 'Ce compte est déjà activé. Le bonus de bienvenue a déjà été attribué.',
      user: sanitizeUser(user),
    });
    return;
  }

  // Fixed starter bonus: 3 000 FCFA
  const FIXED_BONUS = 3000;
  const newBalance = (user.balance || 0) + FIXED_BONUS;
  const updated = UserDatabase.update(decoded.id, {
    isActivated: true,
    balance: newBalance,
  });

  const tx = {
    id: 'tx_act_' + Math.random().toString(36).substring(2, 9),
    userId: decoded.id,
    type: 'activation',
    amount: FIXED_BONUS,
    method: 'bonus',
    reference: 'ACT-' + Date.now().toString().slice(-6),
    status: 'success',
    timestamp: Date.now(),
  };
  UserDatabase.addTransaction(decoded.id, tx);

  if (isDatabaseConfigured()) {
    try {
      await PostgresDatabase.updateBalance(decoded.id, newBalance, true);
      await PostgresDatabase.addTransaction({
        id: tx.id,
        user_id: decoded.id,
        type: 'activation',
        amount: FIXED_BONUS,
        currency: 'XOF',
        method: 'bonus',
        reference: tx.reference,
        status: 'success',
      });
    } catch (err) {}
  }

  res.json({
    success: true,
    user: updated ? sanitizeUser(updated) : null,
    message: 'Compte activé avec succès ! Bonus de bienvenue de 3 000 FCFA crédité.',
  });
};
app.post('/api/user/activate', handleActivate);
app.post('/api/activate', handleActivate);
app.post('/.netlify/functions/activate', handleActivate);
app.post('/activate', handleActivate);

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
  if (!REAL_MONEY_GAME_ENABLED && bet.gameMode !== 'demo') {
    res.status(503).json({
      success: false,
      message: 'Les manches en argent réel sont suspendues jusqu’à leur règlement côté serveur.',
    });
    return;
  }

  UserDatabase.addBet(decoded.id, bet);
  if (isDatabaseConfigured()) {
    try {
      await PostgresDatabase.addBet({
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
app.post('/api/bets', handleBet);
app.post('/.netlify/functions/bets', handleBet);
app.post('/bets', handleBet);

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
  if (isDatabaseConfigured()) {
    try {
      await PostgresDatabase.addTransaction({
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
app.post('/api/transactions', handleTx);
app.post('/.netlify/functions/transactions', handleTx);
app.post('/transactions', handleTx);

// ==========================================
// 3. VITE MIDDLEWARE & STATIC SERVING
// ==========================================
async function start() {
  if (isProduction) {
    console.log('Initializing production database schema...');
    await initializeDatabaseSchema();
  }

  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (err) {
      console.warn('Vite dev middleware could not be loaded, continuing without it:', err);
    }
  } else if (!process.env.VERCEL) {
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

// Only launch standalone HTTP server when not in serverless runtime (Vercel / Lambda)
if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  start().catch((error: unknown) => {
    console.error('Server startup failed:', error);
    process.exitCode = 1;
  });
}

export default app;
