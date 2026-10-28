// Desired public SOURCE profile only. No catalogue-derived expectations,
// migration, trigger invocation or automatic fallback to the original129 body.
// The historical registry/tail stays unchanged; only its one minted guard may
// be replaced by the exact finite projection returned here for the new protocol.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildAdoptedPositionsInstallation} from './adopted-positions-installation.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
import {splitPostgresStatements} from './sql-statements.mjs';
const REGISTRY='scripts/lib/own-annul209-public-predecessor-registry.mjs';
const ADOPTED='scripts/lib/adopted-positions-installation.mjs';
const POPULATION='scripts/lib/position-population-installation.mjs';
const IDENTITY='scripts/lib/position-administrative-identity216-source.mjs';
const SQL128='scripts/migrations/128-own-position-assignments.sql',SQL129='scripts/migrations/129-own-position-comparison.sql';
const LEDGERS=['scripts/migrations/123-own-payroll-runs.sql','scripts/migrations/124-own-payroll-liquidation-decisions.sql','scripts/migrations/125-own-payroll-close.sql','scripts/migrations/146-own-consolidated-annulment.sql'];
const PROFILE='positions128129-adopted.v2',ROLE='municontrol_actions_runtime_app';
const HASH=/^[a-f0-9]{64}$/,sha=value=>createHash('sha256').update(value).digest('hex'),q=value=>"'"+String(value).replaceAll("'","''")+"'";
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const minted=new WeakMap();
export const OWN_ANNULMENT_LEDGER_TRIGGER_PROFILE=PROFILE;
export const OWN_ANNULMENT_LEDGER_TRIGGER_PROFILE_SOURCE_PINS=freeze({
 [LEDGERS[0]]:{bytes:29960,sha256:'a9fe1129e921bb7c01985b8caadb009f6086aef9866e2298398175f7f25b4b6b'},
 [LEDGERS[1]]:{bytes:21146,sha256:'03035e3f7e126b1561222f1a894bcf1000dd586b6d05fb579cb4722d9aa41f4a'},
 [LEDGERS[2]]:{bytes:27089,sha256:'443127dd55b9be5f37da47af303fcdd599b4d5dc0aad0a319a18253f8f139af5'},
 [LEDGERS[3]]:{bytes:14566,sha256:'8337df26dc3c22fe8c156e19d7511db6c537f08b219633f6add981c774a48fe6'},
 [SQL128]:{bytes:29134,sha256:'d50a2a14e478868b4086514fc0ddd47bd116ba761a88b0a2ff28e36866ce1e78'},
 [SQL129]:{bytes:12261,sha256:'023ad52a441df027ea8121a404777fbe4424dbbcfcdbeca6ca30b7475e17bc3c'},
 [REGISTRY]:{bytes:49066,sha256:'e2a5abb7f69e974993882519c35740aaecb83760af7aac9386a48e0a09458c39'},
 [ADOPTED]:{bytes:9351,sha256:'b5e1f9185e42c3a3372b443e8d6383d8259b155217e9db48b121f5d07cc56ab9'},
 [POPULATION]:{bytes:9294,sha256:'9a03e7cace602eefea07931ccfaacd643adb7d1c11e49da46e648361e5d25141'},
 [IDENTITY]:{bytes:20409,sha256:'209033f6b504bffabe8ef089ee56b828287e5dd14e27e5726d2c259ac769b082'},
 'scripts/migrations/210-own-position-population-proof.sql':{bytes:10676,sha256:'743a4962e6162016c467ccb5c4212a5a4cd9e905b8bb31bbe4bb85e0c2dceefd'},
 'scripts/migrations/216-own-position-administrative-identity.sql':{bytes:23916,sha256:'08cb2819b52a6da94ce8158a2b20c9d1739e0e742331dee171b92d11d6a66e68'},
 'scripts/lib/position-assignment-installation.mjs':{bytes:14630,sha256:'14f86d4b033a9558d40e197ca6f315d486d82490a3579e8d4eade390a29de426'},
 'scripts/lib/position-comparison-installation.mjs':{bytes:11427,sha256:'4a136504b70f66c00391614274474a1d4f7dd46dc55bbbe1e02972b9eda2fd7d'},
 'scripts/lib/own-payroll-installation.mjs':{bytes:20421,sha256:'6ad8f07733adfb17b6a32a6efd228073bfb3566844b858167581e2d7896bb3d0'},
 'scripts/lib/native-leave-installation.mjs':{bytes:18492,sha256:'57d7f79c358665dc208dfcb9b0d7b2a2ecebaba84dfb6c6057bb3acef6bb25ef'},
 'scripts/lib/sql-statements.mjs':{bytes:3124,sha256:'d81477c5aed918e944aefe16d05015080acc4fe543059cbf15e2c69e9f5201c2'}
});
function exact(value,keys,code){assert.ok(value&&typeof value==='object'&&!Array.isArray(value),code);assert.deepEqual(Reflect.ownKeys(value).sort(),[...keys].sort(),code);}
function sourceReader(readRaw){
 const cache=new Map(),sourceHashes={};
 const read=file=>{
  assert.equal(typeof file,'string');assert.ok(/^(?:scripts|assets|lib|tests)\/[A-Za-z0-9_./-]+$/.test(file)&&!file.split('/').includes('..'),'LEDGER_TRIGGER_SOURCE_PATH');
  const raw=readRaw(file);assert.ok(Buffer.isBuffer(raw),'LEDGER_TRIGGER_RAW_BUFFER:'+file);const text=raw.toString('utf8');assert.deepEqual(Buffer.from(text,'utf8'),raw,'LEDGER_TRIGGER_UTF8');assert.ok(!text.includes('\r'),'LEDGER_TRIGGER_LF');
  if(cache.has(file))assert.ok(raw.equals(cache.get(file)),'LEDGER_TRIGGER_RAW_SOURCE_DRIFT:'+file);
  const pin=OWN_ANNULMENT_LEDGER_TRIGGER_PROFILE_SOURCE_PINS[file];if(pin){assert.equal(raw.length,pin.bytes,'LEDGER_TRIGGER_SOURCE_BYTES:'+file);assert.equal(sha(raw),pin.sha256,'LEDGER_TRIGGER_SOURCE_SHA:'+file);}
  cache.set(file,Buffer.from(raw));sourceHashes[file]=sha(raw);return text;
 };
 for(const file of Object.keys(OWN_ANNULMENT_LEDGER_TRIGGER_PROFILE_SOURCE_PINS))read(file);
 return{read,sourceHashes,bookend:()=>{for(const[file,raw]of cache){const current=readRaw(file);assert.ok(Buffer.isBuffer(current)&&current.equals(raw),'LEDGER_TRIGGER_SOURCE_BOOKEND:'+file);}return{sourceHashes:{...sourceHashes},sourceOnly:true};}};
}
function definition(source,name){const rows=splitPostgresStatements(source).filter(s=>s.startsWith('CREATE FUNCTION public.'+name+'('));assert.equal(rows.length,1,'LEDGER_TRIGGER_FUNCTION_DEFINITION:'+name);return rows[0];}
function sourceTriggers(read){
 const immutable=[];for(const file of LEDGERS)for(const m of read(file).matchAll(/CREATE TRIGGER ([a-z0-9_]+) BEFORE (UPDATE OR DELETE|TRUNCATE) ON public\.([a-z0-9_]+) FOR EACH (ROW|STATEMENT) EXECUTE FUNCTION public\.([a-z0-9_]+)\(\);/g)){
  const[,name,event,table,kind,handler]=m;assert.equal(kind,event==='TRUNCATE'?'STATEMENT':'ROW');immutable.push({name,table:'public.'+table,handler:'public.'+handler+'()',type:event==='TRUNCATE'?34:27,sourceFile:file,sourceStatementSha256:sha(m[0])});
 }
 assert.equal(immutable.length,10);assert.equal(new Set(immutable.map(t=>t.table)).size,5);
 const captures=[];for(const[file,name,handler]of[[SQL128,'own_run_position_capture','position_assignment_capture_trigger_v1'],[SQL129,'own_run_position_dimensions','position_comparison_capture_trigger_v1']]){
  const statement=`CREATE TRIGGER ${name} AFTER INSERT ON public.own_payroll_run_capture FOR EACH ROW EXECUTE FUNCTION public.${handler}();`,text=read(file);assert.equal(text.split(statement).length,2,'LEDGER_TRIGGER_CAPTURE_SOURCE');
  captures.push({name,table:'public.own_payroll_run_capture',handler:'public.'+handler+'()',type:5,sourceFile:file,sourceStatementSha256:sha(statement)});
 }
 const expectedCounts=Object.fromEntries([...new Set(immutable.map(t=>t.table))].map(table=>[table,table==='public.own_payroll_run_capture'?4:2]));
 const definitions=[...immutable,...captures].map(t=>({...t,expectedCount:expectedCounts[t.table]}));
 assert.equal(definitions.length,12);assert.equal(new Set(definitions.map(t=>t.table+':'+t.name)).size,12);for(const[table,n]of Object.entries(expectedCounts))assert.equal(definitions.filter(t=>t.table===table).length,n);
 return{immutable,definitions,expectedCounts};
}
function oldGuard(read,definitions){
 const source=read(REGISTRY),marker='const guard=`DO $public209_triggers$',start=source.indexOf(marker);assert.ok(start>0&&source.indexOf(marker,start+marker.length)<0,'LEDGER_TRIGGER_OLD_GUARD_ANCHOR');
 const at=start+marker.length,end=source.indexOf('`;',at);assert.ok(end>at,'LEDGER_TRIGGER_OLD_GUARD_END');
 let template='DO $public209_triggers$'+source.slice(at,end);assert.equal(template.split('${q(JSON.stringify(definitions))}').length,2,'LEDGER_TRIGGER_OLD_JSON_ANCHOR');
 template=template.replace('${q(JSON.stringify(definitions))}',q(JSON.stringify(definitions)));assert.ok(!template.includes('${'),'LEDGER_TRIGGER_UNRESOLVED_OLD_TEMPLATE');return template;
}
function body(definition){const match=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?\s*$/.exec(definition);assert.ok(match);return match[2];}
function adoptedComparison(original,producer){
 const operations=[
  ['public.native_employment_change_subject_v1(ctx,',"(public.payroll_fixed_registry_subject_v2(ctx||jsonb_build_object('certifiedBindingId',ctx->>'sourceBindingId'),"],
  ["(e->>'contractId')::uuid);","(e->>'contractId')::uuid,true)->'subject');"],
  ['public.native_employment_lifecycle_range_v1(ctx,',"public.payroll_fixed_registry_range_v2(ctx||jsonb_build_object('certifiedBindingId',ctx->>'sourceBindingId'),"],
  ['CREATE FUNCTION ','CREATE OR REPLACE FUNCTION ']
 ];
 assert.ok(producer.includes("if(name==='position_comparison_capture_trigger_v1')replace(\"(e->>'contractId')::uuid);\""),'LEDGER_TRIGGER_ADOPTED_PUBLIC_OPERATOR');
 let after=original;for(const[from,to]of operations){assert.equal(after.split(from).length,2,'LEDGER_TRIGGER_ADOPTED_FINITE_ANCHOR');after=after.replace(from,()=>to);}
 let inverse=after;for(const[from,to]of [...operations].reverse()){assert.equal(inverse.split(to).length,2);inverse=inverse.replace(to,()=>from);}assert.equal(inverse,original,'LEDGER_TRIGGER_ADOPTED_WHOLE_INVERSE');
 return{definition:after,originalDefinitionSha256:sha(original),afterDefinitionSha256:sha(after),originalBodySha256:sha(body(original)),afterBodySha256:sha(body(after)),operations:operations.map(([from,to])=>({from,to,count:1})),wholeInverseVerified:true};
}
function handlers(read,sourceCommit){
 // One bounded public builder, not an owner QA graph or a complete M7 review.
 const canonical=buildAdoptedPositionsInstallation({read,sourceCommit});assert.equal(canonical.connects,false);assert.equal(canonical.executesSql,false);assert.equal(canonical.afterPins.length,5);assert.equal(canonical.dependencies.length,27);
 for(const[key,digest]of Object.entries(canonical.sourceHashes)){const file=key.includes('/')?key:'scripts/migrations/'+key;assert.match(digest,HASH);assert.equal(sha(read(file)),digest,'LEDGER_TRIGGER_PUBLIC_BUILDER_SOURCE_HASH:'+file);}
 const assignment=definition(read(SQL128),'position_assignment_capture_trigger_v1'),comparisonOriginal=definition(read(SQL129),'position_comparison_capture_trigger_v1'),comparison=adoptedComparison(comparisonOriginal,read(ADOPTED));
 const selected=[
  {name:'position_assignment_capture_trigger_v1',definition:assignment,pins:canonical.dependencies,definitions:canonical.dependencyDefinitions,file:SQL128},
  {name:'position_comparison_capture_trigger_v1',definition:comparison.definition,pins:canonical.afterPins,definitions:canonical.migration,file:SQL129}
 ],pins=[],origins=[];
 for(const item of selected){
  const matches=item.pins.filter(p=>p.name===item.name),defs=item.definitions.filter(d=>ownInstallationFunctionPin(d).name===item.name);assert.equal(matches.length,1);assert.equal(defs.length,1);assert.equal(defs[0],item.definition,'LEDGER_TRIGGER_PUBLIC_CANONICAL_DEFINITION');
  const parsed={...ownInstallationFunctionPin(item.definition),runtime:false};assert.deepEqual(parsed,matches[0],'LEDGER_TRIGGER_PUBLIC_CANONICAL_PIN');assert.equal(parsed.resultType,'trigger');assert.equal(parsed.signature,'public.'+item.name+'()');assert.equal(parsed.definer,true);assert.equal(parsed.runtime,false);
  const source=read(item.file),signature=parsed.signature,revoke=[...source.matchAll(/REVOKE ALL ON FUNCTION ([^;]+) FROM PUBLIC,municontrol_actions_runtime_app;/g)].filter(m=>m[1].split(',public.').some((part,i)=>(i?'public.':'')+part===signature));
  assert.equal(revoke.length,1,'LEDGER_TRIGGER_HANDLER_REVOKE');const grants=[...source.matchAll(/GRANT EXECUTE ON FUNCTION ([^;]+) TO municontrol_actions_runtime_app;/g)];assert.ok(grants.every(m=>!m[1].split(',public.').some((part,i)=>(i?'public.':'')+part===signature)),'LEDGER_TRIGGER_HANDLER_RUNTIME_GRANT');
  pins.push(parsed);origins.push({name:item.name,definitionSource:item.file,definitionSha256:sha(item.definition),bodySha256:parsed.sha256,authority:ADOPTED,selectedVector:item.name.startsWith('position_assignment')?'dependencies':'afterPins',runtime:false,revokeStatementSha256:sha(revoke[0][0]),completeGrantStatementsSha256:sha(grants.map(m=>m[0]).join('\n'))});
 }
 const population=read(POPULATION),sql210=read('scripts/migrations/210-own-position-population-proof.sql');assert.ok(population.includes('const prerequisitePins=[...previous.afterPins,...previous.dependencies]')&&population.includes('return pins[0];'),'LEDGER_TRIGGER_210_PRESERVES_PREDECESSOR');
 const functions210=[...sql210.matchAll(/^CREATE FUNCTION public\.([a-z0-9_]+)\(/gm)].map(m=>m[1]);assert.deepEqual(functions210,['own_position_population_proof_v2','position_comparison_detail_v2']);
 const identity=read(IDENTITY),expected=/^const expectedDefinitions=(\{[^\n]+\});$/m.exec(identity);assert.ok(expected);const names216=Object.keys(JSON.parse(expected[1]));assert.equal(names216.length,7);assert.ok(pins.every(p=>!names216.includes(p.name)));
 const functions216=[...read('scripts/migrations/216-own-position-administrative-identity.sql').matchAll(/^CREATE(?: OR REPLACE)? FUNCTION public\.([a-z0-9_]+)\(/gm)].map(m=>m[1]);assert.equal(functions216.length,8);assert.ok(pins.every(p=>!functions216.includes(p.name)));
 return{pins,origins,comparison,successors:{population210PreservesBothHandlers:true,identity216PreservesBothHandlers:true,functions210,functions216},canonicalBuilder:ADOPTED};
}
function handlerChecks(pins){
 const metadata=pinsCheck(pins,'ANNUL_LEDGER_POSITION_HANDLER_METADATA');
 const acl=`DO $annul_ledger_handler_acl$ DECLARE x jsonb;p pg_proc;runtime_oid oid:=to_regrole('${ROLE}');BEGIN
 IF runtime_oid IS NULL OR runtime_oid=current_user::regrole THEN RAISE EXCEPTION 'ANNUL_LEDGER_POSITION_HANDLER_ACL';END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(${q(JSON.stringify(pins))}::jsonb) LOOP
 SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(x->>'signature');
 IF p.oid IS NULL OR p.proowner<>current_user::regrole OR p.pronargs<>0 OR p.pronargdefaults<>0 OR p.proargdefaults IS NOT NULL OR p.probin IS NOT NULL OR p.prosqlbody IS NOT NULL
 OR(SELECT count(*) FROM pg_proc other WHERE other.pronamespace=p.pronamespace AND other.proname=p.proname)<>1
 OR(SELECT count(*) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))))<>1
 OR NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantor=p.proowner AND a.grantee=p.proowner AND a.privilege_type='EXECUTE' AND NOT a.is_grantable)
 OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantor<>p.proowner OR a.grantee<>p.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable)
 OR has_function_privilege('${ROLE}',p.oid,'EXECUTE') THEN RAISE EXCEPTION 'ANNUL_LEDGER_POSITION_HANDLER_ACL' USING DETAIL=x->>'signature';END IF;
 END LOOP;END $annul_ledger_handler_acl$`;
 return metadata+';\n'+acl;
}
function project(legacyGuard,legacy,definitions,checks){
 let guard=legacyGuard;const operations=[];
 const replace=(from,to,label)=>{assert.equal(guard.split(from).length,2,'LEDGER_TRIGGER_PROJECTION_ANCHOR:'+label);guard=guard.replace(from,()=>to);operations.push({from,to,label});};
 replace(q(JSON.stringify(legacy))+'::jsonb',q(JSON.stringify(definitions))+'::jsonb','ten-to-twelve-exact-trigger-records');
 replace('(SELECT count(*) FROM pg_trigger WHERE tgrelid=r AND NOT tgisinternal)<>2',"(SELECT count(*) FROM pg_trigger WHERE tgrelid=r AND NOT tgisinternal)<>(x->>'expectedCount')::integer",'exact-per-table-counts');
 replace('OR t.tgconstraint<>0','OR t.tgconstraint<>0 OR t.tgdeferrable OR t.tginitdeferred OR t.tgparentid<>0 OR t.tgconstrrelid<>0 OR t.tgconstrindid<>0 OR t.tgoldtable IS NOT NULL OR t.tgnewtable IS NOT NULL','ordinary-trigger-fields');
 replace("AND c.relkind='r' AND c.relrowsecurity AND NOT c.relforcerowsecurity","AND c.relkind='r' AND c.relpersistence='p' AND c.relrowsecurity AND NOT c.relforcerowsecurity AND NOT c.relispartition AND c.reloptions IS NULL AND c.relreplident='d'",'plain-source-table-security');
 replace("THEN RAISE EXCEPTION 'PUBLIC209_LEDGER_SECURITY_CHANGED';END IF;", "THEN RAISE EXCEPTION 'PUBLIC209_LEDGER_SECURITY_CHANGED';END IF;\n IF EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=r) OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid=r OR inhparent=r) OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=r AND attacl IS NOT NULL) THEN RAISE EXCEPTION 'ANNUL_LEDGER_TRIGGER_TABLE_SECURITY';END IF;",'no-policy-inheritance-column-grants');
 const suffix=';\n'+checks;guard+=suffix;
 let inverse=guard;assert.ok(inverse.endsWith(suffix));inverse=inverse.slice(0,-suffix.length);for(const{from,to}of [...operations].reverse()){assert.equal(inverse.split(to).length,2,'LEDGER_TRIGGER_PROJECTION_INVERSE_ANCHOR');inverse=inverse.replace(to,()=>from);}assert.equal(inverse,legacyGuard,'LEDGER_TRIGGER_PROJECTION_WHOLE_INVERSE');
 return{guard,operations:operations.map(({from,to,label})=>({label,fromSha256:sha(from),toSha256:sha(to),fromBytes:Buffer.byteLength(from),toBytes:Buffer.byteLength(to)})),legacySha256:sha(legacyGuard),projectedSha256:sha(guard),wholeInverseVerified:true};
}
export function buildOwnAnnulmentLedgerTriggerProfile(options){
 exact(options,['readRaw','sourceCommit','profile'],'LEDGER_TRIGGER_EXACT_SOURCE_OPTIONS');const{readRaw,sourceCommit,profile}=options;assert.equal(typeof readRaw,'function');assert.match(sourceCommit??'',/^[a-f0-9]{40}$/);assert.equal(profile,PROFILE,'LEDGER_TRIGGER_DESIRED_PROFILE_ONLY');
 const sources=sourceReader(readRaw),{immutable,definitions,expectedCounts}=sourceTriggers(sources.read),canonical=handlers(sources.read,sourceCommit),legacyGuard=oldGuard(sources.read,immutable),checks=handlerChecks(canonical.pins),projection=project(legacyGuard,immutable,definitions,checks);
 const value=freeze({version:'own-annulment-ledger-trigger-profile.v1',profile,sourceCommit,sourceHashes:{...sources.sourceHashes},definitions,immutableDefinitions:immutable,expectedCounts,handlerPins:canonical.pins,handlerChecks:checks,handlerOrigins:canonical.origins,legacyGuard,guard:projection.guard,
  derivation:{publicBuilder:canonical.canonicalBuilder,adoptedComparison:canonical.comparison,successors:canonical.successors,projectionOperations:projection.operations,wholeInverseVerified:projection.wholeInverseVerified,legacyGuardSha256:projection.legacySha256,projectedGuardSha256:projection.projectedSha256},
  sourceBookend:()=>{const current=sources.bookend();return{sourceCommit,sourceHashes:current.sourceHashes,sourceOnly:true};},
  scope:{tables:5,immutableTriggers:10,positionCaptureTriggers:2,totalTriggers:12,handlerPins:2,canonicalEpochRequired:PROFILE,original129Fallback:false,requiresDigestSourceGuard:true},
  connects:false,executesSql:false,observedCatalogUsed:false,businessWrites:0,nominalRowsReturned:0,executionAdmitted:false});
 minted.set(value,{projection});return value;
}
export function assertOwnAnnulmentLedgerTriggerProfile(profile){assert.ok(minted.has(profile),'LEDGER_TRIGGER_MINTED_PROFILE_REQUIRED');profile.sourceBookend();return profile;}
export function projectOwnAnnulmentLedgerTriggerGuard(options){
 exact(options,['profile','legacyGuard'],'LEDGER_TRIGGER_PROJECTION_OPTIONS');const{profile,legacyGuard}=options;assertOwnAnnulmentLedgerTriggerProfile(profile);assert.equal(typeof legacyGuard,'string');assert.equal(legacyGuard,profile.legacyGuard,'LEDGER_TRIGGER_EXACT_LEGACY_GUARD');
 const saved=minted.get(profile).projection;return freeze({profile:profile.profile,guard:saved.guard,legacySha256:saved.legacySha256,projectedSha256:saved.projectedSha256,wholeInverseVerified:saved.wholeInverseVerified,sourceHashes:profile.sourceHashes});
}
