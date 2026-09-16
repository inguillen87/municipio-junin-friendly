import { requireCompatibleInternalAccess } from '../lib/internal-access-gateway.js';
import { actionMutationSession, getActionCenterSql } from './internal-actions.js';
import { PARAMETER_MAX_BODY_BYTES, PayrollParameterError, readPayrollCatalog, writePayrollCatalog } from '../lib/internal-payroll-catalog.js';
const error = (code, status, message) => { throw new PayrollParameterError(code, status, message); };
function header(req, name) { const v = req.headers?.get ? req.headers.get(name) : req.headers?.[name]; if (Array.isArray(v)) { if (v.length !== 1) error('PAYROLL_PARAMETER_HEADER_INVALID', 400, 'Encabezado ambiguo.'); return String(v[0]); } return String(v ?? ''); }
function headers(res) { for (const [k, v] of Object.entries({ 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache', Vary: 'Cookie, Origin', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" })) res.setHeader(k, v); }
function origin(req, env) {
  const site = header(req, 'sec-fetch-site');
  if (site && !['same-origin', 'none'].includes(site)) error('PAYROLL_PARAMETER_ORIGIN_INVALID', 403, 'Origen no permitido.');
  const supplied = header(req, 'origin'), configured = env.IDENTITY_APP_ORIGIN || env.INTERNAL_APP_ORIGIN || (env.VERCEL_URL ? 'https://' + env.VERCEL_URL : '');
  const production = env.NODE_ENV === 'production' || ['production', 'preview'].includes(env.VERCEL_ENV);
  if (production && !configured) error('PAYROLL_PARAMETER_ORIGIN_UNAVAILABLE', 503, 'Origen operativo no configurado.');
  if (production && !supplied) error('PAYROLL_PARAMETER_ORIGIN_REQUIRED', 403, 'Origen requerido.');
  if (supplied) { let a, b; try { a = new URL(supplied); b = configured ? new URL(configured) : a; } catch { error('PAYROLL_PARAMETER_ORIGIN_INVALID', 403, 'Origen inválido.'); } if (a.origin === 'null' || a.origin !== b.origin || supplied !== a.origin) error('PAYROLL_PARAMETER_ORIGIN_INVALID', 403, 'Origen no permitido.'); }
  if (header(req, 'content-type').split(';')[0].trim().toLowerCase() !== 'application/json') error('PAYROLL_PARAMETER_CONTENT_TYPE', 415, 'Se requiere application/json.');
}
async function body(req) {
  const length = header(req, 'content-length');
  if (length && (!/^(0|[1-9][0-9]*)$/.test(length) || Number(length) > PARAMETER_MAX_BODY_BYTES)) error('PAYROLL_PARAMETER_BODY_TOO_LARGE', 413, 'El formulario supera el tamaño permitido.');
  let input = req.body;
  if (input === undefined && req[Symbol.asyncIterator]) { const chunks = []; let size = 0; for await (const part of req) { const b = Buffer.from(part); size += b.length; if (size > PARAMETER_MAX_BODY_BYTES) error('PAYROLL_PARAMETER_BODY_TOO_LARGE', 413, 'El formulario supera el tamaño permitido.'); chunks.push(b); } input = Buffer.concat(chunks); }
  if (Buffer.isBuffer(input)) input = input.toString('utf8');
  if (typeof input === 'string') { if (Buffer.byteLength(input) > PARAMETER_MAX_BODY_BYTES) error('PAYROLL_PARAMETER_BODY_TOO_LARGE', 413, 'El formulario supera el tamaño permitido.'); try { input = JSON.parse(input); } catch { error('PAYROLL_PARAMETER_JSON_INVALID', 400, 'JSON inválido.'); } }
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).sort().join('|') !== 'command|payload' || !input.payload || Array.isArray(input.payload) || typeof input.payload !== 'object') error('PAYROLL_PARAMETER_BODY_INVALID', 400, 'Formulario inválido.');
  let encoded; try { encoded = JSON.stringify(input); } catch { error('PAYROLL_PARAMETER_BODY_INVALID', 400, 'Formulario inválido.'); }
  if (Buffer.byteLength(encoded) > PARAMETER_MAX_BODY_BYTES) error('PAYROLL_PARAMETER_BODY_TOO_LARGE', 413, 'El formulario supera el tamaño permitido.');
  return input;
}
function query(req) {
  const q = {};
  for (const [k, v] of Object.entries(req.query || {})) { if (Array.isArray(v) || typeof v !== 'string') error('PAYROLL_PARAMETER_QUERY_INVALID', 400, 'Consulta ambigua.'); q[k] = v; }
  const resource = q.resource || 'catalog'; delete q.resource;
  if (resource === 'catalog') { q.revision ??= ''; }
  return { resource, input: q };
}
export function createInternalPayrollCatalogHandler(dependencies = {}) {
  const env = dependencies.env ?? process.env, authorize = dependencies.requireAccess ?? requireCompatibleInternalAccess, getSql = dependencies.getSql ?? getActionCenterSql;
  const read = dependencies.read ?? readPayrollCatalog, write = dependencies.write ?? writePayrollCatalog;
  return async (req, res) => {
    headers(res);
    try {
      const method = String(req.method || 'GET').toUpperCase();
      if (!['GET', 'POST'].includes(method)) { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Método no permitido.' }); }
      if (method === 'POST') origin(req, env);
      const access = await authorize(req, res, { env, requiredCapabilities: ['payroll.parameter.read'], requireDataPlaneReady: true, requireCertifiedDataBinding: true, allowLegacy: false });
      if (!access) return;
      if (access.mode !== 'managed' || access.principal?.tenant?.source !== 'membership') error('PAYROLL_PARAMETER_MEMBERSHIP_REQUIRED', 403, 'Se requiere una membresía municipal activa.');
      const session = actionMutationSession(access, env);
      // Authenticate first; neither the connection nor the request body is read earlier.
      const input = method === 'POST' ? await body(req) : query(req);
      if (method === 'POST' && (!['activate'].includes(input.command) || Object.keys(req.query || {}).length)) error('PAYROLL_PARAMETER_COMMAND_INVALID', 400, 'Comando no admitido.');
      const attempt = method === 'POST' ? header(req, 'idempotency-key') : null;
      if (method === 'POST' && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attempt)) error('PAYROLL_PARAMETER_IDEMPOTENCY_INVALID', 428, 'Falta una clave de intento válida.');
      const sql = await getSql(env);
      const result = method === 'GET' ? await read(sql, access.principal, session, input.resource, input.input) : await write(sql, access.principal, session, input.command, input.payload, attempt);
      if (result?.replayed === true) res.setHeader('Idempotency-Replayed', 'true');
      return res.status(method === 'POST' && result.replayed !== true ? 201 : 200).json({ ok: true, ...result });
    } catch (e) {
      if (e instanceof PayrollParameterError) return res.status(e.status).json({ ok: false, code: e.code, error: e.message });
      if (e?.code === 'ACTION_SESSION_INVALID') return res.status(401).json({ ok: false, code: 'PAYROLL_PARAMETER_SESSION_INVALID', error: 'La sesión operativa ya no es válida.' });
      // Never leak SQL, credentials, proposal content or personal identifiers.
      return res.status(503).json({ ok: false, code: 'PAYROLL_PARAMETER_UNAVAILABLE', error: 'Parámetros temporalmente no disponibles. La operación no tiene confirmación.' });
    }
  };
}
export default createInternalPayrollCatalogHandler();
