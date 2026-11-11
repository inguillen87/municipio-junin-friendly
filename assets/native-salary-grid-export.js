// Maestro salarial · export of the consulted/filtered definitions as Excel or PDF through the shared
// report exporter. Loaded on demand by the React island so the island budget stays intact.
import {saveReport} from './report-document.js';
import {SALARY_NATURES,SALARY_UNITS} from './native-salary-catalog-model.js';
const KINDS={concept:'Concepto',auxiliary:'Auxiliar',scale:'Escala'};
const text=v=>v===null||v===undefined?'—':String(v);
export function salaryGridDocument({rows,filtered,revision,version,filters={}}){
 const stamp=new Date().toISOString().slice(0,10);
 const filter=[filters.query&&'búsqueda «'+filters.query+'»',filters.kind&&'tipo '+KINDS[filters.kind],filters.agreement&&'convenio '+filters.agreement,filters.active&&(filters.active==='true'?'habilitadas':'desactivadas')].filter(Boolean).join(' · ')||'sin filtro';
 return {title:`Maestro salarial propio · revisión ${revision}`,
  columns:[{label:'Tipo',type:'text',width:11},{label:'Código',type:'text',width:9},{label:'Convenio',type:'text',width:9},{label:'Clase',type:'text',width:8},{label:'Descripción',type:'text',width:40},{label:'Unidad · decimales',type:'text',width:18},{label:'Valor',type:'text',width:14},{label:'Vigencia · estado',type:'text',width:26}],
  rows:filtered.map(r=>[KINDS[r.kind],r.code,r.agreementCode,text(r.categoryCode),r.label,`${SALARY_UNITS[r.unit]??r.unit} · ${r.precision}`,text(r.value),`${r.validFrom} → ${text(r.validUntil)} · ${r.active?'Habilitada':'Desactivada'}`]),
  notes:[`Filtro: ${filter} · ${filtered.length} de ${rows.length} definiciones.`,'Registro municipal de definiciones; no calcula ni paga haberes.'],
  metadata:[['Revisión',String(revision)],['Versión del catálogo',String(version??'').slice(0,16)],['Generado',stamp],['Definiciones',filtered.length],['Naturalezas',Object.values(SALARY_NATURES).length]],
  filename:`municontrol_maestro-salarial_rev${revision}_${stamp}`};
}
export function exportSalaryGrid(input,format){const doc=salaryGridDocument(input);saveReport(doc,format);return doc;}
