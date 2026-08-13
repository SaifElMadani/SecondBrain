// ═══════════════════════════════════════════════════════════════
// CALENDAR — FullCalendar v6 (CDN global builds, no bundler)
// v1.16.0: replaces the CalendarJS CE Schedule/Timeline and the older
// homemade DOM grid entirely. All rendering/navigation is delegated to
// FullCalendar; this module only maps app state → FC events and wires
// clicks back into the app's modals.
// ═══════════════════════════════════════════════════════════════

let calendarInstance = null;

// ───────────────────────────────────────────────────────────────
// EVENT SOURCE MAPPING (state → FullCalendar EventInput[])
// ───────────────────────────────────────────────────────────────

function pad2(n) { return String(n).padStart(2, '0'); }

// 'HH:MM' -> 'HH:MM:00' (FullCalendar wants seconds in local datetime strings)
function fcTime(hhmm) {
  if (!hhmm) return null;
  const m = String(hhmm).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return `${pad2(+m[1])}:${m[2]}:00`;
}

// Default 30-min duration is computed HERE at build time only — it is a
// display default and is never persisted (absence of end stays the stored
// state in Firestore).
function addMinutes(hhmm, mins) {
  const m = String(hhmm).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return hhmm;
  const d = new Date(2000, 0, 1, +m[1], +m[2] + mins);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function buildFcEvent({ id, title, date, startTime, endTime, type, refId }) {
  const cls = `ev-${type}`; // ev-task / ev-goal / ev-event / ev-google / ev-outlook
  const base = { id, title, classNames: [cls], extendedProps: { type, refId } };
  const start = fcTime(startTime);
  if (!start) {
    // All-day event (no start time stored).
    return { ...base, start: date, allDay: true };
  }
  const end = fcTime(endTime) || fcTime(addMinutes(startTime, 30));
  return { ...base, start: `${date}T${start}`, end: `${date}T${end}`, allDay: false };
}

function buildAllEvents() {
  const evs = [];
  (state.tasks || []).filter(t => t.dueDate).forEach(t => {
    evs.push(buildFcEvent({ id: 'task-' + t.id, title: t.title, date: t.dueDate, type: 'task', refId: t.id }));
  });
  (state.goals || []).filter(g => g.deadline).forEach(g => {
    evs.push(buildFcEvent({ id: 'goal-' + g.id, title: '🎯 ' + g.title, date: g.deadline, type: 'goal', refId: g.id }));
  });
  (state.events || []).forEach(e => {
    evs.push(buildFcEvent({
      id: 'evt-' + e.id, title: e.title, date: e.date,
      startTime: e.startTime, endTime: e.endTime, type: 'event', refId: e.id,
    }));
  });
  (state.googleCalendarEvents || []).forEach((e, i) => {
    evs.push(buildFcEvent({
      id: 'gcal-' + (e.id || i), title: e.title, date: e.date,
      startTime: e.startTime, endTime: e.endTime, type: 'google', refId: e.id || 'gcal-' + i,
    }));
  });
  (state.outlookCalendarEvents || []).forEach((e, i) => {
    evs.push(buildFcEvent({
      id: 'ocal-' + (e.id || i), title: e.title, date: e.date,
      startTime: e.startTime, endTime: e.endTime, type: 'outlook', refId: e.id || 'ocal-' + i,
    }));
  });
  return evs;
}

// ───────────────────────────────────────────────────────────────
// CLICKS → APP MODALS
// ───────────────────────────────────────────────────────────────

function onDateClick(info) {
  openAddEventModal(info.dateStr);
}

function onEventClick(info) {
  const { type, refId } = info.event.extendedProps || {};
  if (type === 'task') {
    const t = (state.tasks || []).find(x => x.id === refId);
    if (t) openAddTaskModal('', null, t);
  } else if (type === 'goal') {
    const g = (state.goals || []).find(x => x.id === refId);
    if (g) openAddGoalModal(g);
  } else if (type === 'event') {
    const e = (state.events || []).find(x => x.id === refId);
    if (e) openAppEventModal(e);
  } else {
    // Google / Outlook — readonly detail modal.
    openExternalEventModal({
      title: info.event.title,
      type,
      startStr: info.event.startStr,
      endStr: info.event.endStr,
      allDay: info.event.allDay,
    });
  }
}

// ───────────────────────────────────────────────────────────────
// RENDER / REFRESH
// ───────────────────────────────────────────────────────────────

function ensureCalendar() {
  if (calendarInstance) return true;
  const el = document.getElementById('calendar');
  if (!el || typeof FullCalendar === 'undefined') return false;
  const today = new Date().toISOString().slice(0, 10);
  calendarInstance = new FullCalendar.Calendar(el, {
    initialView: 'dayGridMonth',
    locale: 'fr',
    height: 'auto',
    contentHeight: 'auto',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
    },
    buttonText: { today: "Aujourd'hui", month: 'Mois', week: 'Semaine', day: 'Jour', list: 'Liste' },
    nowIndicator: true,
    dayMaxEvents: 3,
    dateClick: onDateClick,
    eventClick: onEventClick,
    events: buildAllEvents(),
    datesSet: () => syncDatePicker(),
  });
  calendarInstance.render();
  document.getElementById('cal-date-picker').value = today;
  return true;
}

function refreshCalendarEvents() {
  if (!calendarInstance) return;
  calendarInstance.getEventSources().forEach(s => s.remove());
  calendarInstance.addEventSource({ id: 'brain', events: buildAllEvents() });
}

function syncDatePicker() {
  const el = document.getElementById('cal-date-picker');
  if (!el || !calendarInstance) return;
  const d = calendarInstance.getDate();
  el.value = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function renderCalendar() {
  if (typeof FullCalendar === 'undefined') return;
  if (!ensureCalendar()) return;
  refreshCalendarEvents();
}

// ───────────────────────────────────────────────────────────────
// EXTERNAL CALENDAR INTEGRATION
// ───────────────────────────────────────────────────────────────

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

function currentFcRange() {
  if (calendarInstance && calendarInstance.view) {
    return { start: calendarInstance.view.currentStart, end: calendarInstance.view.currentEnd };
  }
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
    end: new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59),
  };
}

async function fetchGoogleCalendarEvents() {
  if (!gapiInited || !gapi.client?.calendar) return;
  try {
    const { start, end } = currentFcRange();
    const response = await gapi.client.calendar.events.list({
      calendarId: 'primary', timeMin: start.toISOString(), timeMax: end.toISOString(),
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
  if (token) gapi.client.setToken('');
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
    const { start, end } = currentFcRange();
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${start.toISOString()}&endDateTime=${end.toISOString()}&$top=50&$orderby=start/dateTime`,
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

// --- TOOLBAR ---
document.getElementById('add-event-btn').addEventListener('click', () => openAddEventModal());
document.getElementById('cal-date-picker').addEventListener('change', e => {
  if (!e.target.value || !calendarInstance) return;
  calendarInstance.gotoDate(new Date(e.target.value + 'T12:00:00'));
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

// ───────────────────────────────────────────────────────────────
// EVENT MODALS (local app events + readonly external view)
// ───────────────────────────────────────────────────────────────

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
      if (typeof renderFamily !== 'undefined' && currentView === 'family') renderFamily();
    }
  });
}

function openAppEventModal(item) {
  const deleteBtn = '<button type="button" class="btn btn-ghost" id="evt-delete-btn" style="margin-bottom:12px;color:var(--family)">🗑 Delete Event</button>';
  openModal({
    title: 'Edit Event / Time Block',
    sub: 'Update or remove this time block',
    customBody: deleteBtn,
    fields: [
      { name: 'title', label: 'Event Title', required: true, value: item.title },
      { name: 'date', label: 'Date', type: 'date', required: true, value: item.date || '' },
      { name: 'startTime', label: 'Start Time', type: 'time', value: item.startTime || '' },
      { name: 'endTime', label: 'End Time', type: 'time', value: item.endTime || '' },
      { name: 'area', label: 'Category', type: 'select', value: item.area || 'personal', options: [['personal', 'Personal'], ['family', 'Family'], ['career', 'Career'], ['finance', 'Finance']] }
    ],
    submit: 'Save Changes',
    onSubmit: async v => {
      Object.assign(item, {
        title: v.title, date: v.date, startTime: v.startTime, endTime: v.endTime, area: v.area,
      });
      await saveDoc('events', item.id, item);
      renderCalendar();
      if (typeof renderFamily !== 'undefined' && currentView === 'family') renderFamily();
    }
  });
  setTimeout(() => {
    const del = document.getElementById('evt-delete-btn');
    if (del) del.addEventListener('click', async () => {
      closeModal();
      state.events = state.events.filter(x => x.id !== item.id);
      await deleteDoc('events', item.id);
      renderCalendar();
      if (typeof renderFamily !== 'undefined' && currentView === 'family') renderFamily();
    });
  }, 0);
}

function openExternalEventModal(ev) {
  const isGoogle = ev.type === 'google';
  const label = isGoogle ? 'Google Calendar' : 'Outlook Calendar';
  const date = ev.startStr ? ev.startStr.slice(0, 10) : '';
  const time = ev.startStr && ev.startStr.length > 10 ? ev.startStr.slice(11, 16) : '';
  openModal({
    title: esc(ev.title),
    sub: label,
    customBody: `<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;font-size:13px;color:var(--text-soft)">
      <div><strong style="color:var(--text)">Date :</strong> ${esc(date || '—')}${time ? ' &nbsp;·&nbsp; ' + esc(time) : ''}</div>
      <div><strong style="color:var(--text)">Source :</strong> ${label}</div>
      <small>Synced read-only event. Edit it in ${label}.</small>
    </div>`,
    fields: [],
    submit: 'Close',
    onSubmit: () => { }
  });
}

export { enableCalButtons, handleGcalAuth, fetchGoogleCalendarEvents, connectGoogleCalendar, disconnectGoogleCalendar, initMSAL, connectOutlookCalendar, fetchOutlookCalendarEvents, disconnectOutlookCalendar, restoreCalendarConnections, renderCalendar, buildAllEvents, openAddEventModal, openAppEventModal, openExternalEventModal };

Object.assign(window, { enableCalButtons, handleGcalAuth, fetchGoogleCalendarEvents, connectGoogleCalendar, disconnectGoogleCalendar, initMSAL, connectOutlookCalendar, fetchOutlookCalendarEvents, disconnectOutlookCalendar, restoreCalendarConnections, renderCalendar, buildAllEvents, openAddEventModal, openAppEventModal, openExternalEventModal });
