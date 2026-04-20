ALTER TABLE public.journal_trades
  ADD COLUMN IF NOT EXISTS image_expires_at timestamptz;
