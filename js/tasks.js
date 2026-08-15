// ═══════════════════════════════════════════════════════════════
// TASKS
// v1.22.0: the one-click recurrence chips at the top of the Add/Edit Task
// modal come from the SHARED js/recur.js component (same renderer/rule-builder
// as the quick-create popover) — chip click replaces the rule immediately,
// fine-tuning (extra weekdays, end date) is collapsed behind "⋯ Options avancées".
// ═══════════════════════════════════════════════════════════════

import { recurChipsHtml, buildQuickRecurrence, setRecurChipsHighlight, setRecurWeekdays } from './recur.js';

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

  // Sort dated tasks: undone first, day-priority next, then by due date
  tasks.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (!!a.isDayPriority !== !!b.isDayPriority) return a.isDayPriority ? -1 : 1;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  function taskCardHtml(t) {
    const overdue = !t.done && t.dueDate && t.dueDate < today;
    const isRec = !!t.recurrence;
    const occToday = isRec ? taskOccursOnDate(t, today) : null;
    const checked = isRec ? !!((t.completions || {})[today]) : t.done;
    return `<div class="task-card${t.done ? ' done' : ''}${t.isDayPriority ? ' day-priority' : ''}" data-id="${t.id}">
      <button class="task-check${checked ? ' done' : ''}${isRec && !occToday ? ' disabled' : ''}" onclick="toggleTask('${t.id}')" aria-label="Toggle task">
        <span class="task-check-mark">✓</span>
      </button>
      <div class="task-body" onclick="openAddTaskModal('', null, state.tasks.find(t=>t.id==='${t.id}'))" style="cursor:pointer">
        <div class="task-title">${esc(t.title)}</div>
        <div class="task-meta">
          ${isRec ? '<span class="recurring-badge">🔁 Récurrente</span>' : ''}
          ${t.isDayPriority ? '<span class="pri-day-badge">⭐ Priorité du jour</span>' : ''}
          ${t.dueDate ? `<span class="task-due${overdue ? ' overdue' : ''}">${overdue ? '⚠ ' : ''}${relativeDay(t.dueDate)}</span>` : ''}
          ${t.duration ? `<span class="task-duration">⏱ ${t.duration}m</span>` : ''}
          ${t.priority ? `<span class="pri-badge ${t.priority}">${t.priority}</span>` : ''}
          ${rewardBadgeHtml(t.attachedRewardId)}
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

// v1.21.0→v1.24.0: the recurrence UI at the top of the Add/Edit Task modal is
// a single shared block from js/recur.js (recurBlockHtml): a "Récurrent"
// checkbox + one-click frequency chips. CHECKED = chips active (clicking one
// replaces the rule in a single click, and auto-opens "Options avancées" for
// fine-tuning); UNCHECKED = chips greyed/inert, the task is a one-off and any
// previous rule is CLEARED (no phantom recurrence on a later recheck). The
// chips cover daily / weekly / monthly / "Tous les 3 mois" — "Une fois" is the
// unchecked state, not a 5th chip. Both surfaces (popover + modal) share the
// component by construction (recurChipsHtml / recurBlockHtml /
// buildQuickRecurrence / setRecurChipsHighlight / onRecurChipClick /
// onRecurCheck). Fine-tuning stays in the "⋯ Options avancées" section.

// Apply a quick-recurrence chip to the open Task modal's hidden fields in ONE
// click. Reuses the SHARED rule builder: weekly → daysOfWeek = weekday of the
// task's due date (the rule is REPLACED, never merged), monthly / 3_months →
// same day of month, no end date — exactly the popover semantics, on the task's
// date. v1.24.0: a chip click also (a) checks the "Récurrent" checkbox +
// enables the chips and (b) auto-expands "Options avancées" — clicking a chip
// is an explicit "yes, recurrent" and shows the fine-tuning right away.
function taskModalPickRecurrence(freq) {
  const check = document.querySelector('#modal-box .recur-check-label input');
  if (check) check.checked = true;
  document.querySelectorAll('#modal-box .qc-recur-chip').forEach(c => { c.disabled = false; });
  _recurAdvancedOpen = true;

  const due = document.getElementById('mf-dueDate');
  const dueDate = (due && due.value) ? due.value : dk();
  const rec = buildQuickRecurrence(freq, dueDate);
  const isRec = rec !== null;

  const isRecField = document.getElementById('mf-isRecurring');
  if (isRecField) isRecField.value = isRec ? 'true' : 'false';
  const f = document.getElementById('mf-frequency');
  if (f) f.value = isRec ? rec.frequency : f.value;
  const dow = document.getElementById('mf-daysOfWeek');
  if (dow) {
    dow.value = rec && rec.daysOfWeek ? rec.daysOfWeek.join(',') : '';
    // v1.23.0: reflect the rule on the shared weekday toggles (the hidden
    // input they write to and the buttons must never disagree).
    const wrap = document.querySelector('#modal-box .recur-weekdays');
    if (wrap) setRecurWeekdays(wrap, rec && rec.daysOfWeek ? rec.daysOfWeek : []);
  }
  const end = document.getElementById('mf-endDate');
  if (end) end.value = rec && rec.endDate ? rec.endDate : '';

  toggleTaskRecurrenceFields();
  updateRecurAdvancedLabel();
  setRecurChipsHighlight(freq);
}

// v1.24.0: the "Récurrent" checkbox in the modal (replaces the old
// "Récurrente ?" select — that select now stays a hidden value carrier).
// CHECKED → chips become active (rule-buildable) and "Options avancées"
// auto-expands; UNCHECKED → chips grey out, the hidden rule fields AND the
// weekday toggles are CLEARED and the collapse is reset — so re-checking
// later restores no phantom rule (it starts fresh at "daily").
function modalRecurCheck(el) {
  const on = el.checked;
  const isRecField = document.getElementById('mf-isRecurring');
  if (isRecField) isRecField.value = on ? 'true' : 'false';
  document.querySelectorAll('#modal-box .qc-recur-chip').forEach(c => { c.disabled = !on; });

  if (on) {
    const f = document.getElementById('mf-frequency');
    if (f && !f.value) f.value = 'daily';
    setRecurChipsHighlight(f && f.value ? f.value : 'daily');
    _recurAdvancedOpen = true;
  } else {
    const f = document.getElementById('mf-frequency');
    if (f) f.value = '';
    const dow = document.getElementById('mf-daysOfWeek');
    if (dow) dow.value = '';
    const end = document.getElementById('mf-endDate');
    if (end) end.value = '';
    const wrap = document.querySelector('#modal-box .recur-weekdays');
    if (wrap) setRecurWeekdays(wrap, []);
    setRecurChipsHighlight(null);
    _recurAdvancedOpen = false;
  }
  toggleTaskRecurrenceFields();
  updateRecurAdvancedLabel();
}

// v1.22.0: whether the fine-grained recurrence fields ("Options avancées")
// are expanded in the currently open modal. Reset on every open.
let _recurAdvancedOpen = false;

function openAddTaskModal(prefill = '', captureId = null, item = null, overrides = {}) {
  const editing = !!item;
  window._editingTask = item;
  const showRec = editing ? !!item.recurrence : (overrides.isRecurring === 'true');
  // v1.21.0: current recurrence rule → which chip is pre-selected ('daily'
  // when the task is a one-off — chips are inert anyway while unchecked)
  const currentFreq = editing
    ? (item.recurrence ? item.recurrence.frequency : 'daily')
    : (showRec ? (overrides.frequency || 'daily') : 'daily');
  // v1.22.0→v1.24.0: "Options avancées" is COLLAPSED for one-off tasks but
  // AUTO-EXPANDED whenever the task is recurrent (edit/override of a recurring
  // task, or a "Récurrent" chip click) — the checkbox + chips are the quick
  // path, but a recurrent task shows its fine-tuning (end date, extra days)
  // right away.
  _recurAdvancedOpen = showRec;
  openModal({
    title: editing ? 'Edit Task' : 'New Task',
    sub: editing ? 'Update task details' : 'Give it a time estimate — it helps with time blindness',
    customBody: `<div class="modal-recur-wrap">
        ${recurBlockHtml({ checked: showRec, selected: showRec ? currentFreq : null, disabled: !showRec })}
        <button type="button" class="recur-advanced-toggle" id="recur-advanced-toggle"
          onclick="toggleRecurAdvanced()">⋯ Options avancées</button>
      </div>`,
    fields: [
      { name: 'title', label: 'Task', placeholder: 'What needs to happen?', required: true, value: editing ? item.title : (overrides.title !== undefined ? overrides.title : prefill) },
      { name: 'goalId', label: 'Goal (Parent)', type: 'goal-picker', required: true, goalPickerParent: 'task', value: editing ? (item.goalId || '') : (overrides.goalId || '') },
      { name: 'dueDate', label: 'Due Date', type: 'date', required: true, value: editing ? (item.dueDate || '') : (overrides.dueDate || '') },
      { name: 'startTime', label: 'Start Time (optional)', type: 'time', value: editing ? (item.startTime || '') : (overrides.startTime !== undefined ? overrides.startTime : '') },
      { name: 'endTime', label: 'End Time (optional)', type: 'time', value: editing ? (item.endTime || '') : (overrides.endTime !== undefined ? overrides.endTime : '') },
      { name: 'duration', label: 'Time Estimate (minutes)', type: 'number', placeholder: '30', value: editing ? (item.duration || '') : (overrides.duration || '') },
      { name: 'priority', label: 'Priority', type: 'select', value: editing ? (item.priority || 'medium') : (overrides.priority || 'medium'), options: [['medium', 'Medium'], ['high', 'High'], ['low', 'Low']] },
      { name: 'isRecurring', label: 'Récurrente ?', type: 'select', hidden: true, value: editing ? (item.recurrence ? 'true' : 'false') : (overrides.isRecurring !== undefined ? overrides.isRecurring : 'false'), options: [['false', 'Non — tâche unique'], ['true', 'Oui — tâche récurrente']], onchange: 'toggleTaskRecurrenceFields()' },
      { name: 'frequency', label: 'Fréquence', type: 'select', hidden: true, value: editing ? (item.recurrence ? item.recurrence.frequency : 'daily') : (overrides.frequency || 'daily'), options: [['daily', 'Tous les jours'], ['weekly', 'Hebdomadaire'], ['monthly', 'Mensuel'], ['3_months', 'Tous les 3 mois']], onchange: 'toggleTaskRecurrenceFields()' },
      { name: 'daysOfWeek', label: 'Jours de la semaine', type: 'weekdays', hidden: true, value: editing ? ((item.recurrence && item.recurrence.daysOfWeek) ? item.recurrence.daysOfWeek.join(',') : '') : (overrides.daysOfWeek || '') },
      { name: 'endDate', label: 'Date de fin (optionnel)', type: 'date', hidden: true, value: editing ? ((item.recurrence && item.recurrence.endDate) || '') : (overrides.endDate || '') },
      { name: 'attachedRewardId', label: 'Reward on completion', type: 'select', value: editing ? (item.attachedRewardId || '') : (overrides.attachedRewardId || ''), options: buildRewardOptions(true), onchange: 'taskRewardSelectChange()' }
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
      let recurrence = null;
      if (v.isRecurring === 'true') {
        const frequency = v.frequency || 'daily';
        let daysOfWeek = null;
        if (frequency === 'weekly') {
          daysOfWeek = String(v.daysOfWeek || '').split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n >= 0 && n <= 6);
          if (!daysOfWeek.length) {
            toast('Choisis au moins un jour pour une récurrence hebdomadaire.', 'error', 4000);
            return;
          }
        }
        recurrence = { frequency, daysOfWeek, endDate: v.endDate || null };
      }
      if (editing) {
        Object.assign(item, {
          title: v.title, dueDate: v.dueDate || null,
          duration: parseInt(v.duration) || 0,
          priority: v.priority || 'medium',
          goalId: v.goalId || null,
          attachedRewardId: v.attachedRewardId || null,
          startTime: v.startTime || null,
          endTime: v.endTime || null,
          recurrence
        });
        if (recurrence) {
          if (!item.completions) item.completions = {};
          if (!item.exceptions) item.exceptions = [];
        }
        await saveDoc('tasks', item.id, item);
      } else {
        const id = uid();
        const data = {
          id, title: v.title, dueDate: v.dueDate || null,
          duration: parseInt(v.duration) || 0,
          priority: v.priority || 'medium',
          goalId: v.goalId,
          attachedRewardId: v.attachedRewardId || null,
          startTime: v.startTime || null,
          endTime: v.endTime || null,
          recurrence,
          completions: {}, exceptions: [],
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
      if (currentView === 'calendar') renderCalendar();
      if (currentView === 'category' && activeCategoryId) renderCategoryContent();
      if (currentView === 'dashboard') renderDashStats();
      if (currentView === 'sprint') renderSprint();
      rerenderGoalsList();
    }
  });

  // v1.24.0: reflect the initial recurrence state on the "⋯ Options avancées"
  // link (label + visibility) and the fine-grained field visibility once the
  // modal DOM exists.
  updateRecurAdvancedLabel();
  toggleTaskRecurrenceFields();
}

async function toggleTask(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  if (task.recurrence) {
    // Recurring tasks: the checkbox toggles today's occurrence, not a
    // global `done` boolean.
    const today = dk();
    if (!taskOccursOnDate(task, today)) {
      toast('Cette tâche récurrente n\'a pas d\'occurrence aujourd\'hui — coche-la dans le calendrier.', 'info', 4000);
      return;
    }
    return toggleTaskOccurrence(id, today);
  }
  task.done = !task.done;
  task.completedAt = task.done ? dk() : null;
  await saveDoc('tasks', id, { done: task.done, completedAt: task.completedAt });

  if (task.done) {
    await logWin(`Completed: ${task.title}`, getTaskCategoryId(task));
    await grantTaskReward(task);
    const goal = getGoalById(task.goalId);
    if (goal) await checkGoalRewardCompletion(goal);
    openPauseScreen(task.title);
  }
  renderTasks();
  if (currentView === 'calendar') renderCalendar();
  if (currentView === 'dashboard') { renderDashStats(); renderDashCheckins(); }
  if (currentView === 'sprint') renderSprint();
  if (currentView === 'goals' || currentView === 'category') rerenderGoalsList();
}

// Does a (recurring) task have an occurrence on this date?
function taskOccursOnDate(task, dateKey) {
  const rec = task.recurrence;
  if (!rec) return dateKey === (task.dueDate || '');
  const start = task.dueDate || '';
  if (start && dateKey < start) return false;
  if (rec.endDate && dateKey > rec.endDate) return false;
  if (rec.frequency === 'daily') return true;
  const day = new Date(dateKey + 'T00:00:00').getDay();
  if (rec.frequency === 'weekly') return (rec.daysOfWeek || []).includes(day);
  if (rec.frequency === 'monthly') {
    return new Date(dateKey + 'T00:00:00').getDate() === new Date(start + 'T00:00:00').getDate();
  }
  // v1.24.0: every 3 months, same day of month as the start date.
  if (rec.frequency === '3_months') {
    const d = new Date(dateKey + 'T00:00:00');
    if (d.getDate() !== new Date(start + 'T00:00:00').getDate()) return false;
    const [sy, sm] = (start || dk()).split('-').map(Number);
    const monthDiff = (d.getFullYear() - sy) * 12 + (d.getMonth() + 1 - sm);
    return monthDiff >= 0 && monthDiff % 3 === 0;
  }
  return false;
}

// Toggle ONE occurrence of a recurring task (calendar checkbox).
async function toggleTaskOccurrence(id, dateKey) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  task.completions = task.completions || {};
  if (task.completions[dateKey]) {
    delete task.completions[dateKey];
  } else {
    task.completions[dateKey] = true;
    await logWin(`Completed: ${task.title}`, getTaskCategoryId(task));
    await grantTaskReward(task); // dedupes — one grant per task, forever
  }
  await saveDoc('tasks', id, { completions: task.completions });
  const goal = getGoalById(task.goalId);
  if (goal) await checkGoalRewardCompletion(goal);
  renderTasks();
  renderTghTasks();
  if (currentView === 'calendar') renderCalendar();
  if (currentView === 'dashboard') { renderDashStats(); renderDashCheckins(); }
  if (currentView === 'sprint') renderSprint();
  if (currentView === 'goals' || currentView === 'category') rerenderGoalsList();
}

// Skip ONE occurrence ("pas de ménage cette semaine") → exceptions.
async function skipTaskOccurrence(id, dateKey) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  task.exceptions = task.exceptions || [];
  if (!task.exceptions.includes(dateKey)) {
    task.exceptions.push(dateKey);
    if (task.completions) delete task.completions[dateKey];
  }
  await saveDoc('tasks', id, { exceptions: task.exceptions, completions: task.completions || {} });
  if (currentView === 'calendar') renderCalendar();
}

async function unskipTaskOccurrence(id, dateKey) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  task.exceptions = (task.exceptions || []).filter(k => k !== dateKey);
  await saveDoc('tasks', id, { exceptions: task.exceptions });
  if (currentView === 'calendar') renderCalendar();
}

// v1.22.0→v1.24.0: show/hide the recurrence detail fields based on (a) the
// "Récurrent" checkbox and (b) the "⋯ Options avancées" collapse state.
// isRecurring + frequency stay as HIDDEN value carriers only — their wrappers
// are never shown, because the checkbox + chips are the whole recurrence UI.
// daysOfWeek appears only for a weekly rule; endDate for any recurrent task
// when advanced options are expanded.
function syncRecurFieldsVisibility() {
  const rec = document.getElementById('mf-isRecurring');
  const on = rec && rec.value === 'true';
  ['isRecurring', 'frequency'].forEach(n => {
    const w = document.getElementById('mf-wrap-' + n);
    if (w) w.style.display = 'none';
  });
  ['daysOfWeek', 'endDate'].forEach(n => {
    const w = document.getElementById('mf-wrap-' + n);
    if (w) w.style.display = (on && _recurAdvancedOpen) ? '' : 'none';
  });
  if (on && _recurAdvancedOpen) {
    const freq = document.getElementById('mf-frequency');
    const dowWrap = document.getElementById('mf-wrap-daysOfWeek');
    if (dowWrap) dowWrap.style.display = (freq && freq.value === 'weekly') ? '' : 'none';
  }
}

// Keep the pre-v1.22.0 global used by the fields' onchange hooks.
function toggleTaskRecurrenceFields() {
  syncRecurFieldsVisibility();
}

// v1.22.0: expand/collapse the fine-grained recurrence options (extra
// weekdays, an end date) under the chips. The chips stay the quick path.
function toggleRecurAdvanced() {
  _recurAdvancedOpen = !_recurAdvancedOpen;
  syncRecurFieldsVisibility();
  updateRecurAdvancedLabel();
}

// v1.24.0: keep the "⋯ Options avancées" link's label in sync with the
// collapse state, and HIDE it entirely for one-off tasks (nothing to tune
// while the recurrence checkbox is unchecked).
function updateRecurAdvancedLabel() {
  const btn = document.getElementById('recur-advanced-toggle');
  if (!btn) return;
  const rec = document.getElementById('mf-isRecurring');
  const on = rec && rec.value === 'true';
  btn.style.display = on ? '' : 'none';
  btn.classList.toggle('open', _recurAdvancedOpen);
  btn.textContent = _recurAdvancedOpen ? '− Masquer les options avancées' : '⋯ Options avancées';
}

async function deleteTask(id) {
  state.tasks = state.tasks.filter(t => t.id !== id);
  await deleteDoc('tasks', id);
  renderTasks();
  if (currentView === 'calendar') renderCalendar();
  if (currentView === 'sprint') renderSprint();
}


export { renderTasks, openAddTaskModal, toggleTask, toggleTaskOccurrence, skipTaskOccurrence, unskipTaskOccurrence, taskOccursOnDate, toggleTaskRecurrenceFields, taskModalPickRecurrence, modalRecurCheck, toggleRecurAdvanced, updateRecurAdvancedLabel, deleteTask };

Object.assign(window, { renderTasks, openAddTaskModal, toggleTask, toggleTaskOccurrence, skipTaskOccurrence, unskipTaskOccurrence, taskOccursOnDate, toggleTaskRecurrenceFields, taskModalPickRecurrence, modalRecurCheck, toggleRecurAdvanced, updateRecurAdvancedLabel, deleteTask });
