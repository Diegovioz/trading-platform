import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

function extractStoragePath(imageUrl: string): string | null {
  try {
    const marker = '/trade-images/';
    const idx = imageUrl.indexOf(marker);
    if (idx === -1) return null;
    return imageUrl.slice(idx + marker.length);
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  // Vercel sends "Authorization: Bearer <CRON_SECRET>" for cron requests
  const auth = request.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Fetch expired trades that still have an image
  const { data: trades, error: fetchErr } = await supabase
    .from('journal_trades')
    .select('id, image_url')
    .lt('image_expires_at', new Date().toISOString())
    .not('image_url', 'is', null);

  if (fetchErr) {
    console.error('[cleanup-images] fetch error', fetchErr);
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!trades || trades.length === 0) {
    return NextResponse.json({ deleted: 0 });
  }

  const paths = trades
    .map(t => extractStoragePath(t.image_url as string))
    .filter(Boolean) as string[];

  // Delete from storage (errors ignored per-file)
  if (paths.length > 0) {
    await supabase.storage.from('trade-images').remove(paths);
  }

  // Clear image columns in DB
  const ids = trades.map(t => t.id);
  await supabase
    .from('journal_trades')
    .update({ image_url: null, image_expires_at: null })
    .in('id', ids);

  return NextResponse.json({ deleted: ids.length });
}
