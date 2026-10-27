// New public SOURCE-ONLY composer. Existing I201/QA sources remain unchanged.
// The finite conservation copy is admitted only against the whole I201 source pin.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {buildOwnReportCensusInstallation} from './own-payroll-report-census-installation.mjs';
import {buildSalaryAuxiliaryNamespaceSql} from './salary-auxiliary-namespace-installation.mjs';
import {OWN_FULL_CAPACITY_190_SQL,OWN_FULL_CAPACITY_190_SQL_SHA256} from './own-payroll-full-capacity-190-installation.mjs';
export {OWN_FULL_CAPACITY_190_SQL,OWN_FULL_CAPACITY_190_SQL_SHA256};
export const OWN_FULL_CAPACITY_190_CONSERVATION_SOURCE='scripts/lib/own-payroll-full-capacity-190-installation.mjs';
export const OWN_FULL_CAPACITY_190_CONSERVATION_SOURCE_SHA256='f88d5a1979201c17572ae3c6932675dc991641cb736b9480895fd2ff761153eb';
const q=v=>"'"+String(v).replaceAll("'","''")+"'",hash=v=>createHash('sha256').update(v).digest('hex'),lf=v=>v.replace(/\r\n?/g,'\n');
const body=d=>{const m=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?$/.exec(d);assert.ok(m,'M7_190_SOURCE_BODY');return m[2];};
const clean=s=>s.replace(/^(?:\s*--[^\n]*(?:\n|$))+/g,'').trim();
const phase=(s,name)=>{const open='DO $'+name+'$',close='END $'+name+'$;',a=s.indexOf(open),b=s.indexOf(close,a);assert.ok(a>=0&&b>a,'M7_190_SOURCE_PHASE');assert.equal(s.indexOf(open,a+open.length),-1);return s.slice(a,b+close.length);};
const metadata=s=>{const m=/jsonb_array_elements\('((?:[^']|'')*)'::jsonb\)/.exec(s);assert.ok(m,'M7_190_SOURCE_METADATA');return{literal:m[0],items:JSON.parse(m[1].replaceAll("''","'"))};};
const definitions=s=>{const map=new Map();for(const m of s.matchAll(/\bCREATE(?: OR REPLACE)? FUNCTION public\.([a-z0-9_]+)\(([\s\S]*?)\bAS\s+(\$[\w]*\$)([\s\S]*?)\3/g)){assert.ok(!map.has(m[1]),'M7_190_SOURCE_OVERLOAD');map.set(m[1],m[0]);}return map;};
const PUBLIC201_NAMESPACE_SOURCE='scripts/lib/salary-auxiliary-namespace-installation.mjs';
const PUBLIC201_NAMESPACE_SOURCE_SHA256='6d492a4c56adba6a78242604f27b86ba18067359c1b28dc39879e50d43eed9b9';
const PUBLIC201_ANNUL_SOURCE='scripts/migrations/146-own-consolidated-annulment.sql';
const PUBLIC201_ANNUL_SOURCE_SHA256='8337df26dc3c22fe8c156e19d7511db6c537f08b219633f6add981c774a48fe6';
function public201ProtectedPredecessors({read,sourceCommit,pre,post}){
 assert.equal(hash(read(PUBLIC201_NAMESPACE_SOURCE)),PUBLIC201_NAMESPACE_SOURCE_SHA256,'M7_PUBLIC201_NAMESPACE_SOURCE_CHANGED');
 const namespace=buildSalaryAuxiliaryNamespaceSql({read,sourceCommit});
 const snapshots=namespace.changed.filter(d=>d.startsWith('CREATE OR REPLACE FUNCTION public.own_close_snapshot_v1('));assert.equal(snapshots.length,1,'M7_PUBLIC201_SNAPSHOT_SOURCE_REQUIRED');
 const annulSource=read(PUBLIC201_ANNUL_SOURCE);assert.equal(hash(annulSource),PUBLIC201_ANNUL_SOURCE_SHA256,'M7_PUBLIC201_ANNUL_SOURCE_CHANGED');
 const selected=definitions(annulSource).get('own_annul_selected_v1');assert.ok(selected,'M7_PUBLIC201_SELECTED_SOURCE_REQUIRED');
 const inherited=new Map([['own_close_snapshot_v1',snapshots[0]],['own_annul_selected_v1',selected]]);
 const protectedItems=post.filter(p=>p.kind==='protected_dependency');assert.equal(protectedItems.length,2,'M7_PUBLIC201_PROTECTED_SET_CHANGED');
 for(const item of protectedItems){
  assert.equal(item.runtime,false,'M7_PUBLIC201_PROTECTED_RUNTIME_CHANGED');
  const predecessor=pre.find(p=>p.name===item.name);assert.ok(predecessor,'M7_PUBLIC201_PROTECTED_PRIOR_REQUIRED');
  // These two records are inherited unchanged, not definitions emitted by SQL201.
  assert.deepEqual(item,{...predecessor,kind:'protected_dependency'},'M7_PUBLIC201_PROTECTED_METADATA_CHANGED');
  const d=inherited.get(item.name);assert.ok(d,'M7_PUBLIC201_UNKNOWN_PROTECTED_DEPENDENCY');assertPublic201Definition(item,d);
 }
 return inherited;
}
function assertPublic201Definition(record,definition){
 const pin=ownInstallationFunctionPin(definition);assert.equal(pin.name,record.name);assert.equal(pin.signature,record.signature);assert.equal(pin.sha256,record.bodySha256,'M7_190_METADATA_SOURCE_MISMATCH');
 assert.deepEqual(pin.argNames,record.argNames);assert.deepEqual(pin.config,record.config);assert.equal(pin.volatility,record.volatility);
 assert.equal(pin.resultType,record.result??'jsonb');assert.equal(pin.language,record.language??'plpgsql');assert.equal(pin.definer,true);assert.equal(pin.returnsSet,false);assert.equal(pin.strict,false);assert.equal(pin.defaults,'');
 // ACL authority comes from the pinned SQL201 guards and source lineage, not
 // from ownInstallationFunctionPin's generic facade-name runtime classification.
 return pin;
}

export function ownFullCapacity190Conservation({schema,sourceCommit},{legacyNames,newNames}){
 assert.match(schema,/^(?:public|mc_qa_fixed_092_[a-f0-9]{32})$/,'M7_190_CONSERVATION_NAMESPACE');assert.match(sourceCommit,/^[a-f0-9]{40}$/,'M7_190_CONSERVATION_COMMIT');
 const s=schema,old=legacyNames.map(q).join(','),added=newNames.map(q).join(','),checks=['own_payroll_close_event_snapshot_check','own_payroll_close_event_receipt_check','own_payroll_annul_event_receipt_check'].map(q).join(',');
 const snapshot=slot=>`DO $m7_preservation$ DECLARE target_relation record;rows_value jsonb:='[]';row_count bigint;row_hash text;BEGIN
 FOR target_relation IN SELECT c.oid,c.relname FROM pg_class c WHERE c.relnamespace=${q(s)}::regnamespace AND c.relkind IN('r','p','m') ORDER BY c.oid LOOP
 EXECUTE format('SELECT count(*),encode(public.digest(coalesce(string_agg(to_jsonb(r)::text,chr(10) ORDER BY to_jsonb(r)::text COLLATE "C"),''''),''sha256''),''hex'') FROM %I.%I r',${q(s)},target_relation.relname) INTO row_count,row_hash;
 rows_value:=rows_value||jsonb_build_array(jsonb_build_object('oid',target_relation.oid,'rows',row_count,'sha256',row_hash));END LOOP;
 PERFORM set_config('municontrol_capacity190.${slot}',jsonb_build_object('rows',rows_value,
 'tables',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid),'[]') FROM pg_class c WHERE c.relnamespace=${q(s)}::regnamespace),
 'attributes',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum),'[]') FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.relnamespace=${q(s)}::regnamespace),
 'attributeDefaults',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.oid),'[]') FROM pg_attrdef d JOIN pg_class c ON c.oid=d.adrelid WHERE c.relnamespace=${q(s)}::regnamespace),
 'constraints',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid),'[]') FROM pg_constraint c WHERE c.connamespace=${q(s)}::regnamespace AND NOT(c.conname IN(${checks}) AND c.conrelid IN('${s}.own_payroll_close_event'::regclass,'${s}.own_payroll_annul_event'::regclass))),
 'indexes',(SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.indexrelid),'[]') FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid WHERE c.relnamespace=${q(s)}::regnamespace),
 'triggers',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.oid),'[]') FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace=${q(s)}::regnamespace),
 'policies',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.oid),'[]') FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace=${q(s)}::regnamespace),
 'functions',(SELECT coalesce(jsonb_agg(CASE WHEN p.proname IN(${old}) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END ORDER BY p.oid),'[]') FROM pg_proc p WHERE p.pronamespace=${q(s)}::regnamespace AND p.proname NOT IN(${added})),
 'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.oid) FROM pg_roles r),'memberships',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.roleid,m.member),'[]') FROM pg_auth_members m),
 'defaultAcl',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.oid),'[]') FROM pg_default_acl d),'schema',(SELECT to_jsonb(n) FROM pg_namespace n WHERE n.oid=${q(s)}::regnamespace))::text,true);END $m7_preservation$`;
 const compare=`DO $m7_conserved$ BEGIN IF current_setting('municontrol_capacity190.before')::jsonb IS DISTINCT FROM current_setting('municontrol_capacity190.after')::jsonb THEN RAISE EXCEPTION 'M7_190_PRIOR_STATE_CHANGED';END IF;END $m7_conserved$`;
 const proof=`SELECT jsonb_build_object('version','own-full-capacity-canonical190-installation.v1','sourceCommit',${q(sourceCommit)},'sourceSqlSha256',${q(OWN_FULL_CAPACITY_190_SQL_SHA256)},'priorStateSha256',encode(public.digest(current_setting('municontrol_capacity190.after')::jsonb::text,'sha256'),'hex'),'priorStatePreserved',true,'existingFunctionMetadataPreserved',true,'businessWrites',0,'newFunctions',16,'adaptedFunctions',9,'changedChecks',3)`;
 return{before:snapshot('before'),after:snapshot('after'),compare,proof};
}

export const OWN_FULL_CAPACITY_190_PUBLIC_VERSION='own-full-capacity-canonical190-public-installation.v1';
const strip=s=>s.replace(/;\s*$/,'').trim();
// Public institutional plan from the pinned SQL201 and the exact source200 predecessor.
// No pool, no relocation, no observed catalogue: the migration's own preflight/postflight
// arrays are the public pins, verified against the destination inside the transaction.
export function composeOwnFullCapacity190PublicInstallation({read,sourceCommit}){
 assert.equal(typeof read,'function','M7_PUBLIC201_READ_REQUIRED');assert.match(sourceCommit,/^[a-f0-9]{40}$/,'M7_PUBLIC201_COMMIT_REQUIRED');
 const sourceHashes={},load=file=>{const value=lf(read(file)),digest=hash(value);if(Object.hasOwn(sourceHashes,file))assert.equal(sourceHashes[file],digest,'M7_PUBLIC201_SOURCE_READ_DRIFT');sourceHashes[file]=digest;return value;};
 assert.equal(hash(load(OWN_FULL_CAPACITY_190_CONSERVATION_SOURCE)),OWN_FULL_CAPACITY_190_CONSERVATION_SOURCE_SHA256,'M7_PUBLIC201_CONSERVATION_SOURCE_CHANGED');
 const source=load(OWN_FULL_CAPACITY_190_SQL);assert.equal(hash(source),OWN_FULL_CAPACITY_190_SQL_SHA256,'M7_190_UNREVIEWED_SQL201');
 const before=phase(source,'capacity_preflight'),after=phase(source,'capacity_postflight'),pre=metadata(before),post=metadata(after);assert.equal(pre.items.length,11);assert.equal(post.items.length,27);
 const census=buildOwnReportCensusInstallation({read:load,sourceCommit});
 const censusItem=pre.items.find(p=>p.name==='own_close_report_census_v1');assert.ok(censusItem,'M7_PUBLIC201_CENSUS_PREDECESSOR_MISSING');
 assert.equal(censusItem.bodySha256,hash(body(clean(census.migration[0]))),'M7_190_PREDECESSOR_SOURCE_BODY');
 assert.equal(censusItem.signature,'public.own_close_report_census_v1(jsonb,text,text)');assert.equal(censusItem.runtime,true,'M7_PUBLIC201_CENSUS_RUNTIME');
 assert.equal(source.split(censusItem.bodySha256).length-1,2,'M7_PUBLIC201_CENSUS_SUCCESSOR_GUARD');
 const byName=definitions(source);assert.equal(byName.size,25,'M7_190_WHOLE_201_FUNCTION_SET');
 const inherited=public201ProtectedPredecessors({read:load,sourceCommit,pre:pre.items,post:post.items});
 for(const record of post.items){const original=byName.get(record.name)??inherited.get(record.name);assert.ok(original,'M7_PUBLIC201_POST_SOURCE_MISSING:'+record.name);assertPublic201Definition(record,original);assert.ok(record.signature.startsWith('public.'),'M7_PUBLIC201_POST_NAMESPACE');}
 const protectedPredecessorPins=[...inherited.values()].map(d=>assertPublic201Definition(post.items.find(p=>p.name===ownInstallationFunctionPin(d).name),d));
 for(const record of pre.items)assert.ok(record.signature.startsWith('public.')&&record.config.includes('search_path=pg_catalog, public, pg_temp'),'M7_PUBLIC201_PRE_NAMESPACE:'+record.name);
 const legacyNames=post.items.filter(p=>p.kind==='legacy'||p.kind==='known_census_successor').map(p=>p.name),newNames=post.items.filter(p=>p.kind==='core'||p.kind==='full').map(p=>p.name);assert.equal(legacyNames.length,9);assert.equal(newNames.length,16);
 const keep=ownFullCapacity190Conservation({schema:'public',sourceCommit},{legacyNames,newNames});
 // One statement per element for the institutional HTTP transport; the QA plan keeps the whole text.
 const statements=splitPostgresStatements(source);assert.ok(statements.length>=3,'M7_PUBLIC201_STATEMENTS');
 assert.equal(strip(clean(statements[0])),strip(before),'M7_PUBLIC201_FIRST_IS_PREFLIGHT');assert.equal(strip(clean(statements.at(-1))),strip(after),'M7_PUBLIC201_LAST_IS_POSTFLIGHT');
 for(const s of statements)assert.ok(!/mc_qa_fixed_092_/.test(s),'M7_PUBLIC201_QA_NAMESPACE_LEAK');
 const proof=keep.proof+' AS proof';
 return Object.freeze({version:OWN_FULL_CAPACITY_190_PUBLIC_VERSION,sourceCommit,schema:'public',sourceSha256:hash(source),sourceSqlSha256:OWN_FULL_CAPACITY_190_SQL_SHA256,sourceHashes:Object.freeze(sourceHashes),conservationSourceSha256:OWN_FULL_CAPACITY_190_CONSERVATION_SOURCE_SHA256,protectedPredecessorPins:Object.freeze(protectedPredecessorPins),
  census,censusStatements:Object.freeze([...census.statements]),censusVerification:Object.freeze([...census.verification]),
  pre:Object.freeze(pre.items),post:Object.freeze(post.items),legacyNames:Object.freeze(legacyNames),newNames:Object.freeze(newNames),
  preflight:Object.freeze([before,census.ownCheck]),
  statements:Object.freeze([keep.before,...statements,keep.after,keep.compare,proof]),
  verification:Object.freeze([after,keep.after,proof]),
  connects:false,executesSql:false,businessOperations:0,roleAssignmentsAdded:0,capabilityDefinitionsAdded:0,qaPoolUsed:false,relocated:false});
}
export function assertOwnFullCapacity190PublicProof({proof,batch}){
 assert.equal(batch?.version,OWN_FULL_CAPACITY_190_PUBLIC_VERSION,'M7_PUBLIC201_BATCH_VERSION');
 assert.ok(proof&&typeof proof==='object'&&!Array.isArray(proof),'M7_PUBLIC201_PROOF_SHAPE');
 const keys=['version','sourceCommit','sourceSqlSha256','priorStateSha256','priorStatePreserved','existingFunctionMetadataPreserved','businessWrites','newFunctions','adaptedFunctions','changedChecks'];
 assert.deepEqual(Reflect.ownKeys(proof).sort(),keys.sort(),'M7_PUBLIC201_PROOF_SHAPE');
 assert.equal(proof.version,'own-full-capacity-canonical190-installation.v1');assert.equal(proof.sourceCommit,batch.sourceCommit);assert.equal(proof.sourceSqlSha256,batch.sourceSqlSha256);
 for(const[key,wanted]of Object.entries({priorStatePreserved:true,existingFunctionMetadataPreserved:true,businessWrites:0,newFunctions:16,adaptedFunctions:9,changedChecks:3}))assert.equal(proof[key],wanted,'M7_PUBLIC201_PROOF_CHANGED:'+key);
 assert.match(proof.priorStateSha256,/^[a-f0-9]{64}$/);
 return{passed:true,sourceCommit:batch.sourceCommit,phaseProofValidated:true};
}
export function assertOwnFullCapacity190PublicDurability({installed,durable,batch}){
 assertOwnFullCapacity190PublicProof({proof:installed,batch});assertOwnFullCapacity190PublicProof({proof:durable,batch});
 assert.deepEqual(durable,installed,'M7_PUBLIC201_NOT_DURABLE');
 return{passed:true,sourceCommit:batch.sourceCommit,priorStatePreserved:true,objectsDurable:true,businessWrites:0,nominalRowsReturned:0};
}
