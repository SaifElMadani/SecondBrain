// ─── LOGOUT ──────────────────────────────────────────────────
document.getElementById('logout-btn').addEventListener('click', () => {
  stopWaterReminder();
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
  renderBottomNav();
  migrateOrphanTasksAndHabits();
  checkRitual();
  startHourlyNudge();
  startWaterReminder();
  updateInboxBadge();
  restoreCalendarConnections();
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

export { launchApp, checkOnboarding, showObStep, friendlyAuthError, showAuthSpinner };

Object.assign(window, { launchApp, checkOnboarding, showObStep, friendlyAuthError, showAuthSpinner });
