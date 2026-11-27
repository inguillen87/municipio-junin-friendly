// Varias personas trabajando a la vez: las funciones de la base toman un candado por municipio y, si otra consulta lo
// tiene, responden de inmediato «…_BUSY» en vez de esperar. Cada consulta HTTP es una transacción propia, así que un
// «…_BUSY» no dejó nada escrito y repetirla es seguro. Se reintenta con espera creciente dentro de un presupuesto
// acotado; agotado, el error original sigue su camino y la pantalla lo informa como siempre.
const BUSY = /\b[A-Z][A-Z0-9_]*_BUSY\b/;
const INSTALLED = Symbol.for('municontrol.sqlBusyRetry');
export const sqlBusyRetryDefaults = Object.freeze({ attempts: 14, baseMs: 90, capMs: 900, budgetMs: 8000 });
export const isBusyError = error => BUSY.test(String(error?.message ?? '')) || BUSY.test(String(error?.code ?? ''));

export function busyRetrying(run, options = {}) {
  const { attempts, baseMs, capMs, budgetMs } = { ...sqlBusyRetryDefaults, ...options };
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const random = options.random ?? Math.random;
  const now = options.now ?? Date.now;
  return async function retried(...args) {
    const started = now();
    for (let attempt = 1; ; attempt += 1) {
      try { return await run.apply(this, args); } catch (error) {
        if (!isBusyError(error) || attempt >= attempts) throw error;
        // Espera creciente con azar, para que dos personas que chocaron no vuelvan a chocar en el mismo instante.
        const wait = Math.round(Math.min(capMs, baseMs * 2 ** (attempt - 1)) * (0.5 + random() / 2));
        if (now() - started + wait > budgetMs) throw error;
        await sleep(wait);
      }
    }
  };
}

// Instala el reintento sobre el mismo cliente (no lo envuelve): otras piezas lo reconocen por identidad.
export function installSqlBusyRetry(sql, options = {}) {
  if (!sql || typeof sql.query !== 'function' || sql[INSTALLED]) return sql;
  const original = sql.query;
  sql.query = busyRetrying(function query(...args) { return original.apply(sql, args); }, options);
  Object.defineProperty(sql, INSTALLED, { value: true });
  return sql;
}
