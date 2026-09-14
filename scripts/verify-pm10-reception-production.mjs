import fs from 'node:fs';import {createHash} from 'node:crypto';
const origin=process.env.PM10_VERIFY_ORIGIN||'https://municipio-junin-friendly.vercel.app';
if(!/^https:\/\/municipio-junin-friendly(?:-[a-z0-9]+-marcelos-projects-c26aa499)?\.vercel\.app$/.test(origin))throw Error('UNEXPECTED_VERIFICATION_ORIGIN');
const files=['relojes-marcaciones.html','assets/pm10-reception.js','assets/pm10-reception.css','assets/clock-dashboard.js'];
const hash=b=>createHash('sha256').update(b).digest('hex'),commit=process.env.GITHUB_SHA||'manual';const expected=Object.fromEntries(files.map(f=>[f,hash(fs.readFileSync(f))]));let ready=false;const end=Date.now()+240000;
while(Date.now()<end){try{let ok=true;for(const f of files){const r=await fetch(origin+'/'+f+'?release='+commit,{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok||hash(Buffer.from(await r.arrayBuffer()))!==expected[f]){ok=false;break;}}if(ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,5000));}
if(!ready)throw Error('PM10_RECEPTION_NOT_PUBLISHED');
const get=await fetch(origin+'/api/attendance-pm10',{redirect:'manual',signal:AbortSignal.timeout(15000)});if(get.status!==405)throw Error('PM10_GET_NOT_REJECTED');
const post=await fetch(origin+'/api/attendance-pm10',{method:'POST',headers:{'content-type':'application/json'},body:'{}',redirect:'manual',signal:AbortSignal.timeout(15000)});if(post.status!==401)throw Error('PM10_ANONYMOUS_POST_NOT_REJECTED');
const status=await fetch(origin+'/api/internal-attendance?resource=pm10-reception',{redirect:'manual',signal:AbortSignal.timeout(15000)});if(![401,403].includes(status.status))throw Error('PM10_STATUS_NOT_PRIVATE');
fs.mkdirSync('verification',{recursive:true});fs.writeFileSync('verification/pm10-reception-production.json',JSON.stringify({commit,checkedAt:new Date().toISOString(),publishedAssetsMatch:true,expected,receiverGetStatus:get.status,anonymousIngestStatus:post.status,anonymousStatusRead:status.status,realMunicipalSessionTested:false,physicalClockTested:false,authorizedIngestInvoked:false},null,2));
