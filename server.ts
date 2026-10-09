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
  verifySaspayWebhookSignature,
} from './server/saspay.js';
import {
  initializeDatabaseSchema,
  isDatabaseConfigured,
  PostgresDatabase,
  getDatabaseSql,
} from './server/database.js';
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
      amount: Number(tx.amount || 0),
      reference: tx.reference || 'DEP-000000',
      method: String(tx.method || 'wave').toUpperCase(),
      phone: String(tx.phone || tx.phoneNumber || ''),
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
      phone: String(tx.phone || tx.phoneNumber || ''),
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
    const otp = OtpService.setOtp(cleanEmail, 'register', { name: cleanName });
    const emailResult = await sendTransactionalEmail({
      toEmail: cleanEmail,
      toName: cleanName,
      subject: `🚀 Votre code de vérification AeroCrash : ${otp}`,
      htmlContent: EmailTemplates.registerOtp(cleanName, otp),
    });
    if (!emailResult.success) {
      OtpService.clearOtp(cleanEmail, 'register');
      res.status(503).json({
        success: false,
        message: "L'envoi de l'email est temporairement indisponible. Veuillez réessayer plus tard.",
      });
      return;
    }

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
    const otp = OtpService.setOtp(cleanEmail, 'forgot_password', { userId: user.id });
    const emailResult = await sendTransactionalEmail({
      toEmail: cleanEmail,
      toName: user.name,
      subject: `🛡️ Réinitialisation de votre mot de passe AeroCrash : ${otp}`,
      htmlContent: EmailTemplates.forgotPasswordOtp(user.name, otp),
    });
    if (!emailResult.success) {
      OtpService.clearOtp(cleanEmail, 'forgot_password');
      res.status(503).json({
        success: false,
        message: "L'envoi de l'email est temporairement indisponible. Veuillez réessayer plus tard.",
      });
      return;
    }

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
    const otpCheck = OtpService.verifyOtp(cleanEmail, String(otp), 'forgot_password');
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
      const otpCheck = OtpService.verifyOtp(cleanEmail, String(otp), 'register');
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

  let user = UserDatabase.findById(decoded.id);
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
          bets: user?.bets || [],
          transactions: user?.transactions || [],
        };
        if (!UserDatabase.findById(decoded.id)) {
          UserDatabase.create(user);
        }
      }
    } catch (err) {
      console.error('Deposit user lookup failed:', err);
      if (!user) {
        res.status(503).json({
          success: false,
          message: 'Impossible de vérifier le compte pour le moment. Réessayez plus tard.',
        });
        return;
      }
    }
  }

  if (!user) {
    res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });
    return;
  }

  const cleanPhone = typeof phone === 'string' ? phone.trim() : '';
  if (cleanPhone.replace(/\D/g, '').length < 6 || cleanPhone.includes('@')) {
    res.status(400).json({ success: false, message: 'Veuillez renseigner un numéro de téléphone valide.' });
    return;
  }
  const txId = 'tx_dep_' + Math.random().toString(36).substring(2, 9);
  const reference = 'DEP-' + Date.now().toString().slice(-6);

  // Production Payment Processing
  if (!isSaspayConfigured()) {
    res.status(503).json({
      success: false,
      message: 'La passerelle de paiement sécurisée est temporairement indisponible. Veuillez réessayer ultérieurement.',
    });
    return;
  }

  try {
    const saspayResult = await createSaspayPayment({
      amount: numAmount,
      country: country || user.country || 'CI',
      method,
      idempotencyKey: randomUUID(),
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
      res.status(getSaspayProxyStatus(saspayResult.gatewayStatus)).json({
        success: false,
        message: saspayResult.message || 'Échec de l\'initialisation du paiement sécurisé.',
        gatewayStatus: saspayResult.gatewayStatus,
        gatewayCode: saspayResult.gatewayCode,
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
    if (isDatabaseConfigured()) {
      try {
        await PostgresDatabase.addTransaction({
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
        ? 'Redirection vers la page de paiement sécurisée...'
        : 'Demande envoyée sur votre téléphone. Veuillez valider avec votre code PIN secret.',
      transaction: tx,
    });
    return;
  } catch (err: any) {
    console.error('Payment deposit error:', err);
    res.status(500).json({
      success: false,
      message: err?.message || 'Erreur lors de la communication avec la passerelle de paiement sécurisée.',
    });
    return;
  }
};
app.post('/api/user/deposit', handleDeposit);
app.post('/api/deposit', handleDeposit);
app.post('/.netlify/functions/deposit', handleDeposit);
app.post('/deposit', handleDeposit);

// Check Payment Status endpoint (for frontend polling and post-redirect verification)
const handlePaymentStatus = async (req: Request, res: Response): Promise<void> => {
  const paymentId = (req.params.paymentId || (req.query.paymentId as string) || '').trim();
  if (!paymentId) {
    res.status(400).json({ success: false, message: 'Identifiant de paiement requis.' });
    return;
  }

  // 1. If gateway is not configured, check existing local transaction
  if (!isSaspayConfigured()) {
    const found = UserDatabase.findBySaspayPaymentId(paymentId);
    if (found) {
      res.json({
        success: true,
        status: found.transaction.status || 'PENDING',
        balance: found.user.balance,
      });
      return;
    }
    res.status(404).json({ success: false, status: 'FAILED', message: 'Transaction introuvable' });
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

        if (isDatabaseConfigured()) {
          try {
            await PostgresDatabase.updateBalance(found.user.id, newBalance, true);
            await PostgresDatabase.updateTransactionStatus(paymentId, 'success');
          } catch (err) {}
        }

        const freshUser = UserDatabase.findById(found.user.id);

        // Send transaction receipt email
        sendDepositInvoiceEmail(found.user, found.transaction, newBalance);

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
      if (isDatabaseConfigured()) {
        try {
          await PostgresDatabase.updateTransactionStatus(paymentId, 'failed');
        } catch (err) {}
      }
    }

    res.json({
      success: true,
      status: verifyRes.status,
      message: verifyRes.message,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Erreur lors de la vérification du paiement' });
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

  const { amount, method = 'wave', phone, country } = req.body;
  const numAmount = Number(amount);

  let user = UserDatabase.findById(decoded.id);
  if (isDatabaseConfigured()) {
    try {
      const neonUser = await PostgresDatabase.findById(decoded.id);
      if (neonUser) {
        if (!user) {
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
        } else {
          user.balance = Number(neonUser.balance);
        }
      }
    } catch (err) {}
  }

  if (!user) {
    res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });
    return;
  }

  const MAX_WITHDRAW_FCFA = 500000;
  if (isNaN(numAmount) || numAmount < MIN_WITHDRAW_FCFA) {
    res.status(400).json({ success: false, message: `Montant minimum de retrait : ${MIN_WITHDRAW_FCFA.toLocaleString('fr-FR')} FCFA.` });
    return;
  }

  if (numAmount > MAX_WITHDRAW_FCFA) {
    res.status(400).json({ success: false, message: `Montant maximum par retrait : ${MAX_WITHDRAW_FCFA.toLocaleString('fr-FR')} FCFA.` });
    return;
  }

  if (numAmount > user.balance) {
    res.status(400).json({ success: false, message: `Solde insuffisant (votre solde : ${user.balance.toLocaleString('fr-FR')} FCFA).` });
    return;
  }

  const cleanPhone = typeof phone === 'string' ? phone.trim() : '';
  if (cleanPhone.replace(/\D/g, '').length < 6 || cleanPhone.includes('@')) {
    res.status(400).json({ success: false, message: 'Numéro de téléphone Mobile Money invalide.' });
    return;
  }

  const txId = 'tx_wth_' + Math.random().toString(36).substring(2, 9);
  const reference = 'RET-' + Date.now().toString().slice(-6);

  if (!isSaspayConfigured()) {
    res.status(503).json({
      success: false,
      message: 'Le service de retrait sécurisé est temporairement indisponible. Veuillez réessayer ultérieurement.',
    });
    return;
  }

  // Lock and deduct balance upfront
  const previousBalance = user.balance;
  const newBalance = Math.round((previousBalance - numAmount) * 100) / 100;
  UserDatabase.update(decoded.id, { balance: newBalance });

  if (isDatabaseConfigured()) {
    try {
      await PostgresDatabase.updateBalance(decoded.id, newBalance);
    } catch (err) {}
  }

  try {
    const payoutRes = await createSaspayPayout({
      amount: numAmount,
      country: country || user.country || 'CI',
      method,
      idempotencyKey: randomUUID(),
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
      // Rollback balance on gateway rejection
      UserDatabase.update(decoded.id, { balance: previousBalance });
      if (isDatabaseConfigured()) {
        try {
          await PostgresDatabase.updateBalance(decoded.id, previousBalance);
        } catch (err) {}
      }
      res.status(getSaspayProxyStatus(payoutRes.gatewayStatus)).json({
        success: false,
        message: payoutRes.message || 'Échec de l\'envoi du retrait. Vos fonds ont été recrédités sur votre solde.',
        gatewayStatus: payoutRes.gatewayStatus,
        gatewayCode: payoutRes.gatewayCode,
      });
      return;
    }

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

    if (isDatabaseConfigured()) {
      try {
        await PostgresDatabase.addTransaction({
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

    // Send withdrawal receipt email
    sendWithdrawReceiptEmail(user, tx, newBalance);

    const updated = UserDatabase.findById(decoded.id);
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
    // Rollback balance
    UserDatabase.update(decoded.id, { balance: previousBalance });
    if (isDatabaseConfigured()) {
      try {
        await PostgresDatabase.updateBalance(decoded.id, previousBalance);
      } catch (rErr) {}
    }
    res.status(500).json({
      success: false,
      message: err?.message || 'Erreur lors du traitement du retrait. Solde restauré.',
    });
    return;
  }
};
app.post('/api/user/withdraw', handleWithdraw);
app.post('/api/withdraw', handleWithdraw);
app.post('/.netlify/functions/withdraw', handleWithdraw);
app.post('/withdraw', handleWithdraw);

// SasPay Webhook Endpoint (Strict idempotency & HMAC verification)
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
    // 1. Look up transaction in local DB
    let found = UserDatabase.findBySaspayPaymentId(data.id);

    // 2. If not in local DB memory, look up in Neon
    if (!found && isDatabaseConfigured()) {
      try {
        const neonFound = await PostgresDatabase.findTransactionBySaspayId(data.id);
        if (neonFound) {
          found = {
            user: {
              id: neonFound.user.id,
              name: neonFound.user.name,
              email: neonFound.user.email,
              password: '',
              country: neonFound.user.country,
              balance: neonFound.user.balance,
              isActivated: true,
              createdAt: '',
              updatedAt: '',
              bets: [],
              transactions: [neonFound.transaction],
            },
            transaction: neonFound.transaction,
          };
        }
      } catch (err) {}
    }

    if (found) {
      // IDEMPOTENCY CHECK: If already credited, skip!
      if (found.transaction.status === 'success') {
        console.log(`[SasPay Webhook] Transaction ${data.id} already processed. Duplicate skipped.`);
        res.status(200).json({ received: true, alreadyProcessed: true });
        return;
      }

      if (found.transaction.status === 'pending') {
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

        if (isDatabaseConfigured()) {
          try {
            await PostgresDatabase.updateBalance(found.user.id, newBalance, true);
            await PostgresDatabase.updateTransactionStatus(data.id, 'success');
          } catch (err) {}
        }
        console.log(`[SasPay Webhook] Account ${found.user.id} credited with +${addedAmount} FCFA`);

        // Send transaction receipt email
        sendDepositInvoiceEmail(found.user, { ...found.transaction, amount: addedAmount }, newBalance);
      }
    }
  } else if (event === 'transaction.failed' && data?.id) {
    const found = UserDatabase.findBySaspayPaymentId(data.id);
    if (found) {
      UserDatabase.updateTransaction(found.user.id, data.id, {
        status: 'failed',
      });
      if (isDatabaseConfigured()) {
        try {
          await PostgresDatabase.updateTransactionStatus(data.id, 'failed');
        } catch (err) {}
      }
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
