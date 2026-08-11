// ─── WATER REMINDER + SETTINGS ────────────────────────────────
// Reminder fires only while the app is open (setInterval dies with the
// tab/page). No push server exists, so no notifications when the app is
// closed — on any platform. iOS Safari (non-installed) never shows them;
// an installed PWA (iOS 16.4+) does, but only while it is running.

let waterTimer = null;

function getWaterSettings() {
  const s = state.settings.drinkReminder || {};
  return {
    enabled: !!s.enabled,
    interval: Math.max(5, parseInt(s.interval, 10) || 90)
  };
}

function startWaterReminder() {
  stopWaterReminder();
  const { enabled, interval } = getWaterSettings();
  if (!enabled) return;
  waterTimer = setInterval(waterNotify, interval * 60000);
}

function stopWaterReminder() {
  if (waterTimer) { clearInterval(waterTimer); waterTimer = null; }
}

function waterNotify() {
  const title = '💧 Boire de l\'eau';
  const body = 'Petite pause hydratation — bois un verre d\'eau !';
  const fire = () => {
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification(title, { body, tag: 'water-reminder', icon: 'icon-192.png' }); } catch (e) {}
    } else {
      toast(`${title} — ${body}`, 'info', 6000);
    }
  };
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().then(fire);
  } else {
    fire();
  }
  if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
}

// Bottom-nav customization (mobile). Working copy of the ordered entry
// list + included set; committed to state.settings.bottomNav on save.
let bnOrder = [];
let bnOn = new Set();

function initBnEditor() {
  const prefs = getBottomNavPrefs();
  const all = Object.keys(BOTTOM_NAV_ENTRIES);
  bnOn = new Set(prefs);
  bnOrder = prefs.concat(all.filter(k => !bnOn.has(k)));
}

function renderBnEditor() {
  const el = document.getElementById('bn-editor');
  if (!el) return;
  el.innerHTML = bnOrder.map((k, i) => {
    const e = BOTTOM_NAV_ENTRIES[k];
    return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">
      <input type="checkbox" ${bnOn.has(k) ? 'checked' : ''} onchange="bnToggle('${k}')">
      <span style="font-size:16px">${e.icon}</span>
      <span style="flex:1;font-size:13px;color:var(--text)">${e.label}</span>
      <button type="button" class="btn btn-ghost btn-xs" onclick="bnMove('${k}',-1)" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button type="button" class="btn btn-ghost btn-xs" onclick="bnMove('${k}',1)" ${i === bnOrder.length - 1 ? 'disabled' : ''}>↓</button>
    </div>`;
  }).join('');
}

function bnToggle(key) {
  if (bnOn.has(key)) bnOn.delete(key);
  else bnOn.add(key);
  renderBnEditor();
}

function bnMove(key, dir) {
  const i = bnOrder.indexOf(key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= bnOrder.length) return;
  [bnOrder[i], bnOrder[j]] = [bnOrder[j], bnOrder[i]];
  renderBnEditor();
}

function openSettings() {
  const s = getWaterSettings();
  initBnEditor();
  openModal({
    title: '⚙️ Settings',
    sub: 'Préférences de l\'application',
    customBody: `
      <div class="modal-field">
        <label>Barre du bas (mobile)</label>
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">Choisis les entrées de la barre du bas et leur ordre (au moins une).</div>
        <div id="bn-editor"></div>
      </div>`,
    fields: [
      {
        name: 'waterEnabled',
        label: 'Rappel « Boire de l\'eau »',
        type: 'select',
        options: [['false', 'Désactivé'], ['true', 'Activé']],
        value: s.enabled ? 'true' : 'false'
      },
      {
        name: 'waterInterval',
        label: 'Intervalle du rappel (minutes)',
        type: 'number',
        value: s.interval,
        placeholder: '90'
      }
    ],
    submit: 'Enregistrer',
    onSubmit: v => {
      const enabled = v.waterEnabled === 'true';
      const interval = Math.max(5, parseInt(v.waterInterval, 10) || 90);
      state.settings.drinkReminder = { enabled, interval };
      saveProfile({ drinkReminder: { enabled, interval } });
      startWaterReminder();

      const nextNav = bnOrder.filter(k => bnOn.has(k));
      if (nextNav.length) {
        state.settings.bottomNav = nextNav;
        saveProfile({ bottomNav: nextNav });
        renderBottomNav();
      } else {
        toast('Sélectionne au moins une entrée pour la barre du bas', 'error');
      }

      toast(enabled ? `Rappel d\'eau activé — toutes les ${interval} min 💧` : 'Rappel d\'eau désactivé', 'success');
    }
  });
  renderBnEditor();
}

document.getElementById('settings-btn').addEventListener('click', openSettings);

export { getWaterSettings, startWaterReminder, stopWaterReminder, waterNotify, openSettings, initBnEditor, renderBnEditor, bnToggle, bnMove };
Object.assign(window, { getWaterSettings, startWaterReminder, stopWaterReminder, waterNotify, openSettings, initBnEditor, renderBnEditor, bnToggle, bnMove });
