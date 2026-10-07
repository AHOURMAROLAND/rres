-- ==============================================================================
-- AEROCRASH - SCHÉMA DE BASE DE DONNÉES (PostgreSQL)
-- Exécutez ce script dans l'éditeur SQL de votre fournisseur PostgreSQL.
-- ==============================================================================

-- 1. EXTENSIONS RECOMMANDÉES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. TABLE DES UTILISATEURS (Joueurs & Soldes)
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY DEFAULT ('usr_' || substr(md5(random()::text), 1, 10)),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  country VARCHAR(10) DEFAULT 'CI',
  balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (balance >= 0),
  is_activated BOOLEAN NOT NULL DEFAULT false,
  role VARCHAR(20) NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'admin', 'moderator')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_created_at ON public.users(created_at DESC);

-- 3. TABLE DES TRANSACTIONS FINANCIÈRES (SasPay, Dépôts, Retraits)
CREATE TABLE IF NOT EXISTS public.transactions (
  id TEXT PRIMARY KEY DEFAULT ('tx_' || substr(md5(random()::text), 1, 12)),
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('deposit', 'withdraw', 'activation', 'bonus')),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(5) NOT NULL DEFAULT 'XOF',
  method VARCHAR(30) NOT NULL DEFAULT 'wave', -- wave, orange_money, mtn, moov, card
  phone_number VARCHAR(30),
  reference VARCHAR(50) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'cancelled')),
  saspay_payment_id TEXT,
  saspay_payout_id TEXT,
  checkout_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_saspay_pay_id ON public.transactions(saspay_payment_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON public.transactions(created_at DESC);

-- 4. TABLE DES PARIS (Gameplay AeroCrash)
CREATE TABLE IF NOT EXISTS public.bets (
  id TEXT PRIMARY KEY DEFAULT ('bet_' || substr(md5(random()::text), 1, 12)),
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  round_id VARCHAR(50) NOT NULL,
  game_mode VARCHAR(10) NOT NULL CHECK (game_mode IN ('real', 'demo')),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  crash_multiplier NUMERIC(8, 2) NOT NULL,
  cashout_multiplier NUMERIC(8, 2),
  gross_profit NUMERIC(14, 2) DEFAULT 0.00,
  fee NUMERIC(14, 2) DEFAULT 0.00, -- Commission plateforme 2.5%
  net_profit NUMERIC(14, 2) DEFAULT 0.00,
  won BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bets_user_id ON public.bets(user_id);
CREATE INDEX IF NOT EXISTS idx_bets_round_id ON public.bets(round_id);
CREATE INDEX IF NOT EXISTS idx_bets_created_at ON public.bets(created_at DESC);

-- 5. TABLE DES TOURS DE JEU (Provably Fair)
CREATE TABLE IF NOT EXISTS public.rounds (
  round_id VARCHAR(50) PRIMARY KEY,
  crash_multiplier NUMERIC(8, 2) NOT NULL,
  server_seed TEXT NOT NULL,
  server_seed_hash TEXT NOT NULL,
  client_seed TEXT NOT NULL,
  nonce BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rounds_created_at ON public.rounds(created_at DESC);

-- 6. DONNÉES DE DÉPART POUR L'HISTORIQUE DU RUBAN (R-9988 à R-9995)
INSERT INTO public.rounds (round_id, crash_multiplier, server_seed, server_seed_hash, client_seed, nonce)
VALUES
  ('R-9988', 3.12, 'seed_9988', '4f3a6b8', 'client_base', 9988),
  ('R-9989', 1.02, 'seed_9989', '6d9e5f9', 'client_base', 9989),
  ('R-9990', 2.10, 'seed_9990', '8e2a9c0', 'client_base', 9990),
  ('R-9991', 1.48, 'seed_9991', '1c4f3d1', 'client_base', 9991),
  ('R-9992', 21.80, 'seed_9992', '3a8e7b2', 'client_base', 9992),
  ('R-9993', 1.35, 'seed_9993', '5b2d1e3', 'client_base', 9993),
  ('R-9994', 4.20, 'seed_9994', '7e9a4f4', 'client_base', 9994),
  ('R-9995', 1.95, 'seed_9995', '9f1c8a5', 'client_base', 9995)
ON CONFLICT (round_id) DO NOTHING;
