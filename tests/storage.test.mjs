import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { emptyBook, emptyAsset, addAsset, addDocument } from '../src/domain.mjs';
import { createAttachment } from '../src/attachments.mjs';
import { ConflictError, StorageError, openBookStore } from '../src/storage.mjs';

async function openStore(t, indexedDB = new IDBFactory(), dbName = 'inventory') {
  const store = await openBookStore({ indexedDB, dbName });
  t.after(() => store.close());
  return store;
}

function openRaw(indexedDB, dbName = 'inventory', version) {
  return new Promise((resolve, reject) => {
    const request = version === undefined ? indexedDB.open(dbName) : indexedDB.open(dbName, version);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function rawTransaction(indexedDB, mode, callback, dbName = 'inventory') {
  const db = await openRaw(indexedDB, dbName);
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(db.objectStoreNames[0], mode);
      let result;
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(transaction.error);
      callback(transaction.objectStore(db.objectStoreNames[0]), (value) => { result = value; });
    });
  } finally {
    db.close();
  }
}

async function persistedRecords(indexedDB, dbName) {
  return rawTransaction(indexedDB, 'readonly', (store, done) => {
    store.getAll().onsuccess = (event) => done(event.target.result);
  }, dbName);
}

async function replaceStoredRecord(indexedDB, replace) {
  await rawTransaction(indexedDB, 'readwrite', (store) => {
    store.openCursor().onsuccess = (event) => {
      const cursor = event.target.result;
      assert.ok(cursor);
      cursor.update(replace(cursor.value));
    };
  });
}

async function bookWithDocument() {
  const attachment = await createAttachment({
    id: 'document-1', fileName: 'comprovante.pdf', mimeType: 'application/pdf',
    bytes: new TextEncoder().encode('%PDF-1.7\n%%EOF\n'),
  });
  const asset = emptyAsset('asset-1');
  asset.name = 'Bem fictício';
  return addDocument(addAsset(emptyBook('book-1'), asset), 'asset-1', attachment);
}

test('opening and loading an absent inventory does not write a document', async (t) => {
  const indexedDB = new IDBFactory();
  const store = await openStore(t, indexedDB);
  assert.deepEqual(await store.load(), { revision: 0, book: null });
  assert.deepEqual(await store.load(), { revision: 0, book: null });
  assert.deepEqual(await persistedRecords(indexedDB), []);
});

test('verified inventory persists across connections and returned books are independent copies', async (t) => {
  const indexedDB = new IDBFactory();
  const store = await openStore(t, indexedDB);
  const book = await bookWithDocument();
  const original = structuredClone(book);
  const saved = await store.save(book, 0);
  assert.deepEqual(book, original);
  assert.equal(saved.revision, 1);
  book.assets[0].name = 'Changed caller input';
  saved.book.assets[0].documents[0].fileName = 'changed-return.pdf';
  const loaded = await store.load();
  assert.deepEqual(loaded, { revision: 1, book: original });
  loaded.book.assets[0].documents.length = 0;
  assert.deepEqual(await store.load(), { revision: 1, book: original });
  store.close();
  const reopened = await openStore(t, indexedDB);
  assert.deepEqual(await reopened.load(), { revision: 1, book: original });
});

test('two connections saving the same revision have exactly one winner', async (t) => {
  const indexedDB = new IDBFactory();
  const first = await openStore(t, indexedDB);
  const second = await openStore(t, indexedDB);
  const a = emptyBook('book-a');
  const b = emptyBook('book-b');
  const outcomes = await Promise.allSettled([first.save(a, 0), second.save(b, 0)]);
  assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1);
  const conflict = outcomes.find((result) => result.status === 'rejected').reason;
  assert.ok(conflict instanceof ConflictError);
  assert.equal(conflict.expectedRevision, 0);
  assert.equal(conflict.actualRevision, 1);
  const winner = outcomes.find((result) => result.status === 'fulfilled').value;
  assert.deepEqual(await first.load(), winner);
  assert.deepEqual(await second.load(), winner);
});

test('a stale clear preserves a newer saved inventory', async (t) => {
  const indexedDB = new IDBFactory();
  const first = await openStore(t, indexedDB);
  const second = await openStore(t, indexedDB);
  const saved = await first.save(emptyBook('book-1'), 0);
  await assert.rejects(second.clear(0), (error) => error instanceof ConflictError
    && error.expectedRevision === 0 && error.actualRevision === 1);
  assert.deepEqual(await second.load(), saved);
});

test('clear persists a growing tombstone and prevents ABA after reopening', async (t) => {
  const indexedDB = new IDBFactory();
  const first = await openStore(t, indexedDB);
  await first.save(emptyBook('first'), 0);
  assert.deepEqual(await first.clear(1), { revision: 2, book: null });
  first.close();
  const reopened = await openStore(t, indexedDB);
  assert.deepEqual(await reopened.load(), { revision: 2, book: null });
  assert.deepEqual(await persistedRecords(indexedDB), [{ revision: 2, book: null }]);
  await assert.rejects(reopened.save(emptyBook('stale'), 0), (error) => error instanceof ConflictError
    && error.actualRevision === 2);
  assert.equal((await reopened.save(emptyBook('new'), 2)).revision, 3);
  assert.deepEqual(await reopened.clear(3), { revision: 4, book: null });
  assert.deepEqual(await reopened.clear(4), { revision: 5, book: null });
});

test('clearing an initially absent inventory also retains its revision', async (t) => {
  const store = await openStore(t);
  assert.deepEqual(await store.clear(0), { revision: 1, book: null });
  await assert.rejects(store.save(emptyBook('old'), 0), (error) => error instanceof ConflictError
    && error.actualRevision === 1);
});

test('clear leaves other databases and unrelated keys untouched', async (t) => {
  const indexedDB = new IDBFactory();
  const store = await openStore(t, indexedDB);
  const other = await openStore(t, indexedDB, 'another-application');
  const otherValue = await other.save(emptyBook('other'), 0);
  await store.save(emptyBook('own'), 0);
  await rawTransaction(indexedDB, 'readwrite', (objectStore) => objectStore.put('unrelated', 'other-key'));
  await store.clear(1);
  assert.deepEqual(await other.load(), otherValue);
  const records = await persistedRecords(indexedDB);
  assert.ok(records.includes('unrelated'));
  assert.ok(records.some((record) => record?.revision === 2 && record.book === null));
});

test('tampered attachments are refused before opening a write transaction and preserve the saved book', async (t) => {
  const indexedDB = new IDBFactory();
  let writeTransactions = 0;
  const observedFactory = instrumentFactory(indexedDB, (db) => {
    const transaction = db.transaction.bind(db);
    db.transaction = (...args) => {
      if (args[1] === 'readwrite') writeTransactions += 1;
      return transaction(...args);
    };
  });
  const store = await openStore(t, observedFactory);
  const saved = await store.save(emptyBook('saved'), 0);
  const tampered = await bookWithDocument();
  tampered.assets[0].documents[0].sha256 = '0'.repeat(64);
  const before = writeTransactions;
  await assert.rejects(store.save(tampered, 1));
  assert.equal(writeTransactions, before);
  assert.deepEqual(await store.load(), saved);
});

test('load refuses corrupted stored attachment content without exposing private values', async (t) => {
  const indexedDB = new IDBFactory();
  const store = await openStore(t, indexedDB);
  const book = await bookWithDocument();
  book.title = 'private-purchase-secret';
  await store.save(book, 0);
  await replaceStoredRecord(indexedDB, (record) => {
    record.book.assets[0].documents[0].sha256 = '0'.repeat(64);
    return record;
  });
  await assert.rejects(store.load(), (error) => error instanceof StorageError
    && error.code === 'corrupt' && !String(error).includes(book.title)
    && !JSON.stringify(error).includes(book.title) && !Object.hasOwn(error, 'cause'));
  const [record] = await persistedRecords(indexedDB);
  assert.equal(record.book.assets[0].documents[0].sha256, '0'.repeat(64));
});

test('invalid stored revisions and exhausted safe integers never become revision zero', async (t) => {
  const indexedDB = new IDBFactory();
  const store = await openStore(t, indexedDB);
  await store.save(emptyBook('first'), 0);
  await replaceStoredRecord(indexedDB, () => ({ revision: -1, book: null }));
  await assert.rejects(store.load(), { code: 'corrupt' });
  await assert.rejects(store.clear(0), { code: 'corrupt' });
  await replaceStoredRecord(indexedDB, () => ({ revision: Number.MAX_SAFE_INTEGER, book: null }));
  await assert.rejects(store.clear(Number.MAX_SAFE_INTEGER), { code: 'revision' });
  await assert.rejects(store.save(emptyBook('next'), Number.MAX_SAFE_INTEGER), { code: 'revision' });
  assert.deepEqual(await store.load(), { revision: Number.MAX_SAFE_INTEGER, book: null });
});

test('invalid expected revisions are refused without changing storage', async (t) => {
  const store = await openStore(t);
  for (const revision of [-1, 0.5, NaN, Infinity, '0', Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(store.save(emptyBook('book'), revision), { code: 'revision' });
    await assert.rejects(store.clear(revision), { code: 'revision' });
  }
  assert.deepEqual(await store.load(), { revision: 0, book: null });
});

function instrumentFactory(indexedDB, patchConnection) {
  return {
    open(...args) {
      const request = indexedDB.open(...args);
      request.addEventListener('success', () => patchConnection(request.result));
      return request;
    },
  };
}

test('a write request success followed by transaction abort rejects and rolls back', async (t) => {
  const indexedDB = new IDBFactory();
  let abortNextWrite = false;
  let putSucceeded = false;
  const instrumented = instrumentFactory(indexedDB, (db) => {
    const originalTransaction = db.transaction.bind(db);
    db.transaction = (...args) => {
      const transaction = originalTransaction(...args);
      if (args[1] !== 'readwrite' || !abortNextWrite) return transaction;
      abortNextWrite = false;
      const objectStore = transaction.objectStore.bind(transaction);
      transaction.objectStore = (name) => {
        const store = objectStore(name);
        const put = store.put.bind(store);
        store.put = (...putArgs) => {
          const request = put(...putArgs);
          request.addEventListener('success', () => {
            putSucceeded = true;
            transaction.abort();
          });
          return request;
        };
        return store;
      };
      return transaction;
    };
  });
  const store = await openStore(t, instrumented);
  const original = await store.save(emptyBook('original'), 0);
  abortNextWrite = true;
  await assert.rejects(store.save(emptyBook('rejected'), 1), { code: 'abort' });
  assert.equal(putSucceeded, true);
  assert.deepEqual(await store.load(), original);
});

test('a read request success followed by transaction abort never returns the private book', async (t) => {
  const indexedDB = new IDBFactory();
  let abortNextRead = false;
  let readSucceeded = false;
  const instrumented = instrumentFactory(indexedDB, (db) => {
    const originalTransaction = db.transaction.bind(db);
    db.transaction = (...args) => {
      const transaction = originalTransaction(...args);
      if (args[1] !== 'readonly' || !abortNextRead) return transaction;
      abortNextRead = false;
      const objectStore = transaction.objectStore.bind(transaction);
      transaction.objectStore = (name) => {
        const store = objectStore(name);
        const get = store.get.bind(store);
        store.get = (...getArgs) => {
          const request = get(...getArgs);
          request.addEventListener('success', () => {
            readSucceeded = true;
            transaction.abort();
          });
          return request;
        };
        return store;
      };
      return transaction;
    };
  });
  const store = await openStore(t, instrumented);
  const original = await store.save(emptyBook('private-book'), 0);
  abortNextRead = true;
  await assert.rejects(store.load(), (error) => error instanceof StorageError
    && error.code === 'abort' && !JSON.stringify(error).includes('private-book'));
  assert.equal(readSucceeded, true);
  assert.deepEqual(await store.load(), original);
});

test('quota failures expose a fixed error and do not overwrite the previous inventory', async (t) => {
  const indexedDB = new IDBFactory();
  let quotaNextWrite = false;
  const instrumented = instrumentFactory(indexedDB, (db) => {
    const originalTransaction = db.transaction.bind(db);
    db.transaction = (...args) => {
      const transaction = originalTransaction(...args);
      if (args[1] !== 'readwrite' || !quotaNextWrite) return transaction;
      quotaNextWrite = false;
      const objectStore = transaction.objectStore.bind(transaction);
      transaction.objectStore = (name) => {
        const store = objectStore(name);
        store.put = () => { throw new DOMException('private-purchase-secret', 'QuotaExceededError'); };
        return store;
      };
      return transaction;
    };
  });
  const store = await openStore(t, instrumented);
  const original = await store.save(emptyBook('original'), 0);
  quotaNextWrite = true;
  await assert.rejects(store.save(emptyBook('rejected'), 1), (error) => error instanceof StorageError
    && error.code === 'quota' && !String(error).includes('private-purchase-secret'));
  assert.deepEqual(await store.load(), original);
});

test('version changes close only this adapter and produce an explicit stale-connection error', async (t) => {
  const indexedDB = new IDBFactory();
  const store = await openStore(t, indexedDB);
  await store.save(emptyBook('book'), 0);
  const upgraded = await openRaw(indexedDB, 'inventory', 2);
  t.after(() => upgraded.close());
  await assert.rejects(store.load(), { code: 'versionchange' });
  await assert.rejects(store.clear(1), { code: 'versionchange' });
  await assert.rejects(openBookStore({ indexedDB, dbName: 'inventory' }), { code: 'versionchange' });
});

test('closed and unavailable stores fail explicitly without a memory fallback', async (t) => {
  await assert.rejects(openBookStore({ indexedDB: null }), { code: 'unavailable' });
  await assert.rejects(openBookStore({ indexedDB: { open() { throw new DOMException('secret', 'SecurityError'); } } }),
    { code: 'unavailable' });
  const store = await openStore(t);
  store.close();
  store.close();
  await assert.rejects(store.load(), { code: 'closed' });
  await assert.rejects(store.save(emptyBook('book'), 0), { code: 'closed' });
  await assert.rejects(store.clear(0), { code: 'closed' });
});
