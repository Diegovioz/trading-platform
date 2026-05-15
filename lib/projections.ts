import type { TraderProjection } from '@/types';

// ─── Base profile definitions ─────────────────────────────────────────────────
// All values are percentages. neg = [low (worst), high (best)], etc.
export interface ProfileRanges {
  name: string;
  neg:     [number, number]; // [most negative, least negative]
  limited: [number, number]; // [low, high]
  good:    [number, number]; // [low, high]
}

export const BASE_PROFILES: ProfileRanges[] = [
  { name: 'En desarrollo', neg: [-7,   -3.5], limited: [1,   2.5], good: [3,   8]   },
  { name: 'Conservador',   neg: [-3.5, -2],   limited: [1,   2],   good: [3,   5]   },
  { name: 'Estándar',      neg: [-5,   -3],   limited: [1.5, 3],   good: [4,   7]   },
  { name: 'Agresivo',      neg: [-5.5, -4],   limited: [2,   3.5], good: [4.5, 9]   },
];

export interface AdjustedRanges {
  neg:     [number, number];
  limited: [number, number];
  good:    [number, number];
}

// ─── Apply sliders to base profile ────────────────────────────────────────────
// adj_high : +0.5pp upper / +0.3pp lower on good range
// adj_neg  : negative = contracts losses (both toward 0), positive = expands
//            formula: negLow  -= adj * 0.3,  negHigh -= adj * 0.5
// adj_cons : each point pulls both extremes 0.3pp toward midpoint (all ranges)
export function applySliders(
  profile: ProfileRanges,
  adj_high: number,
  adj_neg:  number,
  adj_cons: number,
): AdjustedRanges {
  // ── Good months ──────────────────────────────────────────────────────────────
  const goodMid = (profile.good[0] + profile.good[1]) / 2;
  const goodLow  = profile.good[0] + adj_high * 0.3 + adj_cons * 0.3 * Math.sign(goodMid - profile.good[0]);
  const goodHigh = profile.good[1] + adj_high * 0.5 - adj_cons * 0.3 * Math.sign(profile.good[1] - goodMid);

  // ── Limited gain months ───────────────────────────────────────────────────────
  const limMid = (profile.limited[0] + profile.limited[1]) / 2;
  const limLow  = profile.limited[0] + adj_cons * 0.3 * Math.sign(limMid - profile.limited[0]);
  const limHigh = profile.limited[1] - adj_cons * 0.3 * Math.sign(profile.limited[1] - limMid);

  // ── Negative months ───────────────────────────────────────────────────────────
  // adj_neg < 0 → contract (less negative), adj_neg > 0 → expand (more negative)
  const negLow  = profile.neg[0] - adj_neg * 0.3; // worst end
  const negHigh = profile.neg[1] - adj_neg * 0.5; // best end

  // Apply consistency to negative range
  const negMid = (negLow + negHigh) / 2;
  const adjNegLow  = negLow  + adj_cons * 0.3 * Math.sign(negMid - negLow);
  const adjNegHigh = negHigh - adj_cons * 0.3 * Math.sign(negHigh - negMid);

  return {
    neg:     [adjNegLow,  adjNegHigh],
    limited: [limLow,     limHigh],
    good:    [goodLow,    goodHigh],
  };
}

// ─── Month distribution per scenario ─────────────────────────────────────────
export interface MonthDist {
  neg: number;
  be:  number;
  lim: number;
  good: number;
}

function distribute(negBase: number, beBase: number, limBase: number, goodBase: number, adjFreq: number): MonthDist {
  const good = Math.min(2, Math.max(0, goodBase)); // hard cap at 2
  const neg  = Math.min(11, Math.max(0, negBase + adjFreq));
  const remaining = 12 - neg - good;
  const be  = Math.min(beBase, Math.max(0, remaining));
  const lim = Math.max(0, remaining - be);
  return { neg, be, lim, good };
}

// ─── Single scenario P&L ─────────────────────────────────────────────────────
export interface ScenarioResult {
  annualPct:   number; // total % return on capital
  traderPnl:   number; // trader's share in USD
  vmPnl:       number; // V&M's share in USD
  dist:        MonthDist;
}

type ScenarioType = 'pessimistic' | 'base' | 'optimistic';

function mid(range: [number, number]) { return (range[0] + range[1]) / 2; }

export function computeScenario(
  ranges:   AdjustedRanges,
  capital:  number,
  splitVm:  number,
  adjFreq:  number,
  type:     ScenarioType,
): ScenarioResult {
  // Month distributions
  const dists: Record<ScenarioType, [number, number, number, number]> = {
    pessimistic: [4, 2, 5, 1],
    base:        [3, 2, 6, 1],
    optimistic:  [2, 1, 7, 2],
  };
  const [negB, beB, limB, goodB] = dists[type];
  const dist = distribute(negB, beB, limB, goodB, adjFreq);

  // Returns to use per category depending on scenario
  const negReturn     = type === 'pessimistic' ? ranges.neg[0]     : type === 'base' ? mid(ranges.neg)     : ranges.neg[1];
  const limitedReturn = type === 'pessimistic' ? ranges.limited[0] : type === 'base' ? mid(ranges.limited) : ranges.limited[1];
  const goodReturn    = type === 'pessimistic' ? ranges.good[0]    : type === 'base' ? mid(ranges.good)    : ranges.good[1];

  const annualPct = dist.neg * negReturn + dist.be * 0 + dist.lim * limitedReturn + dist.good * goodReturn;
  const annualPnl = capital * (annualPct / 100);
  const vmPnl     = annualPnl * (splitVm / 100);
  const traderPnl = annualPnl * ((100 - splitVm) / 100);

  return { annualPct, traderPnl, vmPnl, dist };
}

// ─── All 3 scenarios at once ──────────────────────────────────────────────────
export interface AllScenarios {
  pessimistic: ScenarioResult;
  base:        ScenarioResult;
  optimistic:  ScenarioResult;
}

export function computeAllScenarios(proj: TraderProjection): AllScenarios {
  const profile = BASE_PROFILES[proj.profile_type] ?? BASE_PROFILES[2];
  const ranges  = applySliders(profile, proj.adj_high, proj.adj_neg, proj.adj_cons);
  const args    = [ranges, proj.capital_usd, proj.split_vm, proj.adj_freq] as const;

  return {
    pessimistic: computeScenario(...args, 'pessimistic'),
    base:        computeScenario(...args, 'base'),
    optimistic:  computeScenario(...args, 'optimistic'),
  };
}
