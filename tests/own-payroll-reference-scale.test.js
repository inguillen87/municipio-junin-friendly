import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {referenceScaleSources} from './fixtures/own-payroll-reference-scale-synthetic.js';
import {program,command,hash} from './fixtures/own-payroll-program-synthetic.js';
import {ownProgramDefinition,ownProgramCommand} from '../assets/own-payroll-program-model.js';
import {prepareOwnPayrollInput} from '../lib/own-payroll-approved-input.js';
import {createOwnPayrollSnapshot} from '../lib/own-payroll-snapshot.js';
import {programWorkspaceAttempt} from '../assets/own-payroll-program-workspace-model.js';
import {buildOwnReferenceScaleSql,buildOwnReferenceScaleInstallation,assertOwnReferenceScaleDurability} from '../scripts/lib/own-payroll-reference-scale-sql.mjs';
import {prepareOwnReferenceScaleInstallation} from '../scripts/prepare-own-reference-scale-installation.mjs';
import {executeOwnReferenceScaleInstallation} from '../scripts/install-own-reference-scales.mjs';
import {copyFixture} from './fixtures/own-payroll-program-copy-synthetic.js';
import {prepareProgramCopy} from '../assets/own-payroll-program-copy-model.js';
import {splitPostgresStatements} from '../scripts/lib/sql-statements.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'),binding=s=>s.programState.program.definition.bindings.find(b=>b.key==='base');
test('la referencia usa su convenio y clase aprobados; la clase del agente no la reemplaza',()=>{
 const s=referenceScaleSources(601);s.population.employees[600].categoryCode='7';const input=prepareOwnPayrollInput(s);
 assert.equal(input.employees.length,601);for(const e of input.employees){const b=e.inputs.find(i=>i.key==='base');assert.equal(b.value,'201.35000000');assert.match(b.sourceReference,/:escala:4:8800:13:2026-10:sin término$/);}
 assert.equal(createOwnPayrollSnapshot(input).result.employeeTotals.length,601);
});
test('el coeficiente es una operación explícita y exacta, sin sustituir la escala histórica',()=>{
 const s=referenceScaleSources();const r=s.programState.program.definition.rules.find(r=>r.expression.op==='input'&&r.expression.key==='base');
 assert.ok(r);r.expression={op:'multiply',left:r.expression,right:{op:'literal',unit:'coefficient',value:'1.50'}};
 const input=prepareOwnPayrollInput(s),snapshot=createOwnPayrollSnapshot(input),row=snapshot.result.rows.find(row=>row.conceptCode===r.code);assert.deepEqual(row.exactValue,{numerator:'12081',denominator:'40'});assert.equal(row.amount,'302.03');
 const original=JSON.stringify(snapshot);s.programState.salaryCatalog.items.find(i=>i.kind==='scale'&&i.categoryCode==='13').value='202.35';
 assert.notEqual(prepareOwnPayrollInput(s).sourceVersions.rules,input.sourceVersions.rules);assert.equal(JSON.stringify(snapshot),original);
});
for(const [label,change,code] of [
 ['clase ausente',b=>delete b.sourceCategoryCode,'BINDING_INVALID'],['convenio ausente',b=>delete b.sourceAgreementCode,'BINDING_INVALID'],
 ['clase textual inferida',b=>b.sourceCategoryCode='6-D','BINDING_INVALID'],['clase numérica',b=>b.sourceCategoryCode=13,'BINDING_INVALID'],
 ['suma de clases',b=>b.combine='sum','BINDING_INVALID'],['cero implícito',b=>b.onMissing='zero','BINDING_INVALID'],
 ['unidad incompatible',b=>b.unit='hours','BINDING_INVALID'],['clase no aprobada',b=>b.sourceCategoryCode='99','SOURCE_DEFINITION_MISSING'],
 ['otro convenio',b=>b.sourceAgreementCode='9','SOURCE_DEFINITION_MISSING'],['campos adicionales',b=>b.categoryLabel='6-D','BINDING_INVALID'],
])test('referencia bloquea '+label,()=>{const s=referenceScaleSources();change(binding(s));assert.throws(()=>ownProgramDefinition(s.programState.program.definition,s.programState.salaryCatalog.items),e=>e.code===code);});
test('la cobertura exige la clase exacta durante todos los meses, no agrega otra clase al hueco',()=>{
 const s=referenceScaleSources();s.programState.salaryCatalog.items.find(i=>i.categoryCode==='13').validUntil='2026-10';
 assert.throws(()=>prepareOwnPayrollInput(s),e=>e.code==='SOURCE_DEFINITION_MISSING');
});
test('el cuerpo antiguo conserva sus ocho campos y el intento pendiente permanece inmutable',()=>{
 const old=command(),checked=ownProgramCommand(old);assert.deepEqual(checked,old);assert.equal(Object.keys(program().bindings[0]).length,8);
 const attempt=programWorkspaceAttempt('00000000-0000-4000-8000-000000000099',old,'synthetic-session');
 const before=JSON.stringify(attempt);const s=referenceScaleSources();ownProgramDefinition(s.programState.program.definition,s.programState.salaryCatalog.items);assert.equal(JSON.stringify(attempt),before);
 const wrong=structuredClone(old);wrong.program.bindings[0].sourceCategoryCode='13';assert.throws(()=>ownProgramCommand(wrong),e=>e.code==='BINDING_INVALID');
});
test('SQL131 es una sola adaptación cerrada; cuerpo, seguridad y todas las filas anteriores se cotejan',()=>{
 const sql=buildOwnReferenceScaleSql(read);assert.equal(read('scripts/migrations/131-own-payroll-reference-scale.sql').replace(/\r\n?/g,'\n'),sql.migration);
 assert.equal(splitPostgresStatements(sql.migration).length,2);assert.match(sql.adapted,/sourceAgreementCode/);assert.match(sql.adapted,/sourceCategoryCode/);
 const p=buildOwnReferenceScaleInstallation({read,sourceCommit:hash('a').slice(0,40)});assert.equal(p.installation.length,10);assert.match(p.installation.join('\n'),/SQL131_FUNCTION_SECURITY_CHANGED/);assert.ok(!p.installation.join('\n').includes("IS DISTINCT FROM to_regclass('public.native_leave_event')"));
 assert.throws(()=>buildOwnReferenceScaleSql(p=>read(p)+'\n'));assert.throws(()=>buildOwnReferenceScaleInstallation({read:p=>read(p)+(p.includes('131-')?'\n':''),sourceCommit:hash('a').slice(0,40)}));
});
test('la copia conserva la referencia explícita aunque cambie el convenio de destino',()=>{
 const f=copyFixture();f.draft.rules[0].expression={op:'input',unit:'money',key:'reference'};f.draft.bindings=[{agreementCode:'1',key:'reference',unit:'money',sourceKind:'scale_reference',sourceCode:'8900',sourceAgreementCode:'1',sourceCategoryCode:'13',onMissing:'error',combine:'single',ruleReference:'Fuente propia sintética QA'}];f.boot.program.definition=structuredClone(f.draft);
 f.boot.salaryCatalog.items.push({active:true,agreementCode:'1',categoryCode:'13',code:'8900',dependencies:[],kind:'scale',label:'Clase sintética QA',nature:null,precision:2,ruleReference:'Fuente sintética QA',unit:'money',validFrom:'2026-01',validUntil:null,value:'201.35'});
 const plan=prepareProgramCopy(f.boot,f.draft,f.intent);assert.equal(plan.program.bindings.length,3);for(const b of plan.program.bindings){assert.equal(b.sourceAgreementCode,'1');assert.equal(b.sourceCategoryCode,'13');}
 f.boot.salaryCatalog.items.at(-1).active=false;assert.throws(()=>prepareProgramCopy(f.boot,f.draft,f.intent),e=>e.code==='SOURCE_DEFINITION_MISSING');
});
test('una escala de cero es un valor aprobado; una escala inactiva o un hueco no equivale a cero',()=>{
 const s=referenceScaleSources();s.programState.salaryCatalog.items.find(i=>i.categoryCode==='13').value='0.00';assert.equal(prepareOwnPayrollInput(s).employees[0].inputs.find(i=>i.key==='base').value,'0.00000000');
 s.programState.salaryCatalog.items.find(i=>i.categoryCode==='13').active=false;assert.throws(()=>prepareOwnPayrollInput(s),e=>e.code==='SOURCE_DEFINITION_MISSING');
});
test('los destinos de instalación son los dos existentes y no se reintenta un COMMIT incierto',async()=>{
 const batch=prepareOwnReferenceScaleInstallation({read,sourceCommit:'a'.repeat(40)});assert.deepEqual(batch.targets.map(t=>t.major),[17,18]);for(const t of batch.targets){assert.ok(t.preflight.includes('SET TRANSACTION READ ONLY'));assert.ok(t.durableVerification.includes('SET TRANSACTION READ ONLY'));}
 let calls=0;await assert.rejects(executeOwnReferenceScaleInstallation({batch,major:17,client:async()=>({target:batch.targets[0],sql:{query:s=>s,transaction:async()=>{if(++calls===2)throw Error('Lost COMMIT ACK');return [];}}}),record:()=>assert.fail('No completed receipt')}),/Lost COMMIT ACK/);assert.equal(calls,2);
});
test('la prueba durable rechaza una huella o metadato sustituidos',()=>{
 const batch=prepareOwnReferenceScaleInstallation({read,sourceCommit:'a'.repeat(40)}),installed={sourceCommit:batch.sourceCommit,sql131Sha256:batch.sql131Sha256,functionSha256:batch.newPin.sha256,allChecksPassed:true,newTables:0,newFunctions:0,validatorsAdapted:1,roleAssignmentsAdded:0,nominalRowsReturned:0,beforeFingerprint:hash('b'),afterFingerprint:hash('b')},durable=Object.fromEntries(Object.entries(installed).filter(([k])=>k!=='beforeFingerprint'));
 assert.equal(assertOwnReferenceScaleDurability({installed,durable,batch}).priorRowsAndSecurityPreserved,true);
 assert.throws(()=>assertOwnReferenceScaleDurability({installed:{...installed,afterFingerprint:hash('c')},durable,batch}));assert.throws(()=>assertOwnReferenceScaleDurability({installed,durable:{...durable,functionSha256:hash('d')},batch}));
});
