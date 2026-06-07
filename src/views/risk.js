import { calcLiquidation, calcLiqWithExtraMargin, calcFixedDCA, calcMartingaleDCA, calcZoneDCA } from '../core/engine.js';
import { fmt } from '../core/formatter.js';
import { validate, clearErrors } from '../core/validator.js';
import { showToast } from '../components/toast.js';

/* ── Module-level state ─────────────────────────────────────────────── */
let lastLiqResult = null;
let lastLiqInputs = null;

/* ===================================================================
   initRisk()  –  bind all event listeners (called once on app startup)
   =================================================================== */
export function initRisk() {

  /* ── Sub-Module A: Liquidation & Margin ─────────────────────────── */

  // 1. Advanced toggle
  const advToggle = document.querySelector('#rm-advanced-toggle');
  if (advToggle) {
    advToggle.addEventListener('click', () => {
      const panel = document.querySelector('#rm-advanced-panel');
      if (!panel) return;
      const isExpanded = panel.classList.contains('expanded');
      panel.classList.toggle('collapsed', !isExpanded ? false : true);
      panel.classList.toggle('expanded', !isExpanded);
      advToggle.setAttribute('aria-expanded', String(!isExpanded));
    });
  }

  // 2. Calculate liquidation
  const btnCalcLiq = document.querySelector('#btn-rm-calc-liq');
  if (btnCalcLiq) {
    btnCalcLiq.addEventListener('click', handleCalcLiq);
  }

  // 3. Reset liquidation
  const btnResetLiq = document.querySelector('#btn-rm-reset-liq');
  if (btnResetLiq) {
    btnResetLiq.addEventListener('click', handleResetLiq);
  }

  // 4. Extra margin slider
  const extraMarginSlider = document.querySelector('#rm-extra-margin');
  if (extraMarginSlider) {
    extraMarginSlider.addEventListener('input', handleExtraMarginChange);
  }

  // 5. Enter key on inputs → trigger handleCalcLiq
  const liqInputIds = ['rm-entry-price', 'rm-margin', 'rm-leverage'];
  liqInputIds.forEach(id => {
    const el = document.querySelector(`#${id}`);
    if (el) {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleCalcLiq();
        }
      });
    }
  });

  /* ── Sub-Module B: DCA Strategy Templates ───────────────────────── */

  // 6. Strategy selector change
  const strategySelect = document.querySelector('#rm-dca-strategy');
  if (strategySelect) {
    strategySelect.addEventListener('change', handleStrategyChange);
  }

  // 7. Simulate DCA
  const btnSimulate = document.querySelector('#btn-rm-simulate');
  if (btnSimulate) {
    btnSimulate.addEventListener('click', handleSimulateDCA);
  }
}

/* ===================================================================
   handleCalcLiq()  –  Sub-Module A core calculation
   =================================================================== */
function handleCalcLiq() {
  clearErrors('#view-risk');

  const { valid } = validate([
    { id: 'rm-entry-price', name: 'Entry Price' },
    { id: 'rm-margin', name: 'Margin' },
    { id: 'rm-leverage', name: 'Leverage' }
  ]);
  if (!valid) return;

  const entryPrice    = parseFloat(document.querySelector('#rm-entry-price').value);
  const margin        = parseFloat(document.querySelector('#rm-margin').value);
  const leverage      = parseFloat(document.querySelector('#rm-leverage').value);
  const positionType  = document.querySelector('#rm-position-type')?.value || 'long';
  const takerFee      = parseFloat(document.querySelector('#rm-taker-fee')?.value) || 0.05;
  const liqFee        = parseFloat(document.querySelector('#rm-liq-fee')?.value) || 0.5;

  const result = calcLiquidation({ entryPrice, margin, leverage, positionType, takerFee, liqFee });

  // Store for later use (extra-margin slider & DCA)
  lastLiqResult = result;
  lastLiqInputs = { entryPrice, margin, leverage, positionType, takerFee, liqFee };

  /* ── Render stat-strip ──────────────────────────────────────────── */
  const distanceClass = result.distancePct > 10
    ? 'text-green'
    : result.distancePct >= 5
      ? 'text-amber'
      : 'text-red';

  const summaryEl = document.querySelector('#rm-liq-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class='stat-card'><div class='stat-card__label'>Liquidation Price</div><div class='stat-card__value text-rose'>$${fmt(result.liqPrice)}</div></div>
      <div class='stat-card'><div class='stat-card__label'>Position Size</div><div class='stat-card__value'>$${fmt(result.positionSize)}</div></div>
      <div class='stat-card'><div class='stat-card__label'>Distance to Liq</div><div class='stat-card__value ${distanceClass}'>${result.distancePct.toFixed(2)}%</div></div>
      <div class='stat-card'><div class='stat-card__label'>Margin Ratio</div><div class='stat-card__value'>${result.marginRatio.toFixed(2)}%</div></div>
    `;
  }

  /* ── Set up extra margin slider ─────────────────────────────────── */
  const slider = document.querySelector('#rm-extra-margin');
  if (slider) {
    slider.max   = margin * 5;
    slider.value = 0;
  }

  const sliderDisplay = document.querySelector('#rm-extra-margin-display');
  if (sliderDisplay) sliderDisplay.textContent = '$0';

  const sliderMax = document.querySelector('#rm-slider-max');
  if (sliderMax) sliderMax.textContent = `$${fmt(margin * 5)}`;

  // Clear new-liq summary
  const newLiqSummary = document.querySelector('#rm-new-liq-summary');
  if (newLiqSummary) newLiqSummary.innerHTML = '';

  // Show results
  const resultsEl = document.querySelector('#rm-liq-results');
  if (resultsEl) resultsEl.classList.remove('hidden');

  showToast('Liquidation calculated', 'success');
}

/* ===================================================================
   handleExtraMarginChange()  –  slider interaction
   =================================================================== */
function handleExtraMarginChange() {
  const slider = document.querySelector('#rm-extra-margin');
  if (!slider || !lastLiqInputs) return;

  const extraMargin = parseFloat(slider.value) || 0;

  // Update display
  const display = document.querySelector('#rm-extra-margin-display');
  if (display) display.textContent = `$${fmt(extraMargin)}`;

  const result = calcLiqWithExtraMargin({ ...lastLiqInputs, extraMargin });

  const distanceClass = result.newDistancePct > 10
    ? 'text-green'
    : result.newDistancePct >= 5
      ? 'text-amber'
      : 'text-red';

  const newSummary = document.querySelector('#rm-new-liq-summary');
  if (newSummary) {
    newSummary.innerHTML = `
      <div class='stat-card'><div class='stat-card__label'>New Liq Price</div><div class='stat-card__value text-green'>$${fmt(result.newLiqPrice)}</div></div>
      <div class='stat-card'><div class='stat-card__label'>New Distance</div><div class='stat-card__value ${distanceClass}'>${result.newDistancePct.toFixed(2)}%</div></div>
      <div class='stat-card'><div class='stat-card__label'>Total Margin</div><div class='stat-card__value'>$${fmt(result.totalMargin)}</div></div>
    `;
  }
}

/* ===================================================================
   handleResetLiq()  –  clear everything in Sub-Module A
   =================================================================== */
function handleResetLiq() {
  // Clear inputs
  ['rm-entry-price', 'rm-margin', 'rm-leverage'].forEach(id => {
    const el = document.querySelector(`#${id}`);
    if (el) el.value = '';
  });

  // Reset selects to defaults
  const posType = document.querySelector('#rm-position-type');
  if (posType) posType.selectedIndex = 0;

  const takerFeeEl = document.querySelector('#rm-taker-fee');
  if (takerFeeEl) takerFeeEl.value = takerFeeEl.defaultValue || '0.05';

  const liqFeeEl = document.querySelector('#rm-liq-fee');
  if (liqFeeEl) liqFeeEl.value = liqFeeEl.defaultValue || '0.5';

  // Hide results
  const resultsEl = document.querySelector('#rm-liq-results');
  if (resultsEl) resultsEl.classList.add('hidden');

  // Clear errors
  clearErrors('#view-risk');

  // Reset module state
  lastLiqResult = null;
  lastLiqInputs = null;
}

/* ===================================================================
   handleStrategyChange()  –  Sub-Module B panel toggle
   =================================================================== */
function handleStrategyChange() {
  const strategy = document.querySelector('#rm-dca-strategy')?.value;

  // Hide all DCA panels
  document.querySelectorAll('.dca-panel').forEach(panel => {
    panel.classList.add('hidden');
  });

  // Show the matching panel
  const panelMap = {
    fixed:      '#rm-dca-fixed-panel',
    martingale: '#rm-dca-mart-panel',
    zone:       '#rm-dca-zone-panel'
  };

  const targetPanel = document.querySelector(panelMap[strategy]);
  if (targetPanel) targetPanel.classList.remove('hidden');
}

/* ===================================================================
   handleSimulateDCA()  –  Sub-Module B simulation
   =================================================================== */
function handleSimulateDCA() {
  const strategy = document.querySelector('#rm-dca-strategy')?.value;

  // Must have calculated liquidation first
  if (!lastLiqInputs) {
    showToast('Calculate liquidation first', 'error');
    return;
  }

  // Validate common field
  const { valid: commonValid } = validate([
    { id: 'rm-dca-current-price', name: 'Current Price' }
  ]);
  if (!commonValid) return;

  const currentPrice = parseFloat(document.querySelector('#rm-dca-current-price').value);
  let result;

  /* ── Fixed DCA ──────────────────────────────────────────────────── */
  if (strategy === 'fixed') {
    const { valid } = validate([
      { id: 'rm-dca-drop-pct', name: 'Drop %' },
      { id: 'rm-dca-amount', name: 'Amount' },
      { id: 'rm-dca-levels', name: 'Levels' }
    ]);
    if (!valid) return;

    const dropPct   = parseFloat(document.querySelector('#rm-dca-drop-pct').value);
    const dcaAmount = parseFloat(document.querySelector('#rm-dca-amount').value);
    const levels    = parseInt(document.querySelector('#rm-dca-levels').value, 10);

    result = calcFixedDCA({
      entryPrice:   lastLiqInputs.entryPrice,
      currentPrice,
      margin:       lastLiqInputs.margin,
      leverage:     lastLiqInputs.leverage,
      positionType: lastLiqInputs.positionType,
      dropPct,
      dcaAmount,
      levels,
      feeRate:      lastLiqInputs.takerFee
    });

  /* ── Martingale DCA ─────────────────────────────────────────────── */
  } else if (strategy === 'martingale') {
    const { valid } = validate([
      { id: 'rm-mart-drop-pct', name: 'Drop %' },
      { id: 'rm-mart-base-amount', name: 'Base Amount' },
      { id: 'rm-mart-levels', name: 'Levels' }
    ]);
    if (!valid) return;

    const dropPct    = parseFloat(document.querySelector('#rm-mart-drop-pct').value);
    const baseAmount = parseFloat(document.querySelector('#rm-mart-base-amount').value);
    const levels     = parseInt(document.querySelector('#rm-mart-levels').value, 10);

    result = calcMartingaleDCA({
      entryPrice:   lastLiqInputs.entryPrice,
      currentPrice,
      margin:       lastLiqInputs.margin,
      leverage:     lastLiqInputs.leverage,
      positionType: lastLiqInputs.positionType,
      dropPct,
      baseAmount,
      levels,
      feeRate:      lastLiqInputs.takerFee
    });

  /* ── Zone DCA ───────────────────────────────────────────────────── */
  } else if (strategy === 'zone') {
    const { valid } = validate([
      { id: 'rm-zone-level-1', name: 'Support Level 1' },
      { id: 'rm-zone-budget', name: 'Total Budget' }
    ]);
    if (!valid) return;

    // Collect non-empty support levels
    const supportLevels = [];
    ['rm-zone-level-1', 'rm-zone-level-2', 'rm-zone-level-3'].forEach(id => {
      const el = document.querySelector(`#${id}`);
      if (el && el.value.trim() !== '') {
        supportLevels.push(parseFloat(el.value));
      }
    });

    const totalBudget = parseFloat(document.querySelector('#rm-zone-budget').value);

    result = calcZoneDCA({
      entryPrice:   lastLiqInputs.entryPrice,
      currentPrice,
      margin:       lastLiqInputs.margin,
      leverage:     lastLiqInputs.leverage,
      positionType: lastLiqInputs.positionType,
      supportLevels,
      totalBudget,
      feeRate:      lastLiqInputs.takerFee
    });
  }

  if (!result) return;

  /* ── Render DCA summary stat-strip ──────────────────────────────── */
  const dcaSummary = document.querySelector('#rm-dca-summary');
  if (dcaSummary) {
    dcaSummary.innerHTML = `
      <div class='stat-card'><div class='stat-card__label'>New Avg Entry</div><div class='stat-card__value text-green'>$${fmt(result.summary.newAvgEntry)}</div></div>
      <div class='stat-card'><div class='stat-card__label'>Breakeven Price</div><div class='stat-card__value text-amber'>$${fmt(result.summary.breakeven)}</div></div>
      <div class='stat-card'><div class='stat-card__label'>Total Capital</div><div class='stat-card__value'>$${fmt(result.summary.totalCapital)}</div></div>
      <div class='stat-card'><div class='stat-card__label'>Total Fees</div><div class='stat-card__value text-red'>$${fmt(result.summary.totalFees)}</div></div>
    `;
  }

  /* ── Render DCA table rows ──────────────────────────────────────── */
  const tbody = document.querySelector('#rm-dca-tbody');
  if (tbody) {
    tbody.innerHTML = result.entries.map(lvl => `
      <tr>
        <td>${lvl.level}</td>
        <td>$${fmt(lvl.price)}</td>
        <td>$${fmt(lvl.amount)}</td>
        <td>${lvl.qty.toFixed(6)}</td>
        <td>${lvl.totalQty.toFixed(6)}</td>
        <td>$${fmt(lvl.avgEntry)}</td>
      </tr>
    `).join('');
  }

  /* ── Sub-Module C: Risk Warning ─────────────────────────────────── */
  const riskWarning = document.querySelector('#rm-risk-warning');
  if (riskWarning) {
    if (result.summary.totalCapital > lastLiqInputs.margin * 5) {
      riskWarning.classList.remove('hidden');
    } else {
      riskWarning.classList.add('hidden');
    }
  }

  // Show DCA results
  const dcaResults = document.querySelector('#rm-dca-results');
  if (dcaResults) dcaResults.classList.remove('hidden');

  // Toast with strategy name
  const strategyNames = { fixed: 'Fixed', martingale: 'Martingale', zone: 'Zone' };
  showToast(`${strategyNames[strategy] || strategy} DCA simulated`, 'success');
}
