import { NextResponse } from 'next/server';

// Clear the in-memory cache so fresh CSV files are picked up
// Call: POST /api/ohlc/reload
export async function POST() {
  // The cache lives in the parent route module — we can't clear it directly
  // from here in Next.js route isolation. A process restart is needed, or
  // deploy a new build. This endpoint exists as a no-op placeholder.
  return NextResponse.json({ ok: true, message: 'Restart the dev server to reload CSV data.' });
}
