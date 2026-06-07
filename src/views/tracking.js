/**
 * tracking.js — Live Tracking View Controller
 * Handles Mode 3: compare actual balances against the projected plan,
 * detect losses, course-correct, and maintain a history log.
 */

import { state, notify, subscribe } from '../core/state.js';
import { computeForward } from '../core/engine.js';
import { fmt, fmtSigned } from '../core/formatter.js';
import { validate, clearErrors, setError } from '../core/validator.js';
import { showToast } from '../components/toast.js';
import { showLossModal } from '../components/modal.js';
import { switchToTab } from '../components/tabs.js';

/**
 * Initialize the Tracking view.
 * Binds event listeners and subscribes to state changes.
 */
export function initTracking() {
  // --- "Go to Compounding" button (shown when no plan exists) ---
  const btnGoto = document.getElementById('btn-goto-forward');
  if (btnGoto) {
    btnGoto.addEventListener('click', () => {
      switchToTab('forward');
    });
  }

  // --- Check Status button ---
  const btnCheck = document.getElementById('btn-lt-check');
  if (btnCheck) {
    btnCheck.addEventListener('click', handleCheckStatus);
  }

  // --- Course Correct button ---
  const btnCorrect = document.getElementById('btn-lt-correct');
  if (btnCorrect) {
    btnCorrect.addEventListener('click', handleCourseCorrect);
  }

  // --- Enter key support on tracking inputs ---
  const inputIds = ['lt-trade-num', 'lt-actual-balance'];
  inputIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleCheckStatus();
        }
      });
    }
  });

  // --- Subscribe to state changes to refresh tracking when plan updates ---
  subscribe(() => {
    refreshTracking();
  });
}

/**
 * Refresh the tracking view based on current state.
 * Shows the empty state or the active tracking interface.
 */
export function refreshTracking() {
  const emptyEl = document.getElementById('tracking-empty');
  const activeEl = document.getElementById('tracking-active');

  if (state.plan) {
    if (emptyEl) emptyEl.classList.add('hidden');
    if (activeEl) activeEl.classList.remove('hidden');
    renderPlanBanner();
  } else {
    if (emptyEl) emptyEl.classList.remove('hidden');
    if (activeEl) activeEl.classList.add('hidden');
  }
}

/**
 * Handle the Check Status action.
 * Validates inputs, compares actual vs projected, detects losses,
 * renders status summary and alert badge, and updates history.
 */
function handleCheckStatus() {
  clearErrors('#view-tracking');

  if (!state.plan) {
    showToast('No plan available. Create a compounding plan first.', 'error');
    return;
  }

  // --- Validate required fields ---
  const { valid } = validate([
    { id: 'lt-trade-num', name: 'Trade Number' },
    { id: 'lt-actual-balance', name: 'Actual Balance' },
  ]);

  if (!valid) return;

  // --- Parse input values ---
  const tradeNum = parseInt(document.getElementById('lt-trade-num').value, 10);
  const actualBalance = parseFloat(document.getElementById('lt-actual-balance').value);

  // --- Validate trade number is within plan range ---
  if (isNaN(tradeNum) || tradeNum < 1 || tradeNum > state.plan.params.trades) {
    setError('lt-trade-num', `Trade number must be between 1 and ${state.plan.params.trades}`);
    showToast(`Trade number must be between 1 and ${state.plan.params.trades}.`, 'error');
    return;
  }

  if (isNaN(actualBalance) || actualBalance < 0) {
    setError('lt-actual-balance', 'Please enter a valid balance');
    showToast('Please enter a valid actual balance.', 'error');
    return;
  }

  // --- Get projected balance for this trade ---
  const projectedRow = state.plan.rows[tradeNum - 1];
  const projected = projectedRow.closing;

  // --- Loss detection ---
  // If there is a previous actual balance and the new one is lower, show loss modal
  if (state.prevActualBalance !== null && actualBalance < state.prevActualBalance) {
    const lossAmount = state.prevActualBalance - actualBalance;
    showLossModal(lossAmount, state.prevActualBalance, actualBalance);
  }

  // --- Store actual balance ---
  state.actualBalances[tradeNum] = actualBalance;
  state.prevActualBalance = actualBalance;

  // Notify subscribers (analytics will refresh its chart)
  notify();

  // --- Calculate difference ---
  const diff = actualBalance - projected;
  const diffPct = (diff / projected) * 100;

  // --- Render summary stat-strip ---
  renderStatusSummary(tradeNum, projected, actualBalance, diff, diffPct);

  // --- Render alert badge ---
  renderAlertBadge(diff, diffPct);

  // --- Show results and course correct button ---
  const ltResults = document.getElementById('lt-results');
  if (ltResults) ltResults.classList.remove('hidden');

  const btnCorrect = document.getElementById('btn-lt-correct');
  if (btnCorrect) btnCorrect.classList.remove('hidden');

  // --- Update history table ---
  updateHistoryTable();

  showToast(`Status checked for trade #${tradeNum}`, 'info');
}

/**
 * Render the status summary stat-strip with projected, actual, and difference.
 * @param {number} tradeNum - The trade number being checked
 * @param {number} projected - The projected closing balance
 * @param {number} actual - The actual balance entered
 * @param {number} diff - The difference (actual - projected)
 * @param {number} diffPct - The percentage difference
 */
function renderStatusSummary(tradeNum, projected, actual, diff, diffPct) {
  const summary = document.getElementById('lt-summary');
  if (!summary) return;

  const actualClass = actual >= projected ? 'text-green' : 'text-red';

  // Difference display with sign
  const diffClass = diff >= 0 ? 'text-green' : 'text-red';
  const diffPrefix = diff >= 0 ? '+' : '';
  const diffDisplay = `${diffPrefix}${fmt(diff)} (${diffPrefix}${diffPct.toFixed(2)}%)`;

  summary.innerHTML = `
    <div class="stat-card">
      <div class="stat-card__label">Projected (Trade #${tradeNum})</div>
      <div class="stat-card__value" style="color: #818cf8;">${fmt(projected)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card__label">Actual Balance</div>
      <div class="stat-card__value ${actualClass}">${fmt(actual)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card__label">Difference</div>
      <div class="stat-card__value ${diffClass}">${diffDisplay}</div>
    </div>
  `;
}

/**
 * Render the alert badge indicating whether the user is ahead, behind, or on track.
 * @param {number} diff - The difference (actual - projected)
 * @param {number} diffPct - The percentage difference
 */
function renderAlertBadge(diff, diffPct) {
  const alertArea = document.getElementById('lt-alert-area');
  if (!alertArea) return;

  let badgeType = '';
  let icon = '';
  let text = '';

  if (Math.abs(diff) < 0.01) {
    // On track — negligible difference
    badgeType = 'on-track';
    icon = '✅';
    text = 'Right on track! Your actual balance matches the projection.';
  } else if (diff > 0) {
    // Ahead of plan
    badgeType = 'ahead';
    icon = '🚀';
    text = `Ahead by +${fmt(diff)} (${diffPct >= 0 ? '+' : ''}${diffPct.toFixed(2)}%)`;
  } else {
    // Behind plan
    badgeType = 'behind';
    icon = '⚠️';
    text = `Behind by ${fmt(Math.abs(diff))} (${diffPct.toFixed(2)}%)`;
  }

  alertArea.innerHTML = `
    <div class="alert-badge alert-badge--${badgeType}">
      ${icon} ${text}
    </div>
  `;
}

/**
 * Handle the Course Correct action.
 * Recalculates the plan from the current actual balance for the remaining trades.
 */
function handleCourseCorrect() {
  if (!state.plan) {
    showToast('No plan available.', 'error');
    return;
  }

  // Read current inputs
  const tradeNumEl = document.getElementById('lt-trade-num');
  const actualBalEl = document.getElementById('lt-actual-balance');

  if (!tradeNumEl || !actualBalEl) return;

  const tradeNum = parseInt(tradeNumEl.value, 10);
  const actualBalance = parseFloat(actualBalEl.value);

  if (isNaN(tradeNum) || isNaN(actualBalance)) {
    showToast('Please check status first before course correcting.', 'error');
    return;
  }

  // --- Calculate remaining trades ---
  const remaining = state.plan.params.trades - tradeNum;

  if (remaining <= 0) {
    showToast('No remaining trades to recalculate.', 'error');
    return;
  }

  // --- Run forward computation from actual balance ---
  const correctedRows = computeForward({
    startAmt: actualBalance,
    rate: state.plan.params.rate,
    valueType: state.plan.params.valueType,
    trades: remaining,
    feeType: state.plan.params.feeType,
    feeVal: state.plan.params.feeVal,
    recurType: state.plan.params.recurType,
    recurVal: state.plan.params.recurVal,
  });

  // Re-number the rows so they start from tradeNum + 1
  correctedRows.forEach((row, index) => {
    row.trade = tradeNum + 1 + index;
  });

  // --- Render corrected table ---
  renderCorrectedTable(correctedRows);

  // --- Render corrected summary ---
  const newFinal = correctedRows[correctedRows.length - 1].closing;
  const originalFinal = state.plan.rows[state.plan.rows.length - 1].closing;
  const finalDiff = newFinal - originalFinal;

  renderCorrectedSummary(newFinal, originalFinal, finalDiff);

  // --- Show corrected card ---
  const correctedCard = document.getElementById('lt-corrected-card');
  if (correctedCard) correctedCard.classList.remove('hidden');

  showToast(`Plan recalculated from trade #${tradeNum}`, 'warning');
}

/**
 * Render the corrected plan table body.
 * @param {Array} rows - Re-numbered corrected rows from computeForward
 */
function renderCorrectedTable(rows) {
  const tbody = document.getElementById('lt-corrected-tbody');
  if (!tbody) return;

  const rowsHtml = rows.map((row) => {
    // Profit
    const profitText = `+${fmt(row.profit)}`;
    const profitClass = 'text-green';

    // Fees
    let feesText = '—';
    let feesClass = '';
    if (row.fees > 0) {
      feesText = `-${fmt(row.fees)}`;
      feesClass = 'text-red';
    }

    return `<tr>
      <td>${row.trade}</td>
      <td>${fmt(row.opening)}</td>
      <td class="${profitClass}">${profitText}</td>
      <td class="${feesClass}">${feesText}</td>
      <td><strong>${fmt(row.closing)}</strong></td>
    </tr>`;
  }).join('');

  tbody.innerHTML = rowsHtml;
}

/**
 * Render the corrected plan summary stat-strip.
 * @param {number} newFinal - New projected final amount
 * @param {number} originalFinal - Original plan final amount
 * @param {number} diff - Difference between new and original
 */
function renderCorrectedSummary(newFinal, originalFinal, diff) {
  const summary = document.getElementById('lt-corrected-summary');
  if (!summary) return;

  const diffClass = diff >= 0 ? 'text-green' : 'text-red';
  const diffPrefix = diff >= 0 ? '+' : '';

  summary.innerHTML = `
    <div class="stat-card">
      <div class="stat-card__label">New Projected Final</div>
      <div class="stat-card__value text-green">${fmt(newFinal)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card__label">Original Plan Final</div>
      <div class="stat-card__value" style="color: #818cf8;">${fmt(originalFinal)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card__label">Difference</div>
      <div class="stat-card__value ${diffClass}">${diffPrefix}${fmt(Math.abs(diff))}</div>
    </div>
  `;
}

/**
 * Render the plan summary banner with key parameters shown as inline badges.
 */
function renderPlanBanner() {
  const banner = document.getElementById('lt-plan-banner');
  if (!banner || !state.plan) return;

  const { startAmt, rate, valueType, trades, feeType, feeVal } = state.plan.params;

  // Rate label
  const rateLabel = valueType === 'percent' ? `${rate}%` : `₹${fmt(rate)} fixed`;

  // Fee label
  let feeLabel = 'No fees';
  if (feeType && feeType !== 'none' && feeVal > 0) {
    feeLabel = feeType === 'percent' ? `${feeVal}% fee` : `₹${fmt(feeVal)} fee`;
  }

  banner.innerHTML = `
    <span class="plan-badge">Starting: ₹${fmt(startAmt)}</span>
    <span class="plan-badge">Rate: ${rateLabel}</span>
    <span class="plan-badge">Trades: ${trades}</span>
    <span class="plan-badge">${feeLabel}</span>
  `;
}

/**
 * Build and render the history table from state.actualBalances.
 * Shows each checked trade with projected vs actual comparison.
 */
function updateHistoryTable() {
  const tbody = document.getElementById('lt-history-tbody');
  const card = document.getElementById('lt-history-card');
  if (!tbody || !state.plan) return;

  // Get all trade numbers that have actual balances, sorted
  const tradeNums = Object.keys(state.actualBalances)
    .map(Number)
    .sort((a, b) => a - b);

  if (tradeNums.length === 0) {
    if (card) card.classList.add('hidden');
    return;
  }

  const rowsHtml = tradeNums.map((tradeNum) => {
    const actual = state.actualBalances[tradeNum];
    const projected = state.plan.rows[tradeNum - 1].closing;
    const diff = actual - projected;
    const diffPct = (diff / projected) * 100;

    // Difference display
    const diffClass = diff >= 0 ? 'text-green' : 'text-red';
    const diffPrefix = diff >= 0 ? '+' : '';
    const diffText = `${diffPrefix}${fmt(diff)}`;

    // Status badge
    let statusBadge = '';
    if (Math.abs(diff) < 0.01) {
      statusBadge = `<span class="alert-badge alert-badge--on-track">On Track</span>`;
    } else if (diff > 0) {
      statusBadge = `<span class="alert-badge alert-badge--ahead">Ahead</span>`;
    } else {
      statusBadge = `<span class="alert-badge alert-badge--behind">Behind</span>`;
    }

    return `<tr>
      <td>${tradeNum}</td>
      <td>${fmt(projected)}</td>
      <td>${fmt(actual)}</td>
      <td class="${diffClass}">${diffText}</td>
      <td>${statusBadge}</td>
    </tr>`;
  }).join('');

  tbody.innerHTML = rowsHtml;

  // Show the history card
  if (card) card.classList.remove('hidden');
}
