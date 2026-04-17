'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useBacktest, ASSETS, TIMEFRAMES, SPEED_OPTIONS, CRYPTO_ASSETS, SYNTHETIC_TIMEFRAMES } from '@/hooks/useBacktest';
import { formatCurrency, formatPrice, pnlColor } from '@/lib/utils';
import type { ClosedTrade } from '@/types';
import type { DrawingTool } from '@/components/backtesting/BacktestChart';

// Chart uses browser APIs — client-only
const BacktestChart = dynamic(() => import('@/components/backtesting/BacktestChart'), { ssr: false });

export default function BacktestingPage() {
  const bt = useBacktest();

  const [tradeForm, setTradeForm] = useState({
    stopLoss: '', takeProfit: '', size: '1', notes: '',
  });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<DrawingTool>('none');
  const [clearSignal, setClearSignal] = useState(0);

  async function handleSaveTrade(trade: ClosedTrade) {
    setSaveError(null);
    setSaveSuccess(null);
    const { error } = await bt.saveTrade(trade);
    if (error) setSaveError(error);
    else setSaveSuccess(`Trade saved! (${bt.savedThisMonth + 1}/${bt.monthlyLimit} this month)`);
  }

  const pnlDisplay = bt.metrics.totalPnl;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Top control bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card flex-shrink-0 flex-wrap">
        {/* Asset */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Asset</label>
          <select
            className="input text-sm py-1.5 w-28"
            value={bt.asset}
            onChange={e => bt.setAsset(e.target.value)}
          >
            {ASSETS.map(a => <option key={a}>{a}</option>)}
          </select>
        </div>

        {/* Timeframe */}
        <div className="flex gap-1">
          {TIMEFRAMES.map(tf => (
            <button
              key={tf}
              onClick={() => bt.setTimeframe(tf)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                bt.timeframe === tf
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* Start date */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">From</label>
          <input
            type="date"
            className="input text-sm py-1.5 w-36"
            value={bt.startDate}
            onChange={e => bt.setStartDate(e.target.value)}
          />
        </div>

        {/* Load button */}
        <button
          onClick={bt.loadData}
          disabled={bt.loading}
          className="btn-primary text-sm py-1.5"
        >
          {bt.loading ? 'Loading…' : bt.sessionActive ? 'Reload' : 'Start'}
        </button>

        {/* Data source badge */}
        {bt.sessionActive && SYNTHETIC_TIMEFRAMES.has(bt.timeframe) && (
          bt.isSynthetic ? (
            <span className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Simulated Lower Timeframe
            </span>
          ) : CRYPTO_ASSETS.has(bt.asset) ? (
            <span className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-green-500/10 text-green-500 border border-green-500/20">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Real Market Data
            </span>
          ) : null
        )}

        <div className="h-5 w-px bg-border mx-1" />

        {/* Playback controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              console.log('[Backtest] PLAY clicked | isPlaying:', bt.isPlaying, '| data.length:', bt.allCandles.length);
              bt.setIsPlaying((p: boolean) => !p);
            }}
            disabled={!bt.sessionActive || bt.isAtEnd}
            className="btn-secondary text-sm py-1.5 px-3"
            title={bt.isPlaying ? 'Pause' : 'Play'}
          >
            {bt.isPlaying ? '⏸' : '▶'}
          </button>
          <button
            onClick={bt.stepForward}
            disabled={!bt.sessionActive || bt.isAtEnd || bt.isPlaying}
            className="btn-secondary text-sm py-1.5 px-3"
            title="Step +1 candle"
          >
            ⏭
          </button>
          <button
            onClick={bt.resetSession}
            disabled={!bt.sessionActive}
            className="btn-ghost text-sm py-1.5 px-3"
            title="Reset to start date"
          >
            ⏮
          </button>
        </div>

        {/* Speed */}
        <div className="flex gap-1">
          {SPEED_OPTIONS.map((s, i) => (
            <button
              key={i}
              onClick={() => bt.setSpeedIdx(i)}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                bt.speedIdx === i
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="h-5 w-px bg-border mx-1" />

        {/* Drawing tools */}
        <div className="flex items-center gap-1">
          {([
            { tool: 'trendline' as DrawingTool, label: '/' , title: 'Trendline' },
            { tool: 'rectangle' as DrawingTool, label: '▭', title: 'Rectangle' },
            { tool: 'long'      as DrawingTool, label: '↑L', title: 'Long Position' },
            { tool: 'short'     as DrawingTool, label: '↓S', title: 'Short Position' },
          ]).map(({ tool, label, title }) => (
            <button
              key={tool}
              onClick={() => setActiveTool(t => t === tool ? 'none' : tool)}
              title={title}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                activeTool === tool
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => setClearSignal(s => s + 1)}
            title="Clear all drawings"
            className="px-2.5 py-1 rounded text-xs font-medium bg-secondary text-muted-foreground hover:text-destructive transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Progress */}
        {bt.sessionActive && (
          <span className="text-xs text-muted-foreground ml-auto">{bt.progress}%</span>
        )}
      </div>

      {/* Main body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chart */}
        <div className="flex-1 relative overflow-hidden">
          {bt.error && (
            bt.sessionActive ? (
              // Warning (data range issue) — show as banner, don't block the chart
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 max-w-lg w-full px-4">
                <div className="bg-amber-500/15 border border-amber-500/40 rounded-lg px-4 py-2.5 text-amber-400 text-xs text-center shadow-lg">
                  {bt.error}
                </div>
              </div>
            ) : (
              // Fatal error — block the chart
              <div className="absolute inset-0 flex items-center justify-center z-10 bg-background/80">
                <div className="card text-center max-w-md p-8">
                  <p className="text-muted-foreground text-sm">{bt.error}</p>
                </div>
              </div>
            )
          )}
          {!bt.sessionActive && !bt.error && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-background/60">
              <div className="text-center space-y-2">
                <p className="text-muted-foreground">Select an asset and press Start to begin replay</p>
              </div>
            </div>
          )}
          <BacktestChart
            allCandles={bt.allCandles}
            currentIndex={bt.currentIndex}
            startIndex={bt.startIndex}
            openTrades={bt.openTrades}
            closedTrades={bt.closedTrades}
            activeTool={activeTool}
            onToolUsed={() => setActiveTool('none')}
            clearSignal={clearSignal}
          />
        </div>

        {/* Right panel */}
        <div className="w-72 flex flex-col border-l border-border bg-card overflow-y-auto flex-shrink-0">
          {/* Account */}
          <div className="p-4 border-b border-border space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Account</p>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Balance</span>
              <span className="font-mono font-medium">{formatCurrency(bt.balance)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Equity</span>
              <span className={`font-mono font-medium ${pnlColor(bt.equity - bt.initialBalance)}`}>{formatCurrency(bt.equity)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Session P&L</span>
              <span className={`font-mono font-medium ${pnlColor(pnlDisplay)}`}>
                {pnlDisplay >= 0 ? '+' : ''}{formatCurrency(pnlDisplay)}
              </span>
            </div>
          </div>

          {/* Metrics */}
          <div className="p-4 border-b border-border">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">Session Stats</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <MetricRow label="Trades" value={String(bt.metrics.trades)} />
              <MetricRow label="Win Rate" value={`${bt.metrics.winRate.toFixed(1)}%`} />
              <MetricRow label="Avg R:R" value={bt.metrics.avgRR.toFixed(2)} />
              <MetricRow
                label="Profit Factor"
                value={isFinite(bt.metrics.profitFactor) ? bt.metrics.profitFactor.toFixed(2) : '∞'}
              />
            </div>
          </div>

          {/* Current candle info */}
          {bt.currentCandle && (
            <div className="p-4 border-b border-border">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Current Candle</p>
              <p className="text-xs text-muted-foreground mb-1">{String(bt.currentCandle.time)}</p>
              <div className="grid grid-cols-2 gap-1 text-xs font-mono">
                <span className="text-muted-foreground">O</span><span>{formatPrice(bt.currentCandle.open as number)}</span>
                <span className="text-muted-foreground">H</span><span className="text-green-500">{formatPrice(bt.currentCandle.high as number)}</span>
                <span className="text-muted-foreground">L</span><span className="text-red-500">{formatPrice(bt.currentCandle.low as number)}</span>
                <span className="text-muted-foreground">C</span><span className="font-medium">{formatPrice(bt.currentCandle.close as number)}</span>
              </div>
            </div>
          )}

          {/* Trade entry */}
          <div className="p-4 border-b border-border">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">New Trade</p>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-muted-foreground">Size</label>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  className="input text-sm py-1.5"
                  value={tradeForm.size}
                  onChange={e => setTradeForm(f => ({ ...f, size: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Stop Loss</label>
                  <input
                    name="stopLoss"
                    type="number"
                    step="any"
                    className="input text-sm py-1.5"
                    placeholder="Price"
                    value={tradeForm.stopLoss}
                    onChange={e => setTradeForm(f => ({ ...f, stopLoss: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Take Profit</label>
                  <input
                    name="takeProfit"
                    type="number"
                    step="any"
                    className="input text-sm py-1.5"
                    placeholder="Price"
                    value={tradeForm.takeProfit}
                    onChange={e => setTradeForm(f => ({ ...f, takeProfit: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Notes</label>
                <input
                  type="text"
                  className="input text-sm py-1.5"
                  placeholder="Optional"
                  value={tradeForm.notes}
                  onChange={e => setTradeForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => bt.enterTrade('long', tradeForm)}
                  disabled={!bt.sessionActive || bt.isPlaying}
                  className="flex-1 bg-green-500/20 text-green-500 border border-green-500/40 rounded-lg py-1.5 text-xs font-medium hover:bg-green-500/30 transition-colors disabled:opacity-40"
                >
                  LONG
                </button>
                <button
                  onClick={() => bt.enterTrade('short', tradeForm)}
                  disabled={!bt.sessionActive || bt.isPlaying}
                  className="flex-1 bg-red-500/20 text-red-500 border border-red-500/40 rounded-lg py-1.5 text-xs font-medium hover:bg-red-500/30 transition-colors disabled:opacity-40"
                >
                  SHORT
                </button>
              </div>
            </div>
          </div>

          {/* Open trades */}
          {bt.openTrades.length > 0 && (
            <div className="p-4 border-b border-border">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Open Trades</p>
              <div className="space-y-2">
                {bt.openTrades.map(t => {
                  const unrealized = bt.currentCandle
                    ? t.direction === 'long'
                      ? ((bt.currentCandle.close as number) - t.entry_price) * t.size
                      : (t.entry_price - (bt.currentCandle.close as number)) * t.size
                    : 0;
                  return (
                    <div key={t.id} className="flex items-center justify-between text-xs">
                      <div>
                        <span className={t.direction === 'long' ? 'text-green-500' : 'text-red-500'}>
                          {t.direction.toUpperCase()}
                        </span>
                        <span className="text-muted-foreground ml-2">@{formatPrice(t.entry_price)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`font-mono ${pnlColor(unrealized)}`}>
                          {unrealized >= 0 ? '+' : ''}{formatCurrency(unrealized)}
                        </span>
                        <button
                          onClick={() => bt.closeTrade(t.id)}
                          disabled={bt.isPlaying}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Closed trades */}
          {bt.closedTrades.length > 0 && (
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Closed Trades</p>
                <span className="text-xs text-muted-foreground">{bt.savedThisMonth}/{bt.monthlyLimit} saved</span>
              </div>

              {saveError && <p className="text-destructive text-xs mb-2">{saveError}</p>}
              {saveSuccess && <p className="text-green-500 text-xs mb-2">{saveSuccess}</p>}

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {[...bt.closedTrades].reverse().map(t => (
                  <div key={`${t.id}_${t.exit_date}`} className="flex items-center justify-between text-xs">
                    <div>
                      <span className={t.direction === 'long' ? 'text-green-500' : 'text-red-500'}>
                        {t.direction.toUpperCase()}
                      </span>
                      <span className="text-muted-foreground ml-1 font-mono">{t.close_reason}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`font-mono font-medium ${pnlColor(t.pnl)}`}>
                        {t.pnl >= 0 ? '+' : ''}{formatCurrency(t.pnl)}
                      </span>
                      {bt.savedThisMonth < bt.monthlyLimit && (
                        <button
                          onClick={() => handleSaveTrade(t)}
                          className="text-muted-foreground hover:text-primary transition-colors text-xs"
                          title="Save to database"
                        >
                          ↑
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium text-right">{value}</span>
    </>
  );
}
