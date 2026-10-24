import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('leave and self-service browser module imports are all copied by the build asset list',()=>{
 // Read the manifest as source. Never import/run the build or create an output.
 const build=fs.readFileSync(new URL('../scripts/build-friendly.mjs',import.meta.url),'utf8');
 const declaration=build.match(/\bconst\s+shellFiles\s*=\s*\[([\s\S]*?)\];/);assert.ok(declaration);
 const copied=new Set([...declaration[1].matchAll(/['"]([^'"]+)['"]/g)].map(match=>match[1]));
 const pending=['assets/native-leave.js','assets/native-self.js'],visited=new Set();
 while(pending.length){
  const file=pending.pop();if(visited.has(file))continue;visited.add(file);assert.ok(copied.has(file),'Missing browser module in build asset list: '+file);
  const source=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
  for(const match of source.matchAll(/^import\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"];?/gm)){
   assert.ok(match[1].startsWith('.'),'Unexpected nonlocal browser import: '+match[1]);
   pending.push(path.posix.normalize(path.posix.join(path.posix.dirname(file),match[1])));
  }
 }
 assert.ok(visited.has('assets/native-leave-access.js'),'The new session helper must be in the actual consumer import graph');
});
