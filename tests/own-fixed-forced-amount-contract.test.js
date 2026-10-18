// Synthetic handler contracts only. SQL callbacks are mocks, not PG evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createOwnRunHandler} from '../api/internal-own-payroll-run.js';
import {createOwnProgramHandler} from '../api/internal-own-payroll-program.js';
import {municipalOwnerProgramError} from '../lib/internal-municipal-owner-program.js';
import {RUN_CALCULATE,ownRunHash,ownRunOperation,verifyOwnRunReceipt,ownRunAlgorithmHash,runError} from '../lib/internal-own-payroll-run.js';
import {fixedForcedExpressionSet,ownFixedForcedRuleKey} from '../assets/own-payroll-engine.js';
import {createOwnPayrollSnapshot} from '../lib/own-payroll-snapshot.js';
import {prepareOwnPayrollInput} from '../lib/own-payroll-approved-input.js';
import {approvedSources} from './fixtures/own-payroll-approved-synthetic.js';
import {capture,saved,runCommand} from './fixtures/own-payroll-run-synthetic.js';
import {fixedFixture,fixedApprovedRecord,fixedNativeSubject} from './fixtures/payroll-fixed-novelties-synthetic.js';
import {rule,fact,ref} from './fixtures/own-payroll-synthetic.js';
import {uid,hash,command} from './fixtures/own-payroll-program-synthetic.js';

const clone=value=>structuredClone(value),FEATURE='own-fixed-forced-amount.v1';
const principal={user:{email:'forced-qa@example.invalid'},tenant:{source:'membership',id:uid(1),membershipId:uid(2),effectiveCapabilities:RUN_CALCULATE}},
  session={email:'forced-qa@example.invalid',id:uid(3),version:1,releaseSha:'d'.repeat(40)};
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.value=v;return this;}});
const request=(method='POST')=>({method,url:'/api/internal-own-payroll-run'+(method==='GET'?'?resource=attempt&key='+uid(9):''),query:method==='GET'?{resource:'attempt',key:uid(9)}:{},headers:{origin:'https://municipio.example','content-type':'application/json','idempotency-key':uid(9)},body:JSON.stringify({operation:'calculate',payload:runCommand()})});

function fixture(amount='0'){
  const sources=approvedSources(1),person=sources.population.employees[0],
    target=rule('100',{op:'convert',value:fact('fixedUnits100','units'),unit:'money',factor:'12.50',conversionReference:'Conversión sintética QA; no tarifa municipal'}),
    rules=[target,rule('110',ref('100','exact'))],
    policy={ruleKey:ownFixedForcedRuleKey(target),sourceKind:'fixed_amount',sourceCode:'100',quantityPolicy:'reject',sourceSha256:hash('d'),ruleReference:'Política ficticia aprobada para prueba, sin norma municipal'};
  sources.programState.program.definition={namespaceVersion:'own-payroll-namespaces.v2',rules,bindings:[{agreementCode:'1',key:'fixedUnits100',unit:'units',sourceKind:'fixed_quantity',sourceCode:'100',onMissing:'error',combine:'single',ruleReference:'Cantidad fija QA; no inferir cantidad del importe'}],totalsPrecision:2,fixedForcedAmountsVersion:FEATURE,fixedForcedAmountsPolicy:{quantityLineage:{version:'own-quantity-lineage-review.v1',sourceSha256:hash('a'),sourceControlSha256:hash('b'),expressionSetSha256:ownRunHash(fixedForcedExpressionSet(rules,[policy])),complete:true},policies:[policy]}};
  sources.monthly={complete:true,batches:[]};
  const fixed=fixedFixture(),record=fixedApprovedRecord(1,{conceptSourceId:'100',quantityDecimal:null,amountCents:amount,forced:true,forcedReason:'Importe sintético con aprobación QA',validFrom:'2026-10-01',validTo:'2026-10-31'});
  record.subject={...fixedNativeSubject(person.employeeNumber),contractId:person.contractId,legajo:person.employeeNumber,identityToken:person.identityToken};fixed.state.records.push(record);
  const c=capture({payload:{...sources,sourceInventory:{populationDomain:'native_registered'}}});
  const refresh=()=>{c.payload.fixed={list:{ok:true,data:fixed.list('2026-10-01')},export:{ok:true,data:fixed.exporter('2026-10-01')}};c.payloadSha256=ownRunHash(c.payload);};refresh();
  return{c,record,fixed,refresh};
}
function snapshot(c){const{sourceInventory:_audit,...sources}=c.payload;return createOwnPayrollSnapshot(prepareOwnPayrollInput(sources));}
function savedValue(c,input,result){return{version:'own-payroll-saved.v1',id:c.id,algorithmSha256:c.algorithmSha256,inputSha256:ownRunHash(input),resultSha256:ownRunHash(result),input:clone(input),result:clone(result),recordedAt:'2026-10-05T10:01:00Z'};}
function savedCapture(c){const value=snapshot(c);c.saved=savedValue(c,value.input,value.result);return c;}
function rehash(c){c.bodySha256=ownRunHash(c.body);c.payloadSha256=ownRunHash(c.payload);if(c.saved){c.saved.inputSha256=ownRunHash(c.saved.input);c.saved.resultSha256=ownRunHash(c.saved.result);}return c;}
function setup(c,options={}){
  const calls=[],stats={connections:0};
  const sql={query:async(q,v)=>{calls.push({q,v:clone(v)});if(/own_run_complete(?:_full)?_v1/.test(q))return[{result:savedValue(c,JSON.parse(v[2]),JSON.parse(v[3]))}];return[{result:clone(c)}];}};
  const handler=createOwnRunHandler({env:{INTERNAL_APP_ORIGIN:'https://municipio.example'},requireAccess:async()=>({mode:'managed',principal}),sessionFor:()=>session,algorithmHash:()=>hash('c'),getSql:async()=>{stats.connections++;return sql;},...options});
  return{handler,calls,stats,sql};
}

test('HTTP canónico conserva clave cuerpo UUID aprobación e importe cero/negativo; ACK perdido recupera sólo GET',async()=>{
  for(const amount of ['0','12863','-12863']){
    const {c}=fixture(amount),a=setup(c),res=response();await a.handler(request(),res);assert.equal(res.statusCode,201,JSON.stringify(res.value));
    assert.equal(a.calls.length,2);assert.match(a.calls[1].q,/public\.own_run_complete_v1/);assert.equal(a.calls[0].v[2],c.key);assert.deepEqual(JSON.parse(a.calls[0].v[1]),c.body);assert.equal(JSON.parse(a.calls[0].v[0]).actorSessionId,session.id);
    const result=res.value.data,ledger=result.saved.input.employees[0].fixedForcedAmounts[0],row=c.payload.fixed.export.data.rows[0];
    assert.equal(ledger.amountCents,amount);assert.equal(ledger.recordId,row.recordId);assert.equal(ledger.recordVersion,row.version);assert.equal(ledger.proposalId,row.proposalId);assert.equal(ledger.sourceRowSha256,ownRunHash(row));assert.equal(result.saved.result.paymentExecuted,false);assert.equal(result.saved.result.municipalApprovalVerified,false);
    c.saved=clone(result.saved);c.replayed=true;const read=response();await a.handler(request('GET'),read);assert.equal(read.statusCode,200);assert.deepEqual(read.value.data.saved,result.saved);assert.equal(a.calls.length,3);assert.match(a.calls[2].q,/own_run_attempt_v1/);assert.equal(a.calls[2].v[1],c.key);
  }
});

test('finalizador full usa la misma derivación completa y el mismo ledger',async()=>{
  const {c}=fixture('12863'),a=setup(c),value=await ownRunOperation(a.sql,principal,session,'calculate',{key:c.key,body:c.body},{algorithmHash:()=>hash('c'),fullJson:true});
  assert.match(a.calls[1].q,/public\.own_run_complete_full_v1/);assert.deepEqual(value.saved.input,snapshot(c).input);assert.deepEqual(value.saved.result,snapshot(c).result);
});

test('fallo de acuse posterior al finalizador recupera el resultado por GET sin segundo cálculo',async()=>{
  const {c}=fixture('12863'),a=setup(c),res=response();let lost=true;
  res.json=function(value){if(lost&&value.ok){lost=false;c.saved=clone(value.data.saved);throw Error('synthetic acknowledgement lost after mocked commit');}this.value=value;return this;};
  await a.handler(request(),res);assert.equal(res.statusCode,503);assert.equal(a.calls.length,2);assert.ok(c.saved);
  const get=response();await a.handler(request('GET'),get);assert.equal(get.statusCode,200);assert.deepEqual(get.value.data.saved,c.saved);assert.equal(a.calls.length,3);assert.match(a.calls.at(-1).q,/own_run_attempt_v1/);
});

test('captura con AST cambiado rechaza antes de finalizar aunque se recalcule payloadSha256',async()=>{
  const {c}=fixture();c.payload.programState.program.definition.rules.at(-1).expression.stage='rounded';rehash(c);const a=setup(c),res=response();await a.handler(request(),res);assert.equal(res.statusCode,503);assert.equal(res.value.code,'OWN_RUN_CONTRACT_INVALID');assert.equal(a.calls.length,1);
});

test('captura opt-in sin resultado exige política exacta incluso al recuperar el intento',async()=>{
  for(const mutate of [d=>delete d.fixedForcedAmountsVersion,d=>d.fixedForcedAmountsPolicy.extra=true,d=>d.fixedForcedAmountsPolicy.quantityLineage.complete=false,d=>d.fixedForcedAmountsPolicy.policies[0].sourceCode='110']){
    const {c}=fixture();mutate(c.payload.programState.program.definition);rehash(c);const a=setup(c),res=response();await a.handler(request('GET'),res);assert.equal(res.statusCode,503);assert.equal(res.value.code,'OWN_RUN_CONTRACT_INVALID');assert.equal(a.calls.length,1);
  }
});

test('lectura guardada rederiva todos los campos del ledger y no confía en hashes exteriores rehechos',()=>{
  const original=savedCapture(fixture('12863').c);
  for(const [field,value]of [['recordId',uid(800)],['recordVersion',4],['proposalId',uid(801)],['sourceRowSha256',hash('f')],['policySha256',hash('e')],['amountCents','12864']]){
    const c=clone(original);c.saved.input.employees[0].fixedForcedAmounts[0][field]=value;rehash(c);assert.throws(()=>verifyOwnRunReceipt(c),e=>e.code==='OWN_RUN_CONTRACT_INVALID'&&e.status===503,field);
  }
});

test('lectura guardada rechaza resultado/traza adulterados aunque input y ambos hashes sean consistentes',()=>{
  const original=savedCapture(fixture('12863').c);
  for(const mutate of [r=>r.amount='128.64',r=>r.exactValue.numerator='12864',r=>r.trace[0].reference+='x',r=>r.trace[0].result.denominator='1',r=>r.dependencies.push('concept:999'),r=>r.employeeNumber='otro']){
    const c=clone(original);mutate(c.saved.result.rows.find(r=>r.conceptCode==='100'));rehash(c);assert.throws(()=>verifyOwnRunReceipt(c),e=>e.code==='OWN_RUN_CONTRACT_INVALID'&&e.status===503);
  }
});

test('última fila y aprobación/list/export completas están ligadas al input, no a una proyección parcial',()=>{
  const original=savedCapture(fixture('12863').c);
  for(const mutate of [c=>c.payload.fixed.export.data.rows.at(-1).values.legalInstrument+=' distinto',c=>c.payload.fixed.list.data.rows.at(-1).approved.id=uid(802),c=>c.payload.fixed.export.data.rows.at(-1).subject.identityToken=hash('f'),c=>c.payload.programState.program.revision=0]){
    const c=clone(original);mutate(c);const versions=c.saved.input.sourceVersions;versions.novelties=ownRunHash({monthly:c.payload.monthly,fixed:c.payload.fixed.export.data});versions.rules=ownRunHash({program:c.payload.programState.program,salary:c.payload.programState.salaryCatalog});c.saved.result.sourceVersions=clone(versions);rehash(c);assert.throws(()=>verifyOwnRunReceipt(c),e=>e.status===503);
  }
});

test('sin opt-in sigue FORCED_RULE_REQUIRED; NULL no se sustituye por cero ni se finaliza',async()=>{
  const {c}=fixture();delete c.payload.programState.program.definition.fixedForcedAmountsVersion;delete c.payload.programState.program.definition.fixedForcedAmountsPolicy;rehash(c);const a=setup(c),res=response();await a.handler(request(),res);assert.equal(res.statusCode,422);assert.equal(res.value.code,'OWN_RUN_FORCED_RULE_REQUIRED');assert.equal(a.calls.length,1);
  const b=fixture();b.record.approved.values.amountCents=null;b.refresh();const n=setup(b.c),nr=response();await n.handler(request(),nr);assert.ok(nr.statusCode>=400);assert.equal(n.calls.length,1);assert.equal(nr.value.ok,false);
});

test('colisión con mensual y última fila fija ajena se rechazan sin consumo parcial',async()=>{
  const a=fixture(),monthly=approvedSources(1).monthly;monthly.batches[0].rows[0].conceptSourceId='100';a.c.payload.monthly=monthly;rehash(a.c);const run=setup(a.c),res=response();await run.handler(request(),res);assert.equal(res.statusCode,422);assert.equal(res.value.code,'OWN_RUN_FORCED_SOURCE_COLLISION');assert.equal(run.calls.length,1);
  const b=fixture(),unused=fixedApprovedRecord(2,{conceptSourceId:'120',quantityDecimal:null,amountCents:'1',forced:false,forcedReason:null,validFrom:'2026-10-01',validTo:'2026-10-31'});unused.subject=clone(b.record.subject);b.fixed.state.records.push(unused);b.refresh();const n=setup(b.c),nr=response();await n.handler(request(),nr);assert.equal(nr.statusCode,422);assert.equal(nr.value.code,'OWN_RUN_SOURCE_UNUSED');assert.equal(n.calls.length,1);
});

test('replay legado guardado permanece idéntico; captura vieja sin resultado conserva ENGINE_CHANGED',async()=>{
  const c=capture();c.saved=saved(c);c.replayed=true;const before=clone(c),a=setup(c,{algorithmHash:()=>hash('f')}),res=response();await a.handler(request(),res);assert.equal(res.statusCode,200);assert.deepEqual(res.value.data,before);assert.equal(a.calls.length,1);
  const pending=capture(),b=setup(pending,{algorithmHash:()=>hash('f')}),fail=response();await b.handler(request(),fail);assert.equal(fail.statusCode,409);assert.equal(fail.value.code,'OWN_RUN_ENGINE_CHANGED');assert.equal(b.calls.length,1);assert.equal(pending.saved,null);
});

test('ninguna capacidad nueva: retiro de cada permiso impide leer cuerpo o abrir SQL',async()=>{
  for(const cap of RUN_CALCULATE){let reads=0;const {c}=fixture(),a=setup(c,{requireAccess:async()=>({mode:'managed',principal:{...principal,tenant:{...principal.tenant,effectiveCapabilities:RUN_CALCULATE.filter(value=>value!==cap)}}})}),req=request(),res=response();Object.defineProperty(req,'body',{get(){reads++;throw Error('body must remain unread');}});await a.handler(req,res);assert.equal(res.statusCode,403,cap);assert.equal(reads,0);assert.equal(a.stats.connections,0);}
});

test('errores existentes de identidad/sesión/SOD y errores forzados conservan su estado',()=>{
  for(const [message,status,code]of [['PAYROLL_FIXED_IDENTITY_CHANGED',409,'SOURCE_IDENTITY_CHANGED'],['ACTION_SESSION_INVALID',401,'SESSION_INVALID'],['TENANT_IAM_SOD_CONFLICT',403,'FORBIDDEN'],['OWN_RUN_FORCED_SOURCE_CHANGED',422,'FORCED_SOURCE_CHANGED'],['OWN_RUN_SOURCE_UNUSED',422,'SOURCE_UNUSED']]){const error=runError(Error(message));assert.equal(error.status,status);assert.equal(error.code,'OWN_RUN_'+code);}
  assert.match(ownRunAlgorithmHash(),/^[a-f0-9]{64}$/);
});

test('errores SQL del feature llegan como HTTP422 por handlers reales de programa y corrida; owner conserva delegación',async()=>{
  for(const code of ['FORCED_POLICY_INVALID','FORCED_LINEAGE_REQUIRED','FORCED_SOURCE_CHANGED']){
    const failure=Error('OWN_PROGRAM_'+code),p={...principal,tenant:{...principal.tenant,effectiveCapabilities:[...RUN_CALCULATE,'payroll.parameter.prepare','payroll.parameter.approve']}};
    const {c}=fixture(),a=setup(c,{getSql:async()=>({query:async()=>{throw failure;}})}),res=response();await a.handler(request(),res);assert.equal(res.statusCode,422,code);assert.equal(res.value.code,'OWN_RUN_'+code);
    const handler=createOwnProgramHandler({env:{INTERNAL_APP_ORIGIN:'https://municipio.example'},requireAccess:async()=>({mode:'managed',principal:p}),sessionFor:()=>session,getSql:async()=>({query:async()=>{throw failure;}})}),req=request(),out=response();req.url='/api/internal-own-payroll-program';req.body=JSON.stringify({operation:'command',payload:command()});await handler(req,out);assert.equal(out.statusCode,422,JSON.stringify(out.value));assert.equal(out.value.code,'OWN_PROGRAM_'+code);assert.equal(municipalOwnerProgramError(failure).status,422);
  }
  for(const code of ['FORCED_SOURCE_COLLISION','FORCED_QUANTITY_UNKNOWN','FORCED_PRECISION_LOSS','FORCED_AMOUNT_MISSING','SOURCE_UNUSED']){
    const {c}=fixture(),a=setup(c,{getSql:async()=>({query:async()=>{throw Error('OWN_RUN_'+code);}})}),res=response();await a.handler(request(),res);assert.equal(res.statusCode,422,code);assert.equal(res.value.code,'OWN_RUN_'+code);
  }
});

test('SQL candidato conserva cierre/gobernanza/limites y ambas validaciones antes de append-only, sin grants nuevos',()=>{
  // Root reserved 196; the private candidate is unnumbered until its admission.
  const sql=fs.readFileSync(new URL('../scripts/migrations/196-own-fixed-forced-amount.sql',import.meta.url),'utf8');
  assert.equal(/\bGRANT\s|\bALTER\s+(?:TABLE|POLICY|ROLE)|\bCREATE\s+(?:TABLE|ROLE)|\bDROP\s/i.test(sql),false);
  assert.equal((sql.match(/PERFORM public\.own_fixed_forced_capture_v1\(c,input_value,result_value\);/g)||[]).length,2);
  for(const name of ['own_run_complete_v1','own_run_complete_full_v1']){const text=sql.slice(sql.indexOf('FUNCTION public.'+name+'('));assert.ok(text.indexOf('own_fixed_forced_capture_v1(c,input_value,result_value)')<text.indexOf('INSERT INTO public.own_payroll_run_result'));assert.match(text,/public\.own_run_owned_v1\(ctx,c\)/);assert.match(text,/public\.own_close_guard_v1/);assert.match(text,/OWN_RUN_RESULT_CONFLICT/);}
  assert.match(sql,/municipal_owner_program_command_core_v1\(p jsonb,body jsonb,key uuid,decision_mode text,owner_command jsonb\)/);assert.equal(/CREATE OR REPLACE FUNCTION public\.own_program_command_v1\(/.test(sql),false);
  for(const term of ['OWN_PROGRAM_INDEPENDENT_REQUIRED','OWNER_PROGRAM_PREVIEW_CHANGED','municipal_owner_program_provenance','4194304','33554432','OWN_RUN_SOURCE_UNUSED','OWN_RUN_FORCED_SOURCE_COLLISION','OWN_RUN_FORCED_QUANTITY_UNKNOWN','snapshotToken'])assert.ok(sql.includes(term),term);
});

test('SQL aditivo reemplaza cada firma heredada y no intenta recrear el finalizador completo173',()=>{
  const sql=fs.readFileSync(new URL('../scripts/migrations/196-own-fixed-forced-amount.sql',import.meta.url),'utf8');
  for(const name of ['own_program_node_v2','own_program_unit_v2','own_program_definition_v1','municipal_owner_program_command_core_v1','own_run_complete_v1','own_run_complete_full_v1']){
    assert.ok(new RegExp('CREATE OR REPLACE FUNCTION public\\.'+name+'\\(').test(sql),name+' already exists in the admitted chain');
    assert.equal(new RegExp('CREATE FUNCTION public\\.'+name+'\\(').test(sql),false,name+' must retain existing OID, owner and ACL');
  }
});

import {ownNoveltyBatch} from '../assets/own-payroll-novelties-model.js';
import {batch as nativeBatch} from './fixtures/own-payroll-novelties-synthetic.js';
import {ownProgramHistory,ownProgramStructure} from '../assets/own-payroll-program-model.js';

test('SQL referencia dos filas nativas válidas por values.rowOrdinal sin falsa colisión exterior',()=>{
  const batch=nativeBatch(2);ownNoveltyBatch(batch);
  assert.ok(batch.rows.every(row=>!Object.hasOwn(row,'rowOrdinal')&&Number.isSafeInteger(row.values.rowOrdinal)));
  assert.equal(new Set(batch.rows.map(row=>batch.id+':'+row.values.rowOrdinal)).size,2);
  assert.equal(new Set(batch.rows.map(row=>batch.id+':'+row.rowOrdinal)).size,1,'the old accessor collapses both rows; SQL NULLs likewise grouped together');
  const sql=fs.readFileSync(new URL('../scripts/migrations/196-own-fixed-forced-amount.sql',import.meta.url),'utf8'),native=sql.slice(sql.indexOf("IF c.payload->'monthly' ? 'nativeBatches'"),sql.indexOf('FOR employee IN SELECT'));
  assert.ok(native.includes("'reference',(batch->>'id')||':'||(row_value#>>'{values,rowOrdinal}')"),'native SQL must read the ordinal from the complete values record');
  assert.equal(native.includes("row_value->>'rowOrdinal'"),false);
});

test('SQL preserva cada política previa completa igual que history; permite adición explícita',()=>{
  const before=clone(fixture().c.payload.programState.program.definition),target=before.rules.find(r=>r.code==='100'),oldPolicy=before.fixedForcedAmountsPolicy.policies[0];
  before.rules.push({...clone(target),code:'200',expression:{op:'literal',unit:'money',value:'1'}});
  before.fixedForcedAmountsPolicy.policies.push({...clone(oldPolicy),ruleKey:ownFixedForcedRuleKey(before.rules.at(-1)),sourceCode:'200'});
  const bindAst=value=>{value.fixedForcedAmountsPolicy.quantityLineage.expressionSetSha256=ownRunHash(fixedForcedExpressionSet(value.rules,value.fixedForcedAmountsPolicy.policies));ownProgramStructure(value);return value;};bindAst(before);
  const removed=clone(before);removed.fixedForcedAmountsPolicy.policies.shift();
  bindAst(removed);
  assert.throws(()=>ownProgramHistory(before,removed),error=>error.code==='PROGRAM_HISTORY_REQUIRED');
  const changed=clone(before);changed.fixedForcedAmountsPolicy.policies[0].sourceSha256=hash('f');
  bindAst(changed);
  assert.throws(()=>ownProgramHistory(before,changed),error=>error.code==='PROGRAM_HISTORY_REQUIRED');
  const added=clone(before);added.rules.push({...clone(target),code:'300',expression:{op:'literal',unit:'money',value:'2'}});added.fixedForcedAmountsPolicy.policies.push({...clone(oldPolicy),ruleKey:ownFixedForcedRuleKey(added.rules.at(-1)),sourceCode:'300'});
  bindAst(added);
  assert.doesNotThrow(()=>ownProgramHistory(before,added));
  const sql=fs.readFileSync(new URL('../scripts/migrations/196-own-fixed-forced-amount.sql',import.meta.url),'utf8');
  assert.ok(sql.includes("jsonb_array_elements(coalesce(current_program#>'{definition,fixedForcedAmountsPolicy,policies}','[]'::jsonb)) old_policy"),'propose must iterate every retained historical policy');
  assert.ok(sql.includes("new_policy WHERE new_policy=old_policy)) THEN RAISE EXCEPTION 'OWN_PROGRAM_HISTORY_REQUIRED'"),'compare whole entries, not only ruleKey or feature flag');
});
