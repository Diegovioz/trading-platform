'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { NoTradeDay } from '@/types';

export function useNoTradeDays() {
  const [noTradeDays, setNoTradeDays] = useState<NoTradeDay[]>([]);
  const [loading, setLoading]         = useState(true);
  const supabase = createClient();

  const fetchNoTradeDays = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data } = await supabase
      .from('no_trade_days')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false });

    setNoTradeDays(data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchNoTradeDays(); }, [fetchNoTradeDays]);

  const addNoTradeDay = useCallback(async ({ date, reason }: { date: string; reason: string | null }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    const { data, error } = await supabase
      .from('no_trade_days')
      .upsert({ user_id: user.id, date, reason }, { onConflict: 'user_id,date' })
      .select()
      .single();

    if (!error && data) {
      setNoTradeDays(prev => {
        const filtered = prev.filter(d => d.date !== date);
        return [data, ...filtered].sort((a, b) => b.date.localeCompare(a.date));
      });
    }

    return { error: error?.message };
  }, [supabase]);

  const deleteNoTradeDay = useCallback(async (id: string) => {
    const { error } = await supabase.from('no_trade_days').delete().eq('id', id);
    if (!error) setNoTradeDays(prev => prev.filter(d => d.id !== id));
    return { error: error?.message };
  }, [supabase]);

  return { noTradeDays, loading, addNoTradeDay, deleteNoTradeDay };
}
