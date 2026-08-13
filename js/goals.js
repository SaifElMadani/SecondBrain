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
            ${!t.done ? `<button class="task-timer-btn${t.timerRunning ? ' running' : ''}" onclick="startTaskTimer('${t.id}')" title="Start timer">▶</button>` : ''}
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
          const streak = calcStreak(h.checkIns || [], h.frequency || 'daily');
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

export { rerenderGoalsList, buildGoalAccordionHtml, toggleGoalExpand, renderGoals, openAddGoalModal, adjustGoalProgress, deleteGoal, toggleMilestone };

Object.assign(window, { rerenderGoalsList, buildGoalAccordionHtml, toggleGoalExpand, renderGoals, openAddGoalModal, adjustGoalProgress, deleteGoal, toggleMilestone });
