CREATE TABLE IF NOT EXISTS user_usage_limits (
  user_id               uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_trade_evaluation_at timestamptz,
  last_weekly_recap_at     timestamptz
);

ALTER TABLE user_usage_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own limits"
  ON user_usage_limits FOR ALL
  USING (auth.uid() = user_id);
