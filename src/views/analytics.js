/**
 * analytics.js — Analytics View Controller
 * Handles Mode 4: growth chart visualization and CSV export.
 * Uses Chart.js for rendering beautiful gradient line charts.
 */

import Chart from 'chart.js/auto';
import { state, subscribe } from '../core/state.js';
import { fmt } from '../core/formatter.js';
import { showToast } from '../components/toast.js';

/** @type {Chart|null} Singleton chart instance — destroyed and recreated on refresh */
let chartInstance = null;

/**
 * Initialize the Analytics view.
 * Binds the CSV export button and subscribes to state changes.
 */
export function initAnalytics() {
  // --- Export CSV button ---
  const btnExport = document.getElementById('btn-export-csv');
  if (btnExport) {
    btnExport.addEventListener('click', handleExportCSV);
  }

  // --- Subscribe to state changes to auto-refresh chart ---
  subscribe(() => {
    refreshAnalytics();
  });
}

/**
 * Refresh the analytics view.
 * Shows the empty state when no plan exists, or renders the chart when data is available.
 */
export function refreshAnalytics() {
  const emptyEl = document.getElementById('analytics-empty');
  const contentEl = document.getElementById('analytics-content');

  if (!state.plan) {
    if (emptyEl) emptyEl.classList.remove('hidden');
    if (contentEl) contentEl.classList.add('hidden');
    return;
  }

  if (emptyEl) emptyEl.classList.add('hidden');
  if (contentEl) contentEl.classList.remove('hidden');

  renderChart();
}

/**
 * Render the growth chart using Chart.js.
 * Shows projected growth as a filled line, and overlays actual growth data
 * when tracking entries exist.
 */
function renderChart() {
  if (!state.plan) return;

  const canvas = document.getElementById('growth-chart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // --- Prepare data ---
  const labels = state.plan.rows.map((r) => `Trade ${r.trade}`);
  const projected = state.plan.rows.map((r) => r.closing);

  // Build actual data array — null for trades without entries so the line has gaps
  const actual = state.plan.rows.map((r) => {
    return state.actualBalances[r.trade] !== undefined
      ? state.actualBalances[r.trade]
      : null;
  });
  const hasActual = actual.some((v) => v !== null);

  // --- Destroy existing chart before re-creating ---
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  // --- Create gradient fills ---
  const gradientProjected = ctx.createLinearGradient(0, 0, 0, 400);
  gradientProjected.addColorStop(0, 'rgba(99, 102, 241, 0.2)');
  gradientProjected.addColorStop(1, 'rgba(99, 102, 241, 0.01)');

  const gradientActual = ctx.createLinearGradient(0, 0, 0, 400);
  gradientActual.addColorStop(0, 'rgba(52, 211, 153, 0.2)');
  gradientActual.addColorStop(1, 'rgba(52, 211, 153, 0.01)');

  // --- Build datasets ---
  const datasets = [
    {
      label: 'Projected Growth',
      data: projected,
      borderColor: '#818cf8',
      backgroundColor: gradientProjected,
      borderWidth: 2.5,
      fill: true,
      tension: 0.35,
      pointRadius: projected.length > 50 ? 0 : 3,
      pointHoverRadius: 6,
      pointBackgroundColor: '#818cf8',
    },
  ];

  if (hasActual) {
    datasets.push({
      label: 'Actual Growth',
      data: actual,
      borderColor: '#34d399',
      backgroundColor: gradientActual,
      borderWidth: 2.5,
      fill: true,
      tension: 0.35,
      pointRadius: 4,
      pointHoverRadius: 7,
      pointBackgroundColor: '#34d399',
      spanGaps: true,
    });
  }

  // --- Create chart ---
  chartInstance = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          labels: {
            color: '#8899b4',
            font: { family: 'Inter', size: 12 },
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 20,
          },
        },
        tooltip: {
          backgroundColor: 'rgba(11, 17, 32, 0.95)',
          titleColor: '#edf2f7',
          bodyColor: '#8899b4',
          borderColor: 'rgba(99, 102, 241, 0.2)',
          borderWidth: 1,
          padding: 14,
          cornerRadius: 10,
          titleFont: { family: 'Inter', weight: '600', size: 13 },
          bodyFont: { family: 'Inter', size: 12 },
          callbacks: {
            label: (context) => `${context.dataset.label}: ₹${fmt(context.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: '#546580',
            font: { family: 'Inter', size: 11 },
            maxRotation: 45,
            autoSkip: true,
            maxTicksLimit: 20,
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.025)',
          },
        },
        y: {
          ticks: {
            color: '#546580',
            font: { family: 'Inter', size: 11 },
            callback: (value) => '₹' + fmt(value),
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.035)',
          },
        },
      },
    },
  });
}

/**
 * Handle CSV export.
 * Builds a CSV string from the plan rows (with optional actual balances column),
 * creates a downloadable Blob, and triggers the browser download.
 */
function handleExportCSV() {
  if (!state.plan) {
    showToast('No plan data to export. Calculate a plan first.', 'error');
    return;
  }

  const rows = state.plan.rows;
  const hasActual = Object.keys(state.actualBalances).length > 0;

  // --- Build CSV header ---
  let headers = ['Trade', 'Opening', 'Profit', 'Fees', 'Deposit/WD', 'Closing (Projected)'];
  if (hasActual) {
    headers.push('Actual Balance');
  }

  // --- Build CSV rows ---
  const csvLines = [headers.join(',')];

  rows.forEach((row) => {
    const line = [
      row.trade,
      row.opening.toFixed(2),
      row.profit.toFixed(2),
      (row.fees || 0).toFixed(2),
      (row.recurring || 0).toFixed(2),
      row.closing.toFixed(2),
    ];

    if (hasActual) {
      const actualVal = state.actualBalances[row.trade];
      line.push(actualVal !== undefined ? actualVal.toFixed(2) : '');
    }

    csvLines.push(line.join(','));
  });

  const csvString = csvLines.join('\n');

  // --- Create downloadable blob ---
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  // --- Generate date-stamped filename ---
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const timeStamp = now.toTimeString().slice(0, 5).replace(':', ''); // HHMM
  const filename = `compounding-plan-${dateStamp}-${timeStamp}.csv`;

  // --- Trigger download via hidden anchor ---
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();

  // Cleanup
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);

  showToast('CSV downloaded successfully!', 'success');
}
