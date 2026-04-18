-- ─────────────────────────────────────────────────────────────────────────────
-- Trading Platform — Supabase Schema
-- Run this in your Supabase project: Dashboard → SQL Editor → New query
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Extensions ───────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── Profiles ─────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  role        text not null default 'trader' check (role in ('admin', 'trader')),
  created_at  timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    'trader'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── Helper: is_admin() ───────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ─── Journal trades ───────────────────────────────────────────────────────────
create table if not exists public.journal_trades (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  asset        text not null,
  direction    text not null check (direction in ('long', 'short')),
  entry_price  numeric not null,
  exit_price   numeric not null,
  stop_loss    numeric,
  take_profit  numeric,
  size         numeric not null default 1,
  pnl          numeric not null,
  notes        text,
  tags         text[],
  trade_date   date not null default current_date,
  created_at   timestamptz not null default now()
);


-- ─── Row Level Security ───────────────────────────────────────────────────────

-- Profiles
alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id or is_admin());

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Journal trades
alter table public.journal_trades enable row level security;

create policy "Users can view own journal trades"
  on public.journal_trades for select
  using (user_id = auth.uid() or is_admin());

create policy "Users can insert own journal trades"
  on public.journal_trades for insert
  with check (user_id = auth.uid());

create policy "Users can delete own journal trades"
  on public.journal_trades for delete
  using (user_id = auth.uid());

create policy "Admins can delete any journal trade"
  on public.journal_trades for delete
  using (is_admin());


-- ─── Indexes ──────────────────────────────────────────────────────────────────
create index if not exists idx_journal_trades_user_id   on public.journal_trades(user_id);
create index if not exists idx_journal_trades_date      on public.journal_trades(trade_date desc);

-- ─── Grant first admin ────────────────────────────────────────────────────────
-- After signing up with your admin email, run this once:
-- UPDATE public.profiles SET role = 'admin' WHERE email = 'your@email.com';
