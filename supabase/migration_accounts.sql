-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Add accounts table + account_id to journal_trades
-- Run this in Supabase SQL Editor AFTER the main schema.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Accounts table ───────────────────────────────────────────────────────────
create table if not exists public.accounts (
  id               uuid primary key default uuid_generate_v4(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  name             text not null,
  initial_capital  numeric not null default 10000,
  created_at       timestamptz not null default now()
);

alter table public.accounts enable row level security;

create policy "Users can manage own accounts"
  on public.accounts for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists idx_accounts_user_id on public.accounts(user_id);

-- ─── Add account_id to journal_trades ─────────────────────────────────────────
alter table public.journal_trades
  add column if not exists account_id uuid references public.accounts(id) on delete set null;

create index if not exists idx_journal_trades_account_id on public.journal_trades(account_id);
