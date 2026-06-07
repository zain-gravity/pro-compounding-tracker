/* ===================================================================
 *  ENTRY POINT — Pro Compounding Tracker
 *  Imports all stylesheets and boots the application.
 * =================================================================== */

// --- Styles (order matters: base → layout → components → ... → responsive last) ---
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/forms.css';
import './styles/tables.css';
import './styles/modal.css';
import './styles/animations.css';
import './styles/responsive.css';

// --- App bootstrap ---
import { initApp } from './app.js';

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
