// Public assets and one unauthenticated denial only; never a municipal session.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
export async function verifyPrepartePublication(output) {
  const origin = 'https://municipio-junin-friendly.vercel.app';
  const paths = ['assets/attendance-preparte-model.js','assets/attendance-preparte-panel.js',
    'assets/attendance-preparte-export.js','assets/attendance-preparte.css',
    'assets/payroll-novelty-workbench.js','assets/payroll-novelty-sheet.js','assets/payroll-novelty-sheet-model.js'];
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const expected = Object.fromEntries(paths.map(file => [file,hash(fs.readFileSync('public/'+file))]));
  for (let attempt=1;attempt<=12;attempt++) {
    try {
      for (const file of paths) {
        const response=await fetch(origin+'/'+file,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
        assert.equal(response.status,200,file);
        assert.equal(hash(Buffer.from(await response.arrayBuffer())),expected[file],'Published bytes: '+file);
      }
      break;
    } catch(error) { if(attempt===12)throw error;console.log('Publication pending: '+error.message.split('\n')[0]);await sleep(5000); }
  }
  const response=await fetch(origin+'/api/internal-attendance?resource=clock-preparte&site=pm-10&period=2026-09',
    {cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,401,'Anonymous preparte requests must be denied');
  assert.match(response.headers.get('cache-control')||'',/no-store/);
  const result={ok:true,commit:process.env.GITHUB_SHA||null,checkedAt:new Date().toISOString(),expected,
    anonymousStatus:response.status,municipalSessionTested:false,realApiWrites:0};
  fs.writeFileSync(output+'/publication.json',JSON.stringify(result,null,2));return result;
}
