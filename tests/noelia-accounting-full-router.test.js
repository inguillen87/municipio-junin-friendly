import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeAccountingQaSql} from '../scripts/lib/native-employee-accounting-tail-qa.mjs';

// Pure contract tests only. Every db method below is a recording stub; no SQL,
// database, browser, child process or provider is executed by these tests.
const SCHEMA='mc_qa_fixed_092_'+'a'.repeat(32);
const LEGACY=Object.freeze([
 ['own_accounting_bootstrap_v1',['jsonb']],
 ['own_accounting_detail_v1',['jsonb','uuid']],
 ['own_accounting_attempt_v1',['jsonb','uuid']],
 ['own_accounting_command_v1',['jsonb','jsonb','uuid']],
 ['own_imputation_bootstrap_v1',['jsonb','text','text']],
 ['own_imputation_source_v1',['jsonb','uuid','text']],
 ['own_imputation_detail_v1',['jsonb','uuid']],
 ['own_imputation_attempt_v1',['jsonb','uuid']],
 ['own_imputation_command_v1',['jsonb','jsonb','uuid']],
 ['own_journal_bootstrap_v1',['jsonb','text','text']],
 ['own_journal_source_v1',['jsonb','text','uuid']],
 ['own_journal_detail_v1',['jsonb','uuid']],
 ['own_journal_attempt_v1',['jsonb','uuid']],
 ['own_journal_command_v1',['jsonb','jsonb','uuid']]
]);
const FULL=Object.freeze([
 ['own_imputation_source_full_v1',['jsonb','uuid','text']],
 ['own_imputation_detail_full_v1',['jsonb','uuid']],
 ['own_imputation_command_full_v1',['jsonb','jsonb','uuid']],
 ['own_journal_source_full_v1',['jsonb','text','uuid']],
 ['own_journal_detail_full_v1',['jsonb','uuid']],
 ['own_journal_command_full_v1',['jsonb','jsonb','uuid']]
]);
const ALL=Object.freeze([...LEGACY,...FULL]);
const statement=(name,casts)=>'SELECT public.'+name+'('+casts.map((cast,i)=>'$'+(i+1)+'::'+cast).join(',')+') AS result';
const opaque="Apóstrofo ' y '' public.own_journal_detail_full_v1($1) $2 $3; \\ Unicode ñ 漢字 \n fin";
const valuesFor=casts=>casts.map((cast,index)=>cast==='jsonb'?JSON.stringify({index,note:opaque,nested:{schema:'public.',key:'$1',literal:"'; SELECT 1; --"}}):cast==='uuid'?'11111111-1111-4111-8111-111111111111':'texto '+index+' '+opaque);
function recorder(){
 const calls=[],delegated=[],token=Object.freeze({source:'recording-only',value:opaque});
 const db={marker:'original-db-property',run:async(...args)=>{calls.push(args);return token;},query:async(...args)=>{delegated.push(args);return token;}};
 return{calls,delegated,token,db,sql:createNativeAccountingQaSql(db,{schema:SCHEMA})};
}
// Read standard-conforming SQL string literals independently of the bridge.
// This proves that each original value occupies one literal and cannot escape
// into the SQL exterior, without copying the bridge's replacement algorithm.
function parts(text){
 let outside='';const literals=[];
 for(let i=0;i<text.length;i++){
  if(text[i]!=="'"){outside+=text[i];continue;}
  let value='',closed=false;
  for(i++;i<text.length;i++){
   if(text[i]!=="'"){value+=text[i];continue;}
   if(text[i+1]==="'"){value+="'";i++;continue;}
   closed=true;break;
  }
  assert.equal(closed,true,'complete SQL literal required');outside+='<v'+literals.length+'>';literals.push(value);
 }
 return{outside,literals};
}

 test('all fourteen legacy emissions and six distinct FULL emissions retain their exact function and runtime dispatch',async()=>{
 assert.equal(LEGACY.length,14);assert.equal(FULL.length,6);assert.equal(new Set(ALL.map(([name,casts])=>statement(name,casts))).size,20);
 for(const[name,casts]of ALL){const r=recorder(),values=valuesFor(casts),before=values.slice(),result=await r.sql.query(statement(name,casts),values);assert.equal(r.calls.length,1,name);assert.equal(r.delegated.length,0,name);assert.equal(r.calls[0].length,2,name);assert.equal(r.calls[0][1],true,'runtime role remains explicit; GET is not converted to SQL read-only');assert.equal(result.length,1);assert.strictEqual(result[0].result,r.token);assert.deepEqual(values,before);assert.equal(r.sql.marker,'original-db-property');const parsed=parts(r.calls[0][0]);assert.equal(parsed.outside,'SELECT '+SCHEMA+'.'+name+'('+casts.map((cast,i)=>'<v'+i+'>::'+cast).join(',')+') AS result',name);assert.deepEqual(parsed.literals,values,name);}
 });

 test('opaque JSON and text survive apostrophes, public prefixes, placeholders, semicolons, backslashes and Unicode byte for byte',async()=>{
 for(const[name,casts]of ALL){const r=recorder(),values=valuesFor(casts);await r.sql.query(statement(name,casts),values);const parsed=parts(r.calls[0][0]);assert.deepEqual(parsed.literals,values);assert.equal(parsed.outside.split(SCHEMA+'.').length-1,1,'only the function identifier is relocated');assert.equal(parsed.outside.includes('public.'),false);assert.equal(parsed.outside.includes('SELECT 1'),false);assert.equal(parsed.outside.includes('$1'),false);for(let i=0;i<casts.length;i++)if(casts[i]==='jsonb')assert.deepEqual(JSON.parse(parsed.literals[i]),JSON.parse(values[i]));}
 });

 test('dense arity rejects holes, excess keys, symbols, array-like inputs and non-string values before either executor',async()=>{
 const[name,casts]=FULL[2],query=statement(name,casts),good=valuesFor(casts),hole=good.slice();delete hole[1];const compensated=hole.slice();compensated.extra='compensated hole';const named=good.slice();named.extra='extra';const symbol=good.slice();symbol[Symbol('extra')]='extra';const negative=good.slice();negative[-1]='extra';const padded=good.slice();padded['01']='extra';
 for(const values of [hole,compensated,named,symbol,negative,padded,good.slice(0,-1),[...good,'extra'],{0:good[0],1:good[1],2:good[2],length:3},null,undefined,...[null,undefined,1,true,{},[],1n].map(v=>[good[0],v,good[2]])]){const r=recorder();await assert.rejects(()=>r.sql.query(query,values));assert.equal(r.calls.length,0);assert.equal(r.delegated.length,0);}
 });

 test('frozen dense value arrays remain valid and unchanged for every old and FULL entry',async()=>{
 for(const[name,casts]of ALL){const r=recorder(),values=Object.freeze(valuesFor(casts));await r.sql.query(statement(name,casts),values);assert.deepEqual(parts(r.calls[0][0]).literals,[...values]);assert.equal(Object.isFrozen(values),true);}
 });

 test('only an existing disposable Noelia schema shape can construct the adapter',()=>{
 for(const schema of ['public','mc_qa_fixed_092_'+ 'a'.repeat(31),'mc_qa_fixed_092_'+ 'a'.repeat(33),'mc_qa_fixed_092_'+ 'A'.repeat(32),SCHEMA+';SELECT 1','foreign.'+SCHEMA,'',null,undefined])assert.throws(()=>createNativeAccountingQaSql({run:async()=>{},query:async()=>{}},{schema}));
 });

 test('nearby family SQL is rejected rather than aliased, normalized into acceptance or delegated',async()=>{
 const[name,casts]=FULL[1],exact=statement(name,casts),values=valuesFor(casts);
 for(const query of [exact+';',exact+' SELECT 1',exact+' ',exact.toLowerCase(),exact.replace('SELECT ','SELECT  '),exact.replace(' AS result',''),exact.replace('public.',''),exact.replace('public.',SCHEMA+'.'),exact.replace('_v1','_v2'),exact.replace('$2::uuid','$2::text'),'SELECT public.own_imputation_unknown_v1($1::jsonb) AS result','SELECT public.own_journal_detail_full_v1($1::jsonb,$2::uuid) AS different']){const r=recorder();await assert.rejects(()=>r.sql.query(query,values));assert.equal(r.calls.length,0);assert.equal(r.delegated.length,0);}
 });

 test('unrelated statements and non-string inputs delegate unchanged and independently to the original query function',async()=>{
 const r=recorder(),values=Object.freeze(['unchanged']),object={toString(){throw Error('must not coerce unrelated input');}};
 for(const query of ['SELECT public.own_run_bootstrap_v1($1::jsonb) AS result','SELECT 1',object,null,undefined]){const result=await r.sql.query(query,values);assert.strictEqual(result,r.token);assert.strictEqual(r.delegated.at(-1)[0],query);assert.strictEqual(r.delegated.at(-1)[1],values);}
 assert.equal(r.calls.length,0);assert.equal(r.delegated.length,5);
 });

 test('family runtime errors and unrelated delegated errors retain the original error identity',async()=>{
 const marker=Error('recording executor failure'),db={run:async()=>{throw marker;},query:async()=>{throw marker;}},sql=createNativeAccountingQaSql(db,{schema:SCHEMA});const[name,casts]=FULL[0];await assert.rejects(()=>sql.query(statement(name,casts),valuesFor(casts)),error=>error===marker);await assert.rejects(()=>sql.query('SELECT 1',[]),error=>error===marker);
 });
