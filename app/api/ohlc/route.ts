import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse } from 'csv-parse/sync';
import { generateSyntheticCandles } from '@/lib/syntheticDataGenerator';
import type { OHLCCandle } from '@/types';

// ─── In-memory cache ──────────────────────────────────────────────────────────
const cache = new Map<string, OHLCCandle[]>();

const DATA_DIR = join(process.cwd(), 'public', 'data');

const TIMEFRAME_FILE: Record<string, string> = {
  '1D':  '1d',
  '4H':  '4h',
  '1H':  '1h',
  '15M': '15m',
};

// 1M and 5M are always synthetic — never read their CSV files
const SYNTHETIC_TIMEFRAMES = new Set(['1M', '5M']);

function readCsvCandles(asset: string, suffix: string): OHLCCandle[] | null {
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

  // ─── Synthetic path for 1M / 5M ───────────────────────────────────────────
  if (SYNTHETIC_TIMEFRAMES.has(timeframe)) {
    const base15key = `${asset}_15M`;

    // Load 15M base data (from cache or disk)
    let base15: OHLCCandle[] | null = cache.get(base15key) ?? null;
    if (!base15) {
      base15 = readCsvCandles(asset, '15m');
      if (!base15 || base15.length === 0) {
        return NextResponse.json(
          { error: `No 15M base data found for ${asset}. Cannot generate synthetic ${timeframe} data.` },
          { status: 404 }
        );
      }
      cache.set(base15key, base15);
    }

    const synthetic = generateSyntheticCandles(base15, timeframe as '1M' | '5M');
    console.log(`Base candles (15M ${asset}):`, base15.length);
    console.log(`Generated candles (${timeframe} ${asset}):`, synthetic.length);
    cache.set(key, synthetic);
    return NextResponse.json(synthetic);
  }

  // ─── Real data path (15M and above) ───────────────────────────────────────
  const suffix = TIMEFRAME_FILE[timeframe];
  if (!suffix) {
    return NextResponse.json({ error: `Unknown timeframe: ${timeframe}` }, { status: 400 });
  }

  const filePath = join(DATA_DIR, `${asset}_${suffix}.csv`);
  if (!existsSync(filePath)) {
    return NextResponse.json(
      { error: `No data file found for ${asset} ${timeframe}.` },
      { status: 404 }
    );
  }

  const raw  = readFileSync(filePath, 'utf8');
  const rows = parse(raw, { columns: true, skip_empty_lines: true, cast: true });

  const isIntraday = timeframe !== '1D';

  const candles: OHLCCandle[] = rows.map((r: Record<string, unknown>) => {
    if (isIntraday) {
      return {
        time:   Number(r.timestamp),
        open:   Number(r.open),
        high:   Number(r.high),
        low:    Number(r.low),
        close:  Number(r.close),
        volume: Number(r.volume ?? 0),
      };
    } else {
      return {
        time:   String(r.date),
        open:   Number(r.open),
        high:   Number(r.high),
        low:    Number(r.low),
        close:  Number(r.close),
        volume: Number(r.volume ?? 0),
      };
    }
  });

  cache.set(key, candles);
  return NextResponse.json(candles);
}
