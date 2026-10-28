import assert from 'node:assert/strict';
import {assertOwnM5M7NoveltyPositiveProfile,materializeOwnM5M7Beneficiary,ownM5M7ProgrammeSha,OWN_M5_M7_PROTOCOL,ownM5M7CanonicalProgram} from './own-m5-m7-novelty-positive-profile.mjs';
import {assertOwnM5M7NativeTestConnectedBusiness} from './own-m5-m7-native-test-connected-pg.mjs';
import {employeeOperation} from '../../lib/internal-native-employees.js';
import {salaryOperation} from '../../lib/internal-native-salary.js';
import {programOperation} from '../../lib/internal-own-payroll-program.js';
import {ownNoveltyOperation,ownNoveltyHash,verifyOwnNoveltyHashes} from '../../lib/internal-own-payroll-novelties.js';
import {ownRunOperation,ownRunHash} from '../../lib/internal-own-payroll-run.js';
import {ownLiquidationOperation} from '../../lib/internal-own-payroll-liquidation.js';
import {ownAnnulOperation} from '../../lib/internal-own-payroll-annulment.js';
import {ownAnnulPreparationOperation} from '../../lib/internal-own-payroll-annulment-preparation.js';
import {ownCloseOperation} from '../../lib/internal-own-payroll-close.js';
import {ownRunCommand} from '../../assets/own-payroll-run-model.js';
import {prepareOwnNoveltyReview,ownNoveltyCommand} from '../../assets/own-payroll-novelties-model.js';
import {verifiedOwnLiquidationDetail} from '../../assets/own-payroll-liquidation-model.js';
import {loadOwnAnnulReview,ownAnnulReviewSelection,ownAnnulReviewAttempt,verifiedOwnAnnulReviewReceipt} from '../../assets/own-payroll-annulment-review-model.js';
import {ownAnnulPreparationForDate,ownAnnulPreparationDates} from '../../assets/own-payroll-annulment-preparation-model.js';
import {ownCloseSnapshot} from '../../assets/own-payroll-close-model.js';
import {verifiedOwnReportCensus} from '../../assets/own-payroll-report-census-model.js';

export const OWN_M5_M7_BUSINESS_VERSION='own-m5-m7-novelty-positive-business.v1';
const FULL=Object.freeze({fullJson:true}),UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const copy=x=>JSON.parse(JSON.stringify(x));
const freeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
const select=id=>({kind:'contracts',values:[id]});
const cents=value=>{assert.match(String(value),/^-?\d+(?:\.\d+)?$/);const [a,b='']=String(value).split('.');assert.ok(b.length<=8);return BigInt(a)*100000000n+(String(value).startsWith('-')?-1n:1n)*BigInt(b.padEnd(8,'0'));};
const equal=(a,b)=>assert.equal(cents(a),cents(b));
const REASON={salary:'Catálogo exclusivamente sintético M5 M7 positivo',program:'Programa sintético base más regla120 copiada de fixture',confirm:'Confirmación independiente del beneficiario sintético',annul:'Anulación revisada sintética sin alterar lote aprobado',close:'Cierre sintético explícito de un contrato del padrón3'};
export function ownM5M7PositiveOracle(definition,period,amountCents='2000'){
 assert.deepEqual(definition,ownM5M7CanonicalProgram().definition);assert.equal(period,'2026-10');assert.equal(amountCents,'2000');
 // Independent integer oracle: the product evaluator is never called here.
 const base=10010n,novelty=BigInt(amountCents),gross=base+novelty,money=n=>String(n/100n)+'.'+String(n%100n).padStart(2,'0');
 return freeze({rows:[{conceptCode:'1',nature:'remuneration',unit:'money',amount:money(base)},{conceptCode:'120',nature:'non_remuneration',unit:'money',amount:money(novelty)},{conceptCode:'101',nature:'auxiliary',unit:'units',amount:String(Number(period.slice(5)))}],totals:{remuneration:money(base),non_remuneration:money(novelty),deduction:'0.00',employer_contribution:'0.00',gross:money(gross),net:money(gross)},municipalFormula:false});
}
function assertCalculation(capture,{body,key,beneficiaryId,plan,approved,oracle}){
 assert.equal(capture.key,key);assert.deepEqual(capture.body,body);assert.equal(capture.replayed,false);assert.ok(capture.saved);
 assert.equal(capture.payload.fixed.list.data.version,'payroll-fixed-list.v1');assert.equal(capture.payload.fixed.export.data.version,'payroll-fixed-export.v1');
 for(const source of [capture.payload.fixed.list.data,capture.payload.fixed.export.data]){assert.equal(source.total,0);assert.deepEqual(source.rows,[]);}
 assert.equal(Object.hasOwn(capture.payload.sourceInventory,'fixedCapacityVersion'),false);
 assert.deepEqual(capture.payload.programState.program.definition,plan.canonical.program);assert.deepEqual(capture.payload.monthly.batches,[]);
 assert.equal(capture.payload.monthly.complete,true);assert.equal(capture.payload.monthly.nativeBatches.length,1);
 const captured=capture.payload.monthly.nativeBatches[0];verifyOwnNoveltyHashes(captured);assert.deepEqual(captured,approved);
 const saved=capture.saved;assert.equal(saved.inputSha256,ownRunHash(saved.input));assert.equal(saved.resultSha256,ownRunHash(saved.result));
 assert.deepEqual(saved.input.employees.map(e=>e.contractId),[beneficiaryId]);assert.deepEqual(saved.input.rules,plan.canonical.program.rules);
 const inputs=saved.input.employees[0].inputs;equal(inputs.find(x=>x.key==='addition').value,'20.00');equal(inputs.find(x=>x.key==='month').value,'10');
 assert.equal(saved.result.payrollCalculated,true);assert.equal(saved.result.paymentExecuted,false);assert.equal(saved.result.employeeCount,1);assert.equal(saved.result.rowCount,3);
 for(const expected of oracle.rows){const matches=saved.result.rows.filter(r=>r.contractId===beneficiaryId&&r.conceptCode===expected.conceptCode&&r.nature===expected.nature);assert.equal(matches.length,1);assert.equal(matches[0].unit,expected.unit);equal(matches[0].amount,expected.amount);}
 assert.equal(saved.result.employeeTotals.length,1);for(const[k,v]of Object.entries(oracle.totals))equal(saved.result.employeeTotals[0][k],v);
}
export async function runOwnM5M7NoveltyPositiveBusiness({plan,connected}){
 assertOwnM5M7NoveltyPositiveProfile(plan);const binding=assertOwnM5M7NativeTestConnectedBusiness(connected);
 assert.equal(connected.version,'own-m5-m7-native-test-connected-pg.v1');assert.deepEqual(binding.target,plan.target);assert.deepEqual(connected.branchCreation,plan.branchCreation);
 assert.equal(binding.seedRetentionExpected,true);assert.equal(binding.businessRollbackOnly,true);assert.equal(binding.completeAuth,false);
 const trace=[],steps=[],maker=plan.actors.maker,checker=plan.actors.checker,period=plan.canonical.period,liquidationType=plan.canonical.liquidationType;
 const sql=Object.freeze({query:async(text,values)=>{assertOwnM5M7NativeTestConnectedBusiness(connected);const m=/^SELECT public\.([a-z0-9_]+)\(/.exec(text);assert.ok(m);trace.push(m[1]);const rows=await connected.sql.query(text,values);assertOwnM5M7NativeTestConnectedBusiness(connected);return rows;}});
 const at=async(id,work)=>{const from=trace.length,value=await work();steps.push({id,rpc:trace.slice(from)});return value;};
 const key=id=>{assert.match(plan.requestKeys[id],UUID);return plan.requestKeys[id];};
 const novelty=(actor,operation,input)=>ownNoveltyOperation(sql,actor.principal,actor.session,operation,input);
 const run=(operation,input)=>ownRunOperation(sql,maker.principal,maker.session,operation,input,FULL);
 const liquidation=(operation,input)=>ownLiquidationOperation(sql,checker.principal,checker.session,operation,input,FULL);
 const annul=(operation,input)=>ownAnnulOperation(sql,checker.principal,checker.session,operation,input,FULL);
 const close=(operation,input)=>ownCloseOperation(sql,checker.principal,checker.session,operation,input,FULL);
 const detail=async(id,label)=>{const v=await at(label,()=>liquidation('detail',{id}));await verifiedOwnLiquidationDetail(v);return v;};
 const employeeBoot=await at('beneficiary-bootstrap',()=>employeeOperation(sql,maker.principal,maker.session,'bootstrap'));
 const creation=materializeOwnM5M7Beneficiary({plan,bootstrap:employeeBoot}),hired=await at('beneficiary-create',()=>employeeOperation(sql,maker.principal,maker.session,'create',creation));
 const beneficiaryId=hired.contractId;assert.match(beneficiaryId,UUID);assert.equal(hired.origin,'MUNICONTROL');assert.equal(hired.accountCreated,false);assert.equal(hired.payrollCalculated,false);
 const seeded=plan.subjects.filter(x=>x.creationMode==='explicit_fixture_seed');assert.equal(seeded.length,2);assert.ok(seeded.every(x=>x.contractId!==beneficiaryId));
 const roster=[...seeded.map(x=>x.contractId),beneficiaryId].sort();assert.equal(new Set(roster).size,3);
 const recovered=await at('beneficiary-attempt',()=>employeeOperation(sql,maker.principal,maker.session,'attempt',{key:creation.key}));assert.equal(recovered.contractId,beneficiaryId);
 const liquidationDate=employeeBoot.today;assert.equal(liquidationDate.slice(0,7),period);const oracle=ownM5M7PositiveOracle(plan.canonical.program,period);

 const salaryBoot=await at('salary-bootstrap',()=>salaryOperation(sql,maker.principal,maker.session,'bootstrap'));assert.equal(salaryBoot.catalog.revision,0);assert.deepEqual(salaryBoot.catalog.items,[]);
 const salaryBody={command:'propose',scopeVersion:salaryBoot.scopeVersion,baseVersion:salaryBoot.catalog.version,classificationVersion:salaryBoot.classification.version,proposalId:null,proposalSha256:null,items:copy(plan.canonical.salaryItems),reason:REASON.salary,reviewConfirmed:false};
 const salaryProposal=await at('salary-propose',()=>salaryOperation(sql,maker.principal,maker.session,'command',{key:key('salary-propose'),body:salaryBody}));
 const salaryReview=await at('salary-review-bootstrap',()=>salaryOperation(sql,checker.principal,checker.session,'bootstrap'));
 const salaryApproved=await at('salary-review',()=>salaryOperation(sql,checker.principal,checker.session,'command',{key:key('salary-review'),body:{...salaryBody,command:'approve',scopeVersion:salaryReview.scopeVersion,items:null,proposalId:salaryProposal.proposalId,proposalSha256:salaryProposal.requestSha256,reviewConfirmed:true}}));assert.equal(salaryApproved.status,'approved');assert.equal(salaryApproved.revision,1);
 const programBoot=await at('program-bootstrap',()=>programOperation(sql,maker.principal,maker.session,'bootstrap'));assert.equal(programBoot.program.revision,0);assert.equal(programBoot.salaryCatalog.version,salaryApproved.catalogVersion);
 const programBody={command:'propose',scopeVersion:programBoot.scopeVersion,baseVersion:programBoot.program.version,salaryVersion:programBoot.salaryCatalog.version,proposalId:null,proposalSha256:null,program:copy(plan.canonical.program),reason:REASON.program,reviewConfirmed:false};
 const programProposal=await at('program-propose',()=>programOperation(sql,maker.principal,maker.session,'command',{key:key('program-propose'),body:programBody}));
 const programReview=await at('program-review-bootstrap',()=>programOperation(sql,checker.principal,checker.session,'bootstrap'));
 const programApproved=await at('program-review',()=>programOperation(sql,checker.principal,checker.session,'command',{key:key('program-review'),body:{...programBody,command:'approve',scopeVersion:programReview.scopeVersion,program:null,proposalId:programProposal.proposalId,proposalSha256:programProposal.requestSha256,reviewConfirmed:true}}));assert.equal(programApproved.status,'approved');

 const boot=await at('novelty-bootstrap',()=>novelty(maker,'bootstrap'));assert.equal(boot.complete,true);assert.equal(boot.subjects.length,3);
 const subject=boot.subjects.find(x=>x.contractId===beneficiaryId);assert.ok(subject);assert.equal(boot.permissions.canPrepare,true);
 const values={rowOrdinal:1,legajo:subject.legajo,contractId:subject.contractId,identityToken:subject.identityToken,conceptSourceId:'120',costCenterSourceId:null,adjustmentMonth:null,quantityDecimal:null,amountCents:'2000',movementType:null,legalInstrument:null,observation:null,forced:false};
 const prepare=ownNoveltyCommand({command:'prepare',periodMonth:period+'-01',payrollType:liquidationType,rows:[values],reviewConfirmed:true});prepareOwnNoveltyReview(boot,prepare);
 const prepared=await at('novelty-prepare',()=>novelty(maker,'command',{key:key('novelty-prepare'),body:prepare}));assert.equal(prepared.snapshot.status,'draft');assert.equal(prepared.snapshot.revision,1);
 const transition=(actor,command,snapshot,id)=>novelty(actor,'command',{key:key(id),body:{command,batchId:snapshot.id,expectedRevision:snapshot.revision,reasonReference:null,reviewConfirmed:true}});
 const submitted=await at('novelty-submit',()=>transition(maker,'submit',prepared.snapshot,'novelty-submit'));assert.equal(submitted.snapshot.status,'submitted');assert.equal(submitted.snapshot.revision,2);
 const review=await at('novelty-review-detail',()=>novelty(checker,'detail',{id:submitted.snapshot.id}));assert.deepEqual(review,submitted.snapshot);
 const approval=await at('novelty-approve',()=>transition(checker,'approve',review,'novelty-approve')),approved=approval.snapshot;assert.equal(approved.status,'approved');assert.equal(approved.revision,3);assert.equal(approved.approvals.length,1);assert.notEqual(approved.preparedBy.personId,approved.decidedBy.personId);assert.notEqual(approved.preparedBy.membershipId,approved.decidedBy.membershipId);verifyOwnNoveltyHashes(approved);
 const novelOriginal=await at('novelty-original-attempt',()=>novelty(maker,'attempt',{key:key('novelty-prepare')}));assert.equal(novelOriginal.replayed,true);assert.deepEqual(novelOriginal.snapshot,prepared.snapshot);
 const approvedHash=ownNoveltyHash(approved);

 const makeRun=boot=>ownRunCommand({version:'own-payroll-run-command.v2',period,liquidationType,liquidationDate,selection:select(beneficiaryId),scopeVersion:boot.scopeVersion,programVersion:boot.programVersion,populationDomain:'native_registered'});
 const runBoot=await at('run-bootstrap',()=>run('bootstrap',{contractVersion:'2'}));assert.equal(runBoot.canCalculate,true);assert.equal(runBoot.programVersion,programApproved.programVersion);
 const firstBody=makeRun(runBoot),first=await at('calculate',()=>run('calculate',{key:key('calculate'),body:firstBody}));assertCalculation(first,{body:firstBody,key:key('calculate'),beneficiaryId,plan,approved,oracle});
 const firstBefore={payloadSha256:first.payloadSha256,inputSha256:first.saved.inputSha256,resultSha256:first.saved.resultSha256,result:copy(first.saved.result)};
 const confirm=async(id,capture)=>{const d=await detail(capture.id,id+'-detail');const r=await at(id,()=>liquidation('command',{key:key(id),body:{runId:d.id,resultSha256:d.capture.saved.resultSha256,scopeVersion:d.scopeVersion,stateVersion:d.stateVersion,command:'confirm',selection:select(beneficiaryId),reason:REASON.confirm,reviewConfirmed:true}}));assert.deepEqual(r.affected.map(x=>x.contractId),[beneficiaryId]);assert.equal(r.affected[0].state,'confirmed');return r;};
 await confirm('confirm',first);
 const index=await at('annul-review',()=>annul('review',{period,liquidationType}));assert.equal(index.index.length,1);assert.equal(index.index[0].id,first.id);
 const reviewed=await loadOwnAnnulReview(index,id=>detail(id,'annul-review-detail'));
 const annulBody={version:'own-annul-command.v2',period,liquidationType,scopeVersion:index.scopeVersion,stateVersion:index.stateVersion,reviewSha256:index.reviewSha256,selection:select(beneficiaryId),reason:REASON.annul,reviewConfirmed:true};
 const annulAttempt=ownAnnulReviewAttempt(key('annul-v2'),annulBody,'m5-m7-test:'+checker.membershipId,ownAnnulReviewSelection(reviewed,annulBody.selection));
 const annulled=await at('annul-v2',()=>annul('command-v2',{key:annulAttempt.key,body:annulAttempt.body}));await verifiedOwnAnnulReviewReceipt(annulled,annulAttempt);
 assert.deepEqual(await at('annul-v2-replay',()=>annul('command-v2',{key:annulAttempt.key,body:annulAttempt.body})),{...annulled,replayed:true});
 const afterAnnul=await detail(first.id,'first-after-annul');assert.equal(afterAnnul.employees[0].state,'annulled');assert.equal(afterAnnul.employees[0].liquidationVersion,1);assert.equal(afterAnnul.capture.payloadSha256,firstBefore.payloadSha256);assert.deepEqual(afterAnnul.capture.saved.result,firstBefore.result);
 const projection=await at('preparation209',()=>ownAnnulPreparationOperation(sql,maker.principal,maker.session,'detail',{id:annulled.id},FULL));assert.equal(projection.source.receiptSha256,ownRunHash(annulled));assert.deepEqual(ownAnnulPreparationDates(projection),[{liquidationDate,count:1}]);const draft=ownAnnulPreparationForDate(projection,liquidationDate);assert.deepEqual(draft.selection,select(beneficiaryId));
 const beforeRecalc=await at('novelty-still-approved',()=>novelty(checker,'detail',{id:approved.id}));assert.equal(ownNoveltyHash(beforeRecalc),approvedHash);
 const recalcBoot=await at('recalculate-bootstrap',()=>run('bootstrap',{contractVersion:'2'}));assert.equal(recalcBoot.programVersion,runBoot.programVersion);assert.equal(recalcBoot.scopeVersion,draft.scopeVersion);
 const secondBody=makeRun(recalcBoot),second=await at('recalculate',()=>run('calculate',{key:key('recalculate'),body:secondBody}));assertCalculation(second,{body:secondBody,key:key('recalculate'),beneficiaryId,plan,approved,oracle});assert.notEqual(second.id,first.id);assert.deepEqual(second.saved.result.rows,first.saved.result.rows);assert.deepEqual(second.saved.result.employeeTotals,first.saved.result.employeeTotals);
 await confirm('confirm-recalculation',second);const secondDetail=await detail(second.id,'second-confirmed');assert.equal(secondDetail.employees[0].liquidationVersion,2);
 const query={period,liquidationType},closeDetail=await at('close-detail',()=>close('detail',query));assert.deepEqual(closeDetail.rows.map(x=>x.contractId).sort(),roster);assert.equal(closeDetail.rows.find(x=>x.contractId===beneficiaryId).state,'confirmed');
 const closeBody={...query,scopeVersion:closeDetail.scopeVersion,stateVersion:closeDetail.stateVersion,selection:select(beneficiaryId),command:'close',groupId:null,reason:REASON.close,reviewConfirmed:true};
 const closed=await at('close',()=>close('command',{key:key('close'),body:closeBody}));assert.deepEqual(closed.snapshot,ownCloseSnapshot(closeDetail,closeBody.selection));assert.equal(closed.snapshot.employeeCount,1);assert.equal(closed.snapshot.populationCount,3);assert.equal(closed.snapshot.populationComplete,false);assert.equal(closed.snapshot.conceptCount,3);assert.equal(closed.snapshot.employees[0].runId,second.id);
 for(const[k,v]of Object.entries(oracle.totals))equal(closed.snapshot.employees[0].totals[k],v);
 const census=await at('report-census',()=>close('report-census',query));await verifiedOwnReportCensus(census);assert.equal(census.groups.length,1);assert.equal(census.groups[0].id,closed.groupId);assert.equal(census.groups[0].populationCount,3);assert.equal(census.groups[0].populationComplete,false);
 const firstFinal=await detail(first.id,'first-final-preservation');assert.equal(firstFinal.capture.payloadSha256,firstBefore.payloadSha256);assert.equal(firstFinal.capture.saved.inputSha256,firstBefore.inputSha256);assert.equal(firstFinal.capture.saved.resultSha256,firstBefore.resultSha256);assert.deepEqual(firstFinal.capture.saved.result,firstBefore.result);
 const noveltyFinal=await at('novelty-final-preservation',()=>novelty(checker,'detail',{id:approved.id}));assert.equal(ownNoveltyHash(noveltyFinal),approvedHash);
 for(const fn of ['own_run_capture_v1','own_run_complete_full_v1'])assert.equal(trace.filter(x=>x===fn).length,2);assert.equal(trace.some(fn=>/^own_run_(?:capture_fixed|complete_fixed)/.test(fn)),false);
 assert.equal(trace.filter(x=>x==='own_novelty_command_v1').length,3);assertOwnM5M7NoveltyPositiveProfile(plan);assertOwnM5M7NativeTestConnectedBusiness(connected);
 return freeze({version:OWN_M5_M7_BUSINESS_VERSION,protocol:OWN_M5_M7_PROTOCOL,kind:'test',sourceCommit:plan.sourceCommit,runId:plan.runId,steps,trace,beneficiaryContractId:beneficiaryId,persons:3,operatorAccounts:2,programmeSha256:ownM5M7ProgrammeSha(plan),oracle,
  novelty:{batchId:approved.id,revision:3,rowsSha256:approved.rowsSha256,snapshotSha256:approvedHash,eventsExpected:3,originalAttemptPreserved:true,forced:false},first:{id:first.id,payloadSha256:firstBefore.payloadSha256,inputSha256:firstBefore.inputSha256,resultSha256:firstBefore.resultSha256},annulment:{id:annulled.id,replayVerified:true},second:{id:second.id,resultSha256:second.saved.resultSha256,liquidationVersion:2,rowsEqualFirst:true},close:{groupId:closed.groupId,snapshotSha256:closed.snapshotSha256,employeeCount:1,populationCount:3,populationComplete:false},
  transactionManagedByCaller:true,businessEndRequired:'ROLLBACK',seedRetentionExpected:true,businessSyntheticAuth:true,completeAuthenticationHandler:false,realMfaVerified:false,realJwtIssued:false,httpHandlerProven:false,browserProven:false,productionWrites:0,noeliaReady:false,fullfixedV2Pending:true});
}
