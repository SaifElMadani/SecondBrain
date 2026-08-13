// ═══════════════════════════════════════════════════════════════
// HABITS
// ═══════════════════════════════════════════════════════════════

// Tab switching for goals/habits
function renderSuiviTabBar() {
  const bar = document.getElementById('suivi-tab-bar');
  if (!bar) return;
  const tabs = state.settings.suiviTabs && state.settings.suiviTabs.length ? state.settings.suiviTabs : [];
  if (!window._suiviActiveTab && tabs.length) window._suiviActiveTab = tabs[0].id;
  const activeId = window._suiviActiveTab;
  const typeUsed = new Set(tabs.map(t => t.type));
  let html = tabs.map(t => {
    const itemCount = state.checklistItems.filter(i => !i.categoryId && i.tabId === t.id).length;
    const sufCount = (t.type === 'tasks' ? state.tasks.length : t.type === 'goals' ? state.goals.length : t.type === 'habits' ? state.habits.length : itemCount);
    return `<div style="display:inline-flex;align-items:center;gap:2px">
      <button class="view-tab${t.id === activeId ? ' active' : ''}" data-suivi-tab="${t.id}">${esc(t.label)}</button>
      <button class="btn-ghost btn-xs" onclick="removeSuiviTab('${t.id}')" title="Remove tab" style="font-size:11px;padding:2px 4px;color:var(--text-muted)">×</button>
    </div>`;
  }).join('');
  const available = [];
  if (!typeUsed.has('tasks')) available.push(['tasks', '☑️ Tasks']);
  if (!typeUsed.has('goals')) available.push(['goals', '🎯 Goals']);
  if (!typeUsed.has('habits')) available.push(['habits', '🔥 Habits']);
  if (!typeUsed.has('list')) available.push(['list', '📋 Liste simple']);
  if (available.length) {
    const escList = available.map(([t, l]) => `['${t}','${l}']`).join(',');
    html += `<button class="view-tab btn-ghost" onclick="openAddSuiviTabModal([${escList}])" style="border:1px dashed var(--border);color:var(--text-muted)">+ Ajouter un onglet</button>`;
  }
  bar.innerHTML = html;

  // Bind click handlers
  bar.querySelectorAll('[data-suivi-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      window._suiviActiveTab = btn.dataset.suiviTab;
      renderSuiviTabBar();
      renderSuiviActiveTab();
    });
  });
}

function renderSuiviActiveTab() {
  const tabs = state.settings.suiviTabs || [];
  const activeTab = tabs.find(t => t.id === window._suiviActiveTab);
  // Hide all panels
  ['tgh-tasks-panel', 'goals-panel', 'habits-panel', 'suivi-list-panel'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  if (!activeTab) return;
  switch (activeTab.type) {
    case 'tasks':
      document.getElementById('tgh-tasks-panel').style.display = '';
      renderTghTasks();
      break;
    case 'goals':
      document.getElementById('goals-panel').style.display = '';
      renderGoals();
      break;
    case 'habits':
      document.getElementById('habits-panel').style.display = '';
      renderHabits();
      break;
    case 'list':
      document.getElementById('suivi-list-panel').style.display = '';
      renderSuiviList(activeTab);
      break;
  }
}

function renderSuiviList(tab) {
  const el = document.getElementById('suivi-list-content');
  if (!el) return;
  const items = state.checklistItems.filter(i => !i.categoryId && i.tabId === tab.id);
  let html = `<div class="section-header"><div class="section-title">📋 ${esc(tab.label)}</div></div>`;
  html += `<div style="display:flex;gap:6px;margin-bottom:12px">
    <input type="text" id="suivi-checklist-input-${tab.id}" placeholder="Nouvel élément..." style="flex:1;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg2);color:var(--text)">
    <button class="btn btn-sm" onclick="addSuiviChecklistItem('${tab.id}')">+</button>
  </div>`;
  if (items.length) {
    html += items.map(i => `
      <div class="cat-page-task${i.done ? ' done' : ''}" style="max-width:500px">
        <button class="task-check-sm" onclick="toggleChecklistItem('${i.id}')">${i.done ? '✓' : ''}</button>
        <span class="cat-page-task-title">${esc(i.text)}</span>
        <button class="btn btn-ghost btn-xs" onclick="deleteChecklistItem('${i.id}')" style="margin-left:auto">×</button>
      </div>`).join('');
  } else {
    html += '<div class="empty-state" style="padding:12px 0"><p>No items yet</p></div>';
  }
  el.innerHTML = html;
}

async function addSuiviChecklistItem(tabId) {
  const input = document.getElementById('suivi-checklist-input-' + tabId);
  if (!input || !input.value.trim()) return;
  const id = uid();
  const data = { id, categoryId: null, tabId, text: input.value.trim(), done: false, createdAt: Date.now() };
  state.checklistItems.push(data);
  await saveDoc('checklistItems', id, data);
  renderSuiviActiveTab();
}

function openAddSuiviTabModal(availableTypes) {
  openModal({
    title: 'Ajouter un onglet au Suivi',
    fields: [
      { name: 'type', label: 'Type d\'onglet', type: 'select', options: availableTypes },
      { name: 'label', label: 'Label (optionnel)', placeholder: 'e.g. My List' }
    ],
    submit: 'Add',
    onSubmit: async v => {
      if (!state.settings.suiviTabs) state.settings.suiviTabs = [];
      let tabId = uid();
      if (v.type === 'list') {
        const existingIds = new Set(state.settings.suiviTabs.map(t => t.id));
        const orphan = state.checklistItems.find(i => !i.categoryId && !existingIds.has(i.tabId));
        if (orphan) tabId = orphan.tabId;
      }
      const tab = { id: tabId, type: v.type, label: v.label || ({ tasks: '☑️ Tasks', goals: '🎯 Goals', habits: '🔥 Habits', list: '📋 Liste' })[v.type] || v.type };
      state.settings.suiviTabs.push(tab);
      await saveProfile({ suiviTabs: state.settings.suiviTabs });
      window._suiviActiveTab = tab.id;
      renderSuiviTabBar();
      renderSuiviActiveTab();
    }
  });
}

function removeSuiviTab(tabId) {
  const tabs = state.settings.suiviTabs || [];
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;
  let contentWarning = '';
  if (tab.type === 'tasks') {
    const cnt = state.tasks.length;
    if (cnt) contentWarning = `Cet onglet contient ${cnt} tâche${cnt > 1 ? 's' : ''} — elles ne seront pas supprimées, juste masquées tant que l'onglet n'est pas réajouté.`;
  } else if (tab.type === 'goals') {
    const cnt = state.goals.length;
    if (cnt) contentWarning = `Cet onglet contient ${cnt} objectif${cnt > 1 ? 's' : ''} — ils ne seront pas supprimés, juste masqués tant que l'onglet n'est pas réajouté.`;
  } else if (tab.type === 'habits') {
    const cnt = state.habits.length;
    if (cnt) contentWarning = `Cet onglet contient ${cnt} habitude${cnt > 1 ? 's' : ''} — elles ne seront pas supprimées, juste masquées tant que l'onglet n'est pas réajouté.`;
  } else if (tab.type === 'list') {
    const cnt = state.checklistItems.filter(i => !i.categoryId && i.tabId === tabId).length;
    if (cnt) contentWarning = `Cet onglet contient ${cnt} élément${cnt > 1 ? 's' : ''} de liste — ils ne seront pas supprimés, juste masqués tant que l'onglet n'est pas réajouté.`;
  }
  const sub = `"${esc(tab.label)}" sera masqué. ${contentWarning}`;
  openModal({
    title: 'Supprimer l\'onglet ?',
    sub,
    fields: [],
    submit: 'Supprimer',
    onSubmit: async () => {
      state.settings.suiviTabs = tabs.filter(t => t.id !== tabId);
      await saveProfile({ suiviTabs: state.settings.suiviTabs });
      if (window._suiviActiveTab === tabId) window._suiviActiveTab = state.settings.suiviTabs.length ? state.settings.suiviTabs[0].id : null;
      renderSuiviTabBar();
      renderSuiviActiveTab();
    }
  });
}

document.getElementById('add-habit-btn').addEventListener('click', openAddHabitModal);

// ─── TGH tasks tab ──────────────────────────────────────────
window.tghTaskTab = 'today';
window.tghTaskAreaFilter = 'all';
window.tghTaskSearch = '';

document.getElementById('tgh-add-task-btn').addEventListener('click', () => openAddTaskModal());

document.getElementById('tgh-task-search').addEventListener('input', e => {
  tghTaskSearch = e.target.value.toLowerCase();
  renderTghTasks();
});

document.querySelectorAll('#tgh-tasks-panel .view-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#tgh-tasks-panel .view-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    tghTaskTab = btn.dataset.tab;
    renderTghTasks();
  });
});

document.querySelectorAll('#tgh-tasks-area-filter .area-filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#tgh-tasks-area-filter .area-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    tghTaskAreaFilter = btn.dataset.area;
    renderTghTasks();
  });
});


export { renderSuiviTabBar, renderSuiviActiveTab, renderSuiviList, addSuiviChecklistItem, openAddSuiviTabModal, removeSuiviTab };

Object.assign(window, { renderSuiviTabBar, renderSuiviActiveTab, renderSuiviList, addSuiviChecklistItem, openAddSuiviTabModal, removeSuiviTab });
