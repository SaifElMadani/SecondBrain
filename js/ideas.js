function parseDateIdeaLine(line) {
  const parts = line.split('|');
  if (parts.length !== 5) return null;
  return {
    name: parts[0].trim(),
    tags: {
      location: parts[1].trim(),
      physical: parts[2].trim() === 'true',
      social: parts[3].trim(),
      goOut: parts[4].trim() === 'true',
    }
  };
}

async function seedDateIdeas() {
  if (state.dateIdeas.length > 0) return;
  for (const line of DATE_IDEAS_SEED) {
    const parsed = parseDateIdeaLine(line);
    if (!parsed) continue;
    const id = uid();
    const data = { id, name: parsed.name, tags: parsed.tags, createdAt: Date.now() };
    state.dateIdeas.push(data);
    await saveDoc('dateIdeas', id, data);
  }
  toast('Date ideas seeded! ' + state.dateIdeas.length + ' ideas loaded', 'success');
}

async function addDateIdea(name, tags) {
  const id = uid();
  const data = { id, name, tags, createdAt: Date.now() };
  state.dateIdeas.push(data);
  await saveDoc('dateIdeas', id, data);
  const cat = getCategoryById(activeCategoryId);
  if (cat && cat.moduleType === 'dateIdeas') {
    document.getElementById('category-content').innerHTML = renderDateIdeasContent(cat);
  }
}

async function editDateIdea(id, name, tags) {
  const idx = state.dateIdeas.findIndex(d => d.id === id);
  if (idx === -1) return;
  state.dateIdeas[idx].name = name;
  state.dateIdeas[idx].tags = tags;
  await saveDoc('dateIdeas', id, { name, tags });
  const cat = getCategoryById(activeCategoryId);
  if (cat && cat.moduleType === 'dateIdeas') {
    document.getElementById('category-content').innerHTML = renderDateIdeasContent(cat);
  }
}

async function deleteDateIdea(id) {
  state.dateIdeas = state.dateIdeas.filter(d => d.id !== id);
  await deleteDoc('dateIdeas', id);
  const cat = getCategoryById(activeCategoryId);
  if (cat && cat.moduleType === 'dateIdeas') {
    document.getElementById('category-content').innerHTML = renderDateIdeasContent(cat);
  }
}

function openAddDateIdeaModal() {
  openModal({
    title: 'Add Date Idea',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Go for a walk' },
      { name: 'location', label: 'Location', type: 'select', value: 'indoor',
        options: [['indoor','Indoor'],['outdoor','Outdoor'],['both','Both']] },
      { name: 'physical', label: 'Physical activity?', type: 'select', value: 'no',
        options: [['yes','Yes'],['no','No']] },
      { name: 'social', label: 'Social setting', type: 'select', value: 'couple',
        options: [['couple','Just us'],['friends','With friends'],['both','Both']] },
      { name: 'goOut', label: 'Go out?', type: 'select', value: 'no',
        options: [['yes','Yes'],['no','No']] },
    ],
    submit: 'Add',
    onSubmit: async vals => {
      const tags = {
        location: vals.location,
        physical: vals.physical === 'yes',
        social: vals.social,
        goOut: vals.goOut === 'yes',
      };
      await addDateIdea(vals.name, tags);
    }
  });
}

function openEditDateIdeaModal(id) {
  const editData = state.dateIdeas.find(d => d.id === id);
  if (!editData) return;
  openModal({
    title: 'Edit Date Idea',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, value: editData.name },
      { name: 'location', label: 'Location', type: 'select', value: editData.tags.location,
        options: [['indoor','Indoor'],['outdoor','Outdoor'],['both','Both']] },
      { name: 'physical', label: 'Physical activity?', type: 'select', value: editData.tags.physical ? 'yes' : 'no',
        options: [['yes','Yes'],['no','No']] },
      { name: 'social', label: 'Social setting', type: 'select', value: editData.tags.social,
        options: [['couple','Just us'],['friends','With friends'],['both','Both']] },
      { name: 'goOut', label: 'Go out?', type: 'select', value: editData.tags.goOut ? 'yes' : 'no',
        options: [['yes','Yes'],['no','No']] },
    ],
    submit: 'Save',
    onSubmit: async vals => {
      const tags = {
        location: vals.location,
        physical: vals.physical === 'yes',
        social: vals.social,
        goOut: vals.goOut === 'yes',
      };
      await editDateIdea(editData.id, vals.name, tags);
    }
  });
}

function renderDateIdeasContent(cat) {
  const ideas = state.dateIdeas;
  if (!ideas.length) {
    return `<div class="cat-content">
      <div class="empty-state"><div class="empty-icon">🌹</div><p>No date ideas yet</p>
      <button class="btn" onclick="openAddDateIdeaModal()">Add your first idea</button></div>
    </div>`;
  }

  window._dateQuizAnswers = window._dateQuizAnswers || { goOut: null, location: null, physical: null, social: null };
  const answers = window._dateQuizAnswers;
  let picked = window._dateQuizPicked;

  // Filter
  let filtered = [...ideas];
  if (answers.goOut !== null) {
    filtered = filtered.filter(d => d.tags.goOut === answers.goOut);
  }
  if (answers.location !== null) {
    filtered = filtered.filter(d => d.tags.location === answers.location || d.tags.location === 'both');
  }
  if (answers.physical !== null) {
    filtered = filtered.filter(d => d.tags.physical === answers.physical);
  }
  if (answers.social !== null) {
    filtered = filtered.filter(d => d.tags.social === answers.social || d.tags.social === 'both');
  }

  // Random pick
  if (!picked && filtered.length > 0) {
    picked = filtered[Math.floor(Math.random() * filtered.length)];
    window._dateQuizPicked = picked;
  }
  if (picked && !filtered.find(d => d.id === picked.id)) {
    picked = null;
    window._dateQuizPicked = null;
  }

  const renderAnswer = (key, label, options) => {
    const val = answers[key];
    const opts = [['any', 'Peu importe'], ...options];
    return opts.map(([v, lbl]) => {
      let jsVal = 'null';
      if (v !== 'any') {
        if (v === 'true') jsVal = 'true';
        else if (v === 'false') jsVal = 'false';
        else jsVal = `'${v}'`;
      }
      const active = val === (v === 'any' ? null : (v === 'true' ? true : v === 'false' ? false : v));
      return `<label class="date-quiz-option${active ? ' active' : ''}"
             onclick="window._dateQuizAnswers.${key}=${jsVal};window._dateQuizPicked=null;document.getElementById('category-content').innerHTML=renderDateIdeasContent(getCategoryById(activeCategoryId))">
        <input type="radio" name="dq-${key}" ${active ? 'checked' : ''}> ${lbl}
      </label>`;
    }).join('');
  };

  let html = `<div class="cat-content"><div class="cat-content-title">🌹 Date Ideas</div>`;

  // Quiz questions
  html += `<div class="date-quiz">
    <div class="date-quiz-q"><label>Stay in or go out?</label><div class="date-quiz-options">${renderAnswer('goOut', 'Go out?', [['true','Go out'],['false','Stay in']])}</div></div>
    <div class="date-quiz-q"><label>Indoor or outdoor?</label><div class="date-quiz-options">${renderAnswer('location', 'Location', [['indoor','Indoor'],['outdoor','Outdoor']])}</div></div>
    <div class="date-quiz-q"><label>Active or calm?</label><div class="date-quiz-options">${renderAnswer('physical', 'Activity', [['true','Active'],['false','Calm']])}</div></div>
    <div class="date-quiz-q"><label>Just us or with friends?</label><div class="date-quiz-options">${renderAnswer('social', 'Social', [['couple','Just us'],['friends','Friends']])}</div></div>
  </div>`;

  // Result
  html += `<div class="date-result" style="margin:16px 0;padding:16px;background:var(--surface2);border-radius:var(--radius);text-align:center">`;
  if (filtered.length === 0) {
    html += `<p style="color:var(--text-muted)">No ideas match these filters. Try "Peu importe" on some options.</p>`;
  } else if (picked) {
    html += `<div style="font-size:20px;font-weight:600;margin-bottom:8px">${esc(picked.name)}</div>`;
    html += `<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">
      ${picked.tags.goOut ? '🚗 Go out' : '🏠 Stay in'} · ${picked.tags.location === 'indoor' ? '🏠 Indoor' : picked.tags.location === 'outdoor' ? '🌳 Outdoor' : 'Both'} · ${picked.tags.physical ? '💪 Active' : '🛋️ Calm'} · ${picked.tags.social === 'couple' ? '💑 Just us' : picked.tags.social === 'friends' ? '👥 Friends' : 'Both'}
    </div>`;
    html += `<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
      <button class="btn" onclick="window._dateQuizPicked=null;document.getElementById('category-content').innerHTML=renderDateIdeasContent(getCategoryById(activeCategoryId))">🔁 Retirer</button>
      <button class="btn" onclick="scheduleDateIdea('${esc(picked.name)}')">📅 Programmer</button>
      <button class="btn btn-secondary" onclick="openEditDateIdeaModal('${picked.id}')">✎ Modifier</button>
    </div>`;
  } else {
    html += `<p style="color:var(--text-muted)">Click an option above to get started!</p>`;
  }
  html += `<div style="margin-top:12px;font-size:12px;color:var(--text-muted)">${filtered.length} idea${filtered.length !== 1 ? 's' : ''} match${filtered.length === 1 ? 'es' : ''} your filters</div>`;
  html += `</div>`;

  // Toutes les idées
  html += `<div class="date-all-ideas"><div class="cat-content-title" style="margin-top:16px">✨ All Ideas (${ideas.length})</div>`;
  html += `<div style="margin-bottom:8px"><button class="btn" onclick="openAddDateIdeaModal()">+ Add Date Idea</button></div>`;
  html += ideas.map(d => `
    <div class="cat-content-item" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span style="flex:1">${esc(d.name)}</span>
      <span style="font-size:11px;color:var(--text-muted)">${d.tags.goOut ? '🚗' : '🏠'} ${d.tags.location === 'indoor' ? '🏠' : d.tags.location === 'outdoor' ? '🌳' : '🔄'} ${d.tags.physical ? '💪' : '🛋️'} ${d.tags.social === 'couple' ? '💑' : d.tags.social === 'friends' ? '👥' : '🔄'}</span>
      <button class="btn btn-secondary" style="padding:2px 8px;font-size:11px" onclick="openEditDateIdeaModal('${d.id}')">✎</button>
      <button class="btn btn-secondary" style="padding:2px 8px;font-size:11px" onclick="if(confirm('Delete «${esc(d.name)}»?'))deleteDateIdea('${d.id}')">✕</button>
    </div>`).join('');
  html += `</div></div>`;

  return html;
}

async function scheduleDateIdea(name) {
  const familyRoot = state.categories.find(c => c.name === 'Family' && c.parentId === null);
  openAddTaskModal(name, null, null, { categoryId: familyRoot ? familyRoot.id : null });
}

export { parseDateIdeaLine, seedDateIdeas, addDateIdea, editDateIdea, deleteDateIdea, openAddDateIdeaModal, openEditDateIdeaModal, renderDateIdeasContent, scheduleDateIdea };

Object.assign(window, { parseDateIdeaLine, seedDateIdeas, addDateIdea, editDateIdea, deleteDateIdea, openAddDateIdeaModal, openEditDateIdeaModal, renderDateIdeasContent, scheduleDateIdea });
