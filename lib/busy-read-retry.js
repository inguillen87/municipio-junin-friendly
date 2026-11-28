// Read-only GETs open many governed bootstraps at once (Calcular loads run, catalog, program and roster in
// parallel). Their SQL takes short NOWAIT/advisory locks for a consistent snapshot, so two concurrent reads of
// the same tenant can collide and the second fails fast with *_BUSY / lock_not_available. A read is idempotent:
// retry it briefly instead of showing "Preparación no verificada". Never used for POST/mutations.
const BUSY = /\b[A-Z][A-Z0-9_]*_BUSY\b|lock_not_available|could not obtain lock/;
export function isBusyError(error) {
  return error?.code === '55P03' || BUSY.test(String(error?.message ?? ''));
}
export function busyRetrySql(sql, { attempts = 5, baseMs = 120, jitterMs = 160, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  if (!sql || typeof sql.query !== 'function') return sql;
  return new Proxy(sql, {
    get(target, property, receiver) {
      if (property === 'query') return async (...args) => {
        for (let attempt = 1; ; attempt++) {
          try { return await target.query(...args); }
          catch (error) {
            if (attempt >= attempts || !isBusyError(error)) throw error;
            await sleep(baseMs * attempt + Math.floor(Math.random() * jitterMs));
          }
        }
      };
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
