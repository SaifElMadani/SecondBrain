// ═══════════════════════════════════════════════════════════════
// GENERIC MODAL
// v1.23.0: field type 'weekdays' renders the SHARED weekday toggles
// (js/recur.js) + a hidden input the generic field reader can pick up —
// replaces the old numeric-array text input for daysOfWeek.
// ═══════════════════════════════════════════════════════════════

import { recurWeekdaysHtml, parseWeekdays } from './recur.js';

function openModal({ title, sub, fields, submit, customBody, onSubmit }) {
  const box = document.getElementById('modal-box');
  box.innerHTML = `
    <div class="modal-title">${esc(title)}</div>
    ${sub ? `<div class="modal-sub">${esc(sub)}</div>` : ''}
    ${customBody || ''}
    <form id="generic-form">
      ${(fields || []).map(f => buildField(f)).join('')}
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="modal-cancel-btn">Cancel</button>
        <button type="submit" class="btn">${esc(submit || 'Submit')}</button>
      </div>
    </form>`;

  box.querySelector('#modal-cancel-btn').addEventListener('click', closeModal);
  box.querySelector('#generic-form').addEventListener('submit', e => {
    e.preventDefault();
    const vals = {};
    (fields || []).forEach(f => {
      const el = box.querySelector(`#mf-${f.name}`);
      if (el) vals[f.name] = el.value;
    });
    if (onSubmit) onSubmit(vals);
    closeModal();
  });

  document.getElementById('modal-overlay').classList.add('open');
  setTimeout(() => { const first = box.querySelector('input,textarea,select'); if (first) first.focus(); }, 80);
}

function buildField(f) {
  const id = `mf-${f.name}`;
  const onchange = f.onchange ? ` onchange="${f.onchange}"` : '';
  let input = '';
  let shortcuts = '';
  if (f.type === 'textarea') {
    input = `<textarea id="${id}" placeholder="${esc(f.placeholder || '')}">${esc(f.value || '')}</textarea>`;
  } else if (f.type === 'goal-picker') {
    input = goalPickerFieldHtml(f);
  } else if (f.type === 'select') {
    input = `<select id="${id}"${onchange}>${(f.options || []).map(([v, l]) => `<option value="${esc(v)}"${v === (f.value || '') ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  } else if (f.type === 'weekdays') {
    // Shared 7-button weekday toggles + a hidden input kept in sync by
    // toggleRecurWeekday — same value format as before ('1,3'), so the
    // submit handler and goal-picker stash work unchanged.
    input = `${recurWeekdaysHtml(parseWeekdays(f.value), id)}<input type="hidden" id="${id}" value="${esc(f.value || '')}">`;
  } else {
    input = `<input type="${f.type || 'text'}" id="${id}" placeholder="${esc(f.placeholder || '')}" value="${esc(f.value || '')}"${onchange} ${f.required ? 'required' : ''}>`;
    if (f.type === 'date') {
      shortcuts = `<div class="date-shortcuts">
        <button type="button" class="date-shortcut" onclick="setDateShortcut('${id}','tomorrow')">Demain</button>
        <button type="button" class="date-shortcut" onclick="setDateShortcut('${id}','next_week')">Semaine prochaine</button>
        <button type="button" class="date-shortcut" onclick="setDateShortcut('${id}','next_month')">Mois prochain</button>
        <button type="button" class="date-shortcut" onclick="setDateShortcut('${id}','next_3_months')">Dans 3 mois</button>
      </div>`;
    }
  }
  const hidden = f.hidden ? ' style="display:none"' : '';
  return `<div class="modal-field" id="mf-wrap-${f.name}"${hidden}><label for="${id}">${esc(f.label)}</label>${input}${shortcuts}</div>`;
}

function setDateShortcut(inputId, key) {
  const el = document.getElementById(inputId);
  if (!el) return;
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (key === 'tomorrow') d.setDate(d.getDate() + 1);
  else if (key === 'next_week') d.setDate(d.getDate() + 7);
  else if (key === 'next_month') d.setMonth(d.getMonth() + 1);
  else if (key === 'next_3_months') d.setMonth(d.getMonth() + 3);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  el.value = `${y}-${m}-${day}`;
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

export { openModal, buildField, closeModal, setDateShortcut };

Object.assign(window, { openModal, buildField, closeModal, setDateShortcut });
