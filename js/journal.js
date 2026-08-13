// ═══════════════════════════════════════════════════════════════
// JOURNAL
// ═══════════════════════════════════════════════════════════════
let journalDate = new Date();

document.getElementById('journal-prev').addEventListener('click', () => { journalDate.setDate(journalDate.getDate() - 1); renderJournal(); });
document.getElementById('journal-next').addEventListener('click', () => { journalDate.setDate(journalDate.getDate() + 1); renderJournal(); });

function renderJournal() {
  const key = dk(journalDate);
  const today = dk();
  const label = key === today ? 'Today' : journalDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  document.getElementById('journal-date-display').textContent = label;

  const entry = state.journal[key] || {};

  // Backward compat: old format stored a plain string in `text` or individual fields
  let morningVal = '', afternoonVal = '';
  if (entry.morning !== undefined) {
    morningVal = entry.morning;
    afternoonVal = entry.afternoon || '';
  } else if (typeof entry === 'string') {
    morningVal = entry;
  } else if (entry.text) {
    morningVal = entry.text;
  } else {
    // Legacy fields migration
    morningVal = [entry.morningFocus, entry.freeText].filter(Boolean).join('\n\n');
    afternoonVal = entry.eveningWell || '';
  }

  document.getElementById('journal-morning').value = morningVal;
  document.getElementById('journal-afternoon').value = afternoonVal;

  const mood = entry.mood || entry.morningMood;
  if (mood) {
    document.getElementById('journal-mood-display').textContent = mood;
    document.getElementById('journal-mood-label').textContent = `Mood logged · Energy ${energyLabel(entry.energy)}`;
  } else {
    document.getElementById('journal-mood-display').textContent = '—';
    document.getElementById('journal-mood-label').textContent = 'No mood logged yet';
  }
}

async function saveJournalField(field) {
  const key = dk(journalDate);
  const existing = state.journal[key] || { id: key, date: key, createdAt: Date.now() };
  const val = document.getElementById(`journal-${field}`).value;
  existing[field] = val;
  existing.updatedAt = Date.now();
  state.journal[key] = existing;
  await saveDoc('journal', key, existing);
  const statusEl = document.getElementById(`journal-${field}-status`);
  if (statusEl) { statusEl.textContent = 'Saved ✓'; setTimeout(() => { statusEl.textContent = ''; }, 1500); }
}

document.getElementById('journal-morning').addEventListener('blur', () => saveJournalField('morning'));
document.getElementById('journal-afternoon').addEventListener('blur', () => saveJournalField('afternoon'));


export { renderJournal, saveJournalField };

Object.assign(window, { renderJournal, saveJournalField });
