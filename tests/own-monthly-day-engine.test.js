import test from 'node:test';import assert from 'node:assert/strict';
import {monthlyDayEngineSources,sealMonthlyDayEngine} from './fixtures/own-monthly-day-engine-synthetic.js';
import {prepareOwnPayrollInput} from '../lib/own-payroll-approved-input.js';
import {createOwnPayrollSnapshot} from '../lib/own-payroll-snapshot.js';
import {ownProgramDefinition,ownProgramHistory} from '../assets/own-payroll-program-model.js';
import {ownRunHash,ownRunOperation,verifyOwnRunReceipt} from '../lib/internal-own-payroll-run.js';
import {capture as oldCapture,runCommand} from './fixtures/own-payroll-run-synthetic.js';
import {approvedSources} from './fixtures/own-payroll-approved-synthetic.js';
import {participationRuleKey} from '../assets/own-period-participation-program.js';
import {validateMonthlyDayDeclarationProgram,ownProgramParticipationSourceRequired} from '../assets/own-monthly-day-declaration-program.js';
const clone=structuredClone;
function capture(s=monthlyDayEngineSources()){
 const c=oldCapture({body:runCommand({period:s.period})});c.bodySha256=ownRunHash(c.body);c.payload={...s,sourceInventory:{populationDomain:'native_registered',monthlyDayDeclarations:{version:s.monthlyDayDeclarations.version,total:s.monthlyDayDeclarations.records.length,complete:true,authority:'independently_approved_monthly_declaration'},jurisdictions:{version:'own-run-jurisdictions.v1',complete:true,total:s.population.employees.length,rows:s.population.employees.map((e,i)=>({contractId:e.contractId,employeeNumber:e.employeeNumber,registrationId:'aaaaaaaa-0000-4000-8000-'+String(900+i).padStart(12,'0'),identityToken:e.identityToken,jurisdictionCode:'42'}))}}};c.payloadSha256=ownRunHash(c.payload);return c;
}
test('explicit approved193 facts reach the unchanged rational engine for30,16and0 without changing generic157 full-month1/1',()=>{
 const s=monthlyDayEngineSources(),before=clone(s),input=prepareOwnPayrollInput(s),result=createOwnPayrollSnapshot(input).result;
 assert.deepEqual(input.employees.map(e=>e.inputs.find(i=>i.key==='dayCount').value),['30','16','0']);
 assert.deepEqual(input.employees.map(e=>e.inputs.find(i=>i.key==='dayBase').value),['30','30','30']);
 assert.equal(input.employees[0].inputs.find(i=>i.key==='recognizedUnits').value,'1');assert.equal(input.employees[0].inputs.find(i=>i.key==='baseUnits').value,'1');
 for(const [i,amount]of ['300.00000000','160.00000000','0.00000000'].entries())assert.equal(result.rows.find(r=>r.contractId===input.employees[i].contractId&&r.conceptCode==='900').amount,amount);
 assert.deepEqual(s,before);assert.equal(result.paymentExecuted,false);assert.equal(result.municipalApprovalVerified,false);
});
test('complete population reaches the last601st contract and preserves all declarations',()=>{const s=monthlyDayEngineSources(Array.from({length:601},(_,i)=>i?'16':'30'));const r=createOwnPayrollSnapshot(prepareOwnPayrollInput(s)).result;assert.equal(r.employeeCount,601);assert.equal(r.rowCount,1803);assert.equal(s.monthlyDayDeclarations.records.length,601);});
for(const[label,mutate]of[
 ['missing declaration',s=>delete s.monthlyDayDeclarations],['missing last record',s=>s.monthlyDayDeclarations.records.pop()],['duplicate record',s=>s.monthlyDayDeclarations.records[1]=clone(s.monthlyDayDeclarations.records[0])],['null quantity',s=>s.monthlyDayDeclarations.records[1].configuration.definition.recognizedDays=null],['unapproved',s=>s.monthlyDayDeclarations.records[1].configuration.revision=0],['changed identity',s=>s.monthlyDayDeclarations.records[1].identityToken='a'.repeat(64)],['stale source',s=>s.monthlyDayDeclarations.records[1].sourceVersion='a'.repeat(64)],['wrong period',s=>s.monthlyDayDeclarations.period='2026-09'],['wrong policy',s=>s.monthlyDayDeclarations.records[1].configuration.definition.policyVersion='unknown'],['invented full month',s=>s.monthlyDayDeclarations.records[1].configuration.definition.fullMonthDeclared=true],['changed base',s=>s.monthlyDayDeclarations.records[1].configuration.definition.baseDays='31']])test(label+' rejects the whole result',()=>{const s=monthlyDayEngineSources();mutate(s);assert.throws(()=>prepareOwnPayrollInput(s));});
test('a rehashed outer population cannot hide a changed declaration hash',()=>{const s=monthlyDayEngineSources();s.monthlyDayDeclarations.records[1].configuration.definition.recognizedDays='15';s.population.version=ownRunHash({employees:s.population.employees,monthlyDayDeclarations:s.monthlyDayDeclarations,periodParticipation:s.periodParticipation});assert.throws(()=>prepareOwnPayrollInput(s),e=>e.code==='MONTHLY_DAY_DECLARATION_CAPTURE_INVALID');});
test('changing documentary evidence changes source version but not exact amount',()=>{const s=monthlyDayEngineSources(),before=createOwnPayrollSnapshot(prepareOwnPayrollInput(s));s.monthlyDayDeclarations.records[1].configuration.definition.documentReference='Otra constancia exclusivamente sintética';sealMonthlyDayEngine(s);const after=createOwnPayrollSnapshot(prepareOwnPayrollInput(s));assert.deepEqual(before.result.rows,after.result.rows);assert.notEqual(before.input.sourceVersions.population,after.input.sourceVersions.population);});
for(const[label,patch]of[['units',{unit:'units'}],['hours',{unit:'hours'}],['missing0',{onMissing:'zero'}],['sum',{combine:'sum'}],['sourcecode',{sourceCode:'18'}]])test('typed binding rejects '+label,()=>{const s=monthlyDayEngineSources();Object.assign(s.programState.program.definition.bindings[0],patch);assert.throws(()=>ownProgramDefinition(s.programState.program.definition,s.programState.salaryCatalog.items));});
test('opt-in is mandatory and durable history cannot silently drop it',()=>{const s=monthlyDayEngineSources(),p=ownProgramDefinition(s.programState.program.definition,s.programState.salaryCatalog.items),old=approvedSources(1).programState.program.definition;assert.deepEqual(ownProgramDefinition(p,s.programState.salaryCatalog.items),p);assert.throws(()=>ownProgramHistory(p,old));delete s.programState.program.definition.monthlyDayDeclarationVersion;assert.throws(()=>prepareOwnPayrollInput(s));});
test('transitive consumer cannot apply a second fraction even if day usage is indirect',()=>{const s=monthlyDayEngineSources(),p=s.programState.program.definition;p.periodParticipation.treatments.find(t=>t.ruleKey===participationRuleKey(p.rules.find(r=>r.code==='903'))).treatment='fraction';assert.throws(()=>ownProgramDefinition(p,s.programState.salaryCatalog.items),e=>e.code==='MONTHLY_DECLARED_DAYS_DOUBLE_FRACTION');});
test('transitive consumers cannot expand declared month days to another liquidation type',()=>{const s=monthlyDayEngineSources(),p=s.programState.program.definition;p.rules.find(r=>r.code==='903').liquidationTypes=['monthly','vacation'];p.periodParticipation.treatments=p.rules.map(r=>({ruleKey:participationRuleKey(r),treatment:'declared_formula',reference:'Tratamiento sintético completo'}));assert.throws(()=>ownProgramDefinition(p,s.programState.salaryCatalog.items));assert.throws(()=>validateMonthlyDayDeclarationProgram(p),e=>e.code==='MONTHLY_DECLARED_DAYS_TYPE_UNSUPPORTED');});
test('non-opted previous programme produces byte-identical canonical input without declarations',()=>{const s=approvedSources(1),a=prepareOwnPayrollInput(s);assert.deepEqual(a,prepareOwnPayrollInput(clone(s)));s.monthlyDayDeclarations=monthlyDayEngineSources(['30']).monthlyDayDeclarations;assert.throws(()=>prepareOwnPayrollInput(s),e=>e.code==='SOURCE_SCOPE_INVALID');});
test('attempt verification checks inner193 integrity, not just rehashed run payload',()=>{const c=capture();assert.equal(verifyOwnRunReceipt(c).id,c.id);c.payload.monthlyDayDeclarations.records[1].configuration.definition.recognizedDays='15';c.payloadSha256=ownRunHash(c.payload);assert.throws(()=>verifyOwnRunReceipt(c),e=>e.code==='MONTHLY_DAY_DECLARATION_CAPTURE_INVALID');});
test('attempt verification binds valid193 facts to the complete population source hash even without periodContext',()=>{const c=capture();assert.equal(verifyOwnRunReceipt(c),c);c.payload.population.version='f'.repeat(64);c.payloadSha256=ownRunHash(c.payload);assert.throws(()=>verifyOwnRunReceipt(c),e=>e.code==='OWN_RUN_CONTRACT_INVALID');});
test('existing run handler calculates once from193 and recovers the same result without invoking the engine a second time',async()=>{
 const c=capture(monthlyDayEngineSources(['30','16','0'],{typedOnly:true})),seen=[];let stored=null;
 const sql={query:async(q,params)=>{seen.push(q);if(q.includes('own_run_capture_v1'))return[{result:clone({...c,saved:stored})}];if(q.includes('own_run_attempt_v1'))return[{result:clone({...c,saved:stored,replayed:true})}];if(q.includes('own_run_complete_v1')){assert.equal(stored,null);const input=JSON.parse(params[2]),result=JSON.parse(params[3]);stored={version:'own-payroll-saved.v1',id:c.id,algorithmSha256:c.algorithmSha256,inputSha256:ownRunHash(input),resultSha256:ownRunHash(result),input,result,recordedAt:'2026-10-16T12:00:00Z'};return[{result:clone(stored)}];}throw Error('Unexpected SQL facade');}};
 const principal={user:{email:'qa-declared-days@example.invalid'},tenant:{source:'membership',id:'aaaaaaaa-0000-4000-8000-000000000001',membershipId:'aaaaaaaa-0000-4000-8000-000000000002'}},session={email:'qa-declared-days@example.invalid',id:'aaaaaaaa-0000-4000-8000-000000000004',version:1,releaseSha:'d'.repeat(40)};
 // Synthetic database responses only: this proves the JS call chain, not SQL IAM or durability.
 const first=await ownRunOperation(sql,principal,session,'calculate',{key:c.key,body:c.body},{algorithmHash:()=>c.algorithmSha256});
 assert.equal(first.saved.result.employeeCount,3);assert.equal(first.saved.input.employees[1].inputs.find(i=>i.key==='dayCount').value,'16');
 const retry=await ownRunOperation(sql,principal,session,'calculate',{key:c.key,body:c.body},{algorithmHash:()=>c.algorithmSha256});
 const recovered=await ownRunOperation(sql,principal,session,'attempt',{key:c.key});
 assert.deepEqual(first.saved,retry.saved);assert.deepEqual(first.saved,recovered.saved);assert.equal(seen.filter(q=>q.includes('own_run_complete_v1')).length,1);
});
test('193-only monthly programme calculates full30,partial16andzero without any generic157 declaration or approval',()=>{
 const s=monthlyDayEngineSources(['30','16','0'],{typedOnly:true}),p=ownProgramDefinition(s.programState.program.definition,s.programState.salaryCatalog.items);
 assert.equal(ownProgramParticipationSourceRequired(p,'monthly'),false);assert.equal(Object.hasOwn(s,'periodParticipation'),false);
 const input=prepareOwnPayrollInput(s),result=createOwnPayrollSnapshot(input).result;
 assert.equal(input.employees.some(e=>e.inputs.some(i=>['recognizedUnits','baseUnits'].includes(i.key))),false);
 assert.deepEqual(input.employees.map(e=>e.inputs.find(i=>i.key==='dayCount').value),['30','16','0']);
 for(const [i,amount]of ['300.00000000','160.00000000','0.00000000'].entries())assert.equal(result.rows.find(r=>r.contractId===input.employees[i].contractId&&r.conceptCode==='900').amount,amount);
 assert.equal(verifyOwnRunReceipt(capture(s)).saved,null);
});
test('opting into193 does not waive157 when an explicit generic period_fact is consumed',()=>{
 const s=monthlyDayEngineSources(),p=s.programState.program.definition;
 assert.equal(ownProgramParticipationSourceRequired(p,'monthly'),true);delete s.periodParticipation;
 assert.throws(()=>prepareOwnPayrollInput(s));assert.throws(()=>verifyOwnRunReceipt(capture(s)));
});
test('a157 source injected into193-only capture is rejected rather than silently ignored or hashed',()=>{
 const s=monthlyDayEngineSources(['30','16','0'],{typedOnly:true});s.periodParticipation=monthlyDayEngineSources().periodParticipation;
 assert.throws(()=>prepareOwnPayrollInput(s),e=>e.code==='SOURCE_SCOPE_INVALID');assert.throws(()=>verifyOwnRunReceipt(capture(s)),e=>e.code==='RUN_CONTRACT_INVALID');
});
test('193-only does not bypass a missing explicit formula treatment',()=>{
 const s=monthlyDayEngineSources(['30','16','0'],{typedOnly:true});s.programState.program.definition.periodParticipation.treatments.pop();
 assert.throws(()=>ownProgramDefinition(s.programState.program.definition,s.programState.salaryCatalog.items));
});
test('193-only still requires a complete exact declaration hash and outer source hash',()=>{
 const s=monthlyDayEngineSources(['30','16','0'],{typedOnly:true});s.monthlyDayDeclarations.records[1].configuration.definition.recognizedDays='15';
 s.population.version=ownRunHash({employees:s.population.employees,monthlyDayDeclarations:s.monthlyDayDeclarations});
 assert.throws(()=>prepareOwnPayrollInput(s),e=>e.code==='MONTHLY_DAY_DECLARATION_CAPTURE_INVALID');
 const valid=monthlyDayEngineSources(['30','16','0'],{typedOnly:true});valid.population.version='f'.repeat(64);
 assert.throws(()=>prepareOwnPayrollInput(valid),e=>e.code==='SOURCE_VERSION_INVALID');
});
test('legacy programme keeps157 even if it only declares formulas; new version skips157 only for monthly type',()=>{
 const s=monthlyDayEngineSources(['30','16','0'],{typedOnly:true}),p=s.programState.program.definition;
 assert.equal(ownProgramParticipationSourceRequired(p,'vacation'),true);
 const old=clone(p);delete old.monthlyDayDeclarationVersion;assert.equal(ownProgramParticipationSourceRequired(old,'monthly'),true);
 assert.equal(ownProgramParticipationSourceRequired(approvedSources(1).programState.program.definition,'monthly'),false);
});
