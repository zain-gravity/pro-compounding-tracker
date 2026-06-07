// ─────────────────────────────────────────────────────────────
// tabs.js — Tab Navigation with Sliding Indicator
// ─────────────────────────────────────────────────────────────
// Controls the top-level tab bar.  Each `.tab` button has a
// `data-tab` attribute that maps to a `.view` section with a
// matching `data-view` attribute.
//
// The indicator is a small coloured bar (<div id="tab-indicator">)
// that slides beneath the active tab.  CSS should set it to:
//   position: absolute; bottom: 0; height: 3px;
//   background: linear-gradient(…indigo…);
//   border-radius: 2px;
//   transition: left 0.35s ease-out, width 0.35s ease-out;
// ─────────────────────────────────────────────────────────────

/** @type {Function|null} External callback fired on tab change */
let onChangeCallback = null;

/**
 * Initialise tab navigation.
 *
 * Call once after the DOM is ready.  Attaches click listeners
 * to every `.tab` button and a resize listener so the indicator
 * tracks correctly when the viewport changes.
 *
 * @param {Function} onChange - Called with the tab name string
 *   (the value of `data-tab`) whenever the active tab changes.
 */
export function initTabs(onChange) {
  onChangeCallback = onChange;

  const tabs = document.querySelectorAll('.tab');
  const views = document.querySelectorAll('.view');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;

      // ── De-activate all tabs ─────────────────────────
      tabs.forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });

      // ── De-activate all views ────────────────────────
      views.forEach((v) => v.classList.remove('active'));

      // ── Activate the clicked tab ─────────────────────
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      // ── Activate the matching view ───────────────────
      const targetView = document.getElementById(`view-${tabName}`);
      if (targetView) {
        targetView.classList.add('active');
      }

      // ── Slide the indicator ──────────────────────────
      positionIndicator();

      // ── Notify the app ───────────────────────────────
      if (typeof onChangeCallback === 'function') {
        onChangeCallback(tabName);
      }
    });
  });

  // Reposition the indicator on window resize so it stays
  // aligned even when the layout reflows.
  window.addEventListener('resize', positionIndicator);

  // Set initial indicator position for whichever tab is
  // already marked `.active` in the HTML.
  positionIndicator();
}

/**
 * Programmatically switch to a tab.
 *
 * Finds the `.tab` button whose `data-tab` matches `tabName`
 * and fires a synthetic click on it, which triggers the same
 * flow as a user click.
 *
 * @param {string} tabName - The `data-tab` value to activate,
 *   e.g. "forward", "goal", "tracker".
 */
export function switchToTab(tabName) {
  const tab = document.querySelector(`.tab[data-tab="${tabName}"]`);
  if (tab) {
    tab.click();
  }
}

// ── Internal: position the sliding indicator ─────────────────

/**
 * Move and resize the indicator bar so it sits exactly beneath
 * the currently active tab button.
 *
 * Uses `getBoundingClientRect()` relative to the `.tab-bar-track`
 * container so positioning works regardless of scroll offset.
 */
function positionIndicator() {
  const activeTab = document.querySelector('.tab.active');
  const indicator = document.getElementById('tab-indicator');
  if (!activeTab || !indicator) return;

  const track = document.querySelector('.tab-bar-track');
  if (!track) return;

  const trackRect = track.getBoundingClientRect();
  const tabRect = activeTab.getBoundingClientRect();

  indicator.style.width = tabRect.width + 'px';
  indicator.style.left = (tabRect.left - trackRect.left) + 'px';
}
