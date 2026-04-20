// ─── Database row types ───────────────────────────────────────────────────────

export interface UserStrategy {
  id: string;
  user_id: string;
  strategy_text: string;
  rules: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface TradeEvaluation {
  id: string;
  user_id: string;
  trade_id: string;
  score: number;
  feedback: string; // JSON-serialized EvaluationDetail
  created_at: string;
}

export interface WeeklyRecap {
  id: string;
  user_id: string;
  week_start: string;
  summary: string; // JSON-serialized RecapResult
  created_at: string;
}

export interface Account {
  id: string;
  user_id: string;
  name: string;
  initial_capital: number;
  highest_equity: number;
  drawdown_floor: number;
  created_at: string;
  drawdown_type: 'static' | 'trailing';
  drawdown_percent: number;
  // computed client-side after fetching
  total_pnl: number;
  total_trades: number;
  current_balance: number;
  is_failed: boolean;
  remaining_risk: number;
  drawdown_used_pct: number;
}


export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'trader';
  created_at: string;
}

export interface JournalTrade {
  id: string;
  user_id: string;
  account_id: string | null;
  asset: string;
  direction: 'long' | 'short';
  entry_price: number;
  exit_price: number;
  stop_loss: number | null;
  take_profit: number | null;
  size: number;
  pnl: number;
  notes: string | null;
  tags: string[] | null;
  trade_date: string;
  created_at: string;
  image_url: string | null;
  // joined
  profile?: Pick<Profile, 'full_name' | 'email'>;
}

export interface BacktestTrade {
  id: string;
  user_id: string;
  asset: string;
  timeframe: string;
  direction: 'long' | 'short';
  entry_price: number;
  exit_price: number;
  stop_loss: number | null;
  take_profit: number | null;
  size: number;
  pnl: number;
  notes: string | null;
  entry_date: string;
  exit_date: string;
  close_reason: 'SL' | 'TP' | 'Manual';
  month_tag: string; // 'YYYY-MM'
  created_at: string;
}

// ─── Candle / chart types ─────────────────────────────────────────────────────

export interface OHLCCandle {
  time: string | number; // string for 1D ('YYYY-MM-DD'), number (unix s) for intraday
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

// ─── Backtest session types ───────────────────────────────────────────────────

export type TradeDirection = 'long' | 'short';
export type CloseReason = 'SL' | 'TP' | 'Manual';

export interface OpenTrade {
  id: number;
  asset: string;
  timeframe: string;
  direction: TradeDirection;
  entry_price: number;
  stop_loss: number | null;
  take_profit: number | null;
  size: number;
  entry_date: string | number;
  notes: string | null;
}

export interface ClosedTrade extends OpenTrade {
  exit_price: number;
  exit_date: string | number;
  pnl: number;
  close_reason: CloseReason;
}

export interface SessionMetrics {
  totalPnl: number;
  winRate: number;
  trades: number;
  avgRR: number;
  profitFactor: number;
}

// ─── API response types ───────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}
