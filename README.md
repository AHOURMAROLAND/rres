# AeroCrash

Application de jeu React/Vite avec une API Express, une base PostgreSQL Neon et l'intégration de paiements SasPay.

## Développement local

Prérequis : Node.js et Bun.

```bash
bun install
bun run dev
```

Copiez `.env.example` vers `.env` et renseignez les variables correspondant aux services utilisés. En local, l'application peut utiliser son stockage de développement; ce stockage fichier n'est pas adapté à la production serverless.

Vérifications :

```bash
bun run lint
bun run build
```

## Déploiement sur Vercel

1. Importez le dépôt dans Vercel et gardez le répertoire racine du projet.
2. Vercel utilise `vercel.json` : préréglage Vite, commande `npm run build:client` et dossier de sortie `dist`. L'API Express est publiée comme fonction Node depuis `api/index.ts`; les routes historiques `/.netlify/functions/*` et `/api/*` sont réécrites vers cette API.
3. Ajoutez les variables ci-dessous dans **Project Settings → Environment Variables**, pour chaque environnement à utiliser, puis redéployez.

Variables **obligatoires** pour que l'API démarre sur Vercel :

- `DATABASE_URL` : URL de connexion Neon PostgreSQL avec SSL; utilisez l'URL poolée recommandée pour le serverless.
- `JWT_SECRET` : secret aléatoire robuste et propre à la production. Ne réutilisez pas la valeur de développement.

Variables à définir pour activer les fonctionnalités correspondantes :

- `APP_URL` : URL publique du déploiement (utilisée pour les retours de paiement SasPay).
- `SASPAY_API_KEY` et `SASPAY_WEBHOOK_SECRET` : identifiants SasPay pour les paiements et la validation des webhooks.
- `BREVO_API_KEY` : envoi des e-mails transactionnels; `BREVO_SENDER_EMAIL` et `BREVO_SENDER_NAME` peuvent également être configurés.
- `SASPAY_API_URL`, `MIN_DEPOSIT_FCFA`, `MIN_WITHDRAW_FCFA` et `PLATFORM_FEE_PERCENT` sont facultatives et disposent de valeurs par défaut côté serveur.

Ne configurez pas `VITE_API_URL` pour un déploiement monolithique sur Vercel : le client utilise des chemins relatifs et les réécritures Vercel les dirigent vers la fonction. Les secrets serveur ne doivent jamais être préfixés par `VITE_`.

Les fonctions Vercel sont éphémères : le stockage fichier local `data/users.json` ne persiste pas. Configurez Neon avant d'utiliser l'application en production. Le schéma de base de données est fourni dans `neon_schema.sql`.

Pour vérifier la configuration localement, exécutez `bun run lint` et `bun run build:client`. Un déploiement distant nécessite ensuite la configuration des variables d'environnement dans Vercel.
