'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { formatCurrency } from '@/lib/utils';

interface DailyData {
  date: string;
  pnl: number;
  trades: number;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; payload: DailyData }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-muted-foreground mb-1">{label}</p>
      <p className={`font-mono font-bold ${val >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatCurrency(val)}</p>
      <p className="text-muted-foreground">{payload[0].payload.trades} trades</p>
    </div>
  );
}

interface PnLChartProps {
  trades: Array<{ trade_date: string; pnl: number }>;
}

export default function PnLChart({ trades }: PnLChartProps) {
  if (!trades.length) {
    return (
      <div className="card flex items-center justify-center h-80">
        <p className="text-muted-foreground text-sm">Daily P&L: no data</p>
      </div>
    );
  }

  // Group by date
  const byDate: Record<string, { pnl: number; trades: number }> = {};
  trades.forEach(t => {
    if (!byDate[t.trade_date]) byDate[t.trade_date] = { pnl: 0, trades: 0 };
    byDate[t.trade_date].pnl    += t.pnl;
    byDate[t.trade_date].trades += 1;
  });
  const daily: DailyData[] = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));

  const pos = daily.filter(d => d.pnl > 0).length;
  const neg = daily.filter(d => d.pnl < 0).length;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="font-semibold text-base">Daily P&L</h3>
          <p className="text-muted-foreground text-xs mt-0.5">Scale: Daily</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" />
            {pos} positive
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" />
            {neg} negative
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={daily} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2938" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} width={55} />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={0} stroke="#1e2938" strokeWidth={1} />
          <Bar dataKey="pnl" radius={[3, 3, 0, 0]} maxBarSize={32}>
            {daily.map((entry, i) => (
              <Cell key={i} fill={entry.pnl >= 0 ? '#22C55E' : '#EF4444'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
