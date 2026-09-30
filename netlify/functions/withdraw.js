// Netlify Serverless Function for Withdrawals (with SasPay integration)
// Handles POST requests to /.netlify/functions/withdraw
const {
  findById,
  updateUser,
  addTransaction,
  sanitizeUser,
  verifyToken,
  corsHeaders,
} = require('./db');
const {
  isSaspayConfigured,
  createSaspayPayout,
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
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const token = authHeader ? authHeader.split(' ')[1] : null;
    const decoded = verifyToken(token);

    if (!decoded || !decoded.id) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'Non autorisé. Veuillez vous connecter.' }),
      };
    }

    const user = findById(decoded.id);
    if (!user) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'Utilisateur introuvable.' }),
      };
    }

    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || {});
    const { amount, method = 'wave', phone, country } = body;
    const numAmount = Number(amount);

    if (!numAmount || isNaN(numAmount) || numAmount < 1000) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'Le montant minimum de retrait est de 1 000 FCFA.' }),
      };
    }

    if (numAmount > user.balance) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'Solde insuffisant pour ce montant de retrait.' }),
      };
    }

    const cleanPhone = (phone || user.email || '').toString().trim();
    const txId = 'tx_wth_' + Date.now();
    const reference = 'RET-' + Math.floor(100000 + Math.random() * 900000);

    // 1. If SasPay is configured, initiate payout
    if (isSaspayConfigured()) {
      try {
        const payoutRes = await createSaspayPayout({
          amount: numAmount,
          country: country || user.country || 'CI',
          method,
          phone: cleanPhone,
          customer: {
            phone: cleanPhone,
            first_name: user.name ? user.name.split(' ')[0] : 'Gagnant',
            last_name: user.name ? user.name.split(' ').slice(1).join(' ') : 'AeroCrash',
            email: user.email,
          },
          description: `Retrait gains AeroCrash ${numAmount.toLocaleString('fr-FR')} FCFA`,
        });

        if (!payoutRes.success) {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({
              success: false,
              message: payoutRes.message || 'Échec de l\'envoi du retrait via SasPay.',
            }),
          };
        }

        const newBalance = Math.round((user.balance - numAmount) * 100) / 100;
        const updatedUser = updateUser(decoded.id, { balance: newBalance });

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
        addTransaction(decoded.id, tx);

        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            message: `Demande de retrait de ${numAmount.toLocaleString('fr-FR')} FCFA transférée vers votre compte Mobile Money.`,
            balance: newBalance,
            user: sanitizeUser(updatedUser),
            transaction: tx,
          }),
        };
      } catch (err) {
        console.error('SasPay payout error in Netlify:', err);
        return {
          statusCode: 500,
          headers: corsHeaders,
          body: JSON.stringify({ success: false, message: 'Erreur lors du traitement du retrait SasPay.' }),
        };
      }
    }

    // 2. Offline simulation fallback
    const newBalance = Math.round((user.balance - numAmount) * 100) / 100;
    const updatedUser = updateUser(decoded.id, { balance: newBalance });

    const tx = {
      id: txId,
      type: 'withdraw',
      amount: numAmount,
      method,
      phone: cleanPhone,
      reference,
      status: 'success',
      timestamp: Date.now(),
    };
    addTransaction(decoded.id, tx);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: `Retrait de ${numAmount.toLocaleString('fr-FR')} FCFA transféré avec succès vers votre compte Mobile Money.`,
        balance: newBalance,
        user: sanitizeUser(updatedUser),
        transaction: tx,
      }),
    };
  } catch (error) {
    console.error('Netlify withdraw error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Erreur lors du traitement du retrait.' }),
    };
  }
};

module.exports = { handler: exports.handler };
