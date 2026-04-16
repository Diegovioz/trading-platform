'use client';

import { useState } from 'react';
import type { JournalTrade } from '@/types';
import { formatCurrency, formatDate, pnlColor } from '@/lib/utils';

interface TradeTableProps {
  trades: JournalTrade[];
  isAdmin?: boolean;
  onDelete?: (id: string) => void;
}

export default function TradeTable({ trades, isAdmin = false, onDelete }: TradeTableProps) {
  const [filter, setFilter]   = useState('');
  const [sortKey, setSortKey] = useState<'trade_date' | 'pnl' | 'asset'>('trade_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const filtered = trades
    .filter(t =>
      !filter ||
      t.asset.toLowerCase().includes(filter.toLowerCase()) ||
      t.direction.toLowerCase().includes(filter.toLowerCase()) ||
      (t.notes ?? '').toLowerCase().includes(filter.toLowerCase())
    )
    .sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  const totalPnl = filtered.reduce((s, t) => s + t.pnl, 0);

  return (
    <div className="space-y-4">
      {/* Filters bar */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Filter by asset, direction, notes…"
          className="input max-w-xs"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        <div className="ml-auto text-sm text-muted-foreground">
          {filtered.length} trades •{' '}
          <span className={pnlColor(totalPnl)}>
            {totalPnl >= 0 ? '+' : ''}{formatCurrency(totalPnl)}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {isAdmin && <Th>Trader</Th>}
              <Th sortable onClick={() => toggleSort('trade_date')}>Date</Th>
              <Th sortable onClick={() => toggleSort('asset')}>Asset</Th>
              <Th>Dir.</Th>
              <Th>Entry</Th>
              <Th>Exit</Th>
              <Th>Size</Th>
              <Th sortable onClick={() => toggleSort('pnl')}>P&L</Th>
              <Th>Tags</Th>
              <Th>Notes</Th>
              {onDelete && <Th></Th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 11 : 10} className="text-center py-12 text-muted-foreground">
                  No trades found.
                </td>
              </tr>
            ) : (
              filtered.map(trade => (
                <tr key={trade.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  {isAdmin && (
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {trade.profile?.full_name ?? trade.profile?.email ?? '—'}
                    </td>
                  )}
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(trade.trade_date)}</td>
                  <td className="px-4 py-3 font-medium">{trade.asset}</td>
                  <td className="px-4 py-3">
                    <span className={trade.direction === 'long' ? 'tag-win' : 'tag-loss'}>
                      {trade.direction.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono">{trade.entry_price.toLocaleString()}</td>
                  <td className="px-4 py-3 font-mono">{trade.exit_price.toLocaleString()}</td>
                  <td className="px-4 py-3 font-mono">{trade.size}</td>
                  <td className={`px-4 py-3 font-mono font-medium ${pnlColor(trade.pnl)}`}>
                    {trade.pnl >= 0 ? '+' : ''}{formatCurrency(trade.pnl)}
                  </td>
                  <td className="px-4 py-3">
                    {trade.tags?.map(tag => (
                      <span key={tag} className="tag-neutral mr-1">{tag}</span>
                    )) ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-[160px] truncate">
                    {trade.notes ?? '—'}
                  </td>
                  {onDelete && (
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onDelete(trade.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        title="Delete trade"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  children,
  sortable,
  onClick,
}: {
  children?: React.ReactNode;
  sortable?: boolean;
  onClick?: () => void;
}) {
  return (
    <th
      className={`px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide ${sortable ? 'cursor-pointer hover:text-foreground' : ''}`}
      onClick={onClick}
    >
      {children}
    </th>
  );
}
