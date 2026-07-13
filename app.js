// ─── FIREBASE CONFIGURATION ────────────────────────────
// Create a free project at https://console.firebase.google.com/
// Add a Web App, and replace the placeholder below with your credentials.
const firebaseConfig = {
  apiKey: "AIzaSyAJxEsYONHpHlcQ-p9oeCeYE5svaIQBLDI",
  authDomain: "website-todo-ae952.firebaseapp.com",
  projectId: "website-todo-ae952",
  storageBucket: "website-todo-ae952.firebasestorage.app",
  messagingSenderId: "865375487797",
  appId: "1:865375487797:web:fea94104f6e121a425ae7c",
  measurementId: "G-4MZF4R32P3"
};
// Check if credentials have been set (user is out of LocalStorage fallback mode)
const isFirebaseConfigured = firebaseConfig &&
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== "YOUR_API_KEY" &&
  firebaseConfig.apiKey.trim() !== "";

let auth, db;
let unsubscribeSync = null; // Listener reference to turn off sync on logout

if (isFirebaseConfigured) {
  try {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
  } catch (e) {
    console.error("Firebase initialization failed:", e);
  }
}

/* ─── STORAGE ─────────────────────────────────────────── */
const KEY = 'myspace_v1';

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function dk(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDefaultState() {
  return {
    objectives: [
      { id: uid(), title: 'Run a half marathon', note: 'Build up weekly mileage by 10%.', progress: 30 },
      { id: uid(), title: 'Read 12 books this year', note: 'Fiction and non-fiction.', progress: 50 },
    ],
    fields: [
      { id: uid(), name: 'Photography', note: 'Shooting with a 35mm lens more often.' },
      { id: uid(), name: 'Cooking', note: 'Learning French techniques.' },
      { id: uid(), name: 'Cycling', note: 'Weekend rides, building to a century.' },
    ],
    todos: [
      { id: uid(), text: 'Review morning pages', priority: 'low', done: false, date: dk() },
      { id: uid(), text: 'Plan next week', priority: 'high', done: false, date: dk() },
    ],
    events: {}
  };
}

function loadLocalStorage() {
  try {
    const r = localStorage.getItem(KEY);
    if (r) return JSON.parse(r);
  } catch (e) {
    console.error("Failed to load state from localStorage:", e);
  }
  return getDefaultState();
}

let state = getDefaultState();
let todoFilter = 'all';
let calYear, calMonth;
const now = new Date();
calYear = now.getFullYear();
calMonth = now.getMonth();

function save() {
  // Always update LocalStorage backup
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Failed to save state to localStorage:", e);
  }

  // Write to Firebase Firestore if online
  if (isFirebaseConfigured && auth && auth.currentUser) {
    const userDocRef = db.collection("users").doc(auth.currentUser.uid);
    userDocRef.set(state).catch(e => {
      console.error("Error saving state to Firestore:", e);
    });
  }
}

/* ─── NAV & VIEW MANAGEMENT ────────────────────────────── */
const TITLES = {
  overview: ['Overview', 'Your space at a glance'],
  objectives: ['Objectives', 'Track what matters most'],
  fields: ['Interests', 'The subjects you keep returning to'],
  todos: ['To-do', 'Tasks, plain and simple'],
  calendar: ['Calendar', 'Notes and occasions by day'],
};
let currentView = 'overview';

function goTo(v) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === v));
  document.querySelectorAll('.view').forEach(vw => vw.classList.toggle('active', vw.id === `view-${v}`));

  const [t, s] = TITLES[v] || ['', ''];
  document.getElementById('topbarTitle').textContent = t;
  document.getElementById('topbarSub').textContent = s;

  const act = document.getElementById('topbarAction');
  act.innerHTML = '';

  if (v === 'objectives') {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = '+ New objective';
    b.onclick = openAddObjective;
    act.appendChild(b);
  }
  if (v === 'fields') {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = '+ New interest';
    b.onclick = openAddField;
    act.appendChild(b);
  }

  currentView = v;
  if (v === 'overview') renderOverview();
  if (v === 'objectives') renderObjectives();
  if (v === 'fields') renderFields();
  if (v === 'todos') renderTodos();
  if (v === 'calendar') renderCalendar();
}

// Nav items click listener with mobile menu closing integration
const appEl = document.querySelector('.app');
document.querySelectorAll('.nav-item').forEach(n => {
  n.addEventListener('click', () => {
    goTo(n.dataset.view);
    if (appEl) {
      appEl.classList.remove('sidebar-open');
    }
  });
});

/* ─── MOBILE DRAWER TOGGLE ────────────────────────────── */
const menuToggle = document.getElementById('menu-toggle');
const sidebarOverlay = document.getElementById('sidebar-overlay');

if (menuToggle && appEl) {
  menuToggle.addEventListener('click', () => {
    appEl.classList.add('sidebar-open');
  });
}

if (sidebarOverlay && appEl) {
  sidebarOverlay.addEventListener('click', () => {
    appEl.classList.remove('sidebar-open');
  });
}

/* ─── SIDEBAR DATE ────────────────────────────────────── */
function renderSidebarDate() {
  const d = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dateEl = document.getElementById('sidebarDate');
  if (dateEl) {
    dateEl.innerHTML = `<strong>${days[d.getDay()]}</strong>${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }
}
renderSidebarDate();

/* ─── OVERVIEW ────────────────────────────────────────── */
function doy(d = new Date()) {
  return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
}

function renderOverview() {
  const d = new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const doyEl = document.getElementById('ov-doy');
  const doySubEl = document.getElementById('ov-doy-sub');
  const todosEl = document.getElementById('ov-todos');
  const fieldsEl = document.getElementById('ov-fields');

  if (doyEl) doyEl.textContent = doy(d);
  if (doySubEl) doySubEl.textContent = `${months[d.getMonth()]} ${d.getFullYear()} · day of year`;

  const openTodosCount = state.todos.filter(t => !t.done).length;
  if (todosEl) todosEl.textContent = openTodosCount;
  if (fieldsEl) fieldsEl.textContent = state.fields.length;

  // Objectives progress
  const ob = document.getElementById('ov-objectives');
  if (ob) {
    if (!state.objectives.length) {
      ob.innerHTML = '<div class="empty" style="padding:16px 0"><div class="empty-icon">◎</div>No objectives yet</div>';
    } else {
      ob.innerHTML = state.objectives.map(o => `
        <div class="prog-row">
          <div class="prog-meta">
            <span class="prog-name">${esc(o.title)}</span>
            <span class="prog-pct">${o.progress}%</span>
          </div>
          <div class="prog-track">
            <div class="prog-fill" style="width:${o.progress}%"></div>
          </div>
        </div>`).join('');
    }
  }

  // Upcoming events
  const up = document.getElementById('ov-upcoming');
  if (up) {
    const today = dk();
    const upcoming = [];
    Object.keys(state.events).forEach(k => {
      if (k >= today) {
        state.events[k].forEach(ev => upcoming.push({ ...ev, dateKey: k }));
      }
    });
    upcoming.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
    if (!upcoming.length) {
      up.innerHTML = '<div class="empty" style="padding:16px 0"><div class="empty-icon">◫</div>Nothing upcoming</div>';
    } else {
      up.innerHTML = upcoming.slice(0, 5).map(ev => {
        const parts = ev.dateKey.split('-');
        const label = `${months[parseInt(parts[1]) - 1]} ${parseInt(parts[2])}`;
        return `<div class="upcoming-row">
          <span class="upcoming-date">${label}</span>
          <span class="upcoming-title">${esc(ev.title)}</span>
        </div>`;
      }).join('');
    }
  }

  // Today tasks
  const tk = document.getElementById('ov-tasks');
  if (tk) {
    const today = dk();
    const todayTasks = state.todos.filter(t => t.date === today && !t.done);
    if (!todayTasks.length) {
      tk.innerHTML = '<div class="empty" style="padding:16px 0"><div class="empty-icon">☐</div>Nothing for today</div>';
    } else {
      tk.innerHTML = `<ul class="mini-list">` + todayTasks.slice(0, 6).map(t => `
        <li class="mini-item">
          <span class="mini-dot"></span>
          <span class="mini-name">${esc(t.text)}</span>
          <span class="mini-badge ${t.priority}">${t.priority}</span>
        </li>`).join('') + `</ul>`;
    }
  }

  // Chips
  const ch = document.getElementById('ov-chips');
  if (ch) {
    if (!state.fields.length) {
      ch.innerHTML = '<span style="color:var(--text-muted);font-size:13px">No interests yet</span>';
    } else {
      ch.innerHTML = state.fields.map(f => `<span class="chip">${esc(f.name)}</span>`).join('');
    }
  }
}

/* ─── OBJECTIVES ──────────────────────────────────────── */
function renderObjectives() {
  const list = document.getElementById('obj-list');
  if (!list) return;
  if (!state.objectives.length) {
    list.innerHTML = `<div class="empty"><div class="empty-icon">◎</div>No objectives yet. Add one to start tracking.</div>`;
    return;
  }
  list.innerHTML = state.objectives.map(o => {
    const r = 30, c = 2 * Math.PI * r, off = c * (1 - o.progress / 100);
    return `<div class="obj-card" data-id="${o.id}">
      <div class="ring-wrap" style="width:68px;height:68px">
        <svg width="68" height="68" viewBox="0 0 68 68">
          <circle cx="34" cy="34" r="${r}" fill="none" stroke="var(--surface2)" stroke-width="7"/>
          <circle cx="34" cy="34" r="${r}" fill="none" stroke="var(--moss-light)" stroke-width="7"
            stroke-linecap="round" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"
            transform="rotate(-90 34 34)"/>
        </svg>
        <div class="ring-label">${o.progress}%</div>
      </div>
      <div class="obj-body">
        <div class="obj-title">${esc(o.title)}</div>
        ${o.note ? `<div class="obj-note">${esc(o.note)}</div>` : ''}
        <div class="obj-track"><div class="obj-fill" style="width:${o.progress}%"></div></div>
      </div>
      <div class="obj-right">
        <div class="stepper">
          <button data-act="dec">−</button>
          <span>${o.progress}%</span>
          <button data-act="inc">+</button>
        </div>
        <button class="icon-btn-sm" data-act="del">Remove</button>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.obj-card').forEach(card => {
    const id = card.dataset.id;
    const o = state.objectives.find(x => x.id === id);
    card.querySelector('[data-act="inc"]').onclick = () => { o.progress = Math.min(100, o.progress + 10); save(); renderObjectives(); };
    card.querySelector('[data-act="dec"]').onclick = () => { o.progress = Math.max(0, o.progress - 10); save(); renderObjectives(); };
    card.querySelector('[data-act="del"]').onclick = () => { state.objectives = state.objectives.filter(x => x.id !== id); save(); renderObjectives(); };
  });
}

function openAddObjective() {
  openModal({
    title: 'New objective',
    sub: 'A longer arc worth tracking.',
    fields: [
      { name: 'title', label: 'Title', placeholder: 'e.g. Learn a new language', required: true },
      { name: 'note', label: 'Note (optional)', type: 'textarea', placeholder: 'Why does this matter?' },
    ],
    submit: 'Add objective',
    onSubmit(v) {
      state.objectives.push({ id: uid(), title: v.title, note: v.note || '', progress: 0 });
      save();
      renderObjectives();
    }
  });
}

/* ─── INTERESTS ──────────────────────────────────────────── */
function renderFields() {
  const grid = document.getElementById('fields-grid');
  if (!grid) return;
  if (!state.fields.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="empty-icon">◇</div>No interests yet. Add a subject you keep returning to.</div>`;
    return;
  }
  grid.innerHTML = state.fields.map(f => `
    <div class="field-card" data-id="${f.id}">
      <button class="field-del" data-act="del" aria-label="Remove">×</button>
      <div class="field-name">${esc(f.name)}</div>
      ${f.note ? `<div class="field-note">${esc(f.note)}</div>` : ''}
    </div>`).join('');
  grid.querySelectorAll('.field-card').forEach(card => {
    const id = card.dataset.id;
    card.querySelector('[data-act="del"]').onclick = () => { state.fields = state.fields.filter(x => x.id !== id); save(); renderFields(); };
  });
}

function openAddField() {
  openModal({
    title: 'New interest',
    sub: 'A subject that keeps pulling you back.',
    fields: [
      { name: 'name', label: 'Name', placeholder: 'e.g. Ceramics', required: true },
      { name: 'note', label: 'Note (optional)', type: 'textarea', placeholder: 'What draws you to it right now.' },
    ],
    submit: 'Add interest',
    onSubmit(v) {
      state.fields.push({ id: uid(), name: v.name, note: v.note || '' });
      save();
      renderFields();
    }
  });
}

/* ─── TO-DO ───────────────────────────────────────────── */
const todoAddBtn = document.getElementById('todo-add-btn');
const todoInput = document.getElementById('todo-input');

if (todoAddBtn) {
  todoAddBtn.onclick = addTodo;
}
if (todoInput) {
  todoInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') addTodo();
  });
}

function addTodo() {
  const input = document.getElementById('todo-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  const pri = document.getElementById('todo-priority').value;
  state.todos.unshift({ id: uid(), text, priority: pri, done: false, date: dk() });
  input.value = '';
  save();
  renderTodos();
}

document.querySelectorAll('.filter-btn').forEach(b => b.addEventListener('click', () => {
  todoFilter = b.dataset.filter;
  document.querySelectorAll('.filter-btn').forEach(x => x.classList.toggle('active', x === b));
  renderTodos();
}));

function renderTodos() {
  let items = state.todos;
  if (todoFilter === 'open') items = items.filter(t => !t.done);
  if (todoFilter === 'done') items = items.filter(t => t.done);

  const list = document.getElementById('todo-list');
  if (!list) return;
  if (!items.length) {
    list.innerHTML = `<div class="empty"><div class="empty-icon">☐</div>No entries here.</div>`;
    return;
  }
  list.innerHTML = items.map(t => `
    <li class="entry-item${t.done ? ' done' : ''}" data-id="${t.id}">
      <button class="entry-check" aria-label="Toggle done"></button>
      <span class="entry-text">${esc(t.text)}</span>
      <span class="entry-pri ${t.priority}">${t.priority}</span>
      <button class="del-btn" data-act="del" aria-label="Remove">×</button>
    </li>`).join('');
  list.querySelectorAll('.entry-item').forEach(li => {
    const id = li.dataset.id;
    const t = state.todos.find(x => x.id === id);
    li.querySelector('.entry-check').onclick = () => { t.done = !t.done; save(); renderTodos(); };
    li.querySelector('[data-act="del"]').onclick = () => { state.todos = state.todos.filter(x => x.id !== id); save(); renderTodos(); };
  });
}

/* ─── CALENDAR ────────────────────────────────────────── */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const calPrevBtn = document.getElementById('cal-prev');
const calNextBtn = document.getElementById('cal-next');
const calTodayBtn = document.getElementById('cal-today-btn');
const calWeekdaysEl = document.getElementById('cal-weekdays');

if (calPrevBtn) {
  calPrevBtn.onclick = () => {
    calMonth--;
    if (calMonth < 0) {
      calMonth = 11;
      calYear--;
    }
    renderCalendar();
  };
}
if (calNextBtn) {
  calNextBtn.onclick = () => {
    calMonth++;
    if (calMonth > 11) {
      calMonth = 0;
      calYear++;
    }
    renderCalendar();
  };
}
if (calTodayBtn) {
  calTodayBtn.onclick = () => {
    const n = new Date();
    calYear = n.getFullYear();
    calMonth = n.getMonth();
    renderCalendar();
  };
}
if (calWeekdaysEl) {
  calWeekdaysEl.innerHTML = WDAYS.map(d => `<span>${d}</span>`).join('');
}

function renderCalendar() {
  const titleEl = document.getElementById('cal-title');
  if (titleEl) {
    titleEl.textContent = `${MONTHS[calMonth]} ${calYear}`;
  }
  const grid = document.getElementById('cal-days');
  if (!grid) return;
  grid.innerHTML = '';

  const first = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const prevDays = new Date(calYear, calMonth, 0).getDate();
  const totalCells = Math.ceil((first + daysInMonth) / 7) * 7;
  const todayStr = dk();

  for (let i = 0; i < totalCells; i++) {
    const offset = i - first;
    let d, outside = false;
    if (offset < 0) {
      d = new Date(calYear, calMonth - 1, prevDays + offset + 1);
      outside = true;
    } else if (offset >= daysInMonth) {
      d = new Date(calYear, calMonth + 1, offset - daysInMonth + 1);
      outside = true;
    } else {
      d = new Date(calYear, calMonth, offset + 1);
    }
    const key = dk(d);
    const evs = state.events[key] || [];
    const isToday = key === todayStr;
    const cell = document.createElement('div');
    cell.className = 'cal-day' + (outside ? ' outside' : '') + (isToday ? ' today' : '');
    cell.innerHTML = `<div class="day-num">${d.getDate()}</div>
      <div class="day-events">
        ${evs.slice(0, 2).map(ev => `<div class="day-ev">${esc(ev.title)}</div>`).join('')}
        ${evs.length > 2 ? `<div class="day-ev-more">+${evs.length - 2} more</div>` : ''}
      </div>`;
    if (!outside) {
      cell.addEventListener('click', () => openDayModal(key, d));
    }
    grid.appendChild(cell);
  }
}

function openDayModal(key, d) {
  const evs = state.events[key] || [];
  const label = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const modal = document.getElementById('modal');
  if (!modal) return;

  modal.innerHTML = `
    <h3>${label}</h3>
    <p class="modal-sub">Notes and occasions for this day.</p>
    <div id="modal-evs">
      ${!evs.length ? '<p style="color:var(--text-muted);font-size:13px;margin:10px 0">Nothing here yet.</p>' :
      evs.map(ev => `<div class="modal-ev-row" data-id="${ev.id}">
          <span style="flex:1">${esc(ev.title)}</span>
          <button class="del-btn" data-act="del-ev">×</button>
        </div>`).join('')}
    </div>
    <label for="modal-ev-input">Add a note or occasion</label>
    <input type="text" id="modal-ev-input" placeholder="e.g. Team lunch">
    <div class="modal-actions">
      <button class="btn btn-ghost" id="modal-close">Close</button>
      <button class="btn" id="modal-add-ev">Add</button>
    </div>`;

  modal.querySelectorAll('[data-act="del-ev"]').forEach(btn => {
    const id = btn.closest('.modal-ev-row').dataset.id;
    btn.onclick = () => {
      state.events[key] = (state.events[key] || []).filter(e => e.id !== id);
      if (!state.events[key].length) delete state.events[key];
      save();
      renderCalendar();
      openDayModal(key, d);
    };
  });

  modal.querySelector('#modal-add-ev').onclick = () => {
    const inp = modal.querySelector('#modal-ev-input');
    const title = inp.value.trim();
    if (!title) return;
    if (!state.events[key]) state.events[key] = [];
    state.events[key].push({ id: uid(), title });
    save();
    renderCalendar();
    openDayModal(key, d);
  };

  modal.querySelector('#modal-ev-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') modal.querySelector('#modal-add-ev').click();
  });

  modal.querySelector('#modal-close').onclick = closeModal;
  document.getElementById('modal-bg').classList.add('open');
  setTimeout(() => {
    const inp = modal.querySelector('#modal-ev-input');
    if (inp) inp.focus();
  }, 50);
}

/* ─── GENERIC MODAL ───────────────────────────────────── */
const modalBg = document.getElementById('modal-bg');
if (modalBg) {
  modalBg.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

function closeModal() {
  const bg = document.getElementById('modal-bg');
  if (bg) bg.classList.remove('open');
}

function openModal({ title, sub, fields, submit, onSubmit }) {
  const modal = document.getElementById('modal');
  if (!modal) return;

  modal.innerHTML = `<h3>${title}</h3>${sub ? `<p class="modal-sub">${sub}</p>` : ''}
    <form id="gen-form">
      ${fields.map(f => `
        <label for="f_${f.name}">${f.label}</label>
        ${f.type === 'textarea'
      ? `<textarea id="f_${f.name}" name="${f.name}" placeholder="${f.placeholder || ''}"></textarea>`
      : `<input type="text" id="f_${f.name}" name="${f.name}" placeholder="${f.placeholder || ''}" ${f.required ? 'required' : ''}>`
    }`).join('')}
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="modal-cancel">Cancel</button>
        <button type="submit" class="btn">${submit}</button>
      </div>
    </form>`;

  modal.querySelector('#modal-cancel').onclick = closeModal;
  modal.querySelector('#gen-form').onsubmit = e => {
    e.preventDefault();
    const vals = {};
    fields.forEach(f => vals[f.name] = modal.querySelector(`#f_${f.name}`).value.trim());
    onSubmit(vals);
    closeModal();
  };

  document.getElementById('modal-bg').classList.add('open');
  setTimeout(() => {
    const focusEl = modal.querySelector('input,textarea');
    if (focusEl) focusEl.focus();
  }, 50);
}

/* ─── UTIL ────────────────────────────────────────────── */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ─── FIREBASE REALTIME SYNC & AUTH LOGIC ─────────────────── */
const viewLogin = document.getElementById('view-login');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const loginToggleBtn = document.getElementById('login-toggle-btn');
const loginBtnText = document.getElementById('login-btn-text');
const loginSpinner = document.getElementById('login-spinner');
const logoutBtn = document.getElementById('logout-btn');

let isSignUpMode = false; // Sign In mode by default

// Set up UI toggle between Sign In and Sign Up modes
if (loginToggleBtn) {
  loginToggleBtn.addEventListener('click', () => {
    isSignUpMode = !isSignUpMode;
    const titleText = document.getElementById('login-title-text');
    const subtitleText = document.getElementById('login-subtitle-text');
    const toggleContainer = document.getElementById('login-toggle-container');

    if (isSignUpMode) {
      if (titleText) titleText.textContent = "Create an Account";
      if (subtitleText) subtitleText.textContent = "Sign up to start saving and syncing your data";
      if (loginBtnText) loginBtnText.textContent = "Sign Up";
      if (toggleContainer) toggleContainer.innerHTML = 'Already have an account?<span id="login-toggle-btn">Sign In</span>';
    } else {
      if (titleText) titleText.textContent = "Welcome to My Space";
      if (subtitleText) subtitleText.textContent = "Sign in to access your personal dashboard";
      if (loginBtnText) loginBtnText.textContent = "Sign In";
      if (toggleContainer) toggleContainer.innerHTML = 'Don\'t have an account?<span id="login-toggle-btn">Sign Up</span>';
    }

    // Re-bind click event to the new button since innerHTML was changed
    const newToggleBtn = document.getElementById('login-toggle-btn');
    if (newToggleBtn) {
      newToggleBtn.onclick = () => loginToggleBtn.click();
    }
  });
}

function showSpinner(show) {
  if (loginSpinner) loginSpinner.classList.toggle('visible', show);
  const submitBtn = document.getElementById('login-submit-btn');
  if (submitBtn) submitBtn.disabled = show;
}

// Bind Log Out action
if (logoutBtn) {
  logoutBtn.style.display = isFirebaseConfigured ? 'flex' : 'none';
  logoutBtn.addEventListener('click', () => {
    if (isFirebaseConfigured && auth) {
      auth.signOut().catch(e => console.error("Sign-out error:", e));
    }
  });
}

// Handle Form Submission (Sign in / Sign up)
if (loginForm && isFirebaseConfigured) {
  loginForm.addEventListener('submit', e => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (loginError) {
      loginError.classList.remove('visible');
      loginError.textContent = '';
    }
    showSpinner(true);

    const action = isSignUpMode
      ? auth.createUserWithEmailAndPassword(email, password)
      : auth.signInWithEmailAndPassword(email, password);

    action.then(() => {
      showSpinner(false);
      loginForm.reset();
    }).catch(err => {
      showSpinner(false);
      console.error("Auth error:", err);
      if (loginError) {
        loginError.classList.add('visible');
        loginError.textContent = getFriendlyErrorMessage(err.code);
      }
    });
  });
}

function getFriendlyErrorMessage(code) {
  switch (code) {
    case 'auth/invalid-email': return 'Invalid email address format.';
    case 'auth/user-disabled': return 'This user account has been disabled.';
    case 'auth/user-not-found': return 'No account found with this email.';
    case 'auth/wrong-password': return 'Incorrect password. Please try again.';
    case 'auth/email-already-in-use': return 'An account already exists with this email.';
    case 'auth/weak-password': return 'Password should be at least 6 characters.';
    case 'auth/invalid-credential': return 'Invalid credentials. Double check details.';
    default: return 'An error occurred during authentication: ' + code;
  }
}

/* ─── INITIALIZATION ──────────────────────────────────── */
if (isFirebaseConfigured && auth) {
  // Listen for Authentication States
  auth.onAuthStateChanged(user => {
    if (user) {
      // User is logged in
      if (viewLogin) viewLogin.classList.remove('active');

      // Start Real-time Database Synchronization
      const userDocRef = db.collection("users").doc(user.uid);
      unsubscribeSync = userDocRef.onSnapshot(docSnap => {
        if (docSnap.exists) {
          // Cloud database state loaded - update application state and refresh screen
          state = docSnap.data();
          // Backward compatibility check (ensure events object exists)
          if (!state.events) state.events = {};
          renderOverview();
          // Update local backup
          localStorage.setItem(KEY, JSON.stringify(state));
        } else {
          // Database is empty (new account) - write current local state as initial db seed
          state = loadLocalStorage();
          userDocRef.set(state).catch(e => console.error("Initial database seed failed:", e));
        }
      });

    } else {
      // User is logged out
      if (unsubscribeSync) {
        unsubscribeSync();
        unsubscribeSync = null;
      }
      // Show login overlay screen
      if (viewLogin) viewLogin.classList.add('active');
    }
  });
} else {
  // Offline mode (LocalStorage Only) - bypass login screen entirely
  if (viewLogin) viewLogin.classList.remove('active');
  state = loadLocalStorage();
  renderOverview();
}
