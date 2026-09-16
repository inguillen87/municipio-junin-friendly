import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { canonicalNumber, canonicalAst, parsePostfix, potentialCycles, auditInventory } from '../scripts/audit-payroll-formula-inventory.mjs';

// Fictional configuration only. Never add municipal source expressions or employees here.
const fields={codliq:['FOVM_27','UNIM_27','CONM_27','FOVJ_27','UNIJ_27','CONJ_27','FOFM_27','FOFJ_27','FORMULA_PRE','FORMULA_POST'],auxical:['ALGV_77','ALGF_77','COND_77','NPIV_77','NPIF_77','CNPI_77']};
function row(table,code,values={},agreement='1',company='7') {
  const key=table==='codliq'?{CODI_02:agreement,CODI_27:code}:{CODI_01:company,CODI_02:agreement,ITEM_77:code};
  return {table,key,id:`${table}:${Object.values(key).join(':')}`,agreement,metadata:{},expressions:Object.fromEntries(Object.entries(values).map(([k,v])=>[k,{original:v,analysis:'untrusted_cached_analysis',dependencies:['R[999]']} ])),missingSourceColumns:fields[table].filter(f=>!Object.hasOwn(values,f)),unprovidedSourceColumns:[]};
}
function inventory(rows=[row('codliq','100',{FOVM_27:'A[200] * 0.10'}),row('auxical','200',{ALGV_77:'10 + 2',NPIV_77:'10 2 +'})]) {
 return {version:'payroll-formula-inventory.v1',payrollExecutionAllowed:false,source:{sha256:'a'.repeat(64)},rows};
}
const audit=x=>auditInventory(x,{companyId:'7'}),clone=x=>structuredClone(x);

test('structural audit distinguishes languages, does not execute and ignores cached diagnoses',()=>{
 const input=inventory(),copy=clone(input),report=audit(input);
 assert.equal(report.summary.nonemptyExpressions,3);assert.equal(report.summary.kinds.infix_structurally_supported,2);assert.equal(report.summary.kinds.postfix_structurally_supported,1);
 assert.equal(report.summary.representationPairs,1);assert.equal(report.summary.differentRepresentationPairs,0);assert.equal(report.payrollExecutionAllowed,false);assert.equal(report.municipalAcceptance,null);
 assert.equal(report.bindings[0].reference,'A[200]');assert.doesNotMatch(JSON.stringify(report),/R\[999\]|untrusted_cached_analysis|A\[200\] \* 0\.10/);assert.deepEqual(input,copy);
});

test('decimal normalization retains precision beyond Number without changing signs',()=>{
 assert.equal(canonicalNumber('9007199254740993.0100'),'9007199254740993.01');assert.equal(canonicalNumber('-000.000'),'0');assert.equal(canonicalNumber('+00012.300'),'12.3');
 assert.throws(()=>canonicalNumber('1e3'),/NUMBER_INVALID/);assert.throws(()=>canonicalNumber('1,00'),/NUMBER_INVALID/);assert.throws(()=>canonicalNumber(1),/NUMBER_INVALID/);
 assert.notDeepEqual(canonicalAst(parsePostfix('9007199254740993')),canonicalAst(parsePostfix('9007199254740992')));
});

test('postfix preserves operand order and supports explicit comparison and Boolean aliases',()=>{
 const report=audit(inventory([row('codliq','100'),row('auxical','200',{ALGV_77:'10 - 2',NPIV_77:'10 2 -',COND_77:'N[4] == 1 && N[5] != 2',CNPI_77:'N[4] 1 = N[5] 2 <> y'})]));
 assert.equal(report.summary.differentRepresentationPairs,0);assert.equal(report.summary.representationPairs,2);
 assert.notDeepEqual(canonicalAst(parsePostfix('10 2 -')),canonicalAst(parsePostfix('2 10 -')));
 assert.deepEqual(canonicalAst(parsePostfix('0 !')),['unary','!',['number','0']]);
});

test('different normalized representations require review, not an automatic monetary or legal verdict',()=>{
 const report=audit(inventory([row('codliq','100'),row('auxical','200',{ALGV_77:'N[4] + 1',NPIV_77:'N[5] 1 +'})]));
 assert.equal(report.summary.differentRepresentationPairs,1);assert.equal(report.representationPairs[0].status,'different_tree_requires_review');assert.equal(report.payrollExecutionAllowed,false);
});

test('algebraically plausible reassociation is still reported, not silently rewritten',()=>{
 const report=audit(inventory([row('codliq','100'),row('auxical','200',{ALGV_77:'(N[1]+N[2])+N[3]',NPIV_77:'N[1] N[2] N[3] + +'})]));
 assert.equal(report.summary.differentRepresentationPairs,1);
});

for(const [name,value] of [['underflow','1 +'],['surplus','1 2'],['function','CALL(1)'],['JavaScript','globalThis.process.exit()'],['assignment','x=1'],['empty',''],['token bound',Array(513).fill('1').join(' ')],['length bound','1'.repeat(4097)],['depth bound','1 '+Array(33).fill('1 +').join(' ')]]) test(`postfix refuses ${name} without evaluating source`,()=>assert.throws(()=>parsePostfix(value),/FORMULA_AUDIT_/));

test('NULL, empty and missing source columns remain distinct',()=>{
 const report=audit(inventory([row('codliq','100',{FOVM_27:null,UNIM_27:''}),row('auxical','200',{})]));
 assert.equal(report.summary.kinds.source_null,1);assert.equal(report.summary.kinds.source_empty,1);assert.equal(report.summary.nonemptyExpressions,0);assert.equal(report.expressions.length,2);
 const bad=inventory();bad.rows[0].missingSourceColumns=[];assert.throws(()=>audit(bad),/COLUMN_EVIDENCE/);
});

test('routine hooks and generated classes are requirements, never arithmetic or executable imports',()=>{
 const r=row('codliq','100',{FORMULA_PRE:'RoutineSynthetic',FORMULA_POST:'RoutineSynthetic'});r.metadata.CLASS_M='SyntheticClass';
 const report=audit(inventory([r,row('auxical','200')]));assert.deepEqual(report.specialRoutines,[{name:'RoutineSynthetic',count:2}]);assert.equal(report.summary.specialClassReferences,1);assert.equal(report.summary.unresolvedExpressions,0);assert.equal(report.summary.nonemptyExpressions,2);
});

test('agreement and company cannot supply missing dependencies from another context',()=>{
 const report=audit(inventory([row('codliq','100',{FOVM_27:'A[201] + R[101]'}),row('codliq','101',{FOVM_27:'1'},'2'),row('auxical','200'),row('auxical','201',{ALGV_77:'2'},'1','8')]));
 assert.equal(report.summary.missingDefinitionReferences,2);assert.equal(report.summary.uniqueMissingTargets,2);assert.equal(report.summary.potentialCycleGroups,0);
 assert.ok(report.bindings.every(b=>b.status==='definition_absent_in_this_context'));
});

test('quantity self-reference and external inputs are not treated as result dependency cycles',()=>{
 const report=audit(inventory([row('codliq','100',{FOVM_27:'U[100] * L[1]',UNIM_27:'N[100]'}),row('auxical','200')]));
 assert.equal(report.summary.potentialCycleGroups,0);assert.equal(report.summary.quantityReferences,1);assert.equal(report.summary.externalInputReferences,2);
});

test('conditional and inactive dependency loops are marked potential without claiming execution',()=>{
 const a=row('codliq','100',{FOVM_27:'R[101]',CONM_27:'N[1] == 0'});a.metadata.ACTI_27='N';
 const report=audit(inventory([a,row('codliq','101',{FOVM_27:'R[100]'}),row('auxical','200')]));
 assert.deepEqual(report.potentialCycles,[['codliq:1:100','codliq:1:101']]);assert.equal(report.payrollExecutionAllowed,false);
});

test('postfix dependencies are reported independently but never added to active infix graph',()=>{
 const report=audit(inventory([row('codliq','100'),row('auxical','200',{ALGV_77:'1',NPIV_77:'A[201]'}),row('auxical','201',{ALGV_77:'A[200]'})]));
 assert.equal(report.summary.potentialCycleGroups,0);assert.equal(report.summary.differentRepresentationPairs,1);
 assert.ok(report.expressions.some(e=>e.field==='NPIV_77'&&e.references.includes('A[201]')));
});

test('division risk distinguishes literal zero, nonzero and dynamic inputs',()=>{
 const report=audit(inventory([row('codliq','100',{FOVM_27:'10 / N[1]',FOFM_27:'10 / 2',FOFJ_27:'10 / 0'}),row('auxical','200')]));
 assert.equal(report.summary.divisorCounts.runtime_denominator,1);assert.equal(report.summary.divisorCounts.literal_nonzero,1);assert.equal(report.summary.divisorCounts.literal_zero,1);assert.ok(report.summary.unresolvedExpressions>0);
});

test('iterative graph traversal covers self-loops, disconnected nodes and long chains',()=>{
 const graph=new Map(Array.from({length:10000},(_,i)=>[String(i),i<9999?[String(i+1)]:[]]));
 assert.deepEqual(potentialCycles(graph),[]);graph.set('9999',['9999']);assert.deepEqual(potentialCycles(graph),[['9999']]);
 assert.throws(()=>potentialCycles(new Map([['a',['b']]])),/GRAPH_TARGET/);
});

test('unknown shape, missing company, duplicate keys and authority claims fail closed',()=>{
 for(const change of [x=>x.payrollExecutionAllowed=true,x=>x.version='unknown',x=>x.rows.push(clone(x.rows[0])),x=>x.rows[0].key.CODI_02='01',x=>x.rows[0].expressions.EXTRA={original:'1'},x=>x.rows[0].expressions.FOVM_27.original=2]){const data=inventory();change(data);assert.throws(()=>audit(data),/FORMULA_AUDIT_/);}
 assert.throws(()=>auditInventory(inventory()),/EXPLICIT_COMPANY_REQUIRED/);assert.throws(()=>auditInventory(inventory(),{companyId:'8'}),/COMPANY_ABSENT/);
});

test('unknown nominal root data does not propagate to any output',()=>{
 const data=inventory();data.employee={name:'PRIVATE_SYNTHETIC_MARKER',secret:'PRIVATE_SYNTHETIC_MARKER'};data.rows[0].extra='PRIVATE_SYNTHETIC_MARKER';
 assert.doesNotMatch(JSON.stringify(audit(data)),/PRIVATE_SYNTHETIC_MARKER|"employee"\s*:|"secret"\s*:/);
});

test('CLI is import-safe, private, deterministic and refuses an existing output',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'formula-audit-synthetic-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const script=fileURLToPath(new URL('../scripts/audit-payroll-formula-inventory.mjs',import.meta.url)),input=path.join(dir,'input.json'),output=path.join(dir,'output.json');
 const noSideEffect=spawnSync(process.execPath,['--input-type=module','-e',`await import(${JSON.stringify(new URL('../scripts/audit-payroll-formula-inventory.mjs',import.meta.url).href)})`],{encoding:'utf8'});assert.equal(noSideEffect.status,0);assert.equal(noSideEffect.stdout+noSideEffect.stderr,'');
 await writeFile(input,JSON.stringify(inventory()));const args=[script,'--input',input,'--output',output,'--company','7'];
 const run=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(run.status,0,run.stderr);assert.doesNotMatch(run.stdout+run.stderr,/A\[200\]|input\.json|output\.json/);
 const report=await readFile(output,'utf8');assert.equal(JSON.parse(report).payrollExecutionAllowed,false);assert.match(JSON.parse(report).inventorySha256,/^[a-f0-9]{64}$/);
 const retry=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(retry.status,1);assert.equal(await readFile(output,'utf8'),report);
 await writeFile(input,'{"PRIVATE_SYNTHETIC_MARKER":');const invalid=spawnSync(process.execPath,[script,'--input',input,'--output',path.join(dir,'next.json'),'--company','7'],{encoding:'utf8'});assert.equal(invalid.status,1);assert.doesNotMatch(invalid.stderr,/PRIVATE_SYNTHETIC_MARKER/);
});
