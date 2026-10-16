import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {collectiveWorkingTimeFile,collectiveWorkingTimeRoster,createCollectiveWorkingTimeWorkspace} from '../assets/own-contract-working-time-collective.js';
import {collectiveFixture,id} from './fixtures/own-contract-working-time-collective-synthetic.js';
import {workingTimeCommand,workingTimeHash} from '../assets/own-contract-working-time-model.js';
const reason='Constancia y revisión del conjunto exclusivamente sintético QA';
const confirm=w=>({confirmed:true,reviewHash:w.view().reviewHash});

test('851 declarations retain last row and exact zero/text; one confirmed action sends canonical commands sequentially',async()=>{
 const f=collectiveFixture(851),w=createCollectiveWorkingTimeWorkspace(f.io);await w.prepare(f.file,'propose',reason);
 assert.equal(w.view().total,851);assert.equal(w.comparisons().at(-1).contractId,id(851));assert.equal(w.comparisons()[0].after.monthlyHours,'0');assert.equal(f.writes.length,0);
 await w.send(confirm(w));assert.equal(f.writes.length,851);assert.equal(w.view().confirmed,851);assert.equal(w.view().complete,true);
 for(const a of f.writes){assert.deepEqual(workingTimeCommand(a.body),a.body);assert.equal(a.body.reviewConfirmed,false);}
 const file=w.reviewFile();assert.equal(file.records.length,851);assert.equal(file.records.at(-1).proposalId,id(10851));assert.equal(new Set(f.writes.map(r=>r.key)).size,851);
});

test('full source and counts are required; the missing final row never becomes a smaller success',()=>{
 const f=collectiveFixture(851);assert.throws(()=>collectiveWorkingTimeFile({...f.file,records:f.file.records.slice(0,-1)}));
 assert.throws(()=>collectiveWorkingTimeRoster({...f.file,total:850,records:f.file.records.slice(0,-1)},f.roster()));
 const r=f.roster();r.complete=false;assert.throws(()=>collectiveWorkingTimeRoster(f.file,r));
});

test('duplicate contract/registration, holes and getters reject before any getter executes',()=>{
 const f=collectiveFixture();for(const key of['contractId','registrationId']){const v=structuredClone(f.file);v.records[2][key]=v.records[0][key];assert.throws(()=>collectiveWorkingTimeFile(v));}
 const hole=structuredClone(f.file);delete hole.records[2];assert.throws(()=>collectiveWorkingTimeFile(hole));
 let calls=0;const v=structuredClone(f.file);Object.defineProperty(v.records[0].definition,'monthlyHours',{enumerable:true,get(){calls++;return'1';}});assert.throws(()=>collectiveWorkingTimeFile(v));assert.equal(calls,0);
});

test('registration mismatch or a pending proposal on the last contract blocks the whole preflight without writes',async()=>{
 for(const variant of['registration','pending']){const f=collectiveFixture(57),last=f.boots.get(id(57));if(variant==='registration')last.source.subject.registrationId=id(8000);else last.proposals.push({id:id(9000),requestSha256:'a'.repeat(64),baseVersion:last.configuration.version,sourceVersion:last.source.version,reason,createdAt:'2026-10-16T12:00:00Z',authorLabel:'Otro preparador QA',canReview:false,status:'pending',decision:null});
  const w=createCollectiveWorkingTimeWorkspace(f.io);await assert.rejects(w.prepare(f.file,'propose',reason));assert.equal(f.writes.length,0);assert.equal(w.view().total,0);}
});

test('no confirmation, false ACK or another reviewed hash can send a command',async()=>{
 for(const ack of[undefined,{confirmed:false,reviewHash:'a'.repeat(64)},{confirmed:true,reviewHash:'b'.repeat(64)}]){const f=collectiveFixture(),w=createCollectiveWorkingTimeWorkspace(f.io);await w.prepare(f.file,'propose',reason);await assert.rejects(w.send(ack));assert.equal(f.writes.length,0);}
});

test('changed source between preflight bounds and changed source before send each block all writes',async()=>{
 for(const at of[2,3]){const f=collectiveFixture(),w=createCollectiveWorkingTimeWorkspace(f.io);f.hooks.roster=(r,n)=>{if(n===at)r.snapshot='b'.repeat(64);};if(at===2)await assert.rejects(w.prepare(f.file,'propose',reason));else{await w.prepare(f.file,'propose',reason);await assert.rejects(w.send(confirm(w)));}assert.equal(f.writes.length,0);}
});

test('a later conflict keeps the confirmed prefix explicit and does not send subsequent rows',async()=>{
 const f=collectiveFixture(),w=createCollectiveWorkingTimeWorkspace(f.io);await w.prepare(f.file,'propose',reason);f.boots.get(id(2)).source.version='e'.repeat(64);
 await assert.rejects(w.send(confirm(w)));assert.equal(f.writes.length,1);assert.equal(w.view().confirmed,1);assert.equal(w.view().complete,false);assert.equal(w.view().phase,'blocked');
});

test('a committed response lost in transport recovers only by GET and then continues without a duplicate send',async()=>{
 const f=collectiveFixture(),w=createCollectiveWorkingTimeWorkspace(f.io);let once=true;f.hooks.afterSend=()=>{if(once){once=false;throw Object.assign(Error('Respuesta perdida QA'),{status:503});}};
 await w.prepare(f.file,'propose',reason);await assert.rejects(w.send(confirm(w)));const first=structuredClone(f.writes[0]);assert.equal(w.view().pending,true);assert.equal(f.writes.length,1);
 await w.recover();assert.equal(f.writes.length,1);await w.send(confirm(w));assert.equal(f.writes.length,3);assert.deepEqual(f.writes[0],first);assert.equal(f.writes.filter(a=>a.key===first.key).length,1);
});

test('404 recovery is read-only; only an explicit retry reuses exactly the original body and key',async()=>{
 const f=collectiveFixture(),w=createCollectiveWorkingTimeWorkspace(f.io);let once=true;f.hooks.beforeSend=()=>{if(once){once=false;throw Error('Antes de registrar QA');}};
 await w.prepare(f.file,'propose',reason);await assert.rejects(w.send(confirm(w)));const a=structuredClone(f.writes[0]);await assert.rejects(w.retry());assert.equal(f.writes.length,1);await w.recover();assert.equal(f.writes.length,1);await w.retry(confirm(w));assert.equal(f.writes.length,2);assert.deepEqual(f.writes[1],a);await w.send(confirm(w));assert.equal(w.view().complete,true);
});

test('hiding clears comparison and queued source; the uncertain attempt survives and re-preparation resumes the exact set',async()=>{
 const f=collectiveFixture(),w=createCollectiveWorkingTimeWorkspace(f.io);let once=true;f.hooks.afterSend=()=>{if(once){once=false;throw Error('Respuesta perdida QA');}};
 await w.prepare(f.file,'propose',reason);await assert.rejects(w.send(confirm(w)));const first=structuredClone(f.writes[0]);f.setVisible(false);w.suspend();assert.equal(w.view().total,0);assert.equal(w.view().reviewHash,null);assert.throws(()=>w.comparisons());await assert.rejects(w.recover());assert.equal(f.writes.length,1);
 f.setVisible(true);await w.recover();await w.prepare(f.file,'propose',reason);await w.send(confirm(w));assert.equal(f.writes.length,3);assert.deepEqual(f.writes[0],first);
});

test('404 after hiding needs the same file revalidated before retry, preserving original attempt',async()=>{
 const f=collectiveFixture(),w=createCollectiveWorkingTimeWorkspace(f.io);let once=true;f.hooks.beforeSend=()=>{if(once){once=false;throw Error('No registrado QA');}};
 await w.prepare(f.file,'propose',reason);await assert.rejects(w.send(confirm(w)));const a=structuredClone(f.writes[0]);w.suspend();await w.recover();await assert.rejects(w.retry(confirm(w)));await w.prepare(f.file,'propose',reason);await w.retry(confirm(w));assert.deepEqual(f.writes[1],a);
});

test('account switch/revocation prevent pending attempt recovery and never retarget its body',async()=>{
 for(const variant of['account','caps']){const f=collectiveFixture(),w=createCollectiveWorkingTimeWorkspace(f.io);f.hooks.afterSend=()=>{throw Error('Respuesta perdida QA');};await w.prepare(f.file,'propose',reason);await assert.rejects(w.send(confirm(w)));const a=structuredClone(f.writes[0]);if(variant==='account')f.setActor('checker');else f.hooks.caps=['workforce.employee.read','payroll.parameter.read'];await assert.rejects(w.recover());assert.equal(f.writes.length,1);assert.deepEqual(f.writes[0],a);assert.equal(w.view().masked,true);assert.equal(w.view().reviewHash,null);assert.throws(()=>w.comparisons());}
});

test('unchanged approved declarations remain explicit and are never emitted as new proposals',async()=>{
 const f=collectiveFixture(),b=f.boots.get(id(2));b.configuration={version:'e'.repeat(64),revision:1,definition:structuredClone(f.file.records[1].definition),proposalId:id(7000),approvalId:id(7001),identityToken:b.source.subject.identityToken};const w=createCollectiveWorkingTimeWorkspace(f.io);await w.prepare(f.file,'propose',reason);assert.equal(w.view().unchanged,1);assert.equal(w.comparisons().length,3);await w.send(confirm(w));assert.equal(f.writes.length,2);assert.equal(w.reviewFile().records[1].proposalId,null);
});

test('another authorised checker can review all exact proposals with canonical per-contract decisions',async()=>{
 const f=collectiveFixture(),maker=createCollectiveWorkingTimeWorkspace(f.io);await maker.prepare(f.file,'propose',reason);await maker.send(confirm(maker));const review=maker.reviewFile();const same=createCollectiveWorkingTimeWorkspace(f.io);await assert.rejects(same.prepare(review,'approve',reason));assert.equal(f.writes.length,3);
 f.setActor('checker');const checker=createCollectiveWorkingTimeWorkspace(f.io);await checker.prepare(review,'approve',reason);assert.equal(checker.comparisons().length,3);await checker.send(confirm(checker));assert.equal(f.writes.length,6);for(const a of f.writes.slice(3)){assert.equal(a.body.reviewConfirmed,true);assert.equal(a.body.definition,null);assert.equal(a.body.command,'approve');}assert.equal(checker.view().complete,true);
});

test('modified review file or conflicting detail blocks every decision before any write',async()=>{
 const f=collectiveFixture(),maker=createCollectiveWorkingTimeWorkspace(f.io);await maker.prepare(f.file,'propose',reason);await maker.send(confirm(maker));const review=maker.reviewFile();f.setActor('checker');f.hooks.detail=d=>{if(d.body.contractId===id(3))d.current=false;};const checker=createCollectiveWorkingTimeWorkspace(f.io);await assert.rejects(checker.prepare(review,'approve',reason));assert.equal(f.writes.length,3);
});

test('partial progress cannot be moved to another set or rationale and review manifests require complete proposals',async()=>{
 const f=collectiveFixture(),w=createCollectiveWorkingTimeWorkspace(f.io);let once=true;f.hooks.afterSend=()=>{if(once){once=false;throw Error('Respuesta perdida QA');}};await w.prepare(f.file,'propose',reason);await assert.rejects(w.send(confirm(w)));assert.throws(()=>w.reviewFile());await w.recover();w.suspend();const changed=structuredClone(f.file);changed.records[2].definition.monthlyHours='1';await assert.rejects(w.prepare(changed,'propose',reason));await assert.rejects(w.prepare(f.file,'propose',reason+' modificado'));assert.equal(f.writes.length,1);
});

test('no getters, credentials, DB, agreement derivation or additional API authority are part of the workspace',()=>{
 const f=collectiveFixture();assert.throws(()=>createCollectiveWorkingTimeWorkspace({...f.io,authorize:null}));const v=structuredClone(f.file);v.records[0].definition.monthlyHours=3;assert.throws(()=>collectiveWorkingTimeFile(v));assert.equal(Object.hasOwn(v.records[0],'companyCode'),false);
});

test('revocation after a committed POST retires all compared data while preserving the uncertain attempt',async()=>{
 const f=collectiveFixture(),w=createCollectiveWorkingTimeWorkspace(f.io);await w.prepare(f.file,'propose',reason);f.hooks.afterSend=()=>{f.hooks.caps=['workforce.employee.read','payroll.parameter.read'];};await assert.rejects(w.send(confirm(w)));assert.equal(w.view().masked,true);assert.equal(w.view().pending,true);assert.equal(w.view().total,0);assert.throws(()=>w.comparisons());assert.equal(f.writes.length,1);f.hooks.caps=undefined;await w.recover();assert.equal(f.writes.length,1);
});

test('a changed complete roster after404 prevents the same retry from issuing any additional POST',async()=>{
 const f=collectiveFixture(),w=createCollectiveWorkingTimeWorkspace(f.io);f.hooks.beforeSend=()=>{throw Error('Antes de registrar QA');};await w.prepare(f.file,'propose',reason);await assert.rejects(w.send(confirm(w)));await w.recover();f.hooks.roster=r=>{r.snapshot='b'.repeat(64);};await assert.rejects(w.retry(confirm(w)));assert.equal(f.writes.length,1);assert.equal(w.view().pending,true);
});

test('confirmed progress rejects another key or proposalId even when the body hash remains identical',async()=>{
 for(const variant of['key','proposal']){const f=collectiveFixture(),w=createCollectiveWorkingTimeWorkspace(f.io);await w.prepare(f.file,'propose',reason);f.boots.get(id(2)).source.version='b'.repeat(64);await assert.rejects(w.send(confirm(w)));w.suspend();const read=f.io.readAttempt;f.io.readAttempt=async(...args)=>{const r=await read(...args);if(variant==='key')r.requestKey=id(99001);else{r.proposalId=id(99002);r.eventId=r.proposalId;}return r;};await assert.rejects(w.prepare(f.file,'propose',reason));assert.equal(f.writes.length,1);}
});

test('editing an unsubmitted preparation is allowed; abandoning partial or uncertain work is never implicit',async()=>{
 const f=collectiveFixture(),w=createCollectiveWorkingTimeWorkspace(f.io);await w.prepare(f.file,'propose',reason);w.suspend();const changed=structuredClone(f.file);changed.records[2].definition.monthlyHours='1';await w.prepare(changed,'propose',reason+' nuevo');f.hooks.afterSend=()=>{throw Error('Respuesta perdida QA');};await assert.rejects(w.send(confirm(w)));assert.throws(()=>w.startNew());assert.equal(w.view().pending,true);
});

test('a saved advance survives a new workspace and revalidates all known receipts before restoring an uncertain attempt',async()=>{
 const f=collectiveFixture(),first=createCollectiveWorkingTimeWorkspace(f.io);let once=true;f.hooks.afterSend=()=>{if(once){once=false;throw Error('Respuesta perdida QA');}};await first.prepare(f.file,'propose',reason);await assert.rejects(first.send(confirm(first)));const progress=await first.progressFile(),next=createCollectiveWorkingTimeWorkspace(f.io);await next.restore(progress);assert.equal(next.view().pending,true);assert.equal(f.writes.length,1);await next.recover();await next.prepare(f.file,'propose',reason);await next.send(confirm(next));assert.equal(f.writes.length,3);assert.equal(next.view().complete,true);assert.equal(JSON.stringify(progress).includes('@example.invalid'),false);
});

test('a confirmed prefix checkpoint verifies exact key, proposal and hash rather than trusting edited local progress',async()=>{
 const f=collectiveFixture(),w=createCollectiveWorkingTimeWorkspace(f.io);await w.prepare(f.file,'propose',reason);f.boots.get(id(2)).source.version='b'.repeat(64);await assert.rejects(w.send(confirm(w)));const progress=await w.progressFile();assert.equal(progress.confirmed.length,1);
 for(const patch of[{key:id(99900)},{proposalId:id(99901)},{bodySha256:'c'.repeat(64)}]){const edited=structuredClone(progress);Object.assign(edited.confirmed[0],patch);const next=createCollectiveWorkingTimeWorkspace(f.io);await assert.rejects(next.restore(edited));assert.equal(f.writes.length,1);}
});

test('saved progress cannot be loaded under another account and a new set needs an explicit completed reset',async()=>{
 const f=collectiveFixture(),w=createCollectiveWorkingTimeWorkspace(f.io);await w.prepare(f.file,'propose',reason);await w.send(confirm(w));const progress=await w.progressFile();f.setActor('checker');const next=createCollectiveWorkingTimeWorkspace(f.io);await assert.rejects(next.restore(progress));assert.equal(next.view().masked,true);assert.throws(()=>next.comparisons());f.setActor('maker');w.startNew();assert.equal(w.view().hasProgress,false);assert.equal(w.view().phase,'empty');
});

test('an altered pending checkpoint with a recomputed hash cannot replace a committed body or pass a404retry',async()=>{
 for(const committed of[true,false]){const f=collectiveFixture(),w=createCollectiveWorkingTimeWorkspace(f.io);let once=true;f.hooks[committed?'afterSend':'beforeSend']=()=>{if(once){once=false;throw Error('Respuesta sintética interrumpida');}};await w.prepare(f.file,'propose',reason);await assert.rejects(w.send(confirm(w)));const progress=await w.progressFile();const edited=structuredClone(progress);edited.attempt.body.definition.monthlyHours='1';edited.attempt.bodySha256=await workingTimeHash(edited.attempt.body);const next=createCollectiveWorkingTimeWorkspace(f.io);await next.restore(edited);
  if(committed)await assert.rejects(next.recover());else{await next.recover();await next.prepare(f.file,'propose',reason);await assert.rejects(next.retry(confirm(next)));}assert.equal(f.writes.length,1);assert.equal(next.view().pending,true);}
});

test('restoring progress under revoked capabilities masks data and does not consult or send its attempt',async()=>{
 const f=collectiveFixture(),w=createCollectiveWorkingTimeWorkspace(f.io);f.hooks.beforeSend=()=>{throw Error('No registrado QA');};await w.prepare(f.file,'propose',reason);await assert.rejects(w.send(confirm(w)));const progress=await w.progressFile();f.hooks.caps=['workforce.employee.read','payroll.parameter.read'];const next=createCollectiveWorkingTimeWorkspace(f.io),before=f.reads.length;await assert.rejects(next.restore(progress));assert.equal(next.view().masked,true);assert.equal(f.reads.length,before);assert.equal(f.writes.length,1);
});

test('revocation during recovery cannot acknowledge a valid received receipt or retain its comparison',async()=>{
 const f=collectiveFixture(),w=createCollectiveWorkingTimeWorkspace(f.io);f.hooks.afterSend=()=>{throw Error('Respuesta perdida QA');};await w.prepare(f.file,'propose',reason);await assert.rejects(w.send(confirm(w)));f.hooks.attempt=()=>{f.hooks.caps=[];};await assert.rejects(w.recover());assert.equal(w.view().masked,true);assert.equal(w.view().pending,true);assert.equal(w.view().confirmed,0);assert.throws(()=>w.comparisons());assert.equal(f.writes.length,1);
});

test('a late preflight response after hiding cannot populate the masked workspace',async()=>{
 const f=collectiveFixture(),w=createCollectiveWorkingTimeWorkspace(f.io);let release,entered;const waiting=new Promise(r=>{entered=r;});f.hooks.bootstrap=async()=>{entered();await new Promise(r=>{release=r;});};const preparing=w.prepare(f.file,'propose',reason);await waiting;f.setVisible(false);w.suspend();release();await assert.rejects(preparing);assert.equal(w.view().masked,true);assert.equal(w.view().total,0);assert.throws(()=>w.comparisons());assert.equal(f.writes.length,0);
});

test('a committed response after hiding stays uncertain until same-key authorised recovery',async()=>{
 const f=collectiveFixture(),w=createCollectiveWorkingTimeWorkspace(f.io);f.hooks.afterSend=()=>{f.setVisible(false);w.suspend();};await w.prepare(f.file,'propose',reason);await assert.rejects(w.send(confirm(w)));assert.equal(w.view().pending,true);assert.equal(w.view().confirmed,0);assert.equal(w.view().masked,true);f.setVisible(true);await w.recover();assert.equal(w.view().confirmed,1);assert.equal(f.writes.length,1);
});

test('a404retry requires a fresh explicit whole-set confirmation even when body and source did not change',async()=>{
 const f=collectiveFixture(),w=createCollectiveWorkingTimeWorkspace(f.io);let once=true;f.hooks.beforeSend=()=>{if(once){once=false;throw Error('No registrado QA');}};await w.prepare(f.file,'propose',reason);await assert.rejects(w.send(confirm(w)));await w.recover();await assert.rejects(w.retry());assert.equal(f.writes.length,1);await w.retry(confirm(w));assert.equal(f.writes.length,2);assert.deepEqual(f.writes[0],f.writes[1]);
});

test('idle access revalidation masks prepared data on revocation, expiry, account change or an unverifiable response',async()=>{
 for(const variant of['caps','expired','account','network']){const f=collectiveFixture(),w=createCollectiveWorkingTimeWorkspace(f.io);await w.prepare(f.file,'propose',reason);if(variant==='caps')f.hooks.caps=[];else if(variant==='account')f.setActor('checker');else f.hooks.auth=()=>{throw Object.assign(Error('Auth sintético no verificado'),variant==='expired'?{status:401}:{});};await assert.rejects(w.revalidate());assert.equal(w.view().masked,true);assert.equal(w.view().total,0);assert.equal(w.view().reviewHash,null);assert.throws(()=>w.comparisons());assert.equal(f.writes.length,0);}
});

test('idle revocation masks the workspace but preserves the same uncertain attempt for later authorised recovery',async()=>{
 const f=collectiveFixture(),w=createCollectiveWorkingTimeWorkspace(f.io);f.hooks.afterSend=()=>{throw Error('Respuesta perdida QA');};await w.prepare(f.file,'propose',reason);await assert.rejects(w.send(confirm(w)));const original=structuredClone(f.writes[0]);f.hooks.caps=[];await assert.rejects(w.revalidate());assert.equal(w.view().masked,true);assert.equal(w.view().pending,true);assert.throws(()=>w.comparisons());assert.equal(f.writes.length,1);f.hooks.caps=undefined;await w.recover();assert.equal(f.writes.length,1);assert.deepEqual(f.writes[0],original);
});

test('the filtered static publication retains both new runtime modules and every local transitive import',()=>{
 const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),build=read('scripts/build-friendly.mjs'),array=build.match(/const shellFiles = \[([\s\S]*?)\];/);assert.ok(array);const copied=[...array[1].matchAll(/'([^']+)'/g)].map(m=>m[1]),rules=read('.vercelignore').split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&!x.startsWith('#'));
 const included=file=>{let keep=true;for(const rule of rules){const neg=rule.startsWith('!'),p=neg?rule.slice(1):rule;if(p.endsWith('/')?file.startsWith(p):path.matchesGlob(file,p)||(!p.includes('/')&&path.matchesGlob(path.basename(file),p)))keep=neg;}return keep;};
 const seen=new Set(),walk=file=>{if(seen.has(file))return;seen.add(file);assert.equal(included(file),true,'Excluded runtime source: '+file);assert.equal(copied.filter(f=>f===file).length,1,'Runtime source must be copied exactly once: '+file);for(const m of read(file).matchAll(/(?:from\s*|import\s*)['"](\.\.?\/[^'"]+)['"]/g))walk(path.posix.normalize(path.posix.join(path.posix.dirname(file),m[1])));};walk('assets/own-contract-working-time-panel.js');assert.ok(seen.has('assets/own-contract-working-time-collective.js'));assert.ok(seen.has('assets/own-contract-working-time-collective-panel.js'));assert.equal(included('assets/own-contract-working-time-panel.css'),true);assert.equal(copied.filter(f=>f==='assets/own-contract-working-time-panel.css').length,1);
});
