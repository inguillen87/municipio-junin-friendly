import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {catalogueSourceContracts,catalogueValueResolver,verifyCatalogueValueInputs,OWN_APPROVED_PERIOD_VALUES_VERSION} from '../assets/own-payroll-catalogue-values.js';
import {ownProgramStructure,ownProgramDefinition,ownProgramHistory,ownProgramBootstrap} from '../assets/own-payroll-program-model.js';
import {programWorkspaceChanges,programWorkspaceGuidance,decideProgramWorkspace} from '../assets/own-payroll-program-workspace-model.js';
import {prepareOwnPayrollInput,prepareOwnPayrollQuantityApprovedInput,prepareOwnPayrollOfficialApprovedInput,prepareOwnPayrollRowEmissionApprovedInput} from '../lib/own-payroll-approved-input.js';
import {createOwnPayrollSnapshot} from '../lib/own-payroll-snapshot.js';
import {calculateOwnPayrollWithQuantities} from '../assets/own-payroll-quantity.js';
import {calculateOwnPayrollWithOfficialTotals} from '../assets/own-payroll-official-totals.js';
import {calculateOwnPayrollWithRowEmission} from '../assets/own-payroll-row-emission.js';
import {ownOfficialCapture} from '../assets/own-payroll-official-snapshot-model.js';
import {salarySerialized,salaryItems} from '../assets/native-salary-catalog-model.js';
import {policySha256} from '../assets/own-payroll-policy-validity.js';
import {ownRunHash,verifyOwnRunReceipt,ownRunOperation,runError,RUN_CALCULATE} from '../lib/internal-own-payroll-run.js';
import {ownRunCapture} from '../assets/own-payroll-run-model.js';
import {capture,runCommand,saved} from './fixtures/own-payroll-run-synthetic.js';
import {approvedSources} from './fixtures/own-payroll-approved-synthetic.js';
import {uid,hash} from './fixtures/own-payroll-program-synthetic.js';
import {periodValueSources,addPeriodValue,changePeriod,stampPeriodCatalogue,attachPeriodCatalogue} from './fixtures/own-payroll-period-values-synthetic.js';
import {emissionSources} from './fixtures/own-payroll-row-emission-synthetic.js';

const prepare=s=>prepareOwnPayrollInput(s),value=s=>prepare(s).employees[0].inputs.find(x=>x.key==='monthlyRate').value;
const proof=s=>s.sourceInventory.catalogueValues;
function receipt(source=periodValueSources(),calculated=true){
 const body=runCommand({period:source.period,programVersion:source.programState.program.version});
 const c=capture({body,bodySha256:ownRunHash(body),payload:source,payloadSha256:ownRunHash(source)});
 if(calculated){const snap=createOwnPayrollSnapshot(prepare(source));c.saved={version:'own-payroll-saved.v1',id:c.id,algorithmSha256:c.algorithmSha256,input:snap.input,result:snap.result,inputSha256:snap.inputSha256,resultSha256:snap.resultSha256,recordedAt:'2026-11-12T00:00:00Z'};}
 return structuredClone(c);
}

test('la fórmula abierta admite un valor de noviembre sin exigir cobertura hasta 9999-12',()=>{
 const s=periodValueSources(),p=s.programState.program.definition,before=JSON.stringify(s);
 assert.deepEqual(ownProgramDefinition(p,s.programState.salaryCatalog.items),p);
 assert.equal(value(s),'123.45000000');assert.equal(JSON.stringify(s),before);
 const legacy=structuredClone(p);delete legacy.catalogueValueResolutionVersion;
 assert.throws(()=>ownProgramDefinition(legacy,s.programState.salaryCatalog.items),e=>e.code==='SOURCE_DEFINITION_MISSING');
});
test('diciembre sin valor se rechaza y tras aprobar su dato usa exactamente la misma fórmula y aprobación',()=>{
 const november=periodValueSources(),frozen=receipt(november),s=changePeriod(structuredClone(november),'2026-12');
 const program=structuredClone(s.programState.program),original=structuredClone(s.programState.proposals);
 assert.throws(()=>prepare(s),e=>e.code==='CATALOGUE_VALUE_MISSING');
 addPeriodValue(s,'2026-12');assert.equal(value(s),'234.56000000');
 assert.deepEqual(s.programState.program,program);assert.deepEqual(s.programState.proposals,original);
 assert.notEqual(s.programState.program.salaryVersion,s.programState.salaryCatalog.version);
 assert.equal(verifyOwnRunReceipt(frozen).saved.input.employees[0].inputs[0].value,'123.45000000');
 assert.equal(value(november),'123.45000000');
});
for(const month of ['2027-01','2027-12','2028-01','2028-02','2028-12'])test('valor acotado y misma fórmula en '+month,()=>{
 const s=changePeriod(periodValueSources(),month),p=JSON.stringify(s.programState.program);
 assert.throws(()=>prepare(s),e=>e.code==='CATALOGUE_VALUE_MISSING');addPeriodValue(s,month,'0.00');
 assert.equal(value(s),'0.00000000');assert.equal(JSON.stringify(s.programState.program),p);
});
for(const sourceKind of ['parameter','auxiliary_parameter','scale','scale_reference'])test('resuelve tipo, convenio y categoría de '+sourceKind,()=>{
 const s=periodValueSources({sourceKind});assert.equal(value(s),'123.45000000');
 assert.doesNotThrow(()=>verifyCatalogueValueInputs(s,prepare(s)));
 if(sourceKind==='scale'){s.population.employees[0].categoryCode='7';assert.throws(()=>prepare(s),e=>e.code==='CATALOGUE_VALUE_MISSING');}
 if(sourceKind==='scale_reference'){s.population.employees[0].categoryCode='9';assert.equal(value(s),'123.45000000');}
});
test('null es ausencia, cero es valor aprobado; no se relaja el contrato de escalas null',()=>{
 const s=periodValueSources({value:null});assert.doesNotThrow(()=>ownProgramDefinition(s.programState.program.definition,s.programState.salaryCatalog.items));
 assert.throws(()=>prepare(s),e=>e.code==='CATALOGUE_VALUE_MISSING');assert.equal(value(periodValueSources({value:'0.00'})),'0.00000000');
 assert.throws(()=>periodValueSources({value:null,sourceKind:'scale'}));
});
for(const [label,mutate] of [
 ['sin prueba',s=>delete s.sourceInventory.catalogueValues],['incompleto',s=>proof(s).complete=false],['conteo truncado',s=>proof(s).itemCount--],
 ['revisión falsa',s=>proof(s).revision++],['versión falsa',s=>proof(s).catalogueVersion=hash('f')],['aprobación ausente',s=>proof(s).approvalId=null],
 ['propuesta ausente',s=>proof(s).proposalId=null],['ámbito inválido',s=>proof(s).tenantId='invalid'],['vínculo inválido',s=>proof(s).sourceBindingId='invalid'],
 ['programa distinto',s=>proof(s).programVersion=hash('e')],['aprobación de programa distinta',s=>proof(s).programApprovalId=uid(999)],
 ['propuesta de programa distinta',s=>proof(s).programProposalId=uid(998)],['catálogo original distinto',s=>proof(s).programSalaryVersion=hash('d')],
 ['propuesta original quitada',s=>s.programState.proposals=[]],['propuesta original duplicada',s=>s.programState.proposals.push(structuredClone(s.programState.proposals[0]))],
 ['propuesta no aprobada',s=>{s.programState.proposals[0].status='pending';s.programState.proposals[0].decision=null;}],
 ['revisión de aprobación distinta',s=>s.programState.proposals[0].decision.revision++],['hash del original distinto',s=>proof(s).originalItemsSha256=hash('e')],
 ['hash contratos distinto',s=>proof(s).sourceContractsSha256=hash('d')],['contrato original alterado',s=>proof(s).sourceContracts[0].unit='percent'],
 ['catálogo alterado',s=>s.programState.salaryCatalog.items.find(r=>r.code==='800009001').value='999.00'],
 ['campo adicional',s=>proof(s).trustMe=true],['origen GRH',s=>s.population.employees[0].origin='GRH']
])test('rechaza '+label,()=>{const s=periodValueSources();mutate(s);assert.throws(()=>prepare(s));});
for(const [label,patch] of [['unidad',{unit:'percent'}],['naturaleza',{nature:'deduction'}],['otro convenio',{agreementCode:'2'}],['otra categoría',{categoryCode:'7'}]])test('valor posterior no cambia '+label+' del contrato original',()=>{
 const sourceKind=label==='otra categoría'?'scale':'parameter',s=changePeriod(periodValueSources({sourceKind}),'2026-12');addPeriodValue(s,'2026-12');
 Object.assign(s.programState.salaryCatalog.items.find(r=>r.validFrom==='2026-12'),patch);stampPeriodCatalogue(s);assert.throws(()=>prepare(s));
});
test('duplicados y solapamientos no se vuelven válidos recalculando el hash',()=>{
 for(const patch of [{},{validFrom:'2026-11',validUntil:null}]){const s=periodValueSources();s.programState.salaryCatalog.items.push({...s.programState.salaryCatalog.items.find(r=>r.code==='800009001'),...patch});stampPeriodCatalogue(s);assert.throws(()=>prepare(s));}
});
test('la huella usa la preimagen completa y conserva el orden original',()=>{
 const s=periodValueSources();assert.equal(proof(s).itemsSha256,createHash('sha256').update(salarySerialized(s.programState.salaryCatalog.items)).digest('hex'));
 s.programState.salaryCatalog.items.reverse();assert.throws(()=>prepare(s),e=>e.code==='CATALOGUE_VALUE_CAPTURE_INVALID');
});
test('política explícita se muestra en revisión y no puede quitarse del historial',()=>{
 const s=periodValueSources(),p=s.programState.program.definition,before=structuredClone(p);delete before.catalogueValueResolutionVersion;
 assert.ok(programWorkspaceChanges(before,p).rows.some(r=>r.kind==='policies'&&r.key==='catalogueValueResolutionVersion'&&r.status==='added'));
 assert.equal(programWorkspaceGuidance(s.programState).state,'period_values');
 assert.throws(()=>ownProgramHistory(p,before),e=>e.code==='PROGRAM_HISTORY_REQUIRED');
 const unknown={...p,catalogueValueResolutionVersion:'unknown'};assert.throws(()=>ownProgramStructure(unknown));
 const oldNamespace={...p};delete oldNamespace.namespaceVersion;assert.throws(()=>ownProgramStructure(oldNamespace));
});
test('CAS de revisión de fórmula sigue exigiendo catálogo actual; la política no aprueba una propuesta vieja',()=>{
 const s=periodValueSources(),state=s.programState,proposal=state.proposals[0];
 proposal.status='pending';proposal.decision=null;proposal.canReview=true;state.permissions.canReview=true;
 state.salaryCatalog.version=hash('f');
 assert.throws(()=>decideProgramWorkspace(state,proposal.id,'approve','Synthetic approval reason',true),/catálogo/);
});
test('captura pendiente y lectura histórica validan los valores de su propio mes',()=>{
 assert.equal(verifyOwnRunReceipt(receipt(undefined,false)).saved,null);assert.equal(ownRunCapture(receipt()).saved.input.employees[0].inputs[0].value,'123.45000000');
 const c=receipt(changePeriod(periodValueSources(),'2026-12'),false);assert.throws(()=>verifyOwnRunReceipt(c),e=>e.code==='CATALOGUE_VALUE_MISSING');
});
for(const [label,change] of [['importe',i=>i.employees[0].inputs[0].value='1.00000000'],['referencia',i=>i.employees[0].inputs[0].sourceReference='Another captured source'],['ausente',i=>i.employees[0].inputs=[]],['duplicada',i=>i.employees[0].inputs.push(structuredClone(i.employees[0].inputs[0]))],['contrato',i=>i.employees[0].contractId=uid(700)]])test('lector rechaza '+label+' incluso con hashes exteriores recalculados',()=>{
 const c=receipt();change(c.saved.input);c.saved.inputSha256=ownRunHash(c.saved.input);assert.throws(()=>verifyOwnRunReceipt(c));
});
test('sin opt-in mantiene recibo histórico idéntico y rechaza una prueba añadida',()=>{
 const c=capture();c.saved=saved(c);const before=JSON.stringify(c);verifyOwnRunReceipt(c);assert.equal(JSON.stringify(c),before);
 const s=approvedSources();s.sourceInventory={catalogueValues:proof(periodValueSources())};assert.throws(()=>prepare(s),e=>e.code==='CATALOGUE_VALUE_CAPTURE_INVALID');
});

function officialPeriodSource(v5){
 const s=attachPeriodCatalogue(emissionSources({optIn:v5})),catalog=s.programState.salaryCatalog;
 catalog.items.find(r=>r.kind==='concept'&&r.code==='302').value='25.00';
 catalog.revision++;catalog.version=policySha256({revision:catalog.revision,items:catalog.items});stampPeriodCatalogue(s);
 return s;
}
function officialPeriodReceipt(v5){
 const s=officialPeriodSource(v5),input=(v5?prepareOwnPayrollRowEmissionApprovedInput:prepareOwnPayrollOfficialApprovedInput)(s);
 const result=(v5?calculateOwnPayrollWithRowEmission:calculateOwnPayrollWithOfficialTotals)(input);
 if(v5)s.sourceInventory.rowEmission={rulesSha256:input.sourceVersions.rules,policiesSha256:ownRunHash(input.rowEmissionPolicies),populationVersion:input.sourceVersions.population,expectedDecisionCount:result.emissionDecisionCount,contractIds:input.employees.map(e=>e.contractId).sort()};
 const c=receipt(s,false);c.saved={version:'own-payroll-saved.v1',id:c.id,algorithmSha256:c.algorithmSha256,input,result,inputSha256:ownRunHash(input),resultSha256:ownRunHash(result),recordedAt:'2026-11-12T00:00:00Z'};
 return c;
}
test('V3 resuelve también el dato del catálogo usado sólo en una fase de cantidad',()=>{
 const s=periodValueSources({value:'3.00'}),p=s.programState.program.definition;
 p.rules[0].expression={op:'literal',value:'10.00',unit:'money'};p.bindings[0].unit='units';
 s.programState.salaryCatalog.items.find(r=>r.code==='800009001').unit='units';
 p.quantityPhasesVersion='own-payroll-quantity-phases.v1';p.quantityPhases=[{agreementCode:'1',code:'9001',unit:'units',stage:'exact',rounding:null,expression:{op:'input',key:'monthlyRate',unit:'units'},validFrom:'2026-11',validUntil:null,liquidationTypes:['monthly'],sourceReference:'Synthetic independent monthly quantity',sourceSha256:hash('a'),amountUse:{kind:'independent'},periodTreatment:{kind:'none',reference:'Synthetic independent quantity'}}];
 attachPeriodCatalogue(s);
 const input=prepareOwnPayrollQuantityApprovedInput(s),result=calculateOwnPayrollWithQuantities(input);
 assert.equal(input.version,'own-payroll-input.v3');assert.equal(input.employees[0].inputs[0].value,'3.00000000');assert.equal(result.version,'own-payroll-result.v3');
 verifyCatalogueValueInputs(s,input);const bad=structuredClone(input);bad.employees[0].inputs[0].value='4.00000000';assert.throws(()=>verifyCatalogueValueInputs(s,bad),e=>e.code==='CATALOGUE_VALUE_INPUT_INVALID');
 changePeriod(s,'2026-12');assert.throws(()=>prepareOwnPayrollQuantityApprovedInput(s),e=>e.code==='CATALOGUE_VALUE_MISSING');addPeriodValue(s,'2026-12','4.00');assert.equal(prepareOwnPayrollQuantityApprovedInput(s).employees[0].inputs[0].value,'4.00000000');
});
for(const v5 of [false,true])test('V'+(v5?'5':'4')+' captura y API usan el nuevo dato con la aprobación original',async()=>{
 const c=officialPeriodReceipt(v5),frozen=JSON.stringify(c.payload.programState.program);
 assert.equal(c.saved.input.employees[0].inputs.find(i=>i.key==='syntheticTariff302').value,'25.00000000');
 assert.doesNotThrow(()=>ownOfficialCapture(c));
 assert.equal(verifyOwnRunReceipt(c).saved.inputSha256,c.saved.inputSha256);
 const principal={user:{email:'qa@example.invalid'},tenant:{source:'membership',id:uid(1),membershipId:uid(2),effectiveCapabilities:RUN_CALCULATE}},session={email:'qa@example.invalid',id:uid(3),version:1,releaseSha:'d'.repeat(40)};
 const calls=[],pending={...c,saved:null};
 const result=await ownRunOperation({query:async(q,args)=>{calls.push({q,args});return[{result:calls.length===1?pending:c.saved}];}},principal,session,'calculate',{key:c.key,body:c.body},{algorithmHash:()=>c.algorithmSha256});
 assert.equal(calls.length,2);assert.match(calls[1].q,/own_run_complete_official_v1/);assert.deepEqual(result.saved,c.saved);assert.equal(JSON.stringify(c.payload.programState.program),frozen);
 for(const change of [i=>i.employees[0].inputs.find(x=>x.key==='syntheticTariff302').value='99.00000000',i=>i.employees[0].inputs.find(x=>x.key==='syntheticTariff302').sourceReference='Changed frozen reference']){
  const bad=structuredClone(c);change(bad.saved.input);bad.saved.inputSha256=ownRunHash(bad.saved.input);assert.throws(()=>ownOfficialCapture(bad));assert.throws(()=>verifyOwnRunReceipt(bad));
 }
});
test('los errores de datos por período conservan código accionable en SQL y API',()=>{
 for(const [code,status]of [['MISSING',422],['DEFINITION_MISSING',422],['SOURCE_CHANGED',422],['CAPTURE_INVALID',503],['INPUT_INVALID',503],['PROGRAM_INVALID',422]]){
  const error=runError(Error('OWN_RUN_CATALOGUE_VALUE_'+code));assert.equal(error.code,'OWN_RUN_CATALOGUE_VALUE_'+code);assert.equal(error.status,status);
 }
 const s=changePeriod(periodValueSources(),'2026-12');let error;try{prepare(s);}catch(e){error=runError(e);}assert.equal(error.code,'OWN_RUN_CATALOGUE_VALUE_MISSING');assert.match(error.message,/800009001.*2026-12/);
});
