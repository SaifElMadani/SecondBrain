// ═══════════════════════════════════════════════════════════════
// HOBBIES
// ═══════════════════════════════════════════════════════════════
let currentHobbyId = null;

function renderHobbies() {
  showHobbiesList();
  const el = document.getElementById('hobbies-list');
  if (!state.habits.length && !state.hobbies.length) {
    // show empty only for hobbies
  }
  if (!state.hobbies.length) {
    el.innerHTML = `<div class="empty-state" style="padding:40px 0"><div class="empty-icon">🎨</div><p>No hobbies yet</p><small>Add a hobby to start tracking your passions.</small></div>`;
    return;
  }
  el.innerHTML = state.hobbies.map(h => {
    const objCount = (h.objectives || []).length;
    const avgProgress = objCount ? Math.round(h.objectives.reduce((s, o) => s + (o.progress || 0), 0) / objCount) : 0;
    return `<div class="hobby-card" onclick="openHobbyDetail('${h.id}')" style="cursor:pointer">
      <div class="hobby-card-name">${esc(h.name)}</div>
      <div class="hobby-card-meta">${objCount} objective${objCount !== 1 ? 's' : ''} · ${avgProgress}% avg</div>
      <div class="hobby-card-bar"><div class="hobby-card-bar-fill" style="width:${avgProgress}%"></div></div>
      <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); deleteHobby('${h.id}')" style="margin-left:auto">✕</button>
    </div>`;
  }).join('');
}

function showHobbiesList() {
  document.getElementById('hobbies-list-view').style.display = '';
  document.getElementById('hobby-detail-view').style.display = 'none';
  currentHobbyId = null;
}

function openHobbyDetail(id) {
  const hobby = state.hobbies.find(h => h.id === id);
  if (!hobby) return;
  currentHobbyId = id;
  document.getElementById('hobbies-list-view').style.display = 'none';
  document.getElementById('hobby-detail-view').style.display = '';
  document.getElementById('hobby-detail-name').textContent = hobby.name;
  renderHobbyObjectives(hobby);
}

function renderHobbyObjectives(hobby) {
  const el = document.getElementById('hobby-objectives-list');
  const objs = hobby.objectives || [];
  if (!objs.length) {
    el.innerHTML = `<div class="empty-state" style="padding:30px 0"><p>No objectives yet.</p><small>Add objectives to track progress in this hobby.</small></div>`;
    return;
  }
  el.innerHTML = objs.map(o => `
    <div class="hobby-obj-card">
      <div class="hobby-obj-header">
        <div class="hobby-obj-title">${esc(o.title)}</div>
        <span class="hobby-obj-pct">${o.progress || 0}%</span>
        <button class="btn btn-ghost btn-sm" onclick="deleteHobbyObjective('${hobby.id}','${o.id}')" style="margin-left:8px">✕</button>
      </div>
      <div class="prog-track"><div class="prog-fill" style="width:${o.progress || 0}%"></div></div>
      <div style="display:flex;gap:6px;margin-top:8px">
        <button class="btn btn-ghost btn-sm" onclick="adjustHobbyObjective('${hobby.id}','${o.id}',-10)">−10</button>
        <button class="btn btn-ghost btn-sm" onclick="adjustHobbyObjective('${hobby.id}','${o.id}',10)">+10</button>
      </div>
    </div>`).join('');
}

function openHobbyModal(item = null) {
  const editing = !!item;
  openModal({
    title: editing ? 'Edit Hobby' : 'New Hobby',
    fields: [
      { name: 'name', label: 'Hobby Name', required: true, placeholder: 'e.g. Painting, Guitar, Cooking', value: editing ? item.name : '' }
    ],
    submit: editing ? 'Save Changes' : 'Add Hobby',
    onSubmit: async v => {
      if (editing) {
        Object.assign(item, { name: v.name });
        await saveDoc('hobbies', item.id, item);
      } else {
        const id = uid();
        const data = { id, name: v.name, objectives: [], createdAt: Date.now() };
        state.hobbies.unshift(data);
        await saveDoc('hobbies', id, data);
      }
      renderHobbies();
    }
  });
}

async function deleteHobby(id) {
  if (!confirm('Delete this hobby and all its objectives?')) return;
  state.hobbies = state.hobbies.filter(h => h.id !== id);
  await deleteDoc('hobbies', id);
  renderHobbies();
}

function addHobbyObjective() {
  const hobby = state.hobbies.find(h => h.id === currentHobbyId);
  if (!hobby) return;
  openModal({
    title: 'Add Objective',
    fields: [
      { name: 'title', label: 'Objective', required: true, placeholder: 'e.g. Learn 5 songs' }
    ],
    submit: 'Add',
    onSubmit: async v => {
      const obj = { id: uid(), title: v.title, progress: 0 };
      hobby.objectives = hobby.objectives || [];
      hobby.objectives.push(obj);
      await saveDoc('hobbies', hobby.id, hobby);
      renderHobbyObjectives(hobby);
    }
  });
}

async function adjustHobbyObjective(hobbyId, objId, delta) {
  const hobby = state.hobbies.find(h => h.id === hobbyId);
  if (!hobby) return;
  const obj = (hobby.objectives || []).find(o => o.id === objId);
  if (!obj) return;
  obj.progress = Math.max(0, Math.min(100, (obj.progress || 0) + delta));
  await saveDoc('hobbies', hobby.id, hobby);
  renderHobbyObjectives(hobby);
}

async function deleteHobbyObjective(hobbyId, objId) {
  const hobby = state.hobbies.find(h => h.id === hobbyId);
  if (!hobby) return;
  hobby.objectives = (hobby.objectives || []).filter(o => o.id !== objId);
  await saveDoc('hobbies', hobby.id, hobby);
  renderHobbyObjectives(hobby);
}

document.getElementById('add-hobby-btn').addEventListener('click', () => openHobbyModal());
document.getElementById('add-hobby-obj-btn').addEventListener('click', addHobbyObjective);


export { renderHobbies, showHobbiesList, openHobbyDetail, renderHobbyObjectives, openHobbyModal, deleteHobby, addHobbyObjective, adjustHobbyObjective, deleteHobbyObjective };

Object.assign(window, { renderHobbies, showHobbiesList, openHobbyDetail, renderHobbyObjectives, openHobbyModal, deleteHobby, addHobbyObjective, adjustHobbyObjective, deleteHobbyObjective });
