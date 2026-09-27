-- ==============================================================================
-- AEROCRASH - SCHEMA SUPABASE COMPLET
-- Exécutez ce script dans l'Éditeur SQL de votre tableau de bord Supabase
-- (Project Dashboard -> SQL Editor -> New query -> Run)
-- ==============================================================================

-- 1. TABLE DES PROFILS UTILISATEURS & SOLDES
CREATE TABLE IF NOT EXISTS public.profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Pilote AeroCrash',
  phone_or_email TEXT,
  is_activated BOOLEAN NOT NULL DEFAULT false,
  balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON public.profiles(phone_or_email);

-- 2. TABLE DES TRANSACTIONS (Dépôts, Retraits, Activations)
CREATE TABLE IF NOT EXISTS public.transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('activation', 'deposit', 'withdraw')),
  amount NUMERIC(12, 2) NOT NULL,
  method TEXT NOT NULL DEFAULT 'wave',
  phone_number TEXT,
  reference TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON public.transactions(created_at DESC);

-- 3. TABLE DES PARIS UTILISATEURS
CREATE TABLE IF NOT EXISTS public.bets (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
  round_id TEXT NOT NULL,
  game_mode TEXT NOT NULL CHECK (game_mode IN ('real', 'demo')),
  amount NUMERIC(12, 2) NOT NULL,
  crash_multiplier NUMERIC(6, 2) NOT NULL,
  cashout_multiplier NUMERIC(6, 2),
  gross_profit NUMERIC(12, 2) DEFAULT 0,
  fee NUMERIC(12, 2) DEFAULT 0,
  net_profit NUMERIC(12, 2) DEFAULT 0,
  won BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bets_user ON public.bets(user_id);
CREATE INDEX IF NOT EXISTS idx_bets_round ON public.bets(round_id);
CREATE INDEX IF NOT EXISTS idx_bets_created ON public.bets(created_at DESC);

-- 4. TABLE DE L'HISTORIQUE DES PARTIES (Provably Fair)
CREATE TABLE IF NOT EXISTS public.rounds (
  round_id TEXT PRIMARY KEY,
  crash_multiplier NUMERIC(6, 2) NOT NULL,
  server_seed TEXT NOT NULL,
  server_seed_hash TEXT NOT NULL,
  client_seed TEXT NOT NULL,
  nonce BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rounds_created ON public.rounds(created_at DESC);

-- 5. CONFIGURATION ROW LEVEL SECURITY (RLS)
-- Active RLS sur toutes les tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rounds ENABLE ROW LEVEL SECURITY;

-- Politiques ouvertes pour la clé anon (ou personnalisables selon auth)
DROP POLICY IF EXISTS "Allow anon read/write profiles" ON public.profiles;
CREATE POLICY "Allow anon read/write profiles" ON public.profiles
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon read/write transactions" ON public.transactions;
CREATE POLICY "Allow anon read/write transactions" ON public.transactions
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon read/write bets" ON public.bets;
CREATE POLICY "Allow anon read/write bets" ON public.bets
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon read/write rounds" ON public.rounds;
CREATE POLICY "Allow anon read/write rounds" ON public.rounds
  FOR ALL USING (true) WITH CHECK (true);

-- 6. DONNÉES INITIALES POUR LES DERNIÈRES PARTIES (Optionnel)
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
