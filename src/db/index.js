const worker = new Worker(
  new URL('../workers/sqlite.worker.js', import.meta.url),
  { type: 'module' },
);

let callId = 0;
const pending = new Map();

worker.onmessage = (event) => {
  const { id, result, error } = event.data;
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  error ? p.reject(new Error(error)) : p.resolve(result);
};

function call(message, transfer = []) {
  const id = ++callId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, ...message }, transfer);
  });
}

export const db = {
  exec(sql, params) {
    return call({ type: 'exec', sql, params });
  },
  async exportBlob() {
    const buffer = await call({ type: 'export' });
    return new Blob([buffer], { type: 'application/octet-stream' });
  },
  async importBuffer(buffer) {
    await call({ type: 'import', buffer }, [buffer]);
  },
};
