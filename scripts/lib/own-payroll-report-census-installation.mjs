// Additive source-only protocol. Calling it assembles SQL; it never connects.
// Local SQL construction/execution remains stopped until its separate gate.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
import {buildOwnReportCensusAuthorityPins} from './own-payroll-report-census-authority.mjs';
import {ownReportCloseLedgerCheck,OWN_REPORT_CLOSE_LEDGER_SOURCE_SHA256} from './own-payroll-report-census-ledger.mjs';

export const OWN_REPORT_CENSUS_MIGRATION='scripts/migrations/200-own-payroll-report-census.sql';
export const OWN_REPORT_CENSUS_SQL_SHA256='1f6933af2f1067e99bf24005c37d434c51c58f0ba51865ed7b99834842f5f198';
export const OWN_REPORT_CENSUS_SIGNATURE='public.own_close_report_census_v1(jsonb,text,text)';
const prefix='municontrol_report_census200.';
const quote=value=>"'"+String(value).replaceAll("'","''")+"'",lf=value=>value.replace(/\r\n?/g,'\n'),hash=value=>createHash('sha256').update(value).digest('hex');
const sources=Object.freeze({
 'scripts/migrations/112-native-salary-definitions.sql':'da72986b8eb8b834f8f11f0cdfd793708eba90c96de59c399ff063fe31a95cd3',
 'scripts/migrations/122-own-payroll-programs.sql':'edaf70ef87f9ac3de170e079c460d38c4188b36de349b5c58808f5a09a9f9785',
 'scripts/migrations/123-own-payroll-runs.sql':'a9fe1129e921bb7c01985b8caadb009f6086aef9866e2298398175f7f25b4b6b',
 'scripts/migrations/125-own-payroll-close.sql':OWN_REPORT_CLOSE_LEDGER_SOURCE_SHA256
});
const direct=[
 ['125-own-payroll-close','own_close_context_v1','546ea746228011097301bf4baad98b0fc51ac142167dbe683e02642fbf7e7730'],
 ['123-own-payroll-runs','own_run_lock_v1','8bc4c4699b0a633aef50bf9aeb6e1c1d6d1b5da6a3017241056dbad689b862b5'],
 ['123-own-payroll-runs','own_run_hash_v1','a6c00700c94b5e07fdf49c00c9ea07212239f46a11f4a921b706367e74c66393'],
 ['112-native-salary-definitions','native_salary_scope_v1','36fa43fd409b9785b80600bb0f6257aea65b9ace313a0d11db528e9b685b7253'],
 ['112-native-salary-definitions','native_salary_serialized_v1','44227bb4f1698c0b525bd4bbd1b529788ccbcb1518a1762bbe96b3d1490a3fff'],
 ['122-own-payroll-programs','own_program_exact_v1','35e76cb5123f135ac236f4ad8c6fe87b564ceabca64d0ad5c589cb79c97cd096'],
 ['125-own-payroll-close','own_close_immutable_v1','5488e2515a29a10fba8a98f604886c9ff8af250b723de5ae8077c14f69e582c9']
];
const statements=source=>splitPostgresStatements(source).map(value=>value.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim());
const definition=(source,name)=>{const found=statements(source).filter(value=>value.startsWith('CREATE FUNCTION public.'+name+'('));assert.equal(found.length,1,'REPORT_CENSUS_SOURCE_FUNCTION: '+name);return found[0];};
const once=(source,old,value)=>{assert.equal(source.split(old).length,2,'REPORT_CENSUS_SOURCE_ANCHOR');return source.replace(old,()=>value);};

export function buildOwnReportCensusInstallation({read,sourceCommit}){
 assert.equal(typeof read,'function');assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 const texts={},sourceHashes={};for(const [file,expected]of Object.entries(sources)){texts[file]=lf(read(file));assert.equal(hash(texts[file]),expected,'REPORT_CENSUS_SOURCE_CHANGED: '+file);sourceHashes[file]=expected;}
 const authority=buildOwnReportCensusAuthorityPins({read});
 for(const [file,digest]of Object.entries(authority.sourceHashes)){if(Object.hasOwn(sourceHashes,file))assert.equal(sourceHashes[file],digest,'REPORT_CENSUS_AUTHORITY_SOURCE_CONFLICT');sourceHashes[file]=digest;}
 const pins=new Map(authority.pins.map(value=>[value.signature,value]));assert.equal(pins.size,authority.pins.length,'REPORT_CENSUS_DUPLICATE_AUTHORITY');
 for(const [file,name,expected]of direct){const value={...ownInstallationFunctionPin(definition(texts['scripts/migrations/'+file+'.sql'],name)),runtime:false};assert.equal(value.sha256,expected,'REPORT_CENSUS_DIRECT_BODY_CHANGED: '+name);if(pins.has(value.signature))assert.deepEqual(pins.get(value.signature),value);else pins.set(value.signature,value);}
 const prerequisitePins=[...pins.values()];assert.equal(prerequisitePins.find(value=>value.name==='own_run_context_v1')?.sha256,'7902263d0b7208fc259abf58bbc7a225b301956abe04db73b57d6c2c42ff3e30','REPORT_CENSUS_CURRENT_CONTEXT_REQUIRED');
 const source=lf(read(OWN_REPORT_CENSUS_MIGRATION));assert.equal(hash(source),OWN_REPORT_CENSUS_SQL_SHA256,'REPORT_CENSUS_UNREVIEWED_SQL200');sourceHashes[OWN_REPORT_CENSUS_MIGRATION]=OWN_REPORT_CENSUS_SQL_SHA256;
 const migration=statements(source);assert.equal(migration.length,3);assert.ok(migration[0].startsWith('CREATE FUNCTION public.own_close_report_census_v1('));
 assert.equal(migration[1],'REVOKE ALL ON FUNCTION '+OWN_REPORT_CENSUS_SIGNATURE+' FROM PUBLIC,municontrol_actions_runtime_app');assert.equal(migration[2],'GRANT EXECUTE ON FUNCTION '+OWN_REPORT_CENSUS_SIGNATURE+' TO municontrol_actions_runtime_app');
 const ownPin={...ownInstallationFunctionPin(migration[0]),runtime:true};assert.deepEqual(ownPin,{name:'own_close_report_census_v1',signature:OWN_REPORT_CENSUS_SIGNATURE,sha256:'16b0b8faa8016cac5d70d8c34d5e303567ec84686af2f63fbc3cef51a1216f2c',argNames:['p','period_value','type_value'],defaults:'',resultType:'jsonb',language:'plpgsql',returnsSet:false,strict:false,definer:true,volatility:'v',config:['search_path=pg_catalog, public, pg_temp','TimeZone=UTC'],runtime:true});
 const ledgerCheck=ownReportCloseLedgerCheck(),prerequisiteCheck=[pinsCheck(prerequisitePins,'REPORT_CENSUS_PREREQUISITE_CHANGED'),...authority.checks,ledgerCheck].join(';\n');
 const ownCheck=pinsCheck([ownPin],'REPORT_CENSUS_FACADE_CHANGED')+`;DO $overloads$ BEGIN IF(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='own_close_report_census_v1')<>1 THEN RAISE EXCEPTION 'REPORT_CENSUS_FACADE_OVERLOAD';END IF;END $overloads$`;
 const snapshot=slot=>{
  let value=preservationSnapshot(slot).replaceAll("p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')",'true');
  value=once(value,"AND NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",'AND p.oid IS DISTINCT FROM to_regprocedure('+quote(OWN_REPORT_CENSUS_SIGNATURE)+')');
  return value.replaceAll('municontrol_sql111.',prefix);
 };
 const before=snapshot('before'),after=snapshot('after');
 const contextCheck=`DO $context$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'REPORT_CENSUS_ISOLATION_REQUIRED';END IF;IF current_setting('server_version_num')::integer/10000 NOT IN(17,18) THEN RAISE EXCEPTION 'REPORT_CENSUS_SERVER_UNREVIEWED';END IF;END $context$`;
 const mode=`DO $mode$ BEGIN PERFORM set_config('lock_timeout','5s',true);PERFORM set_config('statement_timeout','180s',true);${[132142,132143,143,132149,132150,145,132164,156,132166,132170,171,176,177,200].map(value=>'PERFORM pg_advisory_xact_lock('+value+');').join('')}PERFORM set_config('${prefix}mode',CASE WHEN to_regprocedure(${quote(OWN_REPORT_CENSUS_SIGNATURE)}) IS NULL THEN 'install' ELSE 'verify' END,true);IF current_setting('${prefix}mode')='install' AND EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='own_close_report_census_v1') THEN RAISE EXCEPTION 'REPORT_CENSUS_OBJECT_CONFLICT';END IF;END $mode$`;
 const choose=`DO $choose$ BEGIN IF current_setting('${prefix}mode')='verify' THEN EXECUTE ${quote(ownCheck)};END IF;END $choose$`;
 const apply=`DO $apply$ BEGIN IF current_setting('${prefix}mode')='install' THEN ${migration.map(value=>'EXECUTE '+quote(value)+';').join('\n')} END IF;END $apply$`;
 const conservation=`DO $conservation$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'REPORT_CENSUS_PRIOR_STATE_CHANGED';END IF;END $conservation$`;
 const proof=initial=>`SELECT jsonb_build_object('version','own-report-census-installation.v1','sourceCommit',${quote(sourceCommit)},'sourceHashes',${quote(JSON.stringify(sourceHashes))}::jsonb,'mode',${initial?"current_setting('"+prefix+"mode')":"'verify'"},'newTables',0,'newFunctions',1,'runtimeFacades',1,'adaptedFunctions',0,'roleAssignmentsAdded',0,'existingAclChanges',0,'businessWrites',0,'nominalRowsReturned',0,'eventRows',(SELECT count(*) FROM public.own_payroll_close_event),'preservationSha256',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex'),'objectFingerprint',(SELECT encode(public.digest(to_jsonb(p)::text,'sha256'),'hex') FROM pg_proc p WHERE oid=${quote(OWN_REPORT_CENSUS_SIGNATURE)}::regprocedure)${initial?",'beforeFingerprint',encode(public.digest(current_setting('"+prefix+"before')::jsonb::text,'sha256'),'hex')":''}) AS proof`;
 return{version:'own-report-census-installation.v1',sourceCommit,sourceHashes,prerequisitePins,ownPin,migration,prerequisiteCheck,ownCheck,ledgerCheck,before,after,contextCheck,mode,choose,apply,conservation,statements:[contextCheck,mode,prerequisiteCheck,choose,before,apply,prerequisiteCheck,ownCheck,after,conservation,proof(true)],verification:[contextCheck,prerequisiteCheck,ownCheck,after,proof(false)],connects:false,executesSql:false};
}

export function assertOwnReportCensusDurability({installed,durable,batch}){
 for(const value of[installed,durable]){
  assert.equal(value.version,'own-report-census-installation.v1');assert.equal(value.sourceCommit,batch.sourceCommit);assert.deepEqual(value.sourceHashes,batch.sourceHashes);
  for(const [name,count]of Object.entries({newTables:0,newFunctions:1,runtimeFacades:1,adaptedFunctions:0,roleAssignmentsAdded:0,existingAclChanges:0,businessWrites:0,nominalRowsReturned:0}))assert.equal(value[name],count);
  assert.ok(Number.isSafeInteger(value.eventRows)&&value.eventRows>=0);for(const name of['preservationSha256','objectFingerprint'])assert.match(value[name],/^[a-f0-9]{64}$/);
 }
 assert.ok(['install','verify'].includes(installed.mode));assert.equal(durable.mode,'verify');assert.equal(installed.beforeFingerprint,installed.preservationSha256,'REPORT_CENSUS_PRIOR_STATE_CHANGED');
 for(const name of['preservationSha256','objectFingerprint','eventRows'])assert.equal(installed[name],durable[name],'REPORT_CENSUS_NOT_DURABLE: '+name);
 return{passed:true,sourceCommit:batch.sourceCommit,priorStatePreserved:true,metadataVerified:true,businessWrites:0,nominalRowsReturned:0};
}
