import {monthlyDayDeclarationOperation} from '../lib/internal-own-monthly-day-declaration.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { salarySerialized } from '../assets/native-salary-catalog-model.js';
import { monthlyDayDeclarationDefinition, monthlyDayDeclarationApprovedDefinition, monthlyDayDeclarationCapture, monthlyDayDeclarationBootstrap, monthlyDayDeclarationDetail, prepareMonthlyDayDeclaration, decideMonthlyDayDeclaration, MONTHLY_DAY_DECLARATION_FACTS_VERSION } from '../assets/own-monthly-day-declaration-model.js';
import { approvedMonthlyDayInputs } from '../lib/own-monthly-day-declaration-input.js';
import { syntheticMonthlyDayDeclarationDefinition as definition, syntheticMonthlyDayDeclarationBootstrap as bootstrap, syntheticMonthlyDayDeclarationDetail as detail, monthlyDayDeclarationIds as ids } from './fixtures/own-monthly-day-declaration-synthetic.js';
const sha=v=>createHash('sha256').update(salarySerialized(v)).digest('hex');
const uid=n=>`cccccccc-0000-4000-8000-${String(n).padStart(12,'0')}`;
const seal=v=>(v.version=sha([MONTHLY_DAY_DECLARATION_FACTS_VERSION,v.period,v.records]),v);
function capture(total=3) {
 const period='2026-10',employees=Array.from({length:total},(_,i)=>({contractId:uid(i+1),identityToken:sha(['identity',i])}));
 const records=employees.map((e,i)=>({ ...e,fullPeriod:i%2===0,sourceVersion:sha(['source',i]),configuration:{ version:sha(['configuration',i]),revision:1,definition:{...definition(),recognizedDays:i%2?'16':'30',fullMonthDeclared:i%2===0},proposalId:uid(20000+i),approvalId:uid(40000+i),identityToken:e.identityToken,sourceVersion:sha(['source',i])} }));
 return {employees,value:seal({complete:true,version:'a'.repeat(64),factsVersion:MONTHLY_DAY_DECLARATION_FACTS_VERSION,period,records})};
}
test('typed partial days preserve explicit16/30 and grammar, without inferring dates, units or rounding',()=>{
 for(const recognizedDays of ['0','0.00000000','0.00000001','16','16.25000000','30','30.00000000'])assert.equal(monthlyDayDeclarationDefinition({...definition(),recognizedDays},'2026-10').recognizedDays,recognizedDays);
 const prepared=prepareMonthlyDayDeclaration(bootstrap(),definition(),'Constancia exclusivamente sintética para16 días');
 assert.deepEqual(prepared.definition,definition());assert.equal(prepared.definition.unit,'days');assert.equal(prepared.definition.baseDays,'30');
});
test('NULL is a preserved draft and never an approved zero',async()=>{
 const b=bootstrap(),d={...definition(),recognizedDays:null},p=prepareMonthlyDayDeclaration(b,d,'Borrador exclusivamente sintético incompleto');assert.equal(p.definition.recognizedDays,null);
 assert.throws(()=>monthlyDayDeclarationApprovedDefinition(d,b.source,b.period),e=>e.code==='MONTHLY_DAY_DECLARATION_VALUE_REQUIRED');
 const v=await detail();v.body.definition=d;v.proposal.requestSha256=sha(v.body);b.permissions.canReview=true;b.proposals=[v.proposal];
 assert.throws(()=>decideMonthlyDayDeclaration(b,v,'approve','Revisión sintética no puede completar dato'),e=>e.code==='MONTHLY_DAY_DECLARATION_VALUE_REQUIRED');
 assert.equal(decideMonthlyDayDeclaration(b,v,'reject','Rechazo sintético de dato incompleto').command,'reject');
});
test('labor coverage alone never becomes a complete liquidable month',()=>{
 const b=bootstrap();b.source.fullPeriod=true;
 assert.equal(prepareMonthlyDayDeclaration(b,definition(),'Constancia sintética de sólo16 días').definition.recognizedDays,'16');
 assert.equal(prepareMonthlyDayDeclaration(b,{...definition(),recognizedDays:'0'},'Constancia sintética de cero días').definition.recognizedDays,'0');
 assert.equal(monthlyDayDeclarationApprovedDefinition(definition(),b.source,b.period).fullMonthDeclared,false);
});
test('an explicit complete liquidable month is30 evenFebruary and never a calendar-derived default',()=>{
 for(const period of ['2026-02','2028-02','2026-04','2026-10']){
  const b=bootstrap();b.period=period;b.source.period=period;b.source.fullPeriod=true;
  const d={...definition(),recognizedDays:'30',fullMonthDeclared:true,asOfDate:period+'-01'};
  assert.equal(prepareMonthlyDayDeclaration(b,d,'Constancia sintética de mes liquidable completo').definition.recognizedDays,'30');
  for(const recognizedDays of ['0','16','28','29'])assert.throws(()=>prepareMonthlyDayDeclaration(b,{...d,recognizedDays},'Constancia sintética insuficiente'),e=>e.code==='MONTHLY_DAY_DECLARATION_FULL_MONTH_REQUIRED');
 }
 const b=bootstrap();assert.throws(()=>prepareMonthlyDayDeclaration(b,{...definition(),recognizedDays:'30',fullMonthDeclared:true},'Constancia sintética contra cobertura parcial'));
});
for(const patch of [{recognizedDays:'30.00000001'},{recognizedDays:'31'},{recognizedDays:16},{recognizedDays:'-1'},{recognizedDays:'016'},{recognizedDays:'16e0'},{recognizedDays:'16.000000001'},{recognizedDays:''},{recognizedDays:undefined},{baseDays:'29'},{baseDays:30},{unit:'hours'},{unit:'units'},{policyVersion:'own-monthly-day-policy.v1'},{fullMonthDeclared:null},{fullMonthDeclared:'true'},{asOfDate:'2026-02-30'},{asOfDate:'2026-11-01'},{sourceCode:'101'}])test('rejects unsupported declaration '+JSON.stringify(patch),()=>assert.throws(()=>monthlyDayDeclarationDefinition({...definition(),...patch},'2026-10')));
test('JSON objects with getters, hidden properties, sparse arrays or foreign prototypes are rejected before execution',()=>{
 let reads=0;const d=definition();Object.defineProperty(d,'recognizedDays',{get(){reads++;return '16';},enumerable:true});assert.throws(()=>monthlyDayDeclarationDefinition(d,'2026-10'));assert.equal(reads,0);
 const hidden=definition();Object.defineProperty(hidden,'extra',{value:1});assert.throws(()=>monthlyDayDeclarationDefinition(hidden,'2026-10'));
 assert.throws(()=>monthlyDayDeclarationDefinition(Object.assign(Object.create(null),definition()),'2026-10'));
 const {value,employees}=capture();value.records.length++;assert.throws(()=>monthlyDayDeclarationCapture(value,employees,'2026-10'));
});
test('independent review binds exact proposed content/current source and cannot silently complete or renew it',async()=>{
 const b=bootstrap(),v=await monthlyDayDeclarationDetail(await detail());b.permissions.canReview=true;b.proposals=[v.proposal];
 const approved=decideMonthlyDayDeclaration(b,v,'approve','Revisión independiente exclusivamente sintética');assert.equal(approved.definition,null);assert.equal(approved.proposalSha256,v.proposal.requestSha256);
 b.source.version='b'.repeat(64);assert.throws(()=>decideMonthlyDayDeclaration(b,v,'approve','Revisión sintética con fuente cambiada'),e=>e.code==='MONTHLY_DAY_DECLARATION_BASE_CHANGED');
 b.source.version=v.body.sourceVersion;v.proposal.canReview=false;assert.throws(()=>decideMonthlyDayDeclaration(b,v,'approve','Revisión sintética no independiente'),e=>e.code==='MONTHLY_DAY_DECLARATION_INDEPENDENT_REQUIRED');
 const corrupt=await detail();corrupt.body.definition.recognizedDays='15';await assert.rejects(()=>monthlyDayDeclarationDetail(corrupt));
});
test('no-op is blocked but identical explicit days may be proposed after a real source-version change',()=>{
 const b=bootstrap();Object.assign(b.configuration,{revision:1,definition:definition(),proposalId:ids.proposal,approvalId:uid(40000),identityToken:b.source.subject.identityToken,sourceVersion:b.source.version});
 assert.throws(()=>prepareMonthlyDayDeclaration(b,definition(),'Constancia sintética sin cambios'));
 b.source.version='b'.repeat(64);assert.equal(prepareMonthlyDayDeclaration(b,definition(),'Nueva fuente sintética con misma cantidad').sourceVersion,b.source.version);
});
test('complete851 typed captures preserve the last record and every lexeme without applying payroll or fractions',()=>{
 const {value,employees}=capture(851),before=structuredClone(value),inputs=approvedMonthlyDayInputs(value,employees,'2026-10');
 assert.equal(inputs.length,851);assert.equal(inputs.at(-1).contractId,employees.at(-1).contractId);assert.equal(inputs[1].recognizedDays,'16');assert.equal(inputs[1].baseDays,'30');assert.equal(inputs[1].unit,'days');
 assert.ok(inputs.every(r=>!Object.hasOwn(r,'employeeName')&&!Object.hasOwn(r,'amountCents')&&!Object.hasOwn(r,'fraction')));assert.deepEqual(value,before);
});
for(const [label,mutate]of[
 ['missing last record',(v)=>v.records.pop()],['duplicate record',(v)=>v.records[2]=v.records[1]],['NULL recognized days',(v)=>v.records[1].configuration.definition.recognizedDays=null],['unapproved revision',(v)=>v.records[1].configuration.revision=0],['stale source',(v)=>v.records[1].sourceVersion='f'.repeat(64)],['stale approval identity',(v)=>v.records[1].configuration.identityToken='f'.repeat(64)],['foreign identity',(v)=>v.records[1].identityToken='f'.repeat(64)],['untyped legacy capture',(v)=>{delete v.factsVersion;delete v.period;}],['wrong period',(v)=>v.period='2026-09'],['false full-month declaration',(v)=>v.records[0].configuration.definition.recognizedDays='16'],['uncovered full-month declaration',(v)=>v.records[0].fullPeriod=false],['implicit zero policy',(v)=>v.records[1].configuration.definition.onMissing='zero'],
])test('whole capture rejects '+label,()=>{const {value,employees}=capture();mutate(value);seal(value);assert.throws(()=>approvedMonthlyDayInputs(value,employees,'2026-10'));});
test('source fingerprint binds full-month declaration and all approved facts, with duplicate/empty selection rejected',()=>{
 const {value,employees}=capture();value.records[1].configuration.definition.recognizedDays='15';assert.throws(()=>approvedMonthlyDayInputs(value,employees,'2026-10'),e=>e.code==='MONTHLY_DAY_DECLARATION_CAPTURE_INVALID');
 assert.throws(()=>monthlyDayDeclarationCapture(seal({...value,records:[]}),[],'2026-10'));
 assert.throws(()=>monthlyDayDeclarationCapture(value,[employees[0],employees[0],employees[2]],'2026-10'));
});
test('bootstrap rejects false calculation claims and foreign period/source instead of accepting an operational shortcut',()=>{
 const b=bootstrap();b.payrollCalculated=true;assert.throws(()=>monthlyDayDeclarationBootstrap(b));b.payrollCalculated=false;b.source.period='2026-09';assert.throws(()=>monthlyDayDeclarationBootstrap(b));
});

const readApprovedConfiguration=async b=>monthlyDayDeclarationOperation({query:async()=>[{result:b}]},{user:{email:'configuration-read-qa@example.invalid'},tenant:{source:'membership',id:ids.contract,membershipId:ids.registration,effectiveCapabilities:['workforce.employee.read','payroll.parameter.read']}},{email:'configuration-read-qa@example.invalid',id:ids.key,version:1,releaseSha:'d'.repeat(40)},'bootstrap',{contractId:b.contractId,period:b.period});
const approvedConfigurationBootstrap=()=>{const b=bootstrap();Object.assign(b.configuration,{revision:1,definition:definition(),proposalId:ids.proposal,approvalId:uid(60000),identityToken:b.source.subject.identityToken,sourceVersion:b.source.version});return b;};
test('approved configuration read rejects NULL days but preserves valid historical partial approvals with a changed source',async()=>{
 const b=approvedConfigurationBootstrap();b.configuration.definition.recognizedDays=null;
 assert.throws(()=>monthlyDayDeclarationBootstrap(b),e=>e.code==='MONTHLY_DAY_DECLARATION_CONTRACT_INVALID');
 await assert.rejects(()=>readApprovedConfiguration(b),e=>e.code==='MONTHLY_DAY_DECLARATION_CONTRACT_INVALID'&&e.status===503);
 b.configuration.definition.recognizedDays='16';b.source.version='b'.repeat(64);b.source.subject.identityToken='c'.repeat(64);b.source.fullPeriod=true;
 assert.deepEqual(monthlyDayDeclarationBootstrap(b).configuration,b.configuration);assert.deepEqual((await readApprovedConfiguration(b)).configuration,b.configuration);
});
test('approved configuration read rejects a false full-month declaration but preserves its valid historical30 after coverage changes',async()=>{
 const b=approvedConfigurationBootstrap();b.source.fullPeriod=true;b.configuration.definition.fullMonthDeclared=true;
 assert.throws(()=>monthlyDayDeclarationBootstrap(b),e=>e.code==='MONTHLY_DAY_DECLARATION_CONTRACT_INVALID');
 await assert.rejects(()=>readApprovedConfiguration(b),e=>e.code==='MONTHLY_DAY_DECLARATION_CONTRACT_INVALID'&&e.status===503);
 b.configuration.definition.recognizedDays='30';b.source.version='b'.repeat(64);b.source.subject.identityToken='c'.repeat(64);b.source.fullPeriod=false;
 assert.deepEqual(monthlyDayDeclarationBootstrap(b).configuration,b.configuration);assert.deepEqual((await readApprovedConfiguration(b)).configuration,b.configuration);
});

test('document date1900–2099 matches the SQL contract and still requires a real civil date',()=>{
 for(const [asOfDate,period]of [['1900-01-01','1900-01'],['2099-12-31','2099-12'],['2000-02-29','2000-02']])assert.equal(monthlyDayDeclarationDefinition({...definition(),asOfDate},period).asOfDate,asOfDate);
 for(const [asOfDate,period]of [['1899-12-31','1900-01'],['2100-01-01','2099-12'],['1900-02-29','1900-02'],['2099-02-29','2099-02'],['190-01-01','1900-01'],['2026-02-30','2026-02']])assert.throws(()=>monthlyDayDeclarationDefinition({...definition(),asOfDate},period));
});
