// ═══════════════════════════════════════════════════════════════
// MORNING / AFTERNOON / EVENING RITUAL
// ═══════════════════════════════════════════════════════════════
const MORNING_QS = [
  { key: 'morningFocus', text: "What's your ONE priority today?", type: 'text' },
  { key: 'morningObstacle', text: "What could go wrong today, and how will you handle it?", type: 'text' },
  { key: 'energy', text: "How is your energy level right now?", type: 'energy' },
  { key: 'mood', text: "How are you feeling right now?", type: 'mood' }
];
const AFTERNOON_QS = [
  { key: 'priorityDone', text: "Did you complete today's priority?", type: 'check' },
  { key: 'highlight', text: "What was the highlight of your day so far?", type: 'text' },
  { key: 'tomorrow', text: "What's your ONE priority for tomorrow?", type: 'tomorrow' }
];
const EVENING_QS = [
  { key: 'eveningDone', text: "Did you complete your one priority?", type: 'text' },
  { key: 'eveningWell', text: "What went well today?", type: 'text' },
  { key: 'eveningTomorrow', text: "What do you want to do differently tomorrow?", type: 'text' }
];

let ritualType = 'morning', ritualStep = 0, ritualAnswers = {};

function getRitualQs() {
  return ritualType === 'morning' ? MORNING_QS : ritualType === 'afternoon' ? AFTERNOON_QS : EVENING_QS;
}

function checkRitual() {
  const todayKey = dk();
  const journal = state.journal[todayKey] || {};
  const hour = new Date().getHours();

  // Morning ritual: 5am–12pm, not done yet
  if (hour >= 5 && hour < 12 && !journal.morningDone) {
    openRitual('morning');
  }
  // Afternoon check-in: 12pm–6pm, not done yet
  else if (hour >= 12 && hour < 18 && !journal.afternoonDone) {
    openRitual('afternoon');
  }
  // Evening ritual: 6pm–11pm, not done yet
  else if (hour >= 18 && !journal.eveningDone) {
    openRitual('evening');
  }
}

function openRitual(type) {
  ritualType = type; ritualStep = 0; ritualAnswers = {};
  const badge = document.getElementById('ritual-badge');
  badge.textContent = type === 'morning' ? '☀️ Morning Check-in' : type === 'afternoon' ? '🌤 Afternoon Check-in' : '🌙 Evening Reflection';
  badge.className = `ritual-time-badge ${type}`;
  showRitualStep(0);
  document.getElementById('screen-ritual').classList.add('active');
}

function showRitualStep(step) {
  ritualStep = step;
  const qs = getRitualQs();
  const q = qs[step];
  document.getElementById('ritual-q-num').textContent = `Question ${step + 1} of ${qs.length}`;
  document.getElementById('ritual-q-text').textContent = q.text;
  document.getElementById('ritual-next').textContent = step < qs.length - 1 ? 'Next →' : 'Finish ✓';

  // Progress bars
  const prog = document.getElementById('ritual-progress');
  prog.innerHTML = '';
  for (let i = 0; i < qs.length; i++) {
    const bar = document.createElement('div');
    bar.className = 'ritual-progress-bar' + (i <= step ? ' done' : '');
    prog.appendChild(bar);
  }

  // Show correct input
  ['ritual-mood-area', 'ritual-energy-area', 'ritual-text-area', 'ritual-check-area', 'ritual-tomorrow-area']
    .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });

  if (q.type === 'mood') {
    document.getElementById('ritual-mood-area').style.display = 'block';
    document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
  } else if (q.type === 'energy') {
    document.getElementById('ritual-energy-area').style.display = 'block';
    const saved = ritualAnswers['energy'];
    if (saved) {
      document.getElementById('ritual-energy').value = saved;
      document.getElementById('energy-val').textContent = saved;
    }
  } else if (q.type === 'check') {
    document.getElementById('ritual-check-area').style.display = 'block';
    renderRitualCheck();
  } else if (q.type === 'tomorrow') {
    document.getElementById('ritual-tomorrow-area').style.display = 'block';
    document.getElementById('ritual-tomorrow').value = ritualAnswers[q.key] || '';
    setTimeout(() => document.getElementById('ritual-tomorrow').focus(), 100);
  } else {
    document.getElementById('ritual-text-area').style.display = 'block';
    document.getElementById('ritual-answer').value = ritualAnswers[q.key] || '';
    setTimeout(() => document.getElementById('ritual-answer').focus(), 100);
  }
}

// Afternoon Q1 — today's day-priority task, completed via toggleTask directly.
function renderRitualCheck() {
  const el = document.getElementById('ritual-check-area');
  const todayKey = dk();
  const prioTask = state.tasks.find(t => t.isDayPriority && t.dueDate === todayKey);
  if (!prioTask) {
    el.innerHTML = `<div style="font-size:13px; color:var(--text-muted)">Aucune priorité définie</div>`;
    return;
  }
  el.innerHTML = `
    <div class="ritual-check-row">
      <button class="task-check ${prioTask.done ? 'done' : ''}" onclick="ritualToggleDayPriority('${prioTask.id}')" aria-label="Toggle day priority"><span class="task-check-mark">✓</span></button>
      <span class="ritual-check-title">${esc(prioTask.title)}</span>
    </div>`;
}

async function ritualToggleDayPriority(id) {
  await toggleTask(id);
  renderRitualCheck();
}

// Afternoon Q3 — "Create as tomorrow's priority" → isDayPriority task dated tomorrow.
async function createTomorrowPriority() {
  const val = document.getElementById('ritual-tomorrow').value.trim();
  if (!val) return;
  const tomorrowKey = dk(new Date(Date.now() + 86400000));
  await ensureDayPriorityTask(val, tomorrowKey);
  document.getElementById('ritual-tomorrow-btn').disabled = true;
  toast('Tomorrow\'s priority created ⭐', 'success');
}

// Shared day-priority Task upsert (morning focus + afternoon tomorrow).
async function ensureDayPriorityTask(title, dateKey) {
  if (!title || !title.trim()) return;
  title = title.trim();
  const existingPrio = state.tasks.find(t => t.isDayPriority && t.dueDate === dateKey);
  if (existingPrio) {
    existingPrio.title = title;
    await saveDoc('tasks', existingPrio.id, { title });
  } else {
    const id = uid();
    const data = {
      id, title, dueDate: dateKey,
      done: false, timerRunning: false,
      isDayPriority: true, priority: 'high',
      goalId: null, categoryId: null,
      createdAt: Date.now()
    };
    state.tasks.unshift(data);
    await saveDoc('tasks', id, data);
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

document.getElementById('ritual-tomorrow-btn').addEventListener('click', createTomorrowPriority);

document.getElementById('ritual-next').addEventListener('click', async () => {
  const qs = getRitualQs();
  const q = qs[ritualStep];

  if (q.type === 'mood') {
    const selected = document.querySelector('.mood-btn.selected');
    if (selected) ritualAnswers[q.key] = selected.dataset.mood;
  } else if (q.type === 'energy') {
    ritualAnswers[q.key] = document.getElementById('ritual-energy').value;
  } else if (q.type === 'tomorrow') {
    ritualAnswers[q.key] = document.getElementById('ritual-tomorrow').value.trim();
  } else if (q.type === 'text') {
    ritualAnswers[q.key] = document.getElementById('ritual-answer').value.trim();
  }
  // 'check' type: completion is handled live via toggleTask — nothing to capture.

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
  // v1.15.0: energy slider is stored as a level, not a raw 1-10 number.
  if (ritualAnswers.energy !== undefined) {
    ritualAnswers.energy = energyLevel(ritualAnswers.energy);
  }
  const updated = { ...existing, ...ritualAnswers };
  if (ritualType === 'morning') updated.morningDone = true;
  else if (ritualType === 'afternoon') updated.afternoonDone = true;
  else updated.eveningDone = true;
  updated.updatedAt = Date.now();
  state.journal[todayKey] = updated;
  await saveDoc('journal', todayKey, updated);

  // Morning "one priority" becomes a real Task so it surfaces in the
  // Today list, calendar, and dashboard — not just journal text.
  if (ritualType === 'morning' && ritualAnswers.morningFocus) {
    await ensureDayPriorityTask(ritualAnswers.morningFocus, todayKey);
  }
}


export { checkRitual, openRitual, showRitualStep, saveRitual, renderRitualCheck, ritualToggleDayPriority, createTomorrowPriority, ensureDayPriorityTask };

Object.assign(window, { checkRitual, openRitual, showRitualStep, saveRitual, renderRitualCheck, ritualToggleDayPriority, createTomorrowPriority, ensureDayPriorityTask });
