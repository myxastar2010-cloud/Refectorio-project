/**
 * A tiny key–value store over IndexedDB (ТЗ этапа 4 §5.2): one database, one object store, values structured-cloned as
 * they are. Where IndexedDB is missing or refused (blocked storage, some private windows) the values live in memory for
 * this visit: the page still works, and `durable: false` lets the notice say so.
 */
export type KeyValue = {
  readonly durable: boolean;
  get(key: string): Promise<unknown>;
  set(entries: Readonly<Record<string, unknown>>): Promise<void>;
  clear(): Promise<void>;
};

const STORE = 'kv';

function promised<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB request failed'));
    };
  });
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve();
    };
    transaction.onabort = transaction.onerror = () => {
      reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    };
  });
}

export function memoryStore(): KeyValue {
  const values = new Map<string, unknown>();
  return {
    durable: false,
    get: (key) => Promise.resolve(values.get(key)),
    set: (entries) => {
      for (const [key, value] of Object.entries(entries)) values.set(key, value);
      return Promise.resolve();
    },
    clear: () => {
      values.clear();
      return Promise.resolve();
    },
  };
}

/** Opens (or creates) the database; falls back to memory when IndexedDB is not available. */
export async function openStore(name: string): Promise<KeyValue> {
  if (typeof indexedDB === 'undefined') return memoryStore();
  try {
    const open = indexedDB.open(name, 1);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE);
    };
    const db = await promised(open);
    return {
      durable: true,
      get: (key) => promised(db.transaction(STORE, 'readonly').objectStore(STORE).get(key)),
      set: (entries) => {
        const transaction = db.transaction(STORE, 'readwrite');
        const store = transaction.objectStore(STORE);
        for (const [key, value] of Object.entries(entries)) store.put(value, key);
        return done(transaction);
      },
      clear: () => {
        const transaction = db.transaction(STORE, 'readwrite');
        transaction.objectStore(STORE).clear();
        return done(transaction);
      },
    };
  } catch {
    return memoryStore();
  }
}
