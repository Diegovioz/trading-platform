'use client';

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { formatCurrency } from '@/lib/utils';

interface DataPoint {
  date: string;
  equity: number;
  pnl: number;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ payload: DataPoint; value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-muted-foreground mb-1">{label}</p>
      <p className="font-mono font-bold">{formatCurrency(d.equity)}</p>
      <p className={`font-mono mt-0.5 ${d.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
        {d.pnl >= 0 ? '+' : ''}{formatCurrency(d.pnl)} trade
      </p>
    </div>
  );
}

interface EquityCurveProps {
  trades: Array<{ trade_date: string; pnl: number }>;
  initialCapital: number;
}

export default function EquityCurve({ trades, initialCapital }: EquityCurveProps) {
  if (!trades.length) {
    return (
      <div className="card flex items-center justify-center h-80">
        <p className="text-muted-foreground text-sm">No trades yet — add your first trade to see the equity curve</p>
      </div>
    );
  }

  // Build cumulative equity curve
  const sorted = [...trades].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  let equity = initialCapital;
  const data: DataPoint[] = sorted.map(t => {
    equity += t.pnl;
    return { date: t.trade_date, equity, pnl: t.pnl };
  });

  const isPositive  = equity >= initialCapital;
  const strokeColor = isPositive ? '#22C55E' : '#EF4444';
  const minVal      = Math.min(...data.map(d => d.equity));
  const maxVal      = Math.max(...data.map(d => d.equity));

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="font-semibold text-base">Cumulative P&L</h3>
          <p className="text-muted-foreground text-xs mt-0.5">Scale: per trade</p>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-bold font-mono ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
            {formatCurrency(equity)}
          </p>
          <p className="text-muted-foreground text-xs">Current equity</p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
          <defs>
            <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={strokeColor} stopOpacity={0.35} />
              <stop offset="100%" stopColor={strokeColor} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2938" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis
            domain={[minVal * 0.98, maxVal * 1.02]}
            tick={{ fill: '#6b7280', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={v => `$${(v / 1000).toFixed(1)}k`}
            width={52}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="equity"
            stroke={strokeColor}
            strokeWidth={2.5}
            fill="url(#cumGrad)"
            dot={false}
            activeDot={{ r: 5, fill: strokeColor, stroke: '#0d1117', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
