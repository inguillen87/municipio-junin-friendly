import test from 'node:test';
import assert from 'node:assert/strict';
import { accountingDefinition, accountingLinkedDefinition, accountingHistory, accountingCommand, accountingChanges, accountingAttempt, accountingBootstrap, accountingDetail, verifiedAccountingReceipt, ACCOUNTING_LIMITS } from '../assets/own-payroll-accounting-model.js';
import { syntheticAccountingDefinition as definition, syntheticAccountingSources as sources, syntheticAccountingCommand as command, syntheticAccountingReceipt as receipt, syntheticAccountingDetail as detail, syntheticAccountingBootstrap as bootstrap, accountingIds } from './fixtures/own-payroll-accounting-synthetic.js';

test('diez mil vigencias generales/particulares se verifican completas, incluido el último conflicto', () => {
 const d=definition(),base=d.assignments[0];d.assignments=Array.from({length:10000},(_,n)=>{const date=new Date(Date.UTC(2000,0,1+n)).toISOString().slice(0,10);return {...base,conceptCode:n%2?'1':null,validFrom:date,validUntil:date};});
 assert.equal(accountingDefinition(d).assignments.length,10000);d.assignments[9998].validUntil=d.assignments[9999].validFrom;assert.throws(()=>accountingDefinition(d),/superpone/);
});

test('matriz y asociación propias conservan referencias, ceros explícitos y cuenta bancaria distinta de cuenta contable', () => {
  const d = definition(); d.mappings[0].accountingAccountReference = '000'; const original = structuredClone(d);
  assert.deepEqual(accountingLinkedDefinition(d, sources()), d); assert.deepEqual(d, original);
  assert.equal(d.mappings[0].budgetItemReference, '001.01'); assert.equal(d.mappings[0].bankAccountReference, 'CTA-SINTETICA'); assert.equal(d.mappings[0].creditorReference, null);
  const c = command(); assert.equal(c.definition.assignments[0].conceptCode, null); assert.equal(accountingCommand(c).reviewConfirmed, false);
});
test('un contrato creado sólo en MuniControl admite institución y función sin resolver por legajo, DNI o GRH', () => {
  const s = sources(); assert.equal(s.contracts[0].employeeNumber, 'PROPIO-001');
  assert.equal(accountingLinkedDefinition(definition(), s).assignments[0].contractId, accountingIds.contract);
  const foreign = definition(); foreign.assignments[0].contractId = 'bbbbbbbb-0000-4000-8000-000000000001'; assert.throws(() => accountingLinkedDefinition(foreign, s), /contrato propio/);
  for (const key of ['legajo', 'dni', 'sourceSystem', 'employeeName']) { const d = definition(); d.assignments[0][key] = 'dato'; assert.throws(() => accountingDefinition(d), /contrato propio/); }
});
test('un campo no informado no se completa con repartición, cargo ni proveedor de otro campo', () => {
  for (const field of ['bankReference', 'bankAccountReference', 'accountingAccountReference', 'supplierReference', 'creditorReference']) {
    const d = definition(); d.mappings[0][field] = null; assert.equal(accountingDefinition(d).mappings[0][field], null);
    d.mappings[0][field] = ''; assert.throws(() => accountingDefinition(d), /vacío significa/);
  }
  for (const field of ['institutionalReference', 'functionReference', 'budgetItemReference', 'ruleReference']) { const d = definition(); const r = field.startsWith('institution') || field.startsWith('function') ? d.assignments[0] : d.mappings[0]; r[field] = null; assert.throws(() => accountingDefinition(d)); }
});
test('vigencias civiles y año de matriz explícitos; no se aceptan fechas inexistentes ni intervalo de otro año', () => {
  for (const value of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-1-01']) { const d = definition(); d.assignments[0].validFrom = value; assert.throws(() => accountingDefinition(d), /fechas civiles/); }
  for (const end of [null, '2027-01-01', '2025-12-31']) { const d = definition(); d.mappings[0].validUntil = end; assert.throws(() => accountingDefinition(d)); }
  const d = definition(); d.assignments[0].validFrom = '2024-02-29'; assert.equal(accountingDefinition(d).assignments[0].validFrom, '2024-02-29');
});
test('superposición anual por jurisdicción/convenio/repartición/concepto se rechaza completa', () => {
  const d = definition(); d.mappings.push({ ...d.mappings[0], validFrom: '2026-12-31' }); assert.throws(() => accountingDefinition(d), /superpuestas/);
  const j = definition(); j.mappings.push({ ...j.mappings[0], jurisdictionCode: '55' }); assert.equal(accountingDefinition(j).mappings.length, 2);
  const a = definition(); a.mappings[0].validUntil = '2026-06-30'; a.mappings.push({ ...a.mappings[0], validFrom: '2026-07-01', validUntil: '2026-12-31' }); assert.equal(accountingDefinition(a).mappings.length, 2);
});
test('asignaciones por todos y por concepto no se pisan mediante una prioridad implícita', () => {
  const d = definition(); d.assignments.push({ ...d.assignments[0], conceptCode: '1' }); assert.throws(() => accountingDefinition(d), /todos los conceptos/);
  d.assignments[0].validUntil = '2026-06-30'; d.assignments[1].validFrom = '2026-07-01'; assert.equal(accountingDefinition(d).assignments.length, 2);
  d.assignments.push({ ...d.assignments[1], conceptCode: '2' }); assert.equal(accountingDefinition(d).assignments.length, 3);
  d.assignments.push({ ...d.assignments[1] }); assert.throws(() => accountingDefinition(d), /superpuestas/);
});
test('naturaleza y catálogo deben cubrir toda la vigencia, incluidos huecos entre versiones', () => {
  const s = sources(); s.concepts[0].validUntil = '2026-04'; s.concepts.push({ ...s.concepts[0], validFrom: '2026-06', validUntil: '2026-12' }); assert.throws(() => accountingLinkedDefinition(definition(), s), /toda la vigencia/);
  s.concepts[1].validFrom = '2026-05'; assert.equal(accountingLinkedDefinition(definition(), s).mappings.length, 1);
  for (const field of ['agreementCode', 'departmentCode', 'conceptCode']) { const d = definition(); d.mappings[0][field] = '9'; assert.throws(() => accountingLinkedDefinition(d, sources())); }
  const d = definition(); d.mappings[0].nature = 'deduction'; assert.throws(() => accountingLinkedDefinition(d, sources()), /naturaleza/);
  d.mappings[0].nature = 'auxiliary'; assert.throws(() => accountingDefinition(d), /naturaleza/);
});
test('el historial admite cierre y sucesor pero no sustitución o eliminación silenciosa', () => {
  const before = definition(), after = definition(); after.assignments[0].validUntil = '2026-06-30'; after.assignments.push({ ...after.assignments[0], validFrom: '2026-07-01', validUntil: null, functionReference: 'NUEVA-FUNCION' }); accountingHistory(before, after);
  assert.equal(accountingChanges(before, after).length, 2);
  for (const field of ['functionReference', 'institutionalReference', 'ruleReference', 'validFrom']) { const d = definition(); d.assignments[0][field] = field === 'validFrom' ? '2026-01-02' : 'CAMBIO'; assert.throws(() => accountingHistory(before, d), /Conservá|No sobrescribas/); }
  const removed = definition(); removed.assignments = []; assert.throws(() => accountingHistory(before, removed), /Conservá/);
  assert.deepEqual(before, definition());
});
test('archivar una fuente preserva asociaciones anteriores y permite cerrarlas, sin habilitar nuevos destinos', () => {
  const before = definition(), archived = sources();
  archived.agreements = []; archived.departments = []; archived.concepts = []; archived.contracts = [];
  assert.deepEqual(accountingLinkedDefinition(before, archived, before), before);
  const closed = definition(); closed.mappings[0].validUntil = '2026-06-30'; closed.assignments[0].validUntil = '2026-06-30';
  assert.deepEqual(accountingLinkedDefinition(closed, archived, before), closed);
  const newMapping = structuredClone(closed); newMapping.mappings.push({ ...closed.mappings[0], validFrom: '2026-07-01', validUntil: '2026-12-31' });
  assert.throws(() => accountingLinkedDefinition(newMapping, archived, before), /catálogo aprobado/);
  const newAssignment = structuredClone(closed); newAssignment.assignments.push({ ...closed.assignments[0], validFrom: '2026-07-01', validUntil: null });
  assert.throws(() => accountingLinkedDefinition(newAssignment, archived, before), /contrato propio/);
  const altered = definition(); altered.mappings[0].budgetItemReference = 'ALTERADO';
  assert.throws(() => accountingLinkedDefinition(altered, archived, before), /No sobrescribas/);
});

test('la clave de intento debe ser canónica y no se normaliza silenciosamente', async () => {
  const body = command(); assert.throws(() => accountingAttempt(accountingIds.key.toUpperCase(), body, 'sesión sintética'), /identificar el intento/);
  const attempt = accountingAttempt(accountingIds.key, body, 'sesión sintética'), r = await receipt();
  assert.equal((await verifiedAccountingReceipt(r, attempt)).requestKey, attempt.key); assert.deepEqual(attempt.body, body);
  r.requestKey = 'ffffffff-ffff-4fff-8fff-ffffffffffff'; await assert.rejects(verifiedAccountingReceipt(r, attempt), /clave originales/);
});

test('capacidad es global: 2001 asociaciones no producen un resultado parcial', () => {
  const d = definition(); d.mappings = Array.from({ length: ACCOUNTING_LIMITS.mappings + 1 }, (_, n) => ({ ...d.mappings[0], conceptCode: String(n + 1) })); assert.throws(() => accountingDefinition(d), /No se recortaron/);
  const a = definition(); a.assignments = Array(ACCOUNTING_LIMITS.assignments + 1).fill(a.assignments[0]); assert.throws(() => accountingDefinition(a), /No se recortaron/);
});
test('intento pendiente congelado conserva cuerpo y clave aunque cambie la carga', async () => {
  const body = command(), attempt = accountingAttempt(accountingIds.key, body, 'sesión sintética'); body.definition.mappings[0].budgetItemReference = 'CAMBIO'; assert.equal(attempt.body.definition.mappings[0].budgetItemReference, '001.01'); assert.ok(Object.isFrozen(attempt.body.definition.mappings));
  const r = await receipt(); assert.equal((await verifiedAccountingReceipt(r, attempt)).requestKey, attempt.key);
  r.body.definition.mappings[0].budgetItemReference = 'ALTERADO'; await assert.rejects(verifiedAccountingReceipt(r), /contenido/);
});
test('la revisión exige el cuerpo completo, fuente exacta y ambas listas sin recortes', async () => {
  const d = await detail(); assert.equal((await accountingDetail(d)).body.definition.assignments.length, 1);
  for (const kind of ['mappings', 'assignments']) { const cut = await detail(); cut.body.definition[kind] = []; await assert.rejects(accountingDetail(cut), /cambió|perdió/); }
  const stale = await detail(); stale.sources.version = 'b'.repeat(64); await assert.rejects(accountingDetail(stale), /cambió|perdió/);
  const altered = await detail(); altered.baseDefinition = definition(); altered.body.definition.assignments[0].functionReference = 'OTRA'; altered.proposal.requestSha256 = await (await import('../assets/own-payroll-accounting-model.js')).accountingHash(altered.body); await assert.rejects(accountingDetail(altered), /No sobrescribas/);
});
test('consulta e intentos no se presentan como contabilización, cálculo o pago', async () => {
  const b = bootstrap(); assert.equal(accountingBootstrap(b).accountingPosted, false); b.paymentExecuted = true; assert.throws(() => accountingBootstrap(b), /consulta completa/);
  const r = await receipt(); r.accountingPosted = true; await assert.rejects(verifiedAccountingReceipt(r), /comprobante/);
  const c = command(); c.payrollCalculated = true; assert.throws(() => accountingCommand(c));
  c.command = 'approve'; c.reviewConfirmed = false; assert.throws(() => accountingCommand(c));
});
