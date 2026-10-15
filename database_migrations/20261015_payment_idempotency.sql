-- Run once against the existing PostgreSQL database before deploying the payment changes.
-- The migration is additive and preserves existing users and transactions.
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS request_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS credited_amount NUMERIC(14, 2);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_user_type_idempotency
  ON public.transactions(user_id, type, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_saspay_payment_id_unique
  ON public.transactions(saspay_payment_id)
  WHERE saspay_payment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_saspay_payout_id_unique
  ON public.transactions(saspay_payout_id)
  WHERE saspay_payout_id IS NOT NULL;
