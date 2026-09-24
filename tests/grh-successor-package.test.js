// Sólo datos sintéticos. La integridad del paquete no certifica sus fuentes ni autoriza importar.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {buildSuccessorDelta,sealSuccessorPackage,verifySuccessorPackage,successorPackageSummary,SUCCESSOR_ENTITIES,successorHash} from '../scripts/lib/grh-successor-package.mjs';
import {getGrhSourceProfile} from '../scripts/lib/grh-source-profile.mjs';
import {stableJson} from '../scripts/lib/canonical-import.mjs';
const monthly=(n,amount='10.00')=>({sourceKey:{companyCode:'101',employeeNumber:n,payrollDate:'2026-08-31',period:2026,month:8,payrollType:'M'},itemCount:1,quantitySum:'1',technicalSourceAmountSum:'10',sourceTotals:{netPayable:amount},dominantAgreementCode:'1',dominantSectorCode:null,distinctConcepts:1});
const employee=(n,label='PERSONA SINTETICA')=>({company_id:101,legajo:n,person_id:'123',nombre:label,activo:true,source_payload:{sourceKey:{employeeNumber:n},label}});
const readers=(a,b)=>({baseline:()=>structuredClone(a),candidate:()=>structuredClone(b)});
function source(id){const p=getGrhSourceProfile(id,{allowCandidateRead:true});return{profileId:id,sourceSha256:p.source.sha256.toLowerCase(),cutoff:p.source.cutoff,coreManifestSha256:'a'.repeat(64),curatedManifestSha256:'b'.repeat(64)};}
async function fixture(){const results=[];for(const entity of SUCCESSOR_ENTITIES){const a=entity==='core/payrollMonthly'?[monthly('1'),monthly('2')]:entity==='curated/grh_employees'?[employee('1')]:[];
 const b=entity==='core/payrollMonthly'?[monthly('1','12.50'),monthly('3')]:entity==='curated/grh_employees'?[employee('1','CAMBIO SINTETICO')]:[];
 results.push(await buildSuccessorDelta(entity,readers(a,b)));}
 return sealSuccessorPackage({baseline:source('grh-junin-2026-09-10'),candidate:source('grh-junin-2026-09-22'),results});}
function rehash(value){const {payloadSha256,...payload}=value;return {...payload,payloadSha256:successorHash(stableJson(payload))};}
test('diferencias conservan el registro anterior, el candidato y los decimales exactos',async()=>{
 const a=[monthly('1'),monthly('2')],copy=structuredClone(a);const r=await buildSuccessorDelta('core/payrollMonthly',readers(a,[monthly('1','9007199254740993.12'),monthly('3')]));
 assert.deepEqual(r.changes,{add:1,replace:1,remove:1});const changed=r.rows.find(x=>x.operation==='replace');
 assert.equal(changed.previousRecord.net_payable,'10');assert.equal(changed.record.net_payable,'9007199254740993.12');assert.deepEqual(changed.previousSourcePayload,a[0]);assert.deepEqual(a,copy);
 const removed=r.rows.find(x=>x.operation==='remove');assert.equal(removed.record,null);assert.ok(removed.previousRecord);assert.equal(removed.sourcePayload,null);
});
test('orden de lectura no altera huellas ni diferencias',async()=>{
 const a=[monthly('1'),monthly('2')],b=[monthly('1','20'),monthly('3')];
 assert.deepEqual(await buildSuccessorDelta('core/payrollMonthly',readers(a,b)),await buildSuccessorDelta('core/payrollMonthly',readers(a.toReversed(),b.toReversed())));
});
for(const side of ['baseline','candidate'])test('rechaza claves repetidas en '+side,async()=>{
 const data={baseline:[],candidate:[]};data[side]=[monthly('1'),monthly('1')];await assert.rejects(buildSuccessorDelta('core/payrollMonthly',readers(data.baseline,data.candidate)),e=>e.code==='SUCCESSOR_'+(side==='baseline'?'BASE':'CANDIDATE')+'_DUPLICATE');
});
test('segunda lectura de la base debe conservar exactamente los registros',async()=>{
 let n=0;await assert.rejects(buildSuccessorDelta('core/payrollMonthly',{baseline:()=>++n===1?[monthly('1')]:[monthly('1','30')],candidate:()=>[monthly('1','20')]}),{code:'SUCCESSOR_BASE_CHANGED'});
});
test('un registro anterior que desaparece durante la lectura cancela la construcción',async()=>{
 let n=0;await assert.rejects(buildSuccessorDelta('core/payrollMonthly',{baseline:()=>++n===1?[monthly('1')]:[],candidate:()=>[]}),{code:'SUCCESSOR_BASE_CHANGED'});
});
test('no admite otra empresa ni un lector implícito',async()=>{
 const row=monthly('1');row.sourceKey.companyCode='102';await assert.rejects(buildSuccessorDelta('core/payrollMonthly',readers([],[row])),{code:'SUCCESSOR_COMPANY_INVALID'});
 await assert.rejects(buildSuccessorDelta('core/payrollMonthly',{baseline:[],candidate:[]}),{code:'SUCCESSOR_READER_REQUIRED'});
});
test('cambios de representación sin cambio de proyección no generan una sustitución ficticia',async()=>{
 const r=await buildSuccessorDelta('core/payrollMonthly',readers([monthly('1','10.0')],[monthly('1','10.00')]));
 assert.equal(r.rows.length,0);assert.deepEqual(r.baseline,r.candidate);
});
test('personal conserva decimales e identificadores de 64 bits sin convertirlos a flotante',async()=>{
 const before={company_id:101,legajo:'01',fecha:'2026-09-01',cantidad:'1.25',dias:'1',source_payload:{synthetic:true}};
 const r=await buildSuccessorDelta('curated/grh_absences',readers([before],[{...before,cantidad:'2.50'}]));
 assert.equal(r.rows[0].record.cantidad,'2.5');assert.equal(r.rows[0].previousRecord.cantidad,'1.25');
 const f={family_id:'9007199254740993',company_id:101,legajo:'01',source_payload:{synthetic:true}};
 const fam=await buildSuccessorDelta('curated/grh_family',readers([],[f]));assert.equal(fam.rows[0].record.family_id,f.family_id);
});
test('el paquete exige los diez dominios y produce un resumen sin filas nominales',async()=>{
 const p=await fixture(),report=successorPackageSummary(p);assert.equal(Object.keys(report.entities).length,10);assert.equal(report.changeRows,4);
 assert.equal(report.databaseWrites,0);assert.equal(report.operational,false);assert.equal(report.sourcePromoted,false);
 assert.doesNotMatch(JSON.stringify(report),/PERSONA SINTETICA|CAMBIO SINTETICO|net_payable|employee_number|source_payload/);
 assert.equal(report.containsPersonalRecords,false);assert.equal(report.nativeOperationsCompared,false);
});
const mutations={
 missingEntity:p=>delete p.entities['curated/grh_family'],
 unknownEntity:p=>p.entities.unknown={},
 changedSource:p=>p.candidate.sourceSha256='0'.repeat(64),
 changedCutoff:p=>p.candidate.cutoff='2026-09-23T15:16:58',
 swappedProfile:p=>p.candidate.profileId=p.baseline.profileId,
 published:p=>p.operational=true,
 promoted:p=>p.sourcePromoted=true,
 duplicate:p=>p.changes.push(structuredClone(p.changes[0])),
 unsorted:p=>p.changes.reverse(),
 wrongKey:p=>p.changes[0].rowKey='0'.repeat(64),
 wrongCount:p=>p.entities[p.changes[0].entity].changes.add++,
 wrongProjection:p=>{const row=p.changes.find(r=>r.entity==='core/payrollMonthly'&&r.operation==='replace');row.record.net_payable='999';},
 missingPrevious:p=>{p.changes.find(r=>r.operation==='replace').previousRecord=null;},
 unsupportedOperation:p=>p.changes[0].operation='update',
 foreignField:p=>p.changes[0].privateDebug='PRIVATE_MARKER',
 foreignTopField:p=>p.debug='PRIVATE_MARKER',
 impossibleCount:p=>p.entities['core/payrollRuns'].baseline.rows=1000001,
 wrongEmptyHash:p=>{p.entities['core/payrollRuns'].baseline.sha256='0'.repeat(64);p.entities['core/payrollRuns'].candidate.sha256='0'.repeat(64);}
};
for(const [name,mutate]of Object.entries(mutations))test('inconsistencia '+name+' no pasa aunque se recalcule el checksum',async()=>{
 const p=await fixture();mutate(p);assert.throws(()=>verifySuccessorPackage(rehash(p)),e=>e.code==='SUCCESSOR_PACKAGE_INVALID'&&!e.message.includes('PRIVATE_MARKER'));
});
test('checksum cambiado cancela la verificación antes de usar los registros',async()=>{
 const p=await fixture();p.payloadSha256='0'.repeat(64);assert.throws(()=>verifySuccessorPackage(p),{code:'SUCCESSOR_PACKAGE_INVALID'});
});
test('ensamblar dominios repetidos o ausentes no genera un paquete parcial',async()=>{
 const r=await buildSuccessorDelta('core/payrollRuns',readers([],[])),sources={baseline:source('grh-junin-2026-09-10'),candidate:source('grh-junin-2026-09-22')};
 assert.throws(()=>sealSuccessorPackage({...sources,results:[]}),{code:'SUCCESSOR_PACKAGE_INCOMPLETE'});
 assert.throws(()=>sealSuccessorPackage({...sources,results:Array(10).fill(r)}),{code:'SUCCESSOR_PACKAGE_INCOMPLETE'});
});
