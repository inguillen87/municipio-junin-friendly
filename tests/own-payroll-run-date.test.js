import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {ownRunDate,ownRunPeriodEnd,ownRunDateLabel} from '../assets/own-payroll-run-date.js';
import {ownRunCommand,ownRunCapture,ownRunBootstrap,OWN_RUN_COMMAND_VERSION} from '../assets/own-payroll-run-model.js';
import {ownRunHash,ownRunOperation,RUN_CALCULATE} from '../lib/internal-own-payroll-run.js';
import {ownRunWorkspaceAttempt,verifiedWorkspaceCapture,ownRunWorkspaceCsv} from '../assets/own-payroll-run-workspace-model.js';
import {capture,saved,runCommand} from './fixtures/own-payroll-run-synthetic.js';
import {uid,hash} from './fixtures/own-payroll-program-synthetic.js';
import {buildOwnRunDateInstallation,declaredDateCapture} from '../scripts/lib/own-payroll-run-date-installation.mjs';
import {createOwnRunHandler} from '../api/internal-own-payroll-run.js';
const dated=()=>{const c=capture();c.version='own-payroll-run.v2';c.body={...c.body,version:OWN_RUN_COMMAND_VERSION,liquidationDate:'2026-10-31'};c.bodySha256=ownRunHash(c.body);return c;};
const principal={user:{email:'qa@example.invalid'},tenant:{source:'membership',id:uid(1),membershipId:uid(2),effectiveCapabilities:RUN_CALCULATE}},session={email:'qa@example.invalid',id:uid(3),version:1,releaseSha:'d'.repeat(40)};
test('fecha civil exacta valida años bisiestos y rechaza normalizaciones, timestamps y valores ausentes',()=>{
 for(const v of ['2024-02-29','1900-01-01','2099-12-31','2026-10-31'])assert.equal(ownRunDate(v),true);
 for(const v of [null,undefined,20261031,'','2026-02-29','1900-02-29','2026-04-31','2026-00-01','2026-13-01','2026-10-00','2026-10-32','2026-1-1',' 2026-10-31','2026-10-31T00:00:00Z','2100-01-01'])assert.equal(ownRunDate(v),false,String(v));
 assert.equal(ownRunPeriodEnd('2024-02'),'2024-02-29');assert.equal(ownRunPeriodEnd('2026-02'),'2026-02-28');assert.equal(ownRunPeriodEnd('2026-12'),'2026-12-31');assert.throws(()=>ownRunPeriodEnd('2026-13'));assert.equal(ownRunDateLabel(null),'Fecha no declarada en esta corrida');
});
test('v2 requiere fecha y campos exactos; v1 conserva cuerpo original y no adquiere datos',()=>{
 const old=runCommand(),before=structuredClone(old);assert.deepEqual(ownRunCommand(old),before);assert.equal(Object.hasOwn(ownRunCommand(old),'liquidationDate'),false);
 const c=dated();assert.deepEqual(ownRunCommand(c.body),c.body);
 for(const patch of [{liquidationDate:null},{liquidationDate:'2026-02-29'},{liquidationDate:'2026-10-31T00:00:00Z'},{version:'own-payroll-run-command.v3'},{paymentDate:'2026-10-31'}])assert.throws(()=>ownRunCommand({...c.body,...patch}));
 const missing={...c.body};delete missing.liquidationDate;assert.throws(()=>ownRunCommand(missing));assert.throws(()=>ownRunCommand({...old,liquidationDate:'2026-10-31'}));assert.deepEqual(old,before);
});
test('fecha es parte de la huella del intento; cambiarla nunca sustituye un envío pendiente',async()=>{
 const c=dated(),attempt=ownRunWorkspaceAttempt(c.key,c.body,'original-account');assert.ok(Object.isFrozen(attempt.body));await verifiedWorkspaceCapture(c,attempt);
 const changed=structuredClone(c);changed.body.liquidationDate='2026-10-30';assert.notEqual(ownRunHash(changed.body),c.bodySha256);await assert.rejects(verifiedWorkspaceCapture(changed),/integridad/);
 changed.bodySha256=ownRunHash(changed.body);await assert.rejects(verifiedWorkspaceCapture(changed,attempt));assert.deepEqual(attempt.body,c.body);
 for(const version of ['own-payroll-run.v1','own-payroll-run.v3'])assert.throws(()=>ownRunCapture({...c,version}));
});
test('fecha declarada no cambia entrada, reglas, precisión ni resultado monetario',async()=>{
 const old=capture(),c=dated();old.saved=saved(old);c.saved=saved(c);assert.deepEqual(c.saved,old.saved);
 await verifiedWorkspaceCapture(old);await verifiedWorkspaceCapture(c);const csv=ownRunWorkspaceCsv(c);assert.match(csv,/Fecha declarada de liquidacion/);assert.equal(csv.split('2026-10-31').length-1,c.saved.result.rowCount);assert.match(ownRunWorkspaceCsv(old),/Fecha no declarada en esta corrida/);
 let calls=0;const received=await ownRunOperation({query:async()=>[{result:++calls===1?dated():saved(c)}]},principal,session,'calculate',{key:c.key,body:c.body},{algorithmHash:()=>hash('c')});assert.equal(calls,2);assert.deepEqual(received.saved,old.saved);
});
test('recuperación v1 pendiente y v2 guardada no recalculan ni agregan fechas históricas',async()=>{
 for(const c of [capture(),dated()]){if(c.version.endsWith('v2'))c.saved=saved(c);let calls=0;const result=await ownRunOperation({query:async()=>{calls++;return [{result:c}];}},principal,session,'attempt',{key:c.key});assert.equal(calls,1);assert.deepEqual(result,c);}
});
test('bootstrap v2 admite historia sin fecha y fecha exacta sin datos nominales; v1 permanece cerrado',()=>{
 const r={id:uid(90),key:uid(9),period:'2026-10',liquidationType:'monthly',selectionKind:'all',selectionValueCount:0,createdAt:'2026-10-09T00:00:00Z',state:'captured',inputSha256:null,resultSha256:null};
 const old={version:'own-payroll-bootstrap.v1',scopeVersion:hash('a'),programVersion:hash('b'),canCalculate:false,complete:true,runs:[r]};ownRunBootstrap(old);
 for(const liquidationDate of [null,'2026-10-31'])ownRunBootstrap({...old,version:'own-payroll-bootstrap.v2',runs:[{...r,liquidationDate}]});
 for(const liquidationDate of [undefined,'2026-02-29','2026-10-31T00:00:00Z',0])assert.throws(()=>ownRunBootstrap({...old,version:'own-payroll-bootstrap.v2',runs:[{...r,liquidationDate}]}));
 assert.throws(()=>ownRunBootstrap({...old,runs:[{...r,liquidationDate:null}]}));
});
test('API negocia v2 expresamente y rechaza query/version/fecha ambiguas antes de ejecutar SQL',async()=>{
 let calls=0;const data={version:'own-payroll-bootstrap.v2',scopeVersion:hash('a'),programVersion:hash('b'),canCalculate:false,complete:true,runs:[]};
 const handler=createOwnRunHandler({env:{INTERNAL_APP_ORIGIN:'https://municipio.example'},requireAccess:async()=>({mode:'managed',principal}),sessionFor:()=>session,getSql:async()=>({query:async(q)=>{calls++;assert.match(q,/own_run_bootstrap_v2/);return [{result:data}];}})});
 const response=()=>({setHeader(){},status(n){this.code=n;return this;},json(v){this.data=v;}});
 const res=response();await handler({method:'GET',query:{resource:'bootstrap',contractVersion:'2'},url:'/api/internal-own-payroll-run?resource=bootstrap&contractVersion=2'},res);assert.equal(res.code,200);assert.equal(calls,1);
 for(const contractVersion of ['1','3','2&contractVersion=2']){const r=response();await handler({method:'GET',query:{resource:'bootstrap',contractVersion},url:'/api/internal-own-payroll-run?'+new URLSearchParams({resource:'bootstrap',contractVersion})},r);assert.equal(r.code,400);}assert.equal(calls,1);
 for(const liquidationDate of [null,'2026-02-29','2026-10-31T00:00:00Z']){const r=response();await handler({method:'POST',url:'/api/internal-own-payroll-run',query:{},headers:{origin:'https://municipio.example','content-type':'application/json','idempotency-key':uid(9)},body:JSON.stringify({operation:'calculate',payload:{...dated().body,liquidationDate}})},r);assert.equal(r.code,422);}assert.equal(calls,1);
});
test('lote conserva firmas/ACL y bootstrap v1; actualiza solo tres cuerpos sin tablas ni operaciones municipales',()=>{
 const b=buildOwnRunDateInstallation({sourceCommit:'a'.repeat(40),read:p=>fs.readFileSync(p,'utf8')});assert.equal(b.beforePins[0].sha256,'a976665ba063f2cf1657ad2f766a8c3fe9562a4ff45600ccf957962eab091aab');assert.equal(b.newPin.runtime,true);
 for(let i=0;i<3;i++)assert.deepEqual({...b.beforePins[i],sha256:null},{...b.afterPins[i],sha256:null});assert.ok(b.installation.join('\n').includes('RUN_DATE_PRIOR_STATE_CHANGED'));assert.ok(b.durableVerification.join('\n').includes(b.bootstrapPin.sha256));
 for(const fragment of ['own_close_capture_guard_v1','payroll_fixed_registry_range_v2','jurisdictions','employment_adoption_application'])assert.equal(b.migration[0].split(fragment).length,b.beforeDefinitions[0].split(fragment).length);
 assert.throws(()=>declaredDateCapture('unreviewed SQL'),/RUN_DATE_SOURCE_CHANGED/);assert.doesNotMatch(b.migration.slice(2,5).join('\n'),/\b(?:INSERT|UPDATE|DELETE|ALTER TABLE|CREATE TABLE)\b/);
});
