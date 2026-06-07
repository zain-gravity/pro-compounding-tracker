/**
 * converter.js — Mode 6: USD-INR Crypto Sensitivity & Prediction Engine
 * Live-reactive module: all calculations update as the user types.
 *
 * Features:
 *  - Auto-sync investment from Mode 1 Starting Amount
 *  - Auto-sync brokerage fee from Mode 1 Advanced Config
 *  - Leverage multiplier affecting quantity, sensitivity, PnL
 *  - Liquidation price calculator (same math as Risk Manager)
 *  - Tick sensitivity table with 7 multipliers
 *  - Dynamic PnL card with Long/Short direction
 */

import { state, subscribe } from '../core/state.js';
import { fmt } from '../core/formatter.js';
import { showToast } from '../components/toast.js';

/* ── Module-level sync trackers ──────────────────────────────── */
let lastSyncedInvestment = null;
let lastSyncedFee = null;

/* ===================================================================
   initConverter()  –  bind listeners & sync from Mode 1
   =================================================================== */
export function initConverter() {

  /* ── 1. Initial sync from Mode 1 state ────────────────────────── */
  syncInvestmentFromState();
  syncFeeFromState();

  /* ── 2. Subscribe for future state changes ────────────────────── */
  subscribe(() => {
    syncInvestmentFromState();
    syncFeeFromState();
  });

  /* ── 3. Live input listeners → recalculate everything ─────────── */
  const liveIds = [
    'cv-usd-inr', 'cv-investment-inr', 'cv-entry-price',
    'cv-tick-size', 'cv-leverage', 'cv-fee-rate'
  ];
  liveIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', recalculate);
  });

  /* ── 4. Investment manual override detection ──────────────────── */
  const investEl = document.getElementById('cv-investment-inr');
  if (investEl) {
    investEl.addEventListener('input', () => {
      if (lastSyncedInvestment !== null && investEl.value.trim() !== lastSyncedInvestment) {
        lastSyncedInvestment = null;
        setBadge('cv-sync-badge', 'Custom Amount', 'amber');
      }
    });
  }

  /* ── 5. Fee manual override detection ─────────────────────────── */
  const feeEl = document.getElementById('cv-fee-rate');
  if (feeEl) {
    feeEl.addEventListener('input', () => {
      if (lastSyncedFee !== null && feeEl.value.trim() !== lastSyncedFee) {
        lastSyncedFee = null;
        setBadge('cv-fee-sync-badge', 'Custom Fee', 'amber');
      }
    });
  }

  /* ── 6. PnL + direction live listeners ────────────────────────── */
  const targetEl = document.getElementById('cv-target-price');
  if (targetEl) targetEl.addEventListener('input', recalcPnl);

  // Direction change recalculates everything (liquidation depends on direction)
  const dirEl = document.getElementById('cv-direction');
  if (dirEl) dirEl.addEventListener('change', recalculate);
}

/* ===================================================================
   refreshConverter()  –  called on tab activation
   =================================================================== */
export function refreshConverter() {
  recalculate();
}

/* ===================================================================
   Sync helpers
   =================================================================== */
function syncInvestmentFromState() {
  const newAmt = state.plan?.params?.startAmt;
  if (newAmt == null) return;

  const el = document.getElementById('cv-investment-inr');
  if (!el) return;

  const cur = el.value.trim();
  if (cur === '' || cur === lastSyncedInvestment) {
    el.value = newAmt;
    lastSyncedInvestment = String(newAmt);
    setBadge('cv-sync-badge', 'Synced from Compounding', 'indigo');
    recalculate();
  }
}

function syncFeeFromState() {
  const feeType = state.plan?.params?.feeType;
  const feeVal = state.plan?.params?.feeVal;

  // Only auto-sync percentage fees (fixed fees can't map to %)
  if (feeType !== 'percent' || !feeVal) return;

  const el = document.getElementById('cv-fee-rate');
  if (!el) return;

  const cur = el.value.trim();
  if (cur === '' || cur === '0.05' || cur === lastSyncedFee) {
    el.value = feeVal;
    lastSyncedFee = String(feeVal);
    setBadge('cv-fee-sync-badge', 'Synced from Compounding', 'indigo');
  }
}

function setBadge(id, text, color) {
  const badge = document.getElementById(id);
  if (badge) {
    badge.innerHTML = `<span class='badge badge--${color}'>${text}</span>`;
  }
}

/* ===================================================================
   recalculate()  –  core live calculation engine
   =================================================================== */
function recalculate() {
  const usdInr     = parseFloat(document.getElementById('cv-usd-inr')?.value) || 0;
  const investInr  = parseFloat(document.getElementById('cv-investment-inr')?.value) || 0;
  const entryPrice = parseFloat(document.getElementById('cv-entry-price')?.value) || 0;
  const tickSize   = parseFloat(document.getElementById('cv-tick-size')?.value) || 0;
  const leverage   = parseFloat(document.getElementById('cv-leverage')?.value) || 1;
  const feeRate    = parseFloat(document.getElementById('cv-fee-rate')?.value) || 0;
  const direction  = document.getElementById('cv-direction')?.value || 'long';

  const resultsEl = document.getElementById('cv-results');

  if (usdInr <= 0 || investInr <= 0 || entryPrice <= 0) {
    if (resultsEl) resultsEl.classList.add('hidden');
    hideLiquidation();
    return;
  }

  /* ── Core calculations ─────────────────────────────────────────── */
  const marginUsd    = investInr / usdInr;              // actual capital in USD
  const positionSize = marginUsd * leverage;             // leveraged position
  const quantity     = positionSize / entryPrice;        // leveraged asset qty
  const inrPerTick   = tickSize > 0 ? quantity * tickSize * usdInr : 0;

  /* ── Smart quantity formatting ─────────────────────────────────── */
  let qtyFormatted;
  if (quantity >= 1_000_000) {
    qtyFormatted = quantity.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  } else if (quantity >= 1) {
    qtyFormatted = quantity.toLocaleString('en-IN', { maximumFractionDigits: 6 });
  } else {
    qtyFormatted = quantity.toFixed(8);
  }

  /* ── Tick label ────────────────────────────────────────────────── */
  const tickLabel = tickSize > 0
    ? `INR per Tick (${formatPrice(tickSize)})`
    : 'INR per Tick';

  /* ── Leverage label ────────────────────────────────────────────── */
  const levLabel = leverage > 1 ? `<span class='badge badge--indigo'>${leverage}×</span>` : '';

  /* ── Summary stat-strip ────────────────────────────────────────── */
  const summaryEl = document.getElementById('cv-summary');
  if (summaryEl) {
    let cards = `
      <div class='stat-card'>
        <div class='stat-card__label'>Margin (USD)</div>
        <div class='stat-card__value'>$${fmt(marginUsd)}</div>
      </div>`;

    if (leverage > 1) {
      cards += `
      <div class='stat-card'>
        <div class='stat-card__label'>Position Size ${levLabel}</div>
        <div class='stat-card__value text-indigo'>$${fmt(positionSize)}</div>
      </div>`;
    }

    cards += `
      <div class='stat-card'>
        <div class='stat-card__label'>Asset Quantity ${levLabel}</div>
        <div class='stat-card__value text-cyan'>${qtyFormatted}</div>
      </div>
      <div class='stat-card'>
        <div class='stat-card__label'>${tickLabel}</div>
        <div class='stat-card__value text-amber'>₹${fmt(Math.abs(inrPerTick))}</div>
      </div>`;

    summaryEl.innerHTML = cards;
  }

  /* ── Tick sensitivity table ────────────────────────────────────── */
  renderTickTable(quantity, usdInr, tickSize, entryPrice);

  if (resultsEl) resultsEl.classList.remove('hidden');

  /* ── Liquidation calculation (only when leverage > 1) ──────────── */
  calcLiquidation(entryPrice, marginUsd, positionSize, quantity, leverage, feeRate, direction, usdInr);

  /* ── Recalculate PnL with leveraged quantity ───────────────────── */
  recalcPnl();
}

/* ===================================================================
   renderTickTable()
   =================================================================== */
function renderTickTable(quantity, usdInr, tickSize, entryPrice) {
  const tbody = document.getElementById('cv-tick-tbody');
  if (!tbody || tickSize === 0) return;

  const multipliers = [1, 2, 5, 10, 20, 50, 100];

  tbody.innerHTML = multipliers
    .map((mult) => {
      const move      = tickSize * mult;
      const inrChange = quantity * move * usdInr;
      const pctChange = (move / entryPrice) * 100;
      return `<tr>
        <td>${mult}×</td>
        <td>${formatPrice(move)}</td>
        <td class="text-green">+₹${fmt(inrChange)}</td>
        <td class="text-red">-₹${fmt(inrChange)}</td>
        <td>${pctChange.toFixed(4)}%</td>
      </tr>`;
    })
    .join('');
}

/* ===================================================================
   calcLiquidation()  –  shows BOTH Long & Short liquidation prices
   Uses the same math as Risk Manager engine for consistency.
   =================================================================== */
function calcLiquidation(entryPrice, marginUsd, positionSize, quantity, leverage, feeRate, direction, usdInr) {
  const liqEl = document.getElementById('cv-liq-results');
  const liqSummary = document.getElementById('cv-liq-summary');

  if (leverage <= 1 || !liqEl || !liqSummary) {
    hideLiquidation();
    return;
  }

  /* ── Math (same formula as engine.js calcLiquidation) ──────────── */
  const entryFee        = positionSize * (feeRate / 100);
  const effectiveMargin = marginUsd - entryFee;

  // Long liquidation — price drops to this level
  const liqLong         = (positionSize - effectiveMargin) / (quantity * (1 - feeRate / 100));
  const distLong        = Math.abs(entryPrice - liqLong) / entryPrice * 100;

  // Short liquidation — price rises to this level
  const liqShort        = (positionSize + effectiveMargin) / (quantity * (1 + feeRate / 100));
  const distShort       = Math.abs(liqShort - entryPrice) / entryPrice * 100;

  const marginRatio     = marginUsd / positionSize * 100;

  /* ── Distance color helper ─────────────────────────────────────── */
  const distColor = (d) => d > 10 ? 'text-green' : d >= 5 ? 'text-amber' : 'text-red';

  /* ── Active direction highlight ────────────────────────────────── */
  const longActive  = direction === 'long'  ? " style='border:1px solid rgba(52,211,153,0.3);background:rgba(52,211,153,0.04)'" : '';
  const shortActive = direction === 'short' ? " style='border:1px solid rgba(251,113,133,0.3);background:rgba(251,113,133,0.04)'" : '';

  /* ── Render both ───────────────────────────────────────────────── */
  liqSummary.innerHTML = `
    <div class='stat-card'${longActive}>
      <div class='stat-card__label'>🟢 Long Liq Price</div>
      <div class='stat-card__value text-rose'>$${formatPrice(liqLong)}</div>
      <div class='stat-card__sub'>₹${fmt(liqLong * usdInr)} · ${distLong.toFixed(2)}% away</div>
    </div>
    <div class='stat-card'${shortActive}>
      <div class='stat-card__label'>🔴 Short Liq Price</div>
      <div class='stat-card__value text-rose'>$${formatPrice(liqShort)}</div>
      <div class='stat-card__sub'>₹${fmt(liqShort * usdInr)} · ${distShort.toFixed(2)}% away</div>
    </div>
    <div class='stat-card'>
      <div class='stat-card__label'>Distance (${direction === 'long' ? 'Long' : 'Short'})</div>
      <div class='stat-card__value ${distColor(direction === 'long' ? distLong : distShort)}'>${(direction === 'long' ? distLong : distShort).toFixed(2)}%</div>
    </div>
    <div class='stat-card'>
      <div class='stat-card__label'>Margin Ratio</div>
      <div class='stat-card__value'>${marginRatio.toFixed(2)}%</div>
    </div>`;

  liqEl.classList.remove('hidden');
}

function hideLiquidation() {
  const el = document.getElementById('cv-liq-results');
  if (el) el.classList.add('hidden');
}

/* ===================================================================
   recalcPnl()  –  Dynamic PnL prediction using leveraged quantity
   =================================================================== */
function recalcPnl() {
  const usdInr      = parseFloat(document.getElementById('cv-usd-inr')?.value) || 0;
  const investInr   = parseFloat(document.getElementById('cv-investment-inr')?.value) || 0;
  const entryPrice  = parseFloat(document.getElementById('cv-entry-price')?.value) || 0;
  const targetPrice = parseFloat(document.getElementById('cv-target-price')?.value) || 0;
  const direction   = document.getElementById('cv-direction')?.value || 'long';
  const leverage    = parseFloat(document.getElementById('cv-leverage')?.value) || 1;

  const pnlResultsEl = document.getElementById('cv-pnl-results');

  if (usdInr <= 0 || investInr <= 0 || entryPrice <= 0 || targetPrice <= 0) {
    if (pnlResultsEl) pnlResultsEl.classList.add('hidden');
    return;
  }

  /* ── Leveraged calculations ────────────────────────────────────── */
  const marginUsd    = investInr / usdInr;
  const positionSize = marginUsd * leverage;
  const quantity     = positionSize / entryPrice;

  const pnlUsd = direction === 'long'
    ? quantity * (targetPrice - entryPrice)
    : quantity * (entryPrice - targetPrice);

  const pnlInr = pnlUsd * usdInr;

  const pnlPct = direction === 'long'
    ? ((targetPrice - entryPrice) / entryPrice) * 100
    : ((entryPrice - targetPrice) / entryPrice) * 100;

  // ROI is relative to actual capital (margin), not position size
  const roi = (pnlInr / investInr) * 100;

  const isProfit   = pnlInr >= 0;
  const colorClass = isProfit ? 'text-green' : 'text-red';
  const prefix     = isProfit ? '+' : '-';

  /* ── Render ────────────────────────────────────────────────────── */
  const pnlSummaryEl = document.getElementById('cv-pnl-summary');
  if (pnlSummaryEl) {
    pnlSummaryEl.innerHTML = `
      <div class='stat-card'>
        <div class='stat-card__label'>PnL (USD)</div>
        <div class='stat-card__value ${colorClass}'>${prefix}$${fmt(Math.abs(pnlUsd))}</div>
      </div>
      <div class='stat-card'>
        <div class='stat-card__label'>PnL (INR)</div>
        <div class='stat-card__value ${colorClass}'>${prefix}₹${fmt(Math.abs(pnlInr))}</div>
      </div>
      <div class='stat-card'>
        <div class='stat-card__label'>Price Change</div>
        <div class='stat-card__value ${colorClass}'>${prefix}${Math.abs(pnlPct).toFixed(2)}%</div>
      </div>
      <div class='stat-card'>
        <div class='stat-card__label'>ROI on Capital</div>
        <div class='stat-card__value ${colorClass}'>${prefix}${Math.abs(roi).toFixed(2)}%</div>
      </div>`;
  }

  if (pnlResultsEl) pnlResultsEl.classList.remove('hidden');
}

/* ===================================================================
   formatPrice()  –  handles micro-decimals gracefully
   =================================================================== */
function formatPrice(price) {
  if (!price || price === 0) return '—';
  if (price >= 1)
    return price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const str = price.toFixed(10);
  return str.replace(/0+$/, '').replace(/\.$/, '');
}
