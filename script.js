// ---------- Firestore-backed data ----------
let buildings = [];
let flats = [];
let expenses = [];
let rentRecords = [];
let advancePayments = [];
let users = [];

function money(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function buildingName(id) {
  const b = buildings.find(b => b.id === id);
  return b ? b.name : 'Unknown';
}
function flatLabel(flatId) {
  const f = flats.find(f => f.id === flatId);
  if (!f) return 'Unknown flat';
  return `Unit ${f.unit} (${buildingName(f.buildingId)})`;
}
function flatExpenseTotal(flatId) {
  return expenses.filter(e => e.flatId === flatId).reduce((sum, e) => sum + Number(e.amount), 0);
}
function flatAdvanceTotal(flatId) {
  return advancePayments.filter(a => a.flatId === flatId).reduce((sum, a) => sum + Number(a.amount), 0);
}

function showSyncError(message) {
  let banner = document.getElementById('syncErrorBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'syncErrorBanner';
    banner.className = 'sync-error-banner';
    document.body.prepend(banner);
  }
  banner.textContent = message;
  banner.hidden = false;
}

const flatBuildingSelect = document.getElementById('flatBuilding');
const flatBuildingFilter = document.getElementById('flatBuildingFilter');
const expenseBuildingSelect = document.getElementById('expenseBuilding');
const expenseBuildingFilter = document.getElementById('expenseBuildingFilter');
const rentBuildingSelect = document.getElementById('rentBuilding');
const rentBuildingFilter = document.getElementById('rentBuildingFilter');
const advanceBuildingSelect = document.getElementById('advanceBuilding');
const advanceBuildingFilter = document.getElementById('advanceBuildingFilter');

function watchCollection(name, onData) {
  db.collection(name).onSnapshot(
    snap => onData(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err => {
      console.error(`Failed to sync "${name}":`, err.message);
      if (err.code === 'permission-denied') {
        showSyncError('Firestore is blocking access (permission-denied). Go to Firebase Console → Firestore Database → Rules, paste in the rules from firestore.rules, and click Publish.');
      } else {
        showSyncError(`Could not sync "${name}": ${err.message}`);
      }
    }
  );
}

watchCollection('buildings', data => { buildings = data; renderAll(); });
watchCollection('flats', data => { flats = data; renderAll(); });
watchCollection('expenses', data => { expenses = data; renderAll(); });
watchCollection('rentRecords', data => { rentRecords = data; renderAll(); });
watchCollection('advancePayments', data => { advancePayments = data; renderAll(); });
watchUsers(data => { users = data; renderUsers(); });

// ---------- Auth guard ----------
if (sessionStorage.getItem('rms_session') !== 'active') {
  location.href = 'login.html';
}
const currentUser = JSON.parse(sessionStorage.getItem('rms_current_user') || 'null');

document.getElementById('logoutBtn').addEventListener('click', () => {
  sessionStorage.removeItem('rms_session');
  sessionStorage.removeItem('rms_current_user');
  location.href = 'login.html';
});

const isViewer = !!currentUser && currentUser.role === 'viewer';

if (currentUser) {
  document.getElementById('currentUserBox').innerHTML =
    `Signed in as<br><strong>${currentUser.name}</strong> (${currentUser.role})`;
  if (currentUser.role !== 'admin') {
    document.getElementById('adminNavItem').hidden = true;
    document.getElementById('smtpNavItem').hidden = true;
    document.getElementById('activityNavItem').hidden = true;
  }
}

function applyViewerLock() {
  if (!isViewer) return;
  document.querySelectorAll(
    '#buildingForm input, #buildingForm select, #buildingForm button,' +
    '#flatForm input, #flatForm select, #flatForm button,' +
    '#expenseForm input, #expenseForm select, #expenseForm button,' +
    '#rentForm input, #rentForm select, #rentForm button,' +
    '#advanceForm input, #advanceForm select, #advanceForm button'
  ).forEach(el => { el.disabled = true; });
}

// ---------- Navigation ----------
const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');
const pageTitle = document.getElementById('pageTitle');
const titles = {
  dashboard: 'Dashboard', buildings: 'Buildings', flats: 'Flats',
  rent: 'Rent Collection', advance: 'Advance Payments', expenses: 'Expenses',
  report: 'Monthly Report', admin: 'Admin', smtp: 'SMTP Setup', activity: 'Activity Log',
};

navItems.forEach(btn => {
  btn.addEventListener('click', () => {
    navItems.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const target = btn.dataset.view;
    views.forEach(v => v.classList.toggle('active', v.id === `view-${target}`));
    pageTitle.textContent = titles[target];
    renderAll();
    closeMobileMenu();
  });
});

// ---------- Mobile menu ----------
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const mobileMenuToggle = document.getElementById('mobileMenuToggle');

function openMobileMenu() {
  sidebar.classList.add('open');
  sidebarOverlay.classList.add('open');
}
function closeMobileMenu() {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('open');
}
mobileMenuToggle.addEventListener('click', openMobileMenu);
sidebarOverlay.addEventListener('click', closeMobileMenu);

// ---------- Dropdown helpers ----------
function populateBuildingOptions(selectEl) {
  const prev = selectEl.value;
  selectEl.innerHTML = `<option value="">All Buildings</option>` +
    buildings.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
  if ([...selectEl.options].some(o => o.value === prev)) selectEl.value = prev;
}
function populateBuildingOptionsRequired(selectEl) {
  const prev = selectEl.value;
  selectEl.innerHTML = buildings.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
  if ([...selectEl.options].some(o => o.value === prev)) selectEl.value = prev;
}
function populateFlatOptions(selectEl, buildingId) {
  const prev = selectEl.value;
  const list = buildingId ? flats.filter(f => f.buildingId === buildingId) : flats;
  selectEl.innerHTML = list.map(f =>
    `<option value="${f.id}">${buildingName(f.buildingId)} — Unit ${f.unit}${f.tenant ? ' (' + f.tenant + ')' : ''}</option>`
  ).join('');
  if (list.some(f => f.id === prev)) selectEl.value = prev;
}

// ---------- Buildings ----------
const buildingForm = document.getElementById('buildingForm');
const buildingEditIdInput = document.getElementById('buildingEditId');
const buildingFormTitle = document.getElementById('buildingFormTitle');
const buildingSubmitBtn = document.getElementById('buildingSubmitBtn');
const buildingCancelEdit = document.getElementById('buildingCancelEdit');
const buildingsTableBody = document.querySelector('#buildingsTable tbody');
const buildingsEmpty = document.getElementById('buildingsEmpty');

function resetBuildingForm() {
  buildingForm.reset();
  buildingEditIdInput.value = '';
  buildingFormTitle.textContent = 'Add Building';
  buildingSubmitBtn.textContent = 'Add Building';
  buildingCancelEdit.hidden = true;
}

function startEditBuilding(id) {
  const b = buildings.find(b => b.id === id);
  if (!b) return;
  buildingEditIdInput.value = b.id;
  document.getElementById('buildingName').value = b.name;
  document.getElementById('buildingAddress').value = b.address;
  buildingFormTitle.textContent = 'Edit Building';
  buildingSubmitBtn.textContent = 'Update Building';
  buildingCancelEdit.hidden = false;
}

buildingCancelEdit.addEventListener('click', resetBuildingForm);

buildingForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('buildingName').value.trim();
  const address = document.getElementById('buildingAddress').value.trim();
  const editId = buildingEditIdInput.value;

  if (editId) {
    await db.collection('buildings').doc(editId).update({ name, address });
    notifyChange('Buildings', 'edited', `${name} (${address})`);
  } else {
    await db.collection('buildings').add({ name, address });
    notifyChange('Buildings', 'added', `${name} (${address})`);
  }
  resetBuildingForm();
});

function renderBuildings() {
  buildingsEmpty.hidden = buildings.length > 0;
  buildingsTableBody.innerHTML = buildings.map(b => {
    const flatCount = flats.filter(f => f.buildingId === b.id).length;
    return `
      <tr>
        <td>${b.name}</td>
        <td>${b.address}</td>
        <td>${flatCount}</td>
        <td>
          <button class="action-btn" data-edit-building="${b.id}" ${isViewer ? 'disabled' : ''}>Edit</button>
          <button class="action-btn danger" data-remove-building="${b.id}" ${isViewer ? 'disabled' : ''}>Remove</button>
        </td>
      </tr>
    `;
  }).join('');
}

async function deleteDocs(collectionName, docs) {
  const chunkSize = 400;
  for (let i = 0; i < docs.length; i += chunkSize) {
    const batch = db.batch();
    docs.slice(i, i + chunkSize).forEach(doc => batch.delete(db.collection(collectionName).doc(doc.id)));
    await batch.commit();
  }
}

buildingsTableBody.addEventListener('click', async (e) => {
  const editId = e.target.dataset.editBuilding;
  const removeId = e.target.dataset.removeBuilding;
  if (editId) { startEditBuilding(editId); return; }
  if (removeId) {
    if (!confirm('Remove this building? This will also delete all its flats, expenses, rent records, and advance payments.')) return;
    const removedName = buildingName(removeId);
    const flatIds = flats.filter(f => f.buildingId === removeId).map(f => f.id);
    await deleteDocs('expenses', expenses.filter(ex => flatIds.includes(ex.flatId)));
    await deleteDocs('rentRecords', rentRecords.filter(r => flatIds.includes(r.flatId)));
    await deleteDocs('advancePayments', advancePayments.filter(a => flatIds.includes(a.flatId)));
    await deleteDocs('flats', flats.filter(f => f.buildingId === removeId));
    await db.collection('buildings').doc(removeId).delete();
    notifyChange('Buildings', 'deleted', removedName);
    resetBuildingForm();
  }
});

// ---------- Flats ----------
const flatForm = document.getElementById('flatForm');
const flatEditIdInput = document.getElementById('flatEditId');
const flatFormTitle = document.getElementById('flatFormTitle');
const flatSubmitBtn = document.getElementById('flatSubmitBtn');
const flatCancelEdit = document.getElementById('flatCancelEdit');
const flatsTableBody = document.querySelector('#flatsTable tbody');
const flatsEmpty = document.getElementById('flatsEmpty');

function resetFlatForm() {
  flatForm.reset();
  flatEditIdInput.value = '';
  flatFormTitle.textContent = 'Add Flat';
  flatSubmitBtn.textContent = 'Add Flat';
  flatCancelEdit.hidden = true;
}

function startEditFlat(id) {
  const f = flats.find(f => f.id === id);
  if (!f) return;
  flatEditIdInput.value = f.id;
  flatBuildingSelect.value = f.buildingId;
  document.getElementById('flatUnit').value = f.unit;
  document.getElementById('flatTenant').value = f.tenant || '';
  document.getElementById('flatPhone').value = f.phone || '';
  document.getElementById('flatRent').value = f.rent;
  flatFormTitle.textContent = 'Edit Flat';
  flatSubmitBtn.textContent = 'Update Flat';
  flatCancelEdit.hidden = false;
}

flatCancelEdit.addEventListener('click', resetFlatForm);

flatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const editId = flatEditIdInput.value;
  const data = {
    buildingId: flatBuildingSelect.value,
    unit: document.getElementById('flatUnit').value.trim(),
    tenant: document.getElementById('flatTenant').value.trim(),
    phone: document.getElementById('flatPhone').value.trim(),
    rent: Number(document.getElementById('flatRent').value),
  };

  if (editId) {
    await db.collection('flats').doc(editId).update(data);
    notifyChange('Flats', 'edited', `Unit ${data.unit} (${buildingName(data.buildingId)})`);
  } else {
    await db.collection('flats').add(data);
    notifyChange('Flats', 'added', `Unit ${data.unit} (${buildingName(data.buildingId)})`);
  }
  resetFlatForm();
});

function renderFlats() {
  const buildingFilterVal = flatBuildingFilter.value;
  const list = buildingFilterVal ? flats.filter(f => f.buildingId === buildingFilterVal) : flats;
  flatsEmpty.hidden = list.length > 0;

  flatsTableBody.innerHTML = list.map(f => {
    const totalExpenses = flatExpenseTotal(f.id);
    const advanceHeld = flatAdvanceTotal(f.id);
    const net = Number(f.rent) - totalExpenses;
    const status = f.tenant ? 'occupied' : 'vacant';
    return `
      <tr>
        <td>${buildingName(f.buildingId)}</td>
        <td>${f.unit}</td>
        <td>${f.tenant || '—'}</td>
        <td><span class="status-pill status-${status}">${status === 'occupied' ? 'Occupied' : 'Vacant'}</span></td>
        <td>${money(f.rent)}</td>
        <td>${money(totalExpenses)}</td>
        <td>${money(advanceHeld)}</td>
        <td class="${net >= 0 ? 'amount-positive' : 'amount-negative'}">${money(net)}</td>
        <td>
          <button class="action-btn" data-edit-flat="${f.id}" ${isViewer ? 'disabled' : ''}>Edit</button>
          <button class="action-btn danger" data-remove-flat="${f.id}" ${isViewer ? 'disabled' : ''}>Remove</button>
        </td>
      </tr>
    `;
  }).join('');
}

flatsTableBody.addEventListener('click', async (e) => {
  const editId = e.target.dataset.editFlat;
  const removeId = e.target.dataset.removeFlat;
  if (editId) { startEditFlat(editId); return; }
  if (removeId) {
    if (!confirm('Remove this flat? This will also delete its expenses, rent records, and advance payments.')) return;
    const removedFlat = flats.find(f => f.id === removeId);
    await deleteDocs('expenses', expenses.filter(ex => ex.flatId === removeId));
    await deleteDocs('rentRecords', rentRecords.filter(r => r.flatId === removeId));
    await deleteDocs('advancePayments', advancePayments.filter(a => a.flatId === removeId));
    await db.collection('flats').doc(removeId).delete();
    notifyChange('Flats', 'deleted', removedFlat ? `Unit ${removedFlat.unit}` : removeId);
    resetFlatForm();
  }
});

// ---------- Expenses ----------
const expenseForm = document.getElementById('expenseForm');
const expenseEditIdInput = document.getElementById('expenseEditId');
const expenseFormTitle = document.getElementById('expenseFormTitle');
const expenseSubmitBtn = document.getElementById('expenseSubmitBtn');
const expenseCancelEdit = document.getElementById('expenseCancelEdit');
const expenseFlatSelect = document.getElementById('expenseFlat');
const expenseMonthFilter = document.getElementById('expenseMonthFilter');
const expensesTableBody = document.querySelector('#expensesTable tbody');
const expensesEmpty = document.getElementById('expensesEmpty');

document.getElementById('expenseDate').valueAsDate = new Date();

function resetExpenseForm() {
  expenseForm.reset();
  expenseEditIdInput.value = '';
  expenseFormTitle.textContent = 'Add Expense';
  expenseSubmitBtn.textContent = 'Add Expense';
  expenseCancelEdit.hidden = true;
  document.getElementById('expenseDate').valueAsDate = new Date();
}

function startEditExpense(id) {
  const ex = expenses.find(ex => ex.id === id);
  if (!ex) return;
  const flat = flats.find(f => f.id === ex.flatId);

  expenseEditIdInput.value = ex.id;
  if (flat) expenseBuildingSelect.value = flat.buildingId;
  populateFlatOptions(expenseFlatSelect, flat ? flat.buildingId : null);
  expenseFlatSelect.value = ex.flatId;
  document.getElementById('expenseCategory').value = ex.category;
  document.getElementById('expenseAmount').value = ex.amount;
  document.getElementById('expenseDate').value = ex.date;
  document.getElementById('expenseNote').value = ex.note || '';

  expenseFormTitle.textContent = 'Edit Expense';
  expenseSubmitBtn.textContent = 'Update Expense';
  expenseCancelEdit.hidden = false;
}

expenseCancelEdit.addEventListener('click', resetExpenseForm);

expenseForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const editId = expenseEditIdInput.value;
  const data = {
    flatId: expenseFlatSelect.value,
    category: document.getElementById('expenseCategory').value,
    amount: Number(document.getElementById('expenseAmount').value),
    date: document.getElementById('expenseDate').value,
    note: document.getElementById('expenseNote').value.trim(),
  };

  if (editId) {
    await db.collection('expenses').doc(editId).update(data);
    notifyChange('Expenses', 'edited', `${data.category} — ${money(data.amount)} for ${flatLabel(data.flatId)}`);
  } else {
    await db.collection('expenses').add(data);
    notifyChange('Expenses', 'added', `${data.category} — ${money(data.amount)} for ${flatLabel(data.flatId)}`);
  }
  resetExpenseForm();
});

function renderExpenses() {
  const buildingFilterVal = expenseBuildingFilter.value;
  const monthFilterVal = expenseMonthFilter.value;

  const list = expenses.filter(ex => {
    const flat = flats.find(f => f.id === ex.flatId);
    const matchesBuilding = !buildingFilterVal || (flat && flat.buildingId === buildingFilterVal);
    const matchesMonth = !monthFilterVal || (ex.date && ex.date.startsWith(monthFilterVal));
    return matchesBuilding && matchesMonth;
  }).slice().sort((a, b) => new Date(b.date) - new Date(a.date));

  expensesEmpty.hidden = list.length > 0;

  expensesTableBody.innerHTML = list.map(ex => {
    const flat = flats.find(f => f.id === ex.flatId);
    return `
      <tr>
        <td>${ex.date}</td>
        <td>${flat ? buildingName(flat.buildingId) : '—'}</td>
        <td>${flat ? 'Unit ' + flat.unit : '—'}</td>
        <td>${ex.category}</td>
        <td>${money(ex.amount)}</td>
        <td>${ex.note || '—'}</td>
        <td>
          <button class="action-btn" data-edit-expense="${ex.id}" ${isViewer ? 'disabled' : ''}>Edit</button>
          <button class="action-btn danger" data-remove-expense="${ex.id}" ${isViewer ? 'disabled' : ''}>Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

expensesTableBody.addEventListener('click', async (e) => {
  const editId = e.target.dataset.editExpense;
  const removeId = e.target.dataset.removeExpense;
  if (editId) { startEditExpense(editId); return; }
  if (removeId) {
    if (!confirm('Delete this expense record?')) return;
    const removedEx = expenses.find(ex => ex.id === removeId);
    await db.collection('expenses').doc(removeId).delete();
    if (removedEx) notifyChange('Expenses', 'deleted', `${removedEx.category} — ${money(removedEx.amount)} for ${flatLabel(removedEx.flatId)}`);
  }
});

expenseBuildingFilter.addEventListener('change', renderExpenses);
expenseMonthFilter.addEventListener('change', renderExpenses);
document.getElementById('expenseMonthFilterClear').addEventListener('click', () => {
  expenseMonthFilter.value = '';
  renderExpenses();
});
expenseBuildingSelect.addEventListener('change', () => {
  populateFlatOptions(expenseFlatSelect, expenseBuildingSelect.value || null);
});

// ---------- Rent Collection ----------
const rentForm = document.getElementById('rentForm');
const rentEditIdInput = document.getElementById('rentEditId');
const rentFormTitle = document.getElementById('rentFormTitle');
const rentSubmitBtn = document.getElementById('rentSubmitBtn');
const rentCancelEdit = document.getElementById('rentCancelEdit');
const rentFlatSelect = document.getElementById('rentFlat');
const rentMonthFilter = document.getElementById('rentMonthFilter');
const rentTableBody = document.querySelector('#rentTable tbody');
const rentEmpty = document.getElementById('rentEmpty');

document.getElementById('rentMonth').value = currentMonthStr();

document.getElementById('rentReceived').addEventListener('change', (e) => {
  const receivedDateInput = document.getElementById('rentReceivedDate');
  if (e.target.checked && !receivedDateInput.value) {
    receivedDateInput.valueAsDate = new Date();
  }
});

function fillRentAmountFromFlat() {
  if (rentEditIdInput.value) return;
  const flat = flats.find(f => f.id === rentFlatSelect.value);
  if (flat) document.getElementById('rentAmount').value = flat.rent;
}
rentFlatSelect.addEventListener('change', fillRentAmountFromFlat);
rentBuildingSelect.addEventListener('change', () => {
  populateFlatOptions(rentFlatSelect, rentBuildingSelect.value || null);
  fillRentAmountFromFlat();
});

function resetRentForm() {
  rentForm.reset();
  rentEditIdInput.value = '';
  document.getElementById('rentMonth').value = currentMonthStr();
  rentFormTitle.textContent = 'Add Rent Record';
  rentSubmitBtn.textContent = 'Add Rent Record';
  rentCancelEdit.hidden = true;
}

function startEditRent(id) {
  const r = rentRecords.find(r => r.id === id);
  if (!r) return;
  const flat = flats.find(f => f.id === r.flatId);

  rentEditIdInput.value = r.id;
  if (flat) rentBuildingSelect.value = flat.buildingId;
  populateFlatOptions(rentFlatSelect, flat ? flat.buildingId : null);
  rentFlatSelect.value = r.flatId;
  document.getElementById('rentMonth').value = r.month;
  document.getElementById('rentAmount').value = r.amountDue;
  document.getElementById('rentReceived').checked = r.received;
  document.getElementById('rentReceivedDate').value = r.receivedDate || '';
  document.getElementById('rentPaymentMode').value = r.paymentMode || '';
  document.getElementById('rentNote').value = r.note || '';

  rentFormTitle.textContent = 'Edit Rent Record';
  rentSubmitBtn.textContent = 'Update Rent Record';
  rentCancelEdit.hidden = false;
}

rentCancelEdit.addEventListener('click', resetRentForm);

rentForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const flatId = rentFlatSelect.value;
  const month = document.getElementById('rentMonth').value;
  const editId = rentEditIdInput.value;

  const data = {
    flatId,
    month,
    amountDue: Number(document.getElementById('rentAmount').value),
    received: document.getElementById('rentReceived').checked,
    receivedDate: document.getElementById('rentReceivedDate').value || '',
    paymentMode: document.getElementById('rentPaymentMode').value,
    note: document.getElementById('rentNote').value.trim(),
  };

  const duplicate = rentRecords.find(r => r.flatId === flatId && r.month === month && r.id !== editId);

  if (editId) {
    await db.collection('rentRecords').doc(editId).update(data);
    notifyChange('Rent Collection', 'edited', `${month} — ${money(data.amountDue)} for ${flatLabel(flatId)}`);
  } else if (duplicate) {
    await db.collection('rentRecords').doc(duplicate.id).update(data);
    notifyChange('Rent Collection', 'edited', `${month} — ${money(data.amountDue)} for ${flatLabel(flatId)}`);
  } else {
    await db.collection('rentRecords').add(data);
    notifyChange('Rent Collection', 'added', `${month} — ${money(data.amountDue)} for ${flatLabel(flatId)}`);
  }
  resetRentForm();
});

function renderRent() {
  const buildingFilterVal = rentBuildingFilter.value;
  const monthFilterVal = rentMonthFilter.value;

  const list = rentRecords.filter(r => {
    const flat = flats.find(f => f.id === r.flatId);
    const matchesBuilding = !buildingFilterVal || (flat && flat.buildingId === buildingFilterVal);
    const matchesMonth = !monthFilterVal || r.month === monthFilterVal;
    return matchesBuilding && matchesMonth;
  }).slice().sort((a, b) => b.month.localeCompare(a.month));

  rentEmpty.hidden = list.length > 0;

  rentTableBody.innerHTML = list.map(r => {
    const flat = flats.find(f => f.id === r.flatId);
    return `
      <tr>
        <td>${flat ? buildingName(flat.buildingId) : '—'}</td>
        <td>${flat ? 'Unit ' + flat.unit : '—'}</td>
        <td>${flat ? (flat.tenant || '—') : '—'}</td>
        <td>${r.month}</td>
        <td>${money(r.amountDue)}</td>
        <td><span class="status-pill ${r.received ? 'status-received' : 'status-unreceived'}">${r.received ? 'Received' : 'Pending'}</span></td>
        <td>${r.receivedDate || '—'}</td>
        <td>${r.paymentMode || '—'}</td>
        <td>${r.note || '—'}</td>
        <td>
          <button class="action-btn" data-toggle-rent="${r.id}" ${isViewer ? 'disabled' : ''}>${r.received ? 'Mark Pending' : 'Mark Received'}</button>
          <button class="action-btn" data-edit-rent="${r.id}" ${isViewer ? 'disabled' : ''}>Edit</button>
          <button class="action-btn danger" data-remove-rent="${r.id}" ${isViewer ? 'disabled' : ''}>Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

rentTableBody.addEventListener('click', async (e) => {
  const toggleId = e.target.dataset.toggleRent;
  const editId = e.target.dataset.editRent;
  const removeId = e.target.dataset.removeRent;

  if (toggleId) {
    const r = rentRecords.find(r => r.id === toggleId);
    const received = !r.received;
    const receivedDate = received && !r.receivedDate ? new Date().toISOString().slice(0, 10) : r.receivedDate;
    await db.collection('rentRecords').doc(toggleId).update({ received, receivedDate });
    notifyChange('Rent Collection', 'edited', `${r.month} for ${flatLabel(r.flatId)} marked as ${received ? 'received' : 'not received'}`);
    return;
  }
  if (editId) { startEditRent(editId); return; }
  if (removeId) {
    if (!confirm('Delete this rent record?')) return;
    const removedRent = rentRecords.find(r => r.id === removeId);
    await db.collection('rentRecords').doc(removeId).delete();
    if (removedRent) notifyChange('Rent Collection', 'deleted', `${removedRent.month} for ${flatLabel(removedRent.flatId)}`);
  }
});

rentBuildingFilter.addEventListener('change', renderRent);
rentMonthFilter.addEventListener('change', renderRent);
document.getElementById('rentMonthFilterClear').addEventListener('click', () => {
  rentMonthFilter.value = '';
  renderRent();
});

// ---------- Advance Payments ----------
const advanceForm = document.getElementById('advanceForm');
const advanceEditIdInput = document.getElementById('advanceEditId');
const advanceFormTitle = document.getElementById('advanceFormTitle');
const advanceSubmitBtn = document.getElementById('advanceSubmitBtn');
const advanceCancelEdit = document.getElementById('advanceCancelEdit');
const advanceFlatSelect = document.getElementById('advanceFlat');
const advanceTableBody = document.querySelector('#advanceTable tbody');
const advanceEmpty = document.getElementById('advanceEmpty');

document.getElementById('advanceDate').valueAsDate = new Date();

advanceBuildingSelect.addEventListener('change', () => {
  populateFlatOptions(advanceFlatSelect, advanceBuildingSelect.value || null);
});

function resetAdvanceForm() {
  advanceForm.reset();
  advanceEditIdInput.value = '';
  advanceFormTitle.textContent = 'Add Advance Payment';
  advanceSubmitBtn.textContent = 'Add Advance Payment';
  advanceCancelEdit.hidden = true;
  document.getElementById('advanceDate').valueAsDate = new Date();
}

function startEditAdvance(id) {
  const a = advancePayments.find(a => a.id === id);
  if (!a) return;
  const flat = flats.find(f => f.id === a.flatId);

  advanceEditIdInput.value = a.id;
  if (flat) advanceBuildingSelect.value = flat.buildingId;
  populateFlatOptions(advanceFlatSelect, flat ? flat.buildingId : null);
  advanceFlatSelect.value = a.flatId;
  document.getElementById('advanceAmount').value = a.amount;
  document.getElementById('advanceDate').value = a.date;
  document.getElementById('advancePaymentMode').value = a.paymentMode || '';
  document.getElementById('advanceNote').value = a.note || '';

  advanceFormTitle.textContent = 'Edit Advance Payment';
  advanceSubmitBtn.textContent = 'Update Advance Payment';
  advanceCancelEdit.hidden = false;
}

advanceCancelEdit.addEventListener('click', resetAdvanceForm);

advanceForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = {
    flatId: advanceFlatSelect.value,
    amount: Number(document.getElementById('advanceAmount').value),
    date: document.getElementById('advanceDate').value,
    paymentMode: document.getElementById('advancePaymentMode').value,
    note: document.getElementById('advanceNote').value.trim(),
  };
  const editId = advanceEditIdInput.value;

  if (editId) {
    await db.collection('advancePayments').doc(editId).update(data);
    notifyChange('Advance Payments', 'edited', `${money(data.amount)} for ${flatLabel(data.flatId)}`);
  } else {
    await db.collection('advancePayments').add(data);
    notifyChange('Advance Payments', 'added', `${money(data.amount)} for ${flatLabel(data.flatId)}`);
  }
  resetAdvanceForm();
});

function renderAdvance() {
  const buildingFilterVal = advanceBuildingFilter.value;
  const list = advancePayments.filter(a => {
    const flat = flats.find(f => f.id === a.flatId);
    return !buildingFilterVal || (flat && flat.buildingId === buildingFilterVal);
  }).slice().sort((a, b) => new Date(b.date) - new Date(a.date));

  advanceEmpty.hidden = list.length > 0;

  advanceTableBody.innerHTML = list.map(a => {
    const flat = flats.find(f => f.id === a.flatId);
    return `
      <tr>
        <td>${flat ? buildingName(flat.buildingId) : '—'}</td>
        <td>${flat ? 'Unit ' + flat.unit : '—'}</td>
        <td>${flat ? (flat.tenant || '—') : '—'}</td>
        <td>${a.date}</td>
        <td>${money(a.amount)}</td>
        <td>${a.paymentMode || '—'}</td>
        <td>${a.note || '—'}</td>
        <td>
          <button class="action-btn" data-edit-advance="${a.id}" ${isViewer ? 'disabled' : ''}>Edit</button>
          <button class="action-btn danger" data-remove-advance="${a.id}" ${isViewer ? 'disabled' : ''}>Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

advanceTableBody.addEventListener('click', async (e) => {
  const editId = e.target.dataset.editAdvance;
  const removeId = e.target.dataset.removeAdvance;
  if (editId) { startEditAdvance(editId); return; }
  if (removeId) {
    if (!confirm('Delete this advance payment record?')) return;
    const removedAdvance = advancePayments.find(a => a.id === removeId);
    await db.collection('advancePayments').doc(removeId).delete();
    if (removedAdvance) notifyChange('Advance Payments', 'deleted', `${money(removedAdvance.amount)} for ${flatLabel(removedAdvance.flatId)}`);
  }
});

advanceBuildingFilter.addEventListener('change', renderAdvance);

// ---------- Dashboard ----------
function renderDashboard() {
  document.getElementById('statBuildings').textContent = buildings.length;
  document.getElementById('statFlats').textContent = flats.length;

  const container = document.getElementById('buildingSections');
  document.getElementById('buildingSectionsEmpty').hidden = buildings.length > 0;
  const thisMonth = currentMonthStr();

  container.innerHTML = buildings.map(b => {
    const buildingFlats = flats.filter(f => f.buildingId === b.id);
    const flatIds = buildingFlats.map(f => f.id);
    const rentSum = buildingFlats.reduce((sum, f) => sum + Number(f.rent), 0);
    const expenseSum = buildingFlats.reduce((sum, f) => sum + flatExpenseTotal(f.id), 0);
    const net = rentSum - expenseSum;

    const monthRecords = rentRecords.filter(r => r.month === thisMonth && flatIds.includes(r.flatId));
    const collected = monthRecords.filter(r => r.received).reduce((sum, r) => sum + Number(r.amountDue), 0);
    const pending = monthRecords.filter(r => !r.received).reduce((sum, r) => sum + Number(r.amountDue), 0);

    const tenantCards = buildingFlats.length ? buildingFlats.map(f => {
      const totalExpenses = flatExpenseTotal(f.id);
      const flatNet = Number(f.rent) - totalExpenses;
      const status = f.tenant ? 'occupied' : 'vacant';
      const rec = rentRecords.find(r => r.flatId === f.id && r.month === thisMonth);
      const rentStatusLabel = rec ? (rec.received ? 'Received' : 'Pending') : 'No record';
      return `
        <div class="tenant-card">
          <div class="tenant-card-top">
            <h4>Unit ${f.unit}</h4>
            <span class="status-pill status-${status}">${status === 'occupied' ? 'Occupied' : 'Vacant'}</span>
          </div>
          <div class="tenant-name">${f.tenant || 'No tenant'}</div>
          <div class="tenant-row"><span>Monthly Rent</span><span>${money(f.rent)}</span></div>
          <div class="tenant-row"><span>Expenses</span><span>${money(totalExpenses)}</span></div>
          <div class="tenant-row"><span>Net</span><span class="${flatNet >= 0 ? 'amount-positive' : 'amount-negative'}">${money(flatNet)}</span></div>
          <div class="tenant-row"><span>This Month</span><span>${rentStatusLabel}</span></div>
        </div>
      `;
    }).join('') : `<p class="empty-msg">No flats in this building yet.</p>`;

    return `
      <div class="panel-box building-section">
        <div class="building-section-header">
          <div>
            <h3>${b.name}</h3>
            <div class="building-address">${b.address}</div>
          </div>
          <div class="building-mini-stats">
            <div><span class="mini-value">${buildingFlats.length}</span><span class="mini-label">Flats</span></div>
            <div><span class="mini-value">${money(rentSum)}</span><span class="mini-label">Monthly Rent</span></div>
            <div><span class="mini-value">${money(expenseSum)}</span><span class="mini-label">Expenses</span></div>
            <div><span class="mini-value ${net >= 0 ? 'amount-positive' : 'amount-negative'}">${money(net)}</span><span class="mini-label">Net</span></div>
            <div><span class="mini-value">${money(collected)}</span><span class="mini-label">Collected (Month)</span></div>
            <div><span class="mini-value">${money(pending)}</span><span class="mini-label">Pending (Month)</span></div>
          </div>
        </div>
        <div class="tenant-card-grid">${tenantCards}</div>
      </div>
    `;
  }).join('');
}

// ---------- Summary Report ----------
function buildSummaryReportText() {
  const thisMonth = currentMonthStr();
  const totalRent = flats.reduce((sum, f) => sum + Number(f.rent), 0);
  const totalExpenses = flats.reduce((sum, f) => sum + flatExpenseTotal(f.id), 0);
  const totalNet = totalRent - totalExpenses;
  const monthRecords = rentRecords.filter(r => r.month === thisMonth);
  const totalCollected = monthRecords.filter(r => r.received).reduce((sum, r) => sum + Number(r.amountDue), 0);
  const totalPending = monthRecords.filter(r => !r.received).reduce((sum, r) => sum + Number(r.amountDue), 0);
  const vacantCount = flats.filter(f => !f.tenant).length;

  const lines = [];
  lines.push('Bahrain Rental Management — SUMMARY REPORT');
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push('');
  lines.push('OVERVIEW');
  lines.push(`Buildings: ${buildings.length}`);
  lines.push(`Flats: ${flats.length} (${vacantCount} vacant)`);
  lines.push(`Total Monthly Rent: ${money(totalRent)}`);
  lines.push(`Total Expenses: ${money(totalExpenses)}`);
  lines.push(`Net: ${money(totalNet)}`);
  lines.push(`Rent Collected (${thisMonth}): ${money(totalCollected)}`);
  lines.push(`Rent Pending (${thisMonth}): ${money(totalPending)}`);
  lines.push('');
  lines.push('BY BUILDING');

  buildings.forEach(b => {
    const buildingFlats = flats.filter(f => f.buildingId === b.id);
    const flatIds = buildingFlats.map(f => f.id);
    const rentSum = buildingFlats.reduce((sum, f) => sum + Number(f.rent), 0);
    const expenseSum = buildingFlats.reduce((sum, f) => sum + flatExpenseTotal(f.id), 0);
    const net = rentSum - expenseSum;
    const bMonthRecords = rentRecords.filter(r => r.month === thisMonth && flatIds.includes(r.flatId));
    const collected = bMonthRecords.filter(r => r.received).reduce((sum, r) => sum + Number(r.amountDue), 0);
    const pending = bMonthRecords.filter(r => !r.received).reduce((sum, r) => sum + Number(r.amountDue), 0);

    lines.push('');
    lines.push(`${b.name} (${b.address})`);
    lines.push(`  Flats: ${buildingFlats.length} | Rent: ${money(rentSum)} | Expenses: ${money(expenseSum)} | Net: ${money(net)}`);
    lines.push(`  Collected: ${money(collected)} | Pending: ${money(pending)}`);
  });

  return lines.join('\n');
}

const summaryReportError = document.getElementById('summaryReportError');
const summaryReportSuccess = document.getElementById('summaryReportSuccess');

document.getElementById('sendSummaryReport').addEventListener('click', async () => {
  summaryReportError.hidden = true;
  summaryReportSuccess.hidden = true;

  if (!emailSettings || !emailSettings.enabled || !emailSettings.accessKey) {
    summaryReportError.textContent = 'Set up and enable email notifications in SMTP Setup first.';
    summaryReportError.hidden = false;
    return;
  }

  try {
    const res = await fetch(WEB3FORMS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        access_key: emailSettings.accessKey,
        from_name: 'Bahrain Rental Management',
        subject: 'Bahrain Rental Management — Summary Report',
        message: buildSummaryReportText(),
      }),
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message || 'Web3Forms rejected the request.');
    summaryReportSuccess.textContent = 'Summary report sent — check the recipient inbox.';
    summaryReportSuccess.hidden = false;
  } catch (err) {
    summaryReportError.textContent = 'Could not send summary report: ' + err.message;
    summaryReportError.hidden = false;
  }
});

// ---------- Monthly Report ----------
function monthsForFlats(flatIds) {
  const months = new Set();
  rentRecords.forEach(r => { if (flatIds.includes(r.flatId)) months.add(r.month); });
  expenses.forEach(ex => { if (flatIds.includes(ex.flatId) && ex.date) months.add(ex.date.slice(0, 7)); });
  return [...months].sort().reverse();
}

function flatMonthFigures(flatId, month) {
  const rec = rentRecords.find(r => r.flatId === flatId && r.month === month);
  const income = rec && rec.received ? Number(rec.amountDue) : 0;
  const expenseSum = expenses
    .filter(ex => ex.flatId === flatId && ex.date && ex.date.startsWith(month))
    .reduce((sum, ex) => sum + Number(ex.amount), 0);
  return { income, expenseSum, savings: income - expenseSum, hasRecord: !!rec };
}

const reportCharts = {};

function renderReport() {
  const container = document.getElementById('reportSections');
  document.getElementById('reportEmpty').hidden = buildings.length > 0;

  container.innerHTML = buildings.map(b => {
    const buildingFlats = flats.filter(f => f.buildingId === b.id);
    const flatIds = buildingFlats.map(f => f.id);
    const months = monthsForFlats(flatIds);

    const summaryRows = months.map(month => {
      let income = 0, expenseSum = 0;
      buildingFlats.forEach(f => {
        const figures = flatMonthFigures(f.id, month);
        income += figures.income;
        expenseSum += figures.expenseSum;
      });
      const savings = income - expenseSum;
      return `
        <tr>
          <td>${month}</td>
          <td>${money(income)}</td>
          <td>${money(expenseSum)}</td>
          <td class="${savings >= 0 ? 'amount-positive' : 'amount-negative'}">${money(savings)}</td>
        </tr>
      `;
    }).join('');

    const detailRows = [];
    months.forEach(month => {
      buildingFlats.forEach(f => {
        const figures = flatMonthFigures(f.id, month);
        if (!figures.hasRecord && figures.expenseSum === 0) return;
        detailRows.push(`
          <tr>
            <td>${month}</td>
            <td>${f.unit}</td>
            <td>${f.tenant || '—'}</td>
            <td>${money(figures.income)}</td>
            <td>${money(figures.expenseSum)}</td>
            <td class="${figures.savings >= 0 ? 'amount-positive' : 'amount-negative'}">${money(figures.savings)}</td>
          </tr>
        `);
      });
    });

    return `
      <div class="panel-box building-section">
        <div class="building-section-header">
          <div>
            <h3>${b.name}</h3>
            <div class="building-address">${b.address}</div>
          </div>
        </div>

        ${months.length ? `<div class="report-chart-wrap"><canvas id="chart-${b.id}"></canvas></div>` : ''}

        <h3>Building Monthly Summary</h3>
        ${months.length ? `
          <div class="table-scroll">
          <table class="data-table">
            <thead><tr><th>Month</th><th>Income (Collected)</th><th>Expenses</th><th>Savings</th></tr></thead>
            <tbody>${summaryRows}</tbody>
          </table>
          </div>
        ` : `<p class="empty-msg">No rent or expense records yet for this building.</p>`}

        <h3 style="margin-top:24px;">Per-Flat Monthly Breakdown</h3>
        ${detailRows.length ? `
          <div class="table-scroll">
          <table class="data-table">
            <thead><tr><th>Month</th><th>Unit</th><th>Tenant</th><th>Income (Collected)</th><th>Expenses</th><th>Savings</th></tr></thead>
            <tbody>${detailRows.join('')}</tbody>
          </table>
          </div>
        ` : `<p class="empty-msg">No flat-level records yet for this building.</p>`}
      </div>
    `;
  }).join('');

  buildings.forEach(b => {
    const canvas = document.getElementById(`chart-${b.id}`);
    if (reportCharts[b.id]) { reportCharts[b.id].destroy(); delete reportCharts[b.id]; }
    if (!canvas) return;

    const buildingFlats = flats.filter(f => f.buildingId === b.id);
    const flatIds = buildingFlats.map(f => f.id);
    const months = monthsForFlats(flatIds).slice().reverse();

    const incomeData = [], expenseData = [], savingsData = [];
    months.forEach(month => {
      let income = 0, expenseSum = 0;
      buildingFlats.forEach(f => {
        const figures = flatMonthFigures(f.id, month);
        income += figures.income;
        expenseSum += figures.expenseSum;
      });
      incomeData.push(income);
      expenseData.push(expenseSum);
      savingsData.push(income - expenseSum);
    });

    reportCharts[b.id] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [
          { label: 'Income', data: incomeData, backgroundColor: '#0d9488' },
          { label: 'Expenses', data: expenseData, backgroundColor: '#dc2626' },
          { label: 'Savings', data: savingsData, type: 'line', borderColor: '#1f2937', backgroundColor: '#1f2937', tension: 0.25 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true } },
      },
    });
  });
}

document.getElementById('downloadReportPdf').addEventListener('click', () => {
  window.print();
});

// ---------- Admin: accounts ----------
const userForm = document.getElementById('userForm');
const userEditIdInput = document.getElementById('userEditId');
const userFormTitle = document.getElementById('userFormTitle');
const userSubmitBtn = document.getElementById('userSubmitBtn');
const userCancelEdit = document.getElementById('userCancelEdit');
const userFormError = document.getElementById('userFormError');
const usersTableBody = document.querySelector('#usersTable tbody');
const userRoleSelect = document.getElementById('userRole');
const userRoleAdminOption = document.getElementById('userRoleAdminOption');

const ROLE_LABELS = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' };

function renderUsers() {
  usersTableBody.innerHTML = users.map(u => `
    <tr>
      <td>${u.name}</td>
      <td>${u.username}</td>
      <td>${u.email || '—'}</td>
      <td><span class="status-pill role-${u.role}">${ROLE_LABELS[u.role] || u.role}</span></td>
      <td>
        <button class="action-btn" data-edit-user="${u.id}">Edit</button>
        ${u.role === 'admin' ? '' : `<button class="action-btn danger" data-remove-user="${u.id}">Remove</button>`}
      </td>
    </tr>
  `).join('');
}

function resetUserForm() {
  userForm.reset();
  userEditIdInput.value = '';
  userRoleAdminOption.hidden = true;
  userFormTitle.textContent = 'Add Account';
  userSubmitBtn.textContent = 'Create Account';
  userCancelEdit.hidden = true;
  userFormError.hidden = true;
}

function startEditUser(id) {
  const u = users.find(u => u.id === id);
  if (!u) return;
  userEditIdInput.value = u.id;
  document.getElementById('userFullName').value = u.name;
  document.getElementById('userUsername').value = u.username;
  document.getElementById('userEmail').value = u.email || '';
  document.getElementById('userPassword').value = u.password;
  userRoleAdminOption.hidden = u.role !== 'admin';
  userRoleSelect.value = u.role;

  userFormTitle.textContent = 'Edit Account';
  userSubmitBtn.textContent = 'Update Account';
  userCancelEdit.hidden = false;
  userFormError.hidden = true;
}

userCancelEdit.addEventListener('click', resetUserForm);

userForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const editId = userEditIdInput.value;
  const name = document.getElementById('userFullName').value.trim();
  const username = document.getElementById('userUsername').value.trim();
  const email = document.getElementById('userEmail').value.trim();
  const password = document.getElementById('userPassword').value;
  const role = userRoleSelect.value;

  const duplicate = users.some(u => u.username.toLowerCase() === username.toLowerCase() && u.id !== editId);
  if (duplicate) {
    userFormError.textContent = 'That username is already taken.';
    userFormError.hidden = false;
    return;
  }

  userFormError.hidden = true;
  if (editId) {
    await updateUser(editId, { name, username, email, password, role });
    notifyChange('Accounts', 'edited', `${name} (${username}, ${ROLE_LABELS[role] || role})`);
  } else {
    await addUser({ name, username, email, password, role });
    notifyChange('Accounts', 'added', `${name} (${username}, ${ROLE_LABELS[role] || role})`);
  }
  resetUserForm();
});

usersTableBody.addEventListener('click', async (e) => {
  const editId = e.target.dataset.editUser;
  if (editId) { startEditUser(editId); return; }

  const id = e.target.dataset.removeUser;
  if (!id) return;
  if (!confirm('Remove this account? They will no longer be able to sign in.')) return;
  const removedUser = users.find(u => u.id === id);
  await deleteUser(id);
  if (removedUser) notifyChange('Accounts', 'deleted', `${removedUser.name} (${removedUser.username})`);
});

// ---------- CSV export ----------
function csvEscape(value) {
  const str = String(value ?? '');
  return /[",\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
}
function downloadCsv(filename, rows) {
  const csv = rows.map(row => row.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

document.getElementById('exportBuildingsCsv').addEventListener('click', () => {
  const rows = [['Name', 'Address', 'Flats']];
  buildings.forEach(b => rows.push([b.name, b.address, flats.filter(f => f.buildingId === b.id).length]));
  downloadCsv('buildings.csv', rows);
});

document.getElementById('exportFlatsCsv').addEventListener('click', () => {
  const rows = [['Building', 'Unit', 'Tenant', 'Phone', 'Status', 'Monthly Rent', 'Total Expenses', 'Advance Held', 'Net']];
  flats.forEach(f => {
    const totalExpenses = flatExpenseTotal(f.id);
    const advanceHeld = flatAdvanceTotal(f.id);
    rows.push([
      buildingName(f.buildingId), f.unit, f.tenant || '', f.phone || '',
      f.tenant ? 'Occupied' : 'Vacant', f.rent, totalExpenses, advanceHeld, Number(f.rent) - totalExpenses,
    ]);
  });
  downloadCsv('flats.csv', rows);
});

document.getElementById('exportExpensesCsv').addEventListener('click', () => {
  const rows = [['Date', 'Building', 'Unit', 'Category', 'Amount', 'Note']];
  expenses.forEach(ex => {
    const flat = flats.find(f => f.id === ex.flatId);
    rows.push([ex.date, flat ? buildingName(flat.buildingId) : '', flat ? flat.unit : '', ex.category, ex.amount, ex.note || '']);
  });
  downloadCsv('expenses.csv', rows);
});

document.getElementById('exportRentCsv').addEventListener('click', () => {
  const rows = [['Building', 'Unit', 'Tenant', 'Month', 'Amount Due', 'Received', 'Date Received', 'Payment Mode', 'Note']];
  rentRecords.forEach(r => {
    const flat = flats.find(f => f.id === r.flatId);
    rows.push([
      flat ? buildingName(flat.buildingId) : '', flat ? flat.unit : '', flat ? (flat.tenant || '') : '',
      r.month, r.amountDue, r.received ? 'Yes' : 'No', r.receivedDate || '', r.paymentMode || '', r.note || '',
    ]);
  });
  downloadCsv('rent-collection.csv', rows);
});

document.getElementById('exportAdvanceCsv').addEventListener('click', () => {
  const rows = [['Building', 'Unit', 'Tenant', 'Date', 'Amount', 'Payment Mode', 'Note']];
  advancePayments.forEach(a => {
    const flat = flats.find(f => f.id === a.flatId);
    rows.push([flat ? buildingName(flat.buildingId) : '', flat ? flat.unit : '', flat ? (flat.tenant || '') : '', a.date, a.amount, a.paymentMode || '', a.note || '']);
  });
  downloadCsv('advance-payments.csv', rows);
});

// ---------- Backup & Restore ----------
document.getElementById('downloadBackup').addEventListener('click', () => {
  const data = {
    exportedAt: new Date().toISOString(),
    buildings, flats, expenses, rentRecords, advancePayments, users,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rental-manager-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
});

async function replaceCollection(name, records) {
  const existing = await db.collection(name).get();
  const chunkSize = 400;
  const existingDocs = existing.docs;

  for (let i = 0; i < existingDocs.length; i += chunkSize) {
    const batch = db.batch();
    existingDocs.slice(i, i + chunkSize).forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
  for (let i = 0; i < records.length; i += chunkSize) {
    const batch = db.batch();
    records.slice(i, i + chunkSize).forEach(rec => {
      const { id, ...data } = rec;
      const ref = id ? db.collection(name).doc(id) : db.collection(name).doc();
      batch.set(ref, data);
    });
    await batch.commit();
  }
}

document.getElementById('restoreFileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (!confirm('Restoring will replace ALL current data (buildings, flats, expenses, rent, advance, accounts) with the contents of this backup file. Continue?')) {
    e.target.value = '';
    return;
  }

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    await replaceCollection('buildings', data.buildings || []);
    await replaceCollection('flats', data.flats || []);
    await replaceCollection('expenses', data.expenses || []);
    await replaceCollection('rentRecords', data.rentRecords || []);
    await replaceCollection('advancePayments', data.advancePayments || []);
    await replaceCollection('users', data.users || []);
    alert('Backup restored successfully.');
  } catch (err) {
    alert('Failed to restore backup: ' + err.message);
  } finally {
    e.target.value = '';
  }
});

// ---------- Email Notifications (Web3Forms — no server needed) ----------
const WEB3FORMS_URL = 'https://api.web3forms.com/submit';
let emailSettings = null;

db.collection('settings').doc('smtp').get().then(doc => {
  if (!doc.exists) return;
  const s = doc.data();
  emailSettings = s;
  document.getElementById('smtpEnabled').checked = !!s.enabled;
  document.getElementById('smtpAccessKey').value = s.accessKey || '';
});

async function sendViaWeb3Forms(accessKey, section, action, summary) {
  const res = await fetch(WEB3FORMS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      access_key: accessKey,
      from_name: 'Bahrain Rental Management',
      subject: `Bahrain Rental Management — ${section} ${action}`,
      message: `${summary}\n\nBy: ${currentUser ? currentUser.name : 'Unknown'}\nTime: ${new Date().toLocaleString()}`,
    }),
  });
  const result = await res.json();
  if (!result.success) throw new Error(result.message || 'Web3Forms rejected the request.');
}

async function notifyChange(section, action, summary) {
  const by = currentUser ? currentUser.name : 'Unknown';
  const time = new Date().toLocaleString();
  let emailStatus = 'disabled';
  let emailError = '';

  if (emailSettings && emailSettings.enabled && emailSettings.accessKey) {
    try {
      await sendViaWeb3Forms(emailSettings.accessKey, section, action, summary);
      emailStatus = 'sent';
    } catch (err) {
      emailStatus = 'failed';
      emailError = err.message;
      console.warn('Could not send notification email:', err.message);
    }
  }

  try {
    await db.collection('activityLog').add({
      section, action, summary, by, time, emailStatus, emailError,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.warn('Could not write activity log:', err.message);
  }
}

// ---------- Activity Log ----------
let activityLog = [];
const activityTableBody = document.querySelector('#activityTable tbody');
const activityEmpty = document.getElementById('activityEmpty');

db.collection('activityLog').orderBy('createdAt', 'desc').limit(200).onSnapshot(
  snap => {
    activityLog = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderActivityLog();
  },
  err => console.warn('Could not sync activity log:', err.message)
);

const EMAIL_STATUS_LABELS = { sent: 'Sent', failed: 'Failed', disabled: 'Not sent (disabled)' };

function renderActivityLog() {
  activityEmpty.hidden = activityLog.length > 0;
  activityTableBody.innerHTML = activityLog.map(a => {
    const status = a.emailStatus || 'disabled';
    const title = status === 'failed' && a.emailError ? ` title="${a.emailError}"` : '';
    return `
    <tr>
      <td>${a.time || '—'}</td>
      <td>${a.section}</td>
      <td>${a.action}</td>
      <td>${a.summary}</td>
      <td>${a.by}</td>
      <td><span class="status-pill email-${status}"${title}>${EMAIL_STATUS_LABELS[status] || status}</span></td>
    </tr>
  `;
  }).join('');
}

const smtpForm = document.getElementById('smtpForm');
const smtpFormError = document.getElementById('smtpFormError');
const smtpFormSuccess = document.getElementById('smtpFormSuccess');

smtpForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  smtpFormSuccess.hidden = true;
  smtpFormError.hidden = true;

  const data = {
    enabled: document.getElementById('smtpEnabled').checked,
    accessKey: document.getElementById('smtpAccessKey').value.trim(),
  };

  try {
    await db.collection('settings').doc('smtp').set(data);
    emailSettings = data;
    smtpFormSuccess.textContent = 'Settings saved.';
    smtpFormSuccess.hidden = false;
  } catch (err) {
    smtpFormError.textContent = 'Failed to save: ' + err.message;
    smtpFormError.hidden = false;
  }
});

document.getElementById('smtpSendTest').addEventListener('click', async () => {
  smtpFormSuccess.hidden = true;
  smtpFormError.hidden = true;

  const accessKey = document.getElementById('smtpAccessKey').value.trim();

  try {
    await sendViaWeb3Forms(accessKey, 'Test', 'test', 'This is a test email from the Email Notifications page.');
    smtpFormSuccess.textContent = 'Test email sent — check the recipient inbox.';
    smtpFormSuccess.hidden = false;
  } catch (err) {
    smtpFormError.textContent = 'Could not send test email: ' + err.message;
    smtpFormError.hidden = false;
  }
});

// ---------- Render all ----------
function populateAllDropdowns() {
  populateBuildingOptionsRequired(flatBuildingSelect);
  populateBuildingOptions(flatBuildingFilter);
  populateBuildingOptions(expenseBuildingFilter);
  populateBuildingOptions(rentBuildingFilter);
  populateBuildingOptions(advanceBuildingFilter);

  populateBuildingOptions(expenseBuildingSelect);
  populateFlatOptions(expenseFlatSelect, expenseBuildingSelect.value || null);

  populateBuildingOptions(rentBuildingSelect);
  populateFlatOptions(rentFlatSelect, rentBuildingSelect.value || null);

  populateBuildingOptions(advanceBuildingSelect);
  populateFlatOptions(advanceFlatSelect, advanceBuildingSelect.value || null);
}

function renderAll() {
  populateAllDropdowns();
  renderBuildings();
  renderFlats();
  renderExpenses();
  renderRent();
  renderAdvance();
  renderDashboard();
  renderReport();
}

applyViewerLock();
