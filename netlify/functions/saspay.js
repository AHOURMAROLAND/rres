const crypto = require('crypto');

const SASPAY_API_URL = process.env.SASPAY_API_URL || 'https://api.saspay.me/api/v1';

function isSaspayConfigured() {
  return Boolean(process.env.SASPAY_API_KEY && process.env.SASPAY_API_KEY.trim() !== '');
}

/**
 * Normalizes any country name or code into a strict 2-letter uppercase ISO code
 */
function normalizeCountryCode(countryInput) {
  if (!countryInput) return 'CI';
  const c = countryInput.trim().toUpperCase();
  if (c.length === 2) return c;

  const lower = countryInput.trim().toLowerCase();
  if (lower.includes('ivoire') || lower.includes('ivory')) return 'CI';
  if (lower.includes('sénégal') || lower.includes('senegal')) return 'SN';
  if (lower.includes('bénin') || lower.includes('benin')) return 'BJ';
  if (lower.includes('burkina')) return 'BF';
  if (lower.includes('mali')) return 'ML';
  if (lower.includes('togo')) return 'TG';
  if (lower.includes('cameroun') || lower.includes('cameroon')) return 'CM';
  if (lower.includes('guinée') || lower.includes('guinea')) return 'GN';
  if (lower.includes('congo') && (lower.includes('rd') || lower.includes('démocratique') || lower.includes('kinshasa'))) return 'CD';
  if (lower.includes('congo')) return 'CG';
  if (lower.includes('gabon')) return 'GA';
  if (lower.includes('niger') && !lower.includes('nigeria')) return 'NE';
  if (lower.includes('nigeria')) return 'NG';
  if (lower.includes('ghana')) return 'GH';
  if (lower.includes('kenya')) return 'KE';
  if (lower.includes('rwanda')) return 'RW';
  if (lower.includes('tanzan')) return 'TZ';
  if (lower.includes('ouganda') || lower.includes('uganda')) return 'UG';
  if (lower.includes('zambi')) return 'ZM';
  if (lower.includes('malawi')) return 'MW';
  if (lower.includes('france') || lower.includes('belgique') || lower.includes('canada') || lower.includes('international')) return 'XX';
  return 'CI';
}

/**
 * Maps country code to its standard currency according to SasPay specs
 */
function getCurrencyForCountry(countryInput, method) {
  const m = (method || '').toLowerCase().trim();
  if (m === 'card' || m === 'carte' || m === 'crypto') {
    return 'USD';
  }

  const code = normalizeCountryCode(countryInput);
  switch (code) {
    case 'CM':
    case 'GA':
    case 'CG':
    case 'TD':
    case 'CF':
    case 'GQ':
      return 'XAF';
    case 'CD':
      return 'CDF'; // SasPay specification: CD is CDF
    case 'GN':
      return 'GNF';
    case 'GH':
      return 'GHS';
    case 'NG':
      return 'NGN';
    case 'KE':
      return 'KES';
    case 'MW':
      return 'MWK';
    case 'RW':
      return 'RWF';
    case 'TZ':
      return 'TZS';
    case 'UG':
      return 'UGX';
    case 'ZM':
      return 'ZMW';
    case 'XX':
      return 'USD';
    default:
      return 'XOF';
  }
}

/**
 * Maps payment method + country code to the exact SasPay network identifier
 */
function getSaspayNetwork(method, countryInput) {
  const m = (method || 'wave').toLowerCase().trim();
  const c = normalizeCountryCode(countryInput);

  if (m === 'card' || m === 'carte') return 'card';
  if (m === 'crypto' || m === 'usdt') return 'crypto';

  if (m.includes('_') || m === 'togocel') return m;

  if (c === 'CI') {
    if (m === 'wave') return 'wave_ci';
    if (m === 'orange_money' || m === 'orange') return 'orange_ci';
    if (m === 'mtn') return 'mtn_ci';
    if (m === 'moov') return 'moov_ci';
    return 'wave_ci';
  }

  if (c === 'SN') {
    if (m === 'wave') return 'wave_sn';
    if (m === 'orange_money' || m === 'orange') return 'orange_sn';
    if (m === 'freemoney' || m === 'free') return 'freemoney_sn';
    if (m === 'wizall') return 'wizall_sn';
    return 'wave_sn';
  }

  if (c === 'BJ') {
    if (m === 'mtn') return 'mtn_bj';
    if (m === 'moov') return 'moov_bj';
    if (m === 'celtiis') return 'celtiis_bj';
    return 'mtn_bj';
  }

  if (c === 'BF') {
    if (m === 'orange_money' || m === 'orange') return 'orange_bf';
    if (m === 'moov') return 'moov_bf';
    return 'orange_bf';
  }

  if (c === 'CM') {
    if (m === 'mtn') return 'mtn_cm';
    if (m === 'orange_money' || m === 'orange') return 'orange_cm';
    return 'mtn_cm';
  }

  if (c === 'ML') {
    if (m === 'orange_money' || m === 'orange') return 'orange_ml';
    if (m === 'moov') return 'moov_ml';
    if (m === 'mobi_cash' || m === 'mobicash') return 'mobi_cash_ml';
    return 'orange_ml';
  }

  if (c === 'TG') {
    if (m === 'moov') return 'moov_tg';
    if (m === 'togocel' || m === 't-money' || m === 'tmoney') return 'togocel';
    return 'moov_tg';
  }

  if (c === 'CD') {
    if (m === 'airtel') return 'airtel_cd';
    if (m === 'orange_money' || m === 'orange') return 'orange_cd';
    if (m === 'vodacom' || m === 'mpesa') return 'vodacom_cd';
    return 'airtel_cd';
  }

  if (c === 'GN') {
    if (m === 'mtn') return 'mtn_gn';
    if (m === 'orange_money' || m === 'orange') return 'orange_gn';
    return 'mtn_gn';
  }

  if (c === 'NE') {
    if (m === 'airtel') return 'airtel_ne';
    return 'airtel_ne';
  }

  if (m === 'wave') return `wave_${c.toLowerCase()}`;
  return `${m}_${c.toLowerCase()}`;
}

async function createSaspayPayment(params) {
  const apiKey = process.env.SASPAY_API_KEY;
  if (!apiKey) throw new Error('SASPAY_API_KEY is not configured');

  const rawCountry = normalizeCountryCode(params.country);
  const network = getSaspayNetwork(params.method, rawCountry);
  const isGlobal = network === 'card' || network === 'crypto';

  const country = isGlobal ? 'XX' : rawCountry;
  const currency = getCurrencyForCountry(country, network);
  const formattedAmount = Number(params.amount).toFixed(2);

  const cleanPhone = (params.customer?.phone || '').replace(/[\s\-\(\)\.]/g, '');
  const firstName = params.customer?.first_name || 'Joueur';
  const lastName = params.customer?.last_name || 'AeroCrash';
  const email = params.customer?.email || 'joueur@aerocrash.live';

  const payload = {
    amount: formattedAmount,
    currency,
    country,
    network,
    description: params.description || `Recharge AeroCrash ${formattedAmount} ${currency}`,
    customer: {
      first_name: firstName,
      last_name: lastName,
      email,
      phone: cleanPhone || '+2250102030405',
    },
  };

  const returnUrl = params.returnUrl || (process.env.APP_URL ? `${process.env.APP_URL}/?payment=return` : 'https://aerocrash.live/?payment=return');
  payload.return_url = returnUrl;

  if (params.otp) {
    payload.otp = params.otp;
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };

  if (params.idempotencyKey) {
    headers['Idempotency-Key'] = params.idempotencyKey;
  }

  const res = await fetch(`${SASPAY_API_URL}/payments/softpay/`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      success: false,
      message: data?.message || data?.error?.message || `Erreur passerelle de paiement (${res.status})`,
    };
  }

  return {
    success: true,
    paymentId: data.id,
    status: data.status || 'PENDING',
    checkoutUrl: data.checkout_url || undefined,
    message: data.message || 'Paiement initié avec succès',
    instructions: data.instructions || undefined,
  };
}

async function verifySaspayPayment(paymentId) {
  const apiKey = process.env.SASPAY_API_KEY;
  if (!apiKey) throw new Error('SASPAY_API_KEY is not configured');

  const res = await fetch(`${SASPAY_API_URL}/payments/${encodeURIComponent(paymentId)}/verify/`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      success: false,
      status: 'FAILED',
      message: data?.message || 'Transaction introuvable',
    };
  }

  return {
    success: true,
    status: data.status || 'PENDING',
    reference: data.reference,
    amount: data.net_amount ? Number(data.net_amount) : Number(data.requested_amount || 0),
    currency: data.currency,
    raw: data,
  };
}

async function createSaspayPayout(params) {
  const apiKey = process.env.SASPAY_API_KEY;
  if (!apiKey) throw new Error('SASPAY_API_KEY is not configured');

  const country = normalizeCountryCode(params.country);
  const currency = getCurrencyForCountry(country);
  const method = getSaspayNetwork(params.method, country);
  const formattedAmount = Number(params.amount).toFixed(2);
  const cleanPhone = (params.phone || '').replace(/[\s\-\(\)\.]/g, '');

  const payload = {
    amount: formattedAmount,
    currency,
    country,
    method,
    recipient: {
      msisdn: cleanPhone,
    },
    customer: {
      phone: cleanPhone,
      first_name: params.customer?.first_name || 'Gagnant',
      last_name: params.customer?.last_name || 'AeroCrash',
      email: params.customer?.email || 'gains@aerocrash.live',
    },
    description: params.description || `Retrait gains AeroCrash ${formattedAmount} ${currency}`,
  };

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };

  if (params.idempotencyKey) {
    headers['Idempotency-Key'] = params.idempotencyKey;
  }

  const res = await fetch(`${SASPAY_API_URL}/payouts/initialize/`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      success: false,
      message: data?.message || data?.error?.message || `Erreur passerelle de retrait (${res.status})`,
    };
  }

  return {
    success: true,
    payoutId: data.id,
    message: data.message || 'Retrait envoyé avec succès',
  };
}

function verifySaspayWebhookSignature(rawBody, signatureHeader, timestampHeader, secretOverride) {
  const secret = secretOverride || process.env.SASPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  if (!signatureHeader || !timestampHeader) return false;

  const TOLERANCE_SECONDS = 300;
  const now = Math.floor(Date.now() / 1000);
  const timestamp = Number(timestampHeader);
  if (isNaN(timestamp) || Math.abs(now - timestamp) > TOLERANCE_SECONDS) return false;

  try {
    const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${bodyStr}`)
      .digest('hex');

    const sigBuf = Buffer.from(signatureHeader.trim().toLowerCase());
    const expectedBuf = Buffer.from(expected.toLowerCase());

    if (sigBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expectedBuf);
  } catch (err) {
    return false;
  }
}

module.exports = {
  isSaspayConfigured,
  normalizeCountryCode,
  getCurrencyForCountry,
  getSaspayNetwork,
  createSaspayPayment,
  verifySaspayPayment,
  createSaspayPayout,
  verifySaspayWebhookSignature,
};
