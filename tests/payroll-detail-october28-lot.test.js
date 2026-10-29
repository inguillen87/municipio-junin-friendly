// PROPOSED by Claude (source only; not run by Claude). Target: tests/payroll-detail-october28-lot.test.js
// Causal regressions for the offline Oct28 detail lot review. Entirely synthetic payloads (fictional legajos and
// amounts) shaped exactly like extract-grh-payroll-detail.py output; the municipal backup is never read.
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {getGrhSourceProfile} from '../scripts/lib/grh-source-profile.mjs';
import {verifyOctober28DetailLot,october28DetailExpectations,validateOctober28DetailAdmission,october28DetailCustody,expectedSourceLabel,OCT28_DETAIL_EXTRACTOR,OCT28_DETAIL_ADMISSION_VERSION,SQL048_LIMITS} from '../scripts/lib/payroll-detail-october28-lot.mjs';
import {parseOctober28DetailLotArgs} from '../scripts/verify-payroll-detail-october28-lot.mjs';

const profile=getGrhSourceProfile('grh-junin-2026-10-28',{allowCandidateRead:true});
const E=october28DetailExpectations(profile),GZIP=E.sourceSha256,LOGICAL=E.logicalSha256;
const enc=v=>new TextEncoder().encode(typeof v==='string'?v:JSON.stringify(v));
const hash=b=>createHash('sha256').update(b).digest('hex');
const concepts=Object.fromEntries(Array.from({length:E.conceptCount},(_,i)=>{const code=String(i+1);return[code,{code,description:'Concepto sintético '+code,shortDescription:'S'+code,calculationClass:'1',type:'H',totalGroup:'993',unit:'D'}];}));
const line=(code,amount='100.00')=>({code,quantity:'1.00',amount,agreement:'1',costCenter:'2',paymentPlace:null,sector:'3'});
const statement=(legajo,codes)=>({legajo,lines:codes.map(c=>line(String(c)))});
const runOf=(type,statements)=>{const r=E.closedCurrentRuns.find(x=>x.payrollType===type);
 return{version:'payroll-detail-source.v1',sourceSha256:GZIP,sourceDatabase:'grh_junin',sourceLabel:E.sourceLabel,company:'101',period:r.period,month:r.month,date:r.payrollDate,type,closedFlag:'1',concepts:structuredClone(concepts),statements};};
// Fictional lot: F has one closed-inactive statement; M, O and V are small. Nothing resembles the real counts.
function lot(){
 const payloads={F:runOf('F',[statement('7',[1,2,3])]),M:runOf('M',[statement('5',[1,2]),statement('7',[1,2,3,4]),statement('12',[1])]),
  O:runOf('O',[statement('5',[9])]),V:runOf('V',[statement('7',[11,12])])};
 const files={};const manifest=[];
 for(const [type,p] of Object.entries(payloads)){const bytes=enc(p);files[p.date+'-'+type+'.private.json']=bytes;
  manifest.push({date:p.date,type,lines:p.statements.reduce((n,s)=>n+s.lines.length,0),statements:p.statements.length,sourceSha256:GZIP,payloadSha256:hash(bytes)});}
 files['manifest-aggregate.json']=enc(JSON.stringify(manifest,null,2));
 return{payloads,files,manifest};
}
// R3: the custody is what root's extraction act minted over the files it wrote. In the content tests below it is
// minted over the (mutated) lot under review, so each specific check is still the one exercised; the custody tests
// mint it over the PRISTINE lot and then tamper with the files.
const RUN_KEYS=E.closedCurrentRuns.map(r=>r.payrollDate+'-'+r.payrollType);
const custodyFor=files=>({manifestSha256:files['manifest-aggregate.json']?hash(files['manifest-aggregate.json']):'a'.repeat(64),
 payloads:Object.fromEntries(RUN_KEYS.map((k,i)=>[k,files[k+'.private.json']?hash(files[k+'.private.json']):String(i+1).repeat(64)]))});
const admissionFor=(manifest,files=lot().files)=>({version:OCT28_DETAIL_ADMISSION_VERSION,profileId:profile.id,sourceSha256:GZIP,extractorSha256:OCT28_DETAIL_EXTRACTOR.sha256,
 runs:manifest.map(m=>({payrollDate:m.date,payrollType:m.type,statements:m.statements,lines:m.lines})),custody:custodyFor(files)});
const core=()=>({version:'grh-multirun-candidate-acceptance.v1',accepted:true,profileId:profile.id,sourceSha256:LOGICAL,sourceCutoff:profile.source.cutoff,databaseWrites:0,sourcePromoted:false,manifestSha256:'c'.repeat(64),
 currentRuns:profile.core.currentRuns.map(r=>({...r}))});
// The admission counts are root's independent statement of the lot (built from a pristine lot), never the mutated
// manifest; its custody is minted over the files actually under review (as the extraction act would have done).
const review=(mutate,over={})=>{const l=lot();mutate?.(l);const files=l.files;
 return verifyOctober28DetailLot({directoryFiles:Object.keys(files),read:n=>files[n],profile,admission:admissionFor(lot().manifest,files),coreAcceptance:core(),...over});};
const rewrite=(l,type,change)=>{const p=l.payloads[type];change(p);const name=p.date+'-'+type+'.private.json';const bytes=enc(p);l.files[name]=bytes;
 const m=l.manifest.find(x=>x.type===type);m.payloadSha256=hash(bytes);m.statements=p.statements.length;m.lines=p.statements.reduce((n,s)=>n+s.lines.length,0);l.files['manifest-aggregate.json']=enc(JSON.stringify(l.manifest,null,2));};
const rejects=(mutate,code,over)=>assert.throws(()=>review(mutate,over),e=>String(e.message).startsWith(code),code);

test('contrato: extractor fijado, perfil Oct28 de B y etiqueta de fuente derivada del cutoff',()=>{
 assert.equal(hash(readFileSync(new URL('../'+OCT28_DETAIL_EXTRACTOR.path,import.meta.url))),OCT28_DETAIL_EXTRACTOR.sha256);
 assert.equal(E.sourceSha256,'9daf87941a3d7c92a2ebd680b390c2455c8e9889a7a9c51696587d7e8884f110');assert.equal(E.logicalSha256,'fef5aada3142e475d0519f7647377465d95ee55b4038aff035ff7d41d5748cc1');
 assert.equal(E.sourceLabel,'Respaldo GRH 28/10/2026 · cierre del archivo 15:16:35 (hora declarada)');assert.equal(expectedSourceLabel('2026-10-01T15:17:29'),'Respaldo GRH 01/10/2026 · cierre del archivo 15:17:29 (hora declarada)');
 assert.deepEqual(E.closedCurrentRuns.map(r=>r.payrollType),['F','M','O','V']);assert.ok(E.closedCurrentRuns.every(r=>r.payrollDate==='2026-10-31'&&r.period===2026&&r.month===10));
 assert.equal(E.conceptCount,294);assert.ok(Object.isFrozen(E));
 assert.throws(()=>october28DetailExpectations(getGrhSourceProfile('grh-junin-2026-10-14',{allowCandidateRead:true})),/OCT28_DETAIL_PROFILE_INVALID/);
});

test('lote completo F/M/O/V: revisión con conteos y hashes, F crudo sin mapeo, sin valores nominales',()=>{
 const r=review();
 assert.equal(r.version,'payroll-detail-october28-lot-review.v3');assert.deepEqual(r.payrollTypes,['F','M','O','V']);
 const pristine=lot();assert.equal(r.manifestSha256,hash(pristine.files['manifest-aggregate.json']));assert.equal(r.custody.manifestSha256,r.manifestSha256);
 assert.equal(r.custody.payloadsVerified,4);assert.deepEqual(r.custody.payloads,custodyFor(pristine.files).payloads);assert.deepEqual(r.runs.map(x=>x.payloadSha256),RUN_KEYS.map(k=>r.custody.payloads[k]));assert.equal(r.typeFKeptRaw,true);assert.equal(r.canonicalMapping,'none');
 assert.deepEqual(r.totals,{statements:6,lines:13,payloadBytes:r.runs.reduce((n,x)=>n+x.payloadBytes,0)});
 assert.deepEqual(r.runs.map(x=>[x.payrollType,x.statements,x.lines,x.closedFlag]),[['F',1,3,'1'],['M',3,7,'1'],['O',1,1,'1'],['V',1,2,'1']]);
 assert.equal(r.coreAcceptance.present,true);assert.equal(r.writer.changed,false);assert.equal(r.consumersActivated,false);assert.equal(r.databaseWrites,0);
 const text=JSON.stringify(r);for(const v of ['"legajo"','"amount"','100.00','"5"','"12"'])assert.ok(!text.includes(v),'nominal/value leak '+v);
 assert.ok(Object.isFrozen(r)&&Object.isFrozen(r.runs[0]));
 assert.equal(review(undefined,{coreAcceptance:undefined}).coreAcceptance.present,false);
});

test('fuente: hash lógico en vez del gzip, base/empresa/etiqueta distintas, versión ajena',()=>{
 rejects(l=>rewrite(l,'M',p=>{p.sourceSha256=LOGICAL;}),'OCT28_DETAIL_SOURCE_SHA');
 rejects(l=>{l.manifest[0].sourceSha256=LOGICAL;l.files['manifest-aggregate.json']=enc(JSON.stringify(l.manifest));},'OCT28_DETAIL_SOURCE_SHA');
 rejects(l=>rewrite(l,'M',p=>{p.sourceDatabase='grh_junin_copy';}),'OCT28_DETAIL_SOURCE_IDENTITY');
 rejects(l=>rewrite(l,'M',p=>{p.company='102';}),'OCT28_DETAIL_SOURCE_IDENTITY');
 rejects(l=>rewrite(l,'M',p=>{p.sourceLabel='Respaldo GRH 28/10/2026 · cierre del archivo 15:16:36 (hora declarada)';}),'OCT28_DETAIL_SOURCE_LABEL');
 rejects(l=>rewrite(l,'M',p=>{p.version='payroll-detail-source.v2';}),'OCT28_DETAIL_PAYLOAD_VERSION');
});

test('R2 omisión conjunta: quitar F (o cualquiera) de admisión, manifiesto y archivo a la vez sigue fallando',()=>{
 for(const type of ['F','M','O','V']){
  const l=lot();delete l.files['2026-10-31-'+type+'.private.json'];l.manifest.splice(l.manifest.findIndex(m=>m.type===type),1);l.files['manifest-aggregate.json']=enc(JSON.stringify(l.manifest));
  const admission=admissionFor(l.manifest,l.files);assert.equal(admission.runs.length,3);
  assert.throws(()=>verifyOctober28DetailLot({directoryFiles:Object.keys(l.files),read:n=>l.files[n],profile,admission,coreAcceptance:core()}),e=>String(e.message).startsWith('OCT28_DETAIL_ADMISSION_RUN_SET'),type);
  // Even if the admission check were bypassed, the lot itself is compared with the profile's closed current runs.
  assert.throws(()=>validateOctober28DetailAdmission(admission,E),/OCT28_DETAIL_ADMISSION_RUN_SET/,type);
 }
 const three=lot();delete three.files['2026-10-31-F.private.json'];three.manifest.splice(three.manifest.findIndex(m=>m.type==='F'),1);three.files['manifest-aggregate.json']=enc(JSON.stringify(three.manifest));
 assert.throws(()=>verifyOctober28DetailLot({directoryFiles:Object.keys(three.files),read:n=>three.files[n],profile,admission:admissionFor(lot().manifest,three.files)}),/OCT28_DETAIL_RUN_SET/,'full admission, lot without F');
 assert.deepEqual(review().expectedRuns,['2026-10-31-F','2026-10-31-M','2026-10-31-O','2026-10-31-V']);
});

test('corridas: sólo las cuatro cerradas vigentes; faltante, extra, otra fecha, abierta o cruzada se rechazan',()=>{
 rejects(l=>{delete l.files['2026-10-31-O.private.json'];l.manifest.splice(l.manifest.findIndex(m=>m.type==='O'),1);l.files['manifest-aggregate.json']=enc(JSON.stringify(l.manifest));},'OCT28_DETAIL_RUN_SET');
 rejects(l=>{const p={...l.payloads.O,date:'2026-10-15',type:'Q'};const b=enc(p);l.files['2026-10-15-Q.private.json']=b;l.manifest.push({date:'2026-10-15',type:'Q',lines:1,statements:1,sourceSha256:GZIP,payloadSha256:hash(b)});l.files['manifest-aggregate.json']=enc(JSON.stringify(l.manifest));},'OCT28_DETAIL_RUN_SET');
 rejects(l=>{l.files['2026-09-30-M.private.json']=l.files['2026-10-31-M.private.json'];},'OCT28_DETAIL_DIRECTORY_FILES');
 rejects(l=>{l.files['notes.txt']=enc('x');},'OCT28_DETAIL_DIRECTORY_FILES');
 rejects(l=>rewrite(l,'V',p=>{p.closedFlag=null;}),'OCT28_DETAIL_RUN_NOT_CLOSED');
 rejects(l=>rewrite(l,'V',p=>{p.closedFlag='0';}),'OCT28_DETAIL_RUN_NOT_CLOSED');
 rejects(l=>rewrite(l,'V',p=>{p.month=9;}),'OCT28_DETAIL_RUN_IDENTITY');
 rejects(l=>rewrite(l,'F',p=>{p.type='M';}),'OCT28_DETAIL_RUN_IDENTITY');
 rejects(l=>{l.manifest.push({...l.manifest[0]});l.files['manifest-aggregate.json']=enc(JSON.stringify(l.manifest));},'OCT28_DETAIL_MANIFEST_DUPLICATE');
});

test('admisión: versión, fuente, extractor, corrida no vigente o conteos distintos',()=>{
 const l=lot(),base=admissionFor(l.manifest,l.files);
 for(const [over,code] of [[{version:'x'},'OCT28_DETAIL_ADMISSION_VERSION'],[{version:'payroll-detail-october28-lot-admission.v1'},'OCT28_DETAIL_ADMISSION_VERSION'],[{extra:1},'OCT28_DETAIL_ADMISSION_KEYS'],
  [{sourceSha256:LOGICAL},'OCT28_DETAIL_ADMISSION_SOURCE'],[{extractorSha256:'0'.repeat(64)},'OCT28_DETAIL_ADMISSION_EXTRACTOR'],
  [{runs:[]},'OCT28_DETAIL_ADMISSION_RUNS'],[{runs:[...base.runs,{payrollDate:'2026-10-15',payrollType:'Q',statements:1,lines:1}]},'OCT28_DETAIL_ADMISSION_RUN_NOT_CLOSED_CURRENT'],
  [{runs:[...base.runs,base.runs[0]]},'OCT28_DETAIL_ADMISSION_RUNS'],[{runs:base.runs.map(r=>({...r,statements:true}))},'OCT28_DETAIL_ADMISSION_RUNS'],
  [{runs:base.runs.slice(1)},'OCT28_DETAIL_ADMISSION_RUN_SET'],[{runs:base.runs.filter(r=>r.payrollType!=='F')},'OCT28_DETAIL_ADMISSION_RUN_SET'],[{runs:[base.runs[1]]},'OCT28_DETAIL_ADMISSION_RUN_SET']])
  assert.throws(()=>validateOctober28DetailAdmission({...base,...over},E),e=>String(e.message).startsWith(code),code);
 assert.throws(()=>verifyOctober28DetailLot({directoryFiles:Object.keys(l.files),read:n=>l.files[n],profile,admission:{...base,runs:base.runs.map(r=>r.payrollType==='M'?{...r,statements:r.statements+1}:r)}}),/OCT28_DETAIL_ADMISSION_COUNTS/);
 assert.throws(()=>verifyOctober28DetailLot({directoryFiles:Object.keys(l.files),read:n=>l.files[n],profile,admission:{...base,runs:base.runs.filter(r=>r.payrollType!=='F')}}),/OCT28_DETAIL_ADMISSION_RUN_SET/);
});

test('contenido: catálogo incompleto, concepto desconocido, duplicados, orden, decimales, límites SQL048, hash/conteos de manifiesto',()=>{
 rejects(l=>rewrite(l,'M',p=>{delete p.concepts['294'];}),'OCT28_DETAIL_CONCEPT_CATALOG');
 rejects(l=>rewrite(l,'M',p=>{p.concepts['294']={...p.concepts['294'],code:'0294'};}),'OCT28_DETAIL_CONCEPT_CATALOG');
 rejects(l=>rewrite(l,'M',p=>{p.statements[0].lines[0].code='999';}),'OCT28_DETAIL_LINE_CONCEPT_UNKNOWN');
 rejects(l=>rewrite(l,'M',p=>{p.statements[0].lines.push({...p.statements[0].lines[0]});}),'OCT28_DETAIL_LINE_ORDER');
 rejects(l=>rewrite(l,'M',p=>{p.statements[0].lines.reverse();}),'OCT28_DETAIL_LINE_ORDER');
 rejects(l=>rewrite(l,'M',p=>{p.statements.reverse();}),'OCT28_DETAIL_STATEMENT_ORDER');
 rejects(l=>rewrite(l,'M',p=>{p.statements.push({...p.statements[2]});}),'OCT28_DETAIL_STATEMENT_ORDER');
 rejects(l=>rewrite(l,'M',p=>{p.statements[0].lines[0].amount='1.5';}),'OCT28_DETAIL_LINE_DECIMAL');
 rejects(l=>rewrite(l,'M',p=>{p.statements[0].lines[0].quantity=1;}),'OCT28_DETAIL_LINE_DECIMAL');
 rejects(l=>rewrite(l,'M',p=>{p.statements[0].lines[0].sector='3a';}),'OCT28_DETAIL_LINE_INTEGER');
 rejects(l=>rewrite(l,'M',p=>{p.statements[0].lines[0].extra=1;}),'OCT28_DETAIL_LINE_SHAPE');
 rejects(l=>rewrite(l,'M',p=>{p.statements[0].legajo='A1';}),'OCT28_DETAIL_STATEMENT_SHAPE');
 rejects(l=>rewrite(l,'M',p=>{p.statements[0].lines=Array.from({length:SQL048_LIMITS.linesPerStatement[1]+1},(_,i)=>line(String(i+1)));}),'OCT28_DETAIL_LINE_LIMIT');
 rejects(l=>rewrite(l,'O',p=>{p.statements=Array.from({length:SQL048_LIMITS.statementsPerDataset[1]+1},(_,i)=>statement(String(i+1),[1]));}),'OCT28_DETAIL_STATEMENT_LIMIT');
 rejects(l=>rewrite(l,'O',p=>{p.statements=[];}),'OCT28_DETAIL_STATEMENT_LIMIT');
 rejects(l=>{l.manifest.find(m=>m.type==='F').lines=99;l.files['manifest-aggregate.json']=enc(JSON.stringify(l.manifest));},'OCT28_DETAIL_MANIFEST_COUNTS');
 rejects(l=>{l.files['2026-10-31-F.private.json']=enc(JSON.stringify(l.payloads.F)+'\n');},'OCT28_DETAIL_MANIFEST_PAYLOAD_SHA');
 rejects(l=>{l.files['2026-10-31-F.private.json']=enc('{');const m=l.manifest.find(m=>m.type==='F');m.payloadSha256=hash(enc('{'));l.files['manifest-aggregate.json']=enc(JSON.stringify(l.manifest));},'OCT28_DETAIL_PAYLOAD_UNREADABLE');
 rejects(l=>{delete l.files['manifest-aggregate.json'];},'OCT28_DETAIL_MANIFEST_MISSING');
});

test('R3 custodia externa: importe válido cambiado + archivo y manifiesto rehasheados falla contra la custodia acuñada',()=>{
 const pristine=lot(),minted=custodyFor(pristine.files);
 // Tamper: a valid amount in M changes 100.00 -> 100.01; the file and the manifest entry are re-hashed consistently.
 const tampered=lot();rewrite(tampered,'M',p=>{p.statements[0].lines[0].amount='100.01';});
 assert.notEqual(hash(tampered.files['2026-10-31-M.private.json']),minted.payloads['2026-10-31-M']);
 assert.equal(tampered.manifest.find(m=>m.type==='M').payloadSha256,hash(tampered.files['2026-10-31-M.private.json']),'lot is internally consistent after re-hash');
 const admission=admissionFor(pristine.manifest,pristine.files);
 assert.throws(()=>verifyOctober28DetailLot({directoryFiles:Object.keys(tampered.files),read:n=>tampered.files[n],profile,admission,coreAcceptance:core()}),e=>e.message==='OCT28_DETAIL_CUSTODY_MANIFEST');
 // Even with a manifest custody that matched the tampered manifest, the payload custody is checked against the file bytes.
 const manifestOnly={...admission,custody:{...minted,manifestSha256:hash(tampered.files['manifest-aggregate.json'])}};
 assert.throws(()=>verifyOctober28DetailLot({directoryFiles:Object.keys(tampered.files),read:n=>tampered.files[n],profile,admission:manifestOnly,coreAcceptance:core()}),e=>e.message==='OCT28_DETAIL_CUSTODY_PAYLOAD:2026-10-31-M');
 // A payload replaced WITHOUT touching the manifest fails on custody before the manifest's own hash is consulted.
 const fileOnly=lot();fileOnly.files['2026-10-31-V.private.json']=enc(JSON.stringify(fileOnly.payloads.V)+' ');
 assert.throws(()=>verifyOctober28DetailLot({directoryFiles:Object.keys(fileOnly.files),read:n=>fileOnly.files[n],profile,admission,coreAcceptance:core()}),e=>e.message==='OCT28_DETAIL_CUSTODY_PAYLOAD:2026-10-31-V');
 // Same entries, other bytes (whitespace): custody is over bytes, not over parsed content.
 const reserialized=lot();reserialized.files['manifest-aggregate.json']=enc(JSON.stringify(reserialized.manifest));
 assert.throws(()=>verifyOctober28DetailLot({directoryFiles:Object.keys(reserialized.files),read:n=>reserialized.files[n],profile,admission,coreAcceptance:core()}),e=>e.message==='OCT28_DETAIL_CUSTODY_MANIFEST');
 // Swapped custody between two runs: each file is bound to its own run key.
 const swapped={...admission,custody:{...minted,payloads:{...minted.payloads,'2026-10-31-O':minted.payloads['2026-10-31-V'],'2026-10-31-V':minted.payloads['2026-10-31-O']}}};
 assert.throws(()=>verifyOctober28DetailLot({directoryFiles:Object.keys(pristine.files),read:n=>pristine.files[n],profile,admission:swapped,coreAcceptance:core()}),e=>e.message==='OCT28_DETAIL_CUSTODY_PAYLOAD:2026-10-31-O');
 // The pristine lot against its own minted custody is the only accepted combination.
 assert.equal(verifyOctober28DetailLot({directoryFiles:Object.keys(pristine.files),read:n=>pristine.files[n],profile,admission,coreAcceptance:core()}).custody.payloadsVerified,4);
});

test('R3 custodia: forma exacta, una entrada por corrida cerrada vigente, hex distintos, sin derivar del lote',()=>{
 const good=custodyFor(lot().files);
 assert.deepEqual(Object.keys(october28DetailCustody(good,RUN_KEYS).payloads),RUN_KEYS);
 for(const bad of [undefined,null,{},{manifestSha256:good.manifestSha256},{...good,extra:1},{...good,manifestSha256:'A'.repeat(64)},{...good,manifestSha256:'a'.repeat(63)},
  {...good,payloads:{...good.payloads,'2026-10-15-Q':'b'.repeat(64)}},{...good,payloads:Object.fromEntries(Object.entries(good.payloads).filter(([k])=>!k.endsWith('-F')))},
  {...good,payloads:{...good.payloads,'2026-10-31-F':good.payloads['2026-10-31-M']}},{...good,payloads:{...good.payloads,'2026-10-31-F':good.manifestSha256}},{...good,payloads:[]},{...good,payloads:{...good.payloads,'2026-10-31-F':'zz'}}])
  assert.throws(()=>october28DetailCustody(bad,RUN_KEYS),/OCT28_DETAIL_ADMISSION_CUSTODY/);
 const base=admissionFor(lot().manifest),{custody:_,...withoutCustody}=base;
 assert.throws(()=>validateOctober28DetailAdmission(withoutCustody,E),/OCT28_DETAIL_ADMISSION_KEYS/);
 for(const custody of [undefined,null,{manifestSha256:good.manifestSha256,payloads:{}}])
  assert.throws(()=>validateOctober28DetailAdmission({...base,custody},E),/OCT28_DETAIL_ADMISSION_CUSTODY/);
 assert.ok(Object.isFrozen(validateOctober28DetailAdmission(base,E).custody));
});

test('núcleo: el recibo de verify-grh-multirun-candidate debe ser del mismo perfil/lógico y tener cada corrida cerrada',()=>{
 rejects(undefined,'OCT28_DETAIL_CORE_ACCEPTANCE',{coreAcceptance:{...core(),accepted:false}});
 rejects(undefined,'OCT28_DETAIL_CORE_ACCEPTANCE',{coreAcceptance:{...core(),profileId:'grh-junin-2026-10-14'}});
 rejects(undefined,'OCT28_DETAIL_CORE_SOURCE',{coreAcceptance:{...core(),sourceSha256:GZIP}});
 rejects(undefined,'OCT28_DETAIL_CORE_RUN_MISMATCH',{coreAcceptance:{...core(),currentRuns:core().currentRuns.filter(r=>r.payrollType!=='O')}});
 rejects(undefined,'OCT28_DETAIL_CORE_RUN_MISMATCH',{coreAcceptance:{...core(),currentRuns:core().currentRuns.map(r=>r.payrollType==='V'?{...r,closureStatus:'unknown'}:r)}});
});

test('CLI: argumentos explícitos; la admisión va fijada por hash',()=>{
 assert.equal(parseOctober28DetailLotArgs(['--directory','/private/lot','--admission','/private/ADMISSION.json','--admission-sha256','a'.repeat(64)]).directory,'/private/lot');
 for(const args of [[],['--directory','/x'],['--directory','/x','--admission','/y'],['--directory','/x','--admission','/y','--admission-sha256','zz'],['--directory','/x','--admission','/y','--admission-sha256','a'.repeat(64),'--profile','grh-junin-2026-10-01']])
  assert.throws(()=>parseOctober28DetailLotArgs(args),/OCT28_DETAIL_USAGE/);
});
