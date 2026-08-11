// ═══════════════════════════════════════════════════════════════
// CALENDAR
// ═══════════════════════════════════════════════════════════════
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
let calView = 'month';
let refDate = new Date();
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();

function normalize(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function weekStartOf(d) { const x = normalize(d); x.setDate(x.getDate() - x.getDay()); return x; }
function addDays(d, n) { const x = normalize(d); x.setDate(x.getDate() + n); return x; }
function addMonths(d, n) { const x = normalize(d); x.setMonth(x.getMonth() + n); return x; }

function setCalView(view) {
  calView = view;
  document.getElementById('cal-view-month').classList.toggle('active', view === 'month');
  document.getElementById('cal-view-week').classList.toggle('active', view === 'week');
  renderCalendar();
}

document.getElementById('cal-prev').addEventListener('click', () => {
  refDate = calView === 'week' ? addDays(refDate, -7) : addMonths(refDate, -1);
  renderCalendar();
});
document.getElementById('cal-next').addEventListener('click', () => {
  refDate = calView === 'week' ? addDays(refDate, 7) : addMonths(refDate, 1);
  renderCalendar();
});
document.getElementById('cal-today').addEventListener('click', () => { refDate = new Date(); renderCalendar(); });
document.getElementById('cal-week-next').addEventListener('click', () => { refDate = addDays(refDate, 7); renderCalendar(); });
document.getElementById('cal-month-next').addEventListener('click', () => { refDate = addMonths(refDate, 1); renderCalendar(); });
document.getElementById('cal-view-month').addEventListener('click', () => setCalView('month'));
document.getElementById('cal-view-week').addEventListener('click', () => setCalView('week'));
document.getElementById('cal-date-picker').addEventListener('change', e => {
  if (!e.target.value) return;
  const d = new Date(e.target.value + 'T00:00:00');
  if (isNaN(d)) return;
  refDate = d;
  renderCalendar();
});
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

function buildDayCell(d, key, todayStr, outside) {
  const dayEvents = getEventsForDate(key);
  const cell = document.createElement('div');
  cell.className = `cal-day${outside ? ' outside' : ''}${key === todayStr ? ' today' : ''}`;
  cell.innerHTML = `
    <div class="day-num">${d.getDate()}</div>
    <div class="day-evs">
      ${dayEvents.slice(0, 3).map(e => {
        const icon = e.type === 'task' ? '☑️' : e.type === 'goal' ? '🎯' : e.type === 'family' ? '👨‍👩‍👧' : '📅';
        const cls = e.type === 'task' ? 'task' : e.type === 'goal' ? 'goal' : (e.source || e.area || 'personal');
        const taskEdit = e.type === 'task' && e.id
          ? ` onclick="event.stopPropagation();openAddTaskModal('', null, state.tasks.find(x=>x.id==='${e.id}'))" style="cursor:pointer" title="Edit task"`
          : '';
        return `<div class="day-ev ${cls}"${taskEdit}>${icon} ${esc(e.title)}</div>`;
      }).join('')}
      ${dayEvents.length > 3 ? `<div class="day-ev-more">+${dayEvents.length - 3} more</div>` : ''}
    </div>`;
  if (!outside) cell.addEventListener('click', () => openAddEventModal(key));
  return cell;
}

function renderCalendar() {
  const weekdays = document.getElementById('cal-weekdays');
  const grid = document.getElementById('cal-days');
  grid.classList.toggle('week-view', calView === 'week');
  grid.innerHTML = '';
  const todayStr = dk();

  if (calView === 'week') {
    const ws = weekStartOf(refDate);
    calYear = ws.getFullYear();
    calMonth = ws.getMonth();
    document.getElementById('cal-title').textContent = `${MONTHS[calMonth]} ${calYear}`;
    weekdays.innerHTML = WDAYS.map((d, i) => {
      const wd = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + i);
      const isToday = dk(wd) === todayStr;
      return `<div class="cal-weekday${isToday ? ' today' : ''}">${d}<span class="cal-weekday-date">${wd.getDate()}</span></div>`;
    }).join('');
    for (let i = 0; i < 7; i++) {
      const d = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + i);
      grid.appendChild(buildDayCell(d, dk(d), todayStr, false));
    }
    return;
  }

  calYear = refDate.getFullYear();
  calMonth = refDate.getMonth();
  document.getElementById('cal-title').textContent = `${MONTHS[calMonth]} ${calYear}`;
  weekdays.innerHTML = WDAYS.map(d => `<div class="cal-weekday">${d}</div>`).join('');

  const first = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const prevDays = new Date(calYear, calMonth, 0).getDate();
  const totalCells = Math.ceil((first + daysInMonth) / 7) * 7;

  for (let i = 0; i < totalCells; i++) {
    const offset = i - first;
    let d, outside = false;
    if (offset < 0) { d = new Date(calYear, calMonth - 1, prevDays + offset + 1); outside = true; }
    else if (offset >= daysInMonth) { d = new Date(calYear, calMonth + 1, offset - daysInMonth + 1); outside = true; }
    else { d = new Date(calYear, calMonth, offset + 1); }
    grid.appendChild(buildDayCell(d, dk(d), todayStr, outside));
  }
}

function getEventsForDate(dateStr) {
  // From local tasks with due dates
  const taskEvents = state.tasks
    .filter(t => t.dueDate === dateStr)
    .map(t => ({ title: t.title, area: t.area, type: 'task', id: t.id }));
  // From goals with a target date (deadline)
  const goalEvents = (state.goals || [])
    .filter(g => g.deadline === dateStr)
    .map(g => ({ title: g.title, area: g.area, type: 'goal', id: g.id }));
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
  return [...taskEvents, ...goalEvents, ...familyEvents, ...localEvents, ...googleEvents, ...outlookEvents];
}

function openAddEventModal(prefillDate = null) {
  openModal({
    title: 'Add Event / Time Block',
    sub: 'Block time on your calendar',
    fields: [
      { name: 'title', label: 'Event Title', placeholder: 'e.g. Doctor\'s appointment', required: true },
      { name: 'date', label: 'Date', type: 'date', required: true, value: prefillDate || '' },
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


export { enableCalButtons, handleGcalAuth, fetchGoogleCalendarEvents, connectGoogleCalendar, disconnectGoogleCalendar, initMSAL, connectOutlookCalendar, fetchOutlookCalendarEvents, disconnectOutlookCalendar, restoreCalendarConnections, renderCalendar, getEventsForDate, openAddEventModal };

Object.assign(window, { enableCalButtons, handleGcalAuth, fetchGoogleCalendarEvents, connectGoogleCalendar, disconnectGoogleCalendar, initMSAL, connectOutlookCalendar, fetchOutlookCalendarEvents, disconnectOutlookCalendar, restoreCalendarConnections, renderCalendar, getEventsForDate, openAddEventModal });
