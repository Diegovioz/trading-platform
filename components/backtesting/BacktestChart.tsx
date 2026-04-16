'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { IChartApi, ISeriesApi, CandlestickSeriesOptions } from 'lightweight-charts';
import type { OHLCCandle, OpenTrade, ClosedTrade } from '@/types';

export type DrawingTool = 'none' | 'trendline' | 'rectangle' | 'long' | 'short';

interface Point { x: number; y: number; price: number; time: number }

// Each committed drawing
interface Drawing {
  id: number;
  tool: DrawingTool;
  p1: Point;   // anchor1 / entry price
  p2: Point;   // anchor2 / TP price
  p3?: Point;  // SL price (long/short only)
}

// In-progress drawing (multi-step for long/short)
interface Pending {
  p1: Point;   // first anchor / entry
  p2?: Point;  // TP (long/short step 2)
}

let _idCounter = 0;

const COLORS = {
  bg: '#0d1117', grid: '#1e2938', border: '#1e2938', text: '#9ca3af',
  up: '#22c55e', down: '#ef4444',
};
const TOOL_CLR: Record<string, string> = {
  trendline: '#f59e0b', rectangle: '#818cf8',
  long: '#22c55e', short: '#ef4444',
};

interface BacktestChartProps {
  allCandles:   OHLCCandle[];
  currentIndex: number;
  startIndex:   number;
  openTrades:   OpenTrade[];
  closedTrades: ClosedTrade[];
  activeTool:   DrawingTool;
  onToolUsed:   () => void;
  clearSignal:  number;
}

export default function BacktestChart({
  allCandles, currentIndex, startIndex,
  openTrades, closedTrades,
  activeTool, onToolUsed, clearSignal,
}: BacktestChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const seriesRef    = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [chartReady, setChartReady] = useState(false);

  // ── Drawing state (all refs → no re-renders) ─────────────────────────────────
  const drawingsRef   = useRef<Drawing[]>([]);
  const pendingRef    = useRef<Pending | null>(null);
  const activeToolRef = useRef<DrawingTool>('none');
  const mouseRef      = useRef<{ x: number; y: number } | null>(null);
  // Drag state
  const dragRef       = useRef<{ id: number; handle: 'p2' | 'p3' } | null>(null);
  const wasDragRef    = useRef(false);

  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function toX(time: number): number {
    try { return (chartRef.current?.timeScale().timeToCoordinate(time as never)) ?? -9999; }
    catch (_e) { return -9999; }
  }
  function toY(price: number): number {
    try { return (seriesRef.current?.priceToCoordinate(price)) ?? -9999; }
    catch (_e) { return -9999; }
  }

  function getChartPoint(e: React.MouseEvent<HTMLCanvasElement>): Point | null {
    try {
      const chart  = chartRef.current;
      const series = seriesRef.current;
      const canvas = canvasRef.current;
      if (!chart || !series || !canvas) return null;
      const rect  = canvas.getBoundingClientRect();
      const x     = e.clientX - rect.left;
      const y     = e.clientY - rect.top;
      const time  = chart.timeScale().coordinateToTime(x);
      const price = series.coordinateToPrice(y);
      if (time == null || price == null) return null;
      return { x, y, price: price as number, time: time as number };
    } catch (_e) { return null; }
  }

  const findHandle = useCallback((x: number, y: number): { id: number; handle: 'p2' | 'p3' } | null => {
    try {
      for (const d of drawingsRef.current) {
        if (d.tool !== 'long' && d.tool !== 'short') continue;
        const tpY = toY(d.p2.price);
        if (Math.abs(y - tpY) < 8) return { id: d.id, handle: 'p2' };
        if (d.p3) {
          const slY = toY(d.p3.price);
          if (Math.abs(y - slY) < 8) return { id: d.id, handle: 'p3' };
        }
      }
      return null;
    } catch (_e) { return null; }
  }, []);

  // ── Canvas redraw ─────────────────────────────────────────────────────────────
  const redrawCanvas = useCallback(() => {
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width  = rect.width;
        canvas.height = rect.height;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const W = canvas.width;

      // ── Draw committed drawings ──
      for (const d of drawingsRef.current) {
        const color = TOOL_CLR[d.tool] ?? '#fff';
        ctx.lineWidth = 1.5;

        if (d.tool === 'trendline') {
          const x1 = toX(d.p1.time), y1 = toY(d.p1.price);
          const x2 = toX(d.p2.time), y2 = toY(d.p2.price);
          ctx.strokeStyle = color;
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();

        } else if (d.tool === 'rectangle') {
          const x1 = toX(d.p1.time), y1 = toY(d.p1.price);
          const x2 = toX(d.p2.time), y2 = toY(d.p2.price);
          ctx.strokeStyle = color; ctx.fillStyle = color + '22';
          ctx.beginPath(); ctx.rect(x1, y1, x2 - x1, y2 - y1);
          ctx.fill(); ctx.stroke();

        } else if ((d.tool === 'long' || d.tool === 'short') && d.p3) {
          const isLong  = d.tool === 'long';
          const entryY  = toY(d.p1.price);
          const tpY     = toY(d.p2.price);
          const slY     = toY(d.p3.price);

          // Zones
          ctx.fillStyle = '#22c55e18';
          ctx.fillRect(0, Math.min(entryY, tpY), W, Math.abs(tpY - entryY));
          ctx.fillStyle = '#ef444418';
          ctx.fillRect(0, Math.min(entryY, slY), W, Math.abs(slY - entryY));

          // Lines
          const lineData = [
            { y: entryY, color: '#e2e8f0', label: `Entry  $${d.p1.price.toFixed(2)}`, dash: [] },
            { y: tpY,    color: '#22c55e', label: `TP  $${d.p2.price.toFixed(2)}`,    dash: [6, 3] },
            { y: slY,    color: '#ef4444', label: `SL  $${d.p3.price.toFixed(2)}`,    dash: [6, 3] },
          ];
          for (const { y, color: lc, label, dash } of lineData) {
            ctx.strokeStyle = lc;
            ctx.setLineDash(dash);
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = lc;
            ctx.font = 'bold 11px monospace';
            ctx.fillText(label, 6, y - 4);
          }

          // RR label
          const risk   = Math.abs(d.p1.price - d.p3.price);
          const reward = Math.abs(d.p2.price - d.p1.price);
          const rr     = risk > 0 ? (reward / risk).toFixed(2) : '—';
          const dir    = isLong ? '↑ LONG' : '↓ SHORT';
          ctx.fillStyle = isLong ? '#22c55e' : '#ef4444';
          ctx.font = 'bold 12px monospace';
          ctx.fillText(`${dir}  RR ${rr}`, 6, Math.min(entryY, tpY) - 8);

          // Drag handles (small circles on TP and SL)
          for (const { y: hy, color: hc } of [{ y: tpY, color: '#22c55e' }, { y: slY, color: '#ef4444' }]) {
            ctx.strokeStyle = hc; ctx.fillStyle = hc + '44';
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(W - 20, hy, 5, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();
          }
        }
      }

      // ── Ghost preview (in-progress drawing) ──
      const pending = pendingRef.current;
      const mouse   = mouseRef.current;
      const tool    = activeToolRef.current;
      if (!pending || !mouse) return;

      const ghostColor = (TOOL_CLR[tool] ?? '#fff') + 'aa';
      ctx.strokeStyle = ghostColor;
      ctx.lineWidth   = 1;
      ctx.setLineDash([5, 4]);

      if (tool === 'trendline' || tool === 'rectangle') {
        const x1 = toX(pending.p1.time), y1 = toY(pending.p1.price);
        if (tool === 'trendline') {
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
        } else {
          ctx.fillStyle = ghostColor + '33';
          ctx.beginPath(); ctx.rect(x1, y1, mouse.x - x1, mouse.y - y1);
          ctx.fill(); ctx.stroke();
        }

      } else if (tool === 'long' || tool === 'short') {
        const entryY = toY(pending.p1.price);

        if (!pending.p2) {
          // Step 2: entry placed, ghost TP at mouse
          ctx.strokeStyle = '#22c55e88';
          ctx.beginPath(); ctx.moveTo(0, entryY); ctx.lineTo(W, entryY); ctx.stroke();
          ctx.strokeStyle = '#22c55e88';
          ctx.beginPath(); ctx.moveTo(0, mouse.y); ctx.lineTo(W, mouse.y); ctx.stroke();
          ctx.fillStyle = '#22c55e11';
          ctx.fillRect(0, Math.min(entryY, mouse.y), W, Math.abs(mouse.y - entryY));
          ctx.fillStyle = '#22c55e88';
          ctx.font = '11px monospace';
          ctx.fillText('← click to set TP', mouse.x + 8, mouse.y - 4);

        } else {
          // Step 3: TP placed, ghost SL at mouse
          const tpY = toY(pending.p2.price);
          ctx.strokeStyle = '#22c55e66';
          ctx.beginPath(); ctx.moveTo(0, entryY); ctx.lineTo(W, entryY); ctx.stroke();
          ctx.strokeStyle = '#22c55e66';
          ctx.beginPath(); ctx.moveTo(0, tpY); ctx.lineTo(W, tpY); ctx.stroke();
          ctx.strokeStyle = '#ef444488';
          ctx.beginPath(); ctx.moveTo(0, mouse.y); ctx.lineTo(W, mouse.y); ctx.stroke();
          ctx.fillStyle = '#22c55e11';
          ctx.fillRect(0, Math.min(entryY, tpY), W, Math.abs(tpY - entryY));
          ctx.fillStyle = '#ef444411';
          ctx.fillRect(0, Math.min(entryY, mouse.y), W, Math.abs(mouse.y - entryY));
          ctx.fillStyle = '#ef444488';
          ctx.font = '11px monospace';
          ctx.fillText('← click to set SL', mouse.x + 8, mouse.y - 4);
        }
      }

      ctx.setLineDash([]);
    } catch (_e) {
      // Never let canvas crash the chart
    }
  }, []);

  // ── Init chart once ───────────────────────────────────────────────────────────
  const initDone = useRef(false);
  useEffect(() => {
    if (initDone.current || !containerRef.current) return;
    initDone.current = true;
    let destroyed = false;

    import('lightweight-charts').then(({ createChart, CandlestickSeries }) => {
      if (destroyed || !containerRef.current) return;

      const chart = createChart(containerRef.current, {
        autoSize: true,
        layout: { background: { color: COLORS.bg }, textColor: COLORS.text },
        grid: { vertLines: { color: COLORS.grid }, horzLines: { color: COLORS.grid } },
        crosshair: { mode: 1 },
        rightPriceScale: { borderColor: COLORS.border },
        timeScale: {
          borderColor: COLORS.border,
          timeVisible: true, secondsVisible: false,
          rightOffset: 5, barSpacing: 8,
        },
      });

      const series = chart.addSeries(CandlestickSeries, {
        upColor: COLORS.up, downColor: COLORS.down,
        borderUpColor: COLORS.up, borderDownColor: COLORS.down,
        wickUpColor: COLORS.up, wickDownColor: COLORS.down,
      } as Partial<CandlestickSeriesOptions>);

      chartRef.current  = chart;
      seriesRef.current = series;

      try {
        chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
          try { redrawCanvas(); } catch (_e) { /* noop */ }
        });
      } catch (_e) { /* noop */ }

      setChartReady(true);
    });

    return () => {
      destroyed = true;
      chartRef.current?.remove();
      chartRef.current  = null;
      seriesRef.current = null;
      initDone.current  = false;
      setChartReady(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Update candles ────────────────────────────────────────────────────────────
  useEffect(() => {
    const series = seriesRef.current;
    const chart  = chartRef.current;
    if (!chartReady || !series || !chart || !allCandles.length) return;

    const sliced = allCandles.slice(0, currentIndex + 1) as Parameters<typeof series.setData>[0];
    if (currentIndex === startIndex) {
      series.setData(sliced);
      chart.timeScale().fitContent();
    } else {
      series.update(sliced[sliced.length - 1] as Parameters<typeof series.update>[0]);
      chart.timeScale().scrollToPosition(0, false);
    }
  }, [allCandles, currentIndex, startIndex, chartReady]);

  // ── Trade markers ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    import('lightweight-charts').then(({ createSeriesMarkers }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const markers: any[] = [];
      closedTrades.forEach(t => {
        markers.push({ time: t.entry_date as never, position: t.direction === 'long' ? 'belowBar' : 'aboveBar', color: t.direction === 'long' ? COLORS.up : COLORS.down, shape: t.direction === 'long' ? 'arrowUp' : 'arrowDown', text: `${t.direction === 'long' ? 'L' : 'S'} ${t.pnl >= 0 ? '+' : ''}$${t.pnl.toFixed(0)}`, size: 1 });
        markers.push({ time: t.exit_date as never, position: t.direction === 'long' ? 'aboveBar' : 'belowBar', color: t.pnl >= 0 ? COLORS.up : COLORS.down, shape: 'circle', text: `Close ${t.close_reason}`, size: 0.5 });
      });
      openTrades.forEach(t => {
        markers.push({ time: t.entry_date as never, position: t.direction === 'long' ? 'belowBar' : 'aboveBar', color: '#f59e0b', shape: t.direction === 'long' ? 'arrowUp' : 'arrowDown', text: 'open', size: 1 });
      });
      markers.sort((a: any, b: any) => String(a.time) < String(b.time) ? -1 : 1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createSeriesMarkers(series as any, markers);
    });
  }, [closedTrades, openTrades]);

  // ── Clear signal ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (clearSignal === 0) return;
    drawingsRef.current = [];
    pendingRef.current  = null;
    redrawCanvas();
  }, [clearSignal, redrawCanvas]);

  // ── Document-level mouse tracking ─────────────────────────────────────────────
  // Handles drag + canvas pointer-events toggling transparently to the chart
  useEffect(() => {
    if (!chartReady) return;

    function onMove(e: MouseEvent) {
      try {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect   = canvas.getBoundingClientRect();
        const x      = e.clientX - rect.left;
        const y      = e.clientY - rect.top;
        const inside = x >= 0 && x <= rect.width && y >= 0 && y <= rect.height;

        // While dragging a handle
        if (dragRef.current) {
          wasDragRef.current = true;
          const series = seriesRef.current;
          if (series) {
            const price = series.coordinateToPrice(y) as number | null;
            if (price != null) {
              const d = drawingsRef.current.find(dr => dr.id === dragRef.current!.id);
              if (d) {
                if (dragRef.current.handle === 'p2') {
                  d.p2 = { ...d.p2, price };
                } else {
                  d.p3 = d.p3 ? { ...d.p3, price } : { x, y, price, time: d.p1.time };
                }
              }
            }
          }
          mouseRef.current = inside ? { x, y } : null;
          redrawCanvas();
          return;
        }

        mouseRef.current = inside ? { x, y } : null;

        // Decide if canvas should capture pointer events
        const tool   = activeToolRef.current;
        const handle = inside ? findHandle(x, y) : null;
        const needs  = tool !== 'none' || handle != null;
        canvas.style.pointerEvents = needs ? 'auto' : 'none';
        canvas.style.cursor        = handle ? 'ns-resize' : (tool !== 'none' ? 'crosshair' : 'default');

        // Redraw ghost while drawing
        if (tool !== 'none' && pendingRef.current) redrawCanvas();
      } catch (_e) { /* noop */ }
    }

    function onUp() {
      try {
        if (dragRef.current) {
          dragRef.current = null;
          redrawCanvas();
        }
      } catch (_e) { /* noop */ }
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [chartReady, findHandle, redrawCanvas]);

  // ── Canvas event handlers (only fire when pointer-events: auto) ───────────────
  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    try {
      if (activeToolRef.current !== 'none') return; // clicks handled by onClick
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect   = canvas.getBoundingClientRect();
      const x      = e.clientX - rect.left;
      const y      = e.clientY - rect.top;
      wasDragRef.current = false;
      const handle = findHandle(x, y);
      if (handle) {
        dragRef.current = handle;
        e.preventDefault();
      }
    } catch (_e) { /* noop */ }
  }

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    try {
      if (wasDragRef.current) { wasDragRef.current = false; return; }
      if (activeToolRef.current === 'none') return;

      const pt = getChartPoint(e);
      if (!pt) return;

      const tool    = activeToolRef.current;
      const pending = pendingRef.current;
      const isLS    = tool === 'long' || tool === 'short';

      if (!pending) {
        // Step 1: first anchor / entry
        pendingRef.current = { p1: pt };

      } else if (isLS && !pending.p2) {
        // Step 2 (long/short): set TP
        pendingRef.current = { p1: pending.p1, p2: pt };

      } else if (isLS && pending.p2) {
        // Step 3 (long/short): set SL → commit
        drawingsRef.current = [
          ...drawingsRef.current,
          { id: ++_idCounter, tool, p1: pending.p1, p2: pending.p2, p3: pt },
        ];
        pendingRef.current = null;
        onToolUsed();

      } else {
        // Step 2 (trendline / rectangle): commit
        drawingsRef.current = [
          ...drawingsRef.current,
          { id: ++_idCounter, tool, p1: pending.p1, p2: pt },
        ];
        pendingRef.current = null;
        onToolUsed();
      }

      redrawCanvas();
    } catch (_e) { /* noop */ }
  }

  return (
    <div ref={containerRef} className="w-full h-full relative" style={{ minHeight: 400 }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: 'none', zIndex: 10 }}
        onMouseDown={handleMouseDown}
        onClick={handleCanvasClick}
      />
    </div>
  );
}
