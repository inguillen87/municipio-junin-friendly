// Read for entity files (descuentos por concepto) from a reference liquidation: session-bound SQL reader (migration 223).
// Same gate as the export roster: payroll.read + workforce.employee.read, tenant membership and live session.
import { entityExportResponse } from '../assets/entity-discount-export.js';
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export async function internalPayrollEntityExport(sql, req, principal, session) {
  const q = req.query || {}, email = String(principal?.user?.email || '').trim().toLowerCase(), t = principal?.tenant;
  if (Object.keys(q).some(k => !['resource', 'datasetId', 'concept'].includes(k)) || typeof q.datasetId !== 'string' || !UUID.test(q.datasetId)
    || q.concept !== undefined && (typeof q.concept !== 'string' || !/^[1-9][0-9]{0,8}$/.test(q.concept))) return { status: 400, payload: { ok: false, error: 'Elegí una liquidación y un concepto válidos.' } };
  if (!email || email !== String(session?.email || '').trim().toLowerCase() || t?.source !== 'membership' || !UUID.test(String(t.id)) || !UUID.test(String(t.membershipId)) || !UUID.test(String(session?.id)) || !Number.isSafeInteger(session?.version) || session.version < 1 || !/^[a-f0-9]{40}$/.test(String(session?.releaseSha))) return { status: 401, payload: { ok: false, error: 'La sesión ya no es válida.' } };
  if (!['payroll.read', 'workforce.employee.read'].every(k => t.effectiveCapabilities?.includes(k))) return { status: 403, payload: { ok: false, error: 'Tu usuario no tiene permiso para generar archivos de entidades.' } };
  let r;
  try { [r] = await sql.query('SELECT payroll_entity_export_v1($1,$2::uuid,$3::integer,$4,$5::uuid,$6::uuid,$7::uuid,$8) AS result', [email, session.id, session.version, session.releaseSha, t.id, t.membershipId, q.datasetId, q.concept ?? null]); }
  catch (error) {
    if (error?.code === '42883' && /payroll_entity_export_v1/.test(String(error?.message || ''))) return { status: 503, payload: { ok: false, code: 'PAYROLL_ENTITY_EXPORT_NOT_INSTALLED', error: 'Los archivos para entidades estarán disponibles cuando se instale su lectura (migración 223).' } };
    if (/PAYROLL_ENTITY_EXPORT_CAPABILITY_REQUIRED/.test(String(error?.message))) return { status: 403, payload: { ok: false, error: 'Tu usuario no tiene permiso para generar archivos de entidades.' } };
    if (/PAYROLL_ENTITY_EXPORT_(SOURCE_INCOMPLETE|LIMIT)/.test(String(error?.message))) return { status: 422, payload: { ok: false, error: 'La liquidación no está completa o supera la capacidad; no se genera un archivo parcial.' } };
    throw error;
  }
  const data = entityExportResponse(r?.result);
  if (data.found && data.datasetId !== q.datasetId.toLowerCase()) throw new Error('PAYROLL_ENTITY_EXPORT_CONTEXT_DRIFT');
  return { status: 200, payload: { ok: true, data } };
}
