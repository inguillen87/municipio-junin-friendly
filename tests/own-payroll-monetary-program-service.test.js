// Proposed CI-only integration coverage. NOT executed or admitted locally.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {programOperation} from '../lib/internal-own-payroll-program.js';
import {ownProgramStructure} from '../assets/own-payroll-program-model.js';
import {requireExactProgramChanges} from '../assets/own-payroll-program-precision.js';

const clone=v=>structuredClone(v);
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const hash=v=>createHash('sha256').update(canonical(v),'utf8').digest('hex');
const uid=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const reference='Fuente exclusivamente sintética del servicio de programas';
const principal={user:{email:'qa@example.invalid'},tenant:{source:'membership',id:uid(1),membershipId:uid(2)}};
const session={email:'qa@example.invalid',id:uid(3),version:1,releaseSha:'d'.repeat(40)};
function declared({value='1.00',totalsPrecision=2}={}){
 const b=ownProgramStructure({namespaceVersion:'own-payroll-namespaces.v2',rules:[{agreementCode:'1',code:'100',nature:'remuneration',unit:'money',validFrom:'2026-10',validUntil:null,liquidationTypes:['monthly'],ruleReference:reference,rounding:{precision:2,mode:'exact'},expression:{op:'literal',unit:'money',value}}],bindings:[],totalsPrecision});
 const r=b.rules[0],sourceSha256=hash({fixture:'no-municipal-source'}),source={version:'own-program-monetary-source.v1',complete:true,program:b,programSha256:hash(b),sourceReference:reference,sourceSha256};
 const identity={namespaceVersion:b.namespaceVersion,kind:'concept',agreementCode:r.agreementCode,code:r.code,nature:r.nature,validFrom:r.validFrom,validUntil:r.validUntil,liquidationTypes:r.liquidationTypes};
 const inventory={identity,unit:'money',stage:'rule_result',rounding:r.rounding,ruleReference:r.ruleReference,ruleSha256:hash(r),expressionSha256:hash(r.expression),nodes:[{path:'expression',operation:'literal',declaredUnit:'money',stage:'expression_exact'}]};
 const {ruleReference,nodes,...entry}=inventory;
 const unsigned={version:'own-program-monetary-policy.v1',complete:true,sourceStateSha256:hash(source),programSha256:hash(b),inventorySha256:hash({version:source.version,programSha256:hash(b),bindingsSha256:hash(b.bindings),inventory:[inventory]}),entries:[{...entry,sourceReference:reference,sourceSha256}]};
 return {...b,monetaryPolicyVersion:'own-program-monetary-manifest.v1',monetaryPolicy:{sourceReference:reference,sourceSha256,policy:{...unsigned,policySha256:hash(unsigned)}}};
}
const body=definition=>({command:'propose',scopeVersion:'a'.repeat(64),baseVersion:'b'.repeat(64),salaryVersion:'c'.repeat(64),proposalId:null,proposalSha256:null,program:definition,reason:reference,reviewConfirmed:false});
const receipt=definition=>({version:'own-payroll-program.v1',eventId:uid(10),proposalId:uid(10),requestKey:uid(9),requestSha256:hash(body(definition)),body:body(definition),status:'pending',revision:0,programVersion:'b'.repeat(64),replayed:true,payrollCalculated:false,payrollPosted:false});
const catalog=definition=>definition.rules.map(r=>({kind:'concept',agreementCode:r.agreementCode,categoryCode:null,code:r.code,label:'Concepto exclusivamente QA',active:true,nature:r.nature,unit:r.unit,precision:2,validFrom:r.validFrom,validUntil:null,value:null,dependencies:[],ruleReference:reference}));
function bootstrap(definition){return {version:'own-payroll-program.v1',scopeVersion:'a'.repeat(64),salaryCatalog:{version:'c'.repeat(64),revision:1,items:catalog(definition)},program:{version:'b'.repeat(64),revision:1,definition,salaryVersion:'c'.repeat(64),proposalId:uid(10),approvalId:uid(11)},proposals:[],permissions:{canPropose:true,canReview:false},payrollCalculated:false,payrollPosted:false};}
function sqlReturning(value){const calls=[];return {calls,query:async(q,v)=>{calls.push({q,v});return [{result:clone(value)}];}};}

test('a forged proposal policy is rejected before the SQL command is sent',async()=>{
 const d=declared();d.monetaryPolicy.policy.policySha256='0'.repeat(64);const sql=sqlReturning(null),input={key:uid(9),body:body(d)},before=clone(input);
 await assert.rejects(()=>programOperation(sql,principal,session,'command',input),e=>e.status===422);
 assert.equal(sql.calls.length,0);assert.deepEqual(input,before);
});
test('a valid synthetic manifest reaches only the existing SQL command and returns no calculation',async()=>{
 const d=declared(),r=receipt(d),sql=sqlReturning(r),input={key:uid(9),body:body(d)},before=clone(input);
 assert.deepEqual(await programOperation(sql,principal,session,'command',input),r);assert.equal(sql.calls.length,1);
 assert.match(sql.calls[0].q,/own_program_command_v1/);assert.deepEqual(JSON.parse(sql.calls[0].v[1]),input.body);
 assert.deepEqual(input,before);assert.equal(r.payrollCalculated,false);assert.equal(r.payrollPosted,false);
});
test('attempt recovery rejects a forged inner policy even with a freshly valid request digest',async()=>{
 const d=declared();d.monetaryPolicy.policy.policySha256='0'.repeat(64);const r=receipt(d),sql=sqlReturning(r),before=clone(r);
 assert.equal(r.requestSha256,hash(r.body));
 await assert.rejects(()=>programOperation(sql,principal,session,'attempt',{key:uid(9)}),e=>e.status===503&&e.code==='OWN_PROGRAM_CONTRACT_INVALID');
 assert.equal(sql.calls.length,1);assert.match(sql.calls[0].q,/own_program_attempt_v1/);assert.deepEqual(r,before);
});
test('valid attempt recovery uses its frozen manifest without reading a current catalogue',async()=>{
 const r=receipt(declared()),sql=sqlReturning(r);
 assert.deepEqual(await programOperation(sql,principal,session,'attempt',{key:uid(9)}),r);
 assert.equal(sql.calls.length,1);assert.match(sql.calls[0].q,/own_program_attempt_v1/);
});
test('bootstrap rejects the current definition when its inner policy has changed',async()=>{
 const d=declared();d.monetaryPolicy.policy.policySha256='0'.repeat(64);const b=bootstrap(d),sql=sqlReturning(b);
 await assert.rejects(()=>programOperation(sql,principal,session,'bootstrap'),e=>e.status===503&&e.code==='OWN_PROGRAM_CONTRACT_INVALID');
 assert.equal(sql.calls.length,1);
});
test('bootstrap checks a proposal base as well as its proposed definition',async()=>{
 const d=declared(),base=clone(d);base.monetaryPolicy.policy.policySha256='0'.repeat(64);const b=bootstrap(d);
 b.proposals=[{id:uid(20),requestSha256:'e'.repeat(64),baseVersion:b.program.version,salaryVersion:b.salaryCatalog.version,salaryItems:b.salaryCatalog.items,baseDefinition:base,definition:d,reason:reference,createdAt:'2026-10-22T00:00:00.000Z',authorLabel:'Persona exclusivamente QA',canReview:false,status:'pending',decision:null}];
 const sql=sqlReturning(b);await assert.rejects(()=>programOperation(sql,principal,session,'bootstrap'),e=>e.status===503&&e.code==='OWN_PROGRAM_CONTRACT_INVALID');
 assert.equal(sql.calls.length,1);
});
test('legacy proposal recovery keeps the previous payload without adding monetary fields',async()=>{
 const {monetaryPolicyVersion,monetaryPolicy,...legacy}=declared(),r=receipt(legacy),sql=sqlReturning(r);
 const checked=await programOperation(sql,principal,session,'attempt',{key:uid(9)});
 assert.deepEqual(checked,r);assert.equal(Object.hasOwn(checked.body.program,'monetaryPolicy'),false);assert.equal(sql.calls.length,1);
});

test('an empty client monetary declaration is a 422 rejection before SQL despite its CONTRACT_INVALID code',async()=>{
 const d=declared();d.monetaryPolicy.policy.entries=[];const sql=sqlReturning(null),input={key:uid(9),body:body(d)},before=clone(input);
 await assert.rejects(()=>programOperation(sql,principal,session,'command',input),e=>e.status===422&&e.code==='OWN_PROGRAM_OWN_MONETARY_CONTRACT_INVALID');
 assert.equal(sql.calls.length,0);assert.deepEqual(input,before);
});

for(const operation of ['bootstrap','attempt'])test('an unsupported monetary version in the preserved '+operation+' response is 503 rather than client input failure',async()=>{
 const d=declared();d.monetaryPolicyVersion='own-program-monetary-manifest.unsupported';
 const value=operation==='bootstrap'?bootstrap(d):receipt(d),sql=sqlReturning(value),before=clone(value);
 if(operation==='attempt')assert.equal(value.requestSha256,hash(value.body));
 await assert.rejects(()=>programOperation(sql,principal,session,operation,{key:uid(9)}),e=>e.status===503&&e.code==='OWN_PROGRAM_CONTRACT_INVALID');
 assert.equal(sql.calls.length,1);assert.match(sql.calls[0].q,operation==='bootstrap'?/own_program_bootstrap_v1/:/own_program_attempt_v1/);assert.deepEqual(value,before);
});

for(const [label,message,status,code]of [
 ['session','ACTION_SESSION_INVALID',401,'OWN_PROGRAM_SESSION_INVALID'],
 ['authority','OWN_PROGRAM_FORBIDDEN',403,'OWN_PROGRAM_FORBIDDEN'],
 ['concurrent base','OWN_PROGRAM_BASE_CHANGED',409,'OWN_PROGRAM_BASE_CHANGED'],
])test('SQL '+label+' errors retain their existing '+status+' status outside declarative wrappers',async()=>{
 const calls=[],sql={query:async(q,v)=>{calls.push({q,v});throw new Error(message);}},input={key:uid(9),body:body(declared())},before=clone(input);
 await assert.rejects(()=>programOperation(sql,principal,session,'command',input),e=>e.status===status&&e.code===code);
 assert.equal(calls.length,1);assert.match(calls[0].q,/own_program_command_v1/);assert.deepEqual(input,before);
});

// Explicitly versioned proposals may correct a rule; earlier events are retained.
for(const correction of [{value:'2.00'},{totalsPrecision:3}])test('bootstrap preserves prior and corrected monetary revisions '+JSON.stringify(correction),async()=>{
 const before=declared(),after=declared(correction);requireExactProgramChanges(before,after);
 const b=bootstrap(after);b.program={...b.program,version:'e'.repeat(64),revision:2,proposalId:uid(21),approvalId:uid(22)};
 b.proposals=[{id:uid(21),requestSha256:hash(body(after)),baseVersion:'b'.repeat(64),salaryVersion:'c'.repeat(64),salaryItems:catalog(after),baseDefinition:before,definition:after,reason:reference,createdAt:'2026-10-22T12:00:00.000Z',authorLabel:'Persona sintética QA',canReview:false,status:'approved',decision:{command:'approve',reason:reference,actorLabel:'Revisión sintética QA',recordedAt:'2026-10-22T12:01:00.000Z',revision:2}}];
 const snapshot=clone(b),sql=sqlReturning(b);
 assert.deepEqual(await programOperation(sql,principal,session,'bootstrap'),snapshot);
 assert.equal(sql.calls.length,1);assert.match(sql.calls[0].q,/own_program_bootstrap_v1/);
 assert.deepEqual(b,snapshot);assert.deepEqual(b.proposals[0].baseDefinition,before);
 assert.notEqual(hash(before),hash(after));assert.equal(b.program.revision,2);
});

test('bootstrap rejects removal of the monetary pair from a successor proposal',async()=>{
 const before=declared(),after=declared({value:'2.00'});delete after.monetaryPolicyVersion;delete after.monetaryPolicy;
 const b=bootstrap(before);b.proposals=[{id:uid(21),requestSha256:hash(body(after)),baseVersion:'b'.repeat(64),salaryVersion:'c'.repeat(64),salaryItems:catalog(after),baseDefinition:before,definition:after,reason:reference,createdAt:'2026-10-22T12:00:00.000Z',authorLabel:'Persona sintética QA',canReview:false,status:'pending',decision:null}];
 const snapshot=clone(b),sql=sqlReturning(b);
 await assert.rejects(()=>programOperation(sql,principal,session,'bootstrap'),e=>e.status===503&&e.code==='OWN_PROGRAM_CONTRACT_INVALID');
 assert.equal(sql.calls.length,1);assert.deepEqual(b,snapshot);
});