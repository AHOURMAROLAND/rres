import dns from 'node:dns/promises';

// In-memory OTP storage with TTL (10 minutes)
interface StoredOtp {
  code: string;
  email: string;
  type: 'register' | 'forgot_password';
  payload?: any;
  expiresAt: number;
  attempts: number;
}

const otpStore = new Map<string, StoredOtp>();

// Known disposable / temporary email domains to reject immediately
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'tempmail.com',
  'temp-mail.org',
  'guerrillamail.com',
  '10minutemail.com',
  'yopmail.com',
  'yopmail.fr',
  'trashmail.com',
  'sharklasers.com',
  'getairmail.com',
  'throwawaymail.com',
  'mytemp.email',
  'dispostable.com',
  'fakemailgenerator.com',
]);

/**
 * Pings and verifies if an email address has a valid syntax, non-disposable domain,
 * and active MX/mail servers via DNS lookup.
 */
export async function verifyEmailAddress(email: string): Promise<{ valid: boolean; reason?: string }> {
  if (!email || typeof email !== 'string') {
    return { valid: false, reason: "L'adresse email est requise." };
  }

  const clean = email.trim().toLowerCase();

  // 1. Strict RFC 5322 regex validation
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!emailRegex.test(clean)) {
    return { valid: false, reason: "Format d'adresse email invalide." };
  }

  const parts = clean.split('@');
  if (parts.length !== 2) {
    return { valid: false, reason: "Format d'adresse email incorrect." };
  }

  const domain = parts[1];

  // 2. Reject disposable domains
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return {
      valid: false,
      reason: "Les adresses emails temporaires ou jetables ne sont pas autorisées pour sécuriser votre compte.",
    };
  }

  // 3. DNS Ping: Check if domain has active Mail Exchange (MX) records
  try {
    const mxRecords = await dns.resolveMx(domain).catch(() => []);
    if (!mxRecords || mxRecords.length === 0) {
      // Fallback: check if domain has an A record (some servers receive mail at A record)
      const aRecords = await dns.resolve4(domain).catch(() => []);
      if (!aRecords || aRecords.length === 0) {
        return {
          valid: false,
          reason: `Le domaine "${domain}" n'existe pas ou ne possède aucun serveur de messagerie valide.`,
        };
      }
    }
  } catch (err: any) {
    return {
      valid: false,
      reason: `Impossible de contacter le serveur mail du domaine "${domain}". Veuillez vérifier l'adresse.`,
    };
  }

  return { valid: true };
}

export async function sendTransactionalEmail(payload: {
  toEmail: string;
  toName?: string;
  subject: string;
  htmlContent: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  const senderEmail = (process.env.RESEND_FROM_EMAIL || '').trim();
  const senderName = (process.env.RESEND_FROM_NAME || 'AeroCrash').trim();

  if (!apiKey && !process.env.VERCEL) {
    console.log(`[Email Simulation] To: ${payload.toEmail} | Subject: "${payload.subject}"`);
    return {
      success: true,
      messageId: 'simulated_' + Date.now(),
    };
  }

  if (!apiKey || !senderEmail) {
    const error = 'RESEND_API_KEY and RESEND_FROM_EMAIL must be configured to send email.';
    console.error('[Email Configuration Error]', error);
    return { success: false, error };
  }

  const body = {
    from: `${senderName} <${senderEmail}>`,
    to: [payload.toEmail.trim()],
    subject: payload.subject,
    html: payload.htmlContent,
  };

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errMsg = data?.message || `Resend HTTP error ${res.status}`;
      console.error('[Resend Error]', res.status, data);
      return { success: false, error: errMsg };
    }

    return {
      success: true,
      messageId: data.id,
    };
  } catch (err: any) {
    console.error('[Resend Network Error]', err);
    return { success: false, error: err?.message || 'Erreur réseau Resend' };
  }
}

/**
 * OTP Management helpers
 */
export class OtpService {
  public static generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  public static setOtp(email: string, type: 'register' | 'forgot_password', payload?: any): string {
    const code = this.generateCode();
    const key = `${type}:${email.trim().toLowerCase()}`;
    otpStore.set(key, {
      code,
      email: email.trim().toLowerCase(),
      type,
      payload,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
      attempts: 0,
    });
    return code;
  }

  public static clearOtp(email: string, type: 'register' | 'forgot_password'): void {
    otpStore.delete(`${type}:${email.trim().toLowerCase()}`);
  }

  public static verifyOtp(
    email: string,
    code: string,
    type: 'register' | 'forgot_password'
  ): { valid: boolean; message?: string; payload?: any } {
    const key = `${type}:${email.trim().toLowerCase()}`;
    const stored = otpStore.get(key);

    if (!stored) {
      return {
        valid: false,
        message: 'Aucun code de vérification trouvé ou code expiré. Veuillez redemander un code.',
      };
    }

    if (Date.now() > stored.expiresAt) {
      otpStore.delete(key);
      return {
        valid: false,
        message: 'Le code de vérification a expiré (durée 10 minutes). Veuillez en générer un nouveau.',
      };
    }

    stored.attempts += 1;
    if (stored.attempts > 5) {
      otpStore.delete(key);
      return {
        valid: false,
        message: 'Trop de tentatives incorrectes. Veuillez demander un nouveau code de sécurité.',
      };
    }

    if (stored.code !== code.trim()) {
      return {
        valid: false,
        message: `Code incorrect (tentative ${stored.attempts}/5).`,
      };
    }

    // Success: remove code to prevent replay
    const payload = stored.payload;
    otpStore.delete(key);
    return { valid: true, payload };
  }
}

/**
 * Beautiful HTML Email Templates for AeroCrash (Dark Theme + Gold/Neon Accents)
 */
export const EmailTemplates = {
  // 1. Inscription / Vérification OTP
  registerOtp(name: string, code: string): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Code de confirmation AeroCrash</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0B0E14; margin: 0; padding: 24px; color: #E2E8F0; }
        .card { max-width: 520px; margin: 0 auto; background: #131826; border-radius: 20px; border: 1px solid #1E293B; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
        .header { background: linear-gradient(135deg, #0F172A, #1E1B4B); padding: 32px 24px; text-align: center; border-bottom: 1px solid #2A364F; }
        .logo { font-size: 24px; font-weight: 900; color: #FFFFFF; letter-spacing: -0.5px; }
        .logo span { color: #F97316; }
        .content { padding: 36px 30px; text-align: center; }
        .title { font-size: 20px; font-weight: 700; color: #FFFFFF; margin-bottom: 12px; }
        .subtitle { font-size: 14px; color: #94A3B8; line-height: 1.6; margin-bottom: 28px; }
        .code-box { background: #0B0E17; border: 2px dashed #F97316; border-radius: 16px; padding: 20px; margin: 24px 0; display: inline-block; min-width: 240px; }
        .otp-code { font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 900; color: #F97316; letter-spacing: 8px; margin: 0; }
        .expiry { font-size: 12px; color: #64748B; margin-top: 8px; }
        .footer { padding: 20px; text-align: center; font-size: 11px; color: #64748B; background: #0F1420; border-top: 1px solid #1E293B; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div class="logo">AERO<span>CRASH</span> 🚀</div>
        </div>
        <div class="content">
          <div class="title">Bienvenue à bord, ${name} !</div>
          <div class="subtitle">
            Pour finaliser la création de votre compte et débloquer vos vols en temps réel, veuillez saisir ce code de vérification :
          </div>
          <div class="code-box">
            <div class="otp-code">${code}</div>
            <div class="expiry">Ce code expire dans 10 minutes</div>
          </div>
          <p style="font-size: 12px; color: #64748B; margin-top: 24px;">
            Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email en toute sécurité.
          </p>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} AeroCrash. Plateforme de jeu équitable et certifiée Provably Fair.
        </div>
      </div>
    </body>
    </html>
    `;
  },

  // 2. Mot de passe oublié (OTP)
  forgotPasswordOtp(name: string, code: string): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Réinitialisation de votre mot de passe</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0B0E14; margin: 0; padding: 24px; color: #E2E8F0; }
        .card { max-width: 520px; margin: 0 auto; background: #131826; border-radius: 20px; border: 1px solid #1E293B; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
        .header { background: linear-gradient(135deg, #0F172A, #3B0764); padding: 32px 24px; text-align: center; border-bottom: 1px solid #2A364F; }
        .logo { font-size: 24px; font-weight: 900; color: #FFFFFF; letter-spacing: -0.5px; }
        .logo span { color: #A855F7; }
        .content { padding: 36px 30px; text-align: center; }
        .title { font-size: 20px; font-weight: 700; color: #FFFFFF; margin-bottom: 12px; }
        .subtitle { font-size: 14px; color: #94A3B8; line-height: 1.6; margin-bottom: 28px; }
        .code-box { background: #0B0E17; border: 2px dashed #A855F7; border-radius: 16px; padding: 20px; margin: 24px 0; display: inline-block; min-width: 240px; }
        .otp-code { font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 900; color: #A855F7; letter-spacing: 8px; margin: 0; }
        .expiry { font-size: 12px; color: #64748B; margin-top: 8px; }
        .footer { padding: 20px; text-align: center; font-size: 11px; color: #64748B; background: #0F1420; border-top: 1px solid #1E293B; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div class="logo">AERO<span>CRASH</span> 🛡️</div>
        </div>
        <div class="content">
          <div class="title">Réinitialisation de mot de passe</div>
          <div class="subtitle">
            Bonjour ${name}, nous avons reçu une demande de réinitialisation de votre mot de passe. Voici votre code sécurisé :
          </div>
          <div class="code-box">
            <div class="otp-code">${code}</div>
            <div class="expiry">Ce code expire dans 10 minutes</div>
          </div>
          <p style="font-size: 12px; color: #EF4444; margin-top: 24px;">
            ⚠️ Ne partagez ce code avec personne. Aucun administrateur AeroCrash ne vous demandera votre code secret.
          </p>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} AeroCrash. Sécurité des comptes et des transactions.
        </div>
      </div>
    </body>
    </html>
    `;
  },

  // 3. Facture / Reçu officiel de Dépôt
  depositInvoice(params: {
    name: string;
    amount: number;
    reference: string;
    method: string;
    phone: string;
    balance: number;
    date: string;
  }): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Reçu officiel de dépôt AeroCrash</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0B0E14; margin: 0; padding: 24px; color: #E2E8F0; }
        .card { max-width: 540px; margin: 0 auto; background: #131826; border-radius: 20px; border: 1px solid #1E293B; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
        .header { background: linear-gradient(135deg, #064E3B, #0F172A); padding: 32px 24px; text-align: center; border-bottom: 1px solid #065F46; }
        .badge { display: inline-block; background: #059669; color: #FFFFFF; font-size: 11px; font-weight: 800; text-transform: uppercase; padding: 4px 12px; rounded: 9999px; border-radius: 20px; margin-bottom: 8px; }
        .amount-big { font-size: 36px; font-weight: 900; color: #10B981; margin: 8px 0; }
        .table-wrap { padding: 28px 24px; }
        .row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #1E293B; font-size: 13px; }
        .label { color: #94A3B8; }
        .val { color: #FFFFFF; font-weight: 700; text-align: right; }
        .footer { padding: 20px; text-align: center; font-size: 11px; color: #64748B; background: #0F1420; border-top: 1px solid #1E293B; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div class="badge">REÇU DE TRANSACTION OFFICIEL</div>
          <div style="font-size: 13px; color: #A7F3D0;">Dépôt validé avec succès</div>
          <div class="amount-big">+${params.amount.toLocaleString('fr-FR')} FCFA</div>
        </div>
        <div class="table-wrap">
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="border-bottom: 1px solid #1E293B;">
              <td style="padding: 10px 0; color: #94A3B8; font-size: 13px;">Référence</td>
              <td style="padding: 10px 0; color: #10B981; font-size: 13px; font-weight: 700; text-align: right; font-family: monospace;">${params.reference}</td>
            </tr>
            <tr style="border-bottom: 1px solid #1E293B;">
              <td style="padding: 10px 0; color: #94A3B8; font-size: 13px;">Titulaire</td>
              <td style="padding: 10px 0; color: #FFFFFF; font-size: 13px; font-weight: 600; text-align: right;">${params.name}</td>
            </tr>
            <tr style="border-bottom: 1px solid #1E293B;">
              <td style="padding: 10px 0; color: #94A3B8; font-size: 13px;">Moyen de paiement</td>
              <td style="padding: 10px 0; color: #FFFFFF; font-size: 13px; font-weight: 600; text-align: right; text-transform: uppercase;">${params.method}</td>
            </tr>
            <tr style="border-bottom: 1px solid #1E293B;">
              <td style="padding: 10px 0; color: #94A3B8; font-size: 13px;">Numéro débité</td>
              <td style="padding: 10px 0; color: #FFFFFF; font-size: 13px; font-weight: 600; text-align: right;">${params.phone}</td>
            </tr>
            <tr style="border-bottom: 1px solid #1E293B;">
              <td style="padding: 10px 0; color: #94A3B8; font-size: 13px;">Date & Heure</td>
              <td style="padding: 10px 0; color: #FFFFFF; font-size: 13px; font-weight: 600; text-align: right;">${params.date}</td>
            </tr>
            <tr>
              <td style="padding: 14px 0 0 0; color: #94A3B8; font-size: 14px; font-weight: 700;">Nouveau Solde</td>
              <td style="padding: 14px 0 0 0; color: #34D399; font-size: 16px; font-weight: 900; text-align: right;">${params.balance.toLocaleString('fr-FR')} FCFA</td>
            </tr>
          </table>
        </div>
        <div class="footer">
          Facture générée automatiquement par AeroCrash Banking & Financial Network.<br>
          Conservez ce document pour vos archives comptables.
        </div>
      </div>
    </body>
    </html>
    `;
  },

  // 4. Bordereau officiel de Retrait
  withdrawReceipt(params: {
    name: string;
    amount: number;
    reference: string;
    method: string;
    phone: string;
    balance: number;
    date: string;
  }): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Bordereau officiel de retrait AeroCrash</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0B0E14; margin: 0; padding: 24px; color: #E2E8F0; }
        .card { max-width: 540px; margin: 0 auto; background: #131826; border-radius: 20px; border: 1px solid #1E293B; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
        .header { background: linear-gradient(135deg, #7C2D12, #0F172A); padding: 32px 24px; text-align: center; border-bottom: 1px solid #9A3412; }
        .badge { display: inline-block; background: #EA580C; color: #FFFFFF; font-size: 11px; font-weight: 800; text-transform: uppercase; padding: 4px 12px; rounded: 9999px; border-radius: 20px; margin-bottom: 8px; }
        .amount-big { font-size: 36px; font-weight: 900; color: #FB923C; margin: 8px 0; }
        .table-wrap { padding: 28px 24px; }
        .footer { padding: 20px; text-align: center; font-size: 11px; color: #64748B; background: #0F1420; border-top: 1px solid #1E293B; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div class="badge">BORDEREAU DE DÉCAISSEMENT</div>
          <div style="font-size: 13px; color: #FED7AA;">Retrait transféré vers votre Mobile Money</div>
          <div class="amount-big">-${params.amount.toLocaleString('fr-FR')} FCFA</div>
        </div>
        <div class="table-wrap">
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="border-bottom: 1px solid #1E293B;">
              <td style="padding: 10px 0; color: #94A3B8; font-size: 13px;">Numéro de bordereau</td>
              <td style="padding: 10px 0; color: #FB923C; font-size: 13px; font-weight: 700; text-align: right; font-family: monospace;">${params.reference}</td>
            </tr>
            <tr style="border-bottom: 1px solid #1E293B;">
              <td style="padding: 10px 0; color: #94A3B8; font-size: 13px;">Bénéficiaire</td>
              <td style="padding: 10px 0; color: #FFFFFF; font-size: 13px; font-weight: 600; text-align: right;">${params.name}</td>
            </tr>
            <tr style="border-bottom: 1px solid #1E293B;">
              <td style="padding: 10px 0; color: #94A3B8; font-size: 13px;">Opérateur Mobile Money</td>
              <td style="padding: 10px 0; color: #FFFFFF; font-size: 13px; font-weight: 600; text-align: right; text-transform: uppercase;">${params.method}</td>
            </tr>
            <tr style="border-bottom: 1px solid #1E293B;">
              <td style="padding: 10px 0; color: #94A3B8; font-size: 13px;">Numéro crédité</td>
              <td style="padding: 10px 0; color: #FFFFFF; font-size: 13px; font-weight: 600; text-align: right;">${params.phone}</td>
            </tr>
            <tr style="border-bottom: 1px solid #1E293B;">
              <td style="padding: 10px 0; color: #94A3B8; font-size: 13px;">Date & Heure</td>
              <td style="padding: 10px 0; color: #FFFFFF; font-size: 13px; font-weight: 600; text-align: right;">${params.date}</td>
            </tr>
            <tr>
              <td style="padding: 14px 0 0 0; color: #94A3B8; font-size: 14px; font-weight: 700;">Solde restant</td>
              <td style="padding: 14px 0 0 0; color: #38BDF8; font-size: 16px; font-weight: 900; text-align: right;">${params.balance.toLocaleString('fr-FR')} FCFA</td>
            </tr>
          </table>
        </div>
        <div class="footer">
          Les fonds sont crédités directement sur votre compte Mobile Money sous quelques instants.<br>
          En cas de question, contactez le support AeroCrash avec votre numéro de bordereau.
        </div>
      </div>
    </body>
    </html>
    `;
  },
};
