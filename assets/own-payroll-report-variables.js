import {salaryExact,salarySerialized} from './native-salary-catalog-model.js';
import {ownRunWorkspaceResult} from './own-payroll-run-workspace-model.js';
import {ownProgramBootstrap} from './own-payroll-program-model.js';
import {decimal,exactEvidence} from './own-payroll-exact.js';

const need=(v,message)=>{if(!v)throw Error(message);};
export const OWN_VARIABLE_UNITS=Object.freeze({money:'Dinero',hours:'Horas',minutes:'Minutos',percent:'Porcentaje',units:'Unidades',coefficient:'Coeficiente'});
const origins={parameter:'Parámetro',scale:'Escala',scale_reference:'Escala de referencia',monthly_quantity:'Cantidad mensual',monthly_amount:'Importe mensual',fixed_quantity:'Cantidad fija',fixed_amount:'Importe fijo'};
const operations=new Set(['literal','input','concept','round','convert','choose','compare','add','subtract','multiply','divide','min','max']);
const same=(a,b)=>salarySerialized(a)===salarySerialized(b);

// Executed references include only the branch actually evaluated. A static
// dependency or a supplied input is not proof that a concept used the input.
function usage(rows,inputs){
 const concepts=new Map(rows.map(r=>[r.conceptCode,r])),direct=new Map(),links=new Map(),memo=new Map(),visiting=new Set();
 for(const row of rows){
  need(Array.isArray(row.trace)&&row.trace.length>0&&row.trace.length<=256,'Falta la traza original completa de un concepto.');
  const keys=new Set(),references=new Set();
  for(const t of row.trace){
   need(salaryExact(t,['operation','reference','stage','result'])&&operations.has(t.operation),'La traza original contiene una operación sin verificar.');
   if(t.operation==='input'){
    const input=inputs.get(t.reference);
    need(input&&input.value!==null&&t.stage===null&&same(t.result,exactEvidence(decimal(input.value))),'Una variable usada no coincide con su valor original.');keys.add(t.reference);
   }else if(t.operation==='concept'){
    const referenced=concepts.get(t.reference);
    need(referenced&&['exact','rounded'].includes(t.stage)&&same(t.result,t.stage==='exact'?referenced.exactValue:exactEvidence(decimal(referenced.amount))),'Falta un concepto original referenciado por la traza.');references.add(t.reference);
   }else need(t.reference===null&&t.stage===null,'La traza contiene una referencia ambigua.');
  }
  need(same(row.trace.at(-1).result,row.exactValue),'La traza no corresponde al resultado original del concepto.');direct.set(row.conceptCode,keys);links.set(row.conceptCode,references);
 }
 const used=code=>{
  if(memo.has(code))return memo.get(code);
  need(!visiting.has(code),'La traza original contiene un ciclo de conceptos.');visiting.add(code);
  const keys=new Set(direct.get(code));for(const reference of links.get(code))for(const key of used(reference))keys.add(key);
  visiting.delete(code);memo.set(code,keys);return keys;
 };
 for(const code of concepts.keys())used(code);
 return {direct,all:memo};
}

export function ownReportVariableSources(bundle,captures,maximum=250000){
 const expected=new Set(bundle.employees.map(r=>r.employee.runId));
 need(Array.isArray(captures)&&captures.length===expected.size,'Faltan capturas originales para las variables. No se exportará un subconjunto.');
 const runs=new Map(),participations=new Map();let rowCount=0,variableCount=0;
 for(const capture of captures){
  need(expected.has(capture.id)&&!runs.has(capture.id),'Una captura de variables está repetida o es ajena al histórico.');
  const verified=ownRunWorkspaceResult(capture);need(verified,'Falta el resultado guardado de una captura original.');
  ownProgramBootstrap(capture.payload.programState);
  const people=new Map(verified.input.employees.map(e=>[e.contractId,e])),totals=new Map(verified.result.employeeTotals.map(e=>[e.contractId,e])),rows=new Map();
  for(const row of verified.result.rows){const group=rows.get(row.contractId)??[];group.push(row);rows.set(row.contractId,group);}
  runs.set(capture.id,{capture,people,totals,rows});
 }
 for(const item of bundle.employees){
  const e=item.employee,run=runs.get(e.runId),{capture}=run,saved=capture.saved,person=run.people.get(e.contractId),concepts=run.rows.get(e.contractId);
  need(saved.input.period===item.period&&saved.input.liquidationType===item.type&&capture.body.period===item.period&&capture.body.liquidationType===item.type&&saved.inputSha256===e.inputSha256&&saved.resultSha256===e.resultSha256&&person&&['employeeNumber','agreementCode','departmentCode'].every(k=>person[k]===e[k])&&saved.input.totalsPrecision===e.precision&&same(run.totals.get(e.contractId),e.totals),'Las variables no corresponden a la liquidación cerrada original.');
  const closed=item.source.snapshot.concepts.filter(r=>r.contractId===e.contractId);
  need(concepts&&same(concepts,closed),'Los conceptos de la captura no coinciden con su cierre original.');
  const inputs=new Map(person.inputs.map(i=>[i.key,i])),uses=usage(concepts,inputs),variables=[];
  for(const input of person.inputs){
   const bindings=capture.payload.programState.program.definition.bindings.filter(b=>b.agreementCode===person.agreementCode&&b.key===input.key);
   need(bindings.length===1&&bindings[0].unit===input.unit,'Falta la definición original de una variable capturada.');const binding=bindings[0];
   const category=capture.payload.population.employees.find(p=>p.contractId===e.contractId)?.categoryCode;
   const descriptions=capture.payload.programState.salaryCatalog.items.filter(d=>d.active&&d.code===binding.sourceCode&&d.agreementCode===(binding.sourceAgreementCode??person.agreementCode)&&d.kind===(['scale','scale_reference'].includes(binding.sourceKind)?'scale':'concept')&&d.validFrom<=item.period&&(d.validUntil===null||d.validUntil>=item.period)&&(!['scale','scale_reference'].includes(binding.sourceKind)||d.categoryCode===(binding.sourceCategoryCode??category)));
   need(descriptions.length===1,'Falta una descripción única de la fuente original de la variable.');
   const occurrences=concepts.filter(r=>uses.all.get(r.conceptCode).has(input.key)).map(r=>({concept:r.conceptCode,kind:uses.direct.get(r.conceptCode).has(input.key)?'Uso directo':'Uso por concepto referenciado'}));
   variables.push({input,label:descriptions[0].label,origin:origins[binding.sourceKind]+' '+binding.sourceCode,occurrences});
   variableCount++;rowCount+=Math.max(1,occurrences.length);
  }
  if(!variables.length)rowCount++;
  need(rowCount<=maximum,'El informe completo de variables supera 250.000 filas. No se omitieron ni dividieron variables.');
  participations.set(item.identity,{capture,variables});
 }
 return {participations,runs,variableCount,rowCount,proof:salarySerialized([...runs.values()].map(({capture:c})=>[c.id,c.bodySha256,c.payloadSha256,c.saved.inputSha256,c.saved.resultSha256]).sort((a,b)=>a[0].localeCompare(b[0])))};
}
