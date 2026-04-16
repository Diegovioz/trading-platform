-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Trailing drawdown system
-- Run in Supabase SQL Editor AFTER migration_accounts.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Add drawdown columns to accounts ─────────────────────────────────────
alter table public.accounts
  add column if not exists highest_equity  numeric,
  add column if not exists drawdown_floor  numeric;

-- Initialize existing accounts (highest_equity = initial_capital if null)
update public.accounts
set
  highest_equity = initial_capital,
  drawdown_floor = initial_capital * 0.90
where highest_equity is null;

-- ─── 2. Core recalculation function ──────────────────────────────────────────
-- Iterates all trades for an account in chronological order,
-- tracks peak equity, and persists highest_equity + drawdown_floor.
create or replace function public.recalculate_account_drawdown(p_account_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_initial_capital numeric;
  v_current_equity  numeric;
  v_highest_equity  numeric;
  rec               record;
begin
  select initial_capital
  into   v_initial_capital
  from   public.accounts
  where  id = p_account_id;

  if not found then return; end if;

  v_current_equity := v_initial_capital;
  v_highest_equity := v_initial_capital;

  -- Walk trades in time order to find the true equity peak
  for rec in
    select pnl
    from   public.journal_trades
    where  account_id = p_account_id
    order  by trade_date asc, created_at asc
  loop
    v_current_equity := v_current_equity + rec.pnl;
    if v_current_equity > v_highest_equity then
      v_highest_equity := v_current_equity;
    end if;
  end loop;

  update public.accounts
  set
    highest_equity = v_highest_equity,
    drawdown_floor = v_highest_equity * 0.90
  where id = p_account_id;
end;
$$;

-- ─── 3. Trigger function ──────────────────────────────────────────────────────
create or replace function public.trigger_drawdown_update()
returns trigger
language plpgsql
as $$
declare
  v_account_id uuid;
begin
  -- Works for INSERT / UPDATE / DELETE
  v_account_id := coalesce(
    case when tg_op <> 'DELETE' then new.account_id else null end,
    old.account_id
  );

  if v_account_id is not null then
    perform public.recalculate_account_drawdown(v_account_id);
  end if;

  return null; -- AFTER trigger, return value ignored
end;
$$;

-- ─── 4. Attach trigger to journal_trades ─────────────────────────────────────
drop trigger if exists trg_drawdown_update on public.journal_trades;
create trigger trg_drawdown_update
  after insert or update or delete
  on   public.journal_trades
  for  each row
  execute function public.trigger_drawdown_update();

-- ─── 5. Also fire when account initial_capital changes ───────────────────────
create or replace function public.trigger_drawdown_on_account_change()
returns trigger
language plpgsql
as $$
begin
  perform public.recalculate_account_drawdown(new.id);
  return new;
end;
$$;

drop trigger if exists trg_account_capital_change on public.accounts;
create trigger trg_account_capital_change
  after insert or update of initial_capital
  on   public.accounts
  for  each row
  execute function public.trigger_drawdown_on_account_change();

-- ─── 6. Recalculate all existing accounts ────────────────────────────────────
do $$
declare rec record;
begin
  for rec in select id from public.accounts loop
    perform public.recalculate_account_drawdown(rec.id);
  end loop;
end;
$$;
