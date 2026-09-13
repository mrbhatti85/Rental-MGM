function loadUsersOnce() {
  return db.collection('users').get().then(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })));
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
