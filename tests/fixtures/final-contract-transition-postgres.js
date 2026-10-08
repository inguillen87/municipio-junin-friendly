import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
import {finalRevisionPackage,finalRevisionCoreRows} from './final-source-revision-synthetic.js';
import {buildSuccessorDelta,sealSuccessorPackage,SUCCESSOR_ENTITIES} from '../../scripts/lib/grh-successor-package.mjs';
import {curatedSyntheticRows} from '../../scripts/verify-grh-curated-source-postgres.mjs';
import {normalizeGrhCuratedVersionRecord} from '../../scripts/lib/grh-curated-source-version.mjs';
/** Extend only the bounded isolated QA schema, before taking its initial footprint. */
export async function addFinalTransitionQaLinks(query){
 await query('ALTER TABLE public.employment_contract ADD COLUMN tenant_id uuid,ADD COLUMN jurisdiction_code text');
 await query('ALTER TABLE public.person_identity ADD COLUMN full_name text,ADD COLUMN dni text,ADD COLUMN cuil text,ADD COLUMN birth_date date,ADD COLUMN sex_code text');
 const sql=readFileSync(new URL('../../scripts/migrations/002-canonical-integration.sql',import.meta.url),'utf8').replaceAll('\r\n','\n');
 const start=sql.indexOf('CREATE TABLE IF NOT EXISTS source_xref ('),end=sql.indexOf('\n);',start);assert.ok(start>0&&end>start);
 await query(sql.slice(start,end+3).replace('source_xref (','public.source_xref (').replace('REFERENCES source_import_batch','REFERENCES public.source_import_batch'));
 await query(`INSERT INTO public.source_xref(source_system,source_entity,source_id,source_batch_id,canonical_entity,canonical_id,match_method,confidence,valid_from)
 SELECT 'GRH','persona','9007199254740991',c.source_batch_id,'person_identity',c.person_id,'grh_person_seed',1,now()
 FROM public.employment_contract c WHERE c.legacy_company_id=101 AND c.legacy_legajo='001'`);
 await query("UPDATE public.person_identity SET full_name='Synthetic original identity' WHERE id IN(SELECT person_id FROM public.employment_contract)");
}
export async function finalTransitionQaPackage(){
 const old=await finalRevisionPackage(),data=curatedSyntheticRows(),results=[],core=finalRevisionCoreRows();
 for(const entity of SUCCESSOR_ENTITIES){
  if(entity==='curated/grh_employees'){
   const baseline=data.grh_employees.candidate.map(r=>normalizeGrhCuratedVersionRecord('grh_employees',r));
   const candidate=baseline.map((r,i)=>({...r,fecha_ingreso:'2015-01-01',fecha_egreso:i===1?null:i===2?'2014-12-31':'2026-09-30',
    activo:i===1,convenio_code:'SYNTHETIC',categoria_code:'TEST',sector_code:'AREA',cargo_code:'POSITION',
    source_payload:{sourceKey:{companyCode:'101',employeeNumber:r.legajo},employment:{activeProxy:i===1,organizationId:'SYNTHETIC_AREA'},
     sourceFields:{iddepartamento:i===2?null:i===1?'2':'1',NOLI_12:i===1?'1':'0',SUEL_12:'9007199254740993.0000001',CUEN_12:null},
     sourceProvenance:{table:'legajo',primaryKey:{CODI_01:'101',LEGA_12:r.legajo}},
     sourceReferences:i===2?{}:{department:{table:'departamento',primaryKey:{iddepartamento:i===1?'2':'1'},sourceFields:{nombre:i===1?'055':'042'}}}}}));
   results.push(await buildSuccessorDelta(entity,{baseline:()=>baseline,candidate:()=>candidate}));continue;
  }
  if(entity==='core/employmentReconciliation'){
   const baseline=[{sourceKey:{companyCode:'101',employeeNumber:'001'},administrativeActive:true,
    liquidatedCurrent:true,evidenceStatus:'active_and_liquidated',lastPayrollDate:'2026-09-30'}];
   const candidate=['001','002','004'].map((employeeNumber,i)=>({...baseline[0],
    sourceKey:{companyCode:'101',employeeNumber},administrativeActive:i===1}));
   results.push(await buildSuccessorDelta(entity,{baseline:()=>baseline,candidate:()=>candidate}));continue;
  }
  // Preserve the final-cut payroll/history fixture rather than retesting a different projection.
  if(core[entity]||entity.startsWith('curated/')){
   results.push({entity,...old.entities[entity],rows:old.changes.filter(c=>c.entity===entity)});continue;
  }
  throw Error('Incomplete transition fixture');
 }
 return sealSuccessorPackage({baseline:old.baseline,candidate:old.candidate,results});
}
