-- Replace trailing drawdown with static drawdown
-- Floor is fixed at initial_capital * 0.90 and never moves

CREATE OR REPLACE FUNCTION public.recalculate_account_drawdown(p_account_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_initial_capital numeric;
BEGIN
  SELECT initial_capital INTO v_initial_capital
  FROM public.accounts WHERE id = p_account_id;

  IF NOT FOUND THEN RETURN; END IF;

  -- Static: floor is always 10% below initial capital regardless of profits
  UPDATE public.accounts
  SET drawdown_floor = v_initial_capital * 0.90
  WHERE id = p_account_id;
END;
$$;

-- Apply to all existing accounts
DO $$
DECLARE rec RECORD;
BEGIN
  FOR rec IN SELECT id FROM public.accounts LOOP
    PERFORM public.recalculate_account_drawdown(rec.id);
  END LOOP;
END;
$$;
