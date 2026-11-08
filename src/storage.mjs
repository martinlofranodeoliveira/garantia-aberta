import { verifyBook } from './attachments.mjs';

const DATABASE_VERSION = 1;
const STORE_NAME = 'book';
const BOOK_KEY = 'current';
const DEFAULT_DATABASE_NAME = 'lofrano-garantia-aberta-v1';

const MESSAGES = Object.freeze({
  unavailable: 'O salvamento local não está disponível.',
  blocked: 'Outra conexão está impedindo a abertura do salvamento local.',
  versionchange: 'O banco local mudou de versão. Abra uma nova conexão.',
  closed: 'A conexão com o salvamento local está fechada.',
  corrupt: 'O registro local não passou pela verificação de integridade.',
  quota: 'Não há espaço disponível para salvar o inventário.',
  abort: 'A operação de salvamento local foi interrompida.',
  revision: 'A revisão do salvamento local não é válida.',
  transaction: 'Não foi possível concluir a operação no salvamento local.',
  open: 'Não foi possível abrir o salvamento local.',
});

export class StorageError extends Error {
  constructor(code = 'transaction') {
    const safeCode = Object.hasOwn(MESSAGES, code) ? code : 'transaction';
    super(MESSAGES[safeCode]);
    this.name = 'StorageError';
    this.code = safeCode;
  }
}

export class ConflictError extends Error {
  constructor(expectedRevision, actualRevision) {
    super('O inventário local mudou. Recarregue antes de salvar.');
    this.name = 'ConflictError';
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

function storageError(error, fallback = 'transaction') {
  if (error instanceof StorageError || error instanceof ConflictError) return error;
  // Never copy a browser exception's message, cause or record into public errors.
  switch (error?.name) {
    case 'QuotaExceededError': return new StorageError('quota');
    case 'AbortError': return new StorageError('abort');
    case 'SecurityError':
    case 'NotSupportedError': return new StorageError('unavailable');
    case 'VersionError': return new StorageError('versionchange');
    default: return new StorageError(fallback);
  }
}

function checkExpectedRevision(revision) {
  if (!Number.isSafeInteger(revision) || revision < 0) throw new StorageError('revision');
}

function readRecord(value) {
  if (value === undefined) return { revision: 0, book: null };
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== 2
      || !Object.hasOwn(value, 'revision') || !Object.hasOwn(value, 'book')
      || !Number.isSafeInteger(value.revision) || value.revision < 1
      || (value.book !== null && (typeof value.book !== 'object' || Array.isArray(value.book)))) {
    throw new StorageError('corrupt');
  }
  return value;
}

/** Open only this application's database; no inventory is written by opening it. */
export async function openBookStore({ indexedDB = globalThis.indexedDB, dbName = DEFAULT_DATABASE_NAME } = {}) {
  if (!indexedDB || typeof indexedDB.open !== 'function') throw new StorageError('unavailable');
  if (typeof dbName !== 'string' || !dbName) throw new StorageError('open');

  const db = await new Promise((resolve, reject) => {
    let request;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    try {
      request = indexedDB.open(dbName, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        try {
          // A blocked request may finish later; do not leave a rejected connection open.
          if (settled) {
            request.transaction.abort();
            return;
          }
          if (!request.result.objectStoreNames.contains(STORE_NAME)) {
            request.result.createObjectStore(STORE_NAME);
          }
        } catch (error) {
          fail(storageError(error, 'open'));
          try { request.transaction.abort(); } catch { /* Already inactive. */ }
        }
      };
      request.onerror = () => fail(storageError(request.error, 'open'));
      request.onblocked = () => fail(new StorageError('blocked'));
      request.onsuccess = () => {
        const connection = request.result;
        if (settled) {
          connection.close();
          return;
        }
        if (!connection.objectStoreNames.contains(STORE_NAME)) {
          connection.close();
          fail(new StorageError('corrupt'));
          return;
        }
        settled = true;
        resolve(connection);
      };
    } catch (error) {
      fail(storageError(error, 'open'));
    }
  });

  let state = 'open';
  db.onversionchange = () => {
    state = 'versionchange';
    db.close();
  };
  db.onclose = () => {
    if (state === 'open') state = 'unavailable';
  };

  function ensureOpen() {
    if (state !== 'open') throw new StorageError(state);
  }

  function transact(mode, modify) {
    return new Promise((resolve, reject) => {
      let transaction;
      let result;
      let failure;
      try {
        ensureOpen();
        transaction = db.transaction(STORE_NAME, mode);
        transaction.oncomplete = () => resolve(result);
        // A successful request is not a committed transaction. Abort/error must win.
        transaction.onabort = () => reject(failure || storageError(transaction.error, 'abort'));
        transaction.onerror = (event) => {
          failure ||= storageError(event.target?.error || transaction.error);
        };
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(BOOK_KEY);
        request.onerror = () => { failure = storageError(request.error); };
        request.onsuccess = () => {
          try {
            const current = readRecord(request.result);
            result = modify ? modify(current, store) : current;
          } catch (error) {
            failure = storageError(error);
            transaction.abort();
          }
        };
      } catch (error) {
        failure = storageError(error);
        if (transaction) {
          try { transaction.abort(); } catch { reject(failure); }
        } else {
          reject(failure);
        }
      }
    });
  }

  function write(book, expectedRevision) {
    return transact('readwrite', (current, store) => {
      if (current.revision !== expectedRevision) {
        throw new ConflictError(expectedRevision, current.revision);
      }
      if (current.revision === Number.MAX_SAFE_INTEGER) throw new StorageError('revision');
      const next = { revision: current.revision + 1, book };
      // Keep comparison and put synchronous inside the active request callback.
      const request = store.put(next, BOOK_KEY);
      request.onerror = () => { /* The transaction's error handler records the failure. */ };
      return next;
    });
  }

  return Object.freeze({
    async load() {
      const record = await transact('readonly');
      if (record.book === null) return { revision: record.revision, book: null };
      try {
        return { revision: record.revision, book: await verifyBook(record.book) };
      } catch {
        throw new StorageError('corrupt');
      }
    },
    async save(book, expectedRevision) {
      ensureOpen();
      checkExpectedRevision(expectedRevision);
      // Web Crypto is asynchronous; finish it before opening an IndexedDB transaction.
      const verifiedBook = await verifyBook(book);
      return write(verifiedBook, expectedRevision);
    },
    async clear(expectedRevision) {
      ensureOpen();
      checkExpectedRevision(expectedRevision);
      // A tombstone preserves the revision even when there is no inventory.
      return write(null, expectedRevision);
    },
    close() {
      if (state === 'open') {
        state = 'closed';
        db.close();
      }
    },
  });
}
