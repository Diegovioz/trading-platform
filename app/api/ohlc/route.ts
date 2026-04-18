import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse } from 'csv-parse/sync';
import { generateSyntheticCandles } from '@/lib/syntheticDataGenerator';
import type { OHLCCandle } from '@/types';

// ─── In-memory cache (generated once, never regenerated per process) ──────────
const cache = new Map<string, OHLCCandle[]>();

// Set to true to re-enable synthetic 5M/1M generation for non-crypto assets
const ENABLE_SYNTHETIC = false;

const DATA_DIR = join(process.cwd(), 'public', 'data');

const CRYPTO_ASSETS = new Set(['BTC', 'ETH']);
const SYNTHETIC_TIMEFRAMES = new Set(['1M', '5M']);

// Higher timeframes derived from M15 — bucket size in seconds
const DERIVED_BUCKET_SECONDS: Record<string, number> = {
  '1H': 3_600,
  '4H': 14_400,
  '1D': 86_400,
};

// ─── CSV helpers ─────────────────────────────────────────────────────────────
function readIntradayCsv(asset: string, suffix: string): OHLCCandle[] | null {
  const filePath = join(DATA_DIR, `${asset}_${suffix}.csv`);
  if (!existsSync(filePath)) return null;

  const raw  = readFileSync(filePath, 'utf8');
  const rows = parse(raw, { columns: true, skip_empty_lines: true, cast: true });

  return rows.map((r: Record<string, unknown>) => ({
    time:   Number(r.timestamp),
    open:   Number(r.open),
    high:   Number(r.high),
    low:    Number(r.low),
    close:  Number(r.close),
    volume: Number(r.volume ?? 0),
  }));
}

// ─── Aggregation ─────────────────────────────────────────────────────────────
/**
 * Aggregate M15 candles into larger time buckets using time-based alignment.
 * Each output candle represents one complete bucket (hour, 4h, day).
 */
function aggregateByBucket(base: OHLCCandle[], bucketSeconds: number): OHLCCandle[] {
  if (base.length === 0) return [];

  const result: OHLCCandle[] = [];
  let bucketStart = -1;
  let open = 0, high = 0, low = Infinity, close = 0, volume = 0;
  let count = 0;

  for (const c of base) {
    const ts = c.time as number;
    const bucket = Math.floor(ts / bucketSeconds) * bucketSeconds;

    if (bucket !== bucketStart) {
      // Flush previous bucket
      if (count > 0) {
        result.push({ time: bucketStart, open, high, low, close, volume });
      }
      // Start new bucket
      bucketStart = bucket;
      open   = c.open;
      high   = c.high;
      low    = c.low;
      close  = c.close;
      volume = c.volume ?? 0;
      count  = 1;
    } else {
      high   = Math.max(high, c.high);
      low    = Math.min(low,  c.low);
      close  = c.close;
      volume += c.volume ?? 0;
      count++;
    }
  }

  // Flush last bucket
  if (count > 0) {
    result.push({ time: bucketStart, open, high, low, close, volume });
  }

  return result;
}

function validateAggregation(base: OHLCCandle[], derived: OHLCCandle[], label: string): void {
  let missingCount = 0;

  for (const d of derived) {
    if (d.high < d.open || d.high < d.close || d.low > d.open || d.low > d.close) {
      console.warn(`[OHLC] ${label} OHLC inconsistency at time ${d.time}`);
      missingCount++;
    }
  }

  if (missingCount > 0) {
    console.warn(`[OHLC] ${label}: ${missingCount} inconsistent candles out of ${derived.length}`);
  } else {
    console.log(`[OHLC] ${label}: ${base.length} M15 → ${derived.length} candles ✓`);
  }
}

// ─── Route ────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const asset     = searchParams.get('asset')?.toUpperCase();
  const timeframe = searchParams.get('timeframe')?.toUpperCase();

  if (!asset || !timeframe) {
    return NextResponse.json({ error: 'asset and timeframe are required' }, { status: 400 });
  }

  const key = `${asset}_${timeframe}`;
  if (cache.has(key)) {
    return NextResponse.json(cache.get(key));
  }

  // ── M15: single source of truth — read directly from CSV ─────────────────
  if (timeframe === '15M') {
    const candles = readIntradayCsv(asset, '15m');
    if (!candles || candles.length === 0) {
      return NextResponse.json({ error: `No 15M data found for ${asset}.` }, { status: 404 });
    }
    cache.set(key, candles);
    return NextResponse.json(candles);
  }

  // ── H1, 4H, 1D: derived from M15 via time-bucket aggregation ─────────────
  if (timeframe in DERIVED_BUCKET_SECONDS) {
    const bucketSeconds = DERIVED_BUCKET_SECONDS[timeframe];

    // Load M15 base (reuse from cache)
    const m15Key = `${asset}_15M`;
    let base15 = cache.get(m15Key) ?? null;
    if (!base15) {
      base15 = readIntradayCsv(asset, '15m');
      if (!base15 || base15.length === 0) {
        return NextResponse.json(
          { error: `No M15 base data for ${asset}. Run download_data.py first.` },
          { status: 404 }
        );
      }
      cache.set(m15Key, base15);
    }

    const candles = aggregateByBucket(base15, bucketSeconds);
    if (candles.length === 0) {
      return NextResponse.json({ error: `Aggregation produced no candles for ${asset} ${timeframe}.` }, { status: 500 });
    }

    validateAggregation(base15, candles, `${asset} ${timeframe}`);
    cache.set(key, candles);
    return NextResponse.json(candles);
  }

  // ── 5M / 1M ───────────────────────────────────────────────────────────────
  if (SYNTHETIC_TIMEFRAMES.has(timeframe)) {
    const suffix = timeframe === '5M' ? '5m' : '1m';

    // Crypto: try real CSV first
    if (CRYPTO_ASSETS.has(asset)) {
      const real = readIntradayCsv(asset, suffix);
      if (real && real.length > 0) {
        console.log(`[OHLC] Real ${timeframe} for ${asset}: ${real.length} candles`);
        cache.set(key, real);
        return NextResponse.json(real);
      }
    }

    if (!ENABLE_SYNTHETIC) {
      return NextResponse.json(
        { error: `${asset} ${timeframe}: no real data available. Synthetic generation is currently disabled.` },
        { status: 404 }
      );
    }

    // Generate synthetic from M15
    const m15Key = `${asset}_15M`;
    let base15 = cache.get(m15Key) ?? null;
    if (!base15) {
      base15 = readIntradayCsv(asset, '15m');
      if (!base15 || base15.length === 0) {
        return NextResponse.json({ error: `No 15M base data for ${asset}.` }, { status: 404 });
      }
      cache.set(m15Key, base15);
    }

    const synthetic = generateSyntheticCandles(base15, timeframe as '1M' | '5M');
    if (!synthetic || synthetic.length === 0) {
      return NextResponse.json({ error: `Synthetic generation failed for ${asset} ${timeframe}.` }, { status: 500 });
    }

    console.log(`[OHLC] Synthetic ${timeframe} for ${asset}: ${base15.length} M15 → ${synthetic.length} candles`);
    cache.set(key, synthetic);
    return NextResponse.json(synthetic);
  }

  return NextResponse.json({ error: `Unknown timeframe: ${timeframe}` }, { status: 400 });
}
