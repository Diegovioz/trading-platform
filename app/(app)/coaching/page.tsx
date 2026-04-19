'use client';

import { useState, useEffect } from 'react';
import { useCoach } from '@/hooks/useCoach';
import { formatDate } from '@/lib/utils';
import type { TradeEvaluation } from '@/types';

interface EvalDetail {
  breakdown: { strategy_adherence?: number; risk_management?: number; execution?: number };
  mistakes:  string[];
  strengths: string[];
  feedback:  string;
}

function parseDetail(ev: TradeEvaluation): EvalDetail | null {
  try { return JSON.parse(ev.feedback); } catch { return null; }
}

function ScoreBadge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' }) {
  const color =
    score >= 8 ? 'bg-green-500/15 text-green-400' :
    score >= 5 ? 'bg-yellow-500/15 text-yellow-400' :
                 'bg-red-500/15 text-red-400';
  const dim = size === 'sm' ? 'w-8 h-8 text-sm' : 'w-12 h-12 text-xl';
  return (
    <span className={`inline-flex items-center justify-center rounded-full font-bold ${color} ${dim}`}>
      {score}
    </span>
  );
}

function SubScore({ label, value }: { label: string; value?: number }) {
  if (value == null) return null;
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}/10</span>
    </div>
  );
}

function EvalCard({ ev }: { ev: TradeEvaluation }) {
  const detail = parseDetail(ev);
  return (
    <div className="card space-y-3">
      <div className="flex items-start gap-4">
        <ScoreBadge score={ev.score} />
        <div className="flex-1 min-w-0">
          {detail ? (
            <>
              <p className="text-sm leading-relaxed">{detail.feedback}</p>
              <p className="text-xs text-muted-foreground mt-1">{formatDate(ev.created_at)}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{ev.feedback}</p>
          )}
        </div>
      </div>

      {detail && (
        <div className="grid grid-cols-1 gap-3 pt-2 border-t border-border/50 sm:grid-cols-3">
          {/* Breakdown */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Breakdown</p>
            <SubScore label="Strategy adherence" value={detail.breakdown.strategy_adherence} />
            <SubScore label="Risk management"    value={detail.breakdown.risk_management} />
            <SubScore label="Execution"          value={detail.breakdown.execution} />
          </div>

          {/* Mistakes */}
          {detail.mistakes.length > 0 && (
            <div>
              <p className="text-xs font-medium text-red-400 uppercase tracking-wide mb-1">Mistakes</p>
              <ul className="space-y-0.5">
                {detail.mistakes.map((m, i) => (
                  <li key={i} className="text-xs text-muted-foreground">• {m}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Strengths */}
          {detail.strengths.length > 0 && (
            <div>
              <p className="text-xs font-medium text-green-400 uppercase tracking-wide mb-1">Strengths</p>
              <ul className="space-y-0.5">
                {detail.strengths.map((s, i) => (
                  <li key={i} className="text-xs text-muted-foreground">• {s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CoachingPage() {
  const { strategy, evaluations, loading, saving, error, saveStrategy } = useCoach();
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (strategy?.strategy_text) setText(strategy.strategy_text);
  }, [strategy]);

  async function handleSave() {
    setSaved(false);
    const result = await saveStrategy(text);
    if (!result.error) setSaved(true);
  }

  const sorted = [...evaluations].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="p-8 space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">AI Trading Coach</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Define your strategy, then score trades from your journal.
        </p>
      </div>

      {/* Strategy editor */}
      <div className="card space-y-4">
        <h2 className="text-base font-semibold">My Trading Strategy</h2>
        <textarea
          className="input w-full min-h-[160px] resize-y text-sm font-mono"
          placeholder="Describe your strategy, entry rules, risk management, setups you look for…"
          value={text}
          onChange={e => { setText(e.target.value); setSaved(false); }}
          disabled={loading}
        />
        {error && <p className="text-destructive text-sm">{error}</p>}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || !text.trim()}
            className="btn-primary text-sm"
          >
            {saving ? 'Saving…' : 'Save Strategy'}
          </button>
          {saved && <span className="text-green-400 text-sm">Saved ✓</span>}
          {strategy?.updated_at && !saved && (
            <span className="text-muted-foreground text-xs">
              Last saved {formatDate(strategy.updated_at)}
            </span>
          )}
        </div>
      </div>

      {/* Evaluation history */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold">
          Evaluation History
          {evaluations.length > 0 && (
            <span className="ml-2 text-xs text-muted-foreground font-normal">
              {evaluations.length} trade{evaluations.length !== 1 ? 's' : ''} scored
            </span>
          )}
        </h2>

        {loading && <p className="text-muted-foreground text-sm">Loading…</p>}

        {!loading && sorted.length === 0 && (
          <div className="card text-sm text-muted-foreground">
            No evaluations yet. Go to the Trade Journal and click{' '}
            <span className="text-primary">Score</span> on any trade.
          </div>
        )}

        {sorted.map(ev => <EvalCard key={ev.id} ev={ev} />)}
      </div>
    </div>
  );
}
