// ═══════════════════════════════════════════════════════════════
// TIME AUDIT
// ═══════════════════════════════════════════════════════════════
let timeChartInstance = null;

function renderTimeAudit() {
  const today = dk();
  const todayEntries = state.timeEntries.filter(e => e.date === today);
  const totalEstimated = todayEntries.reduce((s, e) => s + (e.estimatedMin || 0), 0);
  const totalActual = todayEntries.reduce((s, e) => s + (e.actualMin || 0), 0);
  const accuracy = totalEstimated > 0 ? Math.round((Math.min(totalActual, totalEstimated) / totalEstimated) * 100) : 0;

  document.getElementById('audit-estimated').textContent = totalEstimated > 0 ? formatMin(totalEstimated) : '—';
  document.getElementById('audit-actual').textContent = totalActual > 0 ? formatMin(totalActual) : '—';
  document.getElementById('audit-accuracy').textContent = totalEstimated > 0 ? `${accuracy}%` : '—';

  // Today's entries by root category
  const catGroups = {};
  todayEntries.forEach(e => {
    let rootName = 'Non catégorisé';
    if (e.categoryId) {
      const root = getCategoryRoot(e.categoryId);
      if (root) rootName = (root.icon || '') + ' ' + root.name;
    }
    if (!catGroups[rootName]) catGroups[rootName] = { count: 0, actual: 0, estimated: 0 };
    catGroups[rootName].count++;
    catGroups[rootName].actual += e.actualMin || 0;
    catGroups[rootName].estimated += e.estimatedMin || 0;
  });
  const catKeys = Object.keys(catGroups);
  if (catKeys.length) {
    document.getElementById('audit-cat-breakdown').style.display = '';
    document.getElementById('audit-cat-breakdown').innerHTML = '<div class="card-label" style="margin-bottom:8px">Today by category</div>'
      + catKeys.map(k => `<div class="audit-cat-row"><span>${k}</span><span>${formatMin(catGroups[k].actual)}</span></div>`).join('');
  } else {
    document.getElementById('audit-cat-breakdown').style.display = 'none';
  }

  // Weekly chart
  const days = [], estData = [], actData = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = dk(d);
    const entries = state.timeEntries.filter(e => e.date === key);
    days.push(d.toLocaleDateString(undefined, { weekday: 'short' }));
    estData.push(entries.reduce((s, e) => s + (e.estimatedMin || 0), 0));
    actData.push(entries.reduce((s, e) => s + (e.actualMin || 0), 0));
  }

  const ctx = document.getElementById('time-chart');
  if (timeChartInstance) timeChartInstance.destroy();
  timeChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: days,
      datasets: [
        { label: 'Estimated (min)', data: estData, backgroundColor: 'rgba(108,99,255,.4)', borderColor: '#6C63FF', borderWidth: 1, borderRadius: 4 },
        { label: 'Actual (min)', data: actData, backgroundColor: 'rgba(107,203,119,.4)', borderColor: '#6BCB77', borderWidth: 1, borderRadius: 4 }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: 'rgba(255,255,255,.6)', font: { family: 'Inter' } } } },
      scales: {
        x: { ticks: { color: 'rgba(255,255,255,.5)' }, grid: { color: 'rgba(255,255,255,.05)' } },
        y: { ticks: { color: 'rgba(255,255,255,.5)' }, grid: { color: 'rgba(255,255,255,.05)' } }
      }
    }
  });
}


export { renderTimeAudit };

Object.assign(window, { renderTimeAudit });
