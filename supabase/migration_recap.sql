-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Weekly Recap
-- Run in Supabase SQL Editor AFTER migration_coaching.sql
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.weekly_recaps (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,           -- Monday of the recap week
  summary    text not null,           -- JSON: RecapResult
  created_at timestamptz not null default now(),
  unique (user_id, week_start)        -- one recap per user per week
);

alter table public.weekly_recaps enable row level security;

create policy "Users manage own recaps"
  on public.weekly_recaps for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists idx_weekly_recaps_user on public.weekly_recaps(user_id, week_start desc);
