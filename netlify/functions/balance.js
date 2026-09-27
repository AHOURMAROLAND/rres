// Netlify Serverless Function for Updating Balance
// Handles POST requests to /.netlify/functions/balance
const {
  findById,
  updateUser,
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
        body: JSON.stringify({ success: false, message: 'Non autorisé.' }),
      };
    }

    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || {});
    const { balance } = body;
    const numBalance = Number(balance);

    if (isNaN(numBalance) || numBalance < 0) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'Valeur de solde invalide.' }),
      };
    }

    const cleanBalance = Math.round(numBalance * 100) / 100;
    const updatedUser = updateUser(decoded.id, { balance: cleanBalance });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        balance: cleanBalance,
        user: sanitizeUser(updatedUser),
      }),
    };
  } catch (error) {
    console.error('Netlify balance error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Erreur lors de la mise à jour du solde.' }),
    };
  }
};

module.exports = { handler: exports.handler };
