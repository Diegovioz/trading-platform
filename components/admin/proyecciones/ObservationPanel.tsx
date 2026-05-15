'use client';

import { useState } from 'react';
import type { ObservationType } from '@/types';
import { useObservations } from '@/hooks/useObservations';
import type { TraderObservation } from '@/types';

const TYPE_CONFIG: Record<ObservationType, { label: string; color: string; dot: string }> = {
  positive: { label: 'Positiva', color: 'text-green-400',  dot: 'bg-green-400'  },
  neutral:  { label: 'Neutral',  color: 'text-yellow-400', dot: 'bg-yellow-400' },
  negative: { label: 'Negativa', color: 'text-red-400',    dot: 'bg-red-400'    },
};

interface Props {
  traderId: string;
  initialObs: TraderObservation[];
}

export default function ObservationPanel({ traderId, initialObs }: Props) {
  const { observations, saving, addObservation, deleteObservation } = useObservations(initialObs);
  const [type, setType]       = useState<ObservationType>('positive');
  const [content, setContent] = useState('');
  const [error, setError]     = useState('');

  async function handleAdd() {
    if (!content.trim()) return;
    setError('');
    const { error: err } = await addObservation(traderId, type, content.trim());
    if (err) { setError(err); return; }
    setContent('');
  }

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Observaciones internas</p>

      {/* Add form */}
      <div className="rounded-xl border border-border bg-muted/10 p-4 space-y-3">
        <div className="flex gap-2">
          {(['positive', 'neutral', 'negative'] as ObservationType[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                type === t
                  ? `${TYPE_CONFIG[t].color} border-current bg-current/10`
                  : 'border-border text-muted-foreground hover:border-foreground'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${TYPE_CONFIG[t].dot}`} />
              {TYPE_CONFIG[t].label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <textarea
            className="input resize-none flex-1 text-sm"
            rows={2}
            placeholder="Escribe una observación…"
            value={content}
            onChange={e => setContent(e.target.value)}
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={saving || !content.trim()}
            className="btn-primary self-end px-4 py-2 text-sm disabled:opacity-50"
          >
            {saving ? '…' : 'Añadir'}
          </button>
        </div>
        {error && <p className="text-destructive text-xs">{error}</p>}
      </div>

      {/* List */}
      {observations.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">Sin observaciones.</p>
      ) : (
        <div className="space-y-2">
          {observations.map(obs => {
            const cfg = TYPE_CONFIG[obs.type as ObservationType];
            return (
              <div key={obs.id} className="flex items-start gap-3 rounded-lg border border-border bg-muted/10 px-3 py-2.5">
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-relaxed">{obs.content}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {new Date(obs.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <button
                  onClick={() => deleteObservation(obs.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors shrink-0 mt-0.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
