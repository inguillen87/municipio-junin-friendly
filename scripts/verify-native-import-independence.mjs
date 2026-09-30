// Executable review-only acceptance. Does not impersonate a municipal session or open a database.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import http from 'node:http';import https from 'node:https';import net from 'node:net';
import {performance} from 'node:perf_hooks';
import {previewNativeEntityFile,recheckNativeEntityPreview,retireNativeEntityPreview} from '../lib/native-entity-import-preview.js';
import {registryFixture,id} from '../tests/fixtures/native-import-registry.js';
const core=fs.readFileSync('lib/native-payroll-import-review.js','utf8');
assert.doesNotMatch(core,/GRH|GAT|GAF|source_system|sourceBinding|source_batch|legacy_|fetch\s*\(|\.query\s*\(/);
assert.doesNotMatch(core,/\beval\s*\(|new\s+Function|\bimport\s*\(/);
let attempts=0;const denied=()=>{attempts++;throw Error('External access is forbidden in native review acceptance');};
const old={fetch:globalThis.fetch,http:http.request,httpGet:http.get,https:https.request,httpsGet:https.get,connect:net.connect,createConnection:net.createConnection};
const results=[];
try{
 globalThis.fetch=denied;http.request=denied;http.get=denied;https.request=denied;https.get=denied;net.connect=denied;net.createConnection=denied;
 for(const count of [12,14,759,2000]){
  const f=registryFixture(count),start=performance.now(),view=previewNativeEntityFile(f.registry,f.file,f.options);
  assert.equal(view.review.ready,true);assert.equal(view.review.inputRows,count);assert.equal(view.review.resolvedRows,count);assert.equal(view.review.rows.length,count);
  assert.equal(view.review.rows.at(-1).subject.id,f.registry.contracts.at(-1).id);
  for(let i=0;i<count;i++){assert.equal(view.review.rows[i].amountCents,f.rows[i].amountCents);assert.equal(view.review.rows[i].dni,f.rows[i].dni);}
  assert.equal(recheckNativeEntityPreview(view,f.registry),view);
  results.push({rows:count,resolved:count,omitted:0,durationMs:Math.round((performance.now()-start)*100)/100,reviewToken:view.token});retireNativeEntityPreview(view);
 }
 const f=registryFixture(12),first=previewNativeEntityFile(f.registry,f.file,f.options);f.registry.contracts[0].personId=id(90000);
 assert.throws(()=>recheckNativeEntityPreview(first,f.registry),{code:'NATIVE_IMPORT_REGISTRY_CHANGED'});retireNativeEntityPreview(first);
 assert.equal(attempts,0);
}finally{globalThis.fetch=old.fetch;http.request=old.http;http.get=old.httpGet;https.request=old.https;https.get=old.httpsGet;net.connect=old.connect;net.createConnection=old.createConnection;}
const report={ok:true,checkedAt:new Date().toISOString(),scope:'Native registry and TXT identity review only',cases:results,externalAttempts:attempts,
 databaseConnections:0,sourceBindings:0,legacyServersUsed:0,backupsUsed:0,municipalRecordsUsed:false,recordsPersisted:0,payrollCalculated:false,
 limitations:['Registry fixtures are synthetic, not an authenticated municipal directory.','No persistence, permission, payroll or production acceptance is implied.','The compatible Junin55 reader is a file boundary; other unverified profiles remain excluded.']};
fs.mkdirSync('verification/native-import',{recursive:true});fs.writeFileSync(path.join('verification/native-import','independence.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
