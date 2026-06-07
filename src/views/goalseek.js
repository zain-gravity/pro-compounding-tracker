/**
 * goalseek.js — Goal Seek View Controller
 * Handles Mode 2: calculate the required starting amount to reach a target goal.
 */

import { computeGoalSeek } from '../core/engine.js';
import { fmt, fmtSigned } from '../core/formatter.js';
import { validate, clearErrors } from '../core/validator.js';
import { showToast } from '../components/toast.js';

/**
 * Initialize the Goal Seek view.
 * Binds event listeners for calculate, reset, and Enter key shortcuts.
 */
export function initGoalSeek() {
  // --- Calculate button ---
  const btnCalculate = document.getElementById('btn-gs-calculate');
  if (btnCalculate) {
    btnCalculate.addEventListener('click', handleCalculate);
  }

  // --- Reset button ---
  const btnReset = document.getElementById('btn-gs-reset');
  if (btnReset) {
    btnReset.addEventListener('click', handleReset);
  }

  // --- Enter key support on all goal-seek inputs ---
  const inputIds = ['gs-goal', 'gs-rate', 'gs-trades'];
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
 * Handle the Calculate action for goal seeking.
 * Validates inputs, runs computeGoalSeek, renders the result summary
 * and a verification table generated via computeForward.
 */
function handleCalculate() {
  const viewRoot = '#view-goalseek';
  clearErrors(viewRoot);

  // --- Validate required fields ---
  const { valid } = validate([
    { id: 'gs-goal', name: 'Target Goal' },
    { id: 'gs-rate', name: 'Rate' },
    { id: 'gs-trades', name: 'Trades' },
  ]);

  if (!valid) return;

  // --- Parse input values ---
  const goal = parseFloat(document.getElementById('gs-goal').value);
  const rate = parseFloat(document.getElementById('gs-rate').value);
  const valueTypeEl = document.getElementById('gs-type');
  const valueType = valueTypeEl ? valueTypeEl.value : 'percent';
  const trades = parseInt(document.getElementById('gs-trades').value, 10);

  // --- Additional validation ---
  if (isNaN(goal) || goal <= 0) {
    showToast('Target goal must be a positive number.', 'error');
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

  // --- Run the goal seek computation ---
  const result = computeGoalSeek({ goal, rate, valueType, trades });
  const startNeeded = result.startNeeded;

  if (startNeeded === null || isNaN(startNeeded) || startNeeded <= 0) {
    showToast('Could not compute a valid starting amount. Check your inputs.', 'error');
    return;
  }

  // Use the verification rows from the goal seek result
  const verificationRows = result.verificationRows;

  // --- Render summary stat-strip ---
  renderSummary(startNeeded, goal, rate, valueType, trades);

  // --- Render verification table ---
  renderVerificationTable(verificationRows);

  // --- Show results containers ---
  const gsResults = document.getElementById('gs-results');
  if (gsResults) gsResults.classList.remove('hidden');

  const gsVerifyCard = document.getElementById('gs-verify-card');
  if (gsVerifyCard) gsVerifyCard.classList.remove('hidden');

  showToast('Starting amount calculated!', 'success');
}

/**
 * Render the goal seek summary stat-strip.
 * @param {number} startNeeded - The calculated required starting amount
 * @param {number} goal - The target goal amount
 * @param {number} rate - The rate per trade
 * @param {string} valueType - 'percentage' or 'fixed'
 * @param {number} trades - Number of trades
 */
function renderSummary(startNeeded, goal, rate, valueType, trades) {
  const summary = document.getElementById('gs-summary');
  if (!summary) return;

  // Format the growth description string
  const rateLabel = valueType === 'percent' ? `${rate}%` : `₹${fmt(rate)}`;
  const typeLabel = valueType === 'percent' ? 'per trade' : 'fixed per trade';
  const growthText = `${rateLabel} ${typeLabel} × ${trades} trades`;

  summary.innerHTML = `
    <div class="stat-card">
      <div class="stat-card__label">Required Starting Amount</div>
      <div class="stat-card__value text-green">${fmt(startNeeded)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card__label">Target Goal</div>
      <div class="stat-card__value" style="color: #22d3ee;">${fmt(goal)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card__label">Growth via</div>
      <div class="stat-card__value">${growthText}</div>
    </div>
  `;
}

/**
 * Render the verification table showing the forward projection from the
 * calculated starting amount. Uses a simplified format: trade#, opening,
 * profit, closing.
 * @param {Array} rows - Array of row objects from computeForward
 */
function renderVerificationTable(rows) {
  const tbody = document.getElementById('gs-verify-tbody');
  if (!tbody) return;

  const rowsHtml = rows.map((row) => {
    return `<tr>
      <td>${row.trade}</td>
      <td>${fmt(row.opening)}</td>
      <td class="text-green">+${fmt(row.profit)}</td>
      <td><strong>${fmt(row.closing)}</strong></td>
    </tr>`;
  }).join('');

  tbody.innerHTML = rowsHtml;
}

/**
 * Handle the Reset action — clears all inputs and hides results.
 */
function handleReset() {
  // Clear text/number inputs
  const inputIds = ['gs-goal', 'gs-rate', 'gs-trades'];
  inputIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  // Reset the type select to default
  const typeEl = document.getElementById('gs-type');
  if (typeEl) typeEl.selectedIndex = 0;

  // Hide results
  const gsResults = document.getElementById('gs-results');
  if (gsResults) gsResults.classList.add('hidden');

  const gsVerifyCard = document.getElementById('gs-verify-card');
  if (gsVerifyCard) gsVerifyCard.classList.add('hidden');

  // Clear any errors
  clearErrors('#view-goalseek');
}
