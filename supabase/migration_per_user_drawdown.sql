-- ─── 1. Add drawdown config to profiles ──────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS drawdown_type    text    DEFAULT 'static',
  ADD COLUMN IF NOT EXISTS drawdown_percent numeric DEFAULT 10;

-- ─── 2. Set specific user to 6% trailing ──────────────────────────────────────
UPDATE public.profiles
SET drawdown_type = 'trailing', drawdown_percent = 6
WHERE id = (SELECT id FROM auth.users WHERE email = 'fabio.majul05@gmail.com');

-- ─── 3. Replace drawdown function with per-user logic ─────────────────────────
CREATE OR REPLACE FUNCTION public.recalculate_account_drawdown(p_account_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_initial_capital numeric;
  v_user_id         uuid;
  v_dd_type         text;
  v_dd_percent      numeric;
  v_current_equity  numeric;
  v_highest_equity  numeric;
  rec               record;
BEGIN
  SELECT initial_capital, user_id
  INTO v_initial_capital, v_user_id
  FROM public.accounts WHERE id = p_account_id;

  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(drawdown_type, 'static'), COALESCE(drawdown_percent, 10)
  INTO v_dd_type, v_dd_percent
  FROM public.profiles WHERE id = v_user_id;

  v_dd_type    := COALESCE(v_dd_type, 'static');
  v_dd_percent := COALESCE(v_dd_percent, 10);

  IF v_dd_type = 'trailing' THEN
    v_current_equity := v_initial_capital;
    v_highest_equity := v_initial_capital;

    FOR rec IN
      SELECT pnl FROM public.journal_trades
      WHERE account_id = p_account_id
      ORDER BY trade_date ASC, created_at ASC
    LOOP
      v_current_equity := v_current_equity + rec.pnl;
      IF v_current_equity > v_highest_equity THEN
        v_highest_equity := v_current_equity;
      END IF;
    END LOOP;

    UPDATE public.accounts
    SET highest_equity = v_highest_equity,
        drawdown_floor = v_highest_equity * (1 - v_dd_percent / 100.0)
    WHERE id = p_account_id;
  ELSE
    UPDATE public.accounts
    SET drawdown_floor = v_initial_capital * (1 - v_dd_percent / 100.0)
    WHERE id = p_account_id;
  END IF;
END;
$$;

-- ─── 4. Re-run for all existing accounts ──────────────────────────────────────
DO $$
DECLARE rec RECORD;
BEGIN
  FOR rec IN SELECT id FROM public.accounts LOOP
    PERFORM public.recalculate_account_drawdown(rec.id);
  END LOOP;
END;
$$;
