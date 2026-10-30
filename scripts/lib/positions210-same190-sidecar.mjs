// Private complete source candidate. Author did not import or execute it.
// Future destination: scripts/lib/positions210-same190-sidecar.mjs.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assertPositions210SourcePlan} from './positions210-same190-installation.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
import {performancePreservationSnapshot} from '../verify-documentary-roster-performance.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const lf=value=>value.replace(/\r\n?/g,'\n');
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const SHA=/^[a-f0-9]{64}$/;
const SOURCE_PINS=Object.freeze({
 'scripts/migrations/128-own-position-assignments.sql':'d50a2a14e478868b4086514fc0ddd47bd116ba761a88b0a2ff28e36866ce1e78',
 'scripts/migrations/129-own-position-comparison.sql':'023ad52a441df027ea8121a404777fbe4424dbbcfcdbeca6ca30b7475e17bc3c',
 'scripts/lib/adopted-positions-installation.mjs':'b5e1f9185e42c3a3372b443e8d6383d8259b155217e9db48b121f5d07cc56ab9'
});
const SIDECARS=Object.freeze([
 Object.freeze({name:'own_payroll_run_position_capture',version:'own-position-population.v1'}),
 Object.freeze({name:'own_payroll_run_position_dimensions',version:'own-position-dimensions.v1'})
]);
// These are the existing, finite208/209 phase boundaries. Callers cannot add
// relation names or turn this into a general exemption mechanism.
const BUSINESS_PHASES=Object.freeze({
 calculation:Object.freeze(['own_payroll_run_capture','own_payroll_run_result']),
 annul208:Object.freeze(['own_payroll_run_capture','own_payroll_run_result','own_payroll_liquidation_event','own_payroll_annul_event']),
 annul209:Object.freeze(['own_payroll_run_capture','own_payroll_run_result','own_payroll_liquidation_event','own_payroll_annul_event','own_payroll_close_event']),
 agreement209:Object.freeze(['own_payroll_run_capture','own_payroll_run_result','own_payroll_liquidation_event']),
 confirmClose209:Object.freeze(['own_payroll_run_capture','own_payroll_run_result','own_payroll_liquidation_event','own_payroll_close_event'])
});
const PLANS=new WeakMap(),SNAPSHOTS=new WeakMap();
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function once(source,needle){assert.equal(source.split(needle).length,2,'POSITIONS210_SIDECAR_SOURCE_ANCHOR_CHANGED');}
function sourceBookend(read){
 assert.equal(typeof read,'function');
 for(const [file,sha256]of Object.entries(SOURCE_PINS))assert.equal(hash(lf(read(file))),sha256,'POSITIONS210_SIDECAR_SOURCE_CHANGED:'+file);
}
export const POSITIONS210_SIDECAR_SOURCE_ENTRIES=Object.freeze([
 'scripts/lib/positions210-same190-sidecar.mjs',
 'scripts/lib/positions210-same190-installation.mjs',
 'scripts/lib/native-leave-installation.mjs',
 'scripts/verify-documentary-roster-performance.mjs',
 ...Object.keys(SOURCE_PINS)
]);

// Pure composition: does not inspect a catalog, connect or invoke h/db.
// Runtime use additionally requires the installer's actual WeakMap admission.
export function composePositions210SidecarPlan({qa,major,sourceCommit,read,positions210Plan}){
 assert.ok(qa&&[17,18].includes(major));assert.equal(qa.major,major);assert.equal(qa.sourceCommit,sourceCommit);
 assert.match(sourceCommit,/^[a-f0-9]{40}$/);assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 assert.match(qa.actor.tenantId,UUID);assert.match(qa.ids.binding,UUID);sourceBookend(read);
 const p=positions210Plan;assert.equal(p?.version,'positions210-same190-source-plan.v1');
 assert.strictEqual(p.foundation,qa);assert.equal(p.major,major);assert.equal(p.sourceCommit,sourceCommit);assert.equal(p.schema,qa.schema);
 assert.equal(typeof p.normalized,'function');assert.deepEqual(p.stages.map(stage=>stage.id),['127','128','129','adopted-v2','210']);
 assert.equal(p.ledger.length,33);assert.equal(p.ledger.filter(row=>row.stage==='127-129').length,26);
 assert.equal(p.ledger.filter(row=>row.stage==='adopted-v2').length,5);assert.equal(p.ledger.filter(row=>row.stage==='210').length,2);
 for(const [file,sha256]of Object.entries(SOURCE_PINS))assert.equal(p.sourceHashes[file],sha256,'POSITIONS210_SIDECAR_PLAN_SOURCE_CHANGED:'+file);
 const s128=lf(read('scripts/migrations/128-own-position-assignments.sql')),s129=lf(read('scripts/migrations/129-own-position-comparison.sql'));
 once(s128,'capture_id uuid PRIMARY KEY REFERENCES public.own_payroll_run_capture(id)');
 once(s129,'capture_id uuid PRIMARY KEY REFERENCES public.own_payroll_run_capture(id)');
 once(s128,'CREATE TRIGGER own_run_position_capture AFTER INSERT ON public.own_payroll_run_capture FOR EACH ROW EXECUTE FUNCTION public.position_assignment_capture_trigger_v1()');
 once(s129,'CREATE TRIGGER own_run_position_dimensions AFTER INSERT ON public.own_payroll_run_capture FOR EACH ROW EXECUTE FUNCTION public.position_comparison_capture_trigger_v1()');
 const finalPins=new Map();for(const stage of p.stages)for(const pin of stage.after)finalPins.set(pin.signature,pin);
 const names=['position_assignment_immutable_v1','position_assignment_capture_trigger_v1','position_comparison_immutable_v1','position_comparison_capture_trigger_v1'];
 const required=names.map(name=>{const pin=finalPins.get('public.'+name+'()');assert.ok(pin,'POSITIONS210_SIDECAR_FINAL_PIN_MISSING:'+name);assert.equal(pin.runtime,false);assert.equal(pin.resultType,'trigger');assert.equal(pin.definer,true);assert.match(pin.sha256,SHA);return pin;});
 const plan=Object.freeze({version:'positions210-same190-sidecar-plan.v1',schema:qa.schema,major,sourceCommit,
  sourceHashes:SOURCE_PINS,sourceEntries:POSITIONS210_SIDECAR_SOURCE_ENTRIES,
  metadataCheck:p.normalized(pinsCheck(required,'POSITIONS210_SIDECAR_FUNCTION_CHANGED')),
  connects:false,executesSql:false,production:false});
 PLANS.set(plan,{qa,read,positions210Plan:p,tenantId:qa.actor.tenantId,bindingId:qa.ids.binding});return plan;
}

export function assertPositions210SidecarPlan({h,db,plan}){
 const record=PLANS.get(plan);assert.ok(record,'POSITIONS210_SIDECAR_UNMINTED_PLAN');
 assert.ok(h&&db&&typeof h.json==='function');assert.strictEqual(h.qa,record.qa);assert.equal(h.major,plan.major);assert.equal(h.sourceCommit,plan.sourceCommit);
 assert.strictEqual(h.prepared?.positions210,record.positions210Plan,'POSITIONS210_SIDECAR_PREPARED_PLAN_CHANGED');
 assert.strictEqual(assertPositions210SourcePlan(h,record.positions210Plan),record.positions210Plan);
 sourceBookend(record.read);return plan;
}

function identityAggregate(expression){
 return `(SELECT jsonb_build_object(
  'count',count(*)::integer,
  'distinctContracts',count(DISTINCT e->>'contractId')::integer,
  'valid',coalesce(bool_and(coalesce(jsonb_typeof(e)='object'
   AND jsonb_typeof(e->'contractId')='string' AND (e->>'contractId')~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
   AND jsonb_typeof(e->'employeeNumber')='string' AND btrim(e->>'employeeNumber')<>''
   AND jsonb_typeof(e->'identityToken')='string' AND (e->>'identityToken')~'^[a-f0-9]{64}$',false)),false),
  'sha256',encode(public.digest(coalesce(jsonb_agg(jsonb_build_array(e->>'contractId',e->>'employeeNumber',e->>'identityToken')
    ORDER BY e->>'contractId' COLLATE "C",e->>'employeeNumber' COLLATE "C",e->>'identityToken' COLLATE "C"),'[]'::jsonb)::text,'sha256'),'hex'))
  FROM jsonb_array_elements(${expression}) e)`;
}
function compactRows(plan){
 const schema=plan.schema,sourceIdentity=identityAggregate("c.payload#>'{population,employees}'");
 const sidecarQuery=sidecar=>`(SELECT coalesce(jsonb_agg(jsonb_build_object(
   'captureId',s.capture_id,'rowSha256',encode(public.digest(to_jsonb(s)::text,'sha256'),'hex'),
   'tenantId',s.tenant_id,'bindingId',s.source_binding_id,'capturePayloadSha256',s.capture_payload_sha256,
   'payloadSha256',s.payload_sha256,'calculatedPayloadSha256',encode(public.digest(s.payload::text,'sha256'),'hex'),
   'version',s.payload->>'version','populationVersion',s.payload->>'populationVersion','complete',s.payload->'complete',
   'employeeCount',s.payload->'employeeCount','population',${identityAggregate("s.payload->'employees'")}) ORDER BY s.capture_id),'[]'::jsonb)
   FROM ${schema}.${sidecar.name} s)`;
 return `SELECT jsonb_build_object('version','positions210-same190-sidecar-snapshot.v1',
  'schema',${q(schema)},'sourceCommit',${q(plan.sourceCommit)},
  'preservation',current_setting('municontrol_documentary_install.after')::jsonb,
  'prefix',current_setting('municontrol_positions210_sidecar.prefix')::jsonb,
  'captures',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,
   'rowSha256',encode(public.digest(to_jsonb(c)::text,'sha256'),'hex'),
   'tenantId',c.tenant_id,'bindingId',c.source_binding_id,'payloadSha256',c.payload_sha256,
   'calculatedPayloadSha256',encode(public.digest(c.payload::text,'sha256'),'hex'),
   'populationVersion',c.payload#>>'{population,version}','population',${sourceIdentity}) ORDER BY c.id),'[]'::jsonb)
   FROM ${schema}.own_payroll_run_capture c),
  'positions',${sidecarQuery(SIDECARS[0])},'dimensions',${sidecarQuery(SIDECARS[1])})`;
}
function objectGuard(plan){
 const schema=plan.schema;
 const columns=[['capture_id','uuid',true,null],['tenant_id','uuid',true,null],['source_binding_id','uuid',true,null],
  ['capture_payload_sha256','text',true,null],['payload','jsonb',true,null],['payload_sha256','text',true,null],['recorded_at','timestamp with time zone',true,'clock_timestamp()']];
 const triggers=[
  ['own_payroll_run_capture','own_run_position_capture','position_assignment_capture_trigger_v1',5],
  ['own_payroll_run_capture','own_run_position_dimensions','position_comparison_capture_trigger_v1',5],
  ['own_payroll_run_position_capture','position_capture_immutable','position_assignment_immutable_v1',27],
  ['own_payroll_run_position_capture','position_capture_no_truncate','position_assignment_immutable_v1',34],
  ['own_payroll_run_position_dimensions','position_dimensions_immutable','position_comparison_immutable_v1',27],
  ['own_payroll_run_position_dimensions','position_dimensions_no_truncate','position_comparison_immutable_v1',34]
 ];
 return `DO $positions210_sidecar_objects$ DECLARE expected jsonb;relation pg_class;actual jsonb;tr pg_trigger;BEGIN
 FOR expected IN SELECT value FROM jsonb_array_elements(${q(JSON.stringify(SIDECARS.map(s=>s.name)))}::jsonb) LOOP
  SELECT * INTO relation FROM pg_class WHERE oid=to_regclass(${q(schema+'.')}||(expected#>>'{}'));
  IF relation.oid IS NULL OR relation.relowner<>current_user::regrole OR relation.relkind<>'r' OR NOT relation.relrowsecurity
    OR EXISTS(SELECT 1 FROM aclexplode(coalesce(relation.relacl,acldefault('r',relation.relowner))) a WHERE a.grantee<>relation.relowner)
  THEN RAISE EXCEPTION 'POSITIONS210_SIDECAR_TABLE_CHANGED';END IF;
  SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
   INTO actual FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
   WHERE a.attrelid=relation.oid AND a.attnum>0 AND NOT a.attisdropped;
  IF actual IS DISTINCT FROM ${q(JSON.stringify(columns))}::jsonb OR(SELECT count(*) FROM pg_trigger WHERE tgrelid=relation.oid AND NOT tgisinternal)<>2
  THEN RAISE EXCEPTION 'POSITIONS210_SIDECAR_COLUMNS_OR_TRIGGERS_CHANGED';END IF;
 END LOOP;
 FOR expected IN SELECT value FROM jsonb_array_elements(${q(JSON.stringify(triggers))}::jsonb) LOOP
  SELECT * INTO tr FROM pg_trigger WHERE tgrelid=to_regclass(${q(schema+'.')}||(expected->>0)) AND tgname=expected->>1 AND NOT tgisinternal;
  IF tr.oid IS NULL OR tr.tgfoid IS DISTINCT FROM to_regprocedure(${q(schema+'.')}||(expected->>2)||'()') OR tr.tgtype IS DISTINCT FROM(expected->>3)::smallint
    OR tr.tgenabled<>'O' OR tr.tgnargs<>0 OR tr.tgattr<>''::int2vector OR tr.tgqual IS NOT NULL OR octet_length(tr.tgargs)<>0
    OR tr.tgconstraint<>0 OR tr.tgdeferrable OR tr.tginitdeferred OR tr.tgparentid<>0 OR tr.tgoldtable IS NOT NULL OR tr.tgnewtable IS NOT NULL
  THEN RAISE EXCEPTION 'POSITIONS210_SIDECAR_TRIGGER_CHANGED';END IF;
 END LOOP;END $positions210_sidecar_objects$`;
}
function prefixSql(plan){
 return `DO $positions210_sidecar_prefix$ DECLARE relation record;items jsonb;result jsonb:='[]';BEGIN
 FOR relation IN SELECT c.oid,c.relname FROM pg_class c WHERE c.relnamespace=${q(plan.schema)}::regnamespace AND c.relkind IN('r','p','m') ORDER BY c.oid LOOP
  EXECUTE format('SELECT coalesce(jsonb_agg(jsonb_build_object(''sha256'',x.sha256,''count'',x.total) ORDER BY x.sha256),''[]''::jsonb) FROM(SELECT encode(public.digest(to_jsonb(r)::text,''sha256''),''hex'') sha256,count(*) total FROM %I.%I r GROUP BY 1)x',${q(plan.schema)},relation.relname) INTO items;
  result:=result||jsonb_build_array(jsonb_build_object('oid',relation.oid,'name',relation.relname,'hashes',items));
 END LOOP;PERFORM set_config('municontrol_positions210_sidecar.prefix',result::text,true);END $positions210_sidecar_prefix$`;
}
function uniqueRows(rows,key){
 assert.ok(Array.isArray(rows));const map=new Map();for(const row of rows){assert.match(row[key],UUID);assert.match(row.rowSha256,SHA);assert.ok(!map.has(row[key]),'POSITIONS210_SIDECAR_DUPLICATE_ID');map.set(row[key],row);}return map;
}
function assertBijection(value,record){
 const captures=uniqueRows(value.captures,'id'),sides=[uniqueRows(value.positions,'captureId'),uniqueRows(value.dimensions,'captureId')];
 const ids=[...captures.keys()].sort();for(const side of sides)assert.deepEqual([...side.keys()].sort(),ids,'POSITIONS210_SIDECAR_CAPTURE_ID_BIJECTION_CHANGED');
 for(const capture of captures.values()){
  assert.equal(capture.tenantId,record.tenantId);assert.equal(capture.bindingId,record.bindingId);
  assert.match(capture.payloadSha256,SHA);assert.equal(capture.calculatedPayloadSha256,capture.payloadSha256);
  assert.match(capture.populationVersion,SHA);assert.equal(capture.population.valid,true);
  assert.ok(Number.isSafeInteger(capture.population.count)&&capture.population.count>=1&&capture.population.count<=10000);
  assert.equal(capture.population.distinctContracts,capture.population.count);assert.match(capture.population.sha256,SHA);
  for(let index=0;index<sides.length;index++){
   const side=sides[index].get(capture.id);assert.equal(side.tenantId,capture.tenantId);assert.equal(side.bindingId,capture.bindingId);
   assert.equal(side.capturePayloadSha256,capture.payloadSha256);assert.match(side.payloadSha256,SHA);assert.equal(side.calculatedPayloadSha256,side.payloadSha256);
   assert.equal(side.version,SIDECARS[index].version);assert.equal(side.complete,true);assert.equal(side.populationVersion,capture.populationVersion);
   assert.equal(side.employeeCount,capture.population.count);assert.deepEqual(side.population,capture.population,'POSITIONS210_SIDECAR_EMPLOYEE_IDENTITY_BIJECTION_CHANGED');
  }
 }
 return {captures,sides};
}

// One owned canonical h.json transaction, with its existing RR READ ONLY
// envelope. No business facade, own_run_lock, SET ROLE or mutating statement.
// db identifies the SAME binding in subsequent comparisons; transport is h.json.
export function readPositions210SidecarSnapshot({h,db,plan}){
 assertPositions210SidecarPlan({h,db,plan});
 const value=h.json([plan.metadataCheck,objectGuard(plan),performancePreservationSnapshot(),prefixSql(plan),compactRows(plan)],{readOnly:true,fullJson:true});
 assert.equal(value?.version,'positions210-same190-sidecar-snapshot.v1');assert.equal(value.schema,plan.schema);assert.equal(value.sourceCommit,plan.sourceCommit);
 const record=PLANS.get(plan);assertBijection(value,record);assert.ok(Array.isArray(value.preservation?.tables)&&value.preservation.tables.length>0);
 assert.ok(Array.isArray(value.prefix)&&value.prefix.length>0);freeze(value);SNAPSHOTS.set(value,{h,db,plan,serialized:JSON.stringify(value)});return value;
}
function mintedSnapshot(value,{h,db,plan}){
 const minted=SNAPSHOTS.get(value);assert.ok(minted,'POSITIONS210_SIDECAR_UNMINTED_SNAPSHOT');
 assert.strictEqual(minted.h,h);assert.strictEqual(minted.db,db);assert.strictEqual(minted.plan,plan);assert.equal(JSON.stringify(value),minted.serialized);return value;
}
function assertPrefix(before,after){
 assert.equal(after.length,before.length);assert.equal(new Set(before.map(row=>row.oid)).size,before.length);assert.equal(new Set(after.map(row=>row.oid)).size,after.length);
 for(const old of before){const next=after.find(row=>row.oid===old.oid);assert.ok(next);assert.equal(next.name,old.name);
  const prior=new Map(old.hashes.map(row=>[row.sha256,row.count])),current=new Map(next.hashes.map(row=>[row.sha256,row.count]));
  assert.equal(prior.size,old.hashes.length);assert.equal(current.size,next.hashes.length);
  for(const [sha,count]of prior){assert.match(sha,SHA);assert.ok(Number.isSafeInteger(count)&&count>0);assert.ok((current.get(sha)??0)>=count,'POSITIONS210_SIDECAR_PRIOR_ROW_CHANGED_OR_REMOVED');}
 }
}
function projection(value,schema,names){
 const copy=structuredClone(value);for(const name of names){const tables=copy.tables.filter(row=>row.schema===schema&&row.name===name);assert.equal(tables.length,1);delete tables[0].rows;delete tables[0].rowsSha256;}return copy;
}

// newCaptureIds is mandatory and comes from actual command/attempt responses,
// including pending own_run_capture_v1 results. It is never inferred from the
// saved-result index or supplied as a replacement for the database inventory.
export function assertPositions210SidecarDelta({h,db,plan,before,after,phase,newCaptureIds}){
 assertPositions210SidecarPlan({h,db,plan});mintedSnapshot(before,{h,db,plan});mintedSnapshot(after,{h,db,plan});
 assert.ok(Object.hasOwn(BUSINESS_PHASES,phase),'POSITIONS210_SIDECAR_PHASE_INVALID');assert.ok(Array.isArray(newCaptureIds));
 for(const id of newCaptureIds)assert.match(id,UUID);assert.equal(new Set(newCaptureIds).size,newCaptureIds.length);
 const previous=assertBijection(before,PLANS.get(plan)),current=assertBijection(after,PLANS.get(plan));
 const delta=[...current.captures.keys()].filter(id=>!previous.captures.has(id)).sort();assert.deepEqual(delta,[...newCaptureIds].sort(),'POSITIONS210_SIDECAR_UNEXPECTED_CAPTURE_DELTA');
 for(const [id,row]of previous.captures)assert.deepEqual(current.captures.get(id),row,'POSITIONS210_SIDECAR_OLD_CAPTURE_CHANGED');
 for(let index=0;index<2;index++){
  for(const [id,row]of previous.sides[index])assert.deepEqual(current.sides[index].get(id),row,'POSITIONS210_SIDECAR_OLD_SIDECAR_CHANGED');
  assert.deepEqual([...current.sides[index].keys()].filter(id=>!previous.sides[index].has(id)).sort(),delta);
 }
 assertPrefix(before.prefix,after.prefix);
 const names=[...BUSINESS_PHASES[phase],...SIDECARS.map(sidecar=>sidecar.name)];
 assert.deepEqual(before.prefix.filter(row=>!names.includes(row.name)),after.prefix.filter(row=>!names.includes(row.name)),'POSITIONS210_SIDECAR_OTHER_ROWS_CHANGED');
 assert.deepEqual(projection(before.preservation,plan.schema,names),projection(after.preservation,plan.schema,names),'POSITIONS210_SIDECAR_METADATA_IAM_OR_OTHER_STATE_CHANGED');
 return freeze({version:'positions210-same190-sidecar-delta.v1',phase,sourceCommit:plan.sourceCommit,
  capturesBefore:previous.captures.size,capturesAfter:current.captures.size,addedCaptures:delta.length,
  addedPositionSidecars:delta.length,addedDimensionSidecars:delta.length,allCaptureIdsBijective:true,
  pendingCapturesIncluded:true,priorRowsPreserved:true,metadataPreserved:true,otherTablesAndIamPreserved:true,
  beforeFingerprint:hash(JSON.stringify(before)),afterFingerprint:hash(JSON.stringify(after)),sourceHashes:SOURCE_PINS});
}

/* FINITE INTEGRATION CONTRACT -- no public edits were made.

1. Preparation composes one descriptor from the SAME positions210 plan:
   composePositions210SidecarPlan({qa,major,sourceCommit,read,positions210Plan})
   and retains it as prepared.positions210Sidecar. Install127/128/129/v2/210,
   actors/norm/assignments AFTER855 registration and BEFORE H's first capture.
   Read a sidecar snapshot at zero captures; it MUST have three empty arrays.
   Propagate the descriptor only on the closed positions210 opt-in, through
   H -> context of208 -> baselineContext of209. Default false receives no
   descriptor, does not execute this helper and keeps original asserts verbatim.

2. Around each finite phase below, take before/after with
   readPositions210SidecarSnapshot({h,db,plan:positions210Sidecar}). In opt-in
   replace ONLY that phase's existing "other rows" assertion with
   assertPositions210SidecarDelta({h,db,plan:positions210Sidecar,before,after,
     phase,newCaptureIds}); keep the existing assertPrefix, ledger/result/
   receipt/source-bookend/business assertions and every original false branch.
   Helper equality preserves ALL catalog metadata and every non-exempt row;
   old hash multiplicities in the finite appendable tables also remain.

   own-payroll-annulment-v2-native-continuation.mjs, source dca3d9f9:
   -337/338 ANNUL208_NO_OTHER_BUSINESS_TABLE_CHANGED -> phase annul208;
     before at prefixBefore (73); new IDs from capturesById excluding the
     existing first.id/second.id. Checkpoint8 therefore adds six, not eight.
   -399 ANNUL208_SELECTED29_CHANGED_OTHER_BUSINESS_OR_IAM -> phase annul208;
     before at prefixBefore29 (346); newCaptureIds=captures29.map(c=>c.id).

   own-payroll-annulment-preparation-209-native-continuation.mjs:
   -330 DECISION124_RECOVERY_CHANGED_OTHER_LEDGER_OR_IAM -> calculation;
     before recoveryRowsBefore (323); IDs [recovered124.id].
   -408/409 ANNUL209_UNRELATED_ROWS_CHANGED -> annul209;
     before prefixBefore (147); IDs = the two new creator captures, recovered
     recovered124.id and the two pending capture IDs. Retain each pending.id in the
     existing creator2/receiver loop347-357. Its rows are captures14/15 with
     resultCount0; saved index13 MUST NOT define the sidecar inventory.
   -475 ANNUL209_RECALC_CHANGED_OTHER_LEDGER_OR_IAM -> calculation;
     before recalcPrefixBefore (420); IDs recalculated.map(c=>c.id).
   -561 AGREEMENT190_CHANGED_OTHER_LEDGER_OR_IAM -> agreement209;
     before agreementPrefixBefore (532); IDs [agreementReplacement.id].
   -630 ANNUL209_CONFIRM_CLOSE_CHANGED_OTHER_LEDGER_OR_IAM -> confirmClose209;
     before confirmClosePrefixBefore (492); IDs [agreementReplacement.id],
     because this outer window includes the agreement calculation.

   Do NOT change209:319 (individual decision adds no capture), GET/read-only,
   replays, rejected commands, late-fault ROLLBACK or DOM-only snapshots: their
   existing complete equality remains exact and includes both sidecars.
   H has no legitimate broad row exemption to expand: its reads/rejections/
   rollback checks remain complete equality. Add the same bijection proof
   around first/second calculate in the opt-in path, using the returned IDs;
   all original capture/result/formula and old-source assertions stay intact.

   Exact branch form for208:338 (sidecarBefore208 was read alongside73):
   if(positions210Sidecar){
    assertPositions210SidecarDelta({h,db,plan:positions210Sidecar,
     before:sidecarBefore208,after:readPositions210SidecarSnapshot({h,db,plan:positions210Sidecar}),
     phase:'annul208',newCaptureIds:[...capturesById.keys()].filter(id=>id!==first.id&&id!==second.id)});
   }else{
    assert.deepEqual(prefixAfter.filter(row=>!appendOnly.includes(row.name)),prefixBefore.filter(row=>!appendOnly.includes(row.name)),'ANNUL208_NO_OTHER_BUSINESS_TABLE_CHANGED');
   }

   Exact branch form for209:409 (sidecarBefore209 was read alongside147;
   pendingCaptureIds starts [] next to captures and pushes each pending.id):
   if(positions210Sidecar){
    assertPositions210SidecarDelta({h,db,plan:positions210Sidecar,
     before:sidecarBefore209,after:readPositions210SidecarSnapshot({h,db,plan:positions210Sidecar}),
     phase:'annul209',newCaptureIds:[...captures.map(capture=>capture.id),recovered124.id,...pendingCaptureIds]});
   }else{
    assert.deepEqual(prefixAfter.filter(row=>!appended.includes(row.name)),prefixBefore.filter(row=>!appended.includes(row.name)),'ANNUL209_UNRELATED_ROWS_CHANGED');
   }
   The other five named sites use exactly the same branch form, the existing
   literal assertion in else, their own before snapshot, and the phase/IDs
   explicitly listed above. They do not share a before from another epoch.

3. Scope:127-129 add4tables,26functions,10triggers (eight immutability,
   two capture AFTER INSERT) and four capability DEFINITIONS; v2 changes five
   existing bodies;210 adds two functions. This helper adds no DDL or actors,
   grants, rows, captures, result writes, hires or contracts.211/212 separately
   add one function each and zero tables/triggers/capabilities. Existing855
   employee identities, contracts[4]/[5], and noextra-employee proof remain
   parent-owned fixture/orchestration responsibilities.

4. Root must add this module's source entry and integration focal entries to
   its finite prepared source custody before adoption. This private file's
   SHA is a candidate-byte pin, never a final public source-admission pin.
   No PASS/native/performance/municipal-acceptance claim is made by this text.
*/
