/** Deterministic, checksummed integration of two reviewed releases; no municipal data access. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
const base='a478c88208814001a0bf00e2c0b8fbc47b167c38';
const ours='e92847bff157f654f2585f566963d6e3951af4e9';
const incoming='fe6c53a8b3cb3cb330558de59ed2e51103c5b9df';
const expected={
  "assets/payroll-novelty-workbench.js": "b51223359df981b10c55105192ba0848df4be852de1b566b5fa51e49a4c47e59",
  "novedades-nomina.html": "1d2495be0bc44d418eb57c5ae4fe0dabd349d0b27c37f00895a2e75e6376ddca",
  "scripts/build-friendly.mjs": "f40bb9edcce1dcf07a156b9729be2b612d5d7d756e6a4ed13523364757ea1f82",
  "tests/payroll-novelty-legajo-list-057.test.js": "88fd5e8a5b8a5f1e8b705f691271612e5c3683bc83953a27250bc29491967b75",
  "scripts/verify-novelty-sheet-057.mjs": "f6b7daaf9008555ef2c3302cb85201af2a4dd58168eb6205be0d63d5dacf2c07"
};
const read=(ref,file)=>execFileSync('git',['show',ref+':'+file],{encoding:'utf8'});
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
function replaceOne(s,a,b){if(s.split(a).length!==2)throw Error('MERGE_ANCHOR_NOT_UNIQUE: '+a.slice(0,60));return s.replace(a,b);}
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'novelty-merge-057-'));
const results=new Map();
try{
 for(const file of ['assets/payroll-novelty-workbench.js','novedades-nomina.html','scripts/build-friendly.mjs']){
  for(const [name,ref]of [['ours',ours],['base',base],['incoming',incoming]])fs.writeFileSync(path.join(temporary,name),read(ref,file));
  const result=spawnSync('git',['merge-file','-p','-L','reviewed-planilla','-L','shared-base','-L','current-production',...['ours','base','incoming'].map(n=>path.join(temporary,n))],{encoding:'utf8'});
  if(result.error||result.status===null||result.status<0||result.status>=128)throw Error('MERGE_TOOL_FAILED');
  let s=result.stdout.replace(/^<<<<<<<[^\n]*\n([\s\S]*?)^=======\n([\s\S]*?)^>>>>>>>[^\n]*\n/gm,(_m,a,b)=>{
   if(file.endsWith('workbench.js')){
    if(a.startsWith('import '))return a+b;
    if(a.includes('principalChanged'))return b+'      sheetEditor?.clear();\n';
    if(a.includes('pagehide'))return replaceOne(b,'    agileDraftRows','    sheetEditor.clear();\n    agileDraftRows');
   }
   if(file.endsWith('.html')){
    if(a.startsWith('<link '))return b+a;
    if(a.includes('sourceMode')){const line=a.split('\n').find(l=>l.includes('value="sheet"'));if(!line)throw Error('SHEET_MODE_MISSING');return replaceOne(b,'              <label class="mode"><input type="radio" name="sourceMode" value="bulk"',line+'\n              <label class="mode"><input type="radio" name="sourceMode" value="bulk"');}
   }
   if(file.endsWith('build-friendly.mjs'))return b+a;
   throw Error('UNREVIEWED_MERGE_CONFLICT: '+file);
  });
  if(s.includes('<<<<<<<')||s.includes('>>>>>>>'))throw Error('UNRESOLVED_MERGE');
  if(file.endsWith('workbench.js'))s=replaceOne(s,'  duplicateCheck(rows);\n  const sourceMode','  if (rows.length > agileMaximum()) throw new Error(`Este ámbito admite hasta ${agileMaximum()} filas por lote.`);\n  duplicateCheck(rows);\n  const sourceMode');
  results.set(file,s);
 }
 let file='tests/payroll-novelty-legajo-list-057.test.js',s=read(incoming,file);
 s=replaceOne(s,"import fs from 'node:fs';","import fs from 'node:fs';\nimport vm from 'node:vm';");
 s=replaceOne(s,"  assert.match(s,/entryMode === 'agile' \\? 'bulk' : entryMode/);","  const mapping = s.match(/const sourceMode = ([^\\n]+);/);\n  assert.ok(mapping);\n  for (const [entryMode,expected] of [['agile','bulk'],['sheet','bulk'],['bulk','bulk'],['individual','individual']]) assert.equal(vm.runInNewContext(mapping[1],{entryMode}),expected);");
 results.set(file,s);
 file='scripts/verify-novelty-sheet-057.mjs';s=read(ours,file);
 s=replaceOne(s,'slowPost=false;','slowPost=false,maxRows=500;');
 s=replaceOne(s,'maxRows:500,payrollTypes','maxRows,payrollTypes');
 s=replaceOne(s," await addGroup('5001');"," maxRows=2;await page.locator('#refreshButton').click();await page.locator('#preflightButton:enabled').waitFor();await addGroup('4101\\n4102\\n4103');await validate();assert.equal(await page.locator('#prepareButton').isDisabled(),true);assert.match(await page.locator('#messageHost').innerText(),/hasta 2 filas/);checks.push('native planilla respects smaller server-declared batch limit before any POST');\n maxRows=500;await page.locator('#refreshButton').click();await page.locator('#sheetEmpty:visible').waitFor();checks.push('change of server limits clears native staged rows and review');\n await addGroup('5001');");
 results.set(file,s);
 for(const[file,content]of results)if(digest(content)!==expected[file])throw Error('REVIEWED_MERGE_HASH_MISMATCH: '+file);
 for(const[file,content]of results)fs.writeFileSync(file,content);
 console.log(JSON.stringify({reviewedIntegration:true,incoming,files:[...results.keys()]}));
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
