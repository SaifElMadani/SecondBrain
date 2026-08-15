// ═══════════════════════════════════════════════════════════════
// REWARDS — currency-free celebration system
// A Reward is an optional celebratory unlock (emoji + name) attached
// to a Task or a Goal. Completing the source (task.done === true, or
// a goal whose derived progress crosses 100%) auto-grants the reward
// and records a `rewardGrants` document. Grants are deduplicated per
// source via a deterministic doc id: `task:{id}:completed` and
// `goal:{id}:completed`. There is NO currency, XP, or level system.
// ═══════════════════════════════════════════════════════════════

function rewardById(id) {
  if (!id) return null;
  return state.rewards.find(r => r.id === id);
}

function buildRewardOptions(includeNew = false) {
  const opts = [['', '— No reward —']];
  state.rewards.filter(r => !r.archived).forEach(r => opts.push([r.id, `${r.icon || '🎁'} ${r.name}`]));
  if (includeNew) opts.push(['__new__', '➕ Create new reward']);
  return opts;
}

// ─── CRUD ──────────────────────────────────────────────────────
function openAddRewardModal(item = null, onCreated = null) {
  const editing = !!item;
  openModal({
    title: editing ? 'Edit Reward' : 'New Reward',
    sub: 'A reward is a celebration you unlock by completing a task or goal.',
    fields: [
      { name: 'name', label: 'Name', value: editing ? item.name : '', required: true, placeholder: 'e.g. Movie night' },
      { name: 'icon', label: 'Icon (emoji)', value: editing ? item.icon : '', placeholder: '🍿' },
      { name: 'description', label: 'Description', type: 'textarea', value: editing ? item.description : '', placeholder: 'Optional note about this reward' },
      { name: 'archived', label: 'Status', type: 'select', value: editing ? (item.archived ? 'true' : 'false') : 'false', options: [['false', 'Active'], ['true', 'Archived']] }
    ],
    submit: editing ? 'Save' : 'Create',
    onSubmit: async (vals) => {
      const name = (vals.name || '').trim();
      if (!name) { toast('Reward needs a name', 'error'); return; }
      const data = {
        name,
        icon: (vals.icon || '🎁').trim(),
        description: (vals.description || '').trim(),
        archived: vals.archived === 'true',
        createdAt: editing ? item.createdAt : Date.now()
      };
      if (editing) {
        Object.assign(item, data);
        await saveDoc('rewards', item.id, item);
        toast('Reward updated', 'success');
      } else {
        const id = uid();
        const reward = { id, ...data };
        state.rewards.push(reward);
        await saveDoc('rewards', id, reward);
        toast('Reward created', 'success');
        if (onCreated) onCreated(id);
      }
      if (currentView === 'rewards') renderRewards();
    }
  });
}

async function toggleRewardArchived(id) {
  const r = rewardById(id);
  if (!r) return;
  r.archived = !r.archived;
  await saveDoc('rewards', id, r);
  renderRewards();
}

async function deleteReward(id) {
  const r = rewardById(id);
  if (!r) return;
  state.rewards = state.rewards.filter(x => x.id !== id);
  await deleteDoc('rewards', id);
  renderRewards();
}

// ─── GRANTING (deduped, currency-free) ─────────────────────────
// One grant per source, forever. Changing/removing attachedRewardId
// after a grant never revokes the grant.
async function grantReward({ sourceType, sourceId, rewardId }) {
  const key = `${sourceType}:${sourceId}:completed`;
  if (state.rewardGrants.some(g => g.id === key)) return false;
  const remote = await col('rewardGrants').doc(key).get().then(s => s.exists).catch(() => false);
  if (remote) return false;
  const grant = { id: key, sourceType, sourceId, rewardId, grantedAt: Date.now(), createdAt: Date.now() };
  await saveDoc('rewardGrants', key, grant);
  state.rewardGrants.unshift(grant);
  return true;
}

async function grantTaskReward(task) {
  if (!task || !task.attachedRewardId) return;
  const reward = rewardById(task.attachedRewardId);
  if (!reward || reward.archived) return;
  const granted = await grantReward({ sourceType: 'task', sourceId: task.id, rewardId: reward.id });
  if (granted) toast(`🎉 ${reward.icon || '🎁'} ${reward.name} unlocked!`, 'success');
}

async function grantGoalReward(goal) {
  if (!goal || !goal.attachedRewardId) return;
  const reward = rewardById(goal.attachedRewardId);
  if (!reward || reward.archived) return;
  const granted = await grantReward({ sourceType: 'goal', sourceId: goal.id, rewardId: reward.id });
  if (granted) toast(`🎉 ${reward.icon || '🎁'} ${reward.name} unlocked!`, 'success');
}

// Completion detection point for goals: derived progress crossing 100%.
// Called from the mutation points that can raise a goal's progress.
async function checkGoalRewardCompletion(goal) {
  if (!goal || !goal.attachedRewardId) return;
  const p = computeGoalProgress(goal);
  if (p.progress >= 100) await grantGoalReward(goal);
}

// ─── BADGE ─────────────────────────────────────────────────────
function rewardBadgeHtml(rewardId, extraClass = '') {
  const r = rewardById(rewardId);
  if (!r) return '';
  return `<span class="reward-badge ${extraClass}" title="Reward: ${esc(r.name)}">${esc(r.icon || '🎁')} ${esc(r.name)}</span>`;
}

// ─── VIEW ──────────────────────────────────────────────────────
function renderRewards() {
  const listEl = document.getElementById('rewards-list');
  const grantsEl = document.getElementById('reward-grants-list');
  if (!listEl && !grantsEl) return;
  const active = state.rewards.filter(r => !r.archived);
  const archived = state.rewards.filter(r => r.archived);
  if (listEl) {
    listEl.innerHTML = state.rewards.length
      ? [
          ...active.map(rewardCardHtml),
          ...(archived.length
            ? [`<div class="rewards-archived-title">Archived (${archived.length})</div>`, ...archived.map(rewardCardHtml)]
            : [])
        ].join('')
      : `<div class="empty-state"><div class="empty-icon">🎁</div><p>No rewards yet</p><small>Create a reward, then attach it to a task or goal</small></div>`;
  }
  if (grantsEl) {
    if (!state.rewardGrants.length) {
      grantsEl.innerHTML = `<div class="empty-state" style="margin-top:12px"><p>Nothing unlocked yet</p></div>`;
      return;
    }
    grantsEl.innerHTML = [...state.rewardGrants]
      .sort((a, b) => (b.grantedAt || 0) - (a.grantedAt || 0))
      .slice(0, 50)
      .map(g => {
        const r = rewardById(g.rewardId);
        const source = g.sourceType === 'goal' ? getGoalById(g.sourceId) : state.tasks.find(t => t.id === g.sourceId);
        const srcLabel = source ? source.title : (g.sourceId || 'deleted item');
        return `<div class="grant-item">
          <div class="grant-emoji">${esc((r && r.icon) || '🎁')}</div>
          <div class="grant-text">
            <div class="grant-name">${r ? esc(r.name) : 'Reward'}</div>
            <div class="grant-source">${g.sourceType === 'goal' ? '🎯' : '✅'} ${esc(srcLabel)}</div>
          </div>
          <div class="grant-time">${new Date(g.grantedAt || g.createdAt || 0).toLocaleDateString()}</div>
        </div>`;
      }).join('');
  }
}

function rewardCardHtml(r) {
  return `<div class="reward-card${r.archived ? ' archived' : ''}">
    <div class="reward-icon">${esc(r.icon || '🎁')}</div>
    <div class="reward-info">
      <div class="reward-name">${esc(r.name)}</div>
      ${r.description ? `<div class="reward-desc">${esc(r.description)}</div>` : ''}
      ${r.archived ? '<div class="reward-archived-tag">Archived</div>' : ''}
    </div>
    <div class="reward-actions">
      <button class="btn btn-ghost btn-xs" onclick="openAddRewardModal(rewardById('${r.id}'))">Edit</button>
      <button class="btn btn-ghost btn-xs" onclick="toggleRewardArchived('${r.id}')">${r.archived ? 'Restore' : 'Archive'}</button>
      <button class="btn btn-ghost btn-xs reward-del" onclick="deleteReward('${r.id}')">Delete</button>
    </div>
  </div>`;
}

// ─── INLINE CREATION INSIDE TASK/GOAL MODALS ───────────────────
function stashModalFieldValues(names) {
  const stash = {};
  names.forEach(n => {
    const el = document.getElementById('mf-' + n);
    if (el) stash[n] = el.value;
  });
  return stash;
}

function taskRewardSelectChange() {
  const sel = document.getElementById('mf-attachedRewardId');
  if (!sel || sel.value !== '__new__') return;
  const stash = stashModalFieldValues(['title', 'goalId', 'dueDate', 'duration', 'priority']);
  const item = window._editingTask || null;
  openAddRewardModal(null, (createdId) => {
    setTimeout(() => openAddTaskModal(stash.title || '', null, item, { ...stash, attachedRewardId: createdId }), 0);
  });
}

function goalRewardSelectChange(goalId) {
  const sel = document.getElementById('mf-attachedRewardId');
  if (!sel || sel.value !== '__new__') return;
  const stash = stashModalFieldValues(['title', 'categoryId', 'deadline', 'isSprintObjective', 'sprintPriority']);
  const goal = goalId ? getGoalById(goalId) : null;
  openAddRewardModal(null, (createdId) => {
    setTimeout(() => openAddGoalModal(goal, { ...stash, attachedRewardId: createdId }), 0);
  });
}

// Part B: shows the sprintPriority field only when isSprintObjective === 'true'
function toggleSprintPriorityField() {
  const sel = document.getElementById('mf-isSprintObjective');
  const wrap = document.getElementById('mf-wrap-sprintPriority');
  if (sel && wrap) wrap.style.display = sel.value === 'true' ? '' : 'none';
}

document.getElementById('add-reward-btn')?.addEventListener('click', () => openAddRewardModal());

export {
  rewardById, buildRewardOptions, openAddRewardModal, toggleRewardArchived, deleteReward,
  grantTaskReward, grantGoalReward, checkGoalRewardCompletion, rewardBadgeHtml, renderRewards,
  taskRewardSelectChange, goalRewardSelectChange, toggleSprintPriorityField
};

Object.assign(window, {
  rewardById, buildRewardOptions, openAddRewardModal, toggleRewardArchived, deleteReward,
  grantTaskReward, grantGoalReward, checkGoalRewardCompletion, rewardBadgeHtml, renderRewards,
  taskRewardSelectChange, goalRewardSelectChange, toggleSprintPriorityField
});
