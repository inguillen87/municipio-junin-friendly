// SOURCE ONLY. One accounting/imputation tail of the existing native855 case.
// It borrows190's actors, MFA sessions, database adapter and cleanup. No fixture,
// permission, tenant, connection transport or salary formula is manufactured here.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {accountingOperation} from '../../lib/internal-own-payroll-accounting.js';
import {imputationOperation} from '../../lib/internal-own-payroll-imputation.js';
import {employeeContext} from '../../lib/internal-native-employees.js';
import {prepareAccounting,decideAccounting} from '../../assets/own-payroll-accounting-workspace-model.js';
import {accountingHash,accountingCommand} from '../../assets/own-payroll-accounting-model.js';
import {prepareImputation,decideImputation,approvedImputationCsv,imputationCommand} from '../../assets/own-payroll-imputation-workspace-model.js';
import {verifiedOwnCloseReceipt} from '../../assets/own-payroll-close-model.js';
import {ownClosedJurisdiction} from '../../assets/own-payroll-jurisdiction-model.js';
import {salaryJsonbBytes} from '../../assets/native-salary-catalog-model.js';
import {installOwnAccountingImputation190,ownAccountingImputation190Snapshot} from './own-accounting-imputation-190-installation.mjs';

const LEGACY=16777216,FULL=33554432,bytes=v=>Buffer.byteLength(JSON.stringify(v),'utf8');
const sameIds=(left,right)=>assert.deepEqual([...left].map(v=>v.toLowerCase()).sort(),[...right].map(v=>v.toLowerCase()).sort());
const sqlLiteral=v=>"'"+v.replaceAll("'","''")+"'",sqlJson=v=>sqlLiteral(JSON.stringify(v))+'::jsonb';

// All mappings come from the immutable close, never the current roster. These
// declared synthetic references exercise the real annual-destination contract.
function capturedDefinition(closed,second,contracts){
 const s=closed.snapshot;assert.equal(s.period,'2026-10');assert.equal(s.liquidationType,'monthly');
 assert.equal(s.employeeCount,855);assert.equal(s.populationCount,855);assert.equal(s.populationComplete,true);assert.equal(s.conceptCount,17100);
 sameIds(s.employees.map(e=>e.contractId),contracts);assert.equal(new Set(contracts).size,855);
 assert.equal(second.body.period,s.period);assert.equal(second.body.liquidationType,s.liquidationType);assert.equal(second.body.liquidationDate,'2026-10-15');
 const people=new Map(s.employees.map(e=>[e.contractId,e])),destinations=new Map();let money=0,auxiliary=0;
 for(const e of s.employees){
  assert.equal(e.runId,second.id);assert.equal(e.inputSha256,second.saved.inputSha256);assert.equal(e.resultSha256,second.saved.resultSha256);assert.equal(e.conceptCount,20);
  assert.equal(ownClosedJurisdiction(e,s.version).code,'42','ACCOUNTING190_CAPTURED_JURISDICTION');assert.equal(e.agreementCode,'1');assert.equal(e.departmentCode,'1');
 }
 for(const concept of s.concepts){
  const e=people.get(concept.contractId);assert.ok(e);assert.equal(concept.agreementCode,e.agreementCode);assert.equal(concept.departmentCode,e.departmentCode);
  if(concept.nature==='auxiliary'){assert.equal(concept.conceptCode,'101');auxiliary++;continue;}
  money++;const jurisdictionCode=ownClosedJurisdiction(e,s.version).code,key=JSON.stringify([jurisdictionCode,e.agreementCode,e.departmentCode,concept.conceptCode]);
  const previous=destinations.get(key);if(previous){assert.equal(previous.nature,concept.nature);continue;}
  destinations.set(key,{fiscalYear:s.period.slice(0,4),jurisdictionCode,agreementCode:e.agreementCode,departmentCode:e.departmentCode,conceptCode:concept.conceptCode,nature:concept.nature,
   budgetItemReference:'PARTIDA-SINTETICA-'+concept.conceptCode,supplierReference:'PROVEEDOR-SINTETICO',creditorReference:null,accountingAccountReference:'CUENTA-CONTABLE-SINTETICA',bankAccountReference:null,bankReference:null,
   validFrom:s.period+'-01',validUntil:s.period+'-31',ruleReference:'Documento de destino exclusivamente sintético del caso190; no es norma municipal'});
 }
 assert.equal(money,16245);assert.equal(auxiliary,855);assert.equal(destinations.size,19,'ACCOUNTING190_NINETEEN_CAPTURED_MONEY_CONCEPTS');
 for(const e of s.employees){const rows=s.concepts.filter(c=>c.contractId===e.contractId);assert.equal(rows.filter(c=>c.nature==='auxiliary').length,1);assert.equal(rows.filter(c=>c.nature!=='auxiliary').length,19);}
 return{mappings:[...destinations.values()],assignments:s.employees.map(e=>({contractId:e.contractId,conceptCode:null,institutionalReference:'INSTITUCION-SINTETICA',functionReference:'FUNCION-SINTETICA',validFrom:s.period+'-01',validUntil:s.period+'-31',ruleReference:'Documento institucional exclusivamente sintético del caso190; no acredita autoridad municipal'}))};
}

function assertAllocation(preview,closed,second,configuration){
 const {source,allocation:a}=preview,s=closed.snapshot;
 assert.deepEqual(source.group,{...closed,replayed:true});assert.deepEqual(source.configuration,configuration);assert.equal(source.state,'closed');assert.equal(source.complete,true);
 assert.deepEqual(source.dateSources,[{runId:second.id,body:second.body,bodySha256:second.bodySha256,inputSha256:second.saved.inputSha256}]);
 assert.equal(a.ready,true);assert.equal(a.employeeCount,855);assert.equal(a.populationCount,855);assert.equal(a.populationComplete,true);assert.equal(a.conceptCount,17100);assert.equal(a.rows.length,17100);assert.equal(a.moneyCount,16245);assert.equal(a.auxiliaryCount,855);assert.equal(a.allocatedCount,16245);assert.equal(a.groups.length,19);
 assert.deepEqual(a.sourceTotals,s.totals);assert.deepEqual(a.allocatedTotals,Object.fromEntries(['remuneration','non_remuneration','deduction','employer_contribution'].map(k=>[k,s.totals[k]])));assert.deepEqual(a.globalIssues,[]);assert.deepEqual(a.issues,[]);
 for(let n=0;n<s.concepts.length;n++){
  const c=s.concepts[n],r=a.rows[n];assert.equal(r.ordinal,n+1);
  for(const key of ['contractId','employeeNumber','agreementCode','departmentCode','conceptCode','nature','unit','amount'])assert.equal(r[key],c[key]);
  assert.equal(r.liquidationDate,second.body.liquidationDate);assert.equal(r.jurisdictionCode,'42');assert.deepEqual(r.issues,[]);
  if(c.nature==='auxiliary'){assert.equal(r.state,'auxiliary');assert.equal(r.destination,null);assert.equal(r.mappingKey,null);assert.equal(r.assignmentKey,null);}
  else{assert.equal(r.state,'allocated');for(const key of ['creditorReference','bankAccountReference','bankReference'])assert.equal(r.destination[key],null);assert.equal(r.destination.validFrom,'2026-10-01');assert.equal(r.destination.validUntil,'2026-10-31');}
 }
 assert.ok(bytes(preview)>LEGACY,'ACCOUNTING190_FULL_PREVIEW_MUST_EXERCISE_LEGACY_LIMIT');assert.ok(bytes({ok:true,data:preview})<=FULL);
 assert.ok(salaryJsonbBytes(source)<=LEGACY,'ACCOUNTING190_SOURCE_STORAGE_STAYS16');assert.ok(salaryJsonbBytes(a)<=FULL);
 assert.ok(salaryJsonbBytes(source)+salaryJsonbBytes(a)+32768+16384<=FULL,'ACCOUNTING190_FULL_PREVIEW_RESERVE');
}

export async function runOwnAccountingImputation190Continuation({h,db,maker,reviewer,closed,second,contracts,sameStateReject,ok}){
 await verifiedOwnCloseReceipt(closed);assert.notEqual(maker.principal.tenant.membershipId,reviewer.principal.tenant.membershipId);
 const installation=await installOwnAccountingImputation190(h);assert.equal(installation.sourceCommit,h.sourceCommit);assert.equal(installation.schema,h.qa.schema);assert.equal(installation.synthetic,true);assert.equal(installation.productionWrites,0);assert.equal(installation.journalFullCapacity,true,'ACCOUNTING190_JOURNAL_FULL_EPOCH_REQUIRED');
 assert.match(h.qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 // The old190 snapshot predates these three ledgers. Check each explicitly in
 // the SAME schema, returning counts+digests only, on the given tracked adapter.
 const ledgerState=async()=>{
  const entry=(name,table)=>"'"+name+"',(SELECT jsonb_build_object('count',count(*),'sha256',"+h.qa.schema+".own_run_hash_v1(coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.id),'[]'::jsonb))) FROM "+h.qa.schema+'.'+table+' e)';
  return db.run('SELECT jsonb_build_object('+[entry('accounting','own_payroll_accounting_event'),entry('imputation','own_payroll_imputation_event'),entry('journal','own_payroll_journal_event')].join(',')+')');
 };
 const reject=async(action,predicate,label)=>{const before=await ledgerState();await sameStateReject(action,predicate,label);assert.deepEqual(await ledgerState(),before,label+' preserves all three accounting ledgers');};
 const readOnly=async(action,label)=>{const before=ownAccountingImputation190Snapshot(h),ledgers=await ledgerState(),value=await action();assert.deepEqual(await ledgerState(),ledgers);assert.deepEqual(ownAccountingImputation190Snapshot(h),before);ok(true,label);return value;};
 const initial=await ledgerState();for(const name of ['accounting','imputation','journal'])assert.equal(initial[name].count,0,'ACCOUNTING190_INITIAL_LEDGER_NOT_EMPTY_'+name);
 const makerContext=JSON.stringify(employeeContext(maker.principal,maker.session)),checkerContext=JSON.stringify(employeeContext(reviewer.principal,reviewer.session));
 const accounting=(who,op,input)=>accountingOperation(db,who.principal,who.session,op,input),imputation=(who,op,input,fullJson=true)=>imputationOperation(db,who.principal,who.session,op,input,{fullJson});
 const boot=await accounting(maker,'bootstrap');assert.equal(boot.permissions.canPropose,true);assert.equal(boot.configuration.revision,0);assert.equal(boot.configuration.definition,null);assert.equal(boot.configuration.proposalId,null);assert.equal(boot.configuration.approvalId,null);assert.deepEqual(boot.proposals,[]);
 const definition=capturedDefinition(closed,second,contracts);sameIds(boot.sources.contracts.map(e=>e.contractId),contracts);
 const mappingBody=prepareAccounting(boot,definition,'Asociaciones exclusivamente sintéticas de los855 contratos cerrados del caso190'),mappingKey=randomUUID();assert.equal(mappingBody.reviewConfirmed,false);assert.equal(mappingBody.definition.mappings.length,19);assert.equal(mappingBody.definition.assignments.length,855);
 const mappingProposed=await accounting(maker,'command',{body:mappingBody,key:mappingKey});assert.equal(mappingProposed.status,'pending');
 const changedMappingBody={...mappingBody,reason:'Cambio sintético del cuerpo de asociaciones bajo la misma clave190'};
 await db.expectQueryError({caseId:'855-accounting-key-body-reuse',nativeCode:'ACCOUNTING_IDEMPOTENCY_REUSE',text:'SELECT public.own_accounting_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result',values:[makerContext,JSON.stringify(accountingCommand(changedMappingBody)),mappingKey]},()=>reject(()=>accounting(maker,'command',{body:changedMappingBody,key:mappingKey}),e=>e.code==='ACCOUNTING_IDEMPOTENCY_REUSE'&&e.status===409,'accounting same key and changed body reject without writes'));
 const reviewBoot=await accounting(reviewer,'bootstrap'),mappingDetail=await accounting(reviewer,'detail',{id:mappingProposed.proposalId}),mappingDecision=decideAccounting(reviewBoot,mappingDetail,'approve','Revisión independiente exclusivamente sintética de19 destinos y855 contratos190'),mappingDecisionKey=randomUUID();assert.equal(mappingDecision.reviewConfirmed,true);
 const sameAuthor=[];
 const sameAuthorReject=async(service,prefix,body,key,nativeSpec)=>{
  const traceStart=db.trace.length;
  await db.expectQueryError(nativeSpec,()=>reject(()=>service('command',{key,body}),e=>{if(e.status!==403||e.code!==prefix+'_FORBIDDEN')return false;sameAuthor.push({service:prefix,code:e.code,status:e.status,stage:'authorization'});return true;},prefix+' author cannot approve their own proposal through the real SQL service'));
  assert.ok(db.trace.slice(traceStart).some(t=>t.sql.includes(prefix==='ACCOUNTING'?'own_accounting_command_v1':'own_imputation_command_full_v1')),'ACCOUNTING190_SAME_AUTHOR_MUST_REACH_SQL');
 };
 const authorMappingDecision={...mappingDecision,scopeVersion:boot.scopeVersion},authorMappingKey=randomUUID();
 await sameAuthorReject((op,input)=>accounting(maker,op,input),'ACCOUNTING',authorMappingDecision,authorMappingKey,{caseId:'855-accounting-author-approval',nativeCode:'ACCOUNTING_FORBIDDEN',text:'SELECT public.own_accounting_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result',values:[makerContext,JSON.stringify(accountingCommand(authorMappingDecision)),authorMappingKey]});
 const mappingApproved=await accounting(reviewer,'command',{body:mappingDecision,key:mappingDecisionKey});assert.equal(mappingApproved.status,'approved');assert.equal(mappingApproved.revision,1);
 const configured=await accounting(maker,'bootstrap');assert.equal(configured.configuration.revision,1);assert.deepEqual(configured.configuration.definition,mappingBody.definition);assert.equal(configured.configuration.proposalId,mappingProposed.proposalId);assert.equal(configured.configuration.approvalId,mappingApproved.eventId);
 await readOnly(async()=>{for(const [who,key,body,receipt]of [[maker,mappingKey,mappingBody,mappingProposed],[reviewer,mappingDecisionKey,mappingDecision,mappingApproved]]){assert.deepEqual(await accounting(who,'attempt',{key}),{...receipt,replayed:true});assert.deepEqual(await accounting(who,'command',{key,body}),{...receipt,replayed:true});}},'accounting exact bodies and keys recover and replay without another ledger event');
 ok(true,'captured19 monetary destinations and855 institutional assignments are independently approved; nullable bank and creditor references remain null');
 const query={period:closed.snapshot.period,liquidationType:closed.snapshot.liquidationType},sourceInput={id:closed.groupId,fiscalYear:closed.snapshot.period.slice(0,4)},imputationBoot=await imputation(maker,'bootstrap',query);assert.equal(imputationBoot.permissions.canPropose,true);assert.deepEqual(imputationBoot.proposals,[]);
 const preview=await imputation(maker,'source',sourceInput);assert.equal(preview.revision,0);assertAllocation(preview,closed,second,configured.configuration);assert.equal(await accountingHash(preview.allocation),preview.allocationSha256);
 await db.expectQueryError({caseId:'855-imputation-legacy-source',nativeCode:'IMPUTATION_LIMIT',text:'SELECT public.own_imputation_source_v1($1::jsonb,$2::uuid,$3::text) AS result',values:[makerContext,sourceInput.id,sourceInput.fiscalYear]},()=>reject(()=>imputation(maker,'source',sourceInput,false),e=>e.code==='IMPUTATION_LIMIT'&&e.status===422,'legacy16 refuses the complete accounting source instead of truncating it'));
 const imputationBody=await prepareImputation(imputationBoot,preview,'Imputación exclusivamente sintética de la fuente cerrada íntegra del caso190'),imputationKey=randomUUID();assert.equal(imputationBody.reviewConfirmed,true);
 assert.ok(salaryJsonbBytes(preview.source)+salaryJsonbBytes(preview.allocation)+salaryJsonbBytes(imputationBody)+16384<=FULL);
 // The real full writer reaches an AFTER INSERT trigger, whose exception must
 // roll back that event. This tests trigger-fault atomicity, not a particular
 // capacity guard. Use direct SQL like190's annul fault to retain the raw marker.
 await db.run("CREATE FUNCTION qa_imputation190_late_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QA_M7_IMPUTATION190_LATE_FAULT';END $$;CREATE TRIGGER qa_imputation190_late_fault AFTER INSERT ON own_payroll_imputation_event FOR EACH ROW EXECUTE FUNCTION qa_imputation190_late_fault()");
 const lateImputationSql='SELECT own_imputation_command_full_v1('+sqlJson(employeeContext(maker.principal,maker.session))+','+sqlJson(imputationBody)+','+sqlLiteral(imputationKey)+'::uuid)';
 try{await db.expectRunError({caseId:'855-imputation-late-trigger',nativeCode:'QA_M7_IMPUTATION190_LATE_FAULT',statement:lateImputationSql,runtime:true},()=>reject(()=>db.run(lateImputationSql,true),e=>/ERROR:.*QA_M7_IMPUTATION190_LATE_FAULT/.test(e.message),'late imputation trigger fault rolls back all three ledgers before retrying the exact original key'));}
 finally{await db.run('DROP TRIGGER qa_imputation190_late_fault ON own_payroll_imputation_event;DROP FUNCTION qa_imputation190_late_fault()');}
 const imputationProposed=await imputation(maker,'command',{key:imputationKey,body:imputationBody});assert.equal(imputationProposed.status,'pending');
 const changedImputationBody={...imputationBody,reason:'Cambio sintético del cuerpo de imputación bajo la misma clave190'};
 await db.expectQueryError({caseId:'855-imputation-key-body-reuse',nativeCode:'IMPUTATION_IDEMPOTENCY_REUSE',text:'SELECT public.own_imputation_command_full_v1($1::jsonb,$2::jsonb,$3::uuid) AS result',values:[makerContext,JSON.stringify(imputationCommand(changedImputationBody)),imputationKey]},()=>reject(()=>imputation(maker,'command',{key:imputationKey,body:changedImputationBody}),e=>e.code==='IMPUTATION_IDEMPOTENCY_REUSE'&&e.status===409,'imputation same key and changed body reject without writes'));
 const imputationReviewBoot=await imputation(reviewer,'bootstrap',query),imputationDetail=await imputation(reviewer,'detail',{id:imputationProposed.proposalId}),imputationDecision=await decideImputation(imputationReviewBoot,imputationDetail,'approve','Revisión independiente exclusivamente sintética de17100 disposiciones del caso190'),imputationDecisionKey=randomUUID();
 assert.equal(imputationDetail.sourceCurrent,true);assert.deepEqual(imputationDetail.source,preview.source);assert.deepEqual(imputationDetail.allocation,preview.allocation);
 await db.expectQueryError({caseId:'855-imputation-legacy-detail',nativeCode:'IMPUTATION_LIMIT',text:'SELECT public.own_imputation_detail_v1($1::jsonb,$2::uuid) AS result',values:[checkerContext,imputationProposed.proposalId]},()=>reject(()=>imputation(reviewer,'detail',{id:imputationProposed.proposalId},false),e=>e.code==='IMPUTATION_LIMIT'&&e.status===422,'legacy16 cannot open a complete conserved full32 proposal as a partial detail'));
 const authorImputationDecision={...imputationDecision,scopeVersion:imputationBoot.scopeVersion},authorImputationKey=randomUUID();
 await sameAuthorReject((op,input)=>imputation(maker,op,input),'IMPUTATION',authorImputationDecision,authorImputationKey,{caseId:'855-imputation-author-approval',nativeCode:'IMPUTATION_FORBIDDEN',text:'SELECT public.own_imputation_command_full_v1($1::jsonb,$2::jsonb,$3::uuid) AS result',values:[makerContext,JSON.stringify(imputationCommand(authorImputationDecision)),authorImputationKey]});
 const imputationApproved=await imputation(reviewer,'command',{key:imputationDecisionKey,body:imputationDecision});assert.equal(imputationApproved.status,'approved');assert.equal(imputationApproved.revision,1);
 const approvedImputation=await imputation(reviewer,'detail',{id:imputationProposed.proposalId});assert.equal(approvedImputation.proposal.status,'approved');assert.equal(approvedImputation.sourceCurrent,true);assert.deepEqual(approvedImputation.body,imputationBody);assert.deepEqual(approvedImputation.source,preview.source);assert.deepEqual(approvedImputation.allocation,preview.allocation);assert.equal(approvedImputation.allocationSha256,preview.allocationSha256);assert.ok(bytes({ok:true,data:approvedImputation})<=FULL);assert.ok(salaryJsonbBytes(approvedImputation)+19<=FULL);
 const csv=await approvedImputationCsv(approvedImputation);assert.equal(csv.split('\r\n').length-2,17100);assert.equal(approvedImputation.allocation.rows.filter(r=>r.state==='auxiliary'&&r.destination===null).length,855);
 await readOnly(async()=>{for(const [who,key,body,receipt]of [[maker,imputationKey,imputationBody,imputationProposed],[reviewer,imputationDecisionKey,imputationDecision,imputationApproved]]){assert.deepEqual(await imputation(who,'attempt',{key}),{...receipt,replayed:true});assert.deepEqual(await imputation(who,'command',{key,body}),{...receipt,replayed:true});}},'imputation exact original bodies and keys recover and replay after independent approval');
 const beforeReopen=await ledgerState();assert.equal(beforeReopen.accounting.count,2);assert.equal(beforeReopen.imputation.count,2);assert.equal(beforeReopen.journal.count,0);
 ok(true,'one full32 approved imputation conserves855 employees,16245 monetary rows,855 auxiliary rows, original capture dates and all totals');
 return{approvedImputation,async afterReopen(reopened){
  await verifiedOwnCloseReceipt(reopened);assert.equal(reopened.groupId,closed.groupId);assert.deepEqual(reopened.snapshot,closed.snapshot);assert.equal(reopened.snapshotSha256,closed.snapshotSha256);
  await db.expectQueryError({caseId:'855-imputation-source-after-reopen',nativeCode:'IMPUTATION_REOPENED',text:'SELECT public.own_imputation_source_full_v1($1::jsonb,$2::uuid,$3::text) AS result',values:[makerContext,sourceInput.id,sourceInput.fiscalYear]},()=>reject(()=>imputation(maker,'source',sourceInput),e=>e.code==='IMPUTATION_REOPENED'&&e.status===409,'reopened group cannot create a fresh accounting source'));
  const historical=await readOnly(()=>imputation(reviewer,'detail',{id:imputationProposed.proposalId}),'approved historical imputation remains readable after reopen without another ledger event');
  assert.equal(historical.sourceCurrent,false);assert.equal(historical.proposal.status,'approved');assert.deepEqual(historical.body,approvedImputation.body);assert.deepEqual(historical.source,approvedImputation.source);assert.deepEqual(historical.allocation,approvedImputation.allocation);assert.equal(historical.allocationSha256,approvedImputation.allocationSha256);assert.equal(await accountingHash(historical.allocation),preview.allocationSha256);
  await assert.rejects(()=>approvedImputationCsv(historical),e=>e.code==='IMPUTATION_EXPORT_UNAVAILABLE');
  await readOnly(async()=>{assert.deepEqual(await imputation(maker,'attempt',{key:imputationKey}),{...imputationProposed,replayed:true});assert.deepEqual(await imputation(reviewer,'attempt',{key:imputationDecisionKey}),{...imputationApproved,replayed:true});assert.deepEqual(await imputation(maker,'command',{key:imputationKey,body:imputationBody}),{...imputationProposed,replayed:true});},'original imputation attempt recovery and exact replay stay read-only even after reopen');
  const final=await ledgerState();assert.deepEqual(final.accounting,beforeReopen.accounting);assert.deepEqual(final.imputation,beforeReopen.imputation);
  ok(true,'reopen invalidates current imputation CSV while preserving every historical source, allocation, null, amount and original hash');
  return{version:'own-accounting-imputation-canonical190-native-qa.v1',installation,population:855,conceptCount:17100,moneyCount:16245,auxiliaryCount:855,mappingCount:19,assignmentCount:855,previewBytes:bytes(preview),approvedDetailBytes:bytes(approvedImputation),sourceJsonbModelBytes:salaryJsonbBytes(preview.source),allocationJsonbModelBytes:salaryJsonbBytes(preview.allocation),sourceVersion:preview.source.sourceVersion,allocationSha256:preview.allocationSha256,accountingLedger:final.accounting,imputationLedger:final.imputation,sameAuthor,currentCsvEnabled:false,historicalSourceCurrent:false,actualSql:true,actualHttp:false,actualBrowser:false,synthetic:true,productionWrites:0,paymentExecuted:false,municipalAcceptance:false};
 }};
}
