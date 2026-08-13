// ═══════════════════════════════════════════════════════════════
// QUICK CAPTURE
// ═══════════════════════════════════════════════════════════════
let captureType = 'note';
let recognition = null;

document.getElementById('fab').addEventListener('click', () => {
  document.getElementById('overlay-capture').classList.add('active');
  setTimeout(() => document.getElementById('capture-input').focus(), 100);
});
document.getElementById('capture-close').addEventListener('click', () => {
  document.getElementById('overlay-capture').classList.remove('active');
});
document.getElementById('overlay-capture').addEventListener('click', e => {
  if (e.target === e.currentTarget) document.getElementById('overlay-capture').classList.remove('active');
});

document.querySelectorAll('.capture-type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.capture-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    captureType = btn.dataset.type;
  });
});

document.getElementById('capture-save-btn').addEventListener('click', saveCapture);
document.getElementById('capture-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.ctrlKey) saveCapture();
});

async function saveCapture() {
  const text = document.getElementById('capture-input').value.trim();
  if (!text) { toast('Please enter something to capture', 'error'); return; }
  const id = uid();
  const data = { id, content: text, type: captureType, processed: false, createdAt: Date.now() };
  state.captures.unshift(data);
  await saveDoc('captures', id, data);
  document.getElementById('capture-input').value = '';
  document.getElementById('overlay-capture').classList.remove('active');
  toast('Captured! ⚡', 'success');
  updateInboxBadge();
  if (currentView === 'dashboard') renderDashCaptures();
  if (currentView === 'inbox') renderInbox();
}

// Voice capture
const voiceBtn = document.getElementById('voice-btn');
voiceBtn.addEventListener('click', toggleVoice);

function toggleVoice() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    toast('Voice input not supported in this browser', 'error'); return;
  }
  if (recognition) { recognition.stop(); recognition = null; voiceBtn.classList.remove('recording'); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.onresult = e => {
    const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
    document.getElementById('capture-input').value = transcript;
  };
  recognition.onend = () => { voiceBtn.classList.remove('recording'); recognition = null; };
  recognition.onerror = () => { voiceBtn.classList.remove('recording'); recognition = null; };
  recognition.start();
  voiceBtn.classList.add('recording');
}

function updateInboxBadge() {
  const unprocessed = state.captures.filter(c => !c.processed).length;
  const badge = document.getElementById('inbox-badge');
  if (!badge) return;
  badge.textContent = unprocessed;
  badge.style.display = unprocessed > 0 ? 'flex' : 'none';
}

// ═══════════════════════════════════════════════════════════════
// INBOX
// ═══════════════════════════════════════════════════════════════
function renderInbox() {
  const el = document.getElementById('inbox-list');
  const unprocessed = state.captures.filter(c => !c.processed);
  if (!unprocessed.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📥</div><p>Inbox zero! You're all caught up.</p></div>`;
    return;
  }
  el.innerHTML = unprocessed.map(c => `
    <div class="inbox-item" data-id="${c.id}">
      <span class="inbox-type-pill ${c.type}">${c.type}</span>
      <div style="flex:1">
        <div class="inbox-content">${esc(c.content)}</div>
        <div class="inbox-time">${new Date(c.createdAt).toLocaleString()}</div>
        <div class="inbox-actions">
          <button class="btn btn-sm btn-ghost" onclick="processCapture('${c.id}','task')">→ Task</button>
          <button class="btn btn-sm btn-ghost" onclick="processCapture('${c.id}','note')">→ Note</button>
          <button class="btn btn-sm btn-ghost" onclick="dismissCapture('${c.id}')">Dismiss</button>
        </div>
      </div>
    </div>`).join('');
}

async function processCapture(id, targetType) {
  const cap = state.captures.find(c => c.id === id);
  if (!cap) return;

  if (targetType === 'task') {
    openAddTaskModal(cap.content, id);
  } else if (targetType === 'note') {
    await createNoteFromCapture(cap);
    cap.processed = true;
    await saveDoc('captures', id, { processed: true });
    updateInboxBadge();
    renderInbox();
  }
}

async function dismissCapture(id) {
  const cap = state.captures.find(c => c.id === id);
  if (cap) { cap.processed = true; await saveDoc('captures', id, { processed: true }); }
  updateInboxBadge();
  renderInbox();
}


export { saveCapture, toggleVoice, updateInboxBadge, renderInbox, processCapture, dismissCapture };

Object.assign(window, { saveCapture, toggleVoice, updateInboxBadge, renderInbox, processCapture, dismissCapture });
