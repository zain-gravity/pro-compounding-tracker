// ─────────────────────────────────────────────────────────────
// toast.js — Toast Notification System
// ─────────────────────────────────────────────────────────────
// Lightweight, stackable toast notifications.  Each toast slides
// in, displays for `duration` ms, then fades out via the
// `.removing` CSS class before being removed from the DOM.
//
// Requires a container in the HTML:
//   <div id="toast-container"></div>
//
// CSS should handle:
//   .toast          → entry animation (e.g. slide-in-right)
//   .toast.removing → exit animation  (e.g. fade-out / slide-out)
//   .toast--success / .toast--error / .toast--info / .toast--warning
//       → colour accents per type
// ─────────────────────────────────────────────────────────────

/**
 * Icon map — maps each toast type to a single-character icon.
 * These are rendered inside a <span class="toast-icon">.
 */
const ICONS = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
  warning: '⚠',
};

/**
 * Show a toast notification.
 *
 * @param {string} message
 *   Text to display inside the toast.
 *
 * @param {'success'|'error'|'info'|'warning'} [type='info']
 *   Visual style / severity of the toast.
 *
 * @param {number} [duration=3500]
 *   Time in milliseconds before the toast auto-dismisses.
 *   Pass `0` or `Infinity` to keep it on-screen until manually
 *   removed (not recommended for most use-cases).
 *
 * @example
 *   showToast('Plan generated!', 'success');
 *   showToast('Something went wrong.', 'error', 5000);
 */
export function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) {
    // Fallback: if for some reason the container isn't in the DOM,
    // log to console so the message is not silently lost.
    console.warn(`[toast] No #toast-container found. Message: ${message}`);
    return;
  }

  // ── Build the toast element ────────────────────────────
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;

  const icon = ICONS[type] || ICONS.info;

  toast.innerHTML = [
    `<span class="toast-icon">${icon}</span>`,
    `<span class="toast-msg">${escapeHtml(message)}</span>`,
  ].join('');

  // ── Insert into the container ──────────────────────────
  container.appendChild(toast);

  // ── Schedule auto-dismiss ──────────────────────────────
  if (duration && duration !== Infinity) {
    setTimeout(() => dismissToast(toast), duration);
  }
}

// ── Internal helpers ─────────────────────────────────────────

/**
 * Trigger the exit animation and remove the toast element
 * from the DOM once the animation completes.
 *
 * @param {HTMLElement} toast
 */
function dismissToast(toast) {
  // Guard: toast may already have been removed
  if (!toast || !toast.parentNode) return;

  toast.classList.add('removing');

  // Wait for the CSS animation to finish, then remove the node.
  toast.addEventListener('animationend', () => {
    toast.remove();
  });

  // Safety net: if animationend never fires (e.g. no CSS
  // animation defined), remove after a generous timeout.
  setTimeout(() => {
    if (toast.parentNode) toast.remove();
  }, 1000);
}

/**
 * Minimal HTML-escape to prevent XSS when inserting user-
 * supplied text into innerHTML.
 *
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
