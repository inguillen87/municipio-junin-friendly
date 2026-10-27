// Optional finite native regression hook, before195 on an already owned QA190.
// No connection, fixture identity, database or standalone execution is created.
import assert from 'node:assert/strict';
import {prepareNativeFamily195PublicMaterialPreflight} from './native-family195-public-preflight.mjs';
export const NATIVE_FAMILY195_PUBLIC_LAYOUT_QA_ENTRIES=Object.freeze([
 'scripts/lib/native-family195-public-layout-qa.mjs',
 'scripts/lib/native-family195-public-preflight.mjs',
 'scripts/contracts/native-family195-prerequisite-layout-pg17.json',
 'scripts/contracts/native-family195-prerequisite-layout-query.sql'
]);
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
const searchPath="SET LOCAL search_path='pg_catalog, public, pg_temp'";
function changeCheck(schema,table,columns,{definition,duplicate=false,drop=false,rename=false}={}){
 const keys='ARRAY['+[...columns].sort().map(q).join(',')+']::text[]';
 const action=rename?"EXECUTE format('ALTER TABLE %s RENAME CONSTRAINT %I TO qa195_layout_renamed',r,c.conname);":
  (duplicate?'':"EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',r,c.conname);")+
  (drop?'':"EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',r,"+(duplicate?"'qa195_layout_mutation'":'c.conname')+","+(definition?q(definition):'c.definition')+");");
 return `DO $qa195_layout_mutation$ DECLARE r regclass:=to_regclass(${q(schema+'.'+table)});c record;BEGIN
 IF r IS NULL THEN RAISE EXCEPTION 'QA195_SOURCE_RELATION_REQUIRED';END IF;
 SELECT k.conname,pg_get_constraintdef(k.oid) AS definition INTO STRICT c FROM pg_constraint k
 WHERE k.conrelid=r AND k.contype='c' AND(SELECT array_agg(a.attname::text ORDER BY a.attname COLLATE "C") FROM unnest(k.conkey) u(n) JOIN pg_attribute a ON a.attrelid=r AND a.attnum=u.n)=${keys};
 ${action}END $qa195_layout_mutation$`;
}
export function verifyNativeFamily195PublicLayoutOn190(h){
 assert.ok(h&&typeof h.json==='function'&&typeof h.read==='function'&&typeof h.check==='function');
 assert.equal(h.major,17);assert.equal(h.qa.major,17);assert.equal(h.qa.sourceCommit,h.sourceCommit);assert.equal(h.sourceCustody.sourceCommit,h.sourceCommit);
 const schema=h.qa.schema;assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.equal(typeof h.qa.normalized,'function');
 const prepared=prepareNativeFamily195PublicMaterialPreflight({read:h.read,sourceCommit:h.sourceCommit,major:17});
 const query=h.qa.normalized(prepared.statements.at(-1));
 assert.ok(query.includes(schema+'.'));assert.equal(query.includes("to_regclass('public.'||name)"),false,'QA195_EXISTING_RELOCATION_REQUIRED');
 const absent=h.json([`SELECT jsonb_build_object('absent',to_regclass(${q(schema+'.native_family_request')}) IS NULL)`],{readOnly:true});assert.equal(absent.absent,true,'QA195_LAYOUT_MUST_PRECEDE_195');
 const inspect=(mutations=[],settings=searchPath)=>h.json([settings,...mutations,query],{end:'ROLLBACK',readOnly:mutations.length===0,fullJson:true});
 const baseline=inspect();assert.equal(baseline.version,'native-family195-prerequisite-table-layout.v1');assert.equal(baseline.contractSha256,prepared.layout.contractSha256);assert.equal(baseline.serverVersionNum/10000|0,17);assert.equal(baseline.searchPath,'pg_catalog, public, pg_temp');assert.equal(baseline.relations,8);assert.deepEqual(baseline.mismatches,[]);
 const mutate=(table,columns,options)=>changeCheck(schema,table,columns,options);
 const cases=[
  ['weakened-same-columns',[mutate('school_certificate_blob',['byte_length'],{definition:'CHECK (byte_length BETWEEN 0 AND 2097152)'})],'check'],
  ['substitution-same-count',[mutate('school_certificate_blob',['content'],{definition:"CHECK (sha256 ~ '^[a-f0-9]{64}$')"})],'check'],
  ['duplicate-exact',[mutate('employee_family_member',['dni'],{duplicate:true})],'check'],
  ['omitted-check',[mutate('school_certificate_record',['id','supersedes_id'],{drop:true})],'constraint-inventory'],
  ['different-cast',[mutate('employee_family_member',['birth_date'],{definition:"CHECK (birth_date::timestamp without time zone BETWEEN TIMESTAMP '1900-01-01' AND TIMESTAMP '2100-12-31')"})],'check'],
  ['different-operator',[mutate('school_certificate_storage_policy',['generation'],{definition:'CHECK (NOT (generation < 0))'})],'check'],
  ['different-value',[mutate('school_certificate_record',['family_kind'],{definition:"CHECK (family_kind IN ('grh','own','other'))"})],'check'],
  ['named102-member-branch',[mutate('employee_family_member',['native_registration_id','source_batch_id'],{definition:'CHECK ((native_registration_id IS NULL) OR ((native_registration_id IS NOT NULL) AND (source_batch_id IS NULL)))'})],'check'],
  ['named102-school-branch',[mutate('school_certificate_record',['family_kind','native_registration_id','source_batch_id','source_cutoff','source_database'],{definition:"CHECK (((native_registration_id IS NULL) AND (source_database IS NOT NULL) AND (source_cutoff IS NOT NULL)) OR ((native_registration_id IS NOT NULL) AND (source_batch_id IS NULL) AND (source_database IS NULL) AND (source_cutoff IS NULL) AND family_kind='own'))"})],'check'],
  ['source-named-check-renamed',[mutate('employee_family_member',['native_registration_id','source_batch_id'],{rename:true})],'check'],
  ['autogenerated-name-has-no-authority',[mutate('school_certificate_blob',['sha256'],{rename:true})],null]
 ];
 const results=[];
 for(const[name,statements,area]of cases){
  const observed=inspect(statements);assert.equal(observed.searchPath,baseline.searchPath);assert.equal(observed.contractSha256,baseline.contractSha256);
  if(area)assert.ok(observed.mismatches.some(x=>x.area===area),'QA195_MUTATION_NOT_DETECTED:'+name);else assert.deepEqual(observed.mismatches,[]);
  assert.deepEqual(inspect(),baseline,'QA195_ROLLBACK_LAYOUT_CHANGED:'+name);results.push({name,expectedMismatchArea:area,rollbackReadbackVerified:true});
 }
 const foreignPath=inspect([],"SET LOCAL search_path='pg_catalog'");assert.notEqual(foreignPath.searchPath,baseline.searchPath);assert.ok(foreignPath.mismatches.some(x=>x.area==='check'));assert.deepEqual(inspect(),baseline);
 const generation=`DO $qa195_generation$ DECLARE n bigint;v bigint;BEGIN UPDATE ${schema}.school_certificate_storage_policy SET generation=generation+1 WHERE singleton RETURNING generation INTO v;GET DIAGNOSTICS n=ROW_COUNT;IF n<>1 OR v IS NULL OR v<=0 THEN RAISE EXCEPTION 'QA195_POLICY_FIXTURE_REQUIRED';END IF;END $qa195_generation$`;
 for(const key of ['tenantId','membershipId','actorSessionId'])assert.match(h.qa.actor[key],/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
 // One synthetic context-audit fixture row, using only the existing canonical
 // actor/session/binding. No new identity, writer command or capability grant.
 const history=`DO $qa195_history$ DECLARE n bigint;BEGIN
 INSERT INTO ${schema}.employee_family_member_event(tenant_id,source_binding_id,actor_membership_id,actor_session_id,operation)
 SELECT ${q(h.qa.actor.tenantId)}::uuid,b.id,${q(h.qa.actor.membershipId)}::uuid,${q(h.qa.actor.actorSessionId)}::uuid,'context' FROM ${schema}.platform_tenant_source_binding b
 WHERE b.tenant_id=${q(h.qa.actor.tenantId)}::uuid AND b.verified;
 GET DIAGNOSTICS n=ROW_COUNT;IF n<>1 OR NOT EXISTS(SELECT 1 FROM ${schema}.employee_family_member_event) THEN RAISE EXCEPTION 'QA195_EXISTING_ACTOR_FIXTURE_REQUIRED';END IF;END $qa195_history$`;
 assert.deepEqual(inspect([generation,history]),baseline,'QA195_LAYOUT_MUST_ACCEPT_EXISTING_HISTORY_AND_NONZERO_GENERATION');assert.deepEqual(inspect(),baseline);
 h.check('public195 PG17 table layout rejects weakened/replaced/duplicated/omitted constraints, casts, operators, values and both102 branches; exact rollbacks, generated-name neutrality and nonzero policy generation preserve the source layout');
 return Object.freeze({version:'native-family195-public-layout-native-qa.v1',passed:true,major:17,sourceCommit:h.sourceCommit,contractSha256:prepared.layout.contractSha256,constraints:60,mutations:results.length,results,foreignSearchPathRejected:true,nonzeroPolicyGenerationAccepted:true,nonemptyFamilyHistoryAccepted:true,syntheticContextAuditFixtureRowsRolledBack:1,identitiesAdded:0,production:false,productionWrites:0,municipalAcceptance:false});
}
