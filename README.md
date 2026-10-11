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
- `SASPAY_API_KEY` : clé active SasPay `sk_live_...` en production (scope `PAYIN` ou `BOTH`) pour les dépôts. Le marchand doit être actif après validation KYC. `SASPAY_WEBHOOK_SECRET` sert à vérifier les webhooks.
- E-mail : configurez Gmail avec `GMAIL_USER` et un mot de passe d'application dans `GMAIL_APP_PASSWORD`. Brevo et Resend sont désactivés par le serveur.
- `SASPAY_API_URL`, `MIN_DEPOSIT_FCFA`, `MIN_WITHDRAW_FCFA` et `PLATFORM_FEE_PERCENT` sont facultatives et disposent de valeurs par défaut côté serveur.

Ne configurez pas `VITE_API_URL` pour un déploiement monolithique sur Vercel : le client utilise des chemins relatifs et les réécritures Vercel les dirigent vers la fonction. Les secrets serveur ne doivent jamais être préfixés par `VITE_`.

Les fonctions Vercel sont éphémères : le stockage fichier local `data/users.json` ne persiste pas. Configurez une base PostgreSQL accessible à Vercel avant d'utiliser l'application en production. Vercel doit recevoir sa propre `DATABASE_URL`. Le schéma est fourni dans `database_schema.sql`.

Pour vérifier la configuration localement, exécutez `bun run lint` et `bun run build:client`. Un déploiement distant nécessite ensuite la configuration des variables d'environnement dans Vercel.

## Déploiement manuel sur Render (sans Blueprint)

Crée le service Web et la base séparément : choisis **New → Web Service**, pas **Blueprint**. Les instructions ci-dessous configurent les offres gratuites lorsqu'elles sont proposées par Render. Si le tableau de bord demande une carte ou ne propose qu'une offre payante, annule sans confirmer; les plans disponibles peuvent dépendre du compte et de la région.

1. Connecte le dépôt GitHub `AHOURMAROLAND/rres`, la branche `main`, puis choisis **Runtime: Bun**, **Root Directory: .**, **Build Command: `bun install --frozen-lockfile && bun run build`**, **Start Command: `node dist/server.cjs`** (ou `bun run start`), et **Instance Type: Free**. Configure le contrôle de santé sur `/api/health`. Le build est effectué une seule fois pendant le déploiement; le serveur initialise automatiquement la base au démarrage.
2. Séparément, choisis **New → PostgreSQL** et sélectionne **Free**, si proposé. Cette base est un service Render géré séparément du Web Service; elle n'est pas un fichier dans le conteneur Docker. Les bases gratuites Render peuvent avoir des limites de stockage et une date d'expiration : consulte les conditions affichées avant de créer la base.
3. Depuis les informations de la base, copie l'**Internal Database URL** dans la variable `DATABASE_URL` du Web Service. Ajoute `JWT_SECRET` comme secret aléatoire long. Ne mets pas ces valeurs dans le dépôt, le navigateur ou le chat.
4. Crée ou redéploie le service. Le serveur applique automatiquement `database_schema.sql` au démarrage, avant d'accepter les requêtes. Cela fonctionne aussi si Render lance `node dist/server.cjs` directement; aucun Shell Render n'est nécessaire. La commande requiert que `DATABASE_URL` soit correctement configurée sur le Web Service.
5. Configure `APP_URL` avec l'adresse publique exacte du service, par exemple `https://rres.onrender.com`. Pour activer les dépôts, ajoute `SASPAY_API_KEY` dans **Environment** : utilise une clé API active `sk_live_...` avec le scope `PAYIN` ou `BOTH`, issue d'un marchand SasPay actif dont le KYC est validé. Une réponse `401` signifie que la clé est manquante, invalide ou expirée; une réponse `403` peut signaler un scope sans `PAYIN` ou un marchand suspendu. Ne partage jamais la clé. Enregistre puis redéploie. Vérifie ensuite `https://….onrender.com/api/health`.
6. Pour les e-mails transactionnels, active la validation en deux étapes du compte Google, crée un mot de passe d'application et configure `GMAIL_USER` et `GMAIL_APP_PASSWORD` dans **Environment** (jamais le mot de passe Google normal). Enregistre et redéploie. Le serveur utilise Gmail uniquement et privilégie IPv4 pour la connexion SMTP.

Le plan Web Service gratuit peut s'endormir après une période sans trafic. Les comptes et soldes de joueurs ne doivent pas être considérés comme persistants tant que les limites et la conservation de la base gratuite ne conviennent pas à ton usage.

### Configurer l'email et les paiements

- **Gmail** : active la validation en deux étapes du compte Google, puis crée un **mot de passe d'application** (16 caractères). Dans Render > **Environment**, définis `GMAIL_USER` comme l'adresse Gmail et `GMAIL_APP_PASSWORD` comme ce mot de passe d'application, puis redéploie. N'utilise jamais le mot de passe Google normal. Le serveur ne tente plus Brevo ni Resend; tu peux supprimer leurs anciennes variables du dashboard Render. Le mot de passe d'application est nettoyé des espaces automatiquement. Si les logs indiquent toujours `ETIMEDOUT` ou `ENETUNREACH` après le changement IPv4, l'envoi SMTP sortant n'est pas joignable depuis le service Render et il faudra utiliser un fournisseur e-mail HTTP avec un domaine expéditeur vérifié.
- **SasPay** : dans le tableau de bord SasPay, valide le KYC et active le marchand, puis crée une clé API `LIVE` avec le scope `PAYIN` (ou `BOTH`) pour la production. Configure `SASPAY_API_KEY` uniquement dans l'environnement Render. Une réponse `401` (`api_key_rejected`) signifie que SasPay refuse cette clé : remplace-la dans Render par une clé live active du bon marchand, enregistre puis redéploie. Ne partage jamais la clé. Pour les retraits, autorise aussi l'IP du serveur dans SasPay et utilise un scope `PAYOUT` ou `BOTH`. Configure `SASPAY_WEBHOOK_SECRET` et indique `https://<nom-du-service>.onrender.com/api/webhook/saspay`. Une clé `sk_test_...` sert aux tests, pas aux paiements réels.

Ne téléverse pas le fichier `.env`, ne le commite pas et n'utilise pas le stockage local `data/users.json` comme base de production.
