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
 */
export const state = {
  plan: null,
  actualBalances: {},
  prevActualBalance: null,
  username: null,
  isAdmin: false,
  adminPasscode: null,
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
        if (parsed.username) state.username = parsed.username;
        if (parsed.isAdmin !== undefined) state.isAdmin = parsed.isAdmin;
        if (parsed.adminPasscode) state.adminPasscode = parsed.adminPasscode;
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
      username: state.username,
      isAdmin: state.isAdmin,
      adminPasscode: state.adminPasscode,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  } catch (err) {
    console.warn('[state] Could not persist state:', err);
  }
}

/**
 * Save current state to MongoDB database.
 */
export async function saveToDatabase() {
  if (!state.username) return;
  
  try {
    const response = await fetch('/api/state', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: state.username,
        plan: state.plan,
        actualBalances: state.actualBalances,
        prevActualBalance: state.prevActualBalance,
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to save data');
    }
  } catch (err) {
    console.error('[state] Error saving to MongoDB:', err);
  }
}

/**
 * Fetch state from MongoDB database and load it.
 */
export async function fetchFromDatabase(username) {
  if (!username) return;
  
  try {
    const response = await fetch(`/api/state?username=${encodeURIComponent(username)}`);
    if (!response.ok) {
      throw new Error('Failed to fetch user data');
    }
    
    const data = await response.json();
    
    // Update state
    state.plan = data.plan;
    state.actualBalances = data.actualBalances || {};
    state.prevActualBalance = data.prevActualBalance !== undefined ? data.prevActualBalance : null;
    
    // Notify listeners so UI updates with loaded database content
    notify();
    return data;
  } catch (err) {
    console.error('[state] Error fetching from MongoDB:', err);
    throw err;
  }
}

// ── Listener registry ────────────────────────────────────────
const listeners = new Set();

/**
 * Subscribe to state changes.
 */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Notify every registered listener of a state change,
 * persist to localStorage, and trigger database sync.
 */
export function notify() {
  // Save to localStorage first
  persistState();

  // Trigger background MongoDB save
  if (state.username) {
    saveToDatabase();
  }

  listeners.forEach((fn) => {
    try {
      fn(state);
    } catch (err) {
      console.error('[state] Listener threw:', err);
    }
  });
}

/**
 * Set user information and fetch their state.
 */
export async function setUserInfo(username, isAdmin = false, adminPasscode = null) {
  state.username = username;
  state.isAdmin = isAdmin;
  state.adminPasscode = adminPasscode;
  persistState();
  
  if (username) {
    await fetchFromDatabase(username);
  }
  notify();
}

/**
 * Log out and clear state.
 */
export function logout() {
  state.username = null;
  state.isAdmin = false;
  state.adminPasscode = null;
  state.plan = null;
  state.actualBalances = {};
  state.prevActualBalance = null;
  
  persistState();
  notify();
}

/**
 * Reset the entire state back to its initial defaults,
 * clear localStorage, and notify all listeners.
 */
export function resetState() {
  state.plan = null;
  state.actualBalances = {};
  state.prevActualBalance = null;
  notify();
}

/**
 * Check if there is saved state available.
 */
export function hasSavedState() {
  return state.plan !== null;
}
