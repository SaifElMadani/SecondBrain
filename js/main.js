// ─── SECOND BRAIN — MODULE ENTRY ─────────────────────────────
// Imports every extracted domain module and triggers boot.
// All boot logic is triggered from auth.onAuthStateChanged (auth.js).

import './firebase-init.js';
import './utils.js';
import './state.js';
import './helpers.js';
import './data.js';
import './router.js';
import './modal.js';
import './auth.js';
import './ritual.js';
import './dashboard.js';
import './inbox.js';
import './tasks.js';
import './pomodoro.js';
import './sprint.js';
import './notes.js';
import './documents.js';
import './calendar.js';
import './goals.js';
import './habits.js';
import './suivi.js';
import './journal.js';
import './family.js';
import './recipes.js';
import './timeaudit.js';
import './wins.js';
import './nudge.js';
import './water.js';
import './hobbies.js';
import './categories.js';
import './ideas.js';
import './finance.js';

console.log('Second Brain v2.0 — Ready');

// PWA: installability + offline caching (requires a secure context).
// Cross-origin requests (Firebase, Google CDN, …) are never intercepted.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW registration failed', e));
  });
}
