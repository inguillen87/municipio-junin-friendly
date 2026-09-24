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
