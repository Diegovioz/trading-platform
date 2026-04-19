'use client';

import { useState, useEffect } from 'react';
import { useCoach } from '@/hooks/useCoach';
import { formatDate } from '@/lib/utils';

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 8 ? 'bg-green-500/15 text-green-400' :
    score >= 5 ? 'bg-yellow-500/15 text-yellow-400' :
                 'bg-red-500/15 text-red-400';
  return (
    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${color}`}>
      {score}
    </span>
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
          Define your strategy, then evaluate trades from your journal.
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
            <span className="ml-2 text-xs text-muted-foreground font-normal">{evaluations.length} trades scored</span>
          )}
        </h2>

        {loading && <p className="text-muted-foreground text-sm">Loading…</p>}

        {!loading && sorted.length === 0 && (
          <div className="card text-sm text-muted-foreground">
            No evaluations yet. Go to the Trade Journal and click{' '}
            <span className="text-primary">Score</span> on any trade.
          </div>
        )}

        {sorted.map(ev => (
          <div key={ev.id} className="card flex items-start gap-4">
            <ScoreBadge score={ev.score} />
            <div className="flex-1 min-w-0">
              <p className="text-sm leading-relaxed">{ev.feedback}</p>
              <p className="text-xs text-muted-foreground mt-1">{formatDate(ev.created_at)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
