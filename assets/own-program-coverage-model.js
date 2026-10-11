import {ownProgramBootstrap,ownProgramNamespaced} from './own-payroll-program-model.js';
import {salaryRowKey} from './native-salary-catalog-model.js';
import {OWN_RUN_TYPES} from './own-payroll-run-workspace-model.js';

export const COVERAGE_STATES=Object.freeze({rule_present:'Regla vigente',source_only:'Usado como entrada',declared_value:'Valor auxiliar declarado',not_defined:'Sin regla ni entrada',inactive:'Definición inactiva',out_of_period:'Fuera del período'});
export const COVERAGE_ACTIONS=Object.freeze({rule_present:'Revisar fórmula y respaldo',source_only:'Verificar finalidad de la entrada',declared_value:'Verificar valor y respaldo',not_defined:'Definir el tratamiento municipal',inactive:'Conservar el antecedente',out_of_period:'Consultar la vigencia correspondiente'});
const verified=new WeakSet(),freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const within=(r,p)=>r.validFrom<=p&&(r.validUntil===null||r.validUntil>=p);
const inputKeys=n=>n.op==='input'?[n.key]:['left','right','value','condition','then','else'].flatMap(k=>n[k]&&typeof n[k]==='object'?inputKeys(n[k]):[]);
export function programCoverage(value,{period,liquidationType}){
 const boot=ownProgramBootstrap(value);
 if(!/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(period)||typeof period!=='string'||!Object.hasOwn(OWN_RUN_TYPES,liquidationType))throw Error('Elegí el período y el tipo de liquidación para el cotejo completo.');
 const definition=boot.program.definition,namespaced=ownProgramNamespaced(definition),rules=(definition?.rules??[]).filter(r=>within(r,period)&&r.liquidationTypes.includes(liquidationType));
 const used=new Set(rules.flatMap(r=>inputKeys(r.expression).map(key=>r.agreementCode+':'+key)));
 const bindings=(definition?.bindings??[]).filter(b=>used.has(b.agreementCode+':'+b.key));
 const rows=boot.salaryCatalog.items.filter(d=>d.kind!=='scale').map(d=>{
  const kind=d.kind==='auxiliary'?'auxiliary':d.nature==='auxiliary'?'legacy_auxiliary':'concept';
  const matched=rules.filter(r=>r.agreementCode===d.agreementCode&&r.code===d.code&&r.nature===d.nature&&(namespaced?r.nature==='auxiliary'?d.kind==='auxiliary'&&r.unit===d.unit:d.kind==='concept':d.kind==='concept'));
  const asSource=bindings.some(b=>b.agreementCode===d.agreementCode&&b.sourceCode===d.code&&d.kind===(b.sourceKind==='auxiliary_parameter'?'auxiliary':'concept')&&['parameter','auxiliary_parameter','monthly_quantity','monthly_amount','fixed_quantity','fixed_amount'].includes(b.sourceKind)&&(!namespaced||d.kind!=='concept'||d.nature!=='auxiliary'));
  const state=!d.active?'inactive':!within(d,period)?'out_of_period':matched.length?'rule_present':asSource?'source_only':d.nature==='auxiliary'&&d.value!==null?'declared_value':'not_defined';
  return {key:salaryRowKey(d),agreementCode:d.agreementCode,kind,code:d.code,validFrom:d.validFrom,validUntil:d.validUntil,state};
 });
 const linked=boot.program.revision>0&&boot.program.salaryVersion===boot.salaryCatalog.version;
 const state=boot.salaryCatalog.revision===0?'catalog_required':boot.program.revision===0?'program_required':!linked?'catalog_changed':'linked';
 const counts=Object.fromEntries(Object.keys(COVERAGE_STATES).map(s=>[s,rows.filter(r=>r.state===s).length]));
 const report=freeze({version:'own-program-coverage.v1',period,liquidationType,catalogRevision:boot.salaryCatalog.revision,programRevision:boot.program.revision,catalogVersion:boot.salaryCatalog.version,programVersion:boot.program.version,state,linked,rows,counts,catalogRows:boot.salaryCatalog.items.length,scales:boot.salaryCatalog.items.filter(d=>d.kind==='scale').length,payrollCalculated:false,payrollPosted:false,homologated:false});
 verified.add(report);return report;
}
export function programCoverageCsv(report){
 if(!verified.has(report))throw Error('Revisá nuevamente la consulta completa antes de descargar.');
 // Only fixed labels and validated codes/months/revision numbers. No names,
 // amounts, formula text, free references, UUIDs or raw source material.
 const lines=[['Periodo','Tipo','Revision maestro','Revision programa','Vinculo','Convenio','Clase de codigo','Codigo','Desde','Hasta','Estado','Accion sugerida'],...report.rows.map(r=>[report.period,OWN_RUN_TYPES[report.liquidationType],report.catalogRevision,report.programRevision,report.linked?'Misma revision':'Revisar versiones',r.agreementCode,{concept:'Concepto',auxiliary:'Auxiliar',legacy_auxiliary:'Auxiliar historico'}[r.kind],r.code,r.validFrom,r.validUntil??'',COVERAGE_STATES[r.state],COVERAGE_ACTIONS[r.state]])];
 const cell=v=>'"'+String(v).replaceAll('"','""')+'"';return '\uFEFF'+lines.map(row=>row.map(cell).join(';')).join('\r\n')+'\r\n';
}
