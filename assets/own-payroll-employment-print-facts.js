// Additive evidence for future captures. Economic classification v1, amounts,
// existing captures and existing receipt snapshots are never rewritten here.
import {salaryExact,salaryHash,salaryUuid,salarySerialized} from './native-salary-catalog-model.js';
import {policySha256} from './own-payroll-policy-validity.js';
import {ownRunPeriodClassifications} from './own-payroll-period-classification.js';
import {periodClassificationProvenance} from './own-period-classification-model.js';
import {ownReceiptPrintFacts} from './own-payroll-receipt-print-facts.js';

export const OWN_EMPLOYMENT_PRINT_CAPTURE_VERSION='own-employment-print-capture.v1';
export const OWN_EMPLOYMENT_PRINT_EVIDENCE_VERSION='own-employment-print-evidence.v1';
export const OWN_EMPLOYMENT_JOB_TITLE_SOURCE='source_payload.employment.cargoName';
export const OWN_EMPLOYMENT_JOB_TITLE_ERROR='OWN_RUN_EMPLOYMENT_PRINT_TITLE_INVALID';
const need=(condition,message)=>{if(!condition)throw Error(message);};
const same=(a,b)=>salarySerialized(a)===salarySerialized(b);
// The canonical salary serialization preserves the bytes of historical
// classification/provenance strings. New titles are already canonical text.
const hash=value=>policySha256(value,{preserveLegacyUnicode:true});
const dense=value=>Array.isArray(value)&&Reflect.ownKeys(value).length===value.length+1
 &&Array.from({length:value.length},(_,i)=>Object.getOwnPropertyDescriptor(value,String(i))).every(d=>d&&Object.hasOwn(d,'value')&&d.enumerable);
// The reader and supplied-row preflight share this exact text contract. Reasons
// are fixed codes: neither the value nor a normalized substitute is returned.
export function ownEmploymentJobTitleReasons(value){
 if(value===null)return [];
 if(typeof value!=='string')return ['invalid_type'];
 if(value.length===0)return ['empty'];
 if(value.length>120)return ['utf16_length'];
 const reasons=[];
 // PostgreSQL UTF8/jsonb cannot hold lone surrogates; the original reader also
 // rejected them through its canonical payload hash. Reject them here as well.
 if([...value].some(character=>{const cp=character.codePointAt(0);return cp>=0xd800&&cp<=0xdfff;}))reasons.push('invalid_unicode');
 if(value!==value.trim())reasons.push('exterior_whitespace');
 if(value!==value.normalize('NFC'))reasons.push('non_nfc');
 if(/[\u0000-\u001f\u007f-\u009f]/.test(value))reasons.push('control_characters');
 if(/[\u202a-\u202e\u2066-\u2069]/.test(value))reasons.push('bidirectional_controls');
 if(/[<>]/.test(value))reasons.push('markup_characters');
 return reasons;
}

export function ownRunEmploymentPrintFacts(capture){
 const inventory=capture?.payload?.sourceInventory;
 if(!inventory||!Object.hasOwn(inventory,'employmentPrintFacts'))return null;
 const value=inventory.employmentPrintFacts,classes=ownRunPeriodClassifications(capture),population=capture.payload.population?.employees;
 need(classes!==null&&salaryExact(value,['version','period','complete','total','classificationsSha256','rows'])
  &&value.version===OWN_EMPLOYMENT_PRINT_CAPTURE_VERSION&&value.period===capture.body.period&&value.period===capture.payload.period
  &&value.complete===true&&dense(value.rows)&&value.rows.length<=10000&&value.total===value.rows.length
  &&dense(population)&&value.total===population.length&&value.total===classes.total
  &&salaryHash(value.classificationsSha256)&&value.classificationsSha256===hash(classes),
 'No se verificó la evidencia completa del cargo y su encuadre salarial original.');
 const classified=new Map(classes.rows.map(row=>[row.contractId,row])),ids=new Set(),registrations=new Set();
 for(const row of value.rows){
  need(salaryExact(row,['contractId','registrationId','identityToken','classificationRowSha256','basis','jobTitle','provenance'])
   &&salaryUuid(row.contractId)&&salaryUuid(row.registrationId)&&salaryHash(row.identityToken)&&salaryHash(row.classificationRowSha256)
   &&!ids.has(row.contractId)&&!registrations.has(row.registrationId),
  'Una fila de cargo no conserva su identidad, registro y texto originales.');
  const titleReasons=ownEmploymentJobTitleReasons(row.jobTitle);
  if(titleReasons.length)throw Object.assign(new Error('El cargo no cumple el contrato de impresión; requiere revisión de sus datos de origen.'),
   {code:OWN_EMPLOYMENT_JOB_TITLE_ERROR,reasons:titleReasons});
  const classification=classified.get(row.contractId);
  need(classification&&row.registrationId===classification.registrationId&&row.identityToken===classification.identityToken
   &&row.basis===classification.basis&&row.classificationRowSha256===hash(classification),
  'El cargo no pertenece a la misma fila de encuadre capturada.');
  if(row.basis==='current_own_registration'){
   const p=row.provenance;
   need(salaryExact(p,['kind','sourceField','sourceVersion','registration'])&&p.kind==='current_own_contract_at_capture'
    &&p.sourceField===OWN_EMPLOYMENT_JOB_TITLE_SOURCE&&salaryHash(p.sourceVersion),
   'Falta la procedencia exacta del cargo leído al capturar.');
   const proof=periodClassificationProvenance(p.registration);
   need(proof.registrationId===row.registrationId,'La procedencia del cargo corresponde a otro registro.');
  }else{
   // A retrospective economic declaration v1 never declared a historical title.
   // The current employee record cannot supply that missing historical fact.
   need(row.basis==='approved_own_period_classification'&&row.jobTitle===null&&same(row.provenance,classification.provenance),
   'El encuadre retroactivo no autoriza completar un cargo histórico desconocido.');
  }
  ids.add(row.contractId);registrations.add(row.registrationId);
 }
 need(capture.payloadSha256===hash(capture.payload),'La evidencia del cargo no conserva la huella de la captura completa.');
 return value;
}

// Projection for the prospective producer and independent review of its
// output. Only the frozen capture is read; no current employment lookup exists.
// Absence keeps the original v6 employment hash (or its original null).
export function ownReceiptEmploymentPrintProjection(record,capture){
 need(salaryUuid(record?.contractId)&&salaryUuid(record?.registrationId)&&salaryUuid(record?.runId)
  &&record.runId===capture?.id&&salaryHash(record.payloadSha256)&&record.payloadSha256===capture.payloadSha256
  &&capture.payloadSha256===hash(capture.payload),
 'Los datos de empleo no pertenecen a la captura original del recibo.');
 const classes=ownRunPeriodClassifications(capture),facts=ownRunEmploymentPrintFacts(capture);
 if(classes===null)return {employmentStartDate:null,categoryCode:null,jobTitle:null,employmentEvidenceSha256:null};
 const classification=classes.rows.find(row=>row.contractId===record.contractId);
 need(classification&&classification.registrationId===record.registrationId,'El recibo identifica otro registro laboral.');
 const fact=facts?.rows.find(row=>row.contractId===record.contractId)??null;
 return {employmentStartDate:classification.definition.startDate,categoryCode:classification.definition.categoryCode,
  jobTitle:fact?.jobTitle??null,employmentEvidenceSha256:facts===null?hash(classes):hash({version:OWN_EMPLOYMENT_PRINT_EVIDENCE_VERSION,
   periodClassifications:classes,employmentPrintFacts:facts})};
}

// Optional full-source check for the candidate laboratory. The normal receipt
// reader still works from the immutable receipt alone, including old versions.
export function verifyOwnReceiptEmploymentPrintFacts(record,capture){
 const facts=ownReceiptPrintFacts(record),expected=ownReceiptEmploymentPrintProjection(record,capture);
 need(facts.employmentStartDate===expected.employmentStartDate&&facts.classification.categoryCode===expected.categoryCode
  &&facts.classification.jobTitle===expected.jobTitle&&facts.classification.categoryLabel===null&&facts.classification.positionStructure===null
  &&facts.sources.employmentEvidenceSha256===expected.employmentEvidenceSha256,
 'Los datos impresos de empleo no son la proyección exacta de la captura original.');
 return facts;
}
