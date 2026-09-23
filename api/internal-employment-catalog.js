import { requireCompatibleInternalAccess } from '../lib/internal-access-gateway.js';
import { actionMutationSession, getActionCenterSql } from './internal-actions.js';
import { principalHasCapabilities } from '../lib/internal-resource-access.js';
import { schoolCertificateHttp } from './internal-family-certificates.js';
import { schoolCertificateSafeError } from '../lib/internal-family-certificates.js';
import { EMPLOYMENT_CATALOG_MAX_BYTES, EMPLOYMENT_CATALOG_READ, EMPLOYMENT_CATALOG_CAPS, catalogFail, employmentCatalogError, employmentCatalogOperation } from '../lib/internal-employment-catalog.js';
export const config = {api: {bodyParser: false}};

// Duplicate names are rejected within each object, while repeated row fields in
// separate array entries are expected. JSON.parse remains the grammar validator.
export function parseCatalogJson(source) {
  try {
    const parsed = JSON.parse(source), stack = [];
    for (let i = 0; i < source.length; i++) {
      if (source[i] === '"') {
        const start = i++;
        for (; i < source.length && source[i] !== '"'; i++) if (source[i] === '\\') i++;
        let next = i + 1; while (/\s/.test(source[next] ?? '') && next < source.length) next++;
        if (source[next] === ':') {
          const key = JSON.parse(source.slice(start, i + 1)), seen = stack.at(-1);
          if (!(seen instanceof Set) || seen.has(key)) throw Error();
          seen.add(key);
        }
      } else if (source[i] === '{' || source[i] === '[') { stack.push(source[i] === '{' ? new Set() : null); if (stack.length > 8) throw Error(); }
      else if (source[i] === '}' || source[i] === ']') stack.pop();
    }
    return parsed;
  } catch { catalogFail('INPUT_INVALID', 400, 'El formulario contiene datos ambiguos o inválidos.'); }
}
function streamBytes(req, timeoutMs) {
  return new Promise((resolve, reject) => {
    const chunks = [], listeners = []; let size = 0, settled = false, iterator;
    const finish = error => {
      if (settled) return; settled = true; clearTimeout(timer);
      for (const [emitter, event, listener] of listeners) emitter?.removeListener?.(event, listener);
      if (error) { chunks.length = 0; if (iterator?.return) Promise.resolve().then(() => iterator.return()).catch(() => {}); reject(error); }
      else resolve(Buffer.concat(chunks, size));
    };
    const failure = (code, status, message) => { try { catalogFail(code, status, message); } catch (error) { finish(error); } };
    const unavailable = () => failure('UNAVAILABLE', 503, 'No se pudo leer el envío completo. Reintentá el mismo contenido.');
    const timer = setTimeout(unavailable, timeoutMs);
    const accept = chunk => {
      if (settled) return;
      if (!Buffer.isBuffer(chunk) && !(chunk instanceof Uint8Array)) return failure('INPUT_INVALID', 400, 'El envío perdió sus bytes originales.');
      size += chunk.byteLength;
      if (size > EMPLOYMENT_CATALOG_MAX_BYTES) return failure('LIMIT', 413, 'El formulario supera el tamaño permitido.');
      chunks.push(Buffer.from(chunk));
    };
    try {
      if (req.aborted) return unavailable();
      if (typeof req.on === 'function' && typeof req.read === 'function') {
        // Vercel restores the original bytes through data/end on a returned
        // emitter. Its lazy body getter would erase duplicate JSON names.
        for (const [event, listener] of [['end', () => finish()], ['error', unavailable], ['aborted', unavailable], ['close', () => { if (!req.complete) unavailable(); }], ['data', accept]]) {
          const emitter = req.on(event, listener); listeners.push([emitter, event, listener]);
        }
      } else {
        iterator = req[Symbol.asyncIterator]();
        (async () => { while (!settled) { const next = await iterator.next(); if (settled) return; if (next.done) return finish(); accept(next.value); } })().catch(unavailable);
      }
    } catch { unavailable(); }
  });
}
export async function readCatalogBody(req, {timeoutMs = 10000} = {}) {
  schoolCertificateHttp.checkLength(req, EMPLOYMENT_CATALOG_MAX_BYTES);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) catalogFail('INPUT_INVALID', 400, 'Tiempo de lectura inválido.');
  let bytes = typeof req.on === 'function' && typeof req.read === 'function' || typeof req[Symbol.asyncIterator] === 'function'
    ? await streamBytes(req, timeoutMs) : Object.getOwnPropertyDescriptor(req, 'body')?.value;
  if (typeof bytes === 'string') bytes = Buffer.from(bytes);
  if (!Buffer.isBuffer(bytes)) catalogFail('INPUT_INVALID', 400, 'Se requieren los bytes originales del formulario.');
  if (bytes.length > EMPLOYMENT_CATALOG_MAX_BYTES) catalogFail('LIMIT', 413, 'El formulario supera el tamaño permitido.');
  const length = schoolCertificateHttp.header(req, 'content-length');
  if (length && Number(length) !== bytes.length) catalogFail('INPUT_INVALID', 400, 'El envío está incompleto.');
  let source; try { source = new TextDecoder('utf-8', {fatal: true}).decode(bytes); } catch { catalogFail('INPUT_INVALID', 400, 'El formulario no contiene texto válido.'); }
  const value = parseCatalogJson(source);
  if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).sort().join('|') !== 'operation|payload'
    || !Object.hasOwn(EMPLOYMENT_CATALOG_CAPS, value.operation)) catalogFail('INPUT_INVALID', 400, 'Operación o formulario no admitidos.');
  if (Buffer.byteLength(JSON.stringify(value)) > EMPLOYMENT_CATALOG_MAX_BYTES) catalogFail('LIMIT', 413, 'El formulario supera el tamaño permitido.');
  return value;
}
export function createEmploymentCatalogHandler(deps = {}) {
  const env = deps.env ?? process.env, authorize = deps.requireAccess ?? requireCompatibleInternalAccess, getSql = deps.getSql ?? getActionCenterSql, sessionFor = deps.sessionFor ?? actionMutationSession;
  return async (req, res) => {
    schoolCertificateHttp.headers(res);
    try {
      const method = req.method || 'GET';
      if (!['GET', 'POST'].includes(method)) { res.setHeader('Allow', 'GET, POST'); catalogFail('METHOD_INVALID', 405, 'Método no admitido.'); }
      const q = req.query ?? {};
      if (!q || typeof q !== 'object' || Array.isArray(q) || Object.values(q).some(v => typeof v !== 'string')) catalogFail('QUERY_INVALID', 400, 'Consulta inválida.');
      if (req.url) {
        const entries = [...new URL(req.url, 'http://local.invalid').searchParams];
        if (entries.length !== Object.keys(q).length || entries.some(([k, v]) => q[k] !== v) || new Set(entries.map(([k]) => k)).size !== entries.length) catalogFail('QUERY_INVALID', 400, 'Consulta ambigua.');
      }
      let operation, input;
      if (method === 'POST') {
        if (Object.keys(q).length) catalogFail('QUERY_INVALID', 400, 'No se admiten parámetros en la operación.');
        schoolCertificateHttp.assertOrigin(req, env);
        if (schoolCertificateHttp.header(req, 'content-type').split(';')[0].trim().toLowerCase() !== 'application/json') catalogFail('CONTENT_TYPE', 415, 'Se requiere un formulario JSON.');
        schoolCertificateHttp.checkLength(req, EMPLOYMENT_CATALOG_MAX_BYTES);
      } else if (q.resource === 'bootstrap' && Object.keys(q).length === 1) { operation = 'bootstrap'; input = {}; }
      else if (q.resource === 'proposal' && Object.keys(q).sort().join('|') === 'id|resource') { operation = 'proposal'; input = {id: q.id}; }
      else if (q.resource === 'attempt' && Object.keys(q).sort().join('|') === 'key|resource') { operation = 'attempt'; input = {key: q.key}; }
      else catalogFail('QUERY_INVALID', 400, 'Consulta inválida.');
      const access = await authorize(req, res, {env, requiredCapabilities: [EMPLOYMENT_CATALOG_READ], capabilityMode: 'all', requireDataPlaneReady: true, requireCertifiedDataBinding: true, allowLegacy: false});
      if (!access) return;
      if (access.mode !== 'managed' || access.principal?.tenant?.source !== 'membership' || !principalHasCapabilities(access.principal, [EMPLOYMENT_CATALOG_READ])) catalogFail('FORBIDDEN', 403, 'La membresía no permite consultar este catálogo.');
      if (method === 'POST') {
        const body = await readCatalogBody(req); operation = body.operation;
        if (!principalHasCapabilities(access.principal, [EMPLOYMENT_CATALOG_CAPS[operation]])) catalogFail('FORBIDDEN', 403, 'La membresía no permite esta operación sobre el catálogo.');
        input = {body: body.payload, key: schoolCertificateHttp.header(req, 'idempotency-key')};
      }
      const data = await employmentCatalogOperation(await getSql(env), access.principal, sessionFor(access, env), operation, input);
      if (data.replayed) res.setHeader('Idempotency-Replayed', 'true');
      return res.status(method === 'POST' && !data.replayed ? 201 : 200).json({ok: true, data});
    } catch (error) {
      const safe = String(error?.code || '').startsWith('SCHOOL_CERTIFICATE_') ? schoolCertificateSafeError(error) : employmentCatalogError(error);
      return res.status(safe.status).json({ok: false, code: safe.code, error: safe.message});
    }
  };
}
export default createEmploymentCatalogHandler();
