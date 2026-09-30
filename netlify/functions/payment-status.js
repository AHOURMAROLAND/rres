// Netlify Serverless Function for Checking Payment Status
// Handles GET requests to /.netlify/functions/payment-status?paymentId=...
const {
  findById,
  updateUser,
  findBySaspayPaymentId,
  updateTransaction,
  sanitizeUser,
  corsHeaders,
} = require('./db');
const {
  isSaspayConfigured,
  verifySaspayPayment,
} = require('./saspay');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Méthode non autorisée. Utilisez GET.' }),
    };
  }

  try {
    const params = event.queryStringParameters || {};
    const paymentId = (params.paymentId || params.id || '').trim();

    if (!paymentId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'Identifiant de paiement manquant.' }),
      };
    }

    // 1. If not configured, check existing transaction
    if (!isSaspayConfigured()) {
      const found = findBySaspayPaymentId(paymentId);
      if (found) {
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            status: found.transaction.status || 'SUCCESS',
            balance: found.user.balance,
          }),
        };
      }
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, status: 'SUCCESS' }),
      };
    }

    // 2. Call SasPay verify
    const verifyRes = await verifySaspayPayment(paymentId);
    const found = findBySaspayPaymentId(paymentId);

    if (verifyRes.status === 'SUCCESS' && found) {
      if (found.transaction.status === 'pending') {
        const addedAmount = Number(found.transaction.amount) || Number(verifyRes.amount) || 0;
        const newBalance = Math.round(((found.user.balance || 0) + addedAmount) * 100) / 100;

        updateUser(found.user.id, {
          balance: newBalance,
          isActivated: true,
        });

        updateTransaction(found.user.id, paymentId, {
          status: 'success',
          completedAt: new Date().toISOString(),
        });

        const freshUser = findById(found.user.id);
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            status: 'SUCCESS',
            balance: newBalance,
            user: freshUser ? sanitizeUser(freshUser) : null,
            message: 'Paiement confirmé avec succès ! Jeu débloqué.',
          }),
        };
      }

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          status: 'SUCCESS',
          balance: found.user.balance,
        }),
      };
    }

    if (verifyRes.status === 'FAILED' && found) {
      updateTransaction(found.user.id, paymentId, { status: 'failed' });
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        status: verifyRes.status,
        message: verifyRes.message,
      }),
    };
  } catch (error) {
    console.error('Netlify payment status error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Erreur lors de la vérification du paiement.' }),
    };
  }
};

module.exports = { handler: exports.handler };
