// PRIVATE SOURCE CANDIDATE. No top-level construction, I/O or connection.
// Future placement: SAME190 immediately after branded208 installation and
// BEFORE208 business/209 actor seeds. Constructor/native admission pending.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ownNoveltySuccessionFunctionPin} from './own-novelty-succession-metadata.mjs';
import {ownNoveltySuccessionHeader} from './own-novelty-succession-installation.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
import {composeOwnAnnulmentReviewV2On190,assertOwnAnnulmentReviewV2SourceBookend} from './own-payroll-annulment-review-v2-installation.mjs';
import {ownFullCapacity190Snapshot} from './own-payroll-full-capacity-190-installation.mjs';
import {performancePreservationSnapshot} from '../verify-documentary-roster-performance.mjs';

export const OWN_ANNUL_PREPARATION209_SQL='scripts/migrations/209-own-annulment-preparation-projection.sql';
export const OWN_ANNUL_PREPARATION209_SQL_SHA256='5b0a9896d762f90a25ff84b5d8417d0e178350dd3864b73e47eb5654b2eafd56';
const SQL208='scripts/migrations/208-own-annulment-review-index.sql',SQL201='scripts/migrations/201-own-full-payroll-decision-capacity.sql';
const HASH=/^[a-f0-9]{64}$/,SCHEMA=/^mc_qa_fixed_092_[a-f0-9]{32}$/,prefix='municontrol_annul_preparation209.';
const hash=value=>createHash('sha256').update(value).digest('hex'),lf=value=>value.replace(/\r\n?/g,'\n');
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const once=(source,old,next)=>{assert.equal(source.split(old).length,2,'ANNUL209_SOURCE_ANCHOR_CHANGED');return source.replace(old,()=>next);};
const exact=(value,keys,code)=>{assert.ok(value&&typeof value==='object'&&!Array.isArray(value),code);assert.deepEqual(Reflect.ownKeys(value).sort(),[...keys].sort(),code);};
const body=definition=>{const match=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?\s*$/.exec(definition);assert.ok(match,'ANNUL209_SOURCE_BODY_REQUIRED');return match[2];};
const pinOf=definition=>ownNoveltySuccessionFunctionPin(ownNoveltySuccessionHeader(definition));
const ownSignatures=Object.freeze([
 ['own_annul_preparation_core_v1','jsonb,uuid,integer',false],
 ['own_annul_preparation_v1','jsonb,uuid',true],
 ['own_annul_preparation_full_v1','jsonb,uuid',true]
]);
const prior208Names=Object.freeze(['own_annul_review_core_v2','own_annul_selected_index_v2','own_annul_command_index_core_v2','own_annul_review_v2','own_annul_review_full_v2','own_annul_command_v2','own_annul_command_full_v2']);
const roots=Object.freeze(['own_run_context_v1','own_run_lock_v1','own_run_hash_v1','own_program_exact_v1','native_salary_scope_v1','action_center_context_has_capability','own_liquidation_current_v1','own_liquidation_rows_v1','own_liquidation_state_v1','own_close_active_v1','own_run_immutable_v1','own_liquidation_immutable_v1','own_close_immutable_v1','own_annul_immutable_v1']);
const CAPABILITY_SOURCE006='scripts/migrations/006-tenant-action-authority.sql';
const CAPABILITY_METADATA184='scripts/lib/municipal-owner-adoption-authority-installation.mjs';
const CAPABILITY_SIGNATURE='public.tenant_iam_effective_capabilities(uuid)';
const SOURCE_PINS=Object.freeze({
 [CAPABILITY_SOURCE006]:'0d00147d965884f163b614d2fc1f8f167c27dd91060b101495c08b2275563e4a',
 [CAPABILITY_METADATA184]:'10f5fb42aef999deebb9d43deb0fcc903cb6913a973a93a9ebad95f4f76eb012',
 'scripts/migrations/123-own-payroll-runs.sql':'a9fe1129e921bb7c01985b8caadb009f6086aef9866e2298398175f7f25b4b6b',
 'scripts/migrations/124-own-payroll-liquidation-decisions.sql':'03035e3f7e126b1561222f1a894bcf1000dd586b6d05fb579cb4722d9aa41f4a',
 'scripts/migrations/125-own-payroll-close.sql':'443127dd55b9be5f37da47af303fcdd599b4d5dc0aad0a319a18253f8f139af5',
 'scripts/migrations/146-own-consolidated-annulment.sql':'8337df26dc3c22fe8c156e19d7511db6c537f08b219633f6add981c774a48fe6',
 'scripts/migrations/176-own-payroll-administrative-operator.sql':'f75fa2cddf6fe2e837044e73c6465eecdf41fbad7ec740745527e1bd54b94732',
 'scripts/migrations/197-own-novelty-succession.sql':'de81915cb3b17df45f9906072f8125e23f19e462ef61e881057f757a519f9eb4',
 [SQL201]:'46de1308360a076eff1453f57a9e4f4d6c14ba176d73cf8531b7b0821ed35b1b',
 [SQL208]:'2f0b030f12570f37ea3357707309422754522af66dc85475fd81e9a473c1b402',
 [OWN_ANNUL_PREPARATION209_SQL]:OWN_ANNUL_PREPARATION209_SQL_SHA256,
 'scripts/lib/own-payroll-annulment-review-v2-installation.mjs':'e5673a20f7547cc7bb6060715920b4dccfc1713f3ef9f6844f1a86840f921fd8',
 'scripts/lib/own-novelty-succession-metadata.mjs':'cb9b87bfd695a67f978dee540c3fef3bd3eb0256cfdfdac0adc998c97a56b845',
 'scripts/lib/own-novelty-succession-installation.mjs':'5d6e7a52307c7ec3cc28ee56941a255e60c88b8238c909eefca869c0e4c801bb',
 'scripts/lib/own-novelty-succession-qa.mjs':'f49b9d3c07fa92734be9f23689dc0aa425ce7b827a951bec436f10ea3f95b929',
 'scripts/lib/municipal-owner-adoption-decision-qa.mjs':'ff632d4920c827bdd75b1798abab8484912fbc4868064a803e72808d5617eb25',
 'scripts/lib/own-payroll-full-capacity-190-installation.mjs':'b8cf0c7854d0d2a2d5180bf711fff461c06bd4516d30e5153ab9163ab5b77aaa',
 'scripts/lib/own-payroll-installation.mjs':'6ad8f07733adfb17b6a32a6efd228073bfb3566844b858167581e2d7896bb3d0',
 'scripts/lib/native-leave-installation.mjs':'57d7f79c358665dc208dfcb9b0d7b2a2ecebaba84dfb6c6057bb3acef6bb25ef',
 'scripts/verify-documentary-roster-performance.mjs':'e058f3450118b23bf16ee1cf7e75b866624153246ce163aed3bf3c96d5f96124',
 'scripts/lib/adopted-documentary-installation.mjs':'9d420e046e9debbef0e584aa47f965f495214bdb4fa6db5de4564edb917d707b'
});
const installedPlans=new WeakMap();

function checkedSources(h,admission208,sourcePlan208){
 const expected=new Map();
 for(const map of [h.qa.sourceHashes,admission208.monthly.sourceHashes,sourcePlan208.sourceHashes,SOURCE_PINS]){
  assert.ok(map&&typeof map==='object'&&!Array.isArray(map),'ANNUL209_CANONICAL_SOURCE_HASHES_REQUIRED');
  for(const[file,digest]of Object.entries(map)){
   assert.match(file,/^(?:scripts|tests|assets|lib|api)\/[A-Za-z0-9_./-]+$/);assert.ok(!file.split('/').includes('..'));assert.match(digest,HASH);
   if(expected.has(file))assert.equal(expected.get(file),digest,'ANNUL209_SOURCE_PIN_CONFLICT:'+file);expected.set(file,digest);
  }
 }
 const texts=new Map(),sourceHashes={};
 for(const[file,digest]of expected){const source=lf(h.read(file));assert.equal(hash(source),digest,'ANNUL209_SOURCE_CHANGED:'+file);texts.set(file,source);sourceHashes[file]=digest;}
 return{texts,sourceHashes,bookend:()=>{for(const[file,digest]of expected)assert.equal(hash(lf(h.read(file))),digest,'ANNUL209_SOURCE_BOOKEND_CHANGED:'+file);return{version:'own-annul-preparation209-source-bookend.v1',passed:true,sourceCommit:h.sourceCommit,sourceHashes:{...sourceHashes},observedMetadataUsed:false};}};
}
function embeddedDefinitions(source,tag,count){
 const values=[...source.matchAll(new RegExp('EXECUTE \\$'+tag+'\\$(CREATE FUNCTION public\\.[\\s\\S]*?)\\$'+tag+'\\$;','g'))].map(match=>match[1]);
 assert.equal(values.length,count,'ANNUL209_WHOLE_SOURCE_DEFINITIONS_REQUIRED:'+tag);return values;
}
function definitions201(source){
 const values=[...source.matchAll(/\bCREATE(?: OR REPLACE)? FUNCTION public\.([a-z0-9_]+)\(([\s\S]*?)\bAS\s+(\$[\w]*\$)([\s\S]*?)\3/g)].map(match=>match[0]);
 assert.equal(values.length,25,'ANNUL209_WHOLE201_DEFINITIONS_REQUIRED');return values;
}
function localPin(definition,normalize,schema,runtime){
 const local=normalize(definition),at=local.search(/\bAS\s+\$/);assert.ok(at>0,'ANNUL209_LOCAL_HEADER_REQUIRED');
 const header=once(local.slice(0,at),'FUNCTION '+schema+'.','FUNCTION public.');
 const pin=pinOf(header+local.slice(at));return{...pin,signature:pin.signature.replace(/^public\./,schema+'.'),runtime};
}
// Exactly one existing TABLE identity is supported. Its declared varchar(96)
// stays in the source contract; pg_proc exposes varchar, not a stored typmod96.
// This is not a general TABLE parser and never learns expected metadata from DB.
function capabilityHeader(definition){
 const at=definition.search(/\bAS\s+\$/);assert.ok(at>0,'ANNUL209_CAPABILITY_BODY_REQUIRED');
 const header=definition.slice(0,at).replace(/\s+/g,' ').trim();
 const match=/^CREATE(?: OR REPLACE)? FUNCTION (?:(?<schema>[a-z_][a-z0-9_]*)\.)?tenant_iam_effective_capabilities\(p_membership_id uuid\) RETURNS TABLE\s*\(capability_key varchar\(96\)\) LANGUAGE sql STABLE SECURITY DEFINER SET search_path\s*=\s*(?<path>[a-z_][a-z0-9_]*(?:\s*,\s*[a-z_][a-z0-9_]*)*)$/.exec(header);
 assert.ok(match,'ANNUL209_CANONICAL_TABLE_HEADER_METADATA_UNRESOLVED:'+CAPABILITY_SIGNATURE);
 return{schema:match.groups.schema??'public',config:['search_path='+match.groups.path.split(',').map(value=>value.trim()).join(', ')]};
}
function capabilitySourcePin(sources,definition,rawPin,hint){
 assert.equal(rawPin.signature,CAPABILITY_SIGNATURE,'ANNUL209_CANONICAL_TABLE_IDENTITY_UNRESOLVED:'+rawPin.signature);
 const source=sources.texts.get(CAPABILITY_SOURCE006),metadata=sources.texts.get(CAPABILITY_METADATA184);
 assert.equal(typeof source,'string');assert.equal(typeof metadata,'string');
 const declarations=[...source.matchAll(/\bCREATE OR REPLACE FUNCTION (?:public\.)?tenant_iam_effective_capabilities\(p_membership_id uuid\)[\s\S]*?\bAS\s+(\$[\w]*\$)[\s\S]*?\1\s*;/g)].map(match=>match[0]);
 assert.equal(declarations.length,1,'ANNUL209_CAPABILITY006_DEFINITION_UNRESOLVED');
 const canonical=declarations[0],sourceHeader=capabilityHeader(canonical),selectedHeader=capabilityHeader(definition);
 assert.deepEqual(sourceHeader,{schema:'public',config:['search_path=public, pg_temp']},'ANNUL209_CAPABILITY006_HEADER_CHANGED');
 assert.deepEqual(selectedHeader,sourceHeader,'ANNUL209_CAPABILITY_GRAPH_HEADER_CHANGED');
 assert.equal(body(definition),body(canonical),'ANNUL209_CAPABILITY006_GRAPH_BODY_CHANGED');
 assert.equal(hash(body(definition)),rawPin.sha256,'ANNUL209_CAPABILITY_GRAPH_SEAL_CHANGED');
 // These exact source184 assertions are already canonical prerequisites there.
 // The complete helper/DDL source pins above guard every surrounding byte too.
 for(const contract of [
  "p.prorettype<>'varchar'::regtype",'NOT p.proretset',
  "p.proargnames IS DISTINCT FROM ARRAY['p_membership_id','capability_key']::text[]",
  "p.proargmodes IS DISTINCT FROM ARRAY['i','t']::\"char\"[]",
  "p.proallargtypes IS DISTINCT FROM ARRAY['uuid'::regtype::oid,'varchar'::regtype::oid]",
  "p.pronargdefaults<>0 OR p.proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp']::text[]",
  "(SELECT lanname FROM pg_language WHERE oid=p.prolang)<>'sql'",
  "p.proowner<>current_user::regrole OR p.prokind<>'f' OR NOT p.prosecdef OR p.proisstrict",
  "p.provolatile<>'s' OR p.proparallel<>'u' OR p.proleakproof OR p.prosupport<>0 OR p.procost<>100 OR p.prorows<>1000",
  "a.grantee<>p.proowner",'OWNER_AUTHORITY184_CAPABILITY_SOURCE_CHANGED'
 ])assert.ok(metadata.includes(contract),'ANNUL209_CAPABILITY184_METADATA_SOURCE_CHANGED:'+contract);
 const pin={kind:'table',name:'tenant_iam_effective_capabilities',signature:CAPABILITY_SIGNATURE,sha256:rawPin.sha256,
  argNames:['p_membership_id','capability_key'],inputArgTypes:['uuid'],inputCount:1,argModes:['i','t'],allArgTypes:['uuid','varchar'],
  declaredOutputColumns:[{name:'capability_key',declaredType:'varchar(96)',catalogType:'varchar'}],
  defaults:'',defaultCount:0,resultType:'varchar',language:'sql',returnsSet:true,strict:false,definer:true,volatility:'s',config:sourceHeader.config,runtime:false};
 if(hint){
  assert.equal(hint.runtime,false,'ANNUL209_CAPABILITY_ACL_HINT_CONTRADICTS184');
  for(const[key,value]of Object.entries(hint)){
   if(key==='tableResult'){assert.equal(value,true,'ANNUL209_CAPABILITY_HINT_METADATA_CHANGED:'+key);continue;}
   assert.ok(Object.hasOwn(pin,key),'ANNUL209_CAPABILITY_HINT_METADATA_UNRESOLVED:'+key);
   assert.deepEqual(value,pin[key],'ANNUL209_CAPABILITY_HINT_METADATA_CHANGED:'+key);
  }
 }
 return pin;
}
function localCapabilityPin(definition,normalize,schema,pin){
 assert.equal(pin.kind,'table');assert.equal(pin.signature,CAPABILITY_SIGNATURE);
 const originalHeader=capabilityHeader(definition);assert.deepEqual(originalHeader,{schema:'public',config:pin.config},'ANNUL209_CAPABILITY_PUBLIC_HEADER_CHANGED');
 const local=normalize(definition),header=capabilityHeader(local),at=local.search(/\bAS\s+\$/),sourceAt=definition.search(/\bAS\s+\$/);
 assert.equal(header.schema,schema,'ANNUL209_CAPABILITY_LOCAL_NAMESPACE_CHANGED');
 // Relocate through the SAME190 normalizer, never through a handwritten QA
 // search_path or a header/body rewritten to please the scalar pin parser.
 const relocatedHeader=normalize(definition.slice(0,sourceAt)).replace(/\s+/g,' ').trim();
 assert.equal(local.slice(0,at).replace(/\s+/g,' ').trim(),relocatedHeader,'ANNUL209_CAPABILITY_LOCAL_HEADER_CHANGED');
 const localPin={...pin,signature:schema+'.tenant_iam_effective_capabilities(uuid)',config:header.config,sha256:hash(body(local))};
 return localPin;
}
function tablePinsCheck(pins,code){
 assert.ok(Array.isArray(pins)&&pins.length<=1,'ANNUL209_SINGLE_CANONICAL_TABLE_REQUIRED');
 for(const pin of pins){assert.equal(pin.kind,'table');assert.equal(pin.name,'tenant_iam_effective_capabilities');assert.equal(pin.runtime,false);assert.deepEqual(pin.argModes,['i','t']);assert.deepEqual(pin.allArgTypes,['uuid','varchar']);}
 if(!pins.length)return'';
 return `DO $annul209_table_metadata$ DECLARE x jsonb;p pg_proc;BEGIN
 FOR x IN SELECT value FROM jsonb_array_elements(${q(JSON.stringify(pins))}::jsonb) LOOP
 SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(x->>'signature');
 IF p.oid IS NULL OR p.proowner<>current_user::regrole OR p.prokind<>'f' OR NOT p.prosecdef OR p.proisstrict OR NOT p.proretset
 OR p.prorettype<>'varchar'::regtype OR p.provolatile<>'s' OR p.proparallel<>'u' OR p.proleakproof OR p.prosupport<>0 OR p.procost<>100 OR p.prorows<>1000
 OR p.pronargs<>1 OR p.proargtypes[0]<>'uuid'::regtype::oid
 OR p.proargnames IS DISTINCT FROM ARRAY['p_membership_id','capability_key']::text[]
 OR p.proargmodes IS DISTINCT FROM ARRAY['i','t']::"char"[] OR p.proallargtypes IS DISTINCT FROM ARRAY['uuid'::regtype::oid,'varchar'::regtype::oid]
 OR p.pronargdefaults<>0 OR coalesce(pg_get_expr(p.proargdefaults,0),'')<>''
 OR coalesce(to_jsonb(p.proconfig),'[]'::jsonb) IS DISTINCT FROM x->'config'
 OR (SELECT lanname FROM pg_language WHERE oid=p.prolang)<>'sql'
 OR encode(public.digest(replace(p.prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex')<>x->>'sha256'
 OR has_function_privilege('municontrol_actions_runtime_app',p.oid,'EXECUTE')
 THEN RAISE EXCEPTION '${code}' USING DETAIL=x->>'signature';END IF;
 END LOOP;END $annul209_table_metadata$`;
}
function sourceClosure(h,admission208,sourcePlan208,sources,ownDefinitions){
 const monthly=admission208.monthly,graph=h.qa.foundation?.foundation?.foundation?.owner?.graph;
 assert.ok(graph?.pool instanceof Map&&graph.pinHints instanceof Map&&Array.isArray(graph.definitions),'ANNUL209_SAME190_SOURCE_GRAPH_REQUIRED');
 const registry=new Map(),hints=new Map(graph.pinHints);
 const add=(definition,origin,normalize,expectedSource,expectedLocal)=>{
  let pin;try{pin=pinOf(definition);}catch{throw Error('ANNUL209_CANONICAL_HEADER_METADATA_UNRESOLVED:'+origin+':'+definition.slice(0,160));}
  const hint=expectedSource??hints.get(pin.signature+'|'+pin.sha256);
  assert.equal(typeof hint?.runtime,'boolean','ANNUL209_CANONICAL_ACL_UNRESOLVED:'+pin.signature+':'+origin);
  if(expectedSource)assert.deepEqual({...pin,runtime:hint.runtime},expectedSource,'ANNUL209_SOURCE_METADATA_CHANGED:'+pin.signature);
  const current={definition,origin,normalize,pin:{...pin,runtime:hint.runtime},expectedLocal};registry.set(pin.signature,current);
 };
 // Index EVERY selected FINAL graph identity before parsing return/header
 // metadata. TABLE-returning functions must remain visible to unqualified
 // dependency calls even when the full pin parser cannot represent them yet.
 for(const definition of graph.definitions){
  const sealed=[...graph.pool.entries()].filter(([,value])=>value===definition);
  assert.equal(sealed.length,1,'ANNUL209_GRAPH_SOURCE_IDENTITY_UNRESOLVED');
  const [identity]=sealed[0],separator=identity.lastIndexOf('|');
  const signature=identity.slice(0,separator),sha256=identity.slice(separator+1),name=/^public\.([a-z_][a-z0-9_]*)\([^]*\)$/.exec(signature)?.[1];
  assert.ok(separator>0&&name&&HASH.test(sha256),'ANNUL209_GRAPH_SOURCE_IDENTITY_INVALID:'+identity);
  assert.equal(hash(body(definition)),sha256,'ANNUL209_GRAPH_SOURCE_UNSEALED:'+signature);
  // Unused graph members may lack header/ACL metadata. Resolve only when walked.
  registry.set(signature,{definition,origin:'graph190',normalize:h.qa.normalized,pin:null,rawPin:{name,signature,sha256}});
 }
 for(const[key,pinsKey,localKey]of[['supportDefinitions','supportPins','expectedQaSupportPins'],['adapted','afterPins','expectedQaAfterPins'],['newDefinitions','newPins','expectedQaNewPins']]){
  const definitions=monthly.novelty197?.[key],pins=monthly.novelty197?.[pinsKey];assert.ok(Array.isArray(definitions)&&Array.isArray(pins));
  for(const definition of definitions){const pin=pinOf(definition),expected=pins.find(value=>value.signature===pin.signature);assert.ok(expected,'ANNUL209_CANONICAL197_PIN_REQUIRED:'+pin.signature);add(definition,key+'197',monthly.normalized,expected,monthly[localKey]?.find(value=>value.name===pin.name));}
 }
 {const definition=monthly.novelty197.ready,pin=pinOf(definition),expected=monthly.novelty197.afterPins.find(value=>value.signature===pin.signature);assert.ok(expected,'ANNUL209_CANONICAL197_READY_REQUIRED');add(definition,'readiness197',monthly.normalized,expected,monthly.expectedQaAfterPins.find(value=>value.name===pin.name));}
 // Whole201 source overrides legacy bodies; no current pg_proc is consulted.
 for(const definition of definitions201(sources.texts.get(SQL201))){
  const pin=pinOf(definition),record=admission208.capacityPlan.postLocal.find(value=>value.name===pin.name);assert.ok(record,'ANNUL209_CANONICAL201_LOCAL_PIN_REQUIRED:'+pin.name);
  add(definition,'capacity201',h.qa.normalized,{...pin,runtime:record.runtime},{record});
 }
 for(const definition of embeddedDefinitions(sources.texts.get(SQL208),'definition_208',7)){
  const pin=pinOf(definition),expected=sourcePlan208.ownPins.find(value=>value.name===pin.name);assert.ok(expected,'ANNUL209_CANONICAL208_PIN_REQUIRED:'+pin.name);
  add(definition,'review208',h.qa.normalized,{...pin,runtime:expected.runtime},expected);
 }
 const names=new Map();for(const[signature,value]of registry){const name=(value.pin??value.rawPin).name;const list=names.get(name)??[];list.push(signature);names.set(name,list);}
 const ownNames=new Set(ownSignatures.map(([name])=>name)),pending=[...roots],visited=new Set(),pins=[],provenance=[];
 // Public pgcrypto.digest remains an explicit external primitive of canonical
 //190 relocation, not a guessed SQL-source body. No new extension is installed.
 const external=new Set(['digest']);
 const dependencies=text=>{
  assert.ok(!/"public"\s*\.\s*"/.test(text),'ANNUL209_QUOTED_FUNCTION_DEPENDENCY_UNRESOLVED');
  const result=new Set([...text.matchAll(/\bpublic\.([a-z_][a-z0-9_]*)\s*\(/g)].map(match=>match[1]));
  // Search all known application names as unqualified calls too. PostgreSQL
  // builtins remain pg_catalog primitives; unknown dynamic targets fail below.
  for(const name of names.keys())if(new RegExp('(?<![A-Za-z0-9_.])'+name+'\\s*\\(').test(text))result.add(name);
  return[...result].filter(name=>!ownNames.has(name)&&!external.has(name));
 };
 for(const definition of ownDefinitions)pending.push(...dependencies(body(definition)));
 while(pending.length){
  const name=pending.shift();if(visited.has(name)||ownNames.has(name)||external.has(name))continue;visited.add(name);
  const signatures=names.get(name);assert.ok(signatures?.length,'ANNUL209_TRANSITIVE_SOURCE_DEFINITION_UNRESOLVED:'+name);assert.equal(signatures.length,1,'ANNUL209_TRANSITIVE_SOURCE_OVERLOAD_UNRESOLVED:'+name);
  const entry=registry.get(signatures[0]);
  if(!entry.pin){
   if(entry.rawPin.signature===CAPABILITY_SIGNATURE){entry.pin=capabilitySourcePin(sources,entry.definition,entry.rawPin,hints.get(entry.rawPin.signature+'|'+entry.rawPin.sha256));}
   else{
    let pin;try{pin=pinOf(entry.definition);}catch{throw Error('ANNUL209_CANONICAL_HEADER_METADATA_UNRESOLVED:'+entry.rawPin.signature);}
    assert.deepEqual({name:pin.name,signature:pin.signature,sha256:pin.sha256},entry.rawPin,'ANNUL209_GRAPH_PIN_IDENTITY_CHANGED:'+entry.rawPin.signature);
    const hint=hints.get(pin.signature+'|'+pin.sha256);assert.equal(typeof hint?.runtime,'boolean','ANNUL209_CANONICAL_ACL_UNRESOLVED:'+pin.signature);entry.pin={...pin,runtime:hint.runtime};
   }
  }
  const local=entry.pin.kind==='table'?localCapabilityPin(entry.definition,entry.normalize,h.qa.schema,entry.pin):localPin(entry.definition,entry.normalize,h.qa.schema,entry.pin.runtime);
  if(entry.expectedLocal?.record){const record=entry.expectedLocal.record;assert.equal(record.signature,local.signature);assert.equal(record.bodySha256,local.sha256);assert.deepEqual(record.argNames,local.argNames);assert.deepEqual(record.config,local.config);assert.equal(record.runtime,local.runtime);assert.equal(record.volatility,local.volatility);}
  else if(entry.expectedLocal)assert.deepEqual(local,entry.expectedLocal,'ANNUL209_CANONICAL_LOCAL_PIN_CHANGED:'+name);
  const text=body(entry.definition);
  // No dynamic target is silently admitted by the public-call walk. A missing
  // literal/dependency contract must be reviewed explicitly before construction.
  assert.ok(!/\bEXECUTE\s+(?!FUNCTION\b)/i.test(text),'ANNUL209_DYNAMIC_SQL_CLOSURE_UNRESOLVED:'+name);
  pending.push(...dependencies(text));
  pins.push(local);provenance.push({name,signature:entry.pin.signature,origin:entry.origin,sourceBodySha256:entry.pin.sha256,sourceDefinitionSha256:hash(entry.definition),localBodySha256:local.sha256,localDefinitionSha256:hash(entry.normalize(entry.definition)),runtime:local.runtime,...(entry.pin.kind==='table'?{metadataKind:'table',publicDescriptor:entry.pin,localDescriptor:local,metadataSource:CAPABILITY_METADATA184,definitionSource:CAPABILITY_SOURCE006,aclProvenance:'source184 owner-only capability checker and canonical190 graph ACL seed'}:{})});
 }
 const ordered=pins.map((pin,index)=>({pin,provenance:provenance[index]})).sort((a,b)=>a.pin.signature<b.pin.signature?-1:a.pin.signature>b.pin.signature?1:0);
 return{pins:ordered.map(value=>value.pin),provenance:ordered.map(value=>value.provenance),externalPrimitives:['public.digest from the existing canonical190 pgcrypto environment'],unresolvedMetadata:[],observedMetadataUsed:false};
}

function aclAndOverloads(pins,code){
 return `DO $annul209_acl$ DECLARE x jsonb;p pg_proc;runtime_oid oid:=to_regrole('municontrol_actions_runtime_app');BEGIN
 IF runtime_oid IS NULL OR runtime_oid=current_user::regrole THEN RAISE EXCEPTION '${code}';END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(${q(JSON.stringify(pins))}::jsonb) LOOP
 SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(x->>'signature');
 IF p.oid IS NULL OR(SELECT count(*) FROM pg_proc other WHERE other.pronamespace=p.pronamespace AND other.proname=p.proname)<>1
 OR NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantor=p.proowner AND a.grantee=p.proowner AND a.privilege_type='EXECUTE' AND NOT a.is_grantable)
 OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantor<>p.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable OR(a.grantee<>p.proowner AND NOT((x->>'runtime')::boolean AND a.grantee=runtime_oid)))
 OR(SELECT count(*) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))))<>(CASE WHEN(x->>'runtime')::boolean THEN 2 ELSE 1 END)
 THEN RAISE EXCEPTION '${code}' USING DETAIL=x->>'signature';END IF;END LOOP;END $annul209_acl$`;
}
function ledgerTriggers(h,sources){
 const definitions=[];
 for(const file of ['scripts/migrations/123-own-payroll-runs.sql','scripts/migrations/124-own-payroll-liquidation-decisions.sql','scripts/migrations/125-own-payroll-close.sql','scripts/migrations/146-own-consolidated-annulment.sql']){
  for(const match of sources.texts.get(file).matchAll(/CREATE TRIGGER ([a-z0-9_]+) BEFORE (UPDATE OR DELETE|TRUNCATE) ON public\.([a-z0-9_]+) FOR EACH (ROW|STATEMENT) EXECUTE FUNCTION public\.([a-z0-9_]+)\(\);/g)){
   const[,name,events,table,kind,handler]=match;assert.equal(kind,events==='TRUNCATE'?'STATEMENT':'ROW');
   definitions.push({name,table:h.qa.schema+'.'+table,handler:h.qa.schema+'.'+handler+'()',type:events==='TRUNCATE'?34:27,sourceFile:file,sourceStatementSha256:hash(match[0])});
  }
 }
 assert.equal(definitions.length,10,'ANNUL209_ALL_TEN_SOURCE_TRIGGERS_REQUIRED');assert.equal(new Set(definitions.map(value=>value.table+':'+value.name)).size,10);
 const tables=[...new Set(definitions.map(value=>value.table))];assert.equal(tables.length,5);assert.ok(tables.every(table=>definitions.filter(value=>value.table===table).length===2));
 const sql=`DO $annul209_triggers$ DECLARE x jsonb;t pg_trigger;r oid;BEGIN
 FOR x IN SELECT value FROM jsonb_array_elements(${q(JSON.stringify(definitions))}::jsonb) LOOP
 r:=to_regclass(x->>'table');SELECT * INTO t FROM pg_trigger WHERE tgrelid=r AND tgname=x->>'name';
 IF r IS NULL OR t.oid IS NULL OR t.tgisinternal OR t.tgtype<>(x->>'type')::integer OR t.tgenabled<>'O' OR t.tgfoid IS DISTINCT FROM to_regprocedure(x->>'handler') OR t.tgqual IS NOT NULL OR t.tgnargs<>0 OR t.tgargs<>''::bytea OR t.tgattr<>''::int2vector OR t.tgconstraint<>0 OR(SELECT count(*) FROM pg_trigger WHERE tgrelid=r AND NOT tgisinternal)<>2
 THEN RAISE EXCEPTION 'ANNUL209_IMMUTABLE_TRIGGER_SOURCE_CHANGED';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=r AND c.relowner=current_user::regrole AND c.relkind='r' AND c.relrowsecurity AND NOT c.relforcerowsecurity) OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid=r AND a.grantee<>c.relowner) THEN RAISE EXCEPTION 'ANNUL209_LEDGER_SECURITY_CHANGED';END IF;
 END LOOP;END $annul209_triggers$`;
 return{definitions,sql};
}
function preservation(h,slot,excludeNames){
 assert.ok(['before','after','epoch208'].includes(slot));let source=performancePreservationSnapshot();
 const anchor="FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname NOT LIKE 'pg_%' AND s.nspname<>'information_schema'";
 source=once(source,anchor,anchor+` AND NOT(s.nspname=${q(h.qa.schema)} AND p.proname=ANY(ARRAY[${excludeNames.map(q).join(',')}]))`);
 const ownIds=excludeNames.map(name=>`SELECT oid FROM pg_proc WHERE pronamespace=${q(h.qa.schema)}::regnamespace AND proname=${q(name)}`).join(' UNION ALL ');
 const owns=alias=>`(${alias}.classid='pg_proc'::regclass AND ${alias}.objid IN(${ownIds}))`;
 const extras=` result:=result||jsonb_build_object(
 'dependencies',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.classid,d.objid,d.objsubid,d.refclassid,d.refobjid,d.refobjsubid,d.deptype),'[]') FROM pg_depend d WHERE NOT coalesce(${owns('d')},false)),
 'sharedDependencies',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.dbid,d.classid,d.objid,d.objsubid,d.refclassid,d.refobjid,d.deptype),'[]') FROM pg_shdepend d WHERE NOT coalesce(${owns('d')} AND d.dbid=(SELECT oid FROM pg_database WHERE datname=current_database()),false)),
 'descriptions',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.classoid,d.objoid,d.objsubid),'[]') FROM pg_description d WHERE NOT(d.classoid='pg_proc'::regclass AND d.objoid IN(${ownIds}))),
 'securityLabels',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.classoid,d.objoid,d.objsubid,d.provider),'[]') FROM pg_seclabel d WHERE NOT(d.classoid='pg_proc'::regclass AND d.objoid IN(${ownIds}))),
 'rewrites',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.oid),'[]') FROM pg_rewrite d),
 'extensions',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.oid),'[]') FROM pg_extension d));
 PERFORM set_config`;
 //208 priorState did not include these six extra arrays. Its epoch comparison
 // must use its EXACT old snapshot shape, not a newly broadened hash format.
 if(slot!=='epoch208')source=once(source,' PERFORM set_config',extras);
 source=once(source,'municontrol_documentary_install.after',prefix+slot);return h.qa.normalized(source);
}
function proofCheck(value,plan){
 assert.equal(value?.version,'own-annul-preparation209-installation-proof.v1');assert.equal(value.sourceCommit,plan.sourceCommit);assert.equal(value.sourceSqlSha256,OWN_ANNUL_PREPARATION209_SQL_SHA256);assert.equal(value.predecessorPinsSha256,plan.predecessorPinsSha256);assert.deepEqual(value.sourceHashes,plan.sourceHashes);
 for(const[key,count]of Object.entries({newFunctions:3,privateHelpers:1,runtimeFacades:2,newTables:0,adaptedFunctions:0,existingAclChanges:0,roleAssignmentsAdded:0,businessWrites:0,nominalRowsReturned:0}))assert.equal(value[key],count,key);
 for(const key of ['priorStateSha256','objectSha256','epoch208PriorStateSha256'])assert.match(value[key],HASH);
 assert.equal(value.epoch208PriorStateSha256,plan.expected208PriorStateSha256);assert.ok(['install','verify'].includes(value.mode));
 assert.equal(Math.trunc(Number(value.native?.serverVersionNum)/10000),plan.major);assert.ok(Number.isSafeInteger(value.native.pid));assert.equal(typeof value.native.backendStart,'string');
}

// FUTURE SOURCE construction only. No invocation/constructor proof exists yet.
export function composeOwnAnnulPreparation209On190({h,db,admission208,installation208}){
 assert.ok(h?.qa&&typeof h.read==='function'&&typeof h.json==='function'&&typeof h.check==='function');assert.ok(db&&typeof db.query==='function'&&typeof db.run==='function','ANNUL209_EXISTING_TRANSPORT_REQUIRED');
 assert.ok([17,18].includes(h.major));assert.match(h.sourceCommit,/^[a-f0-9]{40}$/);assert.equal(h.qa.sourceCommit,h.sourceCommit);assert.match(h.qa.schema,SCHEMA);assert.equal(h.qa.operationalPairBaseline,'published107','ANNUL209_PRE107_HOST_NOT_ADMITTED');
 exact(admission208,['version','sourceCommit','monthly','capacityPlan'],'ANNUL209_CANONICAL208_SOURCE_ADMISSION_REQUIRED');assert.equal(admission208.version,'own-annulment-review208-canonical-source.v1');assert.equal(admission208.sourceCommit,h.sourceCommit);assert.strictEqual(admission208.monthly,h.prepared?.monthly);assert.strictEqual(admission208.monthly.qa192.qa,h.qa);
 assert.equal(installation208?.version,'own-annulment-review208-canonical190-installation.v1');assert.equal(installation208.sourceCommit,h.sourceCommit);assert.equal(installation208.passed,true);
 const expected208PriorStateSha256=installation208.proofs?.installed?.priorStateSha256;assert.match(expected208PriorStateSha256,HASH);
 const sourcePlan208=composeOwnAnnulmentReviewV2On190({h,db,admission:admission208});
 assert.equal(sourcePlan208.postflight.length,4,'ANNUL209_CANONICAL208_POSTFLIGHT_SHAPE_CHANGED');
 const sources=checkedSources(h,admission208,sourcePlan208),source=sources.texts.get(OWN_ANNUL_PREPARATION209_SQL),definitions=embeddedDefinitions(source,'definition_209',3);
 const ownPins=definitions.map((definition,index)=>{const[name,args,runtime]=ownSignatures[index],pin=pinOf(definition);assert.equal(pin.name,name);assert.equal(pin.signature,'public.'+name+'('+args+')');assert.deepEqual(pin.argNames,index===0?['p','source_id','maximum_bytes']:['p','source_id']);assert.equal(pin.resultType,'jsonb');assert.deepEqual(pin.config,['search_path=pg_catalog, public, pg_temp','TimeZone=UTC']);return localPin(definition,h.qa.normalized,h.qa.schema,runtime);});
 const closure=sourceClosure(h,admission208,sourcePlan208,sources,definitions),triggers=ledgerTriggers(h,sources);
 const predecessorPins=closure.pins,predecessorPinsSha256=hash(JSON.stringify(predecessorPins));
 const scalarPredecessorPins=predecessorPins.filter(pin=>pin.kind!=='table'),tablePredecessorPins=predecessorPins.filter(pin=>pin.kind==='table');
 const predecessorCheck=[sourcePlan208.postflight[1],sourcePlan208.postflight[2],admission208.capacityPlan.postflight,pinsCheck(scalarPredecessorPins,'ANNUL209_TRANSITIVE_SOURCE_CHANGED'),tablePinsCheck(tablePredecessorPins,'ANNUL209_TRANSITIVE_TABLE_SOURCE_CHANGED'),aclAndOverloads(predecessorPins,'ANNUL209_TRANSITIVE_ACL_CHANGED'),triggers.sql].join(';\n');
 const ownCheck=[pinsCheck(ownPins,'ANNUL209_NEW_FUNCTION_SOURCE_CHANGED'),aclAndOverloads(ownPins,'ANNUL209_NEW_FUNCTION_ACL_CHANGED')].join(';\n');
 const names=ownSignatures.map(([name])=>name),s=h.qa.schema;
 const context=readOnly=>`DO $annul209_context$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>${q(readOnly?'on':'off')} OR current_setting('standard_conforming_strings')<>'on' OR current_setting('server_version_num')::integer/10000<>${h.major} THEN RAISE EXCEPTION 'ANNUL209_NATIVE_CONTEXT_REQUIRED';END IF;END $annul209_context$`;
 const mode=`DO $annul209_mode$ DECLARE n integer;BEGIN PERFORM set_config('lock_timeout','5s',true);PERFORM set_config('statement_timeout','180s',true);PERFORM pg_advisory_xact_lock(209);SELECT count(*) INTO n FROM pg_proc WHERE pronamespace=${q(s)}::regnamespace AND proname=ANY(ARRAY[${names.map(q).join(',')}]);IF n=0 THEN PERFORM set_config('${prefix}mode','install',true);ELSIF n=3 THEN PERFORM set_config('${prefix}mode','verify',true);ELSE RAISE EXCEPTION 'ANNUL209_PARTIAL_OR_FOREIGN_STATE';END IF;END $annul209_mode$`;
 const defaults=`DO $annul209_defaults$ DECLARE value aclitem[];runtime_oid oid:=to_regrole('municontrol_actions_runtime_app');BEGIN value:=coalesce((SELECT defaclacl FROM pg_default_acl WHERE defaclrole=current_user::regrole AND defaclobjtype='f' AND defaclnamespace=0),acldefault('f',current_user::regrole))||coalesce((SELECT defaclacl FROM pg_default_acl WHERE defaclrole=current_user::regrole AND defaclobjtype='f' AND defaclnamespace=${q(s)}::regnamespace),'{}'::aclitem[]);IF runtime_oid IS NULL OR runtime_oid=current_user::regrole OR EXISTS(SELECT 1 FROM aclexplode(value) a WHERE a.grantor<>current_user::regrole OR a.grantee NOT IN(0,current_user::regrole,runtime_oid) OR a.privilege_type<>'EXECUTE' OR a.is_grantable) OR NOT EXISTS(SELECT 1 FROM aclexplode(value) a WHERE a.grantee=current_user::regrole AND a.privilege_type='EXECUTE' AND NOT a.is_grantable) THEN RAISE EXCEPTION 'ANNUL209_DEFAULT_ACL_CHANGED';END IF;END $annul209_defaults$`;
 const epoch208=preservation(h,'epoch208',[...prior208Names,...names]),epoch208Check=`DO $annul209_epoch$ BEGIN IF encode(public.digest(current_setting('${prefix}epoch208')::jsonb::text,'sha256'),'hex')<>${q(expected208PriorStateSha256)} THEN RAISE EXCEPTION 'ANNUL209_NOT_IMMEDIATE208_EPOCH';END IF;END $annul209_epoch$`;
 const before=preservation(h,'before',names),after=preservation(h,'after',names),compare=`DO $annul209_preserved$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'ANNUL209_FULL_PRIOR_STATE_CHANGED';END IF;END $annul209_preserved$`;
 const choose=`DO $annul209_choose$ BEGIN IF current_setting('${prefix}mode')='verify' THEN EXECUTE ${q(ownCheck)};END IF;END $annul209_choose$`;
 const apply=`DO $annul209_apply$ BEGIN IF current_setting('${prefix}mode')='install' THEN EXECUTE ${q(h.qa.normalized(source))};END IF;END $annul209_apply$`;
 const objectSha256=`(SELECT encode(public.digest(coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.oid),'[]')::text,'sha256'),'hex') FROM pg_proc p WHERE p.pronamespace=${q(s)}::regnamespace AND p.proname=ANY(ARRAY[${names.map(q).join(',')}]))`;
 const functionProof=`SELECT jsonb_build_object('version','own-annul-preparation209-function-bookend.v1','sourceCommit',${q(h.sourceCommit)},'sourceSqlSha256',${q(OWN_ANNUL_PREPARATION209_SQL_SHA256)},'predecessorPinsSha256',${q(predecessorPinsSha256)},'objectSha256',${objectSha256}) AS proof`;
 const proof=initial=>`SELECT jsonb_build_object('version','own-annul-preparation209-installation-proof.v1','sourceCommit',${q(h.sourceCommit)},'sourceSqlSha256',${q(OWN_ANNUL_PREPARATION209_SQL_SHA256)},'sourceHashes',${q(JSON.stringify(sources.sourceHashes))}::jsonb,'predecessorPinsSha256',${q(predecessorPinsSha256)},'mode',${initial?"current_setting('"+prefix+"mode')":"'verify'"},'newFunctions',3,'privateHelpers',1,'runtimeFacades',2,'newTables',0,'adaptedFunctions',0,'existingAclChanges',0,'roleAssignmentsAdded',0,'businessWrites',0,'nominalRowsReturned',0,'transactionDataPreserved',${initial},'priorStateSha256',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex'),'epoch208PriorStateSha256',encode(public.digest(current_setting('${prefix}epoch208')::jsonb::text,'sha256'),'hex'),'objectSha256',${objectSha256},'native',jsonb_build_object('pid',pg_backend_pid(),'backendStart',(SELECT backend_start FROM pg_stat_activity WHERE pid=pg_backend_pid()),'serverVersionNum',current_setting('server_version_num'))${initial?",'beforeStateSha256',encode(public.digest(current_setting('"+prefix+"before')::jsonb::text,'sha256'),'hex')":''}) AS proof`;
 const beforeApply=[context(false),mode,defaults,predecessorCheck,epoch208,epoch208Check,choose,before];
 return{version:'own-annul-preparation209-source-plan.v1',sourceCommit:h.sourceCommit,major:h.major,schema:s,sourceSqlSha256:OWN_ANNUL_PREPARATION209_SQL_SHA256,expected208PriorStateSha256,sourceHashes:sources.sourceHashes,predecessorPins,predecessorPinsSha256,predecessorSources:closure.provenance,externalPrimitives:closure.externalPrimitives,triggerSources:triggers.definitions,ownPins,beforeApply,statements:[...beforeApply,apply,predecessorCheck,ownCheck,after,compare,proof(true)],verification:[context(true),predecessorCheck,ownCheck,epoch208,epoch208Check,after,proof(false)],postflight:[context(true),predecessorCheck,ownCheck,functionProof],sourceBookend:sources.bookend,connects:false,executesSql:false,executionAdmitted:false,pre107Admitted:false};
}

// FUTURE native procedure. Same h/db/guarded transport/cleanup, no new schema,
// collector, CLI, connection string or weaker runner. Not invoked locally.
export async function installOwnAnnulPreparation209On190({h,db,admission208,installation208,baselineSnapshot}){
 assertOwnAnnulmentReviewV2SourceBookend({h,db,installation:installation208});
 const plan=composeOwnAnnulPreparation209On190({h,db,admission208,installation208});assert.ok(baselineSnapshot&&typeof baselineSnapshot==='object');assert.deepEqual(ownFullCapacity190Snapshot(h),baselineSnapshot,'ANNUL209_BASELINE_CHANGED_BEFORE_INSTALL');
 const early="DO $annul209_early$ BEGIN RAISE EXCEPTION 'ANNUL209_EARLY_INSTALL_FAILURE';END $annul209_early$",late="DO $annul209_late$ BEGIN RAISE EXCEPTION 'ANNUL209_LATE_INSTALL_FAILURE';END $annul209_late$";
 await assert.rejects(async()=>h.json([...plan.beforeApply,early],{end:'ROLLBACK',fullJson:true}),error=>/ANNUL209_EARLY_INSTALL_FAILURE/.test(error.message));assert.deepEqual(ownFullCapacity190Snapshot(h),baselineSnapshot,'ANNUL209_EARLY_ROLLBACK_CHANGED_STATE');
 const rehearsal=h.json(plan.statements,{end:'ROLLBACK',fullJson:true});proofCheck(rehearsal,plan);assert.equal(rehearsal.mode,'install');assert.equal(rehearsal.beforeStateSha256,rehearsal.priorStateSha256);assert.deepEqual(ownFullCapacity190Snapshot(h),baselineSnapshot,'ANNUL209_REHEARSAL_NOT_ROLLED_BACK');
 await assert.rejects(async()=>h.json([...plan.statements,late],{end:'ROLLBACK',fullJson:true}),error=>/ANNUL209_LATE_INSTALL_FAILURE/.test(error.message));assert.deepEqual(ownFullCapacity190Snapshot(h),baselineSnapshot,'ANNUL209_LATE_ROLLBACK_CHANGED_STATE');
 await assert.rejects(async()=>h.json([`ALTER DEFAULT PRIVILEGES IN SCHEMA ${h.qa.schema} GRANT EXECUTE ON FUNCTIONS TO pg_monitor`,...plan.statements],{end:'ROLLBACK',fullJson:true}),error=>/ANNUL209_DEFAULT_ACL_CHANGED/.test(error.message));assert.deepEqual(ownFullCapacity190Snapshot(h),baselineSnapshot,'ANNUL209_DEFAULT_ACL_ROLLBACK_CHANGED_STATE');
 const installed=h.json(plan.statements,{fullJson:true}),durable=h.json(plan.verification,{readOnly:true,fullJson:true}),repeated=h.json(plan.statements,{fullJson:true});
 for(const value of [installed,durable,repeated])proofCheck(value,plan);
 assert.equal(installed.mode,'install');assert.equal(durable.mode,'verify');assert.equal(repeated.mode,'verify');assert.equal(installed.transactionDataPreserved,true);assert.equal(repeated.transactionDataPreserved,true);assert.equal(durable.transactionDataPreserved,false);
 for(const value of [installed,repeated])assert.equal(value.beforeStateSha256,value.priorStateSha256,'ANNUL209_PRIOR_STATE_NOT_CONSERVED');
 for(const key of ['priorStateSha256','epoch208PriorStateSha256','objectSha256']){assert.equal(installed[key],durable[key],'ANNUL209_NOT_DURABLE:'+key);assert.equal(installed[key],repeated[key],'ANNUL209_REPEAT_CHANGED:'+key);}
 assert.equal(new Set([rehearsal,installed,durable,repeated].map(value=>value.native.pid+':'+value.native.backendStart)).size,4,'ANNUL209_INDEPENDENT_CONNECTIONS_REQUIRED');
 const sourceBookend=plan.sourceBookend(),result={version:'own-annul-preparation209-canonical190-installation.v1',passed:true,sourceCommit:h.sourceCommit,sourceSqlSha256:OWN_ANNUL_PREPARATION209_SQL_SHA256,predecessorPins:plan.predecessorPins,predecessorSources:plan.predecessorSources,triggerSources:plan.triggerSources,sourceBookend,proofs:{rehearsal,installed,durable,repeated,earlyInstallRollback:true,lateInstallRollback:true,inheritedDefaultAclRejected:true},operationalPairBaseline:'published107',pre107Admitted:false,synthetic:true,productionWrites:0,municipalAcceptance:false};
 installedPlans.set(result,{h,db,plan});h.check('209 three new source-pinned read functions preserve the immediate208 canonical190 epoch through faults, rollback, commit, fresh verification and repeat');return result;
}

// After legitimate208/209 business and actor seeds: ONLY function/source checks.
// Do not rerun installer/durability requiring the original208 business epoch.
export function assertOwnAnnulPreparation209SourceBookend({h,db,installation}){
 const saved=installedPlans.get(installation);assert.ok(saved,'ANNUL209_EXACT_INSTALLATION_REQUIRED');assert.strictEqual(saved.h,h);assert.strictEqual(saved.db,db);
 const source=saved.plan.sourceBookend(),proof=h.json(saved.plan.postflight,{readOnly:true,fullJson:true});
 assert.equal(proof?.version,'own-annul-preparation209-function-bookend.v1');assert.equal(proof.sourceCommit,h.sourceCommit);assert.equal(proof.sourceSqlSha256,OWN_ANNUL_PREPARATION209_SQL_SHA256);assert.equal(proof.predecessorPinsSha256,saved.plan.predecessorPinsSha256);assert.equal(proof.objectSha256,installation.proofs.installed.objectSha256,'ANNUL209_FUNCTION_METADATA_CHANGED_AFTER_BUSINESS');
 return{...source,sourceMetadataOnly:false,metadataPostflightVerified:true,priorBusinessRowsRecompared:false,functionProof:proof};
}
