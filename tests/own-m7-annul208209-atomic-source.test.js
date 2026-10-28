// Pure source tests. Network and child process entry points are disabled before
// the production module is imported. No native observation or admission here.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {createHash} from 'node:crypto';

const restored=[],attempts=[];
const block=(object,key)=>{const original=object[key];restored.push(()=>{object[key]=original;});object[key]=()=>{attempts.push(key);throw Error('ATOMIC_SOURCE_TEST_EXTERNAL_EFFECT_FORBIDDEN:'+key);};};
for(const key of ['connect','createConnection','createServer'])block(net,key);
block(net.Socket.prototype,'connect');block(tls,'connect');block(tls,'createServer');
for(const object of [http,https])for(const key of ['request','get','createServer'])block(object,key);
for(const key of ['lookup','resolve','resolve4','resolve6','reverse'])block(dns,key);
for(const key of ['exec','execFile','execSync','execFileSync','spawn','spawnSync','fork'])block(childProcess,key);
block(globalThis,'fetch');syncBuiltinESMExports();
after(()=>{for(const restore of restored.reverse())restore();syncBuiltinESMExports();});

const source=await import('../scripts/lib/own-m7-annul208209-atomic-source.mjs');
const {composeOwnM7Annul208209AtomicSource,assertOwnM7Annul208209AtomicSource,bookendOwnM7Annul208209AtomicSource,OWN_M7_ANNUL208209_ATOMIC_SOURCE_VERSION}=source;
const {composeOwnAnnulmentReview208PublicSource}=await import('../scripts/lib/own-m7-public-annulment208-source.mjs');
const {composeOwnAnnul209PublicPredecessorRegistry}=await import('../scripts/lib/own-annul209-public-predecessor-registry.mjs');
const {ownInstallationFunctionPin}=await import('../scripts/lib/own-payroll-installation.mjs');
const {pinsCheck}=await import('../scripts/lib/native-leave-installation.mjs');
const {projectOwnAnnulmentLedgerTriggerGuard,assertOwnAnnulmentLedgerTriggerProfile}=await import('../scripts/lib/own-annulment-ledger-trigger-profile.mjs');
const FILE='scripts/lib/own-m7-annul208209-atomic-source.mjs',TAIL='scripts/lib/own-m7-public-annulment208209.mjs';
const PROFILE_FILE='scripts/lib/own-annulment-ledger-trigger-profile.mjs';
const SQL208='scripts/migrations/208-own-annulment-review-index.sql',SQL209='scripts/migrations/209-own-annulment-preparation-projection.sql';
const sourceCommit='a'.repeat(40),major=17,operationalPairBaseline='published107';
const sha=value=>createHash('sha256').update(value).digest('hex'),lf=value=>value.replace(/\r\n?/g,'\n'),q=value=>"'"+value.replaceAll("'","''")+"'";
const rawCache=new Map(),overrides=new Map();
const rawRead=file=>{if(!rawCache.has(file))rawCache.set(file,fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'));return rawCache.get(file);};
const read=file=>overrides.has(file)?overrides.get(file):rawRead(file);
let cached,public208,registry;
const components=()=>cached??=composeOwnM7Annul208209AtomicSource({read,sourceCommit,major});
const review=()=>public208??=composeOwnAnnulmentReview208PublicSource({read,sourceCommit,major});
const predecessors=()=>registry??=composeOwnAnnul209PublicPredecessorRegistry({read,sourceCommit,operationalPairBaseline});
const embedded=(raw,stage)=>[...lf(raw).matchAll(new RegExp('EXECUTE \\$definition_'+stage+'\\$(CREATE FUNCTION public\\.[\\s\\S]*?)\\$definition_'+stage+'\\$;','g'))].map(match=>match[1]);

test('minted atomic SOURCE components derive all ten functions from whole pinned SQL, retain the complete50 closure and six facades',()=>{
 const c=components();assert.equal(c.version,OWN_M7_ANNUL208209_ATOMIC_SOURCE_VERSION);assert.equal(c.major,major);assert.equal(c.schema,'public');assert.equal(c.sourceCommit,sourceCommit);
 assert.equal(c.raw208,rawRead(SQL208));assert.equal(c.raw209,rawRead(SQL209));
 assert.equal(sha(lf(c.raw208)),'2f0b030f12570f37ea3357707309422754522af66dc85475fd81e9a473c1b402');assert.equal(sha(lf(c.raw209)),'eabc4f72cc0203a87af50287fcb6367a2ca81e6f957e73b5ee1c2b868aeb6dc4');
 assert.equal(c.ownPins208.length,7);assert.equal(c.ownPins209.length,3);assert.equal([...c.ownPins208,...c.ownPins209].filter(pin=>pin.runtime).length,6);
 assert.equal(c.predecessorEntries.length,50);assert.equal(c.predecessorClosure.memberCount,50);assert.equal(c.privateScalarSignatures.length,11);assert.equal(c.triggerSources.length,12);assert.equal(c.immutableTriggerSources.length,10);assert.equal(new Set(c.triggerSources.map(item=>item.table)).size,5);assert.equal(c.ledgerProfile,'positions128129-adopted.v2');assert.equal(c.ledgerHandlerPins.length,2);
 assert.equal(c.privateDate.pin.defaults,'true');assert.match(c.privateDate.definition,/required boolean DEFAULT true/);
 const table=c.predecessorEntries.find(item=>item.pin.signature==='public.tenant_iam_effective_capabilities(uuid)');assert.equal(table.pin.kind,'table');assert.deepEqual(table.pin.argModes,['i','t']);assert.equal(table.pin.runtime,false);
 assert.equal(c.capacityEpoch.wholeGuardInverse,true);assert.equal(c.capacityEpoch.unchangedOtherRecords,26);assert.equal(c.capacityEpoch.post215.length,27);
 for(const[stage,raw,pins]of[[208,c.raw208,c.ownPins208],[209,c.raw209,c.ownPins209]]){
  const definitions=embedded(raw,stage);assert.equal(definitions.length,pins.length);
  for(let index=0;index<pins.length;index++){
   assert.deepEqual({...ownInstallationFunctionPin(definitions[index]),runtime:pins[index].runtime},pins[index]);
   const origin=c.ownProvenance.find(item=>item.signature===pins[index].signature);assert.equal(origin.sourceDefinitionSha256,sha(definitions[index]));assert.equal(origin.sourceBodySha256,pins[index].sha256);assert.equal(origin.sourceSha256,c.sourceSqlHashes[stage]);
  }
 }
 assert.deepEqual(c.counts,{predecessorFunctions:50,newFunctions:10,privateHelpers:4,runtimeFacades:6,newTables:0,adaptedFunctions:0});
});

test('source208 and all historical registry guards retain exact SQL; only ledgerTriggers receives the declared source-derived strict12 projection',()=>{
 const c=components(),p=review(),r=predecessors();
 assert.deepEqual(c.pre208Guards,[p.statements[0],p.statements[2],p.statements[3]]);
 assert.deepEqual(c.registryGuardOrder,Object.keys(r.guards));assert.deepEqual(c.legacyRegistryGuards,r.guards);assert.deepEqual(c.immutableTriggerSources,r.triggerSources);for(const key of Object.keys(r.guards).filter(key=>key!=='ledgerTriggers'))assert.equal(c.registryGuards[key],r.guards[key]);assert.notEqual(c.registryGuards.ledgerTriggers,r.guards.ledgerTriggers);assert.deepEqual(c.pre209Guards,Object.values(c.registryGuards));assert.equal(c.registryGuardsJoined,Object.values(c.registryGuards).join(';\n'));
 assert.equal(c.pre209Guards.at(-1),r.guards.required208Functions);for(const pin of c.ownPins208)assert.ok(c.pre209Guards.at(-1).includes(pin.signature));
 assert.deepEqual(c.compatibilityGuards,[...Object.entries(c.registryGuards).filter(([key])=>key!=='required208Functions').map(([,sql])=>sql),p.statements[2],p.statements[3],c.absence10]);
 assert.equal(c.guardReferences.compatibility.at(-1).source,TAIL);
 const absenceTemplate=/const absence=names=>`([^]*?)`;/u.exec(lf(rawRead(TAIL)))[1];
 assert.equal(c.absence10,absenceTemplate.replace("${names.map(q).join(',')}",()=>[...c.ownPins208,...c.ownPins209].map(pin=>q(pin.name)).join(',')));
 for(const pin of [...c.ownPins208,...c.ownPins209])assert.ok(c.absence10.includes(q(pin.name)));
 for(const[group,sqls]of[['pre208',c.pre208Guards],['post208',c.post208Guards],['pre209',c.pre209Guards],['post209',c.post209Guards],['compatibility',c.compatibilityGuards]]){
  assert.equal(c.guardReferences[group].length,sqls.length);for(let index=0;index<sqls.length;index++){
   const ref=c.guardReferences[group][index];assert.equal(ref.sha256,sha(sqls[index]));assert.equal(ref.sourceSha256,c.sourceHashes[ref.source]);assert.ok(ref.selector.length>0);
  }
 }
 const ledgerRef=c.guardReferences.pre209[c.registryGuardOrder.indexOf('ledgerTriggers')];assert.equal(ledgerRef.source,PROFILE_FILE);assert.equal(ledgerRef.legacyGuardSha256,sha(r.guards.ledgerTriggers));assert.equal(ledgerRef.wholeInverseVerified,true);assert.equal(ledgerRef.profile,c.ledgerProfile);
});

test('both post guards use the exact pinned209 ACL template with owner/header/body checks and exact one-or-two privileges',()=>{
 const c=components(),tail=lf(rawRead(TAIL));
 const start='function aclAndOverloads(pins){return `',end='`;}\nfunction detailFault(';
 assert.equal(tail.split(start).length,2);assert.equal(tail.split(end).length,2);
 const template=tail.slice(tail.indexOf(start)+start.length,tail.indexOf(end));
 for(const[stage,pins,guards]of[[208,c.ownPins208,c.post208Guards],[209,c.ownPins209,c.post209Guards]]){
  assert.equal(guards[0],pinsCheck(pins,'ANNUL'+stage+'_NEW_FUNCTION_SOURCE_CHANGED'));
  assert.equal(guards[1],template.replace('${q(JSON.stringify(pins))}',()=>q(JSON.stringify(pins))));
  assert.match(guards[0],/p\.proowner<>current_user::regrole/);assert.match(guards[0],/p\.proargmodes IS NOT NULL/);assert.match(guards[0],/pg_get_expr\(p\.proargdefaults,0\)/);assert.match(guards[0],/p\.proconfig/);assert.match(guards[0],/public\.digest/);
  assert.match(guards[1],/grantor<>p.proowner/);assert.match(guards[1],/a\.is_grantable/);assert.match(guards[1],/count\(\*\) FROM pg_proc other[\s\S]*<>1/);
  assert.ok(guards[1].includes("OR(SELECT count(*) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))))<>(CASE WHEN(x->>'runtime')::boolean THEN 2 ELSE 1 END)"));
  assert.equal(c.guardReferences['post'+stage][1].wholeInverse,true);assert.equal(c.guardReferences['post'+stage][1].templateSha256,sha(template));
 }
 // The raw209 in this source epoch already contains the two required CASE
 // parentheses. This composer does not patch, normalize or invent a successor.
 assert.ok(c.raw209.includes("IS DISTINCT FROM (CASE history_event.command WHEN 'confirm' THEN 'confirmed' WHEN 'annul' THEN 'annulled' ELSE 'cancelled' END) OR"));
 assert.ok(c.raw209.includes("<>(CASE WHEN new_name='own_annul_preparation_core_v1' THEN 1 ELSE 2 END) OR"));
});

test('source inputs cover every raw read and retain full RAW and LF provenance without observed metadata',()=>{
 const c=components();assert.equal(c.sourceInputs.length,Object.keys(c.sourceHashes).length);assert.ok(c.sourceInputs.length>30);
 for(const input of c.sourceInputs){const raw=rawRead(input.path);assert.equal(input.rawSha256,sha(raw));assert.equal(input.rawUtf8Bytes,Buffer.byteLength(raw));assert.equal(input.lfSha256,sha(lf(raw)));assert.equal(input.lfUtf8Bytes,Buffer.byteLength(lf(raw)));assert.equal(c.sourceHashes[input.path],input.lfSha256);}
 for(const file of[FILE,TAIL,SQL208,SQL209,PROFILE_FILE,'scripts/lib/native-leave-installation.mjs','scripts/lib/own-annul209-public-predecessor-registry.mjs','scripts/lib/own-m7-public-annulment208-source.mjs'])assert.ok(c.sourceHashes[file]);
 for(const[file,digest]of Object.entries(review().sourceHashes))assert.equal(c.sourceHashes[file],digest);for(const[file,digest]of Object.entries(predecessors().sourceHashes))assert.equal(c.sourceHashes[file],digest);
 const bookend=bookendOwnM7Annul208209AtomicSource(c);assert.equal(bookend.sourceVerified,true);assert.equal(bookend.observedMetadataUsed,false);assert.equal(bookend.executionAdmitted,false);assert.equal(bookend.receiptIssued,false);assert.equal(bookend.sourceHashes,c.sourceHashes);
});

test('closed factory options reject observed metadata, raw SQL, target, actors and passed receipts before reading',()=>{
 let reads=0;const noRead=()=>{reads++;throw Error('READ_FORBIDDEN');};
 for(const extra of[{observedMetadata:{}},{sourceHashes:{}},{raw208:'sql'},{ownPins209:[]},{registry:{}},{target:{kind:'production'}},{client:{}},{actor:{}},{passed:true},{sourceReceiptPassed:true},{connects:false},{ledgerProfile:'positions128129-original.v1'}])assert.throws(()=>composeOwnM7Annul208209AtomicSource({read:noRead,sourceCommit,major,...extra}),/ATOMIC_SOURCE_OPTIONS_EXACT/);
 for(const invalid of[{major:16},{major:'17'},{sourceCommit:'wrong'}])assert.throws(()=>composeOwnM7Annul208209AtomicSource({read:noRead,sourceCommit,major,...invalid}));
 assert.equal(reads,0);
 const c=components();assert.equal(assertOwnM7Annul208209AtomicSource(c,{sourceCommit,major}),c);assert.equal(assertOwnM7Annul208209AtomicSource(c),c);
 assert.throws(()=>assertOwnM7Annul208209AtomicSource(c,{sourceCommit,major,observedMetadata:{}}),/ASSERT_OPTIONS_EXACT/);assert.throws(()=>assertOwnM7Annul208209AtomicSource(c,{sourceCommit:'b'.repeat(40),major}),/COMMIT_CHANGED/);assert.throws(()=>assertOwnM7Annul208209AtomicSource(c,{sourceCommit,major:18}),/MAJOR_CHANGED/);
});

test('unminted clones and forged admissions cannot become SOURCE components; the minted value is deeply frozen',()=>{
 const c=components();for(const clone of[{...c},JSON.parse(JSON.stringify(c)),{...c,passed:true,executionAdmitted:true},{...c,version:'own-m7-annul208209-atomic-source-components.v1'},{...c,ledgerProfile:'positions128129-original.v1'}]){
  assert.throws(()=>assertOwnM7Annul208209AtomicSource(clone),/MINTED_SOURCE_COMPONENTS_REQUIRED/);assert.throws(()=>bookendOwnM7Annul208209AtomicSource(clone),/MINTED_SOURCE_COMPONENTS_REQUIRED/);
 }
 for(const item of[c,c.ownPins208,c.ownPins209[0],c.ownPins209[0].config,c.predecessorEntries,c.predecessorEntries[0].pin,c.sourceInputs,c.guardReferences,c.guardReferences.pre209[0]])assert.ok(Object.isFrozen(item));
 assert.throws(()=>{c.ownPins209[0].runtime=true;},TypeError);assert.throws(()=>{c.registryGuards.required208Functions='SELECT true';},TypeError);
 for(const key of['target','passed','sourceReceiptPassed','proof','proofs','native','snapshot','installation','admission','execute','transaction','validatedNativeProofs'])assert.equal(Object.hasOwn(c,key),false,key);
 for(const key of['observedMetadataUsed','connects','executesSql','createsActors','executionAdmitted','receiptIssued'])assert.equal(c[key],false,key);
 assert.equal(c.sourceComponentsOnly,true);assert.equal(c.targetIndependent,true);assert.equal(c.roleAssignmentsAdded,0);
 assert.deepEqual(Object.keys(source).sort(),['OWN_M7_ANNUL208209_ATOMIC_SOURCE_VERSION','assertOwnM7Annul208209AtomicSource','bookendOwnM7Annul208209AtomicSource','composeOwnM7Annul208209AtomicSource'].sort());
});

test('pinned source injection fails before composition, and any RAW-only change poisons bookend despite an identical LF hash',()=>{
 for(const file of[SQL208,SQL209,TAIL,PROFILE_FILE,'scripts/lib/own-m7-public-annulment208-source.mjs','scripts/lib/own-annul209-public-predecessor-registry.mjs','scripts/lib/native-leave-installation.mjs','scripts/migrations/128-own-position-assignments.sql','scripts/migrations/129-own-position-comparison.sql','scripts/lib/adopted-positions-installation.mjs'])assert.throws(()=>composeOwnM7Annul208209AtomicSource({read:p=>p===file?rawRead(p)+'\n-- injected foreign source':rawRead(p),sourceCommit,major}),/ATOMIC_PINNED_SOURCE_CHANGED/);
 const c=components();for(const file of[SQL208,SQL209,FILE,PROFILE_FILE,'scripts/migrations/006-tenant-action-authority.sql']){
  const raw=rawRead(file),changed=raw.includes('\r\n')?raw.replace('\r\n','\n'):raw.replace('\n','\r\n');assert.notEqual(raw,changed);assert.equal(sha(lf(raw)),sha(lf(changed)));
  try{overrides.set(file,changed);assert.throws(()=>bookendOwnM7Annul208209AtomicSource(c),/ATOMIC_RAW_SOURCE_BOOKEND_CHANGED/);assert.throws(()=>assertOwnM7Annul208209AtomicSource(c),/ATOMIC_RAW_SOURCE_BOOKEND_CHANGED/);}finally{overrides.delete(file);}
 }
 assert.equal(bookendOwnM7Annul208209AtomicSource(c).sourceVerified,true);
 let reads=0;assert.throws(()=>composeOwnM7Annul208209AtomicSource({read:file=>{if(file===SQL208&&++reads===2)return rawRead(file)+'\n';return rawRead(file);},sourceCommit,major}),/ATOMIC_RAW_SOURCE_DRIFT/);
});

test('the adopted strict12 profile is minted, exact-counted and whole-invertible; unknown extras and original129 handler fallback are rejected',()=>{
 const c=components(),profile=c.ledgerTriggerProfile,original=c.legacyRegistryGuards.ledgerTriggers;
 assert.equal(assertOwnAnnulmentLedgerTriggerProfile(profile),profile);const projected=projectOwnAnnulmentLedgerTriggerGuard({profile,legacyGuard:original});assert.equal(projected.guard,c.registryGuards.ledgerTriggers);assert.equal(projected.wholeInverseVerified,true);assert.equal(projected.legacySha256,sha(original));assert.equal(projected.projectedSha256,sha(projected.guard));
 const counts=Object.fromEntries([...new Set(c.triggerSources.map(value=>value.table))].map(table=>[table,c.triggerSources.filter(value=>value.table===table).length]));assert.equal(counts['public.own_payroll_run_capture'],4);for(const[table,count]of Object.entries(counts))if(table!=='public.own_payroll_run_capture')assert.equal(count,2);
 assert.ok(!projected.guard.includes('>=2'));assert.ok(projected.guard.includes('expectedCount'));assert.equal(c.triggerSources.filter(value=>value.type===5).length,2);
 for(const pin of c.ledgerHandlerPins){assert.equal(pin.runtime,false);assert.equal(pin.resultType,'trigger');assert.ok(projected.guard.includes(pin.signature));assert.ok(projected.guard.includes(pin.sha256));}
 const comparisonRaw=lf(rawRead('scripts/migrations/129-own-position-comparison.sql')),comparisonDefinition=/CREATE FUNCTION public\.position_comparison_capture_trigger_v1\([\s\S]*?\bAS\s+(\$\w*\$)[\s\S]*?\1/.exec(comparisonRaw)[0],originalPin=ownInstallationFunctionPin(comparisonDefinition),adopted=c.ledgerHandlerPins.find(pin=>pin.name===originalPin.name);assert.notEqual(adopted.sha256,originalPin.sha256);assert.ok(!projected.guard.includes(originalPin.sha256));
 for(const legacyGuard of[original+';DO $$ BEGIN NULL;END $$',original.replace('<>2','>=2'),original.replace('own_run_capture_immutable','unknown_extra_trigger')])assert.throws(()=>projectOwnAnnulmentLedgerTriggerGuard({profile,legacyGuard}));
 assert.throws(()=>projectOwnAnnulmentLedgerTriggerGuard({profile:{...profile},legacyGuard:original}));assert.throws(()=>assertOwnAnnulmentLedgerTriggerProfile({...profile,profile:'positions128129-original.v1'}));
});

test('major18 changes only source context, keeps a target-independent SOURCE object and performs no external effects',()=>{
 const c=composeOwnM7Annul208209AtomicSource({read,sourceCommit,major:18}),prior=components();
 assert.equal(c.major,18);assert.match(c.pre208Guards[0],/server_version_num'\)::integer\/10000<>18/);assert.equal(c.raw208,prior.raw208);assert.equal(c.raw209,prior.raw209);assert.deepEqual(c.ownPins208,prior.ownPins208);assert.deepEqual(c.ownPins209,prior.ownPins209);assert.deepEqual(c.pre209Guards,prior.pre209Guards);assert.deepEqual(c.compatibilityGuards,prior.compatibilityGuards);
 assert.equal(c.targetIndependent,true);assert.deepEqual(attempts,[]);
 const moduleText=rawRead(FILE);assert.ok(!/\beval\s*\(|\bnew\s+Function\b/.test(moduleText));assert.ok(!/^import .*own-m7-public-annulment208209\.mjs/m.test(moduleText));assert.ok(!moduleText.includes('composeOwnM7PublicSchemaBatch('));
});
