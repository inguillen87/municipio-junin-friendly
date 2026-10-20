import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNativeFamilySelfQa} from '../scripts/verify-native-family-self-sql.mjs';
import {nativeFamilyQaQuery} from '../scripts/lib/native-family-self-durable-qa.mjs';
import {nativeFamilyOperation,prepareNativeFamilyRequest} from '../lib/internal-native-family-requests.js';
import {command,key,principal,receipt,session} from './fixtures/native-family-requests-synthetic.js';

// Read generated procedural calls, skipping quoted SQL (including installed
// function bodies), comments and commas nested in argument expressions.
function quotedEnd(sql,start){
 const quote=sql[start],escapes=quote==="'"&&/[eE]/.test(sql[start-1]??'')&&!/[A-Za-z0-9_$]/.test(sql[start-2]??'');let i=start+1;
 while(i<sql.length){if(sql[i]===quote){if(sql[i+1]===quote){i+=2;continue;}return i+1;}if(escapes&&sql[i]==='\\'){i+=2;continue;}i++;}
 throw new Error('Unclosed generated SQL quote');
}
function commentEnd(sql,start){
 if(sql.startsWith('--',start)){const end=sql.indexOf('\n',start+2);return end<0?sql.length:end+1;}
 let depth=1,i=start+2;
 while(i<sql.length&&depth){if(sql.startsWith('/*',i)){depth++;i+=2;}else if(sql.startsWith('*/',i)){depth--;i+=2;}else i++;}
 assert.equal(depth,0,'Unclosed generated SQL comment');return i;
}
function commandCalls(sql){
 const calls=[];
 for(let i=0;i<sql.length;){
  if(sql[i]==="'"||sql[i]==='"'){i=quotedEnd(sql,i);continue;}
  if(sql.startsWith('--',i)||sql.startsWith('/*',i)){i=commentEnd(sql,i);continue;}
  const match=/^native_family_(self|review)_command_v1\s*\(/.exec(sql.slice(i));
  if(!match||(i>0&&/[A-Za-z0-9_]/.test(sql[i-1]))){i++;continue;}
  const start=i,open=i+match[0].lastIndexOf('('),args=[];let part=open+1,j=part,depth=1;
  while(j<sql.length&&depth){
   if(sql[j]==="'"||sql[j]==='"'){j=quotedEnd(sql,j);continue;}
   if(sql.startsWith('--',j)||sql.startsWith('/*',j)){j=commentEnd(sql,j);continue;}
   if(sql[j]==='(')depth++;
   else if(sql[j]===')'){depth--;if(depth===0){args.push(sql.slice(part,j).trim());break;}}
   else if(sql[j]===','&&depth===1){args.push(sql.slice(part,j).trim());part=j+1;}
   j++;
  }
  assert.equal(depth,0,'Unclosed generated command call');assert.equal(args.length,4,'Every generated writer has exactly four arguments');
  calls.push({view:match[1],args,line:sql.slice(0,start).split('\n').length,statementPrefix:sql.slice(sql.lastIndexOf(';',start)+1,start).trim()});i=j+1;
 }
 return calls;
}

test('all generated new family presentations use the real API JSON-null metadata contract, including budget admissions',async t=>{
 const body=command(),prepared=await prepareNativeFamilyRequest(body),captured=[];
 const sql={query:async(query,values)=>{captured.push({query,values});return [{result:receipt(body)}];}};
 await nativeFamilyOperation(sql,principal(),session,'command',{...prepared,key},'self');
 assert.equal(captured.length,1);assert.equal(captured[0].values[3],JSON.stringify(null));assert.notEqual(captured[0].values[3],null);
 const rendered=nativeFamilyQaQuery(captured[0].query,captured[0].values,'mc_qa_fixed_092_'+'a'.repeat(32));
 const [apiCall]=commandCalls(rendered);assert.ok(apiCall);const apiMetadata=apiCall.args[3];
 for(const major of [17,18]){
  const qa=buildNativeFamilySelfQa({serverMajor:major,requireConcurrency:true,sourceCommit:'b14c85512bec1167c192b5db30dd5e62e6669c5f'});
  assert.equal(qa.report.checksPassed,710);const calls=commandCalls(qa.sql);assert.ok(calls.length>10);
  const noMetadata=calls.filter(call=>/^NULL(?:::jsonb)?$/i.test(call.args[3]));
  const isExplicitReplay=call=>call.view==='self'&&((call.args[1]==='budget_saved_body'&&call.args[2]==='budget_saved_key')||(call.args[1]==='edge_body'&&call.args[2]==='edge_key'))&&/PERFORM\s+qa_assert\(\s*\(*\s*$/.test(call.statementPrefix);
  const omitted=noMetadata.filter(call=>!isExplicitReplay(call));
  assert.deepEqual(omitted.map(({view,args,line})=>({view,body:args[1],key:args[2],metadata:args[3],line})),[],'A generated new presentation/review supplies SQL NULL instead of the actual API metadata value');
  assert.equal(noMetadata.length,2,'Only the two explicit pre-existing receipt replays retain SQL NULL');
  const budget=calls.filter(call=>call.args[1]==='budget_body'&&call.args[2]==='budget_key');assert.equal(budget.length,1);assert.equal(budget[0].args[3],apiMetadata,'The real capacity-admission loop must use the API no-document value');
  for(const call of calls.filter(call=>!isExplicitReplay(call))){assert.ok([apiMetadata,'family_meta'].includes(call.args[3]),'Unexpected writer metadata: '+call.args[3]);}
  assert.ok(qa.sql.includes("format('SELECT native_family_self_command_v1(%L::jsonb,%L::jsonb,%L::uuid,NULL)',reader,budget_body,budget_key)"),'The capacity rejection deliberately remains a SQL-NULL negative');
  for(const invariant of ['NATIVE_FAMILY_CAPACITY_FULL','NATIVE_FAMILY_INDEPENDENT_REVIEW_REQUIRED','NATIVE_FAMILY_DOCUMENT_INVALID','NATIVE_FAMILY_IDEMPOTENCY_REUSE','NATIVE_FAMILY_BUSY'])assert.ok(qa.sql.includes(invariant));
  t.diagnostic(JSON.stringify({major,generatedWriterCalls:calls.length,noDocumentValueDerivedFromActualApi:apiMetadata,sqlNullReplays:noMetadata.length,budgetNewPresentationMatchesApi:true,checksPlanned:qa.report.checksPassed,sqlExecuted:false}));
 }
});
