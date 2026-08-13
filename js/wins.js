// ═══════════════════════════════════════════════════════════════
// WINS LOG
// ═══════════════════════════════════════════════════════════════
async function logWin(text, categoryId = null) {
  const id = uid();
  const data = { id, text, categoryId, createdAt: Date.now(), date: dk() };
  state.wins.unshift(data);
  await saveDoc('wins', id, data);
  if (currentView === 'wins') renderWins();
}

function renderWins() {
  const el = document.getElementById('wins-list');
  if (!state.wins.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🏆</div><p>No wins yet</p><small>Complete tasks and habits to log wins automatically</small></div>`;
    return;
  }
  const groups = {};
  state.wins.slice(0, 50).forEach(w => {
    let rootName = 'Non catégorisé';
    if (w.categoryId) {
      const root = getCategoryRoot(w.categoryId);
      if (root) rootName = (root.icon || '') + ' ' + root.name;
    }
    if (!groups[rootName]) groups[rootName] = [];
    groups[rootName].push(w);
  });
  const rootOrder = ['Family', 'Growth', 'Career', 'Finance', 'Non catégorisé'];
  const sorted = Object.keys(groups).sort((a, b) => {
    const ia = rootOrder.findIndex(r => a.includes(r));
    const ib = rootOrder.findIndex(r => b.includes(r));
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  const trophies = ['🏆', '🥇', '🎯', '✅', '⭐', '💪', '🚀'];
  el.innerHTML = sorted.map(rootName => `
    <div class="tgh-cat-group">
      <div class="tgh-cat-group-title">${rootName} (${groups[rootName].length})</div>
      ${groups[rootName].map((w, i) => `
        <div class="win-item">
          <div class="win-emoji">${trophies[i % trophies.length]}</div>
          <div class="win-text">${esc(w.text)}</div>
          <div class="win-time">${new Date(w.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${w.date}</div>
        </div>`).join('')}
    </div>`).join('');
}


export { logWin, renderWins };

Object.assign(window, { logWin, renderWins });
