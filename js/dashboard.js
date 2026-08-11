// ═══════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════
const DASH_ENERGY_EMOJI = { low: '🔋', medium: '🔋🔋', high: '🔋🔋🔋' };
const AREA_META = {
  family: { icon: '👨‍👩‍👧', label: 'Family' },
  career: { icon: '💼', label: 'Career' },
  growth: { icon: '🌱', label: 'Growth' },
  finance: { icon: '💰', label: 'Finance' },
  other: { icon: '🗂', label: 'Other' }
};

function renderDashboard() {
  renderGreeting();
  renderDashStats();
  renderDashHabits();
  renderDashCheckins();
  renderDashEnergy();
  renderDashGoals();
  renderDashWeeklyChart();
  renderDashCaptures();
  renderDashAchievements();
}

// ── Accordion state (per-section, isolated Sets — no shared toggle) ──
function toggleDashSection(id) {
  if (!window._dashCollapsed) window._dashCollapsed = new Set();
  if (window._dashCollapsed.has(id)) window._dashCollapsed.delete(id);
  else window._dashCollapsed.add(id);
  const body = document.getElementById('dash-body-' + id);
  const chev = document.getElementById('dash-chev-' + id);
  if (body) body.classList.toggle('collapsed', window._dashCollapsed.has(id));
  if (chev) chev.classList.toggle('expanded', !window._dashCollapsed.has(id));
}

function toggleDashHabitGroup(group) {
  if (!window._dashHabitGroups) window._dashHabitGroups = new Set();
  if (window._dashHabitGroups.has(group)) window._dashHabitGroups.delete(group);
  else window._dashHabitGroups.add(group);
  const body = document.getElementById('dash-habits-' + group);
  const chev = document.getElementById('dash-sub-chev-' + group);
  if (body) body.classList.toggle('collapsed', window._dashHabitGroups.has(group));
  if (chev) chev.classList.toggle('expanded', !window._dashHabitGroups.has(group));
}

function renderGreeting() {
  const now = new Date();
  const hour = now.getHours();
  const name = state.settings.name || 'there';
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  let greeting = 'Good evening';
  if (hour < 12) greeting = 'Good morning';
  else if (hour < 17) greeting = 'Good afternoon';

  const dateStr = `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
  document.getElementById('greeting-date').textContent = dateStr;
  document.getElementById('greeting-text').textContent = `${greeting}, ${name} 👋`;

  // Today's sprint focus
  const sprintGoals = state.goals.filter(g => g.isSprintObjective && g.sprintQuarter === getQuarterLabel());
  const obj = sprintGoals[0];
  const focusEl = document.getElementById('today-focus');
  if (obj) {
    focusEl.textContent = obj.weeklyActions?.[0] || obj.title;
  } else {
    focusEl.textContent = 'Add a sprint objective to see your daily focus here';
  }
}

function renderDashStats() {
  const today = dk();
  const startOfWeek = new Date(); startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const startOfWeekStr = dk(startOfWeek);

  const doneTodayCount = state.tasks.filter(t => t.done && t.completedAt?.startsWith?.(today)).length;
  const doneWeekCount = state.tasks.filter(t => t.done && t.completedAt >= startOfWeekStr).length;
  const maxStreak = state.habits.reduce((max, h) => Math.max(max, calcStreak(h.checkIns || [], h.frequency || 'daily')), 0);

  document.getElementById('stat-tasks-done').textContent = doneTodayCount;
  document.getElementById('stat-streak').textContent = maxStreak;
  document.getElementById('stat-week-tasks').textContent = doneWeekCount;
}

// ── Habits: split into Daily / Weekly / Monthly sub-accordions ──
function dashHabitGroup(freq) {
  const f = freq || 'daily';
  if (f === 'monthly') return 'monthly';
  if (f === 'weekly' || f === '3x_per_week') return 'weekly';
  return 'daily'; // daily + once
}

function renderDashHabits() {
  const groups = { daily: [], weekly: [], monthly: [] };
  state.habits.forEach(h => groups[dashHabitGroup(h.frequency)].push(h));

  const totalEl = document.getElementById('dash-habits-count');
  if (totalEl) totalEl.textContent = state.habits.length ? `${state.habits.length}` : '';

  ['daily', 'weekly', 'monthly'].forEach(group => {
    const el = document.getElementById('dash-habits-' + group);
    const countEl = document.getElementById('dash-habit-count-' + group);
    const list = groups[group];
    if (countEl) countEl.textContent = list.length ? `${list.length}` : '';
    if (!el) return;
    if (!list.length) {
      el.innerHTML = `<div style="font-size:12px; color:var(--text-muted)">No ${group} habits yet.</div>`;
      return;
    }
    el.innerHTML = list.map(h => {
      const freq = h.frequency || 'daily';
      const streak = calcStreak(h.checkIns || [], freq);
      const unit = freq === 'monthly' ? 'mo' : (freq === 'weekly' || freq === '3x_per_week') ? 'wk' : 'd';
      const checkedToday = (h.checkIns || []).includes(dk());
      const catId = getHabitCategoryId(h);
      const cat = catId ? (getCategoryById(catId)?.name || '') : '';
      return `<div class="dash-habit-row">
        <button class="task-check-sm${checkedToday ? ' done' : ''}" onclick="toggleHabitToday('${h.id}')" aria-label="Toggle ${esc(h.name)}" title="${checkedToday ? 'Checked today' : 'Check today'}"><span class="task-check-mark">✓</span></button>
        <span class="dash-habit-name" onclick="openAddHabitModal(state.habits.find(x=>x.id==='${h.id}'))" style="cursor:pointer" title="${esc(h.name)}">${esc(h.name)}</span>
        ${cat ? `<span class="dash-habit-tag">${esc(cat)}</span>` : ''}
        ${streak > 0 ? `<span class="dash-habit-streak">🔥 ${streak}${unit}</span>` : ''}
      </div>`;
    }).join('');
  });
}

// ── Morning / Afternoon: today summary + 7-day strip ──
function renderDashCheckins() {
  const todayEl = document.getElementById('dash-checkin-today');
  const stripEl = document.getElementById('dash-checkin-strip');
  const today = dk();
  const j = state.journal[today] || {};
  const prioTask = state.tasks.find(t => t.isDayPriority && t.dueDate === today && !t.done);

  if (todayEl) {
    if (!j.morningDone && !prioTask) {
      todayEl.innerHTML = `<div style="font-size:13px; color:var(--text-muted)">Complete your <span style="color:var(--accent-light); cursor:pointer" onclick="openRitual('morning')">morning ritual →</span></div>`;
    } else {
      const focusTitle = prioTask ? prioTask.title : (j.morningFocus || '—');
      todayEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 0 2px">
          <div style="font-size:28px">${j.mood || j.morningMood || '🙂'}</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              ${prioTask ? '<span class="pri-day-badge">⭐ Priorité du jour</span>' : ''}
              <div style="font-size:14px; font-weight:600; color:var(--text)">${esc(focusTitle)}</div>
            </div>
            <div style="font-size:11px; color:var(--text-muted); margin-top:2px">Energy: ${energyLabel(j.energy)}</div>
          </div>
          ${prioTask ? `<button class="task-check" onclick="toggleTask('${prioTask.id}')" aria-label="Complete day priority" title="Mark done"><span class="task-check-mark">✓</span></button>` : ''}
        </div>`;
    }
  }

  if (stripEl) {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = dk(d);
      const entry = state.journal[key] || {};
      const morning = !!(entry.morningDone || entry.morning);
      const afternoon = !!(entry.afternoonDone || entry.afternoon);
      days.push({
        label: i === 0 ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' }),
        morning, afternoon
      });
    }
    stripEl.innerHTML = `<div class="dash-checkin-strip">${days.map(dy => `
      <div class="dash-checkin-day">
        <div class="dash-checkin-day-label">${dy.label}</div>
        <div class="dash-checkin-dots">
          <span class="dash-checkin-dot${dy.morning ? ' done' : ''}" title="Morning"></span>
          <span class="dash-checkin-dot${dy.afternoon ? ' done' : ''}" title="Afternoon"></span>
        </div>
      </div>`).join('')}</div>`;
  }
}

// ── Weekly Energy widget ──
function renderDashEnergy() {
  const btnsEl = document.getElementById('dash-energy-btns');
  const stripEl = document.getElementById('dash-energy-strip');
  const today = dk();
  const cur = state.journal[today]?.energy ? energyLevel(state.journal[today].energy) : null;

  if (btnsEl) {
    btnsEl.innerHTML = ['low', 'medium', 'high'].map(lv =>
      `<button class="dash-energy-btn${cur === lv ? ' selected' : ''}" onclick="setDashEnergy('${lv}')" title="${lv}">${DASH_ENERGY_EMOJI[lv]}</button>`
    ).join('');
  }

  if (stripEl) {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = dk(d);
      const entry = state.journal[key] || {};
      const lv = entry.energy ? energyLevel(entry.energy) : null;
      days.push({
        label: i === 0 ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' }),
        emoji: lv ? DASH_ENERGY_EMOJI[lv] : '·',
        filled: !!lv
      });
    }
    stripEl.innerHTML = `<div class="dash-energy-strip">${days.map(dy => `
      <div class="dash-energy-day">
        <div class="dash-energy-day-label">${dy.label}</div>
        <div class="dash-energy-day-emoji${dy.filled ? ' filled' : ''}">${dy.emoji}</div>
      </div>`).join('')}</div>`;
  }
}

async function setDashEnergy(level) {
  const today = dk();
  const existing = state.journal[today] || { id: today, date: today, createdAt: Date.now() };
  const updated = { ...existing, energy: level, updatedAt: Date.now() };
  state.journal[today] = updated;
  await saveDoc('journal', today, updated);
  renderDashEnergy();
  renderDashCheckins();
  toast('Energy logged', 'success');
}

// ── Goals progress bars grouped by Life Area ──
function renderDashGoals() {
  const el = document.getElementById('dash-body-goals');
  const buckets = {};
  state.goals.forEach(g => {
    const area = getGoalLifeArea(g) || 'other';
    if (!buckets[area]) buckets[area] = [];
    buckets[area].push(computeGoalProgress(g));
  });
  const keys = Object.keys(buckets);
  if (!keys.length) {
    el.innerHTML = `<div style="font-size:13px; color:var(--text-muted)">No goals yet. <span style="color:var(--accent-light); cursor:pointer" onclick="goTo('goals')">Add goals →</span></div>`;
    return;
  }
  el.innerHTML = keys.map(k => {
    const items = buckets[k];
    const avg = Math.round(items.reduce((s, g) => s + g.progress, 0) / items.length);
    const color = (window.AREA_COLORS && AREA_COLORS[k]) || 'var(--accent)';
    const meta = AREA_META[k] || { icon: '🗂', label: k };
    return `<div class="dash-goal-area">
      <div class="dash-goal-area-head">
        <span class="dash-goal-area-label">${meta.icon} ${meta.label}</span>
        <span class="dash-goal-area-count">${items.length} goal${items.length > 1 ? 's' : ''}</span>
        <span class="dash-goal-area-num">${avg}%</span>
      </div>
      <div class="dash-goal-area-bar"><div class="dash-goal-area-fill" style="width:${avg}%;background:${color}"></div></div>
    </div>`;
  }).join('');
}

// ── Weekly tasks: created vs completed chart ──
function renderDashWeeklyChart() {
  const el = document.getElementById('dash-body-weekly');
  if (!el) return;
  const dayLabels = [], dayCompleted = [], dayCreated = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = dk(d);
    const label = i === 0 ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' });
    dayLabels.push(label);
    dayCompleted.push(state.tasks.filter(t => t.done && t.completedAt?.startsWith?.(key)).length);
    dayCreated.push(state.tasks.filter(t => {
      const created = t.createdAt ? dk(new Date(t.createdAt)) : null;
      return created === key;
    }).length);
  }
  const maxVal = Math.max(1, ...dayCompleted, ...dayCreated);
  let html = `<div class="achieve-week-chart">`;
  for (let i = 0; i < 7; i++) {
    const ch = Math.round((dayCompleted[i] / maxVal) * 100);
    const cr = Math.round((dayCreated[i] / maxVal) * 100);
    html += `<div class="achieve-week-day">
      <div class="achieve-week-label">${dayLabels[i]}</div>
      <div class="achieve-week-bars">
        <div class="achieve-week-bar-wrap"><div class="achieve-week-bar created" style="height:${cr}%"></div></div>
        <div class="achieve-week-bar-wrap"><div class="achieve-week-bar completed" style="height:${ch}%"></div></div>
      </div>
      <div class="achieve-week-nums">
        <span class="created-num">${dayCreated[i]}</span>
        <span class="completed-num">${dayCompleted[i]}</span>
      </div>
    </div>`;
  }
  html += `</div>
    <div class="achieve-week-legend">
      <span><span class="legend-dot created"></span> Created</span>
      <span><span class="legend-dot completed"></span> Completed</span>
    </div>`;
  el.innerHTML = html;
}

function renderDashCaptures() {
  const el = document.getElementById('dash-captures');
  const recent = state.captures.slice(0, 3);
  if (!recent.length) {
    el.innerHTML = `<div style="font-size:13px; color:var(--text-muted)">Nothing captured yet. Tap the <strong>⚡</strong> button!</div>`;
    return;
  }
  el.innerHTML = recent.map(c => `
    <div class="capture-item">
      <div class="capture-type-dot ${c.type}"></div>
      <div class="capture-content">${esc(c.content)}</div>
    </div>`).join('');
}

function renderDashAchievements() {
  const el = document.getElementById('dash-achievements-content');
  const today = dk();
  const sevenDaysAgo = dk(new Date(Date.now() - 7 * 86400000));

  const todayEntries = state.timeEntries.filter(e => e.date === today);
  const totalMin = todayEntries.reduce((s, e) => s + (e.actualMin || 0), 0);
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  const timeUsed = totalMin >= 60 ? `${h}h ${m}m` : `${totalMin}m`;

  const doneWeek = state.tasks.filter(t => t.done && t.completedAt >= sevenDaysAgo).length;
  const activeStreaks = state.habits.map(h => ({ name: h.name, streak: calcStreak(h.checkIns || [], h.frequency || 'daily') })).filter(s => s.streak > 0).sort((a, b) => b.streak - a.streak);
  const recentWins = state.wins.slice(-3).reverse();

  const allCats = {};
  state.categories.forEach(c => { allCats[c.id] = { name: c.icon ? c.icon + ' ' + c.name : c.name, color: c.color || 'var(--accent)' }; });
  const rootMap = {};
  function toRoot(categoryId) {
    if (!categoryId) return null;
    if (rootMap[categoryId] !== undefined) return rootMap[categoryId];
    const r = getCategoryRoot(categoryId);
    rootMap[categoryId] = r ? r.id : null;
    return rootMap[categoryId];
  }
  function catStyle(id) {
    const c = allCats[id];
    return c ? `color:${c.color}; background:${c.color}18; border-left:3px solid ${c.color}` : '';
  }
  function catLabel(id) { return allCats[id] ? allCats[id].name : 'Uncategorized'; }

  let html = '';

  html += `<div class="achieve-stats">
    <div class="achieve-stat">
      <div class="achieve-num green">${timeUsed}</div>
      <div class="achieve-label">Time logged today</div>
    </div>
    <div class="achieve-stat">
      <div class="achieve-num accent">${doneWeek}</div>
      <div class="achieve-label">Tasks this week</div>
    </div>
    <div class="achieve-stat">
      <div class="achieve-num yellow">${activeStreaks.length ? activeStreaks[0].streak : 0}🔥</div>
      <div class="achieve-label">Best habit streak</div>
    </div>
  </div>`;

  // ── Tasks by category ──
  const taskBuckets = {};
  state.tasks.filter(t => t.done && t.completedAt >= sevenDaysAgo).forEach(t => {
    const r = toRoot(getTaskCategoryId(t));
    const key = r || 'none';
    taskBuckets[key] = (taskBuckets[key] || 0) + 1;
  });
  const taskTotal = doneWeek || 1;
  const taskKeys = Object.keys(taskBuckets).sort((a, b) => taskBuckets[b] - taskBuckets[a]);

  if (taskKeys.length) {
    html += `<div class="achieve-section">
      <div class="achieve-section-title">Tasks by category (this week)</div>
      <div class="achieve-cats">${taskKeys.map(k => {
        const pct = Math.round((taskBuckets[k] / taskTotal) * 100);
        return `<div class="achieve-cat-row" style="${catStyle(k)}">
          <div class="achieve-cat-label">${catLabel(k)}</div>
          <div class="achieve-cat-bar"><div class="achieve-cat-fill" style="width:${pct}%;background:${allCats[k]?.color || 'var(--accent)'}"></div></div>
          <div class="achieve-cat-num">${taskBuckets[k]} <span style="color:var(--text-muted)">(${pct}%)</span></div>
        </div>`;
      }).join('')}</div>
    </div>`;
  }

  const habitBuckets = {};
  state.habits.forEach(h => {
    const streak = calcStreak(h.checkIns || [], h.frequency || 'daily');
    if (streak <= 0) return;
    const r = toRoot(getHabitCategoryId(h));
    const key = r || 'none';
    if (!habitBuckets[key]) habitBuckets[key] = [];
    habitBuckets[key].push({ name: h.name, streak });
  });
  const habitKeys = Object.keys(habitBuckets).sort((a, b) => {
    const maxA = Math.max(...habitBuckets[a].map(h => h.streak));
    const maxB = Math.max(...habitBuckets[b].map(h => h.streak));
    return maxB - maxA;
  });

  if (habitKeys.length) {
    html += `<div class="achieve-section">
      <div class="achieve-section-title">Habit streaks by category</div>
      <div class="achieve-cats">${habitKeys.map(k => {
        const items = habitBuckets[k].sort((a, b) => b.streak - a.streak);
        return `<div class="achieve-cat-row achieve-cat-row-col" style="${catStyle(k)}">
          <div class="achieve-cat-label">${catLabel(k)}</div>
          <div class="achieve-habit-list">${items.map(h =>
            `<div class="achieve-habit-item"><span>🔥</span> <span>${esc(h.name)}</span> <span class="achieve-streak-num">${h.streak}d</span></div>`
          ).join('')}</div>
        </div>`;
      }).join('')}</div>
    </div>`;
  }

  if (recentWins.length) {
    html += `<div class="achieve-section">
      <div class="achieve-section-title">Recent Wins</div>
      <div class="achieve-wins">${recentWins.map(w =>
        `<div class="achieve-win">${esc(w.text)}</div>`
      ).join('')}</div>
    </div>`;
  }

  if (!totalMin && !doneWeek && !activeStreaks.length && !recentWins.length) {
    html = `<div style="font-size:13px; color:var(--text-muted)">Complete tasks, habits, and goals to see your achievements here.</div>`;
  }

  el.innerHTML = html;
}


export { renderDashboard, renderGreeting, renderDashStats, renderDashHabits, renderDashCheckins, renderDashEnergy, setDashEnergy, renderDashGoals, renderDashWeeklyChart, renderDashCaptures, renderDashAchievements, toggleDashSection, toggleDashHabitGroup };

Object.assign(window, { renderDashboard, renderGreeting, renderDashStats, renderDashHabits, renderDashCheckins, renderDashEnergy, setDashEnergy, renderDashGoals, renderDashWeeklyChart, renderDashCaptures, renderDashAchievements, toggleDashSection, toggleDashHabitGroup });
