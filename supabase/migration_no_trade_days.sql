-- No-trade days: days where the user consciously decided not to trade
CREATE TABLE IF NOT EXISTS no_trade_days (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date       date NOT NULL,
  reason     text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, date)
);

ALTER TABLE no_trade_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own no-trade days"
  ON no_trade_days FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Required from May 30 2026: explicit grants for Data API access
GRANT SELECT, INSERT, UPDATE, DELETE ON public.no_trade_days TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.no_trade_days TO service_role;
