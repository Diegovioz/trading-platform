'use client';

import { useState } from 'react';
import type { JournalTrade, TradeEvaluation } from '@/types';
import { formatCurrency, formatDate, pnlColor } from '@/lib/utils';
import { useCountdown, fmtCountdown } from '@/hooks/useCountdown';

interface TradeTableProps {
  trades: JournalTrade[];
  isAdmin?: boolean;
  onDelete?: (id: string) => void;
  evaluationMap?: Record<string, TradeEvaluation>;
  onEvaluate?: (tradeId: string) => Promise<{ error?: string }>;
  evalLimitAt?: string | null;
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

export default function TradeTable({ trades, isAdmin = false, onDelete, evaluationMap = {}, onEvaluate, evalLimitAt }: TradeTableProps) {
  const [filter, setFilter]         = useState('');
  const [sortKey, setSortKey]       = useState<'trade_date' | 'pnl' | 'asset'>('trade_date');
  const [sortDir, setSortDir]       = useState<'asc' | 'desc'>('desc');
  const [evaluating, setEvaluating] = useState<string | null>(null);
  const [evalErrors, setEvalErrors] = useState<Record<string, string>>({});
  const [expanded, setExpanded]     = useState<string | null>(null);

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
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={baseColCount} className="text-center py-12 text-muted-foreground">
                  No trades found.
                </td>
              </tr>
            ) : (
              filtered.flatMap(trade => {
                const evaluation  = evaluationMap[trade.id];
                const isEvaluating = evaluating === trade.id;
                const evalError   = evalErrors[trade.id];
                const isExpanded  = expanded === trade.id;

                return [
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

                    {showScore && (
                      <td className="px-4 py-3">
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
