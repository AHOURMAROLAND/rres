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
- `BREVO_API_KEY` et `BREVO_FROM_EMAIL` : envoi des codes de vérification, e-mails de réinitialisation et reçus. `BREVO_FROM_NAME` est facultative (valeur par défaut : `AeroCrash`). Créez une clé API dans Brevo et vérifiez l'adresse expéditeur/le domaine avant l'envoi en production.
- `SASPAY_API_URL`, `MIN_DEPOSIT_FCFA`, `MIN_WITHDRAW_FCFA` et `PLATFORM_FEE_PERCENT` sont facultatives et disposent de valeurs par défaut côté serveur.

Ne configurez pas `VITE_API_URL` pour un déploiement monolithique sur Vercel : le client utilise des chemins relatifs et les réécritures Vercel les dirigent vers la fonction. Les secrets serveur ne doivent jamais être préfixés par `VITE_`.

Les fonctions Vercel sont éphémères : le stockage fichier local `data/users.json` ne persiste pas. Configurez Neon avant d'utiliser l'application en production. Le schéma de base de données est fourni dans `neon_schema.sql`.

Pour vérifier la configuration localement, exécutez `bun run lint` et `bun run build:client`. Un déploiement distant nécessite ensuite la configuration des variables d'environnement dans Vercel.

## Déploiement sur Render

Le fichier `render.yaml` configure le service Web, les commandes de build et de démarrage, le contrôle de santé et les variables de production. Dans Render, choisissez **New → Blueprint**, connectez le dépôt GitHub `AHOURMAROLAND/rres`, sélectionnez la branche `main` et le répertoire racine. Vérifiez le service `aerocrash` proposé par le Blueprint.

Avant le premier déploiement, fournissez obligatoirement `DATABASE_URL` avec l'URL Neon PostgreSQL (SSL activé). Render génère automatiquement `JWT_SECRET` ; ne le remplacez pas par une valeur de développement. Le serveur refuse de démarrer en production sans ces deux variables. Pour activer l'envoi d'e-mails, renseignez aussi `BREVO_API_KEY` et `BREVO_FROM_EMAIL`. Les variables SasPay ne sont nécessaires que si tu actives les paiements; dans ce cas, configure `SASPAY_API_KEY` et `SASPAY_WEBHOOK_SECRET` ensemble. Les secrets ne doivent être saisis que dans l'interface sécurisée Render.

Après le premier déploiement, ajoutez dans **Environment** :

- `APP_URL` : URL publique du service Render, utilisée pour les retours de paiement et les redirections SasPay.
- `BREVO_FROM_NAME` : facultative (valeur par défaut : `AeroCrash`).
- Si SasPay n'est pas encore prêt, ne renseignez pas ses deux clés; le serveur n'exige le secret webhook que lorsque `SASPAY_API_KEY` est configurée.

### Récupérer les clés

1. **Neon** — créez un projet sur [Neon Console](https://console.neon.tech), copiez l'URL PostgreSQL avec SSL pour `DATABASE_URL`, puis exécutez `neon_schema.sql` sur cette base.
2. **Brevo** — ouvrez **Paramètres → SMTP et API → Clés API et MCP**, créez une clé API et copiez-la une seule fois dans `BREVO_API_KEY`. La capture des paramètres SMTP ne montre pas la clé API : le login SMTP et la clé SMTP ne remplacent pas cette clé. Vérifiez l'adresse expéditeur/le domaine dans Brevo, puis utilisez cette adresse dans `BREVO_FROM_EMAIL`.
3. **SasPay** — dans le tableau de bord SasPay, récupérez la clé API du mode voulu et créez/configurez un webhook pointant vers `https://<nom-du-service>.onrender.com/api/webhook/saspay`. Copiez la clé API dans `SASPAY_API_KEY` et le secret de signature de ce webhook dans `SASPAY_WEBHOOK_SECRET`. Configurez les deux ensemble; une clé Stripe n'est pas une clé SasPay.
4. **Render** — après la création du service, copiez son URL `onrender.com` dans `APP_URL`, enregistrez les variables puis relancez un déploiement. Vérifiez `/api/health`, puis testez les e-mails et les paiements en mode test avant toute transaction réelle.

`SASPAY_API_URL`, `MIN_DEPOSIT_FCFA`, `MIN_WITHDRAW_FCFA` et `PLATFORM_FEE_PERCENT` sont facultatives et disposent de valeurs par défaut. Les variables `VITE_*` ne doivent contenir aucun secret.

Exécutez le schéma `neon_schema.sql` sur la base Neon utilisée par `DATABASE_URL` avant de tester l'inscription. Ne téléversez pas le fichier `.env`, ne le commitez pas et n'utilisez pas le stockage local `data/users.json` comme base de production. Les variables d'environnement se configurent dans Render, pas dans le dépôt.
