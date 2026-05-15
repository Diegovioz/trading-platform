'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { BurnEvent, BurnOutcome } from '@/types';

export function useBurnEvents(initialEvents: BurnEvent[]) {
  const [events, setEvents] = useState<BurnEvent[]>(initialEvents);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const addBurnEvent = useCallback(async (
    traderId: string,
    payload: { event_date: string; reason: string; outcome: BurnOutcome; notes: string | null }
  ) => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('burn_events')
      .insert({ trader_id: traderId, ...payload, created_by: user?.id })
      .select()
      .single();
    if (!error && data) setEvents(prev => [data, ...prev]);
    setSaving(false);
    return { error: error?.message };
  }, [supabase]);

  return { events, saving, addBurnEvent };
}
