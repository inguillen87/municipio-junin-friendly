import {salaryExact,salarySerialized} from './native-salary-catalog-model.js';
import {ownRunWorkspaceResult} from './own-payroll-run-workspace-model.js';
import {ownProgramBootstrap} from './own-payroll-program-model.js';
import {decimal,exactEvidence,rational,quantize} from './own-payroll-exact.js';
import {ownPayrollConditions,conditionUnit,conditionValue} from './own-payroll-conditions.js';
import {ownFixedForcedAmounts,ownFixedForcedRuleKey} from './own-payroll-engine.js';

const need=(v,message)=>{if(!v)throw Error(message);};
export const OWN_VARIABLE_UNITS=Object.freeze({money:'Dinero',hours:'Horas',minutes:'Minutos',days:'Días',percent:'Porcentaje',units:'Unidades',coefficient:'Coeficiente',code:'Código',boolean:'Sí/no'});
// Every engine unit (own-payroll-engine units) and condition unit has a label.
// An undeclared unit fails closed; it never becomes the text "undefined" in a row.
export const ownVariableUnitLabel=unit=>{need(Object.hasOwn(OWN_VARIABLE_UNITS,unit),'Falta la unidad declarada de una variable o concepto original. No se omitió ni sustituyó la unidad.');return OWN_VARIABLE_UNITS[unit];};
export const ownVariableDisplayValue=input=>input.value===null?null:input.unit==='boolean'?(input.value?'Sí':'No'):input.value;
const factDescriptions={period_context_fact:{monthNumber:'Mes del período de liquidación declarado'},agreement_time_fact:{monthlyHours:'Horas mensuales del convenio'},salary_condition_fact:{partialSeniorityYears:'Antigüedad parcial declarada',titleStatus:'Situación del título',titleCode:'Código del título',titlePercentage:'Porcentaje del título',unhealthyWork:'Insalubridad declarada'},classification_fact:{categoryCode:'Clase del contrato propio',agreementCode:'Convenio del contrato propio'},employment_fact:{seniorityYears:'Años reconocidos de antigüedad total',seniorityMonths:'Meses reconocidos de antigüedad total'},working_time_fact:{dailyHours:'Horas contractuales diarias',monthlyHours:'Horas contractuales mensuales'},period_fact:{recognizedUnits:'Unidades reconocidas del período',baseUnits:'Base de unidades del período'}};
const factOrigins={period_context_fact:'Contexto propio del período',agreement_time_fact:'Convenio propio',salary_condition_fact:'Condiciones propias',classification_fact:'Encuadre propio',employment_fact:'Antigüedad propia',working_time_fact:'Jornada propia',period_fact:'Participación del período'};
const origins={parameter:'Parámetro',auxiliary_parameter:'Parámetro auxiliar',scale:'Escala',scale_reference:'Escala de referencia',monthly_quantity:'Cantidad mensual',monthly_amount:'Importe mensual',fixed_quantity:'Cantidad fija',fixed_amount:'Importe fijo'};
const operations=new Set(['literal','input','concept','auxiliary','round','convert','choose','compare','add','subtract','multiply','divide','min','max']);
const same=(a,b)=>salarySerialized(a)===salarySerialized(b);
const nodes=(n,op)=>(n.op===op?[n]:[]).concat(['left','right','value','condition','then','else'].flatMap(k=>n[k]&&typeof n[k]==='object'?nodes(n[k],op):[]));
function traceValue(v){
 need(salaryExact(v,['numerator','denominator'])&&typeof v.numerator==='string'&&/^-?(0|[1-9][0-9]{0,511})$/.test(v.numerator)&&typeof v.denominator==='string'&&/^[1-9][0-9]{0,511}$/.test(v.denominator),'La fase de cantidad no conserva un valor racional original.');
 const value=rational(BigInt(v.numerator),BigInt(v.denominator));need(same(exactEvidence(value),v),'La fase de cantidad no conserva su representación exacta.');return value;
}
// Match only the stored execution order, without evaluating the formula. A
// quantity phase wraps its value's final trace entry; it is not a monetary link.
function quantityTrace(rule,trace,rules,forced,inputs,namespaced){
 const declared=nodes(rule.expression,'quantity_phase'),positions=new Set();
 if(!declared.length)return positions;
 need(forced.enabled,'La fase de cantidad necesita la declaración original del programa.');
 for(const n of declared)need(rules.some(r=>r.agreementCode===rule.agreementCode&&r.code===n.code&&r.nature!=='auxiliary')&&!forced.ledger.some(o=>rules.some(r=>r.code===n.code&&ownFixedForcedRuleKey(r)===o.ruleKey)),'La fase de cantidad no identifica un concepto original sin sustitución monetaria.');
 let index=0;
 const read=n=>{
  let value;
  if(n.op==='choose'){const condition=read(n.condition);need(typeof condition==='boolean','La rama original no conserva su condición.');value=read(condition?n.then:n.else);}
  else for(const key of ['left','right','value'])if(n[key]&&typeof n[key]==='object'){const child=read(n[key]);if(key==='value')value=child;}
  const at=index++,t=trace[at];need(t&&t.operation===n.op,'La traza de cantidad no coincide con la estructura original de la regla.');
  // Equal values do not make two captured sources interchangeable.
  if(n.op==='input')need(t.reference===n.key&&inputs.get(n.key)?.unit===n.unit,'La variable de la fase no corresponde al nodo original ejecutado.');
  else if(n.op==='concept'||n.op==='auxiliary')need(t.reference===(namespaced?n.op+':':'')+n.code&&t.stage===n.stage,'La referencia de la fase no corresponde al concepto y etapa originales.');
  else if(n.op==='match'){const input=inputs.get(n.key);need(input&&t.reference===n.key&&input.unit===n.type&&t.result===(n.operator==='eq'?input.value===n.value:input.value!==n.value),'El predicado de la fase no corresponde a la condición original.');}
  else if(n.op==='literal')need(same(t.result,exactEvidence(decimal(n.value))),'El literal de la fase no corresponde a su valor original.');
  else if(n.op==='choose')need(same(t.result,value),'La rama de la fase no conserva el resultado original elegido.');
  if(n.op==='quantity_phase'){
   const original=traceValue(value),expected=n.stage==='rounded'?quantize(original,n.rounding).value:original;
   need(t.reference==='quantity:'+n.code&&t.stage===n.stage&&same(t.result,exactEvidence(expected)),'La referencia, etapa o valor de la fase de cantidad cambió.');positions.add(at);
  }
  return t.result;
 };
 read(rule.expression);need(index===trace.length,'La traza de cantidad contiene operaciones ajenas a la regla original.');return positions;
}

// Executed references include only the branch actually evaluated. A static
// dependency or a supplied input is not proof that a concept used the input.
function usage(rows,inputs,namespaced,typedConditions,rules,forced){
 const rowKey=r=>(namespaced?(r.nature==='auxiliary'?'auxiliary:':'concept:'):'')+r.conceptCode;
 const concepts=new Map(rows.map(r=>[rowKey(r),r])),direct=new Map(),links=new Map(),memo=new Map(),visiting=new Set();
 need(concepts.size===rows.length,'Hay conceptos o auxiliares repetidos en la captura original.');
 for(const row of rows){
  need(Array.isArray(row.trace)&&row.trace.length>0&&row.trace.length<=256,'Falta la traza original completa de un concepto.');
  const rule=rules.find(r=>r.code===row.conceptCode&&r.agreementCode===row.agreementCode&&(!namespaced||(r.nature==='auxiliary')===(row.nature==='auxiliary')));
  need(rule,'Falta la regla original de una traza.');
  const override=forced.ledger.find(o=>o.ruleKey===ownFixedForcedRuleKey(rule)),phases=quantityTrace(rule,row.trace,rules,forced,inputs,namespaced);
  if(override){
   const exact=rational(BigInt(override.amountCents),100n),rounded=quantize(exact,rule.rounding),evidence=exactEvidence(exact),reference=[override.recordId,override.recordVersion,override.proposalId,override.policySha256,override.sourceRowSha256].join(':');
   need(forced.enabled&&same(exactEvidence(rounded.value),evidence)&&row.amount===rounded.amount&&same(row.exactValue,evidence)&&same(row.dependencies,[])&&same(row.trace,[{operation:'fixed_forced_amount',reference,stage:'exact',result:evidence}]),'La traza forzada no conserva el importe y la procedencia del mismo contrato y regla.');
  }
  const keys=new Set(),references=new Set();
  for(const [index,t]of row.trace.entries()){
   need(salaryExact(t,['operation','reference','stage','result'])&&(operations.has(t.operation)||typedConditions&&t.operation==='match'||forced.enabled&&['fixed_forced_amount','quantity_phase'].includes(t.operation)),'La traza original contiene una operación sin verificar.');
   if(t.operation==='input'){
    const input=inputs.get(t.reference);
    need(input&&input.value!==null&&t.stage===null&&same(t.result,exactEvidence(decimal(input.value))),'Una variable usada no coincide con su valor original.');keys.add(t.reference);
   }else if(t.operation==='match'){
    const input=inputs.get(t.reference),r=rules.find(r=>r.code===row.conceptCode&&r.agreementCode===row.agreementCode&&(!namespaced||(r.nature==='auxiliary')===(row.nature==='auxiliary')));
    const predicates=n=>n.op==='match'?[n]:['left','right','value','condition','then','else'].flatMap(k=>n[k]&&typeof n[k]==='object'?predicates(n[k]):[]);
    need(input&&input.value!==null&&conditionUnit(input.unit)&&conditionValue(input.unit,input.value)&&t.stage===null&&typeof t.result==='boolean'&&r&&predicates(r.expression).some(n=>n.key===t.reference&&n.type===input.unit&&t.result===(n.operator==='eq'?input.value===n.value:input.value!==n.value)),'La condición usada no coincide con su tipo, valor y predicado originales.');keys.add(t.reference);
   }else if(t.operation==='fixed_forced_amount'){
    need(override&&row.trace.length===1,'La traza forzada no tiene una fuente del mismo contrato y regla.');
   }else if(t.operation==='quantity_phase'){
    need(phases.has(index),'La fase de cantidad no corresponde a un nodo de la regla original.');
   }else if(t.operation==='concept'||namespaced&&t.operation==='auxiliary'){
    need(!namespaced||typeof t.reference==='string'&&t.reference.startsWith(t.operation+':'),'La traza mezcla referencias de concepto y auxiliar.');
    const referenced=concepts.get(t.reference);
    need(referenced&&['exact','rounded'].includes(t.stage)&&same(t.result,t.stage==='exact'?referenced.exactValue:exactEvidence(decimal(referenced.amount))),'Falta un concepto original referenciado por la traza.');references.add(t.reference);
   }else need(t.reference===null&&t.stage===null,'La traza contiene una referencia ambigua.');
  }
  need(same(row.trace.at(-1).result,row.exactValue),'La traza no corresponde al resultado original del concepto.');direct.set(rowKey(row),keys);links.set(rowKey(row),references);
 }
 const used=code=>{
  if(memo.has(code))return memo.get(code);
  need(!visiting.has(code),'La traza original contiene un ciclo de conceptos.');visiting.add(code);
  const keys=new Set(direct.get(code));for(const reference of links.get(code))for(const key of used(reference))keys.add(key);
  visiting.delete(code);memo.set(code,keys);return keys;
 };
 for(const code of concepts.keys())used(code);
 return {direct,all:memo,rowKey};
}

export function ownReportVariableSources(bundle,captures,maximum=250000){
 const expected=new Set(bundle.employees.map(r=>r.employee.runId));
 need(Array.isArray(captures)&&captures.length===expected.size,'Faltan capturas originales para las variables. No se exportará un subconjunto.');
 const runs=new Map(),participations=new Map();let rowCount=0,variableCount=0;
 for(const capture of captures){
  need(expected.has(capture.id)&&!runs.has(capture.id),'Una captura de variables está repetida o es ajena al histórico.');
  const verified=ownRunWorkspaceResult(capture);need(verified,'Falta el resultado guardado de una captura original.');
  ownProgramBootstrap(capture.payload.programState);
  const definition=capture.payload.programState.program.definition,forced=ownFixedForcedAmounts(verified.input);
  need(forced===ownFixedForcedAmounts(definition)&&(!forced||['fixedForcedAmountsVersion','fixedForcedAmountsPolicy'].every(k=>same(verified.input[k],definition[k]))),'La política forzada no coincide con el programa original capturado.');
  const people=new Map(verified.input.employees.map(e=>[e.contractId,e])),totals=new Map(verified.result.employeeTotals.map(e=>[e.contractId,e])),rows=new Map();
  for(const row of verified.result.rows){const group=rows.get(row.contractId)??[];group.push(row);rows.set(row.contractId,group);}
  runs.set(capture.id,{capture,people,totals,rows,forced});
 }
 for(const item of bundle.employees){
  const e=item.employee,run=runs.get(e.runId),{capture}=run,saved=capture.saved,person=run.people.get(e.contractId),concepts=run.rows.get(e.contractId);
  need(saved.input.period===item.period&&saved.input.liquidationType===item.type&&capture.body.period===item.period&&capture.body.liquidationType===item.type&&saved.inputSha256===e.inputSha256&&saved.resultSha256===e.resultSha256&&person&&['employeeNumber','agreementCode','departmentCode'].every(k=>person[k]===e[k])&&saved.input.totalsPrecision===e.precision&&same(run.totals.get(e.contractId),e.totals),'Las variables no corresponden a la liquidación cerrada original.');
  const closed=item.source.snapshot.concepts.filter(r=>r.contractId===e.contractId);
  need(concepts&&same(concepts,closed),'Los conceptos de la captura no coinciden con su cierre original.');
  const inputs=new Map(person.inputs.map(i=>[i.key,i])),namespaced=saved.input.version==='own-payroll-input.v2',uses=usage(concepts,inputs,namespaced,ownPayrollConditions(saved.input),saved.input.rules.filter(r=>r.validFrom<=item.period&&(r.validUntil===null||r.validUntil>=item.period)&&r.liquidationTypes.includes(item.type)),{enabled:run.forced,ledger:person.fixedForcedAmounts??[]}),variables=[];
  for(const input of person.inputs){
   const bindings=capture.payload.programState.program.definition.bindings.filter(b=>b.agreementCode===person.agreementCode&&b.key===input.key);
   need(bindings.length===1&&bindings[0].unit===input.unit,'Falta la definición original de una variable capturada.');const binding=bindings[0];
   const category=capture.payload.population.employees.find(p=>p.contractId===e.contractId)?.categoryCode;
   const descriptions=capture.payload.programState.salaryCatalog.items.filter(d=>d.active&&d.code===binding.sourceCode&&d.agreementCode===(binding.sourceAgreementCode??person.agreementCode)&&d.kind===(['scale','scale_reference'].includes(binding.sourceKind)?'scale':binding.sourceKind==='auxiliary_parameter'?'auxiliary':'concept')&&(!namespaced||d.kind!=='concept'||d.nature!=='auxiliary')&&d.validFrom<=item.period&&(d.validUntil===null||d.validUntil>=item.period)&&(!['scale','scale_reference'].includes(binding.sourceKind)||d.categoryCode===(binding.sourceCategoryCode??category)));
   const factLabel=factDescriptions[binding.sourceKind]?.[binding.sourceField];
   need(factLabel||descriptions.length===1,'Falta una descripción única de la fuente original de la variable.');
   const occurrences=concepts.filter(r=>uses.all.get(uses.rowKey(r)).has(input.key)).map(r=>({concept:namespaced?(r.nature==='auxiliary'?'Auxiliar ':'Concepto ')+r.conceptCode:r.conceptCode,kind:uses.direct.get(uses.rowKey(r)).has(input.key)?'Uso directo':'Uso por concepto referenciado'}));
   variables.push({input,label:factLabel??descriptions[0].label,origin:factLabel?(binding.sourceKind==='period_context_fact'?'Mes del período (1 a 12)':factOrigins[binding.sourceKind]+' / '+binding.sourceField):origins[binding.sourceKind]+' '+binding.sourceCode,occurrences});
   variableCount++;rowCount+=Math.max(1,occurrences.length);
  }
  if(!variables.length)rowCount++;
  need(rowCount<=maximum,'El informe completo de variables supera 250.000 filas. No se omitieron ni dividieron variables.');
  participations.set(item.identity,{capture,variables});
 }
 return {participations,runs,variableCount,rowCount,proof:salarySerialized([...runs.values()].map(({capture:c})=>[c.id,c.bodySha256,c.payloadSha256,c.saved.inputSha256,c.saved.resultSha256]).sort((a,b)=>a[0].localeCompare(b[0])))};
}
