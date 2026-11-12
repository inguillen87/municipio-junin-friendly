import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  OWN_OSEP_GRH_MAPPING_DRAFT, ownOsepMapping, prepareOwnOsepReport, renderOwnOsepReview,
} from '../assets/own-osep-report-model.js';
import { parsePayrollOsep206 } from '../assets/payroll-osep-206-generator.js';
import { osepFixture, osepOptions, rehashFixture, financialRow, fixtureHash, uid, setConcept } from './fixtures/own-osep-report-synthetic.js';

const prepare = source => prepareOwnOsepReport(source, osepOptions(source));
const codes = report => [...report.globalIssues, ...report.rows.flatMap(r => r.issues)].map(i => i.code);
const blocked = report => { assert.equal(report.canRenderReview, false); assert.equal(report.canExport, false); assert.equal(report.officialSubmissionAllowed, false); assert.throws(() => renderOwnOsepReview(report), { code: 'OWN_OSEP_REVIEW_BLOCKED' }); };
const renameLegajo = (source, index, value) => {
  const employee = source.content.groups[0].snapshot.employees[index]; employee.employeeNumber = value;
  source.content.people[index].employeeNumber = value;
  for (const row of source.content.groups[0].snapshot.concepts) if (row.contractId === employee.contractId) row.employeeNumber = value;
};

test('JSON and executable draft agree; all twelve historical fields include 602+608 and 683/684', () => {
  const json = JSON.parse(readFileSync(new URL('../contracts/own-osep-closed-mapping.v1.json', import.meta.url), 'utf8'));
  assert.deepEqual(json, OWN_OSEP_GRH_MAPPING_DRAFT);
  assert.equal(json.fields.length, 12);
  assert.deepEqual(json.fields.find(f => f.fieldId === 'voluntaryPureCents').terms.map(t => t.code), ['602', '608']);
  assert.deepEqual(json.fields.find(f => f.fieldId === 'subjectSalaryCents').terms.map(t => t.code), ['993', '994']);
  assert.equal(json.fields.find(f => f.fieldId === 'catastrophicVoluntaryCents').terms[0].code, '683');
  assert.equal(json.fields.find(f => f.fieldId === 'catastrophicStudentCents').terms[0].code, '684');
  assert.ok(Object.isFrozen(OWN_OSEP_GRH_MAPPING_DRAFT.fields[0].terms[0]));
});

test('complete 61-row source produces 61 full 206-byte records with exact field controls', async () => {
  const source = osepFixture(61), report = await prepare(source), output = renderOwnOsepReview(report);
  assert.equal(report.total, 61); assert.equal(report.selectedParticipationCount, 61); assert.equal(report.sourceRecordCount, 61);
  assert.equal(report.issueCount, 0); assert.equal(report.canRenderReview, true); assert.equal(report.scopeResolved, true);
  assert.equal(output.recordCount, 61); assert.equal(output.byteLength, 61 * 208);
  const raw = new TextDecoder('windows-1252').decode(output.bytes), first = raw.split('\r\n')[0];
  assert.equal(first.length, 206); assert.equal(raw.split('\r\n').length, 62);
  assert.equal(first.slice(0, 6), '202611'); assert.equal(first.slice(13, 14), '3');
  assert.equal(first.slice(22, 34), '000000001001');
  assert.equal(first.slice(74, 84), '0000007500'); assert.equal(first.slice(84, 94), '0000105000');
  assert.equal(first.slice(94, 104), '0000097100'); assert.equal(first.slice(124, 134), '0000001300');
  assert.equal(first.slice(164, 174), '0000000300'); assert.equal(first.slice(174, 184), '0000000400');
  assert.equal(first.slice(194, 196), 'NO');
  assert.equal(report.totalsCents.subjectSalaryCents, String(105000 * 61));
  assert.equal(report.totalsCents.voluntaryPureCents, String(1300 * 61));
  assert.equal(report.totalsCents.catastrophicStudentCents, String(400 * 61));
  assert.equal(parsePayrollOsep206(output.bytes).rows.length, 61);
  assert.equal(output.officialSubmissionAllowed, false); assert.equal(output.activation, 'PREPARATION_ONLY'); assert.equal(output.canExport, false);
});

test('missing ART days, CUIL and sex do not become OSEP eligibility gates', async () => {
  const source = osepFixture(1); assert.equal(source.content.people[0].days.revision, 0); assert.equal(source.content.people[0].cuil, null); assert.equal(source.content.people[0].sex, null);
  const report = await prepare(source); assert.equal(report.canRenderReview, true); assert.equal(report.issueCount, 0);
});

test('document type is explicit and bound; an absent declaration never guesses DNI type', async () => {
  const source = osepFixture(2), options = osepOptions(source); options.identityDeclarations = null;
  const report = await prepareOwnOsepReport(source, options); blocked(report);
  assert.equal(report.total, 2); assert.ok(report.rows.every(r => r.values.documentTypeCode === null));
  assert.deepEqual(codes(report), ['DOCUMENT_TYPE_UNRESOLVED', 'DOCUMENT_TYPE_UNRESOLVED']);
  const partial = osepOptions(source); partial.identityDeclarations.rows.pop();
  const partialReport = await prepareOwnOsepReport(source, partial); blocked(partialReport); assert.equal(partialReport.total, 2);
});

test('concursado defaults to explicit contract NO; a bound true override produces SI', async () => {
  const source = osepFixture(2), options = osepOptions(source); options.identityDeclarations.rows[1].bankrupt = true;
  const report = await prepareOwnOsepReport(source, options), output = parsePayrollOsep206(renderOwnOsepReview(report).bytes);
  assert.equal(report.rows[0].bankruptBasis, 'mapping_default_no'); assert.equal(output.rows[0].bankrupt, false);
  assert.equal(report.rows[1].bankruptBasis, 'explicit_declaration'); assert.equal(output.rows[1].bankrupt, true);
  options.identityDeclarations.rows[1].bankrupt = 'SI';
  await assert.rejects(() => prepareOwnOsepReport(source, options), { code: 'OWN_OSEP_DECLARATION_INVALID' });
});

test('stale source, scope, identity and duplicate declarations cannot bind a new report', async () => {
  for (const change of [
    o => { o.identityDeclarations.sourceVersion = 'b'.repeat(64); },
    o => { o.identityDeclarations.scopeVersion = 'b'.repeat(64); },
    o => { o.identityDeclarations.rows[0].identityToken = 'b'.repeat(64); },
    o => { o.identityDeclarations.rows[0].registrationId = uid(9998); },
    o => { o.identityDeclarations.rows[0].personId = uid(9997); },
    o => { o.identityDeclarations.rows.push(structuredClone(o.identityDeclarations.rows[0])); },
    o => { o.identityDeclarations.rows[0].contractId = uid(9999); },
  ]) {
    const source = osepFixture(1), options = osepOptions(source); change(options);
    await assert.rejects(() => prepareOwnOsepReport(source, options), e => /^OWN_OSEP_DECLARATION_/.test(e.code));
  }
});

test('missing a monetary source remains null and blocks the whole file; explicit zero stays zero', async () => {
  const source = osepFixture(2), snapshot = source.content.groups[0].snapshot, id = snapshot.employees[0].contractId;
  snapshot.concepts = snapshot.concepts.filter(r => !(r.contractId === id && r.conceptCode === '603')); rehashFixture(source);
  const report = await prepare(source); blocked(report);
  assert.equal(report.rows[0].values.voluntaryStudentCents, null); assert.equal(report.rows[1].values.voluntaryStudentCents, '0');
  assert.equal(report.totalsCents.voluntaryStudentCents, null); assert.equal(report.totalsCents.quotaCents, '10000');
  assert.ok(codes(report).includes('AMOUNT_SOURCE_MISSING'));
});

test('the historical sum needs 608 explicitly; 602 alone does not satisfy the mapping', async () => {
  const source = osepFixture(1), snapshot = source.content.groups[0].snapshot;
  snapshot.concepts = snapshot.concepts.filter(r => r.conceptCode !== '608'); setConcept(source, '998', { amount: '973.00' }); rehashFixture(source);
  const report = await prepare(source); blocked(report); assert.equal(report.rows[0].values.voluntaryPureCents, null);
  assert.ok(report.rows[0].issues.some(i => i.fieldId === 'voluntaryPureCents' && /608/.test(i.message)));
});

test('sub-cent, negative and overflowing amounts are blocked without rounding or truncation', async () => {
  for (const amount of ['1000.001', '-0.01', '100000000.00']) {
    const source = osepFixture(1); setConcept(source, '993', { amount }); rehashFixture(source);
    const report = await prepare(source); blocked(report); assert.equal(report.rows[0].values.subjectSalaryCents, null);
    assert.ok(codes(report).includes('AMOUNT_NOT_EXACT_CENTS'));
  }
  const source = osepFixture(1); setConcept(source, '993', { amount: '99999999.99' }); rehashFixture(source);
  const sum = await prepare(source); blocked(sum); assert.ok(codes(sum).includes('AMOUNT_FIELD_OVERFLOW'));
});

test('trailing decimal zeros are exact; no float arithmetic is used for cent controls', async () => {
  const source = osepFixture(1); setConcept(source, '993', { amount: '1000.00000000' }); rehashFixture(source);
  const report = await prepare(source); assert.equal(report.rows[0].values.subjectSalaryCents, '105000'); assert.equal(report.canRenderReview, true);
});

test('each mapped term must have exact cents even when sub-cent residues would cancel', async () => {
  const source = osepFixture(1); setConcept(source, '993', { amount: '1000.001' }); setConcept(source, '994', { amount: '49.999' }); rehashFixture(source);
  const report = await prepare(source); blocked(report); assert.equal(report.rows[0].values.subjectSalaryCents, null);
  assert.equal(report.rows[0].issues.filter(i => i.code === 'AMOUNT_NOT_EXACT_CENTS' && i.fieldId === 'subjectSalaryCents').length, 2);
});

test('a numeric/null source amount cannot become a monetary zero', async () => {
  for (const amount of [null, 0, 1000.01]) {
    const source = osepFixture(1); setConcept(source, '993', { amount }); rehashFixture(source, { recalculateTotals: false });
    await assert.rejects(() => prepare(source));
  }
});

test('a wrong monetary unit or declared nature is visible and disables the review file', async () => {
  const source = osepFixture(1); setConcept(source, '993', { unit: 'hours' }); rehashFixture(source);
  const unit = await prepare(source); blocked(unit); assert.ok(codes(unit).includes('AMOUNT_SOURCE_KIND'));
  const valid = osepFixture(1), options = osepOptions(valid); options.mapping.fields.find(f => f.fieldId === 'quotaCents').terms[0].nature = 'employer_contribution';
  const nature = await prepareOwnOsepReport(valid, options); blocked(nature); assert.ok(codes(nature).includes('AMOUNT_SOURCE_KIND'));
});

test('native namespaces are explicit: auxiliary 601 does not replace concept 601', async () => {
  const source = osepFixture(1, { namespaced: true }), snapshot = source.content.groups[0].snapshot;
  snapshot.concepts.push(financialRow(snapshot.employees[0], '601', 'auxiliary', '999.99')); rehashFixture(source);
  const report = await prepare(source); assert.equal(report.canRenderReview, true); assert.equal(report.rows[0].values.quotaCents, '5000');
});

test('998 must reconcile with the net saved by the closure; canonical native net is an explicit alternative', async () => {
  const mismatch = osepFixture(1); setConcept(mismatch, '998', { amount: '972.00' }); rehashFixture(mismatch);
  const bad = await prepare(mismatch); blocked(bad); assert.ok(codes(bad).includes('NET_RECONCILIATION_MISMATCH'));
  assert.equal(bad.rows[0].values.netPayCents, null); assert.equal(bad.totalsCents.netPayCents, null);
  const source = osepFixture(1); source.content.groups[0].snapshot.concepts = source.content.groups[0].snapshot.concepts.filter(r => r.conceptCode !== '998'); rehashFixture(source);
  const options = osepOptions(source); options.mapping.id = 'qa-native-net-draft'; options.mapping.revision = 2;
  options.mapping.fields.find(f => f.fieldId === 'netPayCents').terms = [{ kind: 'closed_total', key: 'net' }];
  const report = await prepareOwnOsepReport(source, options); assert.equal(report.canRenderReview, true); assert.equal(report.rows[0].values.netPayCents, '97100');
  assert.equal(report.officialSubmissionAllowed, false);
});

test('mapping supports explicit aliases and pending fields, never empty sums or policy activation', async () => {
  const source = osepFixture(1); setConcept(source, '601', { conceptCode: '1601' }); rehashFixture(source);
  const options = osepOptions(source); options.mapping.id = 'qa-alias-draft'; options.mapping.revision = 2;
  options.mapping.fields.find(f => f.fieldId === 'quotaCents').terms[0].code = '1601';
  const alias = await prepareOwnOsepReport(source, options); assert.equal(alias.canRenderReview, true); assert.equal(alias.rows[0].values.quotaCents, '5000');
  options.mapping.fields.find(f => f.fieldId === 'quotaCents').terms = null;
  const pending = await prepareOwnOsepReport(source, options); blocked(pending); assert.equal(pending.rows[0].values.quotaCents, null); assert.ok(codes(pending).includes('MAPPING_UNRESOLVED'));
  for (const change of [
    m => { m.officialSubmissionAllowed = true; }, m => { m.institutionalValidation = 'approved'; },
    m => { m.bankruptDefault = true; }, m => { m.fields[0].terms = []; },
    m => { m.fields[0].terms.push(structuredClone(m.fields[0].terms[0])); },
    m => { m.fields[0].fieldId = m.fields[1].fieldId; }, m => { m.fields.pop(); },
    m => { m.fields[0].terms[0].namespace = 'auxiliary'; },
    m => { m.fields[0].terms = [{ kind: 'closed_total', key: 'gross' }]; },
    m => { m.unexpected = true; },
  ]) { const mapping = structuredClone(OWN_OSEP_GRH_MAPPING_DRAFT); change(mapping); assert.throws(() => ownOsepMapping(mapping)); }
});

test('period/type mismatch, incomplete transport and hash changes fail before a review is trusted', async () => {
  const source = osepFixture(1), options = osepOptions(source); options.scope.period = '2026-12';
  await assert.rejects(() => prepareOwnOsepReport(source, options), { code: 'OWN_OSEP_SCOPE_MISMATCH' });
  for (const change of [
    s => { s.content.complete = false; }, s => { s.content.sourceRecordCount++; }, s => { s.content.people.pop(); },
    s => { s.content.groups.push(structuredClone(s.content.groups[0])); },
    s => { s.content.people[0].name = 'Dato cambiado sin renovar la huella'; },
    s => { s.content.groups[0].body.reason = 'Razón alterada con hash de cierre obsoleto'; s.sourceVersion = fixtureHash(s.content); },
  ]) { const damaged = osepFixture(1); change(damaged); await assert.rejects(() => prepare(damaged)); }
});

test('partial closed populations are explicit, even if source transport counts are correct', async () => {
  const source = osepFixture(2), snapshot = source.content.groups[0].snapshot; snapshot.populationCount = 3; snapshot.populationComplete = false; rehashFixture(source);
  const report = await prepare(source); blocked(report); assert.equal(report.total, 2); assert.equal(report.sourceRecordCount, 2);
  assert.equal(report.allClosedPopulationsComplete, false); assert.ok(codes(report).includes('CLOSED_POPULATION_INCOMPLETE'));
});

test('legacy snapshots without captured jurisdiction stay blocked; private v4 is not implicitly admitted', async () => {
  const legacy = osepFixture(1); const snapshot = legacy.content.groups[0].snapshot; snapshot.version = 'own-close-snapshot.v1';
  for (const e of snapshot.employees) delete e.jurisdiction; rehashFixture(legacy);
  const report = await prepare(legacy); blocked(report); assert.ok(codes(report).includes('JURISDICTION_UNRESOLVED'));
  const future = osepFixture(1); future.content.groups[0].snapshot.version = 'own-close-snapshot.v4'; rehashFixture(future);
  await assert.rejects(() => prepare(future), /histórica|histórico|cierre|versión/);
});

test('a declared jurisdiction selects its whole closed population and records the exclusion count', async () => {
  const source = osepFixture(6, { jurisdictions: ['42', '55'] }), report = await prepare(source);
  assert.equal(report.canRenderReview, true); assert.equal(report.total, 3); assert.equal(report.sourceRecordCount, 6);
  assert.equal(report.excludedByDeclaredJurisdictionCount, 3); assert.equal(report.selectedParticipationCount, 3);
  assert.deepEqual(parsePayrollOsep206(renderOwnOsepReview(report).bytes).rows.map(r => r.legajo), ['1001', '1003', '1005']);
});

test('unknown or unselected jurisdiction blocks filtering and keeps every source row visible', async () => {
  const source = osepFixture(4, { jurisdictions: ['42', '55'] }); source.content.groups[0].snapshot.employees[3].jurisdiction.code = null; rehashFixture(source);
  const unknown = await prepare(source); blocked(unknown); assert.equal(unknown.total, 4); assert.equal(unknown.scopeResolved, false);
  assert.equal(unknown.excludedByDeclaredJurisdictionCount, null); assert.ok(codes(unknown).includes('JURISDICTION_UNRESOLVED'));
  const known = osepFixture(4, { jurisdictions: ['42', '55'] }), options = osepOptions(known, null);
  const unselected = await prepareOwnOsepReport(known, options); blocked(unselected); assert.equal(unselected.total, 4); assert.ok(codes(unselected).includes('JURISDICTION_REQUIRED'));
});

test('several liquidation types for one contract are not silently summed or deduplicated', async () => {
  const source = osepFixture(1), group = structuredClone(source.content.groups[0]);
  group.id = uid(10); group.groupId = group.id; group.key = uid(11); group.body.liquidationType = 'sac'; group.snapshot.liquidationType = 'sac';
  source.content.groups.push(group); source.content.params.types = ['monthly', 'sac']; source.content.sourceRecordCount = 2; rehashFixture(source);
  const report = await prepare(source); blocked(report); assert.equal(report.total, 1); assert.equal(report.sourceRecordCount, 2);
  assert.equal(report.rows[0].sources.length, 2); assert.equal(report.rows[0].values.netPayCents, null); assert.ok(codes(report).includes('MULTIPLE_PARTICIPATIONS_UNRESOLVED'));
});

test('legajo, person and document collisions flag every involved row, with no automatic merge', async () => {
  for (const [change, expected] of [
    [s => renameLegajo(s, 1, '00001001'), 'LEGAJO_DUPLICATE'],
    [s => { s.content.people[1].personId = s.content.people[0].personId; }, 'PERSON_MULTIPLE_CONTRACTS'],
    [s => { s.content.people[1].dni = s.content.people[0].dni; }, 'DOCUMENT_DUPLICATE'],
  ]) {
    const source = osepFixture(2); change(source); rehashFixture(source);
    const report = await prepare(source); blocked(report); assert.equal(report.total, 2);
    assert.ok(report.rows.every(r => r.issues.some(i => i.code === expected)));
  }
});

test('names and document/legajo bytes are validated without coercion, truncation or Unicode loss', async () => {
  const valid = osepFixture(1); valid.content.people[0].name = 'Muñoz, María €'; rehashFixture(valid);
  const output = renderOwnOsepReview(await prepare(valid)); assert.equal(parsePayrollOsep206(output.bytes).rows[0].fullName, 'Muñoz, María €');
  assert.ok(output.bytes.includes(0x80));
  for (const change of [
    s => { s.content.people[0].name = 'A'.repeat(41); }, s => { s.content.people[0].name = 'Persona 😀'; },
    s => { s.content.people[0].name = 'Persona\nSintética'; }, s => { s.content.people[0].name = ''; },
    s => { s.content.people[0].dni = '1234X678'; }, s => renameLegajo(s, 0, 'LEGAJO-QA'),
  ]) {
    const source = osepFixture(1); change(source); rehashFixture(source);
    const report = await prepare(source); blocked(report); assert.ok(codes(report).includes('RENDERER_ROW_INVALID'));
  }
});

test('the optional 25-byte terminal is bound to the selected mapping profile', async () => {
  const source = osepFixture(2), options = osepOptions(source); options.mapping.profileId = 'osep-206-tab-footer25.v1';
  const report = await prepareOwnOsepReport(source, options), output = renderOwnOsepReview(report);
  assert.equal(output.byteLength, 2 * 208 + 25); assert.equal(output.terminalRecordCount, 1); assert.equal(parsePayrollOsep206(output.bytes).terminalRecordCount, 1);
  assert.deepEqual([...output.bytes.slice(-25)], [...Array(24).fill(9), 32]);
});

test('caller mutation during hash checks, forged review copies and mutated output cannot alter the trusted review', async () => {
  const source = osepFixture(1), options = osepOptions(source), originalName = source.content.people[0].name;
  const pending = prepareOwnOsepReport(source, options); source.content.people[0].name = 'Cambio posterior'; options.mapping.fields[0].terms = null; options.identityDeclarations.rows[0].documentTypeCode = null;
  const report = await pending; assert.equal(report.canRenderReview, true); assert.equal(report.rows[0].values.fullName, originalName);
  assert.ok(Object.isFrozen(report.rows[0].values)); assert.throws(() => { report.rows[0].values.quotaCents = '0'; }, TypeError);
  assert.throws(() => renderOwnOsepReview(structuredClone(report)), { code: 'OWN_OSEP_REPORT_UNTRUSTED' });
  const first = renderOwnOsepReview(report), expected = new Uint8Array(first.bytes); first.bytes[0] = 0;
  assert.deepEqual(renderOwnOsepReview(report).bytes, expected);
});

test('mapping revision and identity evidence are fingerprinted independently of the source', async () => {
  const source = osepFixture(1), first = await prepare(source), options = osepOptions(source);
  options.mapping.revision = 2; const second = await prepareOwnOsepReport(source, options);
  assert.equal(first.sourceVersion, second.sourceVersion); assert.notEqual(first.mappingSha256, second.mappingSha256);
  options.identityDeclarations.rows[0].reference = 'Nueva constancia exclusivamente sintética'; const third = await prepareOwnOsepReport(source, options);
  assert.equal(second.mappingSha256, third.mappingSha256); assert.notEqual(second.identityDeclarationsSha256, third.identityDeclarationsSha256);
});

test('numeric legajo order is deterministic and an empty closed scope does not invent a file', async () => {
  const source = osepFixture(3), group = source.content.groups[0]; renameLegajo(source, 0, '10'); renameLegajo(source, 1, '2'); renameLegajo(source, 2, '1');
  group.snapshot.employees.reverse(); source.content.people.reverse(); rehashFixture(source);
  const report = await prepare(source); assert.deepEqual(report.rows.map(r => r.values.legajo), ['1', '2', '10']);
  const empty = await prepare(osepFixture(0)); blocked(empty); assert.equal(empty.total, 0); assert.equal(empty.issueCount, 0);
});

// Official closure (V4/V5), documents returned by PostgreSQL 18.6: GRH totals are kept as 800000993/800000994/800000998
// and each employee preserves that correspondence. The approved draft mapping keeps naming 993, 994 and 998.
for (const version of ['v5', 'v4']) test('draft mapping reads 993 + 994 and 998 from an official ' + version.toUpperCase() + ' closure under the codes it preserved', async () => {
  const { nativeOfficial } = await import('./fixtures/own-payroll-native-official-pg18.js');
  const { ownArtFixture, artFixtureHash } = await import('./fixtures/own-art-report-synthetic.js');
  const { ownClosedJurisdiction } = await import('../assets/own-payroll-jurisdiction-model.js');
  const receipt = nativeOfficial(version).closeReceipt, s = receipt.snapshot, source = ownArtFixture(s.employeeCount);
  source.content.groups = [receipt]; source.content.params = { period: s.period, types: [s.liquidationType] }; source.content.sourceRecordCount = s.employeeCount;
  s.employees.forEach((e, i) => Object.assign(source.content.people[i], { contractId: e.contractId, employeeNumber: e.employeeNumber }));
  source.sourceVersion = artFixtureHash(source.content);
  assert.ok(!s.concepts.some(r => ['993', '994', '998'].includes(r.conceptCode)), 'the official closure has no plain 993, 994 or 998 rows');
  const report = await prepareOwnOsepReport(source, osepOptions(source, ownClosedJurisdiction(s.employees[0], s.version).code)), row = report.rows[0];
  assert.equal(row.values.subjectSalaryCents, '20001'); assert.equal(row.values.netPayCents, '25250001');
  const fields = row.issues.map(i => i.code + '@' + i.fieldId);
  for (const field of ['subjectSalaryCents', 'netPayCents']) assert.ok(!fields.some(f => f.endsWith('@' + field)), field + ' is resolved without issues');
  assert.ok(!row.issues.some(i => i.code === 'NET_RECONCILIATION_MISMATCH'), '998 equals the official net saved by the closure');
  // A concept the closure does not carry is still reported; zero is never assumed.
  assert.ok(fields.includes('AMOUNT_SOURCE_MISSING@quotaCents'));
});

