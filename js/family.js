// ═══════════════════════════════════════════════════════════════
// FAMILY MODE
// ═══════════════════════════════════════════════════════════════
function renderFamily() {
  renderBabyCountdown();
  renderFamilyBlocks();
  renderBabyMilestones();
  renderFamilyScore();
  renderRecipes();
  renderMealPlan();
}

function renderBabyCountdown() {
  const dueDate = state.settings.babyDueDate;
  if (!dueDate) {
    document.getElementById('family-countdown').textContent = '— days';
    document.getElementById('family-countdown-label').textContent = 'Set your baby\'s due date in settings';
    return;
  }
  const due = new Date(dueDate);
  const diff = Math.ceil((due - new Date()) / 86400000);
  document.getElementById('family-countdown').textContent = diff > 0 ? `${diff} days` : 'Baby has arrived! 🎉';
  document.getElementById('family-countdown-label').textContent = diff > 0
    ? `until your baby's due date (${due.toLocaleDateString()})`
    : 'Congratulations on your new arrival!';
}

function renderFamilyBlocks() {
  const el = document.getElementById('family-blocks-list');
  const blocks = state.familyBlocks.filter(b => b.area === 'family' || b.protected);
  if (!blocks.length) {
    el.innerHTML = `<div class="empty-state" style="padding:20px 0"><p>No protected family time blocks yet.</p></div>`;
    return;
  }
  el.innerHTML = blocks.map(b => `
    <div class="family-block-item" style="margin-bottom:8px; cursor:pointer" onclick="openEditFamilyBlock('${b.id}')">
      <div class="family-block-icon">🔒</div>
      <div class="family-block-info">
        <div class="family-block-title">${esc(b.title)}</div>
        <div class="family-block-time">${b.date || 'Daily'} · ${b.startTime || '—'} – ${b.endTime || '—'}</div>
      </div>
      <span class="protected-badge">PROTECTED</span>
      <button onclick="event.stopPropagation(); deleteFamilyBlock('${b.id}')" style="color:var(--text-muted);margin-left:8px;font-size:16px">×</button>
    </div>`).join('');
}

document.getElementById('add-family-block-btn').addEventListener('click', () => {
  openModal({
    title: 'Add Protected Time',
    sub: 'Sacred family time that cannot be moved',
    fields: [
      { name: 'title', label: 'Block Title', placeholder: 'e.g. Family dinner', required: true },
      { name: 'date', label: 'Date', type: 'date' },
      { name: 'startTime', label: 'Start Time', type: 'time', placeholder: '18:00' },
      { name: 'endTime', label: 'End Time', type: 'time', placeholder: '20:00' },
      { name: 'recurring', label: 'Recurring Daily?', type: 'select', options: [['false', 'No'], ['true', 'Yes']] }
    ],
    submit: 'Protect This Time',
    onSubmit: async v => {
      const id = uid();
      const data = { id, title: v.title, date: v.date, startTime: v.startTime, endTime: v.endTime, area: 'family', recurring: v.recurring === 'true', protected: true, createdAt: Date.now() };
      state.familyBlocks.push(data);
      await saveDoc('familyBlocks', id, data);
      renderFamily();
    }
  });
});

async function deleteFamilyBlock(id) {
  state.familyBlocks = state.familyBlocks.filter(b => b.id !== id);
  await deleteDoc('familyBlocks', id);
  renderFamily();
}

function openEditFamilyBlock(id) {
  const block = state.familyBlocks.find(b => b.id === id);
  if (!block) return;
  openModal({
    title: 'Edit Protected Time',
    fields: [
      { name: 'title', label: 'Block Title', required: true, value: block.title },
      { name: 'date', label: 'Date', type: 'date', value: block.date || '' },
      { name: 'startTime', label: 'Start Time', type: 'time', value: block.startTime || '' },
      { name: 'endTime', label: 'End Time', type: 'time', value: block.endTime || '' },
      { name: 'recurring', label: 'Recurring Daily?', type: 'select', value: block.recurring ? 'true' : 'false', options: [['false', 'No'], ['true', 'Yes']] }
    ],
    submit: 'Save Changes',
    onSubmit: async v => {
      Object.assign(block, { title: v.title, date: v.date, startTime: v.startTime, endTime: v.endTime, recurring: v.recurring === 'true' });
      await saveDoc('familyBlocks', block.id, block);
      renderFamily();
    }
  });
}

function renderBabyMilestones() {
  const el = document.getElementById('baby-milestones-list');
  const milestones = state.babyMilestones;
  if (!milestones.length) {
    el.innerHTML = `<div class="empty-state" style="padding:20px 0"><p>Baby milestone checklist will appear after onboarding.</p></div>`;
    return;
  }
  el.innerHTML = milestones.map(m => `
    <div class="milestone-row">
      <div class="milestone-check-box${m.done ? ' done' : ''}" onclick="toggleBabyMilestone('${m.id}')">${m.done ? '✓' : ''}</div>
      <div class="milestone-row-text${m.done ? ' done' : ''}">${esc(m.text)}</div>
    </div>`).join('');
}

async function toggleBabyMilestone(id) {
  const m = state.babyMilestones.find(m => m.id === id);
  if (!m) return;
  m.done = !m.done;
  await saveDoc('babyMilestones', id, { done: m.done });
  renderBabyMilestones();
}

function renderFamilyScore() {
  const today = dk();
  const startOfWeek = new Date(); startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const weekBlocks = state.familyBlocks.filter(b => b.date >= dk(startOfWeek) && (b.area === 'family' || b.protected));
  const scored = weekBlocks.length;
  const total = 7; // target per week
  const pct = Math.min(100, Math.round((scored / total) * 100));

  const r = 50, circ = 2 * Math.PI * r;
  const fill = circ * (pct / 100);
  document.getElementById('family-score-ring').innerHTML = `
    <svg width="120" height="120" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--surface3)" stroke-width="10"/>
      <circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--family)" stroke-width="10"
        stroke-linecap="round" stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${(circ - fill).toFixed(2)}"
        transform="rotate(-90 60 60)"/>
      <text x="60" y="56" text-anchor="middle" font-size="22" font-weight="800" fill="var(--family)" font-family="Inter">${pct}%</text>
      <text x="60" y="72" text-anchor="middle" font-size="11" fill="var(--text-muted)" font-family="Inter">family score</text>
    </svg>`;
  document.getElementById('family-score-legend').innerHTML = `
    <div class="family-score-legend-item"><div class="legend-color" style="background:var(--family)"></div>${scored} of ${total} target blocks this week</div>
    <div class="family-score-legend-item"><div class="legend-color" style="background:var(--success)"></div>Protected time: ${state.familyBlocks.filter(b => b.protected).length} blocks</div>
  `;
}

// ─── FAMILY SUB-TABS ────────────────────────────────────────
function initFamilyTabs() {
  const tabs = [
    { btn: 'family-tab-blocks', panel: 'family-panel-blocks' },
    { btn: 'family-tab-baby', panel: 'family-panel-baby' },
    { btn: 'family-tab-meals', panel: 'family-panel-meals' }
  ];
  tabs.forEach(({ btn, panel }) => {
    document.getElementById(btn).addEventListener('click', () => {
      tabs.forEach(t => {
        document.getElementById(t.btn).classList.remove('active');
        document.getElementById(t.panel).style.display = 'none';
      });
      document.getElementById(btn).classList.add('active');
      document.getElementById(panel).style.display = '';
    });
  });
}
initFamilyTabs();

// ─── RECIPES ────────────────────────────────────────────────

export { renderFamily, renderBabyCountdown, renderFamilyBlocks, deleteFamilyBlock, openEditFamilyBlock, renderBabyMilestones, toggleBabyMilestone, renderFamilyScore, initFamilyTabs };

Object.assign(window, { renderFamily, renderBabyCountdown, renderFamilyBlocks, deleteFamilyBlock, openEditFamilyBlock, renderBabyMilestones, toggleBabyMilestone, renderFamilyScore, initFamilyTabs });
