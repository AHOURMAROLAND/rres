// Netlify Serverless Function for Deposits (with SasPay integration)
// Handles POST requests to /.netlify/functions/deposit
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
  createSaspayPayment,
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

    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || {});
    const { amount, method = 'wave', phone, country, otp } = body;

    const numAmount = Number(amount);
    if (!numAmount || isNaN(numAmount) || numAmount < 1000) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'Le montant minimum de dépôt est de 1 000 FCFA.' }),
      };
    }

    const txId = 'tx_dep_' + Date.now();
    const reference = 'DEP-' + Math.floor(100000 + Math.random() * 900000);
    const cleanPhone = (phone || '').toString().trim();

    let user = null;
    if (decoded && decoded.id) {
      user = findById(decoded.id);
    }

    if (!isSaspayConfigured()) {
      return {
        statusCode: 503,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: 'La passerelle de paiement sécurisée est temporairement indisponible. Veuillez réessayer plus tard.',
        }),
      };
    }

    try {
      const saspayRes = await createSaspayPayment({
        amount: numAmount,
        country: country || user?.country || 'CI',
        method,
        customer: {
          first_name: user?.name ? user.name.split(' ')[0] : 'Joueur',
          last_name: user?.name ? user.name.split(' ').slice(1).join(' ') : 'AeroCrash',
          email: user?.email || 'joueur@aerocrash.live',
          phone: cleanPhone,
        },
        description: `Dépôt AeroCrash ${numAmount.toLocaleString('fr-FR')} FCFA`,
        returnUrl: `${process.env.APP_URL || ''}?payment=success&payment_id=`,
        otp,
      });

      if (!saspayRes.success || !saspayRes.paymentId) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            success: false,
            message: saspayRes.message || 'Échec de l\'initialisation du paiement sécurisé.',
          }),
        };
      }

      const tx = {
        id: txId,
        userId: decoded?.id || '',
        type: 'deposit',
        amount: numAmount,
        method,
        phone: cleanPhone,
        reference,
        status: 'pending',
        timestamp: Date.now(),
        saspayPaymentId: saspayRes.paymentId,
        checkoutUrl: saspayRes.checkoutUrl,
      };

      if (decoded?.id) {
        addTransaction(decoded.id, tx);
      }

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          pending: true,
          paymentId: saspayRes.paymentId,
          checkoutUrl: saspayRes.checkoutUrl,
          instructions: saspayRes.instructions,
          message: saspayRes.checkoutUrl
            ? 'Redirection vers la page de paiement sécurisée...'
            : 'Demande envoyée sur votre téléphone. Veuillez valider avec votre code PIN secret.',
          transaction: tx,
        }),
      };
    } catch (err) {
      console.error('Payment deposit error in Netlify function:', err);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'Erreur lors de la communication avec la passerelle de paiement sécurisée.' }),
      };
    }
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
