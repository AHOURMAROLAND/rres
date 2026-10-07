# AeroCrash

Application de jeu React/Vite avec une API Express, une base PostgreSQL et l'intégration de paiements SasPay.

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

- `DATABASE_URL` : URL PostgreSQL, à configurer dans Vercel pour une base accessible depuis cet environnement.
- `JWT_SECRET` : secret aléatoire robuste et propre à la production. Ne réutilisez pas la valeur de développement.

Variables à définir pour activer les fonctionnalités correspondantes :

- `APP_URL` : URL publique du déploiement (utilisée pour les retours de paiement SasPay).
- `SASPAY_API_KEY` et `SASPAY_WEBHOOK_SECRET` : identifiants SasPay pour les paiements et la validation des webhooks.
- `BREVO_API_KEY` et `BREVO_FROM_EMAIL` : envoi des codes de vérification, e-mails de réinitialisation et reçus. `BREVO_FROM_NAME` est facultative (valeur par défaut : `AeroCrash`). Créez une clé API dans Brevo et vérifiez l'adresse expéditeur/le domaine avant l'envoi en production.
- `SASPAY_API_URL`, `MIN_DEPOSIT_FCFA`, `MIN_WITHDRAW_FCFA` et `PLATFORM_FEE_PERCENT` sont facultatives et disposent de valeurs par défaut côté serveur.

Ne configurez pas `VITE_API_URL` pour un déploiement monolithique sur Vercel : le client utilise des chemins relatifs et les réécritures Vercel les dirigent vers la fonction. Les secrets serveur ne doivent jamais être préfixés par `VITE_`.

Les fonctions Vercel sont éphémères : le stockage fichier local `data/users.json` ne persiste pas. Configurez une base PostgreSQL accessible à Vercel avant d'utiliser l'application en production. Vercel doit recevoir sa propre `DATABASE_URL`. Le schéma est fourni dans `database_schema.sql`.

Pour vérifier la configuration localement, exécutez `bun run lint` et `bun run build:client`. Un déploiement distant nécessite ensuite la configuration des variables d'environnement dans Vercel.

## Déploiement manuel sur Render (sans Blueprint)

Crée le service Web et la base séparément : choisis **New → Web Service**, pas **Blueprint**. Les instructions ci-dessous configurent les offres gratuites lorsqu'elles sont proposées par Render. Si le tableau de bord demande une carte ou ne propose qu'une offre payante, annule sans confirmer; les plans disponibles peuvent dépendre du compte et de la région.

1. Connecte le dépôt GitHub `AHOURMAROLAND/rres`, la branche `main`, puis choisis **Runtime: Bun**, **Root Directory: .**, **Build Command: `bun install --frozen-lockfile && bun run build`**, **Start Command: `bun run start`**, et **Instance Type: Free**. Configure le contrôle de santé sur `/api/health`.
2. Séparément, choisis **New → PostgreSQL** et sélectionne **Free**, si proposé. Cette base est un service Render géré séparément du Web Service; elle n'est pas un fichier dans le conteneur Docker. Les bases gratuites Render peuvent avoir des limites de stockage et une date d'expiration : consulte les conditions affichées avant de créer la base.
3. Depuis les informations de la base, copie l'**Internal Database URL** dans la variable `DATABASE_URL` du Web Service. Ajoute `JWT_SECRET` comme secret aléatoire long. Ne mets pas ces valeurs dans le dépôt, le navigateur ou le chat.
4. Crée le service, attends l'état **Live**, puis initialise les tables avec `bun run db:init` dans le Shell du Web Service. Si le Shell n'est pas disponible, configure temporairement l'**External Database URL** comme `DATABASE_URL` dans le `.env` local, exécute `bun run db:init`, puis retire l'URL du fichier.
5. Copie l'adresse publique `https://….onrender.com` dans `APP_URL`, enregistre et redéploie. Vérifie ensuite `https://….onrender.com/api/health`.

Le plan Web Service gratuit peut s'endormir après une période sans trafic. Les comptes et soldes de joueurs ne doivent pas être considérés comme persistants tant que les limites et la conservation de la base gratuite ne conviennent pas à ton usage.

### Ajouter Brevo et SasPay (facultatif)

- **Brevo** : ouvre **Paramètres → SMTP et API → Clés API et MCP**, crée une clé API et configure `BREVO_API_KEY`. Vérifie une adresse expéditeur et configure `BREVO_FROM_EMAIL`. Le login et la clé SMTP ne remplacent pas la clé API.
- **SasPay** : configure `SASPAY_API_KEY` et `SASPAY_WEBHOOK_SECRET` ensemble. Le webhook doit pointer vers `https://<nom-du-service>.onrender.com/api/webhook/saspay`. Utilise d'abord les identifiants de test; une clé Stripe n'est pas une clé SasPay.

Ne téléverse pas le fichier `.env`, ne le commite pas et n'utilise pas le stockage local `data/users.json` comme base de production.
