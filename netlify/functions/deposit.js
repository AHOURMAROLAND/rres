// Netlify Serverless Function for Deposits
// Handles POST requests to /.netlify/functions/deposit
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

    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || {});
    const { amount, method = 'wave', phone } = body;

    const numAmount = Number(amount);
    if (!numAmount || isNaN(numAmount) || numAmount < 500) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'Le montant minimum de dépôt est de 500 FCFA.' }),
      };
    }

    const txId = 'tx_dep_' + Date.now();
    const reference = 'DEP-' + Math.floor(100000 + Math.random() * 900000);

    const tx = {
      id: txId,
      type: 'deposit',
      amount: numAmount,
      method,
      phone: phone || '',
      reference,
      status: 'success',
      timestamp: Date.now(),
    };

    let updatedUser = null;
    let newBalance = numAmount;

    if (decoded && decoded.id) {
      const user = findById(decoded.id);
      if (user) {
        newBalance = Math.round(((user.balance || 0) + numAmount) * 100) / 100;
        updatedUser = updateUser(decoded.id, {
          balance: newBalance,
          isActivated: true,
        });
        addTransaction(decoded.id, tx);
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: `Dépôt de ${numAmount.toLocaleString('fr-FR')} FCFA validé avec succès ! Jeu débloqué.`,
        balance: newBalance,
        user: sanitizeUser(updatedUser),
        transaction: tx,
      }),
    };
  } catch (error) {
    console.error('Netlify deposit error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Erreur lors du traitement du dépôt.' }),
    };
  }
};

module.exports = { handler: exports.handler };
