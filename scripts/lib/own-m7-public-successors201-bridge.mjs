// Private finite source bridge; no top-level preparation, I/O or SQL execution.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {composeOwnFullCapacity190PublicInstallation,OWN_FULL_CAPACITY_190_SQL,OWN_FULL_CAPACITY_190_SQL_SHA256} from './own-full-capacity-190-public-installation.mjs';
import {assertOwnM7PublicSuccessorRaw,composeOwnLiquidationBootstrap213Raw,composeOwnCloseSnapshot214Raw,composeOwnCloseSnapshot215Raw,prepareOwnLiquidationBootstrap213Public,prepareOwnCloseSnapshot214Public,prepareOwnCloseSnapshot215Public} from './own-m7-public-successors213215.mjs';
const F201_FILE='scripts/lib/own-full-capacity-190-public-installation.mjs';
const F201_SHA='f220a79c990dc7f303fe52c49b3436af9c6b5924a5e1167810d8811127ee5378';
const SIGNATURE='public.own_close_snapshot_v1(jsonb,jsonb)';
const q=v=>"'"+String(v).replaceAll("'","''")+"'",hash=v=>createHash('sha256').update(v).digest('hex'),lf=v=>v.replace(/\r\n?/g,'\n');
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'PUBLIC201_SUCCESSOR_UNIQUE_ANCHOR_REQUIRED');return s.replace(a,()=>b);};
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;};
const phase=(s,name)=>{const a='DO $'+name+'$',z='END $'+name+'$;',start=s.indexOf(a),end=s.indexOf(z,start);assert.ok(start>=0&&end>start);assert.equal(s.indexOf(a,start+a.length),-1);return s.slice(start,end+z.length);};
const metadata=s=>{const m=/jsonb_array_elements\('((?:[^']|'')*)'::jsonb\)/.exec(s);assert.ok(m,'PUBLIC201_SUCCESSOR_METADATA_SOURCE_REQUIRED');return JSON.parse(m[1].replaceAll("''","'"));};
function freshCapacity(capacityPlan,{read,sourceCommit}){
 assert.equal(typeof read,'function');assert.match(sourceCommit??'',/^[a-f0-9]{40}$/);
 assert.equal(hash(lf(read(F201_FILE))),F201_SHA,'PUBLIC201_SUCCESSOR_COMPOSER_SOURCE_CHANGED');
 const expected=composeOwnFullCapacity190PublicInstallation({read,sourceCommit});
 assert.deepEqual(capacityPlan,expected,'PUBLIC201_SUCCESSOR_WHOLE_SOURCE_PLAN_CHANGED');
 const source=lf(read(OWN_FULL_CAPACITY_190_SQL));assert.equal(hash(source),OWN_FULL_CAPACITY_190_SQL_SHA256,'PUBLIC201_SUCCESSOR_SQL201_SOURCE_CHANGED');
 const preflight=phase(source,'capacity_preflight'),postflight=phase(source,'capacity_postflight'),pre=metadata(preflight),post=metadata(postflight);
 assert.equal(pre.length,11);assert.equal(post.length,27);assert.equal(new Set(post.map(p=>p.signature)).size,27);
 assert.deepEqual(capacityPlan.pre,pre,'PUBLIC201_SUCCESSOR_ELEVEN_PREDECESSORS_CHANGED');assert.deepEqual(capacityPlan.post,post,'PUBLIC201_SUCCESSOR_TWENTYSEVEN_POSTDECESSORS_CHANGED');
 assert.equal(capacityPlan.preflight[0],preflight);assert.equal(capacityPlan.verification[0],postflight,'PUBLIC201_SUCCESSOR_WHOLE_POSTFLIGHT_CHANGED');
 assert.equal(post.filter(p=>p.kind==='protected_dependency').length,2);
 return{expected,preflight,postflight,pre,post};
}
function combine(a,b){const out={...a};for(const[f,h]of Object.entries(b)){if(Object.hasOwn(out,f))assert.equal(out[f],h,'PUBLIC201_SUCCESSOR_SOURCE_PIN_CONFLICT:'+f);out[f]=h;}out[F201_FILE]=F201_SHA;return out;}
export function projectOwnFullCapacity190PublicPostflight({capacityPlan,raw,postflight,read,sourceCommit}){
 assertOwnM7PublicSuccessorRaw(raw,{sourceCommit,major:raw?.major});assert.ok([214,215].includes(raw.stage),'PUBLIC201_SUCCESSOR_CLOSE_STAGE_REQUIRED');
 const source=freshCapacity(capacityPlan,{read,sourceCommit});assert.equal(postflight,source.postflight,'PUBLIC201_SUCCESSOR_HISTORICAL_GUARD_REQUIRED');
 const historical=raw.stage===214?raw.rawBefore:composeOwnCloseSnapshot214Raw({major:raw.major,sourceCommit,read}).rawBefore;
 const matches=source.post.filter(p=>p.signature===SIGNATURE);assert.equal(matches.length,1);const expected=matches[0];
 assert.equal(expected.name,'own_close_snapshot_v1');assert.equal(expected.kind,'protected_dependency');assert.equal(expected.runtime,false);assert.equal(expected.bodySha256,historical.sha256);
 for(const pin of[historical,raw.rawBefore,raw.rawAfter]){
  assert.equal(pin.signature,SIGNATURE);assert.equal(pin.runtime,false);assert.deepEqual(pin.argNames,expected.argNames);assert.deepEqual(pin.config,expected.config);assert.equal(pin.volatility,expected.volatility);
  assert.equal(pin.resultType,expected.result);assert.equal(pin.language,expected.language);assert.equal(pin.defaults,'');assert.equal(pin.definer,true);assert.equal(pin.strict,false);assert.equal(pin.returnsSet,false);
 }
 const project=digest=>{
  assert.match(digest,/^[a-f0-9]{64}$/);assert.equal(source.postflight.split(historical.sha256).length,2);
  const updated=once(source.postflight,historical.sha256,digest);
  const rows=source.post.map(p=>p.signature===SIGNATURE?{...p,bodySha256:digest}:p);
  assert.deepEqual(metadata(updated),rows,'PUBLIC201_SUCCESSOR_ONLY_ONE_METADATA_FIELD');
  assert.equal(once(updated,digest,historical.sha256),source.postflight,'PUBLIC201_SUCCESSOR_WHOLE_GUARD_INVERSE_FAILED');
  // All26 other records and every property of the target except bodySha256,
  // including its historical definitionSha256 annotation, stay source-exact.
  return{guard:updated,rows};
 };
 const before=project(raw.rawBefore.sha256),after=project(raw.rawAfter.sha256);
 return freeze({stage:raw.stage,schema:'public',sourceCommit,originalPostflight:source.postflight,beforePostflight:before.guard,afterPostflight:after.guard,pre:source.pre,originalPost:source.post,beforePost:before.rows,afterPost:after.rows,changedSignature:SIGNATURE,changedField:'bodySha256',unchangedOtherRecords:26,wholeGuardInverse:true,sourceHashes:combine(raw.sourceHashes,capacityPlan.sourceHashes),observedCatalogueMetadataUsed:false,connects:false,executesSql:false});
}
function withCapacity(stage,{target,capacityPlan,sourceCommit,read}){
 const factories=stage===213?[composeOwnLiquidationBootstrap213Raw,prepareOwnLiquidationBootstrap213Public]:stage===214?[composeOwnCloseSnapshot214Raw,prepareOwnCloseSnapshot214Public]:stage===215?[composeOwnCloseSnapshot215Raw,prepareOwnCloseSnapshot215Public]:null;
 assert.ok(factories,'PUBLIC201_SUCCESSOR_STAGE_REQUIRED');
 const base=factories[1]({target,sourceCommit,read}),raw=factories[0]({major:base.major,sourceCommit,read});assertOwnM7PublicSuccessorRaw(raw,{sourceCommit,major:base.major});
 const source=freshCapacity(capacityPlan,{read,sourceCommit});
 let beforeGuard=source.postflight,afterGuard=source.postflight;
 if(stage!==213){const projected=projectOwnFullCapacity190PublicPostflight({capacityPlan,raw,postflight:source.postflight,read,sourceCommit});beforeGuard=projected.beforePostflight;afterGuard=projected.afterPostflight;}
 else assert.equal(source.post.some(p=>p.name==='own_liquidation_bootstrap_v1'),false,'PUBLIC201_SUCCESSOR_BOOTSTRAP_NOT_IN_201_POST');
 const sourceHashes=combine(base.sourceHashes,capacityPlan.sourceHashes),prefix=stage===213?'municontrol_liq_bootstrap213.':'municontrol_close_snapshot'+stage+'.',tag=stage===213?'liq_boot213':'close_snapshot'+stage;
 const choose=`DO $public${stage}_capacity201_choose$ BEGIN IF current_setting('${prefix}mode')='install' THEN EXECUTE ${q(beforeGuard)};ELSE EXECUTE ${q(afterGuard)};END IF;END $public${stage}_capacity201_choose$`;
 const rewriteProof=proof=>{assert.match(proof,/ AS proof$/);return once(proof,q(JSON.stringify(base.sourceHashes)),q(JSON.stringify(sourceHashes)));};
 const modeIndices=base.installation.map((s,i)=>s.startsWith('DO $'+tag+'_mode$')?i:-1).filter(i=>i>=0);assert.equal(modeIndices.length,1);const modeIndex=modeIndices[0];
 const installation=[...base.installation.slice(0,modeIndex+1),choose,...base.installation.slice(modeIndex+1,-1),afterGuard,rewriteProof(base.installation.at(-1))];
 const verification=[...base.verification.slice(0,-1),afterGuard,rewriteProof(base.verification.at(-1))];
 const sourceBookend=()=>{base.sourceBookend();freshCapacity(capacityPlan,{read,sourceCommit});for(const[f,h]of Object.entries(sourceHashes))assert.equal(hash(lf(read(f))),h,'PUBLIC201_SUCCESSOR_SOURCE_BOOKEND_CHANGED:'+f);return{passed:true,sourceCommit,sourceHashes,whole201SourceGuardIncluded:true,observedCatalogueMetadataUsed:false};};
 return freeze({...base,sourceHashes,preflight:[...base.preflight,beforeGuard],installation,rehearsal:[...installation,base.rehearsal.at(-1)],verification,repetition:installation,sourceBookend,whole201AdmissionIncluded:true,whole201SourceGuardIncluded:true,native201AdmissionObserved:false,
  capacity201SourceEpoch:{version:capacityPlan.version,sourceSqlSha256:capacityPlan.sourceSqlSha256,predecessors:11,postdecessors:27,originalPostflightSha256:hash(source.postflight),beforePostflightSha256:hash(beforeGuard),afterPostflightSha256:hash(afterGuard),snapshotBodyBefore:stage===213?null:raw.rawBefore.sha256,snapshotBodyAfter:stage===213?null:raw.rawAfter.sha256,onlySnapshotBodyFieldChanged:stage!==213,wholeGuardInverse:true},
  executionAdmitted:false,connects:false,executesSql:false});
}
export function prepareOwnLiquidationBootstrap213PublicWith201(options){return withCapacity(213,options);}
export function prepareOwnCloseSnapshot214PublicWith201(options){return withCapacity(214,options);}
export function prepareOwnCloseSnapshot215PublicWith201(options){return withCapacity(215,options);}
