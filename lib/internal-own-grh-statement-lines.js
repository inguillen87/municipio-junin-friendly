// Comparador MuniControl contra GRH: lectura de la liquidación GRH por legajo (migración 242).
// Sólo legajo de origen y renglones GRH; sin nombre, documento ni contrato. La forma se valida
// con el mismo contrato que usa el comparador, así que una fuente incompleta o deformada no llega.
import {grhStatementLines} from '../assets/own-grh-comparison-model.js';

export const OWN_GRH_STATEMENT_LINES_SQL =
  'SELECT public.own_grh_statement_lines_v1($1,$2::uuid,$3::integer,$4,$5::uuid,$6::uuid,$7::uuid) AS result';
export const OWN_GRH_STATEMENT_LINES_CAPABILITIES = Object.freeze(['payroll.read', 'workforce.employee.read']);
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const KEYS = ['version', 'official', 'datasetId', 'period', 'payrollType', 'closureStatus', 'sourceHash', 'complete', 'statements'];
const LINE_KEYS = ['code', 'description', 'amount', 'quantity', 'totalGroup', 'unit'];

export async function internalOwnGrhStatementLines(sql, req, principal, session) {
  const q = req?.query ?? {}, email = String(principal?.user?.email || '').trim().toLowerCase(), t = principal?.tenant;
  if (Object.keys(q).some(k => !['resource', 'datasetId'].includes(k)) || typeof q.datasetId !== 'string' || !UUID.test(q.datasetId))
    return {status: 400, payload: {ok: false, error: 'Elegí una liquidación GRH válida.'}};
  if (!email || email !== String(session?.email || '').trim().toLowerCase() || t?.source !== 'membership' || !UUID.test(String(t.id)) ||
      !UUID.test(String(t.membershipId)) || !UUID.test(String(session?.id)) || !Number.isSafeInteger(session?.version) || session.version < 1 ||
      !/^[a-f0-9]{40}$/.test(String(session?.releaseSha)))
    return {status: 401, payload: {ok: false, error: 'La sesión ya no es válida. Volvé a ingresar.'}};
  if (!OWN_GRH_STATEMENT_LINES_CAPABILITIES.every(k => t.effectiveCapabilities?.includes(k)))
    return {status: 403, payload: {ok: false, error: 'Tu usuario no tiene permiso para comparar con la liquidación GRH por legajo.'}};
  const [r] = await sql.query(OWN_GRH_STATEMENT_LINES_SQL, [email, session.id, session.version, session.releaseSha, t.id, t.membershipId, q.datasetId]);
  const raw = r?.result;
  if (raw?.version !== 'grh-statement-lines.v1' || typeof raw.found !== 'boolean') throw new Error('OWN_GRH_STATEMENT_LINES_CONTRACT_DRIFT');
  if (!raw.found) return {status: 404, payload: {ok: false, error: 'No encontramos esa liquidación GRH.'}};
  // Lista blanca: sólo los campos del contrato, en su forma exacta.
  const data = Object.fromEntries(KEYS.map(k => [k, raw[k]]));
  data.statements = Array.isArray(raw.statements) ? raw.statements.map(s => ({legajo: s?.legajo, statementId: s?.statementId, statementHash: s?.statementHash,
    lines: Array.isArray(s?.lines) ? s.lines.map(l => Object.fromEntries(LINE_KEYS.map(k => [k, l?.[k] ?? null]))) : null})) : null;
  grhStatementLines(data);
  if (data.datasetId !== q.datasetId) throw new Error('OWN_GRH_STATEMENT_LINES_CONTEXT_DRIFT');
  return {status: 200, payload: {ok: true, data}};
}
