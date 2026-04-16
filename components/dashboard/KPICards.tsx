'use client';

import { formatCurrency } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Metrics {
  total_pnl: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  profit_factor: number;
  expectancy: number;
  avg_win: number;
  avg_loss: number;
  total_fees: number;
}

// ─── Circular gauge ───────────────────────────────────────────────────────────
function CircleGauge({ value, max = 100, color = '#22C55E', size = 60, stroke = 5 }: {
  value: number; max?: number; color?: string; size?: number; stroke?: number;
}) {
  const radius   = (size - stroke) / 2;
  const circum   = 2 * Math.PI * radius;
  const pct      = Math.min(Math.max(value / max, 0), 1);
  const dashOffset = circum * (1 - pct);
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="#1e2938" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={stroke}
        strokeLinecap="round" strokeDasharray={circum} strokeDashoffset={dashOffset}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
    </svg>
  );
}

// ─── PnL card ─────────────────────────────────────────────────────────────────
function PnLCard({ value, subtitle }: { value: number; subtitle: string }) {
  const pos = value >= 0;
  return (
    <div className="card flex items-center gap-4 flex-1">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${pos ? 'bg-green-500/15' : 'bg-red-500/15'}`}>
        <span className={`text-2xl font-bold ${pos ? 'text-green-500' : 'text-red-500'}`}>$</span>
      </div>
      <div>
        <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Net P&L</p>
        <p className={`text-3xl font-bold font-mono mt-0.5 ${pos ? 'text-green-500' : 'text-red-500'}`}>
          {formatCurrency(value)}
        </p>
        <p className="text-muted-foreground text-xs mt-1">{subtitle}</p>
      </div>
    </div>
  );
}

// ─── Circle card ─────────────────────────────────────────────────────────────
function CircleCard({ title, value, displayValue, subtitle, color, gaugeMax = 100 }: {
  title: string; value: number; displayValue: string; subtitle: string; color: string; gaugeMax?: number;
}) {
  return (
    <div className="card flex items-center gap-4 flex-1">
      <div className="relative shrink-0">
        <CircleGauge value={value} max={gaugeMax} color={color} size={60} stroke={5} />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[10px] font-bold" style={{ color }}>
            {displayValue.replace('%', '').length > 4 ? displayValue.replace('%', '') : displayValue}
          </span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">{title}</p>
        <p className="text-2xl font-bold font-mono mt-0.5">{displayValue}</p>
        <p className="text-muted-foreground text-xs mt-1 truncate">{subtitle}</p>
      </div>
    </div>
  );
}

// ─── Avg Win/Loss card ────────────────────────────────────────────────────────
function AvgCard({ avgWin, avgLoss }: { avgWin: number; avgLoss: number }) {
  const total  = Math.abs(avgWin) + Math.abs(avgLoss);
  const winPct  = total > 0 ? (Math.abs(avgWin)  / total) * 100 : 50;
  const lossPct = total > 0 ? (Math.abs(avgLoss) / total) * 100 : 50;
  const rr = avgLoss > 0 ? (avgWin / avgLoss).toFixed(2) : '—';

  return (
    <div className="card flex-1">
      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider mb-3">Avg Win / Loss</p>
      <p className="text-2xl font-bold font-mono">{rr}</p>
      <p className="text-muted-foreground text-xs mt-0.5 mb-3">Risk / Reward ratio</p>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full" style={{ width: `${winPct}%` }} />
          </div>
          <span className="text-green-500 text-xs font-mono w-20 text-right">{formatCurrency(avgWin)}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-red-500 rounded-full" style={{ width: `${lossPct}%` }} />
          </div>
          <span className="text-red-500 text-xs font-mono w-20 text-right">-{formatCurrency(avgLoss)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="flex gap-4 flex-wrap">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex-1 card h-28 animate-pulse bg-muted/30" />
      ))}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function KPICards({ metrics }: { metrics: Metrics | null }) {
  if (!metrics) return <Skeleton />;

  const winRate = metrics.win_rate || 0;
  const pf      = metrics.profit_factor >= 999 ? 10 : (metrics.profit_factor || 0);
  const pfDisplay = metrics.profit_factor >= 999 ? '∞' : pf.toFixed(2);

  const winColor = winRate >= 60 ? '#22C55E' : winRate >= 45 ? '#F59E0B' : '#EF4444';
  const pfColor  = pf >= 1.5 ? '#22C55E' : pf >= 1 ? '#F59E0B' : '#EF4444';

  return (
    <div className="flex gap-4 flex-wrap">
      <PnLCard
        value={metrics.total_pnl}
        subtitle={`${metrics.total_trades} trades · Fees: ${formatCurrency(metrics.total_fees)}`}
      />
      <CircleCard
        title="Trade Win %"
        value={winRate}
        displayValue={`${winRate.toFixed(1)}%`}
        subtitle={`${metrics.winning_trades} wins · ${metrics.losing_trades} losses`}
        color={winColor}
        gaugeMax={100}
      />
      <CircleCard
        title="Profit Factor"
        value={Math.min(pf, 10)}
        displayValue={pfDisplay}
        subtitle="Total profits ÷ total losses"
        color={pfColor}
        gaugeMax={10}
      />
      <CircleCard
        title="Expectancy"
        value={Math.min(Math.max(metrics.expectancy, -500), 500)}
        displayValue={formatCurrency(metrics.expectancy)}
        subtitle="Avg $ per trade"
        color={metrics.expectancy >= 0 ? '#22C55E' : '#EF4444'}
        gaugeMax={500}
      />
      <AvgCard avgWin={metrics.avg_win} avgLoss={metrics.avg_loss} />
    </div>
  );
}

// ─── Metrics calculator ───────────────────────────────────────────────────────
export function calcMetrics(trades: { pnl: number }[]): Metrics {
  const total = trades.length;
  if (!total) return {
    total_pnl: 0, total_trades: 0, winning_trades: 0, losing_trades: 0,
    win_rate: 0, profit_factor: 0, expectancy: 0, avg_win: 0, avg_loss: 0, total_fees: 0,
  };

  const wins   = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl < 0);
  const gross_p = wins.reduce((s, t) => s + t.pnl, 0);
  const gross_l = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));

  return {
    total_pnl:      trades.reduce((s, t) => s + t.pnl, 0),
    total_trades:   total,
    winning_trades: wins.length,
    losing_trades:  losses.length,
    win_rate:       (wins.length / total) * 100,
    profit_factor:  gross_l > 0 ? gross_p / gross_l : gross_p > 0 ? 999 : 0,
    expectancy:     trades.reduce((s, t) => s + t.pnl, 0) / total,
    avg_win:        wins.length ? gross_p / wins.length : 0,
    avg_loss:       losses.length ? gross_l / losses.length : 0,
    total_fees:     0,
  };
}
