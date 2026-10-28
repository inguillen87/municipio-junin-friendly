// Connected TEST business only. The caller owns seed retention, connections,
// transaction boundaries and the independent observer. No authentication flow
// is exercised here. Canonical synthetic operators/catalog are preconditions;
// only the beneficiary is created through the real employee service.
// Public196 deliberately excludes Run7. The earlier HTTP fixed-v2 selector
// proposal is superseded; this profile must not enable absent fixed-v2 RPCs.
import assert from 'node:assert/strict';
import {assertOwnM7NativeTestConnectedFixturePlan,materializeOwnM7NativeTestConnectedEmployee} from './own-m7-native-test-connected-fixture.mjs';
import {assertOwnM7NativeTestConnectedBusiness} from './own-m7-native-test-connected-pg.mjs';
import {programOwnerQaItems,programOwnerQaDefinition} from '../../tests/fixtures/municipal-owner-program-synthetic.js';
import {principalHasCapabilities} from '../../lib/internal-resource-access.js';
import {employeeOperation} from '../../lib/internal-native-employees.js';
import {salaryOperation} from '../../lib/internal-native-salary.js';
import {programOperation} from '../../lib/internal-own-payroll-program.js';
import {ownRunOperation,ownRunHash,RUN_CALCULATE} from '../../lib/internal-own-payroll-run.js';
import {ownLiquidationOperation,OWN_LIQ_REVIEW} from '../../lib/internal-own-payroll-liquidation.js';
import {ownAnnulOperation} from '../../lib/internal-own-payroll-annulment.js';
import {ownAnnulPreparationOperation,OWN_RUN_PREPARE} from '../../lib/internal-own-payroll-annulment-preparation.js';
import {ownCloseOperation,OWN_CLOSE_WRITE} from '../../lib/internal-own-payroll-close.js';
import {ownReceiptOperation} from '../../lib/internal-own-payroll-receipts.js';
import {ownRunBootstrap,ownRunCommand} from '../../assets/own-payroll-run-model.js';
import {verifiedOwnLiquidationDetail} from '../../assets/own-payroll-liquidation-model.js';
import {loadOwnAnnulReview,ownAnnulReviewSelection,ownAnnulReviewAttempt,verifiedOwnAnnulReviewReceipt} from '../../assets/own-payroll-annulment-review-model.js';
import {ownAnnulPreparationDates,ownAnnulPreparationForDate} from '../../assets/own-payroll-annulment-preparation-model.js';
import {ownCloseSnapshot} from '../../assets/own-payroll-close-model.js';
import {verifiedOwnReportCensus} from '../../assets/own-payroll-report-census-model.js';
import {ownReceiptParams,OWN_RECEIPT_READ} from '../../assets/own-payroll-receipt-model.js';
import {emptyOwnReportFilters} from '../../assets/own-payroll-report-model.js';

export const OWN_M7_NATIVE_TEST_CONNECTED_BUSINESS_VERSION='own-m7-native-test-connected-business.v2';
export const OWN_M7_NATIVE_TEST_CONNECTED_PROTOCOL='published-monthly-fixed-v1';
export const OWN_M7_NATIVE_TEST_CONNECTED_RUN_OPTIONS=Object.freeze({fullJson:true});
const FULL=Object.freeze({fullJson:true}),UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const exact=(value,keys,code)=>{assert.ok(value&&typeof value==='object'&&!Array.isArray(value),code);assert.deepEqual(Reflect.ownKeys(value).sort(),[...keys].sort(),code);};
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const sorted=values=>[...values].sort();
const selection=beneficiaryId=>({kind:'contracts',values:[beneficiaryId]});
const REASON={salary:'Maestro salarial canónico exclusivamente sintético M7 TEST',program:'Programa canónico de dos reglas exclusivamente sintético M7 TEST',confirm:'Confirmación independiente del beneficiario sintético M7 TEST',annul:'Anulación revisada del beneficiario sintético M7 TEST',close:'Cierre explícito del beneficiario sintético M7 TEST'};
const RECEIPT_WRITES=['payroll.receipt.prepare','payroll.receipt.approve','payroll.receipt.self.read'];

// Independent literal/period oracle for this closed canonical programme. It is
// not the product evaluator and refuses a different programme or period.
const fractionDigits=value=>(String(value).split('.')[1]??'').replace(/0+$/,'').length;
function scaled(value,scale){
 const text=String(value);assert.match(text,/^-?\d+(?:\.\d+)?$/,'M7_CONNECTED_ORACLE_DECIMAL');
 const negative=text.startsWith('-'),[whole,fraction='']=text.replace('-','').split('.'),digits=fraction.replace(/0+$/,'');
 assert.ok(digits.length<=scale,'M7_CONNECTED_ORACLE_SCALE');const n=BigInt(whole)*10n**BigInt(scale)+BigInt(digits.padEnd(scale,'0')||'0');return negative?-n:n;
}
const equalDecimal=(a,b)=>{const precision=Math.max(fractionDigits(a),fractionDigits(b));return scaled(a,precision)===scaled(b,precision);};
const money=(n,precision)=>{const negative=n<0n,abs=negative?-n:n,base=10n**BigInt(precision);return(negative?'-':'')+String(abs/base)+(precision?'.'+String(abs%base).padStart(precision,'0'):'');};
export function ownM7NativeTestConnectedOracle(definition,period){
 assert.deepEqual(definition,programOwnerQaDefinition(),'M7_CONNECTED_CANONICAL_PROGRAM_REQUIRED');assert.equal(period,'2026-10','M7_CONNECTED_CANONICAL_PERIOD_REQUIRED');
 const month=String(Number(period.slice(5))),precision=definition.totalsPrecision;
 const rows=definition.rules.map(rule=>{
  if(rule.expression.op==='literal')return{conceptCode:rule.code,nature:rule.nature,unit:rule.unit,amount:rule.expression.value};
  assert.equal(rule.expression.op,'input');assert.equal(rule.expression.key,'month');
  const binding=definition.bindings.find(row=>row.agreementCode===rule.agreementCode&&row.key==='month');
  assert.ok(binding&&binding.sourceKind==='period_context_fact'&&binding.sourceField==='monthNumber'&&binding.onMissing==='error'&&binding.combine==='single','M7_CONNECTED_ORACLE_BINDING');
  return{conceptCode:rule.code,nature:rule.nature,unit:rule.unit,amount:month};
 });
 const sum=nature=>rows.filter(row=>row.nature===nature).reduce((total,row)=>total+scaled(row.amount,precision),0n);
 const remuneration=sum('remuneration'),nonRemuneration=sum('non_remuneration'),deduction=sum('deduction'),employer=sum('employer_contribution'),gross=remuneration+nonRemuneration;
 return freeze({month,rows,totals:Object.fromEntries(Object.entries({remuneration,non_remuneration:nonRemuneration,deduction,employer_contribution:employer,gross,net:gross-deduction}).map(([key,value])=>[key,money(value,precision)]))});
}

export function ownM7NativeTestConnectedRunBody(options){
 exact(options,['bootstrap','period','liquidationType','liquidationDate','beneficiaryId'],'M7_CONNECTED_RUN_OPTIONS');
 const{bootstrap,period,liquidationType,liquidationDate,beneficiaryId}=options;ownRunBootstrap(bootstrap);
 assert.equal(bootstrap.version,'own-payroll-bootstrap.v2');assert.equal(bootstrap.canCalculate,true);assert.match(beneficiaryId,UUID);
 return freeze(ownRunCommand({version:'own-payroll-run-command.v2',period,liquidationType,liquidationDate,selection:selection(beneficiaryId),scopeVersion:bootstrap.scopeVersion,programVersion:bootstrap.programVersion,populationDomain:'native_registered'}));
}

export function ownM7NativeTestConnectedReceiptParams({plan,beneficiaryId}){
 assertOwnM7NativeTestConnectedFixturePlan(plan);assert.match(beneficiaryId,UUID);assert.equal(plan.issuer.kind,'synthetic_test');
 assert.ok(plan.subjects.filter(subject=>subject.creationMode==='explicit_fixture_seed').every(subject=>subject.contractId!==beneficiaryId),'M7_CONNECTED_RECEIPT_BENEFICIARY_ONLY');
 const maker=plan.subjects.find(subject=>subject.key==='maker');assert.ok(maker&&/^\d{11}$/.test(maker.draft.cuil));
 return freeze(ownReceiptParams({period:plan.canonical.period,types:[plan.canonical.liquidationType],filters:emptyOwnReportFilters(),issuer:{name:plan.issuer.name,taxId:maker.draft.cuil,address:'DOMICILIO EXCLUSIVAMENTE SINTÉTICO '+plan.scope.slug},paymentDate:null,legend:'PREVIA EXCLUSIVAMENTE SINTÉTICA; NO ES DOCUMENTO MUNICIPAL',contracts:[beneficiaryId]}));
}

function assertActors(plan){
 const{maker,checker}=plan.actors;
 for(const field of ['membershipId','email'])assert.notEqual(maker[field],checker[field]);assert.notEqual(maker.session.id,checker.session.id);
 const seeded=plan.subjects.filter(subject=>subject.creationMode==='explicit_fixture_seed');assert.equal(seeded.length,2);assert.equal(new Set(seeded.map(subject=>subject.personId)).size,2);
 for(const[name,required,forbidden]of[
  ['maker',[...RUN_CALCULATE,...OWN_RUN_PREPARE,'employee.record.create','payroll.parameter.prepare'],['payroll.parameter.approve','payroll.calculation.approve','payroll.calculation.close',...RECEIPT_WRITES]],
  ['checker',[...OWN_LIQ_REVIEW,...OWN_CLOSE_WRITE,...OWN_RECEIPT_READ,'payroll.parameter.approve'],['payroll.parameter.prepare','payroll.calculation.prepare',...RECEIPT_WRITES]]
 ]){
  const actor=plan.actors[name];assert.ok(principalHasCapabilities(actor.principal,required,'all'),'M7_CONNECTED_REQUIRED_CAPABILITIES:'+name);assert.equal(principalHasCapabilities(actor.principal,forbidden,'any'),false,'M7_CONNECTED_FORBIDDEN_CAPABILITIES:'+name);
  assert.deepEqual(sorted(actor.principal.tenant.effectiveCapabilities),sorted(actor.capabilities));assert.equal(actor.principal.tenant.id,plan.scope.tenantId);assert.equal(actor.session.releaseSha,plan.sourceCommit);assert.equal(actor.session.email,actor.email);
 }
}
function assertCalculation(capture,{key,body,beneficiaryId,definition,oracle,label}){
 assert.equal(capture.key,key,label+':KEY');assert.equal(capture.replayed,false,label+':NEW');assert.deepEqual(capture.body,body,label+':BODY');
 assert.equal(capture.payload.fixed.list.data.version,'payroll-fixed-list.v1');assert.equal(capture.payload.fixed.export.data.version,'payroll-fixed-export.v1');assert.equal(Object.hasOwn(capture.payload.sourceInventory,'fixedCapacityVersion'),false);for(const fixed of[capture.payload.fixed.list.data,capture.payload.fixed.export.data]){assert.equal(fixed.total,0,label+':NO_FIXED_NOVELTIES');assert.equal(fixed.rows.length,0,label+':NO_FIXED_ROWS');}
 const saved=capture.saved;assert.ok(saved,label+':SAVED');assert.equal(saved.inputSha256,ownRunHash(saved.input));assert.equal(saved.resultSha256,ownRunHash(saved.result));assert.deepEqual(saved.input.rules,definition.rules);
 assert.deepEqual(saved.input.employees.map(employee=>employee.contractId),[beneficiaryId],label+':ONLY_BENEFICIARY');assert.ok(saved.input.employees[0].inputs.some(input=>input.key==='month'&&input.value===oracle.month));
 assert.equal(capture.payload.monthly.batches.length,0,label+':EMPTY_MONTHLY_SOURCES');assert.equal(saved.result.payrollCalculated,true);assert.equal(saved.result.paymentExecuted,false);assert.equal(saved.result.employeeCount,1);assert.equal(saved.result.rowCount,oracle.rows.length);
 for(const expected of oracle.rows){const rows=saved.result.rows.filter(row=>row.contractId===beneficiaryId&&row.conceptCode===expected.conceptCode&&row.nature===expected.nature);assert.equal(rows.length,1);assert.equal(rows[0].unit,expected.unit);assert.ok(equalDecimal(rows[0].amount,expected.amount),label+':AMOUNT:'+expected.conceptCode);}
 assert.equal(saved.result.employeeTotals.length,1);assert.equal(saved.result.employeeTotals[0].contractId,beneficiaryId);for(const[key,value]of Object.entries(oracle.totals))assert.ok(equalDecimal(saved.result.employeeTotals[0][key],value),label+':TOTAL:'+key);
}

/** Requires a minted TEST plan and a minted transport already in its runtime
 * business phase. A failure propagates; only the caller manages disposition. */
export async function runOwnM7NativeTestConnectedBusiness(options){
 exact(options,['plan','connected'],'M7_CONNECTED_BUSINESS_OPTIONS');const{plan,connected}=options;
 assertOwnM7NativeTestConnectedFixturePlan(plan);const native=assertOwnM7NativeTestConnectedBusiness(connected);assert.deepEqual(native.target,plan.target,'M7_CONNECTED_TARGET_MISMATCH');assert.deepEqual(connected.branchCreation,plan.branchCreation,'M7_CONNECTED_BRANCH_CUSTODY_MISMATCH');assert.equal(native.seedRetentionExpected,true);assert.equal(native.businessRollbackOnly,true);assert.equal(native.completeAuth,false);
 assert.equal(plan.kind,'test');assert.equal(plan.schema,'public');assert.equal(plan.productionAdmitted,false);assert.equal(plan.protocol,OWN_M7_NATIVE_TEST_CONNECTED_PROTOCOL);assert.equal(plan.fullfixedV2Pending,true);assert.equal(plan.businessScenario.protocol,OWN_M7_NATIVE_TEST_CONNECTED_PROTOCOL);assert.equal(plan.businessScenario.fullfixedV2Pending,true);assert.deepEqual(plan.businessScenario.runDependencies,OWN_M7_NATIVE_TEST_CONNECTED_RUN_OPTIONS);assert.deepEqual(plan.canonical.salaryItems,programOwnerQaItems());assert.deepEqual(plan.canonical.program,programOwnerQaDefinition());assertActors(plan);
 const trace=[],steps=[],order=plan.steps.filter(step=>step.actor).map(step=>step.id),done=[];
 const sql=Object.freeze({query:async(text,values)=>{assertOwnM7NativeTestConnectedBusiness(connected);const match=/^SELECT public\.([a-z0-9_]+)\(/.exec(text);assert.ok(match,'M7_CONNECTED_RPC_ONLY');trace.push(match[1]);const result=await connected.sql.query(text,values);assertOwnM7NativeTestConnectedBusiness(connected);return result;}});
 const at=async(id,fn)=>{const start=trace.length,value=await fn();steps.push({id,rpc:trace.slice(start)});if(order.includes(id))done.push(id);else assert.ok(id.startsWith('driver:'),'M7_CONNECTED_UNPLANNED_STEP:'+id);return value;};
 const key=id=>{const step=plan.steps.find(row=>row.id===id);assert.ok(step&&UUID.test(step.requestKey??''),'M7_CONNECTED_PLAN_KEY:'+id);return step.requestKey;};
 const maker=plan.actors.maker,checker=plan.actors.checker,period=plan.canonical.period,liquidationType=plan.canonical.liquidationType,definition=plan.canonical.program,items=plan.canonical.salaryItems;
 const run=(actor,operation,input)=>ownRunOperation(sql,actor.principal,actor.session,operation,input,OWN_M7_NATIVE_TEST_CONNECTED_RUN_OPTIONS);
 const liquidation=(actor,operation,input)=>ownLiquidationOperation(sql,actor.principal,actor.session,operation,input,FULL);
 const annul=(actor,operation,input)=>ownAnnulOperation(sql,actor.principal,actor.session,operation,input,FULL);
 const close=(operation,input)=>ownCloseOperation(sql,checker.principal,checker.session,operation,input,FULL);
 const detail=async id=>{const value=await liquidation(checker,'detail',{id});await verifiedOwnLiquidationDetail(value);return value;};

 const employeeBoot=await at('beneficiary-bootstrap',()=>employeeOperation(sql,maker.principal,maker.session,'bootstrap'));
 const creation=materializeOwnM7NativeTestConnectedEmployee({plan,subject:'beneficiary',bootstrap:employeeBoot});assert.equal(creation.key,key('beneficiary-create'));
 const hired=await at('beneficiary-create',()=>employeeOperation(sql,maker.principal,maker.session,'create',creation));
 const beneficiaryId=hired.contractId;assert.match(beneficiaryId,UUID);assert.equal(hired.origin,'MUNICONTROL');assert.equal(hired.accountCreated,false);assert.equal(hired.payrollCalculated,false);assert.equal(hired.startDate,creation.body.draft.startDate);
 const seeded=plan.subjects.filter(subject=>subject.creationMode==='explicit_fixture_seed');assert.ok(seeded.every(subject=>subject.contractId!==beneficiaryId));
 const roster=sorted([...seeded.map(subject=>subject.contractId),beneficiaryId]);assert.equal(roster.length,3);assert.equal(new Set(roster).size,3);
 const recovered=await at('driver:beneficiary-attempt',()=>employeeOperation(sql,maker.principal,maker.session,'attempt',{key:creation.key}));assert.equal(recovered.contractId,beneficiaryId);
 const liquidationDate=employeeBoot.today;assert.equal(liquidationDate.slice(0,7),period);const oracle=ownM7NativeTestConnectedOracle(definition,period);

 const salaryBoot=await at('salary-bootstrap',()=>salaryOperation(sql,maker.principal,maker.session,'bootstrap'));assert.equal(salaryBoot.catalog.revision,0);assert.deepEqual(salaryBoot.catalog.items,[]);assert.equal(salaryBoot.permissions.canPropose,true);
 const salaryBody={command:'propose',scopeVersion:salaryBoot.scopeVersion,baseVersion:salaryBoot.catalog.version,classificationVersion:salaryBoot.classification.version,proposalId:null,proposalSha256:null,items:structuredClone(items),reason:REASON.salary,reviewConfirmed:false};
 const salaryProposal=await at('salary-propose',()=>salaryOperation(sql,maker.principal,maker.session,'command',{key:key('salary-propose'),body:salaryBody}));assert.equal(salaryProposal.status,'pending');assert.equal(salaryProposal.replayed,false);
 const salaryReview=await at('driver:salary-review-bootstrap',()=>salaryOperation(sql,checker.principal,checker.session,'bootstrap'));assert.equal(salaryReview.permissions.canReview,true);
 const salaryApproval=await at('salary-review',()=>salaryOperation(sql,checker.principal,checker.session,'command',{key:key('salary-review'),body:{...salaryBody,command:'approve',scopeVersion:salaryReview.scopeVersion,items:null,proposalId:salaryProposal.proposalId,proposalSha256:salaryProposal.requestSha256,reviewConfirmed:true}}));assert.equal(salaryApproval.status,'approved');assert.equal(salaryApproval.revision,1);
 const programBoot=await at('program-bootstrap',()=>programOperation(sql,maker.principal,maker.session,'bootstrap'));assert.equal(programBoot.program.revision,0);assert.equal(programBoot.program.definition,null);assert.equal(programBoot.salaryCatalog.version,salaryApproval.catalogVersion);assert.deepEqual(programBoot.salaryCatalog.items,items);assert.equal(programBoot.permissions.canPropose,true);
 const programBody={command:'propose',scopeVersion:programBoot.scopeVersion,baseVersion:programBoot.program.version,salaryVersion:programBoot.salaryCatalog.version,proposalId:null,proposalSha256:null,program:structuredClone(definition),reason:REASON.program,reviewConfirmed:false};
 const programProposal=await at('program-propose',()=>programOperation(sql,maker.principal,maker.session,'command',{key:key('program-propose'),body:programBody}));
 const programReview=await at('driver:program-review-bootstrap',()=>programOperation(sql,checker.principal,checker.session,'bootstrap'));assert.equal(programReview.permissions.canReview,true);
 const programApproval=await at('program-review',()=>programOperation(sql,checker.principal,checker.session,'command',{key:key('program-review'),body:{...programBody,command:'approve',scopeVersion:programReview.scopeVersion,program:null,proposalId:programProposal.proposalId,proposalSha256:programProposal.requestSha256,reviewConfirmed:true}}));assert.equal(programApproval.status,'approved');
 const published=await at('driver:program-published',()=>programOperation(sql,maker.principal,maker.session,'bootstrap'));assert.equal(published.program.revision,1);assert.deepEqual(published.program.definition,definition);assert.equal(published.program.proposalId,programProposal.proposalId);

 const runBoot=await at('driver:run-bootstrap',()=>run(maker,'bootstrap',{contractVersion:'2'}));assert.equal(runBoot.programVersion,published.program.version);
 const firstBody=ownM7NativeTestConnectedRunBody({bootstrap:runBoot,period,liquidationType,liquidationDate,beneficiaryId});
 const first=await at('calculate',()=>run(maker,'calculate',{body:firstBody,key:key('calculate')}));assertCalculation(first,{key:key('calculate'),body:firstBody,beneficiaryId,definition,oracle,label:'FIRST'});
 const confirm=async(id,capture)=>{const value=await at('driver:'+id+'-detail',()=>detail(capture.id));assert.equal(value.capture.saved.resultSha256,capture.saved.resultSha256);const receipt=await at(id,()=>liquidation(checker,'command',{key:key(id),body:{runId:value.id,resultSha256:value.capture.saved.resultSha256,scopeVersion:value.scopeVersion,stateVersion:value.stateVersion,command:'confirm',selection:selection(beneficiaryId),reason:REASON.confirm,reviewConfirmed:true}}));assert.equal(receipt.runId,capture.id);assert.deepEqual(receipt.affected.map(row=>row.contractId),[beneficiaryId]);assert.equal(receipt.affected[0].state,'confirmed');return receipt;};
 const confirmed=await confirm('confirm',first);
 const index=await at('driver:annul-review-index',()=>annul(checker,'review',{period,liquidationType}));assert.equal(index.index.length,1);assert.equal(index.index[0].id,first.id);assert.equal(index.index[0].states.confirmed,1);
 const review=await loadOwnAnnulReview(index,id=>at('driver:annul-review-detail',()=>detail(id)));
 const annulBody={version:'own-annul-command.v2',period,liquidationType,scopeVersion:index.scopeVersion,stateVersion:index.stateVersion,reviewSha256:index.reviewSha256,selection:selection(beneficiaryId),reason:REASON.annul,reviewConfirmed:true};
 const attempt=ownAnnulReviewAttempt(key('annul-v2'),annulBody,'m7-test:'+checker.membershipId,ownAnnulReviewSelection(review,annulBody.selection));
 const annulled=await at('annul-v2',()=>annul(checker,'command-v2',{key:attempt.key,body:attempt.body}));await verifiedOwnAnnulReviewReceipt(annulled,attempt);assert.equal(annulled.replayed,false);assert.equal(annulled.receipts.length,1);assert.equal(annulled.receipts[0].runId,first.id);assert.deepEqual(annulled.affected.map(row=>row.contractId),[beneficiaryId]);
 assert.deepEqual(await at('driver:annul-v2-replay',()=>annul(checker,'command-v2',{key:attempt.key,body:attempt.body})),{...annulled,replayed:true});
 const before209=trace.length;await assert.rejects(()=>ownAnnulPreparationOperation(sql,checker.principal,checker.session,'detail',{id:annulled.id},FULL),error=>error.code==='OWN_ANNUL_PREPARATION_FORBIDDEN'&&error.status===403);assert.equal(trace.length,before209,'M7_CONNECTED_JS_NEGATIVE_REACHED_SQL');
 const projection=await at('driver:annul-209-preparation',()=>ownAnnulPreparationOperation(sql,maker.principal,maker.session,'detail',{id:annulled.id},FULL));assert.equal(projection.source.id,annulled.id);assert.equal(projection.source.receiptVersion,'own-annul-receipt.v2');assert.equal(projection.source.receiptSha256,ownRunHash(annulled));assert.deepEqual(projection.affected.map(row=>row.contractId),[beneficiaryId]);assert.equal(projection.runs.length,1);assert.equal(projection.runs[0].id,first.id);assert.equal(projection.runs[0].resultSha256,first.saved.resultSha256);assert.equal(projection.runs[0].employeeCount,1);assert.deepEqual(ownAnnulPreparationDates(projection),[{liquidationDate,count:1}]);
 const draft=ownAnnulPreparationForDate(projection,liquidationDate);assert.equal(draft.reviewConfirmed,false);assert.deepEqual(draft.selection,selection(beneficiaryId));
 const recalcBoot=await at('driver:recalculate-bootstrap',()=>run(maker,'bootstrap',{contractVersion:'2'}));assert.equal(recalcBoot.scopeVersion,draft.scopeVersion);assert.equal(recalcBoot.programVersion,runBoot.programVersion);
 const secondBody=ownM7NativeTestConnectedRunBody({bootstrap:recalcBoot,period:draft.period,liquidationType:draft.liquidationType,liquidationDate:draft.liquidationDate,beneficiaryId});assert.equal(Object.hasOwn(secondBody,'sourceReference'),false);
 const second=await at('recalculate',()=>run(maker,'calculate',{body:secondBody,key:key('recalculate')}));assertCalculation(second,{key:key('recalculate'),body:secondBody,beneficiaryId,definition,oracle,label:'SECOND'});assert.notEqual(second.id,first.id);assert.deepEqual(second.saved.result.rows,first.saved.result.rows);assert.deepEqual(second.saved.result.employeeTotals,first.saved.result.employeeTotals);
 const reconfirmed=await confirm('confirm-recalculation',second);
 const query={period,liquidationType},beforeClose=await at('driver:close-detail',()=>close('detail',query));assert.deepEqual(sorted(beforeClose.rows.map(row=>row.contractId)),roster);assert.equal(beforeClose.rows.find(row=>row.contractId===beneficiaryId)?.state,'confirmed');for(const row of beforeClose.rows.filter(row=>row.contractId!==beneficiaryId)){assert.equal(row.state,'missing');assert.equal(row.canClose,false);}
 const closeBody={...query,scopeVersion:beforeClose.scopeVersion,stateVersion:beforeClose.stateVersion,selection:selection(beneficiaryId),command:'close',groupId:null,reason:REASON.close,reviewConfirmed:true};
 const closed=await at('close',()=>close('command',{key:key('close'),body:closeBody}));assert.deepEqual(closed.snapshot,ownCloseSnapshot(beforeClose,closeBody.selection));assert.equal(closed.snapshot.employeeCount,1);assert.equal(closed.snapshot.populationCount,3);assert.equal(closed.snapshot.populationComplete,false);assert.equal(closed.snapshot.conceptCount,definition.rules.length);assert.equal(closed.snapshot.employees[0].contractId,beneficiaryId);assert.equal(closed.snapshot.employees[0].runId,second.id);for(const[key,value]of Object.entries(oracle.totals))assert.ok(equalDecimal(closed.snapshot.employees[0].totals[key],value));
 assert.deepEqual(await at('driver:close-group',()=>close('group',{id:closed.groupId})),{...closed,replayed:true});assert.deepEqual(await at('driver:close-attempt',()=>close('attempt',{key:key('close')})),{...closed,replayed:true});
 const census=await at('report-census',()=>close('report-census',query));await verifiedOwnReportCensus(census);assert.equal(census.eventCount,1);assert.equal(census.groups.length,1);assert.equal(census.groups[0].id,closed.groupId);assert.equal(census.groups[0].state,'closed');assert.equal(census.groups[0].employeeCount,1);assert.equal(census.groups[0].populationCount,3);assert.equal(census.groups[0].populationComplete,false);assert.equal(census.groups[0].snapshotSha256,closed.snapshotSha256);
 const params=ownM7NativeTestConnectedReceiptParams({plan,beneficiaryId}),preview=await at('receipt-preview',()=>ownReceiptOperation(sql,checker.principal,checker.session,'preview',{params}));assert.equal(preview.snapshotSha256,ownRunHash(preview.snapshot));assert.deepEqual(preview.snapshot.params,params);assert.equal(preview.snapshot.recordCount,1);assert.equal(preview.snapshot.sources.length,1);assert.equal(preview.snapshot.records[0].contractId,beneficiaryId);assert.equal(preview.snapshot.records[0].runId,second.id);assert.equal(preview.snapshot.records[0].sourceGroupId,closed.groupId);assert.equal(preview.snapshot.signatureState,'pending');assert.equal(preview.snapshot.paymentExecuted,false);assert.equal(preview.snapshot.payrollPosted,false);
 assert.deepEqual(done,order,'M7_CONNECTED_PLAN_ORDER');for(const name of ['own_run_capture_v1','own_run_complete_full_v1'])assert.equal(trace.filter(fn=>fn===name).length,2,'M7_CONNECTED_PUBLISHED_RUN_RPC:'+name);assert.equal(trace.some(fn=>/^own_run_(?:capture_fixed|complete_fixed)/.test(fn)),false,'M7_CONNECTED_UNADMITTED_FIXED_V2_RPC');
 assertOwnM7NativeTestConnectedFixturePlan(plan);assertOwnM7NativeTestConnectedBusiness(connected);
 return freeze({version:OWN_M7_NATIVE_TEST_CONNECTED_BUSINESS_VERSION,protocol:OWN_M7_NATIVE_TEST_CONNECTED_PROTOCOL,fullfixedV2Pending:true,kind:'test',sourceCommit:plan.sourceCommit,runId:plan.runId,steps,trace,selectedEmployees:1,rosterEmployees:3,rulesPerEmployee:definition.rules.length,beneficiaryContractId:beneficiaryId,liquidationDate,oracle,first:{id:first.id,resultSha256:first.saved.resultSha256,confirmId:confirmed.id},annulment:{id:annulled.id,receiptSha256:ownRunHash(annulled),replayVerified:true},preparation209:{preparationSha256:projection.preparationSha256,affected:1,checkerRefusedBeforeSql:true},second:{id:second.id,resultSha256:second.saved.resultSha256,confirmId:reconfirmed.id,rowsEqualFirst:true},close:{groupId:closed.groupId,snapshotSha256:closed.snapshotSha256,employeeCount:1,populationCount:3,populationComplete:false},census:{eventCount:census.eventCount,sourceVersion:census.sourceVersion},receiptPreview:preview,receipts:{preview:true,prepare:false,approve:false,self:false,pdf:false,issuer:'explicit_synthetic_fixture'},transactionManagedByCaller:true,businessSyntheticAuth:true,completeAuthenticationHandler:false,realMfaVerified:false,realJwtIssued:false,normalLoginProven:false,httpHandlerProven:false,browserProven:false,productionWrites:0,noeliaReady:false});
}
