import { createHash } from 'node:crypto';
import { prepareEmployeeFamily, validateEmployeeFamilyContext } from './internal-family-members.js';

// Offline/server preparation only. No SQL, network, identity minting or authority.
// The writer must independently resolve the signed-in actor and re-read evidence.
const HEX = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const DECIMAL = /^(?:0|[1-9][0-9]{0,19})$/;
const own = (v, k) => Object.prototype.hasOwnProperty.call(v, k);
const record = v => v !== null && typeof v === 'object' && !Array.isArray(v)
  && [Object.prototype, null].includes(Object.getPrototypeOf(v));
function fail(code) { const e = new Error(`ADOPTED_FAMILY_${code}`); e.code = e.message; throw e; }
function exact(v, keys) {
  if (!record(v) || Object.keys(v).length !== keys.length || keys.some(k => !own(v, k))) fail('INPUT_SHAPE');
}
function text(v, max = 256) { return typeof v === 'string' && v.length > 0 && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v); }
function civil(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || v < '1900-01-01' || v > '2100-12-31') return false;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
function canonical(v) {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return JSON.stringify(v);
  if (typeof v === 'number' && Number.isSafeInteger(v)) return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (!record(v)) fail('NON_JSON_VALUE');
  return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
}
export function familyPreparationDigest(v) { return createHash('sha256').update(canonical(v), 'utf8').digest('hex'); }
const sortBy = (rows, key) => [...rows].sort((a, b) => a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0);
export function familyPreparationInputPins({ cohort, rows }) {
  return { cohortSha256: familyPreparationDigest(sortBy(cohort, 'contractId')),
    rowsSha256: familyPreparationDigest(sortBy(rows, 'familyId')) };
}
function uniqueMap(rows, key, code) {
  const map = new Map();
  for (const row of rows) { if (map.has(row[key])) fail(code); map.set(row[key], row); }
  return map;
}
function add(map, key, row) { if (!map.has(key)) map.set(key, []); map.get(key).push(row); }
function sourceKey(scope, source, subject, row) {
  // Stable across captures: a changed source row is a conflict, never a new child.
  return familyPreparationDigest({ version: 'adopted-family-source-key.v1',
    tenantId: scope.tenantId, sourceBindingId: scope.sourceBindingId, registrationId: subject.registrationId,
    sourceDatabase: source.database, companyId: row.companyId, legajo: row.legajo, familyId: row.familyId });
}
function normalizedValues(row, asOfDate) {
  const issues = [];
  const familyName = typeof row.familyName === 'string' ? row.familyName.normalize('NFC').trim().replace(/\s+/gu, ' ') : null;
  if (!familyName || Array.from(familyName).length > 180 || !/\p{L}/u.test(familyName)
    || /[\u0000-\u001f\u007f<>]/.test(row.familyName ?? '')) issues.push('source_name_requires_review');
  let dni = row.dni;
  if (dni !== null) {
    if (typeof dni !== 'string' || !/^[0-9. -]+$/.test(dni)) issues.push('source_dni_requires_review');
    else { dni = dni.replace(/[. -]/g, ''); if (!/^[0-9]{5,12}$/.test(dni) || /^0+$/.test(dni)) issues.push('source_dni_requires_review'); }
  }
  if (![row.birthDate, row.endDate].every(v => v === null || civil(v))
    || row.birthDate !== null && row.birthDate > asOfDate
    || row.birthDate !== null && row.endDate !== null && row.endDate < row.birthDate) issues.push('source_dates_require_review');
  return { issues, values: { familyName, birthDate: row.birthDate, dni, validFrom: null, validTo: row.endDate } };
}
const COHORT_KEYS = ['contractId','personId','registrationId','decisionId','decision','applicationXid','decisionXid',
  'tenantId','sourceBindingId','beforeContractId','beforePersonId','beforeSourceSystem','beforeTenantId','beforeSourceBatchId',
  'companyId','legajo','currentSourceSystem','currentSourceBatchId','currentNativeRegistrationId',
  'registeredContractId','registeredPersonId','registeredTenantId','registeredSourceBindingId','afterContractSha256','currentContractSha256'];
const ROW_KEYS = ['familyId','importRunId','companyId','legajo','relationshipCode','familyName','birthDate','dni','endDate',
  'identityNameKey','sourceRowSha256','sourcePayloadSha256'];

export function prepareAdoptedFamilyBatch(input) {
  exact(input, ['version','scope','source','manifest','asOfDate','cohort','rows','ownMembers','sourceLinks']);
  if (input.version !== 'adopted-family-preparation-input.v1' || !civil(input.asOfDate)) fail('INPUT_VERSION_OR_DATE');
  exact(input.scope, ['tenantId','sourceBindingId']);
  if (!Object.values(input.scope).every(v => UUID.test(v))) fail('SCOPE');
  exact(input.source, ['system','database','companyId','batchId','importRunId','cutoff','sourceSha256','relationship']);
  const { source, scope } = input;
  if (source.system !== 'GRH' || !text(source.database,128) || !DECIMAL.test(source.companyId)
    || !UUID.test(source.batchId) || !DECIMAL.test(source.importRunId) || !HEX.test(source.sourceSha256)
    || typeof source.cutoff !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(source.cutoff)
    || !Number.isFinite(Date.parse(source.cutoff))) fail('SOURCE');
  exact(source.relationship, ['id','code','name','label','evidenceSha256']);
  if (source.relationship.id !== '2' || source.relationship.code !== 'H' || source.relationship.name !== 'HIJO'
    || source.relationship.label !== 'HIJO' || !HEX.test(source.relationship.evidenceSha256)) fail('CHILD_MAPPING');
  exact(input.manifest, ['cohortCount','rowCount','cohortSha256','rowsSha256']);
  for (const key of ['cohort','rows','ownMembers','sourceLinks']) {
    if (!Array.isArray(input[key]) || input[key].length > 10000 || !input[key].every(record)) fail('BOUNDED_ARRAY');
  }
  if (!input.cohort.length || input.manifest.cohortCount !== input.cohort.length || input.manifest.rowCount !== input.rows.length) fail('INCOMPLETE_CAPTURE');
  const pins = familyPreparationInputPins(input);
  if (pins.cohortSha256 !== input.manifest.cohortSha256 || pins.rowsSha256 !== input.manifest.rowsSha256) fail('INPUT_EVIDENCE_CHANGED');
  uniqueMap(input.cohort,'contractId','DUPLICATE_CONTRACT'); uniqueMap(input.cohort,'registrationId','DUPLICATE_REGISTRATION');
  const byLegajo = new Map();
  for (const c of input.cohort) {
    exact(c, COHORT_KEYS);
    if (![c.contractId,c.personId,c.registrationId,c.decisionId].every(v => UUID.test(v))
      || c.decision !== 'approve' || !DECIMAL.test(c.applicationXid) || c.applicationXid !== c.decisionXid
      || c.tenantId !== scope.tenantId || c.sourceBindingId !== scope.sourceBindingId
      || c.beforeContractId !== c.contractId || c.beforePersonId !== c.personId || c.beforeSourceSystem !== 'GRH'
      || c.beforeTenantId !== null || c.beforeSourceBatchId !== source.batchId || c.companyId !== source.companyId || !text(c.legajo,64)
      || c.currentSourceSystem !== 'MUNICONTROL' || c.currentSourceBatchId !== null || c.currentNativeRegistrationId !== c.registrationId
      || c.registeredContractId !== c.contractId || c.registeredPersonId !== c.personId || c.registeredTenantId !== scope.tenantId
      || c.registeredSourceBindingId !== scope.sourceBindingId || !HEX.test(c.afterContractSha256)
      || c.afterContractSha256 !== c.currentContractSha256) fail('ADOPTION_PROVENANCE');
    if (byLegajo.has(c.legajo)) fail('AMBIGUOUS_LEGAJO'); byLegajo.set(c.legajo,c);
  }
  uniqueMap(input.rows,'familyId','DUPLICATE_SOURCE_ID');
  const members = uniqueMap(input.ownMembers,'id','DUPLICATE_OWN_ID');
  const links = uniqueMap(input.sourceLinks,'sourceKey','DUPLICATE_SOURCE_LINK');
  const ownByDni = new Map(), ownByName = new Map();
  for (const m of input.ownMembers) {
    exact(m,['id','tenantId','sourceBindingId','contractId','personId','registrationId','identityToken','identityNameKey','birthDate','dni']);
    if (![m.id,m.contractId,m.personId,m.registrationId].every(v => UUID.test(v)) || !HEX.test(m.identityToken)
      || m.tenantId !== scope.tenantId || m.sourceBindingId !== scope.sourceBindingId || !text(m.identityNameKey,180)) fail('OWN_MEMBER_SCOPE');
    if (m.dni !== null) add(ownByDni,`${m.contractId}\0${m.dni}`,m);
    add(ownByName,`${m.contractId}\0${m.identityNameKey}`,m);
  }
  for (const l of input.sourceLinks) {
    exact(l,['sourceKey','tenantId','sourceBindingId','contractId','registrationId','sourceRowSha256','sourceProjectionSha256','memberId','memberIdentityToken']);
    if (![l.sourceKey,l.sourceRowSha256,l.sourceProjectionSha256,l.memberIdentityToken].every(v => HEX.test(v))
      || l.tenantId !== scope.tenantId || l.sourceBindingId !== scope.sourceBindingId) fail('SOURCE_LINK_SCOPE');
  }
  const resultRows = [], sourceByDni = new Map(), sourceByName = new Map();
  for (const r of input.rows) {
    exact(r,ROW_KEYS); const c = byLegajo.get(r.legajo);
    if (!DECIMAL.test(r.familyId) || r.importRunId !== source.importRunId || r.companyId !== source.companyId || !c
      || ![r.sourceRowSha256,r.sourcePayloadSha256].every(v => HEX.test(v))
      || !(r.relationshipCode === null || text(r.relationshipCode,32))
      || !(r.identityNameKey === null || text(r.identityNameKey,180))) fail('SOURCE_ROW_SCOPE');
    const key = sourceKey(scope,source,c,r), normalized = normalizedValues(r,input.asOfDate);
    const row = { sourceKey:key,contractId:c.contractId,personId:c.personId,registrationId:c.registrationId,
      sourceRowSha256:r.sourceRowSha256,sourcePayloadSha256:r.sourcePayloadSha256,sourceProjectionSha256:familyPreparationDigest(r),
      values:normalized.values,identityNameKey:r.identityNameKey,relationshipCode:r.relationshipCode,
      historicalEndDatePresent:r.endDate !== null,schoolingImported:false,consentInferred:false,
      issues:[],status:'awaiting_explicit_review',existingMemberId:null };
    if (r.relationshipCode !== '2') { row.status='unsupported_relationship'; row.values=null; }
    else {
      row.issues.push(...normalized.issues);
      if (!text(r.identityNameKey,180)) row.issues.push('source_name_key_requires_review');
      const link=links.get(key);
      if (link) {
        const member=members.get(link.memberId);
        if (link.contractId!==c.contractId || link.registrationId!==c.registrationId || !member
          || member.contractId!==c.contractId || member.personId!==c.personId || member.registrationId!==c.registrationId
          || member.identityToken!==link.memberIdentityToken) row.issues.push('source_link_member_mismatch');
        else if (link.sourceRowSha256!==r.sourceRowSha256 || link.sourceProjectionSha256!==row.sourceProjectionSha256) row.issues.push('source_changed_after_incorporation');
        else { row.status='already_incorporated'; row.existingMemberId=member.id; }
      }
      if (!link) {
        const matchesName=(ownByName.get(`${c.contractId}\0${r.identityNameKey}`)??[])
          .some(m=>m.birthDate===null || r.birthDate===null || m.birthDate===r.birthDate);
        if (row.values.dni!==null && ownByDni.has(`${c.contractId}\0${row.values.dni}`) || matchesName) row.issues.push('overlap_with_existing_own_family');
      }
      if (row.values.dni!==null && /^[0-9]{5,12}$/.test(row.values.dni) && !/^0+$/.test(row.values.dni)) add(sourceByDni,`${c.contractId}\0${row.values.dni}`,row);
      if (r.identityNameKey!==null) add(sourceByName,`${c.contractId}\0${r.identityNameKey}`,row);
      if (row.historicalEndDatePresent && row.status==='awaiting_explicit_review') row.status='historical_end_recorded';
    }
    resultRows.push(row);
  }
  const mark = group => { if (group.length>1) for (const r of group) r.issues.push('ambiguous_source_identity'); };
  for (const group of sourceByDni.values()) mark(group);
  for (const group of sourceByName.values()) {
    if (group.some(r=>r.values.birthDate===null)) mark(group);
    else { const dates=new Map(); for (const r of group) add(dates,r.values.birthDate,r); for(const d of dates.values()) mark(d); }
  }
  for (const r of resultRows) { r.issues=[...new Set(r.issues)].sort(); if(r.issues.length) r.status='requires_resolution'; }
  const unsigned={version:'adopted-family-preparation.v1',scope:{...scope},source:structuredClone(source),asOfDate:input.asOfDate,
    inputManifest:{...input.manifest},ownStateSha256:familyPreparationDigest({members:sortBy(input.ownMembers,'id'),links:sortBy(input.sourceLinks,'sourceKey')}),
    authorityGranted:false,executable:false,rows:sortBy(resultRows,'sourceKey')};
  const plan={...unsigned,planSha256:familyPreparationDigest(unsigned)};
  const counts={}; for (const r of resultRows) counts[r.status]=(counts[r.status]??0)+1;
  return {plan,summary:{version:plan.version,planSha256:plan.planSha256,contracts:input.cohort.length,sourceRows:resultRows.length,
    statusCounts:counts,historicalEndDates:resultRows.filter(r=>r.relationshipCode==='2'&&r.historicalEndDatePresent).length,
    databaseWrites:0,adoptionsPerformed:0,schoolingRecordsCreated:0,consentsInferred:0,executable:false}};
}

export function prepareReviewedFamilyDeclaration(plan, review, context, { now = new Date() } = {}) {
  const {planSha256,...unsigned}=plan??{};
  if (!HEX.test(planSha256??'') || familyPreparationDigest(unsigned)!==planSha256) fail('PLAN_CHANGED');
  exact(review,['planSha256','sourceKey','sourceRowSha256','action','acknowledgeHistoricalEnd']);
  if (review.planSha256!==planSha256 || review.action!=='prepare_declaration') fail('EXPLICIT_REVIEW_REQUIRED');
  const row=plan.rows.find(r=>r.sourceKey===review.sourceKey);
  if (!row || row.sourceRowSha256!==review.sourceRowSha256
    || !['awaiting_explicit_review','historical_end_recorded'].includes(row.status) || row.issues.length) fail('ROW_NOT_PREPARABLE');
  if (row.historicalEndDatePresent && review.acknowledgeHistoricalEnd!==true) fail('HISTORICAL_END_ACK_REQUIRED');
  if (!row.historicalEndDatePresent && review.acknowledgeHistoricalEnd!==false) fail('REVIEW_SHAPE');
  const checked=validateEmployeeFamilyContext(context,row.contractId,2);
  if (checked.canDeclare!==true || checked.subject.origin!=='MUNICONTROL' || checked.subject.registrationId!==row.registrationId) fail('CURRENT_NATIVE_CONTEXT_REQUIRED');
  const payload=prepareEmployeeFamily({contractId:row.contractId,contractIdentityToken:checked.subject.identityToken,...row.values},{now});
  return {version:'adopted-family-reviewed-draft.v1',sourceKey:row.sourceKey,planSha256,
    sourceRowSha256:row.sourceRowSha256,payload,requiresAuthenticatedAtomicWriter:true,
    requiresSourceProvenanceLedger:true,authorityGranted:false,executable:false,
    databaseWrites:0,schoolingRecordsCreated:0,consentsInferred:0};
}
