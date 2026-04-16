'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { JournalTrade } from '@/types';

interface UseTradesOptions {
  isAdmin?: boolean;
}

export function useTrades({ isAdmin = false }: UseTradesOptions = {}) {
  const [trades, setTrades]   = useState<JournalTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const supabase = createClient();

  const fetchTrades = useCallback(async () => {
    setLoading(true);
    setError(null);

    let query = supabase
      .from('journal_trades')
      .select('*, profile:profiles(full_name, email)')
      .order('trade_date', { ascending: false });

    // Admin sees all (RLS allows it); trader sees only their own (RLS enforces it)
    const { data, error } = await query;

    if (error) {
      setError(error.message);
    } else {
      setTrades(data ?? []);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchTrades(); }, [fetchTrades]);

  const addTrade = useCallback(async (trade: Omit<JournalTrade, 'id' | 'user_id' | 'created_at' | 'profile'>) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    const { data, error } = await supabase
      .from('journal_trades')
      .insert({ ...trade, user_id: user.id })
      .select()
      .single();

    if (!error && data) {
      setTrades(prev => [data, ...prev]);
    }

    return { data, error: error?.message };
  }, [supabase]);

  const deleteTrade = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('journal_trades')
      .delete()
      .eq('id', id);

    if (!error) {
      setTrades(prev => prev.filter(t => t.id !== id));
    }

    return { error: error?.message };
  }, [supabase]);

  return { trades, loading, error, addTrade, deleteTrade, refetch: fetchTrades };
}
