// Fixed public assets only. No sessions, APIs, cookies, nominal data or writes.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const origin='https://municipio-junin-friendly.vercel.app',hash=b=>createHash('sha256').update(b).digest('hex');
const consumers=[['legal-registry','juridica-registro.html','/juridica'],['payroll-parameters','assets/payroll-parameters-loader.js','/assets/payroll-parameters-loader.js'],['report-catalog','assets/report-centre.js','/assets/report-centre.js'],['leave-rules','licencias-control.html','/licencias']];
async function get(url,maxBytes){
 assert.equal(url.origin,origin);assert.ok(!url.pathname.startsWith('/api/'));
 const r=await fetch(url,{method:'GET',credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});assert.equal(r.status,200,'Public resource unavailable');assert.ok(r.body);
 const reader=r.body.getReader(),parts=[];let length=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;assert.ok(length<=maxBytes,'Public resource exceeds comparison budget');parts.push(value);}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 return Buffer.concat(parts,length);
}
const modules=[];
for(const [name,consumer,route] of consumers){
 const localConsumer=await fs.readFile(path.join('public',consumer)),remoteConsumer=await get(new URL(route,origin),1048576);
 assert.ok(localConsumer.equals(remoteConsumer),'Consumer bytes differ: '+name);
 const expression=new RegExp('(/assets/islands/'+name+'-[A-Z0-9]+\\.js)');
 const match=localConsumer.toString('utf8').match(expression);assert.ok(match,'Compiled module reference missing: '+name);
 const file=match[1],local=await fs.readFile(path.join('public',file.slice(1))),remote=await get(new URL(file,origin),1048576);
 assert.ok(local.equals(remote),'Module bytes differ: '+name);
 modules.push({name,consumer,asset:file,bytes:local.length,sha256:hash(local),exactMatch:true});
}
const output='verification/public-island-parity';await fs.mkdir(output,{recursive:true});
const report={ok:true,checkedAt:new Date().toISOString(),commit:process.env.GITHUB_SHA||null,modules,privateApiRequests:0,productionWrites:0};
await fs.writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
