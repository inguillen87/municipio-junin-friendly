// Source-only successor of197. No connection, fixture, grant or business RPC.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {SALARY_ADMINISTRATIVE_CONTEXT} from './salary-administrative-identity-installation.mjs';
import {buildOwnNoveltySuccessionInstallation,ownNoveltySuccessionHeader} from './own-novelty-succession-installation.mjs';
import {ownNoveltySuccessionFunctionPin} from './own-novelty-succession-metadata.mjs';
import {splitPostgresStatements} from './sql-statements.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
import {performancePreservationSnapshot} from '../verify-documentary-roster-performance.mjs';
import {installationPriorMetadataFingerprint} from './installation-prior-metadata.mjs';
import {buildOwnMonetaryGuardedInstallation} from './own-monetary-program-guarded-installation.mjs';
import {deriveOwnLiquidationBootstrap213,OWN_LIQUIDATION_BOOTSTRAP213_SOURCE_PINS} from './own-liquidation-bootstrap213-installation.mjs';
import {NOVELTY217_SOURCE_PINS,NOVELTY217_HELPER_OPERATORS,NOVELTY217_CONTEXT_OPERATORS,NOVELTY217_EXPECTED} from './novelty-administrative217-source-contract.mjs';

export const NOVELTY217_VERSION='novelty-administrative217-installation.v1';
export const NOVELTY217_REHEARSAL_ERROR='NOVELTY217_LATE_REHEARSAL_ROLLBACK_REQUIRED';
const prefix='municontrol_novelty217.',q=v=>"'"+String(v).replaceAll("'","''")+"'",hash=v=>createHash('sha256').update(v).digest('hex');
const body=s=>{const m=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?\s*$/.exec(s);assert.ok(m,'NOVELTY217_BODY_REQUIRED');return m[2];};
const pin=d=>({...ownNoveltySuccessionFunctionPin(ownNoveltySuccessionHeader(d)),runtime:false});
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'NOVELTY217_SOURCE_ANCHOR:'+a.slice(0,60));return s.replace(a,()=>b);};
const minted=new WeakSet(),internals=new WeakMap(),successors=new WeakSet();
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;};
const clean=s=>s.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim();
function apply(s,ops){for(const {before,after,count}of ops){assert.equal(s.split(before).length,count+1,'NOVELTY217_FINITE_OPERATOR');s=s.replaceAll(before,()=>after);}return s;}
function inverse(s,ops){return apply(s,[...ops].reverse().map(({before,after,count})=>({before:after,after:before,count})));}
const metadataObject=/\{"name":"(?:[^"\\]|\\.)*","signature":"(?:[^"\\]|\\.)*","sha256":"[a-f0-9]{64}"[^{}]*\}/g;
const escaped=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

// Restrict replacement to complete scalar pin objects or exact SQL pin tuples.
// No unconstrained digest substitution; both complete directions are checked.
export function projectText(source,beforePins,afterPins,{family=false,requireTargets=true}={}){
 assert.equal(typeof source,'string');assert.equal(beforePins.length,afterPins.length);
 const change=(text,from,to)=>{
  const counts=Object.fromEntries(from.map(p=>[p.signature,0]));
  text=text.replace(metadataObject,literal=>{const row=JSON.parse(literal),n=from.findIndex(p=>p.signature===row.signature);if(n<0)return literal;assert.deepEqual(row,from[n],'NOVELTY217_MIXED_METADATA');counts[row.signature]++;return JSON.stringify(to[n]);});
  for(let n=0;n<from.length;n++){
   const a=from[n],b=to[n],pattern=new RegExp("('+)("+escaped(a.signature)+")\\1,\\1(?:"+a.sha256+")\\1",'g');
   text=text.replace(pattern,(_,quotes,signature)=>{counts[a.signature]++;return quotes+signature+quotes+','+quotes+b.sha256+quotes;});
  }
  return{value:text,counts};
 };
 const forward=change(source,beforePins,afterPins);
 if(requireTargets)for(const p of beforePins)assert.ok(forward.counts[p.signature]>0,'NOVELTY217_PROJECTION_TARGET_ABSENT:'+p.signature);
 let value=forward.value,familyCount=0;
 if(family)value=value.replace(/(proname LIKE ('+)own_novelty_%\2\)<>)24( THEN)/g,(_,a,quote,b)=>{familyCount++;return a+'25'+b;});
 if(family)assert.ok(familyCount>0,'NOVELTY217_FAMILY24_GUARD_ABSENT');
 const reversedFamily=family?value.replace(/(proname LIKE ('+)own_novelty_%\2\)<>)25( THEN)/g,(_,a,quote,b)=>a+'24'+b):value;
 assert.equal(change(reversedFamily,afterPins,beforePins).value,source,'NOVELTY217_COMPLETE_PROJECTION_INVERSE');
 return{value,counts:forward.counts,familyCount,wholeInverse:true,sourceSha256:hash(source),afterSha256:hash(value)};
}

function snapshot(slot,existing,helper){
 let s=performancePreservationSnapshot();
 const namespace="FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname NOT LIKE 'pg_%' AND s.nspname<>'information_schema'";
 s=once(s,namespace,namespace+" AND p.oid IS DISTINCT FROM to_regprocedure("+q(helper.signature)+")");
 s=once(s,'public.digest(to_jsonb(p)::text,\'sha256\')',"public.digest((CASE WHEN p.oid IN("+existing.map(p=>'to_regprocedure('+q(p.signature)+')').join(',')+") THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text,'sha256')");
 const owns=a=>a+".classid='pg_proc'::regclass AND "+a+'.objid=to_regprocedure('+q(helper.signature)+')';
 const extras=`,
 'dependencies',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.classid,d.objid,d.objsubid,d.refclassid,d.refobjid,d.refobjsubid,d.deptype) FROM pg_depend d WHERE NOT coalesce((${owns('d')}),false)),
 'sharedDependencies',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.dbid,d.classid,d.objid,d.objsubid,d.refclassid,d.refobjid,d.deptype) FROM pg_shdepend d WHERE NOT coalesce((${owns('d')}) AND d.dbid=(SELECT oid FROM pg_database WHERE datname=current_database()),false)),
 'descriptions',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.classoid,d.objoid,d.objsubid) FROM pg_description d WHERE NOT coalesce(d.classoid='pg_proc'::regclass AND d.objoid=to_regprocedure(${q(helper.signature)}),false)),
 'securityLabels',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.classoid,d.objoid,d.objsubid,d.provider) FROM pg_seclabel d WHERE NOT coalesce(d.classoid='pg_proc'::regclass AND d.objoid=to_regprocedure(${q(helper.signature)}),false)),
 'rewrites',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid) FROM pg_rewrite d),
 'extensions',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid) FROM pg_extension d)`;
 s=once(s,') INTO result;',extras+') INTO result;');
 return once(s,'municontrol_documentary_install.after',prefix+slot);
}


function capacity201Lineage(source){
 const array=tag=>{const at=source.indexOf('DO $'+tag+'$'),end=source.indexOf('END $'+tag+'$;',at);assert.ok(at>=0&&end>at);const m=/jsonb_array_elements\('((?:[^']|'')*)'::jsonb\)/.exec(source.slice(at,end));assert.ok(m);return JSON.parse(m[1].replaceAll("''","'"));};
 const pre=array('capacity_preflight'),post=array('capacity_postflight');assert.equal(pre.length,11);assert.equal(post.length,27);
 const a=pre.find(p=>p.name==='own_close_detail_v1'),b=post.find(p=>p.name==='own_close_detail_v1');assert.ok(a&&b);assert.equal(a.bodySha256,'cf59ba377c978346872f88d3dfd144fac13d7c0615ec0ed289839451513b540f');assert.equal(b.bodySha256,'522b68c7be31974fe4adf060b65deaf77a0ca6a8d33bc5df315131cb9e1061d0');
 const defs=splitPostgresStatements(source).map(clean).filter(s=>s.startsWith('CREATE OR REPLACE FUNCTION public.own_close_detail_v1('));assert.equal(defs.length,1);const afterDefinition=defs[0],afterPin={...pin(afterDefinition),runtime:true},beforePin={...afterPin,sha256:a.bodySha256};assert.equal(afterPin.sha256,b.bodySha256);
 for(const [record,p]of [[a,beforePin],[b,afterPin]]){assert.equal(record.signature,p.signature);assert.deepEqual(record.argNames,p.argNames);assert.deepEqual(record.config,p.config);assert.equal(record.volatility,p.volatility);assert.equal(record.runtime,p.runtime);}
 return{source:'scripts/migrations/201-own-full-payroll-decision-capacity.sql',sourceSha256:hash(source),beforePin,afterPin,afterDefinition,predecessors:11,postdecessors:27,sourceOnly:true,observedMetadataUsed:false};
}

export function buildNoveltyAdministrative217Installation(options){
 const technicalPredecessorEpoch=Object.hasOwn(options??{},'technicalPredecessorEpoch')?options.technicalPredecessorEpoch:'post197';assert.ok(['post197','post199-post213'].includes(technicalPredecessorEpoch),'NOVELTY217_TECHNICAL_SOURCE_EPOCH_REQUIRED');
 const capacity201Epoch=Object.hasOwn(options??{},'capacity201Epoch')?options.capacity201Epoch:'pre201';assert.ok(['pre201','post201'].includes(capacity201Epoch),'NOVELTY217_CAPACITY_SOURCE_EPOCH_REQUIRED');const previousOptions={...options};delete previousOptions.capacity201Epoch;delete previousOptions.technicalPredecessorEpoch;assert.deepEqual(Object.keys(previousOptions).sort(),['operationalPairBaseline','prerequisiteDefinitions','prerequisiteRuntime','read','sourceCommit']);
 assert.equal(typeof options.read,'function');assert.match(options.sourceCommit,/^[a-f0-9]{40}$/);
 const sourceHashes={},cache=new Map(),read=file=>{if(!cache.has(file)){const s=options.read(file).replace(/\r\n?/g,'\n');cache.set(file,s);sourceHashes[file]=hash(s);}return cache.get(file);};
 for(const[file,p]of Object.entries(NOVELTY217_SOURCE_PINS)){const s=read(file);assert.equal(Buffer.byteLength(s),p.bytes,'NOVELTY217_SOURCE_BYTES:'+file);assert.equal(hash(s),p.sha256,'NOVELTY217_SOURCE_CHANGED:'+file);}
 const predecessor=buildOwnNoveltySuccessionInstallation({...previousOptions,read});
 const salary=read('scripts/lib/salary-administrative-identity-installation.mjs').match(/export const SALARY_ADMINISTRATIVE_CONTEXT=`([\s\S]*?)`;/g);
 assert.equal(salary?.length,1,'NOVELTY217_LITERAL_SOURCE_REQUIRED');assert.ok(salary[0].includes(SALARY_ADMINISTRATIVE_CONTEXT));
 const helper=apply(SALARY_ADMINISTRATIVE_CONTEXT,NOVELTY217_HELPER_OPERATORS);assert.equal(inverse(helper,NOVELTY217_HELPER_OPERATORS),SALARY_ADMINISTRATIVE_CONTEXT);
 assert.equal(hash(helper),NOVELTY217_EXPECTED.helperDefinitionSha256);assert.equal(hash(body(helper)),NOVELTY217_EXPECTED.helperBodySha256);
 const originals=splitPostgresStatements(read('scripts/migrations/130-own-bulk-novelties.sql')).map(clean).filter(s=>s.startsWith('CREATE FUNCTION public.own_novelty_context_v1('));assert.equal(originals.length,1);
 const priorContext=originals[0],context=apply(priorContext,NOVELTY217_CONTEXT_OPERATORS);assert.equal(inverse(context,NOVELTY217_CONTEXT_OPERATORS),priorContext);
 assert.equal(hash(priorContext),NOVELTY217_EXPECTED.contextBeforeDefinitionSha256);assert.equal(hash(context),NOVELTY217_EXPECTED.contextAfterDefinitionSha256);
 assert.equal(hash(body(priorContext)),NOVELTY217_EXPECTED.contextBeforeBodySha256);assert.equal(hash(body(context)),NOVELTY217_EXPECTED.contextAfterBodySha256);
 const contextBeforePin=pin(priorContext),contextAfterPin=pin(context),helperPin=pin(helper);
 assert.deepEqual(contextBeforePin,predecessor.supportPins.find(p=>p.name==='own_novelty_context_v1'),'NOVELTY217_EXACT197_CONTEXT_REQUIRED');
 assert.deepEqual({...contextBeforePin,sha256:null},{...contextAfterPin,sha256:null});
 const capacityLineage=capacity201Lineage(read('scripts/migrations/201-own-full-payroll-decision-capacity.sql'));
 const priorReadiness=predecessor.ready;assert.equal(priorReadiness.includes('own_close_detail_v1'),false,'NOVELTY217_STORED_READINESS_HAS_NEW201_EDGE');
 const readyProjection=projectText(priorReadiness,[contextBeforePin],[contextAfterPin],{family:true});
 const helperCheck=pinsCheck([helperPin],'NOVELTY217_READINESS_HELPER_CHANGED');
 const tail=priorReadiness.endsWith(';')?' END $operator$;':' END $operator$';assert.ok(readyProjection.value.endsWith(tail));
 const insertion='\nEXECUTE '+q(helperCheck)+';\n',readiness=readyProjection.value.slice(0,-tail.length)+insertion+tail;
 assert.equal(readiness.slice(0,-tail.length-insertion.length)+tail,readyProjection.value,'NOVELTY217_READINESS_INSERTION_INVERSE');
 const pre201Ready={definition:readiness},post201Ready=pre201Ready;
 const readinessBeforePin=pin(priorReadiness),readinessAfterPin=pin(readiness);assert.deepEqual(readinessBeforePin,predecessor.readinessPin);assert.deepEqual({...readinessBeforePin,sha256:null},{...readinessAfterPin,sha256:null});
 const beforePins=[contextBeforePin,readinessBeforePin],afterPins=[contextAfterPin,readinessAfterPin];
 // The public217 stage is post197. The existing same190 runner installs217
 // after the final monetary reinstallation and forward213, without reordering
 // either epoch. Derive its complete predecessor guard from those sources.
 let technicalPredecessor=null,technicalBeforeCheck=predecessor.afterCheck;
 if(technicalPredecessorEpoch==='post199-post213'){
  assert.equal(hash(read('scripts/lib/own-monetary-program-guarded-installation.mjs')),'0c55c03740a792e86061dbd8bcc05fb80969d46a5d2ca58969d5789532ecd243','NOVELTY217_MONETARY_BUILDER_SOURCE_CHANGED');
  assert.equal(hash(read('scripts/lib/own-liquidation-bootstrap213-installation.mjs')),'a4fbd75427be61efa24eaa1b78f10897d8706ad1619850cc7e9b496c4e45c9f5','NOVELTY217_BOOTSTRAP_BUILDER_SOURCE_CHANGED');
  const monetary=buildOwnMonetaryGuardedInstallation({...previousOptions,read,noveltySuccession:true});
  assert.equal(monetary.previous.afterCheck,predecessor.afterCheck,'NOVELTY217_MONETARY_WHOLE197_PREIMAGE_CHANGED');assert.equal(monetary.previous.ready,priorReadiness,'NOVELTY217_MONETARY_STORED_READINESS_CHANGED');
  for(const [file,expected]of Object.entries(OWN_LIQUIDATION_BOOTSTRAP213_SOURCE_PINS))assert.equal(hash(read(file)),expected,'NOVELTY217_BOOTSTRAP_SOURCE_CHANGED:'+file);
  const original=splitPostgresStatements(read('scripts/migrations/124-own-payroll-liquidation-decisions.sql')).map(clean).filter(s=>s.startsWith('CREATE FUNCTION public.own_liquidation_bootstrap_v1('));assert.equal(original.length,1);
  const changed=deriveOwnLiquidationBootstrap213(original[0]),rawBefore={...pin(original[0]),runtime:true},rawAfter={...pin(changed),runtime:true};
  assert.deepEqual(splitPostgresStatements(read('scripts/migrations/213-own-liquidation-bootstrap-administrative-operator.sql')).map(clean),[changed],'NOVELTY217_BOOTSTRAP_FORWARD_SOURCE_CHANGED');
  const unique=(file,name)=>{const rows=splitPostgresStatements(read(file)).map(clean).filter(s=>s.startsWith('CREATE FUNCTION public.'+name+'(')||s.startsWith('CREATE OR REPLACE FUNCTION public.'+name+'('));assert.equal(rows.length,1,'NOVELTY217_BOOTSTRAP_PREREQUISITE_SOURCE_CHANGED:'+name);return rows[0];};
  const prerequisites=[pin(unique('scripts/migrations/124-own-payroll-liquidation-decisions.sql','own_liquidation_context_v1')),pin(unique('scripts/migrations/176-own-payroll-administrative-operator.sql','own_run_context_v1')),pin(SALARY_ADMINISTRATIVE_CONTEXT)];
  const bootstrapProjection=projectText(monetary.afterCheck,[rawBefore],[rawAfter],{requireTargets:false});
  technicalBeforeCheck=bootstrapProjection.value+';'+pinsCheck([...prerequisites,rawAfter],'NOVELTY217_BOOTSTRAP213_METADATA');
  technicalPredecessor={monetary,bootstrap213:{rawBefore,rawAfter,prerequisites,changed,projection:bootstrapProjection},sourceDerived:true,observedMetadataUsed:false};
 }
 const beforeCheck=capacity201Epoch==='post201'?projectText(technicalBeforeCheck,[capacityLineage.beforePin],[capacityLineage.afterPin]).value:technicalBeforeCheck;
 const externalFamilyScope=predecessor.ancestorMetadataLedger.objectScope.kind;
 assert.ok(['present','absent'].includes(externalFamilyScope),'NOVELTY217_EXTERNAL_FAMILY_SCOPE_REQUIRED');
 if(externalFamilyScope==='absent'){
  assert.equal(predecessor.ancestorObjectCounts.scopeAbsent,true);
  assert.equal(/proname LIKE '+own_novelty_%'+/.test(beforeCheck),false,'NOVELTY217_UNDECLARED_EXTERNAL_FAMILY_GUARD');
 }
 const afterProjection=projectText(beforeCheck,beforePins,afterPins,{family:externalFamilyScope==='present'});
 const afterCheck=[afterProjection.value,pinsCheck([helperPin],'NOVELTY217_HELPER_METADATA')].join(';\n');
 const revoke='REVOKE ALL ON FUNCTION public.own_novelty_administrative_context_v1(jsonb) FROM PUBLIC,municontrol_actions_runtime_app';
 const mutations=[helper,revoke,context,readiness],before=snapshot('before',beforePins,helperPin),after=snapshot('after',beforePins,helperPin);
 const transaction=ro=>`DO $transaction217$ BEGIN IF current_setting('standard_conforming_strings')<>'on' OR current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>${q(ro?'on':'off')} OR current_setting('server_version_num')::int/10000 NOT IN(17,18) THEN RAISE EXCEPTION 'NOVELTY217_TRANSACTION_REQUIRED';END IF;${ro?'':'PERFORM pg_advisory_xact_lock(217);PERFORM pg_advisory_xact_lock(197);'}END $transaction217$`;
 const absent="to_regprocedure('public.own_novelty_administrative_context_v1(jsonb)') IS NULL";
 const matches=pins=>pins.map(p=>"EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure("+q(p.signature)+") AND encode(public.digest(replace(p.prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex')="+q(p.sha256)+')').join(' AND ');
 const mode=`DO $mode217$ BEGIN IF ${absent} AND ${matches(beforePins)} THEN PERFORM set_config('${prefix}mode','install',true);ELSIF NOT(${absent}) AND ${matches([...afterPins,helperPin])} THEN PERFORM set_config('${prefix}mode','verify',true);ELSE RAISE EXCEPTION 'NOVELTY217_PARTIAL_OR_FOREIGN_EPOCH';END IF;END $mode217$`;
 const phase=m=>`DO $phase217$ BEGIN IF current_setting('${prefix}mode')<>${q(m)} THEN RAISE EXCEPTION 'NOVELTY217_PHASE_CHANGED';END IF;END $phase217$`;
 const choose=`DO $choose217$ BEGIN IF current_setting('${prefix}mode')='install' THEN EXECUTE ${q(beforeCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $choose217$`;
 const applySql=`DO $apply217$ BEGIN IF current_setting('${prefix}mode')='install' THEN ${mutations.map(s=>'EXECUTE '+q(s)+';').join('\n')}END IF;END $apply217$`;
 const conservation=`DO $preserved217$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'NOVELTY217_PRIOR_STATE_CHANGED';END IF;END $preserved217$`;
 const readinessCheck='DO $readiness217$ BEGIN PERFORM public.municipal_adoption_ready_v1();END $readiness217$';
 const objectSql="encode(public.digest((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN("+[...afterPins,helperPin].map(p=>'to_regprocedure('+q(p.signature)+')').join(',')+"))::text,'sha256'),'hex')";
 const counters={newTables:0,newFunctions:1,adaptedFunctions:2,newCapabilities:0,roleAssignmentsAdded:0,existingAclChanges:0,businessWrites:0,nominalRowsReturned:0};
 for(const file of ['scripts/lib/novelty-administrative217-installation.mjs','scripts/lib/novelty-administrative217-source-contract.mjs'])read(file);
 const proof=(m,preserved)=>`SELECT jsonb_build_object('version',${q(NOVELTY217_VERSION)},'sourceCommit',${q(options.sourceCommit)},'sourceHashes',${q(JSON.stringify(sourceHashes))}::jsonb,'mode',${m},${Object.entries(counters).map(([k,v])=>q(k)+','+v).join(',')},'transactionDataPreserved',${preserved},'preservationSha256',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex'),'priorMetadataSha256',${installationPriorMetadataFingerprint(prefix+'after')},'objectSha256',${objectSql}) AS proof`;
 const installation=m=>[transaction(false),mode,phase(m),choose,before,applySql,afterCheck,readinessCheck,after,conservation,proof("current_setting('"+prefix+"mode')",true)];
 const lateFault=`DO $late217$ BEGIN RAISE EXCEPTION '${NOVELTY217_REHEARSAL_ERROR}';END $late217$`;
 const compatibility={};for(const file of ['scripts/migrations/201-own-full-payroll-decision-capacity.sql','scripts/lib/own-payroll-annulment-review-v2-installation.mjs','scripts/lib/own-payroll-annulment-preparation-209-installation.mjs']){const text=read(file);compatibility[file]={sourceSha256:hash(text),contextOrReadinessLiteralReferences:[...text.matchAll(/\b(?:own_novelty_context_v1|municipal_adoption_ready_v1)\b/g)].length};assert.equal(compatibility[file].contextOrReadinessLiteralReferences,0,'NOVELTY217_DOWNSTREAM_SOURCE_CONTRACT_CHANGED');}
 // sourceHashes was extended by compatibility reads; freeze proof inputs only
 // after all reads and then rebuild the proof-bearing arrays once.
 const installationFinal=installation('install'),repetition=installation('verify');
 const result=freeze({version:NOVELTY217_VERSION,sourceCommit:options.sourceCommit,operationalPairBaseline:options.operationalPairBaseline,sourceHashes,technicalPredecessorEpoch,technicalPredecessor,capacity201Epoch,capacity201Lineage:capacityLineage,readinessPre201:pre201Ready.definition,readinessPost201:post201Ready.definition,predecessor,helper,context,readiness,priorContext,priorReadiness,beforePins,afterPins,helperPin,mutations,beforeCheck,afterCheck,readyProjection,externalFamilyScope,afterProjection,before,after,conservation,readinessCheck,counters,mode,
  preflight:[transaction(true),beforeCheck,`DO $absence217$ BEGIN IF NOT(${absent}) THEN RAISE EXCEPTION 'NOVELTY217_HELPER_ALREADY_PRESENT';END IF;END $absence217$`,`SELECT jsonb_build_object('version','novelty217-preflight.v1','sourceCommit',${q(options.sourceCommit)},'mode','install','metadataGuardsPassed',true) AS proof`],
  installation:installationFinal,rehearsal:[...installationFinal,lateFault],rehearsalExpectedError:NOVELTY217_REHEARSAL_ERROR,
  verification:[transaction(true),afterCheck,readinessCheck,after,proof("'verify'",false)],repetition,
  reversalHistoryGuard:[transaction(false),afterCheck,predecessor.noHistory],compatibility,
  connects:false,executesSql:false,executionAdmitted:false,run7Included:false,storedAdoptionReadinessUpdated:true});
 minted.add(result);internals.set(result,{...previousOptions,technicalPredecessorEpoch});return result;
}


// External metadata successor only. Stored217 functions stay byte-identical.
export function composeNovelty217Capacity201Bookend({batch}){
 assert.ok(minted.has(batch)&&batch.capacity201Epoch==='pre201','NOVELTY217_PRE201_MINTED_PLAN_REQUIRED');
 const post=buildNoveltyAdministrative217Installation({...internals.get(batch),capacity201Epoch:'post201'});
 assert.equal(post.helper,batch.helper);assert.equal(post.context,batch.context);assert.equal(post.readiness,batch.readiness,'NOVELTY217_STORED_READINESS_CHANGED_UNNECESSARILY');assert.deepEqual(post.afterPins,batch.afterPins);
 const functions=[...batch.afterPins,batch.helperPin],ids=functions.map(p=>'to_regprocedure('+q(p.signature)+')').join(',');
 const context="DO $bookend217_context$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>'on' OR current_setting('standard_conforming_strings')<>'on' THEN RAISE EXCEPTION 'NOVELTY217_201_READONLY_REQUIRED';END IF;END $bookend217_context$";
 const proof=`SELECT jsonb_build_object('version','novelty217-capacity201-bookend.v1','sourceCommit',${q(batch.sourceCommit)},'sourceHashes',${q(JSON.stringify(post.sourceHashes))}::jsonb,'capacity201SourceSha256',${q(batch.capacity201Lineage.sourceSha256)},'epoch','post201','functions',3,'newFunctions',0,'adaptedFunctions',0,'newTables',0,'iamWrites',0,'businessWrites',0,'objectSha256',encode(public.digest((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN(${ids}))::text,'sha256'),'hex')) AS proof`;
 const plan=freeze({version:'novelty217-capacity201-bookend-source.v1',sourceCommit:batch.sourceCommit,sourceHashes:post.sourceHashes,batch,post201Batch:post,storedReadinessUnchanged:true,newFunctions:0,adaptedFunctions:0,verification:[context,pinsCheck(functions,'NOVELTY217_201_OWN_FUNCTION_CHANGED'),pinsCheck([post.capacity201Lineage.afterPin],'NOVELTY217_201_CLOSE_SOURCE_EPOCH_CHANGED'),proof],connects:false,executesSql:false});successors.add(plan);return plan;
}
export function assertNovelty217Capacity201Bookend({plan,prior,observed,installation201}){
 assert.ok(successors.has(plan),'NOVELTY217_201_UNMINTED_PLAN');assertNoveltyAdministrative217Durability({batch:plan.batch,installed:prior.installed,durable:prior.durable,repeated:prior.repeated});
 assert.equal(installation201?.version,'own-full-capacity-canonical190-epochs.v1');assert.equal(installation201.sourceSqlSha256,plan.batch.capacity201Lineage.sourceSha256);assert.deepEqual(installation201.epoch201.installed,installation201.epoch201.durable);assert.equal(installation201.epoch201.installed.sourceCommit,plan.sourceCommit);assert.equal(installation201.epoch201.installed.priorStatePreserved,true);assert.equal(installation201.epoch201.installed.businessWrites,0);
 assert.deepEqual(Object.keys(observed??{}).sort(),['version','sourceCommit','sourceHashes','capacity201SourceSha256','epoch','functions','newFunctions','adaptedFunctions','newTables','iamWrites','businessWrites','objectSha256'].sort());assert.equal(observed.version,'novelty217-capacity201-bookend.v1');assert.equal(observed.sourceCommit,plan.sourceCommit);assert.deepEqual(observed.sourceHashes,plan.sourceHashes);assert.equal(observed.capacity201SourceSha256,plan.batch.capacity201Lineage.sourceSha256);assert.equal(observed.epoch,'post201');assert.equal(observed.functions,3);for(const k of ['newFunctions','adaptedFunctions','newTables','iamWrites','businessWrites'])assert.equal(observed[k],0);assert.match(observed.objectSha256,/^[a-f0-9]{64}$/);assert.equal(observed.objectSha256,prior.installed.objectSha256,'NOVELTY217_201_OWN_FUNCTION_METADATA_CHANGED');
 return{passed:true,readOnly:true,storedReadinessUnchanged:true,ownThreeFunctionsPreserved:true,globalPreservationAcross201Compared:false,businessWrites:0};
}

export function assertNoveltyAdministrative217Durability({installed,durable,repeated,batch}){
 assert.ok(minted.has(batch),'NOVELTY217_UNMINTED_BATCH');
 const keys=['version','sourceCommit','sourceHashes','mode',...Object.keys(batch.counters),'transactionDataPreserved','preservationSha256','priorMetadataSha256','objectSha256'].sort();
 for(const [v,mode,preserved]of [[installed,'install',true],[durable,'verify',false],[repeated,'verify',true]]){assert.deepEqual(Object.keys(v??{}).sort(),keys);assert.equal(v.version,batch.version);assert.equal(v.sourceCommit,batch.sourceCommit);assert.deepEqual(v.sourceHashes,batch.sourceHashes);assert.equal(v.mode,mode);assert.equal(v.transactionDataPreserved,preserved);for(const[k,n]of Object.entries(batch.counters))assert.equal(v[k],n);for(const k of ['preservationSha256','priorMetadataSha256','objectSha256'])assert.match(v[k],/^[a-f0-9]{64}$/);for(const k of ['priorMetadataSha256','objectSha256'])assert.equal(v[k],installed[k]);}
 return{passed:true,technicalWritesOnly:true,adoptionReadinessPreserved:true,independentDurableRead:true,businessWrites:0};
}

export function projectNoveltyAdministrative217Pins({batch,contract,pins}){
 assert.ok(minted.has(batch),'NOVELTY217_UNMINTED_BATCH');
 const contracts={'197-support':[batch.predecessor.supportPins,1],'197-after':[batch.predecessor.afterPins,1],'197-final':[[...batch.predecessor.afterPins,...batch.predecessor.newPins,...batch.predecessor.supportPins],2]};
 assert.ok(Object.hasOwn(contracts,contract),'NOVELTY217_UNKNOWN_PIN_CONTRACT');const[expected,count]=contracts[contract];assert.deepEqual(pins,expected,'NOVELTY217_WRONG_PIN_PREIMAGE');let changed=0;
 const result=pins.map(p=>{const n=batch.beforePins.findIndex(v=>v.signature===p.signature);if(n<0)return{...p};assert.deepEqual(p,batch.beforePins[n]);changed++;return{...batch.afterPins[n]};});assert.equal(changed,count);return result;
}

// Call this on the actual source-derived downstream plans before admitting
// their execution. Literal scans alone are not a transitive closure proof.
export function assertNovelty217DownstreamPinsUnchanged({batch,contract,pins}){
 assert.ok(minted.has(batch),'NOVELTY217_UNMINTED_BATCH');
 const counts={'201-post':27,'208-predecessors':13,'209-transitive':50};assert.ok(Object.hasOwn(counts,contract),'NOVELTY217_UNKNOWN_DOWNSTREAM_CONTRACT');
 assert.ok(Array.isArray(pins));assert.equal(pins.length,counts[contract],'NOVELTY217_DOWNSTREAM_COUNT_CHANGED');
 assert.equal(new Set(pins.map(p=>p.signature)).size,pins.length,'NOVELTY217_DOWNSTREAM_DUPLICATE');
 const targets=new Set([...batch.beforePins,batch.helperPin].map(p=>p.signature));for(const p of pins)assert.equal(targets.has(p.signature),false,'NOVELTY217_DOWNSTREAM_TARGET_REQUIRES_NEW_SOURCE_PROJECTION:'+p.signature);
 return{contract,changedPins:0,exactInputIdentityPreserved:true,pins};
}
