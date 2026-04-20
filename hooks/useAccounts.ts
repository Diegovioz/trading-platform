'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Account } from '@/types';

function enrichAccount(raw: Record<string, unknown>, totalPnl: number, totalTrades: number): Account {
  const initial   = Number(raw.initial_capital) || 0;
  const ddFloor   = initial * 0.90;          // static — never trails profits
  const maxDD     = initial * 0.10;
  const balance   = initial + totalPnl;
  const lossFromInitial   = initial - balance;
  const drawdownUsedPct   = maxDD > 0
    ? Math.min(100, Math.max(0, (lossFromInitial / maxDD) * 100))
    : 0;

  return {
    id:              String(raw.id),
    user_id:         String(raw.user_id),
    name:            String(raw.name),
    initial_capital: initial,
    highest_equity:  initial,                // not used in static mode
    drawdown_floor:  ddFloor,
    created_at:      String(raw.created_at),
    total_pnl:       totalPnl,
    total_trades:    totalTrades,
    current_balance: balance,
    is_failed:       balance <= ddFloor,
    remaining_risk:  balance - ddFloor,
    drawdown_used_pct: drawdownUsedPct,
  };
}

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading]   = useState(true);

  const supabase = createClient();

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const [{ data: accs }, { data: trades }] = await Promise.all([
      supabase.from('accounts').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
      supabase.from('journal_trades').select('account_id, pnl').eq('user_id', user.id),
    ]);

    const enriched: Account[] = (accs ?? []).map(a => {
      const acTrades   = (trades ?? []).filter(t => t.account_id === a.id);
      const totalPnl   = acTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
      return enrichAccount(a as Record<string, unknown>, totalPnl, acTrades.length);
    });

    setAccounts(enriched);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const createAccount = useCallback(async (name: string, initial_capital: number) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('accounts').insert({
      user_id: user.id,
      name,
      initial_capital,
      drawdown_floor: initial_capital * 0.9,
    });
    fetchAccounts();
  }, [fetchAccounts]);

  const renameAccount = useCallback(async (id: string, name: string) => {
    await supabase.from('accounts').update({ name }).eq('id', id);
    fetchAccounts();
  }, [fetchAccounts]);

  const deleteAccount = useCallback(async (id: string) => {
    await supabase.from('accounts').delete().eq('id', id);
    fetchAccounts();
  }, [fetchAccounts]);

  return { accounts, loading, createAccount, renameAccount, deleteAccount, refetch: fetchAccounts };
}
