import {loaderQaPackage} from './successor-loader-postgres.js';
import {syntheticOperationalResults,target as operationalTarget} from './successor-operational-synthetic.js';
import {getGrhSourceProfile} from '../../scripts/lib/grh-source-profile.mjs';
import {buildSuccessorDelta,sealSuccessorPackage,SUCCESSOR_ENTITIES} from '../../scripts/lib/grh-successor-package.mjs';
import {curatedSyntheticRows} from '../../scripts/verify-grh-curated-source-postgres.mjs';
import {normalizeGrhCuratedVersionRecord} from '../../scripts/lib/grh-curated-source-version.mjs';
import {SOURCE_CAPACITY_QUERY} from '../../scripts/lib/grh-source-capacity.mjs';
import {municipalFootprintCatalog,municipalFootprintResults} from './municipal-footprint-synthetic.js';
import {CONTINUITY_TABLES_SQL,CONTINUITY_FOREIGN_KEYS_SQL} from '../../scripts/lib/grh-successor-continuity.mjs';

export const finalRevisionTarget=operationalTarget;
// Fictional records exercise the actual date, decimal and literal-payload projections.
export function finalRevisionCoreRows(){
 const companyCode='101',employeeNumber='001',key={companyCode,employeeNumber};
 const runs=[['2026-09-30',9,'M','closed','S'],['2026-10-31',10,'M','open','N'],['2026-10-31',10,'O','open',null]]
  .map(([payrollDate,month,payrollType,closureStatus,sourceClosureFlag])=>({sourceKey:{companyCode,payrollDate,period:2026,month,payrollType},closureStatus,sourceClosureFlag,sourceDateIg:null}));
 const monthly=[9,10].map(month=>({sourceKey:{...key,payrollDate:month===9?'2026-09-30':'2026-10-31',period:2026,month,payrollType:'M'},
  itemCount:2,quantitySum:'9007199254740993.0000001',technicalSourceAmountSum:null,
  sourceTotals:{net:'0.00',netPayable:null,subjectEarnings:'12345678901234567890.0123456789'},
  dominantAgreementCode:'SYNTHETIC',dominantSectorCode:null,distinctConcepts:2,qualityFlags:['synthetic_observation']}));
 return {'core/payrollRuns':runs,'core/payrollMonthly':monthly,
  'core/payrollSnapshot':[{sourceKey:{...key,syntheticSnapshotId:'10'},payrollDate:'2026-10-31',period:2026,month:10,payrollType:'M',
   agreement:{id:'SYNTHETIC',name:'Convenio de prueba'},category:'Clase de prueba',role:'Cargo de prueba',
   budget:{structure:'Prueba',detail:null,account:'1'},organization:{departmentId:'1',department:'042',area:null}}],
  'core/movements':[{sourceKey:{...key,year:2026,month:10,payrollType:'M',conceptCode:'95',costCenterCode:'1'},
   movementType:'synthetic',quantity:'9007199254740993.0000001',installment:null,automatic:'N',adjustment:null,forced:'N',legalInstrument:null,status:'synthetic'}]};
}
export async function finalRevisionPackage(){
 const old=await loaderQaPackage(),profile=getGrhSourceProfile('grh-junin-2026-10-01',{allowCandidateRead:true});
 const core=finalRevisionCoreRows(),data=curatedSyntheticRows(),results=[];
 for(const entity of SUCCESSOR_ENTITIES){
  if(core[entity]){results.push(await buildSuccessorDelta(entity,{baseline:()=>[],candidate:()=>core[entity]}));continue;}
  if(entity==='curated/grh_employees'){
   const baseline=data.grh_employees.candidate.map(r=>normalizeGrhCuratedVersionRecord('grh_employees',r)),candidate=structuredClone(baseline);
   candidate[0].nombre='QA final: changed employee';
   candidate[0].source_payload={...candidate[0].source_payload,department:{id:'1',name:'042'},regime:'SYNTHETIC',title:null,
    class:'TEST',category:'TEST',concurso:null,liquida:false,seniority:'9007199254740993.0000001',bank:null,zero:'0.00'};
   results.push(await buildSuccessorDelta(entity,{baseline:()=>baseline,candidate:()=>candidate}));continue;
  }
  results.push({entity,...old.entities[entity],rows:old.changes.filter(c=>c.entity===entity)});
 }
 return sealSuccessorPackage({baseline:old.baseline,candidate:{...old.candidate,profileId:profile.id,
  sourceSha256:profile.source.sha256.toLowerCase(),cutoff:profile.source.cutoff},results});
}
export function finalRevisionClient(pack,options={}){
 const calls=[],observations=syntheticOperationalResults(pack),fingerprints=Object.fromEntries(observations.slice(1,11)
  .map(([{observation:r}])=>[r.entity,r.candidateFingerprint]));
 for(const index of [0,observations.length-1])Object.assign(observations[index][0].observation,{readOnly:'off',isolation:'serializable'});
 const state={database:finalRevisionTarget.databaseName,project:finalRevisionTarget.projectId,branch:finalRevisionTarget.branchId,
  read_only:'off',isolation:'serializable',owner:true,installed:false,...options.state};
 const municipalCatalog=municipalFootprintCatalog('municipal-sql144'),municipalObservations=municipalFootprintResults(municipalCatalog,finalRevisionTarget,'municipal-sql144');
 for(const i of [0,municipalObservations.length-1])Object.assign(municipalObservations[i][0].observation,{readOnly:'off',isolation:'serializable',owner:true});
 let municipalCursor=0;
 let cursor=0,stored=null,deltaRows=0,chunks=0,capacities=0;
 const checkpoint=()=>({stored:structuredClone(stored),deltaRows,installed:state.installed});let saved,transaction;
 const restore=snapshot=>{stored=snapshot.stored;deltaRows=snapshot.deltaRows;state.installed=snapshot.installed;};
 return {calls,get deltaRows(){return deltaRows;},get chunks(){return chunks;},get stored(){return stored;},state,
  async query(text,values){
   calls.push({text,values});if(options.fail?.(text,values,calls))throw Error('synthetic interrupted query');
   if(text.startsWith('BEGIN')){transaction=checkpoint();return {rows:[]};}
   if(text==='ROLLBACK'){restore(transaction);return {rows:[]};}
   if(text==='COMMIT'||text.startsWith('SET LOCAL'))return {rows:[]};
   if(text.includes('final-revision:state'))return {rows:[state]};
   if(text.includes('final-revision:private-schema'))return {rows:[options.protection??{tables:3,protected:true,runtime_access:false}]};
   if(text===SOURCE_CAPACITY_QUERY)return {rows:[options.capacity?.(++capacities)??{database_bytes:'1000000',cluster_bytes:'4000000'}]};
   if(text.startsWith('SAVEPOINT')){saved=checkpoint();return {rows:[]};}
   if(text.startsWith('ROLLBACK TO SAVEPOINT')){restore(saved);return {rows:[]};}
   if(text.startsWith('RELEASE SAVEPOINT'))return {rows:[]};
   if(text.includes('pg_try_advisory'))return {rows:[{acquired:options.lock!==false}]};
   if(text===CONTINUITY_TABLES_SQL)return {rows:structuredClone(municipalCatalog.tables)};
   if(text===CONTINUITY_FOREIGN_KEYS_SQL)return {rows:structuredClone(municipalCatalog.foreignKeys)};
   if(text.startsWith("SELECT jsonb_build_object('projectId'")||text.startsWith("SELECT jsonb_build_object('table'")){
    const i=municipalCursor++;
    // Catalog queries above do not consume these synthetic result positions.
    const positions=[0,...Array.from({length:86},(_,n)=>n+3),municipalObservations.length-1];
    const rows=structuredClone(municipalObservations[positions[i%positions.length]]);options.municipal?.(rows,municipalCursor);return {rows};
   }
   if(text.startsWith('/* successor-preflight:')||text.startsWith('WITH selected')){
    const rows=structuredClone(observations[cursor++%observations.length]);options.observation?.(rows,cursor);return {rows};
   }
   if(text.startsWith('-- The final backup')){state.installed=true;return {rows:[]};}
   if(text.includes('final-revision:stored'))return {rows:stored?[structuredClone(stored)]:[]};
   if(text.includes('final-revision:create')){
    const names=['tenant_id','source_binding_id','parent_core_version_id','parent_curated_version_id','parent_publication_sha256',
     'source_profile','source_sha256','source_cutoff','core_manifest_sha256','curated_manifest_sha256','package_sha256','evidence'];
    stored={id:'88888888-8888-4888-8888-888888888888',...Object.fromEntries(names.map((key,i)=>[key,key==='evidence'?JSON.parse(values[i]):values[i]]))};
    return {rows:[{id:stored.id}]};
   }
   if(text.includes('final-revision:delta */')){deltaRows+=JSON.parse(values[1]).length;chunks++;return {rows:[]};}
   if(text.startsWith('INSERT INTO public.grh_final_source_seal')){stored.sealed=true;stored.fingerprints=JSON.parse(values[1]);return {rows:[]};}
   if(text.startsWith('SET CONSTRAINTS')||text.startsWith('SELECT public.grh_final_source_parent'))return {rows:[]};
   if(text.includes('final-revision:delta-check'))return {rows:[{mismatches:options.mismatches??0}]};
   if(text.startsWith('SELECT public.grh_final_source_fingerprint'))return {rows:[{fingerprint:options.fingerprint?.(values[1])??fingerprints[values[1]]}]};
   throw Error('Unexpected synthetic SQL: '+text.slice(0,70));
  }};
}
