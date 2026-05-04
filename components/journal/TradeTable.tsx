'use client';

import { useState, useEffect } from 'react';
import type { JournalTrade, TradeEvaluation, NoTradeDay } from '@/types';
import { formatCurrency, formatDate, pnlColor } from '@/lib/utils';
import { useCountdown, fmtCountdown } from '@/hooks/useCountdown';

function TradeDetailModal({ trade, onClose }: { trade: JournalTrade; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const Field = ({ label, value, mono = false, className = '' }: { label: string; value?: string | number | null; mono?: boolean; className?: string }) => (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className={`text-sm font-medium ${mono ? 'font-mono' : ''} ${className || 'text-foreground'}`}>
        {value ?? '—'}
      </span>
    </div>
  );

  const daysLeft = trade.image_expires_at
    ? Math.ceil((new Date(trade.image_expires_at).getTime() - Date.now()) / 86_400_000)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-background border border-border rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-background rounded-t-2xl">
          <div className="flex items-center gap-2.5">
            <span className="text-base font-bold">{trade.asset}</span>
            <span className={trade.direction === 'long' ? 'tag-win' : 'tag-loss'}>
              {trade.direction.toUpperCase()}
            </span>
            <span className={`text-sm font-bold font-mono ${pnlColor(trade.pnl)}`}>
              {trade.pnl >= 0 ? '+' : ''}{formatCurrency(trade.pnl)}
            </span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Details grid */}
        <div className="px-5 py-4 grid grid-cols-2 gap-x-6 gap-y-4">
          <Field label="Date" value={formatDate(trade.trade_date)} />
          <Field label="Size" value={trade.size} mono />
          <Field label="Entry" value={trade.entry_price.toLocaleString()} mono />
          <Field label="Exit" value={trade.exit_price.toLocaleString()} mono />
          <Field label="Stop Loss" value={trade.stop_loss != null ? trade.stop_loss.toLocaleString() : null} mono />
          <Field label="Take Profit" value={trade.take_profit != null ? trade.take_profit.toLocaleString() : null} mono />
          <Field label="Net P&L" value={`${trade.pnl >= 0 ? '+' : ''}${formatCurrency(trade.pnl)}`} mono className={pnlColor(trade.pnl)} />
          {trade.tags && trade.tags.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Tags</span>
              <div className="flex flex-wrap gap-1">
                {trade.tags.map(tag => <span key={tag} className="tag-neutral">{tag}</span>)}
              </div>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="px-5 pb-5">
          <div className="border-t border-border pt-4 space-y-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Notes</span>
            {trade.notes
              ? <p className="text-sm leading-relaxed whitespace-pre-wrap">{trade.notes}</p>
              : <p className="text-sm text-muted-foreground italic">No notes for this trade.</p>
            }
          </div>
        </div>

        {/* Screenshot */}
        {trade.image_url && (
          <div className="px-5 pb-5">
            <div className="border-t border-border pt-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Screenshot</span>
                {daysLeft !== null && (
                  <span className="text-[10px] text-muted-foreground">Expires in {daysLeft}d</span>
                )}
              </div>
              <a href={trade.image_url} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={trade.image_url} alt="trade screenshot" className="w-full rounded-lg border border-border object-cover hover:opacity-90 transition-opacity" />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

type TableRow =
  | { type: 'trade';    data: JournalTrade }
  | { type: 'no-trade'; data: NoTradeDay };

interface TradeTableProps {
  trades: JournalTrade[];
  isAdmin?: boolean;
  onDelete?: (id: string) => void;
  evaluationMap?: Record<string, TradeEvaluation>;
  onEvaluate?: (tradeId: string) => Promise<{ error?: string }>;
  evalLimitAt?: string | null;
  noTradeDays?: NoTradeDay[];
  onDeleteNoTradeDay?: (id: string) => void;
}

interface EvalDetail {
  breakdown: { strategy_adherence?: number; risk_management?: number; execution?: number };
  mistakes: string[];
  strengths: string[];
  feedback: string;
}

function parseEval(ev: TradeEvaluation): EvalDetail | null {
  try { return JSON.parse(ev.feedback); } catch { return null; }
}

function ScoreBadge({ score, onClick }: { score: number; onClick?: () => void }) {
  const color = score >= 8 ? 'bg-green-500/15 text-green-400 ring-green-500/30'
              : score >= 5 ? 'bg-yellow-500/15 text-yellow-400 ring-yellow-500/30'
                           : 'bg-red-500/15 text-red-400 ring-red-500/30';
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ring-1 transition-opacity hover:opacity-80 ${color}`}
      title="Click to see evaluation details"
    >
      {score}
    </button>
  );
}

function EvalPanel({ ev, colSpan }: { ev: TradeEvaluation; colSpan: number }) {
  const d = parseEval(ev);
  return (
    <tr className="bg-muted/10 border-b border-border/50">
      <td colSpan={colSpan} className="px-6 py-4">
        <div className="flex flex-col gap-3">
          {/* Feedback */}
          {d?.feedback && (
            <p className="text-sm leading-relaxed">{d.feedback}</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Breakdown */}
            {d?.breakdown && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Breakdown</p>
                {([
                  ['Strategy', d.breakdown.strategy_adherence],
                  ['Risk Mgmt', d.breakdown.risk_management],
                  ['Execution', d.breakdown.execution],
                ] as [string, number | undefined][]).map(([label, val]) =>
                  val != null ? (
                    <div key={label} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-20 shrink-0">{label}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                        <div
                          className={`h-full rounded-full ${val >= 8 ? 'bg-green-500' : val >= 5 ? 'bg-yellow-500' : 'bg-red-500'}`}
                          style={{ width: `${val * 10}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium w-6 text-right">{val}</span>
                    </div>
                  ) : null
                )}
              </div>
            )}

            {/* Mistakes */}
            {d?.mistakes && d.mistakes.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-1.5">Mistakes</p>
                <ul className="space-y-1">
                  {d.mistakes.map((m, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                      <span className="text-red-400 shrink-0">✕</span>{m}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Strengths */}
            {d?.strengths && d.strengths.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-green-400 uppercase tracking-wide mb-1.5">Strengths</p>
                <ul className="space-y-1">
                  {d.strengths.map((s, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                      <span className="text-green-400 shrink-0">✓</span>{s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

export default function TradeTable({ trades, isAdmin = false, onDelete, evaluationMap = {}, onEvaluate, evalLimitAt, noTradeDays = [], onDeleteNoTradeDay }: TradeTableProps) {
  const [filter, setFilter]           = useState('');
  const [sortKey, setSortKey]         = useState<'trade_date' | 'pnl' | 'asset'>('trade_date');
  const [sortDir, setSortDir]         = useState<'asc' | 'desc'>('desc');
  const [evaluating, setEvaluating]   = useState<string | null>(null);
  const [evalErrors, setEvalErrors]   = useState<Record<string, string>>({});
  const [expanded, setExpanded]       = useState<string | null>(null);
  const [selectedTrade, setSelectedTrade] = useState<JournalTrade | null>(null);

  const evalCountdown  = useCountdown(evalLimitAt, 24);
  const isEvalBlocked  = evalCountdown !== null;

  const filtered = trades
    .filter(t =>
      !filter ||
      t.asset.toLowerCase().includes(filter.toLowerCase()) ||
      t.direction.toLowerCase().includes(filter.toLowerCase()) ||
      (t.notes ?? '').toLowerCase().includes(filter.toLowerCase())
    )
    .sort((a, b) => {
      const av = a[sortKey] ?? '', bv = b[sortKey] ?? '';
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  async function handleEvaluate(tradeId: string) {
    if (!onEvaluate) return;
    setEvaluating(tradeId);
    setEvalErrors(prev => { const n = { ...prev }; delete n[tradeId]; return n; });
    const result = await onEvaluate(tradeId);
    if (result.error) {
      const msg = result.error.includes('strategy')
        ? 'Define your strategy first in AI Coach.'
        : result.error.includes('failed')
        ? 'Evaluation failed. Try again.'
        : result.error;
      setEvalErrors(prev => ({ ...prev, [tradeId]: msg }));
    } else {
      setExpanded(tradeId); // auto-expand after scoring
    }
    setEvaluating(null);
  }

  function toggleExpand(tradeId: string) {
    setExpanded(prev => prev === tradeId ? null : tradeId);
  }

  const totalPnl   = filtered.reduce((s, t) => s + t.pnl, 0);
  const showScore  = !!onEvaluate;
  const baseColCount = (isAdmin ? 1 : 0) + 9 + (showScore ? 1 : 0) + (onDelete ? 1 : 0);

  const rows: TableRow[] = [
    ...filtered.map(t => ({ type: 'trade' as const, data: t })),
    ...noTradeDays.map(d => ({ type: 'no-trade' as const, data: d })),
  ].sort((a, b) => {
    const aDate = a.type === 'trade' ? a.data.trade_date : a.data.date;
    const bDate = b.type === 'trade' ? b.data.trade_date : b.data.date;
    return bDate.localeCompare(aDate);
  });

  return (
    <div className="space-y-4">
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
              {showScore && <Th>AI Score</Th>}
              {onDelete && <Th></Th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={baseColCount} className="text-center py-12 text-muted-foreground">
                  No trades found.
                </td>
              </tr>
            ) : (
              rows.flatMap(row => {
                if (row.type === 'no-trade') {
                  const d = row.data;
                  return [
                    <tr key={`ntd-${d.id}`} className="border-b border-border/50 bg-muted/10">
                      <td colSpan={baseColCount} className="px-4 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground border border-border/60 uppercase tracking-wide">
                              Sin trade
                            </span>
                            <span className="text-xs text-muted-foreground">{formatDate(d.date)}</span>
                            {d.reason && (
                              <span className="text-xs text-muted-foreground">— {d.reason}</span>
                            )}
                          </div>
                          {onDeleteNoTradeDay && (
                            <button
                              onClick={() => onDeleteNoTradeDay(d.id)}
                              className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                              title="Eliminar"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>,
                  ];
                }

                const trade = row.data;
                const evaluation  = evaluationMap[trade.id];
                const isEvaluating = evaluating === trade.id;
                const evalError   = evalErrors[trade.id];
                const isExpanded  = expanded === trade.id;

                return [
                  <tr key={trade.id} onClick={() => setSelectedTrade(trade)} className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer">
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
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[160px]">
                      <div className="flex items-center gap-2">
                        <span className="truncate">{trade.notes ?? '—'}</span>
                        {trade.image_url && (() => {
                          const daysLeft = trade.image_expires_at
                            ? Math.ceil((new Date(trade.image_expires_at).getTime() - Date.now()) / 86_400_000)
                            : null;
                          return (
                            <div className="flex flex-col items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                              <a href={trade.image_url} target="_blank" rel="noopener noreferrer" title="Ver captura">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={trade.image_url} alt="screenshot" className="w-8 h-8 rounded object-cover border border-border hover:opacity-80 transition-opacity" />
                              </a>
                              {daysLeft !== null && (
                                <span className="text-[9px] text-muted-foreground leading-none">
                                  {daysLeft}d
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </td>

                    {showScore && (
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        {evaluation ? (
                          <div className="flex items-center gap-2">
                            <ScoreBadge score={evaluation.score} onClick={() => toggleExpand(trade.id)} />
                            <button
                              onClick={() => toggleExpand(trade.id)}
                              className="text-xs text-primary hover:underline whitespace-nowrap"
                            >
                              {expanded === trade.id ? 'Hide' : 'View Score'}
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {isEvalBlocked ? (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground" title="Usage limited to control system quality">
                                <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth="1.5"/><path strokeLinecap="round" strokeWidth="1.5" d="M12 6v6l3 3"/></svg>
                                <span className="font-mono">{fmtCountdown(evalCountdown!)}</span>
                              </div>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleEvaluate(trade.id)}
                                  disabled={isEvaluating}
                                  className="px-2.5 py-1 rounded text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors whitespace-nowrap"
                                >
                                  {isEvaluating ? 'Evaluating…' : 'Evaluate'}
                                </button>
                                {evalError && (
                                  <p className="text-xs text-destructive max-w-[110px]">{evalError}</p>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    )}

                    {onDelete && (
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
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
                  </tr>,

                  // Expandable evaluation panel
                  isExpanded && evaluation
                    ? <EvalPanel key={`${trade.id}-eval`} ev={evaluation} colSpan={baseColCount} />
                    : null,
                ].filter(Boolean);
              })
            )}
          </tbody>
        </table>
      </div>

      {selectedTrade && (
        <TradeDetailModal trade={selectedTrade} onClose={() => setSelectedTrade(null)} />
      )}
    </div>
  );
}

function Th({ children, sortable, onClick }: { children?: React.ReactNode; sortable?: boolean; onClick?: () => void }) {
  return (
    <th
      className={`px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide ${sortable ? 'cursor-pointer hover:text-foreground' : ''}`}
      onClick={onClick}
    >
      {children}
    </th>
  );
}
