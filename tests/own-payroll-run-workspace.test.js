import test from 'node:test';
import assert from 'node:assert/strict';
import {capture,saved,runCommand} from './fixtures/own-payroll-run-synthetic.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';
import {ownRunHash,RUN_READ,RUN_NOMINAL,RUN_CALCULATE} from '../lib/internal-own-payroll-run.js';
import {OWN_RUN_READ,OWN_RUN_NOMINAL,OWN_RUN_PREPARE,ownRunWorkspaceAccess,ownRunWorkspaceAttempt,verifiedWorkspaceCapture,ownRunWorkspaceRows,ownRunWorkspaceCsv,formatOwnRunDecimal,ownRunWorkspaceResult} from '../assets/own-payroll-run-workspace-model.js';
const full = () => {const c=capture();c.saved=saved(c);return c;};
test('las capacidades de pantalla conservan los tres niveles de la API',()=>{assert.deepEqual(OWN_RUN_READ,RUN_READ);assert.deepEqual(OWN_RUN_NOMINAL,RUN_NOMINAL);assert.deepEqual(OWN_RUN_PREPARE,RUN_CALCULATE);});
test('otra cuenta o sesión no hereda la autorización del intento anterior',()=>{
  const p={ok:true,authenticated:true,sessionVersion:2,user:{id:uid(3),email:'qa@example.invalid'},access:{context:'tenant',tenant:{id:uid(1),roleKey:'QA'},tenantCapabilities:RUN_CALCULATE},expiresAt:'2026-10-06T00:00:00Z'};
  const first=ownRunWorkspaceAccess(p,Date.parse('2026-10-05'));
  assert.notEqual(ownRunWorkspaceAccess({...p,user:{...p.user,id:uid(4)}},Date.parse('2026-10-05')).key,first.key);
  for(const bad of [{authenticated:false},{sessionVersion:1},{expiresAt:'2020-01-01'},{access:{...p.access,context:'platform'}},{access:{...p.access,tenant:{id:uid(1)}}}])assert.throws(()=>ownRunWorkspaceAccess({...p,...bad},Date.parse('2026-10-05')),e=>e.status===401);
});
test('reintentar conserva una copia inmutable del cuerpo, alcance y clave',()=>{
  const body=runCommand(),attempt=ownRunWorkspaceAttempt(uid(9),body,'same-session');
  body.period='2026-11';assert.equal(attempt.body.period,'2026-10');assert.throws(()=>{attempt.body.selection.values.push(uid(6));});assert.throws(()=>{attempt.key=uid(6);});assert.ok(Object.isFrozen(attempt.body));
});
test('la descarga contiene todas las páginas aunque la consulta tenga búsqueda',()=>{
  const c=full(),view=ownRunWorkspaceRows(c,'1001',1,2),csv=ownRunWorkspaceCsv(c);
  assert.equal(view.rows.length,2);assert.equal(view.total,12);assert.equal(view.filtered,6);assert.equal(view.pages,3);
  assert.equal(csv.trim().split('\r\n').length,13);assert.ok(csv.includes('1002'));assert.ok(!csv.includes(c.saved.input.employees[0].contractId));assert.ok(!csv.includes('employeeName'));
});
test('CSV neutraliza fórmulas y comillas; el contrato rechaza controles en el respaldo',()=>{
  const c=full(),reference='=HYPERLINK("https://example.invalid") Respaldo sintético';
  for(const r of c.saved.input.rules)r.ruleReference=reference;
  for(const r of c.saved.result.rows)r.ruleReference=reference;
  assert.ok(ownRunWorkspaceCsv(c).includes("\"'=HYPERLINK(\"\"https://example.invalid\"\") Respaldo sintético\""));
  c.saved.input.rules[0].ruleReference=reference+'\nOtra línea';assert.throws(()=>ownRunWorkspaceCsv(c));
});
test('los importes conservan ocho decimales y valores grandes sin punto flotante',()=>{
  assert.equal(formatOwnRunDecimal('9007199254740993.00000001'),'$ 9.007.199.254.740.993,00000001');
  assert.equal(formatOwnRunDecimal('0.00'),'$ 0,00');assert.equal(formatOwnRunDecimal('-0.25'),'$ -0,25');
  for(const v of [null,0,'1e2','01.00','1.123456789'])assert.throws(()=>formatOwnRunDecimal(v));
});
test('una respuesta incompleta o coherentemente alterada no produce una planilla parcial',()=>{
  for(const change of [c=>{c.saved.result.rows.pop();c.saved.result.rowCount--;},c=>{c.saved.result.rows[0].employeeNumber='9999';},c=>{c.saved.result.employeeTotals[0].net=null;},c=>{c.saved.result.rows[0].rounding.precision=7;}]){const c=full();change(c);assert.throws(()=>ownRunWorkspaceResult(c));}
});
test('la recuperación verifica hashes sin recalcular ni alterar fuentes congeladas',async()=>{
  const c=full();assert.deepEqual(await verifiedWorkspaceCapture(c,{key:c.key,body:c.body}),c);
  const changed=full();changed.saved.result.rows[0].amount='100.11';await assert.rejects(verifiedWorkspaceCapture(changed),/integridad/);
  c.payloadSha256=ownRunHash({different:true});await assert.rejects(verifiedWorkspaceCapture(c),/integridad/);
});

test('buscar un legajo propio con letras conserva sus conceptos, identidad y resultado original',()=>{
 const c=capture();c.payload.population.employees[1].employeeNumber='A/3501';c.payloadSha256=ownRunHash(c.payload);c.saved=saved(c);const before=structuredClone(c);
 const expected=c.saved.result.rows.filter(r=>r.employeeNumber==='A/3501');assert.ok(expected.length>0);
 for(const term of ['A/3501','a/3501',' A/3501 '])assert.deepEqual(ownRunWorkspaceRows(c,term).rows,expected);
 assert.deepEqual(c,before);assert.equal(ownRunWorkspaceRows(c,'',1).total,c.saved.result.rowCount);assert.ok(ownRunWorkspaceCsv(c).includes('A/3501'));
});
