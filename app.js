/* ═══════════════════════════════════════════════════════════════
   SECOND BRAIN — COMPLETE APPLICATION LOGIC
   Firebase · Auth · 14 Modules · Time Awareness · Focus UX
   Progress model: auto (derived from tasks/habits) or manual
═══════════════════════════════════════════════════════════════ */

'use strict';

// ─── FIREBASE CONFIG ─────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAJxEsYONHpHlcQ-p9oeCeYE5svaIQBLDI",
  authDomain: "website-todo-ae952.firebaseapp.com",
  projectId: "website-todo-ae952",
  storageBucket: "website-todo-ae952.firebasestorage.app",
  messagingSenderId: "865375487797",
  appId: "1:865375487797:web:fea94104f6e121a425ae7c"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Enable offline persistence
db.enablePersistence({ synchronizeTabs: true }).catch(() => { });

// ─── STATE ───────────────────────────────────────────────────
let currentUser = null;
let userProfile = {};
let state = {
  tasks: [],
  notes: [],
  journal: {},   // keyed by date string
  habits: [],
  goals: [],
  captures: [],
  documents: [],
  sprints: [],
  timeEntries: [],
  familyBlocks: [],
  wins: [],
  babyMilestones: [],
  recipes: [],
  mealPlan: [],
  hobbies: [],
  categories: [],
  events: [],
  financeMonths: [],
  wishlist: [],
  dateIdeas: [],
  checklistItems: [],
  googleCalendarEvents: [],
  outlookCalendarEvents: [],
  settings: {
    name: '',
    babyDueDate: null,
    areas: ['family', 'career', 'growth', 'finance'],
    finance: {
      partners: { a: { name: '' }, b: { name: '' } },
      accounts: [],
      discretionarySplit: {
        enabled: { a: false, b: false },
        buckets: []
      },
      wishlistLists: []
    }
  }
};

// ─── UTILITIES ────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
function dk(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function formatMin(m) {
  const h = Math.floor(m / 60), min = m % 60;
  return h > 0 ? `${h}h ${min}m` : `${min}m`;
}
function formatSec(s) {
  const m = Math.floor(s / 60), sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
function relativeDay(dateStr) {
  const today = dk(); const tomorrow = dk(new Date(Date.now() + 86400000));
  if (dateStr === today) return 'Today';
  if (dateStr === tomorrow) return 'Tomorrow';
  if (dateStr < today) return `Overdue (${dateStr})`;
  return dateStr;
}

// ─── GOAL / CATEGORY HELPERS ──────────────────────────────────
function getGoalById(id) { return state.goals.find(g => g.id === id); }

function getTaskCategoryId(task) {
  if (task.goalId) {
    const goal = getGoalById(task.goalId);
    if (goal && goal.categoryId) return goal.categoryId;
  }
  return task.categoryId || null;
}

function getHabitCategoryId(habit) {
  if (habit.goalId) {
    const goal = getGoalById(habit.goalId);
    if (goal && goal.categoryId) return goal.categoryId;
  }
  return habit.categoryId || null;
}

function getLifeArea(categoryId) {
  if (!categoryId) return null;
  const root = getCategoryRoot(categoryId);
  return root ? root.name.toLowerCase() : null;
}

function getGoalLifeArea(goal) {
  if (goal.area) return goal.area.toLowerCase();
  return getLifeArea(goal.categoryId);
}

function getCategoryPathString(categoryId) {
  if (!categoryId) return '';
  return getCategoryPath(categoryId).join(' > ');
}

function buildGoalOptions(categoryId = null) {
  const opts = [['', '— Select a goal —']];
  let goals = [];
  if (categoryId) {
    const catIds = new Set([categoryId]);
    function collectDescendants(parentId) {
      for (const child of getCategoryChildren(parentId)) {
        catIds.add(child.id);
        collectDescendants(child.id);
      }
    }
    collectDescendants(categoryId);
    goals = state.goals.filter(g => g.categoryId && catIds.has(g.categoryId));
  } else {
    goals = [...state.goals];
  }
  goals.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  for (const g of goals) {
    const catLabel = g.categoryId ? getCategoryPathString(g.categoryId) : '';
    opts.push([g.id, (catLabel ? catLabel + ' → ' : '') + g.title]);
  }
  return opts;
}

// ─── TOAST ───────────────────────────────────────────────────
function toast(msg, type = 'info', durationMs = 3000) {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span> ${esc(msg)}`;
  c.appendChild(t);
  setTimeout(() => { t.style.animation = 'toastOut .3s forwards'; setTimeout(() => t.remove(), 300); }, durationMs);
}

// ─── FIRESTORE HELPERS ────────────────────────────────────────
function userRef() {
  if (!currentUser) throw new Error('No authenticated user');
  return db.collection('users').doc(currentUser.uid);
}
function col(name) { return userRef().collection(name); }

async function saveDoc(collection, id, data) {
  try { await col(collection).doc(id).set(data, { merge: true }); }
  catch (e) { console.error('saveDoc error', e); toast('Save failed', 'error'); }
}
async function deleteDoc(collection, id) {
  try { await col(collection).doc(id).delete(); }
  catch (e) { console.error('deleteDoc error', e); toast('Delete failed', 'error'); }
}
async function saveProfile(data) {
  try { await userRef().collection('profile').doc('main').set(data, { merge: true }); }
  catch (e) { console.error('saveProfile error', e); toast('Profile save failed', 'error'); }
}

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

let currentView = 'dashboard';
let expandedCategories = new Set();
let activeCategoryId = null;

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
  document.querySelectorAll('.bottom-nav-btn[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === viewId));

  // Animate bottom nav pill indicator
  const bnBtns = document.querySelectorAll('.bottom-nav-btn[data-view]');
  const bnPill = document.getElementById('bn-pill');
  if (bnPill) {
    bnBtns.forEach((b, i) => {
      if (b.dataset.view === viewId) {
        const navW = b.parentElement.offsetWidth;
        const btnW = navW / bnBtns.length;
        bnPill.style.left = (btnW * i + (btnW - 48) / 2) + 'px';
      }
    });
  }

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

// Nav buttons
document.querySelectorAll('.nav-btn[data-view]').forEach(b => {
  b.addEventListener('click', () => goTo(b.dataset.view));
});
document.querySelectorAll('.bottom-nav-btn[data-view]').forEach(b => {
  b.addEventListener('click', () => goTo(b.dataset.view));
});

// ─── LOGOUT ──────────────────────────────────────────────────
document.getElementById('logout-btn').addEventListener('click', () => {
  auth.signOut();
});

// ═══════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════
let isSignUp = false;
const authForm = document.getElementById('auth-form');
const authError = document.getElementById('auth-error');
const authSpinner = document.getElementById('auth-spinner');
const authBtnLabel = document.getElementById('auth-btn-label');
const authTitle = document.getElementById('auth-title');
const authSub = document.getElementById('auth-sub');
const authToggleBtn = document.getElementById('auth-toggle-btn');
const authToggleText = document.getElementById('auth-toggle-text');

authToggleBtn.addEventListener('click', () => {
  isSignUp = !isSignUp;
  authTitle.textContent = isSignUp ? 'Create your account' : 'Welcome back';
  authSub.textContent = isSignUp ? 'Your second brain awaits' : 'Sign in to your personal OS';
  authBtnLabel.textContent = isSignUp ? 'Create Account' : 'Sign In';
  authToggleText.textContent = isSignUp ? 'Already have an account?' : "Don't have an account?";
  authToggleBtn.textContent = isSignUp ? ' Sign in' : ' Sign up';
  authError.classList.remove('show');
});

function showAuthSpinner(show) {
  authSpinner.classList.toggle('show', show);
  document.getElementById('auth-submit-btn').disabled = show;
}

authForm.addEventListener('submit', e => {
  e.preventDefault();
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  authError.classList.remove('show');
  showAuthSpinner(true);
  const op = isSignUp
    ? auth.createUserWithEmailAndPassword(email, password)
    : auth.signInWithEmailAndPassword(email, password);
  op.catch(err => {
    showAuthSpinner(false);
    authError.textContent = friendlyAuthError(err.code);
    authError.classList.add('show');
  });
});

// Google OAuth
document.getElementById('btn-google-signin').addEventListener('click', () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(err => {
    authError.textContent = friendlyAuthError(err.code);
    authError.classList.add('show');
  });
});

// Microsoft OAuth
document.getElementById('btn-microsoft-signin').addEventListener('click', () => {
  const provider = new firebase.auth.OAuthProvider('microsoft.com');
  provider.setCustomParameters({ prompt: 'select_account' });
  auth.signInWithPopup(provider).catch(err => {
    authError.textContent = friendlyAuthError(err.code);
    authError.classList.add('show');
  });
});

function friendlyAuthError(code) {
  const map = {
    'auth/invalid-email': 'Invalid email address.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/invalid-credential': 'Invalid credentials. Check your details.',
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/popup-closed-by-user': 'Sign-in popup was closed.',
    'auth/popup-blocked': 'Popup was blocked. Please allow popups and try again.',
    'auth/account-exists-with-different-credential': 'An account already exists with a different sign-in method.'
  };
  return map[code] || `Sign-in error: ${code}`;
}

// ═══════════════════════════════════════════════════════════════
// AUTH STATE CHANGE → BOOT APP
// ═══════════════════════════════════════════════════════════════
auth.onAuthStateChanged(async user => {
  showAuthSpinner(false);
  if (user) {
    currentUser = user;
    document.getElementById('screen-login').classList.remove('active');
    try { await loadAllData(); } catch (e) { console.error('loadAllData error', e); }
    await seedInitialCategories();
    await seedDateIdeas();
    // Migrate existing "Dates" categories to the correct moduleType
    const datesToMigrate = state.categories.filter(c => c.name === 'Dates' && c.moduleType !== 'dateIdeas');
    for (const dc of datesToMigrate) {
      dc.moduleType = 'dateIdeas';
      await saveDoc('categories', dc.id, { moduleType: 'dateIdeas' });
    }
    if (datesToMigrate.length) renderSidebarCategories();
    // Migrate category tabs: auto-create tabs for generic categories that have content
    try {
      for (const cat of state.categories) {
        if (cat.moduleType !== 'generic' && cat.moduleType !== undefined) continue;
        if ((cat.tabs || []).length > 0) continue;
        const hasTasks = state.tasks.some(t => getTaskCategoryId(t) === cat.id);
        const hasGoals = state.goals.some(g => g.categoryId === cat.id);
        const hasHabits = state.habits.some(h => getHabitCategoryId(h) === cat.id);
        const newTabs = [];
        if (hasTasks) newTabs.push({ id: uid(), type: 'tasks', label: '☑️ Tasks' });
        if (hasGoals) newTabs.push({ id: uid(), type: 'goals', label: '🎯 Goals' });
        if (hasHabits) newTabs.push({ id: uid(), type: 'habits', label: '🔥 Habits' });
        if (newTabs.length) {
          cat.tabs = newTabs;
          await saveDoc('categories', cat.id, { tabs: newTabs });
        }
      }
    } catch (e) { console.error('Tab migration error', e); }
    // Migrate Suivi tabs: create default if not set
    try {
      if (!state.settings.suiviTabs || !state.settings.suiviTabs.length) {
        state.settings.suiviTabs = [
          { id: uid(), type: 'tasks', label: '☑️ Tasks' },
          { id: uid(), type: 'goals', label: '🎯 Goals' },
          { id: uid(), type: 'habits', label: '🔥 Habits' }
        ];
        await saveProfile({ suiviTabs: state.settings.suiviTabs });
      }
    } catch (e) { console.error('Suivi tabs migration error', e); }
    checkOnboarding();
  } else {
    currentUser = null;
    document.getElementById('app').classList.add('hidden');
    document.getElementById('screen-login').classList.add('active');
  }
});

// ═══════════════════════════════════════════════════════════════
// DATA LOADING (real-time listeners)
// ═══════════════════════════════════════════════════════════════
async function loadAllData() {
  // Load profile
  const profileSnap = await userRef().collection('profile').doc('main').get().catch(() => ({ exists: false, data: () => ({}) }));
  if (profileSnap.exists) {
    userProfile = profileSnap.data();
    state.settings = { ...state.settings, ...userProfile };
  }

  // Load collections
  const collections = ['tasks', 'notes', 'habits', 'goals', 'captures', 'documents', 'sprints', 'timeEntries', 'familyBlocks', 'wins', 'babyMilestones', 'recipes', 'mealPlan', 'hobbies', 'categories', 'events', 'financeMonths', 'wishlist', 'dateIdeas', 'checklistItems'];
  for (const c of collections) {
    const snap = await col(c).orderBy('createdAt', 'desc').get().catch(() => ({ docs: [] }));
    state[c] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  // Load journal
  const jSnap = await col('journal').get().catch(() => ({ docs: [] }));
  state.journal = {};
  jSnap.docs.forEach(d => { state.journal[d.id] = { id: d.id, ...d.data() }; });

  updateSidebarUser();
}

function updateSidebarUser() {
  const name = state.settings.name || currentUser.displayName || currentUser.email?.split('@')[0] || 'You';
  const email = currentUser.email || '';
  document.getElementById('sidebar-username').textContent = name;
  document.getElementById('sidebar-useremail').textContent = email;
  document.getElementById('sidebar-avatar').textContent = (name[0] || 'S').toUpperCase();
}

// ═══════════════════════════════════════════════════════════════
// ONBOARDING
// ═══════════════════════════════════════════════════════════════
let obStep = 0;
function checkOnboarding() {
  if (!state.settings.onboardingDone) {
    document.getElementById('screen-onboarding').classList.add('active');
    showObStep(0);
  } else {
    launchApp();
  }
}

function showObStep(n) {
  obStep = n;
  [0, 1, 2].forEach(i => {
    document.getElementById(`ob-step-${i}`).style.display = i === n ? 'block' : 'none';
    document.getElementById(`ob-dot-${i}`).classList.toggle('active', i <= n);
  });
}

document.getElementById('ob-next-0').addEventListener('click', () => {
  const name = document.getElementById('ob-name').value.trim();
  if (!name) { toast('Please enter your name', 'error'); return; }
  state.settings.name = name;
  showObStep(1);
});

document.getElementById('ob-back-1').addEventListener('click', () => showObStep(0));
document.getElementById('ob-next-1').addEventListener('click', () => showObStep(2));
document.getElementById('ob-back-2').addEventListener('click', () => showObStep(1));

document.getElementById('ob-finish').addEventListener('click', async () => {
  const goal = document.getElementById('ob-sprint-goal').value.trim();
  const due = document.getElementById('ob-due-date').value;
  state.settings.onboardingDone = true;
  state.settings.babyDueDate = due || null;
  await saveProfile({ ...state.settings, onboardingDone: true, babyDueDate: due || null });

  // Seed default baby milestones
  const milestones = [
    { text: 'Book hospital tour', done: false },
    { text: 'Set up nursery', done: false },
    { text: 'Prepare hospital bag', done: false },
    { text: 'Attend antenatal classes', done: false },
    { text: 'Install car seat', done: false },
    { text: 'Create birth plan', done: false },
    { text: 'Stock up on newborn supplies', done: false },
    { text: 'Choose a pediatrician', done: false }
  ];
  for (const m of milestones) {
    const id = uid();
    const data = { ...m, id, createdAt: Date.now() };
    state.babyMilestones.push(data);
    await saveDoc('babyMilestones', id, data);
  }

  // Seed first sprint objectives as goals if provided
  if (goal) {
    const now = Date.now();
    const quarter = getQuarterLabel();
    const sprintObjs = [
      { title: 'Prepare for baby\'s arrival', weeklyActions: ['Set up nursery', 'Book hospital visit', 'Prepare hospital bag'] },
      { title: 'Build second brain system', weeklyActions: ['Set up all modules', 'Build daily ritual habit', 'Process inbox daily'] },
      { title: 'Career focus', weeklyActions: ['Identify key projects', 'Block deep work time', 'Weekly review'] }
    ];
    for (const obj of sprintObjs) {
      const id = uid();
      const data = {
        id, title: obj.title, area: '', categoryId: null,
        progress: 0, milestones: [], weeklyActions: obj.weeklyActions,
        isSprintObjective: true, sprintQuarter: quarter,
        deadline: null, createdAt: now
      };
      state.goals.push(data);
      await saveDoc('goals', id, data);
    }
  }

  document.getElementById('screen-onboarding').classList.remove('active');
  updateSidebarUser();
  launchApp();
});

// ═══════════════════════════════════════════════════════════════
// LAUNCH APP (after auth + onboarding)
// ═══════════════════════════════════════════════════════════════
function launchApp() {
  document.getElementById('app').classList.remove('hidden');
  goTo('dashboard');
  renderSidebarCategories();
  migrateOrphanTasksAndHabits();
  checkRitual();
  startDayProgressTicker();
  startHourlyNudge();
  updateInboxBadge();
  restoreCalendarConnections();
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

// ═══════════════════════════════════════════════════════════════
// MORNING / EVENING RITUAL
// ═══════════════════════════════════════════════════════════════
const MORNING_QS = [
  { key: 'morningFocus', text: "What's your ONE priority today?", type: 'text' },
  { key: 'morningMood', text: "How are you feeling right now?", type: 'mood' },
  { key: 'morningObstacle', text: "What could go wrong today, and how will you handle it?", type: 'text' }
];
const EVENING_QS = [
  { key: 'eveningDone', text: "Did you complete your one priority?", type: 'text' },
  { key: 'eveningWell', text: "What went well today?", type: 'text' },
  { key: 'eveningTomorrow', text: "What do you want to do differently tomorrow?", type: 'text' }
];

let ritualType = 'morning', ritualStep = 0, ritualAnswers = {};

function checkRitual() {
  const todayKey = dk();
  const journal = state.journal[todayKey] || {};
  const hour = new Date().getHours();

  // Morning ritual: 5am–12pm, not done yet
  if (hour >= 5 && hour < 12 && !journal.morningDone) {
    openRitual('morning');
  }
  // Evening ritual: 6pm–11pm, not done yet
  else if (hour >= 18 && !journal.eveningDone) {
    openRitual('evening');
  }
}

function openRitual(type) {
  ritualType = type; ritualStep = 0; ritualAnswers = {};
  const badge = document.getElementById('ritual-badge');
  badge.textContent = type === 'morning' ? '☀️ Morning Check-in' : '🌙 Evening Reflection';
  badge.className = `ritual-time-badge ${type}`;
  showRitualStep(0);
  document.getElementById('screen-ritual').classList.add('active');
}

function showRitualStep(step) {
  ritualStep = step;
  const qs = ritualType === 'morning' ? MORNING_QS : EVENING_QS;
  const q = qs[step];
  document.getElementById('ritual-q-num').textContent = `Question ${step + 1} of ${qs.length}`;
  document.getElementById('ritual-q-text').textContent = q.text;
  document.getElementById('ritual-next').textContent = step < qs.length - 1 ? 'Next →' : 'Finish ✓';

  // Progress bars
  for (let i = 0; i < 3; i++) {
    document.getElementById(`rp-${i}`).classList.toggle('done', i <= step);
  }

  // Show correct input
  const moodArea = document.getElementById('ritual-mood-area');
  const textArea = document.getElementById('ritual-text-area');
  moodArea.style.display = 'none';
  textArea.style.display = 'none';
  document.getElementById('ritual-answer').value = '';

  if (q.type === 'mood') {
    moodArea.style.display = 'block';
    document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
  } else {
    textArea.style.display = 'block';
    document.getElementById('ritual-answer').value = ritualAnswers[q.key] || '';
    setTimeout(() => document.getElementById('ritual-answer').focus(), 100);
  }
}

// Mood button selection
document.querySelectorAll('.mood-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });
});

// Energy slider
document.getElementById('ritual-energy').addEventListener('input', e => {
  document.getElementById('energy-val').textContent = e.target.value;
});

document.getElementById('ritual-next').addEventListener('click', async () => {
  const qs = ritualType === 'morning' ? MORNING_QS : EVENING_QS;
  const q = qs[ritualStep];

  if (q.type === 'mood') {
    const selected = document.querySelector('.mood-btn.selected');
    ritualAnswers[q.key] = selected ? selected.dataset.mood : '🙂';
    ritualAnswers['energy'] = document.getElementById('ritual-energy').value;
  } else {
    ritualAnswers[q.key] = document.getElementById('ritual-answer').value.trim();
  }

  if (ritualStep < qs.length - 1) {
    showRitualStep(ritualStep + 1);
  } else {
    // Done — save to journal
    await saveRitual();
    document.getElementById('screen-ritual').classList.remove('active');
    toast('Ritual complete ✓', 'success');
    renderDashboard();
  }
});

document.getElementById('ritual-skip').addEventListener('click', () => {
  document.getElementById('screen-ritual').classList.remove('active');
});

async function saveRitual() {
  const todayKey = dk();
  const existing = state.journal[todayKey] || { id: todayKey, date: todayKey, createdAt: Date.now() };
  const updated = { ...existing, ...ritualAnswers };
  if (ritualType === 'morning') updated.morningDone = true;
  else updated.eveningDone = true;
  updated.updatedAt = Date.now();
  state.journal[todayKey] = updated;
  await saveDoc('journal', todayKey, updated);
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════
function renderDashboard() {
  renderGreeting();
  renderDashHabits();
  renderDashStats();
  renderDashFamilyBlocks();
  renderDashRitualSummary();
  renderDashCaptures();
  renderDashAchievements();
}

function renderGreeting() {
  const now = new Date();
  const hour = now.getHours();
  const name = state.settings.name || 'there';
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  let greeting = 'Good evening';
  if (hour < 12) greeting = 'Good morning';
  else if (hour < 17) greeting = 'Good afternoon';

  const dateStr = `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
  document.getElementById('greeting-date').textContent = dateStr;
  document.getElementById('greeting-text').textContent = `${greeting}, ${name} 👋`;

  // Today's sprint focus
  const sprintGoals = state.goals.filter(g => g.isSprintObjective && g.sprintQuarter === getQuarterLabel());
  const obj = sprintGoals[0];
  const focusEl = document.getElementById('today-focus');
  if (obj) {
    focusEl.textContent = obj.weeklyActions?.[0] || obj.title;
  } else {
    focusEl.textContent = 'Add a sprint objective to see your daily focus here';
  }
}

function renderTimeRing() {
  const now = new Date();
  const start = new Date(now); start.setHours(7, 0, 0, 0);  // 7am
  const end = new Date(now); end.setHours(22, 0, 0, 0);   // 10pm
  let pct = ((now - start) / (end - start)) * 100;
  pct = Math.max(0, Math.min(100, pct));

  const pctEl = document.getElementById('time-ring-pct');
  if (pctEl) pctEl.textContent = `${Math.round(pct)}%`;

  const remaining = Math.max(0, Math.floor((end - now) / 60000));
  const remH = Math.floor(remaining / 60), remM = remaining % 60;
  const labelEl = document.getElementById('time-ring-label');
  if (labelEl) labelEl.textContent =
    remaining > 0 ? `${remH}h ${remM}m of your day left` : 'Day is over — great work!';

  const wrapEl = document.getElementById('time-ring-wrap');
  if (!wrapEl) return;
  const r = 50, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
  const color = pct < 50 ? '#6C63FF' : pct < 75 ? '#FFB347' : '#FF6B6B';
  wrapEl.innerHTML = `
    <svg width="120" height="120" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--surface3)" stroke-width="10"/>
      <circle cx="60" cy="60" r="${r}" fill="none" stroke="${color}" stroke-width="10"
        stroke-linecap="round"
        stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"
        transform="rotate(-90 60 60)"/>
      <text x="60" y="64" text-anchor="middle" font-size="18" font-weight="800" fill="${color}" font-family="Inter">${Math.round(pct)}%</text>
    </svg>
  `;
}

function startDayProgressTicker() {
  setInterval(() => {
    if (currentView === 'dashboard') renderTimeRing();
  }, 60000);
}

function renderDashHabits() {
  const el = document.getElementById('dash-habit-rings');
  const todayKey = dk();
  if (!state.habits.length) {
    el.innerHTML = `<div style="font-size:12px; color:var(--text-muted)">No habits yet. <span style="color:var(--accent-light); cursor:pointer" onclick="goTo('goals')">Add habits →</span></div>`;
    return;
  }
  el.innerHTML = state.habits.map(h => {
    const checkedToday = (h.checkIns || []).includes(todayKey);
    const streak = calcStreak(h.checkIns || []);
    const r = 24, circ = 2 * Math.PI * r;
    const fill = checkedToday ? circ : 0;
    const color = AREA_COLORS[h.area] || 'var(--accent)';
    return `<div class="habit-ring-item" data-id="${h.id}" onclick="toggleHabitToday('${h.id}')">
      <svg width="56" height="56" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r="${r}" fill="none" stroke="var(--surface3)" stroke-width="6"/>
        <circle cx="28" cy="28" r="${r}" fill="none" stroke="${color}" stroke-width="6"
          stroke-linecap="round"
          stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${(circ - fill).toFixed(2)}"
          transform="rotate(-90 28 28)" style="transition: stroke-dashoffset .5s"/>
        <text x="28" y="32" text-anchor="middle" font-size="13" fill="${checkedToday ? color : 'var(--text-muted)'}" font-weight="700" font-family="Inter">${checkedToday ? '✓' : ''}</text>
      </svg>
      <div class="habit-ring-name">${esc(h.name)}</div>
      ${streak > 0 ? `<div style="font-size:10px; color:var(--warning)">🔥${streak}</div>` : ''}
    </div>`;
  }).join('');
}

function renderDashStats() {
  const today = dk();
  const startOfWeek = new Date(); startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const startOfWeekStr = dk(startOfWeek);

  const doneTodayCount = state.tasks.filter(t => t.done && t.completedAt?.startsWith?.(today)).length;
  const doneWeekCount = state.tasks.filter(t => t.done && t.completedAt >= startOfWeekStr).length;
  const maxStreak = state.habits.reduce((max, h) => Math.max(max, calcStreak(h.checkIns || [])), 0);

  document.getElementById('stat-tasks-done').textContent = doneTodayCount;
  document.getElementById('stat-streak').textContent = maxStreak;
  document.getElementById('stat-week-tasks').textContent = doneWeekCount;
}

function renderDashFamilyBlocks() {
  const el = document.getElementById('dash-family-blocks');
  const today = dk();
  const blocks = state.familyBlocks.filter(b => b.date === today || b.recurring);
  if (!blocks.length) {
    el.innerHTML = `<div style="font-size:13px; color:var(--text-muted)">No protected blocks today. <span style="color:var(--family); cursor:pointer" onclick="goTo('family')">Add protected time →</span></div>`;
    return;
  }
  el.innerHTML = blocks.map(b => `
    <div class="family-block-item">
      <div class="family-block-icon">🔒</div>
      <div class="family-block-info">
        <div class="family-block-title">${esc(b.title)}</div>
        <div class="family-block-time">${b.startTime} – ${b.endTime}</div>
      </div>
      <span class="protected-badge">PROTECTED</span>
    </div>`).join('');
}

function renderDashRitualSummary() {
  const el = document.getElementById('dash-ritual-summary');
  const j = state.journal[dk()];
  if (!j?.morningDone) {
    el.innerHTML = `<div style="font-size:13px; color:var(--text-muted)">Complete your <span style="color:var(--accent-light); cursor:pointer" onclick="openRitual('morning')">morning ritual →</span></div>`;
    return;
  }
  el.innerHTML = `
    <div style="font-size:32px">${j.morningMood || '🙂'}</div>
    <div>
      <div style="font-size:14px; font-weight:600; color:var(--text)">${j.morningFocus || '—'}</div>
      <div style="font-size:11px; color:var(--text-muted); margin-top:2px">Energy: ${j.energy || '—'}/10 · Today's focus</div>
    </div>
  `;
}

function renderDashCaptures() {
  const el = document.getElementById('dash-captures');
  const recent = state.captures.slice(0, 3);
  if (!recent.length) {
    el.innerHTML = `<div style="font-size:13px; color:var(--text-muted)">Nothing captured yet. Tap the <strong>⚡</strong> button!</div>`;
    return;
  }
  el.innerHTML = recent.map(c => `
    <div class="capture-item">
      <div class="capture-type-dot ${c.type}"></div>
      <div class="capture-content">${esc(c.content)}</div>
    </div>`).join('');
}

function renderDashAchievements() {
  const el = document.getElementById('dash-achievements-content');
  const today = dk();
  const sevenDaysAgo = dk(new Date(Date.now() - 7 * 86400000));

  const todayEntries = state.timeEntries.filter(e => e.date === today);
  const totalMin = todayEntries.reduce((s, e) => s + (e.actualMin || 0), 0);
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  const timeUsed = totalMin >= 60 ? `${h}h ${m}m` : `${totalMin}m`;

  const doneToday = state.tasks.filter(t => t.done && t.completedAt?.startsWith?.(today)).length;
  const doneWeek = state.tasks.filter(t => t.done && t.completedAt >= sevenDaysAgo).length;

  const activeStreaks = state.habits.map(h => ({ name: h.name, streak: calcStreak(h.checkIns || []) })).filter(s => s.streak > 0).sort((a, b) => b.streak - a.streak);
  const recentWins = state.wins.slice(-3).reverse();

  const allCats = {};
  state.categories.forEach(c => { allCats[c.id] = { name: c.icon ? c.icon + ' ' + c.name : c.name, color: c.color || 'var(--accent)' }; });
  const rootMap = {};
  function toRoot(categoryId) {
    if (!categoryId) return null;
    if (rootMap[categoryId] !== undefined) return rootMap[categoryId];
    const r = getCategoryRoot(categoryId);
    rootMap[categoryId] = r ? r.id : null;
    return rootMap[categoryId];
  }
  function catStyle(id) {
    const c = allCats[id];
    return c ? `color:${c.color}; background:${c.color}18; border-left:3px solid ${c.color}` : '';
  }
  function catLabel(id) { return allCats[id] ? allCats[id].name : 'Uncategorized'; }

  let html = '';

  html += `<div class="achieve-stats">
    <div class="achieve-stat">
      <div class="achieve-num green">${timeUsed}</div>
      <div class="achieve-label">Time logged today</div>
    </div>
    <div class="achieve-stat">
      <div class="achieve-num accent">${doneWeek}</div>
      <div class="achieve-label">Tasks this week</div>
    </div>
    <div class="achieve-stat">
      <div class="achieve-num yellow">${activeStreaks.length ? activeStreaks[0].streak : 0}🔥</div>
      <div class="achieve-label">Best habit streak</div>
    </div>
  </div>`;

  // ── Weekly task chart: completed vs created day by day ──
  const dayLabels = [];
  const dayCompleted = [];
  const dayCreated = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = dk(d);
    const label = i === 0 ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' });
    dayLabels.push(label);
    dayCompleted.push(state.tasks.filter(t => t.done && t.completedAt?.startsWith?.(key)).length);
    dayCreated.push(state.tasks.filter(t => {
      const created = t.createdAt ? dk(new Date(t.createdAt)) : null;
      return created === key;
    }).length);
  }
  const maxVal = Math.max(1, ...dayCompleted, ...dayCreated);
  html += `<div class="achieve-section">
    <div class="achieve-section-title">📊 Weekly tasks</div>
    <div class="achieve-week-chart">`;
  for (let i = 0; i < 7; i++) {
    const ch = Math.round((dayCompleted[i] / maxVal) * 100);
    const cr = Math.round((dayCreated[i] / maxVal) * 100);
    html += `<div class="achieve-week-day">
      <div class="achieve-week-label">${dayLabels[i]}</div>
      <div class="achieve-week-bars">
        <div class="achieve-week-bar-wrap"><div class="achieve-week-bar created" style="height:${cr}%"></div></div>
        <div class="achieve-week-bar-wrap"><div class="achieve-week-bar completed" style="height:${ch}%"></div></div>
      </div>
      <div class="achieve-week-nums">
        <span class="created-num">${dayCreated[i]}</span>
        <span class="completed-num">${dayCompleted[i]}</span>
      </div>
    </div>`;
  }
  html += `</div>
    <div class="achieve-week-legend">
      <span><span class="legend-dot created"></span> Created</span>
      <span><span class="legend-dot completed"></span> Completed</span>
    </div>
  </div>`;

  // ── Journal check: morning / afternoon per day ──
  html += `<div class="achieve-section">
    <div class="achieve-section-title">📓 Journal check (7 days)</div>
    <div class="achieve-journal-week">`;
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = dk(d);
    const entry = state.journal[key] || {};
    const morning = !!entry.morning;
    const afternoon = !!entry.afternoon;
    const label = i === 0 ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' });
    html += `<div class="achieve-journal-day">
      <div class="achieve-journal-day-label">${label}</div>
      <div class="achieve-journal-checks">
        <span class="achieve-journal-check${morning ? ' done' : ''}" title="Morning">☀️</span>
        <span class="achieve-journal-check${afternoon ? ' done' : ''}" title="Afternoon">🌙</span>
      </div>
    </div>`;
  }
  html += `</div></div>`;

  // ── Tasks by category ──
  const taskBuckets = {};
  state.tasks.filter(t => t.done && t.completedAt >= sevenDaysAgo).forEach(t => {
    const r = toRoot(getTaskCategoryId(t));
    const key = r || 'none';
    taskBuckets[key] = (taskBuckets[key] || 0) + 1;
  });
  const taskTotal = doneWeek || 1;
  const taskKeys = Object.keys(taskBuckets).sort((a, b) => taskBuckets[b] - taskBuckets[a]);

  if (taskKeys.length) {
    html += `<div class="achieve-section">
      <div class="achieve-section-title">Tasks by category (this week)</div>
      <div class="achieve-cats">${taskKeys.map(k => {
        const pct = Math.round((taskBuckets[k] / taskTotal) * 100);
        return `<div class="achieve-cat-row" style="${catStyle(k)}">
          <div class="achieve-cat-label">${catLabel(k)}</div>
          <div class="achieve-cat-bar"><div class="achieve-cat-fill" style="width:${pct}%;background:${allCats[k]?.color || 'var(--accent)'}"></div></div>
          <div class="achieve-cat-num">${taskBuckets[k]} <span style="color:var(--text-muted)">(${pct}%)</span></div>
        </div>`;
      }).join('')}</div>
    </div>`;
  }

  const habitBuckets = {};
  state.habits.forEach(h => {
    const streak = calcStreak(h.checkIns || []);
    if (streak <= 0) return;
    const r = toRoot(getHabitCategoryId(h));
    const key = r || 'none';
    if (!habitBuckets[key]) habitBuckets[key] = [];
    habitBuckets[key].push({ name: h.name, streak });
  });
  const habitKeys = Object.keys(habitBuckets).sort((a, b) => {
    const maxA = Math.max(...habitBuckets[a].map(h => h.streak));
    const maxB = Math.max(...habitBuckets[b].map(h => h.streak));
    return maxB - maxA;
  });

  if (habitKeys.length) {
    html += `<div class="achieve-section">
      <div class="achieve-section-title">Habit streaks by category</div>
      <div class="achieve-cats">${habitKeys.map(k => {
        const items = habitBuckets[k].sort((a, b) => b.streak - a.streak);
        return `<div class="achieve-cat-row achieve-cat-row-col" style="${catStyle(k)}">
          <div class="achieve-cat-label">${catLabel(k)}</div>
          <div class="achieve-habit-list">${items.map(h =>
            `<div class="achieve-habit-item"><span>🔥</span> <span>${esc(h.name)}</span> <span class="achieve-streak-num">${h.streak}d</span></div>`
          ).join('')}</div>
        </div>`;
      }).join('')}</div>
    </div>`;
  }

  const goalBuckets = {};
  state.goals.forEach(g => {
    const r = toRoot(g.categoryId);
    const key = r || 'none';
    if (!goalBuckets[key]) goalBuckets[key] = [];
    goalBuckets[key].push({ title: g.title, p: computeGoalProgress(g) });
  });
  const goalKeys = Object.keys(goalBuckets).sort((a, b) => {
    const avgA = goalBuckets[a].reduce((s, g) => s + g.p.progress, 0) / goalBuckets[a].length;
    const avgB = goalBuckets[b].reduce((s, g) => s + g.p.progress, 0) / goalBuckets[b].length;
    return avgB - avgA;
  });

  if (goalKeys.length) {
    html += `<div class="achieve-section">
      <div class="achieve-section-title">Goal progress by category</div>
      <div class="achieve-cats">${goalKeys.map(k => {
        const avg = Math.round(goalBuckets[k].reduce((s, g) => s + g.p.progress, 0) / goalBuckets[k].length);
        return `<div class="achieve-cat-row" style="${catStyle(k)}">
          <div class="achieve-cat-label">${catLabel(k)}</div>
          <div class="achieve-cat-bar"><div class="achieve-cat-fill" style="width:${avg}%;background:${allCats[k]?.color || 'var(--accent)'}"></div></div>
          <div class="achieve-cat-num">${avg}%</div>
        </div>`;
      }).join('')}</div>
    </div>`;
  }

  if (recentWins.length) {
    html += `<div class="achieve-section">
      <div class="achieve-section-title">Recent Wins</div>
      <div class="achieve-wins">${recentWins.map(w =>
        `<div class="achieve-win">${esc(w.text)}</div>`
      ).join('')}</div>
    </div>`;
  }

  if (!totalMin && !doneToday && !doneWeek && !activeStreaks.length && !recentWins.length) {
    html = `<div style="font-size:13px; color:var(--text-muted)">Complete tasks, habits, and goals to see your achievements here.</div>`;
  }

  el.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════
// QUICK CAPTURE
// ═══════════════════════════════════════════════════════════════
let captureType = 'note';
let recognition = null;

document.getElementById('fab').addEventListener('click', () => {
  document.getElementById('overlay-capture').classList.add('active');
  setTimeout(() => document.getElementById('capture-input').focus(), 100);
});
document.getElementById('capture-close').addEventListener('click', () => {
  document.getElementById('overlay-capture').classList.remove('active');
});
document.getElementById('overlay-capture').addEventListener('click', e => {
  if (e.target === e.currentTarget) document.getElementById('overlay-capture').classList.remove('active');
});

document.querySelectorAll('.capture-type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.capture-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    captureType = btn.dataset.type;
  });
});

document.getElementById('capture-save-btn').addEventListener('click', saveCapture);
document.getElementById('capture-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.ctrlKey) saveCapture();
});

async function saveCapture() {
  const text = document.getElementById('capture-input').value.trim();
  if (!text) { toast('Please enter something to capture', 'error'); return; }
  const id = uid();
  const data = { id, content: text, type: captureType, processed: false, createdAt: Date.now() };
  state.captures.unshift(data);
  await saveDoc('captures', id, data);
  document.getElementById('capture-input').value = '';
  document.getElementById('overlay-capture').classList.remove('active');
  toast('Captured! ⚡', 'success');
  updateInboxBadge();
  if (currentView === 'dashboard') renderDashCaptures();
  if (currentView === 'inbox') renderInbox();
}

// Voice capture
const voiceBtn = document.getElementById('voice-btn');
voiceBtn.addEventListener('click', toggleVoice);

function toggleVoice() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    toast('Voice input not supported in this browser', 'error'); return;
  }
  if (recognition) { recognition.stop(); recognition = null; voiceBtn.classList.remove('recording'); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.onresult = e => {
    const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
    document.getElementById('capture-input').value = transcript;
  };
  recognition.onend = () => { voiceBtn.classList.remove('recording'); recognition = null; };
  recognition.onerror = () => { voiceBtn.classList.remove('recording'); recognition = null; };
  recognition.start();
  voiceBtn.classList.add('recording');
}

function updateInboxBadge() {
  const unprocessed = state.captures.filter(c => !c.processed).length;
  const badge = document.getElementById('inbox-badge');
  if (!badge) return;
  badge.textContent = unprocessed;
  badge.style.display = unprocessed > 0 ? 'flex' : 'none';
}

// ═══════════════════════════════════════════════════════════════
// INBOX
// ═══════════════════════════════════════════════════════════════
function renderInbox() {
  const el = document.getElementById('inbox-list');
  const unprocessed = state.captures.filter(c => !c.processed);
  if (!unprocessed.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📥</div><p>Inbox zero! You're all caught up.</p></div>`;
    return;
  }
  el.innerHTML = unprocessed.map(c => `
    <div class="inbox-item" data-id="${c.id}">
      <span class="inbox-type-pill ${c.type}">${c.type}</span>
      <div style="flex:1">
        <div class="inbox-content">${esc(c.content)}</div>
        <div class="inbox-time">${new Date(c.createdAt).toLocaleString()}</div>
        <div class="inbox-actions">
          <button class="btn btn-sm btn-ghost" onclick="processCapture('${c.id}','task')">→ Task</button>
          <button class="btn btn-sm btn-ghost" onclick="processCapture('${c.id}','note')">→ Note</button>
          <button class="btn btn-sm btn-ghost" onclick="dismissCapture('${c.id}')">Dismiss</button>
        </div>
      </div>
    </div>`).join('');
}

async function processCapture(id, targetType) {
  const cap = state.captures.find(c => c.id === id);
  if (!cap) return;

  if (targetType === 'task') {
    openAddTaskModal(cap.content, id);
  } else if (targetType === 'note') {
    await createNoteFromCapture(cap);
    cap.processed = true;
    await saveDoc('captures', id, { processed: true });
    updateInboxBadge();
    renderInbox();
  }
}

async function dismissCapture(id) {
  const cap = state.captures.find(c => c.id === id);
  if (cap) { cap.processed = true; await saveDoc('captures', id, { processed: true }); }
  updateInboxBadge();
  renderInbox();
}

// ═══════════════════════════════════════════════════════════════
// TASKS
// ═══════════════════════════════════════════════════════════════
let taskTab = 'today', taskAreaFilter = 'all', taskSearch = '';

document.getElementById('add-task-btn').addEventListener('click', () => openAddTaskModal());
document.getElementById('task-search').addEventListener('input', e => { taskSearch = e.target.value.toLowerCase(); renderTasks(); });

document.querySelectorAll('.view-tab[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.closest('#view-tasks') || btn.closest('#view-goals')) {
      document.querySelectorAll('#view-tasks .view-tab, #view-goals .view-tab').forEach(b => b.classList.toggle('active', b === btn));
      if (btn.dataset.tab === 'goals' || btn.dataset.tab === 'habits') {
        document.getElementById('goals-panel').style.display = btn.dataset.tab === 'goals' ? 'block' : 'none';
        document.getElementById('habits-panel').style.display = btn.dataset.tab === 'habits' ? 'block' : 'none';
      } else {
        taskTab = btn.dataset.tab;
        renderTasks();
      }
    }
  });
});

document.querySelectorAll('.area-filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.area-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    taskAreaFilter = btn.dataset.area;
    renderTasks();
  });
});

function renderTasks() {
  const today = dk();
  const allTasks = [...state.tasks];
  const undatedTasks = allTasks.filter(t => !t.dueDate && !t.done);
  let tasks = allTasks.filter(t => t.dueDate);

  // Tab filter (dated tasks only)
  if (taskTab === 'today') tasks = tasks.filter(t => !t.done && t.dueDate <= today);
  if (taskTab === 'upcoming') tasks = tasks.filter(t => !t.done && t.dueDate > today);

  // Area filter
  if (taskAreaFilter !== 'all') tasks = tasks.filter(t => t.area === taskAreaFilter);

  // Search
  if (taskSearch) {
    tasks = tasks.filter(t => t.title.toLowerCase().includes(taskSearch));
  }

  const el = document.getElementById('task-list');
  if (!tasks.length && !undatedTasks.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">☑️</div><p>No tasks here.</p><small>Add a task or adjust filters.</small></div>`;
    return;
  }

  // Sort dated tasks: undone first, then by due date
  tasks.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  function taskCardHtml(t) {
    const overdue = !t.done && t.dueDate && t.dueDate < today;
    return `<div class="task-card${t.done ? ' done' : ''}" data-id="${t.id}">
      <button class="task-check" onclick="toggleTask('${t.id}')" aria-label="Toggle task">
        <span class="task-check-mark">✓</span>
      </button>
      <div class="task-body" onclick="openAddTaskModal('', null, state.tasks.find(t=>t.id==='${t.id}'))" style="cursor:pointer">
        <div class="task-title">${esc(t.title)}</div>
        <div class="task-meta">
          ${t.dueDate ? `<span class="task-due${overdue ? ' overdue' : ''}">${overdue ? '⚠ ' : ''}${relativeDay(t.dueDate)}</span>` : ''}
          ${t.duration ? `<span class="task-duration">⏱ ${t.duration}m</span>` : ''}
          ${t.priority ? `<span class="pri-badge ${t.priority}">${t.priority}</span>` : ''}
          ${t.area ? `<span class="area-dot ${t.area}" style="width:8px;height:8px;border-radius:50%;display:inline-block;margin-left:2px"></span>` : ''}
        </div>
      </div>
      <div class="task-actions">
        ${!t.done ? `<button class="task-timer-btn${t.timerRunning ? ' running' : ''}" onclick="startTaskTimer('${t.id}')" title="Start timer">▶</button>` : ''}
        <button class="task-del-btn" onclick="deleteTask('${t.id}')" aria-label="Delete">×</button>
      </div>
    </div>`;
  }

  let html = tasks.map(t => taskCardHtml(t)).join('');

  if (undatedTasks.length) {
    html += `<div class="task-section-nodate" style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border)">
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">📅 Sans date — ajoute une date pour voir cette tâche dans le calendrier</div>
      ${undatedTasks.map(t => taskCardHtml(t)).join('')}
    </div>`;
  }

  el.innerHTML = html;
}

function openAddTaskModal(prefill = '', captureId = null, item = null, overrides = {}) {
  const editing = !!item;
  const goalOpts = buildGoalOptions(overrides.categoryId || (editing ? null : activeCategoryId) || null);
  openModal({
    title: editing ? 'Edit Task' : 'New Task',
    sub: editing ? 'Update task details' : 'Give it a time estimate — it helps with time blindness',
    fields: [
      { name: 'title', label: 'Task', placeholder: 'What needs to happen?', required: true, value: editing ? item.title : prefill },
      { name: 'goalId', label: 'Goal (Parent)', type: 'select', required: true, value: editing ? (item.goalId || '') : (overrides.goalId || ''), options: goalOpts },
      { name: 'dueDate', label: 'Due Date', type: 'date', required: true, value: editing ? (item.dueDate || '') : '' },
      { name: 'duration', label: 'Time Estimate (minutes)', type: 'number', placeholder: '30', value: editing ? (item.duration || '') : '' },
      { name: 'priority', label: 'Priority', type: 'select', value: editing ? (item.priority || 'medium') : 'medium', options: [['medium', 'Medium'], ['high', 'High'], ['low', 'Low']] }
    ],
    submit: editing ? 'Save Changes' : 'Add Task',
    onSubmit: async v => {
      if (!v.goalId) {
        toast('Please select a parent goal — every task must belong to a goal.', 'error', 4000);
        return;
      }
      if (!v.duration) {
        toast('Please add a time estimate — even a rough one helps!', 'info', 4000);
      }
      if (editing) {
        Object.assign(item, {
          title: v.title, dueDate: v.dueDate || null,
          duration: parseInt(v.duration) || 0,
          priority: v.priority || 'medium',
          goalId: v.goalId || null
        });
        await saveDoc('tasks', item.id, item);
      } else {
        const id = uid();
        const data = {
          id, title: v.title, dueDate: v.dueDate || null,
          duration: parseInt(v.duration) || 0,
          priority: v.priority || 'medium',
          goalId: v.goalId,
          done: false, timerRunning: false,
          createdAt: Date.now()
        };
        state.tasks.unshift(data);
        await saveDoc('tasks', id, data);
        if (captureId) {
          const cap = state.captures.find(c => c.id === captureId);
          if (cap) { cap.processed = true; await saveDoc('captures', captureId, { processed: true }); }
          updateInboxBadge();
          if (currentView === 'inbox') renderInbox();
        }
      }
      const taskGoal = state.goals.find(g => g.id === v.goalId);
      if (taskGoal && taskGoal.categoryId) await ensureCategoryTabForType(taskGoal.categoryId, 'tasks', '☑️ Tasks');
      renderTasks();
      if (currentView === 'category' && activeCategoryId) renderCategoryContent();
      if (currentView === 'dashboard') renderDashStats();
      if (currentView === 'sprint') renderSprint();
      rerenderGoalsList();
    }
  });
}

async function toggleTask(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  task.done = !task.done;
  task.completedAt = task.done ? dk() : null;
  await saveDoc('tasks', id, { done: task.done, completedAt: task.completedAt });

  if (task.done) {
    await logWin(`Completed: ${task.title}`, getTaskCategoryId(task));
    openPauseScreen(task.title);
  }
  renderTasks();
  if (currentView === 'dashboard') renderDashStats();
  if (currentView === 'sprint') renderSprint();
}

async function deleteTask(id) {
  state.tasks = state.tasks.filter(t => t.id !== id);
  await deleteDoc('tasks', id);
  renderTasks();
  if (currentView === 'sprint') renderSprint();
}

// ═══════════════════════════════════════════════════════════════
// TASK TIMER
// ═══════════════════════════════════════════════════════════════
let timerInterval = null;
let timerTaskId = null;
let timerSecondsLeft = 0;
let timerTotalSec = 0;
let timerStartTime = null;

function startTaskTimer(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  if (!task.duration) {
    toast('Set a time estimate on this task first', 'error'); return;
  }

  timerTaskId = id;
  timerTotalSec = task.duration * 60;
  timerSecondsLeft = timerTotalSec;
  timerStartTime = Date.now();

  document.getElementById('timer-task-name').textContent = task.title;
  document.getElementById('overlay-timer').classList.add('active');
  updateTimerDisplay();

  timerInterval = setInterval(() => {
    timerSecondsLeft = Math.max(0, timerTotalSec - Math.floor((Date.now() - timerStartTime) / 1000));
    updateTimerDisplay();
    if (timerSecondsLeft <= 0) {
      clearInterval(timerInterval);
      completeTimer();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const display = document.getElementById('timer-display');
  const fill = document.getElementById('timer-bar-fill');
  const pct = (timerSecondsLeft / timerTotalSec) * 100;

  display.textContent = formatSec(timerSecondsLeft);
  fill.style.width = `${pct}%`;

  const urgent = timerSecondsLeft < 120;
  display.classList.toggle('urgent', urgent);
  fill.classList.toggle('urgent', urgent);
}

async function completeTimer() {
  document.getElementById('overlay-timer').classList.remove('active');
  const task = state.tasks.find(t => t.id === timerTaskId);
  const actualMin = Math.round((Date.now() - timerStartTime) / 60000);

  // Log time entry
  const teId = uid();
  const te = { id: teId, taskId: timerTaskId, estimatedMin: task?.duration || 0, actualMin, date: dk(), categoryId: task ? getTaskCategoryId(task) : null, createdAt: Date.now() };
  state.timeEntries.push(te);
  await saveDoc('timeEntries', teId, te);

  clearTimer();
  toast('Timer done! ⏱', 'success');
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Temps écoulé', { body: task ? `Temps écoulé — ${task.title}` : 'Temps écoulé' });
  }
}

document.getElementById('timer-done-btn').addEventListener('click', async () => {
  clearInterval(timerInterval);
  await completeTimer();
  await toggleTask(timerTaskId);
});

document.getElementById('timer-cancel-btn').addEventListener('click', () => {
  clearInterval(timerInterval);
  clearTimer();
});

function clearTimer() {
  document.getElementById('overlay-timer').classList.remove('active');
  timerInterval = null; timerTaskId = null;
}

// ═══════════════════════════════════════════════════════════════
// PAUSE SCREEN
// ═══════════════════════════════════════════════════════════════
let pauseInterval = null;

function openPauseScreen(taskTitle) {
  document.getElementById('pause-title').textContent = `You finished: "${taskTitle}" 🎉`;
  const skipBtn = document.getElementById('pause-skip-btn');
  skipBtn.classList.remove('ready');
  skipBtn.disabled = true;

  let secs = 60;
  document.getElementById('pause-countdown').textContent = secs;
  const circle = document.getElementById('pause-ring-circle');
  const circumference = 2 * Math.PI * 80;

  document.getElementById('screen-pause').classList.add('active');

  pauseInterval = setInterval(() => {
    secs--;
    document.getElementById('pause-countdown').textContent = secs;
    const offset = circumference * (secs / 60);
    circle.setAttribute('stroke-dashoffset', offset);

    if (secs <= 0) {
      clearInterval(pauseInterval);
      skipBtn.classList.add('ready');
      skipBtn.disabled = false;
      document.getElementById('pause-countdown').textContent = '✓';
    }
  }, 1000);
}

document.getElementById('pause-skip-btn').addEventListener('click', () => {
  if (!document.getElementById('pause-skip-btn').classList.contains('ready')) return;
  clearInterval(pauseInterval);
  // Log win from the input
  const winText = document.getElementById('pause-win-input').value.trim();
  if (winText) logWin(winText);
  document.getElementById('pause-win-input').value = '';
  document.getElementById('screen-pause').classList.remove('active');
});

// ═══════════════════════════════════════════════════════════════
// SPRINT SYSTEM (unified with goals)
// ═══════════════════════════════════════════════════════════════
function computeGoalProgress(goal) {
  const tasks = state.tasks.filter(t => t.goalId === goal.id);
  const habits = state.habits.filter(h => h.goalId === goal.id);
  const taskCount = tasks.length;
  const habitCount = habits.length;

  if (taskCount === 0 && habitCount === 0) {
    return { progress: Math.round(goal.progress || 0), mode: 'manual', details: [], habitDetails: [] };
  }

  let taskProgress = null;
  let habitProgress = null;
  const details = [];
  const habitDetails = [];

  if (taskCount > 0) {
    const done = tasks.filter(t => t.done).length;
    taskProgress = done / taskCount;
    details.push(`${done}/${taskCount} tasks done (${Math.round(taskProgress * 100)}%)`);
  }

  if (habitCount > 0) {
    let totalConsistency = 0;
    for (const h of habits) {
      const hp = computeHabitProgress(h);
      totalConsistency += hp.progress;
      const streak = calcStreak(h.checkIns || []);
      habitDetails.push({ name: h.name, consistency: Math.round(hp.progress * 100), streak, mode: hp.mode });
    }
    habitProgress = totalConsistency / habitCount;
    const avgPct = Math.round(habitProgress * 100);
    details.push(`avg ${avgPct}% habit progress`);
  }

  let overall;
  if (taskProgress !== null && habitProgress !== null) {
    overall = (taskProgress * taskCount + habitProgress * habitCount) / (taskCount + habitCount);
  } else if (taskProgress !== null) {
    overall = taskProgress;
  } else {
    overall = habitProgress;
  }

  return { progress: Math.round(overall * 100), mode: 'auto', details, habitDetails };
}

// backward-compat alias
const computeSprintGoalProgress = computeGoalProgress;

function renderSprint() {
  const now = new Date();
  const qLabel = getQuarterLabel();
  const sprintGoals = state.goals.filter(g => g.isSprintObjective && g.sprintQuarter === qLabel);

  document.getElementById('sprint-quarter').textContent = qLabel;
  document.getElementById('sprint-main-title').textContent = 'Sprint Objectives';

  // Overall progress = average displayPct of all sprint goals (live, never stored)
  const list = document.getElementById('sprint-objectives-list');
  if (!sprintGoals.length) {
    document.getElementById('sprint-q-pct').textContent = '—';
    document.getElementById('sprint-q-fill').style.width = '0%';
    document.getElementById('sprint-progress-label').textContent = 'No objectives yet';
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">🚀</div><p>No sprint objectives this quarter.</p><small>Mark goals as "Sprint Objective" from Goals & Habits, or create a new goal below.</small></div>`;
    return;
  }

  const goalPcts = sprintGoals.map(g => computeGoalProgress(g).progress);
  const overallPct = Math.round(goalPcts.reduce((a, b) => a + b, 0) / goalPcts.length);
  document.getElementById('sprint-q-pct').textContent = `${overallPct}%`;
  document.getElementById('sprint-q-fill').style.width = `${overallPct}%`;
  document.getElementById('sprint-progress-label').textContent = `${sprintGoals.length} objective${sprintGoals.length > 1 ? 's' : ''}`;

  // Group by root category (Family/Growth/Career/Finance), each root = a collapsible accordion
  const grouped = {};
  for (const g of sprintGoals) {
    const catId = g.categoryId;
    let rootKey = 'uncategorized';
    if (catId) {
      const root = getCategoryRoot(catId);
      if (root) rootKey = root.id;
    }
    if (!grouped[rootKey]) grouped[rootKey] = [];
    grouped[rootKey].push(g);
  }

  const rootLabel = key => {
    if (key === 'uncategorized') return '🗂 Uncategorized';
    const root = getCategoryById(key);
    return root ? (root.icon || '') + ' ' + root.name : '🗂 Uncategorized';
  };

  let html = '';
  for (const [rootKey, goals] of Object.entries(grouped)) {
    const collapsed = (window._collapsedSprintRoots || new Set()).has(rootKey);
    html += `<div class="sprint-root-accordion">
      <div class="sprint-root-header" onclick="toggleSprintRootExpand('${rootKey}')">
        <span class="sprint-root-chevron${collapsed ? '' : ' expanded'}">▶</span>
        <span class="sprint-root-title">${esc(rootLabel(rootKey))}</span>
        <span class="sprint-root-count">${goals.length} objective${goals.length > 1 ? 's' : ''}</span>
      </div>
      <div class="sprint-root-body${collapsed ? ' collapsed' : ''}">
        ${goals.map(g => buildGoalAccordionHtml(g)).join('')}
      </div>
    </div>`;
  }
  list.innerHTML = html;
}

function toggleSprintRootExpand(rootKey) {
  if (!window._collapsedSprintRoots) window._collapsedSprintRoots = new Set();
  if (window._collapsedSprintRoots.has(rootKey)) window._collapsedSprintRoots.delete(rootKey);
  else window._collapsedSprintRoots.add(rootKey);
  renderSprint();
}

function getQuarterLabel() {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3) + 1;
  return `${now.getFullYear()}-Q${q}`;
}

document.getElementById('add-sprint-obj-btn').addEventListener('click', () => {
  openModal({
    title: 'New Sprint Objective',
    sub: 'A big outcome to achieve this quarter',
    fields: [
      { name: 'title', label: 'Objective', placeholder: 'e.g. Prepare for baby arrival', required: true },
      { name: 'categoryId', label: 'Category', type: 'select', options: buildCategoryOptions() },
      { name: 'w1', label: 'Weekly Action 1', placeholder: 'e.g. Book hospital tour' },
      { name: 'w2', label: 'Weekly Action 2', placeholder: 'e.g. Set up nursery' },
      { name: 'w3', label: 'Weekly Action 3', placeholder: 'e.g. Prepare hospital bag' }
    ],
    submit: 'Add Objective',
    onSubmit: async v => {
      const weeklyActions = [v.w1, v.w2, v.w3].filter(Boolean);
      const catId = v.categoryId || null;
      const lifeArea = catId ? getLifeArea(catId) : '';
      const id = uid();
      const data = {
        id, title: v.title, area: lifeArea, categoryId: catId,
        progress: 0, milestones: [], weeklyActions,
        isSprintObjective: true, sprintQuarter: getQuarterLabel(),
        deadline: null, createdAt: Date.now()
      };
      state.goals.unshift(data);
      await saveDoc('goals', id, data);
      if (catId) await ensureCategoryTabForType(catId, 'goals', '🎯 Goals');
      renderSprint();
      if (currentView === 'goals') renderGoals();
    }
  });
});

function getQuarterStart() {
  const now = new Date();
  const qMonth = Math.floor(now.getMonth() / 3) * 3;
  return new Date(now.getFullYear(), qMonth, 1);
}
function getQuarterEnd() {
  const s = getQuarterStart();
  return new Date(s.getFullYear(), s.getMonth() + 3, 0);
}

// ═══════════════════════════════════════════════════════════════
// NOTES
// ═══════════════════════════════════════════════════════════════
let currentNoteId = null;
let noteAutoSave = null;

function renderNotesList() {
  const search = document.getElementById('note-search').value.toLowerCase();
  const sidebar = document.getElementById('notes-sidebar');
  let notes = [...state.notes];
  if (search) notes = notes.filter(n => n.title?.toLowerCase().includes(search) || n.content?.toLowerCase().includes(search));
  notes.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  if (!notes.length) {
    sidebar.innerHTML = `<div style="font-size:12px; color:var(--text-muted); padding:12px; text-align:center">No notes yet</div>`;
    return;
  }
  sidebar.innerHTML = notes.map(n => `
    <div class="note-sidebar-item${n.id === currentNoteId ? ' active' : ''}" data-id="${n.id}">
      <div class="note-sidebar-title">${esc(n.title || 'Untitled')}</div>
      <div class="note-sidebar-preview">${esc(stripHtml(n.content || '').slice(0, 60))}</div>
    </div>`).join('');

  sidebar.querySelectorAll('.note-sidebar-item').forEach(item => {
    item.addEventListener('click', () => openNote(item.dataset.id));
  });
}

function stripHtml(html) { const d = document.createElement('div'); d.innerHTML = html; return d.textContent || ''; }

document.getElementById('note-search').addEventListener('input', renderNotesList);

document.getElementById('add-note-btn').addEventListener('click', async () => {
  const id = uid();
  const data = { id, title: 'Untitled Note', content: '', tags: [], area: '', createdAt: Date.now(), updatedAt: Date.now() };
  state.notes.unshift(data);
  await saveDoc('notes', id, data);
  renderNotesList();
  openNote(id);
});

function openNote(id) {
  currentNoteId = id;
  const note = state.notes.find(n => n.id === id);
  if (!note) return;

  document.getElementById('notes-empty-msg').style.display = 'none';
  const wrap = document.getElementById('notes-editor-wrap');
  wrap.style.display = 'flex';

  document.getElementById('note-title-input').value = note.title || '';
  document.getElementById('note-editor').innerHTML = note.content || '';
  renderNotesList();
}

async function saveCurrentNote() {
  if (!currentNoteId) return;
  const note = state.notes.find(n => n.id === currentNoteId);
  if (!note) return;
  note.title = document.getElementById('note-title-input').value.trim() || 'Untitled';
  note.content = document.getElementById('note-editor').innerHTML;
  note.updatedAt = Date.now();
  await saveDoc('notes', currentNoteId, { title: note.title, content: note.content, updatedAt: note.updatedAt });
  renderNotesList();
}

document.getElementById('note-save-btn').addEventListener('click', async () => { await saveCurrentNote(); toast('Note saved ✓', 'success'); });

document.getElementById('note-delete-btn').addEventListener('click', async () => {
  if (!currentNoteId) return;
  if (!confirm('Delete this note?')) return;
  state.notes = state.notes.filter(n => n.id !== currentNoteId);
  await deleteDoc('notes', currentNoteId);
  currentNoteId = null;
  document.getElementById('notes-empty-msg').style.display = 'flex';
  document.getElementById('notes-editor-wrap').style.display = 'none';
  renderNotesList();
});

// Rich text editor commands
document.querySelectorAll('.editor-toolbar-btn[data-cmd]').forEach(btn => {
  btn.addEventListener('click', () => {
    const cmd = btn.dataset.cmd, val = btn.dataset.val || null;
    document.getElementById('note-editor').focus();
    document.execCommand(cmd, false, val);
  });
});

// Auto-save on input
document.getElementById('note-editor').addEventListener('input', () => {
  clearTimeout(noteAutoSave);
  noteAutoSave = setTimeout(saveCurrentNote, 1500);
});
document.getElementById('note-title-input').addEventListener('input', () => {
  clearTimeout(noteAutoSave);
  noteAutoSave = setTimeout(saveCurrentNote, 1500);
});

async function createNoteFromCapture(capture) {
  const id = uid();
  const data = { id, title: capture.content.slice(0, 50), content: `<p>${capture.content}</p>`, tags: [], area: '', createdAt: Date.now(), updatedAt: Date.now() };
  state.notes.unshift(data);
  await saveDoc('notes', id, data);
  goTo('notes');
  openNote(id);
}

// ═══════════════════════════════════════════════════════════════
// DOCUMENTS
// ═══════════════════════════════════════════════════════════════
const docUploadZone = document.getElementById('doc-upload-zone');
const docFileInput = document.getElementById('doc-file-input');

docUploadZone.addEventListener('click', () => docFileInput.click());
docUploadZone.addEventListener('dragover', e => { e.preventDefault(); docUploadZone.classList.add('dragover'); });
docUploadZone.addEventListener('dragleave', () => docUploadZone.classList.remove('dragover'));
docUploadZone.addEventListener('drop', e => { e.preventDefault(); docUploadZone.classList.remove('dragover'); handleFileUpload(e.dataTransfer.files); });
docFileInput.addEventListener('change', e => handleFileUpload(e.target.files));

async function handleFileUpload(files) {
  for (const file of files) {
    if (file.size > 20 * 1024 * 1024) { toast(`${file.name} is too large (max 20MB)`, 'error'); continue; }
    toast(`Uploading ${file.name}…`, 'info', 10000);
    try {
      const path = `users/${currentUser.uid}/documents/${uid()}_${file.name}`;
      const ref = storage.ref(path);
      const snap = await ref.put(file);
      const url = await snap.ref.getDownloadURL();
      const id = uid();
      const data = { id, name: file.name, size: file.size, mimeType: file.type, storagePath: path, url, folder: '', tags: [], uploadedAt: Date.now(), createdAt: Date.now() };
      state.documents.unshift(data);
      await saveDoc('documents', id, data);
      toast(`${file.name} uploaded ✓`, 'success');
      renderDocuments();
    } catch (e) { toast(`Failed to upload ${file.name}: ${e.message}`, 'error'); }
  }
}

function renderDocuments() {
  const search = document.getElementById('doc-search').value.toLowerCase();
  let docs = [...state.documents];
  if (search) docs = docs.filter(d => d.name.toLowerCase().includes(search));
  docs.sort((a, b) => b.uploadedAt - a.uploadedAt);

  const grid = document.getElementById('doc-grid');
  if (!docs.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">📁</div><p>No documents yet</p><small>Upload files to store them securely in the cloud</small></div>`;
    return;
  }
  grid.innerHTML = docs.map(d => {
    const icon = d.mimeType?.includes('pdf') ? '📄' : d.mimeType?.includes('image') ? '🖼️' : d.mimeType?.includes('word') ? '📝' : '📎';
    const size = d.size > 1e6 ? `${(d.size / 1e6).toFixed(1)} MB` : `${Math.round(d.size / 1024)} KB`;
    return `<div class="doc-card" onclick="openDocument('${d.id}')">
      <div class="doc-card-icon">${icon}</div>
      <div class="doc-card-name">${esc(d.name)}</div>
      <div class="doc-card-size">${size}</div>
      <button class="btn btn-ghost btn-sm" style="margin-top:auto" onclick="event.stopPropagation(); deleteDocument('${d.id}')">Delete</button>
    </div>`;
  }).join('');
}

function openDocument(id) {
  const doc = state.documents.find(d => d.id === id);
  if (!doc?.url) { toast('Document URL unavailable — try re-uploading', 'error'); return; }
  if (doc.mimeType?.includes('pdf') || doc.mimeType?.startsWith('image/')) {
    window.open(doc.url, '_blank');
  } else {
    const a = document.createElement('a'); a.href = doc.url; a.download = doc.name; a.click();
  }
}

async function deleteDocument(id) {
  const doc = state.documents.find(d => d.id === id);
  if (!doc || !confirm(`Delete "${doc.name}"?`)) return;
  try {
    if (doc.storagePath) await storage.ref(doc.storagePath).delete();
  } catch (e) { toast(`Storage delete failed: ${e.message}`, 'error'); }
  state.documents = state.documents.filter(d => d.id !== id);
  await deleteDoc('documents', id);
  renderDocuments();
}

document.getElementById('doc-search').addEventListener('input', renderDocuments);

// ═══════════════════════════════════════════════════════════════
// CALENDAR
// ═══════════════════════════════════════════════════════════════
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();

document.getElementById('cal-prev').addEventListener('click', () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar(); });
document.getElementById('cal-next').addEventListener('click', () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar(); });
document.getElementById('cal-today').addEventListener('click', () => { calYear = new Date().getFullYear(); calMonth = new Date().getMonth(); renderCalendar(); });
document.getElementById('add-event-btn').addEventListener('click', openAddEventModal);

// ═══════════════════════════════════════════════════════════════
// EXTERNAL CALENDAR INTEGRATION
// ═══════════════════════════════════════════════════════════════

// --- GOOGLE CALENDAR ---
const GCAL_CLIENT_ID = '865375487797-i4h2uhhv0evdovbbuka8amsmfm6hargs.apps.googleusercontent.com';
const GCAL_API_KEY = 'AIzaSyBN6vh3XpSDetwl9l8raARL-aadfgnyNc4';
const GCAL_SCOPES = 'https://www.googleapis.com/auth/calendar.readonly';
const GCAL_DISCOVERY = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest';

let gcalTokenClient;
let gapiInited = false, gisInited = false;

window.gapiLoaded = function () {
  gapi.load('client', async () => {
    await gapi.client.init({ apiKey: GCAL_API_KEY, discoveryDocs: [GCAL_DISCOVERY] });
    gapiInited = true;
    if (gisInited) enableCalButtons();
  });
};

window.gisLoaded = function () {
  gcalTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GCAL_CLIENT_ID,
    scope: GCAL_SCOPES,
    callback: handleGcalAuth,
  });
  gisInited = true;
  if (gapiInited) enableCalButtons();
};

function enableCalButtons() {
  const gc = document.getElementById('btn-connect-google-cal');
  const oc = document.getElementById('btn-connect-outlook-cal');
  if (gc) gc.classList.remove('disabled');
  if (oc) oc.classList.remove('disabled');
}

async function handleGcalAuth(resp) {
  if (resp.error) {
    toast('Google Calendar sign-in failed', 'error');
    return;
  }
  localStorage.setItem('gcal_connected', 'true');
  const btn = document.getElementById('btn-connect-google-cal');
  btn.classList.add('connected');
  btn.textContent = '✓ Google Calendar Connected';
  toast('Google Calendar connected!', 'success');
  await fetchGoogleCalendarEvents();
  renderCalendar();
}

async function fetchGoogleCalendarEvents() {
  if (!gapiInited || !gapi.client?.calendar) return;
  try {
    const now = new Date();
    const timeMin = new Date(calYear, calMonth, 1).toISOString();
    const timeMax = new Date(calYear, calMonth + 1, 0, 23, 59, 59).toISOString();
    const response = await gapi.client.calendar.events.list({
      calendarId: 'primary', timeMin, timeMax,
      singleEvents: true, maxResults: 100, orderBy: 'startTime',
    });
    state.googleCalendarEvents = (response.result.items || []).map(e => ({
      title: e.summary || '(No title)',
      date: (e.start.date || e.start.dateTime || '').slice(0, 10),
      startTime: e.start.dateTime ? e.start.dateTime.slice(11, 16) : 'All day',
      endTime: e.end.dateTime ? e.end.dateTime.slice(11, 16) : '',
      source: 'google',
    }));
  } catch (e) {
    console.error('Google Calendar fetch error', e);
    toast('Failed to fetch Google Calendar events', 'error');
  }
}

function connectGoogleCalendar() {
  if (!gapiInited || !gisInited) {
    toast('Google Calendar SDKs still loading, try again in a moment', 'info');
    return;
  }
  const token = gapi.client.getToken();
  if (token) {
    gapi.client.setToken('');
  }
  gcalTokenClient.requestAccessToken({ prompt: 'consent' });
}

function disconnectGoogleCalendar() {
  const token = gapi.client.getToken();
  if (token) google.accounts.oauth2.revoke(token.access_token);
  gapi.client.setToken('');
  localStorage.removeItem('gcal_connected');
  state.googleCalendarEvents = [];
  const btn = document.getElementById('btn-connect-google-cal');
  btn.classList.remove('connected');
  btn.textContent = 'Connect Google Calendar';
  renderCalendar();
  toast('Google Calendar disconnected', 'info');
}

// --- OUTLOOK / MICROSOFT CALENDAR ---
const O365_CLIENT_ID = 'YOUR_MICROSOFT_CLIENT_ID';
const O365_SCOPES = ['Calendars.ReadWrite', 'User.Read', 'offline_access', 'openid', 'profile', 'email'];

let msalInstance = null;
let outlookAccount = null;

function initMSAL() {
  if (typeof msal === 'undefined') return;
  msalInstance = new msal.PublicClientApplication({
    auth: {
      clientId: O365_CLIENT_ID,
      redirectUri: window.location.origin,
      navigateToLoginRequestUrl: false,
    },
    cache: { cacheLocation: 'sessionStorage', storeAuthStateInCookie: false },
  });
  msalInstance.handleRedirectPromise().catch(console.error);
}

async function connectOutlookCalendar() {
  if (!msalInstance) { toast('Microsoft SDK still loading', 'info'); return; }
  try {
    const resp = await msalInstance.loginPopup({ scopes: O365_SCOPES });
    msalInstance.setActiveAccount(resp.account);
    outlookAccount = resp.account;
    localStorage.setItem('outlook_connected', 'true');
    const btn = document.getElementById('btn-connect-outlook-cal');
    btn.classList.add('connected');
    btn.textContent = '✓ Outlook Connected';
    toast('Outlook Calendar connected!', 'success');
    await fetchOutlookCalendarEvents();
    renderCalendar();
  } catch (e) {
    console.error('Outlook auth error', e);
    if (e.errorCode !== 'user_cancelled') toast('Outlook sign-in failed', 'error');
  }
}

async function fetchOutlookCalendarEvents() {
  if (!msalInstance || !outlookAccount) return;
  try {
    const tokenResp = await msalInstance.acquireTokenSilent({ scopes: O365_SCOPES, account: outlookAccount });
    const start = new Date(calYear, calMonth, 1).toISOString();
    const end = new Date(calYear, calMonth + 1, 0, 23, 59, 59).toISOString();
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${start}&endDateTime=${end}&$top=50&$orderby=start/dateTime`,
      { headers: { Authorization: `Bearer ${tokenResp.accessToken}` } }
    );
    const data = await res.json();
    state.outlookCalendarEvents = (data.value || []).map(e => ({
      title: e.subject || '(No title)',
      date: (e.start.dateTime || e.start.date || '').slice(0, 10),
      startTime: e.start.dateTime ? e.start.dateTime.slice(11, 16) : 'All day',
      endTime: e.end.dateTime ? e.end.dateTime.slice(11, 16) : '',
      source: 'outlook',
    }));
  } catch (e) {
    console.error('Outlook Calendar fetch error', e);
    if (e.errorCode === 'invalid_grant') {
      toast('Outlook session expired, please reconnect', 'info');
      disconnectOutlookCalendar();
    } else {
      toast('Failed to fetch Outlook events', 'error');
    }
  }
}

function disconnectOutlookCalendar() {
  if (msalInstance && outlookAccount) msalInstance.logoutPopup({ account: outlookAccount }).catch(() => { });
  outlookAccount = null;
  localStorage.removeItem('outlook_connected');
  state.outlookCalendarEvents = [];
  const btn = document.getElementById('btn-connect-outlook-cal');
  btn.classList.remove('connected');
  btn.textContent = 'Connect Outlook Calendar';
  renderCalendar();
  toast('Outlook Calendar disconnected', 'info');
}

// --- CAL BUTTON HANDLERS ---
document.getElementById('btn-connect-google-cal').addEventListener('click', () => {
  const btn = document.getElementById('btn-connect-google-cal');
  if (btn.classList.contains('connected')) { disconnectGoogleCalendar(); return; }
  connectGoogleCalendar();
});
document.getElementById('btn-connect-outlook-cal').addEventListener('click', () => {
  const btn = document.getElementById('btn-connect-outlook-cal');
  if (btn.classList.contains('connected')) { disconnectOutlookCalendar(); return; }
  connectOutlookCalendar();
});

// Restore connection state on load
function restoreCalendarConnections() {
  if (localStorage.getItem('gcal_connected') === 'true' && gapiInited && gisInited) {
    const btn = document.getElementById('btn-connect-google-cal');
    btn.classList.add('connected');
    btn.textContent = '✓ Google Calendar Connected';
  }
  if (localStorage.getItem('outlook_connected') === 'true' && msalInstance) {
    const btn = document.getElementById('btn-connect-outlook-cal');
    btn.classList.add('connected');
    btn.textContent = '✓ Outlook Connected';
    // Attempt silent token refresh
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length) {
      outlookAccount = accounts[0];
      msalInstance.setActiveAccount(outlookAccount);
      fetchOutlookCalendarEvents().catch(() => { });
    }
  }
}

// Initialize MSAL on script load
initMSAL();

function renderCalendar() {
  document.getElementById('cal-title').textContent = `${MONTHS[calMonth]} ${calYear}`;
  const weekdays = document.getElementById('cal-weekdays');
  weekdays.innerHTML = WDAYS.map(d => `<div class="cal-weekday">${d}</div>`).join('');

  const grid = document.getElementById('cal-days');
  grid.innerHTML = '';

  const first = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const prevDays = new Date(calYear, calMonth, 0).getDate();
  const totalCells = Math.ceil((first + daysInMonth) / 7) * 7;
  const todayStr = dk();

  for (let i = 0; i < totalCells; i++) {
    const offset = i - first;
    let d, outside = false;
    if (offset < 0) { d = new Date(calYear, calMonth - 1, prevDays + offset + 1); outside = true; }
    else if (offset >= daysInMonth) { d = new Date(calYear, calMonth + 1, offset - daysInMonth + 1); outside = true; }
    else { d = new Date(calYear, calMonth, offset + 1); }

    const key = dk(d);
    const isToday = key === todayStr;
    const dayEvents = getEventsForDate(key);

    const cell = document.createElement('div');
    cell.className = `cal-day${outside ? ' outside' : ''}${isToday ? ' today' : ''}`;
    cell.innerHTML = `
      <div class="day-num">${d.getDate()}</div>
      <div class="day-evs">
        ${dayEvents.slice(0, 3).map(e => {
          const icon = e.type === 'task' ? '☑️' : e.type === 'family' ? '👨‍👩‍👧' : '📅';
          return `<div class="day-ev ${e.type === 'task' ? 'task' : e.source || e.area || 'personal'}">${icon} ${esc(e.title)}</div>`;
        }).join('')}
        ${dayEvents.length > 3 ? `<div class="day-ev-more">+${dayEvents.length - 3} more</div>` : ''}
      </div>`;
    if (!outside) cell.addEventListener('click', () => openDayModal(key, d));
    grid.appendChild(cell);
  }
}

function getEventsForDate(dateStr) {
  // From local tasks with due dates
  const taskEvents = state.tasks
    .filter(t => t.dueDate === dateStr)
    .map(t => ({ title: t.title, area: t.area, type: 'task' }));
  // From family blocks
  const familyEvents = state.familyBlocks
    .filter(b => b.date === dateStr || b.recurring)
    .map(b => ({ title: b.title, area: 'family', type: 'family' }));
  // From local events (app-created)
  const localEvents = (state.events || [])
    .filter(e => e.date === dateStr)
    .map(e => ({ title: e.title, area: e.area || 'personal', type: 'event', source: 'app', startTime: e.startTime, endTime: e.endTime }));
  // From Google Calendar
  const googleEvents = (state.googleCalendarEvents || [])
    .filter(e => e.date === dateStr)
    .map(e => ({ title: e.title, area: 'career', type: 'google', source: 'google', startTime: e.startTime, endTime: e.endTime }));
  // From Outlook Calendar
  const outlookEvents = (state.outlookCalendarEvents || [])
    .filter(e => e.date === dateStr)
    .map(e => ({ title: e.title, area: 'career', type: 'outlook', source: 'outlook', startTime: e.startTime, endTime: e.endTime }));
  return [...taskEvents, ...familyEvents, ...localEvents, ...googleEvents, ...outlookEvents];
}

function openDayModal(key, d) {
  const label = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const events = getEventsForDate(key);
  openModal({
    title: label,
    sub: 'Events and tasks for this day',
    fields: [
      { name: 'title', label: 'Add Event / Time Block', placeholder: 'e.g. Deep work: career project' },
      { name: 'area', label: 'Category', type: 'select', options: [['personal', 'Personal'], ['family', 'Family'], ['career', 'Career'], ['finance', 'Finance']] },
      { name: 'startTime', label: 'Start Time', type: 'time', placeholder: '09:00' },
      { name: 'endTime', label: 'End Time', type: 'time', placeholder: '10:00' }
    ],
    submit: 'Add to Calendar',
    customBody: events.length ? `<div style="margin-bottom:16px">
      ${events.map(e => {
        const icon = e.type === 'task' ? '☑️' : e.type === 'family' ? '👨‍👩‍👧' : '📅';
        return `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">
          <span>${icon}</span> <span class="area-dot ${e.area}"></span> ${esc(e.title)}
        </div>`;
      }).join('')}
    </div>` : '',
    onSubmit: async v => {
      if (!v.title) return;
      const id = uid();
      const data = { id, title: v.title, date: key, area: v.area, startTime: v.startTime, endTime: v.endTime, source: 'app', createdAt: Date.now() };
      state.events.push(data);
      await saveDoc('events', id, data);
      renderCalendar();
    }
  });
}

function openAddEventModal() {
  openModal({
    title: 'Add Event / Time Block',
    sub: 'Block time on your calendar',
    fields: [
      { name: 'title', label: 'Event Title', placeholder: 'e.g. Doctor\'s appointment', required: true },
      { name: 'date', label: 'Date', type: 'date', required: true },
      { name: 'startTime', label: 'Start Time', type: 'time' },
      { name: 'endTime', label: 'End Time', type: 'time' },
      { name: 'area', label: 'Category', type: 'select', options: [['personal', 'Personal'], ['family', 'Family'], ['career', 'Career'], ['finance', 'Finance']] },
      { name: 'recurring', label: 'Recurring Daily?', type: 'select', options: [['false', 'No'], ['true', 'Yes — every day']] }
    ],
    submit: 'Add Event',
    onSubmit: async v => {
      const id = uid();
      const data = { id, title: v.title, date: v.date, startTime: v.startTime, endTime: v.endTime, area: v.area, recurring: v.recurring === 'true', source: 'app', createdAt: Date.now() };
      state.events.push(data);
      await saveDoc('events', id, data);
      renderCalendar();
      if (currentView === 'family') renderFamily();
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// GOALS
// ═══════════════════════════════════════════════════════════════
document.getElementById('add-goal-btn').addEventListener('click', openAddGoalModal);

function rerenderGoalsList() {
  if (currentView === 'category' && activeCategoryId) renderCategoryContent();
  else if (currentView === 'sprint') renderSprint();
  else renderGoals();
}

function buildGoalAccordionHtml(g) {
  const p = computeGoalProgress(g);
  const isAuto = p.mode === 'auto';
  const catTag = g.categoryId ? getCategoryPathString(g.categoryId) : '';
  const expanded = (window._expandedGoals || (window._expandedGoals = new Set())).has(g.id);
  const goalHabits = state.habits.filter(h => h.goalId === g.id);
  const goalTasks = state.tasks.filter(t => t.goalId === g.id);
  const linkedTasks = goalTasks.filter(t => !t.done).length;
  const linkedHabits = goalHabits.length;
  const today = dk();
  return `<div class="goal-accordion${expanded ? ' expanded' : ''}">
    <div class="goal-accordion-header" onclick="toggleGoalExpand('${g.id}')">
      <span class="goal-accordion-chevron${expanded ? ' expanded' : ''}">▶</span>
      <div class="goal-accordion-summary">
        <div class="goal-accordion-title-row">
          <div class="goal-card-title">${esc(g.title)}</div>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            ${g.isSprintObjective ? `<span class="cat-module-tag">🚀 Sprint</span>` : ''}
            ${catTag ? `<span class="cat-module-tag">${esc(catTag)}</span>` : ''}
          </div>
        </div>
        <div class="prog-track"><div class="prog-fill" style="width:${p.progress}%"></div></div>
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);margin-top:4px">
          <span>${p.progress}% · ${isAuto ? 'Auto' : 'Manual'}</span>
          ${g.deadline ? `<span>Due ${g.deadline}</span>` : ''}
        </div>
        ${(linkedTasks || linkedHabits) ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">${linkedTasks ? linkedTasks + ' open tasks' : ''}${linkedTasks && linkedHabits ? ' · ' : ''}${linkedHabits ? linkedHabits + ' habits' : ''}</div>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
        <button class="btn btn-ghost btn-xs" onclick="event.stopPropagation();openAddGoalModal(state.goals.find(x=>x.id==='${g.id}'))" title="Edit">✎</button>
        <button class="btn btn-ghost btn-xs" onclick="event.stopPropagation();deleteGoal('${g.id}')" title="Delete">×</button>
      </div>
    </div>
    <div class="goal-accordion-body${expanded ? '' : ' collapsed'}">
      ${(g.milestones || []).length ? `
      <div class="goal-milestones" style="margin-bottom:12px">
        ${g.milestones.map(m => `<div class="milestone-item">
          <button class="milestone-check${m.done ? ' done' : ''}" onclick="toggleMilestone('${g.id}','${m.id}')">${m.done ? '✓' : ''}</button>
          <span style="${m.done ? 'text-decoration:line-through;color:var(--text-muted)' : ''}">${esc(m.text)}</span>
        </div>`).join('')}
      </div>` : ''}

      <div class="cat-page-section" style="margin-bottom:12px">
        <div class="cat-page-section-header">
          <span class="cat-page-section-title">☑️ Tasks (${goalTasks.length})</span>
          <button class="btn btn-sm" onclick="event.stopPropagation();openAddTaskModal('', null, null, {goalId:'${g.id}'})">+ Add task</button>
        </div>
        ${goalTasks.length ? goalTasks.map(t => {
          const overdue = !t.done && t.dueDate && t.dueDate < today;
          return `<div class="cat-page-task${t.done ? ' done' : ''}">
            <button class="task-check-sm" onclick="toggleTask('${t.id}');rerenderGoalsList()">${t.done ? '✓' : ''}</button>
            <span class="cat-page-task-title" onclick="openAddTaskModal('', null, state.tasks.find(x=>x.id==='${t.id}'))">${esc(t.title)}</span>
            ${t.dueDate ? `<span class="cat-page-task-due${overdue ? ' overdue' : ''}">${overdue ? '⚠ ' : ''}${relativeDay(t.dueDate)}</span>` : ''}
            ${t.priority ? `<span class="pri-badge ${t.priority}">${t.priority}</span>` : ''}
            <span style="flex:1"></span>
            <button class="btn btn-ghost btn-xs" onclick="deleteTask('${t.id}');rerenderGoalsList()">×</button>
          </div>`;
        }).join('') : `<div class="empty-state" style="padding:8px 0"><p>No tasks for this goal yet.</p></div>`}
      </div>

      <div class="cat-page-section">
        <div class="cat-page-section-header">
          <span class="cat-page-section-title">🔥 Habits (${goalHabits.length})</span>
          <button class="btn btn-sm" onclick="event.stopPropagation();openAddHabitModal(null, {goalId:'${g.id}'})">+ Add habit</button>
        </div>
        ${goalHabits.length ? goalHabits.map(h => {
          const streak = calcStreak(h.checkIns || []);
          const checkedToday = (h.checkIns || []).includes(today);
          const hp = computeHabitProgress(h);
          return `<div class="cat-page-habit">
            <button class="task-check-sm${checkedToday ? ' done' : ''}" onclick="toggleHabitToday('${h.id}');rerenderGoalsList()">${checkedToday ? '✓' : ''}</button>
            <span class="cat-page-habit-name" onclick="openAddHabitModal(state.habits.find(x=>x.id==='${h.id}'))">${esc(h.name)}</span>
            ${h.deadline ? `<span style="font-size:11px;color:var(--accent-light)" title="Deadline ${h.deadline}">${Math.round(hp.progress * 100)}%</span>` : ''}
            ${streak > 0 ? `<span class="streak-badge">🔥 ${streak}</span>` : ''}
            <span style="flex:1"></span>
            <button class="btn btn-ghost btn-xs" onclick="deleteHabit('${h.id}');rerenderGoalsList()">×</button>
          </div>`;
        }).join('') : `<div class="empty-state" style="padding:8px 0"><p>No habits for this goal yet.</p></div>`}
      </div>

      ${!isAuto ? `<div class="stepper" style="gap:4px;margin-top:12px">
        <button onclick="adjustGoalProgress('${g.id}',-10)" style="width:36px;height:36px;border-radius:50%;background:var(--surface2);border:1px solid var(--border);color:var(--text);display:flex;align-items:center;justify-content:center;font-size:16px">−</button>
        <button onclick="adjustGoalProgress('${g.id}',10)" style="width:36px;height:36px;border-radius:50%;background:var(--surface2);border:1px solid var(--border);color:var(--text);display:flex;align-items:center;justify-content:center;font-size:16px">+</button>
      </div>` : ''}
    </div>
  </div>`;
}

function toggleGoalExpand(id) {
  if (!window._expandedGoals) window._expandedGoals = new Set();
  if (window._expandedGoals.has(id)) window._expandedGoals.delete(id);
  else window._expandedGoals.add(id);
  rerenderGoalsList();
}

function renderGoals() {
  const el = document.getElementById('goals-grid');
  if (!state.goals.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🎯</div><p>No goals yet</p><small>Long-term goals fuel your daily focus</small></div>`;
    return;
  }
  if (!window._expandedGoals) window._expandedGoals = new Set();
  const groups = {};
  state.goals.forEach(g => {
    let rootName = 'Non catégorisé';
    if (g.categoryId) {
      const root = getCategoryRoot(g.categoryId);
      if (root) rootName = (root.icon || '') + ' ' + root.name;
    }
    if (!groups[rootName]) groups[rootName] = [];
    groups[rootName].push(g);
  });
  const rootOrder = ['Family', 'Growth', 'Career', 'Finance', 'Non catégorisé'];
  const sorted = Object.keys(groups).sort((a, b) => {
    const ia = rootOrder.findIndex(r => a.includes(r));
    const ib = rootOrder.findIndex(r => b.includes(r));
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  el.innerHTML = sorted.map(rootName => `
    <div class="tgh-cat-group">
      <div class="tgh-cat-group-title">${rootName} (${groups[rootName].length})</div>
      ${groups[rootName].map(g => buildGoalAccordionHtml(g)).join('')}
    </div>`).join('');
}

function openAddGoalModal(item = null) {
  const editing = !!item;
  const isSprint = editing ? (item.isSprintObjective || false) : false;
  const initialCatId = editing ? (item.categoryId || '') : (activeCategoryId || '');
  openModal({
    title: editing ? 'Edit Goal' : 'New Goal',
    sub: editing ? 'Update goal details' : 'A long-term outcome worth working towards',
    fields: [
      { name: 'title', label: 'Goal Title', placeholder: 'e.g. Get promoted to senior role', required: true, value: editing ? item.title : '' },
      { name: 'categoryId', label: 'Category', type: 'select', value: initialCatId, options: buildCategoryOptions() },
      { name: 'deadline', label: 'Target Date', type: 'date', value: editing ? (item.deadline || '') : '' },
      { name: 'isSprintObjective', label: 'Sprint Objective?', type: 'select', value: isSprint ? 'true' : 'false', options: [['false', 'No'], ['true', 'Yes — track in Sprint view']] }
    ],
    submit: editing ? 'Save Changes' : 'Add Goal',
    onSubmit: async v => {
      const makeSprint = v.isSprintObjective === 'true';
      const quarterLabel = getQuarterLabel();
      const catId = v.categoryId || null;
      const lifeArea = catId ? getLifeArea(catId) : '';
      if (editing) {
        Object.assign(item, {
          title: v.title, area: lifeArea, deadline: v.deadline || null,
          categoryId: catId,
          isSprintObjective: makeSprint, sprintQuarter: makeSprint ? quarterLabel : null
        });
        await saveDoc('goals', item.id, item);
      } else {
        const id = uid();
        const data = {
          id, title: v.title, area: lifeArea, deadline: v.deadline || null,
          milestones: [], progress: 0, categoryId: catId,
          isSprintObjective: makeSprint, sprintQuarter: makeSprint ? quarterLabel : null,
          weeklyActions: [], createdAt: Date.now()
        };
        state.goals.unshift(data);
        await saveDoc('goals', id, data);
      }
      if (catId) await ensureCategoryTabForType(catId, 'goals', '🎯 Goals');
      rerenderGoalsList();
      if (currentView === 'sprint') renderSprint();
    }
  });
}

async function adjustGoalProgress(id, delta) {
  const goal = state.goals.find(g => g.id === id);
  if (!goal) return;
  const hasChildren = state.tasks.some(t => t.goalId === id) || state.habits.some(h => h.goalId === id);
  if (hasChildren) {
    toast('Progress is automatically derived from linked tasks/habits. Use those to change progress.', 'info', 4000);
    return;
  }
  goal.progress = Math.max(0, Math.min(100, (goal.progress || 0) + delta));
  await saveDoc('goals', id, { progress: goal.progress });
  rerenderGoalsList();
  if (currentView === 'sprint') renderSprint();
}

async function deleteGoal(id) {
  if (!confirm('Delete this goal?')) return;
  state.goals = state.goals.filter(g => g.id !== id);
  await deleteDoc('goals', id);
  rerenderGoalsList();
  if (currentView === 'sprint') renderSprint();
}

async function toggleMilestone(goalId, milestoneId) {
  const goal = state.goals.find(g => g.id === goalId);
  if (!goal) return;
  const m = (goal.milestones || []).find(m => m.id === milestoneId);
  if (!m) return;
  m.done = !m.done;
  const hasChildren = state.tasks.some(t => t.goalId === goalId) || state.habits.some(h => h.goalId === goalId);
  if (!hasChildren) {
    goal.progress = Math.round((goal.milestones.filter(m => m.done).length / goal.milestones.length) * 100);
  }
  await saveDoc('goals', goalId, { milestones: goal.milestones, progress: goal.progress });
  rerenderGoalsList();
  if (currentView === 'sprint') renderSprint();
}

// ═══════════════════════════════════════════════════════════════
// HABITS
// ═══════════════════════════════════════════════════════════════

// Tab switching for goals/habits
function renderSuiviTabBar() {
  const bar = document.getElementById('suivi-tab-bar');
  if (!bar) return;
  const tabs = state.settings.suiviTabs && state.settings.suiviTabs.length ? state.settings.suiviTabs : [];
  if (!window._suiviActiveTab && tabs.length) window._suiviActiveTab = tabs[0].id;
  const activeId = window._suiviActiveTab;
  const typeUsed = new Set(tabs.map(t => t.type));
  let html = tabs.map(t => {
    const itemCount = state.checklistItems.filter(i => !i.categoryId && i.tabId === t.id).length;
    const sufCount = (t.type === 'tasks' ? state.tasks.length : t.type === 'goals' ? state.goals.length : t.type === 'habits' ? state.habits.length : itemCount);
    return `<div style="display:inline-flex;align-items:center;gap:2px">
      <button class="view-tab${t.id === activeId ? ' active' : ''}" data-suivi-tab="${t.id}">${esc(t.label)}</button>
      <button class="btn-ghost btn-xs" onclick="removeSuiviTab('${t.id}')" title="Remove tab" style="font-size:11px;padding:2px 4px;color:var(--text-muted)">×</button>
    </div>`;
  }).join('');
  const available = [];
  if (!typeUsed.has('tasks')) available.push(['tasks', '☑️ Tasks']);
  if (!typeUsed.has('goals')) available.push(['goals', '🎯 Goals']);
  if (!typeUsed.has('habits')) available.push(['habits', '🔥 Habits']);
  if (!typeUsed.has('list')) available.push(['list', '📋 Liste simple']);
  if (available.length) {
    const escList = available.map(([t, l]) => `['${t}','${l}']`).join(',');
    html += `<button class="view-tab btn-ghost" onclick="openAddSuiviTabModal([${escList}])" style="border:1px dashed var(--border);color:var(--text-muted)">+ Ajouter un onglet</button>`;
  }
  bar.innerHTML = html;

  // Bind click handlers
  bar.querySelectorAll('[data-suivi-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      window._suiviActiveTab = btn.dataset.suiviTab;
      renderSuiviTabBar();
      renderSuiviActiveTab();
    });
  });
}

function renderSuiviActiveTab() {
  const tabs = state.settings.suiviTabs || [];
  const activeTab = tabs.find(t => t.id === window._suiviActiveTab);
  // Hide all panels
  ['tgh-tasks-panel', 'goals-panel', 'habits-panel', 'suivi-list-panel'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  if (!activeTab) return;
  switch (activeTab.type) {
    case 'tasks':
      document.getElementById('tgh-tasks-panel').style.display = '';
      renderTghTasks();
      break;
    case 'goals':
      document.getElementById('goals-panel').style.display = '';
      renderGoals();
      break;
    case 'habits':
      document.getElementById('habits-panel').style.display = '';
      renderHabits();
      break;
    case 'list':
      document.getElementById('suivi-list-panel').style.display = '';
      renderSuiviList(activeTab);
      break;
  }
}

function renderSuiviList(tab) {
  const el = document.getElementById('suivi-list-content');
  if (!el) return;
  const items = state.checklistItems.filter(i => !i.categoryId && i.tabId === tab.id);
  let html = `<div class="section-header"><div class="section-title">📋 ${esc(tab.label)}</div></div>`;
  html += `<div style="display:flex;gap:6px;margin-bottom:12px">
    <input type="text" id="suivi-checklist-input-${tab.id}" placeholder="Nouvel élément..." style="flex:1;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg2);color:var(--text)">
    <button class="btn btn-sm" onclick="addSuiviChecklistItem('${tab.id}')">+</button>
  </div>`;
  if (items.length) {
    html += items.map(i => `
      <div class="cat-page-task${i.done ? ' done' : ''}" style="max-width:500px">
        <button class="task-check-sm" onclick="toggleChecklistItem('${i.id}')">${i.done ? '✓' : ''}</button>
        <span class="cat-page-task-title">${esc(i.text)}</span>
        <button class="btn btn-ghost btn-xs" onclick="deleteChecklistItem('${i.id}')" style="margin-left:auto">×</button>
      </div>`).join('');
  } else {
    html += '<div class="empty-state" style="padding:12px 0"><p>No items yet</p></div>';
  }
  el.innerHTML = html;
}

async function addSuiviChecklistItem(tabId) {
  const input = document.getElementById('suivi-checklist-input-' + tabId);
  if (!input || !input.value.trim()) return;
  const id = uid();
  const data = { id, categoryId: null, tabId, text: input.value.trim(), done: false, createdAt: Date.now() };
  state.checklistItems.push(data);
  await saveDoc('checklistItems', id, data);
  renderSuiviActiveTab();
}

function openAddSuiviTabModal(availableTypes) {
  openModal({
    title: 'Ajouter un onglet au Suivi',
    fields: [
      { name: 'type', label: 'Type d\'onglet', type: 'select', options: availableTypes },
      { name: 'label', label: 'Label (optionnel)', placeholder: 'e.g. My List' }
    ],
    submit: 'Add',
    onSubmit: async v => {
      if (!state.settings.suiviTabs) state.settings.suiviTabs = [];
      let tabId = uid();
      if (v.type === 'list') {
        const existingIds = new Set(state.settings.suiviTabs.map(t => t.id));
        const orphan = state.checklistItems.find(i => !i.categoryId && !existingIds.has(i.tabId));
        if (orphan) tabId = orphan.tabId;
      }
      const tab = { id: tabId, type: v.type, label: v.label || ({ tasks: '☑️ Tasks', goals: '🎯 Goals', habits: '🔥 Habits', list: '📋 Liste' })[v.type] || v.type };
      state.settings.suiviTabs.push(tab);
      await saveProfile({ suiviTabs: state.settings.suiviTabs });
      window._suiviActiveTab = tab.id;
      renderSuiviTabBar();
      renderSuiviActiveTab();
    }
  });
}

function removeSuiviTab(tabId) {
  const tabs = state.settings.suiviTabs || [];
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;
  let contentWarning = '';
  if (tab.type === 'tasks') {
    const cnt = state.tasks.length;
    if (cnt) contentWarning = `Cet onglet contient ${cnt} tâche${cnt > 1 ? 's' : ''} — elles ne seront pas supprimées, juste masquées tant que l'onglet n'est pas réajouté.`;
  } else if (tab.type === 'goals') {
    const cnt = state.goals.length;
    if (cnt) contentWarning = `Cet onglet contient ${cnt} objectif${cnt > 1 ? 's' : ''} — ils ne seront pas supprimés, juste masqués tant que l'onglet n'est pas réajouté.`;
  } else if (tab.type === 'habits') {
    const cnt = state.habits.length;
    if (cnt) contentWarning = `Cet onglet contient ${cnt} habitude${cnt > 1 ? 's' : ''} — elles ne seront pas supprimées, juste masquées tant que l'onglet n'est pas réajouté.`;
  } else if (tab.type === 'list') {
    const cnt = state.checklistItems.filter(i => !i.categoryId && i.tabId === tabId).length;
    if (cnt) contentWarning = `Cet onglet contient ${cnt} élément${cnt > 1 ? 's' : ''} de liste — ils ne seront pas supprimés, juste masqués tant que l'onglet n'est pas réajouté.`;
  }
  const sub = `"${esc(tab.label)}" sera masqué. ${contentWarning}`;
  openModal({
    title: 'Supprimer l\'onglet ?',
    sub,
    fields: [],
    submit: 'Supprimer',
    onSubmit: async () => {
      state.settings.suiviTabs = tabs.filter(t => t.id !== tabId);
      await saveProfile({ suiviTabs: state.settings.suiviTabs });
      if (window._suiviActiveTab === tabId) window._suiviActiveTab = state.settings.suiviTabs.length ? state.settings.suiviTabs[0].id : null;
      renderSuiviTabBar();
      renderSuiviActiveTab();
    }
  });
}

document.getElementById('add-habit-btn').addEventListener('click', openAddHabitModal);

// ─── TGH tasks tab ──────────────────────────────────────────
let tghTaskTab = 'today', tghTaskAreaFilter = 'all', tghTaskSearch = '';

document.getElementById('tgh-add-task-btn').addEventListener('click', () => openAddTaskModal());

document.getElementById('tgh-task-search').addEventListener('input', e => {
  tghTaskSearch = e.target.value.toLowerCase();
  renderTghTasks();
});

document.querySelectorAll('#tgh-tasks-panel .view-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#tgh-tasks-panel .view-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    tghTaskTab = btn.dataset.tab;
    renderTghTasks();
  });
});

document.querySelectorAll('#tgh-tasks-area-filter .area-filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#tgh-tasks-area-filter .area-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    tghTaskAreaFilter = btn.dataset.area;
    renderTghTasks();
  });
});

function renderTghTasks() {
  const today = dk();
  const allTasks = [...state.tasks];
  const undatedTasks = allTasks.filter(t => !t.dueDate && !t.done);
  let tasks = allTasks.filter(t => t.dueDate);

  if (tghTaskTab === 'today') tasks = tasks.filter(t => !t.done && t.dueDate <= today);
  if (tghTaskTab === 'upcoming') tasks = tasks.filter(t => !t.done && t.dueDate > today);
  if (tghTaskAreaFilter !== 'all') tasks = tasks.filter(t => t.area === tghTaskAreaFilter);
  if (tghTaskSearch) tasks = tasks.filter(t => t.title.toLowerCase().includes(tghTaskSearch));

  const el = document.getElementById('tgh-task-list');
  if (!tasks.length && !undatedTasks.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">☑️</div><p>No tasks here.</p><small>Add a task or adjust filters.</small></div>`;
    return;
  }

  tasks.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  function tghTaskCardHtml(t) {
    const overdue = !t.done && t.dueDate && t.dueDate < today;
    const catId = getTaskCategoryId(t);
    const catTag = catId ? getCategoryPathString(catId) : '';
    return `<div class="task-card${t.done ? ' done' : ''}" data-id="${t.id}">
      <button class="task-check" onclick="toggleTask('${t.id}'); renderTghTasks()" aria-label="Toggle task">
        <span class="task-check-mark">✓</span>
      </button>
      <div class="task-body" onclick="openAddTaskModal('', null, state.tasks.find(x=>x.id==='${t.id}'))" style="cursor:pointer">
        <div class="task-title">${esc(t.title)}</div>
        <div class="task-meta">
          ${t.dueDate ? `<span class="task-due${overdue ? ' overdue' : ''}">${overdue ? '⚠ ' : ''}${relativeDay(t.dueDate)}</span>` : ''}
          ${t.duration ? `<span class="task-duration">⏱ ${t.duration}m</span>` : ''}
          ${t.priority ? `<span class="pri-badge ${t.priority}">${t.priority}</span>` : ''}
          ${catTag ? `<span class="cat-module-tag">${esc(catTag)}</span>` : ''}
        </div>
      </div>
      <div class="task-actions">
        ${!t.done ? `<button class="task-timer-btn${t.timerRunning ? ' running' : ''}" onclick="startTaskTimer('${t.id}')" title="Start timer">▶</button>` : ''}
        <button class="task-del-btn" onclick="deleteTask('${t.id}'); renderTghTasks()" aria-label="Delete">×</button>
      </div>
    </div>`;
  }

  // Group by parent Goal
  const groups = {};
  tasks.forEach(t => {
    let goalName = 'No Goal';
    if (t.goalId) {
      const goal = state.goals.find(g => g.id === t.goalId);
      if (goal) goalName = goal.title;
    }
    if (!groups[goalName]) groups[goalName] = [];
    groups[goalName].push(t);
  });

  const goalOrder = [...state.goals.map(g => g.title), 'No Goal'];
  const sortedGroups = Object.keys(groups).sort((a, b) => {
    const ia = goalOrder.indexOf(a);
    const ib = goalOrder.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  let html = sortedGroups.map(goalName => `
    <div class="tgh-cat-group">
      <div class="tgh-cat-group-title">🎯 ${esc(goalName)} (${groups[goalName].length})</div>
      ${groups[goalName].map(t => tghTaskCardHtml(t)).join('')}
    </div>`).join('');

  if (undatedTasks.length) {
    html += `<div class="task-section-nodate" style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border)">
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">📅 Sans date — ajoute une date pour voir cette tâche dans le calendrier</div>
      ${undatedTasks.map(t => tghTaskCardHtml(t)).join('')}
    </div>`;
  }

  el.innerHTML = html;
}

function renderHabits() {
  const el = document.getElementById('habits-list');
  if (!state.habits.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🔥</div><p>No habits yet</p><small>Small daily habits compound into big results</small></div>`;
    return;
  }
  el.innerHTML = state.habits.map(h => {
    const streak = calcStreak(h.checkIns || []);
    const checkIns = h.checkIns || [];
    const hp = computeHabitProgress(h);
    const catId = getHabitCategoryId(h);
    const catTag = catId ? getCategoryPathString(catId) : '';
    return `<div class="habit-section">
      <div class="habit-header">
        <div class="habit-name" onclick="openAddHabitModal(state.habits.find(x=>x.id==='${h.id}'))" style="cursor:pointer">${esc(h.name)}</div>
        ${catTag ? `<span class="cat-module-tag">${esc(catTag)}</span>` : ''}
        ${streak > 0 ? `<div class="streak-badge">🔥 ${streak} day streak</div>` : ''}
        <button onclick="deleteHabit('${h.id}')" style="color:var(--text-muted);font-size:16px;padding:4px">×</button>
      </div>
      <div class="heatmap-wrap">
        <div class="heatmap-grid" id="heatmap-${h.id}"></div>
      </div>
      <div style="margin-top:8px; display:flex; gap:8px; align-items:center; flex-wrap:wrap">
        <span style="font-size:12px; color:var(--text-muted)">${checkIns.length} total check-ins</span>
        <span style="font-size:12px; color:var(--accent-light)">${hp.mode === 'deadline' ? `⏳ ${Math.round(hp.progress * 100)}% to deadline (${h.deadline})` : `📊 ${Math.round(hp.progress * 100)}% consistency (30d)`}</span>
      </div>
    </div>`;
  }).join('');

  state.habits.forEach(h => {
    const grid = document.getElementById(`heatmap-${h.id}`);
    if (grid) renderHeatmap(grid, h.checkIns || []);
  });
}

function renderHeatmap(container, checkIns) {
  const weeks = 26; // 6 months
  const today = new Date();
  const cells = [];
  for (let w = weeks - 1; w >= 0; w--) {
    for (let d = 0; d < 7; d++) {
      const date = new Date(today);
      date.setDate(today.getDate() - (w * 7) - (6 - d));
      const key = dk(date);
      const done = checkIns.includes(key);
      cells.push({ key, done });
    }
  }
  container.innerHTML = cells.map(c => `<div class="heatmap-cell${c.done ? ' l4' : ''}" title="${c.key}"></div>`).join('');
}

function calcStreak(checkIns) {
  if (!checkIns.length) return 0;
  const sorted = [...checkIns].sort().reverse();
  let streak = 0, d = new Date();
  for (const ci of sorted) {
    if (ci === dk(d)) { streak++; d.setDate(d.getDate() - 1); }
    else if (ci < dk(d)) break;
  }
  return streak;
}

function computeHabitProgress(h) {
  const checkIns = h.checkIns || [];
  if (h.deadline) {
    const startKey = h.createdAt ? dk(new Date(h.createdAt)) : dk();
    const todayKey = dk();
    const endKey = h.deadline < todayKey ? h.deadline : todayKey;
    const totalDaysWindow = Math.max(1, daysBetween(startKey, h.deadline));
    const completedCheckIns = checkIns.filter(c => c >= startKey && c <= endKey).length;
    return { progress: Math.min(1, completedCheckIns / totalDaysWindow), mode: 'deadline' };
  }
  const thirtyDaysAgo = dk(new Date(Date.now() - 30 * 86400000));
  const recent = checkIns.filter(c => c >= thirtyDaysAgo).length;
  return { progress: recent / 30, mode: 'rolling' };
}

async function toggleHabitToday(id) {
  const habit = state.habits.find(h => h.id === id);
  if (!habit) return;
  const today = dk();
  habit.checkIns = habit.checkIns || [];
  if (habit.checkIns.includes(today)) {
    habit.checkIns = habit.checkIns.filter(c => c !== today);
  } else {
    habit.checkIns.push(today);
    await logWin(`Habit: ${habit.name} ✓`, getHabitCategoryId(habit));
  }
  await saveDoc('habits', id, { checkIns: habit.checkIns });
  renderDashHabits();
  renderDashStats();
  if (currentView === 'sprint') renderSprint();
}

function openAddHabitModal(item = null, overrides = {}) {
  const editing = !!item;
  const goalOpts = buildGoalOptions(editing ? null : activeCategoryId || null);
  openModal({
    title: editing ? 'Edit Habit' : 'New Habit',
    sub: editing ? 'Update habit details' : 'A daily practice that moves you forward',
    fields: [
      { name: 'name', label: 'Habit Name', placeholder: 'e.g. 30-min walk', required: true, value: editing ? item.name : '' },
      { name: 'goalId', label: 'Goal (Parent)', type: 'select', required: true, value: editing ? (item.goalId || '') : (overrides.goalId || ''), options: goalOpts },
      { name: 'deadline', label: 'Target Date (optional)', type: 'date', value: editing ? (item.deadline || '') : '' }
    ],
    submit: editing ? 'Save Changes' : 'Add Habit',
    onSubmit: async v => {
      if (!v.goalId) {
        toast('Please select a parent goal — every habit must belong to a goal.', 'error', 4000);
        return;
      }
      if (editing) {
        Object.assign(item, { name: v.name, goalId: v.goalId, deadline: v.deadline || null });
        await saveDoc('habits', item.id, item);
      } else {
        const id = uid();
        const data = { id, name: v.name, goalId: v.goalId, checkIns: [], createdAt: Date.now(), deadline: v.deadline || null };
        state.habits.unshift(data);
        await saveDoc('habits', id, data);
      }
      const habitGoal = state.goals.find(g => g.id === v.goalId);
      if (habitGoal && habitGoal.categoryId) await ensureCategoryTabForType(habitGoal.categoryId, 'habits', '🔥 Habits');
      renderHabits();
      if (currentView === 'category' && activeCategoryId) renderCategoryContent();
      if (currentView === 'dashboard') renderDashHabits();
      if (currentView === 'sprint') renderSprint();
      rerenderGoalsList();
    }
  });
}

async function deleteHabit(id) {
  if (!confirm('Delete this habit?')) return;
  state.habits = state.habits.filter(h => h.id !== id);
  await deleteDoc('habits', id);
  renderHabits();
  renderDashHabits();
  if (currentView === 'sprint') renderSprint();
}

// ═══════════════════════════════════════════════════════════════
// JOURNAL
// ═══════════════════════════════════════════════════════════════
let journalDate = new Date();

document.getElementById('journal-prev').addEventListener('click', () => { journalDate.setDate(journalDate.getDate() - 1); renderJournal(); });
document.getElementById('journal-next').addEventListener('click', () => { journalDate.setDate(journalDate.getDate() + 1); renderJournal(); });

function renderJournal() {
  const key = dk(journalDate);
  const today = dk();
  const label = key === today ? 'Today' : journalDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  document.getElementById('journal-date-display').textContent = label;

  const entry = state.journal[key] || {};

  // Backward compat: old format stored a plain string in `text` or individual fields
  let morningVal = '', afternoonVal = '';
  if (entry.morning !== undefined) {
    morningVal = entry.morning;
    afternoonVal = entry.afternoon || '';
  } else if (typeof entry === 'string') {
    morningVal = entry;
  } else if (entry.text) {
    morningVal = entry.text;
  } else {
    // Legacy fields migration
    morningVal = [entry.morningFocus, entry.freeText].filter(Boolean).join('\n\n');
    afternoonVal = entry.eveningWell || '';
  }

  document.getElementById('journal-morning').value = morningVal;
  document.getElementById('journal-afternoon').value = afternoonVal;

  if (entry.morningMood) {
    document.getElementById('journal-mood-display').textContent = entry.morningMood;
    document.getElementById('journal-mood-label').textContent = `Mood logged · Energy ${entry.energy || '—'}/10`;
  } else {
    document.getElementById('journal-mood-display').textContent = '—';
    document.getElementById('journal-mood-label').textContent = 'No mood logged yet';
  }
}

async function saveJournalField(field) {
  const key = dk(journalDate);
  const existing = state.journal[key] || { id: key, date: key, createdAt: Date.now() };
  const val = document.getElementById(`journal-${field}`).value;
  existing[field] = val;
  existing.updatedAt = Date.now();
  state.journal[key] = existing;
  await saveDoc('journal', key, existing);
  const statusEl = document.getElementById(`journal-${field}-status`);
  if (statusEl) { statusEl.textContent = 'Saved ✓'; setTimeout(() => { statusEl.textContent = ''; }, 1500); }
}

document.getElementById('journal-morning').addEventListener('blur', () => saveJournalField('morning'));
document.getElementById('journal-afternoon').addEventListener('blur', () => saveJournalField('afternoon'));

// ═══════════════════════════════════════════════════════════════
// FAMILY MODE
// ═══════════════════════════════════════════════════════════════
function renderFamily() {
  renderBabyCountdown();
  renderFamilyBlocks();
  renderBabyMilestones();
  renderFamilyScore();
  renderRecipes();
  renderMealPlan();
}

function renderBabyCountdown() {
  const dueDate = state.settings.babyDueDate;
  if (!dueDate) {
    document.getElementById('family-countdown').textContent = '— days';
    document.getElementById('family-countdown-label').textContent = 'Set your baby\'s due date in settings';
    return;
  }
  const due = new Date(dueDate);
  const diff = Math.ceil((due - new Date()) / 86400000);
  document.getElementById('family-countdown').textContent = diff > 0 ? `${diff} days` : 'Baby has arrived! 🎉';
  document.getElementById('family-countdown-label').textContent = diff > 0
    ? `until your baby's due date (${due.toLocaleDateString()})`
    : 'Congratulations on your new arrival!';
}

function renderFamilyBlocks() {
  const el = document.getElementById('family-blocks-list');
  const blocks = state.familyBlocks.filter(b => b.area === 'family' || b.protected);
  if (!blocks.length) {
    el.innerHTML = `<div class="empty-state" style="padding:20px 0"><p>No protected family time blocks yet.</p></div>`;
    return;
  }
  el.innerHTML = blocks.map(b => `
    <div class="family-block-item" style="margin-bottom:8px; cursor:pointer" onclick="openEditFamilyBlock('${b.id}')">
      <div class="family-block-icon">🔒</div>
      <div class="family-block-info">
        <div class="family-block-title">${esc(b.title)}</div>
        <div class="family-block-time">${b.date || 'Daily'} · ${b.startTime || '—'} – ${b.endTime || '—'}</div>
      </div>
      <span class="protected-badge">PROTECTED</span>
      <button onclick="event.stopPropagation(); deleteFamilyBlock('${b.id}')" style="color:var(--text-muted);margin-left:8px;font-size:16px">×</button>
    </div>`).join('');
}

document.getElementById('add-family-block-btn').addEventListener('click', () => {
  openModal({
    title: 'Add Protected Time',
    sub: 'Sacred family time that cannot be moved',
    fields: [
      { name: 'title', label: 'Block Title', placeholder: 'e.g. Family dinner', required: true },
      { name: 'date', label: 'Date', type: 'date' },
      { name: 'startTime', label: 'Start Time', type: 'time', placeholder: '18:00' },
      { name: 'endTime', label: 'End Time', type: 'time', placeholder: '20:00' },
      { name: 'recurring', label: 'Recurring Daily?', type: 'select', options: [['false', 'No'], ['true', 'Yes']] }
    ],
    submit: 'Protect This Time',
    onSubmit: async v => {
      const id = uid();
      const data = { id, title: v.title, date: v.date, startTime: v.startTime, endTime: v.endTime, area: 'family', recurring: v.recurring === 'true', protected: true, createdAt: Date.now() };
      state.familyBlocks.push(data);
      await saveDoc('familyBlocks', id, data);
      renderFamily();
      if (currentView === 'dashboard') renderDashFamilyBlocks();
    }
  });
});

async function deleteFamilyBlock(id) {
  state.familyBlocks = state.familyBlocks.filter(b => b.id !== id);
  await deleteDoc('familyBlocks', id);
  renderFamily();
}

function openEditFamilyBlock(id) {
  const block = state.familyBlocks.find(b => b.id === id);
  if (!block) return;
  openModal({
    title: 'Edit Protected Time',
    fields: [
      { name: 'title', label: 'Block Title', required: true, value: block.title },
      { name: 'date', label: 'Date', type: 'date', value: block.date || '' },
      { name: 'startTime', label: 'Start Time', type: 'time', value: block.startTime || '' },
      { name: 'endTime', label: 'End Time', type: 'time', value: block.endTime || '' },
      { name: 'recurring', label: 'Recurring Daily?', type: 'select', value: block.recurring ? 'true' : 'false', options: [['false', 'No'], ['true', 'Yes']] }
    ],
    submit: 'Save Changes',
    onSubmit: async v => {
      Object.assign(block, { title: v.title, date: v.date, startTime: v.startTime, endTime: v.endTime, recurring: v.recurring === 'true' });
      await saveDoc('familyBlocks', block.id, block);
      renderFamily();
      if (currentView === 'dashboard') renderDashFamilyBlocks();
    }
  });
}

function renderBabyMilestones() {
  const el = document.getElementById('baby-milestones-list');
  const milestones = state.babyMilestones;
  if (!milestones.length) {
    el.innerHTML = `<div class="empty-state" style="padding:20px 0"><p>Baby milestone checklist will appear after onboarding.</p></div>`;
    return;
  }
  el.innerHTML = milestones.map(m => `
    <div class="milestone-row">
      <div class="milestone-check-box${m.done ? ' done' : ''}" onclick="toggleBabyMilestone('${m.id}')">${m.done ? '✓' : ''}</div>
      <div class="milestone-row-text${m.done ? ' done' : ''}">${esc(m.text)}</div>
    </div>`).join('');
}

async function toggleBabyMilestone(id) {
  const m = state.babyMilestones.find(m => m.id === id);
  if (!m) return;
  m.done = !m.done;
  await saveDoc('babyMilestones', id, { done: m.done });
  renderBabyMilestones();
}

function renderFamilyScore() {
  const today = dk();
  const startOfWeek = new Date(); startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const weekBlocks = state.familyBlocks.filter(b => b.date >= dk(startOfWeek) && (b.area === 'family' || b.protected));
  const scored = weekBlocks.length;
  const total = 7; // target per week
  const pct = Math.min(100, Math.round((scored / total) * 100));

  const r = 50, circ = 2 * Math.PI * r;
  const fill = circ * (pct / 100);
  document.getElementById('family-score-ring').innerHTML = `
    <svg width="120" height="120" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--surface3)" stroke-width="10"/>
      <circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--family)" stroke-width="10"
        stroke-linecap="round" stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${(circ - fill).toFixed(2)}"
        transform="rotate(-90 60 60)"/>
      <text x="60" y="56" text-anchor="middle" font-size="22" font-weight="800" fill="var(--family)" font-family="Inter">${pct}%</text>
      <text x="60" y="72" text-anchor="middle" font-size="11" fill="var(--text-muted)" font-family="Inter">family score</text>
    </svg>`;
  document.getElementById('family-score-legend').innerHTML = `
    <div class="family-score-legend-item"><div class="legend-color" style="background:var(--family)"></div>${scored} of ${total} target blocks this week</div>
    <div class="family-score-legend-item"><div class="legend-color" style="background:var(--success)"></div>Protected time: ${state.familyBlocks.filter(b => b.protected).length} blocks</div>
  `;
}

// ─── FAMILY SUB-TABS ────────────────────────────────────────
function initFamilyTabs() {
  const tabs = [
    { btn: 'family-tab-blocks', panel: 'family-panel-blocks' },
    { btn: 'family-tab-baby', panel: 'family-panel-baby' },
    { btn: 'family-tab-meals', panel: 'family-panel-meals' }
  ];
  tabs.forEach(({ btn, panel }) => {
    document.getElementById(btn).addEventListener('click', () => {
      tabs.forEach(t => {
        document.getElementById(t.btn).classList.remove('active');
        document.getElementById(t.panel).style.display = 'none';
      });
      document.getElementById(btn).classList.add('active');
      document.getElementById(panel).style.display = '';
    });
  });
}
initFamilyTabs();

// ─── RECIPES ────────────────────────────────────────────────
function renderRecipes() {
  const el = document.getElementById('recipes-list');
  if (!state.recipes.length) {
    el.innerHTML = `<div class="empty-state" style="padding:20px 0"><p>No recipes yet.</p><small>Add your first recipe to start planning meals.</small></div>`;
    return;
  }
  el.innerHTML = state.recipes.map(r => {
    const ingCount = (r.ingredients || []).length;
    return `<div class="recipe-card" onclick="openRecipeModal(state.recipes.find(x=>x.id==='${r.id}'))" style="cursor:pointer">
      <div class="recipe-name">${esc(r.name)}</div>
      <div class="recipe-meta">${ingCount} ingredient${ingCount !== 1 ? 's' : ''}</div>
      <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); deleteRecipe('${r.id}')" style="margin-left:auto">✕</button>
    </div>`;
  }).join('');
}

function openRecipeModal(item = null) {
  const editing = !!item;
  openModal({
    title: editing ? 'Edit Recipe' : 'New Recipe',
    sub: 'One ingredient per line: name, amount, unit',
    fields: [
      { name: 'name', label: 'Recipe Name', required: true, placeholder: 'e.g. Pasta Bolognese', value: editing ? item.name : '' },
      { name: 'ingredients', label: 'Ingredients (one per line)', type: 'textarea', placeholder: 'ground beef, 500, g\nonion, 1, piece\nolive oil, 2, tbsp', value: editing ? item.ingredients.map(i => `${i.name}, ${i.amount}, ${i.unit}`).join('\n') : '' }
    ],
    submit: editing ? 'Save Changes' : 'Add Recipe',
    onSubmit: async v => {
      const ingredients = v.ingredients.split('\n').filter(l => l.trim()).map(line => {
        const parts = line.split(',').map(s => s.trim());
        return { name: parts[0] || '', amount: parseFloat(parts[1]) || 0, unit: parts[2] || 'pcs' };
      });
      if (editing) {
        Object.assign(item, { name: v.name, ingredients });
        await saveDoc('recipes', item.id, item);
      } else {
        const id = uid();
        const data = { id, name: v.name, ingredients, createdAt: Date.now() };
        state.recipes.unshift(data);
        await saveDoc('recipes', id, data);
      }
      renderRecipes();
    }
  });
}

async function deleteRecipe(id) {
  if (!confirm('Delete this recipe?')) return;
  state.recipes = state.recipes.filter(r => r.id !== id);
  await deleteDoc('recipes', id);
  renderRecipes();
}

document.getElementById('add-recipe-btn').addEventListener('click', () => openRecipeModal());

// ─── MEAL PLAN ──────────────────────────────────────────────
const MEAL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const MEAL_DAY_LABELS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
const MEAL_SLOTS = ['midi', 'soir'];
const MEAL_SLOT_LABELS = { midi: 'Lunch', soir: 'Dinner' };

function renderMealPlan() {
  const el = document.getElementById('meal-plan-list');
  el.innerHTML = MEAL_DAYS.map(day => {
    const dayMeals = MEAL_SLOTS.map(slot => {
      const meal = state.mealPlan.find(m => m.day === day && m.repas === slot);
      const recipe = meal ? state.recipes.find(r => r.id === meal.recipeId) : null;
      return `<div class="meal-slot">
        <span class="meal-slot-label">${MEAL_SLOT_LABELS[slot]}</span>
        ${recipe ? `<span class="meal-slot-recipe" onclick="openMealPlanModal('${day}','${slot}')" style="cursor:pointer">${esc(recipe.name)}</span>` : `<button class="btn btn-ghost btn-sm" onclick="openMealPlanModal('${day}','${slot}')">+</button>`}
      </div>`;
    }).join('');
    return `<div class="meal-day"><div class="meal-day-label">${MEAL_DAY_LABELS[day]}</div>${dayMeals}</div>`;
  }).join('');
}

function openMealPlanModal(day, repas) {
  const existing = state.mealPlan.find(m => m.day === day && m.repas === repas);
  const options = state.recipes.map(r => [r.id, r.name]);
  if (!options.length) {
    toast('Add a recipe first before planning meals', 'info');
    return;
  }
  openModal({
    title: `${MEAL_DAY_LABELS[day]} — ${MEAL_SLOT_LABELS[repas]}`,
    fields: [
      { name: 'recipeId', label: 'Recipe', type: 'select', options, value: existing ? existing.recipeId : options[0][0] }
    ],
    submit: 'Save',
    onSubmit: async v => {
      if (existing) {
        existing.recipeId = v.recipeId;
        await saveDoc('mealPlan', existing.id, existing);
      } else {
        const id = uid();
        const data = { id, day, recipeId: v.recipeId, repas, createdAt: Date.now() };
        state.mealPlan.push(data);
        await saveDoc('mealPlan', id, data);
      }
      renderMealPlan();
    }
  });
}

// ─── GROCERY LIST ───────────────────────────────────────────
function generateGroceryList() {
  const container = document.getElementById('grocery-list-container');
  const el = document.getElementById('grocery-list');
  const aggregated = {};

  state.mealPlan.forEach(mp => {
    const recipe = state.recipes.find(r => r.id === mp.recipeId);
    if (!recipe) return;
    (recipe.ingredients || []).forEach(ing => {
      const key = `${ing.name.toLowerCase()}|${ing.unit.toLowerCase()}`;
      if (!aggregated[key]) aggregated[key] = { name: ing.name, amount: 0, unit: ing.unit };
      aggregated[key].amount += ing.amount;
    });
  });

  const items = Object.values(aggregated).sort((a, b) => a.name.localeCompare(b.name));
  if (!items.length) {
    el.innerHTML = `<div class="empty-state" style="padding:20px 0"><p>No planned meals this week.</p></div>`;
    container.style.display = '';
    return;
  }
  el.innerHTML = `<div class="grocery-items">${items.map(i =>
    `<div class="grocery-item"><span class="grocery-check" onclick="this.classList.toggle('done')"></span><span>${esc(i.name)}</span><span class="grocery-qty">${i.amount} ${i.unit}</span></div>`
  ).join('')}</div>`;
  container.style.display = '';
  toast('Grocery list generated!', 'success');
}

document.getElementById('gen-grocery-btn').addEventListener('click', generateGroceryList);

// ═══════════════════════════════════════════════════════════════
// LIFE AREAS
// ═══════════════════════════════════════════════════════════════
const AREA_COLORS = { family: '#FF6B6B', career: '#4ECDC4', growth: '#FFE66D', finance: '#4D96FF' };

// ═══════════════════════════════════════════════════════════════
// TIME AUDIT
// ═══════════════════════════════════════════════════════════════
let timeChartInstance = null;

function renderTimeAudit() {
  const today = dk();
  const todayEntries = state.timeEntries.filter(e => e.date === today);
  const totalEstimated = todayEntries.reduce((s, e) => s + (e.estimatedMin || 0), 0);
  const totalActual = todayEntries.reduce((s, e) => s + (e.actualMin || 0), 0);
  const accuracy = totalEstimated > 0 ? Math.round((Math.min(totalActual, totalEstimated) / totalEstimated) * 100) : 0;

  document.getElementById('audit-estimated').textContent = totalEstimated > 0 ? formatMin(totalEstimated) : '—';
  document.getElementById('audit-actual').textContent = totalActual > 0 ? formatMin(totalActual) : '—';
  document.getElementById('audit-accuracy').textContent = totalEstimated > 0 ? `${accuracy}%` : '—';

  // Today's entries by root category
  const catGroups = {};
  todayEntries.forEach(e => {
    let rootName = 'Non catégorisé';
    if (e.categoryId) {
      const root = getCategoryRoot(e.categoryId);
      if (root) rootName = (root.icon || '') + ' ' + root.name;
    }
    if (!catGroups[rootName]) catGroups[rootName] = { count: 0, actual: 0, estimated: 0 };
    catGroups[rootName].count++;
    catGroups[rootName].actual += e.actualMin || 0;
    catGroups[rootName].estimated += e.estimatedMin || 0;
  });
  const catKeys = Object.keys(catGroups);
  if (catKeys.length) {
    document.getElementById('audit-cat-breakdown').style.display = '';
    document.getElementById('audit-cat-breakdown').innerHTML = '<div class="card-label" style="margin-bottom:8px">Today by category</div>'
      + catKeys.map(k => `<div class="audit-cat-row"><span>${k}</span><span>${formatMin(catGroups[k].actual)}</span></div>`).join('');
  } else {
    document.getElementById('audit-cat-breakdown').style.display = 'none';
  }

  // Weekly chart
  const days = [], estData = [], actData = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = dk(d);
    const entries = state.timeEntries.filter(e => e.date === key);
    days.push(d.toLocaleDateString(undefined, { weekday: 'short' }));
    estData.push(entries.reduce((s, e) => s + (e.estimatedMin || 0), 0));
    actData.push(entries.reduce((s, e) => s + (e.actualMin || 0), 0));
  }

  const ctx = document.getElementById('time-chart');
  if (timeChartInstance) timeChartInstance.destroy();
  timeChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: days,
      datasets: [
        { label: 'Estimated (min)', data: estData, backgroundColor: 'rgba(108,99,255,.4)', borderColor: '#6C63FF', borderWidth: 1, borderRadius: 4 },
        { label: 'Actual (min)', data: actData, backgroundColor: 'rgba(107,203,119,.4)', borderColor: '#6BCB77', borderWidth: 1, borderRadius: 4 }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: 'rgba(255,255,255,.6)', font: { family: 'Inter' } } } },
      scales: {
        x: { ticks: { color: 'rgba(255,255,255,.5)' }, grid: { color: 'rgba(255,255,255,.05)' } },
        y: { ticks: { color: 'rgba(255,255,255,.5)' }, grid: { color: 'rgba(255,255,255,.05)' } }
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// WINS LOG
// ═══════════════════════════════════════════════════════════════
async function logWin(text, categoryId = null) {
  const id = uid();
  const data = { id, text, categoryId, createdAt: Date.now(), date: dk() };
  state.wins.unshift(data);
  await saveDoc('wins', id, data);
  if (currentView === 'wins') renderWins();
}

function renderWins() {
  const el = document.getElementById('wins-list');
  if (!state.wins.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🏆</div><p>No wins yet</p><small>Complete tasks and habits to log wins automatically</small></div>`;
    return;
  }
  const groups = {};
  state.wins.slice(0, 50).forEach(w => {
    let rootName = 'Non catégorisé';
    if (w.categoryId) {
      const root = getCategoryRoot(w.categoryId);
      if (root) rootName = (root.icon || '') + ' ' + root.name;
    }
    if (!groups[rootName]) groups[rootName] = [];
    groups[rootName].push(w);
  });
  const rootOrder = ['Family', 'Growth', 'Career', 'Finance', 'Non catégorisé'];
  const sorted = Object.keys(groups).sort((a, b) => {
    const ia = rootOrder.findIndex(r => a.includes(r));
    const ib = rootOrder.findIndex(r => b.includes(r));
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  const trophies = ['🏆', '🥇', '🎯', '✅', '⭐', '💪', '🚀'];
  el.innerHTML = sorted.map(rootName => `
    <div class="tgh-cat-group">
      <div class="tgh-cat-group-title">${rootName} (${groups[rootName].length})</div>
      ${groups[rootName].map((w, i) => `
        <div class="win-item">
          <div class="win-emoji">${trophies[i % trophies.length]}</div>
          <div class="win-text">${esc(w.text)}</div>
          <div class="win-time">${new Date(w.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${w.date}</div>
        </div>`).join('')}
    </div>`).join('');
}

// ═══════════════════════════════════════════════════════════════
// GENERIC MODAL
// ═══════════════════════════════════════════════════════════════
function openModal({ title, sub, fields, submit, customBody, onSubmit }) {
  const box = document.getElementById('modal-box');
  box.innerHTML = `
    <div class="modal-title">${esc(title)}</div>
    ${sub ? `<div class="modal-sub">${esc(sub)}</div>` : ''}
    ${customBody || ''}
    <form id="generic-form">
      ${(fields || []).map(f => buildField(f)).join('')}
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="modal-cancel-btn">Cancel</button>
        <button type="submit" class="btn">${esc(submit || 'Submit')}</button>
      </div>
    </form>`;

  box.querySelector('#modal-cancel-btn').addEventListener('click', closeModal);
  box.querySelector('#generic-form').addEventListener('submit', e => {
    e.preventDefault();
    const vals = {};
    (fields || []).forEach(f => {
      const el = box.querySelector(`#mf-${f.name}`);
      if (el) vals[f.name] = el.value;
    });
    if (onSubmit) onSubmit(vals);
    closeModal();
  });

  document.getElementById('modal-overlay').classList.add('open');
  setTimeout(() => { const first = box.querySelector('input,textarea,select'); if (first) first.focus(); }, 80);
}

function buildField(f) {
  const id = `mf-${f.name}`;
  let input = '';
  if (f.type === 'textarea') {
    input = `<textarea id="${id}" placeholder="${esc(f.placeholder || '')}">${esc(f.value || '')}</textarea>`;
  } else if (f.type === 'select') {
    input = `<select id="${id}">${(f.options || []).map(([v, l]) => `<option value="${esc(v)}"${v === (f.value || '') ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  } else {
    input = `<input type="${f.type || 'text'}" id="${id}" placeholder="${esc(f.placeholder || '')}" value="${esc(f.value || '')}" ${f.required ? 'required' : ''}>`;
  }
  return `<div class="modal-field"><label for="${id}">${esc(f.label)}</label>${input}</div>`;
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ═══════════════════════════════════════════════════════════════
// HOURLY TIME ANCHOR NUDGE (gentle reminder)
// ═══════════════════════════════════════════════════════════════
function startHourlyNudge() {
  const now = new Date();
  const msUntilNextHour = (60 - now.getMinutes()) * 60000 - now.getSeconds() * 1000;
  setTimeout(() => {
    hourlyNudge();
    setInterval(hourlyNudge, 3600000);
  }, msUntilNextHour);
}

function hourlyNudge() {
  const hour = new Date().getHours();
  if (hour >= 7 && hour <= 22) {
    toast(`⏰ Hour check-in — it's ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. How's your focus?`, 'info', 5000);
    // Vibrate if supported
    if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
  }
}

// ═══════════════════════════════════════════════════════════════
// END-OF-DAY PROMPT
// ═══════════════════════════════════════════════════════════════
function checkEndOfDay() {
  const hour = new Date().getHours();
  if (hour === 20) { // 8pm
    const j = state.journal[dk()];
    if (!j?.eveningDone) {
      setTimeout(() => openRitual('evening'), 2000);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// HOBBIES
// ═══════════════════════════════════════════════════════════════
let currentHobbyId = null;

function renderHobbies() {
  showHobbiesList();
  const el = document.getElementById('hobbies-list');
  if (!state.habits.length && !state.hobbies.length) {
    // show empty only for hobbies
  }
  if (!state.hobbies.length) {
    el.innerHTML = `<div class="empty-state" style="padding:40px 0"><div class="empty-icon">🎨</div><p>No hobbies yet</p><small>Add a hobby to start tracking your passions.</small></div>`;
    return;
  }
  el.innerHTML = state.hobbies.map(h => {
    const objCount = (h.objectives || []).length;
    const avgProgress = objCount ? Math.round(h.objectives.reduce((s, o) => s + (o.progress || 0), 0) / objCount) : 0;
    return `<div class="hobby-card" onclick="openHobbyDetail('${h.id}')" style="cursor:pointer">
      <div class="hobby-card-name">${esc(h.name)}</div>
      <div class="hobby-card-meta">${objCount} objective${objCount !== 1 ? 's' : ''} · ${avgProgress}% avg</div>
      <div class="hobby-card-bar"><div class="hobby-card-bar-fill" style="width:${avgProgress}%"></div></div>
      <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); deleteHobby('${h.id}')" style="margin-left:auto">✕</button>
    </div>`;
  }).join('');
}

function showHobbiesList() {
  document.getElementById('hobbies-list-view').style.display = '';
  document.getElementById('hobby-detail-view').style.display = 'none';
  currentHobbyId = null;
}

function openHobbyDetail(id) {
  const hobby = state.hobbies.find(h => h.id === id);
  if (!hobby) return;
  currentHobbyId = id;
  document.getElementById('hobbies-list-view').style.display = 'none';
  document.getElementById('hobby-detail-view').style.display = '';
  document.getElementById('hobby-detail-name').textContent = hobby.name;
  renderHobbyObjectives(hobby);
}

function renderHobbyObjectives(hobby) {
  const el = document.getElementById('hobby-objectives-list');
  const objs = hobby.objectives || [];
  if (!objs.length) {
    el.innerHTML = `<div class="empty-state" style="padding:30px 0"><p>No objectives yet.</p><small>Add objectives to track progress in this hobby.</small></div>`;
    return;
  }
  el.innerHTML = objs.map(o => `
    <div class="hobby-obj-card">
      <div class="hobby-obj-header">
        <div class="hobby-obj-title">${esc(o.title)}</div>
        <span class="hobby-obj-pct">${o.progress || 0}%</span>
        <button class="btn btn-ghost btn-sm" onclick="deleteHobbyObjective('${hobby.id}','${o.id}')" style="margin-left:8px">✕</button>
      </div>
      <div class="prog-track"><div class="prog-fill" style="width:${o.progress || 0}%"></div></div>
      <div style="display:flex;gap:6px;margin-top:8px">
        <button class="btn btn-ghost btn-sm" onclick="adjustHobbyObjective('${hobby.id}','${o.id}',-10)">−10</button>
        <button class="btn btn-ghost btn-sm" onclick="adjustHobbyObjective('${hobby.id}','${o.id}',10)">+10</button>
      </div>
    </div>`).join('');
}

function openHobbyModal(item = null) {
  const editing = !!item;
  openModal({
    title: editing ? 'Edit Hobby' : 'New Hobby',
    fields: [
      { name: 'name', label: 'Hobby Name', required: true, placeholder: 'e.g. Painting, Guitar, Cooking', value: editing ? item.name : '' }
    ],
    submit: editing ? 'Save Changes' : 'Add Hobby',
    onSubmit: async v => {
      if (editing) {
        Object.assign(item, { name: v.name });
        await saveDoc('hobbies', item.id, item);
      } else {
        const id = uid();
        const data = { id, name: v.name, objectives: [], createdAt: Date.now() };
        state.hobbies.unshift(data);
        await saveDoc('hobbies', id, data);
      }
      renderHobbies();
    }
  });
}

async function deleteHobby(id) {
  if (!confirm('Delete this hobby and all its objectives?')) return;
  state.hobbies = state.hobbies.filter(h => h.id !== id);
  await deleteDoc('hobbies', id);
  renderHobbies();
}

function addHobbyObjective() {
  const hobby = state.hobbies.find(h => h.id === currentHobbyId);
  if (!hobby) return;
  openModal({
    title: 'Add Objective',
    fields: [
      { name: 'title', label: 'Objective', required: true, placeholder: 'e.g. Learn 5 songs' }
    ],
    submit: 'Add',
    onSubmit: async v => {
      const obj = { id: uid(), title: v.title, progress: 0 };
      hobby.objectives = hobby.objectives || [];
      hobby.objectives.push(obj);
      await saveDoc('hobbies', hobby.id, hobby);
      renderHobbyObjectives(hobby);
    }
  });
}

async function adjustHobbyObjective(hobbyId, objId, delta) {
  const hobby = state.hobbies.find(h => h.id === hobbyId);
  if (!hobby) return;
  const obj = (hobby.objectives || []).find(o => o.id === objId);
  if (!obj) return;
  obj.progress = Math.max(0, Math.min(100, (obj.progress || 0) + delta));
  await saveDoc('hobbies', hobby.id, hobby);
  renderHobbyObjectives(hobby);
}

async function deleteHobbyObjective(hobbyId, objId) {
  const hobby = state.hobbies.find(h => h.id === hobbyId);
  if (!hobby) return;
  hobby.objectives = (hobby.objectives || []).filter(o => o.id !== objId);
  await saveDoc('hobbies', hobby.id, hobby);
  renderHobbyObjectives(hobby);
}

document.getElementById('add-hobby-btn').addEventListener('click', () => openHobbyModal());
document.getElementById('add-hobby-obj-btn').addEventListener('click', addHobbyObjective);

// ═══════════════════════════════════════════════════════════════
// CATEGORIES — Hierarchical tree system
// ═══════════════════════════════════════════════════════════════
let currentCategoryId = null; // null = root, otherwise shows that node's children + content

// ─── Category helpers ─────────────────────────────────────────
function getCategoryById(id) { return state.categories.find(c => c.id === id); }
function getCategoryChildren(parentId) {
  return state.categories.filter(c => c.parentId === parentId).sort((a, b) => (a.order || 0) - (b.order || 0));
}
function getCategoryPath(id) {
  const parts = [];
  let cat = getCategoryById(id);
  while (cat) { parts.unshift(cat.name); cat = cat.parentId ? getCategoryById(cat.parentId) : null; }
  return parts;
}
function getCategoryLabel(id) { return getCategoryPath(id).join(' > '); }
function getCategoryDepth(id) { return getCategoryPath(id).length; }
function getCategoryRoot(id) {
  let cat = getCategoryById(id);
  while (cat && cat.parentId) cat = getCategoryById(cat.parentId);
  return cat || null;
}
function buildCategoryOptions() {
  const opts = [['', 'None']];
  function walk(parentId, depth) {
    const children = getCategoryChildren(parentId);
    for (const c of children) {
      const prefix = '\u00A0\u00A0'.repeat(depth);
      opts.push([c.id, prefix + (c.icon ? c.icon + ' ' : '') + c.name]);
      walk(c.id, depth + 1);
    }
  }
  walk(null, 0);
  return opts;
}

// ─── Sidebar category accordion ───────────────────────────────
// Renders the dynamic category tree inside the sidebar (#sidebar-categories).
// Each root category (parentId === null) is shown as a clickable node.
// Children are shown/hidden based on expandedCategories set.
// Clicking a label navigates to that category's content AND expands its children.
// Clicking the chevron toggles expansion without navigating.
function renderSidebarCategories() {
  const el = document.getElementById('sidebar-categories');
  if (!el) return;
  const roots = getCategoryChildren(null);
  if (!roots.length) {
    el.innerHTML = `<div style="padding:4px 12px;font-size:12px;color:var(--text-muted)">No categories yet</div>`;
    return;
  }
  el.innerHTML = `<span class="sidebar-section-label">Categories</span>` + roots.map(cat => buildSidebarNode(cat, 0)).join('');
}

// Builds one category node + its expandable children for the sidebar.
// depth controls indentation (0 = root, 1 = first child, etc.)
function buildSidebarNode(cat, depth) {
  const children = getCategoryChildren(cat.id);
  const isExpanded = expandedCategories.has(cat.id);
  const isActive = activeCategoryId === cat.id;
  // Indentation: 12px base + 16px per depth level
  const pl = 12 + depth * 16;
  // Color left-border if the category has a custom color
  const colorBorder = cat.color ? `border-left:3px solid ${cat.color};` : '';
  // Build children HTML (hidden if not expanded)
  const childrenHtml = children.length
    ? `<div class="sidebar-cat-children" style="display:${isExpanded ? 'block' : 'none'}">${children.map(c => buildSidebarNode(c, depth + 1)).join('')}</div>`
    : '';

  return `<div class="sidebar-cat-node" data-cat-id="${cat.id}">
    <div class="sidebar-cat-row${isActive ? ' active' : ''}" style="padding-left:${pl}px;${colorBorder}">
      <!-- Chevron: toggles expansion without navigating -->
      <span class="sidebar-cat-chevron${isExpanded ? ' expanded' : ''}" onclick="event.stopPropagation(); toggleCategoryExpand('${cat.id}')">${children.length ? '›' : ''}</span>
      <!-- Label: navigates AND expands -->
      <span class="sidebar-cat-label" onclick="goToCategory('${cat.id}')">
        <span class="sidebar-cat-icon">${cat.icon || '📁'}</span>
        <span class="sidebar-cat-name">${esc(cat.name)}</span>
      </span>
      <!-- Hover actions: add child, edit, delete -->
      <span class="sidebar-cat-actions">
        <button class="sidebar-cat-action" onclick="event.stopPropagation(); openAddCategoryModal('${cat.id}')" title="Add sub-category">+</button>
        <button class="sidebar-cat-action" onclick="event.stopPropagation(); openEditCategoryModal('${cat.id}')" title="Edit">✎</button>
        <button class="sidebar-cat-action" onclick="event.stopPropagation(); deleteCategory('${cat.id}')" title="Delete">×</button>
      </span>
    </div>
    ${childrenHtml}
  </div>`;
}

// Toggles expansion of the Suivi accordion (fixed children).
let suiviExpanded = false;
function toggleSuiviExpand() {
  suiviExpanded = !suiviExpanded;
  const ch = document.getElementById('suivi-children');
  const cv = document.getElementById('suivi-chevron');
  if (ch) ch.style.display = suiviExpanded ? '' : 'none';
  if (cv) cv.classList.toggle('expanded', suiviExpanded);
}

// Toggles expansion of a category in the sidebar accordion.
// Does NOT navigate — only shows/hides children.
function toggleCategoryExpand(id) {
  if (expandedCategories.has(id)) expandedCategories.delete(id);
  else expandedCategories.add(id);
  renderSidebarCategories();
}

// Navigates to a category's content page AND expands it in the sidebar.
// The main area shows filtered tasks/goals/habits for this category.
// If id is null, goes back to dashboard.
function goToCategory(id) {
  if (!id) { activeCategoryId = null; goTo('dashboard'); return; }
  activeCategoryId = id;
  // Expand this node so children are visible
  expandedCategories.add(id);
  // Also expand all ancestors so the path is visible
  let cat = getCategoryById(id);
  while (cat && cat.parentId) {
    expandedCategories.add(cat.parentId);
    cat = getCategoryById(cat.parentId);
  }
  // Update sidebar highlighting
  renderSidebarCategories();
  // Update topbar title
  const path = getCategoryPath(id);
  document.getElementById('topbar-title').textContent = path.join(' > ');
  document.getElementById('topbar-sub').textContent = '';
  document.getElementById('topbar-actions').innerHTML = '';
  // Navigate to the category view
  currentView = 'category';
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-category'));
  document.querySelectorAll('.nav-btn[data-view]').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.bottom-nav-btn[data-view]').forEach(b => b.classList.remove('active'));
  document.getElementById('app').classList.remove('sidebar-open');
  renderView('category');
}

// ─── Category CRUD ────────────────────────────────────────────
function openAddCategoryModal(parentId = null) {
  openModal({
    title: parentId ? 'Add Sub-Category' : 'Add Root Category',
    sub: parentId ? `Inside "${esc(getCategoryById(parentId)?.name || '')}"` : 'Top-level category',
    fields: [
      { name: 'name', label: 'Name', required: true, placeholder: 'e.g. Family, Growth...' },
      { name: 'icon', label: 'Icon (emoji)', placeholder: 'e.g. 🏠' },
      { name: 'color', label: 'Color (hex or name)', placeholder: 'e.g. #FF6B6B or family' },
      { name: 'moduleType', label: 'Content Type', type: 'select', options: [['generic', 'Generic (tasks/goals/habits)'], ['meals', 'Meals (recipes + planning)'], ['finance-table', 'Finance Table (coming soon)'], ['dateIdeas', '🌹 Date Ideas (quiz + assistant)']] }
    ],
    submit: 'Add Category',
    onSubmit: async v => {
      if (!v.name) return;
      const siblings = getCategoryChildren(parentId);
      const id = uid();
      const data = {
        id, name: v.name, icon: v.icon || '', color: v.color || '',
        parentId: parentId || null, moduleType: v.moduleType || 'generic',
        order: siblings.length, createdAt: Date.now()
      };
      state.categories.push(data);
      await saveDoc('categories', id, data);
      renderSidebarCategories();
      if (activeCategoryId) renderCategoryContent();
    }
  });
}

function openEditCategoryModal(id) {
  const cat = getCategoryById(id);
  if (!cat) return;
  openModal({
    title: 'Edit Category',
    fields: [
      { name: 'name', label: 'Name', required: true, value: cat.name },
      { name: 'icon', label: 'Icon (emoji)', value: cat.icon || '' },
      { name: 'color', label: 'Color', value: cat.color || '' },
      { name: 'moduleType', label: 'Content Type', type: 'select', value: cat.moduleType || 'generic', options: [['generic', 'Generic (tasks/goals/habits)'], ['meals', 'Meals (recipes + planning)'], ['finance-table', 'Finance Table (coming soon)'], ['dateIdeas', '🌹 Date Ideas (quiz + assistant)']] }
    ],
    submit: 'Save Changes',
    onSubmit: async v => {
      Object.assign(cat, { name: v.name, icon: v.icon || '', color: v.color || '', moduleType: v.moduleType || 'generic' });
      await saveDoc('categories', id, cat);
      renderSidebarCategories();
      if (activeCategoryId) renderCategoryContent();
    }
  });
}

async function deleteCategory(id) {
  const cat = getCategoryById(id);
  if (!cat) return;
  const children = getCategoryChildren(id);
  const linkedTasks = state.tasks.filter(t => getTaskCategoryId(t) === id).length;
  const linkedGoals = state.goals.filter(g => g.categoryId === id).length;
  const linkedHabits = state.habits.filter(h => getHabitCategoryId(h) === id).length;
  const hasContent = children.length || linkedTasks || linkedGoals || linkedHabits;

  let warning = `Delete "${cat.name}"?`;
  if (children.length) warning += `\n\n⚠️ ${children.length} sub-categor${children.length === 1 ? 'y' : 'ies'} will become orphaned (moved to parent).`;
  if (linkedTasks || linkedGoals || linkedHabits) {
    const parts = [];
    if (linkedTasks) parts.push(`${linkedTasks} task${linkedTasks > 1 ? 's' : ''}`);
    if (linkedGoals) parts.push(`${linkedGoals} goal${linkedGoals > 1 ? 's' : ''}`);
    if (linkedHabits) parts.push(`${linkedHabits} habit${linkedHabits > 1 ? 's' : ''}`);
    warning += `\n\n⚠️ ${parts.join(', ')} linked to this category will be unlinked (set to no category).`;
  }
  if (!confirm(warning)) return;

  // Reparent children to deleted node's parent
  for (const child of children) {
    child.parentId = cat.parentId || null;
    await saveDoc('categories', child.id, { parentId: child.parentId });
  }

  // Unlink content: set categoryId = null on goals (tasks/habits derive from goal)
  for (const g of state.goals.filter(g => g.categoryId === id)) {
    g.categoryId = null;
    await saveDoc('goals', g.id, { categoryId: null });
  }
  // Legacy tasks/habits with direct categoryId: unlink directly
  for (const t of state.tasks.filter(t => t.categoryId === id && !t.goalId)) {
    t.categoryId = null;
    await saveDoc('tasks', t.id, { categoryId: null });
  }
  for (const h of state.habits.filter(h => h.categoryId === id && !h.goalId)) {
    h.categoryId = null;
    await saveDoc('habits', h.id, { categoryId: null });
  }

  state.categories = state.categories.filter(c => c.id !== id);
  await deleteDoc('categories', id);
  expandedCategories.delete(id);
  if (activeCategoryId === id) {
    activeCategoryId = cat.parentId || null;
    if (activeCategoryId) goToCategory(activeCategoryId);
    else { currentView = 'dashboard'; goTo('dashboard'); }
  }
  renderSidebarCategories();
  if (activeCategoryId) renderCategoryContent();
}

// ─── Category tree rendering (legacy — kept for backward compat) ──
function renderCategories() {
  const treeEl = document.getElementById('categories-tree');
  const contentEl = document.getElementById('categories-content');
  if (!treeEl || !contentEl) return;

  if (!state.categories.length) {
    treeEl.innerHTML = `<div class="empty-state" style="padding:20px 0"><div class="empty-icon">🌳</div><p>No categories yet.</p><small>Create your first category to organize everything.</small></div>`;
    contentEl.innerHTML = '';
    return;
  }

  // If a node is selected, show its content
  if (currentCategoryId) {
    const cat = getCategoryById(currentCategoryId);
    if (!cat) { currentCategoryId = null; renderCategories(); return; }
    treeEl.innerHTML = buildCategoryBreadcrumb(currentCategoryId) + buildCategoryChildrenList(currentCategoryId);
    contentEl.innerHTML = buildCategoryContent(cat);
    return;
  }

  // Root view: show top-level categories
  const roots = getCategoryChildren(null);
  treeEl.innerHTML = roots.map(cat => buildCategoryNodeHTML(cat, 0)).join('');
  contentEl.innerHTML = `<div class="empty-state" style="padding:40px 0"><div class="empty-icon">👈</div><p>Select a category to view its content</p></div>`;
}

function buildCategoryBreadcrumb(id) {
  const path = getCategoryPath(id);
  let html = '<div class="cat-breadcrumb">';
  html += `<span class="cat-breadcrumb-item" onclick="currentCategoryId=null; renderCategories()" style="cursor:pointer;color:var(--accent)">🏠 All</span>`;
  let parentId = null;
  for (let i = 0; i < path.length; i++) {
    // walk path to find parentId at each level
    const ancestors = getCategoryPath(id).slice(0, i + 1);
    let nodeId = null;
    for (const c of state.categories) {
      if (getCategoryPath(c.id).join(' > ') === ancestors.join(' > ')) { nodeId = c.id; break; }
    }
    html += ` <span style="color:var(--text-muted)">›</span> `;
    if (i === path.length - 1) {
      html += `<span class="cat-breadcrumb-current">${esc(path[i])}</span>`;
    } else {
      html += `<span class="cat-breadcrumb-item" onclick="currentCategoryId='${nodeId}'; renderCategories()" style="cursor:pointer;color:var(--accent)">${esc(path[i])}</span>`;
    }
  }
  html += '</div>';
  return html;
}

function buildCategoryNodeHTML(cat, depth) {
  const children = getCategoryChildren(cat.id);
  const childCount = children.length;
  const linkedCount = state.tasks.filter(t => getTaskCategoryId(t) === cat.id).length
    + state.goals.filter(g => g.categoryId === cat.id).length
    + state.habits.filter(h => getHabitCategoryId(h) === cat.id).length;
  const moduleTag = cat.moduleType && cat.moduleType !== 'generic'
    ? `<span class="cat-module-tag ${cat.moduleType}">${cat.moduleType === 'meals' ? '🍽️ Meals' : cat.moduleType === 'dateIdeas' ? '🌹 Date Ideas' : '📊 Finance'}</span>`
    : '';
  const colorStyle = cat.color ? `border-left: 3px solid ${cat.color};` : '';
  return `<div class="cat-node" style="padding-left:${depth * 20}px">
    <div class="cat-node-row" onclick="currentCategoryId='${cat.id}'; renderCategories()" style="${colorStyle}">
      <span class="cat-node-icon">${cat.icon || '📁'}</span>
      <span class="cat-node-name">${esc(cat.name)}</span>
      ${moduleTag}
      <span class="cat-node-count">${childCount > 0 ? childCount + ' sub' : ''} ${linkedCount > 0 ? linkedCount + ' items' : ''}</span>
    </div>
    <div class="cat-node-actions">
      <button class="btn btn-ghost btn-xs" onclick="event.stopPropagation(); openAddCategoryModal('${cat.id}')" title="Add sub-category">+</button>
      <button class="btn btn-ghost btn-xs" onclick="event.stopPropagation(); openEditCategoryModal('${cat.id}')" title="Edit">✎</button>
      <button class="btn btn-ghost btn-xs" onclick="event.stopPropagation(); deleteCategory('${cat.id}')" title="Delete">×</button>
    </div>
  </div>${children.map(c => buildCategoryNodeHTML(c, depth + 1)).join('')}`;
}

function buildCategoryChildrenList(parentId) {
  const children = getCategoryChildren(parentId);
  if (!children.length && !currentCategoryId) return '';
  let html = '<div class="cat-children">';
  html += `<div class="cat-children-header"><span class="cat-children-title">${currentCategoryId ? 'Sub-categories' : 'Root Categories'}</span>`;
  html += `<button class="btn btn-sm" onclick="openAddCategoryModal(${currentCategoryId ? "'" + currentCategoryId + "'" : 'null'})">+ Add</button></div>`;
  if (children.length) {
    html += children.map(c => {
      const childCount = getCategoryChildren(c.id).length;
      const moduleTag = c.moduleType && c.moduleType !== 'generic'
        ? `<span class="cat-module-tag ${c.moduleType}">${c.moduleType === 'meals' ? '🍽️' : c.moduleType === 'dateIdeas' ? '🌹' : '📊'}</span>` : '';
      const colorStyle = c.color ? `border-left: 3px solid ${c.color};` : '';
      return `<div class="cat-child-card" onclick="currentCategoryId='${c.id}'; renderCategories()" style="${colorStyle}">
        <span class="cat-child-icon">${c.icon || '📁'}</span>
        <span class="cat-child-name">${esc(c.name)}</span>
        ${moduleTag}
        ${childCount ? `<span class="cat-child-count">${childCount}</span>` : ''}
        <div class="cat-child-actions">
          <button class="btn btn-ghost btn-xs" onclick="event.stopPropagation(); openEditCategoryModal('${c.id}')" title="Edit">✎</button>
          <button class="btn btn-ghost btn-xs" onclick="event.stopPropagation(); deleteCategory('${c.id}')" title="Delete">×</button>
        </div>
      </div>`;
    }).join('');
  } else {
    html += `<div class="empty-state" style="padding:16px 0"><p>No sub-categories yet.</p></div>`;
  }
  html += '</div>';
  return html;
}

// ─── Category content rendering ───────────────────────────────
function buildCategoryContent(cat) {
  if (cat.moduleType === 'meals') return buildMealsContent(cat);
  if (cat.moduleType === 'finance-table') return buildFinancePlaceholder(cat);

  // Generic: show tasks, goals, habits linked to this category
  const tasks = state.tasks.filter(t => getTaskCategoryId(t) === cat.id);
  const goals = state.goals.filter(g => g.categoryId === cat.id);
  const habits = state.habits.filter(h => getHabitCategoryId(h) === cat.id);

  let html = '<div class="cat-content">';
  if (tasks.length || goals.length || habits.length) {
    if (tasks.length) {
      html += `<div class="cat-content-section"><div class="cat-content-title">☑️ Tasks (${tasks.length})</div>`;
      html += tasks.map(t => `<div class="cat-content-item">${renderTaskInline(t)}</div>`).join('');
      html += '</div>';
    }
    if (goals.length) {
      html += `<div class="cat-content-section"><div class="cat-content-title">🎯 Goals (${goals.length})</div>`;
      html += goals.map(g => `<div class="cat-content-item">${renderGoalInline(g)}</div>`).join('');
      html += '</div>';
    }
    if (habits.length) {
      html += `<div class="cat-content-section"><div class="cat-content-title">🔥 Habits (${habits.length})</div>`;
      html += habits.map(h => `<div class="cat-content-item">${renderHabitInline(h)}</div>`).join('');
      html += '</div>';
    }
  } else {
    html += `<div class="empty-state" style="padding:30px 0"><p>No items in this category yet.</p><small>Create tasks, goals, or habits and assign them to this category.</small></div>`;
  }
  html += '</div>';
  return html;
}

function renderTaskInline(t) {
  const overdue = !t.done && t.dueDate && t.dueDate < dk();
  return `<div class="inline-task${t.done ? ' done' : ''}">
    <button class="task-check-sm" onclick="toggleTask('${t.id}'); renderCategories()">${t.done ? '✓' : ''}</button>
    <span class="inline-task-title">${esc(t.title)}</span>
    ${t.dueDate ? `<span class="inline-task-due${overdue ? ' overdue' : ''}">${relativeDay(t.dueDate)}</span>` : ''}
    ${t.priority ? `<span class="pri-badge ${t.priority}">${t.priority}</span>` : ''}
  </div>`;
}

function renderGoalInline(g) {
  const p = computeGoalProgress(g);
  return `<div class="inline-goal">
    <span class="inline-goal-title">${esc(g.title)}</span>
    <div class="prog-track" style="flex:1;max-width:120px"><div class="prog-fill" style="width:${p.progress}%"></div></div>
    <span class="inline-goal-pct">${p.progress}%</span>
  </div>`;
}

function renderHabitInline(h) {
  const streak = calcStreak(h.checkIns || []);
  return `<div class="inline-habit">
    <span class="inline-habit-name">${esc(h.name)}</span>
    ${streak > 0 ? `<span class="streak-badge">🔥 ${streak}</span>` : ''}
    <button class="btn btn-ghost btn-xs" onclick="toggleHabitToday('${h.id}'); renderCategoryContent()">Check in</button>
  </div>`;
}

// ─── Category content page (main area) ───────────────────────
// Shows filtered tasks, goals, and habits for the active category.
// Reuses the same card markup as the standalone Tasks/Goals/Habits views.
function renderCategoryContent() {
  const el = document.getElementById('category-content');
  if (!el) return;
  const id = activeCategoryId;
  if (!id) { el.innerHTML = '<div class="empty-state"><p>Select a category from the sidebar</p></div>'; return; }
  const cat = getCategoryById(id);
  if (!cat) { el.innerHTML = '<div class="empty-state"><p>Category not found</p></div>'; return; }

  // Special module types: redirect or use specific renderer
  if (cat.moduleType === 'finance-table') {
    goTo('finance');
    return;
  }
  if (cat.moduleType === 'meals') {
    el.innerHTML = buildMealsContent(cat);
    return;
  }
  if (cat.moduleType === 'dateIdeas') {
    el.innerHTML = renderDateIdeasContent(cat);
    return;
  }

  // Build set of all descendant IDs for content filtering
  const catIds = new Set([id]);
  function collectDescendants(parentId) {
    for (const child of getCategoryChildren(parentId)) {
      catIds.add(child.id);
      collectDescendants(child.id);
    }
  }
  collectDescendants(id);
  const today = dk();

  // Tab system for generic categories
  const tabs = cat.tabs || [];
  if (!window._activeCategoryTab || !tabs.find(t => t.id === window._activeCategoryTab)) {
    window._activeCategoryTab = tabs.length ? tabs[0].id : null;
  }

  let html = '';

  // Breadcrumb path at the top
  const path = getCategoryPath(id);
  html += `<div class="cat-page-breadcrumb">`;
  html += `<span class="cat-page-bc-link" onclick="goToCategory(null)">🏠 All</span>`;
  for (let i = 0; i < path.length; i++) {
    const ancestors = path.slice(0, i + 1);
    let nodeId = null;
    for (const c of state.categories) {
      if (getCategoryPath(c.id).join(' > ') === ancestors.join(' > ')) { nodeId = c.id; break; }
    }
    html += ` <span style="color:var(--text-muted)">›</span> `;
    if (i === path.length - 1) {
      html += `<span class="cat-page-bc-current">${cat.icon ? cat.icon + ' ' : ''}${esc(cat.name)}</span>`;
    } else {
      html += `<span class="cat-page-bc-link" onclick="goToCategory('${nodeId}')">${esc(path[i])}</span>`;
    }
  }
  html += '</div>';

  // Tab bar
  html += renderCategoryTabBar(cat);

  // Active tab content
  const activeTab = tabs.find(t => t.id === window._activeCategoryTab);
  if (activeTab) {
    html += renderCategoryTabContent(cat, activeTab, catIds, today);
  } else if (!tabs.length) {
    html += `<div class="empty-state" style="padding:24px 0"><div class="empty-icon">📋</div><p>This page is empty</p><small>Click "+ Ajouter un onglet" above to add Tasks, Goals, Habits, or a simple checklist.</small></div>`;
  }

  el.innerHTML = html;
}

let _tabRenameArmed = false;

function renderCategoryTabBar(cat) {
  const tabs = cat.tabs || [];
  const renaming = window._renamingTabId;
  let html = `<div class="cat-tab-bar" id="cat-tab-bar" style="display:flex;gap:4px;flex-wrap:wrap;margin:12px 0">`;
  const typeUsed = new Set();
  for (const tab of tabs) {
    typeUsed.add(tab.type);
    if (tab.id === renaming) {
      html += `<div style="display:inline-flex;align-items:center;gap:2px">
        <input type="text" id="cat-tab-rename-input" value="${esc(tab.label)}" style="font-size:12px;padding:6px 8px;border:1px solid var(--accent);border-radius:var(--radius-sm);background:var(--bg2);color:var(--text);width:150px"
          onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur()}else if(event.key==='Escape'){cancelTabRename('${cat.id}','${tab.id}')}"
          onblur="finishTabRename('${cat.id}','${tab.id}',this.value)">
      </div>`;
    } else {
      const active = tab.id === window._activeCategoryTab;
      html += `<div style="display:inline-flex;align-items:center;gap:2px">
        <button class="btn btn-sm${active ? ' btn-primary' : ''}" onclick="window._activeCategoryTab='${tab.id}';renderCategoryContent()">${esc(tab.label)}</button>
        <button class="btn-ghost btn-xs" onclick="startTabRename('${cat.id}','${tab.id}')" title="Rename tab" style="font-size:11px;padding:2px 4px;color:var(--text-muted)">✎</button>
        <button class="btn-ghost btn-xs" onclick="removeCategoryTab('${cat.id}','${tab.id}')" title="Remove tab" style="font-size:11px;padding:2px 4px;color:var(--text-muted)">×</button>
      </div>`;
    }
  }
  const availableTypes = [];
  if (!typeUsed.has('tasks')) availableTypes.push(['tasks', '☑️ Tasks']);
  if (!typeUsed.has('goals')) availableTypes.push(['goals', '🎯 Goals']);
  if (!typeUsed.has('habits')) availableTypes.push(['habits', '🔥 Habits']);
  if (!typeUsed.has('list')) availableTypes.push(['list', '📋 Liste simple']);
  if (availableTypes.length) {
    html += `<button class="btn btn-sm btn-ghost" onclick="openAddTabModal('${cat.id}', [${availableTypes.map(([t,l]) => `['${t}','${l}']`).join(',')}])">+ Ajouter un onglet</button>`;
  }
  html += `</div>`;
  return html;
}

function startTabRename(catId, tabId) {
  window._renamingTabId = tabId;
  _tabRenameArmed = true;
  const cat = getCategoryById(catId);
  if (cat) {
    const bar = document.getElementById('cat-tab-bar');
    if (bar) bar.outerHTML = renderCategoryTabBar(cat);
  }
  const input = document.getElementById('cat-tab-rename-input');
  if (input) { input.focus(); input.select(); }
}

function finishTabRename(catId, tabId, newLabel) {
  window._renamingTabId = null;
  if (!_tabRenameArmed) return;
  _tabRenameArmed = false;
  const cat = getCategoryById(catId);
  if (!cat) { if (currentView === 'category' && activeCategoryId) renderCategoryContent(); return; }
  const tab = (cat.tabs || []).find(t => t.id === tabId);
  const val = (newLabel || '').trim();
  if (tab && val) {
    tab.label = val;
    saveDoc('categories', catId, { tabs: cat.tabs });
  }
  if (currentView === 'category' && activeCategoryId) renderCategoryContent();
}

function cancelTabRename(catId, tabId) {
  _tabRenameArmed = false;
  window._renamingTabId = null;
  if (currentView === 'category' && activeCategoryId) renderCategoryContent();
}

function renderCategoryTabContent(cat, tab, catIds, today) {
  switch (tab.type) {
    case 'tasks': return renderTabTasks(cat, catIds, today);
    case 'goals': return renderTabGoals(cat, catIds);
    case 'habits': return renderTabHabits(cat, catIds, today);
    case 'list': return renderTabList(cat, tab);
    default: return '<div class="empty-state"><p>Unknown tab type</p></div>';
  }
}

function renderTabTasks(cat, catIds, today) {
  const tasks = state.tasks.filter(t => {
    const tc = getTaskCategoryId(t);
    return tc && catIds.has(tc);
  });
  let html = `<div class="cat-page-section"><div class="cat-page-section-header">
    <span class="cat-page-section-title">☑️ Tasks (${tasks.length})</span>
    <button class="btn btn-sm" onclick="openAddTaskModal('', null, null)">+ Add</button>
  </div>`;
  if (tasks.length) {
    const undone = tasks.filter(t => !t.done);
    const done = tasks.filter(t => t.done);
    html += undone.map(t => {
      const overdue = !t.done && t.dueDate && t.dueDate < today;
      return `<div class="cat-page-task">
        <button class="task-check-sm" onclick="toggleTask('${t.id}'); renderCategoryContent()">${t.done ? '✓' : ''}</button>
        <span class="cat-page-task-title">${esc(t.title)}</span>
        ${t.dueDate ? `<span class="cat-page-task-due${overdue ? ' overdue' : ''}">${relativeDay(t.dueDate)}</span>` : ''}
        ${t.priority ? `<span class="pri-badge ${t.priority}">${t.priority}</span>` : ''}
      </div>`;
    }).join('');
    if (done.length) {
      html += `<details class="cat-page-done"><summary>Completed (${done.length})</summary>`;
      html += done.map(t => `<div class="cat-page-task done">
        <button class="task-check-sm" onclick="toggleTask('${t.id}'); renderCategoryContent()">✓</button>
        <span class="cat-page-task-title">${esc(t.title)}</span>
      </div>`).join('');
      html += '</details>';
    }
  } else {
    html += '<div class="empty-state" style="padding:12px 0"><p>No tasks in this category</p></div>';
  }
  html += '</div>';
  return html;
}

function renderTabGoals(cat, catIds) {
  const goals = state.goals.filter(g => catIds.has(g.categoryId));
  let html = `<div class="cat-page-section"><div class="cat-page-section-header">
    <span class="cat-page-section-title">🎯 Goals (${goals.length})</span>
    <button class="btn btn-sm" onclick="openAddGoalModal()">+ Add</button>
  </div>`;
  if (goals.length) {
    html += goals.map(g => buildGoalAccordionHtml(g)).join('');
  } else {
    html += '<div class="empty-state" style="padding:12px 0"><p>No goals in this category</p></div>';
  }
  html += '</div>';
  return html;
}

function renderTabHabits(cat, catIds, today) {
  const habits = state.habits.filter(h => {
    const hc = getHabitCategoryId(h);
    return hc && catIds.has(hc);
  });
  let html = `<div class="cat-page-section"><div class="cat-page-section-header">
    <span class="cat-page-section-title">🔥 Habits (${habits.length})</span>
    <button class="btn btn-sm" onclick="openAddHabitModal()">+ Add</button>
  </div>`;
  if (habits.length) {
    html += habits.map(h => {
      const streak = calcStreak(h.checkIns || []);
      const checkedToday = (h.checkIns || []).includes(today);
      const hp = computeHabitProgress(h);
      return `<div class="cat-page-habit">
        <button class="task-check-sm${checkedToday ? ' done' : ''}" onclick="toggleHabitToday('${h.id}'); renderCategoryContent()">${checkedToday ? '✓' : ''}</button>
        <span class="cat-page-habit-name">${esc(h.name)}</span>
        ${h.deadline ? `<span style="font-size:11px;color:var(--accent-light)" title="Deadline ${h.deadline}">${Math.round(hp.progress * 100)}%</span>` : ''}
        ${streak > 0 ? `<span class="streak-badge">🔥 ${streak}</span>` : ''}
      </div>`;
    }).join('');
  } else {
    html += '<div class="empty-state" style="padding:12px 0"><p>No habits in this category</p></div>';
  }
  html += '</div>';
  return html;
}

function renderTabList(cat, tab) {
  const items = state.checklistItems.filter(i => i.categoryId === cat.id && i.tabId === tab.id);
  let html = `<div class="cat-page-section"><div class="cat-page-section-header">
    <span class="cat-page-section-title">📋 ${esc(tab.label)} (${items.length})</span>
  </div>`;
  html += `<div style="display:flex;gap:6px;margin-bottom:12px">
    <input type="text" id="checklist-input-${tab.id}" placeholder="Nouvel élément..." style="flex:1;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg2);color:var(--text)">
    <button class="btn btn-sm" onclick="addChecklistItem('${cat.id}','${tab.id}')">+</button>
  </div>`;
  if (items.length) {
    html += items.map(i => `
      <div class="cat-page-task${i.done ? ' done' : ''}">
        <button class="task-check-sm" onclick="toggleChecklistItem('${i.id}')">${i.done ? '✓' : ''}</button>
        <span class="cat-page-task-title">${esc(i.text)}</span>
        <button class="btn btn-ghost btn-xs" onclick="deleteChecklistItem('${i.id}')" style="margin-left:auto">×</button>
      </div>`).join('');
  } else {
    html += '<div class="empty-state" style="padding:12px 0"><p>No items yet</p></div>';
  }
  html += '</div>';
  return html;
}

async function ensureCategoryTabForType(catId, type, defaultLabel) {
  if (!catId) return;
  const cat = getCategoryById(catId);
  if (!cat || (cat.moduleType !== 'generic' && cat.moduleType !== undefined)) return;
  const tabs = cat.tabs || [];
  if (tabs.some(t => t.type === type)) return;
  if (!cat.tabs) cat.tabs = [];
  const tab = { id: uid(), type, label: defaultLabel };
  cat.tabs.push(tab);
  await saveDoc('categories', cat.id, { tabs: cat.tabs });
  if (cat.tabs.length === 1) window._activeCategoryTab = tab.id;
}

function openAddTabModal(catId, availableTypes) {
  const cat = getCategoryById(catId);
  if (!cat) return;
  openModal({
    title: 'Ajouter un onglet',
    sub: `Choose a tab type for "${esc(cat.name)}"`,
    fields: [
      { name: 'type', label: 'Type d\'onglet', type: 'select', options: availableTypes },
      { name: 'label', label: 'Label (optionnel)', placeholder: 'e.g. My Tasks' }
    ],
    submit: 'Add',
    onSubmit: async v => {
      if (!cat.tabs) cat.tabs = [];
      let tabId = uid();
      if (v.type === 'list') {
        const existingIds = new Set(cat.tabs.map(t => t.id));
        const orphan = state.checklistItems.find(i => i.categoryId === catId && !existingIds.has(i.tabId));
        if (orphan) tabId = orphan.tabId;
      }
      const tab = { id: tabId, type: v.type, label: v.label || ({ tasks: '☑️ Tasks', goals: '🎯 Goals', habits: '🔥 Habits', list: '📋 Liste' })[v.type] || v.type };
      cat.tabs.push(tab);
      await saveDoc('categories', catId, { tabs: cat.tabs });
      window._activeCategoryTab = tab.id;
      renderCategoryContent();
    }
  });
}

async function addChecklistItem(categoryId, tabId) {
  const input = document.getElementById('checklist-input-' + tabId);
  if (!input || !input.value.trim()) return;
  const id = uid();
  const data = { id, categoryId, tabId, text: input.value.trim(), done: false, createdAt: Date.now() };
  state.checklistItems.push(data);
  await saveDoc('checklistItems', id, data);
  renderCategoryContent();
}

async function toggleChecklistItem(id) {
  const item = state.checklistItems.find(i => i.id === id);
  if (!item) return;
  item.done = !item.done;
  await saveDoc('checklistItems', id, { done: item.done });
  if (currentView === 'category') renderCategoryContent();
  else renderSuiviActiveTab();
}

async function deleteChecklistItem(id) {
  state.checklistItems = state.checklistItems.filter(i => i.id !== id);
  await deleteDoc('checklistItems', id);
  if (currentView === 'category') renderCategoryContent();
  else renderSuiviActiveTab();
}

async function removeCategoryTab(catId, tabId) {
  const cat = getCategoryById(catId);
  if (!cat || !cat.tabs) return;
  const tab = cat.tabs.find(t => t.id === tabId);
  if (!tab) return;
  const catIds = new Set([catId]);
  function collectDescendants(parentId) {
    for (const child of getCategoryChildren(parentId)) { catIds.add(child.id); collectDescendants(child.id); }
  }
  collectDescendants(catId);
  let contentWarning = '';
  if (tab.type === 'tasks') {
    const cnt = state.tasks.filter(t => { const tc = getTaskCategoryId(t); return tc && catIds.has(tc); }).length;
    if (cnt) contentWarning = `Cet onglet contient ${cnt} tâche${cnt > 1 ? 's' : ''} — elles ne seront pas supprimées, juste masquées tant que l'onglet n'est pas réajouté.`;
  } else if (tab.type === 'goals') {
    const cnt = state.goals.filter(g => g.categoryId && catIds.has(g.categoryId)).length;
    if (cnt) contentWarning = `Cet onglet contient ${cnt} objectif${cnt > 1 ? 's' : ''} — ils ne seront pas supprimés, juste masqués tant que l'onglet n'est pas réajouté.`;
  } else if (tab.type === 'habits') {
    const cnt = state.habits.filter(h => { const hc = getHabitCategoryId(h); return hc && catIds.has(hc); }).length;
    if (cnt) contentWarning = `Cet onglet contient ${cnt} habitude${cnt > 1 ? 's' : ''} — elles ne seront pas supprimées, juste masquées tant que l'onglet n'est pas réajouté.`;
  } else if (tab.type === 'list') {
    const cnt = state.checklistItems.filter(i => i.categoryId === catId && i.tabId === tabId).length;
    if (cnt) contentWarning = `Cet onglet contient ${cnt} élément${cnt > 1 ? 's' : ''} de liste — ils ne seront pas supprimés, juste masqués tant que l'onglet n'est pas réajouté.`;
  }
  const sub = `"${esc(tab.label)}" sera masqué. ${contentWarning}`;
  openModal({
    title: 'Supprimer l\'onglet ?',
    sub,
    fields: [],
    submit: 'Supprimer',
    onSubmit: async () => {
      cat.tabs = cat.tabs.filter(t => t.id !== tabId);
      await saveDoc('categories', catId, { tabs: cat.tabs });
      if (window._activeCategoryTab === tabId) window._activeCategoryTab = cat.tabs.length ? cat.tabs[0].id : null;
      renderCategoryContent();
    }
  });
}

// ─── Meals content for 'meals' moduleType nodes ──────────────
function buildMealsContent(cat) {
  let html = '<div class="cat-content">';
  // Recipes section
  html += `<div class="cat-content-section"><div class="cat-content-title">🍽️ Recipes</div>`;
  const catRecipes = state.recipes.filter(r => r.categoryId === cat.id);
  if (catRecipes.length) {
    html += catRecipes.map(r => `<div class="cat-content-item cat-recipe-card" onclick="openRecipeModal(state.recipes.find(x=>x.id==='${r.id}'))" style="cursor:pointer">
      <span>${esc(r.name)}</span>
      <span style="color:var(--text-muted);font-size:12px">${(r.ingredients || []).length} ingredients</span>
    </div>`).join('');
  } else {
    html += `<div style="padding:8px 0;color:var(--text-muted);font-size:13px">No recipes yet.</div>`;
  }
  html += `<button class="btn btn-sm btn-ghost" onclick="openRecipeModalWithCategory('${cat.id}')">+ Add Recipe</button></div>`;

  // Meal plan section
  html += `<div class="cat-content-section"><div class="cat-content-title">📅 Weekly Meal Plan</div>`;
  html += `<div class="meal-plan-mini">`;
  const catMealPlan = state.mealPlan.filter(m => m.categoryId === cat.id);
  html += MEAL_DAYS.map(day => {
    const dayMeals = MEAL_SLOTS.map(slot => {
      const meal = catMealPlan.find(m => m.day === day && m.repas === slot);
      const recipe = meal ? state.recipes.find(r => r.id === meal.recipeId) : null;
      return `<div class="meal-slot-mini">
        <span class="meal-slot-label-sm">${MEAL_SLOT_LABELS[slot]}</span>
        ${recipe ? `<span class="meal-slot-recipe-sm" onclick="openMealPlanModalForCategory('${cat.id}','${day}','${slot}')" style="cursor:pointer">${esc(recipe.name)}</span>` : `<button class="btn btn-ghost btn-xs" onclick="openMealPlanModalForCategory('${cat.id}','${day}','${slot}')">+</button>`}
      </div>`;
    }).join('');
    return `<div class="meal-day-mini"><div class="meal-day-label-sm">${MEAL_DAY_LABELS[day].slice(0, 3)}</div>${dayMeals}</div>`;
  }).join('');
  html += '</div></div>';

  // Grocery list
  html += `<div class="cat-content-section">
    <button class="btn btn-sm" onclick="generateGroceryListForCategory('${cat.id}')">🛒 Generate Grocery List</button>
    <div id="grocery-list-${cat.id}" style="margin-top:12px"></div>
  </div>`;

  html += '</div>';
  return html;
}

function openRecipeModalWithCategory(categoryId) {
  openModal({
    title: 'New Recipe',
    sub: 'One ingredient per line: name, amount, unit',
    fields: [
      { name: 'name', label: 'Recipe Name', required: true, placeholder: 'e.g. Pasta Bolognese' },
      { name: 'ingredients', label: 'Ingredients (one per line)', type: 'textarea', placeholder: 'ground beef, 500, g\nonion, 1, piece\nolive oil, 2, tbsp' }
    ],
    submit: 'Add Recipe',
    onSubmit: async v => {
      const ingredients = v.ingredients.split('\n').filter(l => l.trim()).map(line => {
        const parts = line.split(',').map(s => s.trim());
        return { name: parts[0] || '', amount: parseFloat(parts[1]) || 0, unit: parts[2] || 'pcs' };
      });
      const id = uid();
      const data = { id, name: v.name, ingredients, categoryId, createdAt: Date.now() };
      state.recipes.unshift(data);
      await saveDoc('recipes', id, data);
      renderCategoryContent();
    }
  });
}

function openMealPlanModalForCategory(categoryId, day, repas) {
  const existing = state.mealPlan.find(m => m.day === day && m.repas === repas && m.categoryId === categoryId);
  const options = state.recipes.filter(r => r.categoryId === categoryId).map(r => [r.id, r.name]);
  if (!options.length) {
    // Fall back to all recipes if no category-specific ones
    const allOptions = state.recipes.map(r => [r.id, r.name]);
    if (!allOptions.length) { toast('Add a recipe first', 'info'); return; }
    openMealPlanModalWithOpts(categoryId, day, repas, existing, allOptions);
    return;
  }
  openMealPlanModalWithOpts(categoryId, day, repas, existing, options);
}

function openMealPlanModalWithOpts(categoryId, day, repas, existing, options) {
  openModal({
    title: `${MEAL_DAY_LABELS[day]} — ${MEAL_SLOT_LABELS[repas]}`,
    fields: [
      { name: 'recipeId', label: 'Recipe', type: 'select', options, value: existing ? existing.recipeId : options[0][0] }
    ],
    submit: 'Save',
    onSubmit: async v => {
      if (existing) {
        existing.recipeId = v.recipeId;
        await saveDoc('mealPlan', existing.id, existing);
      } else {
        const id = uid();
        const data = { id, day, recipeId: v.recipeId, repas, categoryId, createdAt: Date.now() };
        state.mealPlan.push(data);
        await saveDoc('mealPlan', id, data);
      }
      renderCategoryContent();
    }
  });
}

function generateGroceryListForCategory(categoryId) {
  const container = document.getElementById(`grocery-list-${categoryId}`);
  if (!container) return;
  const aggregated = {};
  state.mealPlan.filter(m => m.categoryId === categoryId).forEach(mp => {
    const recipe = state.recipes.find(r => r.id === mp.recipeId);
    if (!recipe) return;
    (recipe.ingredients || []).forEach(ing => {
      const key = `${ing.name.toLowerCase()}|${ing.unit.toLowerCase()}`;
      if (!aggregated[key]) aggregated[key] = { name: ing.name, amount: 0, unit: ing.unit };
      aggregated[key].amount += ing.amount;
    });
  });
  const items = Object.values(aggregated).sort((a, b) => a.name.localeCompare(b.name));
  if (!items.length) { container.innerHTML = '<div style="padding:8px 0;color:var(--text-muted);font-size:13px">No planned meals.</div>'; return; }
  container.innerHTML = items.map(i =>
    `<div class="grocery-item"><span class="grocery-check" onclick="this.classList.toggle('done')"></span><span>${esc(i.name)}</span><span class="grocery-qty">${i.amount} ${i.unit}</span></div>`
  ).join('');
}

// ═══════════════════════════════════════════════════════════════
// DATE IDEAS MODULE (quiz / "à choix")
// ═══════════════════════════════════════════════════════════════

const DATE_IDEAS_SEED = [
  'Go for a walk|outdoor|true|couple|true',
  'Get some ice cream|outdoor|false|couple|true',
  'Go ice skating|indoor|true|couple|true',
  'Play tennis or pickleball|outdoor|true|both|true',
  'Play a board game|indoor|false|both|false',
  'Cook a meal together|indoor|false|couple|false',
  'Share three things you admire about each other|indoor|false|couple|false',
  'Read aloud to one another|indoor|false|couple|false',
  'Watch a documentary|indoor|false|couple|false',
  'Take up a new hobby|both|false|couple|false',
  'Make up a song or poem together|indoor|false|couple|false',
  'Go for a drive|outdoor|false|couple|true',
  'Sit on the porch and talk|outdoor|false|couple|false',
  'Browse a bookstore or library together|indoor|false|couple|true',
  'Take a bath or shower together|indoor|false|couple|false',
  'Go thrift shopping|indoor|false|couple|true',
  'Attend a school football or basketball game|both|false|both|true',
  'Plan a dream vacation together|indoor|false|couple|false',
  'Wash the car together|outdoor|true|couple|false',
  'Learn a new craft together|indoor|false|couple|false',
  'Hike through a state park|outdoor|true|couple|true',
  'Pack a picnic to share|outdoor|false|couple|true',
  'Lay on a blanket and watch the stars|outdoor|false|couple|true',
  'Stage a competition: sit-ups, cards, basketball|both|true|both|false',
  'Attend an outdoor concert|outdoor|false|both|true',
  'Work out together|both|true|couple|false',
  'Watch a sunrise/sunset together|outdoor|false|couple|true',
  'Go grocery shopping for special treats together|indoor|false|couple|true',
  'Share high point/low point for the day or week|indoor|false|couple|false',
  'Listen to an audiobook together & discuss|indoor|false|couple|false',
  'Play disc golf|outdoor|true|both|true',
  'Visit a local art museum|indoor|false|couple|true',
  'Set goals together: 5-year plan? 10-year?|indoor|false|couple|false',
  'Give each other back rubs|indoor|false|couple|false',
  'Go swimming|both|true|couple|true',
  'Snuggle and cuddle|indoor|false|couple|false',
  'Climb a tree and sit in its branches|outdoor|true|couple|true',
  'Go antiquing|indoor|false|couple|true',
  'Look at old snapshots together|indoor|false|couple|false',
  'Go fishing|outdoor|false|couple|true',
  'Listen to favorite songs together|indoor|false|couple|false',
  'Watch funny videos|indoor|false|couple|false',
  'Slow dance under the stars|outdoor|true|couple|true',
  'Run errands together|outdoor|false|couple|true',
  'Plan your dream home|indoor|false|couple|false',
  'Pitch a tent and sleep outdoors|outdoor|true|couple|true',
  'Make an empty nest list together|indoor|false|couple|false',
  'Go bowling|indoor|true|both|true',
  'Exchange love notes to one another|indoor|false|couple|false',
  'Make music together|indoor|false|couple|false',
];

function parseDateIdeaLine(line) {
  const parts = line.split('|');
  if (parts.length !== 5) return null;
  return {
    name: parts[0].trim(),
    tags: {
      location: parts[1].trim(),
      physical: parts[2].trim() === 'true',
      social: parts[3].trim(),
      goOut: parts[4].trim() === 'true',
    }
  };
}

async function seedDateIdeas() {
  if (state.dateIdeas.length > 0) return;
  for (const line of DATE_IDEAS_SEED) {
    const parsed = parseDateIdeaLine(line);
    if (!parsed) continue;
    const id = uid();
    const data = { id, name: parsed.name, tags: parsed.tags, createdAt: Date.now() };
    state.dateIdeas.push(data);
    await saveDoc('dateIdeas', id, data);
  }
  toast('Date ideas seeded! ' + state.dateIdeas.length + ' ideas loaded', 'success');
}

async function addDateIdea(name, tags) {
  const id = uid();
  const data = { id, name, tags, createdAt: Date.now() };
  state.dateIdeas.push(data);
  await saveDoc('dateIdeas', id, data);
  const cat = getCategoryById(activeCategoryId);
  if (cat && cat.moduleType === 'dateIdeas') {
    document.getElementById('category-content').innerHTML = renderDateIdeasContent(cat);
  }
}

async function editDateIdea(id, name, tags) {
  const idx = state.dateIdeas.findIndex(d => d.id === id);
  if (idx === -1) return;
  state.dateIdeas[idx].name = name;
  state.dateIdeas[idx].tags = tags;
  await saveDoc('dateIdeas', id, { name, tags });
  const cat = getCategoryById(activeCategoryId);
  if (cat && cat.moduleType === 'dateIdeas') {
    document.getElementById('category-content').innerHTML = renderDateIdeasContent(cat);
  }
}

async function deleteDateIdea(id) {
  state.dateIdeas = state.dateIdeas.filter(d => d.id !== id);
  await deleteDoc('dateIdeas', id);
  const cat = getCategoryById(activeCategoryId);
  if (cat && cat.moduleType === 'dateIdeas') {
    document.getElementById('category-content').innerHTML = renderDateIdeasContent(cat);
  }
}

function openAddDateIdeaModal() {
  openModal({
    title: 'Add Date Idea',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Go for a walk' },
      { name: 'location', label: 'Location', type: 'select', value: 'indoor',
        options: [['indoor','Indoor'],['outdoor','Outdoor'],['both','Both']] },
      { name: 'physical', label: 'Physical activity?', type: 'select', value: 'no',
        options: [['yes','Yes'],['no','No']] },
      { name: 'social', label: 'Social setting', type: 'select', value: 'couple',
        options: [['couple','Just us'],['friends','With friends'],['both','Both']] },
      { name: 'goOut', label: 'Go out?', type: 'select', value: 'no',
        options: [['yes','Yes'],['no','No']] },
    ],
    submit: 'Add',
    onSubmit: async vals => {
      const tags = {
        location: vals.location,
        physical: vals.physical === 'yes',
        social: vals.social,
        goOut: vals.goOut === 'yes',
      };
      await addDateIdea(vals.name, tags);
    }
  });
}

function openEditDateIdeaModal(id) {
  const editData = state.dateIdeas.find(d => d.id === id);
  if (!editData) return;
  openModal({
    title: 'Edit Date Idea',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, value: editData.name },
      { name: 'location', label: 'Location', type: 'select', value: editData.tags.location,
        options: [['indoor','Indoor'],['outdoor','Outdoor'],['both','Both']] },
      { name: 'physical', label: 'Physical activity?', type: 'select', value: editData.tags.physical ? 'yes' : 'no',
        options: [['yes','Yes'],['no','No']] },
      { name: 'social', label: 'Social setting', type: 'select', value: editData.tags.social,
        options: [['couple','Just us'],['friends','With friends'],['both','Both']] },
      { name: 'goOut', label: 'Go out?', type: 'select', value: editData.tags.goOut ? 'yes' : 'no',
        options: [['yes','Yes'],['no','No']] },
    ],
    submit: 'Save',
    onSubmit: async vals => {
      const tags = {
        location: vals.location,
        physical: vals.physical === 'yes',
        social: vals.social,
        goOut: vals.goOut === 'yes',
      };
      await editDateIdea(editData.id, vals.name, tags);
    }
  });
}

function renderDateIdeasContent(cat) {
  const ideas = state.dateIdeas;
  if (!ideas.length) {
    return `<div class="cat-content">
      <div class="empty-state"><div class="empty-icon">🌹</div><p>No date ideas yet</p>
      <button class="btn" onclick="openAddDateIdeaModal()">Add your first idea</button></div>
    </div>`;
  }

  window._dateQuizAnswers = window._dateQuizAnswers || { goOut: null, location: null, physical: null, social: null };
  const answers = window._dateQuizAnswers;
  let picked = window._dateQuizPicked;

  // Filter
  let filtered = [...ideas];
  if (answers.goOut !== null) {
    filtered = filtered.filter(d => d.tags.goOut === answers.goOut);
  }
  if (answers.location !== null) {
    filtered = filtered.filter(d => d.tags.location === answers.location || d.tags.location === 'both');
  }
  if (answers.physical !== null) {
    filtered = filtered.filter(d => d.tags.physical === answers.physical);
  }
  if (answers.social !== null) {
    filtered = filtered.filter(d => d.tags.social === answers.social || d.tags.social === 'both');
  }

  // Random pick
  if (!picked && filtered.length > 0) {
    picked = filtered[Math.floor(Math.random() * filtered.length)];
    window._dateQuizPicked = picked;
  }
  if (picked && !filtered.find(d => d.id === picked.id)) {
    picked = null;
    window._dateQuizPicked = null;
  }

  const renderAnswer = (key, label, options) => {
    const val = answers[key];
    const opts = [['any', 'Peu importe'], ...options];
    return opts.map(([v, lbl]) => {
      let jsVal = 'null';
      if (v !== 'any') {
        if (v === 'true') jsVal = 'true';
        else if (v === 'false') jsVal = 'false';
        else jsVal = `'${v}'`;
      }
      const active = val === (v === 'any' ? null : (v === 'true' ? true : v === 'false' ? false : v));
      return `<label class="date-quiz-option${active ? ' active' : ''}"
             onclick="window._dateQuizAnswers.${key}=${jsVal};window._dateQuizPicked=null;document.getElementById('category-content').innerHTML=renderDateIdeasContent(getCategoryById(activeCategoryId))">
        <input type="radio" name="dq-${key}" ${active ? 'checked' : ''}> ${lbl}
      </label>`;
    }).join('');
  };

  let html = `<div class="cat-content"><div class="cat-content-title">🌹 Date Ideas</div>`;

  // Quiz questions
  html += `<div class="date-quiz">
    <div class="date-quiz-q"><label>Stay in or go out?</label><div class="date-quiz-options">${renderAnswer('goOut', 'Go out?', [['true','Go out'],['false','Stay in']])}</div></div>
    <div class="date-quiz-q"><label>Indoor or outdoor?</label><div class="date-quiz-options">${renderAnswer('location', 'Location', [['indoor','Indoor'],['outdoor','Outdoor']])}</div></div>
    <div class="date-quiz-q"><label>Active or calm?</label><div class="date-quiz-options">${renderAnswer('physical', 'Activity', [['true','Active'],['false','Calm']])}</div></div>
    <div class="date-quiz-q"><label>Just us or with friends?</label><div class="date-quiz-options">${renderAnswer('social', 'Social', [['couple','Just us'],['friends','Friends']])}</div></div>
  </div>`;

  // Result
  html += `<div class="date-result" style="margin:16px 0;padding:16px;background:var(--surface2);border-radius:var(--radius);text-align:center">`;
  if (filtered.length === 0) {
    html += `<p style="color:var(--text-muted)">No ideas match these filters. Try "Peu importe" on some options.</p>`;
  } else if (picked) {
    html += `<div style="font-size:20px;font-weight:600;margin-bottom:8px">${esc(picked.name)}</div>`;
    html += `<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">
      ${picked.tags.goOut ? '🚗 Go out' : '🏠 Stay in'} · ${picked.tags.location === 'indoor' ? '🏠 Indoor' : picked.tags.location === 'outdoor' ? '🌳 Outdoor' : 'Both'} · ${picked.tags.physical ? '💪 Active' : '🛋️ Calm'} · ${picked.tags.social === 'couple' ? '💑 Just us' : picked.tags.social === 'friends' ? '👥 Friends' : 'Both'}
    </div>`;
    html += `<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
      <button class="btn" onclick="window._dateQuizPicked=null;document.getElementById('category-content').innerHTML=renderDateIdeasContent(getCategoryById(activeCategoryId))">🔁 Retirer</button>
      <button class="btn" onclick="scheduleDateIdea('${esc(picked.name)}')">📅 Programmer</button>
      <button class="btn btn-secondary" onclick="openEditDateIdeaModal('${picked.id}')">✎ Modifier</button>
    </div>`;
  } else {
    html += `<p style="color:var(--text-muted)">Click an option above to get started!</p>`;
  }
  html += `<div style="margin-top:12px;font-size:12px;color:var(--text-muted)">${filtered.length} idea${filtered.length !== 1 ? 's' : ''} match${filtered.length === 1 ? 'es' : ''} your filters</div>`;
  html += `</div>`;

  // Toutes les idées
  html += `<div class="date-all-ideas"><div class="cat-content-title" style="margin-top:16px">✨ All Ideas (${ideas.length})</div>`;
  html += `<div style="margin-bottom:8px"><button class="btn" onclick="openAddDateIdeaModal()">+ Add Date Idea</button></div>`;
  html += ideas.map(d => `
    <div class="cat-content-item" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span style="flex:1">${esc(d.name)}</span>
      <span style="font-size:11px;color:var(--text-muted)">${d.tags.goOut ? '🚗' : '🏠'} ${d.tags.location === 'indoor' ? '🏠' : d.tags.location === 'outdoor' ? '🌳' : '🔄'} ${d.tags.physical ? '💪' : '🛋️'} ${d.tags.social === 'couple' ? '💑' : d.tags.social === 'friends' ? '👥' : '🔄'}</span>
      <button class="btn btn-secondary" style="padding:2px 8px;font-size:11px" onclick="openEditDateIdeaModal('${d.id}')">✎</button>
      <button class="btn btn-secondary" style="padding:2px 8px;font-size:11px" onclick="if(confirm('Delete «${esc(d.name)}»?'))deleteDateIdea('${d.id}')">✕</button>
    </div>`).join('');
  html += `</div></div>`;

  return html;
}

async function scheduleDateIdea(name) {
  const familyRoot = state.categories.find(c => c.name === 'Family' && c.parentId === null);
  openAddTaskModal(name, null, null, { categoryId: familyRoot ? familyRoot.id : null });
}

// ═══════════════════════════════════════════════════════════════
// FINANCE MODULE
// ═══════════════════════════════════════════════════════════════
let financeTab = 'month';
let financeMonth = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; })();
const MONTH_NAMES = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

function getFinance() { return state.settings.finance || state.settings._finance || { partners:{a:{name:''},b:{name:''}}, accounts:[], discretionarySplit:{enabled:{a:false,b:false},buckets:[]}, wishlistLists:[] }; }
function saveFinance(f) { state.settings.finance = f; return saveProfile({ finance: f }); }

function switchFinanceTab(tab) {
  financeTab = tab;
  document.querySelectorAll('.finance-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  renderFinance();
}

function renderFinance() {
  const el = document.getElementById('finance-content');
  if (!el) return;
  if (financeTab === 'month') renderFinanceMonth(el);
  else if (financeTab === 'wishlist') renderWishlist(el);
  else renderFinanceSettings(el);
}

// ─── Finance Settings ────────────────────────────────────────
function renderFinanceSettings(el) {
  const f = getFinance();
  const pa = f.partners?.a?.name || '';
  const pb = f.partners?.b?.name || '';

  let html = `<div class="finance-section">
    <div class="finance-section-title">Partners</div>
    <div class="finance-partners-row">
      <div class="finance-partner-field">
        <label>Partner A</label>
        <input type="text" class="fin-input" value="${esc(pa)}" placeholder="Name A" onchange="updateFinancePartner('a', this.value)">
      </div>
      <div class="finance-partner-field">
        <label>Partner B</label>
        <input type="text" class="fin-input" value="${esc(pb)}" placeholder="Name B" onchange="updateFinancePartner('b', this.value)">
      </div>
    </div>
  </div>`;

  // Accounts
  const accounts = f.accounts || [];
  html += `<div class="finance-section">
    <div class="finance-section-title">Accounts <button class="btn btn-sm btn-ghost" onclick="openAddFinanceAccount()">+ Add</button></div>
    <div class="finance-accounts-list">`;
  if (!accounts.length) {
    html += `<div class="empty-state" style="padding:12px 0;font-size:13px">No accounts yet. Add your bank accounts.</div>`;
  } else {
    accounts.forEach(a => {
      const ownerLabel = a.owner === 'joint' ? 'Joint' : (f.partners?.[a.owner]?.name || a.owner);
      html += `<div class="finance-account-row">
        <span class="fin-icon">🏦</span>
        <span class="fin-label">${esc(a.name)}</span>
        <span class="fin-badge">${esc(ownerLabel)}</span>
        <button class="btn-icon" onclick="openEditFinanceAccount('${a.id}')">✏️</button>
        <button class="btn-icon" onclick="deleteFinanceAccount('${a.id}')">🗑️</button>
      </div>`;
    });
  }
  html += `</div></div>`;

  // Discretionary split
  const ds = f.discretionarySplit || { enabled:{a:false,b:false}, buckets:[] };
  html += `<div class="finance-section">
    <div class="finance-section-title">Discretionary Split (Remaining Budget)</div>`;
  ['a','b'].forEach(k => {
    const name = f.partners?.[k]?.name || k.toUpperCase();
    html += `<label class="fin-toggle-row">
      <input type="checkbox" ${ds.enabled?.[k] ? 'checked' : ''} onchange="toggleDiscretionary('${k}', this.checked)">
      <span>${esc(name)} — split remaining into buckets</span>
    </label>`;
  });
  const buckets = ds.buckets || [];
  html += `<div class="finance-buckets">`;
  buckets.forEach((b, i) => {
    html += `<div class="finance-bucket-row">
      <input type="text" class="fin-input fin-input-sm" value="${esc(b.name)}" placeholder="Bucket name" onchange="updateBucket(${i}, 'name', this.value)">
      <input type="number" class="fin-input fin-input-xs" value="${Math.round(b.ratio*100)}" min="0" max="100" onchange="updateBucket(${i}, 'ratio', this.value)">
      <span class="fin-pct">%</span>
      <button class="btn-icon" onclick="removeBucket(${i})">✕</button>
    </div>`;
  });
  const totalPct = buckets.reduce((s,b) => s + (b.ratio||0)*100, 0);
  if (buckets.length) {
    html += `<div class="fin-ratio-total ${totalPct === 100 ? 'valid' : 'invalid'}">Total: ${totalPct}%${totalPct !== 100 ? ' (must be 100%)' : ' ✓'}</div>`;
  }
  html += `<button class="btn btn-sm btn-ghost" onclick="addBucket()">+ Add Bucket</button>`;
  html += `</div></div>`;

  el.innerHTML = html;
}

async function updateFinancePartner(who, name) {
  const f = getFinance();
  if (!f.partners) f.partners = { a:{name:''}, b:{name:''} };
  f.partners[who].name = name;
  await saveFinance(f);
}

function openAddFinanceAccount() {
  const f = getFinance();
  openModal({
    title: 'Add Account',
    fields: [
      { name:'name', label:'Account Name', required:true, placeholder:'e.g. BNP, Revolut' },
      { name:'owner', label:'Owner', type:'select', options:[ ['a', f.partners?.a?.name || 'A'], ['b', f.partners?.b?.name || 'B'], ['joint', 'Joint'] ] }
    ],
    submit: 'Add Account',
    onSubmit: async (vals) => {
      const f = getFinance();
      if (!f.accounts) f.accounts = [];
      f.accounts.push({ id: uid(), name: vals.name, owner: vals.owner });
      await saveFinance(f);
      renderFinance();
    }
  });
}

function openEditFinanceAccount(id) {
  const f = getFinance();
  const acc = (f.accounts||[]).find(a => a.id === id);
  if (!acc) return;
  openModal({
    title: 'Edit Account',
    fields: [
      { name:'name', label:'Account Name', required:true, value: acc.name },
      { name:'owner', label:'Owner', type:'select', value: acc.owner, options:[ ['a', f.partners?.a?.name || 'A'], ['b', f.partners?.b?.name || 'B'], ['joint', 'Joint'] ] }
    ],
    submit: 'Save',
    onSubmit: async (vals) => {
      const f = getFinance();
      const a = (f.accounts||[]).find(x => x.id === id);
      if (a) { a.name = vals.name; a.owner = vals.owner; }
      await saveFinance(f);
      renderFinance();
    }
  });
}

async function deleteFinanceAccount(id) {
  if (!confirm('Delete this account?')) return;
  const f = getFinance();
  f.accounts = (f.accounts||[]).filter(a => a.id !== id);
  await saveFinance(f);
  renderFinance();
}

async function toggleDiscretionary(who, on) {
  const f = getFinance();
  if (!f.discretionarySplit) f.discretionarySplit = { enabled:{a:false,b:false}, buckets:[] };
  f.discretionarySplit.enabled[who] = on;
  await saveFinance(f);
}

function addBucket() {
  openModal({
    title: 'Add Bucket',
    fields: [
      { name:'name', label:'Bucket Name', required:true, placeholder:'e.g. Investment, Fun' },
      { name:'ratio', label:'Ratio (%)', type:'number', required:true, placeholder:'e.g. 30' }
    ],
    submit: 'Add',
    onSubmit: async (vals) => {
      const f = getFinance();
      if (!f.discretionarySplit) f.discretionarySplit = { enabled:{a:false,b:false}, buckets:[] };
      f.discretionarySplit.buckets.push({ name: vals.name, ratio: Number(vals.ratio) / 100 });
      await saveFinance(f);
      renderFinance();
    }
  });
}

function removeBucket(i) {
  const f = getFinance();
  (f.discretionarySplit?.buckets||[]).splice(i, 1);
  saveFinance(f).then(() => renderFinance());
}

async function updateBucket(i, field, val) {
  const f = getFinance();
  const b = (f.discretionarySplit?.buckets||[])[i];
  if (!b) return;
  b[field] = field === 'ratio' ? Number(val) / 100 : val;
  await saveFinance(f);
  renderFinance();
}

// ─── Finance Month ───────────────────────────────────────────
function getOrCreateFinanceMonth(id) {
  let m = state.financeMonths.find(x => x.id === id);
  if (!m) {
    m = { id, revenus:{ a:{income:0,previousSavings:0}, b:{income:0,previousSavings:0} }, sharedExpenses:[], individualExpenses:{ a:[], b:[] }, createdAt: Date.now() };
  }
  return m;
}

function renderFinanceMonth(el) {
  const f = getFinance();
  const m = getOrCreateFinanceMonth(financeMonth);
  const pa = f.partners?.a?.name || 'A';
  const pb = f.partners?.b?.name || 'B';
  const [y, mo] = financeMonth.split('-');
  const monthLabel = `${MONTH_NAMES[parseInt(mo)-1]} ${y}`;

  // Summary cards
  const calc = calcFinanceMonth(m, f);
  let html = `<div class="finance-month-nav">
    <button class="btn btn-ghost btn-sm" onclick="changeFinanceMonth(-1)">← Prev</button>
    <span class="finance-month-label">${monthLabel}</span>
    <button class="btn btn-ghost btn-sm" onclick="changeFinanceMonth(1)">Next →</button>
  </div>`;

  // Overview cards
  html += `<div class="finance-overview">
    <div class="fin-card fin-card-total">
      <div class="fin-card-label">Total Expenses</div>
      <div class="fin-card-num">${fmtMoney(calc.totalDepensesGlobale)}</div>
    </div>
    <div class="fin-card fin-card-green">
      <div class="fin-card-label">${esc(pa)}'s Rest</div>
      <div class="fin-card-num">${fmtMoney(calc.restes.a)}</div>
    </div>
    <div class="fin-card fin-card-blue">
      <div class="fin-card-label">${esc(pb)}'s Rest</div>
      <div class="fin-card-num">${fmtMoney(calc.restes.b)}</div>
    </div>
  </div>`;

  // Reconciliation summary
  if (calc.reconciliation.length) {
    html += `<div class="finance-section">
      <div class="finance-section-title">🔄 Reconciliation</div>
      <div class="finance-recon-list">`;
    calc.reconciliation.forEach(r => {
      html += `<div class="fin-recon-item">${esc(r.text)}</div>`;
    });
    html += `</div></div>`;
  }

  // Revenues
  html += `<div class="finance-section">
    <div class="finance-section-title">💰 Revenues</div>
    <div class="finance-revenues">
      ${['a','b'].map(k => {
        const name = k === 'a' ? pa : pb;
        const rev = m.revenus?.[k] || {income:0,previousSavings:0};
        return `<div class="finance-revenue-card">
          <div class="fin-rev-name">${esc(name)}</div>
          <div class="fin-rev-field">
            <label>Monthly Income</label>
            <input type="number" class="fin-input" value="${rev.income||0}" onchange="updateFinanceRevenue('${k}','income',this.value)">
          </div>
          <div class="fin-rev-field">
            <label>Previous Savings</label>
            <input type="number" class="fin-input" value="${rev.previousSavings||0}" onchange="updateFinanceRevenue('${k}','previousSavings',this.value)">
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`;

  // Shared Expenses
  html += `<div class="finance-section">
    <div class="finance-section-title">🤝 Shared Expenses <button class="btn btn-sm btn-ghost" onclick="openAddSharedExpense()">+ Add</button></div>
    ${renderExpenseList(m.sharedExpenses || [], 'shared', f)}
  </div>`;

  // Individual Expenses A
  html += `<div class="finance-section">
    <div class="finance-section-title">👤 ${esc(pa)}'s Expenses <button class="btn btn-sm btn-ghost" onclick="openAddIndividualExpense('a')">+ Add</button></div>
    ${renderExpenseList(m.individualExpenses?.a || [], 'individual-a', f)}
  </div>`;

  // Individual Expenses B
  html += `<div class="finance-section">
    <div class="finance-section-title">👤 ${esc(pb)}'s Expenses <button class="btn btn-sm btn-ghost" onclick="openAddIndividualExpense('b')">+ Add</button></div>
    ${renderExpenseList(m.individualExpenses?.b || [], 'individual-b', f)}
  </div>`;

  el.innerHTML = html;
}

function renderExpenseList(expenses, type, f) {
  if (!expenses.length) return '<div class="empty-state" style="padding:8px 0;font-size:13px">No expenses.</div>';
  return `<div class="finance-expense-list">` + expenses.map(e => {
    let extra = '';
    if (type === 'shared') {
      const acc = (f.accounts||[]).find(a => a.id === e.account);
      extra = `<span class="fin-badge">${esc(acc?.name || '—')}</span><span class="fin-badge ${e.type==='fixed'?'fin-badge-red':'fin-badge-orange'}">${e.type==='fixed'?'Fixed':'Variable'}</span>`;
    }
    return `<div class="finance-expense-row">
      <span class="fin-label">${esc(e.name)}</span>
      <span class="fin-amount">${fmtMoney(e.amount)}</span>
      ${extra}
      <button class="btn-icon" onclick="openEditExpense('${type}','${e.id}')">✏️</button>
      <button class="btn-icon" onclick="deleteExpense('${type}','${e.id}')">🗑️</button>
    </div>`;
  }).join('') + `</div>`;
}

function fmtMoney(v) { return (Number(v)||0).toLocaleString('fr-FR', {minimumFractionDigits:0, maximumFractionDigits:0}) + ' €'; }

function changeFinanceMonth(delta) {
  const [y, m] = financeMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  financeMonth = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  renderFinance();
}

async function updateFinanceRevenue(who, field, val) {
  const m = getOrCreateFinanceMonth(financeMonth);
  if (!m.revenus) m.revenus = { a:{income:0,previousSavings:0}, b:{income:0,previousSavings:0} };
  if (!m.revenus[who]) m.revenus[who] = {income:0,previousSavings:0};
  m.revenus[who][field] = Number(val) || 0;
  // Upsert into state
  const idx = state.financeMonths.findIndex(x => x.id === financeMonth);
  if (idx >= 0) state.financeMonths[idx] = m; else state.financeMonths.push(m);
  await saveDoc('financeMonths', financeMonth, m);
}

function openAddSharedExpense() {
  const f = getFinance();
  openModal({
    title: 'Add Shared Expense',
    fields: [
      { name:'name', label:'Name', required:true, placeholder:'e.g. Rent, Groceries' },
      { name:'amount', label:'Amount (€)', type:'number', required:true },
      { name:'account', label:'Account', type:'select', options: (f.accounts||[]).map(a => [a.id, a.name]) },
      { name:'type', label:'Type', type:'select', options: [['fixed','Fixed'],['variable','Variable']] }
    ],
    submit: 'Add',
    onSubmit: async (vals) => {
      const m = getOrCreateFinanceMonth(financeMonth);
      if (!m.sharedExpenses) m.sharedExpenses = [];
      m.sharedExpenses.push({ id: uid(), name: vals.name, amount: Number(vals.amount), account: vals.account, type: vals.type });
      const idx = state.financeMonths.findIndex(x => x.id === financeMonth);
      if (idx >= 0) state.financeMonths[idx] = m; else state.financeMonths.push(m);
      await saveDoc('financeMonths', financeMonth, m);
      renderFinance();
    }
  });
}

function openAddIndividualExpense(who) {
  openModal({
    title: `Add Expense`,
    fields: [
      { name:'name', label:'Name', required:true, placeholder:'e.g. Lunch, Transport' },
      { name:'amount', label:'Amount (€)', type:'number', required:true }
    ],
    submit: 'Add',
    onSubmit: async (vals) => {
      const m = getOrCreateFinanceMonth(financeMonth);
      if (!m.individualExpenses) m.individualExpenses = { a:[], b:[] };
      if (!m.individualExpenses[who]) m.individualExpenses[who] = [];
      m.individualExpenses[who].push({ id: uid(), name: vals.name, amount: Number(vals.amount) });
      const idx = state.financeMonths.findIndex(x => x.id === financeMonth);
      if (idx >= 0) state.financeMonths[idx] = m; else state.financeMonths.push(m);
      await saveDoc('financeMonths', financeMonth, m);
      renderFinance();
    }
  });
}

function openEditExpense(type, id) {
  const m = getOrCreateFinanceMonth(financeMonth);
  const f = getFinance();
  let exp;
  if (type === 'shared') exp = (m.sharedExpenses||[]).find(e => e.id === id);
  else if (type === 'individual-a') exp = (m.individualExpenses?.a||[]).find(e => e.id === id);
  else exp = (m.individualExpenses?.b||[]).find(e => e.id === id);
  if (!exp) return;

  const fields = [
    { name:'name', label:'Name', required:true, value: exp.name },
    { name:'amount', label:'Amount (€)', type:'number', required:true, value: exp.amount }
  ];
  if (type === 'shared') {
    fields.push({ name:'account', label:'Account', type:'select', value: exp.account, options: (f.accounts||[]).map(a => [a.id, a.name]) });
    fields.push({ name:'type', label:'Type', type:'select', value: exp.type, options: [['fixed','Fixed'],['variable','Variable']] });
  }

  openModal({
    title: 'Edit Expense',
    fields,
    submit: 'Save',
    onSubmit: async (vals) => {
      exp.name = vals.name;
      exp.amount = Number(vals.amount);
      if (type === 'shared') { exp.account = vals.account; exp.type = vals.type; }
      const idx = state.financeMonths.findIndex(x => x.id === financeMonth);
      if (idx >= 0) state.financeMonths[idx] = m; else state.financeMonths.push(m);
      await saveDoc('financeMonths', financeMonth, m);
      renderFinance();
    }
  });
}

async function deleteExpense(type, id) {
  if (!confirm('Delete this expense?')) return;
  const m = getOrCreateFinanceMonth(financeMonth);
  if (type === 'shared') m.sharedExpenses = (m.sharedExpenses||[]).filter(e => e.id !== id);
  else if (type === 'individual-a') m.individualExpenses.a = (m.individualExpenses?.a||[]).filter(e => e.id !== id);
  else m.individualExpenses.b = (m.individualExpenses?.b||[]).filter(e => e.id !== id);
  const idx = state.financeMonths.findIndex(x => x.id === financeMonth);
  if (idx >= 0) state.financeMonths[idx] = m; else state.financeMonths.push(m);
  await saveDoc('financeMonths', financeMonth, m);
  renderFinance();
}

// ─── Finance Calculations ────────────────────────────────────
function calcFinanceMonth(m, f) {
  const revA = Number(m.revenus?.a?.income) || 0;
  const revB = Number(m.revenus?.b?.income) || 0;
  const savA = Number(m.revenus?.a?.previousSavings) || 0;
  const savB = Number(m.revenus?.b?.previousSavings) || 0;
  const totalRevenus = revA + revB;
  const prorataA = totalRevenus > 0 ? revA / totalRevenus : 0.5;
  const prorataB = 1 - prorataA;

  const shared = m.sharedExpenses || [];
  let totalSharedFixed = 0, totalSharedVariable = 0;
  const splitDetails = [];
  shared.forEach(e => {
    const amt = Number(e.amount) || 0;
    const partA = amt * prorataA;
    const partB = amt * prorataB;
    if (e.type === 'fixed') totalSharedFixed += amt; else totalSharedVariable += amt;
    splitDetails.push({ ...e, partA, partB });
  });
  const totalShared = totalSharedFixed + totalSharedVariable;

  const indA = (m.individualExpenses?.a || []).reduce((s,e) => s + (Number(e.amount)||0), 0);
  const indB = (m.individualExpenses?.b || []).reduce((s,e) => s + (Number(e.amount)||0), 0);
  const totalDepensesGlobale = totalShared + indA + indB;

  const restA = revA + savA - (totalShared * prorataA) - indA;
  const restB = revB + savB - (totalShared * prorataB) - indB;

  // Discretionary split
  const discretionary = { a: [], b: [] };
  const ds = f.discretionarySplit || { enabled:{}, buckets:[] };
  ['a','b'].forEach(k => {
    if (ds.enabled?.[k]) {
      const rest = k === 'a' ? restA : restB;
      (ds.buckets||[]).forEach(b => {
        discretionary[k].push({ name: b.name, amount: rest * (b.ratio||0), ratio: b.ratio });
      });
    }
  });

  // Reconciliation
  const reconciliation = [];
  const accounts = f.accounts || [];
  const accountTotals = {};  // accountId -> { aOwes: 0, bOwes: 0 }

  splitDetails.forEach(sd => {
    if (!sd.account) return;
    if (!accountTotals[sd.account]) accountTotals[sd.account] = { aOwes: 0, bOwes: 0 };
    const acc = accounts.find(a => a.id === sd.account);
    if (!acc) return;
    if (acc.owner === 'joint') {
      accountTotals[sd.account].aOwes += sd.partA;
      accountTotals[sd.account].bOwes += sd.partB;
    } else if (acc.owner === 'a') {
      accountTotals[sd.account].bOwes += sd.partB;  // B owes A
    } else {
      accountTotals[sd.account].aOwes += sd.partA;  // A owes B
    }
  });

  let netAtoB = 0;
  Object.entries(accountTotals).forEach(([accId, tot]) => {
    const acc = accounts.find(a => a.id === accId);
    if (!acc) return;
    if (acc.owner === 'joint') {
      if (tot.aOwes > 0) reconciliation.push({ text: `Transfer ${fmtMoney(tot.aOwes)} to ${esc(acc.name)} (from ${esc(f.partners?.a?.name||'A')})` });
      if (tot.bOwes > 0) reconciliation.push({ text: `Transfer ${fmtMoney(tot.bOwes)} to ${esc(acc.name)} (from ${esc(f.partners?.b?.name||'B')})` });
    } else {
      const ownerName = f.partners?.[acc.owner]?.name || acc.owner.toUpperCase();
      const otherName = f.partners?.[acc.owner === 'a' ? 'b' : 'a']?.name || (acc.owner === 'a' ? 'B' : 'A');
      const amount = acc.owner === 'a' ? tot.bOwes : tot.aOwes;
      if (amount > 0) {
        reconciliation.push({ text: `Transfer ${fmtMoney(amount)} to ${esc(ownerName)} on ${esc(acc.name)} (from ${esc(otherName)})` });
        if (acc.owner === 'a') netAtoB -= amount; else netAtoB += amount;
      }
    }
  });

  if (netAtoB !== 0) {
    const aName = f.partners?.a?.name || 'A';
    const bName = f.partners?.b?.name || 'B';
    if (netAtoB > 0) reconciliation.push({ text: `Net: ${esc(aName)} owes ${fmtMoney(netAtoB)} to ${esc(bName)}` });
    else reconciliation.push({ text: `Net: ${esc(bName)} owes ${fmtMoney(-netAtoB)} to ${esc(aName)}` });
  }

  return { totalRevenus, prorataA, prorataB, totalSharedFixed, totalSharedVariable, totalShared, indA, indB, totalDepensesGlobale, restes:{ a: restA, b: restB }, discretionary, reconciliation, splitDetails };
}

// ─── Wishlist ────────────────────────────────────────────────
function renderWishlist(el) {
  const f = getFinance();
  const items = state.wishlist || [];
  const listNames = [...new Set([...(f.wishlistLists||[]), ...items.map(i=>i.list)].filter(Boolean))];

  let html = `<div class="finance-section">
    <div class="finance-section-title">Wishlist <button class="btn btn-sm btn-ghost" onclick="openAddWishlistItem()">+ Add Item</button></div>`;

  if (!items.length) {
    html += `<div class="empty-state" style="padding:20px 0">No wishlist items yet. Add something you want to save for!</div>`;
  } else {
    const grouped = {};
    items.forEach(i => { const key = i.list || 'General'; if (!grouped[key]) grouped[key] = []; grouped[key].push(i); });

    Object.entries(grouped).forEach(([listName, listItems]) => {
      html += `<div class="wishlist-group">
        <div class="wishlist-group-title">${esc(listName)}</div>`;
      listItems.forEach(item => {
        const pct = item.price > 0 ? Math.min(100, Math.round((item.saved || 0) / item.price * 100)) : 0;
        html += `<div class="wishlist-item">
          <div class="wishlist-item-header">
            <span class="wishlist-item-name">${esc(item.name)}</span>
            <span class="wishlist-item-price">${fmtMoney(item.saved||0)} / ${fmtMoney(item.price)}</span>
          </div>
          <div class="wishlist-bar"><div class="wishlist-bar-fill" style="width:${pct}%"></div></div>
          ${item.link ? `<a href="${esc(item.link)}" target="_blank" class="wishlist-link">🔗 Link</a>` : ''}
          <div class="wishlist-actions">
            <button class="btn btn-sm btn-ghost" onclick="openEditWishlistItem('${item.id}')">✏️</button>
            <button class="btn btn-sm btn-ghost" onclick="deleteWishlistItem('${item.id}')">🗑️</button>
          </div>
        </div>`;
      });
      html += `</div>`;
    });
  }
  html += `</div>`;
  el.innerHTML = html;
}

function openAddWishlistItem() {
  const f = getFinance();
  const listNames = [...new Set([...(f.wishlistLists||[]), ...(state.wishlist||[]).map(i=>i.list)].filter(Boolean))];
  openModal({
    title: 'Add Wishlist Item',
    fields: [
      { name:'list', label:'List', type:'select', options: listNames.map(n => [n,n]) },
      { name:'name', label:'Name', required:true, placeholder:'e.g. Running shoes' },
      { name:'price', label:'Price (€)', type:'number', required:true },
      { name:'saved', label:'Saved so far (€)', type:'number' },
      { name:'link', label:'Link (optional)', placeholder:'https://...' }
    ],
    submit: 'Add',
    onSubmit: async (vals) => {
      const item = { id: uid(), list: vals.list, name: vals.name, price: Number(vals.price), saved: Number(vals.saved)||0, link: vals.link, createdAt: Date.now() };
      state.wishlist.push(item);
      await saveDoc('wishlist', item.id, item);
      renderFinance();
    }
  });
}

function openEditWishlistItem(id) {
  const item = (state.wishlist||[]).find(i => i.id === id);
  if (!item) return;
  const f = getFinance();
  const listNames = [...new Set([...(f.wishlistLists||[]), ...(state.wishlist||[]).map(i=>i.list)].filter(Boolean))];
  openModal({
    title: 'Edit Wishlist Item',
    fields: [
      { name:'list', label:'List', type:'select', value: item.list, options: listNames.map(n => [n,n]) },
      { name:'name', label:'Name', required:true, value: item.name },
      { name:'price', label:'Price (€)', type:'number', required:true, value: item.price },
      { name:'saved', label:'Saved so far (€)', type:'number', value: item.saved },
      { name:'link', label:'Link (optional)', value: item.link || '' }
    ],
    submit: 'Save',
    onSubmit: async (vals) => {
      item.list = vals.list; item.name = vals.name; item.price = Number(vals.price); item.saved = Number(vals.saved)||0; item.link = vals.link;
      await saveDoc('wishlist', id, item);
      renderFinance();
    }
  });
}

async function deleteWishlistItem(id) {
  if (!confirm('Delete this item?')) return;
  state.wishlist = (state.wishlist||[]).filter(i => i.id !== id);
  await deleteDoc('wishlist', id);
  renderFinance();
}

// ─── Finance placeholder for category tree ───────────────────
function buildFinancePlaceholder(cat) {
  return `<div class="cat-content">
    <div class="empty-state" style="padding:40px 0">
      <div class="empty-icon">📊</div>
      <p>Suivi financier</p>
      <small>Go to <span style="color:var(--accent-light);cursor:pointer" onclick="goTo('finance')">Finance view</span> to manage your budget.</small>
    </div>
  </div>`;
}

// ─── Seed categories on first launch ─────────────────────────
async function seedInitialCategories() {
  if (state.categories.length > 0) return; // already seeded

  const seeds = [
    // Family tree
    { name: 'Family', icon: '👨‍👩‍👧', parentId: null, moduleType: 'generic', order: 0 },
    { name: 'House', icon: '🏠', parentRef: 'Family', moduleType: 'generic', order: 0 },
    { name: 'Meal', icon: '🍽️', parentRef: 'Family', moduleType: 'meals', order: 1 },
    { name: 'Baby', icon: '👶', parentRef: 'Family', moduleType: 'generic', order: 2 },
    { name: 'Wife', icon: '❤️', parentRef: 'Family', moduleType: 'generic', order: 3 },
    { name: 'Dates', icon: '🌹', parentRef: 'Wife', moduleType: 'dateIdeas', order: 0 },

    // Growth tree
    { name: 'Growth', icon: '🌱', parentId: null, moduleType: 'generic', order: 1 },
    { name: 'Video games', icon: '🎮', parentRef: 'Growth', moduleType: 'generic', order: 0 },
    { name: 'Chess', icon: '♟️', parentRef: 'Growth', moduleType: 'generic', order: 1 },
    { name: 'Soccer', icon: '⚽', parentRef: 'Growth', moduleType: 'generic', order: 2 },
    { name: 'Art', icon: '🎨', parentRef: 'Growth', moduleType: 'generic', order: 3 },
    { name: 'Comedy', icon: '😂', parentRef: 'Growth', moduleType: 'generic', order: 4 },

    // Career (empty root)
    { name: 'Career', icon: '💼', parentId: null, moduleType: 'generic', order: 2 },

    // Finance
    { name: 'Finance', icon: '💰', parentId: null, moduleType: 'finance-table', order: 3 }
  ];

  const created = {};
  for (const s of seeds) {
    const id = uid();
    const parentId = s.parentRef ? created[s.parentRef] : (s.parentId || null);
    const moduleType = s.moduleType || 'generic';
    const isGeneric = moduleType === 'generic';
    const data = {
      id, name: s.name, icon: s.icon || '', color: '',
      parentId, moduleType,
      tabs: isGeneric ? [
        { id: uid(), type: 'tasks', label: '☑️ Tasks' },
        { id: uid(), type: 'goals', label: '🎯 Goals' },
        { id: uid(), type: 'habits', label: '🔥 Habits' }
      ] : [],
      order: s.order || 0, createdAt: Date.now()
    };
    state.categories.push(data);
    await saveDoc('categories', id, data);
    created[s.name] = id;
  }
  toast('Initial categories created! 🌳', 'success');
  renderSidebarCategories();
}

// ─── Migration: orphan tasks/habits → goals ───────────────────
async function migrateOrphanTasksAndHabits() {
  const orphanTasks = state.tasks.filter(t => t.categoryId && !t.goalId);
  const orphanHabits = state.habits.filter(h => h.categoryId && !h.goalId);
  if (!orphanTasks.length && !orphanHabits.length) return;

  const taskByCat = {};
  for (const t of orphanTasks) {
    if (!taskByCat[t.categoryId]) taskByCat[t.categoryId] = [];
    taskByCat[t.categoryId].push(t);
  }
  const habitByCat = {};
  for (const h of orphanHabits) {
    if (!habitByCat[h.categoryId]) habitByCat[h.categoryId] = [];
    habitByCat[h.categoryId].push(h);
  }

  const allCatIds = new Set([...Object.keys(taskByCat), ...Object.keys(habitByCat)]);
  for (const catId of allCatIds) {
    const catLabel = getCategoryLabel(catId) || 'Uncategorized';
    let uncategorizedGoal = state.goals.find(g =>
      g.title === `Non classé (${catLabel})` && g.categoryId === catId
    );
    if (!uncategorizedGoal) {
      const id = uid();
      const root = getCategoryRoot(catId);
      uncategorizedGoal = {
        id, title: `Non classé (${catLabel})`,
        area: root ? root.name.toLowerCase() : '',
        categoryId: catId, progress: 0, milestones: [],
        isSprintObjective: false, sprintQuarter: null,
        weeklyActions: [], deadline: null, createdAt: Date.now()
      };
      state.goals.push(uncategorizedGoal);
      await saveDoc('goals', id, uncategorizedGoal);
    }
    for (const t of (taskByCat[catId] || [])) {
      t.goalId = uncategorizedGoal.id;
      await saveDoc('tasks', t.id, { goalId: t.goalId });
    }
    for (const h of (habitByCat[catId] || [])) {
      h.goalId = uncategorizedGoal.id;
      await saveDoc('habits', h.id, { goalId: h.goalId });
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// INIT COMPLETE — await auth state
// ═══════════════════════════════════════════════════════════════
// All boot logic is triggered from auth.onAuthStateChanged above.
// startHourlyNudge is called after launchApp.
console.log('Second Brain v2.0 — Ready');
