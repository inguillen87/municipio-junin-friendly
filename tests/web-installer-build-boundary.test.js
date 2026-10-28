import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=name=>readFileSync(new URL(name,root),'utf8');
test('web QA and Windows installer QA have explicit, non-overlapping source boundaries',()=>{
 const pkg=JSON.parse(read('package.json'));
 assert.match(pkg.scripts.test,/node --test tests\/\*\.test\.js/);
 assert.match(read('.vercelignore'),/^local-agents\/$/m);
 assert.equal(existsSync(new URL('tests/clock-installer-task-policy.test.js',root)),false);
 assert.ok(existsSync(new URL('tests/clock-installer-task-policy.test.mjs',root)));
 const workflow=read('.github/workflows/clock-windows-installer.yml');
 assert.match(workflow,/runs-on: windows-latest/);
 assert.match(workflow,/node --test[^\n]*tests\/clock-installer-task-policy\.test\.mjs/);
 assert.match(workflow,/gh release view clock-installer-v1\.1\.0/);
 assert.doesNotMatch(workflow,/--clobber/);
});
test('Vercel bounds file concurrency while retaining every web gate before packaging',()=>{
 const pkg=JSON.parse(read('package.json')),config=JSON.parse(read('vercel.json'));
 assert.equal(pkg.scripts.test,'node scripts/verify-platform-baseline.mjs && node scripts/verify-friendly-containment.mjs && node --test tests/*.test.js');
 assert.equal(pkg.scripts.build,'npm run test && node scripts/build-friendly.mjs');
 assert.equal(config.buildCommand,'node scripts/verify-platform-baseline.mjs && node scripts/verify-friendly-containment.mjs && node --test --test-concurrency=4 tests/*.test.js && node scripts/build-friendly.mjs');
});
