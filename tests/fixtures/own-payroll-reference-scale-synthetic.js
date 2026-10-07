import {approvedSources} from './own-payroll-approved-synthetic.js';
// Codes/classes/value/date are invented; labels are not municipal mappings.
export function referenceScaleSources(count=2){
 const s=approvedSources(count),b=s.programState.program.definition.bindings.find(b=>b.key==='base');
 Object.assign(b,{sourceKind:'scale_reference',sourceAgreementCode:'4',sourceCategoryCode:'13'});
 const row=s.programState.salaryCatalog.items.find(i=>i.code==='8800');
 Object.assign(row,{kind:'scale',agreementCode:'4',categoryCode:'13',nature:null,label:'Clase de referencia inventada QA',value:'201.35'});
 s.programState.salaryCatalog.items.push({...row,categoryCode:'6',value:'999.99',label:'Otra clase inventada QA'});
 return s;
}
