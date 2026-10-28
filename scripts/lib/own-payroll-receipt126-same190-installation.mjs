// PRIVATE INERT SOURCE. Text composition and closed-proof verification only.
// No IO, executor, imports from .handoff, fixture, identity or admission creation.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const VERSION='own-receipt126-same190-installation-proof.v1';
const TABLE='own_payroll_receipt_event',SLOT='municontrol_receipt126_installation';
const MODERN=['own_receipt_params_v1','own_receipt_self_v1','own_receipt_snapshot_v1'];
const ADDED=['own_receipt_attempt_v1','own_receipt_batch_v1','own_receipt_batch_value_v1','own_receipt_command_v1','own_receipt_context_v1','own_receipt_event_v1','own_receipt_immutable_v1','own_receipt_list_v1','own_receipt_preview_v1','own_receipt_source_version_v1','own_receipt_text_v1'];
const PINS=Object.freeze([
 ['scripts/lib/own-payroll-receipt126-same190-support.mjs',18178,'e9aae54460abc38ab3d2d56a22d5ee97091e11f3d70eb99fd47ff47892f77d38'],
 ['scripts/lib/own-payroll-receipt126-same190-shape.mjs',25768,'caeca88ce71f7d1f499c87bdd95a37e0611a66a98135d9c45ac695e9c89cc891'],
 ['scripts/migrations/004-tenant-iam-control-plane.sql',44500,'d22712fc9179d529bcec4d8347a9d845ed873dabee9c005db44b507c731a2195'],
 ['scripts/verify-municipal-owner-program.mjs',44977,'d3b1e1706318807590498999543ba8df00251126c23570204ec0a81743bb0864'],
 ['scripts/verify-municipal-owner-adoption-decision.mjs',25136,'ee53a88231e0b5694029460a3bff30a4044eba1fff9509bf64d1f91185680cfb']
]);
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===[...keys].sort().join('|');
const clone=value=>structuredClone(value);
const MAX_OID=4294967295;
const oid=value=>Number.isSafeInteger(value)&&value>0&&value<=MAX_OID;
const catalogOid=(value,zero=false)=>typeof value==='string'&&/^(?:0|[1-9][0-9]{0,9})$/.test(value)&&(zero||value!=='0')&&BigInt(value)<=4294967295n;
const catalogOidFromTyped=value=>{assert.ok(oid(value),'RECEIPT126_INSTALL_TYPED_OID');return String(value);};
// Validate the native OID fields used by this verifier without rewriting any
// raw catalog row. Zero is allowed only on PostgreSQL's nullable OID references.
const CATALOG_OID_FIELDS={relations:{oid:false},attributes:{attrelid:false},defaults:{oid:false,adrelid:false},constraints:{oid:false,conrelid:true,confrelid:true,conindid:true},indexes:{indexrelid:false,indrelid:false},triggers:{oid:false,tgrelid:false,tgconstraint:true,tgconstrindid:true,tgconstrrelid:true},functions:{oid:false},types:{oid:false,typrelid:true,typarray:true,typelem:true},dependencies:{classid:false,objid:false,refclassid:false,refobjid:false},sharedDependencies:{classid:false,objid:false,refclassid:false,refobjid:false}};
function assertCatalogOidFields(catalogs){
 for(const[key,fields]of Object.entries(CATALOG_OID_FIELDS))for(const row of catalogs[key])for(const[field,zero]of Object.entries(fields))assert.ok(catalogOid(row[field],zero),'RECEIPT126_INSTALL_CATALOG_OID:'+key+'.'+field);
}
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const CATALOG_KEYS=['relations','attributes','defaults','constraints','indexes','triggers','policies','functions','types','rewrites','inherits','sequenceDefinitions','schemas','roles','roleMemberships','defaultAcls','extensions','dependencies','sharedDependencies'];
function sourcePins(readRaw){
 assert.equal(typeof readRaw,'function');
 for(const [file,bytes,hash] of PINS){const raw=readRaw(file);assert.ok(Buffer.isBuffer(raw));assert.equal(raw.length,bytes,'RECEIPT126_INSTALL_RAW_BYTES:'+file);assert.equal(sha(raw),hash,'RECEIPT126_INSTALL_RAW_HASH:'+file);}
}
function epochSql(schema,major){return `jsonb_build_object('database',current_database(),'databaseOid',(SELECT oid::bigint FROM pg_database WHERE datname=current_database()),'backendPid',pg_backend_pid(),'backendStart',(SELECT backend_start FROM pg_stat_activity WHERE pid=pg_backend_pid()),'transactionId',pg_current_xact_id()::text,'snapshot',pg_current_snapshot()::text,'transactionAt',transaction_timestamp(),'user',current_user,'ownerOid',current_user::regrole::oid::bigint,'runtimeRoleOid','municontrol_actions_runtime_app'::regrole::oid::bigint,'schema',${q(schema)},'schemaOid',${q(schema)}::regnamespace::oid::bigint,'major',current_setting('server_version_num')::integer/10000,'requiredMajor',${major},'isolation',current_setting('transaction_isolation'),'readOnly',current_setting('transaction_read_only'))`;}
const aggregate=(query,order)=>`(SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY ${order}),'[]'::jsonb) FROM (${query}) v)`;
function ledgerSql(schema,major,capKeys,slot){
 const ns=q(schema),rel=`SELECT oid FROM pg_class WHERE relnamespace=${ns}::regnamespace`;
 const proc=`SELECT oid FROM pg_proc WHERE pronamespace=${ns}::regnamespace`;
 const type=`SELECT oid FROM pg_type WHERE typnamespace=${ns}::regnamespace`;
 const constraint=`SELECT oid FROM pg_constraint WHERE connamespace=${ns}::regnamespace`;
 const trigger=`SELECT oid FROM pg_trigger WHERE tgrelid IN(${rel})`;
 const defaults=`SELECT oid FROM pg_attrdef WHERE adrelid IN(${rel})`;
 const rewrite=`SELECT oid FROM pg_rewrite WHERE ev_class IN(${rel})`;
 const objectScope=variable=>`((${variable}.classid='pg_class'::regclass AND ${variable}.objid IN(${rel})) OR (${variable}.classid='pg_proc'::regclass AND ${variable}.objid IN(${proc})) OR (${variable}.classid='pg_type'::regclass AND ${variable}.objid IN(${type})) OR (${variable}.classid='pg_constraint'::regclass AND ${variable}.objid IN(${constraint})) OR (${variable}.classid='pg_trigger'::regclass AND ${variable}.objid IN(${trigger})) OR (${variable}.classid='pg_attrdef'::regclass AND ${variable}.objid IN(${defaults})) OR (${variable}.classid='pg_rewrite'::regclass AND ${variable}.objid IN(${rewrite})))`;
 const catalogs={
  relations:aggregate(`SELECT * FROM pg_class WHERE relnamespace=${ns}::regnamespace`,'v.oid'),
  attributes:aggregate(`SELECT a.* FROM pg_attribute a WHERE a.attrelid IN(${rel})`,'v.attrelid,v.attnum'),
  defaults:aggregate(`SELECT d.* FROM pg_attrdef d WHERE d.adrelid IN(${rel})`,'v.oid'),
  constraints:aggregate(`SELECT c.* FROM pg_constraint c WHERE c.connamespace=${ns}::regnamespace`,'v.oid'),
  indexes:aggregate(`SELECT i.* FROM pg_index i WHERE i.indrelid IN(${rel})`,'v.indexrelid'),
  triggers:aggregate(`SELECT t.* FROM pg_trigger t WHERE t.tgrelid IN(${rel})`,'v.oid'),
  policies:aggregate(`SELECT p.* FROM pg_policy p WHERE p.polrelid IN(${rel})`,'v.oid'),
  functions:aggregate(`SELECT p.* FROM pg_proc p WHERE p.pronamespace=${ns}::regnamespace`,'v.oid'),
  types:aggregate(`SELECT t.* FROM pg_type t WHERE t.typnamespace=${ns}::regnamespace`,'v.oid'),
  rewrites:aggregate(`SELECT r.* FROM pg_rewrite r WHERE r.ev_class IN(${rel})`,'v.oid'),
  inherits:aggregate(`SELECT i.* FROM pg_inherits i WHERE i.inhrelid IN(${rel}) OR i.inhparent IN(${rel})`,'v.inhrelid,v.inhseqno'),
  sequenceDefinitions:aggregate(`SELECT s.* FROM pg_sequence s WHERE s.seqrelid IN(${rel})`,'v.seqrelid'),
  schemas:aggregate('SELECT * FROM pg_namespace','v.oid'),
  roles:aggregate('SELECT * FROM pg_roles','v.oid'),
  roleMemberships:aggregate('SELECT * FROM pg_auth_members','v.roleid,v.member,v.grantor'),
  defaultAcls:aggregate('SELECT * FROM pg_default_acl','v.oid'),
  extensions:aggregate('SELECT * FROM pg_extension','v.oid'),
  dependencies:aggregate(`SELECT d.* FROM pg_depend d WHERE ${objectScope('d')}`,'v.classid,v.objid,v.objsubid,v.refclassid,v.refobjid,v.refobjsubid,v.deptype'),
  sharedDependencies:aggregate(`SELECT d.* FROM pg_shdepend d WHERE d.dbid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND ${objectScope('d')}`,'v.classid,v.objid,v.objsubid,v.refclassid,v.refobjid,v.deptype')
 };
 const catalogText=Object.entries(catalogs).map(([key,value])=>q(key)+','+value).join(',');
 return `DO $receipt126_ledger$ DECLARE target_relation record;row_count bigint;row_hash text;kept_count bigint;kept_hash text;rows_value jsonb:='[]';sequence_value jsonb:='[]';sequence_state jsonb;ledger jsonb;BEGIN
 IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>'off' OR current_setting('server_version_num')::integer/10000<>${major} OR current_user<>'postgres' OR (SELECT nspowner FROM pg_namespace WHERE oid=${ns}::regnamespace)<>current_user::regrole THEN RAISE EXCEPTION 'RECEIPT126_INSTALL_CONTEXT_CHANGED';END IF;
 IF EXISTS(SELECT 1 FROM pg_class WHERE relnamespace=${ns}::regnamespace AND relkind='f') THEN RAISE EXCEPTION 'RECEIPT126_INSTALL_FOREIGN_ROW_SOURCE_UNSUPPORTED';END IF;
 FOR target_relation IN SELECT c.oid,c.relname,c.relkind FROM pg_class c WHERE c.relnamespace=${ns}::regnamespace AND c.relkind IN('r','p','m') ORDER BY c.oid LOOP
  EXECUTE format('SELECT count(*),encode(public.digest(coalesce(string_agg(to_jsonb(r)::text,chr(10) ORDER BY to_jsonb(r)::text COLLATE "C"),''''),''sha256''),''hex'') FROM %I.%I r',${ns},target_relation.relname) INTO row_count,row_hash;
  IF target_relation.relname='iam_capability' THEN EXECUTE format('SELECT count(*),encode(public.digest(coalesce(string_agg(to_jsonb(r)::text,chr(10) ORDER BY to_jsonb(r)::text COLLATE "C"),''''),''sha256''),''hex'') FROM %I.%I r WHERE capability_key NOT IN (${capKeys.map(q).join(',').replaceAll("'","''")})',${ns},target_relation.relname) INTO kept_count,kept_hash;ELSE kept_count:=row_count;kept_hash:=row_hash;END IF;
  rows_value:=rows_value||jsonb_build_array(jsonb_build_object('oid',target_relation.oid,'name',target_relation.relname,'kind',target_relation.relkind,'count',row_count,'sha256',row_hash,'preservedCount',kept_count,'preservedSha256',kept_hash));
 END LOOP;
 FOR target_relation IN SELECT c.oid,c.relname FROM pg_class c WHERE c.relnamespace=${ns}::regnamespace AND c.relkind='S' ORDER BY c.oid LOOP EXECUTE format('SELECT jsonb_build_object(''lastValue'',last_value,''isCalled'',is_called) FROM %I.%I',${ns},target_relation.relname) INTO sequence_state;sequence_value:=sequence_value||jsonb_build_array(jsonb_build_object('oid',target_relation.oid,'value',sequence_state));END LOOP;
 ledger:=jsonb_build_object('epoch',${epochSql(schema,major)},'rows',rows_value,'sequenceValues',sequence_value,'catalogs',jsonb_build_object(${catalogText}),
 'capabilities',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY capability_key COLLATE "C"),'[]') FROM ${schema}.iam_capability c),
 'functionAcls',(SELECT coalesce(jsonb_agg(jsonb_build_object('oid',p.oid,'name',p.proname,'entries',(SELECT coalesce(jsonb_agg(jsonb_build_object('grantorOid',a.grantor::bigint,'granteeOid',a.grantee::bigint,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantor,a.grantee,a.privilege_type,a.is_grantable),'[]') FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a)) ORDER BY p.oid),'[]') FROM pg_proc p WHERE p.pronamespace=${ns}::regnamespace),
 'catalogClassIds',jsonb_build_object('pg_class','pg_class'::regclass::oid,'pg_proc','pg_proc'::regclass::oid,'pg_type','pg_type'::regclass::oid,'pg_constraint','pg_constraint'::regclass::oid,'pg_trigger','pg_trigger'::regclass::oid,'pg_attrdef','pg_attrdef'::regclass::oid,'pg_rewrite','pg_rewrite'::regclass::oid,'pg_authid','pg_authid'::regclass::oid));
 PERFORM set_config(${q(SLOT+'.'+slot)},ledger::text,true);END $receipt126_ledger$`;
}

export function buildOwnReceipt126Same190Installation({schema,major,sourceCommit,closeReference,foundationSeed,graph,normalized,readRaw,dependencies}){
 sourcePins(readRaw);assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.ok([17,18].includes(major));assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 assert.ok(exact(closeReference,['groupId','snapshotSha256','period','liquidationType','employeeCount','conceptCount','populationComplete']));assert.match(closeReference.groupId,/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);assert.match(closeReference.snapshotSha256,/^[a-f0-9]{64}$/);assert.match(closeReference.period,/^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/);assert.equal(closeReference.liquidationType,'monthly');assert.equal(closeReference.employeeCount,855);assert.equal(closeReference.conceptCount,17100);assert.equal(closeReference.populationComplete,true);
 assert.ok(exact(dependencies,['buildSupport','buildShape','assertShape','exactForeignTriggerExclusion','splitStatements','functionPin','pinsCheck']));for(const value of Object.values(dependencies))assert.equal(typeof value,'function');assert.equal(typeof normalized,'function');
 const support=dependencies.buildSupport({readRaw,splitStatements:dependencies.splitStatements,functionPin:dependencies.functionPin,pinsCheck:dependencies.pinsCheck,normalized,schema,foundationSeed,graph});
 const shape=dependencies.buildShape({schema,major,sourceCommit,readRaw});
 assert.equal(support.version,'own-receipt126-same190-support-source.v1');assert.equal(shape.version,'own-receipt126-same190-shape.v1');assert.equal(support.schema,schema);assert.equal(shape.schema,schema);assert.equal(support.closeDefinitionsReplaced,0);assert.equal(support.roleCapabilityWrites,0);assert.equal(support.actorWrites,0);
 assert.deepEqual(support.modernPinsFromSource.map(item=>item.before.name).sort(),MODERN);assert.equal(support.expected.newFunctions,11);assert.equal(support.expected.afterFunctions,14);assert.equal(support.expected.afterTables,1);
 const capDefinitions=clone(support.expected.canonicalCapabilities),capKeys=capDefinitions.map(row=>row[0]);assert.equal(capKeys.length,3);assert.equal(new Set(capKeys).size,3);
 const locationPreflight=`DO $receipt126_location$ BEGIN IF (SELECT count(*) FROM ${schema}.native_employee_registration)<>855 OR (SELECT count(*) FROM ${schema}.own_payroll_close_event)<>1 OR NOT EXISTS(SELECT 1 FROM ${schema}.own_payroll_close_event e WHERE e.command='close' AND e.group_id=${q(closeReference.groupId)}::uuid AND e.snapshot_sha256=${q(closeReference.snapshotSha256)} AND e.period=${q(closeReference.period)} AND e.liquidation_type='monthly' AND e.snapshot->'employeeCount'='855'::jsonb AND e.snapshot->'conceptCount'='17100'::jsonb AND e.snapshot->'populationComplete'='true'::jsonb) THEN RAISE EXCEPTION 'RECEIPT126_FIRST_FULL_CLOSE_REQUIRED';END IF;END $receipt126_location$`;
 const before=ledgerSql(schema,major,capKeys,'before'),after=ledgerSql(schema,major,capKeys,'after');
 // Preserve the whole shape DO; omit only its exact, intermediate SELECT so the
 // existing last-line h.json reader returns one complete final JSON proof.
 const shapeTail=";SELECT current_setting('municontrol_receipt126.shape_proof')::jsonb";assert.ok(shape.shapeSql.endsWith(shapeTail),'RECEIPT126_INSTALL_SHAPE_TAIL_CHANGED');const structuralShape=shape.shapeSql.slice(0,-shapeTail.length);
 const shapeEpoch=`DO $receipt126_shape_epoch$ BEGIN PERFORM set_config(${q(SLOT+'.shape_epoch')},(${epochSql(schema,major)})::text,true);END $receipt126_shape_epoch$`;
 const proof=`SELECT jsonb_build_object('version',${q(VERSION)},'sourceCommit',${q(sourceCommit)},'schema',${q(schema)},'major',${major},'closeReference',${q(JSON.stringify(closeReference))}::jsonb,'sourceSqlSha256',${q('9f3e93154590b79d027d30a1408d07251211a67e87b581e570bdef013c2d33dc')},'supportSourceChecksCompleted',true,'shapeNative',current_setting('municontrol_receipt126.shape_proof')::jsonb,'shapeEpoch',current_setting(${q(SLOT+'.shape_epoch')})::jsonb,'beforeText',current_setting(${q(SLOT+'.before')}),'beforeSha256',encode(public.digest(current_setting(${q(SLOT+'.before')}),'sha256'),'hex'),'afterText',current_setting(${q(SLOT+'.after')}),'afterSha256',encode(public.digest(current_setting(${q(SLOT+'.after')}),'sha256'),'hex'),'sourceCheckSemanticsVerified',false,'globalPreservationVerified',false,'transactionEndObserved',false,'installationAllowed',false)`;
 const statements=[locationPreflight,before,...support.statements,structuralShape,shapeEpoch,after,proof];
 return freeze({version:VERSION,schema,major,sourceCommit,closeReference:clone(closeReference),support,shape,expected:{modern:[...MODERN],added:[...ADDED],capDefinitions,facadeNames:support.expected.facades.map(signature=>signature.slice(0,signature.indexOf('(')))},statements,
  lateFaultStatement:"DO $receipt126_install_late_fault$ BEGIN RAISE EXCEPTION 'QA_RECEIPT126_INSTALL_LATE_FAULT';END $receipt126_install_late_fault$",
  transaction:{owner:'existing h.json / ownerDecisionQaTransaction',isolation:'repeatable read',fullJsonRequired:true,oneTransactionPerAttempt:true,preflightAndMutationsAndBothLedgersAndShapeSameTransaction:true,proofPrecedesRequestedEnd:true,rollbackAndCommitProofsNeverInterchangeable:true},
  sourceCheckSemanticsBeforeCommit:false,verifyClosedProofBeforeAnyBusiness:true,existingDestinationAndSourceCustodyGuardsRequired:true,preservationScope:'all same190 schema objects/rows plus global schemas/roles/memberships/defaultACL/extensions',actorSetupIncluded:false,apiCircuitIncluded:false,connects:false,executesSql:false,installationAllowed:false,GLOBAL_SQL_STOP:true});
}

function mapUnique(rows,key,label){assert.ok(Array.isArray(rows),label);const result=new Map();for(const row of rows){const id=key(row);assert.ok(!result.has(id),label+':DUPLICATE');result.set(id,row);}return result;}
function preserve(before,after,key,allowed,label,project=(row)=>row){
 const old=mapUnique(before,key,label),current=mapUnique(after,key,label);for(const [id,row] of old){assert.ok(current.has(id),label+':REMOVED');assert.deepEqual(project(current.get(id)),project(row),label+':CHANGED');}
 const additions=after.filter(row=>!old.has(key(row)));for(const row of additions)assert.ok(allowed(row),label+':UNDECLARED_ADDITION');return additions;
}
const hashText=text=>sha(Buffer.from(text,'utf8'));
function readLedger(text,digest){
 assert.equal(typeof text,'string');assert.match(digest,/^[a-f0-9]{64}$/);assert.equal(hashText(text),digest,'RECEIPT126_INSTALL_LEDGER_HASH');const value=JSON.parse(text);assert.ok(exact(value,['epoch','rows','sequenceValues','catalogs','capabilities','functionAcls','catalogClassIds']));assert.ok(exact(value.catalogs,CATALOG_KEYS));
 for(const key of CATALOG_KEYS)assert.ok(Array.isArray(value.catalogs[key]),'RECEIPT126_INSTALL_CATALOG_ARRAY:'+key);assertCatalogOidFields(value.catalogs);
 const relations=mapUnique(value.catalogs.relations,row=>row.oid,'LEDGER_RELATION');for(const row of value.catalogs.relations)assert.ok(catalogOid(row.oid),'RECEIPT126_INSTALL_CATALOG_OID:relations.oid');
 const rows=mapUnique(value.rows,row=>row.oid,'LEDGER_ROW');assert.equal(rows.size,value.catalogs.relations.filter(row=>['r','p','m'].includes(row.relkind)).length);
 for(const row of value.rows){assert.ok(exact(row,['oid','name','kind','count','sha256','preservedCount','preservedSha256']));assert.ok(catalogOid(row.oid),'RECEIPT126_INSTALL_CATALOG_OID:rows.oid');assert.equal(row.name,relations.get(row.oid)?.relname);assert.equal(row.kind,relations.get(row.oid)?.relkind);assert.ok(['r','p','m'].includes(row.kind));for(const key of ['count','preservedCount'])assert.ok(Number.isSafeInteger(row[key])&&row[key]>=0);assert.ok(row.preservedCount<=row.count);for(const key of ['sha256','preservedSha256'])assert.match(row[key],/^[a-f0-9]{64}$/);if(row.name!=='iam_capability'){assert.equal(row.preservedCount,row.count);assert.equal(row.preservedSha256,row.sha256);}}
 const functions=mapUnique(value.catalogs.functions,row=>row.oid,'LEDGER_FUNCTION'),acls=mapUnique(value.functionAcls,row=>row.oid,'LEDGER_ACL');assert.equal(functions.size,acls.size);for(const row of value.functionAcls)assert.ok(catalogOid(row.oid),'RECEIPT126_INSTALL_CATALOG_OID:functionAcls.oid');for(const [id,row]of functions){assert.equal(acls.get(id)?.name,row.proname);assert.ok(Array.isArray(acls.get(id).entries));for(const entry of acls.get(id).entries){assert.ok(oid(entry.grantorOid),'RECEIPT126_INSTALL_ACL_GRANTOR_OID');assert.ok(Number.isSafeInteger(entry.granteeOid)&&entry.granteeOid>=0&&entry.granteeOid<=MAX_OID,'RECEIPT126_INSTALL_ACL_GRANTEE_OID');}}
 const sequences=mapUnique(value.sequenceValues,row=>row.oid,'LEDGER_SEQUENCE');assert.equal(sequences.size,value.catalogs.relations.filter(row=>row.relkind==='S').length);for(const [id,row]of sequences){assert.ok(catalogOid(id),'RECEIPT126_INSTALL_CATALOG_OID:sequenceValues.oid');assert.equal(relations.get(id)?.relkind,'S');assert.ok(exact(row,['oid','value']));}
 assert.ok(exact(value.catalogClassIds,['pg_class','pg_proc','pg_type','pg_constraint','pg_trigger','pg_attrdef','pg_rewrite','pg_authid']));for(const id of Object.values(value.catalogClassIds))assert.ok(catalogOid(id),'RECEIPT126_INSTALL_CATALOG_OID:catalogClassIds');assert.equal(new Set(Object.values(value.catalogClassIds)).size,8);return value;
}
function aclExpected(owner,runtime,enabled){const rows=[{grantorOid:owner,granteeOid:owner,privilege:'EXECUTE',grantable:false}];if(enabled)rows.push({grantorOid:owner,granteeOid:runtime,privilege:'EXECUTE',grantable:false});return rows.sort((a,b)=>a.granteeOid-b.granteeOid);}
const depKey=row=>JSON.stringify(row);
function preserveMultiset(before,after,allowed,label){
 assert.ok(Array.isArray(before)&&Array.isArray(after));const remaining=new Map();for(const row of before){const key=depKey(row);remaining.set(key,(remaining.get(key)??0)+1);}
 for(const row of after){const key=depKey(row),count=remaining.get(key)??0;if(count>0)remaining.set(key,count-1);else assert.ok(allowed(row),label+':UNDECLARED_ADDITION');}for(const count of remaining.values())assert.equal(count,0,label+':REMOVED_OR_CHANGED');
}
export function assertOwnReceipt126Same190InstallationProof(plan,proof,{requestedEnd,dependencies}){
 assert.ok(['ROLLBACK','COMMIT'].includes(requestedEnd));assert.ok(exact(dependencies,['assertShape','exactForeignTriggerExclusion']));for(const value of Object.values(dependencies))assert.equal(typeof value,'function');
 assert.equal(plan.version,VERSION);assert.ok(exact(proof,['version','sourceCommit','schema','major','closeReference','sourceSqlSha256','supportSourceChecksCompleted','shapeNative','shapeEpoch','beforeText','beforeSha256','afterText','afterSha256','sourceCheckSemanticsVerified','globalPreservationVerified','transactionEndObserved','installationAllowed']));assert.deepEqual(proof.closeReference,plan.closeReference);
 for(const field of ['version','sourceCommit','schema','major'])assert.equal(proof[field],plan[field]);assert.equal(proof.sourceSqlSha256,'9f3e93154590b79d027d30a1408d07251211a67e87b581e570bdef013c2d33dc');assert.equal(proof.supportSourceChecksCompleted,true);for(const key of ['sourceCheckSemanticsVerified','globalPreservationVerified','transactionEndObserved','installationAllowed'])assert.equal(proof[key],false);
 // This verifier is mandatory AFTER the existing native transaction returns.
 // It never reads SQL or substitutes new expected values from the ledger.
 const checkedShape=dependencies.assertShape(plan.shape,proof.shapeNative),excluded=dependencies.exactForeignTriggerExclusion(plan.shape,proof.shapeNative);assert.equal(checkedShape.sourceCheckSemanticsVerified,true);assert.equal(excluded.exactForeignConstraints,5);assert.equal(excluded.maximumExcludedTriggers,10);assert.deepEqual(excluded.referencedTriggerOids,checkedShape.referencedTriggerOids);assert.deepEqual(excluded.foreignConstraintOids,checkedShape.foreignConstraintOids);
 const before=readLedger(proof.beforeText,proof.beforeSha256),after=readLedger(proof.afterText,proof.afterSha256);assert.deepEqual(after.epoch,before.epoch,'RECEIPT126_INSTALL_EPOCH_CHANGED');assert.deepEqual(proof.shapeEpoch,before.epoch,'RECEIPT126_INSTALL_SHAPE_EPOCH_CHANGED');assert.deepEqual(after.catalogClassIds,before.catalogClassIds);const epoch=before.epoch;assert.ok(exact(epoch,['database','databaseOid','backendPid','backendStart','transactionId','snapshot','transactionAt','user','ownerOid','runtimeRoleOid','schema','schemaOid','major','requiredMajor','isolation','readOnly']));
 assert.equal(epoch.schema,plan.schema);assert.equal(epoch.major,plan.major);assert.equal(epoch.requiredMajor,plan.major);assert.equal(epoch.user,'postgres');assert.equal(epoch.isolation,'repeatable read');assert.equal(epoch.readOnly,'off');for(const key of ['databaseOid','backendPid','ownerOid','runtimeRoleOid','schemaOid'])assert.ok(oid(epoch[key]));assert.notEqual(epoch.ownerOid,epoch.runtimeRoleOid);assert.equal(typeof epoch.database,'string');assert.equal(typeof epoch.backendStart,'string');assert.equal(typeof epoch.transactionId,'string');assert.equal(typeof epoch.snapshot,'string');assert.equal(typeof epoch.transactionAt,'string');
 const old=before.catalogs,now=after.catalogs,r=catalogOidFromTyped(checkedShape.tableOid),foreignConstraintOids=checkedShape.foreignConstraintOids.map(catalogOidFromTyped),referencedTriggerOids=checkedShape.referencedTriggerOids.map(catalogOidFromTyped),runtimeRoleOid=catalogOidFromTyped(epoch.runtimeRoleOid);assert.equal(before.rows.find(row=>row.name==='native_employee_registration')?.count,855,'RECEIPT126_INSTALL_COMPLETE_NATIVE855_REQUIRED');assert.equal(before.rows.find(row=>row.name==='own_payroll_close_event')?.count,1,'RECEIPT126_INSTALL_FIRST_CLOSE_REQUIRED');
 const newRelations=preserve(old.relations,now.relations,row=>row.oid,row=>row.oid===r&&row.relname===TABLE&&row.relkind==='r'||row.relkind==='i'&&after.catalogs.indexes.some(i=>i.indexrelid===row.oid&&i.indrelid===r),'RELATIONS');assert.equal(newRelations.length,4);assert.equal(newRelations.filter(row=>row.oid===r).length,1);const relationIds=new Set(newRelations.map(row=>row.oid));
 const newRows=preserve(before.rows,after.rows,row=>row.oid,row=>row.oid===r&&row.name===TABLE&&row.count===0&&row.preservedCount===0,'ROWS',row=>row.name==='iam_capability'?{oid:row.oid,name:row.name,kind:row.kind,preservedCount:row.preservedCount,preservedSha256:row.preservedSha256}:row);assert.equal(newRows.length,1);
 const newCaps=preserve(before.capabilities,after.capabilities,row=>row.capability_key,row=>{const canonical=plan.expected.capDefinitions.find(c=>c[0]===row.capability_key);return canonical&&exact(row,['capability_key','label','description','scope_kind','sensitivity','created_at'])&&JSON.stringify([row.capability_key,row.label,row.description,row.scope_kind,row.sensitivity])===JSON.stringify(canonical)&&row.created_at===epoch.transactionAt;},'CAPABILITIES');
 const missingKeys=plan.expected.capDefinitions.map(row=>row[0]).filter(key=>!before.capabilities.some(row=>row.capability_key===key));assert.deepEqual(newCaps.map(row=>row.capability_key).sort(),missingKeys.sort());for(const c of plan.expected.capDefinitions){const row=after.capabilities.find(row=>row.capability_key===c[0]);assert.ok(row);assert.deepEqual([row.capability_key,row.label,row.description,row.scope_kind,row.sensitivity],c);}
 const capBefore=before.rows.filter(row=>row.name==='iam_capability'),capAfter=after.rows.filter(row=>row.name==='iam_capability');assert.equal(capBefore.length,1);assert.equal(capAfter.length,1);assert.equal(capAfter[0].count,capBefore[0].count+newCaps.length);
 const selfBefore=old.functions.filter(row=>row.proname==='own_receipt_self_v1');assert.equal(selfBefore.length,1);const selfOid=selfBefore[0].oid,selfDelta=plan.support.selfAclDelta;assert.equal(selfDelta.name,'own_receipt_self_v1');assert.equal(typeof selfDelta.fromRuntime,'boolean');assert.equal(selfDelta.toRuntime,true);assert.equal(selfDelta.onlyAllowedExistingAclChange,true);
 const newFunctions=preserve(old.functions,now.functions,row=>row.oid,row=>plan.expected.added.includes(row.proname),'FUNCTIONS',row=>{const value=clone(row);if(value.oid===selfOid&&selfDelta.fromRuntime===false)delete value.proacl;return value;});assert.equal(newFunctions.length,11);assert.deepEqual(newFunctions.map(row=>row.proname).sort(),plan.expected.added);const receiptFunctions=now.functions.filter(row=>[...MODERN,...ADDED].includes(row.proname));assert.equal(receiptFunctions.length,14);for(const name of MODERN)assert.equal(old.functions.filter(row=>row.proname===name).length,1);
 const receiptIds=new Set(receiptFunctions.map(row=>row.oid));preserve(before.functionAcls,after.functionAcls,row=>row.oid,row=>newFunctions.some(f=>f.oid===row.oid),'FUNCTION_ACLS',row=>row.oid===selfOid&&selfDelta.fromRuntime===false?{oid:row.oid,name:row.name}:row);
 for(const phase of ['before','after'])for(const row of (phase==='before'?before:after).functionAcls.filter(row=>receiptIds.has(row.oid))){const modernPin=plan.support.modernPinsFromSource.find(pin=>pin.before.name===row.name);const runtime=phase==='before'?modernPin?.before.runtime:plan.expected.facadeNames.includes(row.name);assert.equal(typeof runtime,'boolean');assert.deepEqual(row.entries,aclExpected(epoch.ownerOid,epoch.runtimeRoleOid,runtime),'RECEIPT126_EXACT_FUNCTION_ACL:'+row.name);}
 const addedByCatalog={pg_class:newRelations,pg_proc:newFunctions};
 const newAttrs=preserve(old.attributes,now.attributes,row=>row.attrelid+':'+row.attnum,row=>relationIds.has(row.attrelid),'ATTRIBUTES');assert.ok(newAttrs.length>=18);
 const newDefaults=preserve(old.defaults,now.defaults,row=>row.oid,row=>row.adrelid===r,'DEFAULTS');assert.equal(newDefaults.length,2);addedByCatalog.pg_attrdef=newDefaults;
 const newConstraints=preserve(old.constraints,now.constraints,row=>row.oid,row=>row.conrelid===r,'CONSTRAINTS');assert.equal(newConstraints.length,plan.major===18?35:18);assert.deepEqual(newConstraints.filter(row=>row.contype==='f').map(row=>row.oid).sort((a,b)=>a-b),[...foreignConstraintOids].sort((a,b)=>a-b));addedByCatalog.pg_constraint=newConstraints;
 const newIndexes=preserve(old.indexes,now.indexes,row=>row.indexrelid,row=>row.indrelid===r,'INDEXES');assert.equal(newIndexes.length,3);
 const refs=new Set(referencedTriggerOids),fkIds=new Set(foreignConstraintOids);
 const newTriggers=preserve(old.triggers,now.triggers,row=>row.oid,row=>row.tgrelid===r||refs.has(row.oid)&&row.tgrelid!==r&&row.tgisinternal===true&&fkIds.has(row.tgconstraint),'TRIGGERS');assert.equal(newTriggers.length,22);assert.equal(newTriggers.filter(row=>row.tgrelid===r).length,12);assert.deepEqual(newTriggers.filter(row=>row.tgrelid!==r).map(row=>row.oid).sort((a,b)=>a-b),[...refs].sort((a,b)=>a-b));for(const row of newTriggers.filter(row=>refs.has(row.oid))){const c=newConstraints.find(c=>c.oid===row.tgconstraint);assert.ok(c);assert.equal(row.tgconstrindid,c.conindid);assert.equal(row.tgrelid,c.confrelid);assert.equal(row.tgconstrrelid,r);}addedByCatalog.pg_trigger=newTriggers;
 const newTypes=preserve(old.types,now.types,row=>row.oid,row=>row.typrelid===r||now.types.some(t=>t.typrelid===r&&t.typarray===row.oid&&row.typelem===t.oid),'TYPES');assert.equal(newTypes.length,2);addedByCatalog.pg_type=newTypes;
 for(const key of ['policies','rewrites','inherits','sequenceDefinitions','schemas','roles','roleMemberships','defaultAcls','extensions'])assert.deepEqual(now[key],old[key],'RECEIPT126_INSTALL_PRIOR_'+key.toUpperCase());assert.deepEqual(after.sequenceValues,before.sequenceValues);addedByCatalog.pg_rewrite=[];
 const newObjectKeys=new Set(Object.entries(addedByCatalog).flatMap(([name,rows])=>rows.map(row=>before.catalogClassIds[name]+':'+row.oid)));
 preserveMultiset(old.dependencies,now.dependencies,row=>newObjectKeys.has(row.classid+':'+row.objid),'DEPENDENCIES');
 preserveMultiset(old.sharedDependencies,now.sharedDependencies,row=>newObjectKeys.has(row.classid+':'+row.objid)||selfDelta.fromRuntime===false&&row.classid===before.catalogClassIds.pg_proc&&row.objid===selfOid&&row.objsubid===0&&row.refclassid===before.catalogClassIds.pg_authid&&row.refobjid===runtimeRoleOid&&row.deptype==='a','SHARED_DEPENDENCIES');
 return{version:'own-receipt126-same190-installation-verified-source-proof.v1',sourceCommit:plan.sourceCommit,major:plan.major,schema:plan.schema,preservationScope:plan.preservationScope,requestedEnd,epoch:clone(epoch),sourceChecksCompleted:true,shapeSourceCheckSemanticsVerified:true,priorRowsAndCatalogsPreserved:true,modernFunctionOidsPreserved:true,selfAclDelta:clone(selfDelta),newTables:1,newFunctions:11,totalReceiptFunctions:14,facades:6,newCapabilities:newCaps.length,newReferencedRiTriggers:10,shapeProof:clone(proof.shapeNative),beforeSha256:proof.beforeSha256,afterSha256:proof.afterSha256,transactionEndObservedByThisVerifier:false,requiresSuccessfulExistingHJsonReturnAndCallerEndBinding:true,actorSetupExecuted:false,receiptWorkflowExecuted:false,productionWrites:0,installationAdmission:false,GLOBAL_SQL_STOP:true};
}

export function receipt126InstallationFailure({primary,secondary=[],nativeAttempted,nativeReturned,requestedEnd}){
 assert.ok(primary);assert.ok(Array.isArray(secondary));assert.equal(typeof nativeAttempted,'boolean');assert.equal(typeof nativeReturned,'boolean');assert.ok(!nativeReturned||nativeAttempted);assert.ok(['ROLLBACK','COMMIT'].includes(requestedEnd));
 return{state:!nativeAttempted?'NOT_STARTED':nativeReturned&&requestedEnd==='COMMIT'?'COMMITTED_UNVERIFIED':nativeReturned?'ROLLBACK_REQUEST_RETURNED_PROOF_UNVERIFIED':'UNCERTAIN',primary,secondary:[...secondary],requestedEnd,stop:true,retry:false,cleanupAttempted:false,rollbackClaimed:false,businessContinuationAllowed:false,GLOBAL_SQL_STOP:true};
}
