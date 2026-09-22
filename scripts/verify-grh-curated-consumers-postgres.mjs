// Emits rollback-only PostgreSQL QA; all identities and rows are synthetic.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {buildGrhCuratedSourceQaSetup} from './verify-grh-curated-source-postgres.mjs';
import {splitPostgresStatements} from './lib/sql-statements.mjs';
import {createGrhCuratedVersionDelta,normalizeGrhCuratedVersionRecord} from './lib/grh-curated-source-version.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8').replaceAll('\r\n','\n');
const q=s=>"'"+String(s).replaceAll("'","''")+"'";
const json=x=>q(JSON.stringify(x))+'::jsonb';
const hash=x=>createHash('sha256').update(x).digest('hex');
const entities=['grh_employees','grh_absences','grh_leaves','grh_family','grh_catalog_rows'];
export function buildGrhCuratedConsumersQa({expectedMajor=17}={}){
 if(![17,18].includes(expectedMajor))throw Error('Invalid QA target');
 const schema='grh_effective_qa_curated',migration=read('scripts/migrations/099-grh-curated-consumers.sql');
 let setup=buildGrhCuratedSourceQaSetup({expectedMajor,schema}).replaceAll(schema+'.','public.').replaceAll('search_path='+schema+',','search_path=public,').replace('CREATE SCHEMA '+schema+'; SET LOCAL search_path='+schema+',public,pg_temp;','SET LOCAL search_path=public,pg_temp;').replace("current_database()<>'effective_source_qa'","current_database()<>'curated_consumers_qa'").replace('ALTER TABLE employment_contract DROP CONSTRAINT employment_contract_grh_authority_ck;','');
 setup=setup.replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;',"DO $empty$ BEGIN IF EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN('r','p','v','m')) THEN RAISE EXCEPTION 'EMPTY_DISPOSABLE_DATABASE_REQUIRED'; END IF; END $empty$;\nCREATE EXTENSION IF NOT EXISTS pgcrypto;");
 const iam=splitPostgresStatements(read('scripts/migrations/007-action-center-read-facades.sql')).filter(s=>/CREATE OR REPLACE FUNCTION (action_center_assert_tenant_read_session_v2|action_center_context_has_capability)\(/.test(s)).join(';\n')+';';
 const normalize=splitPostgresStatements(read('scripts/migrations/002-canonical-integration.sql')).filter(s=>/CREATE OR REPLACE FUNCTION (normalize_digits|is_valid_cuil|reject_immutable_source_change|validate_source_batch_system)\(/.test(s)).join(';\n')+';';
 const installed=JSON.parse(read('tests/fixtures/grh-curated-consumers-installed.json'));
 if(installed.functions.length!==18)throw Error('Installed fixture incomplete');
 const definitions=installed.functions.map(f=>{const body=f.definition.match(/AS \$function\$([\s\S]*?)\$function\$/)?.[1];if(!body||hash(body)!==f.sha256||!migration.includes(f.sha256))throw Error('Pinned fixture changed: '+f.name);return f.definition+';';}).join('\n');
 const metadata=read('scripts/migrations/097-grh-effective-consumers.sql').split('-- action_center_case_source_context_v1:')[0].split('CREATE OR REPLACE VIEW')[1];
 const family=n=>({family_id:String(910000000000000000n+BigInt(n)),company_id:101,legajo:'001',nombre:'Synthetic child '+n,sexo:'F',fecha_nacimiento:'2012-02-29',dni:null,cuil:null,vinculo_code:'2',fecha_baja:null,source_payload:{literal:'child '+n}});
 const extras=Array.from({length:2681},(_,i)=>({...family(i+100),legajo:'999'}));
 const families=[family(1),family(2),family(3),...extras];
 const catalog={catalog:'family_relationships',source_key:'{"relationshipId":"2"}',label:'HIJO',source_payload:{code:'H',name:'HIJO',sourceKey:{relationshipId:'2'}}};
 const catalogs=[catalog,...['agreements','categories','organizations','sectors'].map(kind=>({catalog:kind,source_key:JSON.stringify({kind,code:'1'}),label:'Synthetic '+kind,source_payload:{activeSourceValue:'1',companyCode:'101',sourceKey:{agreementCode:'1',categoryCode:'1',organizationId:'1',sectorCode:'1'}}}))];
 const sources={grh_employees:{baseline:[],candidate:[]},grh_absences:{baseline:[],candidate:[]},grh_leaves:{baseline:[],candidate:[]},grh_family:{baseline:families,candidate:[family(1),{...family(2),dni:'99000002'},family(3),family(4),{...family(5),legajo:'999'},...extras.map(r=>({...r,source_payload:{...r.source_payload,revision:'candidate'}}))]},grh_catalog_rows:{baseline:catalogs,candidate:catalogs.map(r=>r.catalog==='sectors'?{...r,label:'Revised synthetic sector'}:r)}};
 const evidence={},changes=[],rows=[];
 for(const [entity,data]of Object.entries(sources)){
  const delta=createGrhCuratedVersionDelta(entity,data.baseline,data.candidate);evidence[entity]={counts:delta.counts};changes.push(...delta.changes);
  if(data.baseline.length)rows.push(`INSERT INTO ${entity} SELECT * FROM jsonb_populate_recordset(NULL::${entity},${json(data.baseline.map(r=>({...normalizeGrhCuratedVersionRecord(entity,r),import_run_id:1})))});`);
 }
 const fixture=read('scripts/fixtures/grh-curated-consumers-qa.sql.txt').replace('__BASE_ROWS__',()=>rows.join('\n')).replace('__EVIDENCE__',()=>json(evidence)).replace('__CHANGES__',()=>json(changes)).replace('__SCHOOL_BASELINE__',()=>read('scripts/fixtures/grh-curated-consumers-school-baseline.sql.txt')).replace('__MIGRATION_SHA__',hash(migration));
 return setup+'\n'+read('scripts/fixtures/grh-curated-consumers-iam.sql.txt')+'\n'+normalize+'\n'+iam+'\nCREATE TRIGGER employment_contract_batch_system BEFORE INSERT OR UPDATE ON employment_contract FOR EACH ROW EXECUTE FUNCTION validate_source_batch_system();\n'+['057-family-schooling-certificates.sql','064-employee-family-members.sql','091-schooling-administrative-records.sql','094-schooling-source-recovery.sql','067-native-employee-registration.sql','095-native-employee-jurisdiction.sql'].map(n=>read('scripts/migrations/'+n)).join('\n')+'\nCREATE OR REPLACE VIEW'+metadata+'\nSET LOCAL check_function_bodies=false;\n'+definitions+'\nCREATE TEMP TABLE qa_function_before AS SELECT oid,proacl,proowner,prosecdef,proconfig FROM pg_proc WHERE oid=ANY(ARRAY['+installed.functions.map(f=>q('public.'+f.signature)).join(',')+']::regprocedure[]);\n'+migration+'\n'+migration+'\nSET LOCAL check_function_bodies=true;\n'+fixture;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(args.some(a=>!/^--(?:expected-major=(?:17|18)|write-sql=.+)$/.test(a)))throw Error('Unsupported argument');
 const expectedMajor=Number(args.find(a=>a.startsWith('--expected-major='))?.split('=')[1]??17),output=args.find(a=>a.startsWith('--write-sql='))?.slice(12),sql=buildGrhCuratedConsumersQa({expectedMajor});
 if(output){fs.writeFileSync(path.resolve(output),sql);console.log('Synthetic curated consumer SQL generated');}else process.stdout.write(sql);
}
