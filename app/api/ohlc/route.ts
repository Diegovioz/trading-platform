import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse } from 'csv-parse/sync';
import { generateSyntheticCandles } from '@/lib/syntheticDataGenerator';
import type { OHLCCandle } from '@/types';

// ─── In-memory cache ──────────────────────────────────────────────────────────
const cache = new Map<string, OHLCCandle[]>();

const DATA_DIR = join(process.cwd(), 'public', 'data');
const CRYPTO_ASSETS = new Set(['BTC', 'ETH']);
const SYNTHETIC_TIMEFRAMES = new Set(['1M', '5M']);

// Count-based grouping from M15 (4×15=60min, 16×15=240min, 96×15=1440min)
const M15_GROUP_SIZE: Record<string, number> = {
  '1H': 4,
  '4H': 16,
  '1D': 96,
};

// ─── M15 CSV loader with full validation ──────────────────────────────────────
function loadM15(asset: string): OHLCCandle[] | null {
  const filePath = join(DATA_DIR, `${asset}_15m.csv`);
  if (!existsSync(filePath)) return null;

  const raw  = readFileSync(filePath, 'utf8');
  const rows = parse(raw, { columns: true, skip_empty_lines: true, cast: true });

  const nowSeconds = Date.now() / 1000;
  const candles: OHLCCandle[] = [];

  for (const r of rows) {
    let ts = Number(r.timestamp);
    if (isNaN(ts)) continue;
    // Handle millisecond timestamps (13+ digits) — convert to seconds
    if (ts > 1e12) ts = Math.floor(ts / 1000);
    // Discard future timestamps
    if (ts > nowSeconds) continue;

    const o = Number(r.open);
    const h = Number(r.high);
    const l = Number(r.low);
    const c = Number(r.close);
    if (isNaN(o) || isNaN(h) || isNaN(l) || isNaN(c)) continue;

    candles.push({ time: ts, open: o, high: h, low: l, close: c, volume: Number(r.volume ?? 0) });
  }

  // Sort ascending
  candles.sort((a, b) => (a.time as number) - (b.time as number));

  // Trim to first candle aligned to a 15-min boundary (minutes: 0, 15, 30, 45)
  const firstAligned = candles.findIndex(c => {
    const minutes = Math.floor((c.time as number) % 3600 / 60);
    return minutes === 0 || minutes === 15 || minutes === 30 || minutes === 45;
  });
  const aligned = firstAligned >= 0 ? candles.slice(firstAligned) : candles;

  if (aligned.length === 0) return null;

  console.log(`[OHLC] ${asset} M15 FIRST DATE: ${new Date((aligned[0].time as number) * 1000).toISOString()} | ${aligned.length} candles`);
  return aligned;
}

// ─── Count-based aggregation ──────────────────────────────────────────────────
function aggregateByCount(base: OHLCCandle[], groupSize: number): OHLCCandle[] {
  const result: OHLCCandle[] = [];
  // Only include complete groups
  const completeEnd = Math.floor(base.length / groupSize) * groupSize;

  for (let i = 0; i < completeEnd; i += groupSize) {
    const group = base.slice(i, i + groupSize);
    result.push({
      time:   group[0].time,
      open:   group[0].open,
      high:   Math.max(...group.map(c => c.high)),
      low:    Math.min(...group.map(c => c.low)),
      close:  group[group.length - 1].close,
      volume: group.reduce((sum, c) => sum + (c.volume ?? 0), 0),
    });
  }
  return result;
}

// ─── Real CSV reader for crypto 1M/5M ────────────────────────────────────────
function readCryptoIntraday(asset: string, suffix: string): OHLCCandle[] | null {
  const filePath = join(DATA_DIR, `${asset}_${suffix}.csv`);
  if (!existsSync(filePath)) return null;

  const raw  = readFileSync(filePath, 'utf8');
  const rows = parse(raw, { columns: true, skip_empty_lines: true, cast: true });

  const nowSeconds = Date.now() / 1000;
  const candles: OHLCCandle[] = rows
    .map((r: Record<string, unknown>) => {
      let ts = Number(r.timestamp);
      if (isNaN(ts)) return null;
      if (ts > 1e12) ts = Math.floor(ts / 1000);
      if (ts > nowSeconds) return null;
      return { time: ts, open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close), volume: Number(r.volume ?? 0) };
    })
    .filter(Boolean) as OHLCCandle[];

  return candles.length > 0 ? candles : null;
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
  if (cache.has(key)) return NextResponse.json(cache.get(key));

  // Helper: get M15 base, cached
  const getBase15 = (): OHLCCandle[] | null => {
    const m15Key = `${asset}_15M`;
    const cached = cache.get(m15Key);
    if (cached) return cached;
    const data = loadM15(asset);
    if (data && data.length > 0) cache.set(m15Key, data);
    return data;
  };

  // ── M15: single source of truth ────────────────────────────────────────────
  if (timeframe === '15M') {
    const candles = getBase15();
    if (!candles || candles.length === 0) {
      return NextResponse.json({ error: `No M15 data for ${asset}.` }, { status: 404 });
    }
    cache.set(key, candles);
    return NextResponse.json(candles);
  }

  // ── H1 / 4H / 1D: derived from M15 by count-based grouping ────────────────
  if (timeframe in M15_GROUP_SIZE) {
    const base15 = getBase15();
    if (!base15 || base15.length === 0) {
      return NextResponse.json({ error: `No M15 base data for ${asset}.` }, { status: 404 });
    }
    const groupSize = M15_GROUP_SIZE[timeframe];
    const candles   = aggregateByCount(base15, groupSize);
    if (candles.length === 0) {
      return NextResponse.json({ error: `Not enough M15 data to generate ${timeframe} for ${asset}.` }, { status: 404 });
    }
    console.log(`[OHLC] ${asset} ${timeframe}: ${base15.length} M15 → ${candles.length} candles`);
    cache.set(key, candles);
    return NextResponse.json(candles);
  }

  // ── 5M / 1M ───────────────────────────────────────────────────────────────
  if (SYNTHETIC_TIMEFRAMES.has(timeframe)) {
    // Crypto: prefer real CSV data
    if (CRYPTO_ASSETS.has(asset)) {
      const suffix = timeframe === '5M' ? '5m' : '1m';
      const real   = readCryptoIntraday(asset, suffix);
      if (real && real.length > 0) {
        console.log(`[OHLC] Real ${timeframe} for ${asset}: ${real.length} candles`);
        cache.set(key, real);
        return NextResponse.json(real);
      }
    }

    // All assets: generate synthetic from M15
    const base15 = getBase15();
    if (!base15 || base15.length === 0) {
      return NextResponse.json({ error: `No M15 base data for ${asset}.` }, { status: 404 });
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
