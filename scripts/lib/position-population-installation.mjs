// Reviewable source construction only. No connection, query, DDL execution,
// fixture, backfill, nominal operation or authority to lift GLOBAL_SQL_STOP.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildAdoptedPositionsInstallation} from './adopted-positions-installation.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {splitPostgresStatements} from './sql-statements.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';

export const SQL210_SHA='743a4962e6162016c467ccb5c4212a5a4cd9e905b8bb31bbe4bb85e0c2dceefd';
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const hash=value=>createHash('sha256').update(value).digest('hex');
const prefix='municontrol_position_population.';
const previousVersion='adopted-positions-installation.v2';
const oldNames=['position_comparison_immutable_v1','position_comparison_capture_trigger_v1','position_comparison_dimensions_v1','position_comparison_detail_v1'];
const newNames=['own_position_population_proof_v2','position_comparison_detail_v2'];
const newSignatures=['public.own_position_population_proof_v2(jsonb)','public.position_comparison_detail_v2(jsonb,integer,integer,text,text)'];
const fields=['version','sourceCommit','sourceHashes','predecessorVersion','allChecksPassed','newTables','newFunctions','runtimeFacades','capabilityDefinitionsAdded','roleAssignmentsAdded','businessOperations','nominalRowsReturned','priorFingerprint','objectFingerprint'];
const fixed={allChecksPassed:true,newTables:0,newFunctions:2,runtimeFacades:1,capabilityDefinitionsAdded:0,roleAssignmentsAdded:0,businessOperations:0,nominalRowsReturned:0};
const once=(source,from,to)=>{assert.equal(source.split(from).length,2,'POSITION_POPULATION_PRESERVATION_ANCHOR');return source.replace(from,to);};

export function buildPositionPopulationInstallation(options){
 assert.equal(typeof options?.read,'function');assert.match(options.sourceCommit,/^[a-f0-9]{40}$/);
 const source=options.read('scripts/migrations/210-own-position-population-proof.sql').replace(/\r\n?/g,'\n');
 assert.equal(hash(source),SQL210_SHA,'Unreviewed SQL210 position population source');
 // The ONLY supported predecessor is the explicit adapted-position v2 source.
 // Its 5 after pins and 27 dependencies remain unchanged, including v1 reader.
 const previous=buildAdoptedPositionsInstallation(options);
 assert.equal(previous.afterPins.length,5);assert.equal(previous.dependencies.length,27);
 const prerequisitePins=[...previous.afterPins,...previous.dependencies];
 assert.equal(prerequisitePins.length,32);assert.equal(new Set(prerequisitePins.map(pin=>pin.signature)).size,32);
 const oldComparisonPins=oldNames.map(name=>{
  const pins=prerequisitePins.filter(pin=>pin.name===name);assert.equal(pins.length,1,'Exact old comparison predecessor '+name);return pins[0];
 });
 assert.equal(prerequisitePins.filter(pin=>pin.name.startsWith('position_comparison_')).length,4);
 const migration=splitPostgresStatements(source);
 assert.equal(migration.length,5,'Only preflight, 2 functions, revoke and grant are admitted');
 assert.ok(migration.every(statement=>!/^(?:BEGIN|COMMIT|ROLLBACK|CREATE TABLE|ALTER TABLE|INSERT|UPDATE|DELETE|TRUNCATE)\b/i.test(statement)));
 assert.match(migration[0].replace(/^(?:\s*--[^\n]*\n)*/,''),/^DO /);
 const definitions=migration.filter(statement=>/^CREATE FUNCTION public\./.test(statement));assert.equal(definitions.length,2);
 const ownPins=definitions.map(definition=>{
  const pin=ownInstallationFunctionPin(definition);return {...pin,runtime:pin.name==='position_comparison_detail_v2'};
 });
 assert.deepEqual(ownPins.map(pin=>pin.name),newNames);assert.deepEqual(ownPins.map(pin=>pin.signature),newSignatures);
 assert.equal(ownPins.filter(pin=>pin.runtime).length,1);
 assert.equal(migration[3],'REVOKE ALL ON FUNCTION public.own_position_population_proof_v2(jsonb),public.position_comparison_detail_v2(jsonb,integer,integer,text,text) FROM PUBLIC,municontrol_actions_runtime_app');
 assert.equal(migration[4],'GRANT EXECUTE ON FUNCTION public.position_comparison_detail_v2(jsonb,integer,integer,text,text) TO municontrol_actions_runtime_app');
 const sourceHashes={...previous.sourceHashes,'210-own-position-population-proof.sql':SQL210_SHA};
 const prerequisiteCheck=pinsCheck(prerequisitePins,'POSITION_POPULATION_PREDECESSOR_CHANGED');
 const ownCheck=pinsCheck(ownPins,'POSITION_POPULATION_NEW_FUNCTION_CHANGED');
 const newOids=newSignatures.map(signature=>'to_regprocedure('+q(signature)+')');
 const familyCount="(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'position_comparison_%')";
 const newCount=`(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN(${newNames.map(q).join(',')}))`;
 const allNewPresent=newOids.map(oid=>oid+' IS NOT NULL').join(' AND ');
 const allNewAbsent=newOids.map(oid=>oid+' IS NULL').join(' AND ');
 const mode=`DO $mode$ BEGIN
 IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'POSITION_POPULATION_ISOLATION_REQUIRED';END IF;
 PERFORM pg_advisory_xact_lock(128129);
 IF ${newCount}=0 AND ${familyCount}=4 AND ${allNewAbsent} THEN
  PERFORM set_config('${prefix}mode','first',true);
 ELSIF ${newCount}=2 AND ${familyCount}=5 AND ${allNewPresent} THEN
  EXECUTE ${q(ownCheck)};PERFORM set_config('${prefix}mode','repeat',true);
 ELSE RAISE EXCEPTION 'POSITION_POPULATION_PARTIAL_OR_CONFLICT';END IF;
 END $mode$`;
 // Counts + exact old pins forbid overloads, unknown family members, legacy
 // reader bodies and partial installation. This never uses >=4 or old-or-new.
 const familyAfter=`DO $family$ BEGIN IF ${familyCount}<>5 OR ${newCount}<>2 OR NOT(${allNewPresent}) THEN RAISE EXCEPTION 'POSITION_POPULATION_FUNCTION_FAMILY_CHANGED';END IF;END $family$`;
 const beforeCheck=prerequisiteCheck;
 const afterCheck=[prerequisiteCheck,ownCheck,familyAfter].join(';\n');
 const snapshot=slot=>{
  let value=preservationSnapshot(slot);
  const oldTableExclusion="p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')";
  assert.equal(value.split(oldTableExclusion).length,3);value=value.replaceAll(oldTableExclusion,'true');
  value=once(value,"NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",newOids.map(oid=>'p.oid IS DISTINCT FROM '+oid).join(' AND '));
  value=value.replaceAll('municontrol_sql111.',prefix);
  assert.ok(!value.includes('native_leave_'));assert.ok(!value.includes("-'prosrc'"));
  return value;
 };
 const before=snapshot('before'),after=snapshot('after');
 const apply=`DO $apply$ BEGIN IF current_setting('${prefix}mode')='first' THEN
 ${migration.map(statement=>'EXECUTE '+q(statement)+';').join('\n ')}
 END IF;END $apply$`;
 const priorAudit=`DO $audit$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'POSITION_POPULATION_PRIOR_STATE_CHANGED';END IF;END $audit$`;
 const objectFingerprint=`encode(public.digest((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid)::text FROM pg_proc p WHERE p.oid IN(${newOids.join(',')})),'sha256'),'hex')`;
 const proof=`SELECT jsonb_build_object('version','own-position-population-installation.v1','sourceCommit',${q(options.sourceCommit)},'sourceHashes',${q(JSON.stringify(sourceHashes))}::jsonb,'predecessorVersion',${q(previousVersion)},'allChecksPassed',true,'newTables',0,'newFunctions',2,'runtimeFacades',1,'capabilityDefinitionsAdded',0,'roleAssignmentsAdded',0,'businessOperations',0,'nominalRowsReturned',0,'priorFingerprint',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex'),'objectFingerprint',${objectFingerprint}) AS proof`;
 const requireRepeat=`DO $repeat$ BEGIN IF current_setting('${prefix}mode')<>'repeat' THEN RAISE EXCEPTION 'POSITION_POPULATION_DURABILITY_REQUIRES_EXISTING';END IF;END $repeat$`;
 return {sourceCommit:options.sourceCommit,sourceHashes,predecessorVersion:previousVersion,connects:false,executesSql:false,
  previousPins:previous.afterPins,prerequisitePins,oldComparisonPins,ownPins,migration,mode,beforeCheck,afterCheck,before,after,apply,priorAudit,proof,
  installation:[prerequisiteCheck,mode,before,apply,afterCheck,after,priorAudit,proof],
  durableVerification:['SET TRANSACTION READ ONLY',prerequisiteCheck,mode,requireRepeat,afterCheck,after,proof]};
}

export function assertPositionPopulationDurability({installed,durable,batch}){
 assert.deepEqual(Object.keys(installed).sort(),[...fields].sort());assert.deepEqual(Object.keys(durable).sort(),[...fields].sort());
 assert.deepEqual(installed,durable,'POSITION_POPULATION_DURABILITY_CHANGED');
 assert.equal(installed.version,'own-position-population-installation.v1');assert.equal(installed.predecessorVersion,previousVersion);
 assert.equal(installed.sourceCommit,batch.sourceCommit);assert.deepEqual(installed.sourceHashes,batch.sourceHashes);
 for(const [key,value]of Object.entries(fixed))assert.equal(installed[key],value,key);
 for(const key of ['priorFingerprint','objectFingerprint'])assert.match(installed[key],/^[a-f0-9]{64}$/);
 return {passed:true,priorStatePreserved:true,newFunctionsPreserved:true,independentDurabilityVerified:true,nominalRowsReturned:0};
}
