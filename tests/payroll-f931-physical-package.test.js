import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import fs from 'node:fs';
import {F931_PHYSICAL_MAX_BYTES,F931_PHYSICAL_MAX_ROWS,compareF931PhysicalPackage,f931PhysicalProof,f931PhysicalCsv} from '../assets/payroll-f931-physical-package-model.js';

const row=(id,width=463)=>new Uint8Array(Buffer.from(('QA-ROW-'+id+' ').padEnd(width,'X'),'ascii'));
const file=(rows,ending='\r\n',final=true)=>new Uint8Array(Buffer.concat(rows.flatMap((r,i)=>i<rows.length-1||final?[Buffer.from(r),Buffer.from(ending)]:[Buffer.from(r)])));
const input=(g,j42,j55)=>({period:'2026-08',artifacts:[{scope:'general',bytes:g},{scope:'jurisdiction_42',bytes:j42},{scope:'jurisdiction_55',bytes:j55}]});
const run=value=>compareF931PhysicalPackage(value,{cryptoImpl:webcrypto});

test('counts every repeated occurrence and exact distinct intersections without treating rows as people',async()=>{
 const a=row('A'),b=row('B'),c=row('C'),d=row('D');
 const result=await run(input(file([a,a,b,c]),file([a,b,b]),file([b,d])));
 assert.equal(result.physicalRowCountSum,9);assert.equal(result.physicalRowCountSumIsPeople,false);
 assert.deepEqual(result.artifacts.map(a=>[a.physicalRows,a.distinctRows,a.repeatedOccurrences,a.repeatedRowKinds]),[[4,3,1,1],[3,2,1,1],[2,2,0,0]]);
 assert.deepEqual(result.pairs.map(p=>p.sharedDistinctRows),[2,1,1]);
 assert.deepEqual(result.generalVersusJurisdictionUnion,{generalDistinctRows:3,jurisdictionUnionDistinctRows:3,sharedDistinctRows:2,generalOnlyDistinctRows:1,jurisdictionOnlyDistinctRows:1});
 assert.equal(result.complete,true);assert.equal(Object.isFrozen(result.artifacts[0]),true);assert.equal(result.canGenerate,false);assert.equal(result.canSubmit,false);
});

test('the full scope exceeds500rows and row differences never cause a fiscal rejection',async()=>{
 const general=Array.from({length:759},(_,i)=>row(i)),j42=general.slice(0,731),j55=general.slice(600);
 const result=await run(input(file(general),file(j42),file(j55)));
 assert.equal(result.artifacts[0].physicalRows,759);assert.equal(result.artifacts[0].distinctRows,759);
 assert.deepEqual(result.pairs.map(p=>p.sharedDistinctRows),[731,159,131]);
 assert.equal(result.generalVersusJurisdictionUnion.sharedDistinctRows,759);assert.equal(result.fiscalPopulationValidated,false);
 const csv=f931PhysicalCsv(result);assert.ok(csv.includes('"General";"Filas físicas";"759"'));assert.ok(csv.includes('"Filas distintas compartidas";"759"'));
});

test('compares any row widths including499and mixed line endings without a historical-layout gate',async()=>{
 const a=row('SAME',499),g=file([a,a],'\r\n'),j=file([a,a],'\n');
 const result=await run(input(g,j,file([row('OTHER',1)],'\r',false)));
 assert.equal(result.artifacts[0].minRowBytes,499);assert.equal(result.artifacts[1].lineEndings.lf,2);
 assert.equal(result.pairs[0].sharedDistinctRows,1);assert.equal(result.pairs[0].identicalFileBytes,false);
 assert.equal(result.artifacts[2].lineEndings.unterminated,1);assert.equal(result.fiscalLayoutValidated,false);
});

test('byte comparison preserves encoding differences, spaces and every original byte',async()=>{
 const cp=new Uint8Array([65,0xe9,32]),utf=new Uint8Array([65,0xc3,0xa9,32]),trimmed=new Uint8Array([65,0xe9]);
 const result=await run(input(file([cp]),file([utf]),file([trimmed])));
 assert.deepEqual(result.pairs.map(p=>p.sharedDistinctRows),[0,0,0]);
 assert.equal(result.generalVersusJurisdictionUnion.generalOnlyDistinctRows,1);
});

test('identical files, empty physical rows and duplicate counts remain explicit and unchanged',async()=>{
 const bytes=new Uint8Array(Buffer.from('\r\n\r\nQA\r\n','ascii'));
 const result=await run(input(bytes,bytes,bytes));
 assert.ok(result.pairs.every(p=>p.identicalFileBytes));assert.equal(result.artifacts[0].physicalRows,3);
 assert.equal(result.artifacts[0].blankRows,2);assert.equal(result.artifacts[0].minRowBytes,0);assert.equal(result.artifacts[0].repeatedOccurrences,1);
 assert.equal(result.canGenerate,false);
});

test('CSV has complete counts and fixed text only; no bytes, filenames, identifiers or digests',async()=>{
 const marker='PERSONA-PRIVADA-20123456786-=HYPERLINK';const secret=row(marker);
 const result=await run(input(file([secret,secret]),file([row('TWO')]),file([row('THREE')])));
 const serialized=JSON.stringify(result),csv=f931PhysicalCsv(result);
 for(const text of [serialized,csv])assert.doesNotMatch(text,/PERSONA-PRIVADA|20123456786|HYPERLINK|sha256|[a-f0-9]{64}/i);
 assert.ok(csv.startsWith('\ufeff'));assert.ok(csv.endsWith('\r\n'));assert.equal(csv.split('\r\n').length,53);
 assert.ok(csv.includes('No acredita diseño vigente, aceptación fiscal ni envío'));
 assert.throws(()=>f931PhysicalCsv(structuredClone(result)),/UNVERIFIED_RESULT/);
 assert.throws(()=>f931PhysicalCsv({}),/UNVERIFIED_RESULT/);
});

test('same totals with different content produce different privateproofs and require a fresh review',async()=>{
 const a=await run(input(file([row('A')]),file([row('B')]),file([row('C')])));
 const b=await run(input(file([row('D')]),file([row('E')]),file([row('F')])));
 assert.deepEqual(a,b);assert.notEqual(f931PhysicalProof(a),f931PhysicalProof(b));
 const reordered=await run({...input(file([row('A')]),file([row('B')]),file([row('C')])),artifacts:[...input(file([row('A')]),file([row('B')]),file([row('C')])).artifacts].reverse()});
 assert.deepEqual(a,reordered);assert.equal(f931PhysicalProof(a),f931PhysicalProof(reordered));
});

test('the full operation fails for missing, ambiguous, empty or oversized inputs; no partial output',async()=>{
 const valid=input(file([row('A')]),file([row('B')]),file([row('C')]));
 await assert.rejects(run({...valid,period:'2026-13'}),/PERIOD_INVALID/);
 await assert.rejects(run({...valid,period:'=HYPERLINK'}),/PERIOD_INVALID/);
 await assert.rejects(run({...valid,artifacts:valid.artifacts.slice(0,2)}),/THREE_FILES_REQUIRED/);
 await assert.rejects(run({...valid,artifacts:valid.artifacts.map(a=>({...a,scope:'general'}))}),/SCOPES_INVALID/);
 await assert.rejects(run(input(new Uint8Array(),file([row('B')]),file([row('C')]))),/BYTES_INVALID/);
 await assert.rejects(run(input(new Uint8Array(F931_PHYSICAL_MAX_BYTES+1),file([row('B')]),file([row('C')]))),/BYTES_INVALID/);
 await assert.rejects(run(input(new Uint8Array(F931_PHYSICAL_MAX_ROWS+1).fill(10),file([row('B')]),file([row('C')]))),/TOO_MANY_ROWS/);
});

test('source buffers are captured before asynchronous cryptography and withdrawn work cannot return',async()=>{
 const bytes=file([row('SOURCE')]),original=new Uint8Array(bytes),value=input(bytes,file([row('B')]),file([row('C')]));
 const pending=run(value);bytes.fill(90);const result=await pending;
 const fresh=await run(input(original,file([row('B')]),file([row('C')])));assert.equal(f931PhysicalProof(result),f931PhysicalProof(fresh));
 let allowed=true;const next=compareF931PhysicalPackage(value,{cryptoImpl:webcrypto,valid:()=>allowed});allowed=false;
 await assert.rejects(next,e=>e.name==='AbortError');
});

test('product integration registers all assets and preserves disabled fiscal actions and local privacy',()=>{
 const model=fs.readFileSync(new URL('../assets/payroll-f931-physical-package-model.js',import.meta.url),'utf8'),panel=fs.readFileSync(new URL('../assets/payroll-f931-physical-package-panel.js',import.meta.url),'utf8');
 for(const source of [model,panel])assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB|console\.|innerHTML|outerHTML|file\.name|source\.name/);
 const build=fs.readFileSync(new URL('../scripts/build-friendly.mjs',import.meta.url),'utf8'),sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8'),workbench=fs.readFileSync(new URL('../assets/payroll-f931-workbench.js',import.meta.url),'utf8');
 for(const name of ['payroll-f931-physical-package-model.js','payroll-f931-physical-package-panel.js','payroll-f931-physical-package.css']){assert.ok(build.includes("'assets/"+name+"'"));assert.ok(sw.includes("'/assets/"+name+"'"));}
 assert.match(workbench,/mountF931PhysicalPackage\(root, options.physicalPackage\)/);assert.match(workbench,/nodes\.generate\.disabled = true/);assert.match(workbench,/nodes\.submit\.disabled = true/);
});
