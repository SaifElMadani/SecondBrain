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
    const freq = h.frequency || 'daily';
    const isPeriodic = freq === 'weekly' || freq === '3x_per_week' || freq === 'monthly';
    const streakUnit = freq === 'monthly' ? 'month' : freq === 'weekly' || freq === '3x_per_week' ? 'week' : 'day';
    const freqLabel = freq === 'daily' ? 'Daily' : freq === 'weekly' ? 'Weekly' : freq === '3x_per_week' ? '3x / week' : freq === 'monthly' ? 'Monthly' : 'Once';
    const streak = calcStreak(h.checkIns || [], freq);
    const checkIns = h.checkIns || [];
    const hp = computeHabitProgress(h);
    const catId = getHabitCategoryId(h);
    const catTag = catId ? getCategoryPathString(catId) : '';
    return `<div class="habit-section">
      <div class="habit-header">
        <div class="habit-name" onclick="openAddHabitModal(state.habits.find(x=>x.id==='${h.id}'))" style="cursor:pointer">${esc(h.name)}</div>
        ${catTag ? `<span class="cat-module-tag">${esc(catTag)}</span>` : ''}
        ${streak > 0 ? `<div class="streak-badge">🔥 ${streak} ${streakUnit} streak</div>` : ''}
        <button onclick="deleteHabit('${h.id}')" style="color:var(--text-muted);font-size:16px;padding:4px">×</button>
      </div>
      <div class="heatmap-wrap">
        <div class="heatmap-grid" id="heatmap-${h.id}"></div>
      </div>
      <div style="margin-top:8px; display:flex; gap:8px; align-items:center; flex-wrap:wrap">
        <span style="font-size:12px; color:var(--text-muted)">${checkIns.length} total check-ins</span>
        <span style="font-size:12px; color:var(--accent-light)">${hp.mode === 'deadline' ? `⏳ ${Math.round(hp.progress * 100)}% to deadline (${h.deadline})` : `📊 ${Math.round(hp.progress * 100)}% consistency (30d)`}</span>
        <span class="cat-module-tag">${freqLabel}</span>
      </div>
      <div style="margin-top:6px; font-size:11px; color:var(--text-muted)">Click a day in the heatmap to toggle a check-in</div>
    </div>`;
  }).join('');

  state.habits.forEach(h => {
    const grid = document.getElementById(`heatmap-${h.id}`);
    if (grid) renderHeatmap(grid, h.checkIns || [], h);
  });
}

function renderHeatmap(container, checkIns, habit) {
  const weeks = 26; // 6 months
  const today = new Date();
  const todayKey = dk();
  const cells = [];
  for (let w = weeks - 1; w >= 0; w--) {
    for (let d = 0; d < 7; d++) {
      const date = new Date(today);
      date.setDate(today.getDate() - (w * 7) - (6 - d));
      const key = dk(date);
      const done = checkIns.includes(key);
      const future = key > todayKey;
      cells.push({ key, done, future });
    }
  }
  container.innerHTML = cells.map(c => `<div class="heatmap-cell${c.done ? ' l4' : ''}${c.future ? ' heatmap-future' : ' heatmap-clickable'}" title="${c.key}" data-key="${c.key}" ${c.future ? '' : `onclick="toggleHabitDay('${habit.id}', '${c.key}')"`}></div>`).join('');
}

function isoWeekKey(dateOrKey) {
  const [y, m, d] = (typeof dateOrKey === 'string' ? dateOrKey : dk(dateOrKey)).split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function weeksBetweenKeys(startKey, endKey) {
  const monday = date => { const d = new Date(date); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); d.setHours(0, 0, 0, 0); return d; };
  const [sy, sm, sd] = startKey.split('-').map(Number);
  const [ey, em, ed] = endKey.split('-').map(Number);
  return Math.max(1, Math.round((monday(new Date(ey, em - 1, ed)) - monday(new Date(sy, sm - 1, sd))) / 86400000 / 7) + 1);
}

// Calendar-month key, e.g. "2026-08" — the monthly-frequency unit.
function monthKey(dateOrKey) {
  const [y, m] = (typeof dateOrKey === 'string' ? dateOrKey : dk(dateOrKey)).split('-').map(Number);
  return `${y}-${String(m).padStart(2, '0')}`;
}

function monthsBetweenKeys(startKey, endKey) {
  const [sy, sm] = startKey.split('-').map(Number);
  const [ey, em] = endKey.split('-').map(Number);
  return Math.max(1, (ey - sy) * 12 + (em - sm) + 1);
}

function calcStreak(checkIns, frequency = 'daily') {
  if (!checkIns.length) return 0;
  const freq = frequency || 'daily';
  if (freq === 'weekly' || freq === '3x_per_week') {
    let streak = 0;
    const d = new Date();
    for (let i = 0; i < 520; i++) {
      const wk = isoWeekKey(d);
      const inWeek = checkIns.filter(c => isoWeekKey(c) === wk);
      const ok = freq === 'weekly' ? inWeek.length > 0 : inWeek.length >= 3;
      if (!ok) break;
      streak++;
      d.setDate(d.getDate() - 7);
    }
    return streak;
  }
  if (freq === 'monthly') {
    let streak = 0;
    const d = new Date();
    for (let i = 0; i < 120; i++) {
      const mk = monthKey(d);
      const inMonth = checkIns.filter(c => monthKey(c) === mk);
      if (inMonth.length === 0) break;
      streak++;
      d.setMonth(d.getMonth() - 1);
    }
    return streak;
  }
  if (freq === 'once') {
    return checkIns.length > 0 ? 1 : 0;
  }
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
  const freq = h.frequency || 'daily';
  if (h.deadline) {
    const startKey = h.createdAt ? dk(new Date(h.createdAt)) : dk();
    const todayKey = dk();
    const endKey = h.deadline < todayKey ? h.deadline : todayKey;
    const inWindow = checkIns.filter(c => c >= startKey && c <= endKey);
    if (freq === 'weekly') {
      const totalWeeks = weeksBetweenKeys(startKey, h.deadline);
      const successWeeks = new Set(inWindow.map(c => isoWeekKey(c))).size;
      return { progress: Math.min(1, successWeeks / totalWeeks), mode: 'deadline' };
    }
    if (freq === 'monthly') {
      const totalMonths = monthsBetweenKeys(startKey, h.deadline);
      const successMonths = new Set(inWindow.map(c => monthKey(c))).size;
      return { progress: Math.min(1, successMonths / totalMonths), mode: 'deadline' };
    }
    if (freq === '3x_per_week') {
      const totalWeeks = weeksBetweenKeys(startKey, h.deadline);
      return { progress: Math.min(1, inWindow.length / (3 * totalWeeks)), mode: 'deadline' };
    }
    if (freq === 'once') {
      return { progress: inWindow.length > 0 ? 1 : 0, mode: 'deadline' };
    }
    const totalDaysWindow = Math.max(1, daysBetween(startKey, h.deadline));
    return { progress: Math.min(1, inWindow.length / totalDaysWindow), mode: 'deadline' };
  }
  const thirtyDaysAgo = dk(new Date(Date.now() - 30 * 86400000));
  const recent = checkIns.filter(c => c >= thirtyDaysAgo);
  const totalWeeks = Math.max(1, Math.ceil(30 / 7));
  if (freq === 'weekly') {
    return { progress: Math.min(1, new Set(recent.map(c => isoWeekKey(c))).size / totalWeeks), mode: 'rolling' };
  }
  if (freq === 'monthly') {
    const totalMonths = monthsBetweenKeys(thirtyDaysAgo, dk());
    return { progress: Math.min(1, new Set(recent.map(c => monthKey(c))).size / totalMonths), mode: 'rolling' };
  }
  if (freq === '3x_per_week') {
    return { progress: Math.min(1, recent.length / (3 * totalWeeks)), mode: 'rolling' };
  }
  if (freq === 'once') {
    return { progress: recent.length > 0 ? 1 : 0, mode: 'rolling' };
  }
  return { progress: recent.length / 30, mode: 'rolling' };
}

async function toggleHabitDay(id, dateKey) {
  const habit = state.habits.find(h => h.id === id);
  if (!habit) return;
  if (dateKey > dk()) return;
  habit.checkIns = habit.checkIns || [];
  if (habit.checkIns.includes(dateKey)) {
    habit.checkIns = habit.checkIns.filter(c => c !== dateKey);
  } else {
    habit.checkIns.push(dateKey);
    await logWin(`Habit: ${habit.name} ✓`, getHabitCategoryId(habit));
  }
  await saveDoc('habits', id, { checkIns: habit.checkIns });
  renderHabits();
  renderDashHabits();
  renderDashStats();
  if (currentView === 'category' && activeCategoryId) renderCategoryContent();
  if (currentView === 'sprint') renderSprint();
  rerenderGoalsList();
}

async function toggleHabitToday(id) {
  await toggleHabitDay(id, dk());
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
      { name: 'frequency', label: 'Frequency', type: 'select', value: editing ? (item.frequency || 'daily') : 'daily', options: [['daily', 'Daily'], ['weekly', 'Weekly'], ['3x_per_week', '3x / week'], ['monthly', 'Monthly'], ['once', 'Once']] },
      { name: 'deadline', label: 'Target Date (optional)', type: 'date', value: editing ? (item.deadline || '') : '' }
    ],
    submit: editing ? 'Save Changes' : 'Add Habit',
    onSubmit: async v => {
      if (!v.goalId) {
        toast('Please select a parent goal — every habit must belong to a goal.', 'error', 4000);
        return;
      }
      if (editing) {
        Object.assign(item, { name: v.name, goalId: v.goalId, frequency: v.frequency || 'daily', deadline: v.deadline || null });
        await saveDoc('habits', item.id, item);
      } else {
        const id = uid();
        const data = { id, name: v.name, goalId: v.goalId, frequency: v.frequency || 'daily', checkIns: [], createdAt: Date.now(), deadline: v.deadline || null };
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


export { renderTghTasks, renderHabits, renderHeatmap, calcStreak, computeHabitProgress, toggleHabitToday, toggleHabitDay, openAddHabitModal, deleteHabit, monthKey, monthsBetweenKeys };

Object.assign(window, { renderTghTasks, renderHabits, renderHeatmap, calcStreak, computeHabitProgress, toggleHabitToday, toggleHabitDay, openAddHabitModal, deleteHabit, monthKey, monthsBetweenKeys });
