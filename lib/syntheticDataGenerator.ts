import type { OHLCCandle } from '@/types';

// ─── Seeded PRNG (Mulberry32) — same seed → same output ──────────────────────
function createRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Generate N+1 price waypoints from start→end staying within [lo, hi] ─────
function generatePath(
  rng: () => number,
  start: number,
  end: number,
  lo: number,
  hi: number,
  n: number,
  bullish: boolean,
): number[] {
  const range = hi - lo;
  if (range < 1e-10 || n <= 1) {
    return Array.from({ length: n + 1 }, (_, i) => start + (end - start) * (i / n));
  }

  const points: number[] = [start];

  for (let i = 1; i < n; i++) {
    const progress = i / n;

    // Linear interpolation toward close
    const base = start + (end - start) * progress;

    // Structural bias: first half moves toward extreme, second half pulls back to close
    const halfProgress = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
    const extreme = bullish ? hi : lo;
    const biasStrength = halfProgress * 0.25;
    const biased = base + (extreme - base) * biasStrength;

    // Controlled noise (max ±8% of range)
    const noise = (rng() - 0.5) * range * 0.16;

    points.push(Math.max(lo, Math.min(hi, biased + noise)));
  }

  points.push(end);
  return points;
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function generateSyntheticCandles(
  baseData: OHLCCandle[],
  targetTimeframe: '1M' | '5M',
): OHLCCandle[] {
  const subCount   = targetTimeframe === '1M' ? 15 : 3;
  const subSeconds = targetTimeframe === '1M' ? 60 : 300;

  // Data-age limits
  const nowSec  = Date.now() / 1000;
  const maxDays = targetTimeframe === '1M' ? 30 : 90;
  const cutoff  = nowSec - maxDays * 86400;

  // Filter to within the limit; fall back to last 500 candles if nothing qualifies
  let source = baseData.filter(c => (c.time as number) >= cutoff);
  if (source.length === 0) source = baseData.slice(-500);

  const result: OHLCCandle[] = [];

  for (const candle of source) {
    const ts      = candle.time as number;
    const { open, high, low, close, volume } = candle;
    const bullish = close >= open;
    const range   = high - low;

    const rng       = createRng(ts);
    const waypoints = generatePath(rng, open, close, low, high, subCount, bullish);

    for (let i = 0; i < subCount; i++) {
      const o        = waypoints[i];
      const c        = waypoints[i + 1];
      const maxOC    = Math.max(o, c);
      const minOC    = Math.min(o, c);

      // High: extend above max(o,c) but stay within parent high
      const wiggleUp   = range > 1e-10 ? rng() * (high - maxOC) * 0.55 : 0;
      const h          = Math.min(high, maxOC + wiggleUp);

      // Low: extend below min(o,c) but stay within parent low
      const wiggleDown = range > 1e-10 ? rng() * (minOC - low) * 0.55 : 0;
      const l          = Math.max(low, minOC - wiggleDown);

      result.push({
        time:   ts + i * subSeconds,
        open:   o,
        high:   h,
        low:    l,
        close:  c,
        volume: volume != null
          ? Math.max(0, Math.round((volume / subCount) * (0.4 + rng() * 1.2)))
          : undefined,
      });
    }
  }

  return result;
}
