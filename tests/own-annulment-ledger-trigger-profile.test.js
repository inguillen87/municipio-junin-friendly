// Pure source profile tests, never PostgreSQL, provider state or QA fixtures.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import net from 'node:net';import tls from 'node:tls';import http from 'node:http';import https from 'node:https';import dns from 'node:dns';import childProcess from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
const forbidden=()=>{throw Error('LEDGER_TRIGGER_PROFILE_EXTERNAL_IO_FORBIDDEN');};
net.connect=net.createConnection=net.Socket.prototype.connect=tls.connect=forbidden;http.request=http.get=https.request=https.get=forbidden;globalThis.fetch=forbidden;
for(const name of Object.keys(dns))if(/^(?:lookup|resolve|reverse)/.test(name)&&typeof dns[name]==='function')dns[name]=forbidden;for(const name of Object.keys(dns.promises))if(typeof dns.promises[name]==='function')dns.promises[name]=forbidden;
for(const name of['exec','execSync','execFile','execFileSync','spawn','spawnSync','fork'])childProcess[name]=forbidden;syncBuiltinESMExports();
const{buildOwnAnnulmentLedgerTriggerProfile,assertOwnAnnulmentLedgerTriggerProfile,projectOwnAnnulmentLedgerTriggerGuard,OWN_ANNULMENT_LEDGER_TRIGGER_PROFILE_SOURCE_PINS}=await import('../scripts/lib/own-annulment-ledger-trigger-profile.mjs');
const{splitPostgresStatements}=await import('../scripts/lib/sql-statements.mjs');
const readRaw=file=>fs.readFileSync(new URL('../'+file,import.meta.url)),sourceCommit='0322ec45229f8a34d5143b17174ca8b5bf60044d',profile='positions128129-adopted.v2';
const hash=value=>createHash('sha256').update(value).digest('hex');
const build=(reader=readRaw)=>buildOwnAnnulmentLedgerTriggerProfile({readRaw:reader,sourceCommit,profile});
let cached;const value=()=>cached??=build();

test('strict desired profile derives exactly twelve source triggers, four capture and two on each other ledger',()=>{
 const p=value();assert.equal(p.profile,profile);assert.equal(p.version,'own-annulment-ledger-trigger-profile.v1');assert.equal(p.definitions.length,12);assert.equal(p.immutableDefinitions.length,10);
 assert.deepEqual(p.expectedCounts,{'public.own_payroll_run_capture':4,'public.own_payroll_run_result':2,'public.own_payroll_liquidation_event':2,'public.own_payroll_close_event':2,'public.own_payroll_annul_event':2});
 assert.deepEqual(p.definitions.slice(0,10).map(({expectedCount,...d})=>d),p.immutableDefinitions,'all ten old immutable source records preserved');
 assert.deepEqual(p.definitions.slice(10).map(t=>[t.name,t.handler,t.type,t.expectedCount]),[
  ['own_run_position_capture','public.position_assignment_capture_trigger_v1()',5,4],['own_run_position_dimensions','public.position_comparison_capture_trigger_v1()',5,4]
 ]);
 assert.equal(new Set(p.definitions.map(t=>t.table+':'+t.name)).size,12);
 for(const d of p.definitions){assert.match(d.sourceStatementSha256,/^[a-f0-9]{64}$/);assert.ok(d.table.startsWith('public.'));assert.ok([5,27,34].includes(d.type));assert.equal(d.expectedCount,p.expectedCounts[d.table]);}
 assert.equal(p.scope.original129Fallback,false);assert.equal(p.scope.canonicalEpochRequired,profile);
});

test('two handler pins are public canonical source: assignment original128 and comparison adopted-v2, preserved by210/216',()=>{
 const p=value();assert.deepEqual(p.handlerPins.map(x=>x.signature),['public.position_assignment_capture_trigger_v1()','public.position_comparison_capture_trigger_v1()']);
 assert.ok(p.handlerPins.every(x=>x.runtime===false&&x.resultType==='trigger'&&x.definer===true&&x.argNames.length===0&&x.config.join('|')==='search_path=pg_catalog, public, pg_temp'));
 assert.deepEqual(p.handlerOrigins.map(o=>o.selectedVector),['dependencies','afterPins']);assert.ok(p.handlerOrigins.every(o=>o.authority==='scripts/lib/adopted-positions-installation.mjs'));
 const d=p.derivation.adoptedComparison;assert.equal(d.wholeInverseVerified,true);assert.notEqual(d.originalBodySha256,d.afterBodySha256);assert.equal(d.afterBodySha256,p.handlerPins[1].sha256);assert.ok(d.definition.startsWith('CREATE OR REPLACE FUNCTION public.position_comparison_capture_trigger_v1()'));
 assert.ok(d.definition.includes('public.payroll_fixed_registry_subject_v2(')&&d.definition.includes('public.payroll_fixed_registry_range_v2('));assert.ok(!d.definition.includes('public.native_employment_change_subject_v1('));
 let inverse=d.definition;for(const op of [...d.operations].reverse()){assert.equal(inverse.split(op.to).length,2);inverse=inverse.replace(op.to,()=>op.from);}assert.equal(hash(inverse),d.originalDefinitionSha256,'finite complete original129 inverse');
 assert.ok(p.derivation.successors.population210PreservesBothHandlers&&p.derivation.successors.identity216PreservesBothHandlers);
 assert.ok(p.handlerPins.every(pin=>!p.derivation.successors.functions210.includes(pin.name)&&!p.derivation.successors.functions216.includes(pin.name)));
 assert.ok(p.handlerChecks.includes(d.afterBodySha256));assert.ok(!p.handlerChecks.includes(d.originalBodySha256),'original129 is not an alternate admitted body');
 for(const[key,digest]of Object.entries(p.sourceHashes)){assert.match(key,/^(scripts|assets|lib|tests)\//);assert.equal(hash(readRaw(key)),digest,'relative-canonical source custody '+key);}
});

test('only a minted profile can project the exact old guard, with complete inverse and no registry mutation',()=>{
 const p=value(),projected=projectOwnAnnulmentLedgerTriggerGuard({profile:p,legacyGuard:p.legacyGuard});assert.equal(projected.guard,p.guard);assert.equal(projected.legacySha256,hash(p.legacyGuard));assert.equal(projected.projectedSha256,hash(p.guard));assert.equal(projected.wholeInverseVerified,true);assert.equal(projected.profile,profile);
 const literal=v=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
 assert.ok(p.legacyGuard.includes(literal(p.immutableDefinitions)));assert.ok(p.guard.includes(literal(p.definitions)));assert.ok(!p.guard.includes(literal(p.immutableDefinitions)));
 assert.ok(p.legacyGuard.includes('(SELECT count(*) FROM pg_trigger WHERE tgrelid=r AND NOT tgisinternal)<>2'));
 assert.ok(p.guard.includes("(SELECT count(*) FROM pg_trigger WHERE tgrelid=r AND NOT tgisinternal)<>(x->>'expectedCount')::integer"));
 assert.throws(()=>projectOwnAnnulmentLedgerTriggerGuard({profile:p,legacyGuard:p.legacyGuard+' '}),/LEDGER_TRIGGER_EXACT_LEGACY_GUARD/);
 assert.throws(()=>projectOwnAnnulmentLedgerTriggerGuard({profile:{...p},legacyGuard:p.legacyGuard}),/LEDGER_TRIGGER_MINTED_PROFILE_REQUIRED/);
 assert.throws(()=>assertOwnAnnulmentLedgerTriggerProfile({...p}),/LEDGER_TRIGGER_MINTED_PROFILE_REQUIRED/);
 assert.throws(()=>projectOwnAnnulmentLedgerTriggerGuard({profile:p,legacyGuard:p.legacyGuard,expectedGuard:p.guard}),/LEDGER_TRIGGER_PROJECTION_OPTIONS/);
 assert.equal(hash(readRaw('scripts/lib/own-annul209-public-predecessor-registry.mjs')),'e2a5abb7f69e974993882519c35740aaecb83760af7aac9386a48e0a09458c39');
});

test('guard checks the complete trigger shape, exact counts and handler owner-only ACL without calling handlers',()=>{
 const p=value();assert.equal(splitPostgresStatements(p.guard).length,3,'strict trigger, handler metadata and owner ACL statements');
 for(const field of['tgtype','tgenabled','tgfoid','tgqual','tgnargs','tgargs','tgattr','tgconstraint','tgdeferrable','tginitdeferred','tgparentid','tgconstrrelid','tgconstrindid','tgoldtable','tgnewtable','tgisinternal','relowner','relkind','relpersistence','relrowsecurity','relforcerowsecurity','relispartition','reloptions','relreplident','pg_policy','pg_inherits','attacl'])assert.match(p.guard,new RegExp('\\b'+field+'\\b'),field+' is checked');
 assert.ok(p.handlerChecks.includes("FROM pg_proc other WHERE other.pronamespace=p.pronamespace AND other.proname=p.proname)<>1"));
 assert.ok(p.handlerChecks.includes("FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))))<>1"));
 assert.ok(p.handlerChecks.includes('a.grantee<>p.proowner')&&p.handlerChecks.includes('a.grantor<>p.proowner')&&p.handlerChecks.includes('a.is_grantable'));
 const code=p.guard.replace(/'(?:[^']|'')*'/g,"''");assert.doesNotMatch(code,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|DROP|EXECUTE|CALL|GRANT|REVOKE|COMMIT|ROLLBACK)\b/i);
 assert.doesNotMatch(code,/public\.position_(?:assignment|comparison)_capture_trigger_v1\s*\(/);
 assert.equal(p.executesSql,false);assert.equal(p.connects,false);assert.equal(p.observedCatalogUsed,false);assert.equal(p.executionAdmitted,false);assert.equal(p.businessWrites,0);assert.equal(p.nominalRowsReturned,0);
});

test('rejects every pinned-source mutation and any original/unknown or observation-derived profile input',()=>{
 for(const file of Object.keys(OWN_ANNULMENT_LEDGER_TRIGGER_PROFILE_SOURCE_PINS))assert.throws(()=>build(name=>{const raw=readRaw(name);if(name!==file)return raw;const changed=Buffer.from(raw);changed[0]^=1;return changed;}),/LEDGER_TRIGGER_SOURCE_SHA:/,file);
 assert.throws(()=>build(file=>readRaw(file).toString('utf8')),/LEDGER_TRIGGER_RAW_BUFFER/);
 for(const wrong of['positions128129-original.v1','positions128129-adopted.v1','',undefined])assert.throws(()=>buildOwnAnnulmentLedgerTriggerProfile({readRaw,sourceCommit,profile:wrong}),/LEDGER_TRIGGER_DESIRED_PROFILE_ONLY/);
 for(const extra of[{observedHandlers:[]},{expectedPins:[]},{passed:true},{catalogue:{}}])assert.throws(()=>buildOwnAnnulmentLedgerTriggerProfile({readRaw,sourceCommit,profile,...extra}),/LEDGER_TRIGGER_EXACT_SOURCE_OPTIONS/);
});

test('source bookend and immutable public profile do not authorize SQL or installation',()=>{
 let changed=false;const file=Object.keys(OWN_ANNULMENT_LEDGER_TRIGGER_PROFILE_SOURCE_PINS)[0],p=build(name=>{const raw=readRaw(name);return changed&&name===file?Buffer.concat([raw,Buffer.from('\n')]):raw;});
 for(const object of[p,p.definitions,p.definitions[0],p.handlerPins,p.handlerPins[1],p.expectedCounts,p.derivation,p.sourceHashes])assert.ok(Object.isFrozen(object));
 assert.throws(()=>{p.expectedCounts['public.own_payroll_run_capture']=3;},TypeError);assert.strictEqual(assertOwnAnnulmentLedgerTriggerProfile(p),p);
 assert.deepEqual(p.sourceBookend(),{sourceCommit,sourceHashes:{...p.sourceHashes},sourceOnly:true});changed=true;assert.throws(()=>p.sourceBookend(),/LEDGER_TRIGGER_SOURCE_BOOKEND/);
 assert.equal(Object.hasOwn(p,'passed'),false);assert.equal(Object.hasOwn(p,'proof'),false);
});
