import fs from 'node:fs';
import crypto from 'node:crypto';
const origin='https://municipio-junin-friendly.vercel.app';
const release=process.env.GITHUB_SHA||'manual';
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const expected=sha(fs.readFileSync('assets/attendance-clock-operations.js'));
const deadline=Date.now()+210000;
let ready=false;
while(Date.now()<deadline){
 try {
  const response=await fetch(`${origin}/assets/attendance-clock-operations.js?release=${release}`,{signal:AbortSignal.timeout(6000),cache:'no-store'});
  if(response.ok&&sha(Buffer.from(await response.arrayBuffer()))===expected){ready=true;break;}
 } catch {}
 await new Promise(resolve=>setTimeout(resolve,5000));
}
if(!ready)throw new Error('Production clock asset did not match the validated source');
const html=await fetch(`${origin}/relojes-marcaciones.html?release=${release}`,{signal:AbortSignal.timeout(15000),cache:'no-store'});
if(!html.ok||!(await html.text()).includes('data-clock-release="pm10-snapshot-v1"'))throw new Error('Production clock workspace markup missing');
const api=await fetch(`${origin}/api/internal-attendance?resource=clock-operations`,{signal:AbortSignal.timeout(15000),cache:'no-store',redirect:'manual'});
if(api.status!==401&&api.status!==403)throw new Error(`Unauthenticated attendance route must deny access; got ${api.status}`);
const result={release,origin,assetSha256:expected,workspaceMarkupPresent:true,unauthenticatedApiStatus:api.status,authenticatedSessionTested:false,mfaDeliveryTested:false,automaticCollectorVerified:false,checkedAt:new Date().toISOString()};
console.log(JSON.stringify(result,null,2));
fs.mkdirSync('verification',{recursive:true});
fs.writeFileSync('verification/clock-production-smoke.json',JSON.stringify(result,null,2)+'\n');
