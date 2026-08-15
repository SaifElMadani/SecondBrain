// ─── GOAL / CATEGORY HELPERS ──────────────────────────────────
function getGoalById(id) { return state.goals.find(g => g.id === id); }

function getTaskCategoryId(task) {
  if (task.goalId) {
    const goal = getGoalById(task.goalId);
    if (goal && goal.categoryId) return goal.categoryId;
  }
  return task.categoryId || null;
}

function getHabitCategoryId(habit) {
  if (habit.goalId) {
    const goal = getGoalById(habit.goalId);
    if (goal && goal.categoryId) return goal.categoryId;
  }
  return habit.categoryId || null;
}

function getLifeArea(categoryId) {
  if (!categoryId) return null;
  const root = getCategoryRoot(categoryId);
  return root ? root.name.toLowerCase() : null;
}

function getGoalLifeArea(goal) {
  if (goal.area) return goal.area.toLowerCase();
  return getLifeArea(goal.categoryId);
}

function getCategoryPathString(categoryId) {
  if (!categoryId) return '';
  return getCategoryPath(categoryId).join(' > ');
}

// ─── ENERGY LEVEL ────────────────────────────────────────────
// v1.15.0: ritual slider (1-10) now stores a level, not a raw number.
function energyLevel(v) {
  if (v === 'low' || v === 'medium' || v === 'high') return v;
  const n = parseInt(v, 10);
  if (isNaN(n)) return 'medium';
  if (n <= 3) return 'low';
  if (n <= 7) return 'medium';
  return 'high';
}

function energyLabel(v) {
  return { low: '🔋 Low', medium: '🔋🔋 Medium', high: '🔋🔋🔋 High' }[energyLevel(v)] || '—';
}

// ─── TOAST ───────────────────────────────────────────────────
function toast(msg, type = 'info', durationMs = 3000) {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span> ${esc(msg)}`;
  c.appendChild(t);
  setTimeout(() => { t.style.animation = 'toastOut .3s forwards'; setTimeout(() => t.remove(), 300); }, durationMs);
}

export { getGoalById, getTaskCategoryId, getHabitCategoryId, getLifeArea, getGoalLifeArea, getCategoryPathString, toast, energyLevel, energyLabel };

Object.assign(window, { getGoalById, getTaskCategoryId, getHabitCategoryId, getLifeArea, getGoalLifeArea, getCategoryPathString, toast, energyLevel, energyLabel });
