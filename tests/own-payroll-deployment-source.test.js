import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rules=fs.readFileSync(new URL('../.vercelignore',import.meta.url),'utf8').split(/\r?\n/).map(r=>r.trim()).filter(r=>r&&!r.startsWith('#'));
function included(file){
 const parts=file.split('/');
 for(let i=1;i<=parts.length;i++){
  const prefix=parts.slice(0,i).join('/'),directory=i<parts.length;let keep=true;
  for(const rule of rules){
   const negated=rule.startsWith('!'),pattern=negated?rule.slice(1):rule,folder=pattern.endsWith('/'),glob=folder?pattern.slice(0,-1):pattern;
   if((!folder||directory)&&(path.matchesGlob(prefix,glob)||!glob.includes('/')&&path.matchesGlob(path.posix.basename(prefix),glob)))keep=negated;
  }
  if(!keep)return false;
 }
 return true;
}

test('filtered web build retains real payroll contracts and keeps the clock source outside the web package',()=>{
 for(const file of ['scripts/migrations/122-own-payroll-programs.sql','scripts/migrations/123-own-payroll-runs.sql']){
  assert.equal(included(file),true,'Missing build source: '+file);assert.ok(fs.statSync(new URL('../'+file,import.meta.url)).isFile());
 }
 for(const file of ['.env.local','.handoff/sync-current.json','verification/private.json','grh_junin.backup_2026100115_plataforma.sql.gz','source.txt','local-agents/pm10/store.mjs','local-agents/pm10/file-replacement.mjs','local-agents/pm10/tests/fixtures/lock-before-generation.txt','local-agents/pm10/config.mjs','local-agents/pm10/capture.mjs','local-agents/pm10/state/pending.json','local-agents/pm10/tests/fixtures/private.txt','local-agents/pm10/tests/private.test.mjs','local-agents/clock-fleet/config.json','local-agents/zk40/state/marks.json','local-agents/zk40/runtime.mjs'])assert.equal(included(file),false,'Service included: '+file);
 assert.match(fs.readFileSync(new URL('../.github/workflows/unified-clock-fleet.yml',import.meta.url),'utf8'),/run: node --test tests\/pm10-owner-installation\.test\.mjs/,'clock installer regressions must still run against actual source on both CI platforms');
});
