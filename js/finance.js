// ═══════════════════════════════════════════════════════════════
// FINANCE MODULE
// ═══════════════════════════════════════════════════════════════
let financeTab = 'month';
let financeMonth = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; })();
const MONTH_NAMES = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

function getFinance() { return state.settings.finance || state.settings._finance || { partners:{a:{name:''},b:{name:''}}, accounts:[], discretionarySplit:{enabled:{a:false,b:false},buckets:[]}, wishlistLists:[] }; }
function saveFinance(f) { state.settings.finance = f; return saveProfile({ finance: f }); }

function switchFinanceTab(tab) {
  financeTab = tab;
  document.querySelectorAll('.finance-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  renderFinance();
}

function renderFinance() {
  const el = document.getElementById('finance-content');
  if (!el) return;
  if (financeTab === 'month') renderFinanceMonth(el);
  else if (financeTab === 'wishlist') renderWishlist(el);
  else renderFinanceSettings(el);
}

// ─── Finance Settings ────────────────────────────────────────
function renderFinanceSettings(el) {
  const f = getFinance();
  const pa = f.partners?.a?.name || '';
  const pb = f.partners?.b?.name || '';

  let html = `<div class="finance-section">
    <div class="finance-section-title">Partners</div>
    <div class="finance-partners-row">
      <div class="finance-partner-field">
        <label>Partner A</label>
        <input type="text" class="fin-input" value="${esc(pa)}" placeholder="Name A" onchange="updateFinancePartner('a', this.value)">
      </div>
      <div class="finance-partner-field">
        <label>Partner B</label>
        <input type="text" class="fin-input" value="${esc(pb)}" placeholder="Name B" onchange="updateFinancePartner('b', this.value)">
      </div>
    </div>
  </div>`;

  // Accounts
  const accounts = f.accounts || [];
  html += `<div class="finance-section">
    <div class="finance-section-title">Accounts <button class="btn btn-sm btn-ghost" onclick="openAddFinanceAccount()">+ Add</button></div>
    <div class="finance-accounts-list">`;
  if (!accounts.length) {
    html += `<div class="empty-state" style="padding:12px 0;font-size:13px">No accounts yet. Add your bank accounts.</div>`;
  } else {
    accounts.forEach(a => {
      const ownerLabel = a.owner === 'joint' ? 'Joint' : (f.partners?.[a.owner]?.name || a.owner);
      html += `<div class="finance-account-row">
        <span class="fin-icon">🏦</span>
        <span class="fin-label">${esc(a.name)}</span>
        <span class="fin-badge">${esc(ownerLabel)}</span>
        <button class="btn-icon" onclick="openEditFinanceAccount('${a.id}')">✏️</button>
        <button class="btn-icon" onclick="deleteFinanceAccount('${a.id}')">🗑️</button>
      </div>`;
    });
  }
  html += `</div></div>`;

  // Discretionary split
  const ds = f.discretionarySplit || { enabled:{a:false,b:false}, buckets:[] };
  html += `<div class="finance-section">
    <div class="finance-section-title">Discretionary Split (Remaining Budget)</div>`;
  ['a','b'].forEach(k => {
    const name = f.partners?.[k]?.name || k.toUpperCase();
    html += `<label class="fin-toggle-row">
      <input type="checkbox" ${ds.enabled?.[k] ? 'checked' : ''} onchange="toggleDiscretionary('${k}', this.checked)">
      <span>${esc(name)} — split remaining into buckets</span>
    </label>`;
  });
  const buckets = ds.buckets || [];
  html += `<div class="finance-buckets">`;
  buckets.forEach((b, i) => {
    html += `<div class="finance-bucket-row">
      <input type="text" class="fin-input fin-input-sm" value="${esc(b.name)}" placeholder="Bucket name" onchange="updateBucket(${i}, 'name', this.value)">
      <input type="number" class="fin-input fin-input-xs" value="${Math.round(b.ratio*100)}" min="0" max="100" onchange="updateBucket(${i}, 'ratio', this.value)">
      <span class="fin-pct">%</span>
      <button class="btn-icon" onclick="removeBucket(${i})">✕</button>
    </div>`;
  });
  const totalPct = buckets.reduce((s,b) => s + (b.ratio||0)*100, 0);
  if (buckets.length) {
    html += `<div class="fin-ratio-total ${totalPct === 100 ? 'valid' : 'invalid'}">Total: ${totalPct}%${totalPct !== 100 ? ' (must be 100%)' : ' ✓'}</div>`;
  }
  html += `<button class="btn btn-sm btn-ghost" onclick="addBucket()">+ Add Bucket</button>`;
  html += `</div></div>`;

  el.innerHTML = html;
}

async function updateFinancePartner(who, name) {
  const f = getFinance();
  if (!f.partners) f.partners = { a:{name:''}, b:{name:''} };
  f.partners[who].name = name;
  await saveFinance(f);
}

function openAddFinanceAccount() {
  const f = getFinance();
  openModal({
    title: 'Add Account',
    fields: [
      { name:'name', label:'Account Name', required:true, placeholder:'e.g. BNP, Revolut' },
      { name:'owner', label:'Owner', type:'select', options:[ ['a', f.partners?.a?.name || 'A'], ['b', f.partners?.b?.name || 'B'], ['joint', 'Joint'] ] }
    ],
    submit: 'Add Account',
    onSubmit: async (vals) => {
      const f = getFinance();
      if (!f.accounts) f.accounts = [];
      f.accounts.push({ id: uid(), name: vals.name, owner: vals.owner });
      await saveFinance(f);
      renderFinance();
    }
  });
}

function openEditFinanceAccount(id) {
  const f = getFinance();
  const acc = (f.accounts||[]).find(a => a.id === id);
  if (!acc) return;
  openModal({
    title: 'Edit Account',
    fields: [
      { name:'name', label:'Account Name', required:true, value: acc.name },
      { name:'owner', label:'Owner', type:'select', value: acc.owner, options:[ ['a', f.partners?.a?.name || 'A'], ['b', f.partners?.b?.name || 'B'], ['joint', 'Joint'] ] }
    ],
    submit: 'Save',
    onSubmit: async (vals) => {
      const f = getFinance();
      const a = (f.accounts||[]).find(x => x.id === id);
      if (a) { a.name = vals.name; a.owner = vals.owner; }
      await saveFinance(f);
      renderFinance();
    }
  });
}

async function deleteFinanceAccount(id) {
  if (!confirm('Delete this account?')) return;
  const f = getFinance();
  f.accounts = (f.accounts||[]).filter(a => a.id !== id);
  await saveFinance(f);
  renderFinance();
}

async function toggleDiscretionary(who, on) {
  const f = getFinance();
  if (!f.discretionarySplit) f.discretionarySplit = { enabled:{a:false,b:false}, buckets:[] };
  f.discretionarySplit.enabled[who] = on;
  await saveFinance(f);
}

function addBucket() {
  openModal({
    title: 'Add Bucket',
    fields: [
      { name:'name', label:'Bucket Name', required:true, placeholder:'e.g. Investment, Fun' },
      { name:'ratio', label:'Ratio (%)', type:'number', required:true, placeholder:'e.g. 30' }
    ],
    submit: 'Add',
    onSubmit: async (vals) => {
      const f = getFinance();
      if (!f.discretionarySplit) f.discretionarySplit = { enabled:{a:false,b:false}, buckets:[] };
      f.discretionarySplit.buckets.push({ name: vals.name, ratio: Number(vals.ratio) / 100 });
      await saveFinance(f);
      renderFinance();
    }
  });
}

function removeBucket(i) {
  const f = getFinance();
  (f.discretionarySplit?.buckets||[]).splice(i, 1);
  saveFinance(f).then(() => renderFinance());
}

async function updateBucket(i, field, val) {
  const f = getFinance();
  const b = (f.discretionarySplit?.buckets||[])[i];
  if (!b) return;
  b[field] = field === 'ratio' ? Number(val) / 100 : val;
  await saveFinance(f);
  renderFinance();
}

// ─── Finance Month ───────────────────────────────────────────
function getOrCreateFinanceMonth(id) {
  let m = state.financeMonths.find(x => x.id === id);
  if (!m) {
    m = { id, revenus:{ a:{income:0,previousSavings:0}, b:{income:0,previousSavings:0} }, sharedExpenses:[], individualExpenses:{ a:[], b:[] }, createdAt: Date.now() };
  }
  return m;
}

function renderFinanceMonth(el) {
  const f = getFinance();
  const m = getOrCreateFinanceMonth(financeMonth);
  const pa = f.partners?.a?.name || 'A';
  const pb = f.partners?.b?.name || 'B';
  const [y, mo] = financeMonth.split('-');
  const monthLabel = `${MONTH_NAMES[parseInt(mo)-1]} ${y}`;

  // Summary cards
  const calc = calcFinanceMonth(m, f);
  let html = `<div class="finance-month-nav">
    <button class="btn btn-ghost btn-sm" onclick="changeFinanceMonth(-1)">← Prev</button>
    <span class="finance-month-label">${monthLabel}</span>
    <button class="btn btn-ghost btn-sm" onclick="changeFinanceMonth(1)">Next →</button>
  </div>`;

  // Overview cards
  html += `<div class="finance-overview">
    <div class="fin-card fin-card-total">
      <div class="fin-card-label">Total Expenses</div>
      <div class="fin-card-num">${fmtMoney(calc.totalDepensesGlobale)}</div>
    </div>
    <div class="fin-card fin-card-green">
      <div class="fin-card-label">${esc(pa)}'s Rest</div>
      <div class="fin-card-num">${fmtMoney(calc.restes.a)}</div>
    </div>
    <div class="fin-card fin-card-blue">
      <div class="fin-card-label">${esc(pb)}'s Rest</div>
      <div class="fin-card-num">${fmtMoney(calc.restes.b)}</div>
    </div>
  </div>`;

  // Reconciliation summary
  if (calc.reconciliation.length) {
    html += `<div class="finance-section">
      <div class="finance-section-title">🔄 Reconciliation</div>
      <div class="finance-recon-list">`;
    calc.reconciliation.forEach(r => {
      html += `<div class="fin-recon-item">${esc(r.text)}</div>`;
    });
    html += `</div></div>`;
  }

  // Revenues
  html += `<div class="finance-section">
    <div class="finance-section-title">💰 Revenues</div>
    <div class="finance-revenues">
      ${['a','b'].map(k => {
        const name = k === 'a' ? pa : pb;
        const rev = m.revenus?.[k] || {income:0,previousSavings:0};
        return `<div class="finance-revenue-card">
          <div class="fin-rev-name">${esc(name)}</div>
          <div class="fin-rev-field">
            <label>Monthly Income</label>
            <input type="number" class="fin-input" value="${rev.income||0}" onchange="updateFinanceRevenue('${k}','income',this.value)">
          </div>
          <div class="fin-rev-field">
            <label>Previous Savings</label>
            <input type="number" class="fin-input" value="${rev.previousSavings||0}" onchange="updateFinanceRevenue('${k}','previousSavings',this.value)">
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`;

  // Shared Expenses
  html += `<div class="finance-section">
    <div class="finance-section-title">🤝 Shared Expenses <button class="btn btn-sm btn-ghost" onclick="openAddSharedExpense()">+ Add</button></div>
    ${renderExpenseList(m.sharedExpenses || [], 'shared', f)}
  </div>`;

  // Individual Expenses A
  html += `<div class="finance-section">
    <div class="finance-section-title">👤 ${esc(pa)}'s Expenses <button class="btn btn-sm btn-ghost" onclick="openAddIndividualExpense('a')">+ Add</button></div>
    ${renderExpenseList(m.individualExpenses?.a || [], 'individual-a', f)}
  </div>`;

  // Individual Expenses B
  html += `<div class="finance-section">
    <div class="finance-section-title">👤 ${esc(pb)}'s Expenses <button class="btn btn-sm btn-ghost" onclick="openAddIndividualExpense('b')">+ Add</button></div>
    ${renderExpenseList(m.individualExpenses?.b || [], 'individual-b', f)}
  </div>`;

  el.innerHTML = html;
}

function renderExpenseList(expenses, type, f) {
  if (!expenses.length) return '<div class="empty-state" style="padding:8px 0;font-size:13px">No expenses.</div>';
  return `<div class="finance-expense-list">` + expenses.map(e => {
    let extra = '';
    if (type === 'shared') {
      const acc = (f.accounts||[]).find(a => a.id === e.account);
      extra = `<span class="fin-badge">${esc(acc?.name || '—')}</span><span class="fin-badge ${e.type==='fixed'?'fin-badge-red':'fin-badge-orange'}">${e.type==='fixed'?'Fixed':'Variable'}</span>`;
    }
    return `<div class="finance-expense-row">
      <span class="fin-label">${esc(e.name)}</span>
      <span class="fin-amount">${fmtMoney(e.amount)}</span>
      ${extra}
      <button class="btn-icon" onclick="openEditExpense('${type}','${e.id}')">✏️</button>
      <button class="btn-icon" onclick="deleteExpense('${type}','${e.id}')">🗑️</button>
    </div>`;
  }).join('') + `</div>`;
}

function fmtMoney(v) { return (Number(v)||0).toLocaleString('fr-FR', {minimumFractionDigits:0, maximumFractionDigits:0}) + ' €'; }

function changeFinanceMonth(delta) {
  const [y, m] = financeMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  financeMonth = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  renderFinance();
}

async function updateFinanceRevenue(who, field, val) {
  const m = getOrCreateFinanceMonth(financeMonth);
  if (!m.revenus) m.revenus = { a:{income:0,previousSavings:0}, b:{income:0,previousSavings:0} };
  if (!m.revenus[who]) m.revenus[who] = {income:0,previousSavings:0};
  m.revenus[who][field] = Number(val) || 0;
  // Upsert into state
  const idx = state.financeMonths.findIndex(x => x.id === financeMonth);
  if (idx >= 0) state.financeMonths[idx] = m; else state.financeMonths.push(m);
  await saveDoc('financeMonths', financeMonth, m);
}

function openAddSharedExpense() {
  const f = getFinance();
  openModal({
    title: 'Add Shared Expense',
    fields: [
      { name:'name', label:'Name', required:true, placeholder:'e.g. Rent, Groceries' },
      { name:'amount', label:'Amount (€)', type:'number', required:true },
      { name:'account', label:'Account', type:'select', options: (f.accounts||[]).map(a => [a.id, a.name]) },
      { name:'type', label:'Type', type:'select', options: [['fixed','Fixed'],['variable','Variable']] }
    ],
    submit: 'Add',
    onSubmit: async (vals) => {
      const m = getOrCreateFinanceMonth(financeMonth);
      if (!m.sharedExpenses) m.sharedExpenses = [];
      m.sharedExpenses.push({ id: uid(), name: vals.name, amount: Number(vals.amount), account: vals.account, type: vals.type });
      const idx = state.financeMonths.findIndex(x => x.id === financeMonth);
      if (idx >= 0) state.financeMonths[idx] = m; else state.financeMonths.push(m);
      await saveDoc('financeMonths', financeMonth, m);
      renderFinance();
    }
  });
}

function openAddIndividualExpense(who) {
  openModal({
    title: `Add Expense`,
    fields: [
      { name:'name', label:'Name', required:true, placeholder:'e.g. Lunch, Transport' },
      { name:'amount', label:'Amount (€)', type:'number', required:true }
    ],
    submit: 'Add',
    onSubmit: async (vals) => {
      const m = getOrCreateFinanceMonth(financeMonth);
      if (!m.individualExpenses) m.individualExpenses = { a:[], b:[] };
      if (!m.individualExpenses[who]) m.individualExpenses[who] = [];
      m.individualExpenses[who].push({ id: uid(), name: vals.name, amount: Number(vals.amount) });
      const idx = state.financeMonths.findIndex(x => x.id === financeMonth);
      if (idx >= 0) state.financeMonths[idx] = m; else state.financeMonths.push(m);
      await saveDoc('financeMonths', financeMonth, m);
      renderFinance();
    }
  });
}

function openEditExpense(type, id) {
  const m = getOrCreateFinanceMonth(financeMonth);
  const f = getFinance();
  let exp;
  if (type === 'shared') exp = (m.sharedExpenses||[]).find(e => e.id === id);
  else if (type === 'individual-a') exp = (m.individualExpenses?.a||[]).find(e => e.id === id);
  else exp = (m.individualExpenses?.b||[]).find(e => e.id === id);
  if (!exp) return;

  const fields = [
    { name:'name', label:'Name', required:true, value: exp.name },
    { name:'amount', label:'Amount (€)', type:'number', required:true, value: exp.amount }
  ];
  if (type === 'shared') {
    fields.push({ name:'account', label:'Account', type:'select', value: exp.account, options: (f.accounts||[]).map(a => [a.id, a.name]) });
    fields.push({ name:'type', label:'Type', type:'select', value: exp.type, options: [['fixed','Fixed'],['variable','Variable']] });
  }

  openModal({
    title: 'Edit Expense',
    fields,
    submit: 'Save',
    onSubmit: async (vals) => {
      exp.name = vals.name;
      exp.amount = Number(vals.amount);
      if (type === 'shared') { exp.account = vals.account; exp.type = vals.type; }
      const idx = state.financeMonths.findIndex(x => x.id === financeMonth);
      if (idx >= 0) state.financeMonths[idx] = m; else state.financeMonths.push(m);
      await saveDoc('financeMonths', financeMonth, m);
      renderFinance();
    }
  });
}

async function deleteExpense(type, id) {
  if (!confirm('Delete this expense?')) return;
  const m = getOrCreateFinanceMonth(financeMonth);
  if (type === 'shared') m.sharedExpenses = (m.sharedExpenses||[]).filter(e => e.id !== id);
  else if (type === 'individual-a') m.individualExpenses.a = (m.individualExpenses?.a||[]).filter(e => e.id !== id);
  else m.individualExpenses.b = (m.individualExpenses?.b||[]).filter(e => e.id !== id);
  const idx = state.financeMonths.findIndex(x => x.id === financeMonth);
  if (idx >= 0) state.financeMonths[idx] = m; else state.financeMonths.push(m);
  await saveDoc('financeMonths', financeMonth, m);
  renderFinance();
}

// ─── Finance Calculations ────────────────────────────────────
function calcFinanceMonth(m, f) {
  const revA = Number(m.revenus?.a?.income) || 0;
  const revB = Number(m.revenus?.b?.income) || 0;
  const savA = Number(m.revenus?.a?.previousSavings) || 0;
  const savB = Number(m.revenus?.b?.previousSavings) || 0;
  const totalRevenus = revA + revB;
  const prorataA = totalRevenus > 0 ? revA / totalRevenus : 0.5;
  const prorataB = 1 - prorataA;

  const shared = m.sharedExpenses || [];
  let totalSharedFixed = 0, totalSharedVariable = 0;
  const splitDetails = [];
  shared.forEach(e => {
    const amt = Number(e.amount) || 0;
    const partA = amt * prorataA;
    const partB = amt * prorataB;
    if (e.type === 'fixed') totalSharedFixed += amt; else totalSharedVariable += amt;
    splitDetails.push({ ...e, partA, partB });
  });
  const totalShared = totalSharedFixed + totalSharedVariable;

  const indA = (m.individualExpenses?.a || []).reduce((s,e) => s + (Number(e.amount)||0), 0);
  const indB = (m.individualExpenses?.b || []).reduce((s,e) => s + (Number(e.amount)||0), 0);
  const totalDepensesGlobale = totalShared + indA + indB;

  const restA = revA + savA - (totalShared * prorataA) - indA;
  const restB = revB + savB - (totalShared * prorataB) - indB;

  // Discretionary split
  const discretionary = { a: [], b: [] };
  const ds = f.discretionarySplit || { enabled:{}, buckets:[] };
  ['a','b'].forEach(k => {
    if (ds.enabled?.[k]) {
      const rest = k === 'a' ? restA : restB;
      (ds.buckets||[]).forEach(b => {
        discretionary[k].push({ name: b.name, amount: rest * (b.ratio||0), ratio: b.ratio });
      });
    }
  });

  // Reconciliation
  const reconciliation = [];
  const accounts = f.accounts || [];
  const accountTotals = {};  // accountId -> { aOwes: 0, bOwes: 0 }

  splitDetails.forEach(sd => {
    if (!sd.account) return;
    if (!accountTotals[sd.account]) accountTotals[sd.account] = { aOwes: 0, bOwes: 0 };
    const acc = accounts.find(a => a.id === sd.account);
    if (!acc) return;
    if (acc.owner === 'joint') {
      accountTotals[sd.account].aOwes += sd.partA;
      accountTotals[sd.account].bOwes += sd.partB;
    } else if (acc.owner === 'a') {
      accountTotals[sd.account].bOwes += sd.partB;  // B owes A
    } else {
      accountTotals[sd.account].aOwes += sd.partA;  // A owes B
    }
  });

  let netAtoB = 0;
  Object.entries(accountTotals).forEach(([accId, tot]) => {
    const acc = accounts.find(a => a.id === accId);
    if (!acc) return;
    if (acc.owner === 'joint') {
      if (tot.aOwes > 0) reconciliation.push({ text: `Transfer ${fmtMoney(tot.aOwes)} to ${esc(acc.name)} (from ${esc(f.partners?.a?.name||'A')})` });
      if (tot.bOwes > 0) reconciliation.push({ text: `Transfer ${fmtMoney(tot.bOwes)} to ${esc(acc.name)} (from ${esc(f.partners?.b?.name||'B')})` });
    } else {
      const ownerName = f.partners?.[acc.owner]?.name || acc.owner.toUpperCase();
      const otherName = f.partners?.[acc.owner === 'a' ? 'b' : 'a']?.name || (acc.owner === 'a' ? 'B' : 'A');
      const amount = acc.owner === 'a' ? tot.bOwes : tot.aOwes;
      if (amount > 0) {
        reconciliation.push({ text: `Transfer ${fmtMoney(amount)} to ${esc(ownerName)} on ${esc(acc.name)} (from ${esc(otherName)})` });
        if (acc.owner === 'a') netAtoB -= amount; else netAtoB += amount;
      }
    }
  });

  if (netAtoB !== 0) {
    const aName = f.partners?.a?.name || 'A';
    const bName = f.partners?.b?.name || 'B';
    if (netAtoB > 0) reconciliation.push({ text: `Net: ${esc(aName)} owes ${fmtMoney(netAtoB)} to ${esc(bName)}` });
    else reconciliation.push({ text: `Net: ${esc(bName)} owes ${fmtMoney(-netAtoB)} to ${esc(aName)}` });
  }

  return { totalRevenus, prorataA, prorataB, totalSharedFixed, totalSharedVariable, totalShared, indA, indB, totalDepensesGlobale, restes:{ a: restA, b: restB }, discretionary, reconciliation, splitDetails };
}

// ─── Wishlist ────────────────────────────────────────────────
function renderWishlist(el) {
  const f = getFinance();
  const items = state.wishlist || [];
  const listNames = [...new Set([...(f.wishlistLists||[]), ...items.map(i=>i.list)].filter(Boolean))];

  let html = `<div class="finance-section">
    <div class="finance-section-title">Wishlist
      <button class="btn btn-sm btn-ghost" onclick="openAddWishlistList()">+ New List</button>
      <button class="btn btn-sm btn-ghost" onclick="openAddWishlistItem()">+ Add Item</button>
    </div>`;

  if (!items.length) {
    html += `<div class="empty-state" style="padding:20px 0">No wishlist items yet. Add something you want to save for!</div>`;
  } else {
    const grouped = {};
    items.forEach(i => { const key = i.list || 'General'; if (!grouped[key]) grouped[key] = []; grouped[key].push(i); });

    Object.entries(grouped).forEach(([listName, listItems]) => {
      html += `<div class="wishlist-group">
        <div class="wishlist-group-title">${esc(listName)}</div>`;
      listItems.forEach(item => {
        const pct = item.price > 0 ? Math.min(100, Math.round((item.saved || 0) / item.price * 100)) : 0;
        html += `<div class="wishlist-item">
          <div class="wishlist-item-header">
            <span class="wishlist-item-name">${esc(item.name)}</span>
            <span class="wishlist-item-price">${fmtMoney(item.saved||0)} / ${fmtMoney(item.price)}</span>
          </div>
          <div class="wishlist-bar"><div class="wishlist-bar-fill" style="width:${pct}%"></div></div>
          ${item.link ? `<a href="${esc(item.link)}" target="_blank" class="wishlist-link">🔗 Link</a>` : ''}
          <div class="wishlist-actions">
            <button class="btn btn-sm btn-ghost" onclick="openEditWishlistItem('${item.id}')">✏️</button>
            <button class="btn btn-sm btn-ghost" onclick="deleteWishlistItem('${item.id}')">🗑️</button>
          </div>
        </div>`;
      });
      html += `</div>`;
    });
  }
  html += `</div>`;
  el.innerHTML = html;
}

function openAddWishlistList() {
  openModal({
    title: 'New Wishlist List',
    sub: 'Create a new group for your wishlist items',
    fields: [
      { name: 'name', label: 'List Name', required: true, placeholder: 'e.g. Voyage, Noël, Maison…' }
    ],
    submit: 'Create',
    onSubmit: async v => {
      const f = getFinance();
      const name = (v.name || '').trim();
      if (!name) return;
      if ((f.wishlistLists || []).some(l => l.toLowerCase() === name.toLowerCase())) {
        toast('This list already exists', 'info');
        return;
      }
      f.wishlistLists = [...(f.wishlistLists || []), name];
      await saveFinance(f);
      renderFinance();
      toast(`Liste « ${name} » créée`, 'success');
    }
  });
}

function openAddWishlistItem() {
  const f = getFinance();
  const listNames = [...new Set([...(f.wishlistLists||[]), ...(state.wishlist||[]).map(i=>i.list)].filter(Boolean))];
  openModal({
    title: 'Add Wishlist Item',
    fields: [
      { name:'list', label:'List', type:'select', options: listNames.map(n => [n,n]) },
      { name:'name', label:'Name', required:true, placeholder:'e.g. Running shoes' },
      { name:'price', label:'Price (€)', type:'number', required:true },
      { name:'saved', label:'Saved so far (€)', type:'number' },
      { name:'link', label:'Link (optional)', placeholder:'https://...' }
    ],
    submit: 'Add',
    onSubmit: async (vals) => {
      const item = { id: uid(), list: vals.list, name: vals.name, price: Number(vals.price), saved: Number(vals.saved)||0, link: vals.link, createdAt: Date.now() };
      state.wishlist.push(item);
      await saveDoc('wishlist', item.id, item);
      renderFinance();
    }
  });
}

function openEditWishlistItem(id) {
  const item = (state.wishlist||[]).find(i => i.id === id);
  if (!item) return;
  const f = getFinance();
  const listNames = [...new Set([...(f.wishlistLists||[]), ...(state.wishlist||[]).map(i=>i.list)].filter(Boolean))];
  openModal({
    title: 'Edit Wishlist Item',
    fields: [
      { name:'list', label:'List', type:'select', value: item.list, options: listNames.map(n => [n,n]) },
      { name:'name', label:'Name', required:true, value: item.name },
      { name:'price', label:'Price (€)', type:'number', required:true, value: item.price },
      { name:'saved', label:'Saved so far (€)', type:'number', value: item.saved },
      { name:'link', label:'Link (optional)', value: item.link || '' }
    ],
    submit: 'Save',
    onSubmit: async (vals) => {
      item.list = vals.list; item.name = vals.name; item.price = Number(vals.price); item.saved = Number(vals.saved)||0; item.link = vals.link;
      await saveDoc('wishlist', id, item);
      renderFinance();
    }
  });
}

async function deleteWishlistItem(id) {
  if (!confirm('Delete this item?')) return;
  state.wishlist = (state.wishlist||[]).filter(i => i.id !== id);
  await deleteDoc('wishlist', id);
  renderFinance();
}

// ─── Finance placeholder for category tree ───────────────────
function buildFinancePlaceholder(cat) {
  return `<div class="cat-content">
    <div class="empty-state" style="padding:40px 0">
      <div class="empty-icon">📊</div>
      <p>Suivi financier</p>
      <small>Go to <span style="color:var(--accent-light);cursor:pointer" onclick="goTo('finance')">Finance view</span> to manage your budget.</small>
    </div>
  </div>`;
}

// ─── Seed categories on first launch ─────────────────────────

export { getFinance, saveFinance, switchFinanceTab, renderFinance, renderFinanceSettings, updateFinancePartner, openAddFinanceAccount, openEditFinanceAccount, deleteFinanceAccount, toggleDiscretionary, addBucket, removeBucket, updateBucket, getOrCreateFinanceMonth, renderFinanceMonth, renderExpenseList, fmtMoney, changeFinanceMonth, updateFinanceRevenue, openAddSharedExpense, openAddIndividualExpense, openEditExpense, deleteExpense, calcFinanceMonth, renderWishlist, openAddWishlistList, openAddWishlistItem, openEditWishlistItem, deleteWishlistItem, buildFinancePlaceholder };

Object.assign(window, { getFinance, saveFinance, switchFinanceTab, renderFinance, renderFinanceSettings, updateFinancePartner, openAddFinanceAccount, openEditFinanceAccount, deleteFinanceAccount, toggleDiscretionary, addBucket, removeBucket, updateBucket, getOrCreateFinanceMonth, renderFinanceMonth, renderExpenseList, fmtMoney, changeFinanceMonth, updateFinanceRevenue, openAddSharedExpense, openAddIndividualExpense, openEditExpense, deleteExpense, calcFinanceMonth, renderWishlist, openAddWishlistList, openAddWishlistItem, openEditWishlistItem, deleteWishlistItem, buildFinancePlaceholder });
