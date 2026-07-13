/* ═══════════════════════════════════════════════════════════════
   SECOND BRAIN — COMPLETE APPLICATION LOGIC
   Firebase · Auth · 14 Modules · Time Awareness · Focus UX
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
  googleCalendarEvents: [],
  outlookCalendarEvents: [],
  settings: {
    name: '',
    babyDueDate: null,
    areas: ['family', 'career', 'growth', 'health', 'finance']
  }
};

// ─── UTILITIES ────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
function dk(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  goals: { title: 'Goals & Habits', sub: 'Long-term growth' },
  journal: { title: 'Journal', sub: 'Daily reflection' },
  family: { title: 'Family Mode', sub: 'Sacred time & baby milestones' },
  areas: { title: 'Life Areas', sub: 'Balance across all five areas' },
  timeaudit: { title: 'Time Audit', sub: 'Build real intuition about time' },
  wins: { title: 'Wins Log', sub: 'Every completion matters' }
};

let currentView = 'dashboard';

function goTo(viewId) {
  if (!VIEWS[viewId]) return;
  currentView = viewId;

  // Views
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${viewId}`));

  // Sidebar
  document.querySelectorAll('.nav-btn[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === viewId));

  // Bottom nav
  document.querySelectorAll('.bottom-nav-btn[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === viewId));

  // Topbar
  const { title, sub } = VIEWS[viewId];
  document.getElementById('topbar-title').textContent = title;
  document.getElementById('topbar-sub').textContent = sub;

  // Topbar actions
  const acts = document.getElementById('topbar-actions');
  acts.innerHTML = '';

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
    case 'goals': renderGoals(); break;
    case 'journal': renderJournal(); break;
    case 'family': renderFamily(); break;
    case 'areas': renderAreas(); break;
    case 'timeaudit': renderTimeAudit(); break;
    case 'wins': renderWins(); break;
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
  const collections = ['tasks', 'notes', 'habits', 'goals', 'captures', 'documents', 'sprints', 'timeEntries', 'familyBlocks', 'wins', 'babyMilestones'];
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

  // Seed first sprint objective if provided
  if (goal) {
    const now = Date.now();
    const quarter = getQuarterLabel();
    const sprintId = uid();
    const sprintData = {
      id: sprintId, quarter, title: goal,
      objectives: [
        { id: uid(), title: 'Prepare for baby\'s arrival', progress: 0, weeklyActions: ['Set up nursery', 'Book hospital visit', 'Prepare hospital bag'] },
        { id: uid(), title: 'Build second brain system', progress: 20, weeklyActions: ['Set up all modules', 'Build daily ritual habit', 'Process inbox daily'] },
        { id: uid(), title: 'Career focus', progress: 0, weeklyActions: ['Identify key projects', 'Block deep work time', 'Weekly review'] }
      ],
      createdAt: now
    };
    state.sprints.push(sprintData);
    await saveDoc('sprints', sprintId, sprintData);
  }

  document.getElementById('screen-onboarding').classList.remove('active');
  updateSidebarUser();
  launchApp();
});

function getQuarterLabel() {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `Q${q} ${now.getFullYear()}`;
}

// ═══════════════════════════════════════════════════════════════
// LAUNCH APP (after auth + onboarding)
// ═══════════════════════════════════════════════════════════════
function launchApp() {
  document.getElementById('app').classList.remove('hidden');
  goTo('dashboard');
  checkRitual();
  startDayProgressTicker();
  startHourlyNudge();
  updateInboxBadge();
  restoreCalendarConnections();
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
  renderTimeRing();
  renderDashHabits();
  renderDashStats();
  renderDashFamilyBlocks();
  renderDashRitualSummary();
  renderDashCaptures();
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
  const sprint = state.sprints[0];
  const obj = sprint?.objectives?.[0];
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

  document.getElementById('time-ring-pct').textContent = `${Math.round(pct)}%`;

  const remaining = Math.max(0, Math.floor((end - now) / 60000));
  const remH = Math.floor(remaining / 60), remM = remaining % 60;
  document.getElementById('time-ring-label').textContent =
    remaining > 0 ? `${remH}h ${remM}m of your day left` : 'Day is over — great work!';

  const r = 50, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
  const color = pct < 50 ? '#6C63FF' : pct < 75 ? '#FFB347' : '#FF6B6B';

  document.getElementById('time-ring-wrap').innerHTML = `
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
  let tasks = [...state.tasks];

  // Tab filter
  if (taskTab === 'today') tasks = tasks.filter(t => !t.done && t.dueDate <= today || !t.done && !t.dueDate);
  if (taskTab === 'upcoming') tasks = tasks.filter(t => !t.done && t.dueDate > today);

  // Area filter
  if (taskAreaFilter !== 'all') tasks = tasks.filter(t => t.area === taskAreaFilter);

  // Search
  if (taskSearch) tasks = tasks.filter(t => t.title.toLowerCase().includes(taskSearch));

  const el = document.getElementById('task-list');
  if (!tasks.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">☑️</div><p>No tasks here.</p><small>Add a task or adjust filters.</small></div>`;
    return;
  }

  // Sort: undone first, then by due date
  tasks.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  el.innerHTML = tasks.map(t => {
    const overdue = !t.done && t.dueDate && t.dueDate < today;
    return `<div class="task-card${t.done ? ' done' : ''}" data-id="${t.id}">
      <button class="task-check" onclick="toggleTask('${t.id}')" aria-label="Toggle task">
        <span class="task-check-mark">✓</span>
      </button>
      <div class="task-body">
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
  }).join('');
}

function openAddTaskModal(prefill = '', captureId = null) {
  openModal({
    title: 'New Task',
    sub: 'Give it a time estimate — it helps with time blindness',
    fields: [
      { name: 'title', label: 'Task', placeholder: 'What needs to happen?', required: true, value: prefill },
      { name: 'dueDate', label: 'Due Date', type: 'date' },
      { name: 'duration', label: 'Time Estimate (minutes)', type: 'number', placeholder: '30' },
      { name: 'priority', label: 'Priority', type: 'select', options: [['medium', 'Medium'], ['high', 'High'], ['low', 'Low']] },
      { name: 'area', label: 'Life Area', type: 'select', options: [['', 'None'], ['family', 'Family'], ['career', 'Career'], ['growth', 'Growth'], ['health', 'Health'], ['finance', 'Finance']] }
    ],
    submit: 'Add Task',
    onSubmit: async v => {
      if (!v.duration) {
        toast('Please add a time estimate — even a rough one helps!', 'info', 4000);
      }
      const id = uid();
      const data = {
        id, title: v.title, dueDate: v.dueDate || null,
        duration: parseInt(v.duration) || 0,
        priority: v.priority || 'medium',
        area: v.area || '', done: false, timerRunning: false,
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
      renderTasks();
      if (currentView === 'dashboard') renderDashStats();
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
    // Log win
    await logWin(`Completed: ${task.title}`);
    // Show pause screen
    openPauseScreen(task.title);
  }
  renderTasks();
  if (currentView === 'dashboard') renderDashStats();
}

async function deleteTask(id) {
  state.tasks = state.tasks.filter(t => t.id !== id);
  await deleteDoc('tasks', id);
  renderTasks();
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
  const te = { id: teId, taskId: timerTaskId, estimatedMin: task?.duration || 0, actualMin, date: dk(), createdAt: Date.now() };
  state.timeEntries.push(te);
  await saveDoc('timeEntries', teId, te);

  clearTimer();
  toast('Timer done! ⏱', 'success');
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
// SPRINT SYSTEM
// ═══════════════════════════════════════════════════════════════
function renderSprint() {
  const sprint = state.sprints[0];
  if (!sprint) {
    document.getElementById('sprint-objectives-list').innerHTML =
      `<div class="empty-state"><div class="empty-icon">🚀</div><p>No sprint set up yet.</p><small>Add your first quarterly objective below.</small></div>`;
    return;
  }

  document.getElementById('sprint-quarter').textContent = sprint.quarter || getQuarterLabel();
  document.getElementById('sprint-main-title').textContent = sprint.title || 'Your 3-Month Focus';

  // Quarter progress (days elapsed in quarter)
  const now = new Date();
  const qStart = getQuarterStart();
  const qEnd = getQuarterEnd();
  const qPct = Math.min(100, Math.round(((now - qStart) / (qEnd - qStart)) * 100));
  document.getElementById('sprint-q-pct').textContent = `${qPct}%`;
  document.getElementById('sprint-q-fill').style.width = `${qPct}%`;

  const list = document.getElementById('sprint-objectives-list');
  const objs = sprint.objectives || [];
  if (!objs.length) {
    list.innerHTML = `<div class="empty-state" style="padding:20px 0"><p>Add your first objective.</p></div>`;
    return;
  }
  list.innerHTML = objs.map((o, oi) => `
    <div class="sprint-obj" data-sprint="${sprint.id}" data-obj="${o.id}">
      <div class="sprint-obj-header">
        <div class="sprint-obj-title">${esc(o.title)}</div>
        <div class="sprint-obj-progress">${o.progress || 0}%</div>
        <div class="stepper" style="gap:6px">
          <button onclick="adjustSprintProgress('${sprint.id}','${o.id}',-10)" style="width:36px;height:36px;border-radius:50%;background:var(--surface2);border:1px solid var(--border);color:var(--text);display:flex;align-items:center;justify-content:center;font-size:16px">−</button>
          <button onclick="adjustSprintProgress('${sprint.id}','${o.id}',10)" style="width:36px;height:36px;border-radius:50%;background:var(--surface2);border:1px solid var(--border);color:var(--text);display:flex;align-items:center;justify-content:center;font-size:16px">+</button>
        </div>
        <button onclick="deleteSprintObjective('${sprint.id}','${o.id}')" style="color:var(--text-muted);font-size:18px;padding:8px" title="Remove">×</button>
      </div>
      <div class="prog-track"><div class="prog-fill" style="width:${o.progress || 0}%"></div></div>
      ${(o.weeklyActions || []).length ? `
      <div class="sprint-weekly">
        <div class="sprint-weekly-title">This week's actions</div>
        ${o.weeklyActions.map(a => `<div class="sprint-action-item"><span style="color:var(--accent)">→</span> ${esc(a)}</div>`).join('')}
      </div>` : ''}
    </div>`).join('');
}

async function adjustSprintProgress(sprintId, objId, delta) {
  const sprint = state.sprints.find(s => s.id === sprintId);
  if (!sprint) return;
  const obj = (sprint.objectives || []).find(o => o.id === objId);
  if (!obj) return;
  obj.progress = Math.max(0, Math.min(100, (obj.progress || 0) + delta));
  await saveDoc('sprints', sprintId, { objectives: sprint.objectives });
  renderSprint();
  renderGreeting();
}

async function deleteSprintObjective(sprintId, objId) {
  const sprint = state.sprints.find(s => s.id === sprintId);
  if (!sprint) return;
  sprint.objectives = sprint.objectives.filter(o => o.id !== objId);
  await saveDoc('sprints', sprintId, { objectives: sprint.objectives });
  renderSprint();
}

document.getElementById('add-sprint-obj-btn').addEventListener('click', () => {
  openModal({
    title: 'New Objective',
    sub: 'A big outcome to achieve this quarter',
    fields: [
      { name: 'title', label: 'Objective', placeholder: 'e.g. Prepare for baby arrival', required: true },
      { name: 'w1', label: 'Weekly Action 1', placeholder: 'e.g. Book hospital tour' },
      { name: 'w2', label: 'Weekly Action 2', placeholder: 'e.g. Set up nursery' },
      { name: 'w3', label: 'Weekly Action 3', placeholder: 'e.g. Prepare hospital bag' }
    ],
    submit: 'Add Objective',
    onSubmit: async v => {
      const weeklyActions = [v.w1, v.w2, v.w3].filter(Boolean);
      const newObj = { id: uid(), title: v.title, progress: 0, weeklyActions };

      let sprint = state.sprints[0];
      if (!sprint) {
        const id = uid();
        sprint = { id, quarter: getQuarterLabel(), title: 'My Sprint', objectives: [], createdAt: Date.now() };
        state.sprints.unshift(sprint);
      }
      sprint.objectives = [...(sprint.objectives || []), newObj];
      await saveDoc('sprints', sprint.id, { objectives: sprint.objectives, quarter: sprint.quarter, title: sprint.title });
      renderSprint();
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
  if (!doc?.url) return;
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
  } catch (e) { }
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
        ${dayEvents.slice(0, 3).map(e => `<div class="day-ev ${e.source || e.area || 'personal'}">${esc(e.title)}</div>`).join('')}
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
  // From Google Calendar
  const googleEvents = (state.googleCalendarEvents || [])
    .filter(e => e.date === dateStr)
    .map(e => ({ title: e.title, area: 'career', type: 'google', source: 'google', startTime: e.startTime, endTime: e.endTime }));
  // From Outlook Calendar
  const outlookEvents = (state.outlookCalendarEvents || [])
    .filter(e => e.date === dateStr)
    .map(e => ({ title: e.title, area: 'career', type: 'outlook', source: 'outlook', startTime: e.startTime, endTime: e.endTime }));
  return [...taskEvents, ...familyEvents, ...googleEvents, ...outlookEvents];
}

function openDayModal(key, d) {
  const label = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const events = getEventsForDate(key);
  openModal({
    title: label,
    sub: 'Events and tasks for this day',
    fields: [
      { name: 'title', label: 'Add Event / Time Block', placeholder: 'e.g. Deep work: career project' },
      { name: 'area', label: 'Category', type: 'select', options: [['personal', 'Personal'], ['family', 'Family'], ['career', 'Career'], ['health', 'Health'], ['finance', 'Finance']] },
      { name: 'startTime', label: 'Start Time', type: 'time', placeholder: '09:00' },
      { name: 'endTime', label: 'End Time', type: 'time', placeholder: '10:00' }
    ],
    submit: 'Add to Calendar',
    customBody: events.length ? `<div style="margin-bottom:16px">
      ${events.map(e => `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">
        <span class="area-dot ${e.area}"></span> ${esc(e.title)}
      </div>`).join('')}
    </div>` : '',
    onSubmit: async v => {
      if (!v.title) return;
      const id = uid();
      const data = { id, title: v.title, date: key, area: v.area, startTime: v.startTime, endTime: v.endTime, type: 'block', createdAt: Date.now() };
      state.familyBlocks.push(data);
      await saveDoc('familyBlocks', id, data);
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
      { name: 'area', label: 'Category', type: 'select', options: [['personal', 'Personal'], ['family', 'Family'], ['career', 'Career'], ['health', 'Health'], ['finance', 'Finance']] },
      { name: 'recurring', label: 'Recurring Daily?', type: 'select', options: [['false', 'No'], ['true', 'Yes — every day']] }
    ],
    submit: 'Add Event',
    onSubmit: async v => {
      const id = uid();
      const data = { id, title: v.title, date: v.date, startTime: v.startTime, endTime: v.endTime, area: v.area, recurring: v.recurring === 'true', type: 'block', createdAt: Date.now() };
      state.familyBlocks.push(data);
      await saveDoc('familyBlocks', id, data);
      renderCalendar();
      if (currentView === 'family') renderFamily();
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// GOALS
// ═══════════════════════════════════════════════════════════════
document.getElementById('add-goal-btn').addEventListener('click', openAddGoalModal);

function renderGoals() {
  const grid = document.getElementById('goals-grid');
  if (!state.goals.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🎯</div><p>No goals yet</p><small>Long-term goals fuel your daily focus</small></div>`;
    return;
  }
  grid.innerHTML = state.goals.map(g => `
    <div class="goal-card">
      <div class="goal-card-header">
        <div class="goal-card-title">${esc(g.title)}</div>
        <span class="goal-area-badge ${g.area}">${g.area || 'general'}</span>
      </div>
      <div class="prog-track"><div class="prog-fill ${g.area}-fill" style="width:${g.progress || 0}%"></div></div>
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);margin-top:4px">
        <span>${g.progress || 0}% complete</span>
        ${g.deadline ? `<span>Due ${g.deadline}</span>` : ''}
      </div>
      ${(g.milestones || []).length ? `
      <div class="goal-milestones">
        ${g.milestones.map(m => `<div class="milestone-item">
          <button class="milestone-check${m.done ? ' done' : ''}" onclick="toggleMilestone('${g.id}','${m.id}')">${m.done ? '✓' : ''}</button>
          <span style="${m.done ? 'text-decoration:line-through;color:var(--text-muted)' : ''}">${esc(m.text)}</span>
        </div>`).join('')}
      </div>` : ''}
      <div style="display:flex;gap:6px;margin-top:8px">
        <div class="stepper" style="gap:4px">
          <button onclick="adjustGoalProgress('${g.id}',-10)" style="width:36px;height:36px;border-radius:50%;background:var(--surface2);border:1px solid var(--border);color:var(--text);display:flex;align-items:center;justify-content:center;font-size:16px">−</button>
          <button onclick="adjustGoalProgress('${g.id}',10)" style="width:36px;height:36px;border-radius:50%;background:var(--surface2);border:1px solid var(--border);color:var(--text);display:flex;align-items:center;justify-content:center;font-size:16px">+</button>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="deleteGoal('${g.id}')">Delete</button>
      </div>
    </div>`).join('');
}

function openAddGoalModal() {
  openModal({
    title: 'New Goal',
    sub: 'A long-term outcome worth working towards',
    fields: [
      { name: 'title', label: 'Goal Title', placeholder: 'e.g. Get promoted to senior role', required: true },
      { name: 'area', label: 'Life Area', type: 'select', options: [['family', 'Family'], ['career', 'Career'], ['growth', 'Growth'], ['health', 'Health'], ['finance', 'Finance']] },
      { name: 'deadline', label: 'Target Date', type: 'date' },
      { name: 'm1', label: 'Milestone 1', placeholder: 'e.g. Complete training course' },
      { name: 'm2', label: 'Milestone 2', placeholder: 'e.g. Take on leadership project' },
      { name: 'm3', label: 'Milestone 3', placeholder: 'e.g. Request performance review' }
    ],
    submit: 'Add Goal',
    onSubmit: async v => {
      const milestones = [v.m1, v.m2, v.m3].filter(Boolean).map(t => ({ id: uid(), text: t, done: false }));
      const id = uid();
      const data = { id, title: v.title, area: v.area, deadline: v.deadline || null, milestones, progress: 0, createdAt: Date.now() };
      state.goals.unshift(data);
      await saveDoc('goals', id, data);
      renderGoals();
    }
  });
}

async function adjustGoalProgress(id, delta) {
  const goal = state.goals.find(g => g.id === id);
  if (!goal) return;
  goal.progress = Math.max(0, Math.min(100, (goal.progress || 0) + delta));
  await saveDoc('goals', id, { progress: goal.progress });
  renderGoals();
}

async function deleteGoal(id) {
  if (!confirm('Delete this goal?')) return;
  state.goals = state.goals.filter(g => g.id !== id);
  await deleteDoc('goals', id);
  renderGoals();
}

async function toggleMilestone(goalId, milestoneId) {
  const goal = state.goals.find(g => g.id === goalId);
  if (!goal) return;
  const m = (goal.milestones || []).find(m => m.id === milestoneId);
  if (!m) return;
  m.done = !m.done;
  goal.progress = Math.round((goal.milestones.filter(m => m.done).length / goal.milestones.length) * 100);
  await saveDoc('goals', goalId, { milestones: goal.milestones, progress: goal.progress });
  renderGoals();
}

// ═══════════════════════════════════════════════════════════════
// HABITS
// ═══════════════════════════════════════════════════════════════

// Tab switching for goals/habits
document.getElementById('goals-tab').addEventListener('click', () => {
  document.getElementById('goals-panel').style.display = 'block';
  document.getElementById('habits-panel').style.display = 'none';
  document.getElementById('goals-tab').classList.add('active');
  document.getElementById('habits-tab').classList.remove('active');
  renderGoals();
});
document.getElementById('habits-tab').addEventListener('click', () => {
  document.getElementById('goals-panel').style.display = 'none';
  document.getElementById('habits-panel').style.display = 'block';
  document.getElementById('habits-tab').classList.add('active');
  document.getElementById('goals-tab').classList.remove('active');
  renderHabits();
});

document.getElementById('add-habit-btn').addEventListener('click', openAddHabitModal);

function renderHabits() {
  const el = document.getElementById('habits-list');
  if (!state.habits.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🔥</div><p>No habits yet</p><small>Small daily habits compound into big results</small></div>`;
    return;
  }
  el.innerHTML = state.habits.map(h => {
    const streak = calcStreak(h.checkIns || []);
    const checkIns = h.checkIns || [];
    return `<div class="habit-section">
      <div class="habit-header">
        <div class="habit-name">${esc(h.name)}</div>
        ${streak > 0 ? `<div class="streak-badge">🔥 ${streak} day streak</div>` : ''}
        <span class="goal-area-badge ${h.area}">${h.area || 'general'}</span>
        <button onclick="deleteHabit('${h.id}')" style="color:var(--text-muted);font-size:16px;padding:4px">×</button>
      </div>
      <div class="heatmap-wrap">
        <div class="heatmap-grid" id="heatmap-${h.id}"></div>
      </div>
      <div style="margin-top:8px; display:flex; gap:8px; align-items:center">
        <span style="font-size:12px; color:var(--text-muted)">${checkIns.length} total check-ins</span>
      </div>
    </div>`;
  }).join('');

  // Render heatmaps
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

async function toggleHabitToday(id) {
  const habit = state.habits.find(h => h.id === id);
  if (!habit) return;
  const today = dk();
  habit.checkIns = habit.checkIns || [];
  if (habit.checkIns.includes(today)) {
    habit.checkIns = habit.checkIns.filter(c => c !== today);
  } else {
    habit.checkIns.push(today);
    await logWin(`Habit: ${habit.name} ✓`);
  }
  await saveDoc('habits', id, { checkIns: habit.checkIns });
  renderDashHabits();
  renderDashStats();
}

function openAddHabitModal() {
  openModal({
    title: 'New Habit',
    sub: 'A daily practice that moves you forward',
    fields: [
      { name: 'name', label: 'Habit Name', placeholder: 'e.g. 30-min walk', required: true },
      { name: 'area', label: 'Life Area', type: 'select', options: [['health', 'Health'], ['family', 'Family'], ['career', 'Career'], ['growth', 'Growth'], ['finance', 'Finance']] }
    ],
    submit: 'Add Habit',
    onSubmit: async v => {
      const id = uid();
      const data = { id, name: v.name, area: v.area, checkIns: [], createdAt: Date.now() };
      state.habits.unshift(data);
      await saveDoc('habits', id, data);
      renderHabits();
      if (currentView === 'dashboard') renderDashHabits();
    }
  });
}

async function deleteHabit(id) {
  if (!confirm('Delete this habit?')) return;
  state.habits = state.habits.filter(h => h.id !== id);
  await deleteDoc('habits', id);
  renderHabits();
  renderDashHabits();
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
  document.getElementById('journal-morning').value = entry.morningFocus || '';
  document.getElementById('journal-free').value = entry.freeText || '';
  document.getElementById('journal-evening').value = entry.eveningWell || '';

  if (entry.morningMood) {
    document.getElementById('journal-mood-display').textContent = entry.morningMood;
    document.getElementById('journal-mood-label').textContent = `Mood logged · Energy ${entry.energy || '—'}/10`;
  } else {
    document.getElementById('journal-mood-display').textContent = '—';
    document.getElementById('journal-mood-label').textContent = 'No mood logged yet';
  }
}

document.getElementById('journal-save-btn').addEventListener('click', async () => {
  const key = dk(journalDate);
  const existing = state.journal[key] || { id: key, date: key, createdAt: Date.now() };
  const updated = {
    ...existing,
    morningFocus: document.getElementById('journal-morning').value,
    freeText: document.getElementById('journal-free').value,
    eveningWell: document.getElementById('journal-evening').value,
    updatedAt: Date.now()
  };
  state.journal[key] = updated;
  await saveDoc('journal', key, updated);
  toast('Journal saved ✓', 'success');
});

// ═══════════════════════════════════════════════════════════════
// FAMILY MODE
// ═══════════════════════════════════════════════════════════════
function renderFamily() {
  renderBabyCountdown();
  renderFamilyBlocks();
  renderBabyMilestones();
  renderFamilyScore();
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
    <div class="family-block-item" style="margin-bottom:8px">
      <div class="family-block-icon">🔒</div>
      <div class="family-block-info">
        <div class="family-block-title">${esc(b.title)}</div>
        <div class="family-block-time">${b.date || 'Daily'} · ${b.startTime || '—'} – ${b.endTime || '—'}</div>
      </div>
      <span class="protected-badge">PROTECTED</span>
      <button onclick="deleteFamilyBlock('${b.id}')" style="color:var(--text-muted);margin-left:8px;font-size:16px">×</button>
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

// ═══════════════════════════════════════════════════════════════
// LIFE AREAS
// ═══════════════════════════════════════════════════════════════
const AREA_COLORS = { family: '#FF6B6B', career: '#4ECDC4', growth: '#FFE66D', health: '#6BCB77', finance: '#4D96FF' };
const AREA_EMOJIS = { family: '👨‍👩‍👧', career: '💼', growth: '🌱', health: '💪', finance: '💰' };
const AREA_NAMES = { family: 'Family', career: 'Career', growth: 'Personal Growth', health: 'Health & Energy', finance: 'Finance' };

let areasChartInstance = null;

function renderAreas() {
  const grid = document.getElementById('areas-grid');
  const areas = ['family', 'career', 'growth', 'health', 'finance'];

  grid.innerHTML = areas.map(a => {
    const taskCount = state.tasks.filter(t => t.area === a).length;
    const goalCount = state.goals.filter(g => g.area === a).length;
    const score = calcAreaScore(a);
    return `<div class="area-card ${a}" onclick="goTo('tasks'); setAreaFilter('${a}')">
      <div class="area-card-emoji">${AREA_EMOJIS[a]}</div>
      <div class="area-card-name">${AREA_NAMES[a]}</div>
      <div class="area-card-count">${taskCount} tasks · ${goalCount} goals</div>
      <div class="area-score-row">
        <div class="prog-track" style="flex:1"><div class="prog-fill ${a}-fill" style="width:${score}%"></div></div>
        <div class="area-score-label">${score}%</div>
      </div>
    </div>`;
  }).join('');

  // Balance chart
  const scores = areas.map(a => calcAreaScore(a));
  const ctx = document.getElementById('areas-chart');
  if (areasChartInstance) areasChartInstance.destroy();
  areasChartInstance = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: areas.map(a => AREA_NAMES[a]),
      datasets: [{
        label: 'Focus Score',
        data: scores,
        backgroundColor: 'rgba(108,99,255,.15)',
        borderColor: '#6C63FF',
        borderWidth: 2,
        pointBackgroundColor: '#6C63FF'
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        r: {
          beginAtZero: true, max: 100,
          ticks: { display: false },
          grid: { color: 'rgba(255,255,255,.08)' },
          pointLabels: { color: 'rgba(255,255,255,.6)', font: { size: 12, family: 'Inter' } }
        }
      }
    }
  });
}

function calcAreaScore(area) {
  const tasks = state.tasks.filter(t => t.area === area);
  const done = tasks.filter(t => t.done).length;
  const habits = state.habits.filter(h => h.area === area);
  const habitScore = habits.length ? habits.reduce((sum, h) => sum + (calcStreak(h.checkIns || []) > 0 ? 1 : 0), 0) / habits.length * 50 : 0;
  const taskScore = tasks.length ? (done / tasks.length) * 50 : 0;
  return Math.round(taskScore + habitScore);
}

function setAreaFilter(area) {
  taskAreaFilter = area;
  document.querySelectorAll('.area-filter-btn').forEach(b => b.classList.toggle('active', b.dataset.area === area));
  renderTasks();
}

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
async function logWin(text) {
  const id = uid();
  const data = { id, text, createdAt: Date.now(), date: dk() };
  state.wins.unshift(data);
  await saveDoc('wins', id, data);
  if (currentView === 'wins') renderWins();
}

function renderWins() {
  const el = document.getElementById('wins-list');
  const wins = state.wins.slice(0, 50);
  if (!wins.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🏆</div><p>No wins yet</p><small>Complete tasks and habits to log wins automatically</small></div>`;
    return;
  }
  const trophies = ['🏆', '🥇', '🎯', '✅', '⭐', '💪', '🚀'];
  el.innerHTML = wins.map((w, i) => `
    <div class="win-item">
      <div class="win-emoji">${trophies[i % trophies.length]}</div>
      <div class="win-text">${esc(w.text)}</div>
      <div class="win-time">${new Date(w.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${w.date}</div>
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
    input = `<select id="${id}">${(f.options || []).map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>`;
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
// INIT COMPLETE — await auth state
// ═══════════════════════════════════════════════════════════════
// All boot logic is triggered from auth.onAuthStateChanged above.
// startHourlyNudge is called after launchApp.
console.log('Second Brain v2.0 — Ready');
