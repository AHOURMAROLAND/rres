# Graph Report - aerocrah2  (2026-10-14)

## Corpus Check
- 60 files · ~58,417 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 2, .example 1, .lock 1)

## Summary
- 553 nodes · 1362 edges · 33 communities (17 shown, 16 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 51 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Client Components
- API and Persistence
- Netlify Function Adapters
- Client Game Flow
- Package Metadata
- Payment Persistence
- PostgreSQL Schema
- TypeScript Configuration
- Runtime Dependencies
- Development Dependencies
- Sound Effects
- Provably Fair Algorithm
- Development Scripts
- SasPay Operations
- Vercel Deployment
- Deployment Guide
- Vite Build Pipeline
- Relational Data Model
- Conformance Documentation
- React Bootstrap
- Product Specifications
- Crash Game Mechanics
- African Payments Market
- HTML Branding
- Email OTP Storage
- Live Community Features
- Application Shell
- User Lookup
- Payment Lookup
- Transaction Updates
- Virtual Player Feed
- Compiler Settings
- Vite Settings

## God Nodes (most connected - your core abstractions)
1. `App()` - 55 edges
2. `User` - 40 edges
3. `StorageService` - 31 edges
4. `AuthApi` - 27 edges
5. `isDatabaseConfigured()` - 22 edges
6. `react` - 20 edges
7. `lucide-react` - 18 edges
8. `findById()` - 17 edges
9. `RegistrationView` - 17 edges
10. `getApiBaseUrl()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `handler()` --semantically_similar_to--> `handleActivate`  [INFERRED] [semantically similar]
  netlify/functions/activate.js → server.ts
- `handler()` --semantically_similar_to--> `handleDeposit`  [INFERRED] [semantically similar]
  netlify/functions/deposit.js → server.ts
- `handler()` --semantically_similar_to--> `handleMe`  [INFERRED] [semantically similar]
  netlify/functions/me.js → server.ts
- `handler()` --semantically_similar_to--> `handlePaymentStatus`  [INFERRED] [semantically similar]
  netlify/functions/payment-status.js → server.ts
- `handler()` --semantically_similar_to--> `handleRegister`  [INFERRED] [semantically similar]
  netlify/functions/register.js → server.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **AeroCrash Account Authentication Flow** — netlify_functions_register_handler, netlify_functions_login_handler, netlify_functions_me_handler, server_ts_handleregister, server_ts_handlelogin, server_ts_handleme [INFERRED 0.85]
- **SasPay Deposit Confirmation Flow** — server_ts_handledeposit, server_ts_handlepaymentstatus, server_ts_handlesaspaywebhook, server_saspay_createsaspaypayment, server_saspay_verifysaspaypayment, server_database_addtransaction, server_database_updatebalance, server_database_updatetransactionstatus [INFERRED 0.95]
- **Bet Recording and Persistence Flow** — netlify_functions_bets_handler, server_ts_handlebet, server_db_addbet, server_database_addbet, database_schema_bets, database_schema_rounds [INFERRED 0.85]
- **Game Round Lifecycle and UI** — src_app_app, src_components_betpanel_betpanel, src_components_crashcanvas_crashcanvas, src_services_provablyfair_calculatecrashmultiplierasync, src_services_storage_addround [INFERRED 0.85]
- **User Authentication and Session Sync** — src_components_registrationview_registrationview, src_components_authmodal_authmodal, src_services_authapi_register, src_services_authapi_login, src_services_storage_setcurrentuser, src_app_app [INFERRED 0.85]
- **Deposits, Withdrawals and Receipts** — src_components_accountactivationmodal_accountactivationmodal, src_components_depositwithdrawmodal_depositwithdrawmodal, src_services_authapi_deposit, src_services_authapi_checkpaymentstatus, src_components_transactionreceiptmodal_transactionreceiptmodal [INFERRED 0.85]

## Communities (33 total, 16 thin omitted)

### Community 0 - "Client Components"
Cohesion: 0.06
Nodes (74): lucide-react, react, AccountActivationModal, AccountActivationModalProps, AuthModalProps, BetPanel, BetPanelProps, PRESET_AMOUNTS (+66 more)

### Community 1 - "API and Persistence"
Cohesion: 0.06
Nodes (55): RFC-5322, nodemailer, pg, app, authenticateToken(), DatabaseTransaction, DatabaseUser, EmailOtpType (+47 more)

### Community 2 - "Netlify Function Adapters"
Cohesion: 0.07
Nodes (64): {
  findById,
  updateUser,
  addTransaction,
  sanitizeUser,
  verifyToken,
  corsHeaders,
}, handler(), {
  findById,
  updateUser,
  sanitizeUser,
  verifyToken,
  corsHeaders,
}, handler(), {
  findById,
  addBet,
  verifyToken,
  corsHeaders,
}, handler(), addBet(), addTransaction() (+56 more)

### Community 3 - "Client Game Flow"
Cohesion: 0.07
Nodes (29): App(), AuthModal, DepositWithdrawModal, getPaymentMethodsForCountry(), RegistrationView, AuthApi, AuthApi.checkPaymentStatus, AuthApi.clearToken (+21 more)

### Community 4 - "Package Metadata"
Cohesion: 0.08
Nodes (24): name, private, type, version, autoprefixer, bcryptjs, cors, esbuild (+16 more)

### Community 5 - "Payment Persistence"
Cohesion: 0.14
Nodes (24): PostgresDatabase.addTransaction, PostgresDatabase.findTransactionBySaspayId, PostgresDatabase.updateBalance, PostgresDatabase.updateTransactionStatus, UserDatabase.addTransaction, UserDatabase.update, createSaspayPayment(), createSaspayPayout() (+16 more)

### Community 6 - "PostgreSQL Schema"
Cohesion: 0.21
Nodes (16): idx_bets_created_at, idx_bets_round_id, idx_bets_user_id, idx_email_otps_expires_at, idx_rounds_created_at, idx_transactions_created_at, idx_transactions_saspay_pay_id, idx_transactions_status (+8 more)

### Community 7 - "TypeScript Configuration"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+8 more)

### Community 8 - "Runtime Dependencies"
Cohesion: 0.12
Nodes (16): dependencies, bcryptjs, cors, dotenv, express, @google/genai, jsonwebtoken, lucide-react (+8 more)

### Community 9 - "Development Dependencies"
Cohesion: 0.13
Nodes (15): devDependencies, autoprefixer, esbuild, tailwindcss, tsx, @types/bcryptjs, @types/cors, @types/express (+7 more)

### Community 11 - "Provably Fair Algorithm"
Cohesion: 0.35
Nodes (10): RFC-2104, applyWeightedDistribution(), calculateCrashMultiplier, calculateCrashMultiplierAsync, generateSeed, hmacHashToFloat(), hmacSha256(), hmacSha256Sync() (+2 more)

### Community 12 - "Development Scripts"
Cohesion: 0.20
Nodes (10): scripts, build, build:client, clean, db:init, dev, lint, preview (+2 more)

### Community 13 - "SasPay Operations"
Cohesion: 0.25
Nodes (7): dotenv, getPublicIp(), whitelistIpOnSaspay(), SasPay Integration Skill, SasPay Server IP Whitelisting, Success-Only Payment Delivery, Webhook Signature Validation

### Community 14 - "Vercel Deployment"
Cohesion: 0.29
Nodes (6): buildCommand, framework, outputDirectory, rewrites, $schema, version

### Community 15 - "Deployment Guide"
Cohesion: 0.40
Nodes (5): AeroCrash README, Render Deployment Guidance, Vercel Deployment Guidance, Render Deployment Blueprint, Vercel Deployment Configuration

### Community 16 - "Vite Build Pipeline"
Cohesion: 0.33
Nodes (4): @tailwindcss/vite, vite, @vitejs/plugin-react, start()

### Community 17 - "Relational Data Model"
Cohesion: 0.50
Nodes (4): Bets Table, Rounds Table, Transactions Table, Users Table

## Knowledge Gaps
- **60 isolated node(s):** `@google/genai`, `motion`, `@types/bcryptjs`, `@types/cors`, `@types/express` (+55 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 187 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `bcryptjs` connect `Package Metadata` to `API and Persistence`, `Netlify Function Adapters`?**
  _High betweenness centrality (0.201) - this node is a cross-community bridge._
- **What connects `@google/genai`, `motion`, `@types/bcryptjs` to the rest of the system?**
  _60 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Client Components` be split into smaller, more focused modules?**
  _Cohesion score 0.06416999789606564 - nodes in this community are weakly interconnected._
- **Why does `react` connect `Client Components` to `React Bootstrap`, `Package Metadata`?**
  _High betweenness centrality (0.187) - this node is a cross-community bridge._
- **Should `API and Persistence` be split into smaller, more focused modules?**
  _Cohesion score 0.05979843225083987 - nodes in this community are weakly interconnected._
- **Why does `lucide-react` connect `Client Components` to `Package Metadata`?**
  _High betweenness centrality (0.172) - this node is a cross-community bridge._
- **Should `Netlify Function Adapters` be split into smaller, more focused modules?**
  _Cohesion score 0.07025316455696203 - nodes in this community are weakly interconnected._