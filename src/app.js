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
import { initAdmin, refreshAdmin } from './views/admin.js';
import { state, fetchFromDatabase, hasSavedState } from './core/state.js';
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
    if (tabName === 'admin') refreshAdmin();
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
  initAdmin();

  // --- Restore saved state if available (with DB sync) ---
  if (state.username) {
    fetchFromDatabase(state.username)
      .then(() => {
        if (hasSavedState()) {
          restoreForwardIfSaved();
        }
      })
      .catch((err) => {
        console.warn('[app] Could not sync database state on load:', err);
        // Fallback to local storage state if fetch fails (e.g. offline)
        if (hasSavedState()) {
          restoreForwardIfSaved();
          showToast('Session restored (offline)', 'info', 2500);
        }
      });
  } else {
    if (hasSavedState()) {
      restoreForwardIfSaved();
      showToast('Previous session restored', 'info', 2500);
    }
  }

  console.log('Pro Compounding Tracker initialized.');
}
