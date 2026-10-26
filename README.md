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

Les nouvelles inscriptions avec code OTP sont temporairement suspendues pendant les travaux sur les paiements. Les comptes existants peuvent toujours se connecter et utiliser la récupération du mot de passe. Le serveur bloque aussi les appels directs aux routes d'inscription. Pour les réactiver plus tard, définis `REGISTRATION_ENABLED=true` et `VITE_REGISTRATION_ENABLED=true` dans l'environnement de déploiement, puis rebuild/redéploie.

## Déploiement sur Vercel

1. Importez le dépôt dans Vercel et gardez le répertoire racine du projet.
2. Vercel utilise `vercel.json` : préréglage Vite, commande `npm run build:client` et dossier de sortie `dist`. L'API Express est publiée comme fonction Node depuis `api/index.ts`; les routes historiques `/.netlify/functions/*` et `/api/*` sont réécrites vers cette API.
3. Ajoutez les variables ci-dessous dans **Project Settings → Environment Variables**, pour chaque environnement à utiliser, puis redéployez.

Variables **obligatoires** pour que l'API démarre sur Vercel :

- `DATABASE_URL` : URL PostgreSQL de Supabase ou Neon. Utilisez une URL TLS accessible depuis les fonctions Vercel; les chaînes poolées de Neon ou Supabase conviennent.
- `JWT_SECRET` : secret aléatoire robuste et propre à la production. Ne réutilisez pas la valeur de développement.

Variables à définir pour activer les fonctionnalités correspondantes :

- `APP_URL` : URL publique du déploiement (utilisée pour les retours de paiement SasPay).
- `SASPAY_API_KEY` : clé SasPay conservée uniquement côté serveur. N’ajoutez pas de clé `sk_live_...` avant d’avoir validé les flux avec une clé `sk_test_...`. Si cette variable est définie, `SASPAY_WEBHOOK_SECRET` est obligatoire au démarrage.
- E-mail : configurez `BREVO_API_KEY` (clé API Brevo `xkeysib-...`) et `BREVO_SENDER_EMAIL` (expéditeur validé dans Brevo). `BREVO_SENDER_NAME` est facultative.
- `SASPAY_API_URL`, `MIN_DEPOSIT_FCFA`, `MIN_WITHDRAW_FCFA` et `PLATFORM_FEE_PERCENT` sont facultatives et disposent de valeurs par défaut côté serveur.

Ne configurez pas `VITE_API_URL` pour un déploiement monolithique sur Vercel : le client utilise des chemins relatifs et les réécritures Vercel les dirigent vers la fonction. Les secrets serveur ne doivent jamais être préfixés par `VITE_`.

Les fonctions Vercel sont éphémères : le stockage fichier local `data/users.json` ne persiste pas. Configurez une base PostgreSQL accessible à Vercel avant d'utiliser l'application. Pour une base Supabase ou Neon neuve, appliquez le schéma depuis un environnement sûr avec `bun run db:init`. Pour une base existante, appliquez d'abord la migration additive des paiements avec `bun run db:migrate:payment-idempotency`; elle vérifie les identifiants SasPay dupliqués avant de créer les index uniques. N'exécutez pas l'initialisation complète sur une base existante sans avoir vérifié son contenu. Ne collez jamais l'URL PostgreSQL dans le dépôt ou dans le chat.

**Le jeu en argent réel et les dépôts sont volontairement suspendus dans cette version.** Le client ne calcule pas les résultats de façon fiable côté serveur; le mode réel ne doit pas être réactivé avant l’implémentation du règlement serveur des manches. Les retraits de soldes déjà enregistrés restent disponibles et ne sont finalisés qu’après vérification du statut de paiement SasPay. Testez d’abord les retraits et webhooks dans une Preview avec une base de test et une clé SasPay sandbox; pour les retraits, l’IP sortante doit être autorisée dans SasPay. Ne passez pas en Production tant que les flux et la migration n’ont pas été validés.

Les anciens retraits restés en attente sans référence SasPay ni clé d’idempotence ne peuvent pas être relancés automatiquement sans risque de double paiement. Rapprochez-les manuellement avec le tableau de bord SasPay et le bénéficiaire avant toute nouvelle demande.

Vérifications locales ciblées : `bun run lint`, `bun run test:payments` et `bun run build`. La connexion de la base, l’application de la migration distante et le déploiement demandent les accès du projet Vercel et de la base Supabase/Neon choisie.

## Déploiement manuel sur Render (sans Blueprint)

Crée le service Web et la base séparément : choisis **New → Web Service**, pas **Blueprint**. Les instructions ci-dessous configurent les offres gratuites lorsqu'elles sont proposées par Render. Si le tableau de bord demande une carte ou ne propose qu'une offre payante, annule sans confirmer; les plans disponibles peuvent dépendre du compte et de la région.

1. Connecte le dépôt GitHub `AHOURMAROLAND/rres`, la branche `main`, puis choisis **Runtime: Bun**, **Root Directory: .**, **Build Command: `bun install --frozen-lockfile && bun run build`**, **Start Command: `node dist/server.cjs`** (ou `bun run start`), et **Instance Type: Free**. Configure le contrôle de santé sur `/api/health`. Le build est effectué une seule fois pendant le déploiement; le serveur initialise automatiquement la base au démarrage.
2. Séparément, choisis **New → PostgreSQL** et sélectionne **Free**, si proposé. Cette base est un service Render géré séparément du Web Service; elle n'est pas un fichier dans le conteneur Docker. Les bases gratuites Render peuvent avoir des limites de stockage et une date d'expiration : consulte les conditions affichées avant de créer la base.
3. Depuis les informations de la base, copie l'**Internal Database URL** dans la variable `DATABASE_URL` du Web Service. Ajoute `JWT_SECRET` comme secret aléatoire long. Ne mets pas ces valeurs dans le dépôt, le navigateur ou le chat.
4. Crée ou redéploie le service. Le serveur applique automatiquement `database_schema.sql` au démarrage, avant d'accepter les requêtes. Cela fonctionne aussi si Render lance `node dist/server.cjs` directement; aucun Shell Render n'est nécessaire. La commande requiert que `DATABASE_URL` soit correctement configurée sur le Web Service.
5. Configure `APP_URL` avec l'adresse publique exacte du service, par exemple `https://aerocrash.onrender.com`. Le mode réel et les dépôts restent suspendus dans cette version, même si une clé est configurée. Pour préparer des tests SasPay, utilise d'abord une clé `sk_test_...`; une réponse `401` signifie que la clé est manquante, invalide ou expirée. Ne partage jamais la clé. Enregistre puis redéploie. Vérifie ensuite `https://….onrender.com/api/health`.
6. Pour les e-mails transactionnels, configure `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` et, si besoin, `BREVO_SENDER_NAME` dans **Environment**. Enregistre et redéploie.

Le plan Web Service gratuit peut s'endormir après une période sans trafic. Les comptes et soldes de joueurs ne doivent pas être considérés comme persistants tant que les limites et la conservation de la base gratuite ne conviennent pas à ton usage.

### Configurer l'email et les paiements

- **Brevo (API HTTPS)** : les e-mails passent par l'API `https://api.brevo.com/v3/smtp/email`, pas par SMTP, car les instances gratuites Render bloquent les ports SMTP sortants. Dans Brevo, crée une clé API (`xkeysib-...`, pas la clé SMTP `xsmtpsib-...`) et valide l'adresse d'expédition dans **Senders, Domains & Dedicated IPs**. Dans Render > **Environment**, définis `BREVO_API_KEY` et `BREVO_SENDER_EMAIL`; `BREVO_SENDER_NAME` personnalise le nom affiché. Si Brevo restreint les IP autorisées, désactive la restriction ou ajoute les IP sortantes de Render. Ne commite jamais la clé.
- **SasPay** : dans le tableau de bord SasPay, crée d'abord une clé `sk_test_...` pour valider les flux sans argent réel. Configure `SASPAY_API_KEY` et `SASPAY_WEBHOOK_SECRET` uniquement dans l'environnement de déploiement; la seconde est obligatoire dès que la première est renseignée. Pour les retraits de production, le KYC/marchand, le scope `PAYOUT` ou `BOTH` et l'IP serveur autorisée sont requis. N'active aucune clé live pour les dépôts tant que le mode réel est suspendu et que le règlement serveur des manches n'est pas terminé.

Ne téléverse pas le fichier `.env`, ne le commite pas et n'utilise pas le stockage local `data/users.json` comme base de production.
