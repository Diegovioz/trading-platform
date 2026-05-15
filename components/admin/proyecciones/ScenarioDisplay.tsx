'use client';

import type { AllScenarios } from '@/lib/projections';
import { formatCurrency } from '@/lib/utils';

interface Props {
  scenarios: AllScenarios;
}

const COLS = [
  { key: 'pessimistic', label: 'Pesimista',  color: 'text-red-400',   bg: 'bg-red-500/10',   border: 'border-red-500/20'   },
  { key: 'base',        label: 'Base',        color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
  { key: 'optimistic',  label: 'Optimista',  color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
] as const;

export default function ScenarioDisplay({ scenarios }: Props) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Proyección anual V&amp;M</p>
      <div className="grid grid-cols-3 gap-3">
        {COLS.map(({ key, label, color, bg, border }) => {
          const s = scenarios[key];
          return (
            <div key={key} className={`rounded-xl border ${border} ${bg} px-4 py-4 space-y-3`}>
              <p className={`text-xs font-semibold uppercase tracking-wide ${color}`}>{label}</p>

              <div>
                <p className={`text-xl font-bold font-mono ${color}`}>
                  {s.vmPnl >= 0 ? '+' : ''}{formatCurrency(s.vmPnl, 0)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {s.annualPct >= 0 ? '+' : ''}{s.annualPct.toFixed(1)}% sobre capital
                </p>
              </div>

              <div className="space-y-1 text-[11px] text-muted-foreground border-t border-white/5 pt-2">
                <div className="flex justify-between">
                  <span>Meses negativos</span>
                  <span className="font-medium text-foreground">{s.dist.neg}</span>
                </div>
                <div className="flex justify-between">
                  <span>Break-even</span>
                  <span className="font-medium text-foreground">{s.dist.be}</span>
                </div>
                <div className="flex justify-between">
                  <span>Ganancia limitada</span>
                  <span className="font-medium text-foreground">{s.dist.lim}</span>
                </div>
                <div className="flex justify-between">
                  <span>Muy buen mes</span>
                  <span className="font-medium text-foreground">{s.dist.good}</span>
                </div>
              </div>

              <div className="text-[11px] text-muted-foreground border-t border-white/5 pt-2 flex justify-between">
                <span>Trader</span>
                <span className="font-medium text-foreground">{formatCurrency(s.traderPnl, 0)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
