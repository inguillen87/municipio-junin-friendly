// SOURCE ONLY: canonical200 then whole201R4, relocalized inside existing190.
// Calling this future composer constructs source SQL. It never connects.
// No observed pg_proc body can become an expected source hash.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildOwnReportCensusInstallation,assertOwnReportCensusDurability} from './own-payroll-report-census-installation.mjs';
import {performancePreservationSnapshot} from '../verify-documentary-roster-performance.mjs';
const q=v=>"'"+String(v).replaceAll("'","''")+"'",hash=v=>createHash('sha256').update(v).digest('hex'),lf=v=>v.replace(/\r\n?/g,'\n');
export const OWN_FULL_CAPACITY_190_SQL='scripts/migrations/201-own-full-payroll-decision-capacity.sql';
export const OWN_FULL_CAPACITY_190_SQL_SHA256='46de1308360a076eff1453f57a9e4f4d6c14ba176d73cf8531b7b0821ed35b1b';
const body=d=>{const m=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?$/.exec(d);assert.ok(m,'M7_190_SOURCE_BODY');return m[2];};
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'M7_190_SOURCE_ANCHOR');return s.replace(a,()=>b);};
const clean=s=>s.replace(/^(?:\s*--[^\n]*(?:\n|$))+/g,'').trim();
const phase=(s,name)=>{const open='DO $'+name+'$',close='END $'+name+'$;',a=s.indexOf(open),b=s.indexOf(close,a);assert.ok(a>=0&&b>a,'M7_190_SOURCE_PHASE');assert.equal(s.indexOf(open,a+open.length),-1);return s.slice(a,b+close.length);};
const metadata=s=>{const m=/jsonb_array_elements\('((?:[^']|'')*)'::jsonb\)/.exec(s);assert.ok(m,'M7_190_SOURCE_METADATA');return{literal:m[0],items:JSON.parse(m[1].replaceAll("''","'"))};};
const definitions=s=>{const map=new Map();for(const m of s.matchAll(/\bCREATE(?: OR REPLACE)? FUNCTION public\.([a-z0-9_]+)\(([\s\S]*?)\bAS\s+(\$[\w]*\$)([\s\S]*?)\3/g)){assert.ok(!map.has(m[1]),'M7_190_SOURCE_OVERLOAD');map.set(m[1],m[0]);}return map;};
export function ownFullCapacity190Snapshot(h){
 return h.json([performancePreservationSnapshot(),"SELECT jsonb_build_object('fingerprint',encode(public.digest(current_setting('municontrol_documentary_install.after')::jsonb::text,'sha256'),'hex'))"],{readOnly:true});
}
// Compare every old row and security object. Only the declared3 checks,
// 8 legacy bodies+the census body and16 new functions are intentionally projected.
// All9 old function OIDs and non-body catalog fields remain in the comparison.
function conservation(h,{legacyNames,newNames}){
 const s=h.qa.schema,old=legacyNames.map(q).join(','),added=newNames.map(q).join(','),checks=['own_payroll_close_event_snapshot_check','own_payroll_close_event_receipt_check','own_payroll_annul_event_receipt_check'].map(q).join(',');
 const snapshot=slot=>`DO $m7_preservation$ DECLARE t record;rows_value jsonb:='[]';row_count bigint;row_hash text;BEGIN
 FOR t IN SELECT c.oid,c.relname FROM pg_class c WHERE c.relnamespace=${q(s)}::regnamespace AND c.relkind IN('r','p','m') ORDER BY c.oid LOOP
 EXECUTE format('SELECT count(*),encode(public.digest(coalesce(string_agg(to_jsonb(r)::text,chr(10) ORDER BY to_jsonb(r)::text COLLATE "C"),''''),''sha256''),''hex'') FROM %I.%I r',${q(s)},t.relname) INTO row_count,row_hash;
 rows_value:=rows_value||jsonb_build_array(jsonb_build_object('oid',t.oid,'rows',row_count,'sha256',row_hash));END LOOP;
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
 const proof=`SELECT jsonb_build_object('version','own-full-capacity-canonical190-installation.v1','sourceCommit',${q(h.sourceCommit)},'sourceSqlSha256',${q(OWN_FULL_CAPACITY_190_SQL_SHA256)},'priorStateSha256',encode(public.digest(current_setting('municontrol_capacity190.after')::jsonb::text,'sha256'),'hex'),'priorStatePreserved',true,'existingFunctionMetadataPreserved',true,'businessWrites',0,'newFunctions',16,'adaptedFunctions',9,'changedChecks',3)`;
 return{before:snapshot('before'),after:snapshot('after'),compare,proof};
}
export function composeOwnFullCapacity190Installation(h){
 assert.equal(h.qa.operationalPairBaseline,'published107');assert.match(h.qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.equal(typeof h.read,'function');
 const source=lf(h.read(OWN_FULL_CAPACITY_190_SQL));assert.equal(hash(source),OWN_FULL_CAPACITY_190_SQL_SHA256,'M7_190_UNREVIEWED_SQL201');
 const before=phase(source,'capacity_preflight'),after=phase(source,'capacity_postflight'),pre=metadata(before),post=metadata(after);assert.equal(pre.items.length,11);assert.equal(post.items.length,27);
 const graph=h.qa.foundation.foundation.foundation.owner.graph;assert.ok(graph.pool instanceof Map,'M7_190_CANONICAL_POOL_REQUIRED');
 const census=buildOwnReportCensusInstallation({read:h.read,sourceCommit:h.sourceCommit});
 const byName=definitions(source);assert.equal(byName.size,25,'M7_190_WHOLE_201_FUNCTION_SET');
 const priorDefinitions=new Map(pre.items.map(p=>{const original=p.name==='own_close_report_census_v1'?clean(census.migration[0]):graph.pool.get(p.signature+'|'+p.bodySha256);assert.ok(original,'M7_190_CANONICAL_PREDECESSOR_MISSING:'+p.signature);assert.equal(hash(body(original)),p.bodySha256,'M7_190_PREDECESSOR_SOURCE_BODY');return[p.name,original];}));
 const mapRecord=(record,predecessor)=>{const original=predecessor?priorDefinitions.get(record.name):byName.get(record.name)??priorDefinitions.get(record.name);assert.ok(original,'M7_190_CANONICAL_POST_SOURCE_MISSING');assert.equal(hash(body(original)),record.bodySha256,'M7_190_METADATA_SOURCE_MISMATCH');const local=h.qa.normalized(original);return{...record,signature:record.signature.replace('public.',h.qa.schema+'.'),config:record.config.map(c=>c.replace('search_path=pg_catalog, public, pg_temp','search_path=pg_catalog, '+h.qa.schema+', public, pg_temp')),bodySha256:hash(body(local))};};
 const preLocal=pre.items.map(p=>mapRecord(p,true)),postLocal=post.items.map(p=>mapRecord(p,false));
 let local=once(source,pre.literal,'jsonb_array_elements('+q(JSON.stringify(preLocal))+'::jsonb)');local=once(local,post.literal,'jsonb_array_elements('+q(JSON.stringify(postLocal))+'::jsonb)');
 local=h.qa.normalized(local);
 // The census-successor guard is outside either JSON metadata array. Its
 // expected digest is still derived from the exact source200 definition.
 const rawCensus=pre.items.find(p=>p.name==='own_close_report_census_v1'),localCensus=preLocal.find(p=>p.name===rawCensus.name);local=local.replaceAll(rawCensus.bodySha256,localCensus.bodySha256);
 const legacyNames=post.items.filter(p=>p.kind==='legacy'||p.kind==='known_census_successor').map(p=>p.name),newNames=post.items.filter(p=>p.kind==='core'||p.kind==='full').map(p=>p.name);assert.equal(legacyNames.length,9);assert.equal(newNames.length,16);
 const keep=conservation(h,{legacyNames,newNames}),postflight=phase(local,'capacity_postflight');
 const censusDefinition=h.qa.normalized(census.migration[0]),censusHash=hash(body(censusDefinition)),n=s=>h.qa.normalized(s).replaceAll(census.ownPin.sha256,censusHash);
 return{census,censusStatements:census.statements.map(n),censusVerification:census.verification.map(n),sourceSha256:hash(source),preLocal,postLocal,local,postflight,statements:[keep.before,local,keep.after,keep.compare,keep.proof],verification:[postflight,keep.after,keep.proof],scope:'same canonical190 source pool and transaction; independent200 admission precedes201R4; old200 verifier is never used after201'};
}
export async function installOwnFullCapacity190(h){
 const plan=composeOwnFullCapacity190Installation(h),before=ownFullCapacity190Snapshot(h),rehearsal=h.json(plan.censusStatements,{end:'ROLLBACK'});assert.equal(rehearsal.mode,'install');assert.deepEqual(ownFullCapacity190Snapshot(h),before);
 const installed=h.json(plan.censusStatements),durable=h.json(plan.censusVerification,{readOnly:true});assertOwnReportCensusDurability({installed,durable,batch:plan.census});const repeated=h.json(plan.censusStatements);assertOwnReportCensusDurability({installed:repeated,durable,batch:plan.census});
 // Admission200 remains a distinct epoch and artifact before ANY201 execution.
 h.check('M7 canonical200 old-epoch rehearsal/install/durable/repeat completed before201 successor');
 const at200=ownFullCapacity190Snapshot(h),fullRehearsal=h.json(plan.statements,{end:'ROLLBACK'});assert.equal(fullRehearsal.priorStatePreserved,true);assert.deepEqual(ownFullCapacity190Snapshot(h),at200);
 // Untrusted default ACL must fail the complete same transaction, not be reset.
 await assert.rejects(async()=>h.json([`ALTER DEFAULT PRIVILEGES IN SCHEMA ${h.qa.schema} GRANT EXECUTE ON FUNCTIONS TO pg_monitor`,...plan.statements],{end:'ROLLBACK'}),e=>/OWN_DECISION_CAPACITY_DEFAULT_ACL_CHANGED/.test(e.message));assert.deepEqual(ownFullCapacity190Snapshot(h),at200);
 const fullInstalled=h.json(plan.statements),fullDurable=h.json(plan.verification,{readOnly:true});assert.deepEqual(fullDurable,fullInstalled);assert.equal(fullDurable.businessWrites,0);assert.equal(fullDurable.priorStatePreserved,true);
 h.check('M7 whole201R4 rehearsal/commit/fresh postflight preserves old rows/authority/ACL and rejects inherited third-party defaults');
 return{version:'own-full-capacity-canonical190-epochs.v1',sourceSqlSha256:plan.sourceSha256,epoch200:{installed,durable,repeated},epoch201:{rehearsal:fullRehearsal,installed:fullInstalled,durable:fullDurable},plan};
}
