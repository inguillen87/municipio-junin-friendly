/*
 * SOURCE PROPOSAL ONLY. Not imported, parsed, constructed, tested or executed by its author.
 * Intended public destination: tests/native-family-195-rpc.test.js
 * Subject: scripts/lib/native-family-195-rpc.mjs (block 1 of FAMILY195_BROWSER_CONSOLIDATED_20261026.md)
 * Pure regressions. The ten statements are captured from the REAL lib against a recording
 * fake `sql` (same technique as tests/native-family-requests.test.js:19); nothing connects.
 * No PostgreSQL, HTTP, transaction mode or browser behaviour is claimed by these tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {NATIVE_FAMILY_195_STATEMENTS,FAMILY195_STATES,nativeFamily195Rpc,canonical190Rpc} from '../scripts/lib/native-family-195-rpc.mjs';
import {ownFullCapacity190Rpc} from '../scripts/lib/own-payroll-full-capacity-190-rpc.mjs';
import {nativeFamilyOperation} from '../lib/internal-native-family-requests.js';
import {employeeContext} from '../lib/internal-native-employees.js';
import {FAMILY_REQUEST_STATES,FAMILY_REVIEW_WRITE} from '../assets/native-family-request-model.js';
import {principal,session,command,review,school,key,requestId,uid,syntheticSchoolHash,syntheticSchoolPdf} from './fixtures/native-family-requests-synthetic.js';

const schema='mc_qa_fixed_092_'+'d'.repeat(32);
const VIEWS=['self','review'],OPERATIONS=['bootstrap','detail','attempt','command','document'];
// Observable SQL types per position (lib/internal-native-family-requests.js:34-45).
const SQL_TYPES={bootstrap:['jsonb','text','jsonb'],detail:['jsonb','uuid'],attempt:['jsonb','uuid'],command:['jsonb','jsonb','uuid','jsonb'],document:['jsonb','uuid','integer']};
const functionName=(view,operation)=>'native_family_'+view+'_'+operation+'_v1';
const admittedText=(view,operation)=>'SELECT public.'+functionName(view,operation)+'('+SQL_TYPES[operation].map((t,n)=>'$'+(n+1)+'::'+t).join(',')+') AS result';
const cursor={version:'native-family-page-cursor.v1',contextVersion:'e'.repeat(64),snapshotVersion:'d'.repeat(64),offset:50,after:{receivedAt:'2026-10-16T12:00:00.000000Z',id:uid(1050)}};
const schoolDocument={filename:'certificado-sintetico.pdf',sha256:syntheticSchoolHash,byteLength:syntheticSchoolPdf.length,pages:1};
const ctx=JSON.stringify(employeeContext(principal(),session));
const ARITY=/M7_190_RPC_ARITY/,NOT_ALLOWED=/M7_190_RPC_NOT_ALLOWED/;

// Captures exactly what the lib hands to sql.query for one operation, then stops the
// operation there: the recording transport throws and the lib maps that failure.
async function emitted(view,operation,input,caps){
 const calls=[],sql={query:async(text,values)=>{calls.push({text,values:[...values]});throw Error('QA_RECORDED_ONLY');}};
 await assert.rejects(nativeFamilyOperation(sql,principal(caps),session,operation,input,view));
 assert.equal(calls.length,1,'exactly one statement per operation');return calls[0];
}
const INPUTS={
 bootstrap:view=>view==='self'?{}:{state:'submitted',cursor},
 detail:()=>({id:requestId}),
 attempt:()=>({key}),
 command:view=>view==='self'?{body:command(),key,document:null}:{body:review(),key,document:null},
 document:()=>({id:requestId,requestVersion:7}),
};
const capsFor=view=>view==='review'?FAMILY_REVIEW_WRITE:undefined;
let emissions=null;
async function allEmissions(){
 if(emissions)return emissions;const collected={};
 for(const view of VIEWS)for(const operation of OPERATIONS)collected[view+':'+operation]=await emitted(view,operation,INPUTS[operation](view),capsFor(view));
 emissions=collected;return emissions;
}
// Splits a statement into the text outside single-quoted literals (each literal replaced by
// "\0") and the unquoted literal contents, following SQL quoting ('' inside a literal is ').
function sqlParts(statement){
 const literals=[];let outside='',i=0;
 while(i<statement.length){
  const c=statement[i];
  if(c!=="'"){outside+=c;i++;continue;}
  let value='';i++;
  for(;;){
   assert.ok(i<statement.length,'unterminated SQL literal');
   const d=statement[i];
   if(d==="'"){if(statement[i+1]==="'"){value+="'";i+=2;continue;}i++;break;}
   value+=d;i++;
  }
  literals.push(value);outside+='\0';
 }
 return {outside,literals};
}
const expectedOutside=(view,operation,values)=>'SELECT '+schema+'.'+functionName(view,operation)+'('+SQL_TYPES[operation].map((t,n)=>(t==='integer'?String(values[n]):'\0')+'::'+t).join(',')+') AS result';
const mapSnapshot=()=>JSON.stringify([...NATIVE_FAMILY_195_STATEMENTS.entries()]);

test('the ten statements the real lib emits are exactly the admitted texts: two commands, eight readers, SQL types per position',async()=>{
 const e=await allEmissions(),texts=Object.values(e).map(c=>c.text);
 assert.equal(new Set(texts).size,10);assert.deepEqual([...texts].sort(),[...NATIVE_FAMILY_195_STATEMENTS.keys()].sort());
 assert.equal(NATIVE_FAMILY_195_STATEMENTS.size,10);
 for(const view of VIEWS)for(const operation of OPERATIONS){
  const text=admittedText(view,operation),entry=NATIVE_FAMILY_195_STATEMENTS.get(text);
  assert.ok(entry,text);assert.equal(e[view+':'+operation].text,text);
  assert.equal(entry.name,functionName(view,operation));assert.equal(entry.command,operation==='command');
  assert.equal(entry.types.length,SQL_TYPES[operation].length);assert.ok(Object.isFrozen(entry)&&Object.isFrozen(entry.types));
  assert.match(text,/^SELECT public\.native_family_(?:self|review)_(?:bootstrap|detail|attempt|command|document)_v1\((?:\$\d+::(?:jsonb|text|uuid|integer),?)+\) AS result$/);
 }
 assert.deepEqual([...NATIVE_FAMILY_195_STATEMENTS.values()].filter(x=>x.command).map(x=>x.name).sort(),['native_family_review_command_v1','native_family_self_command_v1']);
 assert.deepEqual(FAMILY195_STATES,['all',...FAMILY_REQUEST_STATES]);assert.ok(Object.isFrozen(FAMILY195_STATES));
});

test('the real lib emits the six-field DTO serialized by employeeContext, exact JSON texts, the JSON text null and a JS number',async()=>{
 const e=await allEmissions();
 assert.deepEqual(Object.keys(JSON.parse(ctx)).sort(),['actorEmail','actorSessionId','actorSessionVersion','membershipId','releaseSha','tenantId']);
 for(const call of Object.values(e))assert.equal(call.values[0],ctx);
 assert.deepEqual(e['self:bootstrap'].values.slice(1),['all','null']);
 assert.deepEqual(e['review:bootstrap'].values.slice(1),['submitted',JSON.stringify(cursor)]);
 assert.deepEqual(e['self:detail'].values.slice(1),[requestId]);assert.deepEqual(e['review:detail'].values.slice(1),[requestId]);
 assert.deepEqual(e['self:attempt'].values.slice(1),[key]);assert.deepEqual(e['review:attempt'].values.slice(1),[key]);
 assert.deepEqual(JSON.parse(e['self:command'].values[1]),command());assert.equal(e['self:command'].values[2],key);assert.equal(e['self:command'].values[3],'null');
 assert.deepEqual(JSON.parse(e['review:command'].values[1]),review());assert.equal(e['review:command'].values[3],'null');
 assert.deepEqual(e['self:document'].values.slice(1),[requestId,7]);assert.equal(typeof e['self:document'].values[2],'number');
 // A validated schooling document travels as a JSON object in $4, with the same admitted text.
 const schooling=await emitted('self','command',{body:command({payload:school()}),key,document:schoolDocument});
 assert.equal(schooling.text,admittedText('self','command'));assert.deepEqual(JSON.parse(schooling.values[3]),schoolDocument);assert.equal(schooling.values[2],key);
});

test('every emitted statement is admitted, relocates only the identifier and carries each value as exactly one SQL literal',async()=>{
 const e=await allEmissions(),before=mapSnapshot();
 for(const [label,call] of Object.entries(e)){
  const [view,operation]=label.split(':'),frozenValues=Object.freeze([...call.values]),result=nativeFamily195Rpc(call.text,frozenValues,schema);
  assert.ok(Object.isFrozen(result),label);assert.deepEqual(Object.keys(result).sort(),['command','name','statement']);
  assert.equal(result.name,functionName(view,operation));assert.equal(result.command,operation==='command');
  const {outside,literals}=sqlParts(result.statement);
  assert.equal(outside,expectedOutside(view,operation,call.values),label);
  assert.deepEqual(literals,call.values.filter(v=>typeof v==='string'),label);
  assert.ok(!outside.includes('public.')&&!outside.includes('$'),label);
  assert.equal(result.statement.split(schema+'.').length,2,label);
  assert.deepEqual(frozenValues,call.values,label);
  assert.deepEqual(canonical190Rpc(call.text,call.values,schema),result,label);
 }
 const schooling=await emitted('self','command',{body:command({payload:school()}),key,document:schoolDocument});
 const {literals}=sqlParts(nativeFamily195Rpc(schooling.text,schooling.values,schema).statement);
 assert.deepEqual(literals,schooling.values);assert.deepEqual(JSON.parse(literals[3]),schoolDocument);
 assert.equal(mapSnapshot(),before,'the admitted map is never mutated by calls');
});

test('JSON content stays opaque: apostrophes, public., $1, $4, semicolons, backslashes and Unicode survive byte for byte',()=>{
 const payload={reason:"O'Higgins; DROP TABLE public.x; $1 $4 \\ \"q\" niño 日本語   fin",nested:{via:'public.native_family_self_command_v1',dollar:'$4::jsonb',semicolon:';',quotes:"''"}};
 const tricky=JSON.stringify(payload),text=admittedText('self','command'),values=Object.freeze([ctx,tricky,key,'null']);
 const {statement,command:isCommand}=nativeFamily195Rpc(text,values,schema);
 assert.equal(isCommand,true);
 const {outside,literals}=sqlParts(statement);
 assert.deepEqual(literals,[...values]);assert.deepEqual(JSON.parse(literals[1]),payload);
 assert.equal(outside,expectedOutside('self','command',values));
 assert.equal(statement.split(schema+'.').length,2,'one relocation only');
 assert.equal((statement.match(/public\./g)||[]).length,(tricky.match(/public\./g)||[]).length,'every public. inside the JSON survives and none is added');
 assert.ok(statement.includes("O''Higgins")&&!statement.includes("O'Higgins"),'SQL quoting of the apostrophe');
 assert.ok(statement.includes("''''"),'two consecutive apostrophes inside JSON become four quotes');
 assert.ok(statement.includes('\\ ')&&statement.includes('日本語')&&statement.includes('niño'),'backslash and Unicode untouched');
 assert.ok(!outside.includes(';')&&!outside.includes('DROP'),'nothing from the JSON leaks outside its literal');
 assert.ok(statement.endsWith("'null'::jsonb) AS result"));
});

test('the JSON text null is the literal null::jsonb, distinct from SQL NULL; objects where allowed, nothing else',()=>{
 const boot=admittedText('self','bootstrap'),cmd=admittedText('self','command');
 assert.ok(nativeFamily195Rpc(boot,[ctx,'all','null'],schema).statement.endsWith(",'null'::jsonb) AS result"));
 assert.ok(nativeFamily195Rpc(boot,[ctx,'all','{}'],schema).statement.endsWith(",'{}'::jsonb) AS result"));
 assert.ok(nativeFamily195Rpc(boot,[ctx,'all',JSON.stringify(cursor)],schema).statement.endsWith("'"+JSON.stringify(cursor)+"'::jsonb) AS result"));
 assert.ok(nativeFamily195Rpc(cmd,[ctx,'{}',key,'null'],schema).statement.endsWith("'{}'::jsonb,'"+key+"'::uuid,'null'::jsonb) AS result"));
 assert.ok(nativeFamily195Rpc(cmd,[ctx,'{}',key,JSON.stringify(schoolDocument)],schema).statement.endsWith("'"+JSON.stringify(schoolDocument)+"'::jsonb) AS result"));
 for(const s of [nativeFamily195Rpc(boot,[ctx,'all','null'],schema).statement,nativeFamily195Rpc(cmd,[ctx,'{}',key,'null'],schema).statement])assert.ok(!/\bNULL\b/.test(s),'SQL NULL never appears');
 // $3 of bootstrap and $4 of command: the exact text null or a JSON object, nothing else.
 for(const bad of [' null','null ','NULL','nul','[]','[{}]','1','"x"','true','false','','{','{"a":1}x']){
  assert.throws(()=>nativeFamily195Rpc(boot,[ctx,'all',bad],schema),/M7_190_RPC_(?:JSONB_OBJECT_OR_NULL|JSON)/,JSON.stringify(bad));
  assert.throws(()=>nativeFamily195Rpc(cmd,[ctx,'{}',key,bad],schema),/M7_190_RPC_(?:JSONB_OBJECT_OR_NULL|JSON)/,JSON.stringify(bad));
 }
 for(const bad of [null,undefined,{},[],0,1,true,Symbol('qa'),()=>'null']){
  assert.throws(()=>nativeFamily195Rpc(boot,[ctx,'all',bad],schema),/M7_190_RPC_STRING/,String(typeof bad));
  assert.throws(()=>nativeFamily195Rpc(cmd,[ctx,'{}',key,bad],schema),/M7_190_RPC_STRING/,String(typeof bad));
 }
 // Context ($1 everywhere) and body ($2 of command) must be JSON objects: never null, arrays or primitives.
 for(const bad of ['null','[]','[{}]','1','"x"','true','','{']){
  assert.throws(()=>nativeFamily195Rpc(cmd,[ctx,bad,key,'null'],schema),/M7_190_RPC_(?:JSONB_OBJECT|JSON)/,JSON.stringify(bad));
  assert.throws(()=>nativeFamily195Rpc(boot,[bad,'all','null'],schema),/M7_190_RPC_(?:JSONB_OBJECT|JSON)/,JSON.stringify(bad));
 }
 for(const bad of [null,undefined,{},1])assert.throws(()=>nativeFamily195Rpc(cmd,[ctx,bad,key,'null'],schema),/M7_190_RPC_STRING/);
});

test('the document revision is a JS number 1..1000 inlined unquoted; strings, decimals, NaN, Infinity, bigint and out-of-range values are refused',()=>{
 const text=admittedText('review','document');
 for(const ok of [1,7,1000,1e3])assert.ok(nativeFamily195Rpc(text,[ctx,requestId,ok],schema).statement.endsWith("'::uuid,"+String(ok)+"::integer) AS result"),String(ok));
 assert.equal(sqlParts(nativeFamily195Rpc(text,[ctx,requestId,1000],schema).statement).literals.length,2,'the integer is not a quoted literal');
 for(const bad of [0,1001,-1,2.5,NaN,Infinity,-Infinity,'7','1000',7n,null,undefined,true,{},[7],Number.MAX_SAFE_INTEGER+2,-0.5]){
  assert.throws(()=>nativeFamily195Rpc(text,[ctx,requestId,bad],schema),/M7_190_RPC_INTEGER/,String(bad));
 }
 assert.throws(()=>nativeFamily195Rpc(text,[ctx,requestId],schema),ARITY);
 assert.throws(()=>nativeFamily195Rpc(text,[ctx,requestId,7,7],schema),ARITY);
});

test('arity is dense and exact; invalid UUIDs and states are refused before any statement is produced',()=>{
 const text=admittedText('self','detail'),values=[ctx,requestId];
 assert.throws(()=>nativeFamily195Rpc(text,[ctx],schema),ARITY);
 assert.throws(()=>nativeFamily195Rpc(text,[ctx,requestId,'extra'],schema),ARITY);
 const holed=[ctx,requestId];delete holed[1];assert.throws(()=>nativeFamily195Rpc(text,holed,schema),ARITY);
 const holedTail=[ctx,requestId,'x'];holedTail.length=2;holedTail[2]='tail';assert.throws(()=>nativeFamily195Rpc(text,holedTail,schema),ARITY);
 const named=[ctx,requestId];named.extra='x';assert.throws(()=>nativeFamily195Rpc(text,named,schema),ARITY);
 const symbolic=[ctx,requestId];symbolic[Symbol('qa')]='x';assert.throws(()=>nativeFamily195Rpc(text,symbolic,schema),ARITY);
 assert.throws(()=>nativeFamily195Rpc(text,{0:ctx,1:requestId,length:2},schema),ARITY);
 for(const notArray of [null,undefined,'',ctx,42,{}])assert.throws(()=>nativeFamily195Rpc(text,notArray,schema),ARITY);
 assert.equal(nativeFamily195Rpc(text,Object.freeze([...values]),schema).name,'native_family_self_detail_v1','a frozen dense array is fine');
 for(const bad of ['not-a-uuid',requestId.slice(0,-1),requestId+'0',' '+requestId,requestId+' ',requestId.replaceAll('-',''),'',requestId.replace(/-/,'_')]){
  assert.throws(()=>nativeFamily195Rpc(text,[ctx,bad],schema),/M7_190_RPC_UUID/,JSON.stringify(bad));
  assert.throws(()=>nativeFamily195Rpc(admittedText('review','attempt'),[ctx,bad],schema),/M7_190_RPC_UUID/,JSON.stringify(bad));
  assert.throws(()=>nativeFamily195Rpc(admittedText('self','command'),[ctx,'{}',bad,'null'],schema),/M7_190_RPC_UUID/,JSON.stringify(bad));
 }
 const boot=admittedText('review','bootstrap');
 for(const bad of ['ALL','','pending','submitted ',' submitted','Submitted','all,submitted','native',null,undefined,1]){
  assert.throws(()=>nativeFamily195Rpc(boot,[ctx,bad,'null'],schema),/M7_190_RPC_(?:STATE|STRING)/,JSON.stringify(bad===undefined?'undefined':bad));
 }
 for(const state of FAMILY195_STATES)assert.ok(nativeFamily195Rpc(boot,[ctx,state,'null'],schema).statement.includes("'"+state+"'::text"),state);
});

test('approximate texts, extra statements and foreign schemas are refused by both entry points',()=>{
 const text=admittedText('self','bootstrap'),values=[ctx,'all','null'];
 const near=[text+';',text+';SELECT 1',text+' ',' '+text,text.replace(' AS result',()=>''),text.replace('SELECT',()=>'select'),text.toLowerCase(),
  text.replace('$1::jsonb,$2::text',()=>'$1::jsonb, $2::text'),text.replace('public.',()=>''),text.replace('public.',()=>schema+'.'),text.replace('_v1(',()=>'_v2('),
  text.replace('$2::text',()=>'$2::state'),text.replace('$3::jsonb',()=>'$3::json'),text.replace('native_family_self',()=>'native_family_other'),
  'SELECT public.native_family_self_bootstrap_v1($1::jsonb,$2::text,$3::jsonb) AS result; SELECT 1','SELECT public.native_family_self_bootstrap_v1($1::jsonb,$2::text) AS result','SELECT 1'];
 for(const candidate of near){assert.throws(()=>nativeFamily195Rpc(candidate,values,schema),NOT_ALLOWED,candidate);assert.throws(()=>canonical190Rpc(candidate,values,schema),NOT_ALLOWED,candidate);}
 for(const bad of ['public','mc_qa_fixed_092_'+'g'.repeat(32),'mc_qa_fixed_093_'+'d'.repeat(32),'mc_qa_fixed_092_'+'d'.repeat(31),'mc_qa_fixed_092_'+'d'.repeat(33),schema+' ',' '+schema,schema.toUpperCase(),'']){
  assert.throws(()=>nativeFamily195Rpc(text,values,bad),/M7_190_RPC_SCHEMA/,JSON.stringify(bad));
  assert.throws(()=>canonical190Rpc(text,values,bad),/M7_190_RPC_SCHEMA/,JSON.stringify(bad));
 }
 for(const bad of [null,undefined,42]){assert.throws(()=>nativeFamily195Rpc(text,values,bad));assert.throws(()=>canonical190Rpc(text,values,bad));}
 for(const text195 of NATIVE_FAMILY_195_STATEMENTS.keys())assert.throws(()=>ownFullCapacity190Rpc(text195,[],schema),NOT_ALLOWED,'the payroll bridge never admits a 195 text');
});

test('delegation keeps the payroll contract and its SQL exactly; unknown texts keep their rejection',()=>{
 const payroll='SELECT public.own_run_bootstrap_v1($1::jsonb) AS result',values=Object.freeze([ctx]);
 const routed=canonical190Rpc(payroll,values,schema);
 assert.ok(Object.isFrozen(routed));assert.deepEqual(Object.keys(routed).sort(),['command','name','statement']);
 assert.equal(routed.name,null);assert.ok(Object.hasOwn(routed,'command')&&routed.command===undefined,'command stays undefined for the payroll path');
 assert.equal(routed.statement,ownFullCapacity190Rpc(payroll,values,schema));
 assert.ok(routed.statement.startsWith('SELECT '+schema+'.own_run_bootstrap_v1(')&&routed.statement.endsWith("'::jsonb) AS result"));
 assert.deepEqual(sqlParts(routed.statement).literals,[ctx]);
 assert.throws(()=>nativeFamily195Rpc(payroll,values,schema),NOT_ALLOWED,'the 195 bridge never admits a payroll text');
 for(const unknown of ['SELECT 1',payroll+';',payroll.replace('public.',()=>''),'SELECT public.own_run_bootstrap_v9($1::jsonb) AS result'])assert.throws(()=>canonical190Rpc(unknown,values,schema),NOT_ALLOWED,unknown);
 // Payroll validation failures are the existing bridge's own, not re-wrapped by the delegation.
 assert.throws(()=>canonical190Rpc(payroll,['null'],schema));assert.throws(()=>canonical190Rpc(payroll,[ctx,'extra'],schema),ARITY);assert.throws(()=>canonical190Rpc(payroll,[ctx],'public'));
 const attempt='SELECT public.own_run_attempt_v1($1::jsonb,$2::uuid) AS result';
 assert.equal(canonical190Rpc(attempt,[ctx,requestId],schema).statement,ownFullCapacity190Rpc(attempt,[ctx,requestId],schema));
 assert.throws(()=>canonical190Rpc(attempt,[ctx,'not-a-uuid'],schema));
});
