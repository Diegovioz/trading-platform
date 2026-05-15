'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { TraderProjection, TraderObservation, BurnEvent, ProjectionStatus } from '@/types';
import { BASE_PROFILES, computeAllScenarios } from '@/lib/projections';
import { useProjections } from '@/hooks/useProjections';
import ScenarioDisplay from './ScenarioDisplay';
import ConfidenceBar from './ConfidenceBar';
import ObservationPanel from './ObservationPanel';
import BurnEventPanel from './BurnEventPanel';

const STATUSES: ProjectionStatus[] = [
  'Revisión normal',
  'Candidato a escalar',
  'Bajo observación',
  'En proceso de salida',
];

const STATUS_COLOR: Record<ProjectionStatus, string> = {
  'Revisión normal':       'bg-muted/50 text-muted-foreground border-border',
  'Candidato a escalar':   'bg-green-500/10 text-green-400 border-green-500/20',
  'Bajo observación':      'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  'En proceso de salida':  'bg-red-500/10 text-red-400 border-red-500/20',
};

const SLIDER_LABELS: Record<string, { label: string; hint: string }> = {
  adj_high: { label: 'Tendencia meses buenos',   hint: 'Ajusta el rango de meses positivos' },
  adj_neg:  { label: 'Tendencia meses malos',    hint: '(-) más contenido · (+) más pérdida' },
  adj_freq: { label: 'Frecuencia meses negativos', hint: 'Meses extra negativos por escenario' },
  adj_cons: { label: 'Consistencia general',     hint: '(+) reduce varianza en todos los rangos' },
};

interface Props {
  trader: { id: string; full_name: string | null; email: string };
  initialProjection: TraderProjection | null;
  initialObservations: TraderObservation[];
  initialBurnEvents: BurnEvent[];
}

function defaultProj(traderId: string): Omit<TraderProjection, 'id' | 'created_at' | 'updated_at'> {
  return {
    trader_id: traderId,
    profile_type: 2,
    capital_usd: 0,
    split_trader: 70,
    split_vm: 30,
    months_history: 0,
    adj_high: 0,
    adj_neg: 0,
    adj_freq: 0,
    adj_cons: 0,
    status: 'Revisión normal',
  };
}

export default function ProjectionCard({ trader, initialProjection, initialObservations, initialBurnEvents }: Props) {
  const router = useRouter();
  const { saving, upsertProjection } = useProjections();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState<Omit<TraderProjection, 'id' | 'created_at' | 'updated_at'>>(
    initialProjection
      ? { trader_id: initialProjection.trader_id, profile_type: initialProjection.profile_type, capital_usd: initialProjection.capital_usd, split_trader: initialProjection.split_trader, split_vm: initialProjection.split_vm, months_history: initialProjection.months_history, adj_high: initialProjection.adj_high, adj_neg: initialProjection.adj_neg, adj_freq: initialProjection.adj_freq, adj_cons: initialProjection.adj_cons, status: initialProjection.status }
      : defaultProj(trader.id)
  );

  const set = <K extends keyof typeof form>(key: K, value: typeof form[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  // Recompute scenarios live as form changes
  const scenarios = useMemo(() => computeAllScenarios(form as TraderProjection), [form]);

  async function handleSave() {
    setError('');
    setSaved(false);
    const { error: err } = await upsertProjection(form);
    if (err) { setError(err); return; }
    setSaved(true);
    router.refresh();
  }

  const profile = BASE_PROFILES[form.profile_type];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">{trader.full_name ?? 'Sin nombre'}</h2>
          <p className="text-muted-foreground text-sm">{trader.email}</p>
        </div>
        <span className={`text-xs font-medium px-3 py-1 rounded-full border ${STATUS_COLOR[form.status]}`}>
          {form.status}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* ── LEFT: Configuration ─────────────────────────────────────────── */}
        <div className="space-y-7">

          {/* Profile selector */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Perfil base</p>
            <div className="grid grid-cols-2 gap-2">
              {BASE_PROFILES.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => set('profile_type', i)}
                  className={`text-left rounded-xl border px-3 py-2.5 transition-colors ${
                    form.profile_type === i
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-muted-foreground'
                  }`}
                >
                  <p className="text-xs font-semibold">{i} · {p.name}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Neg {p.neg[0]}% / {p.neg[1]}% · Bueno {p.good[0]}% / {p.good[1]}%
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Capital + split */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Capital y reparto</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="label text-xs">Capital asignado (USD)</label>
                <input
                  type="number"
                  step="1000"
                  min="0"
                  className="input text-sm"
                  value={form.capital_usd}
                  onChange={e => set('capital_usd', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className="label text-xs">Split V&amp;M %</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  className="input text-sm"
                  value={form.split_vm}
                  onChange={e => {
                    const vm = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                    set('split_vm', vm);
                    set('split_trader', 100 - vm);
                  }}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Trader {form.split_trader}% · V&amp;M {form.split_vm}%
            </p>
          </div>

          {/* Sliders */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ajustes individuales</p>
            <div className="space-y-4">
              {(['adj_high', 'adj_neg', 'adj_freq', 'adj_cons'] as const).map(key => {
                const { label, hint } = SLIDER_LABELS[key];
                const val = form[key] as number;
                return (
                  <div key={key} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium">{label}</span>
                        <span className="text-[11px] text-muted-foreground ml-2">{hint}</span>
                      </div>
                      <span className={`text-sm font-bold font-mono w-8 text-right ${
                        val > 0 ? 'text-green-400' : val < 0 ? 'text-red-400' : 'text-muted-foreground'
                      }`}>
                        {val > 0 ? `+${val}` : val}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-3}
                      max={3}
                      step={1}
                      value={val}
                      onChange={e => set(key, parseInt(e.target.value))}
                      className="w-full accent-primary"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>–3</span><span>0</span><span>+3</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Status */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Estado del trader</p>
            <div className="grid grid-cols-2 gap-2">
              {STATUSES.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => set('status', s)}
                  className={`text-xs font-medium px-3 py-2 rounded-lg border transition-colors text-left ${
                    form.status === s
                      ? STATUS_COLOR[s]
                      : 'border-border text-muted-foreground hover:border-muted-foreground'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Save */}
          <div className="space-y-2">
            <button type="button" onClick={handleSave} disabled={saving} className="btn-primary w-full">
              {saving ? 'Guardando…' : 'Guardar proyección'}
            </button>
            {saved && <p className="text-green-400 text-xs text-center">✓ Guardado correctamente</p>}
            {error && <p className="text-destructive text-xs">{error}</p>}
          </div>
        </div>

        {/* ── RIGHT: Projections + observations ───────────────────────────── */}
        <div className="space-y-7">
          <ScenarioDisplay scenarios={scenarios} />
          <ConfidenceBar />

          <div className="border-t border-border pt-7 space-y-7">
            <ObservationPanel traderId={trader.id} initialObs={initialObservations} />
            <BurnEventPanel   traderId={trader.id} initialEvents={initialBurnEvents} />
          </div>
        </div>
      </div>
    </div>
  );
}
