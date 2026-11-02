// Synthetic source/VM tests only. Never import the native verifier or start psql.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {qaPsqlFileBusyDiagnostic} from '../scripts/lib/qa-psql-file-busy-diagnostic.mjs';
import {REGISTRY_DIAGNOSTIC_LIMITS} from '../scripts/lib/registry-busy-diagnostic.mjs';
const schema='mc_qa_fixed_092_'+'b'.repeat(32);
const linux='/synthetic/owned/001.sql',windows='C:\\synthetic\\owned\\001.sql';
const frame='CONTEXT: PL/pgSQL function '+schema+'.employment_adoption_propose_v1(jsonb,jsonb,uuid) line 60 at RAISE';
const wire=(file,{newline='\n',error='ERROR: EMPLOYMENT_ADOPTION_BUSY',context=frame}={})=>
 'psql:'+file+':12: '+error+newline+'psql:'+file+':12: '+context;
const parse=(stderr,file=linux)=>qaPsqlFileBusyDiagnostic({stderr,schema,file});
function unresolved(value){
 assert.equal(value.innerSqlstate,null);assert.equal(value.holder,null);
 assert.equal(value.causalAttribution,'unresolved');
 assert.equal(JSON.stringify(value).includes(schema),false);
 assert.equal(JSON.stringify(value).includes(linux),false);
 assert.equal(JSON.stringify(value).includes(windows),false);
}
test('owned Linux psql -f prefix produces bounded metadata without claiming the holder or inner state',()=>{
 const result=parse(wire(linux));assert.equal(result.available,true);assert.equal(result.errorToken,'EMPLOYMENT_ADOPTION_BUSY');
 assert.equal(result.outerSqlstate,null);assert.deepEqual(result.contexts,[{function:'employment_adoption_propose_v1',line:60,operation:'RAISE'}]);unresolved(result);
});
test('owned Windows prefix with CRLF is literal, including drive colon and backslashes',()=>{
 const result=parse(wire(windows,{newline:'\r\n',error:'ERROR: P0001: EMPLOYMENT_ADOPTION_BUSY'}),windows);
 assert.equal(result.available,true);assert.equal(result.outerSqlstate,'P0001');assert.equal(result.contexts.length,1);unresolved(result);
});
test('unprefixed and original stdin frames preserve their existing parser contract',()=>{
 for(const prefix of['','psql:<stdin>:12: ']){
  const result=parse(prefix+'ERROR: EMPLOYMENT_ADOPTION_BUSY\n'+prefix+frame);
  assert.equal(result.available,true);assert.equal(result.contexts.length,1);unresolved(result);
 }
});
test('foreign, relative, invented or suffix-changed stderr paths cannot match the owned file prefix',()=>{
 for(const other of['/synthetic/foreign/001.sql','001.sql','/synthetic/owned/001.sql.extra','/invented/001.sql',windows]){
  const result=parse(wire(other),linux);assert.equal(result.available,false);assert.equal(result.reason,'error_not_allowlisted');
  assert.deepEqual(result.contexts,[]);unresolved(result);
 }
});
test('malformed or out-of-bound psql line numbers do not gain authority through prefix removal',()=>{
 for(const number of['0','-1','01','1000000000','x','']){
  const result=parse('psql:'+linux+':'+number+': ERROR: EMPLOYMENT_ADOPTION_BUSY');
  assert.equal(result.available,false);assert.equal(result.errorToken,null);
 }
});
test('invalid file delimiters do not normalize a psql -f frame',()=>{
 for(const file of['',null,{},linux+'\n',linux+'\r',linux+'\0']){
  const result=qaPsqlFileBusyDiagnostic({stderr:wire(linux),schema,file});
  assert.equal(result.available,false);assert.equal(result.reason,'error_not_allowlisted');
 }
});
test('DETAIL, HINT, QUERY and statement blocks with forged owned context remain withheld and never leak',()=>{
 for(const detail of['DETAIL: synthetic-private-value','HINT: synthetic-private-value','QUERY: SELECT synthetic-private-value',
  'SQL statement "SELECT synthetic-private-value"','STATEMENT: SELECT synthetic-private-value']){
  const result=parse('psql:'+linux+':12: ERROR: EMPLOYMENT_ADOPTION_BUSY\n'+detail+'\npsql:'+linux+':12: '+frame);
  assert.equal(result.available,true);assert.equal(result.contextWithheld,true);assert.deepEqual(result.contexts,[]);
  const text=JSON.stringify(result);assert.equal(text.includes('synthetic-private-value'),false);assert.equal(text.includes('SELECT'),false);unresolved(result);
 }
});
test('original character, line and per-line capacities are applied before any prefix is removed',()=>{
 const busy='ERROR: EMPLOYMENT_ADOPTION_BUSY\n';
 for(const stderr of[
  busy+'x'.repeat(REGISTRY_DIAGNOSTIC_LIMITS.characters),
  busy+'\n'.repeat(REGISTRY_DIAGNOSTIC_LIMITS.lines+1),
  busy+'x'.repeat(REGISTRY_DIAGNOSTIC_LIMITS.lineCharacters+1)
 ]){
  const result=parse(stderr);assert.equal(result.truncated,true);assert.equal(result.contextWithheld,true);
  assert.deepEqual(result.contexts,[]);unresolved(result);
 }
 const longOwned='/'+('owned'.repeat(110))+'/001.sql';
 const result=parse(wire(longOwned),longOwned);assert.equal(result.truncated,true);assert.equal(result.contextWithheld,true);
});
test('duplicate, foreign-schema, wrong-signature and unknown-function contexts stay finite',()=>{
 const same=wire(linux)+'\npsql:'+linux+':13: '+frame;
 assert.equal(parse(same).contexts.length,1);
 for(const context of[
  frame.replace(schema+'.','public.'),frame.replace('(jsonb,jsonb,uuid)','(text)'),
  frame.replace('employment_adoption_propose_v1','other_private_function'),frame+' synthetic-private-value'
 ]){
  const result=parse(wire(linux,{context}));assert.equal(result.available,true);assert.deepEqual(result.contexts,[]);
  assert.equal(JSON.stringify(result).includes('synthetic-private-value'),false);
 }
});
test('frozen output and invalid QA namespace preserve the original parser safety boundary',()=>{
 const result=parse(wire(linux));assert.equal(Object.isFrozen(result),true);
 assert.equal(Object.isFrozen(result.contexts),true);assert.equal(Object.isFrozen(result.contexts[0]),true);
 const invalid=qaPsqlFileBusyDiagnostic({stderr:wire(linux),schema:'public',file:linux});
 assert.equal(invalid.available,false);assert.equal(invalid.reason,'invalid_qa_schema');
});

const verifierPath=fileURLToPath(new URL('../scripts/verify-mixed-contract-adoption.mjs',import.meta.url));
const verifier=fs.readFileSync(verifierPath,'utf8');
function actualRunHarness({enabled=true,target=true,status=3,recordThrows=false,missingStderr=false}={}){
 const matches=[...verifier.matchAll(/^ const run=(.*);$/gm)];assert.equal(matches.length,1,'one actual run function');
 const writes=[],spawns=[],assertions=[],original=Error('Original synthetic psql assertion'),events=[];
 let latestStderr;
 const fakeFs={writeFileSync(file,value,options){
  events.push(file.endsWith('.json')?'diagnostic':'source-or-log');
  if(file.endsWith('.json')&&recordThrows)throw Error('Synthetic diagnostic recorder failure');
  writes.push({file,value,options});
 }};
 const context=vm.createContext({
  fs:fakeFs,path,qaPsqlFileBusyDiagnostic,
  destination:path.join(path.parse(process.cwd()).root,'synthetic','owned'),sequence:0,
  runtime:{executable:'synthetic-psql',environment:{SYNTHETIC_ONLY:'1'}},args:['--synthetic-only'],
  process:{env:enabled?{MC_QA_BUSY_DIAGNOSTIC:'1'}:{}},
  qa:{schema},phase:'browser-preparation',major:18,profile:'october01',operationalPairBaseline:'published107',sourceCommit:'a'.repeat(40),
  spawnSync(executable,argv,options){
   spawns.push({executable,argv:[...argv],options});events.push('spawn');
   latestStderr=missingStderr?undefined:wire(argv.at(-1));
   return {status,stdout:status===0?'{"synthetic":true}\n':'',stderr:latestStderr};
  },
  assert:{equal(actual,expected,message){assertions.push({actual,expected,message});events.push('assert');if(actual!==expected)throw original;},match:assert.match},
 });
 const run=vm.runInContext('('+matches[0][1]+')',context,{filename:'synthetic-actual-run-fragment.js'});
 return {invoke:expected=>run('SELECT true;',expected,target),writes,spawns,assertions,original,events,stderr:()=>latestStderr,
  records:()=>writes.filter(row=>row.file.endsWith('.json')).map(row=>({file:row.file,options:row.options,body:JSON.parse(row.value)}))};
}
test('actual native-verifier run fragment records one bounded failure before the unchanged assertion and never retries',()=>{
 const h=actualRunHarness();assert.throws(()=>h.invoke(),e=>e===h.original);
 assert.equal(h.spawns.length,1);assert.equal(h.spawns[0].executable,'synthetic-psql');
 assert.equal(h.writes.filter(w=>w.file.endsWith('.sql')).length,1);
 const [record]=h.records();assert.equal(h.records().length,1);assert.equal(record.options.flag,'wx');
 assert.equal(record.body.version,'mixed-adoption-proposal-error.v1');assert.equal(record.body.phase,'browser-preparation');
 assert.equal(record.body.major,18);assert.equal(record.body.diagnostic.available,true);unresolved(record.body.diagnostic);
 assert.equal(h.events.indexOf('diagnostic')<h.events.indexOf('assert'),true);
 assert.equal(h.assertions.length,1);assert.equal(h.assertions[0].actual,3);assert.equal(h.assertions[0].expected,0);
 assert.equal(h.assertions[0].message,h.stderr().slice(-6000));
 for(const forbidden of['SELECT true;',h.stderr(),schema,'synthetic-private-value'])assert.equal(JSON.stringify(record.body).includes(forbidden),false);
});
test('actual run fragment keeps the same original assertion when the diagnostic recorder throws',()=>{
 const h=actualRunHarness({recordThrows:true});assert.throws(()=>h.invoke(),e=>e===h.original);
 assert.equal(h.spawns.length,1);assert.equal(h.assertions.length,1);assert.equal(h.records().length,0);
 assert.equal(h.events.filter(e=>e==='diagnostic').length,1);
});
test('actual run fragment never records without opt-in, for a different target, on success or on an expected refusal',()=>{
 for(const options of[{enabled:false},{target:false}]){
  const h=actualRunHarness(options);assert.throws(()=>h.invoke(),e=>e===h.original);
  assert.equal(h.records().length,0);assert.equal(h.spawns.length,1);
 }
 const success=actualRunHarness({status:0});assert.equal(success.invoke().synthetic,true);
 assert.equal(success.records().length,0);assert.equal(success.spawns.length,1);
 const expected=actualRunHarness();assert.equal(expected.invoke('EMPLOYMENT_ADOPTION_BUSY').status,3);
 assert.equal(expected.records().length,0);assert.equal(expected.spawns.length,1);
});
test('actual run fragment keeps the failed process assertion when stderr is absent and reports only unavailable metadata',()=>{
 const h=actualRunHarness({status:null,missingStderr:true});assert.throws(()=>h.invoke(),e=>e===h.original);
 assert.equal(h.spawns.length,1);assert.equal(h.records().length,1);
 assert.equal(h.records()[0].body.diagnostic.available,false);assert.equal(h.records()[0].body.diagnostic.reason,'stderr_unavailable');
 assert.equal(h.assertions[0].actual,null);assert.equal(h.assertions[0].expected,0);
});
test('actual sqlFor fragment marks only the exact preparation propose RPC for diagnostics',async()=>{
 const begin=verifier.indexOf(' const sqlFor=kind=>'),end=verifier.indexOf('\n const env=',begin);
 assert.equal(begin>=0&&end>begin,true);
 const expression=verifier.slice(begin+' const sqlFor='.length,end).trim().replace(/;$/,'');
 const calls=[],rpcLog=[];
 const sqlFor=vm.runInNewContext('('+expression+')',{
  qa:{normalized:value=>value,schema},mixedQaQuery:()=> 'MAPPED_SYNTHETIC_RPC',
  run:(...args)=>{calls.push(args);return {synthetic:true};},tx:(statements,options)=>({statements,options}),
  phase:'browser-preparation',rpcLog
 });
 for(const [kind,sql,target]of[
  ['preparation','SELECT public.employment_adoption_propose_v1($1::jsonb,$2::jsonb,$3::uuid) AS result',true],
  ['preparation','SELECT public.employment_adoption_attempt_v1($1::jsonb,$2::uuid) AS result',false],
  ['owner','SELECT public.employment_adoption_propose_v1($1::jsonb,$2::jsonb,$3::uuid) AS result',false],
  ['preparation',' SELECT public.employment_adoption_propose_v1($1::jsonb,$2::jsonb,$3::uuid) AS result',false],
  ['preparation','SELECT public.employment_adoption_propose_v1_extra($1::jsonb) AS result',false]
 ]){
  const result=await sqlFor(kind).query(sql,[]);assert.equal(result[0].result.synthetic,true);
  assert.equal(calls.at(-1)[2],target);assert.equal(calls.at(-1)[1],undefined);
 }
 assert.equal(calls.length,5);assert.equal(rpcLog.length,5);
});
