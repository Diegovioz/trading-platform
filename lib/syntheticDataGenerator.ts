import type { OHLCCandle } from '@/types';

// Seeded PRNG (Mulberry32) — same seed → same output every time
function createRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; // [0, 1)
  };
}

export function generateSyntheticCandles(
  baseData: OHLCCandle[],
  targetTimeframe: '1M' | '5M',
): OHLCCandle[] {
  const subCount = targetTimeframe === '1M' ? 15 : 3;
  const fallbackParentSeconds = 900; // 15 min

  // Data-age limits: only use recent candles so data stays realistic
  const nowSec  = Date.now() / 1000;
  const maxDays = targetTimeframe === '1M' ? 30 : 90;
  const cutoff  = nowSec - maxDays * 86400;

  let source = baseData.filter(c => (c.time as number) >= cutoff);
  if (source.length === 0) source = baseData.slice(-500);

  const result: OHLCCandle[] = [];

  for (let idx = 0; idx < source.length; idx++) {
    const parent  = source[idx];
    const ts      = parent.time as number;
    const { open, high, low, close, volume } = parent;
    const range   = high - low;

    // Timestamp step: use actual gap to next candle, never fixed — prevents collisions
    const nextTs = idx + 1 < source.length
      ? (source[idx + 1].time as number)
      : ts + fallbackParentSeconds;
    const step = Math.max(1, Math.floor((nextTs - ts) / subCount));

    const rng = createRng(ts);

    // Build sub-candles one by one
    let prevClose = open; // first sub-candle opens at the parent open

    for (let i = 0; i < subCount; i++) {
      const isLast   = i === subCount - 1;
      const subOpen  = prevClose; // continuity: each candle opens where the previous closed

      // Anchor close to the linear path open→close, add tiny noise
      let subClose: number;
      if (isLast) {
        subClose = close; // last sub-candle MUST close at parent close
      } else {
        const progress = (i + 1) / subCount;
        const base     = open + (close - open) * progress;
        const noise    = range * 0.02 * (rng() * 2 - 1); // ±2% of range
        subClose = Math.min(high, Math.max(low, base + noise));
      }

      // Wick: extend slightly beyond body, hard-clamped inside parent range
      const bodyHigh = Math.max(subOpen, subClose);
      const bodyLow  = Math.min(subOpen, subClose);
      const wickUp   = range > 1e-10 ? rng() * range * 0.03 : 0; // up to 3% of range
      const wickDown = range > 1e-10 ? rng() * range * 0.03 : 0;

      const subHigh = Math.min(high, bodyHigh + wickUp);
      const subLow  = Math.max(low,  bodyLow  - wickDown);

      result.push({
        time:   ts + i * step,
        open:   subOpen,
        high:   subHigh,
        low:    subLow,
        close:  subClose,
        volume: volume != null
          ? Math.max(0, Math.round((volume / subCount) * (0.4 + rng() * 1.2)))
          : undefined,
      });

      prevClose = subClose;
    }
  }

  return result;
}
