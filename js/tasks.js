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
    return `<div class="task-card${t.done ? ' done' : ''}${t.isDayPriority ? ' day-priority' : ''}" data-id="${t.id}">
      <button class="task-check" onclick="toggleTask('${t.id}')" aria-label="Toggle task">
        <span class="task-check-mark">✓</span>
      </button>
      <div class="task-body" onclick="openAddTaskModal('', null, state.tasks.find(t=>t.id==='${t.id}'))" style="cursor:pointer">
        <div class="task-title">${esc(t.title)}</div>
        <div class="task-meta">
          ${t.isDayPriority ? '<span class="pri-day-badge">⭐ Priorité du jour</span>' : ''}
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

function openAddTaskModal(prefill = '', captureId = null, item = null, overrides = {}) {
  const editing = !!item;
  const goalOpts = buildGoalOptions(overrides.categoryId || (editing ? null : activeCategoryId) || null);
  openModal({
    title: editing ? 'Edit Task' : 'New Task',
    sub: editing ? 'Update task details' : 'Give it a time estimate — it helps with time blindness',
    fields: [
      { name: 'title', label: 'Task', placeholder: 'What needs to happen?', required: true, value: editing ? item.title : prefill },
      { name: 'goalId', label: 'Goal (Parent)', type: 'select', required: true, value: editing ? (item.goalId || '') : (overrides.goalId || ''), options: goalOpts },
      { name: 'dueDate', label: 'Due Date', type: 'date', required: true, value: editing ? (item.dueDate || '') : '' },
      { name: 'duration', label: 'Time Estimate (minutes)', type: 'number', placeholder: '30', value: editing ? (item.duration || '') : '' },
      { name: 'priority', label: 'Priority', type: 'select', value: editing ? (item.priority || 'medium') : 'medium', options: [['medium', 'Medium'], ['high', 'High'], ['low', 'Low']] }
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
      if (editing) {
        Object.assign(item, {
          title: v.title, dueDate: v.dueDate || null,
          duration: parseInt(v.duration) || 0,
          priority: v.priority || 'medium',
          goalId: v.goalId || null
        });
        await saveDoc('tasks', item.id, item);
      } else {
        const id = uid();
        const data = {
          id, title: v.title, dueDate: v.dueDate || null,
          duration: parseInt(v.duration) || 0,
          priority: v.priority || 'medium',
          goalId: v.goalId,
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
}

async function toggleTask(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  task.done = !task.done;
  task.completedAt = task.done ? dk() : null;
  await saveDoc('tasks', id, { done: task.done, completedAt: task.completedAt });

  if (task.done) {
    await logWin(`Completed: ${task.title}`, getTaskCategoryId(task));
    openPauseScreen(task.title);
  }
  renderTasks();
  if (currentView === 'calendar') renderCalendar();
  if (currentView === 'dashboard') { renderDashStats(); renderDashCheckins(); }
  if (currentView === 'sprint') renderSprint();
}

async function deleteTask(id) {
  state.tasks = state.tasks.filter(t => t.id !== id);
  await deleteDoc('tasks', id);
  renderTasks();
  if (currentView === 'calendar') renderCalendar();
  if (currentView === 'sprint') renderSprint();
}


export { renderTasks, openAddTaskModal, toggleTask, deleteTask };

Object.assign(window, { renderTasks, openAddTaskModal, toggleTask, deleteTask });
