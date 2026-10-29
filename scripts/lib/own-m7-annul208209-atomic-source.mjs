// Pure source components for a future atomic208/209 protocol. This is neither
// an executor nor an installation, compatibility, native or production receipt.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {composeOwnAnnulmentReview208PublicSource,OWN_ANNUL_REVIEW208_SQL,OWN_ANNUL_REVIEW208_SQL_SHA256} from './own-m7-public-annulment208-source.mjs';
import {composeOwnAnnul209PublicPredecessorRegistry,assertOwnAnnul209PublicPredecessorRegistry,bookendOwnAnnul209PublicPredecessorRegistry} from './own-annul209-public-predecessor-registry.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
import {buildOwnAnnulmentLedgerTriggerProfile,projectOwnAnnulmentLedgerTriggerGuard,assertOwnAnnulmentLedgerTriggerProfile} from './own-annulment-ledger-trigger-profile.mjs';

export const OWN_M7_ANNUL208209_ATOMIC_SOURCE_VERSION='own-m7-annul208209-atomic-source-components.v2';
const FILE='scripts/lib/own-m7-annul208209-atomic-source.mjs';
const TRIGGER_PROFILE_FILE='scripts/lib/own-annulment-ledger-trigger-profile.mjs';
const LEDGER_PROFILE='positions128129-adopted.v2';
const TAIL='scripts/lib/own-m7-public-annulment208209.mjs';
const SOURCE208='scripts/lib/own-m7-public-annulment208-source.mjs';
const REGISTRY='scripts/lib/own-annul209-public-predecessor-registry.mjs';
const PIN_CHECK='scripts/lib/native-leave-installation.mjs';
const SQL209='scripts/migrations/209-own-annulment-preparation-projection.sql';
const SQL209_SHA256='eabc4f72cc0203a87af50287fcb6367a2ca81e6f957e73b5ee1c2b868aeb6dc4';
const SOURCE_PINS=Object.freeze({
 [TRIGGER_PROFILE_FILE]:'120a501bc998caf9dfa17ae47f3aa403b4e6c86431d7681342ce00eb5e4a6200',
 [SOURCE208]:'c248b1a022b1be9f1a5c3da100f8b0b69eb2081909a81bc5e00346f2e2e58570',
 [REGISTRY]:'2d5db8d30cc1ff106696f1ddc5b6c02b13342588ad35704ad2aedc48077e2e6b',
 [TAIL]:'da680eee5c0fad3127dd29bcda6bb542b7e06d66e26e2542aa4607bde1706853',
 [PIN_CHECK]:'57d7f79c358665dc208dfcb9b0d7b2a2ecebaba84dfb6c6057bb3acef6bb25ef',
 [OWN_ANNUL_REVIEW208_SQL]:OWN_ANNUL_REVIEW208_SQL_SHA256,
 [SQL209]:SQL209_SHA256,
 'scripts/migrations/128-own-position-assignments.sql':'d50a2a14e478868b4086514fc0ddd47bd116ba761a88b0a2ff28e36866ce1e78',
 'scripts/migrations/129-own-position-comparison.sql':'023ad52a441df027ea8121a404777fbe4424dbbcfcdbeca6ca30b7475e17bc3c',
 'scripts/lib/adopted-positions-installation.mjs':'b5e1f9185e42c3a3372b443e8d6383d8259b155217e9db48b121f5d07cc56ab9',
});
const SIGNATURES208=Object.freeze([
 ['own_annul_review_core_v2','jsonb,text,text,integer',false],
 ['own_annul_selected_index_v2','jsonb,jsonb,jsonb',false],
 ['own_annul_command_index_core_v2','jsonb,jsonb,uuid,integer',false],
 ['own_annul_review_v2','jsonb,text,text',true],
 ['own_annul_review_full_v2','jsonb,text,text',true],
 ['own_annul_command_v2','jsonb,jsonb,uuid',true],
 ['own_annul_command_full_v2','jsonb,jsonb,uuid',true],
]);
const SIGNATURES209=Object.freeze([
 ['own_annul_preparation_core_v1','jsonb,uuid,integer',false],
 ['own_annul_preparation_v1','jsonb,uuid',true],
 ['own_annul_preparation_full_v1','jsonb,uuid',true],
]);
const REGISTRY_GUARD_ORDER=Object.freeze(['authority184','capacity215','predecessorMetadata','predecessorAcl','ledgerTriggers','required208Functions']);
const minted=new WeakMap(),hash=value=>createHash('sha256').update(value).digest('hex');
const lf=value=>{assert.equal(typeof value,'string','ATOMIC_SOURCE_TEXT_REQUIRED');return value.replace(/\r\n?/g,'\n');};
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const exact=(value,keys,code)=>{assert.ok(value&&typeof value==='object'&&!Array.isArray(value),code);assert.deepEqual(Reflect.ownKeys(value).sort(),[...keys].sort(),code);};
const once=(source,before,after)=>{assert.equal(source.split(before).length,2,'ATOMIC_FINITE_SOURCE_ANCHOR');return source.replace(before,()=>after);};

// Only the SQL template is selected. No extracted JavaScript is evaluated,
// imported or compiled. The whole tail is pinned before this finite selection.
function aclTemplate(source){
 const before='function aclAndOverloads(pins){return `',after='`;}\nfunction detailFault(';
 assert.equal(source.split(before).length,2,'ATOMIC_ACL_TEMPLATE_START');assert.equal(source.split(after).length,2,'ATOMIC_ACL_TEMPLATE_END');
 const start=source.indexOf(before)+before.length,end=source.indexOf(after,start);assert.ok(end>start,'ATOMIC_ACL_TEMPLATE_ORDER');
 const value=source.slice(start,end);assert.equal(value.split('${').length,2,'ATOMIC_ACL_SINGLE_SQL_PLACEHOLDER');
 assert.equal(source.slice(0,start)+value+source.slice(end),source,'ATOMIC_ACL_WHOLE_SOURCE_INVERSE');
 assert.match(value,/count\(\*\) FROM aclexplode[\s\S]*<>\(CASE WHEN\(x->>'runtime'\)::boolean THEN 2 ELSE 1 END\)/,'ATOMIC_ACL_EXACT_PRIVILEGE_COUNT_REQUIRED');
 return value;
}
function exactAcl(template,pins){
 const placeholder='${q(JSON.stringify(pins))}',literal=q(JSON.stringify(pins)),value=once(template,placeholder,literal);
 assert.equal(once(value,literal,placeholder),template,'ATOMIC_ACL_TEMPLATE_WHOLE_INVERSE');return value;
}
function ownDefinitions(source,stage,signatures){
 const definitions=[...source.matchAll(new RegExp('EXECUTE \\$definition_'+stage+'\\$(CREATE FUNCTION public\\.[\\s\\S]*?)\\$definition_'+stage+'\\$;','g'))].map(match=>match[1]);
 assert.equal(definitions.length,signatures.length,'ATOMIC_EXACT_FUNCTION_SET:'+stage);
 const pins=definitions.map((definition,index)=>{
  const pin=ownInstallationFunctionPin(definition),[name,args,runtime]=signatures[index];
  assert.equal(pin.name,name);assert.equal(pin.signature,'public.'+name+'('+args+')');assert.equal(pin.resultType,'jsonb');
  assert.equal(pin.definer,true);assert.equal(pin.defaults,'');assert.equal(pin.returnsSet,false);assert.equal(pin.language,'plpgsql');
  assert.deepEqual(pin.config,['search_path=pg_catalog, public, pg_temp','TimeZone=UTC']);
  const revoke='REVOKE ALL ON FUNCTION '+pin.signature+' FROM PUBLIC,municontrol_actions_runtime_app;',grant='GRANT EXECUTE ON FUNCTION '+pin.signature+' TO municontrol_actions_runtime_app;';
  assert.equal(source.split(revoke).length,2,'ATOMIC_EXACT_REVOKE:'+pin.signature);assert.equal(source.split(grant).length,runtime?2:1,'ATOMIC_EXACT_GRANT:'+pin.signature);
  if(runtime)assert.ok(source.indexOf(revoke)<source.indexOf(grant),'ATOMIC_REVOKE_BEFORE_GRANT');
  return {...pin,runtime};
 });
 assert.equal([...source.matchAll(/\bGRANT EXECUTE ON FUNCTION [\s\S]*?;/g)].length,pins.filter(pin=>pin.runtime).length,'ATOMIC_COMPLETE_GRANT_SET');
 assert.equal([...source.matchAll(/\bREVOKE ALL ON FUNCTION [\s\S]*?;/g)].length,pins.length,'ATOMIC_COMPLETE_REVOKE_SET');
 return{definitions,pins};
}
const absence=names=>`DO $public_annul_absent$ BEGIN IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=ANY(ARRAY[${names.map(q).join(',')}])) THEN RAISE EXCEPTION 'PUBLIC_ANNUL_FUNCTION_ALREADY_PRESENT';END IF;END $public_annul_absent$`;

export function composeOwnM7Annul208209AtomicSource(options){
 exact(options,['read','sourceCommit','major'],'ATOMIC_SOURCE_OPTIONS_EXACT');
 const{read,sourceCommit,major}=options;assert.equal(typeof read,'function');assert.match(sourceCommit,/^[a-f0-9]{40}$/);assert.ok([17,18].includes(major),'ATOMIC_SOURCE_MAJOR_REQUIRED');
 const raws=new Map(),sourceHashes={},sourceInputs=[];
 const load=file=>{
  assert.ok(typeof file==='string'&&/^[A-Za-z0-9_.\/-]+$/.test(file)&&!file.split('/').includes('..')&&!file.startsWith('/'),'ATOMIC_SOURCE_PATH');
  assert.ok(/^(?:scripts|tests|assets|lib|api|src|\.github)\//.test(file)||['package.json','package-lock.json','.vercelignore'].includes(file),'ATOMIC_SOURCE_SCOPE');
  const raw=read(file),text=lf(raw),digest=hash(text);
  if(raws.has(file))assert.equal(raw,raws.get(file),'ATOMIC_RAW_SOURCE_DRIFT:'+file);
  else{raws.set(file,raw);sourceHashes[file]=digest;sourceInputs.push({path:file,rawUtf8Bytes:Buffer.byteLength(raw,'utf8'),rawSha256:hash(raw),lfUtf8Bytes:Buffer.byteLength(text,'utf8'),lfSha256:digest});}
  if(Object.hasOwn(SOURCE_PINS,file))assert.equal(digest,SOURCE_PINS[file],'ATOMIC_PINNED_SOURCE_CHANGED:'+file);
  return raw;
 };
 for(const file of [FILE,TRIGGER_PROFILE_FILE,...Object.keys(SOURCE_PINS)])load(file);
 const review208=composeOwnAnnulmentReview208PublicSource({read:load,sourceCommit,major});
 const registry=composeOwnAnnul209PublicPredecessorRegistry({read:load,sourceCommit,operationalPairBaseline:'published107'});
 assertOwnAnnul209PublicPredecessorRegistry(registry,{sourceCommit});
 assert.equal(registry.entries.length,50);assert.equal(registry.privateScalarSignatures.length,11);assert.equal(registry.privateDate.pin.defaults,'true');
 assert.equal(registry.triggerSources.length,10);assert.equal(registry.capacityEpoch.unchangedOtherRecords,26);assert.equal(registry.capacityEpoch.wholeGuardInverse,true);
 assert.deepEqual(Object.keys(registry.guards),REGISTRY_GUARD_ORDER,'ATOMIC_REGISTRY_GUARD_ORDER_CHANGED');
 const triggerProfile=buildOwnAnnulmentLedgerTriggerProfile({readRaw:file=>Buffer.from(load(file),'utf8'),sourceCommit,profile:LEDGER_PROFILE});
 assertOwnAnnulmentLedgerTriggerProfile(triggerProfile);assert.equal(triggerProfile.profile,LEDGER_PROFILE);
 assert.deepEqual(triggerProfile.immutableDefinitions,registry.triggerSources,'ATOMIC_LEGACY_TEN_TRIGGER_SOURCE_CHANGED');assert.equal(triggerProfile.definitions.length,12);assert.equal(triggerProfile.handlerPins.length,2);
 const triggerProjection=projectOwnAnnulmentLedgerTriggerGuard({profile:triggerProfile,legacyGuard:registry.guards.ledgerTriggers});
 assert.equal(triggerProjection.wholeInverseVerified,true);assert.equal(triggerProjection.legacySha256,hash(registry.guards.ledgerTriggers));assert.equal(triggerProjection.projectedSha256,hash(triggerProjection.guard));
 for(const[file,digest]of Object.entries(triggerProfile.sourceHashes))assert.equal(sourceHashes[file],digest,'ATOMIC_LEDGER_PROFILE_SOURCE_CONFLICT:'+file);
 const registryGuards={...registry.guards,ledgerTriggers:triggerProjection.guard};
 for(const key of REGISTRY_GUARD_ORDER.filter(key=>key!=='ledgerTriggers'))assert.equal(registryGuards[key],registry.guards[key],'ATOMIC_UNRELATED_REGISTRY_GUARD_CHANGED:'+key);
 const raw208=load(OWN_ANNUL_REVIEW208_SQL),raw209=load(SQL209);
 const own208=ownDefinitions(lf(raw208),208,SIGNATURES208),own209=ownDefinitions(lf(raw209),209,SIGNATURES209);
 assert.deepEqual(own208.pins,review208.ownPins,'ATOMIC_208_PUBLIC_SOURCE_PIN_CONFLICT');assert.deepEqual(own208.pins,registry.required208.pins,'ATOMIC_208_REGISTRY_PIN_CONFLICT');
 const tailSource=lf(load(TAIL)),template=aclTemplate(tailSource);
 // The absence SQL generator is copied verbatim from the same pinned tail.
 // Comparing its entire source prevents an unsealed change to this guard.
 assert.equal(tailSource.split('const absence='+absence.toString()+';').length,2,'ATOMIC_ABSENCE_WHOLE_SOURCE_CHANGED');
 const pre208Guards=[review208.statements[0],review208.statements[2],review208.statements[3]];
 assert.ok(pre208Guards[0].startsWith('DO $annul208_context$'));assert.ok(pre208Guards[1].startsWith('DO $annul208_defaults$'));
 const post208Guards=[pinsCheck(own208.pins,'ANNUL208_NEW_FUNCTION_SOURCE_CHANGED'),exactAcl(template,own208.pins)];
 const pre209Guards=Object.values(registryGuards);
 const post209Guards=[pinsCheck(own209.pins,'ANNUL209_NEW_FUNCTION_SOURCE_CHANGED'),exactAcl(template,own209.pins)];
 const names=[...own208.pins,...own209.pins].map(pin=>pin.name),absence10=absence(names);
 // This subset is safe to use before208: its last registry guard is deliberately
 // excluded because it requires the seven208 functions to exist already.
 const compatibilityGuards=[...REGISTRY_GUARD_ORDER.filter(name=>name!=='required208Functions').map(name=>registryGuards[name]),pre208Guards[1],pre208Guards[2],absence10];
 const ref=(source,selector,sql,extra={})=>({source,sourceSha256:sourceHashes[source],selector,sha256:hash(sql),...extra});
 const registryRef=name=>name==='ledgerTriggers'?ref(TRIGGER_PROFILE_FILE,'positions128129-adopted.v2 projected ledgerTriggers',registryGuards[name],{profile:LEDGER_PROFILE,legacySource:REGISTRY,legacySourceSha256:sourceHashes[REGISTRY],legacyGuardSha256:triggerProjection.legacySha256,wholeInverseVerified:true}):ref(REGISTRY,'guards.'+name,registryGuards[name]);
 const references={
  pre208:pre208Guards.map((sql,i)=>ref(SOURCE208,'statements['+[0,2,3][i]+']',sql)),
  post208:[ref(PIN_CHECK,'pinsCheck(ownPins208,ANNUL208_NEW_FUNCTION_SOURCE_CHANGED)',post208Guards[0]),ref(TAIL,'aclAndOverloads SQL template',post208Guards[1],{templateSha256:hash(template),wholeInverse:true})],
  pre209:REGISTRY_GUARD_ORDER.map(registryRef),
  post209:[ref(PIN_CHECK,'pinsCheck(ownPins209,ANNUL209_NEW_FUNCTION_SOURCE_CHANGED)',post209Guards[0]),ref(TAIL,'aclAndOverloads SQL template',post209Guards[1],{templateSha256:hash(template),wholeInverse:true})],
  compatibility:[...REGISTRY_GUARD_ORDER.filter(name=>name!=='required208Functions').map(registryRef),ref(SOURCE208,'statements[2]',pre208Guards[1]),ref(SOURCE208,'statements[3]',pre208Guards[2]),ref(TAIL,'absence(all ten source function names)',absence10)],
 };
 const provenance=(stage,file,definitions,pins)=>definitions.map((definition,index)=>({stage,source:file,sourceSha256:sourceHashes[file],sourceDefinitionSha256:hash(definition),sourceBodySha256:pins[index].sha256,signature:pins[index].signature,runtime:pins[index].runtime}));
 const value={version:OWN_M7_ANNUL208209_ATOMIC_SOURCE_VERSION,sourceCommit,major,schema:'public',operationalPairBaseline:'published107',
  raw208,raw209,sourceSqlHashes:{208:OWN_ANNUL_REVIEW208_SQL_SHA256,209:SQL209_SHA256},sourceHashes,sourceInputs,
  ownPins208:own208.pins,ownPins209:own209.pins,ownProvenance:[...provenance(208,OWN_ANNUL_REVIEW208_SQL,own208.definitions,own208.pins),...provenance(209,SQL209,own209.definitions,own209.pins)],
  predecessorEntries:registry.entries,predecessorClosure:registry.closure,privateScalarSignatures:registry.privateScalarSignatures,privateDate:registry.privateDate,triggerSources:triggerProfile.definitions,immutableTriggerSources:registry.triggerSources,capacityEpoch:registry.capacityEpoch,
  ledgerProfile:LEDGER_PROFILE,ledgerTriggerProfile:triggerProfile,ledgerHandlerPins:triggerProfile.handlerPins,ledgerExpectedTriggerCounts:triggerProfile.expectedCounts,ledgerTriggerProjection:{profile:LEDGER_PROFILE,legacySha256:triggerProjection.legacySha256,projectedSha256:triggerProjection.projectedSha256,wholeInverseVerified:true,handlerChecksSha256:hash(triggerProfile.handlerChecks)},
  pre208Guards,post208Guards,pre209Guards,post209Guards,legacyRegistryGuards:registry.guards,registryGuards,registryGuardOrder:[...REGISTRY_GUARD_ORDER],registryGuardsJoined:pre209Guards.join(';\n'),compatibilityGuards,absence10,guardReferences:references,
  counts:{predecessorFunctions:50,newFunctions:10,privateHelpers:4,runtimeFacades:6,newTables:0,adaptedFunctions:0},
  sourceComponentsOnly:true,sourceMetadataOnly:true,targetIndependent:true,observedMetadataUsed:false,connects:false,executesSql:false,createsActors:false,roleAssignmentsAdded:0,executionAdmitted:false,receiptIssued:false,
 };
 freeze(value);minted.set(value,{read,raws,review208,registry,triggerProfile,sourceCommit,major});bookendOwnM7Annul208209AtomicSource(value);return value;
}

export function assertOwnM7Annul208209AtomicSource(components,options={}){
 exact(options,Reflect.ownKeys(options).length?['sourceCommit','major']:[],'ATOMIC_SOURCE_ASSERT_OPTIONS_EXACT');
 const seal=minted.get(components);assert.ok(seal,'ATOMIC_MINTED_SOURCE_COMPONENTS_REQUIRED');
 if(Reflect.ownKeys(options).length){assert.equal(options.sourceCommit,seal.sourceCommit,'ATOMIC_SOURCE_COMMIT_CHANGED');assert.equal(options.major,seal.major,'ATOMIC_SOURCE_MAJOR_CHANGED');}
 assert.equal(components.version,OWN_M7_ANNUL208209_ATOMIC_SOURCE_VERSION);assert.equal(components.schema,'public');
 assert.equal(components.ledgerProfile,LEDGER_PROFILE);assert.equal(components.ledgerTriggerProjection.wholeInverseVerified,true);assertOwnAnnulmentLedgerTriggerProfile(seal.triggerProfile);
 assert.equal(components.sourceComponentsOnly,true);assert.equal(components.targetIndependent,true);assert.equal(components.observedMetadataUsed,false);assert.equal(components.executionAdmitted,false);assert.equal(components.receiptIssued,false);
 assert.equal(components.connects,false);assert.equal(components.executesSql,false);assert.equal(components.createsActors,false);
 bookendOwnM7Annul208209AtomicSource(components);return components;
}
export function bookendOwnM7Annul208209AtomicSource(components){
 const seal=minted.get(components);assert.ok(seal,'ATOMIC_MINTED_SOURCE_COMPONENTS_REQUIRED');
 for(const[file,raw]of seal.raws)assert.equal(seal.read(file),raw,'ATOMIC_RAW_SOURCE_BOOKEND_CHANGED:'+file);
 seal.review208.sourceBookend();bookendOwnAnnul209PublicPredecessorRegistry(seal.registry);assertOwnAnnulmentLedgerTriggerProfile(seal.triggerProfile);
 return freeze({version:'own-m7-annul208209-atomic-source-bookend.v2',sourceCommit:seal.sourceCommit,sourceHashes:components.sourceHashes,ledgerProfile:LEDGER_PROFILE,sourceVerified:true,sourceComponentsOnly:true,observedMetadataUsed:false,executionAdmitted:false,receiptIssued:false});
}
