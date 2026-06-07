// ─────────────────────────────────────────────────────────────
// modal.js — Psychology Loss-Detection Modal
// ─────────────────────────────────────────────────────────────
// A full-screen overlay modal that appears when the app detects
// a loss (actual balance < previous actual balance).  It
// nudges the trader to pause, breathe, and reconsider.
//
// Required HTML structure:
//   <div id="loss-modal" class="modal-overlay">
//     …modal content…
//     <button id="btn-dismiss-modal">I Understand</button>
//   </div>
//
// Visibility is toggled via the `.visible` CSS class.
// ─────────────────────────────────────────────────────────────

/**
 * Initialise modal event listeners.
 *
 * Call once after the DOM is ready.  Sets up three ways to
 * dismiss the modal:
 *   1. Click the dismiss button (#btn-dismiss-modal)
 *   2. Click the overlay backdrop (outside the modal card)
 *   3. Press the Escape key
 */
export function initModal() {
  const overlay = document.getElementById('loss-modal');
  const dismissBtn = document.getElementById('btn-dismiss-modal');

  if (!overlay || !dismissBtn) {
    console.warn('[modal] Required elements #loss-modal or #btn-dismiss-modal not found.');
    return;
  }

  // ── Dismiss button ─────────────────────────────────────
  dismissBtn.addEventListener('click', hideLossModal);

  // ── Backdrop click ─────────────────────────────────────
  // Only fires when the click target is the overlay itself
  // (i.e. the semi-transparent backdrop), not the modal card.
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      hideLossModal();
    }
  });

  // ── Escape key ─────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('visible')) {
      hideLossModal();
    }
  });
}

/**
 * Show the loss-detection modal.
 *
 * Adds the `.visible` class and locks body scroll so the user
 * focuses on the modal content.
 */
export function showLossModal() {
  const overlay = document.getElementById('loss-modal');
  if (!overlay) return;

  overlay.classList.add('visible');

  // Lock background scroll to keep focus on the modal
  document.body.style.overflow = 'hidden';

  // Move focus to the dismiss button for accessibility
  const dismissBtn = document.getElementById('btn-dismiss-modal');
  if (dismissBtn) {
    dismissBtn.focus();
  }
}

/**
 * Hide the loss-detection modal.
 *
 * Removes the `.visible` class and restores body scroll.
 */
export function hideLossModal() {
  const overlay = document.getElementById('loss-modal');
  if (!overlay) return;

  overlay.classList.remove('visible');

  // Restore background scroll
  document.body.style.overflow = '';
}
