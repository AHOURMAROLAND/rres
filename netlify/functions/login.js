// Netlify Serverless Function for User Login
// Handles POST requests to /.netlify/functions/login
const {
  findByEmail,
  sanitizeUser,
  generateToken,
  corsHeaders,
  bcrypt,
} = require('./db');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ status: 'ok', message: 'Netlify login function ready' }),
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Méthode non autorisée. Utilisez POST.' }),
    };
  }

  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || {});
    const { email, password } = body;

    // 1. Validation de la saisie
    if (!email || !password) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: 'Veuillez saisir votre email et mot de passe.',
        }),
      };
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const rawPassword = String(password);

    // 2. Recherche de l'utilisateur par email
    const user = findByEmail(cleanEmail);
    if (!user) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: 'Email ou mot de passe incorrect.',
        }),
      };
    }

    // 3. Vérification du mot de passe avec bcrypt
    const isMatch = bcrypt.compareSync(rawPassword, user.password);
    if (!isMatch) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: 'Email ou mot de passe incorrect.',
        }),
      };
    }

    // 4. Création du token sécurisé et retour des données (solde exact, paris, transactions)
    const token = generateToken(user);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: `Connexion réussie ! Bon retour sur AeroCrash, ${user.name}.`,
        token,
        user: sanitizeUser(user),
        bets: user.bets || [],
        transactions: user.transactions || [],
      }),
    };
  } catch (error) {
    console.error('Netlify login error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        message: 'Erreur serveur lors de la connexion. Veuillez réessayer.',
      }),
    };
  }
};

module.exports = { handler: exports.handler };
