'use client';

import { useState } from 'react';
import { formatCurrency, pnlColor } from '@/lib/utils';

export interface TraderTrade {
  id: string;
  asset: string;
  direction: string;
  entry_price: number;
  exit_price: number;
  pnl: number;
  trade_date: string;
}

export interface Trader {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  joined: string;
  initial_capital: number;
  current_balance: number;
  trades: TraderTrade[];
  total_pnl: number;
  trade_count: number;
  win_rate: number;
}

export default function AdminTraderList({ traders }: { traders: Trader[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  const totalTrades = traders.reduce((s, t) => s + t.trade_count, 0);

  function toggle(id: string) {
    setOpenId(prev => (prev === id ? null : id));
  }

  return (
    <div className="space-y-6">
      {/* ── Global stats ── */}
      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Traders" value={String(traders.length)} />
        <StatCard label="Total Trades" value={String(totalTrades)} />
      </div>

      {/* ── Trader cards ── */}
      <div className="space-y-3">
        {traders.map(trader => {
          const isOpen = openId === trader.id;
          const initials = (trader.full_name ?? trader.email)
            .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

          return (
            <div
              key={trader.id}
              className="rounded-xl border border-border bg-card overflow-hidden"
            >
              {/* ── Header (always visible) ── */}
              <button
                onClick={() => toggle(trader.id)}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-muted/20 transition-colors text-left"
              >
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-primary">{initials}</span>
                </div>

                {/* Identity */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">
                      {trader.full_name ?? trader.email}
                    </span>
                    {trader.role === 'admin' && (
                      <span className="text-[10px] font-bold text-primary bg-primary/15 px-1.5 py-0.5 rounded-full shrink-0">
                        ADMIN
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground truncate block">{trader.email}</span>
                </div>

                {/* Stats */}
                <div className="hidden sm:flex items-center gap-6 shrink-0">
                  <Stat label="Trades" value={String(trader.trade_count)} />
                  <Stat label="Win Rate" value={trader.trade_count > 0 ? `${trader.win_rate.toFixed(1)}%` : '—'} />
                  {trader.initial_capital > 0 && (
                    <>
                      <div className="w-px h-8 bg-border" />
                      <Stat label="Fondeo" value={formatCurrency(trader.initial_capital)} />
                      <Stat
                        label="Balance"
                        value={formatCurrency(trader.current_balance)}
                        valueClass={pnlColor(trader.total_pnl)}
                      />
                    </>
                  )}
                  <div className="w-px h-8 bg-border" />
                  <Stat
                    label="P&L"
                    value={trader.trade_count > 0
                      ? `${trader.total_pnl >= 0 ? '+' : ''}${formatCurrency(trader.total_pnl)}`
                      : '—'}
                    valueClass={trader.trade_count > 0 ? pnlColor(trader.total_pnl) : ''}
                  />
                </div>

                {/* Chevron */}
                <ChevronIcon
                  className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {/* ── Trade table (expanded) ── */}
              <div
                className={`overflow-hidden transition-all duration-200 ease-in-out ${
                  isOpen ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                <div className="border-t border-border overflow-x-auto">
                  {trader.trades.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground py-8">No trades yet.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/20 border-b border-border">
                          {['Date', 'Asset', 'Dir.', 'Entry', 'Exit', 'P&L'].map(h => (
                            <th
                              key={h}
                              className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {trader.trades.map(trade => (
                          <tr
                            key={trade.id}
                            className="border-b border-border/40 hover:bg-muted/10 transition-colors"
                          >
                            <td className="px-4 py-2.5 text-muted-foreground text-xs tabular-nums">
                              {trade.trade_date}
                            </td>
                            <td className="px-4 py-2.5 font-medium">{trade.asset}</td>
                            <td className="px-4 py-2.5">
                              <span className={`text-xs font-semibold ${
                                trade.direction === 'long' ? 'text-green-500' : 'text-red-500'
                              }`}>
                                {trade.direction.toUpperCase()}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 font-mono text-xs tabular-nums">
                              {formatCurrency(trade.entry_price, 2)}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-xs tabular-nums">
                              {formatCurrency(trade.exit_price, 2)}
                            </td>
                            <td className={`px-4 py-2.5 font-mono text-xs font-semibold tabular-nums ${pnlColor(trade.pnl)}`}>
                              {trade.pnl >= 0 ? '+' : ''}{formatCurrency(trade.pnl)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, valueClass = '' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="card py-4 px-5">
      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-xl font-bold font-mono ${valueClass}`}>{value}</p>
    </div>
  );
}

function Stat({ label, value, valueClass = '' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="text-right">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-sm font-mono font-medium ${valueClass}`}>{value}</p>
    </div>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}
