// Netlify Serverless Function for Saving Bets
// Handles POST requests to /.netlify/functions/bets
const {
  findById,
  addBet,
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
    const { bet } = body;

    if (!bet) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'Données du pari manquantes.' }),
      };
    }

    addBet(decoded.id, bet);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true }),
    };
  } catch (error) {
    console.error('Netlify bets error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Erreur lors de l\'enregistrement du pari.' }),
    };
  }
};

module.exports = { handler: exports.handler };
