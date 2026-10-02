// Writes SQL116 from exact tracked prerequisites. Never connects to a database.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {nativeTimeMigration,timeFunction} from './lib/native-time-catalog-migration.mjs';
import {NATIVE_TIME_HELPERS_SQL} from './lib/native-time-catalog-helpers.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8').replaceAll('\r\n','\n');
export function nativeTimePrerequisiteSource() {
 const source=read('scripts/migrations/011-versioned-time-catalog.sql');
 const original=timeFunction(source,'time_catalog_assert_person_sod_v1');
 const before='  IF (has_propose AND has_approve) OR (has_approve AND has_overtime_post) THEN';
 const after="  IF (has_propose AND has_approve AND NOT public.tenant_iam_operational_person_pair_v1(p_tenant_id,p_actor_person_id,p_certified_binding_id,'catalog')) OR (has_approve AND has_overtime_post) THEN";
 if(original.body.split(before).length!==2)throw Error('TIME_CATALOG_OBSERVED_SOURCE_DRIFT');
 const observed=original.body.replace(before,after);
 // Observed in both existing PG17/18. Keep the governed operational exception.
 if(createHash('sha256').update(observed).digest('hex')!=='4c4042fb3b71d03d9ccd1da82c6f63f2023b1b2b7808397969edfab3aecb660b')throw Error('TIME_CATALOG_OBSERVED_SOURCE_DRIFT');
 return source.replace(original.body,observed);
}
export function nativeTimeCandidate() {
 const deps=[
  ['093-native-fixed-novelties.sql','payroll_fixed_registry_subject_by_contract_v1','jsonb,uuid,boolean'],
  ['104-native-employment-changes.sql','native_employment_change_subject_v1','jsonb,uuid'],
  ['110-native-employment-lifecycle.sql','native_employment_lifecycle_subject_v1','jsonb,uuid'],
  ['110-native-employment-lifecycle.sql','native_employment_lifecycle_range_v1','jsonb,uuid,date,date,boolean'],
  ['110-native-employment-lifecycle.sql','native_employment_lifecycle_state_v1','jsonb,uuid,jsonb'],
  ['110-native-employment-lifecycle.sql','native_employment_lifecycle_intervals_v1','jsonb'],
  ['110-native-employment-lifecycle.sql','native_employment_lifecycle_activity_v1','jsonb,date'],
  ['110-native-employment-lifecycle.sql','native_employment_lifecycle_version_v1','jsonb,jsonb,integer'],
 ].map(([file,name,args])=>({signature:`${name}(${args})`,sha256:createHash('sha256').update(timeFunction(read('scripts/migrations/'+file),name).body).digest('hex')}));
 return nativeTimeMigration(nativeTimePrerequisiteSource(),NATIVE_TIME_HELPERS_SQL,deps);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.slice(2).join('|')!=='--write')throw Error('Explicit --write required; no database actions');
 fs.writeFileSync(path.join(root,'scripts/migrations/116-native-time-catalog.sql'),nativeTimeCandidate());
 console.log(JSON.stringify({generated:true,databaseExecuted:false}));
}
