import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { strategy_text } = await request.json();
  if (!strategy_text?.trim()) {
    return NextResponse.json({ error: 'strategy_text is required' }, { status: 400 });
  }

  // Upsert — one strategy per user
  const { data, error } = await supabase
    .from('user_strategies')
    .upsert(
      { user_id: user.id, strategy_text: strategy_text.trim(), updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
