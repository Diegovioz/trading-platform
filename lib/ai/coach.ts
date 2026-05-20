import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Shared: fetch strategy ───────────────────────────────────────────────────
async function fetchStrategy(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('user_strategies')
    .select('strategy_text')
    .eq('user_id', userId)
    .single();
  return data?.strategy_text ?? null;
}

// ─── evaluateTrade ────────────────────────────────────────────────────────────
export interface EvaluationResult {
  score: number;
  breakdown: { strategy_adherence: number; risk_management: number; execution: number };
  mistakes: string[];
  strengths: string[];
  feedback: string;
}

export async function evaluateTrade(
  supabase: SupabaseClient,
  trade: Record<string, unknown>,
  userId: string,
): Promise<EvaluationResult> {
  const strategy = await fetchStrategy(supabase, userId);
  if (!strategy) throw new Error('NO_STRATEGY');

  const rr =
    trade.stop_loss && trade.take_profit
      ? Math.abs(
          (Number(trade.take_profit) - Number(trade.entry_price)) /
          (Number(trade.entry_price) - Number(trade.stop_loss))
        ).toFixed(2)
      : 'N/A';

  const tradeSummary = [
    `Asset: ${trade.asset}`,
    `Direction: ${String(trade.direction).toUpperCase()}`,
    `Entry: ${trade.entry_price}  Exit: ${trade.exit_price}`,
    `SL: ${trade.stop_loss ?? 'not set'}  TP: ${trade.take_profit ?? 'not set'}`,
    `Size: ${trade.size}  PnL: ${Number(trade.pnl) > 0 ? '+' : ''}${trade.pnl}  R:R ${rr}`,
    `Date: ${trade.trade_date}`,
    trade.notes ? `Notes: ${trade.notes}` : null,
    trade.tags && Array.isArray(trade.tags) && (trade.tags as string[]).length > 0
      ? `Tags: ${(trade.tags as string[]).join(', ')}` : null,
  ].filter(Boolean).join('\n');

  const promptText = `Estrategia del usuario:\n${strategy}\n\nTrade:\n${tradeSummary}\n\nEvalúa según adherencia a la estrategia, gestión del riesgo y calidad de ejecución.\nReglas: no infles la puntuación, sé directo, respuesta corta.\nIMPORTANTE sobre R:R: una desviación de ±0.10 respecto al objetivo es completamente aceptable — NO la penalices (ej: objetivo 2R, rango válido 1.90–2.10).\n${trade.image_url ? 'Se adjunta captura del gráfico — úsala para evaluar la calidad técnica del setup.' : 'No se ha proporcionado captura del gráfico — no evalúes ni penalices aspectos técnicos del setup (toma de liquidez, estructura, etc.) que no estén descritos explícitamente en las notas.'}\n\nDevuelve JSON:\n{"score":number,"breakdown":{"strategy_adherence":number,"risk_management":number,"execution":number},"mistakes":["máx 3"],"strengths":["máx 3"],"feedback":"máx 60 palabras"}`;

  const userMessage = trade.image_url
    ? {
        role: 'user' as const,
        content: [
          { type: 'image' as const, source: { type: 'url' as const, url: trade.image_url as string } },
          { type: 'text' as const, text: promptText },
        ],
      }
    : { role: 'user' as const, content: promptText };

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    system: 'Eres un coach de trading de élite. Sé estricto, objetivo y conciso. Responde SIEMPRE en español. Devuelve ÚNICAMENTE JSON válido — sin markdown.',
    messages: [userMessage],
  });

  const rawText = (message.content[0] as { type: string; text: string }).text.trim();
  const raw = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const parsed = JSON.parse(raw);

  return {
    score:     Math.min(10, Math.max(1, Math.round(Number(parsed.score)))),
    breakdown: parsed.breakdown ?? { strategy_adherence: 0, risk_management: 0, execution: 0 },
    mistakes:  Array.isArray(parsed.mistakes)  ? parsed.mistakes.slice(0, 3)  : [],
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 3) : [],
    feedback:  String(parsed.feedback ?? '').slice(0, 400),
  };
}

// ─── generateWeeklyRecap ──────────────────────────────────────────────────────
export interface RecapResult {
  overall_score: number;
  total_trades: number;
  win_rate: number;
  total_pnl: number;
  highlights: string[];
  areas_to_improve: string[];
  pattern: string;
  next_week_focus: string;
}

export async function generateWeeklyRecap(
  supabase: SupabaseClient,
  userId: string,
): Promise<RecapResult> {
  const strategy = await fetchStrategy(supabase, userId);
  if (!strategy) throw new Error('NO_STRATEGY');

  // Fetch last 7 days of trades
  const since = new Date();
  since.setDate(since.getDate() - 7);
  const sinceStr = since.toISOString().split('T')[0];

  const { data: trades } = await supabase
    .from('journal_trades')
    .select('asset, direction, pnl, stop_loss, take_profit, trade_date, notes')
    .eq('user_id', userId)
    .gte('trade_date', sinceStr)
    .order('trade_date', { ascending: true });

  if (!trades || trades.length === 0) throw new Error('NO_TRADES');

  // Build compact summary — do NOT send raw rows to AI
  const totalPnl   = trades.reduce((s, t) => s + t.pnl, 0);
  const wins       = trades.filter(t => t.pnl > 0);
  const winRate    = Math.round((wins.length / trades.length) * 100);
  const best       = trades.reduce((a, b) => a.pnl > b.pnl ? a : b);
  const worst      = trades.reduce((a, b) => a.pnl < b.pnl ? a : b);
  const assets     = Array.from(new Set(trades.map(t => t.asset))).join(', ');
  const slUsage    = trades.filter(t => t.stop_loss).length;
  const tpUsage    = trades.filter(t => t.take_profit).length;

  const summary = `Trades: ${trades.length} | Wins: ${wins.length} | Win rate: ${winRate}%
Total PnL: ${totalPnl > 0 ? '+' : ''}${totalPnl.toFixed(2)}
Best: ${best.asset} ${best.direction} +${best.pnl}
Worst: ${worst.asset} ${worst.direction} ${worst.pnl}
Assets: ${assets}
SL set: ${slUsage}/${trades.length} | TP set: ${tpUsage}/${trades.length}`;

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system: 'Eres un coach de trading de élite. Sé estricto, objetivo y conciso. Responde SIEMPRE en español. Devuelve ÚNICAMENTE JSON válido — sin markdown.',
    messages: [{
      role: 'user',
      content: `Estrategia del usuario:\n${strategy}\n\nResumen semanal:\n${summary}\n\nProporciona un resumen semanal de coaching.\nDevuelve JSON:\n{"overall_score":number,"highlights":["máx 3"],"areas_to_improve":["máx 3"],"pattern":"1 frase sobre patrón de comportamiento","next_week_focus":"1 frase"}`,
    }],
  });

  const rawText = (message.content[0] as { type: string; text: string }).text.trim();
  const raw = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const parsed = JSON.parse(raw);

  return {
    overall_score:    Math.min(10, Math.max(1, Math.round(Number(parsed.overall_score)))),
    total_trades:     trades.length,
    win_rate:         winRate,
    total_pnl:        totalPnl,
    highlights:       Array.isArray(parsed.highlights)        ? parsed.highlights.slice(0, 3)        : [],
    areas_to_improve: Array.isArray(parsed.areas_to_improve)  ? parsed.areas_to_improve.slice(0, 3)  : [],
    pattern:          String(parsed.pattern        ?? ''),
    next_week_focus:  String(parsed.next_week_focus ?? ''),
  };
}
