-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: AI Trading Coach
-- Run in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. User strategies ───────────────────────────────────────────────────────
create table if not exists public.user_strategies (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  strategy_text text not null,
  rules         jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id)   -- one strategy per user
);

alter table public.user_strategies enable row level security;

create policy "Users manage own strategy"
  on public.user_strategies for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─── 2. Trade evaluations ─────────────────────────────────────────────────────
create table if not exists public.trade_evaluations (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  trade_id   uuid not null references public.journal_trades(id) on delete cascade,
  score      integer not null check (score between 1 and 10),
  feedback   text not null,
  created_at timestamptz not null default now(),
  unique (trade_id)   -- one evaluation per trade
);

alter table public.trade_evaluations enable row level security;

create policy "Users manage own evaluations"
  on public.trade_evaluations for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─── 3. Indexes ───────────────────────────────────────────────────────────────
create index if not exists idx_user_strategies_user    on public.user_strategies(user_id);
create index if not exists idx_trade_evaluations_user  on public.trade_evaluations(user_id);
create index if not exists idx_trade_evaluations_trade on public.trade_evaluations(trade_id);
