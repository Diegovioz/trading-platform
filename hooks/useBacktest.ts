'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { OHLCCandle, OpenTrade, ClosedTrade, SessionMetrics } from '@/types';

export const INITIAL_BALANCE = 100_000;
export const MONTHLY_TRADE_LIMIT = 10;

export const ASSETS = ['NQ', 'BTC', 'ETH', 'XAUUSD', 'NVDA', 'SOFI', 'TSLA'] as const;
export const TIMEFRAMES = ['1D', '4H', '1H', '15M', '5M', '1M'] as const;

export const SYNTHETIC_TIMEFRAMES = new Set(['1M', '5M']);

export const SPEED_OPTIONS = [
  { label: '0.5x', ms: 1600, step: 1 },
  { label: '1x',   ms: 800,  step: 1 },
  { label: '2x',   ms: 400,  step: 1 },
  { label: '5x',   ms: 160,  step: 1 },
  { label: '10x',  ms: 80,   step: 1 },
  { label: '50x',  ms: 80,   step: 5 },
];

// ─── SL/TP check ──────────────────────────────────────────────────────────────
function checkSlTp(candle: OHLCCandle, openTrades: OpenTrade[]) {
  const stillOpen: OpenTrade[]   = [];
  const newlyClosed: ClosedTrade[] = [];

  for (const t of openTrades) {
    let exitPrice: number | null = null;
    let closeReason: 'SL' | 'TP' | null = null;

    if (t.direction === 'long') {
      if (t.stop_loss   != null && (candle.low  as number) <= t.stop_loss)   { exitPrice = t.stop_loss;   closeReason = 'SL'; }
      else if (t.take_profit != null && (candle.high as number) >= t.take_profit) { exitPrice = t.take_profit; closeReason = 'TP'; }
    } else {
      if (t.stop_loss   != null && (candle.high as number) >= t.stop_loss)   { exitPrice = t.stop_loss;   closeReason = 'SL'; }
      else if (t.take_profit != null && (candle.low  as number) <= t.take_profit) { exitPrice = t.take_profit; closeReason = 'TP'; }
    }

    if (exitPrice != null && closeReason != null) {
      const pnl = t.direction === 'long'
        ? (exitPrice - t.entry_price) * t.size
        : (t.entry_price - exitPrice) * t.size;
      newlyClosed.push({ ...t, exit_price: exitPrice, exit_date: candle.time, pnl, close_reason: closeReason });
    } else {
      stillOpen.push(t);
    }
  }

  return { stillOpen, newlyClosed };
}

function calcPnl(trade: OpenTrade, exitPrice: number): number {
  return trade.direction === 'long'
    ? (exitPrice - trade.entry_price) * trade.size
    : (trade.entry_price - exitPrice) * trade.size;
}

function currentMonthTag(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useBacktest() {
  const [asset,     setAsset]     = useState<string>('NQ');
  const [timeframe, setTimeframe] = useState<string>('1D');
  const [startDate, setStartDate] = useState('');

  const [allCandles,    setAllCandles]    = useState<OHLCCandle[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [sessionActive, setSessionActive] = useState(false);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [startIndex,   setStartIndex]   = useState(0);
  const [isPlaying,    setIsPlaying]    = useState(false);
  const [speedIdx,     setSpeedIdx]     = useState(1);

  const [openTrades,   setOpenTrades]   = useState<OpenTrade[]>([]);
  const [closedTrades, setClosedTrades] = useState<ClosedTrade[]>([]);

  // Monthly save count
  const [savedThisMonth, setSavedThisMonth] = useState(0);

  const openTradesRef  = useRef<OpenTrade[]>([]);
  const allCandlesRef  = useRef<OHLCCandle[]>([]);
  const hasLoadedRef   = useRef(false);

  useEffect(() => { openTradesRef.current = openTrades; }, [openTrades]);
  useEffect(() => { allCandlesRef.current = allCandles; }, [allCandles]);

  const supabase = createClient();

  // Load monthly saved count
  useEffect(() => {
    async function loadCount() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const monthTag = currentMonthTag();
      const { count } = await supabase
        .from('backtest_trades')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('month_tag', monthTag);
      setSavedThisMonth(count ?? 0);
    }
    loadCount();
  }, []);

  const currentCandle = allCandles[currentIndex] ?? null;

  // ─── Load data ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setIsPlaying(false);

    try {
      const res = await fetch(`/api/ohlc?asset=${asset}&timeframe=${timeframe}`);
      if (!res.ok) throw new Error('Failed to load data');
      const data: OHLCCandle[] = await res.json();

      if (!data?.length) {
        setError(`No data for ${asset} ${timeframe}.`);
        setLoading(false);
        return;
      }

      let idx = 0;
      if (startDate) {
        if (timeframe === '1D') {
          const found = data.findIndex(c => (c.time as string) >= startDate);
          idx = found >= 0 ? found : data.length - 1;
        } else {
          const fromTs = Math.floor(new Date(startDate + 'T00:00:00Z').getTime() / 1000);
          const firstTs = data[0].time as number;

          // If the requested start date is before all available data, warn and start from the beginning
          if (fromTs < firstTs) {
            // For synthetic timeframes don't show an error — just start from beginning
            if (!SYNTHETIC_TIMEFRAMES.has(timeframe)) {
              const firstDate = new Date(firstTs * 1000).toISOString().split('T')[0];
              setError(
                `⚠️ ${asset} ${timeframe} data only starts on ${firstDate}. ` +
                `Run scripts/download_data.py to refresh. Starting from first available candle.`
              );
              setTimeout(() => setError(null), 6000);
            }
            idx = 0;
          } else {
            const found = data.findIndex(c => (c.time as number) >= fromTs);
            idx = found >= 0 ? found : data.length - 1;
          }
        }
      }

      setAllCandles(data);
      setStartIndex(idx);
      setCurrentIndex(idx);
      setOpenTrades([]);
      setClosedTrades([]);
      setSessionActive(true);
      hasLoadedRef.current = true;
    } catch (e) {
      setError((e as Error).message || 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  }, [asset, timeframe, startDate]);

  const loadDataRef = useRef(loadData);
  useEffect(() => { loadDataRef.current = loadData; });

  const prevAssetTfRef = useRef<string | null>(null);
  useEffect(() => {
    const key = `${asset}_${timeframe}`;
    if (hasLoadedRef.current && prevAssetTfRef.current !== null && prevAssetTfRef.current !== key) {
      loadDataRef.current();
    }
    prevAssetTfRef.current = key;
  }, [asset, timeframe]);

  // ─── Replay tick ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying) return;
    const { ms, step } = SPEED_OPTIONS[speedIdx] ?? SPEED_OPTIONS[1];

    const tick = () => {
      setCurrentIndex(prev => {
        const candles = allCandlesRef.current;
        if (prev >= candles.length - 1) { setIsPlaying(false); return prev; }

        const next = Math.min(prev + step, candles.length - 1);
        let currentOpen = openTradesRef.current;
        let allClosed: ClosedTrade[] = [];

        for (let i = prev + 1; i <= next; i++) {
          const { stillOpen, newlyClosed } = checkSlTp(candles[i], currentOpen);
          currentOpen = stillOpen;
          allClosed   = allClosed.concat(newlyClosed);
        }

        if (allClosed.length > 0) {
          openTradesRef.current = currentOpen;
          setClosedTrades(c => [...c, ...allClosed]);
          setOpenTrades(currentOpen);
        }

        return next;
      });
    };

    const id = setInterval(tick, ms);
    return () => clearInterval(id);
  }, [isPlaying, speedIdx]);

  // ─── Step forward ──────────────────────────────────────────────────────────
  const stepForward = useCallback(() => {
    if (currentIndex >= allCandles.length - 1) return;
    const next = currentIndex + 1;
    const { stillOpen, newlyClosed } = checkSlTp(allCandles[next], openTrades);
    if (newlyClosed.length > 0) {
      setClosedTrades(c => [...c, ...newlyClosed]);
      setOpenTrades(stillOpen);
    }
    setCurrentIndex(next);
  }, [currentIndex, allCandles, openTrades]);

  // ─── Enter trade ──────────────────────────────────────────────────────────
  const enterTrade = useCallback((
    direction: 'long' | 'short',
    { stopLoss, takeProfit, size, notes }: { stopLoss?: string; takeProfit?: string; size: string; notes?: string }
  ) => {
    if (!currentCandle) return;
    const newTrade: OpenTrade = {
      id:          Date.now(),
      asset,
      timeframe,
      direction,
      entry_price: currentCandle.close as number,
      stop_loss:   stopLoss   ? parseFloat(stopLoss)   : null,
      take_profit: takeProfit ? parseFloat(takeProfit) : null,
      size:        parseFloat(size) || 1,
      entry_date:  currentCandle.time,
      notes:       notes || null,
    };
    setOpenTrades(prev => {
      const updated = [...prev, newTrade];
      openTradesRef.current = updated;
      return updated;
    });
  }, [currentCandle, asset, timeframe]);

  // ─── Close trade ──────────────────────────────────────────────────────────
  const closeTrade = useCallback((tradeId: number) => {
    if (!currentCandle) return;
    setOpenTrades(prev => {
      const trade = prev.find(t => t.id === tradeId);
      if (!trade) return prev;
      const exitPrice = currentCandle.close as number;
      const pnl       = calcPnl(trade, exitPrice);
      const closed: ClosedTrade = { ...trade, exit_price: exitPrice, exit_date: currentCandle.time, pnl, close_reason: 'Manual' };
      setClosedTrades(c => [...c, closed]);
      const updated = prev.filter(t => t.id !== tradeId);
      openTradesRef.current = updated;
      return updated;
    });
  }, [currentCandle]);

  // ─── Save trade to Supabase ────────────────────────────────────────────────
  const saveTrade = useCallback(async (trade: ClosedTrade): Promise<{ error?: string }> => {
    if (savedThisMonth >= MONTHLY_TRADE_LIMIT) {
      return { error: `Monthly limit of ${MONTHLY_TRADE_LIMIT} saved trades reached.` };
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    const monthTag = currentMonthTag();

    const { error } = await supabase.from('backtest_trades').insert({
      user_id:      user.id,
      asset:        trade.asset,
      timeframe:    trade.timeframe,
      direction:    trade.direction,
      entry_price:  trade.entry_price,
      exit_price:   trade.exit_price,
      stop_loss:    trade.stop_loss,
      take_profit:  trade.take_profit,
      size:         trade.size,
      pnl:          trade.pnl,
      notes:        trade.notes,
      entry_date:   String(trade.entry_date),
      exit_date:    String(trade.exit_date),
      close_reason: trade.close_reason,
      month_tag:    monthTag,
    });

    if (!error) setSavedThisMonth(c => c + 1);
    return { error: error?.message };
  }, [savedThisMonth, supabase]);

  // ─── Reset session ─────────────────────────────────────────────────────────
  const resetSession = useCallback(() => {
    setCurrentIndex(startIndex);
    setOpenTrades([]);
    setClosedTrades([]);
    setIsPlaying(false);
    openTradesRef.current = [];
  }, [startIndex]);

  // ─── Account metrics ───────────────────────────────────────────────────────
  const balance = useMemo(() =>
    INITIAL_BALANCE + closedTrades.reduce((s, t) => s + t.pnl, 0),
  [closedTrades]);

  const equity = useMemo(() => {
    if (!currentCandle) return balance;
    const unrealized = openTrades.reduce((s, t) => {
      const u = t.direction === 'long'
        ? ((currentCandle.close as number) - t.entry_price) * t.size
        : (t.entry_price - (currentCandle.close as number)) * t.size;
      return s + u;
    }, 0);
    return balance + unrealized;
  }, [balance, openTrades, currentCandle]);

  const metrics: SessionMetrics = useMemo(() => {
    const total = closedTrades.length;
    if (!total) return { totalPnl: 0, winRate: 0, trades: 0, avgRR: 0, profitFactor: 0 };
    const wins     = closedTrades.filter(t => t.pnl > 0).length;
    const totalPnl = closedTrades.reduce((s, t) => s + t.pnl, 0);
    const gross_p  = closedTrades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
    const gross_l  = Math.abs(closedTrades.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
    const rrVals   = closedTrades
      .filter(t => t.stop_loss != null)
      .map(t => {
        const risk = t.direction === 'long'
          ? (t.entry_price - t.stop_loss!) * t.size
          : (t.stop_loss! - t.entry_price) * t.size;
        return risk > 0 ? t.pnl / risk : null;
      }).filter((v): v is number => v != null);
    return {
      totalPnl,
      winRate:      (wins / total) * 100,
      trades:       total,
      avgRR:        rrVals.length ? rrVals.reduce((s, v) => s + v, 0) / rrVals.length : 0,
      profitFactor: gross_l > 0 ? gross_p / gross_l : gross_p > 0 ? Infinity : 0,
    };
  }, [closedTrades]);

  const progress = allCandles.length > 1
    ? Math.round(((currentIndex - startIndex) / Math.max(allCandles.length - 1 - startIndex, 1)) * 100)
    : 0;

  return {
    asset, setAsset,
    timeframe, setTimeframe,
    startDate, setStartDate,
    allCandles,
    currentIndex,
    startIndex,
    currentCandle,
    loading, error,
    sessionActive,
    progress,
    isAtEnd: currentIndex >= allCandles.length - 1,
    isPlaying, setIsPlaying,
    speedIdx, setSpeedIdx,
    loadData,
    stepForward,
    resetSession,
    enterTrade,
    closeTrade,
    saveTrade,
    openTrades,
    closedTrades,
    metrics,
    balance,
    equity,
    initialBalance: INITIAL_BALANCE,
    savedThisMonth,
    monthlyLimit: MONTHLY_TRADE_LIMIT,
    isSynthetic: SYNTHETIC_TIMEFRAMES.has(timeframe),
  };
}
