'use client';

import type { Account } from '@/types';
import { formatCurrency } from '@/lib/utils';

interface DrawdownCardProps {
  account: Account;
}

export default function DrawdownCard({ account: a }: DrawdownCardProps) {
  const isTrailing = a.drawdown_type === 'trailing';
  const maxDD      = isTrailing
    ? a.highest_equity * (a.drawdown_percent / 100)
    : a.initial_capital * (a.drawdown_percent / 100);
  const usedPct    = a.drawdown_used_pct;
  const ddLabel    = `${a.drawdown_percent}% ${isTrailing ? 'Trailing' : 'Estático'}`;

  const barColor =
    usedPct >= 90 ? '#ef4444' :
    usedPct >= 60 ? '#f59e0b' :
    '#22c55e';

  return (
    <div className={`card space-y-4 ${a.is_failed ? 'border-red-500/60 bg-red-500/5' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${a.is_failed ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
          <div>
            <h3 className="font-semibold text-sm">{a.name}</h3>
            <span className="text-xs text-muted-foreground">{ddLabel}</span>
          </div>
        </div>
        {a.is_failed ? (
          <span className="text-xs font-bold text-red-500 bg-red-500/15 px-2 py-0.5 rounded-full animate-pulse">
            ACCOUNT FAILED
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            {usedPct.toFixed(1)}% DD usado
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
          <span>{isTrailing ? 'Equity máx. alcanzado' : 'Balance inicial'}</span>
          <span>Máx. DD ({isTrailing ? 'Trailing' : 'Estático'})</span>
        </div>
        <div className="relative h-3 bg-muted rounded-full overflow-hidden">
          <div
            className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
            style={{ width: `${usedPct}%`, backgroundColor: barColor }}
          />
        </div>
        <div className="flex justify-between text-xs font-mono mt-1">
          <span className="text-green-500">
            {formatCurrency(isTrailing ? a.highest_equity : a.initial_capital)}
          </span>
          <span className="text-red-500">−{formatCurrency(maxDD)}</span>
        </div>
      </div>

      {/* Stats grid */}
      <div className={`grid gap-3 pt-1 border-t border-border ${isTrailing ? 'grid-cols-4' : 'grid-cols-3'}`}>
        <Stat
          label="Balance actual"
          value={formatCurrency(a.current_balance)}
          color={a.current_balance >= a.initial_capital ? 'text-green-500' : 'text-red-500'}
        />
        {isTrailing && (
          <Stat
            label="Equity máx."
            value={formatCurrency(a.highest_equity)}
            color="text-blue-400"
          />
        )}
        <Stat
          label="Mín. equity"
          value={formatCurrency(a.drawdown_floor)}
          color="text-muted-foreground"
        />
        <Stat
          label="Riesgo restante"
          value={a.is_failed ? 'BLOWN' : formatCurrency(Math.max(0, a.remaining_risk))}
          color={a.is_failed ? 'text-red-500 font-bold' : a.remaining_risk < maxDD * 0.3 ? 'text-orange-400' : 'text-foreground'}
        />
      </div>

      {/* Warning banner */}
      {!a.is_failed && usedPct >= 60 && (
        <div className={`text-xs px-3 py-2 rounded-lg flex items-center gap-2 ${
          usedPct >= 90
            ? 'bg-red-500/15 text-red-400 border border-red-500/30'
            : 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
        }`}>
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {usedPct >= 90
            ? `PELIGRO — solo ${formatCurrency(a.remaining_risk)} antes de que la cuenta falle`
            : `Precaución — ${usedPct.toFixed(0)}% del límite de drawdown consumido`
          }
        </div>
      )}

      {a.is_failed && (
        <div className="text-xs px-3 py-2 rounded-lg bg-red-500/15 text-red-400 border border-red-500/30 flex items-center gap-2">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Balance ha superado el límite de drawdown {isTrailing ? 'trailing' : 'estático'} del {a.drawdown_percent}%. No se permiten nuevas operaciones.
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className={`text-sm font-mono font-medium ${color}`}>{value}</p>
    </div>
  );
}
