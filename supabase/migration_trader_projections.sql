-- ─── trader_projections ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trader_projections (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_type   int         NOT NULL DEFAULT 2,
  capital_usd    numeric     NOT NULL DEFAULT 0,
  split_trader   int         NOT NULL DEFAULT 70,
  split_vm       int         NOT NULL DEFAULT 30,
  months_history int         NOT NULL DEFAULT 0,
  adj_high       int         NOT NULL DEFAULT 0,
  adj_neg        int         NOT NULL DEFAULT 0,
  adj_freq       int         NOT NULL DEFAULT 0,
  adj_cons       int         NOT NULL DEFAULT 0,
  status         text        NOT NULL DEFAULT 'Revisión normal',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trader_id)
);

ALTER TABLE trader_projections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage trader_projections"
  ON trader_projections FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trader_projections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trader_projections TO service_role;

-- ─── trader_observations ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trader_observations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id  uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type       text        NOT NULL CHECK (type IN ('positive', 'neutral', 'negative')),
  content    text        NOT NULL,
  created_by uuid        REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE trader_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage trader_observations"
  ON trader_observations FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trader_observations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trader_observations TO service_role;

-- ─── burn_events ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS burn_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id  uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  event_date timestamptz NOT NULL DEFAULT now(),
  reason     text        NOT NULL,
  outcome    text        NOT NULL CHECK (outcome IN ('Reinstaurar', 'Degradar', 'Salida')),
  notes      text,
  created_by uuid        REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE burn_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage burn_events"
  ON burn_events FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.burn_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.burn_events TO service_role;
