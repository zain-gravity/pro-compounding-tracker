// ─────────────────────────────────────────────────────────────
// engine.js — Compounding Calculation Engine
// ─────────────────────────────────────────────────────────────
// All functions are **pure** — no DOM access, no side-effects.
// They receive plain objects and return plain objects, making
// them easy to test and reason about.
// ─────────────────────────────────────────────────────────────

/**
 * Compute a full forward-compounding schedule.
 *
 * Each "trade" (iteration) follows this pipeline:
 *   opening
 *   → + profit
 *   → − fees
 *   → ± recurring (deposit / withdraw)
 *   → closing  (floored at 0 — balance can never go negative)
 *
 * @param {Object} params
 * @param {number} params.startAmt   - Starting balance (≥ 0)
 * @param {number} params.rate       - Compounding rate value
 * @param {string} params.valueType  - 'percent' | 'fixed'
 * @param {number} params.trades     - Number of iterations (≥ 1)
 * @param {string} params.feeType    - 'none' | 'fixed' | 'percent'
 * @param {number} params.feeVal     - Fee amount (used when feeType ≠ 'none')
 * @param {string} params.recurType  - 'none' | 'deposit' | 'withdraw'
 * @param {number} params.recurVal   - Recurring amount (used when recurType ≠ 'none')
 *
 * @returns {Array<Object>} rows
 *   Each row: { trade, opening, profit, fees, recurring, closing }
 */
export function computeForward({
  startAmt,
  rate,
  valueType,
  trades,
  feeType = 'none',
  feeVal = 0,
  recurType = 'none',
  recurVal = 0,
}) {
  const rows = [];

  // Sanitise inputs — treat NaN / undefined as 0
  let balance = Number(startAmt) || 0;
  const r = Number(rate) || 0;
  const numTrades = Math.max(Math.floor(Number(trades) || 0), 0);
  const fee = Number(feeVal) || 0;
  const recur = Number(recurVal) || 0;

  for (let i = 1; i <= numTrades; i++) {
    const opening = balance;

    // ── 1. Profit ─────────────────────────────────────────
    let profit;
    if (valueType === 'percent') {
      profit = opening * (r / 100);
    } else {
      // 'fixed' — flat amount per trade regardless of balance
      profit = r;
    }

    // ── 2. Fees ───────────────────────────────────────────
    let fees = 0;
    if (feeType === 'fixed') {
      fees = fee;
    } else if (feeType === 'percent') {
      // Fee is a percentage of (opening + profit) — the gross value
      fees = (opening + profit) * (fee / 100);
    }
    // Fees can never be negative
    fees = Math.max(fees, 0);

    // ── 3. Recurring deposit / withdrawal ─────────────────
    let recurring = 0;
    if (recurType === 'deposit') {
      recurring = recur;
    } else if (recurType === 'withdraw') {
      recurring = -recur;
    }

    // ── 4. Closing balance ────────────────────────────────
    // Floor at zero — a trader's balance cannot go below zero
    const closing = Math.max(opening + profit - fees + recurring, 0);

    rows.push({
      trade: i,
      opening: round2(opening),
      profit: round2(profit),
      fees: round2(fees),
      recurring: round2(recurring),
      closing: round2(closing),
    });

    // Carry closing balance forward to next trade's opening
    balance = closing;

    // Optimisation: if balance has hit zero and rate is
    // percentage-based (with no fixed deposits), every
    // subsequent trade will also be zero — but we still
    // generate the rows for completeness.
  }

  return rows;
}

/**
 * Goal Seek — find the starting amount required to reach a
 * target (goal) balance after N trades at the given rate.
 *
 * For **percent** rates the formula is analytically solvable:
 *   startNeeded = goal / (1 + rate/100)^trades
 *
 * For **fixed** rates:
 *   startNeeded = goal − (rate × trades)
 *
 * After computing the starting amount we run `computeForward`
 * with it so the caller can display a verification schedule.
 *
 * @param {Object} params
 * @param {number} params.goal      - Target final balance
 * @param {number} params.rate      - Rate per trade
 * @param {string} params.valueType - 'percent' | 'fixed'
 * @param {number} params.trades    - Number of trades
 *
 * @returns {Object} { startNeeded, verificationRows }
 */
export function computeGoalSeek({ goal, rate, valueType, trades }) {
  const g = Number(goal) || 0;
  const r = Number(rate) || 0;
  const n = Math.max(Math.floor(Number(trades) || 0), 1);

  let startNeeded;

  if (valueType === 'percent') {
    const growthFactor = Math.pow(1 + r / 100, n);
    // Avoid division by zero when growth factor is 0
    startNeeded = growthFactor === 0 ? 0 : g / growthFactor;
  } else {
    // Fixed — each trade adds a flat amount
    startNeeded = g - r * n;
  }

  // Starting amount can never be negative
  startNeeded = Math.max(round2(startNeeded), 0);

  // Generate verification rows so the UI can prove the result
  const verificationRows = computeForward({
    startAmt: startNeeded,
    rate: r,
    valueType,
    trades: n,
    feeType: 'none',
    feeVal: 0,
    recurType: 'none',
    recurVal: 0,
  });

  return { startNeeded, verificationRows };
}

// ── Internal helpers ─────────────────────────────────────────

/**
 * Round a number to 2 decimal places (banker-safe).
 * Uses the "round half away from zero" approach.
 *
 * @param {number} n
 * @returns {number}
 */
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ── Extended helpers ─────────────────────────────────────────

/**
 * Round a number to N decimal places.
 * Falls back to round2 behaviour (2 decimals) when decimals is omitted.
 *
 * @param {number} n
 * @param {number} [decimals=2]
 * @returns {number}
 */
function roundN(n, decimals = 2) {
  const factor = Math.pow(10, decimals);
  return Math.round((n + Number.EPSILON) * factor) / factor;
}

// ─────────────────────────────────────────────────────────────
// Liquidation Price Calculator
// ─────────────────────────────────────────────────────────────

/**
 * Calculate the exact liquidation price for a leveraged position.
 *
 * @param {Object}  p
 * @param {number}  p.entryPrice    - Entry price of the asset
 * @param {number}  p.margin        - Margin (collateral) posted
 * @param {number}  p.leverage      - Leverage multiplier
 * @param {string}  p.positionType  - 'long' | 'short'
 * @param {number}  p.takerFee      - Taker fee as a percentage (e.g. 0.06)
 * @param {number}  p.liqFee        - Liquidation fee as a percentage
 * @returns {Object}
 */
export function calcLiquidation({ entryPrice, margin, leverage, positionType, takerFee, liqFee }) {
  const entry   = Number(entryPrice) || 0;
  const m       = Number(margin) || 0;
  const lev     = Number(leverage) || 1;
  const tFee    = Number(takerFee) || 0;
  const lFee    = Number(liqFee) || 0;

  if (entry <= 0 || m <= 0 || lev <= 0) {
    return { liqPrice: 0, positionSize: 0, quantity: 0, effectiveMargin: 0, distancePct: 0, marginRatio: 0 };
  }

  const positionSize    = m * lev;
  const quantity        = positionSize / entry;
  const entryFee        = positionSize * (tFee / 100);
  const effectiveMargin = m - entryFee;

  let liqPrice;
  if (positionType === 'short') {
    liqPrice = (positionSize + effectiveMargin) / (quantity * (1 + lFee / 100));
  } else {
    // Default to long
    liqPrice = (positionSize - effectiveMargin) / (quantity * (1 - lFee / 100));
  }

  const distancePct = Math.abs(entry - liqPrice) / entry * 100;
  const marginRatio = m / positionSize * 100;

  return {
    liqPrice:        round2(liqPrice),
    positionSize:    round2(positionSize),
    quantity,
    effectiveMargin: round2(effectiveMargin),
    distancePct:     round2(distancePct),
    marginRatio:     round2(marginRatio),
  };
}

// ─────────────────────────────────────────────────────────────
// Liquidation with Extra Margin
// ─────────────────────────────────────────────────────────────

/**
 * Same as calcLiquidation but with additional margin added to
 * the position. Position size stays the same — only effective
 * margin changes.
 *
 * @param {Object}  p
 * @param {number}  p.entryPrice
 * @param {number}  p.margin
 * @param {number}  p.leverage
 * @param {string}  p.positionType
 * @param {number}  p.takerFee
 * @param {number}  p.liqFee
 * @param {number}  p.extraMargin   - Additional margin to add
 * @returns {Object}
 */
export function calcLiqWithExtraMargin({ entryPrice, margin, leverage, positionType, takerFee, liqFee, extraMargin }) {
  const entry  = Number(entryPrice) || 0;
  const m      = Number(margin) || 0;
  const lev    = Number(leverage) || 1;
  const tFee   = Number(takerFee) || 0;
  const lFee   = Number(liqFee) || 0;
  const extra  = Number(extraMargin) || 0;

  if (entry <= 0 || m <= 0 || lev <= 0) {
    return { newLiqPrice: 0, newDistancePct: 0, totalMargin: 0 };
  }

  const positionSize    = m * lev;
  const quantity        = positionSize / entry;
  const totalMargin     = m + extra;
  const entryFee        = positionSize * (tFee / 100);
  const effectiveMargin = totalMargin - entryFee;

  let newLiqPrice;
  if (positionType === 'short') {
    newLiqPrice = (positionSize + effectiveMargin) / (quantity * (1 + lFee / 100));
  } else {
    newLiqPrice = (positionSize - effectiveMargin) / (quantity * (1 - lFee / 100));
  }

  const newDistancePct = Math.abs(entry - newLiqPrice) / entry * 100;

  return {
    newLiqPrice:    round2(newLiqPrice),
    newDistancePct: round2(newDistancePct),
    totalMargin:    round2(totalMargin),
  };
}

// ─────────────────────────────────────────────────────────────
// Fixed DCA Calculator
// ─────────────────────────────────────────────────────────────

/**
 * Fixed-step Dollar-Cost Averaging: the user adds a fixed
 * `dcaAmount` at every `dropPct` drop from `currentPrice`.
 *
 * @param {Object}  p
 * @param {number}  p.entryPrice
 * @param {number}  p.currentPrice
 * @param {number}  p.margin
 * @param {number}  p.leverage
 * @param {string}  p.positionType
 * @param {number}  p.dropPct       - Percentage drop per level
 * @param {number}  p.dcaAmount     - Fixed amount per DCA level
 * @param {number}  p.levels        - Number of DCA levels
 * @param {number}  p.feeRate       - Fee rate as a percentage
 * @returns {Object}
 */
export function calcFixedDCA({ entryPrice, currentPrice, margin, leverage, positionType, dropPct, dcaAmount, levels, feeRate }) {
  const entry   = Number(entryPrice) || 0;
  const current = Number(currentPrice) || 0;
  const m       = Number(margin) || 0;
  const lev     = Number(leverage) || 1;
  const drop    = Number(dropPct) || 0;
  const amount  = Number(dcaAmount) || 0;
  const n       = Math.max(Math.floor(Number(levels) || 0), 0);
  const fee     = Number(feeRate) || 0;

  if (entry <= 0 || current <= 0) {
    return { entries: [], summary: { newAvgEntry: 0, totalCapital: 0, totalQty: 0, breakeven: 0, totalFees: 0 } };
  }

  const positionSize = m * lev;
  const originalQty  = positionSize / entry;

  const entries      = [];
  let runningQty     = originalQty;
  let runningCost    = originalQty * entry;
  let runningMargin  = m;

  for (let level = 1; level <= n; level++) {
    let price;
    if (positionType === 'short') {
      price = current * (1 + level * drop / 100);
    } else {
      price = current * (1 - level * drop / 100);
    }

    // Guard against zero / negative price
    if (price <= 0) break;

    const qty = amount / price;
    runningQty    += qty;
    runningCost   += qty * price;
    runningMargin += amount;

    const avgEntry = runningCost / runningQty;

    entries.push({
      level,
      price:        round2(price),
      amount:       round2(amount),
      qty:          roundN(qty, 6),
      totalQty:     roundN(runningQty, 6),
      avgEntry:     round2(avgEntry),
      totalCapital: round2(runningMargin),
    });
  }

  const avgEntry  = runningQty > 0 ? runningCost / runningQty : 0;
  const totalFees = runningCost * (fee / 100) * 2;

  let breakeven;
  if (positionType === 'short') {
    breakeven = avgEntry * (1 - fee / 100);
  } else {
    breakeven = avgEntry * (1 + fee / 100);
  }

  return {
    entries,
    summary: {
      newAvgEntry:  round2(avgEntry),
      totalCapital: round2(runningMargin),
      totalQty:     roundN(runningQty, 6),
      breakeven:    round2(breakeven),
      totalFees:    round2(totalFees),
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Martingale DCA Calculator
// ─────────────────────────────────────────────────────────────

/**
 * Same as Fixed DCA but the amount doubles each level:
 *   Level 1 → baseAmount
 *   Level 2 → baseAmount × 2
 *   Level N → baseAmount × 2^(N-1)
 *
 * @param {Object}  p
 * @param {number}  p.entryPrice
 * @param {number}  p.currentPrice
 * @param {number}  p.margin
 * @param {number}  p.leverage
 * @param {string}  p.positionType
 * @param {number}  p.dropPct
 * @param {number}  p.baseAmount    - Base amount (doubles each level)
 * @param {number}  p.levels
 * @param {number}  p.feeRate
 * @returns {Object}
 */
export function calcMartingaleDCA({ entryPrice, currentPrice, margin, leverage, positionType, dropPct, baseAmount, levels, feeRate }) {
  const entry   = Number(entryPrice) || 0;
  const current = Number(currentPrice) || 0;
  const m       = Number(margin) || 0;
  const lev     = Number(leverage) || 1;
  const drop    = Number(dropPct) || 0;
  const base    = Number(baseAmount) || 0;
  const n       = Math.max(Math.floor(Number(levels) || 0), 0);
  const fee     = Number(feeRate) || 0;

  if (entry <= 0 || current <= 0) {
    return { entries: [], summary: { newAvgEntry: 0, totalCapital: 0, totalQty: 0, breakeven: 0, totalFees: 0 } };
  }

  const positionSize = m * lev;
  const originalQty  = positionSize / entry;

  const entries      = [];
  let runningQty     = originalQty;
  let runningCost    = originalQty * entry;
  let runningMargin  = m;

  for (let level = 1; level <= n; level++) {
    const amount = base * Math.pow(2, level - 1);

    let price;
    if (positionType === 'short') {
      price = current * (1 + level * drop / 100);
    } else {
      price = current * (1 - level * drop / 100);
    }

    if (price <= 0) break;

    const qty = amount / price;
    runningQty    += qty;
    runningCost   += qty * price;
    runningMargin += amount;

    const avgEntry = runningCost / runningQty;

    entries.push({
      level,
      price:        round2(price),
      amount:       round2(amount),
      qty:          roundN(qty, 6),
      totalQty:     roundN(runningQty, 6),
      avgEntry:     round2(avgEntry),
      totalCapital: round2(runningMargin),
    });
  }

  const avgEntry  = runningQty > 0 ? runningCost / runningQty : 0;
  const totalFees = runningCost * (fee / 100) * 2;

  let breakeven;
  if (positionType === 'short') {
    breakeven = avgEntry * (1 - fee / 100);
  } else {
    breakeven = avgEntry * (1 + fee / 100);
  }

  return {
    entries,
    summary: {
      newAvgEntry:  round2(avgEntry),
      totalCapital: round2(runningMargin),
      totalQty:     roundN(runningQty, 6),
      breakeven:    round2(breakeven),
      totalFees:    round2(totalFees),
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Zone DCA Calculator
// ─────────────────────────────────────────────────────────────

/**
 * Zone-based DCA: the user specifies up to 3 support levels and
 * a total budget. Budget is allocated across levels:
 *   1 level  → 100%
 *   2 levels → 40%, 60%
 *   3 levels → 20%, 30%, 50%
 *
 * @param {Object}   p
 * @param {number}   p.entryPrice
 * @param {number}   p.currentPrice
 * @param {number}   p.margin
 * @param {number}   p.leverage
 * @param {string}   p.positionType
 * @param {number[]} p.supportLevels  - Array of price levels (up to 3)
 * @param {number}   p.totalBudget    - Total DCA budget
 * @param {number}   p.feeRate
 * @returns {Object}
 */
export function calcZoneDCA({ entryPrice, currentPrice, margin, leverage, positionType, supportLevels, totalBudget, feeRate }) {
  const entry   = Number(entryPrice) || 0;
  const current = Number(currentPrice) || 0;
  const m       = Number(margin) || 0;
  const lev     = Number(leverage) || 1;
  const budget  = Number(totalBudget) || 0;
  const fee     = Number(feeRate) || 0;
  const levels  = Array.isArray(supportLevels) ? supportLevels.map(Number).filter(v => v > 0) : [];

  if (entry <= 0 || levels.length === 0 || budget <= 0) {
    return { entries: [], summary: { newAvgEntry: 0, totalCapital: 0, totalQty: 0, breakeven: 0, totalFees: 0 } };
  }

  // Allocation ratios based on number of levels
  let allocations;
  if (levels.length === 1) {
    allocations = [1.0];
  } else if (levels.length === 2) {
    allocations = [0.4, 0.6];
  } else {
    allocations = [0.2, 0.3, 0.5];
  }

  const positionSize = m * lev;
  const originalQty  = positionSize / entry;

  const entries      = [];
  let runningQty     = originalQty;
  let runningCost    = originalQty * entry;
  let runningMargin  = m;

  for (let i = 0; i < levels.length && i < 3; i++) {
    const price  = levels[i];
    const amount = budget * allocations[i];
    const level  = i + 1;

    if (price <= 0) continue;

    const qty = amount / price;
    runningQty    += qty;
    runningCost   += qty * price;
    runningMargin += amount;

    const avgEntry = runningCost / runningQty;

    entries.push({
      level,
      price:        round2(price),
      amount:       round2(amount),
      qty:          roundN(qty, 6),
      totalQty:     roundN(runningQty, 6),
      avgEntry:     round2(avgEntry),
      totalCapital: round2(runningMargin),
    });
  }

  const avgEntry  = runningQty > 0 ? runningCost / runningQty : 0;
  const totalFees = runningCost * (fee / 100) * 2;

  let breakeven;
  if (positionType === 'short') {
    breakeven = avgEntry * (1 - fee / 100);
  } else {
    breakeven = avgEntry * (1 + fee / 100);
  }

  return {
    entries,
    summary: {
      newAvgEntry:  round2(avgEntry),
      totalCapital: round2(runningMargin),
      totalQty:     roundN(runningQty, 6),
      breakeven:    round2(breakeven),
      totalFees:    round2(totalFees),
    },
  };
}
