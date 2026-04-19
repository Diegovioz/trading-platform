'use client';

import { useState, useEffect } from 'react';
import { useCoach } from '@/hooks/useCoach';
import { formatDate, formatCurrency } from '@/lib/utils';
import type { TradeEvaluation, WeeklyRecap } from '@/types';
import type { RecapResult } from '@/lib/ai/coach';

// ─── Shared helpers ───────────────────────────────────────────────────────────
function ScoreBadge({ score, size = 'sm' }: { score: number; size?: 'sm' | 'lg' }) {
  const color = score >= 8 ? 'bg-green-500/15 text-green-400'
              : score >= 5 ? 'bg-yellow-500/15 text-yellow-400'
                           : 'bg-red-500/15 text-red-400';
  const dim = size === 'lg' ? 'w-14 h-14 text-2xl' : 'w-10 h-10 text-base';
  return (
    <span className={`inline-flex items-center justify-center rounded-full font-bold ${color} ${dim}`}>
      {score}
    </span>
  );
}

// ─── Trade evaluation card ────────────────────────────────────────────────────
interface EvalDetail {
  breakdown: { strategy_adherence?: number; risk_management?: number; execution?: number };
  mistakes: string[]; strengths: string[]; feedback: string;
}
function parseEval(ev: TradeEvaluation): EvalDetail | null {
  try { return JSON.parse(ev.feedback); } catch { return null; }
}

function EvalCard({ ev }: { ev: TradeEvaluation }) {
  const d = parseEval(ev);
  return (
    <div className="card space-y-3">
      <div className="flex items-start gap-4">
        <ScoreBadge score={ev.score} />
        <div className="flex-1">
          <p className="text-sm leading-relaxed">{d?.feedback ?? ev.feedback}</p>
          <p className="text-xs text-muted-foreground mt-1">{formatDate(ev.created_at)}</p>
        </div>
      </div>
      {d && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-border/50">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Breakdown</p>
            {[['Strategy', d.breakdown.strategy_adherence], ['Risk mgmt', d.breakdown.risk_management], ['Execution', d.breakdown.execution]].map(([label, val]) =>
              val != null ? (
                <div key={String(label)} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium">{val}/10</span>
                </div>
              ) : null
            )}
          </div>
          {d.mistakes.length > 0 && (
            <div>
              <p className="text-xs font-medium text-red-400 uppercase tracking-wide mb-1">Mistakes</p>
              {d.mistakes.map((m, i) => <p key={i} className="text-xs text-muted-foreground">• {m}</p>)}
            </div>
          )}
          {d.strengths.length > 0 && (
            <div>
              <p className="text-xs font-medium text-green-400 uppercase tracking-wide mb-1">Strengths</p>
              {d.strengths.map((s, i) => <p key={i} className="text-xs text-muted-foreground">• {s}</p>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Weekly recap card ────────────────────────────────────────────────────────
function parseRecap(r: WeeklyRecap): RecapResult | null {
  try { return JSON.parse(r.summary); } catch { return null; }
}

function RecapCard({ recap }: { recap: WeeklyRecap }) {
  const d = parseRecap(recap);
  if (!d) return null;
  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Week of {formatDate(recap.week_start)}</p>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm font-medium">{d.total_trades} trades</span>
            <span className="text-sm text-muted-foreground">{d.win_rate}% win rate</span>
            <span className={`text-sm font-medium ${d.total_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {d.total_pnl >= 0 ? '+' : ''}{formatCurrency(d.total_pnl)}
            </span>
          </div>
        </div>
        <ScoreBadge score={d.overall_score} size="lg" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/50">
        {d.highlights.length > 0 && (
          <div>
            <p className="text-xs font-medium text-green-400 uppercase tracking-wide mb-1">Highlights</p>
            {d.highlights.map((h, i) => <p key={i} className="text-xs text-muted-foreground">• {h}</p>)}
          </div>
        )}
        {d.areas_to_improve.length > 0 && (
          <div>
            <p className="text-xs font-medium text-red-400 uppercase tracking-wide mb-1">Improve</p>
            {d.areas_to_improve.map((a, i) => <p key={i} className="text-xs text-muted-foreground">• {a}</p>)}
          </div>
        )}
      </div>

      {d.pattern && (
        <div className="pt-2 border-t border-border/50 space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pattern</p>
          <p className="text-xs">{d.pattern}</p>
        </div>
      )}
      {d.next_week_focus && (
        <div className="bg-primary/5 rounded-lg px-3 py-2">
          <p className="text-xs font-medium text-primary">Next week focus</p>
          <p className="text-xs mt-0.5">{d.next_week_focus}</p>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function CoachingPage() {
  const { strategy, evaluations, recaps, loading, saving, recapping, error, saveStrategy, generateRecap } = useCoach();
  const [text, setText]   = useState('');
  const [saved, setSaved] = useState(false);
  const [recapMsg, setRecapMsg] = useState<string | null>(null);

  useEffect(() => {
    if (strategy?.strategy_text) setText(strategy.strategy_text);
  }, [strategy]);

  async function handleSave() {
    setSaved(false);
    const result = await saveStrategy(text);
    if (!result.error) setSaved(true);
  }

  async function handleRecap() {
    setRecapMsg(null);
    const result = await generateRecap();
    if (result.error) { setRecapMsg(result.error); return; }
    if (result.cached) setRecapMsg('Already generated this week — showing cached recap.');
  }

  const sortedEvals = [...evaluations].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="p-8 space-y-10 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">AI Trading Coach</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Define your strategy once. Score trades and get weekly recaps automatically.
        </p>
      </div>

      {/* Strategy editor */}
      <section className="card space-y-4">
        <h2 className="text-base font-semibold">My Trading Strategy</h2>
        <textarea
          className="input w-full min-h-[160px] resize-y text-sm font-mono"
          placeholder="Describe your strategy: entry rules, risk management, setups, filters…"
          value={text}
          onChange={e => { setText(e.target.value); setSaved(false); }}
          disabled={loading}
        />
        {error && <p className="text-destructive text-sm">{error}</p>}
        <div className="flex items-center gap-3">
          <button onClick={handleSave} disabled={saving || !text.trim()} className="btn-primary text-sm">
            {saving ? 'Saving…' : 'Save Strategy'}
          </button>
          {saved && <span className="text-green-400 text-sm">Saved ✓</span>}
          {strategy?.updated_at && !saved && (
            <span className="text-muted-foreground text-xs">Last saved {formatDate(strategy.updated_at)}</span>
          )}
        </div>
      </section>

      {/* Weekly recap */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Weekly Recap</h2>
          <button
            onClick={handleRecap}
            disabled={recapping || loading}
            className="btn-primary text-sm"
          >
            {recapping ? 'Generating…' : 'Generate Weekly Recap'}
          </button>
        </div>
        {recapMsg && <p className="text-xs text-muted-foreground">{recapMsg}</p>}
        {!loading && recaps.length === 0 && (
          <p className="text-sm text-muted-foreground">No recaps yet. Click the button above after trading for a week.</p>
        )}
        {recaps.map(r => <RecapCard key={r.id} recap={r} />)}
      </section>

      {/* Trade evaluation history */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">
          Trade Evaluations
          {evaluations.length > 0 && (
            <span className="ml-2 text-xs text-muted-foreground font-normal">
              {evaluations.length} scored — click <span className="text-primary">Score</span> in Journal
            </span>
          )}
        </h2>
        {loading && <p className="text-muted-foreground text-sm">Loading…</p>}
        {!loading && sortedEvals.length === 0 && (
          <p className="text-sm text-muted-foreground card">
            No evaluations yet. Go to the Trade Journal and click Score on any trade.
          </p>
        )}
        {sortedEvals.map(ev => <EvalCard key={ev.id} ev={ev} />)}
      </section>
    </div>
  );
}
