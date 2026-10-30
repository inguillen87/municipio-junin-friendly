// Source-only full adapter regressions. This closure imports the programme
// normalizer/engine and is NOT admitted for local execution under GLOBAL_SQL_STOP.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ownProgramStructure} from '../assets/own-payroll-program-model.js';
import {prepareProgramWorkspace,programWorkspaceChanges} from '../assets/own-payroll-program-workspace-model.js';
import {verifyOwnMonetaryProgrammeManifest} from '../assets/own-payroll-monetary-manifest.js';

const clone=value=>structuredClone(value);
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
const hash=value=>createHash('sha256').update(canonical(value)).digest('hex');
const reference='Fuente exclusivamente sintética para el workspace monetario';
function base(value='1.00') {
 return ownProgramStructure({namespaceVersion:'own-payroll-namespaces.v2',rules:[{agreementCode:'1',code:'100',nature:'remuneration',unit:'money',validFrom:'2026-10',validUntil:null,liquidationTypes:['monthly'],ruleReference:reference,rounding:{precision:2,mode:'exact'},expression:{op:'literal',unit:'money',value}}],bindings:[],totalsPrecision:2});
}
function declared({value='1.00',sourceReference=reference}={}) {
 const program=base(value),r=program.rules[0],sourceSha256=hash({syntheticDocument:sourceReference});
 const source={version:'own-program-monetary-source.v1',complete:true,program,programSha256:hash(program),sourceReference,sourceSha256};
 const identity={namespaceVersion:program.namespaceVersion,kind:'concept',agreementCode:r.agreementCode,code:r.code,nature:r.nature,validFrom:r.validFrom,validUntil:r.validUntil,liquidationTypes:clone(r.liquidationTypes)};
 const inventory={identity,unit:'money',stage:'rule_result',rounding:clone(r.rounding),ruleReference:r.ruleReference,ruleSha256:hash(r),expressionSha256:hash(r.expression),nodes:[{path:'expression',operation:'literal',declaredUnit:'money',stage:'expression_exact'}]};
 const {ruleReference,nodes,...entry}=inventory;
 const unsigned={version:'own-program-monetary-policy.v1',complete:true,sourceStateSha256:hash(source),programSha256:hash(program),inventorySha256:hash({version:source.version,programSha256:hash(program),bindingsSha256:hash(program.bindings),inventory:[inventory]}),entries:[{...entry,sourceReference,sourceSha256}]};
 return {...program,monetaryPolicyVersion:'own-program-monetary-manifest.v1',monetaryPolicy:{sourceReference,sourceSha256,policy:{...unsigned,policySha256:hash(unsigned)}}};
}
function bootstrap(definition) {
 const items=definition.rules.map(r=>({kind:'concept',agreementCode:r.agreementCode,categoryCode:null,code:r.code,label:'Concepto exclusivamente sintético',active:true,nature:r.nature,unit:r.unit,precision:2,validFrom:r.validFrom,validUntil:null,value:null,dependencies:[],ruleReference:reference}));
 return {version:'own-payroll-program.v1',scopeVersion:'a'.repeat(64),salaryCatalog:{version:'c'.repeat(64),revision:1,items},program:{version:'b'.repeat(64),revision:1,definition,salaryVersion:'c'.repeat(64),proposalId:'10000000-0000-4000-8000-000000000010',approvalId:'10000000-0000-4000-8000-000000000011'},proposals:[],permissions:{canPropose:true,canReview:false},payrollCalculated:false,payrollPosted:false};
}

test('legacy workspace comparison remains unchanged without an annex',()=>{
 const b=base(),diff=programWorkspaceChanges(b,clone(b));
 assert.equal(diff.changed,0);assert.equal(Object.hasOwn(diff,'monetaryPolicy'),false);
});
test('a complete source-only monetary correction counts despite unchanged formulas and bindings',async()=>{
 const before=declared(),after=declared({sourceReference:'Otra fuente exclusivamente sintética para la nueva revisión'});
 await verifyOwnMonetaryProgrammeManifest(before);await verifyOwnMonetaryProgrammeManifest(after);
 assert.deepEqual(before.rules,after.rules);assert.deepEqual(before.bindings,after.bindings);
 const frozen=clone({before,after}),diff=programWorkspaceChanges(before,after);
 assert.equal(diff.changed,1);assert.equal(diff.monetaryPolicy.changed,true);
 assert.equal(diff.rows.some(row=>row.status!=='unchanged'),false);
 assert.deepEqual({before,after},frozen);
});
test('an unchanged complete annex does not generate a spurious workspace change',()=>{
 const d=declared(),diff=programWorkspaceChanges(d,clone(d));
 assert.equal(diff.changed,0);assert.equal(diff.monetaryPolicy.changed,false);
 assert.deepEqual(diff.monetaryPolicy.before.declaration,d.monetaryPolicy);
});
test('a newly corrected exact rule and its corresponding annex are both visible',async()=>{
 const before=declared(),after=declared({value:'2.00'});
 await verifyOwnMonetaryProgrammeManifest(before);await verifyOwnMonetaryProgrammeManifest(after);
 const diff=programWorkspaceChanges(before,after);
 assert.equal(diff.changed,2);assert.equal(diff.monetaryPolicy.changed,true);
 assert.equal(diff.rows.filter(row=>row.kind==='rules'&&row.status==='modified').length,1);
 assert.equal(before.rules[0].expression.value,'1.00');
});
test('preparation retains the complete coherent annex without approving or calculating',async()=>{
 const before=declared(),after=declared({sourceReference:'Nueva fuente exclusivamente sintética para la propuesta'});
 await verifyOwnMonetaryProgrammeManifest(before);await verifyOwnMonetaryProgrammeManifest(after);
 const proposed=prepareProgramWorkspace(bootstrap(before),after,reference);
 assert.equal(proposed.command,'propose');assert.equal(proposed.reviewConfirmed,false);
 assert.deepEqual(proposed.program,after);assert.equal(proposed.program.monetaryPolicy.policy.entries.length,1);
});
test('preparation still rejects removing an existing annex instead of silently dropping it',()=>{
 assert.throws(()=>prepareProgramWorkspace(bootstrap(declared()),base(),reference),{code:'PROGRAM_HISTORY_REQUIRED'});
});
