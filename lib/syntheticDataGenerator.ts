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
  const subCount    = targetTimeframe === '1M' ? 15 : 3;
  const stepSeconds = targetTimeframe === '1M' ? 60 : 300; // fixed step per sub-candle

  const result: OHLCCandle[] = [];

  for (let idx = 0; idx < baseData.length; idx++) {
    const parent = baseData[idx];
    const ts     = parent.time as number;
    const { open, high, low, close, volume } = parent;
    const range  = high - low;

    const rng = createRng(ts);
    let prevClose = open; // first sub-candle opens at parent open

    for (let i = 0; i < subCount; i++) {
      const isLast = i === subCount - 1;

      // Linear progress through parent candle
      const progress  = i / subCount;
      const basePrice = open + (close - open) * progress;

      // Deterministic noise: ±1% of range
      const noise     = range * 0.01 * (rng() * 2 - 1);
      let   price     = isLast ? close : Math.min(high, Math.max(low, basePrice + noise));

      const subOpen  = prevClose;
      const subClose = price;

      // High/low strictly clamped inside parent range
      const subHigh = Math.min(high, Math.max(subOpen, subClose));
      const subLow  = Math.max(low,  Math.min(subOpen, subClose));

      result.push({
        time:   ts + i * stepSeconds,
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
