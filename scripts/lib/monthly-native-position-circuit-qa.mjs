// Same three native hires and same guarded HTTP/SQL journey. No creation,
// calculation, capability grant or reconstructed capture is performed here.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {definition} from '../../tests/fixtures/annual-position-budget-synthetic.js';
import {annualBudgetCommand,verifiedAnnualBudgetBootstrap,verifiedAnnualBudgetReceipt} from '../../assets/annual-position-budget-model.js';
import {positionCommand,verifiedPositionBootstrap,verifiedPositionReceipt,verifiedPositionRunCapture} from '../../assets/position-assignment-model.js';
import {COMPARISON_READ,verifiedPositionComparisonV2,positionComparisonDetails,positionComparisonSummary,positionComparisonDocument} from '../../assets/position-comparison-model.js';
import {reportCsv,reportXlsx,reportPdf} from '../../assets/report-document.js';
const sha=value=>createHash('sha256').update(value).digest('hex');
const order=['baseline','principal','correction'];

export function assertMonthlyNativePositionAuthority({maker,checker}){
 assert.notEqual(maker.principal.tenant.membershipId,checker.principal.tenant.membershipId,'M10_INDEPENDENT_MEMBERSHIPS_REQUIRED');
 assert.notEqual(maker.principal.user.email,checker.principal.user.email,'M10_INDEPENDENT_ACCOUNTS_REQUIRED');
 const common=['workforce.employee.read','workforce.structure.read'],required={maker:[...common,'workforce.structure.prepare','workforce.structure.assignment.prepare'],checker:[...new Set([...common,...COMPARISON_READ,'workforce.structure.approve','workforce.structure.assignment.approve'])]};
 for(const[kind,actor]of Object.entries({maker,checker}))for(const capability of required[kind])assert.ok(actor.principal.tenant.effectiveCapabilities.includes(capability),'M10_FIXTURE_CAPABILITY_MISSING:'+kind+':'+capability);
 for(const[kind,actor,forbidden]of[['maker',maker,['workforce.structure.approve','workforce.structure.assignment.approve']],['checker',checker,['workforce.structure.prepare','workforce.structure.assignment.prepare']]])for(const capability of forbidden)assert.equal(actor.principal.tenant.effectiveCapabilities.includes(capability),false,'M10_FIXTURE_SEPARATION_CHANGED:'+kind+':'+capability);
 return{required,grantPerformed:false,source:'existing canonical actor capabilities; never inferred from success'};
}

export async function prepareMonthlyNativePositionCircuit(h){
 const{maker,checker,api,setCurrent,getCurrent}=h;
 assert.equal(h.positionVerification?.version,'m10-canonical-composition-verification.v1','M10_NATIVE_INSTALLATION_PROOF_REQUIRED');
 assert.equal(h.positionVerification.schema,h.qa.schema);assert.equal(h.positionVerification.sourceCommit,h.sourceCommit);assert.equal(h.positionVerification.beforeB0,true);
 for(const name of['api','setCurrent','getCurrent'])assert.equal(typeof h[name],'function');
 const prior=getCurrent(),authority=assertMonthlyNativePositionAuthority({maker,checker}),year=2026,period='2026-10',norm=definition(3),assignments=new Map(),events=[];
 const as=async(actor,operation)=>{const previous=getCurrent();setCurrent(actor);try{return await operation();}finally{setCurrent(previous);}};
 const annual=async actor=>as(actor,async()=>verifiedAnnualBudgetBootstrap(await api('annualBudget',{resource:'bootstrap',year:String(year)}),year));
 const position=async(actor,contractId)=>as(actor,async()=>verifiedPositionBootstrap(await api('positionAssignment',{resource:'bootstrap',year:String(year),contractId}),{year,contractId}));
 const sendAnnual=async(actor,body)=>as(actor,async()=>{const key=randomUUID(),receipt=await api('annualBudget',null,body,key,201);await verifiedAnnualBudgetReceipt(receipt,{key,body});const recovered=await api('annualBudget',{resource:'attempt',key});await verifiedAnnualBudgetReceipt(recovered,{key,body});assert.deepEqual(recovered,{...receipt,replayed:true});events.push({kind:'annual',key,body,receipt,recovered});return receipt;});
 const sendPosition=async(actor,body)=>as(actor,async()=>{const key=randomUUID(),receipt=await api('positionAssignment',null,body,key,201);await verifiedPositionReceipt(receipt,{key,body});const recovered=await api('positionAssignment',{resource:'attempt',key});await verifiedPositionReceipt(recovered,{key,body});assert.deepEqual(recovered,{...receipt,replayed:true});events.push({kind:'assignment',key,body,receipt,recovered});return receipt;});
 let approved;
 try{
  const initial=await annual(maker);assert.equal(initial.catalog.revision,0,'M10_EXPLICIT_EMPTY_ANNUAL_BASELINE_REQUIRED');assert.equal(initial.proposals.length,0);assert.equal(initial.permissions.canPropose,true);assert.equal(initial.permissions.canReview,false);
  const body=annualBudgetCommand({command:'propose',year,scopeVersion:initial.scopeVersion,baseVersion:initial.catalog.version,proposalId:null,proposalSha256:null,definition:norm,reason:'Planta y cantidades exclusivamente sintéticas del mismo circuito nativo de tres altas',reviewConfirmed:false}),proposal=await sendAnnual(maker,body),makerView=await annual(maker),pending=makerView.proposals.find(row=>row.id===proposal.proposalId);assert.ok(pending);assert.equal(pending.canReview,false);
  const review=await annual(checker),reviewed=review.proposals.find(row=>row.id===proposal.proposalId);assert.equal(reviewed?.canReview,true);
  const decision=annualBudgetCommand({command:'approve',year,scopeVersion:review.scopeVersion,baseVersion:body.baseVersion,proposalId:proposal.proposalId,proposalSha256:proposal.requestSha256,definition:null,reason:'Aprobación independiente de la planta exclusivamente sintética completa',reviewConfirmed:true});await sendAnnual(checker,decision);
  approved=await annual(maker);assert.equal(approved.catalog.revision,1);assert.deepEqual(approved.catalog.definition,norm);assert.equal(approved.catalog.proposalId,proposal.proposalId);
 }finally{setCurrent(prior);}
 return{
  async beforeCapture(created,label){
   assert.equal(label,order[assignments.size],'M10_EXISTING_HIRE_ORDER_REQUIRED');assert.equal(assignments.has(created.contractId),false,'M10_DUPLICATE_HIRE_ASSIGNMENT');assert.match(created.registrationId,/^[a-f0-9-]{36}$/i);
   const boot=await position(maker,created.contractId);assert.equal(boot.subject.registrationId,created.registrationId);assert.equal(boot.subject.legajo,created.legajo);assert.equal(boot.permissions.canPropose,true);assert.equal(boot.permissions.canReview,false);assert.equal(boot.state.revision,0);assert.deepEqual(boot.state.allocations,[]);assert.deepEqual(boot.annual.catalog,approved.catalog);
   const source={instrument:'Acto exclusivamente sintético del mismo alta nativa',documentSha256:'e'.repeat(64),reference:'Asignación inventada QA; no norma ni salario municipal'},base={budgetRevision:approved.catalog.revision,definitionSha256:approved.catalog.definitionSha256,validFrom:period+'-01',validTo:year+'-12-31',source},allocations=[{...base,id:randomUUID(),rowCode:'QA0000',quantity:'1'},{...base,id:randomUUID(),rowCode:'QA0001',quantity:'1.000000000000000001'}].sort((a,b)=>a.id<b.id?-1:1);
   const body=positionCommand({command:'propose',contractId:created.contractId,year,scopeVersion:boot.scopeVersion,baseVersion:boot.state.version,annualVersion:boot.annual.catalog.version,reason:'Asignación completa exclusivamente sintética antes de la primera captura de esta alta',reviewConfirmed:false,allocations}),proposal=await sendPosition(maker,body),makerView=await position(maker,created.contractId);assert.equal(makerView.proposals.find(row=>row.id===proposal.proposalId)?.canReview,false);
   const review=await position(checker,created.contractId),pending=review.proposals.find(row=>row.id===proposal.proposalId);assert.equal(pending?.canReview,true);
   const decision=positionCommand({command:'approve',contractId:created.contractId,year,scopeVersion:review.scopeVersion,baseVersion:body.baseVersion,annualVersion:body.annualVersion,proposalId:proposal.proposalId,proposalSha256:pending.requestSha256,reason:'Aprobación independiente de las dos asignaciones sintéticas del mismo contrato',reviewConfirmed:true}),receipt=await sendPosition(checker,decision),after=await position(maker,created.contractId);assert.equal(after.state.revision,1);assert.equal(after.state.approvalId,receipt.id);assert.equal(after.state.proposalId,proposal.proposalId);assert.deepEqual(after.state.allocations.map(({normative,...row})=>row),allocations);
   assignments.set(created.contractId,{label,contractId:created.contractId,registrationId:created.registrationId,legajo:created.legajo,allocations,state:after.state});return{contractId:created.contractId,registrationId:created.registrationId,assignmentVersion:after.state.version,approvalId:receipt.id,beforeFirstCapture:true};
  },
  async finish({b0,joint,correction,correctionFinancial,output}){
   assert.equal(assignments.size,3,'M10_EXACT_THREE_EXISTING_HIRES_REQUIRED');assert.equal(correctionFinancial.bank350Verified,true);assert.equal(correctionFinancial.accounting350Verified,true);
   const expected=[{contractId:b0.created.contractId,captureId:b0.original.capture.id,groupId:b0.baseline.originalGroup.id,groupSha256:b0.baseline.originalGroup.snapshotSha256,resultSha256:b0.original.capture.saved.resultSha256,amount:b0.baseline.expectedTotals.net},{contractId:joint.journey.contractId,captureId:joint.journey.secondRunId,groupId:joint.journey.closeGroupId,groupSha256:joint.bank.closeSnapshotSha256,resultSha256:joint.journey.secondResultSha256,amount:'345.00'},{contractId:correction.contractId,captureId:correction.c25.id,groupId:correction.closeGroupId,groupSha256:correctionFinancial.bank.closeSnapshotSha256,resultSha256:null,amount:'350.00'}];
   assert.deepEqual([...assignments.keys()],expected.map(row=>row.contractId));assert.equal(new Set(expected.map(row=>row.contractId)).size,3);assert.equal(new Set(expected.map(row=>row.groupId)).size,3);
   const comparisonAnnual=await as(checker,()=>api('positionComparison',{resource:'annual-v2',year:String(year)}));await verifiedAnnualBudgetBootstrap(comparisonAnnual,year);assert.deepEqual(comparisonAnnual.catalog,approved.catalog);
   const query={resource:'detail-v2',year:String(year),revision:String(approved.catalog.revision),period,liquidationType:'monthly'},value=await as(checker,()=>api('positionComparison',query));await verifiedPositionComparisonV2(value,{year,revision:1,period,liquidationType:'monthly'});assert.equal(value.scopeVersion,comparisonAnnual.scopeVersion);
   assert.equal(value.version,'own-position-comparison.v2');assert.equal(value.groups.length,3);assert.equal(value.employees.length,3);assert.equal(value.captures.length,3);assert.deepEqual(value.groups.map(row=>row.id).sort(),expected.map(row=>row.groupId).sort());assert.deepEqual(value.employees.map(row=>row.contractId).sort(),expected.map(row=>row.contractId).sort());assert.deepEqual(value.captures.map(row=>row.id).sort(),expected.map(row=>row.captureId).sort());assert.deepEqual(value.annual.catalog,approved.catalog);
   for(const[n,e]of expected.entries()){
    const employee=value.employees.find(row=>row.contractId===e.contractId),capture=value.captures.find(row=>row.id===e.captureId),group=value.groups.find(row=>row.id===e.groupId);assert.equal(employee.groupId,e.groupId);assert.equal(employee.captureId,e.captureId);assert.equal(group.snapshotSha256,e.groupSha256);if(e.resultSha256)assert.equal(employee.resultSha256,e.resultSha256);assert.equal(group.employeeCount,1);
    // Each original calculation selects its own one-contract scope. Completeness
    // is that captured scope, not a reconstruction of the later three-hire roster.
    assert.deepEqual(capture.original.body.selection,n===0?{kind:'all',values:[]}:{kind:'contracts',values:[e.contractId]});assert.deepEqual(capture.population.employees.map(row=>row.contractId),[e.contractId],'M10_COMPLETE_ORIGINAL_SELECTED_POPULATION_REQUIRED');assert.equal(group.populationCount,n+1);assert.equal(capture.positions.status,'captured');assert.equal(capture.dimensions.status,'captured');await verifiedPositionRunCapture(capture.positions,capture.original);
    for(const originalEmployee of capture.population.employees){const assigned=assignments.get(originalEmployee.contractId),positions=capture.positions.payload.employees.find(row=>row.contractId===originalEmployee.contractId);assert.ok(assigned);assert.equal(positions.status,'assigned');assert.equal(positions.assignmentVersion,assigned.state.version);assert.deepEqual(positions.allocations.map(({normative,coverage,...row})=>row),assigned.allocations);assert.ok(positions.allocations.every(row=>row.coverage==='full'));}
    const source=await as(checker,()=>api('liquidation',{resource:'detail',id:e.captureId}));for(const key of['body','payload','saved'])assert.deepEqual(capture.original[key],source.capture[key]);assert.equal(capture.original.saved.result.employeeTotals.find(row=>row.contractId===e.contractId).net,e.amount);
    const sidecar=await as(checker,()=>api('positionAssignment',{resource:'capture',captureId:e.captureId}));assert.deepEqual(sidecar,capture.positions);
   }
   assert.equal(value.groups.some(row=>row.id===correction.oldGroup.id),false,'M10_REOPENED_OLD_GROUP_MUST_NOT_BE_CURRENT');
   const details=positionComparisonDetails(value),summary=positionComparisonSummary(value);assert.equal(details.length,6);for(const e of expected)assert.equal(details.filter(row=>row.contractId===e.contractId).length,2);
   assert.deepEqual(summary.map(({code,unit,budgeted,credited,difference,complete,observations})=>({code,unit,budgeted,credited,difference,complete,observations})),[{code:'QA0000',unit:'position',budgeted:'0',credited:'3',difference:'-3',complete:true,observations:0},{code:'QA0001',unit:'teaching_hour',budgeted:'12.50',credited:'3.000000000000000003',difference:'9.499999999999999997',complete:true,observations:0},{code:'QA0002',unit:'contracted_staff',budgeted:'1',credited:'0',difference:'1',complete:true,observations:0}]);
   const destination=path.join(output,'position-comparison');assert.equal(fs.existsSync(destination),false);fs.mkdirSync(destination);const document=positionComparisonDocument(value,{active:'all',order:'number',view:'detailed'}),files=[];
   for(const[name,bytes]of[['cargos.csv',reportCsv(document)],['cargos.xlsx',reportXlsx(document)],['cargos.pdf',reportPdf(document)]]){const buffer=typeof bytes==='string'?Buffer.from(bytes,'utf8'):Buffer.from(bytes),file=path.join(destination,name);fs.writeFileSync(file,buffer,{flag:'wx'});files.push({name,bytes:buffer.length,sha256:sha(buffer)});}
   const proof={version:'monthly-native-position-three-hire-proof.v1',sourceCommit:h.sourceCommit,schema:h.qa.schema,installationVerification:h.positionVerification,authority,year,period,norm:approved.catalog,assignments:[...assignments.values()],events,expected,groups:value.groups,summary,detailRows:6,files,actualHandlers:true,actualHttp:true,actualSql:true,actualBrowser:false,extraHires:0,extraCalculations:0,sourceKind:'synthetic approved norm and assignments only',municipalAcceptance:false,paymentExecuted:false};fs.writeFileSync(path.join(destination,'proof.json'),JSON.stringify(proof,null,2)+'\n',{flag:'wx'});return proof;
  }
 };
}
