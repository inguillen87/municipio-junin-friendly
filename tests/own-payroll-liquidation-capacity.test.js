import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedSources} from './fixtures/own-payroll-approved-synthetic.js';
import {capture,saved} from './fixtures/own-payroll-run-synthetic.js';
import {rule,lit} from './fixtures/own-payroll-synthetic.js';
import {uid,hash} from './fixtures/own-payroll-program-synthetic.js';
import {ownProgramStructure} from '../assets/own-payroll-program-model.js';
import {ownLiquidationDetail,verifiedOwnLiquidationDetail,OWN_LIQ_REVIEW} from '../assets/own-payroll-liquidation-model.js';
import {OWN_RUN_MAX_RESPONSE} from '../assets/own-payroll-run-model.js';
import {OWN_RUN_FULL_MAX_BYTES} from '../assets/own-payroll-response.js';
import {ownRunHash,verifyOwnRunReceipt,runError} from '../lib/internal-own-payroll-run.js';
import {ownLiquidationOperation,liquidationError} from '../lib/internal-own-payroll-liquidation.js';
import {createOwnLiquidationHandler} from '../api/internal-own-payroll-liquidation.js';

// Invented capacity inputs only. The SQL callback does not execute PostgreSQL.
function largeDetail(){
 const source=approvedSources(855);
 const rules=Array.from({length:20},(_,n)=>rule(String(100+n),lit('1.00','money'),{
  ruleReference:'Referencia exclusivamente sintetica de capacidad; sin norma ni importe municipal. '.padEnd(180,'x')
 }));
 source.programState.program.definition=ownProgramStructure({rules,bindings:[],totalsPrecision:2});
 source.programState.salaryCatalog.items=rules.map(r=>({active:true,agreementCode:r.agreementCode,categoryCode:null,
  code:r.code,dependencies:[],kind:'concept',label:'Concepto sintetico de capacidad',nature:r.nature,
  precision:2,ruleReference:r.ruleReference,unit:'money',validFrom:r.validFrom,validUntil:null,value:null}));
 source.monthly.batches=[];
 const c=capture();c.payload={...source,sourceInventory:{populationDomain:'native_registered'}};
 c.payloadSha256=ownRunHash(c.payload);c.saved=saved(c);
 return {version:'own-liquidation-detail.v1',id:c.id,scopeVersion:hash('a'),stateVersion:hash('b'),
  reviewAccessRequired:true,capture:c,employees:c.saved.result.employeeTotals.map(e=>({contractId:e.contractId,
  state:'calculated',version:0,liquidationVersion:null,blockedBy:null,allowedCommands:['confirm'],events:[]})),
  effects:{paymentExecuted:false,accountingPosted:false,periodClosed:false}};
}

test('una captura grande válida explica el límite de revisión sin fingir indisponibilidad ni recortar',async()=>{
 const d=largeDetail(),c=d.capture,bytes=v=>Buffer.byteLength(JSON.stringify(v),'utf8');
 assert.equal(ownLiquidationDetail(d),d);
 assert.equal(await verifiedOwnLiquidationDetail(d),d);
 assert.equal(verifyOwnRunReceipt({...c,saved:null}).saved,null);
 assert.ok(bytes(c.payload)+bytes(c.body)+8192<OWN_RUN_MAX_RESPONSE);
 assert.ok(bytes({ok:true,data:c})>OWN_RUN_MAX_RESPONSE);
 assert.ok(bytes({ok:true,data:d})<OWN_RUN_FULL_MAX_BYTES);
 assert.equal(c.saved.result.employeeCount,855);assert.equal(c.saved.result.rowCount,17100);
 assert.throws(()=>verifyOwnRunReceipt(c),e=>e.code==='OWN_RUN_LIMIT'&&e.status===422);
 const before=ownRunHash(d),calls=[];
 const principal={user:{email:'capacity@example.invalid'},tenant:{source:'membership',id:uid(50),membershipId:uid(51),effectiveCapabilities:OWN_LIQ_REVIEW}};
 const session={email:'capacity@example.invalid',id:uid(52),version:1,releaseSha:'d'.repeat(40)};
 await assert.rejects(ownLiquidationOperation({query:async(q,values)=>{calls.push({q,values});return [{result:d}];}},principal,session,'detail',{id:d.id}),e=>{
  assert.equal(e.code,'OWN_LIQ_LIMIT');assert.equal(e.status,422);
  assert.match(e.message,/capacidad/);assert.doesNotMatch(e.message,/No se confirmó/);return true;
 });
 assert.equal(calls.length,1);assert.match(calls[0].q,/^SELECT public\.own_liquidation_detail_v1/);
 const response={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.value=v;return this;}};
 const handler=createOwnLiquidationHandler({env:{},requireAccess:async()=>({mode:'managed',principal}),sessionFor:()=>session,
  getSql:async()=>({query:async(q,values)=>{calls.push({q,values});return [{result:d}];}})});
 await handler({method:'GET',query:{resource:'detail',id:d.id},url:'/api/internal-own-payroll-liquidation?resource=detail&id='+d.id},response);
 assert.equal(response.statusCode,422);assert.equal(response.value.code,'OWN_LIQ_LIMIT');assert.equal(response.value.ok,false);
 assert.equal(Object.hasOwn(response.value,'data'),false);assert.match(response.headers['Cache-Control'],/no-store/);
 assert.equal(calls.length,2);assert.ok(calls.every(call=>call.q.startsWith('SELECT public.own_liquidation_detail_v1')));
 assert.equal(ownRunHash(d),before);assert.equal(d.capture.saved.result.rows.length,17100);
});

test('sólo el límite conocido de corrida se traduce a capacidad; el fallo privado sigue siendo indisponible',()=>{
 for(const error of [Error('OWN_RUN_LIMIT'),runError(Error('OWN_RUN_LIMIT'))]){
  const safe=liquidationError(error);assert.equal(safe.code,'OWN_LIQ_LIMIT');assert.equal(safe.status,422);
  assert.equal(safe.message,'El alcance completo supera la capacidad. No se recortaron ni dividieron filas.');
 }
 const safe=liquidationError(Error('private SQL fixture failure'));
 assert.equal(safe.code,'OWN_LIQ_UNAVAILABLE');assert.equal(safe.status,503);
 assert.doesNotMatch(safe.message,/private|SQL|fixture/);
});
