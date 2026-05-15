'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { TraderObservation, ObservationType } from '@/types';

export function useObservations(initialObs: TraderObservation[]) {
  const [observations, setObservations] = useState<TraderObservation[]>(initialObs);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const addObservation = useCallback(async (traderId: string, type: ObservationType, content: string) => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('trader_observations')
      .insert({ trader_id: traderId, type, content, created_by: user?.id })
      .select()
      .single();
    if (!error && data) setObservations(prev => [data, ...prev]);
    setSaving(false);
    return { error: error?.message };
  }, [supabase]);

  const deleteObservation = useCallback(async (id: string) => {
    const { error } = await supabase.from('trader_observations').delete().eq('id', id);
    if (!error) setObservations(prev => prev.filter(o => o.id !== id));
    return { error: error?.message };
  }, [supabase]);

  return { observations, saving, addObservation, deleteObservation };
}
