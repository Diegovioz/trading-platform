ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS phase text DEFAULT 'phase1';
