/**
 * forward.js — Forward Compounding View Controller
 * Handles Mode 1: project compound growth from a starting amount.
 */

import { state, notify } from '../core/state.js';
import { computeForward } from '../core/engine.js';
import { fmt, fmtSigned } from '../core/formatter.js';
import { validate, clearErrors } from '../core/validator.js';
import { showToast } from '../components/toast.js';

/**
 * Initialize the Forward Compounding view.
 * Binds all event listeners for calculate, reset, advanced toggle, and Enter key.
 */
export function initForward() {
  // --- Advanced panel toggle ---
  const advToggle = document.getElementById('fc-advanced-toggle');
  const advPanel = document.getElementById('fc-advanced-panel');

  if (advToggle && advPanel) {
    advToggle.addEventListener('click', () => {
      const isExpanded = advPanel.classList.contains('expanded');

      if (isExpanded) {
        // Collapse the panel
        advPanel.classList.remove('expanded');
        advPanel.classList.add('collapsed');
        advToggle.setAttribute('aria-expanded', 'false');
      } else {
        // Expand the panel
        advPanel.classList.remove('collapsed');
        advPanel.classList.add('expanded');
        advToggle.setAttribute('aria-expanded', 'true');
      }
    });
  }

  // --- Calculate button ---
  const btnCalculate = document.getElementById('btn-fc-calculate');
  if (btnCalculate) {
    btnCalculate.addEventListener('click', handleCalculate);
  }

  // --- Reset button ---
  const btnReset = document.getElementById('btn-fc-reset');
  if (btnReset) {
    btnReset.addEventListener('click', handleReset);
  }

  // --- Enter key support on all forward inputs ---
  const inputIds = [
    'fc-start', 'fc-rate', 'fc-trades',
    'fc-fee-value', 'fc-recurring-value',
  ];
  inputIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleCalculate();
        }
      });
    }
  });
}

/**
 * Handle the Calculate action for forward compounding.
 * Validates inputs, runs the computation engine, stores results in state,
 * renders the output table and summary strip, and shows a success toast.
 */
function handleCalculate() {
  const viewRoot = '#view-forward';
  clearErrors(viewRoot);

  // --- Validate required fields ---
  const { valid } = validate([
    { id: 'fc-start', name: 'Starting Amount' },
    { id: 'fc-rate', name: 'Rate' },
    { id: 'fc-trades', name: 'Trades' },
  ]);

  if (!valid) return;

  // --- Parse input values ---
  const startAmt = parseFloat(document.getElementById('fc-start').value);
  const rate = parseFloat(document.getElementById('fc-rate').value);
  const valueType = document.getElementById('fc-type').value; // 'percentage' or 'fixed'
  const trades = parseInt(document.getElementById('fc-trades').value, 10);

  // Fee inputs (may be empty / zero)
  const feeTypeEl = document.getElementById('fc-fee-type');
  const feeValueEl = document.getElementById('fc-fee-value');
  const feeType = feeTypeEl ? feeTypeEl.value : 'none';
  const feeVal = feeValueEl ? parseFloat(feeValueEl.value) || 0 : 0;

  // Recurring deposit / withdrawal inputs
  const recurTypeEl = document.getElementById('fc-recurring-type');
  const recurValueEl = document.getElementById('fc-recurring-value');
  const recurType = recurTypeEl ? recurTypeEl.value : 'none';
  const recurVal = recurValueEl ? parseFloat(recurValueEl.value) || 0 : 0;

  // --- Additional validation ---
  if (isNaN(startAmt) || startAmt <= 0) {
    showToast('Starting amount must be a positive number.', 'error');
    return;
  }
  if (isNaN(rate) || rate === 0) {
    showToast('Rate must be a non-zero number.', 'error');
    return;
  }
  if (isNaN(trades) || trades < 1 || trades > 10000) {
    showToast('Trades must be between 1 and 10,000.', 'error');
    return;
  }

  // --- Run the computation engine ---
  const rows = computeForward({
    startAmt,
    rate,
    valueType,
    trades,
    feeType,
    feeVal,
    recurType,
    recurVal,
  });

  // --- Store results in global state ---
  state.plan = {
    params: {
      startAmt,
      rate,
      valueType,
      trades,
      feeType,
      feeVal,
      recurType,
      recurVal,
    },
    rows,
  };

  // Reset tracking-related state when a new plan is created
  state.actualBalances = {};
  state.prevActualBalance = null;

  // Notify all subscribers that state has changed
  notify();

  // --- Render results ---
  renderResults(rows, startAmt);

  showToast(`Plan calculated! ${trades} trades projected.`, 'success');
}

/**
 * Handle the Reset action — clears all inputs, hides results, wipes state.plan.
 */
function handleReset() {
  // Clear text/number inputs
  const inputIds = ['fc-start', 'fc-rate', 'fc-trades', 'fc-fee-value', 'fc-recurring-value'];
  inputIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  // Reset selects to their first option (default)
  const selectIds = ['fc-type', 'fc-fee-type', 'fc-recurring-type'];
  selectIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.selectedIndex = 0;
  });

  // Hide the results container
  const results = document.getElementById('fc-results');
  if (results) results.classList.add('hidden');

  // Clear errors
  clearErrors('#view-forward');

  // Wipe plan from state
  state.plan = null;
  notify();
}

/**
 * Render the forward compounding results: summary stat-strip and detailed table.
 * @param {Array} rows - Array of row objects from computeForward
 * @param {number} startAmt - The original starting amount
 */
function renderResults(rows, startAmt) {
  // --- Build table body ---
  const tbody = document.getElementById('fc-tbody');
  if (tbody) {
    const rowsHtml = rows.map((row) => {
      // Profit cell — always positive in forward mode, show with + sign
      const profitText = `+${fmt(row.profit)}`;
      const profitClass = 'text-green';

      // Fees cell — show dash if zero
      let feesText = '—';
      let feesClass = '';
      if (row.fees > 0) {
        feesText = `-${fmt(row.fees)}`;
        feesClass = 'text-red';
      }

      // Recurring cell — deposit is positive (green), withdrawal is negative (red)
      let recurText = '—';
      let recurClass = '';
      if (row.recurring !== undefined && row.recurring !== 0) {
        if (row.recurring > 0) {
          recurText = `+${fmt(row.recurring)}`;
          recurClass = 'text-green';
        } else {
          recurText = `-${fmt(Math.abs(row.recurring))}`;
          recurClass = 'text-red';
        }
      }

      return `<tr>
        <td>${row.trade}</td>
        <td>${fmt(row.opening)}</td>
        <td class="${profitClass}">${profitText}</td>
        <td class="${feesClass}">${feesText}</td>
        <td class="${recurClass}">${recurText}</td>
        <td><strong>${fmt(row.closing)}</strong></td>
      </tr>`;
    }).join('');

    tbody.innerHTML = rowsHtml;
  }

  // --- Compute summary values ---
  const finalAmt = rows[rows.length - 1].closing;
  const totalProfit = rows.reduce((sum, r) => sum + r.profit, 0);
  const totalFees = rows.reduce((sum, r) => sum + (r.fees || 0), 0);
  const netProfit = finalAmt - startAmt;
  const growthPct = ((finalAmt - startAmt) / startAmt) * 100;

  // --- Build summary stat-strip ---
  const summary = document.getElementById('fc-summary');
  if (summary) {
    // Determine net profit color
    const netClass = netProfit >= 0 ? 'text-green' : 'text-red';
    const netPrefix = netProfit >= 0 ? '+' : '-';
    const netDisplay = netProfit >= 0 ? fmt(netProfit) : fmt(Math.abs(netProfit));

    // Fees display
    const feesDisplay = totalFees > 0 ? `-${fmt(totalFees)}` : '—';
    const feesClass = totalFees > 0 ? 'text-red' : '';

    summary.innerHTML = `
      <div class="stat-card">
        <div class="stat-card__label">Final Amount</div>
        <div class="stat-card__value text-green">${fmt(finalAmt)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">Gross Profit</div>
        <div class="stat-card__value text-green">+${fmt(totalProfit)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">Total Fees</div>
        <div class="stat-card__value ${feesClass}">${feesDisplay}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">Net Profit (${growthPct >= 0 ? '+' : ''}${growthPct.toFixed(2)}%)</div>
        <div class="stat-card__value ${netClass}">${netPrefix}${netDisplay}</div>
      </div>
    `;
  }

  // --- Show results container ---
  const results = document.getElementById('fc-results');
  if (results) results.classList.remove('hidden');
}

/**
 * Restore the forward compounding view from saved state.
 * Called on app startup if state was persisted from a previous session.
 * Re-fills input fields and re-renders the results table + summary.
 */
export function restoreForwardIfSaved() {
  if (!state.plan) return;

  const p = state.plan.params;

  // Restore input field values
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el && val !== undefined && val !== null && val !== 0) el.value = val;
  };
  const setSel = (id, val) => {
    const el = document.getElementById(id);
    if (el && val) el.value = val;
  };

  setVal('fc-start', p.startAmt);
  setVal('fc-rate', p.rate);
  setSel('fc-type', p.valueType);
  setVal('fc-trades', p.trades);
  setSel('fc-fee-type', p.feeType);
  setVal('fc-fee-value', p.feeVal);
  setSel('fc-recurring-type', p.recurType);
  setVal('fc-recurring-value', p.recurVal);

  // If advanced options were used, expand the panel
  if ((p.feeType && p.feeType !== 'none') || (p.recurType && p.recurType !== 'none')) {
    const advPanel = document.getElementById('fc-advanced-panel');
    const advToggle = document.getElementById('fc-advanced-toggle');
    if (advPanel) {
      advPanel.classList.remove('collapsed');
      advPanel.classList.add('expanded');
    }
    if (advToggle) {
      advToggle.setAttribute('aria-expanded', 'true');
    }
  }

  // Re-render results
  renderResults(state.plan.rows, p.startAmt);
}
