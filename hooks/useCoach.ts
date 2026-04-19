'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { UserStrategy, TradeEvaluation } from '@/types';

export function useCoach() {
  const [strategy, setStrategy]         = useState<UserStrategy | null>(null);
  const [evaluations, setEvaluations]   = useState<TradeEvaluation[]>([]);
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState<string | null>(null);

  const supabase = createClient();

  // ── Load strategy and all evaluations ────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const [{ data: strat }, { data: evals }] = await Promise.all([
      supabase.from('user_strategies').select('*').eq('user_id', user.id).single(),
      supabase.from('trade_evaluations').select('*').eq('user_id', user.id),
    ]);

    setStrategy(strat ?? null);
    setEvaluations(evals ?? []);
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
    if (!res.ok) { setError(json.error); setSaving(false); return { error: json.error }; }
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
    setEvaluations(prev => {
      const without = prev.filter(e => e.trade_id !== evaluation.trade_id);
      return [...without, evaluation];
    });
    return { data: evaluation };
  }, []);

  // Map for quick lookup: trade_id → evaluation
  const evaluationMap = Object.fromEntries(evaluations.map(e => [e.trade_id, e]));

  return { strategy, evaluations, evaluationMap, loading, saving, error, saveStrategy, evaluateTrade, reload: load };
}
