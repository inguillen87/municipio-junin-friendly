import { payrollRoster } from '../assets/payroll-roster-model.js';
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export async function internalPayrollRoster(sql, req, principal, session) {
  const q = req.query || {}, email = String(principal?.user?.email || '').trim().toLowerCase(), t = principal?.tenant;
  if (Object.keys(q).some(k => !['resource','datasetId'].includes(k)) || typeof q.datasetId !== 'string' || !UUID.test(q.datasetId)) return { status:400, payload:{ok:false,error:'Elegí una liquidación válida.'} };
  if (!email || email !== String(session?.email || '').trim().toLowerCase() || t?.source !== 'membership' || !UUID.test(String(t.id)) || !UUID.test(String(t.membershipId)) || !UUID.test(String(session?.id)) || !Number.isSafeInteger(session?.version) || session.version < 1 || !/^[a-f0-9]{40}$/.test(String(session?.releaseSha))) return {status:401,payload:{ok:false,error:'La sesión ya no es válida.'}};
  const required = ['payroll.read','workforce.employee.read'];
  if (!required.every(k => t.effectiveCapabilities?.includes(k))) return {status:403,payload:{ok:false,error:'Tu usuario no tiene permiso para consultar la identificación de nómina.'}};
  const [r] = await sql.query('SELECT payroll_export_roster_v1($1,$2::uuid,$3::integer,$4,$5::uuid,$6::uuid,$7::uuid) AS result', [email,session.id,session.version,session.releaseSha,t.id,t.membershipId,q.datasetId]);
  const raw = r?.result; payrollRoster(raw);
  if (raw.found && raw.datasetId !== q.datasetId) throw new Error('PAYROLL_ROSTER_CONTEXT_DRIFT');
  if (!raw.found) return {status:200,payload:{ok:true,data:{version:'payroll-export-roster.v1',found:false,official:false}}};
  const fields = ['version','found','official','datasetId','date','type','total','sourceLabel','closureStatus','payloadHash','reportHash'];
  const rowFields = ['legajo','name','dni','cuil','sex','contractMatches','identityCutoff','contractStatus','concept993','concept995'];
  return {status:200,payload:{ok:true,data:{...Object.fromEntries(fields.map(k=>[k,raw[k]])),rows:raw.rows.map(row=>Object.fromEntries(rowFields.map(k=>[k,row[k]])))}}};
}
