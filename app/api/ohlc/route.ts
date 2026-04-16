import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse } from 'csv-parse/sync';

// ─── In-memory cache ──────────────────────────────────────────────────────────
const cache = new Map<string, unknown[]>();

const DATA_DIR = join(process.cwd(), 'public', 'data');

const TIMEFRAME_FILE: Record<string, string> = {
  '1D':  '1d',
  '4H':  '4h',
  '1H':  '1h',
  '15M': '15m',
  '5M':  '5m',
  '1M':  '1m',
};

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

  const filePath = join(DATA_DIR, `${asset}_${suffix}.csv`);
  if (!existsSync(filePath)) {
    return NextResponse.json(
      { error: `No data file found for ${asset} ${timeframe}. Run the data generator script first.` },
      { status: 404 }
    );
  }

  const raw = readFileSync(filePath, 'utf8');
  const rows = parse(raw, { columns: true, skip_empty_lines: true, cast: true });

  const isIntraday = timeframe !== '1D';

  const candles = rows.map((r: Record<string, unknown>) => {
    if (isIntraday) {
      // timestamp,open,high,low,close,volume
      return {
        time:   Number(r.timestamp),
        open:   Number(r.open),
        high:   Number(r.high),
        low:    Number(r.low),
        close:  Number(r.close),
        volume: Number(r.volume ?? 0),
      };
    } else {
      // date,open,high,low,close,volume
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
