import assert from 'node:assert/strict';
import test from 'node:test';
import { mapFamily } from '../scripts/import-rrhh-neon.mjs';

// Importing the module above exercises its no-side-effect entry guard. These
// tests never invoke main(), read private artifacts or create a SQL client.
function family(overrides = {}) {
  return {
    sourceKey: { familyMemberId: '000101' },
    employeeSourceKey: { companyCode: '1', employeeNumber: '000999' },
    employeeExternalId: 'grh:1:000999', fullName: 'Familiar Sintético',
    sexCode: 'F', birthDate: '2015-03-04', documentNumber: '99999999',
    cuil: null, relationshipId: '2', endDate: null, schoolingCode: '3', courseCode: '4',
    ...overrides,
  };
}
const provenance = { table: 'familia', primaryKey: { CODI_14: '000101' } };

test('family mapping retains raw certificate dates and provenance in source_payload', () => {
  const input = family({ sourceFields: { PRES_14: '2026-03-05', VENC_14: '2027-03-05 00:00:00' }, sourceProvenance: provenance });
  const before = structuredClone(input);
  const [mapped] = mapFamily([input], 17);
  assert.deepEqual(JSON.parse(mapped.source_payload), input);
  assert.deepEqual(input, before);
  assert.equal(mapped.import_run_id, 17);
  assert.equal(mapped.family_id, '000101');
  assert.equal(mapped.company_id, 1);
  assert.equal(mapped.legajo, '000999');
  assert.equal(mapped.fecha_nacimiento, '2015-03-04');
  assert.deepEqual(Object.keys(mapped).sort(), ['family_id','company_id','legajo','nombre','sexo',
    'fecha_nacimiento','dni','cuil','vinculo_code','fecha_baja','source_payload','import_run_id'].sort());
});

test('family source_payload keeps null, empty, invalid and absent certificate fields distinct', () => {
  for (const sourceFields of [{ PRES_14: null, VENC_14: null }, { PRES_14: '', VENC_14: '  ' },
    { PRES_14: '0000-00-00', VENC_14: '2026-02-30' }, { PRES_14: ' NULL ', VENC_14: ' 2026-03-05 ' },
    { PRES_14: null }, {}]) {
    const input = family({ sourceFields, sourceProvenance: provenance });
    const [mapped] = mapFamily([input], 17);
    assert.deepEqual(JSON.parse(mapped.source_payload), input);
    for (const inferred of ['certificateStatus','presentationDate','expirationDate','presented','pending','eligible']) {
      assert.equal(Object.hasOwn(mapped, inferred), false);
      assert.equal(Object.hasOwn(JSON.parse(mapped.source_payload), inferred), false);
    }
  }
});

test('existing curated family records remain compatible without invented certificate evidence', () => {
  const input = family();
  const [mapped] = mapFamily([input], 17);
  assert.deepEqual(JSON.parse(mapped.source_payload), input);
  assert.equal(Object.hasOwn(JSON.parse(mapped.source_payload), 'sourceFields'), false);
  assert.equal(mapped.nombre, input.fullName);
  assert.equal(mapped.fecha_baja, null);
  assert.equal(mapped.vinculo_code, '2');
  assert.deepEqual(mapFamily([], 17), []);
});

test('family mapping still rejects missing source identity and malformed company code', () => {
  assert.throws(() => mapFamily([family({ sourceKey: {} })], 17), /family.sourceKey.familyMemberId/);
  assert.throws(() => mapFamily([family({ employeeSourceKey: { companyCode: 'company?', employeeNumber: '000999' } })], 17), /family.employeeSourceKey.companyCode/);
});
