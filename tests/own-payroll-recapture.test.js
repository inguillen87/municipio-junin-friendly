import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ownRecaptureSource,ownRecaptureContext,ownRecaptureEvents,ownRecapturePreparation,readOwnRecapture,ownRecaptureMatchesCommand} from '../assets/own-payroll-recapture-model.js';
import {OWN_RUN_PREPARE} from '../assets/own-payroll-run-workspace-model.js';
import {ownRunCommand} from '../assets/own-payroll-run-model.js';
import {ownRunHash} from '../lib/internal-own-payroll-run.js';
import {annulDetail,annulReceipt,afterAnnul} from './fixtures/own-payroll-annulment-synthetic.js';
import {uid,hash} from './fixtures/own-payroll-program-synthetic.js';

function fixture(){const before=annulDetail(6),receipt=annulReceipt(before),detail=afterAnnul(before,receipt).runs[0],source=ownRecaptureEvents(detail)[0].source;return {before,receipt,detail,source};}
const receiver=(key='current-calculator')=>({key,caps:new Set(OWN_RUN_PREPARE)});

test('el módulo de recaptura importado por ambos paneles está incluido en el paquete estático',()=>{
 const build=fs.readFileSync(new URL('../scripts/build-friendly.mjs',import.meta.url),'utf8');
 assert.equal(build.match(/'assets\/own-payroll-recapture-model\.js'/g)?.length,1);
 for(const name of ['own-payroll-run-panel.js','own-payroll-liquidation-panel.js'])assert.match(fs.readFileSync(new URL('../assets/'+name,import.meta.url),'utf8'),/from '\.\/own-payroll-recapture-model\.js'/);
});

test('el receptor recupera todos los contratos del evento ajeno sin ampliar a toda la corrida o al grupo consolidado',async()=>{
 const {detail,source,receipt}=fixture(),original=structuredClone(detail),order=[];
 const preparation=await readOwnRecapture(source,{reauthorize:async()=>{order.push('current-access');return receiver();},readDetail:async id=>{assert.equal(id,detail.id);order.push('authorized-detail');return detail;}});
 const expected=receipt.receipts.find(event=>event.id===source.eventId).affected.map(employee=>employee.contractId).sort();
 assert.deepEqual(preparation.selection,{kind:'contracts',values:expected});assert.equal(expected.length,3);assert.equal(detail.employees.length,6);assert.equal(receipt.affected.length,6);
 assert.equal(preparation.period,'2026-10');assert.equal(preparation.liquidationType,'monthly');assert.equal(preparation.liquidationDate,'2026-10-31');assert.deepEqual(order,['current-access','authorized-detail','current-access']);
 assert.deepEqual(detail,original);assert.ok(Object.isFrozen(preparation.selection.values));assert.ok(Object.isFrozen(preparation.source));
});

test('el contexto cerrado no transporta autorizaciones, personas, motivos ni claves del actor anterior',()=>{
 const {source}=fixture(),input={kind:'annulled-event',source:{...source}},context=ownRecaptureContext(input);
 input.source.eventId=uid(991);assert.notEqual(context.source.eventId,input.source.eventId);assert.ok(Object.isFrozen(context));assert.ok(Object.isFrozen(context.source));
 assert.deepEqual(Object.keys(context),['kind','source']);assert.deepEqual(Object.keys(context.source),['version','runId','eventId','resultSha256','employeeCount']);
 for(const field of ['accessKey','capabilities','actorEmail','reason','employees','selection','key'])assert.throws(()=>ownRecaptureContext({...context,[field]:'not-carried'}));
 for(const patch of [{eventId:'not-uuid'},{resultSha256:hash('f').toUpperCase()},{employeeCount:0},{employeeCount:'3'},{employeeCount:10001},{version:'legacy'},{employeeNumber:'synthetic'}])assert.throws(()=>ownRecaptureSource({...source,...patch}));
 let reads=0;const accessor={...source};Object.defineProperty(accessor,'eventId',{enumerable:true,get(){reads++;return source.eventId;}});assert.throws(()=>ownRecaptureSource(accessor));assert.equal(reads,0);
});

test('otra corrida, otro resultado, evento inexistente o cambio del alcance invalidan la referencia completa',()=>{
 const {detail,source}=fixture();
 for(const patch of [{runId:uid(991)},{eventId:uid(601)},{eventId:uid(500)},{resultSha256:hash('f')},{employeeCount:2}])assert.throws(()=>ownRecapturePreparation(detail,{...source,...patch}));
 const changed=structuredClone(detail);changed.employees.find(employee=>employee.state==='annulled').events.at(-1).id=uid(992);
 assert.throws(()=>ownRecapturePreparation(changed,source));
 for(const mutate of [employee=>employee.version++,employee=>employee.state='confirmed',employee=>employee.events.at(-1).liquidationVersion++]){const next=structuredClone(detail);mutate(next.employees.find(employee=>employee.state==='annulled'));assert.throws(()=>ownRecapturePreparation(next,source));}
});

test('otra liquidación vigente bloquea todo el evento; nunca se recorta a los contratos libres',()=>{
 const {detail,source}=fixture();detail.employees.find(employee=>employee.state==='annulled').blockedBy=uid(990);
 const event=ownRecaptureEvents(detail)[0];assert.equal(event.available,false);assert.equal(event.count,3);assert.throws(()=>ownRecapturePreparation(detail,source),/alcance parcial/);
});

test('un actor sin permiso no consulta; pérdida de permiso o cambio de cuenta tras la lectura no entregan preparación',async()=>{
 const {detail,source}=fixture();let reads=0;
 const noPrepare={key:'reader',caps:new Set(OWN_RUN_PREPARE.filter(cap=>cap!=='payroll.calculation.prepare'))};
 await assert.rejects(()=>readOwnRecapture(source,{reauthorize:async()=>noPrepare,readDetail:async()=>{reads++;return detail;}}),error=>error.status===403);assert.equal(reads,0);
 for(const after of [noPrepare,receiver('other-account')]){let checks=0;await assert.rejects(()=>readOwnRecapture(source,{reauthorize:async()=>++checks===1?receiver():after,readDetail:async()=>detail}),error=>error.status===403);assert.equal(checks,2);}
 await assert.rejects(()=>readOwnRecapture(source,{reauthorize:async()=>receiver(),readDetail:async()=>{throw Object.assign(Error('Synthetic API denies this run'),{status:403});}}),error=>error.status===403);
});

test('una lectura tardía o una captura cuyo hash no se verifica no entrega contexto para calcular',async()=>{
 const {detail,source}=fixture();let visible=true;
 await assert.rejects(()=>readOwnRecapture(source,{reauthorize:async()=>receiver(),readDetail:async()=>{visible=false;return detail;},valid:()=>visible}),error=>error.name==='AbortError');
 const changed=structuredClone(detail);changed.capture.bodySha256=hash('f');
 await assert.rejects(()=>readOwnRecapture(source,{reauthorize:async()=>receiver(),readDetail:async()=>changed}));
});

test('la recaptura conserva período, fecha, tipo, ámbito del receptor y contratos exactos; el programa se consulta de nuevo',()=>{
 const {detail,source}=fixture(),preparation=ownRecapturePreparation(detail,source),body=ownRunCommand({...detail.capture.body,selection:preparation.selection,programVersion:hash('d')});
 assert.equal(ownRecaptureMatchesCommand(preparation,body),body);
 for(const patch of [{period:'2026-11'},{liquidationType:'sac'},{liquidationDate:'2026-10-30'},{scopeVersion:hash('e')},{selection:{kind:'all',values:[]}},{selection:{kind:'contracts',values:preparation.selection.values.slice(0,1)}}])assert.throws(()=>ownRecaptureMatchesCommand(preparation,{...body,...patch}));
});

test('una fecha histórica ausente permanece ausente hasta que el receptor la declara explícitamente',()=>{
 const {detail}=fixture();detail.capture.version='own-payroll-run.v1';delete detail.capture.body.version;delete detail.capture.body.liquidationDate;detail.capture.bodySha256=ownRunHash(detail.capture.body);
 const source=ownRecaptureEvents(detail)[0].source,preparation=ownRecapturePreparation(detail,source);assert.equal(preparation.liquidationDate,null);
 const body={...detail.capture.body,selection:preparation.selection};assert.throws(()=>ownRecaptureMatchesCommand(preparation,body));
 assert.doesNotThrow(()=>ownRecaptureMatchesCommand(preparation,{...body,version:'own-payroll-run-command.v2',liquidationDate:'2026-10-31'}));
});
