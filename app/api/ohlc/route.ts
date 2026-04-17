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

// Assets with real intraday CSV data (1m, 5m)
const CRYPTO_ASSETS = new Set(['BTC', 'ETH']);

// Non-crypto 1M/5M are generated from 15M base data
const SYNTHETIC_TIMEFRAMES = new Set(['1M', '5M']);

const TIMEFRAME_FILE: Record<string, string> = {
  '1D':  '1d',
  '4H':  '4h',
  '1H':  '1h',
  '15M': '15m',
  '5M':  '5m',  // real data for crypto; synthetic for others
  '1M':  '1m',  // real data for crypto; synthetic for others
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

function readDailyCsv(asset: string): OHLCCandle[] | null {
  const filePath = join(DATA_DIR, `${asset}_1d.csv`);
  if (!existsSync(filePath)) return null;

  const raw  = readFileSync(filePath, 'utf8');
  const rows = parse(raw, { columns: true, skip_empty_lines: true, cast: true });

  return rows.map((r: Record<string, unknown>) => ({
    time:   String(r.date),
    open:   Number(r.open),
    high:   Number(r.high),
    low:    Number(r.low),
    close:  Number(r.close),
    volume: Number(r.volume ?? 0),
  }));
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

  const suffix = TIMEFRAME_FILE[timeframe];
  if (!suffix) {
    return NextResponse.json({ error: `Unknown timeframe: ${timeframe}` }, { status: 400 });
  }

  // ── CRYPTO: 1M / 5M → try real CSV first ─────────────────────────────────
  if (SYNTHETIC_TIMEFRAMES.has(timeframe) && CRYPTO_ASSETS.has(asset)) {
    const real = readIntradayCsv(asset, suffix);
    if (real && real.length > 0) {
      console.log(`[OHLC] Real ${timeframe} data for ${asset}: ${real.length} candles`);
      cache.set(key, real);
      return NextResponse.json(real);
    }
    // No CSV — fall through to synthetic (if enabled) or return error
    if (!ENABLE_SYNTHETIC) {
      return NextResponse.json(
        { error: `No real ${timeframe} data available for ${asset}. Add ${asset}_${suffix}.csv or enable synthetic.` },
        { status: 404 }
      );
    }
    console.log(`[OHLC] No real ${timeframe} CSV for ${asset} — generating synthetic from 15M`);
  }

  // ── NON-CRYPTO (and crypto fallback): 1M / 5M → generate from 15M ─────────
  if (SYNTHETIC_TIMEFRAMES.has(timeframe)) {
    if (!ENABLE_SYNTHETIC) {
      return NextResponse.json(
        { error: `${asset} ${timeframe}: no real data available. Synthetic generation is currently disabled.` },
        { status: 404 }
      );
    }
    const base15key = `${asset}_15M`;

    let base15: OHLCCandle[] | null = cache.get(base15key) ?? null;
    if (!base15) {
      base15 = readIntradayCsv(asset, '15m');
      if (!base15 || base15.length === 0) {
        return NextResponse.json(
          { error: `No 15M base data found for ${asset}. Cannot generate ${timeframe} data.` },
          { status: 404 }
        );
      }
      cache.set(base15key, base15);
    }

    const synthetic = generateSyntheticCandles(base15, timeframe as '1M' | '5M');
    if (!synthetic || synthetic.length === 0) {
      return NextResponse.json(
        { error: `Synthetic data generation failed for ${asset} ${timeframe}.` },
        { status: 500 }
      );
    }

    console.log(`[OHLC] Synthetic ${timeframe} for ${asset}: ${base15.length} base → ${synthetic.length} candles`);
    cache.set(key, synthetic);
    return NextResponse.json(synthetic);
  }

  // ── REAL DATA: 1D / 4H / 1H / 15M ───────────────────────────────────────
  if (timeframe === '1D') {
    const candles = readDailyCsv(asset);
    if (!candles || candles.length === 0) {
      return NextResponse.json({ error: `No data file found for ${asset} 1D.` }, { status: 404 });
    }
    cache.set(key, candles);
    return NextResponse.json(candles);
  }

  const candles = readIntradayCsv(asset, suffix);
  if (!candles || candles.length === 0) {
    return NextResponse.json(
      { error: `No data file found for ${asset} ${timeframe}.` },
      { status: 404 }
    );
  }

  cache.set(key, candles);
  return NextResponse.json(candles);
}
