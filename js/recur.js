// ═══════════════════════════════════════════════════════════════
// SHARED QUICK-RECURRENCE COMPONENT (v1.24.0)
// ONE source of truth for the recurrence UI used in BOTH:
//   - the quick-create popover (js/calendar.js + #cal-quick-create) and
//   - the Add/Edit Task modal (js/tasks.js).
// Contains:
//   - the "Récurrent" checkbox + frequency chips block (recurBlockHtml),
//     where the checkbox IS the recurrence on/off (one-off = unchecked;
//     "Une fois" is no longer a chip — it's the unchecked state) and
//     unchecked chips are disabled (no phantom rule survives an uncheck);
//   - the rule-builder buildQuickRecurrence and the weekday toggles.
// Same renderers, same labels, same entry points (onRecurChipClick /
// onRecurCheck dispatch by context) → both surfaces stay synchronized by
// construction, no duplicated markup or logic.
// ═══════════════════════════════════════════════════════════════

// Frequency chips — "Une fois" is NOT here: it is the UNCHECKED state of
// the "Récurrent" checkbox. '3_months' = every 3 months, same day of month
// as the reference date.
const RECUR_CHIPS = [
  ['daily', 'Tous les jours'],
  ['weekly', 'Chaque semaine'],
  ['monthly', 'Chaque mois'],
  ['3_months', 'Tous les 3 mois'],
];

// Chip row markup. `selected` = chip currently active (highlighted);
// `disabled` = chips greyed/inert (checkbox unchecked → task is one-off).
function recurChipsHtml(selected, disabled) {
  return `<div class="qc-recur" data-recur-chips>
    ${RECUR_CHIPS.map(([f, label]) => `
      <button type="button" class="qc-recur-chip${f === selected ? ' selected' : ''}" data-chip="${f}"
        ${disabled ? 'disabled' : ''}
        onclick="onRecurChipClick('${f}')">${label}</button>`).join('')}
  </div>`;
}

// The recurrence block: "Récurrent" checkbox + frequency chips on the same
// row (no separate section/title). Checked → chips active/clickable;
// unchecked → chips disabled and the task stays one-off.
function recurBlockHtml({ checked, selected, disabled }) {
  return `<div class="recur-block">
    <label class="recur-check-label">
      <input type="checkbox"${checked ? ' checked' : ''} onclick="onRecurCheck(this)" aria-label="Récurrent">
      <span>Récurrent</span>
    </label>
    ${recurChipsHtml(checked ? selected : null, disabled)}
  </div>`;
}

// Chip → recurrence rule.
// - 'daily'    → every day, no end date
// - 'weekly'   → same WEEKDAY as the reference date (deduced — no separate
//                question), no end date
// - 'monthly'  → same DAY OF MONTH as the reference date (derived from
//                dueDate at render time), no end date
// - '3_months' → every 3 months, same DAY OF MONTH as the reference date
//                (interval=3 monthly), no end date
// - 'once' / null → null (one-off task; only reachable defensively — the
//                "Une fois" chip was replaced by the unchecked checkbox)
// endDate is always null here — no-end by default; the fine case (extra
// weekdays, an end date) is handled in the full modal's advanced options.
function buildQuickRecurrence(chip, dueDate) {
  if (chip === 'once' || !chip) return null;
  const base = { frequency: chip, daysOfWeek: null, endDate: null };
  if (chip === 'weekly') {
    const day = new Date((dueDate || dk()) + 'T00:00:00').getDay();
    base.daysOfWeek = [day];
  }
  return base;
}

// Highlight the active chip across whichever chip row is currently visible.
// Only one surface is ever open at a time (popover vs modal), so a global
// query is safe. Passing null clears every highlight.
function setRecurChipsHighlight(chip) {
  document.querySelectorAll('.qc-recur-chip').forEach(b => {
    b.classList.toggle('selected', b.dataset.chip === chip);
  });
}

// SINGLE chip click entry point shared by the popover AND the modal.
// Dispatch by context: popover open → create the task immediately
// (submitCalQuickCreate); otherwise (modal open) → apply the rule to the
// open form (taskModalPickRecurrence). Both functions are window globals
// resolved at click time, so this stays decoupled from either module.
function onRecurChipClick(chip) {
  const popover = document.getElementById('cal-quick-create');
  if (popover && popover.classList.contains('active')) {
    submitCalQuickCreate(chip);
  } else {
    taskModalPickRecurrence(chip);
  }
}

// SINGLE "Récurrent" checkbox entry point — dispatches the same way.
// Popover open → qcRecurCheck; modal open → modalRecurCheck (window globals).
function onRecurCheck(el) {
  const popover = document.getElementById('cal-quick-create');
  if (popover && popover.classList.contains('active')) {
    qcRecurCheck(el);
  } else {
    modalRecurCheck(el);
  }
}

// ═══════════════════════════════════════════════════════════════
// WEEKDAY TOGGLES (v1.23.0)
// 7 toggle buttons, one per weekday, used wherever a weekly recurrence's
// daysOfWeek is edited — currently the Add/Edit Task modal's "Options
// avancées" (the quick-create popover keeps its one-click weekly = slot
// weekday rule via buildQuickRecurrence). Rendered in FRENCH visual order
// (L M M J V S D); each button's data-wd is the JS getDay() index
// (0 = Dimanche), the SAME convention FullCalendar + taskOccursOnDate
// already use — storage stays daysOfWeek: number[] in [0-6], unchanged.
// Multiple days can be active at once; click = toggle, no manual entry.
// ═══════════════════════════════════════════════════════════════

const RECUR_WEEKDAYS = [
  ['1', 'L', 'Lundi'],
  ['2', 'M', 'Mardi'],
  ['3', 'M', 'Mercredi'],
  ['4', 'J', 'Jeudi'],
  ['5', 'V', 'Vendredi'],
  ['6', 'S', 'Samedi'],
  ['0', 'D', 'Dimanche'],
];

// '1,3' | '0,2,4' | '' → number[] ([1,3] / [0,2,4] / []). Sanitizes whatever
// comes out of the stored value / overrides.
function parseWeekdays(str) {
  return String(str || '').split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
}

// Row of 7 weekday toggles. `selectedDays` = number[] to pre-check (e.g. from
// an existing "Chaque semaine" rule on edit). `forId` (optional) = id of a
// hidden input kept in sync by toggleRecurWeekday — lets the generic modal
// field reader (`vals[name]`) and the goal-picker stash keep working untouched.
function recurWeekdaysHtml(selectedDays, forId) {
  const sel = parseWeekdays(Array.isArray(selectedDays) ? selectedDays.join(',') : selectedDays);
  return `<div class="recur-weekdays"${forId ? ` data-for="${forId}"` : ''}>
    ${RECUR_WEEKDAYS.map(([idx, label, full]) => `
      <button type="button" class="recur-weekday${sel.includes(+idx) ? ' selected' : ''}" data-wd="${idx}"
        title="${full}" aria-pressed="${sel.includes(+idx)}"
        onclick="toggleRecurWeekday(this)">${label}</button>`).join('')}
  </div>`;
}

// Click handler (inline onclick). Toggles ONE day on/off, then — if the row is
// bound to a form input via data-for — writes the active days back to it so the
// generic submit flow picks them up exactly as before.
function toggleRecurWeekday(btn) {
  btn.classList.toggle('selected');
  btn.setAttribute('aria-pressed', btn.classList.contains('selected'));
  const wrap = btn.closest('.recur-weekdays');
  const forId = wrap && wrap.getAttribute('data-for');
  if (forId) {
    const input = document.getElementById(forId);
    if (input) input.value = getRecurWeekdays(wrap).join(',');
  }
}

// Read the active days of a row (DOM or id), sorted ascending.
function getRecurWeekdays(root) {
  const wrap = typeof root === 'string' ? document.getElementById(root) : root;
  if (!wrap) return [];
  return Array.from(wrap.querySelectorAll('.recur-weekday.selected'))
    .map(b => +b.getAttribute('data-wd'))
    .sort((a, b) => a - b);
}

// Pre-check / clear a row to match a days list (e.g. after a chip click swaps
// the rule in the modal).
function setRecurWeekdays(root, days) {
  const wrap = typeof root === 'string' ? document.getElementById(root) : root;
  if (!wrap) return;
  const sel = (days || []).map(d => +d);
  wrap.querySelectorAll('.recur-weekday').forEach(b => {
    const on = sel.includes(+b.getAttribute('data-wd'));
    b.classList.toggle('selected', on);
    b.setAttribute('aria-pressed', on);
  });
}

export { RECUR_CHIPS, recurChipsHtml, recurBlockHtml, buildQuickRecurrence, setRecurChipsHighlight, RECUR_WEEKDAYS, parseWeekdays, recurWeekdaysHtml, toggleRecurWeekday, getRecurWeekdays, setRecurWeekdays };

Object.assign(window, { recurChipsHtml, recurBlockHtml, buildQuickRecurrence, setRecurChipsHighlight, onRecurChipClick, onRecurCheck, parseWeekdays, recurWeekdaysHtml, toggleRecurWeekday, getRecurWeekdays, setRecurWeekdays });
