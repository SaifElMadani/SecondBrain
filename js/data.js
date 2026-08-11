// ─── FIRESTORE HELPERS ────────────────────────────────────────
function userRef() {
  if (!currentUser) throw new Error('No authenticated user');
  return db.collection('users').doc(currentUser.uid);
}
function col(name) { return userRef().collection(name); }

async function saveDoc(collection, id, data) {
  try { await col(collection).doc(id).set(data, { merge: true }); }
  catch (e) { console.error('saveDoc error', e); toast('Save failed', 'error'); }
}
async function deleteDoc(collection, id) {
  try { await col(collection).doc(id).delete(); }
  catch (e) { console.error('deleteDoc error', e); toast('Delete failed', 'error'); }
}
async function saveProfile(data) {
  try { await userRef().collection('profile').doc('main').set(data, { merge: true }); }
  catch (e) { console.error('saveProfile error', e); toast('Profile save failed', 'error'); }
}

// ═══════════════════════════════════════════════════════════════
// DATA LOADING (real-time listeners)
// ═══════════════════════════════════════════════════════════════
async function loadAllData() {
  // Load profile
  const profileSnap = await userRef().collection('profile').doc('main').get().catch(() => ({ exists: false, data: () => ({}) }));
  if (profileSnap.exists) {
    userProfile = profileSnap.data();
    state.settings = { ...state.settings, ...userProfile };
  }

  // Load collections
  const collections = ['tasks', 'notes', 'habits', 'goals', 'captures', 'documents', 'sprints', 'timeEntries', 'familyBlocks', 'wins', 'babyMilestones', 'recipes', 'mealPlan', 'hobbies', 'categories', 'events', 'financeMonths', 'wishlist', 'dateIdeas', 'checklistItems'];
  for (const c of collections) {
    const snap = await col(c).orderBy('createdAt', 'desc').get().catch(() => ({ docs: [] }));
    state[c] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  // Load journal
  const jSnap = await col('journal').get().catch(() => ({ docs: [] }));
  state.journal = {};
  jSnap.docs.forEach(d => { state.journal[d.id] = { id: d.id, ...d.data() }; });

  updateSidebarUser();
}

function updateSidebarUser() {
  const name = state.settings.name || currentUser.displayName || currentUser.email?.split('@')[0] || 'You';
  const email = currentUser.email || '';
  document.getElementById('sidebar-username').textContent = name;
  document.getElementById('sidebar-useremail').textContent = email;
  document.getElementById('sidebar-avatar').textContent = (name[0] || 'S').toUpperCase();
}

export { userRef, col, saveDoc, deleteDoc, saveProfile, loadAllData, updateSidebarUser };

Object.assign(window, { userRef, col, saveDoc, deleteDoc, saveProfile, loadAllData, updateSidebarUser });
async function seedInitialCategories() {
  if (state.categories.length > 0) return; // already seeded

  const seeds = [
    // Family tree
    { name: 'Family', icon: '👨‍👩‍👧', parentId: null, moduleType: 'generic', order: 0 },
    { name: 'House', icon: '🏠', parentRef: 'Family', moduleType: 'generic', order: 0 },
    { name: 'Meal', icon: '🍽️', parentRef: 'Family', moduleType: 'meals', order: 1 },
    { name: 'Baby', icon: '👶', parentRef: 'Family', moduleType: 'generic', order: 2 },
    { name: 'Wife', icon: '❤️', parentRef: 'Family', moduleType: 'generic', order: 3 },
    { name: 'Dates', icon: '🌹', parentRef: 'Wife', moduleType: 'dateIdeas', order: 0 },

    // Growth tree
    { name: 'Growth', icon: '🌱', parentId: null, moduleType: 'generic', order: 1 },
    { name: 'Video games', icon: '🎮', parentRef: 'Growth', moduleType: 'generic', order: 0 },
    { name: 'Chess', icon: '♟️', parentRef: 'Growth', moduleType: 'generic', order: 1 },
    { name: 'Soccer', icon: '⚽', parentRef: 'Growth', moduleType: 'generic', order: 2 },
    { name: 'Art', icon: '🎨', parentRef: 'Growth', moduleType: 'generic', order: 3 },
    { name: 'Comedy', icon: '😂', parentRef: 'Growth', moduleType: 'generic', order: 4 },

    // Career (empty root)
    { name: 'Career', icon: '💼', parentId: null, moduleType: 'generic', order: 2 },

    // Finance
    { name: 'Finance', icon: '💰', parentId: null, moduleType: 'finance-table', order: 3 }
  ];

  const created = {};
  for (const s of seeds) {
    const id = uid();
    const parentId = s.parentRef ? created[s.parentRef] : (s.parentId || null);
    const moduleType = s.moduleType || 'generic';
    const isGeneric = moduleType === 'generic';
    const data = {
      id, name: s.name, icon: s.icon || '', color: '',
      parentId, moduleType,
      tabs: isGeneric ? [
        { id: uid(), type: 'tasks', label: '☑️ Tasks' },
        { id: uid(), type: 'goals', label: '🎯 Goals' },
        { id: uid(), type: 'habits', label: '🔥 Habits' }
      ] : [],
      order: s.order || 0, createdAt: Date.now()
    };
    state.categories.push(data);
    await saveDoc('categories', id, data);
    created[s.name] = id;
  }
  toast('Initial categories created! 🌳', 'success');
  renderSidebarCategories();
}

// ─── Migration: orphan tasks/habits → goals ───────────────────
async function migrateOrphanTasksAndHabits() {
  const orphanTasks = state.tasks.filter(t => t.categoryId && !t.goalId);
  const orphanHabits = state.habits.filter(h => h.categoryId && !h.goalId);
  if (!orphanTasks.length && !orphanHabits.length) return;

  const taskByCat = {};
  for (const t of orphanTasks) {
    if (!taskByCat[t.categoryId]) taskByCat[t.categoryId] = [];
    taskByCat[t.categoryId].push(t);
  }
  const habitByCat = {};
  for (const h of orphanHabits) {
    if (!habitByCat[h.categoryId]) habitByCat[h.categoryId] = [];
    habitByCat[h.categoryId].push(h);
  }

  const allCatIds = new Set([...Object.keys(taskByCat), ...Object.keys(habitByCat)]);
  for (const catId of allCatIds) {
    const catLabel = getCategoryLabel(catId) || 'Uncategorized';
    let uncategorizedGoal = state.goals.find(g =>
      g.title === `Non classé (${catLabel})` && g.categoryId === catId
    );
    if (!uncategorizedGoal) {
      const id = uid();
      const root = getCategoryRoot(catId);
      uncategorizedGoal = {
        id, title: `Non classé (${catLabel})`,
        area: root ? root.name.toLowerCase() : '',
        categoryId: catId, progress: 0, milestones: [],
        isSprintObjective: false, sprintQuarter: null,
        weeklyActions: [], deadline: null, createdAt: Date.now()
      };
      state.goals.push(uncategorizedGoal);
      await saveDoc('goals', id, uncategorizedGoal);
    }
    for (const t of (taskByCat[catId] || [])) {
      t.goalId = uncategorizedGoal.id;
      await saveDoc('tasks', t.id, { goalId: t.goalId });
    }
    for (const h of (habitByCat[catId] || [])) {
      h.goalId = uncategorizedGoal.id;
      await saveDoc('habits', h.id, { goalId: h.goalId });
    }
  }
}

export { seedInitialCategories, migrateOrphanTasksAndHabits };

Object.assign(window, { seedInitialCategories, migrateOrphanTasksAndHabits });
