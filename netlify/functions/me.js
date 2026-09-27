// Netlify Serverless Function for Current User Session Check
// Handles GET requests to /.netlify/functions/me
const {
  findById,
  findByEmail,
  sanitizeUser,
  verifyToken,
  corsHeaders,
} = require('./db');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      statusCode: 401,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Session manquante ou expirée.' }),
    };
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    if (!decoded) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'Token de session invalide ou expiré.' }),
      };
    }

    // Lookup user by ID first, then by email
    let user = findById(decoded.id);
    if (!user && decoded.email) {
      user = findByEmail(decoded.email);
    }

    if (!user) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'Compte utilisateur introuvable.' }),
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        user: sanitizeUser(user),
        bets: user.bets || [],
        transactions: user.transactions || [],
      }),
    };
  } catch (err) {
    console.error('Netlify me error:', err);
    return {
      statusCode: 401,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Erreur lors de la validation de session.' }),
    };
  }
};

module.exports = { handler: exports.handler };
