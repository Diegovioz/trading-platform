'use client';

import { useState } from 'react';
import type { BurnOutcome } from '@/types';
import { useBurnEvents } from '@/hooks/useBurnEvents';
import type { BurnEvent } from '@/types';

const OUTCOME_CONFIG: Record<BurnOutcome, { color: string }> = {
  Reinstaurar: { color: 'text-green-400'  },
  Degradar:    { color: 'text-yellow-400' },
  Salida:      { color: 'text-red-400'    },
};

interface Props {
  traderId: string;
  initialEvents: BurnEvent[];
}

export default function BurnEventPanel({ traderId, initialEvents }: Props) {
  const { events, saving, addBurnEvent } = useBurnEvents(initialEvents);
  const [open,    setOpen]    = useState(false);
  const [date,    setDate]    = useState(new Date().toISOString().split('T')[0]);
  const [reason,  setReason]  = useState('');
  const [outcome, setOutcome] = useState<BurnOutcome>('Reinstaurar');
  const [notes,   setNotes]   = useState('');
  const [error,   setError]   = useState('');

  async function handleSave() {
    if (!reason.trim()) { setError('El motivo es obligatorio.'); return; }
    setError('');
    const { error: err } = await addBurnEvent(traderId, {
      event_date: new Date(date).toISOString(),
      reason: reason.trim(),
      outcome,
      notes: notes.trim() || null,
    });
    if (err) { setError(err); return; }
    setOpen(false);
    setReason('');
    setNotes('');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Burn events</p>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="text-xs text-primary hover:underline"
        >
          {open ? 'Cancelar' : '+ Registrar evento'}
        </button>
      </div>

      {open && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 space-y-3">
          <p className="text-xs font-medium text-red-400">Registrar burn / evento crítico</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-xs">Fecha</label>
              <input type="date" className="input text-sm" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <label className="label text-xs">Resultado</label>
              <select className="input text-sm" value={outcome} onChange={e => setOutcome(e.target.value as BurnOutcome)}>
                {(['Reinstaurar', 'Degradar', 'Salida'] as BurnOutcome[]).map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label text-xs">Motivo</label>
            <input type="text" className="input text-sm" placeholder="Razón del evento…" value={reason} onChange={e => setReason(e.target.value)} />
          </div>

          <div>
            <label className="label text-xs">Notas <span className="text-muted-foreground">(opcional)</span></label>
            <textarea className="input resize-none text-sm" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          {error && <p className="text-destructive text-xs">{error}</p>}

          <button type="button" onClick={handleSave} disabled={saving} className="btn-primary text-sm w-full">
            {saving ? 'Guardando…' : 'Guardar evento'}
          </button>
        </div>
      )}

      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">Sin burn events registrados.</p>
      ) : (
        <div className="space-y-2">
          {events.map(ev => (
            <div key={ev.id} className="rounded-lg border border-border bg-muted/10 px-3 py-2.5 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {new Date(ev.event_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
                <span className={`text-xs font-semibold ${OUTCOME_CONFIG[ev.outcome as BurnOutcome]?.color ?? ''}`}>
                  {ev.outcome}
                </span>
              </div>
              <p className="text-sm">{ev.reason}</p>
              {ev.notes && <p className="text-xs text-muted-foreground">{ev.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
