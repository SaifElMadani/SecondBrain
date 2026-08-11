// ─── NAVIGATION ──────────────────────────────────────────────
const VIEWS = {
  dashboard: { title: 'Dashboard', sub: '' },
  inbox: { title: 'Inbox', sub: 'Process your quick captures' },
  tasks: { title: 'Tasks', sub: 'Focus on what matters' },
  sprint: { title: '3-Month Sprint', sub: 'Your quarterly focus system' },
  notes: { title: 'Notes', sub: 'Your knowledge base' },
  documents: { title: 'Documents', sub: 'Files stored in the cloud' },
  calendar: { title: 'Calendar', sub: 'Time blocking & events' },
  goals: { title: 'Tasks / Goals / Habits', sub: 'Stay on track' },
  journal: { title: 'Journal', sub: 'Daily reflection' },
  family: { title: 'Family Mode', sub: 'Sacred time & baby milestones' },
  category: { title: 'Category', sub: '' },

  timeaudit: { title: 'Time Audit', sub: 'Build real intuition about time' },
  wins: { title: 'Wins Log', sub: 'Every completion matters' },
  hobbies: { title: 'Hobbies', sub: 'Track your passions & progress' },
  finance: { title: 'Finance', sub: 'Manage your household budget' }
};

window.currentView = 'dashboard';
window.expandedCategories = new Set();

function goTo(viewId) {
  if (!VIEWS[viewId]) return;
  currentView = viewId;
  // Clear category selection when navigating to a regular view
  if (viewId !== 'category') activeCategoryId = null;

  // Views
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${viewId}`));

  // Sidebar
  document.querySelectorAll('.nav-btn[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === viewId));

  // Bottom nav
  updateBottomNav();

  // Topbar
  const { title, sub } = VIEWS[viewId];
  document.getElementById('topbar-title').textContent = title;
  document.getElementById('topbar-sub').textContent = sub;

  // Topbar actions
  const acts = document.getElementById('topbar-actions');
  acts.innerHTML = '';

  // Auto-expand Suivi if navigating to one of its children
  if (['goals', 'sprint', 'wins', 'timeaudit'].includes(viewId) && !suiviExpanded) {
    toggleSuiviExpand();
  }

  // Close mobile sidebar
  document.getElementById('app').classList.remove('sidebar-open');

  // Render the view
  renderView(viewId);
}

function renderView(id) {
  switch (id) {
    case 'dashboard': renderDashboard(); break;
    case 'inbox': renderInbox(); break;
    case 'tasks': renderTasks(); break;
    case 'sprint': renderSprint(); break;
    case 'notes': renderNotesList(); break;
    case 'documents': renderDocuments(); break;
    case 'calendar': renderCalendar(); break;
    case 'goals': renderSuiviTabBar(); renderSuiviActiveTab(); break;
    case 'journal': renderJournal(); break;
    case 'family': renderFamily(); break;
    case 'category': renderCategoryContent(); break;
    case 'timeaudit': renderTimeAudit(); break;
    case 'wins': renderWins(); break;
    case 'hobbies': renderHobbies(); break;
    case 'finance': renderFinance(); break;
  }
}

// ─── MOBILE SIDEBAR ──────────────────────────────────────────
document.getElementById('menu-toggle').addEventListener('click', () => {
  document.getElementById('app').classList.add('sidebar-open');
});
document.getElementById('sidebar-overlay').addEventListener('click', () => {
  document.getElementById('app').classList.remove('sidebar-open');
});

// Sidebar nav buttons
document.querySelectorAll('.nav-btn[data-view]').forEach(b => {
  b.addEventListener('click', () => goTo(b.dataset.view));
});

// ═══════════════════════════════════════════════════════════════
// CUSTOMIZABLE BOTTOM NAV (mobile)
// The bottom bar is rendered dynamically from state.settings.bottomNav
// (an ordered list of entry keys chosen in Settings). Four entries map
// to dynamic sidebar category roots (resolved by name at render time);
// the rest map to plain views.
// ═══════════════════════════════════════════════════════════════
const BOTTOM_NAV_ENTRIES = {
  dashboard: { label: 'Home', icon: '🏠', view: 'dashboard' },
  journal: { label: 'Journal', icon: '✍️', view: 'journal' },
  calendar: { label: 'Calendar', icon: '📅', view: 'calendar' },
  documents: { label: 'Documents', icon: '📁', view: 'documents' },
  suivi: { label: 'Suivi', icon: '📊', view: 'goals' },
  family: { label: 'Family', icon: '👨‍👩‍👧', catName: 'Family' },
  growth: { label: 'Growth', icon: '🌱', catName: 'Growth' },
  career: { label: 'Career', icon: '💼', catName: 'Career' },
  finance: { label: 'Finance', icon: '💰', catName: 'Finance' }
};
const BOTTOM_NAV_DEFAULT = ['dashboard', 'journal', 'calendar', 'documents', 'suivi', 'family', 'growth', 'career', 'finance'];

function getBottomNavPrefs() {
  const stored = state.settings.bottomNav;
  if (Array.isArray(stored)) return stored.filter(k => BOTTOM_NAV_ENTRIES[k]);
  return [...BOTTOM_NAV_DEFAULT];
}

function resolveRootByName(name) {
  const c = state.categories.find(x => x.parentId === null && (x.name || '').toLowerCase() === String(name).toLowerCase());
  return c ? c.id : null;
}

// Which bottom-nav entry (if any) matches the current location.
function bnActiveKey() {
  if (currentView === 'category' && activeCategoryId) {
    const cat = state.categories.find(c => c.id === activeCategoryId);
    if (cat) {
      const n = (cat.name || '').toLowerCase();
      if (n === 'family') return 'family';
      if (n === 'growth') return 'growth';
      if (n === 'career') return 'career';
      if (n === 'finance') return 'finance';
    }
    return null;
  }
  switch (currentView) {
    case 'dashboard': return 'dashboard';
    case 'journal': return 'journal';
    case 'calendar': return 'calendar';
    case 'documents': return 'documents';
    case 'goals': return 'suivi';
    case 'family': return 'family';
    case 'finance': return 'finance';
    default: return null;
  }
}

function bottomNavButtonHtml(key) {
  const e = BOTTOM_NAV_ENTRIES[key];
  if (!e) return '';
  let action = null;
  if (e.view) action = `goTo('${e.view}')`;
  else if (e.catName) {
    const catId = resolveRootByName(e.catName);
    if (catId) action = `goToCategory('${catId}')`;
  }
  if (!action) return '';
  const active = bnActiveKey() === key;
  return `<button class="bottom-nav-btn${active ? ' active' : ''}" data-bn-key="${key}" onclick="${action}">
    <span class="bn-icon">${e.icon}</span><span>${e.label}</span>
  </button>`;
}

function renderBottomNav() {
  const inner = document.querySelector('.bottom-nav-inner');
  if (!inner) return;
  inner.innerHTML = '<div class="bn-pill" id="bn-pill"></div>' +
    getBottomNavPrefs().map(bottomNavButtonHtml).join('');
  updateBottomNav();
}

// Syncs .active state + sliding pill position with the current location.
function updateBottomNav() {
  const inner = document.querySelector('.bottom-nav-inner');
  if (!inner) return;
  const btns = inner.querySelectorAll('.bottom-nav-btn');
  const pill = document.getElementById('bn-pill');
  const activeKey = bnActiveKey();
  let ai = -1;
  btns.forEach((b, i) => {
    const on = b.dataset.bnKey === activeKey;
    b.classList.toggle('active', on);
    if (on) ai = i;
  });
  if (pill) {
    const navW = inner.offsetWidth || 1;
    const btnW = navW / Math.max(1, btns.length);
    pill.style.left = ai >= 0 ? (btnW * ai + (btnW - 48) / 2) + 'px' : '-60px';
  }
}

export { VIEWS, goTo, renderView, BOTTOM_NAV_ENTRIES, BOTTOM_NAV_DEFAULT, getBottomNavPrefs, renderBottomNav, updateBottomNav };

Object.assign(window, { goTo, renderView, BOTTOM_NAV_ENTRIES, BOTTOM_NAV_DEFAULT, getBottomNavPrefs, renderBottomNav, updateBottomNav });
