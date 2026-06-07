// ─────────────────────────────────────────────────────────────
// validator.js — Form Validation Utilities
// ─────────────────────────────────────────────────────────────
// Provides a declarative way to validate groups of input fields
// and surface inline error messages next to each one.
//
// Convention:
//   • Each input has id="fc-start" (or similar).
//   • A matching error span has id="err-fc-start".
//   • The CSS class `.input-error` highlights the input border.
//   • The CSS class `.field-error` styles the error message.
// ─────────────────────────────────────────────────────────────

/**
 * Validate an array of field definitions against their current
 * DOM values.
 *
 * @param {Array<{id: string, label: string, min?: number}>} fields
 *   Each entry describes one <input>:
 *     • `id`    — the input element's DOM id
 *     • `label` — human-readable name for error messages
 *     • `min`   — optional minimum value (defaults to 0 → "cannot be negative")
 *
 * @returns {{ valid: boolean, errors: Array<{id: string, msg: string}> }}
 *
 * @example
 *   const result = validate([
 *     { id: 'fc-start', label: 'Starting Amount' },
 *     { id: 'fc-rate',  label: 'Rate' },
 *   ]);
 *   if (!result.valid) showToast(result.errors[0].msg, 'error');
 */
export function validate(fields) {
  const errors = [];

  for (const field of fields) {
    const el = document.getElementById(field.id);
    if (!el) {
      // Element doesn't exist in the DOM — skip silently
      continue;
    }

    const raw = el.value.trim();
    const num = Number(raw);
    const minVal = field.min !== undefined ? field.min : 0;
    const fieldName = field.label || field.name || field.id;

    if (raw === '') {
      // ── Required check ────────────────────────────────
      errors.push({ id: field.id, msg: `${fieldName} is required` });
      applyError(el, field.id, `${fieldName} is required`);
    } else if (isNaN(num)) {
      // ── Numeric check ─────────────────────────────────
      errors.push({ id: field.id, msg: `${fieldName} must be a valid number` });
      applyError(el, field.id, `${fieldName} must be a valid number`);
    } else if (num < minVal) {
      // ── Minimum value check ───────────────────────────
      const msg =
        minVal === 0
          ? `${fieldName} cannot be negative`
          : `${fieldName} must be at least ${minVal}`;
      errors.push({ id: field.id, msg });
      applyError(el, field.id, msg);
    } else {
      // ── Valid — make sure any previous error is cleared
      clearSingleError(el, field.id);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Clear **all** field-level errors inside a view section.
 *
 * @param {string} viewSelector - CSS selector for the view
 *   container, e.g. '#view-forward'.
 */
export function clearErrors(viewSelector) {
  const view = document.querySelector(viewSelector);
  if (!view) return;

  // Clear every error message span
  view.querySelectorAll('.field-error').forEach((span) => {
    span.textContent = '';
  });

  // Remove highlight from every input
  view.querySelectorAll('.input-error').forEach((input) => {
    input.classList.remove('input-error');
  });
}

/**
 * Manually set an error on a specific field.
 *
 * @param {string} inputId - The <input> element's DOM id.
 * @param {string} msg     - Error message to display.
 */
export function setError(inputId, msg) {
  const el = document.getElementById(inputId);
  if (el) {
    applyError(el, inputId, msg);
  }
}

// ── Internal helpers ─────────────────────────────────────────

/**
 * Apply visual error state to an input + its companion error span.
 *
 * @param {HTMLElement} inputEl - The input element.
 * @param {string} inputId     - The input's id (used to locate err-<id>).
 * @param {string} msg         - Error text.
 */
function applyError(inputEl, inputId, msg) {
  // Highlight the input
  inputEl.classList.add('input-error');

  // Show the message in the companion span
  const errSpan = document.getElementById(`err-${inputId}`);
  if (errSpan) {
    errSpan.textContent = msg;
  }
}

/**
 * Clear the error state for a single field.
 *
 * @param {HTMLElement} inputEl - The input element.
 * @param {string} inputId     - The input's id.
 */
function clearSingleError(inputEl, inputId) {
  inputEl.classList.remove('input-error');

  const errSpan = document.getElementById(`err-${inputId}`);
  if (errSpan) {
    errSpan.textContent = '';
  }
}
