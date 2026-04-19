import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateWeeklyRecap } from '@/lib/ai/coach';

const RECAP_LIMIT_MS = 7 * 24 * 3600 * 1000;

function getWeekStart(): string {
  const d = new Date();
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split('T')[0];
}

export async function POST(_request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Enforce 7-day usage limit
  const { data: limits } = await supabase
    .from('user_usage_limits')
    .select('last_weekly_recap_at')
    .eq('user_id', user.id)
    .single();

  if (limits?.last_weekly_recap_at) {
    const elapsed = Date.now() - new Date(limits.last_weekly_recap_at).getTime();
    if (elapsed < RECAP_LIMIT_MS) {
      const remainingMs = RECAP_LIMIT_MS - elapsed;
      const days = Math.ceil(remainingMs / (24 * 3600 * 1000));
      return NextResponse.json(
        { error: `Weekly recap available in ${days} day${days !== 1 ? 's' : ''}`, remaining_ms: remainingMs },
        { status: 429 }
      );
    }
  }

  const weekStart = getWeekStart();

  // Return cached recap for this week if it exists
  const { data: existing } = await supabase
    .from('weekly_recaps')
    .select('*')
    .eq('user_id', user.id)
    .eq('week_start', weekStart)
    .single();
  if (existing) return NextResponse.json({ data: existing, cached: true });

  // Generate via central AI service
  let result;
  try {
    result = await generateWeeklyRecap(supabase, user.id);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'NO_STRATEGY') {
      return NextResponse.json(
        { error: 'Please define your strategy first in the AI Coach page.' },
        { status: 422 }
      );
    }
    if (msg === 'NO_TRADES') {
      return NextResponse.json(
        { error: 'No trades found in the last 7 days.' },
        { status: 422 }
      );
    }
    console.error('[weekly-recap]', err);
    return NextResponse.json({ error: 'Recap generation failed. Try again.' }, { status: 500 });
  }

  // Persist
  const { data: recap, error: saveErr } = await supabase
    .from('weekly_recaps')
    .upsert(
      { user_id: user.id, week_start: weekStart, summary: JSON.stringify(result) },
      { onConflict: 'user_id,week_start' }
    )
    .select()
    .single();

  if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 500 });

  // Update usage limit timestamp
  await supabase
    .from('user_usage_limits')
    .upsert({ user_id: user.id, last_weekly_recap_at: new Date().toISOString() }, { onConflict: 'user_id' });

  return NextResponse.json({ data: recap, last_recap_at: new Date().toISOString() });
}

export async function GET(_request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('weekly_recaps')
    .select('*')
    .eq('user_id', user.id)
    .order('week_start', { ascending: false })
    .limit(4);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
