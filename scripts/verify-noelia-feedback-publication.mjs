// Sólo archivos públicos del despliegue: no lee APIs, registros personales ni sesiones.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const origin='https://municipio-junin-friendly.vercel.app';
const files=[['/personal','internal-dashboard.html'],['/estructura','estructura.html'],
 ['/assets/employee-elapsed-service.js','assets/employee-elapsed-service.js'],
 ['/assets/employee-elapsed-service.css','assets/employee-elapsed-service.css'],
 ['/assets/structure-task-entry.css','assets/structure-task-entry.css']];
const assets=[];
for(const [route,file]of files){
 const expected=fs.readFileSync('public/'+file),response=await fetch(origin+route,{credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});
 assert.equal(response.status,200,'PUBLIC_ASSET_STATUS:'+route);const parts=[];let length=0;
 for await(const bytes of response.body){length+=bytes.length;assert.ok(length<=expected.length,'PUBLIC_ASSET_LENGTH:'+route);parts.push(bytes);}
 const actual=Buffer.concat(parts);assert.ok(actual.equals(expected),'PUBLIC_ASSET_MISMATCH:'+route);
 assets.push({route,bytes:length,sha256:createHash('sha256').update(actual).digest('hex')});
}
const report={checkedAt:new Date().toISOString(),assets,filesMatched:assets.length,credentialsSent:false,privateApiCalls:0};
fs.mkdirSync('verification/noelia-feedback',{recursive:true});fs.writeFileSync('verification/noelia-feedback/publication.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
