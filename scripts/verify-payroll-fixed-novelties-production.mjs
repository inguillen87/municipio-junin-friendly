/** Read-only publication checks. Never authenticates or creates municipal records. */
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {publishedBuildVerification} from './lib/published-build-verification.mjs';

const origin='https://municipio-junin-friendly.vercel.app';
const commit=process.env.GITHUB_SHA || 'manual';
const files=['novedades-nomina.html','assets/payroll-novelty-workbench.js',
  'assets/payroll-fixed-novelties.js','assets/payroll-fixed-novelties-model.js',
  'assets/payroll-fixed-novelties-export.js','assets/payroll-fixed-novelties.css',
  'assets/employee-picker.js','assets/native-employee-create.js',
  'assets/app-routes.js','sw.js'];
const build=publishedBuildVerification({origin,release:commit});
const expected=build.expectedHashes(files);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
let ready=false;
const deadline=Date.now()+240000;
while(Date.now()<deadline){
  try{
    const matches=await Promise.all(files.map(async file=>{
      const response=await build.fetchFile(file,10000);
      return response.status===200 && hash(Buffer.from(await response.arrayBuffer()))===expected[file];
    }));
    if(matches.every(Boolean)){ready=true;break;}
  }catch{/* Retry public static reads while the production alias changes. */}
  await new Promise(resolve=>setTimeout(resolve,5000));
}
if(!ready)throw Error('FIXED_NOVELTIES_PUBLISHED_BUILD_MISMATCH');
const denied={};
const queries={bootstrap:'?resource=bootstrap',list:'?resource=list&periodMonth=2026-09-01',
  employee:'?resource=employee&legajo=99999999999999999999',
  nativeEmployee:'?resource=employee&contractId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  detail:'?resource=detail&recordId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  attempt:'?resource=attempt&command=propose&key=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  export:'?resource=export&periodMonth=2026-09-01&snapshotToken='+'a'.repeat(64)};
async function check(name,query,options={}){
  const response=await fetch(origin+'/api/internal-payroll-fixed-novelties'+query,
    {...options,credentials:'omit',redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(![401,403].includes(response.status))throw Error('FIXED_NOVELTIES_ANONYMOUS_ACCESS_NOT_DENIED:'+name);
  if(!/no-store/.test(response.headers.get('cache-control') || ''))throw Error('FIXED_NOVELTIES_PRIVATE_CACHE_HEADERS_MISSING:'+name);
  denied[name]=response.status;
}
for(const [name,query] of Object.entries(queries))await check(name,query);
await check('propose','',{method:'POST',headers:{origin,'content-type':'application/json','idempotency-key':'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},body:JSON.stringify({command:'propose',payload:{}})});
await check('review','',{method:'POST',headers:{origin,'content-type':'application/json','idempotency-key':'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},body:JSON.stringify({command:'review',payload:{}})});
const result={commit,checkedAt:new Date().toISOString(),origin,publishedAssetsMatch:true,expected,anonymousStatuses:denied,
  realMunicipalSessionTested:false,municipalRecordsCreated:0,grhMutation:false,payrollCalculated:false,payrollPosted:false};
fs.mkdirSync('verification',{recursive:true});
fs.writeFileSync('verification/payroll-fixed-novelties-production.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({commit,publishedAssetsMatch:true,publishedAssets:files.length,anonymousStatuses:denied,realMunicipalSessionTested:false}));
