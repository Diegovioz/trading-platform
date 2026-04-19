import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { evaluateTrade } from '@/lib/ai/coach';

const EVAL_LIMIT_MS = 24 * 3600 * 1000;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { trade_id } = await request.json();
  if (!trade_id) return NextResponse.json({ error: 'trade_id is required' }, { status: 400 });

  // Enforce 24h usage limit
  const { data: limits } = await supabase
    .from('user_usage_limits')
    .select('last_trade_evaluation_at')
    .eq('user_id', user.id)
    .single();

  if (limits?.last_trade_evaluation_at) {
    const elapsed = Date.now() - new Date(limits.last_trade_evaluation_at).getTime();
    if (elapsed < EVAL_LIMIT_MS) {
      const remainingMs = EVAL_LIMIT_MS - elapsed;
      const hours = Math.ceil(remainingMs / 3_600_000);
      return NextResponse.json(
        { error: `You can evaluate a new trade in ${hours} hour${hours !== 1 ? 's' : ''}`, remaining_ms: remainingMs },
        { status: 429 }
      );
    }
  }

  // Return cached result if already evaluated
  const { data: existing } = await supabase
    .from('trade_evaluations')
    .select('*')
    .eq('trade_id', trade_id)
    .single();
  if (existing) return NextResponse.json({ data: existing });

  // Fetch trade — enforce ownership
  const { data: trade, error: tradeErr } = await supabase
    .from('journal_trades')
    .select('*')
    .eq('id', trade_id)
    .eq('user_id', user.id)
    .single();
  if (tradeErr || !trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });

  // Delegate to central AI service
  let result;
  try {
    result = await evaluateTrade(supabase, trade as Record<string, unknown>, user.id);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'NO_STRATEGY') {
      return NextResponse.json(
        { error: 'Please define your strategy first in the AI Coach page.' },
        { status: 422 }
      );
    }
    console.error('[evaluate-trade]', err);
    return NextResponse.json({ error: 'AI evaluation failed. Try again.' }, { status: 500 });
  }

  // Persist evaluation
  const { data: evaluation, error: saveErr } = await supabase
    .from('trade_evaluations')
    .insert({
      user_id:  user.id,
      trade_id,
      score:    result.score,
      feedback: JSON.stringify({
        breakdown: result.breakdown,
        mistakes:  result.mistakes,
        strengths: result.strengths,
        feedback:  result.feedback,
      }),
    })
    .select()
    .single();

  if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 500 });

  // Update usage limit timestamp
  await supabase
    .from('user_usage_limits')
    .upsert({ user_id: user.id, last_trade_evaluation_at: new Date().toISOString() }, { onConflict: 'user_id' });

  return NextResponse.json({ data: evaluation, last_eval_at: new Date().toISOString() });
}
