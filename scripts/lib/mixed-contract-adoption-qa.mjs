// Canonical185 foundation plus a complete fictional final-backup delta.
// Pure construction only: no database, connection, writer or host evaluation.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {buildOwnerDecisionQa,ownerDecisionQaHash as hash,ownerDecisionQaLiteral as q,ownerDecisionQaColumnAudit} from './municipal-owner-adoption-decision-qa.mjs';
import {buildMixedContractAdoptionInstallation} from './mixed-contract-adoption-installation.mjs';
import {buildFinalGrhSourceReviewAdmissionInstallation,FINAL_REVIEW_ADMISSION_PROFILES} from './final-grh-source-review-admission-installation.mjs';

const json=v=>q(JSON.stringify(v))+'::jsonb';
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'MIXED_QA_SOURCE_ANCHOR_CHANGED:'+a.slice(0,70));return s.replace(a,()=>b);};
const body=d=>{const m=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?$/.exec(d);assert.ok(m,'MIXED_QA_BODY_REQUIRED');return m[2];};
const coreEntities=['payrollRuns','payrollSnapshot','movements','payrollMonthly','employmentReconciliation'];
const curatedEntities=['grh_employees','grh_absences','grh_leaves','grh_family','grh_catalog_rows'];
export const MIXED_QA_COUNTS=Object.freeze({source:71,known:65,selected:49,deferred:14,archived:2,pending:6,adopted:0});

// Unknown identities have only original numeric GRH person/employee keys. They
// deliberately have no application UUID, person row, contract row or crosswalk.
export function mixedQaPendingSourceRows(){
 return Array.from({length:6},(_,n)=>{
  const legajo=String(99001+n),sourcePersonId=880001+n,dni=String(97000001+n),name='Identidad de origen ficticia pendiente QA186';
  return {company_id:101,legajo,person_id:sourcePersonId,nombre:name,dni,fecha_ingreso:'2000-01-01',fecha_egreso:null,activo:true,
   convenio_code:'1',categoria_code:'1',cargo_code:'1',sector_code:'1',source_payload:{personId:sourcePersonId,
    identity:{documentNumber:dni,cuil:null,fullName:name,birthDate:null,sexLabel:null,sexCode:null},employment:{activeProxy:true,organizationId:'1'},sourceFields:{iddepartamento:'1'},
    sourceKey:{companyCode:'101',employeeNumber:legajo},sourceProvenance:{table:'legajo',primaryKey:{CODI_01:'101',LEGA_12:legajo}},
    sourceReferences:{department:{table:'departamento',primaryKey:{iddepartamento:'1'},sourceFields:{nombre:'042'}}}}};
 });
}

/** Parent061/098 stays complete and unchanged. All new/changed source facts are
 * final144 deltas, declared and fingerprinted before the original final seal.
 * This never creates or selects a contract for one of the six pending rows. */
export function mixedQaFinalSourceSeed(owner){
 assert.equal(owner.rows.length,65);assert.equal(owner.rows.filter(r=>r.active).length,63);
 const deferred=owner.rows.filter(r=>r.active).slice(0,14),pending=mixedQaPendingSourceRows();
 assert.equal(deferred.length,14);assert.equal(new Set(pending.map(r=>r.legajo)).size,6);
 const coreArray='ARRAY['+coreEntities.map(q).join(',')+']',curatedArray='ARRAY['+curatedEntities.map(q).join(',')+']';
 const declare='DO $parents$ DECLARE fp jsonb;ev jsonb;counts jsonb;publication text;BEGIN';
 let seed=once(owner.seed,declare,declare.replace('publication text;','publication text;mixed_deltas jsonb;'));
 const start=" SELECT jsonb_object_agg(entity,jsonb_build_object('baseline',fingerprint,'candidate',fingerprint,'changes',jsonb_build_object('add',0,'remove',0,'replace',0))) INTO ev FROM";
 const end=' INSERT INTO grh_final_source_revision(';
 const a=seed.indexOf(start),b=seed.indexOf(end,a);assert.ok(a>=0&&b>a,'MIXED_QA_FINAL_EVIDENCE_ANCHOR');
 assert.equal(seed.indexOf(start,a+1),-1);assert.equal(seed.indexOf(end,b+1),-1);
 const deltaSql=`
 WITH source_rows AS(SELECT value AS record FROM jsonb_array_elements(${json(pending)})),
 pending_rows AS(SELECT public.grh_curated_source_record_v1('grh_employees',to_jsonb(jsonb_populate_record(NULL::public.grh_employees,record))) record FROM source_rows),
 deltas AS(
 SELECT 'core/employmentReconciliation'::text entity,
 encode(public.digest(format('{"companyCode":%s,"employeeNumber":%s}',to_json('101'::text),to_json(record->>'legajo')),'sha256'),'hex') row_key,
 'add'::text operation,NULL::jsonb previous_record,
 jsonb_build_object('company_source_id','101','employee_number',record->>'legajo','administrative_active',true,'liquidated_current',false,'evidence_status','synthetic_explicit','last_payroll_date',NULL) record,
 jsonb_build_object('companyCode','101','employeeNumber',record->>'legajo','administrativeActive',true,'liquidatedCurrent',false,'evidenceStatus','synthetic_explicit') source_payload FROM pending_rows
 UNION ALL SELECT 'curated/grh_employees',public.grh_curated_source_key_v1('grh_employees',record),'add',NULL,record,NULL FROM pending_rows
 UNION ALL SELECT 'curated/grh_employees',r.row_key,'replace',r.record,r.record||jsonb_build_object('fecha_ingreso',NULL),NULL
 FROM public.grh_curated_source_unsealed_rows_v1(${q(owner.ids.curated)},'grh_employees') r
 WHERE r.record->>'legajo'=ANY(ARRAY[${deferred.map(r=>q(r.legajo)).join(',')}]))
 SELECT jsonb_agg(to_jsonb(d) ORDER BY d.entity,d.row_key) INTO mixed_deltas FROM deltas d;
 IF jsonb_array_length(mixed_deltas)<>26 THEN RAISE EXCEPTION 'MIXED_QA_DELTA_COUNT_CHANGED';END IF;
 WITH base_rows AS(
 SELECT 'core/'||e entity,r.source_id row_key,r.record FROM unnest(${coreArray}) e CROSS JOIN LATERAL public.grh_core_source_unsealed_rows_v1(${q(owner.ids.core)},e) r
 UNION ALL SELECT 'curated/'||e,r.row_key,r.record FROM unnest(${curatedArray}) e CROSS JOIN LATERAL public.grh_curated_source_unsealed_rows_v1(${q(owner.ids.curated)},e) r),
 delta_rows AS(SELECT v->>'entity' entity,v->>'row_key' row_key,v->>'operation' operation,v->'record' record FROM jsonb_array_elements(mixed_deltas) v),
 candidate_rows AS(SELECT b.* FROM base_rows b WHERE NOT EXISTS(SELECT 1 FROM delta_rows d WHERE (d.entity,d.row_key)=(b.entity,b.row_key)) UNION ALL SELECT entity,row_key,record FROM delta_rows),
 entities AS(SELECT unnest(public.grh_final_source_entities_v1()) entity),
 proof AS(SELECT e.entity,
 (SELECT jsonb_build_object('rows',count(*),'md5',md5(coalesce(string_agg(md5(r.row_key||r.record::text),'' ORDER BY r.row_key),''))) FROM base_rows r WHERE r.entity=e.entity) baseline,
 (SELECT jsonb_build_object('rows',count(*),'md5',md5(coalesce(string_agg(md5(r.row_key||r.record::text),'' ORDER BY r.row_key),''))) FROM candidate_rows r WHERE r.entity=e.entity) candidate,
 (SELECT jsonb_build_object('add',count(*) FILTER(WHERE d.operation='add'),'remove',0,'replace',count(*) FILTER(WHERE d.operation='replace')) FROM delta_rows d WHERE d.entity=e.entity) changes FROM entities e)
 SELECT jsonb_object_agg(entity,jsonb_build_object('baseline',baseline,'candidate',candidate,'changes',changes)) INTO ev FROM proof;
`;
 seed=seed.slice(0,a)+owner.relocate(deltaSql)+seed.slice(b);
 const seal=' INSERT INTO grh_final_source_seal SELECT ';
 const insert=` INSERT INTO grh_final_source_delta(revision_id,entity,row_key,operation,previous_record,record,source_payload)
 SELECT ${q(owner.ids.revision)},v->>'entity',v->>'row_key',v->>'operation',nullif(v->'previous_record','null'::jsonb),nullif(v->'record','null'::jsonb),nullif(v->'source_payload','null'::jsonb) FROM jsonb_array_elements(mixed_deltas) v;
`;
 seed=once(seed,seal,insert+seal);
 assert.ok(seed.indexOf('jsonb_agg(to_jsonb(d)')<seed.indexOf(end));assert.ok(seed.indexOf('INSERT INTO grh_final_source_delta')<seed.indexOf(seal));
 return {seed,counts:MIXED_QA_COUNTS,deferred,selected:owner.rows.filter(r=>r.active&&!deferred.includes(r)),pendingSourceRows:pending,deltaCounts:{coreAdd:6,curatedAdd:6,curatedReplace:14,total:26},parentSourceRows:65};
}

// A later cut appends a new review, leaving the original01 parents, revision,
// deltas and seal untouched. Only explicit fictional final144 deltas differ.
export function mixedQaOctober14Candidate(owner,revisionId){
 assert.match(revisionId,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);assert.notEqual(revisionId,owner.ids.revision);
 const fixture=mixedQaFinalSourceSeed(owner),start=fixture.seed.indexOf(' WITH source_rows AS('),end=fixture.seed.indexOf(' END $parents$',start);assert.ok(start>=0&&end>start);
 let candidate=fixture.seed.slice(start,end);assert.equal(candidate.split(q(owner.ids.revision)).length,5,'MIXED_QA_CANDIDATE_REVISION_ANCHOR');candidate=candidate.replaceAll(q(owner.ids.revision),q(revisionId));
 const [old,next]=FINAL_REVIEW_ADMISSION_PROFILES,tuple=p=>[q(p.profile),q(p.sha256),q(p.cutoff.replace('T',' '))].join(',');candidate=once(candidate,tuple(old),tuple(next));
 const sql=`DO $mixed_final14$ DECLARE ev jsonb;mixed_deltas jsonb;publication text;BEGIN
 SELECT publication_sha256 INTO STRICT publication FROM ${owner.schema}.grh_effective_source_binding WHERE tenant_id=${q(owner.ids.tenant)} AND source_binding_id=${q(owner.ids.binding)};
${candidate}
 END $mixed_final14$`;
 assert.doesNotMatch(sql,/\b(?:UPDATE|DELETE|CREATE|ALTER|DROP)\b/);assert.equal((sql.match(/INSERT INTO grh_final_source_/g)??[]).length,3);assert.ok(!sql.includes(q(owner.ids.revision)));
 return {sql,profile:next,originalRevisionId:owner.ids.revision,revisionId,originalProfile:old};
}

// The canonical183 QA relocator accepts the older144 fixture's inverse-hash
// convention and replaces it with a direct relocated-body hash itself. Adapt
// only that exact metadata expression; its emitted nine guards stay intact.
export function mixedQaAdmissionContext(qa,pins){
 assert.ok(qa.admission&&typeof pins==='string'&&pins.startsWith('IF '));
 const expression="replace(p.prosrc,E'\\r\\n',E'\\n')",inverse=`replace(${expression},${q(qa.schema+'.')},'public'||'.')`;
 return{schema:qa.schema,pins,normalized:sql=>{const value=qa.owner.relocate(sql);return sql===qa.admission.sourcePrerequisite.check?once(value,expression,inverse):value;}};
}

export function mixedQaAdmissionPhase(phase){
 assert.equal(phase.begin,'BEGIN');assert.ok(['COMMIT','ROLLBACK'].includes(phase.completion));assert.equal(typeof phase.readOnly,'boolean');assert.ok(Array.isArray(phase.statements));
 const characteristics=phase.statements.filter(s=>s.startsWith('SET TRANSACTION '));assert.deepEqual(characteristics,[...(phase.readOnly?['SET TRANSACTION READ ONLY']:[]),'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ']);
 return{statements:phase.statements.filter(s=>!characteristics.includes(s)),options:{readOnly:phase.readOnly,end:phase.completion}};
}

export function buildMixedContractAdoptionQa({major,sourceCommit,read,schema='mc_qa_fixed_092_'+randomUUID().replaceAll('-',''),profile='october01'}){
 assert.ok([17,18].includes(major));assert.match(sourceCommit,/^[a-f0-9]{40}$/);assert.equal(typeof read,'function');
 assert.ok(['october01','october14'].includes(profile),'MIXED_QA_PROFILE_REQUIRED');
 const owner=buildOwnerDecisionQa({major,sourceCommit,read,schema}),batch=buildMixedContractAdoptionInstallation({read,sourceCommit});
 const hashes={...owner.hashes},definitions=[...owner.definitions,owner.graph.batch.authority.newDefinition,...owner.graph.batch.definitions,owner.graph.batch.guard,owner.graph.batch.ready,...batch.newDefinitions,...batch.afterDefinitions];
 let stable=false;for(let pass=0;pass<16;pass++){let changed=false;for(const d of definitions){let relocated=owner.relocate(d);for(const[a,b]of Object.entries(hashes))relocated=relocated.replaceAll(a,b);const key=hash(body(d)),value=hash(body(relocated));if(hashes[key]!==value){hashes[key]=value;changed=true;}}if(!changed){stable=true;break;}}assert.ok(stable,'MIXED_QA_HASH_GRAPH_CYCLE');
 const normalized=sql=>{let result=owner.relocate(sql);for(const[a,b]of Object.entries(hashes))result=result.replaceAll(a,b);return result;};
 const local=Object.fromEntries(['rehearsal','installation','repetition','verification','rollback','rollbackVerification'].map(k=>[k,batch[k].map(normalized)]));
 const ownerLocal=Object.fromEntries(['rehearsal','installation','repetition','verification','rollback','rollbackVerification'].map(k=>[k,owner.graph.batch[k].map(normalized)]));
 const fixture=mixedQaFinalSourceSeed(owner),admission=profile==='october14'?buildFinalGrhSourceReviewAdmissionInstallation({read,sourceCommit,major}):null,later=admission?mixedQaOctober14Candidate(owner,randomUUID()):null,sourceHashes={...owner.sourceHashes,...batch.sourceHashes,...admission?.sourceHashes};
 const columnAudit=ownerDecisionQaColumnAudit(fixture.seed+';'+owner.graph.batch.statements.filter(s=>/^CREATE TABLE/.test(s)).map(normalized).join(';'),[...owner.definitions,...owner.graph.batch.definitions,...batch.newDefinitions,...batch.afterDefinitions]);assert.deepEqual(columnAudit.unknown,[],'MIXED_QA_COLUMN_MISSING');
 return {major,sourceCommit,schema,owner,batch,normalized,hashes,local,ownerLocal,sourceHashes,columnAudit,...fixture,...(later?{seed:owner.seed}:{}),profile,admission,later,actor:owner.actor,checker:owner.checker,ids:later?{...owner.ids,revision:later.revisionId}:owner.ids,connects:false,executesSql:false};
}

// Parameterized canonical RPCs only. This adapter never accepts caller SQL or
// a different schema, statement suffix, unused argument or host expression.
export function mixedQaQuery(text,args,schema){
 assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.ok(Array.isArray(args));
 const allowed=new Set(['employment_adoption_bootstrap_v1','employment_adoption_final_available_v1','employment_adoption_mixed_available_v1','employment_adoption_mixed_bootstrap_v1','employment_adoption_propose_v1','employment_adoption_attempt_v1','municipal_owner_adoption_authority_v1','municipal_owner_adoption_preview_v1','municipal_owner_adoption_command_v1','municipal_owner_adoption_attempt_v1','municipal_adoption_queue_v1','municipal_adoption_review_v1','municipal_adoption_command_v1','municipal_adoption_attempt_v1']);
 const m=/^SELECT public\.(\w+)\(((?:\$[1-9][0-9]*::(?:jsonb|uuid|text))(?:,\$[1-9][0-9]*::(?:jsonb|uuid|text))*)\) AS result$/.exec(text);assert.ok(m&&allowed.has(m[1]),'MIXED_QA_RPC_REQUIRED');
 const used=new Set(),result=text.replace('public.',schema+'.').replace(/\$(\d+)\b/g,(_,index)=>{const at=Number(index)-1;assert.ok(at>=0&&at<args.length);assert.equal(typeof args[at],'string');used.add(at);return q(args[at]);});assert.equal(used.size,args.length);return result;
}

//185 cannot be removed underneath186's later adapted readiness function. The
// predecessor metadata guard must identify that exact function before its own
// no-history check; a different SQL error is never treated as a successful test.
export function assertMixedQaPredecessorRollbackFailure(result,schema){
 assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.equal(result?.status,3);assert.equal(typeof result.stderr,'string');
 const lines=result.stderr.split(/\r?\n/),errors=lines.filter(s=>s.includes('ERROR:')),details=lines.filter(s=>s.startsWith('DETAIL:')).map(s=>s.replace(/^DETAIL:\s+/,''));
 assert.equal(errors.length,1);assert.ok(errors[0].endsWith('ERROR:  AGREEMENT_INSTALL_FUNCTION_CHANGED'));
 assert.deepEqual(details,[schema+'.municipal_adoption_ready_v1()']);return{refused:true,code:'AGREEMENT_INSTALL_FUNCTION_CHANGED',function:schema+'.municipal_adoption_ready_v1()'};
}

// PostgreSQL may test any of the three old, equally mandatory tuple CHECKs
// first. Require their exact relation/error/name, never a generic SQL failure.
export function assertMixedQaPreAdmissionFailure(result){
 assert.equal(result?.status,3);assert.equal(typeof result.stderr,'string');if(Object.hasOwn(result,'sqlState'))assert.equal(result.sqlState,'23514');const errors=result.stderr.split(/\r?\n/).filter(s=>s.includes('ERROR:'));assert.equal(errors.length,1);
 const match=/ERROR:  new row for relation "grh_final_source_revision" violates check constraint "(grh_final_source_revision_source_(?:profile|sha256|cutoff)_check)"$/.exec(errors[0]);assert.ok(match,'MIXED_QA_PRE_ADMISSION_CHECK_REQUIRED');return{refused:true,constraint:match[1]};
}
