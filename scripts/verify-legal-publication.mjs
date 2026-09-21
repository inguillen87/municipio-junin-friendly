// Live read-only publication check. No session, database connection or municipal mutation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const origin=new URL(process.env.LEGAL_PUBLICATION_ORIGIN||'https://municipio-junin-friendly.vercel.app').origin;
const mode=process.argv.includes('--alerts-only')?'alerts':'alerts-and-relations';
const assets=['internal-legal-alert-center.html','assets/legal-alert-center-model.js','assets/legal-alert-center-ui.js','assets/legal-alert-center.css','assets/legal-registry-model.js','assets/internal-capability-gate.js'];
if(mode!=='alerts')assets.push('internal-legal-norm-relations.html','assets/legal-norm-relations-model.js','assets/legal-norm-relations-ui.js','assets/legal-norm-relations.css');
const checks=[];
for(const asset of assets){
 const response=await fetch(origin+'/'+asset,{cache:'no-store',signal:AbortSignal.timeout(30000)});
 assert.equal(response.status,200,asset+' status');
 const actual=Buffer.from(await response.arrayBuffer()),expected=fs.readFileSync('public/'+asset);
 const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
 assert.equal(digest(actual),digest(expected),asset+' differs from the reviewed build');
 checks.push({asset,bytes:actual.length,sha256:digest(actual)});
}
const endpoints=['/api/internal-legal-alert-center?resource=alerts'];
if(mode!=='alerts')endpoints.push('/api/internal-legal-norm-relations?resource=bootstrap&sourceNormId=11111111-1111-4111-8111-111111111111&sourceVersion=1');
const denials=[];
for(const endpoint of endpoints){
 const response=await fetch(origin+endpoint,{cache:'no-store',signal:AbortSignal.timeout(30000)});
 assert.equal(response.status,401,endpoint+' must reject unauthenticated reads');
 assert.match(response.headers.get('cache-control')||'',/no-store/);
 const body=await response.json();assert.equal(body.ok,false);assert.equal(body.data,undefined);
 denials.push({endpoint,status:response.status});
}
const report={ok:true,verifiedAt:new Date().toISOString(),origin,commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),mode,assets:checks,anonymousApi:denials,authenticatedMunicipalSessionTested:false,municipalWrites:0};
fs.mkdirSync('verification/legal-publication',{recursive:true});
fs.writeFileSync('verification/legal-publication/'+mode+'.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
