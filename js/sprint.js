// ═══════════════════════════════════════════════════════════════
// SPRINT SYSTEM (unified with goals)
// ═══════════════════════════════════════════════════════════════
function computeGoalProgress(goal) {
  const tasks = state.tasks.filter(t => t.goalId === goal.id);
  const habits = state.habits.filter(h => h.goalId === goal.id);
  const taskCount = tasks.length;
  const habitCount = habits.length;

  if (taskCount === 0 && habitCount === 0) {
    return { progress: Math.round(goal.progress || 0), mode: 'manual', details: [], habitDetails: [] };
  }

  let taskProgress = null;
  let habitProgress = null;
  const details = [];
  const habitDetails = [];

  if (taskCount > 0) {
    // One-off tasks keep the binary done/total. Recurring tasks use the
    // Habit consistency formula (computeTaskConsistency → computeHabitProgress).
    const oneOff = tasks.filter(t => !t.recurrence);
    const recurring = tasks.filter(t => t.recurrence);
    let oneOffProgress = null;
    let recProgress = null;
    if (oneOff.length) {
      const done = oneOff.filter(t => t.done).length;
      oneOffProgress = done / oneOff.length;
      details.push(`${done}/${oneOff.length} tasks done (${Math.round(oneOffProgress * 100)}%)`);
    }
    if (recurring.length) {
      let total = 0;
      for (const t of recurring) total += computeTaskConsistency(t).progress;
      recProgress = total / recurring.length;
      details.push(`avg ${Math.round(recProgress * 100)}% recurring-task consistency`);
    }
    if (oneOffProgress !== null && recProgress !== null) {
      taskProgress = (oneOffProgress * oneOff.length + recProgress * recurring.length) / (oneOff.length + recurring.length);
    } else if (oneOffProgress !== null) {
      taskProgress = oneOffProgress;
    } else {
      taskProgress = recProgress;
    }
  }

  if (habitCount > 0) {
    let totalConsistency = 0;
    for (const h of habits) {
      const hp = computeHabitProgress(h);
      totalConsistency += hp.progress;
      const streak = calcStreak(h.checkIns || [], h.frequency || 'daily');
      habitDetails.push({ name: h.name, consistency: Math.round(hp.progress * 100), streak, mode: hp.mode });
    }
    habitProgress = totalConsistency / habitCount;
    const avgPct = Math.round(habitProgress * 100);
    details.push(`avg ${avgPct}% habit progress`);
  }

  let overall;
  if (taskProgress !== null && habitProgress !== null) {
    overall = (taskProgress * taskCount + habitProgress * habitCount) / (taskCount + habitCount);
  } else if (taskProgress !== null) {
    overall = taskProgress;
  } else {
    overall = habitProgress;
  }

  return { progress: Math.round(overall * 100), mode: 'auto', details, habitDetails };
}

// backward-compat alias
const computeSprintGoalProgress = computeGoalProgress;

function renderSprint() {
  const now = new Date();
  const qLabel = getQuarterLabel();
  const sprintGoals = state.goals.filter(g => g.isSprintObjective && g.sprintQuarter === qLabel);

  document.getElementById('sprint-quarter').textContent = qLabel;
  document.getElementById('sprint-main-title').textContent = 'Sprint Objectives';

  // Overall progress = average displayPct of all sprint goals (live, never stored)
  const list = document.getElementById('sprint-objectives-list');
  if (!sprintGoals.length) {
    document.getElementById('sprint-q-pct').textContent = '—';
    document.getElementById('sprint-q-fill').style.width = '0%';
    document.getElementById('sprint-progress-label').textContent = 'No objectives yet';
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">🚀</div><p>No sprint objectives this quarter.</p><small>Mark goals as "Sprint Objective" from Goals & Habits, or create a new goal below.</small></div>`;
    return;
  }

  const goalPcts = sprintGoals.map(g => computeGoalProgress(g).progress);
  const overallPct = Math.round(goalPcts.reduce((a, b) => a + b, 0) / goalPcts.length);
  document.getElementById('sprint-q-pct').textContent = `${overallPct}%`;
  document.getElementById('sprint-q-fill').style.width = `${overallPct}%`;
  document.getElementById('sprint-progress-label').textContent = `${sprintGoals.length} objective${sprintGoals.length > 1 ? 's' : ''}`;

  // Group by root category (Family/Growth/Career/Finance), each root = a collapsible accordion
  const grouped = {};
  for (const g of sprintGoals) {
    const catId = g.categoryId;
    let rootKey = 'uncategorized';
    if (catId) {
      const root = getCategoryRoot(catId);
      if (root) rootKey = root.id;
    }
    if (!grouped[rootKey]) grouped[rootKey] = [];
    grouped[rootKey].push(g);
  }

  const rootLabel = key => {
    if (key === 'uncategorized') return '🗂 Uncategorized';
    const root = getCategoryById(key);
    return root ? (root.icon || '') + ' ' + root.name : '🗂 Uncategorized';
  };

  let html = '';
  for (const [rootKey, goals] of Object.entries(grouped)) {
    const collapsed = (window._collapsedSprintRoots || new Set()).has(rootKey);
    const prim = goals.filter(g => g.sprintPriority !== 'secondary');
    const sec = goals.filter(g => g.sprintPriority === 'secondary');
    const primBlock = prim.length ? `
      <div class="sprint-subgroup">
        <div class="sprint-subgroup-title">🎯 Objectifs principaux</div>
        ${prim.map(g => buildGoalAccordionHtml(g)).join('')}
      </div>` : '';
    const secBlock = sec.length ? `
      <div class="sprint-subgroup">
        <div class="sprint-subgroup-title">📌 Objectifs secondaires</div>
        ${sec.map(g => buildGoalAccordionHtml(g)).join('')}
      </div>` : '';
    html += `<div class="sprint-root-accordion">
      <div class="sprint-root-header" onclick="toggleSprintRootExpand('${rootKey}')">
        <span class="sprint-root-chevron${collapsed ? '' : ' expanded'}">▶</span>
        <span class="sprint-root-title">${esc(rootLabel(rootKey))}</span>
        <span class="sprint-root-count">${goals.length} objective${goals.length > 1 ? 's' : ''}</span>
      </div>
      <div class="sprint-root-body${collapsed ? ' collapsed' : ''}">
        ${primBlock}
        ${secBlock}
      </div>
    </div>`;
  }
  list.innerHTML = html;
}

function toggleSprintRootExpand(rootKey) {
  if (!window._collapsedSprintRoots) window._collapsedSprintRoots = new Set();
  if (window._collapsedSprintRoots.has(rootKey)) window._collapsedSprintRoots.delete(rootKey);
  else window._collapsedSprintRoots.add(rootKey);
  renderSprint();
}

function getQuarterLabel() {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3) + 1;
  return `${now.getFullYear()}-Q${q}`;
}

document.getElementById('add-sprint-obj-btn').addEventListener('click', () => {
  openModal({
    title: 'New Sprint Objective',
    sub: 'A big outcome to achieve this quarter',
    fields: [
      { name: 'title', label: 'Objective', placeholder: 'e.g. Prepare for baby arrival', required: true },
      { name: 'categoryId', label: 'Category', type: 'select', options: buildCategoryOptions() },
      { name: 'sprintPriority', label: 'Objective Priority', type: 'select', value: '', options: [['', '— Choose —'], ['primary', '🎯 Primary'], ['secondary', '📌 Secondary']] },
      { name: 'w1', label: 'Weekly Action 1', placeholder: 'e.g. Book hospital tour' },
      { name: 'w2', label: 'Weekly Action 2', placeholder: 'e.g. Set up nursery' },
      { name: 'w3', label: 'Weekly Action 3', placeholder: 'e.g. Prepare hospital bag' }
    ],
    submit: 'Add Objective',
    onSubmit: async v => {
      if (!v.sprintPriority) {
        toast('Choose whether this is a Primary or Secondary objective.', 'error', 4000);
        return;
      }
      const weeklyActions = [v.w1, v.w2, v.w3].filter(Boolean);
      const catId = v.categoryId || null;
      const lifeArea = catId ? getLifeArea(catId) : '';
      const id = uid();
      const data = {
        id, title: v.title, area: lifeArea, categoryId: catId,
        progress: 0, milestones: [], weeklyActions,
        isSprintObjective: true, sprintQuarter: getQuarterLabel(),
        sprintPriority: v.sprintPriority,
        deadline: null, createdAt: Date.now()
      };
      state.goals.unshift(data);
      await saveDoc('goals', id, data);
      if (catId) await ensureCategoryTabForType(catId, 'goals', '🎯 Goals');
      renderSprint();
      if (currentView === 'goals') renderGoals();
    }
  });
});

function getQuarterStart() {
  const now = new Date();
  const qMonth = Math.floor(now.getMonth() / 3) * 3;
  return new Date(now.getFullYear(), qMonth, 1);
}
function getQuarterEnd() {
  const s = getQuarterStart();
  return new Date(s.getFullYear(), s.getMonth() + 3, 0);
}


export { computeGoalProgress, renderSprint, toggleSprintRootExpand, getQuarterLabel, getQuarterStart, getQuarterEnd };

Object.assign(window, { computeGoalProgress, renderSprint, toggleSprintRootExpand, getQuarterLabel, getQuarterStart, getQuarterEnd });
