// Netlify Serverless Function for Withdrawals
// Handles POST requests to /.netlify/functions/withdraw
const {
  findById,
  updateUser,
  addTransaction,
  sanitizeUser,
  verifyToken,
  corsHeaders,
} = require('./db');

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
    const { amount, method = 'wave', phone } = body;
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

    const newBalance = Math.round((user.balance - numAmount) * 100) / 100;
    const updatedUser = updateUser(decoded.id, { balance: newBalance });

    const tx = {
      id: 'tx_wth_' + Date.now(),
      type: 'withdraw',
      amount: numAmount,
      method,
      phone: phone || '',
      reference: 'RET-' + Math.floor(100000 + Math.random() * 900000),
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
