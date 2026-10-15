import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PERIOD_CLASSIFICATION_VERSION as VERSION, periodClassificationPeriod as periodValid, periodClassificationScope as scope, periodClassificationDefinition as definition, periodClassificationProvenance as provenance, periodClassificationSource as source, periodClassificationCatalogue as catalogue, periodClassificationForFullPeriod as fullPeriod, periodClassificationPreparation as context, periodClassificationCommand as command, periodClassificationValidateProposal as validate, preparePeriodClassification as prepare, periodClassificationHash as hash, createPeriodClassificationAttempt as attempt, periodClassificationAttempt as recover } from '../assets/own-period-classification-model.js';
import {periodClassificationBootstrap as bootstrapModel, periodClassificationConfiguration as configurationModel, periodClassificationSummary as summaryModel, periodClassificationDetail as detailModel, periodClassificationReceipt as receiptModel, decidePeriodClassification as decide, periodClassificationRetainAttempt as retain, periodClassificationErrorGuidance as guidance} from '../assets/own-period-classification-model.js';

// All identities, references, codes and documentary facts are synthetic.
const id = n => 'aaaaaaaa-0000-4000-8000-' + String(n).padStart(12, '0');
const sha = n => String(n).repeat(64), period = '2026-09', reason = 'Encuadre histórico exclusivamente sintético QA';
const clone = v => structuredClone(v);
const fails = (fn, suffix) => assert.throws(fn, e => e.code === 'PERIOD_CLASSIFICATION_' + suffix);
const scoped = () => ({ tenantId: id(1), bindingId: id(2), companyId: 901 });
const def = () => ({ agreementCode: '01', categoryCode: '007', organizationId: '008', sectorCode: '009', jurisdictionCode: '42', startDate: '2020-02-29', endDate: null, effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-30', documentDate: '2026-10-14', documentReference: 'Constancia retrospectiva exclusivamente sintética QA' });
const own = () => ({ kind: 'native_registration', registrationId: id(5), requestSha256: sha('a') });
const adopted = () => ({ kind: 'employment_adoption_final', registrationId: id(5), requestSha256: sha('a'), adoptionProposalId: id(6), adoptionReviewId: id(7), sealSha256: sha('b'), finalRevision: { revisionId: id(8), packageSha256: sha('c'), sourceSha256: sha('d'), cutoff: '2026-10-01T15:17:29', coreManifestSha256: sha('e'), curatedManifestSha256: sha('f'), factsSha256: sha('1') } });
const src = (proof = own()) => ({ version: sha('2'), scope: scoped(), period, subject: { origin: 'MUNICONTROL', contractId: id(3), personId: id(4), registrationId: id(5), identityToken: sha('3') }, provenance: proof });
const cat = () => ({ version: sha('4'), items: [
 { kind: 'agreements', key: 'synthetic-agreement', code: '01', label: 'Convenio sintético', agreementCode: null, registrationAllowed: false },
 { kind: 'categories', key: 'synthetic-category', code: '007', label: 'Clase sintética', agreementCode: '01', registrationAllowed: false },
 { kind: 'organizations', key: 'synthetic-organization', code: '008', label: 'Sector organizativo sintético', agreementCode: null, registrationAllowed: false },
 { kind: 'sectors', key: 'synthetic-department', code: '009', label: 'Repartición sintética', agreementCode: null, registrationAllowed: false }
] });
const ctx = (proof = own()) => ({ version: VERSION, scope: scoped(), contractId: id(3), period, scopeVersion: sha('5'), baseVersion: sha('6'), source: src(proof), classification: cat(), canPropose: true });
const body = (proof = own()) => prepare(ctx(proof), def(), reason);

test('one own declaration preserves exact codes, retrospective document date and independent intervals', () => {
 const d = definition(def(), period);
 assert.deepEqual(d, def()); assert.equal(d.categoryCode, '007'); assert.equal(d.sectorCode, '009');
 assert.equal(d.documentDate, '2026-10-14'); assert.equal(d.startDate, '2020-02-29'); assert.equal(d.endDate, null);
 assert.equal(Object.isFrozen(d), true); assert.notEqual(d, def());
 assert.equal(periodValid('2026-09'), true);
 for (const p of ['2026-9', '2026-00', '2026-13', '2026-09-01', 202609, null]) assert.equal(periodValid(p), false);
});

test('null fields remain incomplete and are never populated by registration, package cutoff or catalogue', () => {
 const missing = { ...def(), agreementCode: null, categoryCode: null, organizationId: null, sectorCode: null, jurisdictionCode: null, startDate: null, endDate: null, effectiveFrom: null, effectiveUntil: null };
 for (const proof of [own(), adopted()]) {
  const prepared = prepare(ctx(proof), missing, reason);
  assert.deepEqual(prepared.definition, missing);
  fails(() => fullPeriod(prepared.definition, period, cat()), 'INCOMPLETE');
  assert.equal(prepared.reviewConfirmed, false); assert.equal(prepared.proposalId, null);
  assert.equal(Object.hasOwn(prepared, 'ready'), false); assert.equal(Object.hasOwn(prepared, 'eligible'), false);
 }
 for (const field of ['agreementCode', 'categoryCode', 'organizationId', 'sectorCode', 'jurisdictionCode', 'startDate', 'effectiveFrom', 'effectiveUntil']) fails(() => fullPeriod({ ...def(), [field]: null }, period, cat()), 'INCOMPLETE');
});

test('unreported is not empty, zero, a number, omission or a fabricated default', () => {
 for (const field of ['agreementCode', 'categoryCode', 'organizationId', 'sectorCode']) {
  for (const value of [0, 1, '', undefined, ' 01', '01 ', '-1', '1e2', '1.0', '1000000000']) assert.throws(() => definition({ ...def(), [field]: value }, period));
  const absent = def(); delete absent[field]; assert.throws(() => definition(absent, period));
 }
 for (const jurisdictionCode of [42, '042', '055', '56', '', undefined]) assert.throws(() => definition({ ...def(), jurisdictionCode }, period));
 assert.equal(definition({ ...def(), jurisdictionCode: '55' }, period).jurisdictionCode, '55');
 assert.equal(definition({ ...def(), agreementCode: '0' }, period).agreementCode, '0');
 fails(() => prepare(ctx(), { ...def(), agreementCode: '0' }, reason), 'CLASSIFICATION_UNKNOWN');
});

test('real civil dates are strict; no time zone truncation, calendar rollover or reversed interval', () => {
 for (const field of ['startDate', 'endDate', 'effectiveFrom', 'effectiveUntil', 'documentDate']) {
  for (const value of ['2026-02-29', '2026-02-30', '2026-09-31', '0000-01-01', '2026-09-01T00:00:00Z', '2026-9-1', '', 20260901, undefined]) assert.throws(() => definition({ ...def(), [field]: value }, period));
 }
 assert.throws(() => definition({ ...def(), documentDate: null }, period));
 assert.throws(() => definition({ ...def(), startDate: '2026-09-30', endDate: '2026-09-01' }, period));
 assert.throws(() => definition({ ...def(), effectiveFrom: '2026-09-30', effectiveUntil: '2026-09-01' }, period));
 assert.equal(definition({ ...def(), effectiveFrom: '2024-02-29', effectiveUntil: '2026-09-30' }, period).effectiveFrom, '2024-02-29');
});

test('partial employment or classification stays an explicit draft and cannot represent a complete month', () => {
 for (const patch of [{ effectiveFrom: '2026-09-02' }, { effectiveUntil: '2026-09-29' }, { startDate: '2026-09-02' }, { endDate: '2026-09-29' }, { effectiveFrom: '2026-10-01', effectiveUntil: '2026-10-31' }, { effectiveFrom: '2026-08-01', effectiveUntil: '2026-08-31' }]) {
  const d = { ...def(), ...patch }, prepared = prepare(ctx(), d, reason);
  assert.deepEqual(prepared.definition, d); fails(() => fullPeriod(d, period, cat()), 'PARTIAL_PERIOD');
 }
 for (const patch of [{ segments: [def(), { ...def(), categoryCode: '008' }] }, { recognizedUnits: '30' }, { monthlyHours: '160' }, { percentage: '100' }, { dominantAgreementCode: '01' }]) assert.throws(() => definition({ ...def(), ...patch }, period));
 assert.throws(() => definition([def(), def()], period));
 assert.deepEqual(fullPeriod(def(), period, cat()), def());
});

test('full-month coverage uses the real leap-year boundary without replacing declared dates', () => {
 const leap = { ...def(), effectiveFrom: '2024-02-01', effectiveUntil: '2024-02-29' };
 assert.deepEqual(fullPeriod(leap, '2024-02', cat()), leap);
 fails(() => fullPeriod({ ...leap, effectiveUntil: '2024-02-28' }, '2024-02', cat()), 'PARTIAL_PERIOD');
 const december = { ...def(), effectiveFrom: '2026-12-01', effectiveUntil: '2026-12-31' };
 assert.deepEqual(fullPeriod(december, '2026-12', cat()), december);
});

test('new own employees require no GRH antecedent while adopted provenance keeps every exact package anchor', () => {
 assert.deepEqual(provenance(own()), own()); assert.deepEqual(provenance(adopted()), adopted());
 assert.equal(body().provenance.kind, 'native_registration');
 const p = body(adopted()); assert.deepEqual(p.provenance, adopted());
 assert.equal(p.definition.effectiveFrom, '2026-09-01'); assert.equal(p.provenance.finalRevision.cutoff, '2026-10-01T15:17:29');
 assert.equal(Object.isFrozen(p.provenance.finalRevision), true);
 for (const key of Object.keys(adopted())) { const v = adopted(); delete v[key]; assert.throws(() => provenance(v)); }
 for (const key of Object.keys(adopted().finalRevision)) { const v = adopted(); delete v.finalRevision[key]; assert.throws(() => provenance(v)); }
 assert.throws(() => provenance({ ...own(), kind: 'GRH' }));
 assert.throws(() => provenance({ ...own(), finalRevision: adopted().finalRevision }));
 assert.throws(() => provenance({ ...adopted(), kind: 'native_registration' }));
 for (const extra of ['effectiveFrom', 'sourcePayload', 'beforeContract', 'nominalRows', 'dumpBytes']) assert.throws(() => provenance({ ...adopted(), [extra]: 'not permitted' }));
});

test('package cutoffs are exact local instants with calendar validation, never a hardcoded applicability date', () => {
 for (const valid of ['2024-02-29T23:59:59', '2026-11-01T00:00:00']) assert.equal(provenance({ ...adopted(), finalRevision: { ...adopted().finalRevision, cutoff: valid } }).finalRevision.cutoff, valid);
 for (const invalid of ['2026-02-29T15:17:29', '2026-10-01T24:00:00', '2026-10-01T15:60:00', '2026-10-01T15:17:60', '2026-10-01T15:17:29Z', '2026-10-01', null]) assert.throws(() => provenance({ ...adopted(), finalRevision: { ...adopted().finalRevision, cutoff: invalid } }));
 for (const key of ['requestSha256', 'sealSha256']) assert.throws(() => provenance({ ...adopted(), [key]: 'A'.repeat(64) }));
 for (const key of ['packageSha256', 'sourceSha256', 'coreManifestSha256', 'curatedManifestSha256', 'factsSha256']) assert.throws(() => provenance({ ...adopted(), finalRevision: { ...adopted().finalRevision, [key]: 'short' } }));
});

test('source binds the own registration to exact contract/person and municipal scope without nominal data', () => {
 assert.deepEqual(source(src()), src()); assert.deepEqual(scope(scoped()), scoped());
 for (const patch of [{ origin: 'GRH' }, { registrationId: id(99) }, { personId: null }, { contractId: '00000000-0000-0000-0000-000000000000' }, { identityToken: 'short' }, { legajo: 'private' }, { employeeName: 'private' }]) assert.throws(() => source({ ...src(), subject: { ...src().subject, ...patch } }));
 for (const patch of [{ companyId: '901' }, { companyId: 0 }, { companyId: 1.5 }, { membershipId: id(99) }, { tenantId: null }]) assert.throws(() => scope({ ...scoped(), ...patch }));
 for (const patch of [{ scope: { ...scoped(), tenantId: id(99) } }, { scope: { ...scoped(), bindingId: id(99) } }, { scope: { ...scoped(), companyId: 902 } }, { period: '2026-10' }, { subject: { ...src().subject, contractId: id(99) } }]) fails(() => context({ ...ctx(), source: { ...src(), ...patch } }), 'SOURCE_CHANGED');
});

test('imported identity UUIDs do not inherit the dedicated v4 request-key restriction', async () => {
 const c = ctx(adopted());
 c.scope.tenantId = 'bbbbbbbb-0000-7000-9000-000000000001';
 c.scope.bindingId = 'bbbbbbbb-0000-af68-2149-000000000002';
 c.source.scope = clone(c.scope);
 c.contractId = 'bbbbbbbb-0000-af68-2149-000000000003';
 c.source.subject.contractId = c.contractId;
 c.source.subject.personId = 'bbbbbbbb-0000-1000-9000-000000000004';
 c.source.subject.registrationId = 'bbbbbbbb-0000-7000-9000-000000000005';
 c.source.provenance.registrationId = c.source.subject.registrationId;
 c.source.provenance.adoptionProposalId = 'bbbbbbbb-0000-5000-9000-000000000006';
 c.source.provenance.adoptionReviewId = 'bbbbbbbb-0000-af68-2149-000000000007';
 c.source.provenance.finalRevision.revisionId = 'bbbbbbbb-0000-7000-9000-000000000008';
 const p = prepare(c, def(), reason);
 assert.equal(p.contractId, c.contractId); assert.deepEqual(p.provenance, c.source.provenance);
 assert.equal((await attempt(p, id(20))).key, id(20));
 await assert.rejects(attempt(p, c.contractId));
});

test('historical codes must exist exactly and category must belong to the declared agreement', () => {
 for (const field of ['agreementCode', 'categoryCode', 'organizationId', 'sectorCode']) fails(() => prepare(ctx(), { ...def(), [field]: '999' }, reason), 'CLASSIFICATION_UNKNOWN');
 fails(() => prepare(ctx(), { ...def(), agreementCode: '1' }, reason), 'CLASSIFICATION_UNKNOWN');
 fails(() => prepare(ctx(), { ...def(), organizationId: '009', sectorCode: '008' }, reason), 'CLASSIFICATION_UNKNOWN');
 const c = ctx(); c.classification.items.push({ kind: 'agreements', key: 'other-agreement', code: '02', label: 'Otro convenio sintético', agreementCode: null, registrationAllowed: false });
 fails(() => prepare(c, { ...def(), agreementCode: '02' }, reason), 'CLASSIFICATION_UNKNOWN');
 assert.equal(prepare(ctx(), { ...def(), agreementCode: null }, reason).definition.agreementCode, null);
 c.classification.items.push({ kind: 'categories', key: 'other-category', code: '007', label: 'Clase de otro convenio sintético', agreementCode: '02', registrationAllowed: false });
 fails(() => prepare(c, { ...def(), agreementCode: null }, reason), 'CLASSIFICATION_UNKNOWN');
});

test('historical classification does not reuse the registrationAllowed flag as an eligibility grant', () => {
 const original = cat(), prepared = prepare(ctx(), def(), reason);
 assert.equal(prepared.classificationVersion, original.version);
 assert.deepEqual(fullPeriod(def(), period, original), def());
 assert.equal(catalogue(original).items.every(r => r.registrationAllowed === false), true);
 assert.deepEqual(original, cat());
 const old = cat(); for (const r of old.items) delete r.registrationAllowed;
 assert.equal(catalogue(old).items.some(r => Object.hasOwn(r, 'registrationAllowed')), false);
});

test('validating a versioned catalogue preserves every published row key and original order', () => {
 const original = cat(); original.items.reverse();
 const result = catalogue(original), prepared = context({ ...ctx(), classification: original });
 assert.deepEqual(result, original); assert.deepEqual(prepared.classification, original);
 assert.equal(result.items[0].key, 'synthetic-department'); assert.equal(result.items[3].key, 'synthetic-agreement');
 original.items[0].key = 'edited local draft'; original.items.reverse();
 assert.equal(result.items[0].key, 'synthetic-department'); assert.equal(prepared.classification.items[3].key, 'synthetic-agreement');
 assert.equal(Object.isFrozen(result.items), true); assert.equal(Object.isFrozen(result.items[0]), true);
});

test('catalogue rejects omissions, ambiguous rows and normalization of a published reference', () => {
 for (const change of [c => c.items.pop(), c => c.items.push(clone(c.items[0])), c => delete c.items[0].registrationAllowed, c => c.items[0].label = ' padded ', c => c.items[0].rawSql = 'private', c => c.extra = 'unknown']) { const c = cat(); change(c); assert.throws(() => catalogue(c)); }
 const sparse = cat(); delete sparse.items[0]; assert.throws(() => catalogue(sparse));
 const decorated = cat(); decorated.items.extra = true; assert.throws(() => catalogue(decorated));
});

test('preparation permits declarations only and respects the existing proposal capability', () => {
 const p = body(adopted()); assert.deepEqual(command(p), p); assert.equal(p.command, 'propose'); assert.equal(p.reviewConfirmed, false);
 fails(() => prepare({ ...ctx(), canPropose: false }, def(), reason), 'FORBIDDEN');
 for (const patch of [{ command: 'approve' }, { command: 'adopt' }, { command: 'calculate' }, { reviewConfirmed: true }, { proposalId: id(99) }, { proposalSha256: sha('a') }, { payrollCalculated: true }, { payrollPosted: false }, { actorPersonId: id(4) }, { formula: 'x' }]) assert.throws(() => command({ ...p, ...patch }));
 for (const field of ['scopeVersion', 'baseVersion', 'sourceVersion', 'classificationVersion', 'identityToken']) assert.throws(() => command({ ...p, [field]: null }));
 for (const reference of ['', ' QA', '<tag>', 'texto\ncontrol', 'e\u0301']) assert.throws(() => prepare(ctx(), { ...def(), documentReference: reference }, reason));
 for (const invalidReason of ['short', ' motivo sin recortar', 'motivo\ncon control', 'R'.repeat(1001)]) assert.throws(() => prepare(ctx(), def(), invalidReason));
});

test('trusted context validation rejects every changed immutable source anchor without altering the draft', () => {
 const p = body(adopted()), original = clone(p), preparation = ctx(adopted());
 for (const field of ['scopeVersion', 'baseVersion', 'sourceVersion', 'classificationVersion', 'identityToken']) fails(() => validate({ ...p, [field]: sha('9') }, preparation), 'SOURCE_CHANGED');
 for (const patch of [{ contractId: id(99) }, { period: '2026-10' }, { scope: { ...p.scope, tenantId: id(99) } }, { scope: { ...p.scope, bindingId: id(99) } }, { scope: { ...p.scope, companyId: 902 } }]) fails(() => validate({ ...p, ...patch }, preparation), 'SOURCE_CHANGED');
 for (const field of ['registrationId', 'adoptionProposalId', 'adoptionReviewId']) fails(() => validate({ ...p, provenance: { ...p.provenance, [field]: id(99) } }, preparation), 'SOURCE_CHANGED');
 for (const field of ['requestSha256', 'sealSha256']) fails(() => validate({ ...p, provenance: { ...p.provenance, [field]: sha('9') } }, preparation), 'SOURCE_CHANGED');
 for (const field of Object.keys(p.provenance.finalRevision)) {
  const value = field === 'revisionId' ? id(99) : field === 'cutoff' ? '2026-11-01T00:00:00' : sha('9');
  fails(() => validate({ ...p, provenance: { ...p.provenance, finalRevision: { ...p.provenance.finalRevision, [field]: value } } }, preparation), 'SOURCE_CHANGED');
 }
 fails(() => validate({ ...p, provenance: own() }, preparation), 'SOURCE_CHANGED');
 assert.deepEqual(p, original);
});

test('preparation freezes detached nested copies without freezing or mutating editable inputs', () => {
 const c = ctx(adopted()), d = def(), originals = { c: clone(c), d: clone(d) }, p = prepare(c, d, reason);
 assert.deepEqual(c, originals.c); assert.deepEqual(d, originals.d); assert.equal(Object.isFrozen(c), false);
 d.categoryCode = '999'; c.source.provenance.finalRevision.packageSha256 = sha('9'); c.scope.companyId = 902;
 assert.equal(p.definition.categoryCode, '007'); assert.equal(p.provenance.finalRevision.packageSha256, sha('c')); assert.equal(p.scope.companyId, 901);
 for (const target of [p, p.scope, p.definition, p.provenance, p.provenance.finalRevision]) assert.equal(Object.isFrozen(target), true);
 assert.throws(() => { p.definition.effectiveFrom = '2026-10-01'; }, TypeError);
});

test('JSON shapes reject accessors and hidden/inherited/executable fields before reading them', () => {
 let reads = 0;
 const contexts = [
  [def(), 'agreementCode', v => definition(v, period)],
  [adopted(), 'kind', provenance],
  [adopted().finalRevision, 'cutoff', v => provenance({ ...adopted(), finalRevision: v })],
  [src(), 'provenance', source],
  [scoped(), 'companyId', scope],
  [ctx(), 'source', context],
  [body(), 'definition', command],
  [cat(), 'items', catalogue],
  [cat().items[0], 'code', v => catalogue({ ...cat(), items: [v, ...cat().items.slice(1)] })]
 ];
 for (const [v, field, check] of contexts) {
  const accessor = clone(v); Object.defineProperty(accessor, field, { enumerable: true, get() { reads++; return v[field]; } }); assert.throws(() => check(accessor));
  const inherited = Object.assign(Object.create({ extra: true }), v); assert.throws(() => check(inherited));
  const hidden = clone(v); Object.defineProperty(hidden, 'extra', { value: true }); assert.throws(() => check(hidden));
  const symbolic = clone(v); symbolic[Symbol('extra')] = true; assert.throws(() => check(symbolic));
  const executable = clone(v); executable.toJSON = () => v; assert.throws(() => check(executable));
 }
 const c = cat(); Object.defineProperty(c.items, '0', { enumerable: true, get() { reads++; return cat().items[0]; } }); assert.throws(() => catalogue(c));
 assert.equal(reads, 0);
});

test('request hashes bind all exact facts and provenance while ignoring only object-key ordering', async () => {
 const b = body(adopted()), canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
 const expected = createHash('sha256').update(JSON.stringify(canonical(b))).digest('hex');
 assert.equal(await hash(b), expected);
 assert.equal(await hash(Object.fromEntries(Object.entries(b).reverse())), expected);
 for (const changed of [{ ...b, definition: { ...b.definition, categoryCode: '008' } }, { ...b, definition: { ...b.definition, endDate: '2026-10-01' } }, { ...b, definition: { ...b.definition, effectiveUntil: null } }, { ...b, provenance: { ...b.provenance, sealSha256: sha('9') } }, { ...b, provenance: { ...b.provenance, finalRevision: { ...b.provenance.finalRevision, factsSha256: sha('9') } } }]) assert.notEqual(await hash(changed), expected);
});

test('attempt creation snapshots before asynchronous hashing and never generates a request key', async () => {
 const b = clone(body(adopted())), pending = attempt(b, id(20));
 b.definition.categoryCode = '999'; b.provenance.finalRevision.factsSha256 = sha('9');
 const saved = await pending;
 assert.equal(saved.body.definition.categoryCode, '007'); assert.equal(saved.body.provenance.finalRevision.factsSha256, sha('1')); assert.equal(saved.key, id(20));
 assert.equal(saved.requestSha256, await hash(saved.body)); assert.equal(Object.isFrozen(saved.body.definition), true);
 for (const key of [undefined, null, '', 'aaaaaaaa-0000-5000-8000-000000000020']) await assert.rejects(attempt(body(), key));
});

test('old attempts retain exact body/key/provenance after context refresh, while new preparation is rejected', async () => {
 const saved = await attempt(body(adopted()), id(20)), original = clone(saved), refreshed = ctx(adopted());
 refreshed.source.version = sha('9'); refreshed.source.subject.identityToken = sha('9'); refreshed.source.provenance.finalRevision.packageSha256 = sha('9');
 fails(() => validate(saved.body, refreshed), 'SOURCE_CHANGED');
 const recovered = await recover(clone(saved)); assert.deepEqual(recovered, original); assert.deepEqual(saved, original);
 assert.equal(recovered.body.sourceVersion, sha('2')); assert.equal(recovered.body.provenance.finalRevision.packageSha256, sha('c'));
 const revoked = { ...refreshed, canPropose: false }; fails(() => validate(saved.body, revoked), 'FORBIDDEN');
 assert.deepEqual(await recover(saved), original);
});

test('attempt recovery rejects changed content/hash and never mutates the uncertain request', async () => {
 const saved = await attempt(body(adopted()), id(20)), original = clone(saved);
 for (const edit of [v => v.body.definition.agreementCode = '02', v => v.body.definition.effectiveFrom = null, v => v.body.provenance.finalRevision.sourceSha256 = sha('9'), v => v.body.reason = 'Otro fundamento exclusivamente sintético', v => v.requestSha256 = sha('9'), v => v.extra = true]) { const changed = clone(saved); edit(changed); await assert.rejects(recover(changed)); }
 let reads = 0; const accessor = clone(saved); Object.defineProperty(accessor, 'body', { enumerable: true, get() { reads++; return saved.body; } }); await assert.rejects(recover(accessor)); assert.equal(reads, 0);
 const changing = clone(saved), pending = recover(changing); changing.key = id(21); changing.requestSha256 = sha('9'); changing.body.definition.categoryCode = '999';
 assert.deepEqual(await pending, original); assert.deepEqual(saved, original);
});

const emptyConfiguration = () => ({version:sha('6'),revision:0,definition:null,proposalId:null,approvalId:null,sourceVersion:null,identityToken:null,provenance:null,classificationVersion:null});
const proposalSummary = async (b=body(adopted())) => ({id:id(30),requestSha256:await hash(b),baseVersion:b.baseVersion,sourceVersion:b.sourceVersion,classificationVersion:b.classificationVersion,reason:b.reason,createdAt:'2026-10-14T12:00:00+00:00',authorLabel:'Autor exclusivamente sintético QA',canReview:true,status:'pending',decision:null});
const reviewingBootstrap = async (b=body(adopted())) => ({version:VERSION,preparation:{...ctx(adopted()),scopeVersion:sha('7')},configuration:emptyConfiguration(),proposals:[await proposalSummary(b)],permissions:{canPropose:true,canReview:true},complete:true,payrollCalculated:false,payrollPosted:false});
const proposalDetail = async (b=body(adopted())) => ({version:VERSION,scopeVersion:sha('7'),proposal:await proposalSummary(b),body:b,baseDefinition:null,source:src(adopted()),classification:cat(),current:true});
const eventReceipt = async (b=body(adopted()), key=id(40)) => ({version:VERSION,eventId:b.command==='propose'?id(30):id(31),proposalId:b.command==='propose'?id(30):b.proposalId,requestKey:key,requestSha256:await hash(b),body:b,status:({propose:'pending',approve:'approved',reject:'rejected'})[b.command],revision:b.command==='approve'?1:0,configurationVersion:b.command==='approve'?sha('8'):b.baseVersion,replayed:false,payrollCalculated:false,payrollPosted:false});

test('bootstrap preserves the original preparation contract and requires a coherent complete revision/history',async()=>{
 const b=await reviewingBootstrap(), checked=bootstrapModel(b);assert.deepEqual(checked,b);assert.equal(Object.isFrozen(checked.preparation.source.provenance.finalRevision),true);
 for(const patch of[{complete:false},{payrollCalculated:true},{payrollPosted:true},{permissions:{canPropose:false,canReview:true}},{configuration:{...emptyConfiguration(),version:sha('9')}},{proposals:[b.proposals[0],b.proposals[0]]},{proposals:Array(2)}])assert.throws(()=>bootstrapModel({...b,...patch}));
 const readOnly=clone(b);readOnly.preparation.canPropose=false;readOnly.permissions={canPropose:false,canReview:false};readOnly.proposals[0].canReview=false;assert.doesNotThrow(()=>bootstrapModel(readOnly));
 readOnly.proposals[0].canReview=true;assert.throws(()=>bootstrapModel(readOnly));
});
test('revision zero keeps all facts null; approved revisions preserve the original source without recataloguing history',()=>{
 assert.deepEqual(configurationModel(emptyConfiguration(),period),emptyConfiguration());
 for(const field of Object.keys(emptyConfiguration()).slice(2))assert.throws(()=>configurationModel({...emptyConfiguration(),[field]:field==='definition'?def():id(99)},period));
 const approved={version:sha('8'),revision:1,definition:def(),proposalId:id(30),approvalId:id(31),sourceVersion:sha('2'),identityToken:sha('3'),provenance:adopted(),classificationVersion:sha('4')};assert.deepEqual(configurationModel(approved,period),approved);
 for(const patch of[{approvalId:null},{revision:1001},{definition:{...def(),effectiveUntil:'2026-09-29'}},{definition:{...def(),categoryCode:null}}])assert.throws(()=>configurationModel({...approved,...patch},period));
 const oldCode={...approved,definition:{...def(),categoryCode:'999'}};assert.equal(configurationModel(oldCode,period).definition.categoryCode,'999');
});
test('decided summaries cannot remain reviewable or invent a decision or civil timestamp',async()=>{
 const pending=await proposalSummary();assert.deepEqual(summaryModel(pending),pending);
 const approved={...pending,status:'approved',canReview:false,decision:{command:'approve',reason,actorLabel:'Revisora sintética QA',recordedAt:'2026-10-14T12:05:00Z',revision:1}};assert.deepEqual(summaryModel(approved),approved);
 for(const patch of[{canReview:true},{decision:null},{decision:{...approved.decision,command:'reject'}},{decision:{...approved.decision,revision:0}},{createdAt:'2026-02-30T12:00:00Z'}])assert.throws(()=>summaryModel({...approved,...patch}));
});
test('detail verifies the original declaration hash and matching source/catalog/identity references',async()=>{
 const d=await proposalDetail(), checked=await detailModel(d);assert.deepEqual(checked,d);
 for(const edit of[v=>v.proposal.requestSha256=sha('9'),v=>v.body.provenance.finalRevision.packageSha256=sha('9'),v=>v.source.scope.companyId=902,v=>v.source.subject.identityToken=sha('9'),v=>v.classification.version=sha('9'),v=>v.body.reason='Otro fundamento exclusivamente sintético QA',v=>v.source.provenance.registrationId=id(99)]){const altered=clone(d);edit(altered);await assert.rejects(detailModel(altered));}
 const changing=clone(d), pending=detailModel(changing);changing.body.definition.categoryCode='999';changing.proposal.requestSha256=sha('9');assert.deepEqual(await pending,d);
});
test('review decisions use reviewer scope and original references with null facts; approval requires a full current month',async()=>{
 const b=await reviewingBootstrap(), d=await proposalDetail(), originals={b:clone(b),d:clone(d)}, approved=await decide(b,d,'approve',reason);
 assert.equal(approved.scopeVersion,sha('7'));assert.equal(approved.command,'approve');assert.equal(approved.proposalId,id(30));assert.equal(approved.proposalSha256,d.proposal.requestSha256);assert.equal(approved.sourceVersion,d.body.sourceVersion);
 assert.equal(approved.identityToken,null);assert.equal(approved.provenance,null);assert.equal(approved.definition,null);assert.equal(approved.reviewConfirmed,true);assert.deepEqual(b,originals.b);assert.deepEqual(d,originals.d);
 for(const patch of[{definition:def()},{provenance:adopted()},{identityToken:sha('3')},{reviewConfirmed:false},{actorPersonId:id(99)}])assert.throws(()=>command({...approved,...patch}));
 const saved=await attempt(approved,id(40));assert.deepEqual(await recover(saved),saved);
 const incomplete={...body(adopted()),definition:{...def(),effectiveFrom:null}}, ib=await reviewingBootstrap(incomplete), detail=await proposalDetail(incomplete);
 await assert.rejects(decide(ib,detail,'approve',reason),e=>e.code==='PERIOD_CLASSIFICATION_INCOMPLETE');assert.equal((await decide(ib,detail,'reject',reason)).command,'reject');
});
test('stale proposal remains rejectable without replacing its original source or request hash',async()=>{
 const b=await reviewingBootstrap(), d=await proposalDetail();b.preparation.baseVersion=sha('9');b.configuration.version=sha('9');b.preparation.source.version=sha('a');b.preparation.classification.version=sha('b');d.current=false;
 await assert.rejects(decide(b,d,'approve',reason),e=>e.code==='PERIOD_CLASSIFICATION_BASE_CHANGED');const rejected=await decide(b,d,'reject',reason);
 assert.equal(rejected.baseVersion,sha('6'));assert.equal(rejected.sourceVersion,sha('2'));assert.equal(rejected.classificationVersion,sha('4'));assert.equal(rejected.proposalSha256,d.proposal.requestSha256);
 for(const patch of[{permissions:{canPropose:true,canReview:false}},{proposals:[]}])await assert.rejects(decide({...b,...patch},d,'reject',reason));
 const foreign=clone(b);foreign.preparation.contractId=id(99);foreign.preparation.source.subject.contractId=id(99);await assert.rejects(decide(foreign,d,'reject',reason));
});
test('event receipts correlate with frozen attempts for all commands and refuse substituted results',async()=>{
 const b=await reviewingBootstrap(), d=await proposalDetail();
 for(const cmd of[body(adopted()),await decide(b,d,'approve',reason),await decide(b,d,'reject',reason)]){
  const original=await attempt(cmd,id(40)), r=await eventReceipt(cmd), checked=await receiptModel(r,original);assert.deepEqual(checked,r);
  for(const patch of[{requestKey:id(41)},{requestSha256:sha('9')},{payrollCalculated:true},{payrollPosted:true},{status:'different'}])await assert.rejects(receiptModel({...r,...patch},original));
  const replay=await receiptModel({...r,replayed:true},original);assert.equal(replay.replayed,true);assert.deepEqual(replay.body,original.body);
 }
 const r=clone(await eventReceipt()), before=clone(r), pending=receiptModel(r);r.revision=999;r.body.definition.effectiveFrom=null;assert.deepEqual(await pending,before);
});
test('uncertain attempts and permission withdrawal keep original bytes without an automatic resubmission decision',()=>{
 assert.equal(retain({status:503},{key:id(40)}),true);assert.equal(retain({status:409,code:'PERIOD_CLASSIFICATION_BUSY'},{key:id(40)}),true);assert.equal(retain({status:403},{uncertain:true}),true);assert.equal(retain({status:403},{key:id(40)},true),true);
 assert.equal(retain({status:422,code:'PERIOD_CLASSIFICATION_INCOMPLETE'},{key:id(40)}),false);assert.match(guidance({status:403,code:'PERIOD_CLASSIFICATION_INDEPENDENT_REQUIRED'}),/otra persona/);
});
