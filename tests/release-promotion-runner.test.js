// PROPOSED by Claude (source only; not run by Claude). Target: tests/release-promotion-runner.test.js
// The runner against in-memory providers: proves which mutations did NOT happen. No network or credentials.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {RELEASE_CONTRACT as C} from '../scripts/release-qualification-contract.mjs';
import {runReleaseStage,runReleasePromotion,runReleaseReadback,observeQualification} from '../scripts/release-promotion-runner.mjs';
import {SHA,OTHER,STAGED,PREVIOUS,observation,releaseInfo,binding,admission,fakeWorld} from './fixtures/release-qualification-synthetic.js';

const packet=()=>fs.mkdtempSync(path.join(os.tmpdir(),'release-runner-'));
const read=(dir,name)=>JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
const mutations=calls=>calls.filter(c=>c==='vercel.create'||c==='adapter.promote'||c==='vercel.run');
const stageWith=(world,dir=packet(),over={})=>runReleaseStage({sha:SHA,packet:dir,admission:admission(),transport:world.transport,pause:world.pause,...over});
const promoteWith=(world,dir,over={})=>runReleasePromotion({sha:SHA,packet:dir,admission:admission(),binding:binding(),adapter:world.adapter,transport:world.transport,pause:world.pause,...over});
async function staged(world){const dir=packet();assert.equal((await stageWith(world,dir)).state,'STAGE_VERIFIED_AWAITING_ROOT_BUILD_BINDING');world.calls.length=0;return dir;}

test('observación: todo se lee del proveedor con los endpoints del contrato; ningún archivo del invocante',async()=>{
 const w=fakeWorld(),o=await observeQualification({sha:SHA,github:w.transport.github});
 assert.equal(o.masterRef.object.sha,SHA);assert.equal(Object.keys(o.artifactZips).length,4);assert.deepEqual(Object.keys(o.contents).length,5);
 assert.ok(w.calls.every(c=>c.startsWith('github.')));assert.equal(w.calls.filter(c=>c==='github.bytes').length,4);
 await assert.rejects(()=>observeQualification({sha:'x',github:w.transport.github}),e=>e.code==='SHA_FORMAT');
});
test('stage: sin calificación fresca no hay ninguna lectura ni mutación Vercel',async()=>{
 const obs=observation();obs.jobsPagesByRun[100][0].jobs[1].conclusion='failure';
 const w=fakeWorld({obs}),dir=packet(),r=await stageWith(w,dir);
 assert.equal(r.state,'NOT_QUALIFIED_NO_MUTATION');assert.equal(r.mutationRequested,false);
 assert.ok(w.calls.every(c=>c.startsWith('github.')));assert.equal(fs.existsSync(path.join(dir,'STAGE_REQUEST.json')),false);
});
test('stage: titular de producción distinto o cabeza movida justo antes de crear -> sin crear',async()=>{
 const moved=fakeWorld();moved.state.holder['www.municontrol.com']='dpl_someoneelse';
 assert.equal((await stageWith(moved)).state,'PRODUCTION_HOLDER_MISMATCH_NO_MUTATION');assert.deepEqual(mutations(moved.calls),[]);
 const head=fakeWorld({head:n=>n===0?SHA:OTHER});
 assert.equal((await stageWith(head)).state,'HEAD_MOVED_NO_MUTATION');assert.deepEqual(mutations(head.calls),[]);
});
test('stage: crea una vez, sin dominios, con atestación + build:vercel; nunca promueve; paquete de uso único',async()=>{
 const w=fakeWorld(),dir=packet(),r=await stageWith(w,dir);
 assert.equal(r.state,'STAGE_VERIFIED_AWAITING_ROOT_BUILD_BINDING');assert.deepEqual(mutations(w.calls),['vercel.create']);
 const request=read(dir,'STAGE_REQUEST.json');
 assert.deepEqual(request,{name:C.vercel.projectName,project:C.vercel.projectId,target:'production',gitSource:{type:'github',repoId:C.repository.id,ref:SHA,sha:SHA},
  buildCommand:'node scripts/verify-vercel-build-db-attestation.mjs --source-sha '+SHA+' && npm run build:vercel',autoAssignCustomDomains:false});
 assert.equal(read(dir,'STAGE_VERIFIED.json').previousProductionDeploymentId,PREVIOUS);
 assert.ok(C.vercel.productionDomains.every(d=>w.state.holder[d]===PREVIOUS),'stage never moves a domain');
 await assert.rejects(()=>stageWith(w,dir),/EEXIST/);assert.equal(w.calls.filter(c=>c==='vercel.create').length,1);
});
test('stage: creación ambigua detiene sin reintento; lectura fallida antes de mutar no es incierta',async()=>{
 const w=fakeWorld();w.transport.vercel.createDeployment=async()=>{w.calls.push('vercel.create');return{exitCode:0,text:'<html>'};};
 const dir=packet();await assert.rejects(()=>stageWith(w,dir),e=>e.code==='TRANSPORT_AMBIGUOUS:create');
 assert.equal(read(dir,'STAGE_RESULT.json').state,'UNCERTAIN_STOP');assert.equal(w.calls.filter(c=>c==='vercel.create').length,1);
 assert.equal(w.calls.slice(w.calls.indexOf('vercel.create')+1).length,0,'no call after the ambiguous mutation');
 const g=fakeWorld();g.transport.github.pages=async()=>({exitCode:1,text:''});const dir2=packet();
 await assert.rejects(()=>stageWith(g,dir2),e=>e.code==='TRANSPORT_AMBIGUOUS:github-runs');
 assert.equal(read(dir2,'STAGE_RESULT.json').state,'STOPPED_BEFORE_MUTATION');assert.deepEqual(mutations(g.calls),[]);
});
test('stage: ERROR, o READY con release-info de otro SHA, no deja stage verificado',async()=>{
 const failed=fakeWorld();const get=failed.transport.vercel.getDeployment;
 failed.transport.vercel.getDeployment=async id=>{const a=await get(id);if(id!==STAGED)return a;const d=JSON.parse(a.text);d.readyState='ERROR';return{exitCode:0,text:JSON.stringify(d)};};
 const d1=packet();assert.equal((await stageWith(failed,d1)).state,'STAGE_NOT_READY_NO_PROMOTION');assert.equal(fs.existsSync(path.join(d1,'STAGE_VERIFIED.json')),false);
 const other=fakeWorld({stageRelease:releaseInfo(OTHER)}),d2=packet();
 assert.equal((await stageWith(other,d2)).state,'STAGE_REJECTED_NO_PROMOTION');assert.equal(fs.existsSync(path.join(d2,'STAGE_VERIFIED.json')),false);
});
test('promote: sin stage verificado, cabeza movida, binding ajeno o titular movido por otro ejecutor -> sin promoción',async()=>{
 const none=fakeWorld();
 await assert.rejects(()=>promoteWith(none,packet()),e=>e.code==='PACKET_MISSING:STAGE_VERIFIED.json');assert.deepEqual(none.calls,[]);
 const head=fakeWorld();const d1=await staged(head);head.state.headReads=0;
 const headFn=head.transport.github.get;head.transport.github.get=async e=>e===C.github.masterRef?{exitCode:0,text:JSON.stringify({object:{sha:OTHER,type:'commit'}})}:headFn(e);
 assert.equal((await promoteWith(head,d1)).state,'NOT_QUALIFIED_NO_MUTATION');assert.deepEqual(mutations(head.calls),[]);
 const foreign=fakeWorld(),d2=await staged(foreign);
 assert.equal((await promoteWith(foreign,d2,{binding:binding({deploymentId:'dpl_other'})})).state,'BUILD_BINDING_REJECTED_NO_MUTATION');assert.deepEqual(mutations(foreign.calls),[]);
 const moved=fakeWorld(),d3=await staged(moved);moved.state.holder['municontrol.com']='dpl_someoneelse';
 assert.equal((await promoteWith(moved,d3)).state,'PRODUCTION_HOLDER_MOVED_NO_MUTATION');assert.deepEqual(mutations(moved.calls),[]);
 const late=fakeWorld({head:n=>n<3?SHA:OTHER}),d4=packet();assert.equal((await stageWith(late,d4)).state,'STAGE_VERIFIED_AWAITING_ROOT_BUILD_BINDING');late.calls.length=0;
 assert.equal((await promoteWith(late,d4)).state,'HEAD_MOVED_NO_MUTATION','the last head read is immediately before the mutation');assert.deepEqual(mutations(late.calls),[]);
});
test('stage: identidad no legible del despliegue (p.ej. protección) no promueve ni queda incierta',async()=>{
 const w=fakeWorld();const rr=w.transport.readRelease;w.transport.readRelease=async h=>h==='staged1.vercel.app'?{exitCode:401,text:''}:rr(h);
 const dir=packet(),r=await stageWith(w,dir);assert.equal(r.state,'STAGE_RELEASE_UNVERIFIABLE_NO_PROMOTION');assert.equal(fs.existsSync(path.join(dir,'STAGE_VERIFIED.json')),false);
});
test('promote: observación de creación del paquete alterada -> sin mutación',async()=>{
 const w=fakeWorld(),dir=await staged(w),file=path.join(dir,'STAGE_CREATE_OBSERVATION.json');
 fs.writeFileSync(file,JSON.stringify({...read(dir,'STAGE_CREATE_OBSERVATION.json'),effectiveBuildCommand:'npm run build:vercel'}));
 assert.equal((await promoteWith(w,dir)).state,'STAGE_PACKET_INVALID_NO_MUTATION');assert.deepEqual(w.calls,[]);
});
test('promote: el adaptador tiene UNA sola llamada al proveedor; la segunda se rechaza y la primera queda registrada',async()=>{
 const w=fakeWorld(),dir=await staged(w);
 const adapter={promoteOnce:async a=>{await a.vercel(['example','first']);await w.adapter.promoteOnce(a);await a.vercel(['example','second']);return{exitCode:0};}};
 await assert.rejects(()=>promoteWith(w,dir,{adapter}),e=>e.code==='TRANSPORT_AMBIGUOUS:promote');
 assert.equal(w.calls.filter(c=>c==='vercel.run').length,1);assert.deepEqual(read(dir,'PROMOTION_ADAPTER_CALL.json').args,['example','first']);
 assert.equal(read(dir,'PROMOTION_RESULT.json').state,'UNCERTAIN_STOP');
});
test('promote: sin adaptador de root verifica todo, deja constancia y no muta',async()=>{
 const w=fakeWorld(),dir=await staged(w),r=await promoteWith(w,dir,{adapter:null});
 assert.equal(r.state,'PROMOTION_ADAPTER_REQUIRED_NO_MUTATION');assert.deepEqual(mutations(w.calls),[]);
 assert.equal(read(dir,'PROMOTION_PRECONDITIONS_VERIFIED.json').deploymentId,STAGED);assert.equal(fs.existsSync(path.join(dir,'PROMOTION_REQUESTED.json')),false);
});
test('promote: una sola llamada al adaptador, lectura posterior acotada hasta coincidir, paquete de uso único',async()=>{
 const w=fakeWorld({promoteDomains:['municontrol.com','www.municontrol.com']}),dir=await staged(w),r=await promoteWith(w,dir);
 assert.equal(r.state,'PROMOTED_AND_READ_BACK');assert.equal(r.promotedAndReadBack,true);assert.deepEqual(mutations(w.calls),['adapter.promote']);
 assert.equal(w.calls.filter(c=>c==='pause').length,1,'one convergence wait, then exact match');
 assert.equal(read(dir,'PROMOTION_REQUESTED.json').deploymentId,STAGED);
 await assert.rejects(()=>promoteWith(w,dir),/EEXIST/);assert.equal(w.calls.filter(c=>c==='adapter.promote').length,1);
});
test('promote: respuesta ambigua del adaptador detiene sin reenviar ni leer; readback manual lo resuelve sólo leyendo',async()=>{
 for(const promoteOnce of [async()=>({exitCode:1}),async()=>{throw new Error('socket hang up');},async()=>undefined]){
  // The provider DID move the domains, but the answer is ambiguous: the runner must not trust or repeat it.
  const w=fakeWorld(),dir=await staged(w),adapter={promoteOnce:async a=>{await w.adapter.promoteOnce(a);return promoteOnce();}};
  await assert.rejects(()=>promoteWith(w,dir,{adapter}),e=>e.code==='TRANSPORT_AMBIGUOUS:promote');
  assert.equal(read(dir,'PROMOTION_RESULT.json').state,'UNCERTAIN_STOP');assert.equal(w.calls.filter(c=>c==='adapter.promote').length,1);
  assert.equal(w.calls.slice(w.calls.lastIndexOf('adapter.promote')+1).filter(c=>c!=='adapter.promote').length,0,'no read or call after the ambiguous mutation');
  w.calls.length=0;const manual=await runReleaseReadback({sha:SHA,packet:dir,admission:admission(),transport:w.transport,pause:w.pause});
  assert.equal(manual.state,'PROMOTED_AND_READ_BACK');assert.deepEqual(mutations(w.calls),[]);
 }
});
test('promote: lectura que nunca coincide queda incierta con exactamente una promoción',async()=>{
 const w=fakeWorld(),dir=await staged(w);
 const adapter={promoteOnce:async()=>{w.calls.push('adapter.promote');return{exitCode:0};}};
 const r=await promoteWith(w,dir,{adapter,maxReadbackReads:3});
 assert.equal(r.state,'PROMOTION_READBACK_MISMATCH_UNCERTAIN');assert.equal(r.promotedAndReadBack,false);
 assert.equal(w.calls.filter(c=>c==='adapter.promote').length,1);assert.equal(w.calls.filter(c=>c==='pause').length,2);
});
test('readback: estrictamente de sólo lectura y exige el stage admitido',async()=>{
 const w=fakeWorld(),dir=await staged(w),r=await runReleaseReadback({sha:SHA,packet:dir,admission:admission(),transport:w.transport,pause:w.pause});
 assert.equal(r.state,'NOT_PROMOTED_OR_MISMATCH');assert.equal(r.readOnly,true);assert.deepEqual(mutations(w.calls),[]);
 await assert.rejects(()=>runReleaseReadback({sha:SHA,packet:dir,admission:admission({previousProductionDeploymentId:'dpl_other'}),transport:w.transport}),e=>e.code==='STAGE_PACKET_INVALID');
});
test('entradas: SHA, admisión y forma de transporte se validan antes de escribir nada',async()=>{
 const w=fakeWorld(),dir=packet();
 await assert.rejects(()=>stageWith(w,dir,{sha:'A'.repeat(40)}),e=>e.code==='SHA_FORMAT');
 await assert.rejects(()=>stageWith(w,dir,{admission:admission({sourceSha:OTHER})}),e=>e.code==='ADMISSION_INVALID');
 await assert.rejects(()=>stageWith(w,dir,{transport:{...w.transport,vercel:{}}}),e=>e.code==='TRANSPORT_SHAPE');
 assert.deepEqual(fs.readdirSync(dir),[]);assert.deepEqual(w.calls,[]);
});
