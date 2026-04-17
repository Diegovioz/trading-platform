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

// ─── Main export ──────────────────────────────────────────────────────────────
export function generateSyntheticCandles(
  baseData: OHLCCandle[],
  targetTimeframe: '1M' | '5M',
): OHLCCandle[] {
  const subCount = targetTimeframe === '1M' ? 15 : 3;
  const fallbackParentSeconds = 900;

  // Data-age limits
  const nowSec  = Date.now() / 1000;
  const maxDays = targetTimeframe === '1M' ? 30 : 90;
  const cutoff  = nowSec - maxDays * 86400;

  let source = baseData.filter(c => (c.time as number) >= cutoff);
  if (source.length === 0) source = baseData.slice(-500);

  const result: OHLCCandle[] = [];

  for (let idx = 0; idx < source.length; idx++) {
    const candle = source[idx];
    const ts     = candle.time as number;
    const { open, high, low, close, volume } = candle;

    const range = high - low;

    // Actual gap to next parent candle (prevents timestamp collisions)
    const nextTs = idx + 1 < source.length
      ? (source[idx + 1].time as number)
      : ts + fallbackParentSeconds;
    const step = Math.max(1, Math.floor((nextTs - ts) / subCount));

    const rng = createRng(ts);

    // ── Step 1: Build N+1 waypoints anchored to open..close ──────────────────
    // waypoints[0]        = open  (first sub-candle opens here)
    // waypoints[subCount] = close (last sub-candle closes here)
    // All intermediate points stay within [low, high] — NO random walk/drift.
    const waypoints: number[] = [open];
    for (let i = 1; i < subCount; i++) {
      const progress = i / subCount;
      const base     = open + (close - open) * progress;          // linear anchor
      const noise    = range > 1e-10 ? (rng() - 0.5) * range * 0.25 : 0;
      waypoints.push(Math.min(high, Math.max(low, base + noise))); // always clamped
    }
    waypoints.push(close);

    // ── Step 2: Assign which sub-candle will touch high and which will touch low
    const highIdx = Math.floor(rng() * subCount);
    let   lowIdx  = Math.floor(rng() * subCount);
    // Prefer different candles for high and low touches
    if (lowIdx === highIdx) lowIdx = (highIdx + Math.floor(subCount / 2)) % subCount;

    // ── Step 3: Build each sub-candle ────────────────────────────────────────
    for (let i = 0; i < subCount; i++) {
      const o    = waypoints[i];
      const c    = waypoints[i + 1];
      const maxOC = Math.max(o, c);
      const minOC = Math.min(o, c);

      // High wick: designated candle touches parent high; others get small wiggle
      let h: number;
      if (i === highIdx) {
        h = high;
      } else {
        const wiggle = range > 1e-10 ? rng() * (high - maxOC) * 0.5 : 0;
        h = Math.min(high, maxOC + wiggle);
      }

      // Low wick: designated candle touches parent low; others get small wiggle
      let l: number;
      if (i === lowIdx) {
        l = low;
      } else {
        const wiggle = range > 1e-10 ? rng() * (minOC - low) * 0.5 : 0;
        l = Math.max(low, minOC - wiggle);
      }

      // Guarantee wick always covers the body (h >= maxOC, l <= minOC)
      h = Math.max(h, maxOC);
      l = Math.min(l, minOC);

      // Final hard clamp to parent bounds — no drift ever
      h = Math.min(high, h);
      l = Math.max(low,  l);

      result.push({
        time:   ts + i * step,
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

  // ── Validation logging ───────────────────────────────────────────────────────
  if (source.length > 0 && result.length > 0) {
    const origHigh = Math.max(...source.map(c => c.high as number));
    const origLow  = Math.min(...source.map(c => c.low  as number));
    const genHigh  = Math.max(...result.map(c => c.high as number));
    const genLow   = Math.min(...result.map(c => c.low  as number));
    const firstC   = result[0];
    const lastC    = result[result.length - 1];
    console.log(`[SyntheticGen ${targetTimeframe}] Generated ${result.length} candles from ${source.length} base candles`);
    console.log(`[SyntheticGen ${targetTimeframe}] Original: high=${origHigh}, low=${origLow}`);
    console.log(`[SyntheticGen ${targetTimeframe}] Generated: high=${genHigh}, low=${genLow}`);
    console.log(`[SyntheticGen ${targetTimeframe}] Bounds OK → high: ${genHigh <= origHigh}, low: ${genLow >= origLow}`);
    console.log(`[SyntheticGen ${targetTimeframe}] First open=${firstC.open}, Last close=${lastC.close}`);
  }

  return result;
}
