// ═══════════════════════════════════════════════════════════════
// CATEGORIES — Hierarchical tree system
// ═══════════════════════════════════════════════════════════════

// ─── Category helpers ─────────────────────────────────────────
function getCategoryById(id) { return state.categories.find(c => c.id === id); }
function getCategoryChildren(parentId) {
  return state.categories.filter(c => c.parentId === parentId).sort((a, b) => (a.order || 0) - (b.order || 0));
}
function getCategoryPath(id) {
  const parts = [];
  let cat = getCategoryById(id);
  while (cat) { parts.unshift(cat.name); cat = cat.parentId ? getCategoryById(cat.parentId) : null; }
  return parts;
}
function getCategoryLabel(id) { return getCategoryPath(id).join(' > '); }
function getCategoryDepth(id) { return getCategoryPath(id).length; }
function getCategoryRoot(id) {
  let cat = getCategoryById(id);
  while (cat && cat.parentId) cat = getCategoryById(cat.parentId);
  return cat || null;
}
function buildCategoryOptions() {
  const opts = [['', 'None']];
  function walk(parentId, depth) {
    const children = getCategoryChildren(parentId);
    for (const c of children) {
      const prefix = '\u00A0\u00A0'.repeat(depth);
      opts.push([c.id, prefix + (c.icon ? c.icon + ' ' : '') + c.name]);
      walk(c.id, depth + 1);
    }
  }
  walk(null, 0);
  return opts;
}

// ─── Sidebar category accordion ───────────────────────────────
// Renders the dynamic category tree inside the sidebar (#sidebar-categories).
// Each root category (parentId === null) is shown as a clickable node.
// Children are shown/hidden based on expandedCategories set.
// Clicking a label navigates to that category's content AND expands its children.
// Clicking the chevron toggles expansion without navigating.
function renderSidebarCategories() {
  const el = document.getElementById('sidebar-categories');
  if (!el) return;
  const roots = getCategoryChildren(null);
  if (!roots.length) {
    el.innerHTML = `<div style="padding:4px 12px;font-size:12px;color:var(--text-muted)">No categories yet</div>`;
    return;
  }
  el.innerHTML = `<span class="sidebar-section-label">Categories</span>` + roots.map(cat => buildSidebarNode(cat, 0)).join('');
}

// Builds one category node + its expandable children for the sidebar.
// depth controls indentation (0 = root, 1 = first child, etc.)
function buildSidebarNode(cat, depth) {
  const children = getCategoryChildren(cat.id);
  const isExpanded = expandedCategories.has(cat.id);
  const isActive = activeCategoryId === cat.id;
  // Indentation: 12px base + 16px per depth level
  const pl = 12 + depth * 16;
  // Color left-border if the category has a custom color
  const colorBorder = cat.color ? `border-left:3px solid ${cat.color};` : '';
  // Build children HTML (hidden if not expanded)
  const childrenHtml = children.length
    ? `<div class="sidebar-cat-children" style="display:${isExpanded ? 'block' : 'none'}">${children.map(c => buildSidebarNode(c, depth + 1)).join('')}</div>`
    : '';

  return `<div class="sidebar-cat-node" data-cat-id="${cat.id}">
    <div class="sidebar-cat-row${isActive ? ' active' : ''}" style="padding-left:${pl}px;${colorBorder}">
      <!-- Chevron: toggles expansion without navigating -->
      <span class="sidebar-cat-chevron${isExpanded ? ' expanded' : ''}" onclick="event.stopPropagation(); toggleCategoryExpand('${cat.id}')">${children.length ? '›' : ''}</span>
      <!-- Label: navigates AND expands -->
      <span class="sidebar-cat-label" onclick="goToCategory('${cat.id}')">
        <span class="sidebar-cat-icon">${cat.icon || '📁'}</span>
        <span class="sidebar-cat-name">${esc(cat.name)}</span>
      </span>
      <!-- Hover actions: add child, edit, delete -->
      <span class="sidebar-cat-actions">
        <button class="sidebar-cat-action" onclick="event.stopPropagation(); openAddCategoryModal('${cat.id}')" title="Add sub-category">+</button>
        <button class="sidebar-cat-action" onclick="event.stopPropagation(); openEditCategoryModal('${cat.id}')" title="Edit">✎</button>
        <button class="sidebar-cat-action" onclick="event.stopPropagation(); deleteCategory('${cat.id}')" title="Delete">×</button>
      </span>
    </div>
    ${childrenHtml}
  </div>`;
}

// Toggles expansion of the Suivi accordion (fixed children).
window.suiviExpanded = false;
function toggleSuiviExpand() {
  suiviExpanded = !suiviExpanded;
  const ch = document.getElementById('suivi-children');
  const cv = document.getElementById('suivi-chevron');
  if (ch) ch.style.display = suiviExpanded ? '' : 'none';
  if (cv) cv.classList.toggle('expanded', suiviExpanded);
}

// Toggles expansion of a category in the sidebar accordion.
// Does NOT navigate — only shows/hides children.
function toggleCategoryExpand(id) {
  if (expandedCategories.has(id)) expandedCategories.delete(id);
  else expandedCategories.add(id);
  renderSidebarCategories();
}

// Navigates to a category's content page AND expands it in the sidebar.
// The main area shows filtered tasks/goals/habits for this category.
// If id is null, goes back to dashboard.
function goToCategory(id) {
  if (!id) { activeCategoryId = null; goTo('dashboard'); return; }
  activeCategoryId = id;
  // Expand this node so children are visible
  expandedCategories.add(id);
  // Also expand all ancestors so the path is visible
  let cat = getCategoryById(id);
  while (cat && cat.parentId) {
    expandedCategories.add(cat.parentId);
    cat = getCategoryById(cat.parentId);
  }
  // Update sidebar highlighting
  renderSidebarCategories();
  // Update topbar title
  const path = getCategoryPath(id);
  document.getElementById('topbar-title').textContent = path.join(' > ');
  document.getElementById('topbar-sub').textContent = '';
  document.getElementById('topbar-actions').innerHTML = '';
  // Navigate to the category view
  currentView = 'category';
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-category'));
  document.querySelectorAll('.nav-btn[data-view]').forEach(b => b.classList.remove('active'));
  updateBottomNav();
  document.getElementById('app').classList.remove('sidebar-open');
  renderView('category');
}

// ─── Category CRUD ────────────────────────────────────────────
function openAddCategoryModal(parentId = null) {
  openModal({
    title: parentId ? 'Add Sub-Category' : 'Add Root Category',
    sub: parentId ? `Inside "${esc(getCategoryById(parentId)?.name || '')}"` : 'Top-level category',
    fields: [
      { name: 'name', label: 'Name', required: true, placeholder: 'e.g. Family, Growth...' },
      { name: 'icon', label: 'Icon (emoji)', placeholder: 'e.g. 🏠' },
      { name: 'color', label: 'Color (hex or name)', placeholder: 'e.g. #FF6B6B or family' },
      { name: 'moduleType', label: 'Content Type', type: 'select', options: [['generic', 'Generic (tasks/goals/habits)'], ['meals', 'Meals (recipes + planning)'], ['finance-table', 'Finance Table (coming soon)'], ['dateIdeas', '🌹 Date Ideas (quiz + assistant)']] }
    ],
    submit: 'Add Category',
    onSubmit: async v => {
      if (!v.name) return;
      const siblings = getCategoryChildren(parentId);
      const id = uid();
      const data = {
        id, name: v.name, icon: v.icon || '', color: v.color || '',
        parentId: parentId || null, moduleType: v.moduleType || 'generic',
        order: siblings.length, createdAt: Date.now()
      };
      state.categories.push(data);
      await saveDoc('categories', id, data);
      renderSidebarCategories();
      if (activeCategoryId) renderCategoryContent();
    }
  });
}

function openEditCategoryModal(id) {
  const cat = getCategoryById(id);
  if (!cat) return;
  openModal({
    title: 'Edit Category',
    fields: [
      { name: 'name', label: 'Name', required: true, value: cat.name },
      { name: 'icon', label: 'Icon (emoji)', value: cat.icon || '' },
      { name: 'color', label: 'Color', value: cat.color || '' },
      { name: 'moduleType', label: 'Content Type', type: 'select', value: cat.moduleType || 'generic', options: [['generic', 'Generic (tasks/goals/habits)'], ['meals', 'Meals (recipes + planning)'], ['finance-table', 'Finance Table (coming soon)'], ['dateIdeas', '🌹 Date Ideas (quiz + assistant)']] }
    ],
    submit: 'Save Changes',
    onSubmit: async v => {
      Object.assign(cat, { name: v.name, icon: v.icon || '', color: v.color || '', moduleType: v.moduleType || 'generic' });
      await saveDoc('categories', id, cat);
      renderSidebarCategories();
      if (activeCategoryId) renderCategoryContent();
    }
  });
}

async function deleteCategory(id) {
  const cat = getCategoryById(id);
  if (!cat) return;
  const children = getCategoryChildren(id);
  const linkedTasks = state.tasks.filter(t => getTaskCategoryId(t) === id).length;
  const linkedGoals = state.goals.filter(g => g.categoryId === id).length;
  const linkedHabits = state.habits.filter(h => getHabitCategoryId(h) === id).length;
  const hasContent = children.length || linkedTasks || linkedGoals || linkedHabits;

  let warning = `Delete "${cat.name}"?`;
  if (children.length) warning += `\n\n⚠️ ${children.length} sub-categor${children.length === 1 ? 'y' : 'ies'} will become orphaned (moved to parent).`;
  if (linkedTasks || linkedGoals || linkedHabits) {
    const parts = [];
    if (linkedTasks) parts.push(`${linkedTasks} task${linkedTasks > 1 ? 's' : ''}`);
    if (linkedGoals) parts.push(`${linkedGoals} goal${linkedGoals > 1 ? 's' : ''}`);
    if (linkedHabits) parts.push(`${linkedHabits} habit${linkedHabits > 1 ? 's' : ''}`);
    warning += `\n\n⚠️ ${parts.join(', ')} linked to this category will be unlinked (set to no category).`;
  }
  if (!confirm(warning)) return;

  // Reparent children to deleted node's parent
  for (const child of children) {
    child.parentId = cat.parentId || null;
    await saveDoc('categories', child.id, { parentId: child.parentId });
  }

  // Unlink content: set categoryId = null on goals (tasks/habits derive from goal)
  for (const g of state.goals.filter(g => g.categoryId === id)) {
    g.categoryId = null;
    await saveDoc('goals', g.id, { categoryId: null });
  }
  // Legacy tasks/habits with direct categoryId: unlink directly
  for (const t of state.tasks.filter(t => t.categoryId === id && !t.goalId)) {
    t.categoryId = null;
    await saveDoc('tasks', t.id, { categoryId: null });
  }
  for (const h of state.habits.filter(h => h.categoryId === id && !h.goalId)) {
    h.categoryId = null;
    await saveDoc('habits', h.id, { categoryId: null });
  }

  state.categories = state.categories.filter(c => c.id !== id);
  await deleteDoc('categories', id);
  expandedCategories.delete(id);
  if (activeCategoryId === id) {
    activeCategoryId = cat.parentId || null;
    if (activeCategoryId) goToCategory(activeCategoryId);
    else { currentView = 'dashboard'; goTo('dashboard'); }
  }
  renderSidebarCategories();
  if (activeCategoryId) renderCategoryContent();
}

// ─── Category tree rendering (legacy — kept for backward compat) ──
function renderCategories() {
  const treeEl = document.getElementById('categories-tree');
  const contentEl = document.getElementById('categories-content');
  if (!treeEl || !contentEl) return;

  if (!state.categories.length) {
    treeEl.innerHTML = `<div class="empty-state" style="padding:20px 0"><div class="empty-icon">🌳</div><p>No categories yet.</p><small>Create your first category to organize everything.</small></div>`;
    contentEl.innerHTML = '';
    return;
  }

  // If a node is selected, show its content
  if (currentCategoryId) {
    const cat = getCategoryById(currentCategoryId);
    if (!cat) { currentCategoryId = null; renderCategories(); return; }
    treeEl.innerHTML = buildCategoryBreadcrumb(currentCategoryId) + buildCategoryChildrenList(currentCategoryId);
    contentEl.innerHTML = buildCategoryContent(cat);
    return;
  }

  // Root view: show top-level categories
  const roots = getCategoryChildren(null);
  treeEl.innerHTML = roots.map(cat => buildCategoryNodeHTML(cat, 0)).join('');
  contentEl.innerHTML = `<div class="empty-state" style="padding:40px 0"><div class="empty-icon">👈</div><p>Select a category to view its content</p></div>`;
}

function buildCategoryBreadcrumb(id) {
  const path = getCategoryPath(id);
  let html = '<div class="cat-breadcrumb">';
  html += `<span class="cat-breadcrumb-item" onclick="currentCategoryId=null; renderCategories()" style="cursor:pointer;color:var(--accent)">🏠 All</span>`;
  let parentId = null;
  for (let i = 0; i < path.length; i++) {
    // walk path to find parentId at each level
    const ancestors = getCategoryPath(id).slice(0, i + 1);
    let nodeId = null;
    for (const c of state.categories) {
      if (getCategoryPath(c.id).join(' > ') === ancestors.join(' > ')) { nodeId = c.id; break; }
    }
    html += ` <span style="color:var(--text-muted)">›</span> `;
    if (i === path.length - 1) {
      html += `<span class="cat-breadcrumb-current">${esc(path[i])}</span>`;
    } else {
      html += `<span class="cat-breadcrumb-item" onclick="currentCategoryId='${nodeId}'; renderCategories()" style="cursor:pointer;color:var(--accent)">${esc(path[i])}</span>`;
    }
  }
  html += '</div>';
  return html;
}

function buildCategoryNodeHTML(cat, depth) {
  const children = getCategoryChildren(cat.id);
  const childCount = children.length;
  const linkedCount = state.tasks.filter(t => getTaskCategoryId(t) === cat.id).length
    + state.goals.filter(g => g.categoryId === cat.id).length
    + state.habits.filter(h => getHabitCategoryId(h) === cat.id).length;
  const moduleTag = cat.moduleType && cat.moduleType !== 'generic'
    ? `<span class="cat-module-tag ${cat.moduleType}">${cat.moduleType === 'meals' ? '🍽️ Meals' : cat.moduleType === 'dateIdeas' ? '🌹 Date Ideas' : '📊 Finance'}</span>`
    : '';
  const colorStyle = cat.color ? `border-left: 3px solid ${cat.color};` : '';
  return `<div class="cat-node" style="padding-left:${depth * 20}px">
    <div class="cat-node-row" onclick="currentCategoryId='${cat.id}'; renderCategories()" style="${colorStyle}">
      <span class="cat-node-icon">${cat.icon || '📁'}</span>
      <span class="cat-node-name">${esc(cat.name)}</span>
      ${moduleTag}
      <span class="cat-node-count">${childCount > 0 ? childCount + ' sub' : ''} ${linkedCount > 0 ? linkedCount + ' items' : ''}</span>
    </div>
    <div class="cat-node-actions">
      <button class="btn btn-ghost btn-xs" onclick="event.stopPropagation(); openAddCategoryModal('${cat.id}')" title="Add sub-category">+</button>
      <button class="btn btn-ghost btn-xs" onclick="event.stopPropagation(); openEditCategoryModal('${cat.id}')" title="Edit">✎</button>
      <button class="btn btn-ghost btn-xs" onclick="event.stopPropagation(); deleteCategory('${cat.id}')" title="Delete">×</button>
    </div>
  </div>${children.map(c => buildCategoryNodeHTML(c, depth + 1)).join('')}`;
}

function buildCategoryChildrenList(parentId) {
  const children = getCategoryChildren(parentId);
  if (!children.length && !currentCategoryId) return '';
  let html = '<div class="cat-children">';
  html += `<div class="cat-children-header"><span class="cat-children-title">${currentCategoryId ? 'Sub-categories' : 'Root Categories'}</span>`;
  html += `<button class="btn btn-sm" onclick="openAddCategoryModal(${currentCategoryId ? "'" + currentCategoryId + "'" : 'null'})">+ Add</button></div>`;
  if (children.length) {
    html += children.map(c => {
      const childCount = getCategoryChildren(c.id).length;
      const moduleTag = c.moduleType && c.moduleType !== 'generic'
        ? `<span class="cat-module-tag ${c.moduleType}">${c.moduleType === 'meals' ? '🍽️' : c.moduleType === 'dateIdeas' ? '🌹' : '📊'}</span>` : '';
      const colorStyle = c.color ? `border-left: 3px solid ${c.color};` : '';
      return `<div class="cat-child-card" onclick="currentCategoryId='${c.id}'; renderCategories()" style="${colorStyle}">
        <span class="cat-child-icon">${c.icon || '📁'}</span>
        <span class="cat-child-name">${esc(c.name)}</span>
        ${moduleTag}
        ${childCount ? `<span class="cat-child-count">${childCount}</span>` : ''}
        <div class="cat-child-actions">
          <button class="btn btn-ghost btn-xs" onclick="event.stopPropagation(); openEditCategoryModal('${c.id}')" title="Edit">✎</button>
          <button class="btn btn-ghost btn-xs" onclick="event.stopPropagation(); deleteCategory('${c.id}')" title="Delete">×</button>
        </div>
      </div>`;
    }).join('');
  } else {
    html += `<div class="empty-state" style="padding:16px 0"><p>No sub-categories yet.</p></div>`;
  }
  html += '</div>';
  return html;
}

// ─── Category content rendering ───────────────────────────────
function buildCategoryContent(cat) {
  if (cat.moduleType === 'meals') return buildMealsContent(cat);
  if (cat.moduleType === 'finance-table') return buildFinancePlaceholder(cat);

  // Generic: show tasks, goals, habits linked to this category
  const tasks = state.tasks.filter(t => getTaskCategoryId(t) === cat.id);
  const goals = state.goals.filter(g => g.categoryId === cat.id);
  const habits = state.habits.filter(h => getHabitCategoryId(h) === cat.id);

  let html = '<div class="cat-content">';
  if (tasks.length || goals.length || habits.length) {
    if (tasks.length) {
      html += `<div class="cat-content-section"><div class="cat-content-title">☑️ Tasks (${tasks.length})</div>`;
      html += tasks.map(t => `<div class="cat-content-item">${renderTaskInline(t)}</div>`).join('');
      html += '</div>';
    }
    if (goals.length) {
      html += `<div class="cat-content-section"><div class="cat-content-title">🎯 Goals (${goals.length})</div>`;
      html += goals.map(g => `<div class="cat-content-item">${renderGoalInline(g)}</div>`).join('');
      html += '</div>';
    }
    if (habits.length) {
      html += `<div class="cat-content-section"><div class="cat-content-title">🔥 Habits (${habits.length})</div>`;
      html += habits.map(h => `<div class="cat-content-item">${renderHabitInline(h)}</div>`).join('');
      html += '</div>';
    }
  } else {
    html += `<div class="empty-state" style="padding:30px 0"><p>No items in this category yet.</p><small>Create tasks, goals, or habits and assign them to this category.</small></div>`;
  }
  html += '</div>';
  return html;
}

function renderTaskInline(t) {
  const overdue = !t.done && t.dueDate && t.dueDate < dk();
  const isRec = !!t.recurrence;
  const occToday = isRec ? taskOccursOnDate(t, dk()) : null;
  const tChecked = isRec ? !!((t.completions || {})[dk()]) : t.done;
  return `<div class="inline-task${t.done ? ' done' : ''}">
    <button class="task-check-sm${tChecked ? ' done' : ''}${isRec && !occToday ? ' disabled' : ''}" onclick="toggleTask('${t.id}'); renderCategories()">${tChecked ? '✓' : ''}</button>
    <span class="inline-task-title">${esc(t.title)}</span>
    ${isRec ? '<span class="recurring-badge">🔁</span>' : ''}
    ${t.dueDate ? `<span class="inline-task-due${overdue ? ' overdue' : ''}">${relativeDay(t.dueDate)}</span>` : ''}
    ${t.priority ? `<span class="pri-badge ${t.priority}">${t.priority}</span>` : ''}
    ${rewardBadgeHtml(t.attachedRewardId)}
  </div>`;
}

function renderGoalInline(g) {
  const p = computeGoalProgress(g);
  return `<div class="inline-goal">
    <span class="inline-goal-title">${esc(g.title)}</span>
    ${rewardBadgeHtml(g.attachedRewardId, 'goal-reward-badge')}
    <div class="prog-track" style="flex:1;max-width:120px"><div class="prog-fill" style="width:${p.progress}%"></div></div>
    <span class="inline-goal-pct">${p.progress}%</span>
  </div>`;
}

function renderHabitInline(h) {
  const streak = calcStreak(h.checkIns || [], h.frequency || 'daily');
  return `<div class="inline-habit">
    <span class="inline-habit-name">${esc(h.name)}</span>
    ${streak > 0 ? `<span class="streak-badge">🔥 ${streak}</span>` : ''}
    <button class="btn btn-ghost btn-xs" onclick="toggleHabitToday('${h.id}'); renderCategoryContent()">Check in</button>
  </div>`;
}

// ─── Category content page (main area) ───────────────────────
// Shows filtered tasks, goals, and habits for the active category.
// Reuses the same card markup as the standalone Tasks/Goals/Habits views.
function renderCategoryContent() {
  const el = document.getElementById('category-content');
  if (!el) return;
  const id = activeCategoryId;
  if (!id) { el.innerHTML = '<div class="empty-state"><p>Select a category from the sidebar</p></div>'; return; }
  const cat = getCategoryById(id);
  if (!cat) { el.innerHTML = '<div class="empty-state"><p>Category not found</p></div>'; return; }

  // Special module types: redirect or use specific renderer
  if (cat.moduleType === 'finance-table') {
    goTo('finance');
    return;
  }
  if (cat.moduleType === 'meals') {
    el.innerHTML = buildMealsContent(cat);
    return;
  }
  if (cat.moduleType === 'dateIdeas') {
    el.innerHTML = renderDateIdeasContent(cat);
    return;
  }

  // Build set of all descendant IDs for content filtering
  const catIds = new Set([id]);
  function collectDescendants(parentId) {
    for (const child of getCategoryChildren(parentId)) {
      catIds.add(child.id);
      collectDescendants(child.id);
    }
  }
  collectDescendants(id);
  const today = dk();

  // Tab system for generic categories
  const tabs = cat.tabs || [];
  if (!window._activeCategoryTab || !tabs.find(t => t.id === window._activeCategoryTab)) {
    window._activeCategoryTab = tabs.length ? tabs[0].id : null;
  }

  let html = '';

  // Breadcrumb path at the top
  const path = getCategoryPath(id);
  html += `<div class="cat-page-breadcrumb">`;
  html += `<span class="cat-page-bc-link" onclick="goToCategory(null)">🏠 All</span>`;
  for (let i = 0; i < path.length; i++) {
    const ancestors = path.slice(0, i + 1);
    let nodeId = null;
    for (const c of state.categories) {
      if (getCategoryPath(c.id).join(' > ') === ancestors.join(' > ')) { nodeId = c.id; break; }
    }
    html += ` <span style="color:var(--text-muted)">›</span> `;
    if (i === path.length - 1) {
      html += `<span class="cat-page-bc-current">${cat.icon ? cat.icon + ' ' : ''}${esc(cat.name)}</span>`;
    } else {
      html += `<span class="cat-page-bc-link" onclick="goToCategory('${nodeId}')">${esc(path[i])}</span>`;
    }
  }
  html += '</div>';

  // Tab bar
  html += renderCategoryTabBar(cat);

  // Active tab content
  const activeTab = tabs.find(t => t.id === window._activeCategoryTab);
  if (activeTab) {
    html += renderCategoryTabContent(cat, activeTab, catIds, today);
  } else if (!tabs.length) {
    html += `<div class="empty-state" style="padding:24px 0"><div class="empty-icon">📋</div><p>This page is empty</p><small>Click "+ Ajouter un onglet" above to add Tasks, Goals, Habits, or a simple checklist.</small></div>`;
  }

  el.innerHTML = html;
}

let _tabRenameArmed = false;

function renderCategoryTabBar(cat) {
  const tabs = cat.tabs || [];
  const renaming = window._renamingTabId;
  let html = `<div class="cat-tab-bar" id="cat-tab-bar" style="display:flex;gap:4px;flex-wrap:wrap;margin:12px 0">`;
  const typeUsed = new Set();
  for (const tab of tabs) {
    typeUsed.add(tab.type);
    if (tab.id === renaming) {
      html += `<div style="display:inline-flex;align-items:center;gap:2px">
        <input type="text" id="cat-tab-rename-input" value="${esc(tab.label)}" style="font-size:12px;padding:6px 8px;border:1px solid var(--accent);border-radius:var(--radius-sm);background:var(--bg2);color:var(--text);width:150px"
          onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur()}else if(event.key==='Escape'){cancelTabRename('${cat.id}','${tab.id}')}"
          onblur="finishTabRename('${cat.id}','${tab.id}',this.value)">
      </div>`;
    } else {
      const active = tab.id === window._activeCategoryTab;
      html += `<div style="display:inline-flex;align-items:center;gap:2px">
        <button class="btn btn-sm${active ? ' btn-primary' : ''}" onclick="window._activeCategoryTab='${tab.id}';renderCategoryContent()">${esc(tab.label)}</button>
        <button class="btn-ghost btn-xs" onclick="startTabRename('${cat.id}','${tab.id}')" title="Rename tab" style="font-size:11px;padding:2px 4px;color:var(--text-muted)">✎</button>
        <button class="btn-ghost btn-xs" onclick="removeCategoryTab('${cat.id}','${tab.id}')" title="Remove tab" style="font-size:11px;padding:2px 4px;color:var(--text-muted)">×</button>
      </div>`;
    }
  }
  const availableTypes = [];
  if (!typeUsed.has('tasks')) availableTypes.push(['tasks', '☑️ Tasks']);
  if (!typeUsed.has('goals')) availableTypes.push(['goals', '🎯 Goals']);
  if (!typeUsed.has('habits')) availableTypes.push(['habits', '🔥 Habits']);
  if (!typeUsed.has('list')) availableTypes.push(['list', '📋 Liste simple']);
  if (availableTypes.length) {
    html += `<button class="btn btn-sm btn-ghost" onclick="openAddTabModal('${cat.id}', [${availableTypes.map(([t,l]) => `['${t}','${l}']`).join(',')}])">+ Ajouter un onglet</button>`;
  }
  html += `</div>`;
  return html;
}

function startTabRename(catId, tabId) {
  window._renamingTabId = tabId;
  _tabRenameArmed = true;
  const cat = getCategoryById(catId);
  if (cat) {
    const bar = document.getElementById('cat-tab-bar');
    if (bar) bar.outerHTML = renderCategoryTabBar(cat);
  }
  const input = document.getElementById('cat-tab-rename-input');
  if (input) { input.focus(); input.select(); }
}

function finishTabRename(catId, tabId, newLabel) {
  window._renamingTabId = null;
  if (!_tabRenameArmed) return;
  _tabRenameArmed = false;
  const cat = getCategoryById(catId);
  if (!cat) { if (currentView === 'category' && activeCategoryId) renderCategoryContent(); return; }
  const tab = (cat.tabs || []).find(t => t.id === tabId);
  const val = (newLabel || '').trim();
  if (tab && val) {
    tab.label = val;
    saveDoc('categories', catId, { tabs: cat.tabs });
  }
  if (currentView === 'category' && activeCategoryId) renderCategoryContent();
}

function cancelTabRename(catId, tabId) {
  _tabRenameArmed = false;
  window._renamingTabId = null;
  if (currentView === 'category' && activeCategoryId) renderCategoryContent();
}

function renderCategoryTabContent(cat, tab, catIds, today) {
  switch (tab.type) {
    case 'tasks': return renderTabTasks(cat, catIds, today);
    case 'goals': return renderTabGoals(cat, catIds);
    case 'habits': return renderTabHabits(cat, catIds, today);
    case 'list': return renderTabList(cat, tab);
    default: return '<div class="empty-state"><p>Unknown tab type</p></div>';
  }
}

function renderTabTasks(cat, catIds, today) {
  const tasks = state.tasks.filter(t => {
    const tc = getTaskCategoryId(t);
    return tc && catIds.has(tc);
  });
  let html = `<div class="cat-page-section"><div class="cat-page-section-header">
    <span class="cat-page-section-title">☑️ Tasks (${tasks.length})</span>
    <button class="btn btn-sm" onclick="openAddTaskModal('', null, null)">+ Add</button>
  </div>`;
  if (tasks.length) {
    const undone = tasks.filter(t => !t.done);
    const done = tasks.filter(t => t.done);
    html += undone.map(t => {
      const isRec = !!t.recurrence;
      const occToday = isRec ? taskOccursOnDate(t, today) : null;
      const tChecked = isRec ? !!((t.completions || {})[today]) : t.done;
      const overdue = !t.done && t.dueDate && t.dueDate < today;
      return `<div class="cat-page-task">
        <button class="task-check-sm${tChecked ? ' done' : ''}${isRec && !occToday ? ' disabled' : ''}" onclick="toggleTask('${t.id}'); renderCategoryContent()">${tChecked ? '✓' : ''}</button>
        <span class="cat-page-task-title">${esc(t.title)}</span>
        ${isRec ? '<span class="recurring-badge">🔁</span>' : ''}
        ${t.dueDate ? `<span class="cat-page-task-due${overdue ? ' overdue' : ''}">${relativeDay(t.dueDate)}</span>` : ''}
        ${t.priority ? `<span class="pri-badge ${t.priority}">${t.priority}</span>` : ''}
        ${rewardBadgeHtml(t.attachedRewardId)}
      </div>`;
    }).join('');
    if (done.length) {
      html += `<details class="cat-page-done"><summary>Completed (${done.length})</summary>`;
      html += done.map(t => `<div class="cat-page-task done">
        <button class="task-check-sm" onclick="toggleTask('${t.id}'); renderCategoryContent()">✓</button>
        <span class="cat-page-task-title">${esc(t.title)}</span>
      </div>`).join('');
      html += '</details>';
    }
  } else {
    html += '<div class="empty-state" style="padding:12px 0"><p>No tasks in this category</p></div>';
  }
  html += '</div>';
  return html;
}

function renderTabGoals(cat, catIds) {
  const goals = state.goals.filter(g => catIds.has(g.categoryId));
  let html = `<div class="cat-page-section"><div class="cat-page-section-header">
    <span class="cat-page-section-title">🎯 Goals (${goals.length})</span>
    <button class="btn btn-sm" onclick="openAddGoalModal()">+ Add</button>
  </div>`;
  if (goals.length) {
    html += goals.map(g => buildGoalAccordionHtml(g)).join('');
  } else {
    html += '<div class="empty-state" style="padding:12px 0"><p>No goals in this category</p></div>';
  }
  html += '</div>';
  return html;
}

function renderTabHabits(cat, catIds, today) {
  const habits = state.habits.filter(h => {
    const hc = getHabitCategoryId(h);
    return hc && catIds.has(hc);
  });
  let html = `<div class="cat-page-section"><div class="cat-page-section-header">
    <span class="cat-page-section-title">🔥 Habits (${habits.length})</span>
    <button class="btn btn-sm" onclick="openAddHabitModal()">+ Add</button>
  </div>`;
  if (habits.length) {
    html += habits.map(h => {
      const streak = calcStreak(h.checkIns || [], h.frequency || 'daily');
      const checkedToday = (h.checkIns || []).includes(today);
      const hp = computeHabitProgress(h);
      return `<div class="cat-page-habit">
        <button class="task-check-sm${checkedToday ? ' done' : ''}" onclick="toggleHabitToday('${h.id}'); renderCategoryContent()">${checkedToday ? '✓' : ''}</button>
        <span class="cat-page-habit-name">${esc(h.name)}</span>
        ${h.deadline ? `<span style="font-size:11px;color:var(--accent-light)" title="Deadline ${h.deadline}">${Math.round(hp.progress * 100)}%</span>` : ''}
        ${streak > 0 ? `<span class="streak-badge">🔥 ${streak}</span>` : ''}
      </div>`;
    }).join('');
  } else {
    html += '<div class="empty-state" style="padding:12px 0"><p>No habits in this category</p></div>';
  }
  html += '</div>';
  return html;
}

function renderTabList(cat, tab) {
  const items = state.checklistItems.filter(i => i.categoryId === cat.id && i.tabId === tab.id);
  let html = `<div class="cat-page-section"><div class="cat-page-section-header">
    <span class="cat-page-section-title">📋 ${esc(tab.label)} (${items.length})</span>
  </div>`;
  html += `<div style="display:flex;gap:6px;margin-bottom:12px">
    <input type="text" id="checklist-input-${tab.id}" placeholder="Nouvel élément..." style="flex:1;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg2);color:var(--text)">
    <button class="btn btn-sm" onclick="addChecklistItem('${cat.id}','${tab.id}')">+</button>
  </div>`;
  if (items.length) {
    html += items.map(i => `
      <div class="cat-page-task${i.done ? ' done' : ''}">
        <button class="task-check-sm" onclick="toggleChecklistItem('${i.id}')">${i.done ? '✓' : ''}</button>
        <span class="cat-page-task-title">${esc(i.text)}</span>
        <button class="btn btn-ghost btn-xs" onclick="deleteChecklistItem('${i.id}')" style="margin-left:auto">×</button>
      </div>`).join('');
  } else {
    html += '<div class="empty-state" style="padding:12px 0"><p>No items yet</p></div>';
  }
  html += '</div>';
  return html;
}

async function ensureCategoryTabForType(catId, type, defaultLabel) {
  if (!catId) return;
  const cat = getCategoryById(catId);
  if (!cat || (cat.moduleType !== 'generic' && cat.moduleType !== undefined)) return;
  const tabs = cat.tabs || [];
  if (tabs.some(t => t.type === type)) return;
  if (!cat.tabs) cat.tabs = [];
  const tab = { id: uid(), type, label: defaultLabel };
  cat.tabs.push(tab);
  await saveDoc('categories', cat.id, { tabs: cat.tabs });
  if (cat.tabs.length === 1) window._activeCategoryTab = tab.id;
}

function openAddTabModal(catId, availableTypes) {
  const cat = getCategoryById(catId);
  if (!cat) return;
  openModal({
    title: 'Ajouter un onglet',
    sub: `Choose a tab type for "${esc(cat.name)}"`,
    fields: [
      { name: 'type', label: 'Type d\'onglet', type: 'select', options: availableTypes },
      { name: 'label', label: 'Label (optionnel)', placeholder: 'e.g. My Tasks' }
    ],
    submit: 'Add',
    onSubmit: async v => {
      if (!cat.tabs) cat.tabs = [];
      let tabId = uid();
      if (v.type === 'list') {
        const existingIds = new Set(cat.tabs.map(t => t.id));
        const orphan = state.checklistItems.find(i => i.categoryId === catId && !existingIds.has(i.tabId));
        if (orphan) tabId = orphan.tabId;
      }
      const tab = { id: tabId, type: v.type, label: v.label || ({ tasks: '☑️ Tasks', goals: '🎯 Goals', habits: '🔥 Habits', list: '📋 Liste' })[v.type] || v.type };
      cat.tabs.push(tab);
      await saveDoc('categories', catId, { tabs: cat.tabs });
      window._activeCategoryTab = tab.id;
      renderCategoryContent();
    }
  });
}

async function addChecklistItem(categoryId, tabId) {
  const input = document.getElementById('checklist-input-' + tabId);
  if (!input || !input.value.trim()) return;
  const id = uid();
  const data = { id, categoryId, tabId, text: input.value.trim(), done: false, createdAt: Date.now() };
  state.checklistItems.push(data);
  await saveDoc('checklistItems', id, data);
  renderCategoryContent();
}

async function toggleChecklistItem(id) {
  const item = state.checklistItems.find(i => i.id === id);
  if (!item) return;
  item.done = !item.done;
  await saveDoc('checklistItems', id, { done: item.done });
  if (currentView === 'category') renderCategoryContent();
  else renderSuiviActiveTab();
}

async function deleteChecklistItem(id) {
  state.checklistItems = state.checklistItems.filter(i => i.id !== id);
  await deleteDoc('checklistItems', id);
  if (currentView === 'category') renderCategoryContent();
  else renderSuiviActiveTab();
}

async function removeCategoryTab(catId, tabId) {
  const cat = getCategoryById(catId);
  if (!cat || !cat.tabs) return;
  const tab = cat.tabs.find(t => t.id === tabId);
  if (!tab) return;
  const catIds = new Set([catId]);
  function collectDescendants(parentId) {
    for (const child of getCategoryChildren(parentId)) { catIds.add(child.id); collectDescendants(child.id); }
  }
  collectDescendants(catId);
  let contentWarning = '';
  if (tab.type === 'tasks') {
    const cnt = state.tasks.filter(t => { const tc = getTaskCategoryId(t); return tc && catIds.has(tc); }).length;
    if (cnt) contentWarning = `Cet onglet contient ${cnt} tâche${cnt > 1 ? 's' : ''} — elles ne seront pas supprimées, juste masquées tant que l'onglet n'est pas réajouté.`;
  } else if (tab.type === 'goals') {
    const cnt = state.goals.filter(g => g.categoryId && catIds.has(g.categoryId)).length;
    if (cnt) contentWarning = `Cet onglet contient ${cnt} objectif${cnt > 1 ? 's' : ''} — ils ne seront pas supprimés, juste masqués tant que l'onglet n'est pas réajouté.`;
  } else if (tab.type === 'habits') {
    const cnt = state.habits.filter(h => { const hc = getHabitCategoryId(h); return hc && catIds.has(hc); }).length;
    if (cnt) contentWarning = `Cet onglet contient ${cnt} habitude${cnt > 1 ? 's' : ''} — elles ne seront pas supprimées, juste masquées tant que l'onglet n'est pas réajouté.`;
  } else if (tab.type === 'list') {
    const cnt = state.checklistItems.filter(i => i.categoryId === catId && i.tabId === tabId).length;
    if (cnt) contentWarning = `Cet onglet contient ${cnt} élément${cnt > 1 ? 's' : ''} de liste — ils ne seront pas supprimés, juste masqués tant que l'onglet n'est pas réajouté.`;
  }
  const sub = `"${esc(tab.label)}" sera masqué. ${contentWarning}`;
  openModal({
    title: 'Supprimer l\'onglet ?',
    sub,
    fields: [],
    submit: 'Supprimer',
    onSubmit: async () => {
      cat.tabs = cat.tabs.filter(t => t.id !== tabId);
      await saveDoc('categories', catId, { tabs: cat.tabs });
      if (window._activeCategoryTab === tabId) window._activeCategoryTab = cat.tabs.length ? cat.tabs[0].id : null;
      renderCategoryContent();
    }
  });
}

// ─── Meals content for 'meals' moduleType nodes ──────────────
function buildMealsContent(cat) {
  let html = '<div class="cat-content">';
  // Recipes section
  html += `<div class="cat-content-section"><div class="cat-content-title">🍽️ Recipes</div>`;
  const catRecipes = state.recipes.filter(r => r.categoryId === cat.id);
  if (catRecipes.length) {
    html += catRecipes.map(r => `<div class="cat-content-item cat-recipe-card" onclick="openRecipeModal(state.recipes.find(x=>x.id==='${r.id}'))" style="cursor:pointer">
      <span>${esc(r.name)}</span>
      <span style="color:var(--text-muted);font-size:12px">${(r.ingredients || []).length} ingredients</span>
    </div>`).join('');
  } else {
    html += `<div style="padding:8px 0;color:var(--text-muted);font-size:13px">No recipes yet.</div>`;
  }
  html += `<button class="btn btn-sm btn-ghost" onclick="openRecipeModalWithCategory('${cat.id}')">+ Add Recipe</button></div>`;

  // Meal plan section
  html += `<div class="cat-content-section"><div class="cat-content-title">📅 Weekly Meal Plan</div>`;
  html += `<div class="meal-plan-mini">`;
  const catMealPlan = state.mealPlan.filter(m => m.categoryId === cat.id);
  html += MEAL_DAYS.map(day => {
    const dayMeals = MEAL_SLOTS.map(slot => {
      const meal = catMealPlan.find(m => m.day === day && m.repas === slot);
      const recipe = meal ? state.recipes.find(r => r.id === meal.recipeId) : null;
      return `<div class="meal-slot-mini">
        <span class="meal-slot-label-sm">${MEAL_SLOT_LABELS[slot]}</span>
        ${recipe ? `<span class="meal-slot-recipe-sm" onclick="openMealPlanModalForCategory('${cat.id}','${day}','${slot}')" style="cursor:pointer">${esc(recipe.name)}</span>` : `<button class="btn btn-ghost btn-xs" onclick="openMealPlanModalForCategory('${cat.id}','${day}','${slot}')">+</button>`}
      </div>`;
    }).join('');
    return `<div class="meal-day-mini"><div class="meal-day-label-sm">${MEAL_DAY_LABELS[day].slice(0, 3)}</div>${dayMeals}</div>`;
  }).join('');
  html += '</div></div>';

  // Grocery list
  html += `<div class="cat-content-section">
    <button class="btn btn-sm" onclick="generateGroceryListForCategory('${cat.id}')">🛒 Generate Grocery List</button>
    <div id="grocery-list-${cat.id}" style="margin-top:12px"></div>
  </div>`;

  html += '</div>';
  return html;
}

function openRecipeModalWithCategory(categoryId) {
  openModal({
    title: 'New Recipe',
    sub: 'One ingredient per line: name, amount, unit',
    fields: [
      { name: 'name', label: 'Recipe Name', required: true, placeholder: 'e.g. Pasta Bolognese' },
      { name: 'ingredients', label: 'Ingredients (one per line)', type: 'textarea', placeholder: 'ground beef, 500, g\nonion, 1, piece\nolive oil, 2, tbsp' }
    ],
    submit: 'Add Recipe',
    onSubmit: async v => {
      const ingredients = v.ingredients.split('\n').filter(l => l.trim()).map(line => {
        const parts = line.split(',').map(s => s.trim());
        return { name: parts[0] || '', amount: parseFloat(parts[1]) || 0, unit: parts[2] || 'pcs' };
      });
      const id = uid();
      const data = { id, name: v.name, ingredients, categoryId, createdAt: Date.now() };
      state.recipes.unshift(data);
      await saveDoc('recipes', id, data);
      renderCategoryContent();
    }
  });
}

function openMealPlanModalForCategory(categoryId, day, repas) {
  const existing = state.mealPlan.find(m => m.day === day && m.repas === repas && m.categoryId === categoryId);
  const options = state.recipes.filter(r => r.categoryId === categoryId).map(r => [r.id, r.name]);
  if (!options.length) {
    // Fall back to all recipes if no category-specific ones
    const allOptions = state.recipes.map(r => [r.id, r.name]);
    if (!allOptions.length) { toast('Add a recipe first', 'info'); return; }
    openMealPlanModalWithOpts(categoryId, day, repas, existing, allOptions);
    return;
  }
  openMealPlanModalWithOpts(categoryId, day, repas, existing, options);
}

function openMealPlanModalWithOpts(categoryId, day, repas, existing, options) {
  openModal({
    title: `${MEAL_DAY_LABELS[day]} — ${MEAL_SLOT_LABELS[repas]}`,
    fields: [
      { name: 'recipeId', label: 'Recipe', type: 'select', options, value: existing ? existing.recipeId : options[0][0] }
    ],
    submit: 'Save',
    onSubmit: async v => {
      if (existing) {
        existing.recipeId = v.recipeId;
        await saveDoc('mealPlan', existing.id, existing);
      } else {
        const id = uid();
        const data = { id, day, recipeId: v.recipeId, repas, categoryId, createdAt: Date.now() };
        state.mealPlan.push(data);
        await saveDoc('mealPlan', id, data);
      }
      renderCategoryContent();
    }
  });
}

function generateGroceryListForCategory(categoryId) {
  const container = document.getElementById(`grocery-list-${categoryId}`);
  if (!container) return;
  const aggregated = {};
  state.mealPlan.filter(m => m.categoryId === categoryId).forEach(mp => {
    const recipe = state.recipes.find(r => r.id === mp.recipeId);
    if (!recipe) return;
    (recipe.ingredients || []).forEach(ing => {
      const key = `${ing.name.toLowerCase()}|${ing.unit.toLowerCase()}`;
      if (!aggregated[key]) aggregated[key] = { name: ing.name, amount: 0, unit: ing.unit };
      aggregated[key].amount += ing.amount;
    });
  });
  const items = Object.values(aggregated).sort((a, b) => a.name.localeCompare(b.name));
  if (!items.length) { container.innerHTML = '<div style="padding:8px 0;color:var(--text-muted);font-size:13px">No planned meals.</div>'; return; }
  container.innerHTML = items.map(i =>
    `<div class="grocery-item"><span class="grocery-check" onclick="this.classList.toggle('done')"></span><span>${esc(i.name)}</span><span class="grocery-qty">${i.amount} ${i.unit}</span></div>`
  ).join('');
}

// ═══════════════════════════════════════════════════════════════
// DATE IDEAS MODULE (quiz / "à choix")
// ═══════════════════════════════════════════════════════════════

window.DATE_IDEAS_SEED = [
  'Go for a walk|outdoor|true|couple|true',
  'Get some ice cream|outdoor|false|couple|true',
  'Go ice skating|indoor|true|couple|true',
  'Play tennis or pickleball|outdoor|true|both|true',
  'Play a board game|indoor|false|both|false',
  'Cook a meal together|indoor|false|couple|false',
  'Share three things you admire about each other|indoor|false|couple|false',
  'Read aloud to one another|indoor|false|couple|false',
  'Watch a documentary|indoor|false|couple|false',
  'Take up a new hobby|both|false|couple|false',
  'Make up a song or poem together|indoor|false|couple|false',
  'Go for a drive|outdoor|false|couple|true',
  'Sit on the porch and talk|outdoor|false|couple|false',
  'Browse a bookstore or library together|indoor|false|couple|true',
  'Take a bath or shower together|indoor|false|couple|false',
  'Go thrift shopping|indoor|false|couple|true',
  'Attend a school football or basketball game|both|false|both|true',
  'Plan a dream vacation together|indoor|false|couple|false',
  'Wash the car together|outdoor|true|couple|false',
  'Learn a new craft together|indoor|false|couple|false',
  'Hike through a state park|outdoor|true|couple|true',
  'Pack a picnic to share|outdoor|false|couple|true',
  'Lay on a blanket and watch the stars|outdoor|false|couple|true',
  'Stage a competition: sit-ups, cards, basketball|both|true|both|false',
  'Attend an outdoor concert|outdoor|false|both|true',
  'Work out together|both|true|couple|false',
  'Watch a sunrise/sunset together|outdoor|false|couple|true',
  'Go grocery shopping for special treats together|indoor|false|couple|true',
  'Share high point/low point for the day or week|indoor|false|couple|false',
  'Listen to an audiobook together & discuss|indoor|false|couple|false',
  'Play disc golf|outdoor|true|both|true',
  'Visit a local art museum|indoor|false|couple|true',
  'Set goals together: 5-year plan? 10-year?|indoor|false|couple|false',
  'Give each other back rubs|indoor|false|couple|false',
  'Go swimming|both|true|couple|true',
  'Snuggle and cuddle|indoor|false|couple|false',
  'Climb a tree and sit in its branches|outdoor|true|couple|true',
  'Go antiquing|indoor|false|couple|true',
  'Look at old snapshots together|indoor|false|couple|false',
  'Go fishing|outdoor|false|couple|true',
  'Listen to favorite songs together|indoor|false|couple|false',
  'Watch funny videos|indoor|false|couple|false',
  'Slow dance under the stars|outdoor|true|couple|true',
  'Run errands together|outdoor|false|couple|true',
  'Plan your dream home|indoor|false|couple|false',
  'Pitch a tent and sleep outdoors|outdoor|true|couple|true',
  'Make an empty nest list together|indoor|false|couple|false',
  'Go bowling|indoor|true|both|true',
  'Exchange love notes to one another|indoor|false|couple|false',
  'Make music together|indoor|false|couple|false',
];


export { getCategoryById, getCategoryChildren, getCategoryPath, getCategoryLabel, getCategoryDepth, getCategoryRoot, buildCategoryOptions, renderSidebarCategories, buildSidebarNode, toggleSuiviExpand, toggleCategoryExpand, goToCategory, openAddCategoryModal, openEditCategoryModal, deleteCategory, renderCategories, buildCategoryBreadcrumb, buildCategoryNodeHTML, buildCategoryChildrenList, buildCategoryContent, renderTaskInline, renderGoalInline, renderHabitInline, renderCategoryContent, renderCategoryTabBar, startTabRename, finishTabRename, cancelTabRename, renderCategoryTabContent, renderTabTasks, renderTabGoals, renderTabHabits, renderTabList, ensureCategoryTabForType, openAddTabModal, addChecklistItem, toggleChecklistItem, deleteChecklistItem, removeCategoryTab, buildMealsContent, openRecipeModalWithCategory, openMealPlanModalForCategory, openMealPlanModalWithOpts, generateGroceryListForCategory };

Object.assign(window, { getCategoryById, getCategoryChildren, getCategoryPath, getCategoryLabel, getCategoryDepth, getCategoryRoot, buildCategoryOptions, renderSidebarCategories, buildSidebarNode, toggleSuiviExpand, toggleCategoryExpand, goToCategory, openAddCategoryModal, openEditCategoryModal, deleteCategory, renderCategories, buildCategoryBreadcrumb, buildCategoryNodeHTML, buildCategoryChildrenList, buildCategoryContent, renderTaskInline, renderGoalInline, renderHabitInline, renderCategoryContent, renderCategoryTabBar, startTabRename, finishTabRename, cancelTabRename, renderCategoryTabContent, renderTabTasks, renderTabGoals, renderTabHabits, renderTabList, ensureCategoryTabForType, openAddTabModal, addChecklistItem, toggleChecklistItem, deleteChecklistItem, removeCategoryTab, buildMealsContent, openRecipeModalWithCategory, openMealPlanModalForCategory, openMealPlanModalWithOpts, generateGroceryListForCategory });
