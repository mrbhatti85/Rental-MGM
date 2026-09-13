(function () {
  const STORAGE_PREFIX = 'rms_local_store_';

  function readStore() {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + 'root');
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      return {};
    }
  }

  function writeStore(store) {
    localStorage.setItem(STORAGE_PREFIX + 'root', JSON.stringify(store));
  }

  function readCollection(name) {
    const store = readStore();
    return Array.isArray(store[name]) ? store[name] : [];
  }

  function writeCollection(name, items) {
    const store = readStore();
    store[name] = items;
    writeStore(store);
  }

  function makeId() {
    return 'doc_' + Date.now() + '_' + Math.random().toString(16).slice(2, 10);
  }

  function buildSnapshot(item) {
    return {
      id: item.id,
      exists: true,
      data: () => ({ ...item }),
    };
  }

  function ensureSeedData() {
    const store = readStore();
    if (!store.users || !store.users.length) {
      store.users = [{
        id: 'admin',
        username: 'admin',
        password: 'admin123',
        name: 'Administrator',
        role: 'admin',
      }];
    }
    if (!store.settings) store.settings = [];
    writeStore(store);
  }

  function createDoc(name, id) {
    const doc = {
      _collectionName: name,
      _id: id,
      get() {
        const items = readCollection(name);
        const item = items.find(entry => entry.id === id);
        return Promise.resolve(item ? buildSnapshot(item) : { exists: false, data: () => undefined });
      },
      set(data) {
        const items = readCollection(name);
        const index = items.findIndex(entry => entry.id === id);
        const item = { ...(data || {}), id };
        if (index >= 0) items[index] = item;
        else items.push(item);
        writeCollection(name, items);
        return Promise.resolve({ id });
      },
      update(data) {
        const items = readCollection(name);
        const index = items.findIndex(entry => entry.id === id);
        const item = index >= 0 ? { ...items[index], ...(data || {}), id } : { ...(data || {}), id };
        if (index >= 0) items[index] = item;
        else items.push(item);
        writeCollection(name, items);
        return Promise.resolve({ id });
      },
      delete() {
        const items = readCollection(name).filter(entry => entry.id !== id);
        writeCollection(name, items);
        return Promise.resolve();
      },
    };
    return doc;
  }

  function createCollection(name) {
    const collection = {
      get() {
        const items = readCollection(name);
        return Promise.resolve({
          empty: items.length === 0,
          docs: items.map(item => buildSnapshot(item)),
        });
      },
      add(data) {
        const items = readCollection(name);
        const item = { ...(data || {}), id: data && data.id ? data.id : makeId() };
        items.push(item);
        writeCollection(name, items);
        return Promise.resolve({ id: item.id });
      },
      doc(id) {
        return createDoc(name, id);
      },
      onSnapshot(next, onError) {
        try {
          const items = readCollection(name);
          next({
            empty: items.length === 0,
            docs: items.map(item => buildSnapshot(item)),
          });
        } catch (err) {
          if (onError) onError(err);
        }
        return () => {};
      },
      orderBy() { return this; },
      limit() { return this; },
      where() { return this; },
      select() { return this; },
    };
    return collection;
  }

  function createBatch() {
    return {
      _ops: [],
      delete(ref) {
        this._ops.push({ type: 'delete', collection: ref._collectionName, id: ref._id });
        return this;
      },
      set(ref, data) {
        this._ops.push({ type: 'set', collection: ref._collectionName, id: ref._id, data });
        return this;
      },
      commit() {
        const store = readStore();
        this._ops.forEach(op => {
          const list = Array.isArray(store[op.collection]) ? store[op.collection] : [];
          if (op.type === 'delete') {
            store[op.collection] = list.filter(entry => entry.id !== op.id);
          } else if (op.type === 'set') {
            const idx = list.findIndex(entry => entry.id === op.id);
            const item = { ...(op.data || {}), id: op.id };
            if (idx >= 0) list[idx] = item;
            else list.push(item);
            store[op.collection] = list;
          }
        });
        writeStore(store);
        return Promise.resolve();
      },
    };
  }

  if (typeof window !== 'undefined') {
    window.firebase = {
      firestore: {
        FieldValue: {
          serverTimestamp: () => new Date().toISOString(),
        },
      },
    };
  }

  ensureSeedData();

  const db = {
    collection(name) {
      return createCollection(name);
    },
    batch() {
      return createBatch();
    },
  };

  if (typeof window !== 'undefined') {
    window.db = db;
  }
})();
