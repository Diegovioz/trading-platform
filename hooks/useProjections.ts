'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { TraderProjection } from '@/types';

export function useProjections() {
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const upsertProjection = useCallback(async (
    data: Omit<TraderProjection, 'id' | 'created_at' | 'updated_at'>
  ) => {
    setSaving(true);
    const { data: result, error } = await supabase
      .from('trader_projections')
      .upsert({ ...data, updated_at: new Date().toISOString() }, { onConflict: 'trader_id' })
      .select()
      .single();
    setSaving(false);
    return { data: result as TraderProjection | null, error: error?.message };
  }, [supabase]);

  return { saving, upsertProjection };
}
