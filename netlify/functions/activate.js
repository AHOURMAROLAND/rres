// Netlify Serverless Function for Account Activation
// Handles POST requests to /.netlify/functions/activate
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
        body: JSON.stringify({ success: false, message: 'Non autorisé.' }),
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
    const { initialBonus = 3000 } = body;

    const newBalance = (user.balance || 0) + Number(initialBonus);
    const updated = updateUser(decoded.id, {
      isActivated: true,
      balance: newBalance,
    });

    const tx = {
      id: 'tx_act_' + Math.random().toString(36).substring(2, 9),
      userId: decoded.id,
      type: 'activation',
      amount: 2000,
      method: 'wave',
      reference: 'ACT-' + Date.now().toString().slice(-6),
      status: 'success',
      timestamp: Date.now(),
    };
    addTransaction(decoded.id, tx);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        user: sanitizeUser(updated),
        message: 'Compte activé avec succès ! Bonus de 3 000 FCFA crédité.',
      }),
    };
  } catch (error) {
    console.error('Netlify activation error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Erreur lors de l\'activation du compte.' }),
    };
  }
};

module.exports = { handler: exports.handler };
