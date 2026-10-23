// PRIVATE SOURCE PROPOSAL. Not imported, parsed, constructed or executed.
// Intended overlay imports below require their separately admitted sources.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildMonthlyDayFixedCompositionQa,monthlyFixedQaHeader} from './own-monthly-day-fixed-composition-qa.mjs';
import {buildOwnNoveltySuccessionQa} from './own-novelty-succession-qa.mjs';
import {buildOwnMonetaryGuardedInstallation,OWN_MONETARY_INSTALLATION_SOURCES} from './own-monetary-program-guarded-installation.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';

const VERSION='own-monetary-program-qa-projection.v2';
const INSTALL_VERSION='own-monetary-program-guarded-installation.v2';
const hash=s=>createHash('sha256').update(s).digest('hex');
const lf=s=>s.replace(/\r\n?/g,'\n');
const PHASES=Object.freeze(['rehearsal','installation','repetition','verification','rollback','rollbackVerification']);
const TARGETS=Object.freeze(['own_program_definition_v1','municipal_owner_program_command_core_v1']);
const HELPERS=Object.freeze(['fields','reference','json_guard','hash','rounding','nodes','verify'].map(n=>'own_monetary_manifest_'+n+'_v1'));
const SOURCES=Object.freeze({
 'scripts/lib/own-monetary-program-guarded-installation.mjs':'0c55c03740a792e86061dbd8bcc05fb80969d46a5d2ca58969d5789532ecd243',
 'scripts/lib/own-monthly-day-fixed-composition-qa.mjs':'0a3a62f077dc150241bd1d339e699a5f0b9d229fb233e54b55057e75b6fe8f66',
 'scripts/lib/own-novelty-succession-qa.mjs':'f49b9d3c07fa92734be9f23689dc0aa425ce7b827a951bec436f10ea3f95b929',
 'scripts/lib/own-payroll-installation.mjs':'6ad8f07733adfb17b6a32a6efd228073bfb3566844b858167581e2d7896bb3d0',
 'scripts/lib/own-monthly-day-engine-source-qa.mjs':'d013cdd06d2f16e0196db3675c874a9f2765d5a3c42539cdd7e228684a4de8f1',
 'scripts/lib/own-monthly-day-policy-qa.mjs':'d711476b6673dd5c0e2e08606016c7294966677fe3b832674f0c4ebcadf8aca4',
 'scripts/verify-municipal-owner-adoption-authority.mjs':'6194ab3f20092277c7b30c8a3c1fd7cb2bae3041ce8a3a63df107ea3b628cfeb',
});
const body=d=>{const m=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?\s*$/.exec(d);assert.ok(m,'MONETARY_QA_FUNCTION_BODY_REQUIRED');return m[2];};
const header=d=>{const at=d.search(/\bAS\s+\$/);assert.ok(at>0,'MONETARY_QA_FUNCTION_HEADER_REQUIRED');return d.slice(0,at).replace(/SET search_path TO 'pg_catalog',\s*'public',\s*'pg_temp'/g,'SET search_path=pg_catalog,public,pg_temp').replace(/SET (?:(?:"TimeZone"|timezone) TO|timezone=)\s*'UTC'/g,"SET timezone='UTC'").replace(/\s+/g,' ').trim()+' '+d.slice(at);};
const publicPin=d=>({...ownInstallationFunctionPin(header(d)),runtime:false});
const pinKey=p=>p.signature+'\u0000'+p.sha256;
const replaceHashes=(s,map)=>s.replace(/\b[a-f0-9]{64}\b/g,value=>Object.hasOwn(map,value)?map[value]:value);
const same=(a,b)=>{try{assert.deepEqual(a,b);return true;}catch{return false;}};

const OPTION_KEYS=Object.freeze(['foundation','major','noveltySuccession','operationalPairBaseline','read','schema','sourceCommit']);
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
function dataRecord(value,label){
 assert.ok(record(value),'MONETARY_QA_'+label+'_RECORD_REQUIRED');
 for(const key of Reflect.ownKeys(value)){
  assert.equal(typeof key,'string','MONETARY_QA_'+label+'_STRING_KEYS_REQUIRED');
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  assert.ok(Object.hasOwn(descriptor,'value')&&descriptor.enumerable,'MONETARY_QA_'+label+'_DATA_FIELDS_REQUIRED');
 }
 return value;
}
function checkedOptions(options){
 dataRecord(options,'OPTIONS');assert.deepEqual(Reflect.ownKeys(options).sort(),OPTION_KEYS,'MONETARY_QA_EXPLICIT_FOUNDATION_MODE_REQUIRED');
 // Snapshot scalar options and references before the first supplied reader call.
 const input=Object.fromEntries(OPTION_KEYS.map(key=>[key,Object.getOwnPropertyDescriptor(options,key).value]));
 assert.ok([17,18].includes(input.major));assert.equal(typeof input.read,'function');assert.equal(typeof input.noveltySuccession,'boolean');
 assert.match(input.sourceCommit,/^[a-f0-9]{40}$/);assert.match(input.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 assert.ok(['pre107','published107'].includes(input.operationalPairBaseline));
 // null explicitly selects the former standalone path. Missing/undefined never
 // silently means permission to replace an existing host foundation.
 assert.ok(input.foundation===null||record(input.foundation),'MONETARY_QA_FOUNDATION_SELECTION_REQUIRED');
 return input;
}
function foundationState(foundation,input){
 dataRecord(foundation,'FOUNDATION');
 for(const key of['major','schema','sourceCommit','operationalPairBaseline'])assert.equal(foundation[key],input[key],'MONETARY_QA_FOUNDATION_CONTEXT_CHANGED:'+key);
 assert.equal(foundation.connects,false);assert.equal(foundation.executesSql,false);
 assert.equal(typeof foundation.normalized,'function','MONETARY_QA_FOUNDATION_NORMALIZER_REQUIRED');
 for(const key of['actor','checker','ids','sourceHashes','local'])dataRecord(foundation[key],'FOUNDATION_'+key.toUpperCase());
 assert.ok(foundation.actor.membershipId&&foundation.checker.membershipId);
 assert.notStrictEqual(foundation.actor,foundation.checker,'MONETARY_QA_FOUNDATION_INDEPENDENT_ACTORS_REQUIRED');
 assert.notEqual(foundation.actor.membershipId,foundation.checker.membershipId,'MONETARY_QA_FOUNDATION_INDEPENDENT_ACTORS_REQUIRED');
 assert.equal(typeof foundation.seed,'string','MONETARY_QA_FOUNDATION_SEED_REQUIRED');assert.ok(foundation.seed.length>0);
 assert.ok(Array.isArray(foundation.predecessorInstallation)&&foundation.predecessorInstallation.every(value=>typeof value==='string'),'MONETARY_QA_FOUNDATION_PREDECESSORS_REQUIRED');
 assert.deepEqual(Reflect.ownKeys(foundation.local).sort(),[...PHASES].sort(),'MONETARY_QA_FOUNDATION_PHASES_REQUIRED');
 const local=Object.fromEntries(PHASES.map(phase=>{const statements=foundation.local[phase];assert.ok(Array.isArray(statements)&&statements.every(value=>typeof value==='string'),'MONETARY_QA_FOUNDATION_PHASE_REQUIRED:'+phase);return[phase,{reference:statements,statements:[...statements]}];}));
 const sourceHashes=Object.entries(foundation.sourceHashes);assert.ok(sourceHashes.length>0&&sourceHashes.every(([path,digest])=>path.length>0&&typeof digest==='string'&&/^[a-f0-9]{64}$/.test(digest)),'MONETARY_QA_FOUNDATION_SOURCE_HASHES_REQUIRED');
 return{reference:foundation,descriptors:Object.getOwnPropertyDescriptors(foundation),actor:foundation.actor,checker:foundation.checker,actorDescriptors:Object.getOwnPropertyDescriptors(foundation.actor),checkerDescriptors:Object.getOwnPropertyDescriptors(foundation.checker),idsDescriptors:Object.getOwnPropertyDescriptors(foundation.ids),sourceHashDescriptors:Object.getOwnPropertyDescriptors(foundation.sourceHashes),localDescriptors:Object.getOwnPropertyDescriptors(foundation.local),sourceHashes,predecessors:[...foundation.predecessorInstallation],local};
}
function assertFoundationState(state,input,fixed,qa){
 const foundation=state.reference;
 // Identity, not equality of independently constructed SQL text or actors.
 assert.strictEqual(fixed.qa192.qa,foundation,'MONETARY_QA_FOUNDATION_REBUILT');assert.strictEqual(qa.qa192.qa,foundation,'MONETARY_QA_FOUNDATION_REBUILT');
 assert.deepEqual(Object.getOwnPropertyDescriptors(foundation),state.descriptors,'MONETARY_QA_FOUNDATION_MUTATED');
 for(const[key,descriptors]of[['actor',state.actorDescriptors],['checker',state.checkerDescriptors],['ids',state.idsDescriptors],['sourceHashes',state.sourceHashDescriptors],['local',state.localDescriptors]])assert.deepEqual(Object.getOwnPropertyDescriptors(foundation[key]),descriptors,'MONETARY_QA_FOUNDATION_FIELDS_MUTATED:'+key);
 assert.deepEqual(foundation.predecessorInstallation,state.predecessors,'MONETARY_QA_FOUNDATION_PREDECESSORS_MUTATED');
 for(const phase of PHASES){assert.strictEqual(foundation.local[phase],state.local[phase].reference,'MONETARY_QA_FOUNDATION_PHASE_REPLACED:'+phase);assert.deepEqual(foundation.local[phase],state.local[phase].statements,'MONETARY_QA_FOUNDATION_PHASE_MUTATED:'+phase);}
 for(const selected of[fixed,qa]){
  for(const key of['major','schema','sourceCommit','operationalPairBaseline'])assert.equal(selected[key],input[key],'MONETARY_QA_SELECTED_CONTEXT_CHANGED:'+key);
  assert.strictEqual(selected.actor,state.actor,'MONETARY_QA_ACTOR_REBUILT');assert.strictEqual(selected.checker,state.checker,'MONETARY_QA_CHECKER_REBUILT');
  assert.strictEqual(selected.qa192.actor,state.actor,'MONETARY_QA_192_ACTOR_REBUILT');assert.strictEqual(selected.qa192.checker,state.checker,'MONETARY_QA_192_CHECKER_REBUILT');
  assert.equal(selected.declarationFixtureActorsInstalled,false,'MONETARY_QA_DOCUMENTARY_ACTORS_INSTALLED');
 }
}

// This recognizes only source-generated single-line JSON metadata literals, at
// any SQL quote depth. It does not parse SQL, evaluate a function, or read DB.
const metadataPattern=()=>/jsonb_array_elements\(('+)(\[[^\r\n]*?\])\1::jsonb\)/g;
function metadataRows(text,visit){
 return text.replace(metadataPattern(),(whole,quotes,literal)=>{
  const depth=quotes.length;assert.equal((depth&(depth-1)),0,'MONETARY_QA_QUOTE_DEPTH_REQUIRED');
  // One apostrophe inside a SQL string requires two delimiter-depth runs:
  // delimiter ' => content '', delimiter '' => content '''', etc.
  let rows;try{rows=JSON.parse(literal.replaceAll(quotes.repeat(2),"'"));}catch{return whole;}
  if(!Array.isArray(rows))return whole;
  return visit({whole,quotes,rows});
 });
}
const metadataLiteral=(rows,quotes)=>'jsonb_array_elements('+quotes+JSON.stringify(rows).replaceAll("'",quotes.repeat(2))+quotes+'::jsonb)';

function mergeHashes(...maps){
 const merged={};for(const map of maps)for(const[k,v]of Object.entries(map??{})){
  if(Object.hasOwn(merged,k))assert.equal(merged[k],v,'MONETARY_QA_SOURCE_BOOKEND_CONFLICT:'+k);
  merged[k]=v;
 }return merged;
}

// Both previous bodies and every final body belong to the projection domain.
// No observed pg_proc value is accepted by this API as an expectation.
function projection({qa,batch}){
 const schema=qa.schema;assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 assert.deepEqual(batch.originals.map(d=>publicPin(d).name),TARGETS);
 assert.deepEqual(batch.adapted.map(d=>publicPin(d).name),TARGETS);
 assert.deepEqual(batch.newDefinitions.map(d=>publicPin(d).name),HELPERS);
 const entries=[...batch.originals.map((d,n)=>({epoch:'before',definition:d,pin:batch.beforePins[n]})),...batch.adapted.map((d,n)=>({epoch:'after',definition:d,pin:batch.afterPins[n]})),...batch.newDefinitions.map((d,n)=>({epoch:'new',definition:d,pin:batch.newPins[n]}))];
 assert.equal(entries.length,11);
 const byPin=new Map();
 for(const entry of entries){
  assert.deepEqual(publicPin(entry.definition),entry.pin,'MONETARY_QA_SOURCE_PIN_CHANGED');
  assert.equal(entry.pin.runtime,false,'MONETARY_QA_PRIVATE_FUNCTION_REQUIRED');
  const key=pinKey(entry.pin);if(byPin.has(key))assert.deepEqual(byPin.get(key).pin,entry.pin,'MONETARY_QA_AMBIGUOUS_SOURCE_PIN');
  byPin.set(key,entry);
 }
 const sourceSignatures=new Set(entries.map(e=>e.pin.signature));
 const base=s=>qa.normalized(monthlyFixedQaHeader(s));
 const rawLocal=(d,map)=>replaceHashes(base(d),map);
 const localPin=(entry,map)=>{
  const local=rawLocal(entry.definition,map),at=local.search(/\bAS\s+\$/),needle='FUNCTION '+schema+'.';
  assert.ok(at>0);assert.ok(local.slice(0,at).includes(needle),'MONETARY_QA_FUNCTION_NAMESPACE_CHANGED');
  // Change only the declaration prefix for the source metadata parser.
  const parsed=ownInstallationFunctionPin(header(local.slice(0,at).replace(needle,'FUNCTION public.')+local.slice(at)));
  const pin={...parsed,signature:parsed.signature.replace(/^public\./,schema+'.'),runtime:false};
  assert.equal(pin.name,entry.pin.name);assert.equal(pin.sha256,hash(body(local)));
  assert.deepEqual({...pin,signature:entry.pin.signature,sha256:null,config:entry.pin.config},{...entry.pin,sha256:null},'MONETARY_QA_HEADER_SEMANTICS_CHANGED');
  const expectedConfig=entry.pin.config.map(v=>v==='search_path=pg_catalog, public, pg_temp'?'search_path=pg_catalog, '+schema+', public, pg_temp':v);
  assert.deepEqual(pin.config,expectedConfig,'MONETARY_QA_COMPLETE_CONFIG_CHANGED');
  return pin;
 };
 function project(text,map){
  const protectedRows=[],metadataLedger=[];
  // Shield full arrays so canonical relocation is applied exactly once to each
  // source row. Known rows must equal their complete source pin, not just sha.
  const protectedText=metadataRows(text,({whole,quotes,rows})=>{
   let containsTarget=false;
   const projectedRows=rows.map(row=>{
    if(!sourceSignatures.has(row?.signature))return JSON.parse(replaceHashes(base(JSON.stringify(row)),map));
    const entry=byPin.get(pinKey(row));assert.ok(entry,'MONETARY_QA_FOREIGN_SOURCE_METADATA:'+row.signature);
    assert.deepEqual(row,entry.pin,'MONETARY_QA_COMPLETE_SOURCE_METADATA_CHANGED');containsTarget=true;
    return localPin(entry,map);
   });
   if(!containsTarget)return whole;
   const token='__monetary_qa_metadata_'+protectedRows.length+'_'+hash(whole)+'__';
   assert.equal(text.includes(token),false,'MONETARY_QA_METADATA_TOKEN_COLLISION');
   const projectedLiteral=metadataLiteral(projectedRows,quotes);
   const sourceRoundTrip=metadataLiteral(rows,quotes);
   assert.equal(sourceRoundTrip,whole,'MONETARY_QA_NONCANONICAL_METADATA_LITERAL');
   protectedRows.push({token,projectedLiteral});metadataLedger.push({sourceLiteral:whole,projectedLiteral,quoteDepth:quotes.length});
   return token;
  });
  let value=replaceHashes(base(protectedText),map);
  for(const {token,projectedLiteral}of protectedRows){assert.equal(value.split(token).length,2,'MONETARY_QA_METADATA_TOKEN_CHANGED');value=value.replace(token,()=>projectedLiteral);}
  // The custom full-row component is exactly reversible. This does not claim
  // an inverse for the pre-existing canonical namespace/header normalizer.
  const reverse=new Map();for(const record of metadataLedger){
   if(reverse.has(record.projectedLiteral))assert.equal(reverse.get(record.projectedLiteral),record.sourceLiteral,'MONETARY_QA_AMBIGUOUS_METADATA_INVERSE');
   reverse.set(record.projectedLiteral,record.sourceLiteral);
  }
  const metadataOnly=metadataRows(text,({whole})=>metadataLedger.find(r=>r.sourceLiteral===whole)?.projectedLiteral??whole);
  const inverse=metadataRows(metadataOnly,({whole})=>reverse.get(whole)??whole);
  assert.equal(inverse,text,'MONETARY_QA_METADATA_INVERSE_CHANGED');
  return{value,metadataLedger};
 }
 let hashes={},stable=false;
 for(let pass=0;pass<32;pass++){
  const next={...hashes},assigned=new Map();let changed=false;
  for(const entry of entries){
   const raw=entry.pin.sha256,projected=hash(body(project(entry.definition,hashes).value));
   if(assigned.has(raw))assert.equal(assigned.get(raw),projected,'MONETARY_QA_AMBIGUOUS_BODY_PROJECTION');
   assigned.set(raw,projected);if(next[raw]!==projected){next[raw]=projected;changed=true;}
  }
  hashes=next;if(!changed){stable=true;break;}
 }
 assert.ok(stable,'MONETARY_QA_HASH_GRAPH_CYCLE');
 const ancestorMaps=[qa.hashes,qa.fixedHashes,qa.novelty197Hashes,qa.qa?.hashes,qa.qa193?.hashes,qa.qa193?.foundation?.hashes,qa.qa193?.foundation?.base?.hashes];
 for(const ancestor of ancestorMaps)for(const[k,v]of Object.entries(ancestor??{}))if(Object.hasOwn(hashes,k))assert.equal(hashes[k],v,'MONETARY_QA_ANCESTOR_HASH_ALIAS');
 const ledger=entries.map(entry=>{
  const qaPin=localPin(entry,hashes),local=project(entry.definition,hashes).value;
  assert.equal(qaPin.sha256,hashes[entry.pin.sha256],'MONETARY_QA_LOCAL_PIN_GRAPH_CHANGED');
  assert.equal(qaPin.sha256,hash(body(local)),'MONETARY_QA_PROJECTED_BODY_CHANGED');
  return{epoch:entry.epoch,sourcePin:entry.pin,expectedQaPin:qaPin,sourceDefinitionSha256:hash(entry.definition),projectedDefinitionSha256:hash(local),sourceProsrcSha256:entry.pin.sha256,projectedProsrcSha256:qaPin.sha256};
 });
 return{normalized:s=>project(s,hashes).value,project:s=>project(s,hashes),hashes,ledger};
}

export function buildOwnMonetaryProgramQaProjection(options){
 const input=checkedOptions(options),suppliedFoundation=input.foundation===null?null:foundationState(input.foundation,input);
 const cache=new Map(),sourceHashes={},read=path=>{if(!cache.has(path)){const value=input.read(path);assert.equal(typeof value,'string');const text=lf(value);cache.set(path,text);sourceHashes[path]=hash(text);}return cache.get(path);};
 for(const[path,expected]of Object.entries(SOURCES))assert.equal(hash(read(path)),expected,'MONETARY_QA_SOURCE_CHANGED:'+path);
 for(const selected of Object.values(OWN_MONETARY_INSTALLATION_SOURCES))assert.equal(hash(read(selected.path)),selected.sha256,'MONETARY_QA_SELECTED_SOURCE_CHANGED:'+selected.path);
 if(suppliedFoundation)for(const[path,expected]of suppliedFoundation.sourceHashes)assert.equal(hash(read(path)),expected,'MONETARY_QA_FOUNDATION_SOURCE_CHANGED:'+path);
 const fixed=buildMonthlyDayFixedCompositionQa({major:input.major,sourceCommit:input.sourceCommit,read,operationalPairBaseline:input.operationalPairBaseline,schema:input.schema,...(suppliedFoundation?{foundation:input.foundation}:{})});
 const selectedFoundation=suppliedFoundation??foundationState(fixed.qa192.qa,input);
 const qa=input.noveltySuccession?buildOwnNoveltySuccessionQa({qa:fixed,read,sourceCommit:input.sourceCommit}):fixed;
 assertFoundationState(selectedFoundation,input,fixed,qa);
 assert.equal(qa.schema,input.schema);assert.equal(qa.sourceCommit,input.sourceCommit);assert.equal(qa.operationalPairBaseline,input.operationalPairBaseline);
 assert.equal(qa.run7Included,false);assert.ok(qa.actor?.membershipId&&qa.checker?.membershipId);assert.notEqual(qa.actor.membershipId,qa.checker.membershipId,'MONETARY_QA_INDEPENDENT_ACTORS_REQUIRED');
 const batch=buildOwnMonetaryGuardedInstallation({read,sourceCommit:input.sourceCommit,operationalPairBaseline:input.operationalPairBaseline,noveltySuccession:input.noveltySuccession,prerequisiteDefinitions:qa.qa193.foundation.base.definitions,prerequisiteRuntime:qa.batch.declaration.prerequisitePins.filter(p=>p.runtime).map(p=>p.signature)});
 assert.equal(batch.version,INSTALL_VERSION);assert.equal(batch.run7Included,false);assert.equal(batch.executionAdmitted,false);assert.equal(batch.complete,false);
 assert.deepEqual(batch.fixed.afterPins,qa.fixedComposition.afterPins,'MONETARY_QA_FIXED_PREDECESSOR_CHANGED');
 assert.deepEqual(batch.fixed.preservedCapturePin,qa.fixedComposition.preservedCapturePin,'MONETARY_QA_CAPTURE_PREDECESSOR_CHANGED');
 if(input.noveltySuccession)assert.deepEqual(batch.previous.afterPins,qa.novelty197.afterPins,'MONETARY_QA_NOVELTY_PREDECESSOR_CHANGED');
 else assert.deepEqual(batch.previous.afterPins,qa.fixedComposition.afterPins,'MONETARY_QA_SELECTED_PREDECESSOR_CHANGED');
 const projected=projection({qa,batch}),phaseLedger={},localMonetary={};
 for(const phase of PHASES){
  assert.ok(Array.isArray(batch[phase])&&batch[phase].every(s=>typeof s==='string'));
  const parts=batch[phase].map(s=>projected.project(s));localMonetary[phase]=parts.map(p=>p.value);
  phaseLedger[phase]=parts.flatMap((part,index)=>part.metadataLedger.map(row=>({statement:index,...row})));
  const localText=localMonetary[phase].join('\n');
  assert.equal(localMonetary[phase].length,batch[phase].length,'MONETARY_QA_PHASE_STATEMENT_COUNT_CHANGED');
  assert.deepEqual([...localText.matchAll(/pg_advisory_xact_lock\((\d+)\)/g)].map(m=>Number(m[1])),[...batch[phase].join('\n').matchAll(/pg_advisory_xact_lock\((\d+)\)/g)].map(m=>Number(m[1])),'MONETARY_QA_LOCK_ORDER_CHANGED');
  assert.equal(localText.includes(qa.schema+'.digest('),false,'MONETARY_QA_DIGEST_EXTENSION_RELOCATED');
  assert.equal(/to_regprocedure\('+(?:public\.)/.test(localText),false,'MONETARY_QA_FOREIGN_PROCEDURE_REMAINED');
  assert.equal(/('+)public\1::regnamespace/.test(localText),false,'MONETARY_QA_FOREIGN_NAMESPACE_REMAINED');
  assert.equal(localText.includes("left(proname,22)='own_monetary_manifest_'"),batch[phase].join('\n').includes("left(proname,22)='own_monetary_manifest_'"),'MONETARY_QA_HELPER_FAMILY_GUARD_CHANGED');
  const expected=projected.ledger.filter(row=>phase==='rollbackVerification'?row.epoch==='before':phase==='verification'?row.epoch!=='before':true);
  for(const row of expected){let found=0;metadataRows(localText,({whole,rows})=>{found+=rows.filter(pin=>same(pin,row.expectedQaPin)).length;return whole;});assert.ok(found>0,'MONETARY_QA_PHASE_EXPECTED_FULL_PIN_MISSING:'+phase+':'+row.epoch+':'+row.sourcePin.signature);}
 }
 const projectedMutations=batch.mutations.map(projected.normalized);
 const acl=projectedMutations.filter(s=>s.startsWith('REVOKE ALL ON FUNCTION ')).map(s=>s.replace(/;\s*$/,'').trim());
 const newPins=projected.ledger.filter(r=>r.epoch==='new').map(r=>r.expectedQaPin),afterPins=projected.ledger.filter(r=>r.epoch==='after').map(r=>r.expectedQaPin),beforePins=projected.ledger.filter(r=>r.epoch==='before').map(r=>r.expectedQaPin);
 assert.deepEqual(acl,['REVOKE ALL ON FUNCTION '+newPins.map(p=>p.signature).join(',')+' FROM PUBLIC,municontrol_actions_runtime_app','REVOKE ALL ON FUNCTION '+afterPins[0].signature+' FROM PUBLIC,municontrol_actions_runtime_app'],'MONETARY_QA_ACL_CHANGED');
 assert.equal(projectedMutations.length,11);assert.ok([...beforePins,...afterPins,...newPins].every(p=>p.runtime===false));
 const metadataFamilies=['dependencies','sharedDependencies','descriptions','securityLabels','rewrites','extensions'];
 for(const name of metadataFamilies)for(const slot of['before','after'])assert.ok(projected.normalized(batch[slot]).includes("'"+name+"'"),'MONETARY_QA_SNAPSHOT_FAMILY_MISSING:'+name);
 for(const slot of['before','after']){const snapshot=projected.normalized(batch[slot]);assert.ok(snapshot.includes('d.dbid=(SELECT oid FROM pg_database WHERE datname=current_database())'));assert.equal(/d\.refobjid IN\(/.test(snapshot),false,'MONETARY_QA_INCOMING_DEPENDENCY_EXCLUSION');}
 // Existing local/localFixed/local197 arrays, fixtures, actors, capabilities
 // and normalizers are retained verbatim through the spread below. Never feed
 // already localized arrays through the new normalizer a second time.
 assertFoundationState(selectedFoundation,input,fixed,qa);
 return{...qa,version:VERSION,monetaryFoundationMode:suppliedFoundation?'existing':'standalone',monetaryFoundationIdentityPreserved:true,monetaryInstallation:batch,localMonetary,monetaryNormalized:projected.normalized,monetaryProjectionHashes:projected.hashes,monetaryProjectionLedger:projected.ledger,monetaryMetadataProjectionLedger:phaseLedger,expectedQaMonetaryBeforePins:beforePins,expectedQaMonetaryAfterPins:afterPins,expectedQaMonetaryNewPins:newPins,sourceHashes:mergeHashes(qa.sourceHashes,batch.sourceHashes,sourceHashes),projectionSourceDerived:true,observedMetadataUsed:false,canonicalPhaseArraysPreserved:true,capabilitiesAdded:false,permissionsAdded:false,run7Included:false,projectionSourceImplemented:true,projectionConstructionIsNotSqlEvidence:true,executionAdmitted:false,sourcePromotionAdmitted:false,connects:false,executesSql:false,complete:false};
}
