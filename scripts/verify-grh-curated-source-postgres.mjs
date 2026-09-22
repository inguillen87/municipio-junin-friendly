// Emits bounded synthetic SQL; never opens a database connection.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildGrhEffectiveSourceQa} from './verify-grh-effective-source-postgres.mjs';
import {createGrhCuratedVersionDelta,normalizeGrhCuratedVersionRecord,GRH_CURATED_VERSION_ENTITIES} from './lib/grh-curated-source-version.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(resolve(root,p),'utf8').replaceAll('\r\n','\n');
const literal=v=>"'"+String(v).replaceAll("'","''")+"'";
const json=v=>literal(JSON.stringify(v))+'::jsonb';
const relocate=(sql,schema)=>sql.replaceAll('public.',schema+'.')
 .replaceAll('search_path=public,pg_temp','search_path='+schema+',public,pg_temp')
 .replaceAll('search_path=pg_catalog,public,pg_temp','search_path=pg_catalog,'+schema+',public,pg_temp');
export function buildGrhCuratedSourceQaSetup({expectedMajor=17,schema='grh_effective_qa_curated'}={}) {
 const base=buildGrhEffectiveSourceQa({expectedMajor,schema}).split('-- Synthetic only.')[0];
 const internal=read('scripts/internal-schema.sql'),canonical=read('scripts/migrations/002-canonical-integration.sql');
 const tables=[...GRH_CURATED_VERSION_ENTITIES,'source_staging_row'].map(name=>{
  const text=name==='source_staging_row'?canonical:internal,start=text.indexOf('CREATE TABLE IF NOT EXISTS '+name+' ('),end=text.indexOf('\n);',start);
  if(start<0||end<0)throw Error('Missing QA table '+name);return text.slice(start,end+3);
 }).join('\n');
 return base+tables+"\nALTER TABLE data_import_runs ADD COLUMN quality_flags jsonb NOT NULL DEFAULT '{}',ADD COLUMN table_counts jsonb NOT NULL DEFAULT '{}';\n"+
  relocate(read('scripts/migrations/098-grh-curated-source-version.sql'),schema)+'\n';
}
export function curatedSyntheticRows(){
 const sources={};
 for(const entity of GRH_CURATED_VERSION_ENTITIES){
  const row=(n,changed=false)=>{
   const source_payload={literal:changed?'Á revised':'same',nested:{value:changed?null:'kept'},sourceIndex:n};
   const common={company_id:101,legajo:'00'+n,source_payload};
   if(entity==='grh_employees')return{...common,person_id:String(9007199254740990n+BigInt(n)),nombre:changed?'Synthetic revised':'Synthetic '+n,activo:true};
   if(entity==='grh_absences')return{...common,fecha:'2026-08-0'+n,cantidad:changed?'0':null,dias:'9007199254740993.01'};
   if(entity==='grh_leaves')return{...common,periodo:2009,fecha_inicio:'2009-01-0'+n,dias:changed?0:1};
   if(entity==='grh_family')return{...common,family_id:String(9007199254740990n+BigInt(n)),nombre:'Synthetic family '+n,fecha_baja:changed?'2026-09-01':null};
   return{catalog:n===1?'a':'b',source_key:'key'+n,label:changed?null:'Synthetic '+n,source_payload};
  };sources[entity]={baseline:[row(1),row(2),row(3)],candidate:[row(1,true),row(2),row(4)]};
 }return sources;
}
export function buildGrhCuratedSourceQa({expectedMajor=17}={}){
 const schema='grh_effective_qa_curated',parts=[],evidence={},changes=[];
 for(const [entity,{baseline,candidate}]of Object.entries(curatedSyntheticRows())){
  const delta=createGrhCuratedVersionDelta(entity,baseline,candidate);evidence[entity]={counts:delta.counts};changes.push(...delta.changes);
  const rows=baseline.map(r=>({...normalizeGrhCuratedVersionRecord(entity,r),import_run_id:1}));
  parts.push('INSERT INTO '+entity+' SELECT * FROM jsonb_populate_recordset(NULL::'+entity+','+json(rows)+');');
  parts.push('INSERT INTO original SELECT '+literal(entity)+',md5(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text)::text) FROM '+entity+' r;');
  parts.push('INSERT INTO expected SELECT '+literal(entity)+',grh_curated_source_key_v1('+literal(entity)+',r),r FROM jsonb_array_elements('+json(candidate.map(r=>normalizeGrhCuratedVersionRecord(entity,r)))+') r;');
 }
 const fixture=read('scripts/fixtures/grh-curated-source-qa.sql.txt')
  .replace('__ROWS__',()=>parts.join('\n')).replace('__EVIDENCE__',()=>json(evidence)).replace('__CHANGES__',()=>json(changes)).replaceAll('__SCHEMA__',schema);
 return buildGrhCuratedSourceQaSetup({expectedMajor,schema})+relocate(fixture,schema);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(args.some(a=>!/^--(?:expected-major=(?:17|18)|write-sql=.+)$/.test(a)))throw Error('Unsupported argument');
 const expectedMajor=Number(args.find(a=>a.startsWith('--expected-major='))?.split('=')[1]??17),target=args.find(a=>a.startsWith('--write-sql='))?.slice(12);
 const sql=buildGrhCuratedSourceQa({expectedMajor});if(target){writeFileSync(resolve(target),sql);process.stdout.write('Synthetic curated SQL QA generated\n');}else process.stdout.write(sql);
}
