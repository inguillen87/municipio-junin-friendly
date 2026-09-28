import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {verifyBudgetPublication,BUDGET_PUBLICATION_FILES,BUDGET_PUBLICATION_ORIGIN} from '../scripts/verify-budget-cotejo-publication.mjs';
const commit='a'.repeat(40),other='b'.repeat(40);
const release={version:'municontrol-release.v1',commitSha:commit,sourceState:'committed',adminUiSha256:'c'.repeat(64)};
function response(url,body,{status=200,type='application/json',headers={},redirected=false}={}){
 const r=new Response(body,{status,headers:{'content-type':type,...headers}});
 Object.defineProperties(r,{url:{value:url},redirected:{value:redirected}});return r;
}
function fixture(t,reply=()=>undefined){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'municontrol-publication-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'assets'));
 fs.writeFileSync(path.join(root,'release-info.json'),JSON.stringify(release));
 const bytes=Object.fromEntries(BUDGET_PUBLICATION_FILES.map(file=>[file,Buffer.from('// synthetic '+file+'\n')]));
 for(const [file,content]of Object.entries(bytes))fs.writeFileSync(path.join(root,file),content);
 const calls=[],waits=[],reports=[];let attempt=1;
 const fetchImpl=async(url,options)=>{
  const file=url.slice(BUDGET_PUBLICATION_ORIGIN.length+1);calls.push({file,options,attempt,url});
  const altered=await reply(file,{url,options,attempt,calls,bytes});if(altered!==undefined)return altered;
  if(file==='release-info.json')return response(url,JSON.stringify(release));
  if(file.startsWith('api/'))return response(url,'{"ok":false}',{status:401,headers:{'cache-control':'private, no-store'}});
  return response(url,bytes[file],{type:file.endsWith('.css')?'text/css':'application/javascript'});
 };
 const run=options=>verifyBudgetPublication({root,fetchImpl,maxAttempts:3,pauseMs:0,
  wait:async(ms,signal)=>{signal.throwIfAborted();waits.push(ms);},onAttempt:report=>{reports.push(structuredClone(report));attempt=report.attempts.at(-1).attempt+1;},...options});
 return{root,run,calls,waits,reports,bytes};
}
test('certifies one expected committed release with all nine assets and anonymous denials',async t=>{
 const f=fixture(t),result=await f.run();assert.equal(result.ok,true);assert.equal(result.commit,commit);
 assert.equal(result.assets.length,9);assert.equal(result.anonymousAccess.length,2);assert.equal(result.releaseStable,true);
 assert.equal(f.calls.filter(c=>c.file==='release-info.json').length,3);assert.equal(f.waits.length,0);
 assert.ok(f.calls.every(c=>c.options.method==='GET'&&c.options.credentials==='omit'&&c.options.redirect==='manual'&&c.options.cache==='no-store'));
 assert.ok(f.calls.every(c=>!c.options.headers.Authorization&&!c.options.headers.Cookie));
 assert.ok(f.calls.filter(c=>c.file.startsWith('api/')).every(c=>!c.file.includes('datasetId')));
});
test('waits for the exact commit rather than unchanged catalog assets from an older release',async t=>{
 const f=fixture(t,(file,{url,attempt})=>file==='release-info.json'&&attempt===1?response(url,JSON.stringify({...release,commitSha:other})):undefined);
 const result=await f.run();assert.equal(result.ok,true);assert.equal(result.attempts.length,2);
 assert.equal(result.attempts[0].code,'RELEASE_NOT_EXPECTED');assert.equal(f.calls.filter(c=>c.attempt===1).length,1);
 assert.equal(f.waits.length,1);
});
test('stale asset is retried as a complete round and must exactly match before success',async t=>{
 const file=BUDGET_PUBLICATION_FILES[0],f=fixture(t,(target,{url,attempt})=>target===file&&attempt===1?response(url,'// stale',{type:'application/javascript'}):undefined);
 const result=await f.run();assert.equal(result.attempts.length,2);assert.equal(result.attempts[0].code,'ASSET_MISMATCH');
 assert.equal(result.attempts[0].file,file);assert.equal(result.assets.length,9);
 assert.equal(f.calls.filter(c=>BUDGET_PUBLICATION_FILES.includes(c.file)).length,18);
 assert.equal(f.calls.filter(c=>c.attempt===1&&c.file.startsWith('api/')).length,0);
});
test('permanent mismatch remains a failure with no successful assets accumulated',async t=>{
 const f=fixture(t,(file,{url})=>file===BUDGET_PUBLICATION_FILES[0]?response(url,'// wrong',{type:'application/javascript'}):undefined);
 await assert.rejects(f.run(),error=>{assert.equal(error.message,'BUDGET_PUBLICATION_NOT_VERIFIED');assert.equal(error.report.ok,false);assert.equal(error.report.attempts.length,3);assert.deepEqual(error.report.assets,[]);return true;});
 assert.equal(f.waits.length,2);
});
test('does not assemble a certificate from assets that only match in different rounds',async t=>{
 const f=fixture(t,(file,{url,attempt})=>file===BUDGET_PUBLICATION_FILES[(attempt-1)%2]?response(url,'old',{type:'application/javascript'}):undefined);
 await assert.rejects(f.run(),e=>{assert.equal(e.report.attempts.length,3);assert.deepEqual(e.report.assets,[]);return true;});
});
test('release changes during the asset read invalidate the entire round',async t=>{
 let reads=0;const f=fixture(t,(file,{url,attempt})=>{if(file==='release-info.json'&&attempt===1&&++reads===2)return response(url,JSON.stringify({...release,commitSha:other}));});
 const result=await f.run();assert.equal(result.attempts.length,2);assert.equal(result.attempts[0].code,'RELEASE_NOT_EXPECTED');
 assert.equal(f.calls.filter(c=>c.attempt===1&&c.file.startsWith('api/')).length,0);
});
test('release changes during anonymous probes also withdraw the candidate certificate',async t=>{
 let reads=0;const f=fixture(t,(file,{url,attempt})=>{if(file==='release-info.json'&&attempt===1&&++reads===3)return response(url,JSON.stringify({...release,commitSha:other}));});
 const result=await f.run();assert.equal(result.attempts.length,2);assert.equal(f.calls.filter(c=>c.file.startsWith('api/')).length,4);
});
for(const status of [404,429,500,503])test('temporary public HTTP '+status+' can recover without skipping checks',async t=>{
 const f=fixture(t,(file,{url,attempt})=>file==='release-info.json'&&attempt===1?response(url,'not ready',{status}):undefined);
 const result=await f.run();assert.equal(result.ok,true);assert.equal(result.attempts[0].code,'HTTP_'+status);assert.equal(result.assets.length,9);
});
test('network errors are bounded and their raw text never enters evidence',async t=>{
 const f=fixture(t,()=>{throw Error('secret-token municipal-name connection detail');});
 await assert.rejects(f.run(),e=>{assert.equal(e.report.attempts.length,3);assert.doesNotMatch(JSON.stringify(e.report),/secret|municipal-name|connection detail/);return true;});
});
for(const status of [301,302,307,308,401,403])test('public access redirect or denial is not retried: '+status,async t=>{
 const f=fixture(t,(file,{url})=>file==='release-info.json'?response(url,'',{status,headers:{location:'https://external.invalid/'}}):undefined);
 await assert.rejects(f.run(),e=>{assert.equal(e.report.attempts.length,1);assert.equal(f.waits.length,0);return true;});
});
for(const variant of ['origin','cookie','html','invalid-json','unknown-identity','declared-size','stream-size'])test('rejects malformed public evidence: '+variant,async t=>{
 const f=fixture(t,(file,{url})=>{if(file!=='release-info.json')return;
  if(variant==='origin')return response('https://external.invalid/release-info.json',JSON.stringify(release));
  if(variant==='cookie')return response(url,JSON.stringify(release),{headers:{'set-cookie':'sensitive=hidden'}});
  if(variant==='html')return response(url,JSON.stringify(release),{type:'text/html'});
  if(variant==='invalid-json')return response(url,'{malformed');
  if(variant==='unknown-identity')return response(url,JSON.stringify({...release,sourceState:'unknown',commitSha:null,extra:true}));
  if(variant==='declared-size')return response(url,'{}',{headers:{'content-length':'9999999'}});
  return response(url,' '.repeat(4097));
 });
 await assert.rejects(f.run(),e=>{assert.equal(e.report.attempts.length,1);assert.equal(e.report.assets.length,0);assert.doesNotMatch(JSON.stringify(e.report),/sensitive=hidden/);return true;});
});
for(const variant of ['allowed','no-cache-policy','data','invalid-json'])test('anonymous reader must reject access without exposing data: '+variant,async t=>{
 const f=fixture(t,(file,{url})=>{if(!file.startsWith('api/'))return;
  if(variant==='allowed')return response(url,'{"ok":true,"data":"private-person"}');
  if(variant==='no-cache-policy')return response(url,'{"ok":false}',{status:401});
  return response(url,variant==='data'?' {"ok":false,"data":"private-person"}':'broken',{status:401,headers:{'cache-control':'private, no-store'}});
 });
 await assert.rejects(f.run(),e=>{assert.equal(e.report.ok,false);assert.equal(e.report.attempts.length,1);assert.deepEqual(e.report.anonymousAccess,[]);assert.doesNotMatch(JSON.stringify(e.report),/private-person/);return true;});
});
test('unexpected HTML asset is rejected even when its bytes are otherwise correct',async t=>{
 const f=fixture(t,(file,{url,bytes})=>file===BUDGET_PUBLICATION_FILES[0]?response(url,bytes[file],{type:'text/html'}):undefined);
 await assert.rejects(f.run(),e=>e.report.attempts[0].code==='ASSET_CONTENT_TYPE');
});
for(const variant of ['modified','unknown','wrong-commit','missing-asset'])test('invalid local build fails before any network request: '+variant,async t=>{
 const f=fixture(t);const options={};
 if(variant==='wrong-commit')options.expectedCommit=other;
 else if(variant==='missing-asset')fs.unlinkSync(path.join(f.root,BUDGET_PUBLICATION_FILES[0]));
 else fs.writeFileSync(path.join(f.root,'release-info.json'),JSON.stringify({...release,sourceState:variant,commitSha:null}));
 await assert.rejects(f.run(options));assert.equal(f.calls.length,0);
});
for(const options of [{maxAttempts:0},{maxAttempts:25},{pauseMs:-1},{timeoutMs:31000},{deadlineMs:0}])test('invalid verification budget: '+JSON.stringify(options),async t=>{
 const f=fixture(t);await assert.rejects(f.run(options),/PUBLICATION_OPTIONS_INVALID/);assert.equal(f.calls.length,0);
});
test('cancellation before checking performs no requests',async t=>{
 const f=fixture(t),controller=new AbortController();controller.abort();
 await assert.rejects(f.run({signal:controller.signal}),e=>e.report.attempts[0].code==='CHECK_ABORTED');assert.equal(f.calls.length,0);
});
test('cancellation during propagation stops waiting and cannot preserve a pass',async t=>{
 const controller=new AbortController(),f=fixture(t,(file,{url})=>file==='release-info.json'?response(url,JSON.stringify({...release,commitSha:other})):undefined);
 await assert.rejects(f.run({signal:controller.signal,wait:async()=>{controller.abort();controller.signal.throwIfAborted();}}),e=>{
  assert.equal(e.report.ok,false);assert.equal(e.report.attempts.at(-1).code,'CHECK_ABORTED');assert.deepEqual(e.report.assets,[]);return true;
 });assert.equal(f.calls.length,1);
});
