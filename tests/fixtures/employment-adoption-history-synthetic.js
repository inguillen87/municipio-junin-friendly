// Synthetic history only. This adapter never connects to a database or service.
import {ID,CONTRACT,TENANT,MEMBER,principal,session} from './native-employee-synthetic.js';
export {ID,CONTRACT,TENANT,MEMBER,principal,session};
export const uid=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
export const binding={database:'synthetic_grh',companyId:101,tenantId:TENANT};
export const proof=()=>({version:'employment-adoption-history.v1',scope:{tenantId:TENANT,membershipId:MEMBER,bindingId:uid(1),companyId:101,database:binding.database},
 contract:{id:CONTRACT,personId:ID,legajo:'A/07',registrationId:uid(2),readVersion:'a'.repeat(64),identityReadVersion:'b'.repeat(64),status:'unknown',startDate:null,endDate:null,jurisdictionCode:'55',legalReference:'Resolución sintética QA 134',registeredAt:'2026-10-06T12:00:00.123456+00:00'},
 history:{coreVersionId:uid(3),curatedVersionId:uid(4),sourceBatchId:uid(5),coreBaselineBatchId:uid(6),curatedBaselineBatchId:uid(7),sourceSha256:'c'.repeat(64),coreManifestSha256:'d'.repeat(64),curatedManifestSha256:'e'.repeat(64),publicationSha256:'f'.repeat(64),cutoff:'2026-09-10T00:00:00',origin:'GRH',contractSourceBatchId:uid(6),adoptedAt:'2026-10-06T12:00:00+00:00'}});
export const row=()=>{const p=proof();return{contractId:CONTRACT,canonicalPersonId:ID,companyId:101,legajo:p.contract.legajo,recordOrigin:'MUNICONTROL',jurisdictionCode:'55',nombre:'PERSONA SINTÉTICA ADOPTADA',dni:'99999990',cuil:'20999999906',fechaIngreso:null,fechaEgreso:null,contractStatus:'unknown',administrativeStatus:'unknown',activo:false,liquidable:false,
 __contractReadVersion:p.contract.readVersion,__identityReadVersion:p.contract.identityReadVersion,convenioCode:'1',categoriaCode:'6',organizationSourceId:'7',sectorCode:'2',crosswalkStatus:'unmatched',crosswalkConfidence:null,
 rawFields:{native:{registrationId:p.contract.registrationId,adoptionProposalId:uid(8),adoptionReviewId:uid(9)},employment:{organizationName:'Sector sintético',sectorName:'Repartición sintética',categoryName:'Categoría sintética',agreementName:'Convenio sintético',cargoName:null},unionMemberships:[{unionCode:'1',unionName:'Afiliación sintética',startDate:'2000-01-01'}]}};};
export const related=()=>({archived:[{telefono:null,email:'historico@example.invalid',domicilio:'Domicilio sintético',localidad:'Localidad sintética',statusSnapshot:{administrative_status:'active',payroll_status:'liquidated'},assignmentSnapshot:{category_name:'Categoría histórica'}}],
 counts:[{absenceTotal:2,leaveTotal:1,familyTotal:1,movementTotal:2,leaveSourceMaxDate:'2026-09-01'}],
 absences:[{fecha:'2026-08-01',motivo:'Ausencia sintética',cantidad:null,dias:null,comentario:'Antecedente sintético',rawFields:{}},{fecha:'2026-08-02',motivo:'Ausencia sintética',cantidad:0,dias:0,rawFields:{}}],
 leaves:[{periodo:'2026',tipo:'Licencia sintética',fechaInicio:'2026-09-01',fechaFin:'2026-09-02',dias:2,rawFields:{}}],
 family:[{familyId:'1',nombre:'FAMILIAR HISTÓRICO SINTÉTICO',vinculo:'Hijo/a',fechaNacimiento:'2010-01-01',dni:'99999991',cuil:null,fechaBaja:null,rawFields:{}}],
 movements:[{movementPeriod:'2026-09-01',payrollType:'1',movementType:'synthetic',conceptSourceId:'95',quantity:null,sourceId:'1',rawFields:{}},{movementPeriod:'2026-09-01',payrollType:'1',movementType:'synthetic',conceptSourceId:'95',quantity:'0.0000',sourceId:'2',rawFields:{}}],
 assertions:[{sourceSystem:'GRH',attributeName:'phone',rawValue:null},{sourceSystem:'PERSONAS',attributeName:'email',rawValue:'oculto@example.invalid'}],
 references:[{sourceSystem:'GRH',sourceEntity:'employees',sourceId:'A/07',sourceBatchId:uid(6)},{sourceSystem:'PERSONAS',sourceEntity:'persons',sourceId:'private'}],
 employmentHistory:[{contractId:CONTRACT,companyId:101,legajo:'A/07',recordOrigin:'MUNICONTROL',startDate:null,endDate:null,status:'unknown'}]});
export function historySql({detail=row(),relations=related(),sourceRows=[{token:'c'.repeat(64)}],proofValue=proof(),onProof=()=>null}={}){
 const calls=[];let reads=0;
 return{calls,get proofReads(){return reads;},async query(statement,values=[]){
  calls.push({statement,values});
  if(statement.includes('effective-source:snapshot'))return structuredClone(sourceRows);
  if(statement.includes('employment_adoption_history_read_v1')){reads++;const error=onProof(reads);if(error)throw error;return[{result:structuredClone(typeof proofValue==='function'?proofValue(reads):proofValue)}];}
  if(statement.includes('__contractReadVersion'))return detail?[structuredClone(detail)]:[];
  const name=statement.includes('AS "statusSnapshot"')?'archived':statement.includes('AS "absenceTotal"')?'counts':statement.includes('FROM grh_effective_absences_v1 absence')?'absences':statement.includes('FROM grh_effective_leaves_v1')?'leaves':statement.includes('FROM grh_effective_family_v1 family')?'family':statement.includes('FROM grh_effective_employment_movement_v1')?'movements':statement.includes('FROM person_identity_assertion')?'assertions':statement.includes('FROM source_xref')?'references':statement.includes('FROM employment_contract contract')?'employmentHistory':null;
  if(!name)throw Error('Unexpected synthetic SQL');return structuredClone(relations[name]);
 }};
}
