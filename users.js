function loadUsersOnce() {
  return db.collection('users').get().then(snap => {
    if (!snap.empty) return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const seedAdmin = { username: 'admin', password: 'admin123', name: 'Administrator', role: 'admin' };
    return db.collection('users').doc('admin').set(seedAdmin).then(() => [{ id: 'admin', ...seedAdmin }]);
  });
}

function watchUsers(callback) {
  return db.collection('users').onSnapshot(snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

function addUser(user) {
  return db.collection('users').add(user);
}

function updateUser(id, data) {
  return db.collection('users').doc(id).update(data);
}

function deleteUser(id) {
  return db.collection('users').doc(id).delete();
}
