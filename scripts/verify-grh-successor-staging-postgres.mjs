// Complete SQL test with the existing sealed source implementation. Synthetic data, loopback, rollback only.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {buildGrhCuratedSourceQa} from './verify-grh-curated-source-postgres.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),read=name=>fs.readFileSync(path.join(root,name),'utf8').replaceAll('\r\n','\n');
export function buildSuccessorStagingQa({expectedMajor=17}={}){
 if(![17,18].includes(expectedMajor))throw Error('SUCCESSOR_QA_MAJOR_INVALID');
 let sql=buildGrhCuratedSourceQa({expectedMajor});
 const cut=sql.indexOf('SET CONSTRAINTS ALL IMMEDIATE;');if(cut<0)throw Error('SUCCESSOR_QA_FIXTURE_ANCHOR_REQUIRED');
 sql=sql.slice(0,cut).replaceAll('grh_effective_qa_curated.','public.').replaceAll('search_path=grh_effective_qa_curated,','search_path=public,')
 .replace('CREATE SCHEMA grh_effective_qa_curated; SET LOCAL search_path=grh_effective_qa_curated,public,pg_temp;','SET LOCAL search_path=public,pg_temp;')
 .replace("current_database()<>'effective_source_qa'","current_database()<>'successor_stage_qa'");
 const empty="DO $empty$ BEGIN IF EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN('r','v','m','p')) THEN RAISE EXCEPTION 'EMPTY_DISPOSABLE_DATABASE_REQUIRED'; END IF;END $empty$;\n";
 sql=sql.replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;',empty+'CREATE EXTENSION IF NOT EXISTS pgcrypto;');
 return sql+'\n'+read('scripts/migrations/106-grh-successor-staging.sql')+'\n'+read('scripts/fixtures/grh-successor-staging-qa.sql.txt')+
 "\nSET CONSTRAINTS ALL IMMEDIATE;\nSELECT jsonb_build_object('version','grh-successor-staging-qa.v1','checks',count(*),'major',current_setting('server_version_num')::integer/10000,'synthetic',true,'rollback',true,'sourceSelected',false) FROM qa_checks;\nROLLBACK;\nSELECT to_regclass('public.grh_successor_stage') IS NULL AS schema_rollback_confirmed;\n";
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(args.some(a=>!/^--(?:expected-major=(?:17|18)|write-sql=.+)$/.test(a)))throw Error('SUCCESSOR_QA_ARGUMENT_INVALID');
 const output=args.find(a=>a.startsWith('--write-sql='))?.slice(12);if(!output)throw Error('SUCCESSOR_QA_OUTPUT_REQUIRED');
 fs.writeFileSync(path.resolve(output),buildSuccessorStagingQa({expectedMajor:Number(args.find(a=>a.startsWith('--expected-major='))?.split('=')[1]??17)}));console.log('Synthetic rollback-only staging QA written');
}
