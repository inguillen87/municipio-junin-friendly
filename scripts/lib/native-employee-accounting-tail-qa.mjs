import {executeMonthlyNativeTailStage} from './monthly-native-tail-execution-qa.mjs';
// Private synthetic QA foundation. Product models remain the source of validation;
// the finite destinations below are declared test data, never municipal policy.
import assert from 'node:assert/strict';
import { verifiedNativeBankTail,nativeBankFixtureCounts,nativeBankContinuationScope } from './native-employee-bank-tail-qa.mjs';
import { OWN_CLOSE_TOTAL_KEYS } from '../../assets/own-payroll-close-model.js';
import { accountingBootstrap, accountingLinkedDefinition, accountingMappingKey, accountingAssignmentKey } from '../../assets/own-payroll-accounting-model.js';
import { imputationBootstrap, imputationPreview } from '../../assets/own-payroll-imputation-workspace-model.js';
import { journalBootstrap, journalSource, journalRules, calculateJournal } from '../../assets/own-payroll-journal-model.js';
import { qaLiteral } from './own-payroll-durable-qa.mjs';

const declared = Object.freeze({ period: '2026-10', date: '2026-10-31', fiscalYear: '2026', jurisdictionCode: '42', agreementCode: '1', departmentCode: '20' });
const policy = Object.freeze([
  { code: '100', nature: 'remuneration', budget: 'PARTIDA-SINTETICA-100', primary: 'CUENTA-PRINCIPAL-SINTETICA-100', side: 'debit', counter: 'CONTRAPARTIDA-SINTETICA-100', document: 'Documento exclusivamente sintetico del par 100' },
  { code: '110', nature: 'remuneration', budget: 'PARTIDA-SINTETICA-110', primary: 'CUENTA-PRINCIPAL-SINTETICA-110', side: 'debit', counter: 'CONTRAPARTIDA-SINTETICA-110', document: 'Documento exclusivamente sintetico del par 110' },
  { code: '120', nature: 'non_remuneration', budget: 'PARTIDA-SINTETICA-120', primary: 'CUENTA-PRINCIPAL-SINTETICA-120', side: 'debit', counter: 'CONTRAPARTIDA-SINTETICA-120', document: 'Documento exclusivamente sintetico del par 120' },
  { code: '210', nature: 'deduction', budget: 'PARTIDA-SINTETICA-210', primary: 'CUENTA-PRINCIPAL-SINTETICA-210', side: 'credit', counter: 'CONTRAPARTIDA-SINTETICA-210', document: 'Documento exclusivamente sintetico del par 210' },
  { code: '310', nature: 'employer_contribution', budget: 'PARTIDA-SINTETICA-310', primary: 'CUENTA-PRINCIPAL-SINTETICA-310', side: 'debit', counter: 'CONTRAPARTIDA-SINTETICA-310', document: 'Documento exclusivamente sintetico del par 310' },
].map(Object.freeze));
const expectedNatures = new Map([...policy.map(p => [p.code, p.nature]), ['900', 'auxiliary']]);
const invariant = (actual, expected, key) => assert.deepEqual(actual, expected, 'QA_NATIVE_ACCOUNTING_' + key);
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

function conservedConcepts(record, close) {
  invariant(record.concepts.length, 6, 'ALL_SIX_CONCEPTS_REQUIRED');
  invariant(close.snapshot.concepts.length, 6, 'ALL_SIX_CLOSED_CONCEPTS_REQUIRED');
  invariant(new Set(record.concepts.map(c => c.code)), new Set(expectedNatures.keys()), 'CONCEPT_SET_CHANGED');
  for (const concept of record.concepts) {
    invariant(concept.nature, expectedNatures.get(concept.code), 'DECLARED_NATURE_CHANGED');
    const matches = close.snapshot.concepts.filter(c => c.contractId === record.contractId && c.conceptCode === concept.code);
    invariant(matches.length, 1, 'CLOSED_CONCEPT_REQUIRED');
    for (const field of ['nature', 'unit', 'amount']) invariant(matches[0][field], concept[field], 'RAW_CONCEPT_CHANGED_' + field);
  }
  for (const key of OWN_CLOSE_TOTAL_KEYS) {
    assert.equal(typeof record.totals[key], 'string', 'QA_NATIVE_ACCOUNTING_RAW_TOTAL_REQUIRED');
    invariant(record.totals[key], close.snapshot.employees[0].totals[key], 'EMPLOYEE_TOTAL_CHANGED_' + key);
    invariant(record.totals[key], close.snapshot.totals[key], 'TOTAL_CHANGED_' + key);
  }
}

function sourceContext(value) {
  assert.ok(value?.journey && value?.sources?.batch && value?.record && value?.close, 'QA_NATIVE_ACCOUNTING_VERIFIED_SOURCE_REQUIRED');
  const { journey, sources, record, close } = value;
  invariant(sources.batch.snapshot.records, [record], 'SOURCE_RECORD_CHANGED');
  invariant(sources.closes.find(c => c.groupId === journey.closeGroupId), close, 'SOURCE_CLOSE_CHANGED');
  if(!nativeBankContinuationScope(journey,sources)){
   invariant(sources.closes.length, 2, 'BOTH_CLOSES_REQUIRED');
   invariant(sources.batch.snapshot.sources.length, 2, 'BOTH_RECEIPT_SOURCES_REQUIRED');
  }
  invariant(record.contractId, journey.contractId, 'UUID_CHANGED');
  invariant(record.registrationId, journey.registrationId, 'REGISTRATION_CHANGED');
  invariant(record.runId, journey.secondRunId, 'SECOND_RUN_CHANGED');
  invariant(record.liquidationVersion, 2, 'VERSION_TWO_REQUIRED');
  invariant(record.sourceGroupId, journey.closeGroupId, 'TARGET_GROUP_CHANGED');
  invariant(sources.batch.id, journey.receiptBatchId, 'RECEIPT_CHANGED');
  invariant(sources.batch.snapshotSha256, journey.receiptSnapshotSha256, 'RECEIPT_SHA_CHANGED');
  invariant(record.departmentCode, declared.departmentCode, 'DECLARED_DEPARTMENT_REQUIRED');
  invariant(record.agreementCode, declared.agreementCode, 'DECLARED_AGREEMENT_REQUIRED');
  invariant(close.snapshot.period, declared.period, 'DECLARED_PERIOD_REQUIRED');
  const employee = close.snapshot.employees[0];
  invariant(employee.departmentCode, declared.departmentCode, 'CLOSED_DEPARTMENT_CHANGED');
  invariant(employee.agreementCode, declared.agreementCode, 'CLOSED_AGREEMENT_CHANGED');
  invariant(employee.jurisdiction?.code, declared.jurisdictionCode, 'DECLARED_JURISDICTION_REQUIRED');
  conservedConcepts(record, close);
  return value;
}

async function conservedPreview(preview, context) {
  const value = await imputationPreview(preview), { source, allocation } = value;
  invariant(source.group.groupId, context.journey.closeGroupId, 'PREVIEW_TARGET_CHANGED');
  invariant(source.group.snapshotSha256, context.close.snapshotSha256, 'PREVIEW_CLOSE_SHA_CHANGED');
  invariant(source.group.bodySha256, context.close.bodySha256, 'PREVIEW_CLOSE_BODY_SHA_CHANGED');
  invariant(source.group.snapshot, context.close.snapshot, 'PREVIEW_RAW_CLOSE_CHANGED');
  invariant(source.fiscalYear, declared.fiscalYear, 'DECLARED_FISCAL_YEAR_REQUIRED');
  invariant(source.dateSources.length, 1, 'ONE_SECOND_RUN_DATE_REQUIRED');
  invariant(source.dateSources[0].runId, context.journey.secondRunId, 'PREVIEW_SECOND_RUN_CHANGED');
  invariant(source.dateSources[0].body.liquidationDate, declared.date, 'DECLARED_LIQUIDATION_DATE_REQUIRED');
  invariant(allocation.conceptCount, 6, 'PREVIEW_ALL_CONCEPTS_REQUIRED');
  invariant(allocation.moneyCount, 5, 'PREVIEW_FIVE_MONEY_CONCEPTS_REQUIRED');
  invariant(allocation.auxiliaryCount, 1, 'PREVIEW_AUXILIARY_REQUIRED');
  invariant(allocation.rows.length, 6, 'PREVIEW_ALL_ROWS_REQUIRED');
  invariant(allocation.sourceTotals, context.close.snapshot.totals, 'PREVIEW_SIX_TOTALS_CHANGED');
  for (const row of allocation.rows) {
    const raw = context.record.concepts.find(c => c.code === row.conceptCode);
    assert.ok(raw, 'QA_NATIVE_ACCOUNTING_PREVIEW_UNDECLARED_CONCEPT');
    for (const field of ['nature', 'unit', 'amount']) invariant(row[field], raw[field], 'PREVIEW_RAW_CHANGED_' + field);
    invariant(row.contractId, context.journey.contractId, 'PREVIEW_UUID_CHANGED');
    invariant(row.liquidationDate, declared.date, 'PREVIEW_DATE_CHANGED');
    invariant(row.jurisdictionCode, declared.jurisdictionCode, 'PREVIEW_JURISDICTION_CHANGED');
  }
  // An unconfigured preview is valid evidence of preserved source, not readiness.
  return value;
}

export async function verifiedNativeAccountingSource({ journey, bankTail, sources, preview }) {
  assert.ok(bankTail && sources, 'QA_NATIVE_ACCOUNTING_BANK_PROOF_REQUIRED');
  const review = await verifiedNativeBankTail({ journey, ...sources, profile: bankTail.profile });
  for (const [key, actual] of [
    ['contractId', journey.contractId], ['registrationId', journey.registrationId], ['runId', journey.secondRunId],
    ['liquidationVersion', 2], ['closeGroupId', journey.closeGroupId], ['receiptBatchId', journey.receiptBatchId],
    ['receiptSnapshotSha256', journey.receiptSnapshotSha256],
  ]) invariant(bankTail[key], actual, 'BANK_PROOF_CHANGED_' + key);
  if(!nativeBankContinuationScope(journey,sources)){
  invariant(sources.batch.snapshot.sources.length, 2, 'BOTH_RECEIPT_SOURCES_REQUIRED');
  invariant(sources.closes.length, 2, 'BOTH_CLOSES_REQUIRED');
  const target = sources.batch.snapshot.sources.find(s => s.id === journey.closeGroupId), original = sources.batch.snapshot.sources.filter(s => s.id !== journey.closeGroupId);
  invariant(original.length, 1, 'ORIGINAL_SOURCE_REQUIRED');
  const fixtureCounts=nativeBankFixtureCounts(journey);
  for (const [value, counts] of [[target, [1, fixtureCounts.targetPopulation, 1]], [original[0], [fixtureCounts.priorEmployeeCount, fixtureCounts.priorPopulation, 0]]]) {
    assert.ok(value, 'QA_NATIVE_ACCOUNTING_SOURCE_REQUIRED');
    invariant([value.employeeCount, value.populationCount, value.selectedCount], counts, 'COMPLETE_SOURCE_COUNTS_CHANGED');
  }
  }
  invariant(bankTail.receiptSources, sources.batch.snapshot.sources, 'BANK_BOTH_SOURCES_CHANGED');
  invariant(bankTail.controlFingerprint, review.fingerprint, 'BANK_CONTROL_CHANGED');
  const clone = structuredClone({ journey, sources }), record = clone.sources.batch.snapshot.records[0], close = clone.sources.closes.find(c => c.groupId === journey.closeGroupId);
  invariant(bankTail.closeSnapshotSha256, close.snapshotSha256, 'BANK_CLOSE_SHA_CHANGED');
  invariant(bankTail.sixTotals, record.totals, 'BANK_SIX_TOTALS_CHANGED');
  const context = sourceContext({ ...clone, record, close, bankReview: review });
  if (preview !== undefined) context.preview = structuredClone(await conservedPreview(preview, context));
  return freeze(context);
}

function mapping(p) {
  return { fiscalYear: declared.fiscalYear, jurisdictionCode: declared.jurisdictionCode, agreementCode: declared.agreementCode, departmentCode: declared.departmentCode,
    conceptCode: p.code, nature: p.nature, budgetItemReference: p.budget, supplierReference: null, creditorReference: null, accountingAccountReference: p.primary,
    bankAccountReference: null, bankReference: null, validFrom: '2026-10-01', validUntil: '2026-10-31', ruleReference: p.document };
}

export function explicitNativeAccountingDefinition(bootstrap, verifiedSource) {
  const boot = accountingBootstrap(bootstrap), source = sourceContext(verifiedSource);
  invariant(boot.permissions.canPropose, true, 'ACCOUNTING_AUTHORITY_REQUIRED');
  const identity = boot.sources.contracts.filter(c => c.contractId === source.journey.contractId);
  invariant(identity.length, 1, 'OWN_CONTRACT_REQUIRED');
  for (const [key, value] of [['registrationId', source.journey.registrationId], ['employeeNumber', source.journey.legajo]]) invariant(identity[0][key], value, 'BOOTSTRAP_IDENTITY_CHANGED_' + key);
  const before = boot.configuration.definition, added = {
    mappings: policy.map(mapping),
    assignments: [{ contractId: source.journey.contractId, conceptCode: null, institutionalReference: 'INSTITUCION-SINTETICA-NATIVE', functionReference: 'FUNCION-SINTETICA-NATIVE', validFrom: '2026-10-01', validUntil: null, ruleReference: 'Documento institucional exclusivamente sintetico del mismo UUID nuevo' }],
  };
  const merge = (kind, key) => {
    const rows = structuredClone(before?.[kind] ?? []);
    for (const next of added[kind]) {
      const prior = rows.find(row => key(row) === key(next));
      if (prior) invariant(prior, next, 'EXISTING_POLICY_CHANGED'); else rows.push(next);
    }
    return rows;
  };
  return accountingLinkedDefinition({ mappings: merge('mappings', accountingMappingKey), assignments: merge('assignments', accountingAssignmentKey) }, boot.sources, before);
}

export async function explicitNativeJournalRules(value, verifiedSource) {
  const context = sourceContext(verifiedSource), source = await journalSource(value);
  invariant(source.basis, 'imputation', 'INITIAL_JOURNAL_SOURCE_REQUIRED');
  const detail = source.imputation;
  await conservedPreview({ version: detail.version, source: detail.source, allocation: detail.allocation, allocationSha256: detail.allocationSha256, revision: detail.proposal.baseRevision }, context);
  invariant(detail.allocation.ready, true, 'APPROVED_ALLOCATION_READY_REQUIRED');
  invariant(detail.allocation.groups.length, 5, 'ALL_FIVE_DESTINATIONS_REQUIRED');
  const seen = new Set(), rules = detail.allocation.groups.map((group, index) => {
    const destination = group.destination, matches = policy.filter(p => p.code === destination.conceptCode && p.primary === destination.accountingAccountReference);
    invariant(matches.length, 1, 'EXPLICIT_JOURNAL_DESTINATION_REQUIRED');
    const p = matches[0]; assert.ok(!seen.has(p.code), 'QA_NATIVE_ACCOUNTING_DUPLICATE_JOURNAL_DESTINATION'); seen.add(p.code);
    for (const [key, expected] of Object.entries(mapping(p))) invariant(destination[key], expected, 'JOURNAL_DECLARED_MAPPING_CHANGED_' + key);
    return { ordinal: index + 1, side: p.side, counterAccountReference: p.counter, documentReference: p.document };
  });
  invariant(seen, new Set(policy.map(p => p.code)), 'JOURNAL_MAPPING_SET_CHANGED');
  const typed = journalRules(rules, detail.allocation.groups.length), calculated = await calculateJournal(source, declared.date, typed);
  invariant(calculated.ready, true, 'JOURNAL_READY_REQUIRED');
  invariant(calculated.entries.length, 10, 'TWO_ENTRIES_PER_DESTINATION_REQUIRED');
  invariant(calculated.sourceTotals, context.record.totals, 'JOURNAL_SIX_TOTALS_CHANGED');
  for (const rule of typed) invariant(calculated.entries.filter(e => e.groupOrdinal === rule.ordinal).length, 2, 'JOURNAL_PAIR_REQUIRED');
  return typed;
}

const actorKinds = Object.freeze({ accounting: { validate: accountingBootstrap, permissions: ['canPropose', 'canReview'] }, imputation: { validate: imputationBootstrap, permissions: ['canPropose', 'canReview'] }, journal: { validate: journalBootstrap, permissions: ['canPropose', 'canPost'] } });
export async function withNativeAccountingActor({ actor, bootstrap, kind, permission, getCurrent, setCurrent }, operation) {
  assert.ok(Object.hasOwn(actorKinds, kind), 'QA_NATIVE_ACCOUNTING_ACTOR_KIND_INVALID');
  const typed = actorKinds[kind]; assert.ok(typed.permissions.includes(permission), 'QA_NATIVE_ACCOUNTING_PERMISSION_INVALID');
  const boot = typed.validate(bootstrap); invariant(boot.permissions[permission], true, 'EXISTING_ACTOR_AUTHORITY_REQUIRED');
  assert.ok(Array.isArray(actor?.principal?.tenant?.effectiveCapabilities), 'QA_NATIVE_ACCOUNTING_ACTOR_REQUIRED');
  for (const callback of [getCurrent, setCurrent, operation]) assert.equal(typeof callback, 'function');
  const prior = getCurrent(), selected = structuredClone(actor), capability = permission === 'canPropose' ? 'payroll.parameter.prepare' : 'payroll.parameter.approve';
  selected.principal.tenant.effectiveCapabilities = [...new Set([...selected.principal.tenant.effectiveCapabilities, capability])];
  setCurrent(selected);
  try { return await operation(); } finally { setCurrent(prior); }
}

const statements = new Map([
  ['SELECT public.own_accounting_bootstrap_v1($1::jsonb) AS result', 1],
  ['SELECT public.own_accounting_detail_v1($1::jsonb,$2::uuid) AS result', 2],
  ['SELECT public.own_accounting_attempt_v1($1::jsonb,$2::uuid) AS result', 2],
  ['SELECT public.own_accounting_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result', 3],
  ['SELECT public.own_imputation_bootstrap_v1($1::jsonb,$2::text,$3::text) AS result', 3],
  ['SELECT public.own_imputation_source_v1($1::jsonb,$2::uuid,$3::text) AS result', 3],
  ['SELECT public.own_imputation_detail_v1($1::jsonb,$2::uuid) AS result', 2],
  ['SELECT public.own_imputation_attempt_v1($1::jsonb,$2::uuid) AS result', 2],
  ['SELECT public.own_imputation_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result', 3],
  ['SELECT public.own_journal_bootstrap_v1($1::jsonb,$2::text,$3::text) AS result', 3],
  ['SELECT public.own_journal_source_v1($1::jsonb,$2::text,$3::uuid) AS result', 3],
  ['SELECT public.own_journal_detail_v1($1::jsonb,$2::uuid) AS result', 2],
  ['SELECT public.own_journal_attempt_v1($1::jsonb,$2::uuid) AS result', 2],
  ['SELECT public.own_journal_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result', 3],
]);
export function createNativeAccountingQaSql(db, qa) {
  assert.match(qa.schema, /^mc_qa_fixed_092_[a-f0-9]{32}$/);
  return { ...db, query: async (query, values) => {
    if (typeof query !== 'string' || !/\bown_(?:accounting|imputation|journal)_/i.test(query)) return db.query(query, values);
    assert.ok(statements.has(query), 'QA_NATIVE_ACCOUNTING_SQL_FACADE_CHANGED');
    assert.ok(Array.isArray(values) && values.length === statements.get(query) && Object.keys(values).length === values.length && Array.from(values).every(v => typeof v === 'string'), 'QA_NATIVE_ACCOUNTING_SQL_ARGUMENTS_CHANGED');
    const relocated = query.replace('public.', qa.schema + '.');
    const sql = relocated.replace(/\$(\d+)/g, (_, n) => qaLiteral(values[Number(n) - 1]));
    return [{ result: await db.run(sql, true) }];
  } };
}

// Appended after the pure QA source helpers. Installers remain canonical.
import AT_fs from 'node:fs';
import AT_path from 'node:path';
import {createHash as AT_createHash,randomUUID as AT_randomUUID} from 'node:crypto';
import {buildOwnAccountingInstallation as AT_build147,assertOwnAccountingDurability as AT_assert147} from './own-accounting-installation.mjs';
import {buildOwnImputationInstallation as AT_build148,assertOwnImputationDurability as AT_assert148} from './own-imputation-installation.mjs';
import {buildOwnJournalInstallation as AT_build152,assertOwnJournalDurability as AT_assert152} from './own-journal-installation.mjs';
import {prepareAccounting as AT_prepare147,decideAccounting as AT_decide147} from '../../assets/own-payroll-accounting-workspace-model.js';
import {accountingBootstrap as AT_boot147,accountingDetail as AT_detail147,accountingReceipt as AT_receipt147} from '../../assets/own-payroll-accounting-model.js';
import {imputationBootstrap as AT_boot148,imputationPreview as AT_preview148,imputationDetail as AT_detail148,prepareImputation as AT_prepare148,decideImputation as AT_decide148,verifiedImputationReceipt as AT_receipt148,approvedImputationCsv as AT_csv148} from '../../assets/own-payroll-imputation-workspace-model.js';
import {journalBootstrap as AT_boot152,journalSource as AT_source152,journalDetail as AT_detail152,prepareJournal as AT_prepare152,decideJournal as AT_decide152,journalReceipt as AT_receipt152,journalCsv as AT_csv152} from '../../assets/own-payroll-journal-model.js';
import {nativeBankFailureNative as AT_failureNative} from './native-employee-bank-tail-qa.mjs';
const AT_root=AT_path.resolve(import.meta.dirname,'../..'),AT_sha=value=>AT_createHash('sha256').update(value).digest('hex');
export async function installNativeAccountingTailQa({db,qa,sourceCommit,output}){
 if(qa.monthlyNativeTailInstallation){const proofs=[];for(const migration of[147,148,152])proofs.push(await executeMonthlyNativeTailStage({db,qa,sourceCommit,output,migration,base:'native-accounting-installation-'+migration}));return proofs;}
 const proofs=[];
 for(const [major,build,verify]of [[147,AT_build147,AT_assert147],[148,AT_build148,AT_assert148],[152,AT_build152,AT_assert152]]){
  const batch=build({read:file=>AT_fs.readFileSync(AT_path.join(AT_root,file),'utf8'),sourceCommit}),installation=batch.installation.map(qa.normalized),verification=batch.durableVerification.map(qa.normalized),base='native-accounting-installation-'+major;
  AT_fs.writeFileSync(AT_path.join(output,base+'.sql'),installation.join(';\n')+';\n',{flag:'wx'});
  AT_fs.writeFileSync(AT_path.join(output,base+'-source-pins.json'),JSON.stringify({sourceCommit,sourceHashes:batch.sourceHashes,prerequisitePins:batch.prerequisitePins,ownPins:batch.ownPins},null,2)+'\n',{flag:'wx'});
  const installed=await db.run(installation.join(';\n')),durable=await db.run(verification.join(';\n'));verify({installed,durable,sourceCommit});
  assert.equal(installed.eventRows,0);assert.equal(durable.eventRows,0);
  const proof={major,sourceCommit,sourceHashes:batch.sourceHashes,installed,durable};
  AT_fs.writeFileSync(AT_path.join(output,base+'-proof.json'),JSON.stringify(proof,null,2)+'\n',{flag:'wx'});proofs.push(proof);
 }
 return proofs;
}
export async function verifyNativeEmployeeAccountingTail({db,qa,sourceCommit,maker,checker,getCurrent,setCurrent,journey,bankTail,transport,output,ok,preserveOriginal}){
 for(const key of ['nativeAccountingHttp','nativeAccountingReadExport','nativeBankSources'])assert.equal(typeof transport?.[key],'function','QA_NATIVE_ACCOUNTING_HTTP_REQUIRED');
 assert.equal(typeof preserveOriginal,'function');const previous=getCurrent(),commands=[];let phase='installation';
 const write=(file,value)=>AT_fs.writeFileSync(AT_path.join(output,file),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
 const asBase=async(actor,operation)=>{const old=getCurrent();setCurrent(actor);try{return await operation();}finally{setCurrent(old);}};
 const request=input=>transport.nativeAccountingHttp(input),periodQuery={resource:'bootstrap',period:'2026-10',liquidationType:'monthly'},validators={accounting:AT_boot147,imputation:AT_boot148,journal:AT_boot152},receipts={accounting:AT_receipt147,imputation:AT_receipt148,journal:AT_receipt152};
 const boot=(kind,actor)=>asBase(actor,async()=>{const p=await request({kind,query:kind==='accounting'?{resource:'bootstrap'}:periodQuery});assert.equal(p.actualHttp,true);return validators[kind](p.data);});
 const detail=(kind,actor,id)=>asBase(actor,async()=>{const p=await request({kind,query:{resource:'detail',id}});assert.equal(p.actualHttp,true);return await({accounting:AT_detail147,imputation:AT_detail148,journal:AT_detail152})[kind](p.data);});
 const send=async(kind,actor,permission,body)=>{
  const bootstrap=await boot(kind,actor),key=AT_randomUUID();
  return withNativeAccountingActor({actor,bootstrap,kind,permission,getCurrent,setCurrent},async()=>{
   const packet=await request({kind,body,key,expected:201,ackLost:true});
   for(const flag of ['actualHttp','sameServer','authenticationFixture','ackLostAfterCommit'])assert.equal(packet[flag],true);
   assert.equal(packet.postStatus,503);assert.equal(packet.committedStatus,201);assert.equal(packet.browserPosts,1);assert.equal(packet.recoveryGets,1);
   await receipts[kind](packet.data,{key,body});await receipts[kind](packet.recovered,{key,body});assert.deepEqual(packet.recovered,{...packet.data,replayed:true});
   commands.push({kind,command:body.command,key,requestSha256:packet.data.requestSha256,browserPosts:1,recoveryGets:1,ackLostAfterCommit:true});return packet.data;
  });
 };
 try{
  const originalBefore=await preserveOriginal(),sourcesBefore=await asBase(maker,()=>transport.nativeBankSources(journey)),verified=await verifiedNativeAccountingSource({journey,bankTail,sources:sourcesBefore});
  const installations=await installNativeAccountingTailQa({db,qa,sourceCommit,output});
  phase='accounting-configuration';const firstBoot=await boot('accounting',maker);assert.equal(firstBoot.configuration.revision,0);assert.equal(firstBoot.configuration.definition,null);
  const definition=explicitNativeAccountingDefinition(firstBoot,verified),proposeBody=await AT_prepare147(firstBoot,definition,'Asociaciones exclusivamente sintéticas para el mismo empleado nativo QA'),proposed=await send('accounting',maker,'canPropose',proposeBody);
  const makerDetail=await detail('accounting',maker,proposed.proposalId);assert.equal(makerDetail.proposal.canReview,false);
  const reviewBoot=await boot('accounting',checker),reviewDetail=await detail('accounting',checker,proposed.proposalId),approveBody=await AT_decide147(reviewBoot,reviewDetail,'approve','Revisión independiente de asociaciones exclusivamente sintéticas QA');
  await asBase(maker,async()=>{const denied=await request({kind:'accounting',body:approveBody,key:AT_randomUUID(),expected:403});assert.equal(denied.status,403);});
  const approved=await send('accounting',checker,'canReview',approveBody),configuration=await boot('accounting',maker);assert.equal(configuration.configuration.revision,1);assert.equal(configuration.configuration.approvalId,approved.eventId);assert.deepEqual(configuration.configuration.definition,definition);
  phase='imputation';const ib=await boot('imputation',maker),previewPacket=await asBase(maker,()=>request({kind:'imputation',query:{resource:'source',id:journey.closeGroupId,fiscalYear:'2026'}})),preview=await AT_preview148(previewPacket.data);
  await verifiedNativeAccountingSource({journey,bankTail,sources:sourcesBefore,preview});
  assert.equal(preview.allocation.ready,true);assert.deepEqual(preview.allocation.globalIssues,[]);assert.deepEqual(preview.allocation.issues,[]);assert.equal(preview.allocation.conceptCount,6);assert.equal(preview.allocation.moneyCount,5);assert.equal(preview.allocation.auxiliaryCount,1);assert.equal(preview.allocation.allocatedCount,5);assert.deepEqual(preview.allocation.sourceTotals,bankTail.sixTotals);
  const ipBody=await AT_prepare148(ib,preview,'Imputación exclusivamente sintética del cierre del mismo empleado QA'),ip=await send('imputation',maker,'canPropose',ipBody),ipMaker=await detail('imputation',maker,ip.proposalId);assert.equal(ipMaker.proposal.canReview,false);
  const iaBody=await AT_decide148(await boot('imputation',checker),await detail('imputation',checker,ip.proposalId),'approve','Revisión independiente de la imputación del mismo cierre sintético QA');
  await asBase(maker,async()=>{const denied=await request({kind:'imputation',body:iaBody,key:AT_randomUUID(),expected:403});assert.equal(denied.status,403);});
  const ia=await send('imputation',checker,'canReview',iaBody),imputation=await detail('imputation',maker,ip.proposalId);assert.equal(imputation.proposal.status,'approved');assert.equal(imputation.sourceCurrent,true);assert.equal(imputation.proposal.decision.command,iaBody.command);assert.equal(imputation.proposal.decision.reason,iaBody.reason);assert.equal(imputation.proposal.decision.revision,ia.revision);assert.equal(ia.revision,1);assert.deepEqual(imputation.allocation,preview.allocation);
  phase='journal';const jsPacket=await asBase(maker,()=>request({kind:'journal',query:{resource:'source',basis:'imputation',id:ip.proposalId}})),js=await AT_source152(jsPacket.data);assert.deepEqual(js.imputation.allocation,imputation.allocation);
  const rules=await explicitNativeJournalRules(js,verified),postingDate='2026-10-31',jpBody=await AT_prepare152(js,postingDate,rules,'Pares contables exclusivamente sintéticos del mismo cierre QA'),jp=await send('journal',maker,'canPropose',jpBody),jpMaker=await detail('journal',maker,jp.proposalId);assert.equal(jpMaker.canReview,false);
  const postBody=await AT_decide152(await boot('journal',checker),await detail('journal',checker,jp.proposalId),'post','Registro independiente de pares exclusivamente sintéticos QA');
  await asBase(maker,async()=>{const denied=await request({kind:'journal',body:postBody,key:AT_randomUUID(),expected:403});assert.equal(denied.status,403);});
  const posted=await send('journal',checker,'canPost',postBody),journal=await detail('journal',maker,posted.eventId);assert.equal(journal.status,'posted');assert.equal(journal.sourceCurrent,true);assert.equal(journal.number,1);assert.equal(journal.journal.entries.length,10);assert.equal(journal.journal.groupCount,5);assert.equal(journal.journal.conceptCount,6);assert.equal(journal.journal.auxiliaryCount,1);assert.deepEqual(journal.journal.sourceTotals,bankTail.sixTotals);assert.equal(journal.journal.paymentExecuted,false);assert.equal(posted.accountingPosted,true);
  // Every approved allocation amount/ordinal remains tied to the same source;
  // balanced paired amounts are never treated as salary net or payment.
  for(const [i,group]of imputation.allocation.groups.entries()){const entries=journal.journal.entries.filter(e=>e.groupOrdinal===i+1);assert.equal(entries.length,2);for(const entry of entries){assert.deepEqual(entry.destination,group.destination);assert.deepEqual(entry.sourceOrdinals,group.ordinals);assert.equal(entry.sourceAmount,group.amount);}}
  phase='read-export-ui';const files={imputation:new TextEncoder().encode('\uFEFF'+await AT_csv148(imputation)),journal:new TextEncoder().encode('\uFEFF'+await AT_csv152(journal))},expectedFiles=Object.fromEntries(Object.entries(files).map(([kind,bytes])=>[kind,{bytes:bytes.length,sha256:AT_sha(bytes)}]));
  setCurrent(maker);const ui=await transport.nativeAccountingReadExport({journey,imputation,journal,expectedFiles});assert.equal(ui.actualHttp,true);assert.equal(ui.readExportUi,true);assert.equal(ui.commandsUi,false);assert.equal(ui.posts,0);assert.equal(ui.contractId,journey.contractId);assert.equal(ui.closeGroupId,journey.closeGroupId);assert.equal(ui.conceptCount,6);assert.equal(ui.entryCount,10);
  phase='conservation';const sourcesAfter=await asBase(maker,()=>transport.nativeBankSources(journey));await verifiedNativeAccountingSource({journey,bankTail,sources:sourcesAfter});assert.deepEqual(sourcesAfter,sourcesBefore);assert.deepEqual(await preserveOriginal(),originalBefore);
  const finalImputation=await detail('imputation',maker,ip.proposalId),finalJournal=await detail('journal',maker,posted.eventId);assert.deepEqual(finalImputation,imputation);assert.deepEqual(finalJournal,journal);
  const ledger=await db.run(`SELECT jsonb_build_object('accounting',(SELECT jsonb_build_object('events',count(*),'proposals',count(*) FILTER(WHERE command='propose'),'approvals',count(*) FILTER(WHERE command='approve'),'rejections',count(*) FILTER(WHERE command='reject')) FROM own_payroll_accounting_event),'imputation',(SELECT jsonb_build_object('events',count(*),'proposals',count(*) FILTER(WHERE command='propose'),'approvals',count(*) FILTER(WHERE command='approve'),'rejections',count(*) FILTER(WHERE command='reject')) FROM own_payroll_imputation_event),'journal',(SELECT jsonb_build_object('events',count(*),'proposals',count(*) FILTER(WHERE command='propose'),'posts',count(*) FILTER(WHERE command='post'),'rejections',count(*) FILTER(WHERE command='reject')) FROM own_payroll_journal_event),'bank',(SELECT jsonb_build_object('events',count(*),'proposals',count(*) FILTER(WHERE command='propose'),'approvals',count(*) FILTER(WHERE command='approve'),'rejections',count(*) FILTER(WHERE command='reject')) FROM own_bank_account_event))`);
  const financial={events:2,proposals:1,approvals:1,rejections:0};assert.deepEqual(ledger,{accounting:financial,imputation:financial,journal:{events:2,proposals:1,posts:1,rejections:0},bank:bankTail.bankLedger});
  write('native-accounting-tail-source-conservation.json',{before:sourcesBefore,after:sourcesAfter,batchSnapshotUnchanged:true,allCloseSnapshotsUnchanged:true,bankConfigurationAndLedgerUnchanged:true,...(journey.monthlyFixed?{originalBaselinePreserved:true,originalBaselineEmployeeCount:journey.monthlyFixed.baseline.eligibleContractIds.length}:{original29Preserved:true}),imputation,journal});
  const proof={version:'native-employee-accounting-tail-proof.v1',status:'assertions_completed_pending_outer_cleanup',outerResult:'result.json',contractId:journey.contractId,registrationId:journey.registrationId,runId:journey.secondRunId,liquidationVersion:2,closeGroupId:journey.closeGroupId,receiptBatchId:journey.receiptBatchId,receiptSnapshotSha256:journey.receiptSnapshotSha256,receiptSources:sourcesAfter.batch.snapshot.sources,employeeCount:1,populationCount:nativeBankFixtureCounts(journey).targetPopulation,populationComplete:false,conceptCount:6,moneyCount:5,auxiliaryCount:1,sixTotals:bankTail.sixTotals,configurationProposalId:proposed.proposalId,configurationApprovalId:approved.eventId,configurationVersion:configuration.configuration.version,imputationProposalId:ip.proposalId,imputationApprovalId:ia.eventId,allocationSha256:imputation.allocationSha256,journalProposalId:jp.proposalId,journalEventId:posted.eventId,journalSha256:journal.journalSha256,journalNumber:journal.number,journalEntryCount:10,postingDate,commands,ledger,expectedFiles,ui,installations,sourceConservation:'native-accounting-tail-source-conservation.json',authenticationFixture:true,commandsHttp:true,commandsUi:false,readExportUi:true,syntheticDestinationsOnly:true,additionalHire:false,additionalCalculation:false,additionalClose:false,...(journey.monthlyFixed?{originalBaselinePreserved:true,originalBaselineEmployeeCount:journey.monthlyFixed.baseline.eligibleContractIds.length}:{original29Preserved:true}),bankPreserved:true,accountingPosted:true,paymentExecuted:false,productionWrites:false,municipalAcceptance:false};
  write('native-accounting-tail-proof.json',proof);ok(true,'same additional native employee preserves both receipt sources and bank while explicit synthetic associations, complete imputation and balanced journal traverse actual HTTP and read/export UI');return proof;
 }catch(error){try{write('native-accounting-tail-failure.json',{phase,message:error.message,status:'failed',native:AT_failureNative(error),contractId:journey.contractId,closeGroupId:journey.closeGroupId,receiptBatchId:journey.receiptBatchId,commands,paymentExecuted:false,municipalAcceptance:false});}finally{throw error;}}finally{setCurrent(previous);}
}
