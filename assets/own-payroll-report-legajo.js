import {salarySerialized} from './native-salary-catalog-model.js';
import {OWN_RUN_TYPES,OWN_RUN_NATURES} from './own-payroll-run-workspace-model.js';
import {ownReportVariableSources,OWN_VARIABLE_UNITS} from './own-payroll-report-variables.js';

const need=(v,message)=>{if(!v)throw Error(message);};
const buckets={remuneration:3,non_remuneration:3,deduction:4,employer_contribution:5,auxiliary:6};
const totals=[['remuneration','Remunerativo'],['non_remuneration','No remunerativo'],['deduction','Retenciones'],['employer_contribution','Contribuciones patronales'],['gross','Bruto'],['net','Neto']];

// Every label and amount belongs to the original calculation, including runs
// no longer present in a current personnel or parameter list.
export function ownLegajoReportRows(bundle,selected,maximum=250000){
 const originals=ownReportVariableSources(bundle,bundle.captures,maximum),catalogs=new Map(),concepts=new Map();
 for(const [id,{capture,rows,people}]of originals.runs){
  const catalog=new Map(),period=capture.body.period;
  for(const d of capture.payload.programState.salaryCatalog.items){
   if(d.kind!=='concept'||!d.active||d.validFrom>period||d.validUntil!==null&&d.validUntil<period)continue;
   const key=salarySerialized([d.agreementCode,d.code]);
   need(!catalog.has(key),'Hay dos descripciones vigentes de un concepto en la captura original.');catalog.set(key,d);
  }
  // Validate the entire captured census before applying display or selection
  // filters, so an empty selection cannot hide a corrupt historical label.
  for(const [contractId,items]of rows){
   const person=people.get(contractId);
   for(const r of items){
    const d=catalog.get(salarySerialized([person.agreementCode,r.conceptCode]));
    need(d&&d.nature===r.nature,'Falta la descripción y naturaleza originales de un concepto. No se usó el catálogo actual.');
   }
  }
  catalogs.set(id,catalog);concepts.set(id,rows);
 }
 const result=[];
 for(const item of selected){
  const e=item.employee,capture=originals.runs.get(e.runId).capture;
  const period=item.period+' / '+OWN_RUN_TYPES[item.type],context=e.employeeNumber+' / '+e.agreementCode+' / '+e.departmentCode;
  const version=String(e.liquidationVersion)+' / '+(capture.body.liquidationDate??'Fecha no declarada');
  for(const r of concepts.get(e.runId).get(e.contractId)){
   const d=catalogs.get(e.runId).get(salarySerialized([e.agreementCode,r.conceptCode]));
   need(d&&d.nature===r.nature,'Falta la descripción y naturaleza originales de un concepto. No se usó el catálogo actual.');
   const row=[period,context,r.conceptCode+' / '+d.label+' / '+OWN_RUN_NATURES[r.nature]+' / '+OWN_VARIABLE_UNITS[r.unit],'','','','','',version];
   row[buckets[r.nature]]=r.amount;result.push(row);
  }
  for(const [key,label]of totals)result.push([period,context,'Total cerrado: '+label,'','','','',e.totals[key],version]);
  need(result.length<=maximum,'El informe completo por legajo supera 250.000 filas. No se omitieron conceptos ni totales.');
 }
 return result;
}
