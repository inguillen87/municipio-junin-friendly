import test from 'node:test';
import assert from 'node:assert/strict';
import {createOwnImputationHandler} from '../api/internal-own-payroll-imputation.js';
import {createOwnJournalHandler} from '../api/internal-own-payroll-journal.js';
import {createOwnReconciliationHandler} from '../api/internal-own-payroll-reconciliation.js';
import {OWN_RUN_NOMINAL} from '../assets/own-payroll-run-workspace-model.js';
import {IMPUTATION_READ} from '../assets/own-payroll-imputation-workspace-model.js';
import {JOURNAL_READ} from '../assets/own-payroll-journal-model.js';
import {RECONCILIATION_READ} from '../assets/own-payroll-reconciliation-model.js';
import {imputationWorkspaceFixture} from './fixtures/own-payroll-imputation-synthetic.js';
import {approvedReconciliationFixture} from './fixtures/own-payroll-reconciliation-synthetic.js';

const uid=n=>`cccccccc-0000-4000-8000-${String(n).padStart(12,'0')}`;
const session={email:'preparation@example.invalid',id:uid(3),version:1,releaseSha:'d'.repeat(40)};
const principal=caps=>({user:{email:session.email},tenant:{source:'membership',id:uid(1),membershipId:uid(2),effectiveCapabilities:caps}});
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(v){this.statusCode=v;return this;},json(v){this.value=v;return this;}});
const tools=[
  ['imputación',createOwnImputationHandler,IMPUTATION_READ],
  ['asientos',createOwnJournalHandler,JOURNAL_READ],
  ['conciliación',createOwnReconciliationHandler,RECONCILIATION_READ]
];
async function bootstrap(name){
  if(name==='imputación')return(await imputationWorkspaceFixture(2)).boot;
  if(name==='conciliación')return(await approvedReconciliationFixture(2)).boot;
  return {version:'own-payroll-journal.v1',scopeVersion:'a'.repeat(64),period:'2026-10',liquidationType:'monthly',imputations:[],journals:[],permissions:{canPropose:true,canPost:false},complete:true,paymentExecuted:false};
}
for(const[name,create,read]of tools){
  test(name+': consultar no exige confirmar liquidaciones',()=>{
    assert.deepEqual([...read],[...OWN_RUN_NOMINAL]);
    assert.ok(!read.includes('payroll.calculation.approve'));
  });
  for(const mode of ['preparación','revisión','consulta'])test(name+': perfil de '+mode+' consulta sin recibir permisos adicionales',async()=>{
    const extra=mode==='preparación'?['payroll.parameter.prepare']:mode==='revisión'?['payroll.parameter.approve']:[];
    const caps=[...OWN_RUN_NOMINAL,...extra],boot=await bootstrap(name);
    boot.permissions.canPropose=mode==='preparación';
    boot.permissions[Object.hasOwn(boot.permissions,'canPost')?'canPost':'canReview']=mode==='revisión';
    let connected=0,options;
    const handler=create({requireAccess:async(_req,_res,opts)=>{options=opts;return{mode:'managed',principal:principal(caps)};},sessionFor:()=>session,getSql:async()=>{connected++;return{query:async()=>[{result:boot}]};}});
    const query={resource:'bootstrap',period:'2026-10',liquidationType:'monthly'},res=response();
    await handler({method:'GET',url:'/api/internal-test?'+new URLSearchParams(query),query,headers:{}},res);
    assert.equal(res.statusCode,200);
    assert.equal(connected,1);
    assert.deepEqual(options.requiredCapabilities,OWN_RUN_NOMINAL);
    assert.equal(options.allowLegacy,false);
    assert.deepEqual(caps,[...OWN_RUN_NOMINAL,...extra]);
    assert.equal(res.value.data.permissions.canPropose,mode==='preparación');
  });
  for(const missing of OWN_RUN_NOMINAL)test(name+': retirar '+missing+' bloquea antes de conectar SQL',async()=>{
    let connected=0;
    const handler=create({requireAccess:async()=>({mode:'managed',principal:principal(OWN_RUN_NOMINAL.filter(c=>c!==missing))}),sessionFor:()=>session,getSql:async()=>{connected++;throw Error('No debería conectar');}}),res=response();
    const query={resource:'bootstrap',period:'2026-10',liquidationType:'monthly'};
    await handler({method:'GET',url:'/api/internal-test?'+new URLSearchParams(query),query,headers:{}},res);
    assert.equal(res.statusCode,403);assert.equal(connected,0);
  });
}
