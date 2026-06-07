import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

let db = null;

async function init() {
  const sqlite3 = await sqlite3InitModule({
    print: console.log,
    printErr: console.error,
  });

  if ('OpfsDb' in sqlite3.oo1) {
    db = new sqlite3.oo1.OpfsDb('/app.db');
    console.log('[sqlite-worker] Using OPFS persistent storage');
  } else {
    db = new sqlite3.oo1.DB('/app.db', 'ct');
    console.warn('[sqlite-worker] OPFS unavailable, using in-memory DB');
  }
}

const initPromise = init();

self.onmessage = async (event) => {
  await initPromise;
  const { id, type } = event.data;

  try {
    if (type === 'exec') {
      const { sql, params = [] } = event.data;
      const rows = [];
      db.exec({
        sql,
        bind: params,
        rowMode: 'array',
        callback: (row) => rows.push(row),
      });
      self.postMessage({ id, result: rows });
    } else if (type === 'export') {
      const byteArray = db.serialize();
      self.postMessage({ id, result: byteArray.buffer }, [byteArray.buffer]);
    } else if (type === 'import') {
      const { buffer } = event.data;
      db.close();
      const root = await navigator.storage.getDirectory();
      const fileHandle = await root.getFileHandle('app.db', { create: true });
      const writable = await fileHandle.createSyncAccessHandle();
      writable.truncate(0);
      writable.write(new Uint8Array(buffer));
      writable.flush();
      writable.close();
      const sqlite3 = await sqlite3InitModule({});
      db = new sqlite3.oo1.OpfsDb('/app.db');
      self.postMessage({ id, result: 'ok' });
    }
  } catch (err) {
    self.postMessage({ id, error: err.message });
  }
};
