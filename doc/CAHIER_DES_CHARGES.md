# 📋 CAHIER DES CHARGES FONCTIONNEL & TECHNIQUE — AeroCrash

> **Version** : 1.0.0  
> **Date** : 29 septembre 2026  
> **Projet** : AeroCrash — Jeu de Crash Multijoueur en Ligne  
> **Cible géographique** : Afrique Francophone (UEMOA / CEMAC)  
> **Devise de référence** : Franc CFA (XOF / XAF)

---

## Table des matières

1. [Informations Générales](#1-informations-générales)
2. [Spécifications Fonctionnelles](#2-spécifications-fonctionnelles)
   - 2.1 [Authentification & Gestion des Joueurs](#21-authentification--gestion-des-joueurs)
   - 2.2 [Système Financier & Portefeuille](#22-système-financier--portefeuille)
   - 2.3 [Gameplay & Moteur de Jeu Crash](#23-gameplay--moteur-de-jeu-crash)
   - 2.4 [Dimension Sociale & Communautaire](#24-dimension-sociale--communautaire)
3. [Architecture Technique](#3-architecture-technique)
4. [Algorithme d'Équité (Provably Fair)](#4-algorithme-déquité-provably-fair)
5. [Conformité & Ergonomie](#5-conformité--ergonomie)

---

## 1. Informations Générales

| Élément                  | Détail                                        |
|--------------------------|-----------------------------------------------|
| **Nom du projet**        | AeroCrash                                     |
| **Type**                 | Jeu de Crash Multijoueur en Ligne             |
| **Cible géographique**   | Afrique Francophone (UEMOA / CEMAC)           |
| **Devise de référence**  | Franc CFA (XOF / XAF)                         |
| **Langues supportées**   | Français                                      |
| **Plateformes**          | Web (Desktop + Mobile Responsive)             |

---

## 2. Spécifications Fonctionnelles

### 2.1 Authentification & Gestion des Joueurs

#### Inscription & Contrôle d'accès
- **Champs obligatoires** : Nom complet, adresse email valide, mot de passe sécurisé (≥ 6 caractères), pays de résidence.
- **Hachage mot de passe** : `bcrypt` avec `salt rounds = 10`.
- **Validation email** : Rejet automatique des adresses emails déjà enregistrées (code HTTP 409).
- **Pays supportés** : Côte d'Ivoire, Sénégal, Mali, Burkina Faso, Bénin, Togo, Cameroun, Guinée, Congo, Gabon, Niger, France, Belgique, Canada.

#### Connexion & Sessions
- Maintien de session par **jeton JWT sécurisé** (expiration 30 jours).
- Restitution instantanée du profil, du solde en temps réel et de l'historique complet des paris.
- Endpoints API : `/api/auth/register`, `/api/auth/login`, `/api/me`.

#### Double persistance
- **Stockage côté serveur** : `/data/users.json` (fichier JSON) + Neon PostgreSQL (base cloud).
- **Synchronisation locale** : `localStorage` pour garantir l'absence totale de perte de solde entre les sessions.
- **Supabase** optionnel pour synchronisation BDD cloud supplémentaire.

---

### 2.2 Système Financier & Portefeuille

#### Gestion Double Mode
| Mode      | Description                                                   |
|-----------|---------------------------------------------------------------|
| **Démo**  | Capital virtuel de **50 000 FCFA** rechargeable sans risque   |
| **Réel**  | Solde en FCFA, activation de compte et accès aux gains réels  |

#### Dépôts (Cash-in)
- **Canaux Mobile Money** : Wave, Orange Money, MTN MoMo, Moov Money.
- **Cartes Bancaires** : Visa / Mastercard.
- **Montant minimum** : **500 FCFA**.
- **Montants prédéfinis** : 1 000, 2 000, 5 000, 10 000, 25 000 FCFA + montant personnalisable.
- **Référence unique** : Format `DEP-XXXXXX`.
- **Passerelle de paiement** : SasPay (intégration API complète).

#### Retraits (Cash-out)
- Retrait direct vers le **numéro Mobile Money** du joueur.
- **Montant minimum** : **1 000 FCFA**.
- Contrôle instantané de provisionnement et débit immédiat du solde.
- **Numéro de traçabilité** : Format `RET-XXXXXX`.

#### Commission Plateforme
- **Taux** : 2.5% sur le profit net des paris gagnants.

---

### 2.3 Gameplay & Moteur de Jeu Crash

#### Moteur Graphique
- **Canvas 2D HTML5** à **60 FPS**.
- Animation fluide de l'avion avec traînées réactives de particules.
- Grille radar et effets visuels néon.
- Support plein écran (fullscreen toggle).
- Indicateurs HUD : altitude, vitesse, multiplicateur en temps réel.

#### Cycle d'une Manche

| Phase                    | Durée / Déclencheur                          | Description                                            |
|--------------------------|-----------------------------------------------|--------------------------------------------------------|
| **1. Attente**           | 5 secondes                                    | Prise des paris pour le vol à venir                    |
| **2. Envol**             | Croissance exponentielle à partir de 1.00x   | Le multiplicateur augmente progressivement             |
| **3. Encaissement**      | Action joueur (manuel ou auto)                | Retrait avant explosion — gains sécurisés              |
| **4. Crash**             | Aléatoire (Provably Fair)                     | Arrêt du multiplicateur, clôture des mises non retirées|

#### Double Panneau de Mises (Dual Bets)
- Possibilité d'engager **1 ou 2 paris indépendants** sur le même vol.
- **Mise minimale** : 100 FCFA.
- **Mise maximale** : 100 000 FCFA.
- **Auto-Cashout** : Retrait automatique à un seuil défini par le joueur.
- **Raccourcis clavier** :
  - `Espace` → Panneau 1 (pari / encaissement).
  - `C` → Panneau 2 (pari / encaissement).

#### Ruban d'Historique
- Affichage **informatif non cliquable** des **35 derniers crashs**.
- Code couleur par palier :
  - 🔵 `< 2x` (bleu/slate)
  - 🟣 `≥ 2x` (violet)
  - 🟡 `≥ 10x` (ambre/or)
  - 🔴 `≥ 50x` (rose/rouge)
- Calcul et affichage de la **moyenne** des 20 derniers crashs.
- Filtres rapides : Tous / ≥ 2x / ≥ 10x.

#### Distribution des Multiplicateurs
| Plage              | Probabilité | Description                              |
|--------------------|-------------|------------------------------------------|
| 1.00x – 1.20x     | 40%         | Pertes rapides / crashs instantanés      |
| 1.20x – 2.00x     | 30%         | Gains modérés                            |
| 2.00x – 5.00x     | 20%         | Gains significatifs                      |
| 5.00x – 10.00x    | 7%          | Gains importants (rare)                  |
| 10.00x – 25.00x   | 3%          | Très rare (20x+ extrêmement rare)        |
| **Plafond absolu** | —           | **25.00x maximum**                       |

---

### 2.4 Dimension Sociale & Communautaire

#### Paris en direct (Live Bets)
- Vue en temps réel des joueurs participant au vol en cours.
- Affichage des mises, statuts (en vol / encaissé / crashé) et gains.
- Statistiques : total misé, total gagné, nombre de joueurs actifs.
- Filtres : Tous / En vol / Encaissés.

#### Chat en direct (Live Chat)
- Salon d'échange instantané entre joueurs.
- Support **émojis rapides** : 🚀 🔥 💰 🎯 👏 ✈️ 😎.
- Messages simulés de la communauté pour l'ambiance.
- Scroll automatique vers les nouveaux messages.

#### Classement (Leaderboard)
- Palmarès des meilleurs pilotes avec :
  - Plus hauts multiplicateurs atteints.
  - Plus gros gains cumulés.
  - Pays d'origine.
- Filtres par période : Jour / Semaine / Tout le temps.

---

## 3. Architecture Technique

### Stack Technologique

| Composant          | Technologie                           | Rôle                                          |
|--------------------|---------------------------------------|-----------------------------------------------|
| **Frontend**       | React 19 + TypeScript                 | Interface utilisateur réactive et typée       |
| **Styles**         | Tailwind CSS 4                        | Design sombre optimisé "Dark Casino"          |
| **Bundler**        | Vite 8                                | Compilation ultra-rapide et bundle optimisé   |
| **Graphisme**      | HTML5 Canvas 2D                       | Rendu graphique 60 FPS                        |
| **Audio**          | Web Audio API                         | Sons réacteur, crash et bruits de fond        |
| **Animations**     | Motion (Framer Motion)                | Micro-animations et transitions UI            |
| **Icônes**         | Lucide React                          | Iconographie vectorielle cohérente            |
| **Polices**        | Outfit, JetBrains Mono, Plus Jakarta Sans | Typographie premium                       |
| **Backend**        | Express.js (Node.js)                  | API REST serveur                              |
| **Auth**           | JWT (jsonwebtoken) + bcryptjs         | Authentification sécurisée                    |
| **Base de données**| Neon PostgreSQL (Serverless)          | Persistance cloud                             |
| **BDD Secondaire** | Supabase (optionnel)                  | Synchronisation alternative                   |
| **Fichier local**  | JSON (`/data/users.json`)             | Persistance locale serveur                    |
| **Paiements**      | SasPay API                            | Mobile Money & Cartes bancaires               |
| **Déploiement**    | Netlify (Serverless Functions)        | Hosting & API serverless                      |

### Architecture Fichiers

```
aerocrah2/
├── index.html                  # Point d'entrée HTML
├── package.json                # Dépendances & scripts
├── vite.config.ts              # Configuration Vite
├── tsconfig.json               # Configuration TypeScript
├── server.ts                   # Serveur Express principal
├── netlify.toml                # Configuration déploiement Netlify
├── neon_schema.sql             # Schéma BDD PostgreSQL (Neon)
├── supabase_schema.sql         # Schéma BDD Supabase (optionnel)
├── data/
│   └── users.json              # Stockage utilisateurs local
├── server/
│   ├── db.ts                   # Module base de données locale
│   ├── neon.ts                 # Module Neon PostgreSQL
│   ├── saspay.ts               # Intégration passerelle SasPay
│   └── scripts/
│       ├── init-db.ts          # Script initialisation BDD
│       └── whitelist-ip.ts     # Script whitelist IP
├── netlify/
│   └── functions/              # Fonctions Serverless Netlify
│       ├── register.js         # Inscription
│       ├── login.js            # Connexion
│       ├── me.js               # Profil utilisateur
│       ├── balance.js          # Consultation solde
│       ├── deposit.js          # Dépôt
│       ├── withdraw.js         # Retrait
│       ├── activate.js         # Activation compte
│       ├── bets.js             # Historique paris
│       ├── transactions.js     # Historique transactions
│       ├── payment-status.js   # Statut paiement
│       ├── saspay.js           # Module SasPay
│       ├── webhook-saspay.js   # Webhook SasPay
│       └── db.js               # Module BDD partagé
├── src/
│   ├── main.tsx                # Point d'entrée React
│   ├── App.tsx                 # Composant racine (909 lignes)
│   ├── index.css               # Styles globaux
│   ├── types.ts                # Types & Interfaces TypeScript
│   ├── components/
│   │   ├── Navbar.tsx                  # Barre de navigation
│   │   ├── CrashCanvas.tsx             # Moteur graphique Canvas 2D
│   │   ├── BetPanel.tsx                # Panneau de mise (×2)
│   │   ├── HistoryRibbon.tsx           # Ruban des derniers crashs
│   │   ├── HistoryTab.tsx              # Historique personnel
│   │   ├── LiveBetsTab.tsx             # Paris en direct
│   │   ├── LiveChatTab.tsx             # Chat en direct
│   │   ├── LeaderboardTab.tsx          # Classement
│   │   ├── AuthModal.tsx               # Modal authentification
│   │   ├── AccountActivationModal.tsx  # Modal activation compte
│   │   ├── DepositWithdrawModal.tsx    # Modal dépôt/retrait
│   │   ├── ProvablyFairModal.tsx       # Modal équité vérifiable
│   │   ├── RegistrationView.tsx        # Vue d'inscription complète
│   │   ├── ResponsibleGamingBanner.tsx # Bannière jeu responsable
│   │   └── ToastNotification.tsx       # Notifications toast
│   ├── services/
│   │   ├── authApi.ts          # Service d'authentification API
│   │   ├── provablyFair.ts     # Algorithme d'équité
│   │   ├── sound.ts            # Gestionnaire audio (Web Audio API)
│   │   ├── storage.ts          # Service de persistance locale
│   │   └── supabase.ts         # Client Supabase
│   └── data/
│       ├── countries.ts        # Liste des pays supportés
│       └── virtualPlayers.ts   # Joueurs virtuels simulés
└── public/
    └── _redirects              # Redirections Netlify
```

### Schéma Base de Données (PostgreSQL / Neon)

| Table            | Champs principaux                                                              |
|------------------|--------------------------------------------------------------------------------|
| `users`          | id, name, email, password_hash, country, balance, is_activated, role           |
| `transactions`   | id, user_id, type, amount, currency, method, phone_number, reference, status   |
| `bets`           | id, user_id, round_id, game_mode, amount, crash_multiplier, cashout_multiplier |
| `rounds`         | round_id, crash_multiplier, server_seed, server_seed_hash, client_seed, nonce  |

---

## 4. Algorithme d'Équité (Provably Fair)

### Principe
Le système garantit que **ni le serveur ni le joueur** ne peut manipuler le résultat d'un tour.

### Mécanisme

| Élément                  | Description                                                                |
|--------------------------|----------------------------------------------------------------------------|
| **Server Seed**          | Graine générée cryptographiquement côté serveur                            |
| **Server Seed Hash**     | Hash SHA-256 publié **avant** chaque tour (preuve d'engagement)            |
| **Client Seed**          | Graine côté client garantissant l'impossibilité de modification arbitraire |
| **Nonce**                | Compteur incrémental pour chaque tour                                      |
| **Calcul multiplicateur**| `HMAC_SHA256(ServerSeed, ClientSeed + ":" + Nonce)`                        |
| **Avantage maison**      | **3%** (house edge)                                                        |

### Implémentation
- Fonction de hachage déterministe à 53 bits de précision uniforme.
- Distribution pondérée en 5 paliers (voir § 2.3).
- Plafond absolu strict : **25.00x**.
- Vérification post-tour via la modal "Provably Fair".

---

## 5. Conformité & Ergonomie

### Règles UX / UI intégrées
- ✅ **Suppression du bouton bouclier** : L'en-tête (Navbar) est épuré sur mobile et desktop avec un alignement symétrique équilibré : `Logo | Sélecteur de mode | Portefeuille & Profil`.
- ✅ **Multiplicateurs d'historique neutralisés** : Les badges de multiplicateurs (1.09x, 1.17x...) dans le ruban sont purement informatifs et ne déclenchent **aucune action au clic**.
- ✅ **Jeu responsable** : Bannière et modal de sensibilisation au jeu responsable (`ResponsibleGamingBanner`).
- ✅ **Design "Dark Casino"** : Palette sombre (#090C12) avec accents orange/ambre.
- ✅ **Mobile-first** : Interface responsive avec layout adaptatif (2 lignes header mobile, 1 ligne desktop).
- ✅ **Accessibilité** : `user-scalable=no` pour éviter les zooms parasites sur mobile, `antialiased` pour la lisibilité.

### Sécurité
- Hachage des mots de passe (bcrypt, 10 salt rounds).
- Jetons JWT avec expiration 30 jours.
- Validation serveur de tous les inputs (email, mot de passe, montants).
- Protection CORS configurée.
- Vérification HMAC des webhooks de paiement (SasPay).
- Raw body preservé pour la vérification de signature.

---

> 📌 **Document maintenu dans** : `doc/CAHIER_DES_CHARGES.md`  
> 📌 **Analyse comparative** : Voir `doc/ANALYSE_COMPARATIVE.md`
