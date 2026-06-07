/**
 * app.js — Main Application Orchestrator
 * Entry point that initializes all components, views, and the tab system.
 * Wires up tab-change callbacks so data-dependent views refresh on navigation.
 * Restores saved state from localStorage on startup.
 */

import { initTabs } from './components/tabs.js';
import { initModal } from './components/modal.js';
import { initForward, restoreForwardIfSaved } from './views/forward.js';
import { initGoalSeek } from './views/goalseek.js';
import { initTracking, refreshTracking } from './views/tracking.js';
import { initAnalytics, refreshAnalytics } from './views/analytics.js';
import { initRisk } from './views/risk.js';
import { initConverter, refreshConverter } from './views/converter.js';
import { hasSavedState } from './core/state.js';
import { showToast } from './components/toast.js';

/**
 * Initialize the entire Pro Compounding Tracker application.
 * Should be called once when the DOM is ready.
 */
export function initApp() {
  // --- Initialize the tab navigation system ---
  initTabs((tabName) => {
    if (tabName === 'tracking') refreshTracking();
    if (tabName === 'analytics') refreshAnalytics();
    if (tabName === 'converter') refreshConverter();
  });

  // --- Initialize shared components ---
  initModal();

  // --- Initialize all view controllers ---
  initForward();
  initGoalSeek();
  initTracking();
  initAnalytics();
  initRisk();
  initConverter();

  // --- Restore saved state if available ---
  if (hasSavedState()) {
    restoreForwardIfSaved();
    showToast('Previous session restored', 'info', 2500);
  }

  console.log('Pro Compounding Tracker initialized.');
}
