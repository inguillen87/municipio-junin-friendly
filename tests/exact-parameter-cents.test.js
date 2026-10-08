import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parameterPreview,verifiedParameterProposal,PARAMETER_CONTRACT,PARAMETER_SOURCE_SHA} from '../lib/payroll-parameter-contract.js';
import {writePayrollParameters} from '../lib/internal-payroll-parameters.js';
import {parameterDocument} from '../src/islands/payroll-parameter-export.js';
import {buildExactParameterCentsInstallation} from '../scripts/lib/exact-parameter-cents-installation.mjs';
const draft=(baseAmountCents,rounding='exact_cent',ruleId='aux88-class13i-150')=>({ruleId,baseAmountCents,rounding,agreementIds:ruleId==='aux88-class13i-150'?[2,7,11]:[1,4,6],validFrom:'2026-10',sourceReference:'Escala inventada QA, sin vigencia municipal'});
const id=n=>n.repeat(8)+'-'+n.repeat(4)+'-4'+n.repeat(3)+'-8'+n.repeat(3)+'-'+n.repeat(12);
test('no se pierde un centavo en referencias ni en factores representables',()=>{
 for(const ruleId of ['aux88-class6d','aux90-class3a'])assert.ok(parameterPreview(draft('10001','exact_cent',ruleId)).every(r=>r.newValueCents==='10001'));
 assert.ok(parameterPreview(draft('10002')).every(r=>r.newValueCents==='15003'));
 assert.ok(parameterPreview(draft('66666666666')).every(r=>r.newValueCents==='99999999999'));
});
test('la fracción de centavo se rechaza sin alterar el origen ni elegir redondeo',()=>{
 for(const amount of ['1','10001','65440453']){const input=draft(amount),before=JSON.stringify(input);assert.throws(()=>parameterPreview(input),e=>e.code==='PAYROLL_PARAMETER_PRECISION_LOSS'&&/carga se conserva/.test(e.message));assert.equal(JSON.stringify(input),before);}
});
test('un objeto no puede hacerse pasar por un criterio de precisión',()=>{assert.throws(()=>parameterPreview(draft('10002',{toString:()=> 'exact_cent'})));});
test('las propuestas históricas siguen verificándose con el criterio que guardaron',()=>{
 for(const [rounding,expected]of [['nearest_cent','15002'],['truncate_cent','15001']]){const d=draft('10001',rounding),p={id:id('a'),contractVersion:PARAMETER_CONTRACT,version:1,status:'prepared',draft:{...d,rows:parameterPreview(d),sourceSha256:PARAMETER_SOURCE_SHA,applied:false,currentCatalogVerified:false}};assert.equal(verifiedParameterProposal(p),p);assert.equal(p.draft.rows[0].newValueCents,expected);assert.match(parameterDocument(p,new Date().toISOString()).metadata.find(r=>r[0]==='Precisión registrada')[1],/criterio anterior/);}
 const d=draft('10002'),p={id:id('a'),contractVersion:PARAMETER_CONTRACT,version:1,status:'prepared',draft:{...d,rows:parameterPreview(d),sourceSha256:PARAMETER_SOURCE_SHA,applied:false,currentCatalogVerified:false}};assert.match(parameterDocument(p,new Date().toISOString()).metadata.find(r=>r[0]==='Precisión registrada')[1],/sin redondear/);
});
test('el servidor bloquea pérdida de precisión antes de consultar SQL',async()=>{
 let calls=0;const principal={user:{email:'qa@invalid.local'},tenant:{id:id('a'),membershipId:id('b'),source:'membership'}},session={email:'qa@invalid.local',id:id('c'),version:1,releaseSha:'a'.repeat(40)};
 await assert.rejects(writePayrollParameters({query:async()=>{calls++;}},principal,session,'prepare',{bindingId:id('d'),draft:draft('10001')},id('e')),e=>e.code==='PAYROLL_PARAMETER_PRECISION_LOSS'&&e.status===422);assert.equal(calls,0);
});
test('la instalación sólo adapta el cuerpo conocido y conserva permisos, filas y metadatos',()=>{
 const batch=buildExactParameterCentsInstallation({read:p=>fs.readFileSync(p,'utf8'),sourceCommit:'a'.repeat(40)});
 assert.equal(batch.connects,false);assert.equal(batch.executesSql,false);assert.equal(batch.beforePin.signature,batch.afterPin.signature);assert.notEqual(batch.beforePin.sha256,batch.afterPin.sha256);
 assert.match(batch.changed,/exact_cent[\s\S]*PAYROLL_PARAMETER_PRECISION_LOSS/);assert.match(batch.conservation,/before[\s\S]*IS DISTINCT FROM[\s\S]*after/);
 assert.doesNotMatch(batch.changed,/\b(?:INSERT|UPDATE|DELETE|GRANT|REVOKE|TRUNCATE)\b/);
 assert.throws(()=>buildExactParameterCentsInstallation({read:p=>fs.readFileSync(p,'utf8').replace('computed:=(base_value*3)/2','computed:=base_value'),sourceCommit:'a'.repeat(40)}));
});
