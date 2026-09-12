/** Read-only production verification. Does not authenticate or submit a novelty. */
import fs from 'node:fs';
import crypto from 'node:crypto';
const origin='https://municipio-junin-friendly.vercel.app';
const files=['novedades-nomina.html','assets/payroll-novelty-workbench.js','assets/payroll-novelty-review.js','assets/payroll-novelty-review-panel.js','assets/payroll-novelty-review.css','assets/payroll-novelty-sheet.js','assets/payroll-novelty-sheet-model.js','assets/payroll-novelty-sheet.css'];
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const expected=Object.fromEntries(files.map(p=>[p,hash(fs.readFileSync(p))]));
const commit=process.env.GITHUB_SHA||'manual',deadline=Date.now()+240000;
let published=false;
while(Date.now()<deadline){
  try{
    let matches=true;
    for(const file of files){
      const r=await fetch(origin+'/'+file+'?release='+commit,{cache:'no-store',signal:AbortSignal.timeout(10000)});
      if(!r.ok||hash(Buffer.from(await r.arrayBuffer()))!==expected[file]){matches=false;break;}
    }
    if(matches){published=true;break;}
  }catch{}
  await new Promise(resolve=>setTimeout(resolve,5000));
}
if(!published)throw Error('NOVELTY_SHEET_057_NOT_PUBLISHED');
const r=await fetch(origin+'/api/internal-payroll-novelties?resource=bootstrap',{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(15000)});
if(![401,403].includes(r.status))throw Error('NOVELTY_SHEET_057_ANONYMOUS_NOT_DENIED');
if(!/no-store/.test(r.headers.get('cache-control')||''))throw Error('NOVELTY_SHEET_057_PRIVATE_RESPONSE_CACHE');
fs.mkdirSync('verification',{recursive:true});fs.writeFileSync('verification/novelty-sheet-057-production.json',JSON.stringify({commit,checkedAt:new Date().toISOString(),publishedAssetsMatch:true,expected,anonymousStatus:r.status,cacheControl:r.headers.get('cache-control'),realMunicipalSessionTested:false,productionApiWrites:0},null,2));
console.log(JSON.stringify({publishedAssetsMatch:true,anonymousStatus:r.status}));
