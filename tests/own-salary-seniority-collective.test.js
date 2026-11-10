import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {collectiveSeniorityFile,collectiveSeniorityRoster,createCollectiveSeniorityWorkspace,collectiveSeniorityPendingFile} from '../assets/own-salary-seniority-collective.js';
import {collectiveFixture,id} from './fixtures/own-salary-seniority-collective-synthetic.js';
import {seniorityCommand,seniorityHash} from '../assets/own-salary-seniority-model.js';
const reason='Constancia y revisión del conjunto exclusivamente sintético QA';
const confirm=w=>({confirmed:true,reviewHash:w.view().reviewHash});

test('851 declarations retain last row and exact zero/text; one confirmed action sends canonical commands sequentially',async()=>{
 const f=collectiveFixture(851),w=createCollectiveSeniorityWorkspace(f.io);await w.prepare(f.file,'propose',reason);
 assert.equal(w.view().total,851);assert.equal(w.comparisons().at(-1).contractId,id(851));assert.equal(w.comparisons()[0].after.months,'0');assert.equal(f.writes.length,0);
 await w.send(confirm(w));assert.equal(f.writes.length,851);assert.equal(w.view().confirmed,851);assert.equal(w.view().complete,true);
 for(const a of f.writes){assert.deepEqual(seniorityCommand(a.body),a.body);assert.equal(a.body.reviewConfirmed,false);}
 const file=w.reviewFile();assert.equal(file.records.length,851);assert.equal(file.records.at(-1).proposalId,id(10851));assert.equal(new Set(f.writes.map(r=>r.key)).size,851);
});

test('full source and counts are required; the missing final row never becomes a smaller success',()=>{
 const f=collectiveFixture(851);assert.throws(()=>collectiveSeniorityFile({...f.file,records:f.file.records.slice(0,-1)}));
 assert.throws(()=>collectiveSeniorityRoster({...f.file,total:850,records:f.file.records.slice(0,-1)},f.roster()));
 const r=f.roster();r.complete=false;assert.throws(()=>collectiveSeniorityRoster(f.file,r));
});

test('duplicate contract/registration, holes and getters reject before any getter executes',()=>{
 const f=collectiveFixture();for(const key of['contractId','registrationId']){const v=structuredClone(f.file);v.records[2][key]=v.records[0][key];assert.throws(()=>collectiveSeniorityFile(v));}
 const hole=structuredClone(f.file);delete hole.records[2];assert.throws(()=>collectiveSeniorityFile(hole));
 let calls=0;const v=structuredClone(f.file);Object.defineProperty(v.records[0].definition,'months',{enumerable:true,get(){calls++;return'1';}});assert.throws(()=>collectiveSeniorityFile(v));assert.equal(calls,0);
});

test('registration mismatch or a pending proposal on the last contract blocks the whole preflight without writes',async()=>{
 for(const variant of['registration','pending']){const f=collectiveFixture(57),last=f.boots.get(id(57));if(variant==='registration')last.source.subject.registrationId=id(8000);else last.proposals.push({id:id(9000),requestSha256:'a'.repeat(64),baseVersion:last.configuration.version,sourceVersion:last.source.version,reason,createdAt:'2026-10-16T12:00:00Z',authorLabel:'Otro preparador QA',canReview:false,status:'pending',decision:null});
  const w=createCollectiveSeniorityWorkspace(f.io);await assert.rejects(w.prepare(f.file,'propose',reason));assert.equal(f.writes.length,0);assert.equal(w.view().total,0);}
});

test('no confirmation, false ACK or another reviewed hash can send a command',async()=>{
 for(const ack of[undefined,{confirmed:false,reviewHash:'a'.repeat(64)},{confirmed:true,reviewHash:'b'.repeat(64)}]){const f=collectiveFixture(),w=createCollectiveSeniorityWorkspace(f.io);await w.prepare(f.file,'propose',reason);await assert.rejects(w.send(ack));assert.equal(f.writes.length,0);}
});

test('changed source between preflight bounds and changed source before send each block all writes',async()=>{
 for(const at of[2,3]){const f=collectiveFixture(),w=createCollectiveSeniorityWorkspace(f.io);f.hooks.roster=(r,n)=>{if(n===at)r.snapshot='b'.repeat(64);};if(at===2)await assert.rejects(w.prepare(f.file,'propose',reason));else{await w.prepare(f.file,'propose',reason);await assert.rejects(w.send(confirm(w)));}assert.equal(f.writes.length,0);}
});

test('a later conflict keeps the confirmed prefix explicit and does not send subsequent rows',async()=>{
 const f=collectiveFixture(),w=createCollectiveSeniorityWorkspace(f.io);await w.prepare(f.file,'propose',reason);f.boots.get(id(2)).source.version='e'.repeat(64);
 await assert.rejects(w.send(confirm(w)));assert.equal(f.writes.length,1);assert.equal(w.view().confirmed,1);assert.equal(w.view().complete,false);assert.equal(w.view().phase,'blocked');
});

test('a committed response lost in transport recovers only by GET and then continues without a duplicate send',async()=>{
 const f=collectiveFixture(),w=createCollectiveSeniorityWorkspace(f.io);let once=true;f.hooks.afterSend=()=>{if(once){once=false;throw Object.assign(Error('Respuesta perdida QA'),{status:503});}};
 await w.prepare(f.file,'propose',reason);await assert.rejects(w.send(confirm(w)));const first=structuredClone(f.writes[0]);assert.equal(w.view().pending,true);assert.equal(f.writes.length,1);
 await w.recover();assert.equal(f.writes.length,1);await w.send(confirm(w));assert.equal(f.writes.length,3);assert.deepEqual(f.writes[0],first);assert.equal(f.writes.filter(a=>a.key===first.key).length,1);
});

test('404 recovery is read-only; only an explicit retry reuses exactly the original body and key',async()=>{
 const f=collectiveFixture(),w=createCollectiveSeniorityWorkspace(f.io);let once=true;f.hooks.beforeSend=()=>{if(once){once=false;throw Error('Antes de registrar QA');}};
 await w.prepare(f.file,'propose',reason);await assert.rejects(w.send(confirm(w)));const a=structuredClone(f.writes[0]);await assert.rejects(w.retry());assert.equal(f.writes.length,1);await w.recover();assert.equal(f.writes.length,1);await w.retry(confirm(w));assert.equal(f.writes.length,2);assert.deepEqual(f.writes[1],a);await w.send(confirm(w));assert.equal(w.view().complete,true);
});

test('hiding clears comparison and queued source; the uncertain attempt survives and re-preparation resumes the exact set',async()=>{
 const f=collectiveFixture(),w=createCollectiveSeniorityWorkspace(f.io);let once=true;f.hooks.afterSend=()=>{if(once){once=false;throw Error('Respuesta perdida QA');}};
 await w.prepare(f.file,'propose',reason);await assert.rejects(w.send(confirm(w)));const first=structuredClone(f.writes[0]);f.setVisible(false);w.suspend();assert.equal(w.view().total,0);assert.equal(w.view().reviewHash,null);assert.throws(()=>w.comparisons());await assert.rejects(w.recover());assert.equal(f.writes.length,1);
 f.setVisible(true);await w.recover();await w.prepare(f.file,'propose',reason);await w.send(confirm(w));assert.equal(f.writes.length,3);assert.deepEqual(f.writes[0],first);
});

test('404 after hiding needs the same file revalidated before retry, preserving original attempt',async()=>{
 const f=collectiveFixture(),w=createCollectiveSeniorityWorkspace(f.io);let once=true;f.hooks.beforeSend=()=>{if(once){once=false;throw Error('No registrado QA');}};
 await w.prepare(f.file,'propose',reason);await assert.rejects(w.send(confirm(w)));const a=structuredClone(f.writes[0]);w.suspend();await w.recover();await assert.rejects(w.retry(confirm(w)));await w.prepare(f.file,'propose',reason);await w.retry(confirm(w));assert.deepEqual(f.writes[1],a);
});

test('account switch/revocation prevent pending attempt recovery and never retarget its body',async()=>{
 for(const variant of['account','caps']){const f=collectiveFixture(),w=createCollectiveSeniorityWorkspace(f.io);f.hooks.afterSend=()=>{throw Error('Respuesta perdida QA');};await w.prepare(f.file,'propose',reason);await assert.rejects(w.send(confirm(w)));const a=structuredClone(f.writes[0]);if(variant==='account')f.setActor('checker');else f.hooks.caps=['workforce.employee.read','payroll.parameter.read'];await assert.rejects(w.recover());assert.equal(f.writes.length,1);assert.deepEqual(f.writes[0],a);assert.equal(w.view().masked,true);assert.equal(w.view().reviewHash,null);assert.throws(()=>w.comparisons());}
});

test('unchanged approved declarations remain explicit and are never emitted as new proposals',async()=>{
 const f=collectiveFixture(),b=f.boots.get(id(2));b.configuration={version:'e'.repeat(64),revision:1,definition:structuredClone(f.file.records[1].definition),proposalId:id(7000),approvalId:id(7001),identityToken:b.source.subject.identityToken};const w=createCollectiveSeniorityWorkspace(f.io);await w.prepare(f.file,'propose',reason);assert.equal(w.view().unchanged,1);assert.equal(w.comparisons().length,3);await w.send(confirm(w));assert.equal(f.writes.length,2);assert.equal(w.reviewFile().records[1].proposalId,null);
});

test('another authorised checker can review all exact proposals with canonical per-contract decisions',async()=>{
 const f=collectiveFixture(),maker=createCollectiveSeniorityWorkspace(f.io);await maker.prepare(f.file,'propose',reason);await maker.send(confirm(maker));const review=maker.reviewFile();const same=createCollectiveSeniorityWorkspace(f.io);await assert.rejects(same.prepare(review,'approve',reason));assert.equal(f.writes.length,3);
 f.setActor('checker');const checker=createCollectiveSeniorityWorkspace(f.io);await checker.prepare(review,'approve',reason);assert.equal(checker.comparisons().length,3);await checker.send(confirm(checker));assert.equal(f.writes.length,6);for(const a of f.writes.slice(3)){assert.equal(a.body.reviewConfirmed,true);assert.equal(a.body.definition,null);assert.equal(a.body.command,'approve');}assert.equal(checker.view().complete,true);
});

test('modified review file or conflicting detail blocks every decision before any write',async()=>{
 const f=collectiveFixture(),maker=createCollectiveSeniorityWorkspace(f.io);await maker.prepare(f.file,'propose',reason);await maker.send(confirm(maker));const review=maker.reviewFile();f.setActor('checker');f.hooks.detail=d=>{if(d.body.contractId===id(3))d.current=false;};const checker=createCollectiveSeniorityWorkspace(f.io);await assert.rejects(checker.prepare(review,'approve',reason));assert.equal(f.writes.length,3);
});

test('partial progress cannot be moved to another set or rationale and review manifests require complete proposals',async()=>{
 const f=collectiveFixture(),w=createCollectiveSeniorityWorkspace(f.io);let once=true;f.hooks.afterSend=()=>{if(once){once=false;throw Error('Respuesta perdida QA');}};await w.prepare(f.file,'propose',reason);await assert.rejects(w.send(confirm(w)));assert.throws(()=>w.reviewFile());await w.recover();w.suspend();const changed=structuredClone(f.file);changed.records[2].definition.months='1';await assert.rejects(w.prepare(changed,'propose',reason));await assert.rejects(w.prepare(f.file,'propose',reason+' modificado'));assert.equal(f.writes.length,1);
});

test('no getters, credentials, DB, agreement derivation or additional API authority are part of the workspace',()=>{
 const f=collectiveFixture();assert.throws(()=>createCollectiveSeniorityWorkspace({...f.io,authorize:null}));const v=structuredClone(f.file);v.records[0].definition.months=3;assert.throws(()=>collectiveSeniorityFile(v));assert.equal(Object.hasOwn(v.records[0],'companyCode'),false);
});

test('revocation after a committed POST retires all compared data while preserving the uncertain attempt',async()=>{
 const f=collectiveFixture(),w=createCollectiveSeniorityWorkspace(f.io);await w.prepare(f.file,'propose',reason);f.hooks.afterSend=()=>{f.hooks.caps=['workforce.employee.read','payroll.parameter.read'];};await assert.rejects(w.send(confirm(w)));assert.equal(w.view().masked,true);assert.equal(w.view().pending,true);assert.equal(w.view().total,0);assert.throws(()=>w.comparisons());assert.equal(f.writes.length,1);f.hooks.caps=undefined;await w.recover();assert.equal(f.writes.length,1);
});

test('a changed complete roster after404 prevents the same retry from issuing any additional POST',async()=>{
 const f=collectiveFixture(),w=createCollectiveSeniorityWorkspace(f.io);f.hooks.beforeSend=()=>{throw Error('Antes de registrar QA');};await w.prepare(f.file,'propose',reason);await assert.rejects(w.send(confirm(w)));await w.recover();f.hooks.roster=r=>{r.snapshot='b'.repeat(64);};await assert.rejects(w.retry(confirm(w)));assert.equal(f.writes.length,1);assert.equal(w.view().pending,true);
});

test('confirmed progress rejects another key or proposalId even when the body hash remains identical',async()=>{
 for(const variant of['key','proposal']){const f=collectiveFixture(),w=createCollectiveSeniorityWorkspace(f.io);await w.prepare(f.file,'propose',reason);f.boots.get(id(2)).source.version='b'.repeat(64);await assert.rejects(w.send(confirm(w)));w.suspend();const read=f.io.readAttempt;f.io.readAttempt=async(...args)=>{const r=await read(...args);if(variant==='key')r.requestKey=id(99001);else{r.proposalId=id(99002);r.eventId=r.proposalId;}return r;};await assert.rejects(w.prepare(f.file,'propose',reason));assert.equal(f.writes.length,1);}
});

test('editing an unsubmitted preparation is allowed; abandoning partial or uncertain work is never implicit',async()=>{
 const f=collectiveFixture(),w=createCollectiveSeniorityWorkspace(f.io);await w.prepare(f.file,'propose',reason);w.suspend();const changed=structuredClone(f.file);changed.records[2].definition.months='1';await w.prepare(changed,'propose',reason+' nuevo');f.hooks.afterSend=()=>{throw Error('Respuesta perdida QA');};await assert.rejects(w.send(confirm(w)));assert.throws(()=>w.startNew());assert.equal(w.view().pending,true);
});

test('a saved advance survives a new workspace and revalidates all known receipts before restoring an uncertain attempt',async()=>{
 const f=collectiveFixture(),first=createCollectiveSeniorityWorkspace(f.io);let once=true;f.hooks.afterSend=()=>{if(once){once=false;throw Error('Respuesta perdida QA');}};await first.prepare(f.file,'propose',reason);await assert.rejects(first.send(confirm(first)));const progress=await first.progressFile(),next=createCollectiveSeniorityWorkspace(f.io);await next.restore(progress);assert.equal(next.view().pending,true);assert.equal(f.writes.length,1);await next.recover();await next.prepare(f.file,'propose',reason);await next.send(confirm(next));assert.equal(f.writes.length,3);assert.equal(next.view().complete,true);assert.equal(JSON.stringify(progress).includes('@example.invalid'),false);
});

test('a confirmed prefix checkpoint verifies exact key, proposal and hash rather than trusting edited local progress',async()=>{
 const f=collectiveFixture(),w=createCollectiveSeniorityWorkspace(f.io);await w.prepare(f.file,'propose',reason);f.boots.get(id(2)).source.version='b'.repeat(64);await assert.rejects(w.send(confirm(w)));const progress=await w.progressFile();assert.equal(progress.confirmed.length,1);
 for(const patch of[{key:id(99900)},{proposalId:id(99901)},{bodySha256:'c'.repeat(64)}]){const edited=structuredClone(progress);Object.assign(edited.confirmed[0],patch);const next=createCollectiveSeniorityWorkspace(f.io);await assert.rejects(next.restore(edited));assert.equal(f.writes.length,1);}
});

test('saved progress cannot be loaded under another account and a new set needs an explicit completed reset',async()=>{
 const f=collectiveFixture(),w=createCollectiveSeniorityWorkspace(f.io);await w.prepare(f.file,'propose',reason);await w.send(confirm(w));const progress=await w.progressFile();f.setActor('checker');const next=createCollectiveSeniorityWorkspace(f.io);await assert.rejects(next.restore(progress));assert.equal(next.view().masked,true);assert.throws(()=>next.comparisons());f.setActor('maker');w.startNew();assert.equal(w.view().hasProgress,false);assert.equal(w.view().phase,'empty');
});

test('an altered pending checkpoint with a recomputed hash cannot replace a committed body or pass a404retry',async()=>{
 for(const committed of[true,false]){const f=collectiveFixture(),w=createCollectiveSeniorityWorkspace(f.io);let once=true;f.hooks[committed?'afterSend':'beforeSend']=()=>{if(once){once=false;throw Error('Respuesta sintética interrumpida');}};await w.prepare(f.file,'propose',reason);await assert.rejects(w.send(confirm(w)));const progress=await w.progressFile();const edited=structuredClone(progress);edited.attempt.body.definition.months='1';edited.attempt.bodySha256=await seniorityHash(edited.attempt.body);const next=createCollectiveSeniorityWorkspace(f.io);await next.restore(edited);
  if(committed)await assert.rejects(next.recover());else{await next.recover();await next.prepare(f.file,'propose',reason);await assert.rejects(next.retry(confirm(next)));}assert.equal(f.writes.length,1);assert.equal(next.view().pending,true);}
});

test('restoring progress under revoked capabilities masks data and does not consult or send its attempt',async()=>{
 const f=collectiveFixture(),w=createCollectiveSeniorityWorkspace(f.io);f.hooks.beforeSend=()=>{throw Error('No registrado QA');};await w.prepare(f.file,'propose',reason);await assert.rejects(w.send(confirm(w)));const progress=await w.progressFile();f.hooks.caps=['workforce.employee.read','payroll.parameter.read'];const next=createCollectiveSeniorityWorkspace(f.io),before=f.reads.length;await assert.rejects(next.restore(progress));assert.equal(next.view().masked,true);assert.equal(f.reads.length,before);assert.equal(f.writes.length,1);
});

test('revocation during recovery cannot acknowledge a valid received receipt or retain its comparison',async()=>{
 const f=collectiveFixture(),w=createCollectiveSeniorityWorkspace(f.io);f.hooks.afterSend=()=>{throw Error('Respuesta perdida QA');};await w.prepare(f.file,'propose',reason);await assert.rejects(w.send(confirm(w)));f.hooks.attempt=()=>{f.hooks.caps=[];};await assert.rejects(w.recover());assert.equal(w.view().masked,true);assert.equal(w.view().pending,true);assert.equal(w.view().confirmed,0);assert.throws(()=>w.comparisons());assert.equal(f.writes.length,1);
});

test('a late preflight response after hiding cannot populate the masked workspace',async()=>{
 const f=collectiveFixture(),w=createCollectiveSeniorityWorkspace(f.io);let release,entered;const waiting=new Promise(r=>{entered=r;});f.hooks.bootstrap=async()=>{entered();await new Promise(r=>{release=r;});};const preparing=w.prepare(f.file,'propose',reason);await waiting;f.setVisible(false);w.suspend();release();await assert.rejects(preparing);assert.equal(w.view().masked,true);assert.equal(w.view().total,0);assert.throws(()=>w.comparisons());assert.equal(f.writes.length,0);
});

test('a committed response after hiding stays uncertain until same-key authorised recovery',async()=>{
 const f=collectiveFixture(),w=createCollectiveSeniorityWorkspace(f.io);f.hooks.afterSend=()=>{f.setVisible(false);w.suspend();};await w.prepare(f.file,'propose',reason);await assert.rejects(w.send(confirm(w)));assert.equal(w.view().pending,true);assert.equal(w.view().confirmed,0);assert.equal(w.view().masked,true);f.setVisible(true);await w.recover();assert.equal(w.view().confirmed,1);assert.equal(f.writes.length,1);
});

test('a404retry requires a fresh explicit whole-set confirmation even when body and source did not change',async()=>{
 const f=collectiveFixture(),w=createCollectiveSeniorityWorkspace(f.io);let once=true;f.hooks.beforeSend=()=>{if(once){once=false;throw Error('No registrado QA');}};await w.prepare(f.file,'propose',reason);await assert.rejects(w.send(confirm(w)));await w.recover();await assert.rejects(w.retry());assert.equal(f.writes.length,1);await w.retry(confirm(w));assert.equal(f.writes.length,2);assert.deepEqual(f.writes[0],f.writes[1]);
});

test('idle access revalidation masks prepared data on revocation, expiry, account change or an unverifiable response',async()=>{
 for(const variant of['caps','expired','account','network']){const f=collectiveFixture(),w=createCollectiveSeniorityWorkspace(f.io);await w.prepare(f.file,'propose',reason);if(variant==='caps')f.hooks.caps=[];else if(variant==='account')f.setActor('checker');else f.hooks.auth=()=>{throw Object.assign(Error('Auth sintético no verificado'),variant==='expired'?{status:401}:{});};await assert.rejects(w.revalidate());assert.equal(w.view().masked,true);assert.equal(w.view().total,0);assert.equal(w.view().reviewHash,null);assert.throws(()=>w.comparisons());assert.equal(f.writes.length,0);}
});

test('idle revocation masks the workspace but preserves the same uncertain attempt for later authorised recovery',async()=>{
 const f=collectiveFixture(),w=createCollectiveSeniorityWorkspace(f.io);f.hooks.afterSend=()=>{throw Error('Respuesta perdida QA');};await w.prepare(f.file,'propose',reason);await assert.rejects(w.send(confirm(w)));const original=structuredClone(f.writes[0]);f.hooks.caps=[];await assert.rejects(w.revalidate());assert.equal(w.view().masked,true);assert.equal(w.view().pending,true);assert.throws(()=>w.comparisons());assert.equal(f.writes.length,1);f.hooks.caps=undefined;await w.recover();assert.equal(f.writes.length,1);assert.deepEqual(f.writes[0],original);
});

test('the filtered static publication retains both seniority batch modules and every local transitive import',()=>{
 const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),build=read('scripts/build-friendly.mjs'),array=build.match(/const shellFiles = \[([\s\S]*?)\];/);assert.ok(array);const copied=[...array[1].matchAll(/'([^']+)'/g)].map(m=>m[1]),rules=read('.vercelignore').split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&!x.startsWith('#'));
 const included=file=>{let keep=true;for(const rule of rules){const neg=rule.startsWith('!'),p=neg?rule.slice(1):rule;if(p.endsWith('/')?file.startsWith(p):path.matchesGlob(file,p)||(!p.includes('/')&&path.matchesGlob(path.basename(file),p)))keep=neg;}return keep;};
 const seen=new Set(),walk=file=>{if(seen.has(file))return;seen.add(file);assert.equal(included(file),true,'Excluded runtime source: '+file);assert.equal(copied.filter(f=>f===file).length,1,'Runtime source must be copied exactly once: '+file);for(const m of read(file).matchAll(/(?:from\s*|import\s*)['"](\.\.?\/[^'"]+)['"]/g))walk(path.posix.normalize(path.posix.join(path.posix.dirname(file),m[1])));};walk('assets/own-salary-seniority-panel.js');assert.ok(seen.has('assets/own-salary-seniority-collective.js'));assert.ok(seen.has('assets/own-salary-seniority-collective-panel.js'));assert.equal(included('assets/own-salary-seniority-panel.css'),true);assert.equal(copied.filter(f=>f==='assets/own-salary-seniority-panel.css').length,1);
});

test('the reviewer can use the same declarations file: each contract\'s single pending proposal is found and compared in full',async()=>{
 const f=collectiveFixture(),maker=createCollectiveSeniorityWorkspace(f.io);await maker.prepare(f.file,'propose',reason);await maker.send(confirm(maker));assert.equal(f.writes.length,3);
 f.setActor('checker');const checker=createCollectiveSeniorityWorkspace(f.io);await checker.prepare(f.file,'approve',reason);assert.equal(checker.comparisons().length,3);assert.ok(checker.comparisons().every(r=>r.action==='approve'));
 await checker.send(confirm(checker));assert.equal(f.writes.length,6);for(const a of f.writes.slice(3)){assert.equal(a.body.command,'approve');assert.equal(a.body.reviewConfirmed,true);}
 // A different declaration in the file than the pending proposal is refused before any write.
 const g=collectiveFixture(),m2=createCollectiveSeniorityWorkspace(g.io);await m2.prepare(g.file,'propose',reason);await m2.send(confirm(m2));g.setActor('checker');const changed=structuredClone(g.file);changed.records[1].definition.months='9';const c2=createCollectiveSeniorityWorkspace(g.io);await assert.rejects(c2.prepare(changed,'approve',reason));assert.equal(g.writes.length,3);
});

test('a covered window that stays attached lets a running verification and registration finish; nominal data stays masked until visible',async()=>{
 const f=collectiveFixture(57),w=createCollectiveSeniorityWorkspace({...f.io,isAttached:()=>true,readWidth:6,sendLookahead:6,authWindowMs:60000});
 let first=true;f.hooks.bootstrap=()=>{if(first){first=false;f.setVisible(false);}};
 await w.prepare(f.file,'propose',reason);assert.equal(w.view().total,57);assert.equal(w.view().masked,true);assert.throws(()=>w.comparisons());
 f.setVisible(true);assert.equal(w.view().masked,false);assert.equal(w.comparisons().length,57);
 const ack=confirm(w);let sent=0;f.hooks.beforeSend=()=>{if(++sent===2)f.setVisible(false);};
 await w.send(ack);assert.equal(f.writes.length,57);assert.equal(w.view().complete,true);assert.equal(w.view().masked,true);
 assert.deepEqual(f.writes.map(a=>a.body.contractId),f.file.records.map(r=>r.contractId),'commands keep the file order, one at a time');
 assert.equal(new Set(f.writes.map(a=>a.key)).size,57);
});

test('without an attached scope a hidden view still stops the run before any write',async()=>{
 const f=collectiveFixture(),w=createCollectiveSeniorityWorkspace(f.io);let first=true;f.hooks.bootstrap=()=>{if(first){first=false;f.setVisible(false);}};
 await assert.rejects(w.prepare(f.file,'propose',reason));assert.equal(f.writes.length,0);assert.equal(w.view().reviewHash,null);
});

test('shared account checks and read-ahead change no command: same bodies and order, far fewer account reads; a conflict still stops at its row',async()=>{
 const runSet=async extra=>{const f=collectiveFixture(57);let auths=0;f.hooks.auth=()=>{auths++;};const w=createCollectiveSeniorityWorkspace({...f.io,...extra});await w.prepare(f.file,'propose',reason);await w.send(confirm(w));return {auths,bodies:f.writes.map(a=>a.body)};};
 const plain=await runSet({}),fast=await runSet({authWindowMs:60000,readWidth:6,sendLookahead:6});
 assert.deepEqual(fast.bodies,plain.bodies);assert.ok(fast.auths*10<plain.auths,`account reads ${fast.auths} vs ${plain.auths}`);
 const f=collectiveFixture(12),w=createCollectiveSeniorityWorkspace({...f.io,authWindowMs:60000,readWidth:6,sendLookahead:6});await w.prepare(f.file,'propose',reason);f.boots.get(id(5)).source.version='e'.repeat(64);
 await assert.rejects(w.send(confirm(w)));assert.equal(f.writes.length,4,'rows after the changed one are never sent even if they were read ahead');assert.equal(w.view().confirmed,4);assert.equal(w.view().phase,'blocked');
});

test('a revoked account is detected inside the shared window as soon as the next real check runs, and nothing else is sent',async()=>{
 let now=0;const f=collectiveFixture(12),w=createCollectiveSeniorityWorkspace({...f.io,authWindowMs:3000,now:()=>now,sendLookahead:6});await w.prepare(f.file,'propose',reason);
 f.hooks.afterSend=()=>{now+=4000;if(f.writes.length===3)f.hooks.caps=['workforce.employee.read','payroll.parameter.read'];};
 await assert.rejects(w.send(confirm(w)));assert.equal(f.writes.length,3);assert.equal(w.view().masked,true);
});

test('a reviewer needs no file: the complete set is built from each active contract\'s single pending proposal and approved exactly',async()=>{
 const f=collectiveFixture(9),maker=createCollectiveSeniorityWorkspace(f.io);await maker.prepare(f.file,'propose',reason);await maker.send(confirm(maker));assert.equal(f.writes.length,9);
 f.setActor('checker');const ticks=[];
 const set=await collectiveSeniorityPendingFile({period:f.file.period,roster:await f.io.readRoster(),readBootstrap:f.io.readBootstrap,readDetail:f.io.readDetail,width:6,progress:(done,total)=>ticks.push(done+'/'+total)});
 assert.equal(set.total,9);assert.equal(ticks.at(-1),'9/9');assert.ok(set.records.every(r=>r.proposalId!==null));
 assert.deepEqual(set.records.map(r=>[r.contractId,r.definition]),f.file.records.map(r=>[r.contractId,r.definition]),'the proposed content itself, in roster order');
 const checker=createCollectiveSeniorityWorkspace(f.io);await checker.prepare(set,'approve',reason);assert.ok(checker.comparisons().every(r=>r.action==='approve'));await checker.send(confirm(checker));
 assert.equal(f.writes.length,18);assert.ok(f.writes.slice(9).every(a=>a.body.command==='approve'&&a.body.reviewConfirmed===true&&a.body.definition===null));
 // Después de aprobar, el mismo recorrido ya no encuentra nada pendiente.
 await assert.rejects(collectiveSeniorityPendingFile({period:f.file.period,roster:await f.io.readRoster(),readBootstrap:f.io.readBootstrap,readDetail:f.io.readDetail}),/No hay propuestas/);
});

test('the file-less set is never completed with assumptions: a contract without proposal or approved declaration, or with two pending, stops it',async()=>{
 const f=collectiveFixture(4),maker=createCollectiveSeniorityWorkspace(f.io);await maker.prepare(f.file,'propose',reason);await maker.send(confirm(maker));f.setActor('checker');
 const build=()=>collectiveSeniorityPendingFile({period:f.file.period,roster:f.roster(),readBootstrap:f.io.readBootstrap,readDetail:f.io.readDetail,width:3});
 const third=f.boots.get(id(3)),kept=third.proposals.splice(0);await assert.rejects(build(),/legajo QA-3 no tiene propuesta pendiente ni declaración aprobada/);
 third.proposals.push(...kept,{...kept[0],id:id(9000)});await assert.rejects(build(),/más de una propuesta pendiente para el legajo QA-3/);
 third.proposals.pop();const ok=await build();assert.equal(ok.total,4);
 await assert.rejects(collectiveSeniorityPendingFile({period:'2026-13',roster:f.roster(),readBootstrap:f.io.readBootstrap,readDetail:f.io.readDetail}),/Elegí el mes/);
 // Un detalle que no corresponde a la propuesta pendiente detiene el armado.
 f.hooks.detail=d=>{if(d.body.contractId===id(2))d.body.period='2026-09';};await assert.rejects(build());
});

test('partly decided sets resume without a file: approved contracts come back as unchanged and only the rest is sent',async()=>{
 const f=collectiveFixture(6),maker=createCollectiveSeniorityWorkspace(f.io);await maker.prepare(f.file,'propose',reason);await maker.send(confirm(maker));f.setActor('checker');
 const first=createCollectiveSeniorityWorkspace(f.io);await first.prepare(f.file,'approve',reason);let n=0;f.hooks.beforeSend=()=>{if(++n===4)throw Object.assign(Error('Corte sintético'),{status:503});};
 await assert.rejects(first.send(confirm(first)));f.hooks.beforeSend=undefined;assert.equal(f.writes.length,10);
 // Página recargada: workspace nuevo, sin avance local. El envío cortado quedó sin registrar (falló antes de guardarse).
 const set=await collectiveSeniorityPendingFile({period:f.file.period,roster:f.roster(),readBootstrap:f.io.readBootstrap,readDetail:f.io.readDetail,width:6});
 assert.equal(set.records.filter(r=>r.proposalId===null).length,3);assert.equal(set.records.filter(r=>r.proposalId!==null).length,3);
 const next=createCollectiveSeniorityWorkspace(f.io);await next.prepare(set,'approve',reason);assert.equal(next.view().unchanged,3);await next.send(confirm(next));
 assert.equal(f.writes.length,13);assert.equal(next.view().complete,true);
 assert.equal(new Set(f.writes.slice(6).filter(a=>a.body.command==='approve').map(a=>a.body.contractId)).size,6,'every contract is approved, none twice by this reviewer flow beyond the interrupted attempt');
});
