// Future pure contracts only. Not run by this proposal's author.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {definition} from './fixtures/annual-position-budget-synthetic.js';
import {ADMIN216_BUSINESS_TABLES,ADMIN216_EXPECTED_DELTAS,admin216NextSyntheticDefinition,admin216WithoutBusinessRows,
 assertAdmin216BusinessDelta,assertAdmin216Prefix,admin216ProbeMutation,bindAdmin216ReadParameters} from '../scripts/lib/position-administrative216-browser-contract.mjs';
const schema='mc_qa_fixed_092_'+'a'.repeat(32),uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const before=()=>({tables:[...ADMIN216_BUSINESS_TABLES.map((name,index)=>({schema,name,oid:100+index,rows:10+index,rowsSha256:'a'.repeat(64),metaSha256:'b'.repeat(64)})),{schema,name:'employment_contract',oid:1,rows:855,rowsSha256:'c'.repeat(64),metaSha256:'d'.repeat(64)}],roles:[{oid:10}],functions:[{oid:20,hash:'e'.repeat(64)}],sequences:[],triggers:[{oid:30}]});
const after=phase=>{const result=before();for(const row of result.tables)if(Object.hasOwn(ADMIN216_EXPECTED_DELTAS[phase],row.name)){row.rows+=ADMIN216_EXPECTED_DELTAS[phase][row.name];row.rowsSha256='f'.repeat(64);}return result;};

test('a new synthetic annual version changes only documentary reference, preserving every quantity, unit and row',()=>{
 const initial=definition(),next=admin216NextSyntheticDefinition(initial);assert.notEqual(next.source.reference,initial.source.reference);
 assert.deepEqual(next.rows,initial.rows);assert.deepEqual({...next.source,reference:null},{...initial.source,reference:null});assert.deepEqual(initial,definition());
 assert.notEqual(admin216NextSyntheticDefinition(next,{negative:true}).source.reference,next.source.reference);
 assert.throws(()=>admin216NextSyntheticDefinition(next));assert.throws(()=>admin216NextSyntheticDefinition({...initial,source:{...initial.source,instrument:'Norma real'}}));
});

test('each phase permits only its four exact row deltas and preserves all other rows and metadata',()=>{
 for(const phase of Object.keys(ADMIN216_EXPECTED_DELTAS))assert.doesNotThrow(()=>assertAdmin216BusinessDelta(before(),after(phase),schema,phase));
 const changed=after('complete');changed.tables.find(row=>row.name==='employment_contract').rowsSha256='f'.repeat(64);
 assert.throws(()=>assertAdmin216BusinessDelta(before(),changed,schema,'complete'),/ADMIN216_OTHER_STATE_CHANGED/);
 const metadata=after('complete');metadata.tables[0].metaSha256='f'.repeat(64);assert.throws(()=>assertAdmin216BusinessDelta(before(),metadata,schema,'complete'),/ADMIN216_OTHER_STATE_CHANGED/);
 const identity=after('complete');identity.tables[0].oid=999;assert.throws(()=>assertAdmin216BusinessDelta(before(),identity,schema,'complete'),/ADMIN216_OTHER_STATE_CHANGED/);
 const extra=after('complete');extra.tables[0].rows++;assert.throws(()=>assertAdmin216BusinessDelta(before(),extra,schema,'complete'),/ADMIN216_ROW_DELTA/);
 assert.throws(()=>admin216WithoutBusinessRows({tables:[]},schema));
});

test('immutable row prefixes cannot be replaced even when the four aggregate counts look correct',()=>{
 const old=ADMIN216_BUSINESS_TABLES.map((name,index)=>({name,rows:[{sha256:String(index).repeat(64),count:2}]}));
 const next=structuredClone(old);for(const row of next)row.rows.push({sha256:'f'.repeat(64),count:1});assert.doesNotThrow(()=>assertAdmin216Prefix(old,next));
 next[0].rows[0].count=1;assert.throws(()=>assertAdmin216Prefix(old,next),/ADMIN216_PRIOR_ROW_CHANGED/);
});

test('rollback probes alter one existing source-pinned row, never create an identity, grant, capability or session',()=>{
 const actor={membershipId:uuid(1),actorSessionId:uuid(2),actorEmail:'maker@example.invalid',tenantId:uuid(3)},contractId=uuid(4),roleKey='QA_POSITIONS210_MAKER_fixture';
 const rows={capability:{role_key:roleKey,capability_key:'workforce.structure.read'},session:{id:actor.actorSessionId,user_email:actor.actorEmail,revoked_at:null},unlinked:{membership_id:actor.membershipId,employment_contract_id:contractId,active:true,revoked_at:null}};
 for(const[kind,expectedRow]of Object.entries(rows)){const sql=admin216ProbeMutation({schema,kind,actor,roleKey,contractId,expectedRow});assert.ok(sql.includes('FOR UPDATE'));assert.ok(sql.includes('GET DIAGNOSTICS changed=ROW_COUNT'));assert.ok(sql.includes('changed<>1'));assert.ok(!/\bINSERT\b|\bGRANT\b|\bCREATE\b|\bCOMMIT\b/i.test(sql));}
 assert.throws(()=>admin216ProbeMutation({schema:'public',kind:'session',actor,roleKey,contractId,expectedRow:rows.session}));
 assert.throws(()=>admin216ProbeMutation({schema,kind:'capability',actor,roleKey,contractId,expectedRow:{...rows.capability,capability_key:'payroll.calculation.approve'}}));
 assert.throws(()=>admin216ProbeMutation({schema,kind:'grant',actor,roleKey,contractId,expectedRow:{}}));
});

test('read binding preserves SQL literals, comments and dollar strings and keeps opaque JSON untouched',()=>{
 const opaque=JSON.stringify({label:"O'Hara public.$1; DROP TABLE never",unicode:'á→',backslash:'\\'});
 const sql="SELECT $1::jsonb,'$2',\"$2\",$$ $2 $$,$tag$ $2 $tag$, $2::integer /* $3 */ -- $3\n";
 const result=bindAdmin216ReadParameters(sql,[opaque,7]);assert.ok(result.startsWith("SELECT '"+opaque.replaceAll("'","''")+"'::jsonb"));
 assert.ok(result.includes("'$2',\"$2\",$$ $2 $$,$tag$ $2 $tag$, 7::integer /* $3 */ -- $3"));
 assert.equal(bindAdmin216ReadParameters("SELECT E'\\\'$1', $1",['value']),"SELECT E'\\\'$1', 'value'");
 assert.equal(bindAdmin216ReadParameters('SELECT $1,$2,$3',[null,false,0]),'SELECT NULL,false,0');
 assert.throws(()=>bindAdmin216ReadParameters('SELECT $2',['missing']));assert.throws(()=>bindAdmin216ReadParameters('SELECT 1',['unused']));assert.throws(()=>bindAdmin216ReadParameters('SELECT $1',[{}]));
 const sparse=[];sparse[1]='value';assert.throws(()=>bindAdmin216ReadParameters('SELECT $2',sparse));
});

test('the complete harness consumes the real existing handlers, branded216 epoch and the same actor pair after family and212',()=>{
 const source=read('scripts/lib/position-administrative216-native-browser.mjs');
 for(const path of ['api/internal-annual-position-budget.js','api/internal-position-assignment.js','api/internal-employment-lifecycle.js','api/internal-data.js'])assert.ok(source.includes(path));
 assert.ok(source.includes('assertPositions210Admission({h,db,admission})'));assert.ok(source.includes('verifyPositionAdministrative216Epoch(h,admission.administrative216)'));
 assert.ok(source.includes("family195Business.version,'native-family195-live190-business.v1'"));assert.ok(source.includes('lifecycle212.proposals,100'));
 assert.ok(source.includes('target=contracts[9],makerContract=contracts[4]'));assert.ok(source.includes('checker.contractId,contracts[5]'));
 assert.ok(source.includes('actualSql:true,actualHttp:true,actualBrowser:true'));
 assert.ok(!source.includes('createOwnerProgramQa('));assert.ok(!source.includes('buildOwnerProgramQa('));
});

test('owner rollback probes use existing h.expectRollback instead of broadening the closed runtime-negative descriptor',()=>{
 const source=read('scripts/lib/position-administrative216-native-browser.mjs');
 assert.ok(source.includes('h.expectRollback(activeProbe.statements,activeProbe.nativeCode,{command:true})'));
 assert.ok(source.includes("'SET LOCAL ROLE municontrol_actions_runtime_app',statement"));
 assert.ok(source.includes('own190ExpectedNativeRpcError(actual,{nativeCode:activeProbe.nativeCode})'));
 assert.ok(source.includes("'ADMIN216_PROBE_NOT_ROLLED_BACK:'+kind"));
 assert.ok(!source.includes('runtime:false'));
});

test('fixed integration runs after every855 and family tail, keeps complete module flags honest and never enables216 by default',()=>{
 const continuation=read('scripts/lib/own-payroll-full-capacity-190-continuation.mjs'),entry=read('scripts/verify-own-payroll-annulment-v2-full-capacity.mjs'),composition=read('scripts/lib/positions210-same190-composition.mjs');
 const family=continuation.indexOf('const family195BusinessReport='),history=continuation.indexOf('const lifecycle212=await verifyLifecycle212Same190'),browser=continuation.indexOf('const administrative216Browser=');
 assert.ok(family>=0&&history>family&&browser>history);assert.ok(continuation.includes('m10Complete:false'));
 assert.ok(continuation.includes('noeliaAdministrativeFlowProven:administrative216Browser?.passed===true'));
 assert.ok(entry.includes('!administrative216||(positions210&&family195)'));assert.ok(entry.includes('ADMIN216_BROWSER_ROOT_ENTRIES'));
 assert.ok(composition.includes("Object.hasOwn(settings,'administrative216')?settings.administrative216:false"));
});
