'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { UserStrategy, TradeEvaluation, WeeklyRecap } from '@/types';

export function useCoach() {
  const [strategy,    setStrategy]    = useState<UserStrategy | null>(null);
  const [evaluations, setEvaluations] = useState<TradeEvaluation[]>([]);
  const [recaps,      setRecaps]      = useState<WeeklyRecap[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [recapping,   setRecapping]   = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const [{ data: strat }, { data: evals }, { data: recapData }] = await Promise.all([
      supabase.from('user_strategies').select('*').eq('user_id', user.id).single(),
      supabase.from('trade_evaluations').select('*').eq('user_id', user.id),
      supabase.from('weekly_recaps').select('*').eq('user_id', user.id).order('week_start', { ascending: false }).limit(4),
    ]);

    setStrategy(strat ?? null);
    setEvaluations(evals ?? []);
    setRecaps(recapData ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  // ── Save strategy ─────────────────────────────────────────────────────────
  const saveStrategy = useCallback(async (text: string) => {
    setSaving(true);
    setError(null);
    const res  = await fetch('/api/strategy/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategy_text: text }),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error); setSaving(false); return { error: json.error as string }; }
    setStrategy(json.data);
    setSaving(false);
    return { data: json.data };
  }, []);

  // ── Evaluate a trade ──────────────────────────────────────────────────────
  const evaluateTrade = useCallback(async (tradeId: string) => {
    const res  = await fetch('/api/evaluate-trade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trade_id: tradeId }),
    });
    const json = await res.json();
    if (!res.ok) return { error: json.error as string };
    const evaluation = json.data as TradeEvaluation;
    setEvaluations(prev => [...prev.filter(e => e.trade_id !== evaluation.trade_id), evaluation]);
    return { data: evaluation };
  }, []);

  // ── Generate weekly recap ─────────────────────────────────────────────────
  const generateRecap = useCallback(async () => {
    setRecapping(true);
    setError(null);
    const res  = await fetch('/api/weekly-recap', { method: 'POST' });
    const json = await res.json();
    setRecapping(false);
    if (!res.ok) { setError(json.error); return { error: json.error as string }; }
    const recap = json.data as WeeklyRecap;
    setRecaps(prev => {
      const without = prev.filter(r => r.week_start !== recap.week_start);
      return [recap, ...without];
    });
    return { data: recap, cached: json.cached as boolean };
  }, []);

  const evaluationMap = Object.fromEntries(evaluations.map(e => [e.trade_id, e]));

  return {
    strategy, evaluations, evaluationMap, recaps,
    loading, saving, recapping, error,
    saveStrategy, evaluateTrade, generateRecap, reload: load,
  };
}
