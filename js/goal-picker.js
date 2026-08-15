// ═══════════════════════════════════════════════════════════════
// GOAL PICKER — reusable multi-step button selector for a parent Goal
// Replaces the old text dropdown (`buildGoalOptions`). Used by the
// Add/Edit Task and Add/Edit Habit modals via the generic modal field
// type `goal-picker` (js/modal.js buildField).
//
// Flow: 1. Life Area (root categories) → 2. descend subcategories
// button by button (recursive, like the sidebar accordion) → 3. pick
// a Goal on the current node, or "+ Nouveau Goal ici" to create one on
// the fly. A clickable breadcrumb lets you jump back to any step.
//
// Selected goal id is kept in a hidden `<input id="mf-{name}">` so the
// generic modal submit handler (`#mf-*` scan) reads it like any field.
// ═══════════════════════════════════════════════════════════════

window._goalPickers = {}; // name -> { parent, path: [catId...], nodeId, selectedId }

function goalPickerState(name) {
  if (!window._goalPickers[name]) window._goalPickers[name] = { parent: 'task', path: [], nodeId: null, selectedId: '' };
  return window._goalPickers[name];
}

// Field HTML rendered by buildField for `type: 'goal-picker'`.
function goalPickerFieldHtml(f) {
  const name = f.name;
  const st = goalPickerState(name);
  st.parent = f.goalPickerParent || 'task';
  st.selectedId = f.value || '';
  st.path = [];
  st.nodeId = null;
  const g = st.selectedId ? getGoalById(st.selectedId) : null;
  let summary;
  if (g) {
    const catLabel = g.categoryId ? getCategoryPathString(g.categoryId) : '';
    summary = `<div class="goal-picker-selected">
      <span class="goal-picker-chip">🎯 ${esc(g.title)}</span>
      ${catLabel ? `<span class="goal-picker-cat-badge">${esc(catLabel)}</span>` : ''}
      <span class="goal-picker-actions">
        <button type="button" class="btn btn-ghost btn-xs" onclick="goalPickerOpen('${name}')">Changer</button>
        <button type="button" class="btn btn-ghost btn-xs" onclick="goalPickerClear('${name}')" title="Clear">×</button>
      </span>
    </div>`;
  } else {
    summary = `<div class="goal-picker-unselected">
      <button type="button" class="btn" onclick="goalPickerOpen('${name}')">🎯 Choisir un goal</button>
      <span class="goal-picker-hint">Life Area → sous-catégorie → goal</span>
    </div>`;
  }
  return `<div class="goal-picker">
    <input type="hidden" id="mf-${name}" value="${esc(st.selectedId)}">
    <div class="goal-picker-summary" id="gp-summary-${name}">${summary}</div>
    <div class="goal-picker-steps" id="gp-steps-${name}" style="display:none">
      <div class="goal-picker-breadcrumb" id="gp-crumb-${name}"></div>
      <div class="goal-picker-grid" id="gp-grid-${name}"></div>
    </div>
  </div>`;
}

// ─── Step rendering ────────────────────────────────────────────
function goalPickerOpen(name) {
  const steps = document.getElementById('gp-steps-' + name);
  if (steps) steps.style.display = 'block';
  goalPickerRender(name);
}

function goalPickerRender(name) {
  const st = goalPickerState(name);
  const grid = document.getElementById('gp-grid-' + name);
  const crumb = document.getElementById('gp-crumb-' + name);
  if (!grid) return;
  if (crumb) crumb.innerHTML = goalPickerBreadcrumbHtml(name);
  grid.innerHTML = st.nodeId ? goalPickerNodeStep(name) : goalPickerLifeAreaStep(name);
}

function goalPickerBreadcrumbHtml(name) {
  const st = goalPickerState(name);
  const parts = [`<button type="button" class="gp-crumb" onclick="goalPickerHome('${name}')">🗂 Life Areas</button>`];
  (st.path || []).forEach((id, i) => {
    const c = getCategoryById(id);
    const current = i === st.path.length - 1;
    parts.push(`<span class="gp-crumb-sep">›</span>`);
    parts.push(`<button type="button" class="gp-crumb${current ? ' current' : ''}" onclick="goalPickerPick('${name}','${id}')">${c ? esc((c.icon || '') + ' ' + c.name) : ''}</button>`);
  });
  return parts.join('');
}

// Step 1 — Life Areas (root categories)
function goalPickerLifeAreaStep(name) {
  const roots = getCategoryChildren(null);
  const uncategorized = state.goals.filter(g => !g.categoryId);
  let html = '';
  if (roots.length) {
    html += `<div class="goal-picker-areas">${roots.map(r => {
      const count = state.goals.filter(g => g.categoryId === r.id).length;
      return `<button type="button" class="goal-picker-area" onclick="goalPickerPick('${name}','${r.id}')">
        <span class="goal-picker-area-icon">${r.icon || '📁'}</span>
        <span class="goal-picker-area-name">${esc(r.name)}</span>
        ${count ? `<span class="goal-picker-area-count">${count} goal${count > 1 ? 's' : ''}</span>` : ''}
      </button>`;
    }).join('')}</div>`;
  } else {
    html += `<div class="goal-picker-empty">Aucune Life Area — crée d'abord des catégories.</div>`;
  }
  if (uncategorized.length) {
    html += `<div class="goal-picker-section-title">Non classé</div>`;
    html += uncategorized.map(g => goalPickerGoalCard(name, g)).join('');
  }
  return html;
}

// Step 2+ — a specific category node: goals on it + subcategories to descend
function goalPickerNodeStep(name) {
  const st = goalPickerState(name);
  const nodeId = st.nodeId;
  const cat = getCategoryById(nodeId);
  const goalsHere = state.goals.filter(g => g.categoryId === nodeId);
  const children = getCategoryChildren(nodeId);
  let html = '';
  if (cat) html += `<div class="goal-picker-node-title">${cat.icon || '📁'} ${esc(cat.name)}</div>`;
  if (goalsHere.length) {
    html += `<div class="goal-picker-section-title">🎯 Goals</div>`;
    html += goalsHere.map(g => goalPickerGoalCard(name, g)).join('');
  }
  if (children.length) {
    html += `<div class="goal-picker-section-title">Sous-catégories</div>`;
    html += `<div class="goal-picker-children">${children.map(c =>
      `<button type="button" class="goal-picker-cat" onclick="goalPickerPick('${name}','${c.id}')">
        ${c.icon || '📁'} ${esc(c.name)}${getCategoryChildren(c.id).length ? ' ›' : ''}
      </button>`).join('')}</div>`;
  }
  if (!goalsHere.length && !children.length) {
    html += `<div class="goal-picker-empty">Aucun goal ici pour le moment.</div>`;
  }
  html += `<button type="button" class="goal-picker-new" onclick="goalPickerCreateNew('${name}')">＋ Nouveau Goal ici</button>`;
  return html;
}

function goalPickerGoalCard(name, g) {
  const p = computeGoalProgress(g).progress;
  return `<button type="button" class="goal-picker-goal" onclick="goalPickerSelect('${name}','${g.id}')">
    <span class="goal-picker-goal-name">🎯 ${esc(g.title)}</span>
    <div class="prog-track"><div class="prog-fill" style="width:${p}%"></div></div>
    <span class="goal-picker-goal-pct">${p}%</span>
  </button>`;
}

// ─── Navigation ────────────────────────────────────────────────
function goalPickerPick(name, catId) {
  const st = goalPickerState(name);
  const path = st.path || [];
  const idx = path.indexOf(catId);
  if (idx >= 0) path.splice(idx + 1);
  else path.push(catId);
  st.path = path;
  st.nodeId = catId;
  goalPickerRender(name);
}

function goalPickerHome(name) {
  const st = goalPickerState(name);
  st.path = [];
  st.nodeId = null;
  goalPickerRender(name);
}

// ─── Selection / summary ───────────────────────────────────────
function goalPickerSelect(name, goalId) {
  const st = goalPickerState(name);
  st.selectedId = goalId;
  const hid = document.getElementById('mf-' + name);
  if (hid) hid.value = goalId;
  const steps = document.getElementById('gp-steps-' + name);
  if (steps) steps.style.display = 'none';
  goalPickerRenderSummary(name);
}

function goalPickerClear(name) {
  const st = goalPickerState(name);
  st.selectedId = '';
  const hid = document.getElementById('mf-' + name);
  if (hid) hid.value = '';
  goalPickerRenderSummary(name);
}

function goalPickerRenderSummary(name) {
  const st = goalPickerState(name);
  const summary = document.getElementById('gp-summary-' + name);
  const hid = document.getElementById('mf-' + name);
  if (!summary) return;
  const goalId = st.selectedId || (hid ? hid.value : '') || '';
  const g = goalId ? getGoalById(goalId) : null;
  if (g) {
    const catLabel = g.categoryId ? getCategoryPathString(g.categoryId) : '';
    summary.innerHTML = `<div class="goal-picker-selected">
      <span class="goal-picker-chip">🎯 ${esc(g.title)}</span>
      ${catLabel ? `<span class="goal-picker-cat-badge">${esc(catLabel)}</span>` : ''}
      <span class="goal-picker-actions">
        <button type="button" class="btn btn-ghost btn-xs" onclick="goalPickerOpen('${name}')">Changer</button>
        <button type="button" class="btn btn-ghost btn-xs" onclick="goalPickerClear('${name}')" title="Clear">×</button>
      </span>
    </div>`;
  } else {
    summary.innerHTML = `<div class="goal-picker-unselected">
      <button type="button" class="btn" onclick="goalPickerOpen('${name}')">🎯 Choisir un goal</button>
      <span class="goal-picker-hint">Life Area → sous-catégorie → goal</span>
    </div>`;
  }
}

// ─── Create a goal on the fly ("＋ Nouveau Goal ici") ───────────
// Stashes every current modal field, opens the Goal modal pre-set to
// the current node's category, then reopens the parent modal with the
// new goal selected. Same stashing pattern as rewards inline creation.
function goalPickerStashAll(name) {
  const stash = {};
  document.querySelectorAll('#modal-box [id^="mf-"]').forEach(el => {
    if (el.id === 'mf-' + name) return;
    stash[el.id.slice(3)] = el.value;
  });
  return stash;
}

function goalPickerCreateNew(name) {
  const st = goalPickerState(name);
  if (!st || !st.nodeId) return;
  const stash = goalPickerStashAll(name);
  openAddGoalModal(null, { categoryId: st.nodeId }, (createdId) => {
    st.selectedId = createdId;
    st.path = [];
    st.nodeId = null;
    goalPickerReopenParent(name, { ...stash, goalId: createdId });
  });
}

function goalPickerReopenParent(name, overrides) {
  const parent = goalPickerState(name).parent;
  setTimeout(() => {
    if (parent === 'task') openAddTaskModal('', null, window._editingTask || null, overrides);
    else openAddHabitModal(window._editingHabit || null, overrides);
  }, 0);
}

export {
  goalPickerFieldHtml, goalPickerOpen, goalPickerRender, goalPickerPick, goalPickerHome,
  goalPickerSelect, goalPickerClear, goalPickerRenderSummary, goalPickerCreateNew
};

Object.assign(window, {
  goalPickerFieldHtml, goalPickerOpen, goalPickerRender, goalPickerPick, goalPickerHome,
  goalPickerSelect, goalPickerClear, goalPickerRenderSummary, goalPickerCreateNew
});
