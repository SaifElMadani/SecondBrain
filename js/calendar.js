// ═══════════════════════════════════════════════════════════════
// CALENDAR — FullCalendar v6 (CDN global builds, no bundler)
// v1.16.0: replaces the CalendarJS CE Schedule/Timeline and the older
// homemade DOM grid entirely. All rendering/navigation is delegated to
// FullCalendar; this module only maps app state → FC events and wires
// clicks back into the app's modals.
// v1.19.0: local "events" were merged into Tasks — Task is now the ONLY
// creatable object for the calendar (date click / "+ Task" both open the
// Add Task modal). Recurring tasks use FC native recurrence (daysOfWeek
// + startRecur/endRecur) for daily/weekly and the rrule plugin for
// monthly; every rendered occurrence shows a per-instance checkbox
// (completions[dateKey]), title (edit the whole series) and skip button
// (exceptions).
// v1.20.0 fixes:
//   A1 — height:'100%' so timegrid fills the available space.
//   A2 — taskOccurrenceContent returns TRUE (not null/undefined) for non-
//        recurring / non-task events so FC uses default title rendering
//        (null/undefined both render an EMPTY event in FC v6 — only `true`
//        falls back to default content; corrected in v1.20.1).
//   B  — quick-create popover, selectable drag-to-fill, hover checkbox.
// v1.21.0: quick-recurrence chips in the popover (Une fois / Tous les jours
// / Chaque semaine / Chaque mois) — a chip click creates the task immediately
// with sensible defaults (weekly → weekday of the clicked slot, monthly → same
// day of month, no end date). The last chip is remembered so "Plus d'options"
// pre-fills the full modal with that recurrence, editable from there.
// v1.22.0: the chips moved to the SHARED js/recur.js module — the popover and
// the Add/Edit Task modal render the exact same component (recurChipsHtml),
// build rules through buildQuickRecurrence and dispatch every click through
// the single onRecurChipClick entry point → no duplicated markup/logic.
// ═══════════════════════════════════════════════════════════════

import { recurChipsHtml, buildQuickRecurrence, setRecurChipsHighlight } from './recur.js';

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
// state in Firestore). Confirmed still in place after the v1.19.0
// events→tasks fusion.
function addMinutes(hhmm, mins) {
  const m = String(hhmm).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return hhmm;
  const d = new Date(2000, 0, 1, +m[1], +m[2] + mins);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function buildFcEvent({ id, title, date, startTime, endTime, type, refId }) {
  const cls = `ev-${type}`; // ev-task / ev-goal / ev-google / ev-outlook
  const base = { id, title, classNames: [cls], extendedProps: { type, refId } };
  const start = fcTime(startTime);
  if (!start) {
    // All-day event (no start time stored).
    return { ...base, start: date, allDay: true };
  }
  const end = fcTime(endTime) || fcTime(addMinutes(startTime, 30));
  return { ...base, start: `${date}T${start}`, end: `${date}T${end}`, allDay: false };
}

// Recurring task → FullCalendar recurring-event spec. Uses FC's native
// recurrence (startRecur / endRecur / daysOfWeek) for daily & weekly, and
// the rrule plugin for monthly. endDate is inclusive → FC's endRecur is
// exclusive, so we bump it by one day (rrule's `until` is inclusive).
function nextDayKey(dateKey) {
  const d = new Date(dateKey + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return dk(d);
}

function buildTaskRecurringEvent(t) {
  const rec = t.recurrence;
  const base = {
    id: 'task-' + t.id,
    title: t.title,
    groupId: 'grp-' + t.id,
    classNames: ['ev-task', 'ev-task-recurring'],
    extendedProps: { type: 'task', refId: t.id },
  };
  const startRecur = t.dueDate;
  const endRecur = rec.endDate || null;

  if (rec.frequency === 'monthly' || rec.frequency === '3_months') {
    // Monthly (and every-3-months) requires the rrule plugin — FC's native
    // recurrence only supports daily/weekly (daysOfWeek). Object form: no
    // RRule global needed; a missing time part in dtstart is treated as
    // all-day. v1.24.0: '3_months' = monthly at interval 3.
    // `until` is inclusive — use end-of-day so timed occurrences on the
    // last day are kept.
    const rrule = { freq: 'monthly', dtstart: `${startRecur}T00:00:00` };
    if (rec.frequency === '3_months') rrule.interval = 3;
    if (t.startTime) rrule.dtstart = `${startRecur}T${fcTime(t.startTime)}`;
    if (endRecur) rrule.until = `${endRecur}T23:59:59`;
    base.rrule = rrule;
    base.allDay = !t.startTime;
    return base;
  }

  base.startRecur = startRecur;
  if (endRecur) base.endRecur = nextDayKey(endRecur); // FC endRecur is exclusive
  if (rec.frequency === 'weekly' && rec.daysOfWeek && rec.daysOfWeek.length) {
    base.daysOfWeek = rec.daysOfWeek;
  }
  // daily: no daysOfWeek → every day
  if (t.startTime) {
    base.startTime = fcTime(t.startTime);
    base.endTime = fcTime(t.endTime) || fcTime(addMinutes(t.startTime, 30));
  }
  return base;
}

function buildAllEvents() {
  const evs = [];
  (state.tasks || []).filter(t => t.dueDate).forEach(t => {
    if (t.recurrence) {
      evs.push(buildTaskRecurringEvent(t));
    } else {
      evs.push(buildFcEvent({
        id: 'task-' + t.id, title: t.title, date: t.dueDate,
        startTime: t.startTime, endTime: t.endTime, type: 'task', refId: t.id,
      }));
    }
  });
  (state.goals || []).filter(g => g.deadline).forEach(g => {
    evs.push(buildFcEvent({ id: 'goal-' + g.id, title: '🎯 ' + g.title, date: g.deadline, type: 'goal', refId: g.id }));
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

// v1.20.0: dateClick now opens the quick-create popover instead of the
// full modal. The popover "Plus d'options" link opens the full modal.
function onDateClick(info) {
  closeCalQuickCreate();
  const jsEvent = info.jsEvent;
  const dateStr = info.dateStr; // 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM:SS'
  // In week/day views FC passes a datetime string; in month it passes a date only.
  const isTimedView = info.view && (info.view.type === 'timeGridWeek' || info.view.type === 'timeGridDay');
  let startTime = null;
  let endTime = null;
  if (isTimedView && dateStr.length > 10) {
    // Extract HH:MM from the local datetime string
    startTime = dateStr.slice(11, 16);
    endTime = addMinutes(startTime, 30);
  }
  const dateOnly = dateStr.slice(0, 10);
  openCalQuickCreate({
    x: jsEvent ? jsEvent.clientX : null,
    y: jsEvent ? jsEvent.clientY : null,
    dueDate: dateOnly,
    startTime,
    endTime,
    anchorEl: null,
  });
}

function onEventClick(info) {
  const { type, refId } = info.event.extendedProps || {};
  if (type === 'task') {
    const t = (state.tasks || []).find(x => x.id === refId);
    if (t) openAddTaskModal('', null, t); // one-off OR recurring series edit
  } else if (type === 'goal') {
    const g = (state.goals || []).find(x => x.id === refId);
    if (g) openAddGoalModal(g);
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
// EVENT CONTENT (per-occurrence rendering for recurring tasks)
// ───────────────────────────────────────────────────────────────

// v1.20.1 fix (A2): In FC v6, an eventContent callback that returns `null`
// OR `undefined` (i.e. `return;`) renders an EMPTY event — the default
// content is NOT used. The only way to fall back to FC's default rendering
// is to return `true` (added in v6.1.0; see ContentInjector.ts:
// `if (customGeneratorRes === true) useDefault = true`). Verified against
// @fullcalendar/core@6.1.21 source + the official upgrade guide.
// So for every "not my event" case we MUST `return true`.
function taskOccurrenceContent(arg) {
  const { type, refId } = arg.event.extendedProps || {};
  if (type !== 'task') return true; // FC default for goals/google/outlook
  const t = (state.tasks || []).find(x => x.id === refId);
  if (!t) return true; // FC default
  if (!t.recurrence) return true; // FC default (non-recurring: title renders normally)

  // Recurring task occurrence
  const occDate = dk(arg.event.start);
  const isListView = arg.view && arg.view.type === 'listWeek';
  const skipped = (t.exceptions || []).includes(occDate);

  if (skipped) {
    arg.el.classList.add('ev-skipped');
    if (isListView) {
      // List view: just show the restore link inline in the title cell
      return {
        html: `<span class="ev-occ ev-occ-skipped">
          <span class="ev-occ-title" style="text-decoration:line-through;opacity:.5">${esc(t.title)}</span>
          <button class="ev-occ-restore" onclick="event.stopPropagation();unskipTaskOccurrence('${t.id}','${occDate}')" title="Annuler le saut">↩</button>
        </span>`,
      };
    }
    return {
      html: `<span class="ev-occ ev-occ-skipped">
        <button class="ev-occ-restore" onclick="event.stopPropagation();unskipTaskOccurrence('${t.id}','${occDate}')" title="Annuler le saut">↩</button>
      </span>`,
    };
  }

  const done = !!(t.completions || {})[occDate];
  arg.el.classList.add(done ? 'ev-task-done' : 'ev-task-pending');

  if (isListView) {
    // List view: show checkbox + title in the title cell (no skip button — too cluttered)
    return {
      html: `<span class="ev-occ">
        <button class="ev-occ-check${done ? ' done' : ''}" onclick="event.stopPropagation();toggleTaskOccurrence('${t.id}','${occDate}')" title="${done ? 'Marquer non fait' : 'Marquer fait'}">${done ? '✓' : ''}</button>
        <span class="ev-occ-title">${esc(t.title)}</span>
      </span>`,
    };
  }

  return {
    html: `<span class="ev-occ">
      <button class="ev-occ-check${done ? ' done' : ''}" onclick="event.stopPropagation();toggleTaskOccurrence('${t.id}','${occDate}')" title="${done ? 'Marquer non fait' : 'Marquer fait'}">${done ? '✓' : ''}</button>
      <span class="ev-occ-title" onclick="event.stopPropagation();openAddTaskModal('',null,state.tasks.find(x=>x.id==='${t.id}'))">${esc(t.title)}</span>
      <button class="ev-occ-skip" onclick="event.stopPropagation();skipTaskOccurrence('${t.id}','${occDate}')" title="Sauter cette occurrence">⏭</button>
    </span>`,
  };
}

// ───────────────────────────────────────────────────────────────
// HOVER CHECKBOX (Part B3) — injected once via eventDidMount
// ───────────────────────────────────────────────────────────────

// Injects an .ev-hover-check button onto non-recurring task events.
// Recurring tasks already have their own inline checkbox from taskOccurrenceContent.
// The button appearance is CSS-driven (opacity transition on .fc-event:hover).
function onEventDidMount(arg) {
  const { type, refId } = arg.event.extendedProps || {};
  if (type !== 'task') return;
  const t = (state.tasks || []).find(x => x.id === refId);
  if (!t || t.recurrence) return; // recurring already has inline check

  const el = arg.el;
  el.style.position = 'relative'; // needed for absolute positioning of the check
  const btn = document.createElement('button');
  btn.className = 'ev-hover-check' + (t.done ? ' done' : '');
  btn.title = t.done ? 'Marquer non fait' : 'Marquer fait';
  btn.textContent = t.done ? '✓' : '';
  btn.addEventListener('click', e => {
    e.stopPropagation();
    toggleTask(t.id);
  });
  el.appendChild(btn);
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
    // v1.20.0 (A1): height:'100%' fills the parent #calendar div which is
    // flex:1 inside #view-calendar (also flex). This lets the timegrid expand
    // to the full available viewport height instead of collapsing to a thin strip.
    height: '100%',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
    },
    buttonText: { today: "Aujourd'hui", month: 'Mois', week: 'Semaine', day: 'Jour', list: 'Liste' },
    nowIndicator: true,
    dayMaxEvents: 3,
    // Part B1: enable drag-to-select for quick time-block creation
    selectable: true,
    selectMirror: true,
    // dateClick opens quick-create popover (v1.20.0 — was openAddTaskModal directly)
    dateClick: onDateClick,
    // select (drag) also opens quick-create popover with start/end prefilled
    select: onCalSelect,
    eventClick: onEventClick,
    events: buildAllEvents(),
    eventContent: taskOccurrenceContent,
    eventDidMount: onEventDidMount,
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
// PART B1 — SELECT CALLBACK (drag-to-create)
// ───────────────────────────────────────────────────────────────

function onCalSelect(info) {
  // info.start, info.end are Date objects; info.allDay is true in month view.
  closeCalQuickCreate();
  const dueDate = dk(info.start);
  let startTime = null;
  let endTime = null;
  if (!info.allDay) {
    startTime = `${pad2(info.start.getHours())}:${pad2(info.start.getMinutes())}`;
    endTime   = `${pad2(info.end.getHours())}:${pad2(info.end.getMinutes())}`;
    // If end === start (single click treated as select), default to +30min
    if (startTime === endTime) endTime = addMinutes(startTime, 30);
  }
  // Position near the selected area using the last mouse position (stored below)
  openCalQuickCreate({
    x: window._calLastMouseX || null,
    y: window._calLastMouseY || null,
    dueDate,
    startTime,
    endTime,
    anchorEl: null,
  });
  // Deselect the FC highlight so it doesn't linger behind the popover
  if (calendarInstance) calendarInstance.unselect();
}

// Track last mouse position so we can anchor the popover on select (FC select
// callback doesn't expose the mouse coordinates directly).
document.addEventListener('mousemove', e => {
  window._calLastMouseX = e.clientX;
  window._calLastMouseY = e.clientY;
}, { passive: true });

// ───────────────────────────────────────────────────────────────
// PART B2 — QUICK-CREATE POPOVER
// ───────────────────────────────────────────────────────────────

// Internal state for the currently open popover
let _qcState = { dueDate: null, startTime: null, endTime: null };

// v1.21.0→v1.24.0: last recurrence chosen in the quick-create popover.
// v1.24.0: "Une fois" is no longer a chip — recurrence is ON/OFF via the
// "Récurrent" checkbox (_qcRecEnabled). _qcChip remembers the chosen chip
// (default 'daily') and only applies while recurrence is enabled.
let _qcChip = 'daily';
let _qcRecEnabled = false;

// Format a label for the popover meta line, e.g. "Ven 15 août · 14:00–14:30"
function _qcDateLabel(dueDate, startTime, endTime) {
  if (!dueDate) return '';
  const d = new Date(dueDate + 'T12:00:00');
  const parts = [];
  parts.push(d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' }));
  if (startTime) {
    parts.push(startTime + (endTime ? '–' + endTime : ''));
  }
  return parts.join(' · ');
}

/**
 * Open the quick-create popover.
 * @param {Object} opts
 *   x, y       — mouse clientX/Y to anchor the popover near
 *   dueDate    — 'YYYY-MM-DD'
 *   startTime  — 'HH:MM' or null
 *   endTime    — 'HH:MM' or null
 *   anchorEl   — DOM element to anchor to (used for the +Task toolbar button)
 */
function openCalQuickCreate({ x, y, dueDate, startTime, endTime, anchorEl }) {
  _qcState = { dueDate, startTime, endTime };

  const popover = document.getElementById('cal-quick-create');
  const input   = document.getElementById('cal-quick-create-input');
  const label   = document.getElementById('cal-qc-date-label');

  label.textContent = _qcDateLabel(dueDate, startTime, endTime);
  input.value = '';
  popover.classList.add('active');

  // v1.22.0→v1.24.0: sync the shared recurrence block (checkbox + chips) with
  // the remembered popover state. Unchecked → chips inert, no highlight;
  // checked → the remembered chip stays highlighted.
  const recCheck = popover.querySelector('.recur-check-label input');
  if (recCheck) recCheck.checked = _qcRecEnabled;
  popover.querySelectorAll('.qc-recur-chip').forEach(c => { c.disabled = !_qcRecEnabled; });
  setRecurChipsHighlight(_qcRecEnabled ? _qcChip : null);

  // Position the popover
  const W = 280;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left, top;
  if (anchorEl) {
    const r = anchorEl.getBoundingClientRect();
    left = Math.min(r.left, vw - W - 12);
    top  = r.bottom + 6;
  } else if (x !== null && y !== null) {
    left = Math.min(x, vw - W - 12);
    top  = Math.min(y + 6, vh - 200);
  } else {
    // Fallback: center horizontally under the toolbar
    left = Math.max(12, (vw - W) / 2);
    top  = 80;
  }

  left = Math.max(8, left);
  top  = Math.max(8, top);
  popover.style.left = left + 'px';
  popover.style.top  = top  + 'px';

  // Auto-focus with a short delay (so FC's click handling doesn't steal focus)
  setTimeout(() => input && input.focus(), 60);
}

function closeCalQuickCreate() {
  const popover = document.getElementById('cal-quick-create');
  if (popover) popover.classList.remove('active');
  _qcState = { dueDate: null, startTime: null, endTime: null };
}

// v1.24.0: the "Récurrent" checkbox in the quick-create popover. Checked →
// recurrence enabled (the remembered chip applies on submit); unchecked →
// one-off: reset the chip to its fresh default and clear any highlight so a
// later recheck restarts clean (no phantom rule).
function qcRecurCheck(el) {
  _qcRecEnabled = el.checked;
  if (_qcRecEnabled) {
    setRecurChipsHighlight(_qcChip);
  } else {
    _qcChip = 'daily';
    setRecurChipsHighlight(null);
  }
  document.querySelectorAll('#cal-qc-recur .qc-recur-chip').forEach(c => { c.disabled = !_qcRecEnabled; });
}

// Create the task with defaults (no goal, no priority fuss).
// goalId is intentionally null here — same pattern as isDayPriority tasks
// created by the morning ritual.
// v1.21.0→v1.24.0: accepts a recurrence chip ('daily'|'weekly'|'monthly'|
// '3_months'). A chip click = create immediately (no extra confirmation) AND
// enables recurrence; Enter/button use the remembered state (_qcRecEnabled +
// _qcChip). One-off = "Récurrent" unchecked. _qcChip is kept for the
// "Plus d'options" pre-fill.
async function submitCalQuickCreate(chip) {
  const input = document.getElementById('cal-quick-create-input');
  const title = input ? input.value.trim() : '';
  if (!title) {
    input && input.focus();
    return;
  }

  const { dueDate, startTime, endTime } = _qcState;
  let recEnabled = _qcRecEnabled;
  let recChip = _qcChip;
  if (chip) {
    recEnabled = true;
    recChip = chip;
    _qcChip = chip;
    _qcRecEnabled = true;
  }
  closeCalQuickCreate();

  const id = uid();
  const data = {
    id,
    title,
    dueDate: dueDate || null,
    startTime: startTime || null,
    endTime: endTime || null,
    duration: 30,
    priority: 'medium',
    goalId: null,       // quick-create: no goal required (same as isDayPriority tasks)
    attachedRewardId: null,
    recurrence: recEnabled ? buildQuickRecurrence(recChip, dueDate) : null,
    completions: {},
    exceptions: [],
    done: false,
    timerRunning: false,
    createdAt: Date.now(),
  };
  state.tasks.unshift(data);
  await saveDoc('tasks', id, data);
  renderTasks();
  if (currentView === 'calendar') renderCalendar();
  toast(`✅ "${title}" ajoutée au calendrier`, 'success', 2500);
}

// "Plus d'options" — opens the full modal pre-filled with what was typed,
// the date/time from the selection, AND the recurrence if it was enabled
// (checkbox checked / a chip clicked); one-off otherwise, editable from there.
// The popover closes first.
function openCalQuickCreateFullModal() {
  const input = document.getElementById('cal-quick-create-input');
  const title = input ? input.value.trim() : '';
  const { dueDate, startTime, endTime } = _qcState;
  const rec = _qcRecEnabled ? buildQuickRecurrence(_qcChip, dueDate) : null;
  closeCalQuickCreate();
  openAddTaskModal(title, null, null, {
    dueDate: dueDate || '',
    startTime: startTime || '',
    endTime: endTime || '',
    isRecurring: rec ? 'true' : 'false',
    frequency: rec ? rec.frequency : 'daily',
    daysOfWeek: rec && rec.daysOfWeek ? rec.daysOfWeek.join(',') : '',
    endDate: rec && rec.endDate ? rec.endDate : '',
  });
}

// Wire up popover events (runs once at script load, before DOM is fully ready
// — use event delegation / getElementById which is safe after DOMContentLoaded).
document.addEventListener('DOMContentLoaded', () => {
  const submitBtn = document.getElementById('cal-qc-submit');
  const moreBtn   = document.getElementById('cal-qc-more-btn');
  const input     = document.getElementById('cal-quick-create-input');

  if (submitBtn) submitBtn.addEventListener('click', submitCalQuickCreate);
  if (moreBtn)   moreBtn.addEventListener('click', openCalQuickCreateFullModal);

  // v1.22.0→v1.24.0: render the SHARED recurrence block (Récurrent checkbox +
  // chips) from js/recur.js — same markup/labels/rules as the task modal (one
  // source of truth). Starts unchecked (one-off); openCalQuickCreate syncs it
  // with the remembered state. Chip clicks route through the shared
  // onRecurChipClick dispatcher, the checkbox through onRecurCheck.
  const recurEl = document.getElementById('cal-qc-recur');
  if (recurEl) recurEl.innerHTML = recurBlockHtml({ checked: false, selected: null, disabled: true });

  if (input) {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); submitCalQuickCreate(); }
      if (e.key === 'Escape') { closeCalQuickCreate(); }
    });
  }

  // Close on outside click
  document.addEventListener('mousedown', e => {
    const popover = document.getElementById('cal-quick-create');
    if (popover && popover.classList.contains('active') && !popover.contains(e.target)) {
      closeCalQuickCreate();
    }
  }, true);
});

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
// Part B4: "+ Task" button → quick-create popover anchored to the button
document.getElementById('add-event-btn').addEventListener('click', (e) => {
  const anchorEl = e.currentTarget;
  if (document.getElementById('cal-quick-create').classList.contains('active')) {
    closeCalQuickCreate();
    return;
  }
  openCalQuickCreate({ x: null, y: null, dueDate: dk(), startTime: null, endTime: null, anchorEl });
});
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
// EXTERNAL (SYNCED) EVENT MODAL — read-only, never edited here
// ───────────────────────────────────────────────────────────────
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

export { enableCalButtons, handleGcalAuth, fetchGoogleCalendarEvents, connectGoogleCalendar, disconnectGoogleCalendar, initMSAL, connectOutlookCalendar, fetchOutlookCalendarEvents, disconnectOutlookCalendar, restoreCalendarConnections, renderCalendar, buildAllEvents, openExternalEventModal, taskOccurrenceContent, openCalQuickCreate, closeCalQuickCreate, submitCalQuickCreate, qcRecurCheck };

Object.assign(window, { enableCalButtons, handleGcalAuth, fetchGoogleCalendarEvents, connectGoogleCalendar, disconnectGoogleCalendar, initMSAL, connectOutlookCalendar, fetchOutlookCalendarEvents, disconnectOutlookCalendar, restoreCalendarConnections, renderCalendar, buildAllEvents, openExternalEventModal, taskOccurrenceContent, openCalQuickCreate, closeCalQuickCreate, submitCalQuickCreate, qcRecurCheck });
