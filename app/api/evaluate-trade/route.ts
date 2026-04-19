import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { trade_id } = await request.json();
  if (!trade_id) return NextResponse.json({ error: 'trade_id is required' }, { status: 400 });

  // ── Already evaluated? ────────────────────────────────────────────────────
  const { data: existing } = await supabase
    .from('trade_evaluations')
    .select('*')
    .eq('trade_id', trade_id)
    .single();
  if (existing) return NextResponse.json({ data: existing });

  // ── Fetch trade (must belong to this user) ────────────────────────────────
  const { data: trade, error: tradeErr } = await supabase
    .from('journal_trades')
    .select('*')
    .eq('id', trade_id)
    .eq('user_id', user.id)
    .single();
  if (tradeErr || !trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });

  // ── Fetch user strategy ───────────────────────────────────────────────────
  const { data: strategy } = await supabase
    .from('user_strategies')
    .select('strategy_text')
    .eq('user_id', user.id)
    .single();
  if (!strategy) {
    return NextResponse.json(
      { error: 'Please define your strategy first in the AI Coach page.' },
      { status: 422 }
    );
  }

  // ── Build trade summary ───────────────────────────────────────────────────
  const rr = trade.stop_loss && trade.take_profit
    ? Math.abs((trade.take_profit - trade.entry_price) / (trade.entry_price - trade.stop_loss)).toFixed(2)
    : 'N/A';
  const tradeSummary = `Asset: ${trade.asset}
Direction: ${trade.direction.toUpperCase()}
Entry: ${trade.entry_price}
Exit: ${trade.exit_price}
Stop Loss: ${trade.stop_loss ?? 'not set'}
Take Profit: ${trade.take_profit ?? 'not set'}
Size: ${trade.size}
P&L: ${trade.pnl > 0 ? '+' : ''}${trade.pnl}
Risk/Reward: ${rr}
Date: ${trade.trade_date}
Notes: ${trade.notes ?? 'none'}
Tags: ${trade.tags?.join(', ') ?? 'none'}`;

  // ── Call Claude ───────────────────────────────────────────────────────────
  let score: number;
  let feedback: string;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: 'You are an elite trading coach. Be strict, objective and concise. Return ONLY valid JSON — no markdown, no explanation.',
      messages: [
        {
          role: 'user',
          content: `User Strategy:
${strategy.strategy_text}

Trade Data:
${tradeSummary}

Evaluate this trade based on:
* strategy adherence
* risk management
* execution quality

Rules:
* Do not inflate the score
* Be direct and actionable
* Keep response short

Return STRICT JSON (no markdown, no code block):
{
  "score": number (1-10),
  "breakdown": {
    "strategy_adherence": number,
    "risk_management": number,
    "execution": number
  },
  "mistakes": ["max 3 items"],
  "strengths": ["max 3 items"],
  "feedback": "max 60 words"
}`,
        },
      ],
    });

    const raw = (message.content[0] as { type: string; text: string }).text.trim();
    const parsed = JSON.parse(raw);

    score = Math.min(10, Math.max(1, Math.round(Number(parsed.score))));

    // Store the full structured response as JSON in the feedback field
    feedback = JSON.stringify({
      breakdown: parsed.breakdown ?? {},
      mistakes:  Array.isArray(parsed.mistakes)  ? parsed.mistakes.slice(0, 3)  : [],
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 3) : [],
      feedback:  String(parsed.feedback ?? '').slice(0, 400),
    });
  } catch (err) {
    console.error('[evaluate-trade] AI error:', err);
    return NextResponse.json({ error: 'AI evaluation failed. Try again.' }, { status: 500 });
  }

  // ── Save evaluation ───────────────────────────────────────────────────────
  const { data: evaluation, error: saveErr } = await supabase
    .from('trade_evaluations')
    .insert({ user_id: user.id, trade_id, score, feedback })
    .select()
    .single();

  if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 500 });
  return NextResponse.json({ data: evaluation });
}
