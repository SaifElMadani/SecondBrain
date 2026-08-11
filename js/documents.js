// ═══════════════════════════════════════════════════════════════
// DOCUMENTS
// ═══════════════════════════════════════════════════════════════
const docUploadZone = document.getElementById('doc-upload-zone');
const docFileInput = document.getElementById('doc-file-input');

docUploadZone.addEventListener('click', () => docFileInput.click());
docUploadZone.addEventListener('dragover', e => { e.preventDefault(); docUploadZone.classList.add('dragover'); });
docUploadZone.addEventListener('dragleave', () => docUploadZone.classList.remove('dragover'));
docUploadZone.addEventListener('drop', e => { e.preventDefault(); docUploadZone.classList.remove('dragover'); handleFileUpload(e.dataTransfer.files); });
docFileInput.addEventListener('change', e => handleFileUpload(e.target.files));

async function handleFileUpload(files) {
  for (const file of files) {
    if (file.size > 20 * 1024 * 1024) { toast(`${file.name} is too large (max 20MB)`, 'error'); continue; }
    toast(`Uploading ${file.name}…`, 'info', 10000);
    try {
      const path = `users/${currentUser.uid}/documents/${uid()}_${file.name}`;
      const ref = storage.ref(path);
      const snap = await ref.put(file);
      const url = await snap.ref.getDownloadURL();
      const id = uid();
      const data = { id, name: file.name, size: file.size, mimeType: file.type, storagePath: path, url, folder: '', tags: [], uploadedAt: Date.now(), createdAt: Date.now() };
      state.documents.unshift(data);
      await saveDoc('documents', id, data);
      toast(`${file.name} uploaded ✓`, 'success');
      renderDocuments();
    } catch (e) { toast(`Failed to upload ${file.name}: ${e.message}`, 'error'); }
  }
}

function renderDocuments() {
  const search = document.getElementById('doc-search').value.toLowerCase();
  let docs = [...state.documents];
  if (search) docs = docs.filter(d => d.name.toLowerCase().includes(search));
  docs.sort((a, b) => b.uploadedAt - a.uploadedAt);

  const grid = document.getElementById('doc-grid');
  if (!docs.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">📁</div><p>No documents yet</p><small>Upload files to store them securely in the cloud</small></div>`;
    return;
  }
  grid.innerHTML = docs.map(d => {
    const icon = d.mimeType?.includes('pdf') ? '📄' : d.mimeType?.includes('image') ? '🖼️' : d.mimeType?.includes('word') ? '📝' : '📎';
    const size = d.size > 1e6 ? `${(d.size / 1e6).toFixed(1)} MB` : `${Math.round(d.size / 1024)} KB`;
    return `<div class="doc-card" onclick="openDocument('${d.id}')">
      <div class="doc-card-icon">${icon}</div>
      <div class="doc-card-name">${esc(d.name)}</div>
      <div class="doc-card-size">${size}</div>
      <button class="btn btn-ghost btn-sm" style="margin-top:auto" onclick="event.stopPropagation(); deleteDocument('${d.id}')">Delete</button>
    </div>`;
  }).join('');
}

function openDocument(id) {
  const doc = state.documents.find(d => d.id === id);
  if (!doc?.url) { toast('Document URL unavailable — try re-uploading', 'error'); return; }
  if (doc.mimeType?.includes('pdf') || doc.mimeType?.startsWith('image/')) {
    window.open(doc.url, '_blank');
  } else {
    const a = document.createElement('a'); a.href = doc.url; a.download = doc.name; a.click();
  }
}

async function deleteDocument(id) {
  const doc = state.documents.find(d => d.id === id);
  if (!doc || !confirm(`Delete "${doc.name}"?`)) return;
  try {
    if (doc.storagePath) await storage.ref(doc.storagePath).delete();
  } catch (e) { toast(`Storage delete failed: ${e.message}`, 'error'); }
  state.documents = state.documents.filter(d => d.id !== id);
  await deleteDoc('documents', id);
  renderDocuments();
}

document.getElementById('doc-search').addEventListener('input', renderDocuments);


export { handleFileUpload, renderDocuments, openDocument, deleteDocument };

Object.assign(window, { handleFileUpload, renderDocuments, openDocument, deleteDocument });
