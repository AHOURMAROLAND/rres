// Netlify Serverless Function for SasPay Webhooks
// Handles POST requests to /.netlify/functions/webhook-saspay
const {
  findById,
  updateUser,
  findBySaspayPaymentId,
  updateTransaction,
  corsHeaders,
} = require('./db');
const {
  verifySaspayWebhookSignature,
} = require('./saspay');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Méthode non autorisée. Utilisez POST.' }),
    };
  }

  try {
    const sig = event.headers['x-webhook-signature'] || event.headers['X-Webhook-Signature'] || '';
    const timestamp = event.headers['x-webhook-timestamp'] || event.headers['X-Webhook-Timestamp'] || '';
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;

    if (process.env.SASPAY_WEBHOOK_SECRET) {
      const isValid = verifySaspayWebhookSignature(rawBody, sig, timestamp);
      if (!isValid) {
        console.warn('SasPay Webhook Netlify: invalid signature or expired timestamp');
        return {
          statusCode: 403,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Signature invalide ou délai expiré.' }),
        };
      }
    }

    const payload = typeof rawBody === 'string' ? JSON.parse(rawBody || '{}') : (rawBody || {});
    const { event: eventName, data } = payload;
    console.log(`[SasPay Netlify Webhook] Event received: ${eventName}`, data?.id);

    if (eventName === 'transaction.success' && data?.id) {
      const found = findBySaspayPaymentId(data.id);
      if (found && found.transaction.status === 'pending') {
        const addedAmount = Number(found.transaction.amount) || Number(data.net_amount || data.amount) || 0;
        const newBalance = Math.round(((found.user.balance || 0) + addedAmount) * 100) / 100;

        updateUser(found.user.id, {
          balance: newBalance,
          isActivated: true,
        });

        updateTransaction(found.user.id, data.id, {
          status: 'success',
          completedAt: new Date().toISOString(),
        });
      }
    } else if (eventName === 'transaction.failed' && data?.id) {
      const found = findBySaspayPaymentId(data.id);
      if (found) {
        updateTransaction(found.user.id, data.id, {
          status: 'failed',
        });
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ received: true }),
    };
  } catch (error) {
    console.error('Netlify SasPay webhook error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Erreur traitement webhook' }),
    };
  }
};

module.exports = { handler: exports.handler };
