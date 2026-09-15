/** Verify published source bytes and anonymous rejection, without using a municipal session. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { publishedBuildVerification } from './lib/published-build-verification.mjs';
const origin='https://municipio-junin-friendly.vercel.app';
const files=['internal-dashboard.html','assets/payroll-summary-pdf.js','assets/payroll-summary-model.js','assets/payroll-history-055.css'];
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const commit=process.env.GITHUB_SHA||'manual',deadline=Date.now()+240000;
const build=publishedBuildVerification({origin,release:commit}),expected=build.expectedHashes(files);
let published=false;
while(Date.now()<deadline) {
  try {
    let matches=true;
    for(const file of files) {
      const response=await build.fetchFile(file,10000);
      if(!response.ok||hash(Buffer.from(await response.arrayBuffer()))!==expected[file]){matches=false;break;}
    }
    if(matches){published=true;break;}
  }catch{}
  await new Promise(resolve=>setTimeout(resolve,5000));
}
if(!published)throw Error('SUMMARY_055_RELEASE_NOT_PUBLISHED');
const response=await fetch(origin+'/api/internal-data?resource=employeepayroll&contractId=00000000-0000-4000-8000-000000000057',{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(15000)});
if(![401,403].includes(response.status))throw Error('SUMMARY_055_ANONYMOUS_NOT_DENIED');
fs.mkdirSync('verification',{recursive:true});
fs.writeFileSync('verification/summary-055-production.json',JSON.stringify({commit,checkedAt:new Date().toISOString(),publishedAssetsMatch:true,expected,anonymousStatus:response.status,realMunicipalSessionTested:false},null,2));
