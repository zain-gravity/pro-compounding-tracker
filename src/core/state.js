// ─────────────────────────────────────────────────────────────
// state.js — Central State Management (Pub/Sub + Persistence)
// ─────────────────────────────────────────────────────────────
// Holds the single source of truth for the application.
// Any module can subscribe to state changes and will be
// notified whenever `notify()` is called after a mutation.
//
// Persistence: State is automatically saved to localStorage
// on every `notify()` call and restored when the module loads.
// ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'pro-compounding-tracker-state';

/**
 * The shared application state object.
 *
 * @property {Object|null} plan
 *   Holds the computed compounding plan produced by the engine.
 *   Shape: { params: {...}, rows: [...] }
 *
 * @property {Object} actualBalances
 *   A map of trade-number → actual balance entered during live tracking.
 *
 * @property {number|null} prevActualBalance
 *   The most-recently entered actual balance for loss detection.
 */
export const state = {
  plan: null,
  actualBalances: {},
  prevActualBalance: null,
};

// ── Restore state from localStorage on module load ──────────
(function restoreState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        if (parsed.plan) state.plan = parsed.plan;
        if (parsed.actualBalances) state.actualBalances = parsed.actualBalances;
        if (parsed.prevActualBalance !== undefined) {
          state.prevActualBalance = parsed.prevActualBalance;
        }
      }
    }
  } catch (err) {
    console.warn('[state] Could not restore saved state:', err);
  }
})();

// ── Save state to localStorage ──────────────────────────────
function persistState() {
  try {
    const serializable = {
      plan: state.plan,
      actualBalances: state.actualBalances,
      prevActualBalance: state.prevActualBalance,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  } catch (err) {
    // localStorage may be full or disabled — fail silently
    console.warn('[state] Could not persist state:', err);
  }
}

// ── Listener registry ────────────────────────────────────────
const listeners = new Set();

/**
 * Subscribe to state changes.
 *
 * @param {Function} fn - Callback invoked with the full `state`
 *   object whenever `notify()` is called.
 * @returns {Function} unsubscribe - Call this to remove the listener.
 */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Notify every registered listener of a state change
 * and persist state to localStorage.
 */
export function notify() {
  // Save to localStorage first
  persistState();

  listeners.forEach((fn) => {
    try {
      fn(state);
    } catch (err) {
      console.error('[state] Listener threw:', err);
    }
  });
}

/**
 * Reset the entire state back to its initial defaults,
 * clear localStorage, and notify all listeners.
 */
export function resetState() {
  state.plan = null;
  state.actualBalances = {};
  state.prevActualBalance = null;
  notify(); // This also clears the persisted data (saves empty state)
}

/**
 * Check if there is saved state available.
 * @returns {boolean} true if state was restored from localStorage
 */
export function hasSavedState() {
  return state.plan !== null;
}
