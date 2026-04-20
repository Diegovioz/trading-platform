'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Account } from '@/types';

function enrichAccount(
  raw: Record<string, unknown>,
  totalPnl: number,
  totalTrades: number,
  ddType: 'static' | 'trailing',
  ddPercent: number,
): Account {
  const initial  = Number(raw.initial_capital) || 0;
  const balance  = initial + totalPnl;
  const factor   = ddPercent / 100;

  let ddFloor: number;
  let maxDD: number;
  let drawdownUsedPct: number;
  let highestEquity: number;

  if (ddType === 'trailing') {
    highestEquity = Number(raw.highest_equity) || initial; // maintained by DB trigger
    ddFloor       = highestEquity * (1 - factor);
    maxDD         = highestEquity * factor;
    const lossFromPeak = highestEquity - balance;
    drawdownUsedPct = maxDD > 0 ? Math.min(100, Math.max(0, (lossFromPeak / maxDD) * 100)) : 0;
  } else {
    highestEquity   = initial;
    ddFloor         = initial * (1 - factor);
    maxDD           = initial * factor;
    const lossFromInitial = initial - balance;
    drawdownUsedPct = maxDD > 0 ? Math.min(100, Math.max(0, (lossFromInitial / maxDD) * 100)) : 0;
  }

  return {
    id:               String(raw.id),
    user_id:          String(raw.user_id),
    name:             String(raw.name),
    initial_capital:  initial,
    highest_equity:   highestEquity,
    drawdown_floor:   ddFloor,
    created_at:       String(raw.created_at),
    drawdown_type:    ddType,
    drawdown_percent: ddPercent,
    total_pnl:        totalPnl,
    total_trades:     totalTrades,
    current_balance:  balance,
    is_failed:        balance <= ddFloor,
    remaining_risk:   balance - ddFloor,
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

    const [{ data: accs }, { data: trades }, { data: profile }] = await Promise.all([
      supabase.from('accounts').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
      supabase.from('journal_trades').select('account_id, pnl').eq('user_id', user.id),
      supabase.from('profiles').select('drawdown_type, drawdown_percent').eq('id', user.id).single(),
    ]);

    const ddType    = (profile?.drawdown_type    ?? 'static')  as 'static' | 'trailing';
    const ddPercent = Number(profile?.drawdown_percent ?? 10);

    const enriched: Account[] = (accs ?? []).map(a => {
      const acTrades = (trades ?? []).filter(t => t.account_id === a.id);
      const totalPnl = acTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
      return enrichAccount(a as Record<string, unknown>, totalPnl, acTrades.length, ddType, ddPercent);
    });

    setAccounts(enriched);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const createAccount = useCallback(async (name: string, initial_capital: number) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('accounts').insert({ user_id: user.id, name, initial_capital });
    fetchAccounts();
  }, [supabase, fetchAccounts]);

  const renameAccount = useCallback(async (id: string, name: string) => {
    await supabase.from('accounts').update({ name }).eq('id', id);
    fetchAccounts();
  }, [supabase, fetchAccounts]);

  const deleteAccount = useCallback(async (id: string) => {
    await supabase.from('accounts').delete().eq('id', id);
    fetchAccounts();
  }, [supabase, fetchAccounts]);

  return { accounts, loading, createAccount, renameAccount, deleteAccount, refetch: fetchAccounts };
}
