'use client';

import type { Account, JournalTrade } from '@/types';
import { formatCurrency } from '@/lib/utils';

interface ChallengeProgressProps {
  account: Account;
  trades: JournalTrade[];
}

const PHASE_LABELS: Record<string, string> = {
  phase1:  'Fase 1 — Evaluación',
  phase2:  'Fase 2 — Verificación',
  funded:  'Cuenta Fondeada',
};

const PROFIT_TARGETS: Record<string, number | null> = {
  phase1: 0.08,
  phase2: 0.05,
  funded: null,
};

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2 bg-muted rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(100, pct)}%`, backgroundColor: color }}
      />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

export default function ChallengeProgress({ account: a, trades }: ChallengeProgressProps) {
  const today    = new Date().toISOString().split('T')[0];
  const acTrades = trades.filter(t => (t as any).account_id === a.id || trades.length > 0);

  // ── Profit progress ────────────────────────────────────────────────────────
  const target     = PROFIT_TARGETS[a.phase];
  const profitPct  = a.initial_capital > 0 ? (a.total_pnl / a.initial_capital) * 100 : 0;
  const targetPct  = target !== null ? target * 100 : null;
  const profitDone = targetPct !== null ? Math.min(100, (profitPct / (targetPct)) * 100) : 100;
  const profitMet  = targetPct === null || profitPct >= targetPct;

  // ── Daily loss limit (5%) ──────────────────────────────────────────────────
  const dailyLimit    = a.initial_capital * 0.05;
  const todayPnl      = acTrades
    .filter(t => t.trade_date === today)
    .reduce((s, t) => s + t.pnl, 0);
  const dailyLossPct  = dailyLimit > 0
    ? Math.min(100, Math.max(0, (-todayPnl / dailyLimit) * 100))
    : 0;
  const dailyBreached = todayPnl < -dailyLimit;

  // ── Min trading days (4 required) ─────────────────────────────────────────
  const tradingDays = new Set(acTrades.map(t => t.trade_date)).size;
  const daysMet     = tradingDays >= 4;

  // ── Consistency rule: max single day ≤ 30% of total profits ───────────────
  const dailyPnlMap: Record<string, number> = {};
  for (const t of acTrades) {
    dailyPnlMap[t.trade_date] = (dailyPnlMap[t.trade_date] ?? 0) + t.pnl;
  }
  const dailyPnls      = Object.values(dailyPnlMap);
  const totalProfit    = dailyPnls.filter(p => p > 0).reduce((s, p) => s + p, 0);
  const maxDayProfit   = Math.max(0, ...dailyPnls);
  const consistencyPct = totalProfit > 0 ? (maxDayProfit / totalProfit) * 100 : 0;
  const consistencyMet = totalProfit === 0 || consistencyPct <= 30;

  const phaseLabel = PHASE_LABELS[a.phase] ?? a.phase;

  return (
    <div className="card space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">{a.name}</h3>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full mt-0.5 inline-block ${
            a.phase === 'funded'
              ? 'bg-blue-500/15 text-blue-400'
              : a.phase === 'phase2'
              ? 'bg-purple-500/15 text-purple-400'
              : 'bg-primary/15 text-primary'
          }`}>
            {phaseLabel}
          </span>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">P&L total</p>
          <p className={`text-sm font-mono font-bold ${a.total_pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {a.total_pnl >= 0 ? '+' : ''}{formatCurrency(a.total_pnl)}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Profit target */}
        {targetPct !== null ? (
          <Row label={`Objetivo de beneficio: ${profitPct.toFixed(2)}% / ${targetPct}%`}>
            <Bar pct={profitDone} color={profitMet ? '#22c55e' : '#3b82f6'} />
            <div className="flex justify-between text-xs mt-0.5">
              <span className="text-muted-foreground">
                {formatCurrency(a.total_pnl)} / {formatCurrency(a.initial_capital * targetPct / 100)}
              </span>
              {profitMet
                ? <span className="text-green-500 font-medium">✓ Alcanzado</span>
                : <span className="text-muted-foreground">{(targetPct - profitPct).toFixed(2)}% restante</span>
              }
            </div>
          </Row>
        ) : (
          <Row label="Objetivo de beneficio">
            <p className="text-xs text-blue-400">Sin objetivo — cuenta fondeada</p>
          </Row>
        )}

        {/* Daily loss limit */}
        <Row label={`Pérdida diaria (hoy): ${todayPnl < 0 ? formatCurrency(todayPnl) : '+' + formatCurrency(todayPnl)} / límite −${formatCurrency(dailyLimit)}`}>
          <Bar pct={dailyLossPct} color={dailyBreached ? '#ef4444' : dailyLossPct >= 70 ? '#f59e0b' : '#22c55e'} />
          <div className="flex justify-between text-xs mt-0.5">
            <span className="text-muted-foreground">Límite diario: 5% ({formatCurrency(dailyLimit)})</span>
            {dailyBreached
              ? <span className="text-red-500 font-medium">✕ Incumplido</span>
              : <span className="text-green-500">✓ OK</span>
            }
          </div>
        </Row>

        {/* Trading days */}
        <Row label={`Días de trading: ${tradingDays} / 4 mínimo`}>
          <div className="flex gap-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-2 rounded-full ${i < tradingDays ? 'bg-green-500' : 'bg-muted'}`}
              />
            ))}
            {tradingDays > 4 && (
              <div className="flex-1 h-2 rounded-full bg-green-500/40" />
            )}
          </div>
          <p className="text-xs mt-0.5">
            {daysMet
              ? <span className="text-green-500">✓ Mínimo alcanzado ({tradingDays} días)</span>
              : <span className="text-muted-foreground">{4 - tradingDays} día{4 - tradingDays !== 1 ? 's' : ''} más requerido{4 - tradingDays !== 1 ? 's' : ''}</span>
            }
          </p>
        </Row>

        {/* Consistency rule */}
        <Row label={`Regla de consistencia: día máx. ≤ 30% del beneficio total`}>
          <div className="flex items-center justify-between text-xs">
            {totalProfit === 0 ? (
              <span className="text-muted-foreground">Sin beneficios aún</span>
            ) : consistencyMet ? (
              <span className="text-green-500">✓ OK — día máx. {consistencyPct.toFixed(0)}% del total ({formatCurrency(maxDayProfit)})</span>
            ) : (
              <span className="text-red-400">✕ Día máx. representa {consistencyPct.toFixed(0)}% — excede el 30%</span>
            )}
          </div>
        </Row>
      </div>

      {/* Footer rules */}
      <div className="pt-3 border-t border-border/50 grid grid-cols-2 gap-x-4 gap-y-1">
        {[
          ['Sin límite de tiempo', true],
          ['Overnight/fin de semana', true],
          ['Sin consistency rule en eval.', a.phase !== 'funded'],
          ['Restricción de noticias', a.phase === 'funded'],
          ['Profit split', '80% trader'],
          ['Retiro mínimo', '$150'],
        ].map(([label, val]) => (
          <div key={String(label)} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {typeof val === 'boolean'
              ? <span className={val ? 'text-green-500' : 'text-yellow-500'}>{val ? '✓' : '⚠'}</span>
              : null
            }
            <span>{label}{typeof val === 'string' ? `: ${val}` : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
