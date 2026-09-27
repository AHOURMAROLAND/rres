// Netlify Serverless Function for User Registration
// Handles POST requests to /.netlify/functions/register
const {
  findByEmail,
  createUser,
  sanitizeUser,
  generateToken,
  corsHeaders,
  bcrypt,
} = require('./db');

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  // Health check
  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ status: 'ok', message: 'Netlify register function ready' }),
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
    const data = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || {});
    const { name, email, password, country } = data;

    // 1. Vérification que tous les champs obligatoires sont remplis
    if (!name || !email || !password) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: 'Veuillez remplir tous les champs obligatoires (nom complet, email, mot de passe).',
        }),
      };
    }

    const cleanName = String(name).trim();
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanCountry = country ? String(country).trim() : "Côte d'Ivoire";
    const rawPassword = String(password);

    // 2. Vérification du format de l'email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: "Format d'adresse email invalide (ex: joueur@gmail.com).",
        }),
      };
    }

    // 3. Vérification de la longueur du mot de passe
    if (rawPassword.length < 6) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: 'Le mot de passe doit comporter au moins 6 caractères.',
        }),
      };
    }

    // 4. Vérification d'unicité de l'email (pas de doublon)
    const existing = findByEmail(cleanEmail);
    if (existing) {
      return {
        statusCode: 409,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: 'Un compte avec cette adresse email existe déjà. Veuillez vous connecter.',
        }),
      };
    }

    // 5. Hashage sécurisé du mot de passe avec bcrypt
    const hashedPassword = bcrypt.hashSync(rawPassword, 10);

    // 6. Enregistrement des données dans la base de données
    const userId = 'usr_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
    const now = new Date().toISOString();

    const newUser = {
      id: userId,
      name: cleanName,
      email: cleanEmail,
      password: hashedPassword,
      country: cleanCountry,
      balance: 0,
      isActivated: false,
      createdAt: now,
      updatedAt: now,
      bets: [],
      transactions: [],
    };

    createUser(newUser);

    // 7. Création du token de session sécurisé
    const token = generateToken(newUser);

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: 'Compte créé avec succès ! Bienvenue sur AeroCrash.',
        token,
        user: sanitizeUser(newUser),
      }),
    };
  } catch (error) {
    console.error('Netlify register error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        message: "Erreur serveur lors de l'inscription. Veuillez réessayer.",
      }),
    };
  }
};

module.exports = { handler: exports.handler };
