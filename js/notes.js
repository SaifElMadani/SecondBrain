// ═══════════════════════════════════════════════════════════════
// NOTES
// ═══════════════════════════════════════════════════════════════
let currentNoteId = null;
let noteAutoSave = null;

function renderNotesList() {
  const search = document.getElementById('note-search').value.toLowerCase();
  const sidebar = document.getElementById('notes-sidebar');
  let notes = [...state.notes];
  if (search) notes = notes.filter(n => n.title?.toLowerCase().includes(search) || n.content?.toLowerCase().includes(search));
  notes.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  if (!notes.length) {
    sidebar.innerHTML = `<div style="font-size:12px; color:var(--text-muted); padding:12px; text-align:center">No notes yet</div>`;
    return;
  }
  sidebar.innerHTML = notes.map(n => `
    <div class="note-sidebar-item${n.id === currentNoteId ? ' active' : ''}" data-id="${n.id}">
      <div class="note-sidebar-title">${esc(n.title || 'Untitled')}</div>
      <div class="note-sidebar-preview">${esc(stripHtml(n.content || '').slice(0, 60))}</div>
    </div>`).join('');

  sidebar.querySelectorAll('.note-sidebar-item').forEach(item => {
    item.addEventListener('click', () => openNote(item.dataset.id));
  });
}

function stripHtml(html) { const d = document.createElement('div'); d.innerHTML = html; return d.textContent || ''; }

document.getElementById('note-search').addEventListener('input', renderNotesList);

document.getElementById('add-note-btn').addEventListener('click', async () => {
  const id = uid();
  const data = { id, title: 'Untitled Note', content: '', tags: [], area: '', createdAt: Date.now(), updatedAt: Date.now() };
  state.notes.unshift(data);
  await saveDoc('notes', id, data);
  renderNotesList();
  openNote(id);
});

function openNote(id) {
  currentNoteId = id;
  const note = state.notes.find(n => n.id === id);
  if (!note) return;

  document.getElementById('notes-empty-msg').style.display = 'none';
  const wrap = document.getElementById('notes-editor-wrap');
  wrap.style.display = 'flex';

  document.getElementById('note-title-input').value = note.title || '';
  document.getElementById('note-editor').innerHTML = note.content || '';
  renderNotesList();
}

async function saveCurrentNote() {
  if (!currentNoteId) return;
  const note = state.notes.find(n => n.id === currentNoteId);
  if (!note) return;
  note.title = document.getElementById('note-title-input').value.trim() || 'Untitled';
  note.content = document.getElementById('note-editor').innerHTML;
  note.updatedAt = Date.now();
  await saveDoc('notes', currentNoteId, { title: note.title, content: note.content, updatedAt: note.updatedAt });
  renderNotesList();
}

document.getElementById('note-save-btn').addEventListener('click', async () => { await saveCurrentNote(); toast('Note saved ✓', 'success'); });

document.getElementById('note-delete-btn').addEventListener('click', async () => {
  if (!currentNoteId) return;
  if (!confirm('Delete this note?')) return;
  state.notes = state.notes.filter(n => n.id !== currentNoteId);
  await deleteDoc('notes', currentNoteId);
  currentNoteId = null;
  document.getElementById('notes-empty-msg').style.display = 'flex';
  document.getElementById('notes-editor-wrap').style.display = 'none';
  renderNotesList();
});

// Rich text editor commands
document.querySelectorAll('.editor-toolbar-btn[data-cmd]').forEach(btn => {
  btn.addEventListener('click', () => {
    const cmd = btn.dataset.cmd, val = btn.dataset.val || null;
    document.getElementById('note-editor').focus();
    document.execCommand(cmd, false, val);
  });
});

// Auto-save on input
document.getElementById('note-editor').addEventListener('input', () => {
  clearTimeout(noteAutoSave);
  noteAutoSave = setTimeout(saveCurrentNote, 1500);
});
document.getElementById('note-title-input').addEventListener('input', () => {
  clearTimeout(noteAutoSave);
  noteAutoSave = setTimeout(saveCurrentNote, 1500);
});

async function createNoteFromCapture(capture) {
  const id = uid();
  const data = { id, title: capture.content.slice(0, 50), content: `<p>${capture.content}</p>`, tags: [], area: '', createdAt: Date.now(), updatedAt: Date.now() };
  state.notes.unshift(data);
  await saveDoc('notes', id, data);
  goTo('notes');
  openNote(id);
}


export { renderNotesList, stripHtml, openNote, saveCurrentNote, createNoteFromCapture };

Object.assign(window, { renderNotesList, stripHtml, openNote, saveCurrentNote, createNoteFromCapture });
