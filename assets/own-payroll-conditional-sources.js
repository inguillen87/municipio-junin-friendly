// Explicit own policy for a source consumed only inside a reviewed branch.
// A deferred input remains null. It never becomes a zero or a claimed approval.
import {payrollRequire as require,decimal,exactCompare,quantize} from './own-payroll-exact.js';
import {salaryExact,salaryHash,salaryUuid,salaryItems,salaryRowKey,salarySerialized} from './native-salary-catalog-model.js';
import {policySha256,policyMonth,policyCode,policyCanonicalText,requirePolicyScope,requirePolicyDeclaration,resolvePolicySuccession,resolvedPolicyAppliesTo,policyBoundaryMonths} from './own-payroll-policy-validity.js';
import {participationRules} from './own-period-participation-program.js';
import {salaryNativeCapture,salaryNativeCaptureMaterial,SALARY_NATIVE_VERSION} from './own-contract-salary-conditions-native-model.js';
import {NATIVE_CONDITION_FIELD_UNITS} from './own-payroll-conditions.js';
import {workingTimeCapture,WORKING_TIME_VERSION} from './own-contract-working-time-model.js';

export const OWN_CONDITIONAL_SOURCES_VERSION='own-payroll-conditional-sources.v1';
export const OWN_CONDITIONAL_SOURCE_CATALOGUE_VERSION='own-payroll-conditional-source-catalogue.v1';
const programFields=['conditionalSourcesVersion','conditionalSourcePolicies'];
const present=p=>programFields.some(k=>Object.hasOwn(p??{},k));
export const ownProgramConditionalSources=p=>Object.getOwnPropertyDescriptor(p??{},'conditionalSourcesVersion')?.value===OWN_CONDITIONAL_SOURCES_VERSION;
export const conditionalSourceProgramFields=p=>present(p)?[...programFields]:[];
export const conditionalSourceKind=kind=>['conditional_scale','conditional_working_time_fact'].includes(kind);
const fields=['policyId','supersedes','agreementCode','validFrom','validUntil','liquidationType','consumerCode','inputKey','activationInputKey','selectorInputKey','selectorOperator','selectorValue','inactivePolicy','sourceSha256','ruleReference'];
const key=v=>typeof v==='string'&&/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(v);
const money=v=>typeof v==='string'&&/^-?(0|[1-9][0-9]{0,17})(\.[0-9]{1,8})?$/.test(v)&&! /^-0(?:\.0+)?$/.test(v);
const same=(a,b)=>salarySerialized(a)===salarySerialized(b);
const scope=p=>[p.agreementCode,p.liquidationType,p.inputKey].join(':');
const active=(r,period,type,agreement)=>r.agreementCode===agreement&&r.validFrom<=period&&(r.validUntil===null||period<=r.validUntil)&&r.liquidationTypes.includes(type);
const text=v=>typeof v==='string'&&v===v.trim()&&v===v.normalize('NFC')&&v.length>=3&&v.length<=180&&!/[<>\u0000-\u001f\u007f]/.test(v);
const inputKeys=n=>!n||typeof n!=='object'?[]:['input','match'].includes(n.op)?[n.key]:['left','right','value','condition','then','else'].flatMap(k=>inputKeys(n[k]));

export function normalizeConditionalSourcePolicies(raw){
 policyCanonicalText(raw);
 require(salaryExact(raw,['version','policies'])&&raw.version===OWN_CONDITIONAL_SOURCES_VERSION&&Array.isArray(raw.policies)&&raw.policies.length>0&&raw.policies.length<=128,'CONDITIONAL_SOURCE_POLICY_INVALID','La fuente condicional necesita su versión y políticas completas.');
 const policies=raw.policies.map(p=>{
  require(salaryExact(p,fields),'CONDITIONAL_SOURCE_POLICY_INVALID','La política contiene campos ausentes o inesperados.');requirePolicyScope(p);requirePolicyDeclaration(p);
  require(policyCode(p.consumerCode)&&[p.inputKey,p.activationInputKey,p.selectorInputKey].every(key)&&new Set([p.inputKey,p.activationInputKey,p.selectorInputKey]).size===3&&['eq','ne'].includes(p.selectorOperator)&&money(p.selectorValue)&&p.inactivePolicy==='null_with_reason'&&salaryHash(p.sourceSha256)&&text(p.ruleReference),'CONDITIONAL_SOURCE_POLICY_INVALID','Revisá consumidor, entradas, selector exacto y respaldo de la política.');
  return structuredClone(p);
 });
 resolvePolicySuccession(policies,{identity:p=>p.policyId,scope});return{version:OWN_CONDITIONAL_SOURCES_VERSION,policies};
}
function protectedExpression(node,p){
 let found=0,visits=0;
 const selector=n=>n?.op==='compare'&&['eq','ne'].includes(n.operator)&&n.left?.op==='input'&&n.left.key===p.selectorInputKey&&n.left.unit==='money'&&n.right?.op==='literal'&&n.right.unit==='money'&&money(n.right.value)&&exactCompare(decimal(n.right.value),decimal(p.selectorValue))===0;
 const gate=n=>n?.op==='match'&&n.key===p.activationInputKey&&n.type==='boolean'&&n.operator==='eq'&&n.value===true;
 function walk(n,enabled=false,selected=false){
  if(!n||typeof n!=='object')return;require(++visits<=100000,'CONDITIONAL_SOURCE_LIMIT','La validación condicional supera su capacidad.');
  if(['input','match'].includes(n.op)&&n.key===p.inputKey){found++;require(enabled&&selected,'CONDITIONAL_SOURCE_GUARD_REQUIRED','La entrada condicional sólo puede consumirse dentro de sus dos condiciones declaradas.');}
  if(n.op==='choose'){
   walk(n.condition,enabled,selected);const isSelector=selector(n.condition),thenSelected=isSelector&&n.condition.operator===p.selectorOperator;
   walk(n.then,enabled||gate(n.condition),selected||thenSelected);walk(n.else,enabled,selected||isSelector&&!thenSelected);
  }else for(const k of ['left','right','value','condition','then','else'])walk(n[k],enabled,selected);
 }
 walk(node);require(found>0,'CONDITIONAL_SOURCE_CONSUMER_INVALID','La política no tiene un consumo monetario protegido.');
}
export function normalizeConditionalSourceProgram(p){
 const bindings=(p.bindings??[]).filter(b=>conditionalSourceKind(b.sourceKind));
 if(!present(p)){require(!bindings.length,'CONDITIONAL_SOURCE_POLICY_INVALID','La fuente condicional requiere opt-in explícito.');return{};}
 require(p.namespaceVersion==='own-payroll-namespaces.v2'&&p.salaryConditionsVersion===SALARY_NATIVE_VERSION,'CONDITIONAL_SOURCE_POLICY_INVALID','La fuente condicional requiere referencias separadas y hechos nativosV2.');
 const declared=normalizeConditionalSourcePolicies({version:p.conditionalSourcesVersion,policies:p.conditionalSourcePolicies}),resolved=resolvePolicySuccession(declared.policies,{identity:p=>p.policyId,scope}),rules=participationRules(p),phases=p.quantityPhases??[];
 require(!phases.some(q=>bindings.some(b=>b.agreementCode===q.agreementCode&&inputKeys(q.expression).includes(b.key))),'CONDITIONAL_SOURCE_CONSUMER_INVALID','Las cantidades no pueden consumir una fuente condicional monetaria o de jornada.');
 let inspected=0;const consume=n=>{inspected+=n;require(inspected<=50000,'CONDITIONAL_SOURCE_LIMIT','La validación por vigencias supera su capacidad; no se omitieron fronteras.');};
 for(const entry of resolved){
  const policy=entry.policy,b=p.bindings.find(b=>b.agreementCode===policy.agreementCode&&b.key===policy.inputKey),a=p.bindings.find(b=>b.agreementCode===policy.agreementCode&&b.key===policy.activationInputKey),s=p.bindings.find(b=>b.agreementCode===policy.agreementCode&&b.key===policy.selectorInputKey);
  require(b&&conditionalSourceKind(b.sourceKind)&&b.combine==='single'&&b.onMissing==='error'&&(b.sourceKind==='conditional_scale'?b.unit==='money'&&b.sourceCode===policy.consumerCode:b.unit==='hours'&&['dailyHours','monthlyHours'].includes(b.sourceField)&&p.workingTimeVersion===WORKING_TIME_VERSION),'CONDITIONAL_SOURCE_BINDING_INVALID','La política necesita escala propia o jornada declarada, sin relleno de ausencia.');
  require(a&&s&&[a,s].every(x=>x.sourceKind==='salary_condition_fact'&&x.combine==='single'&&x.onMissing==='error')&&a.unit==='boolean'&&NATIVE_CONDITION_FIELD_UNITS[a.sourceField]==='boolean'&&s.unit==='money'&&NATIVE_CONDITION_FIELD_UNITS[s.sourceField]==='money','CONDITIONAL_SOURCE_BINDING_INVALID','Habilitación y selector deben venir de la declaración nativa aprobada.');
  for(const period of policyBoundaryMonths(entry,[...rules,...phases])){
   consume(rules.length+p.bindings.length+phases.length);
   const uses=rules.filter(r=>active(r,period,policy.liquidationType,policy.agreementCode)&&inputKeys(r.expression).includes(policy.inputKey));
   require(uses.length===1&&uses[0].nature!=='auxiliary'&&uses[0].unit==='money'&&uses[0].code===policy.consumerCode,'CONDITIONAL_SOURCE_CONSUMER_INVALID','La fuente condicional tiene exactamente un consumidor monetario vigente.');
   require(!phases.some(q=>active(q,period,policy.liquidationType,policy.agreementCode)&&inputKeys(q.expression).includes(policy.inputKey)),'CONDITIONAL_SOURCE_CONSUMER_INVALID','La fuente condicional no declara cantidades.');protectedExpression(uses[0].expression,policy);
  }
 }
 // Every actual use must also have a policy, including portions outside any
 // policy's own range. A declared policy cannot hide a gap in the rule.
 for(const rule of rules){
  const needed=bindings.filter(b=>b.agreementCode===rule.agreementCode&&inputKeys(rule.expression).includes(b.key));if(!needed.length)continue;
  for(const period of policyBoundaryMonths(rule,resolved)){
   consume(1);
   for(const type of rule.liquidationTypes)for(const b of needed){const matches=resolved.filter(e=>e.policy.inputKey===b.key&&resolvedPolicyAppliesTo(e,{period,liquidationType:type,agreementCode:rule.agreementCode}));require(matches.length===1&&matches[0].policy.consumerCode===rule.code,'CONDITIONAL_SOURCE_POLICY_REQUIRED','Hay un consumidor sin política vigente para todo su intervalo.');}
  }
 }
 return{conditionalSourcesVersion:declared.version,conditionalSourcePolicies:declared.policies};
}
export function conditionalSourceProgramHistory(before,after){
 if(!present(before))return;require(present(after),'PROGRAM_HISTORY_REQUIRED','Conservá las políticas condicionales anteriores.');
 const a=normalizeConditionalSourcePolicies({version:before.conditionalSourcesVersion,policies:before.conditionalSourcePolicies}),b=normalizeConditionalSourcePolicies({version:after.conditionalSourcesVersion,policies:after.conditionalSourcePolicies});
 require(a.policies.every(p=>b.policies.some(q=>same(p,q))),'PROGRAM_HISTORY_REQUIRED','Cada política anterior conserva su contenido íntegro y su antecedente.');
}

export function conditionalSourceResolver(payload){
 const {programState,sourceInventory,period,liquidationType,population,salaryConditions,workingTime}=payload,program=programState?.program?.definition,proof=sourceInventory?.conditionalSources;
 if(!ownProgramConditionalSources(program)){require(proof===undefined,'CONDITIONAL_SOURCE_CAPTURE_INVALID','La captura agregó una fuente que el programa no declara.');return null;}
 normalizeConditionalSourceProgram(program);const catalog=programState.salaryCatalog;
 require(proof&&typeof proof==='object','CONDITIONAL_SOURCE_CAPTURE_INVALID','Falta la prueba del catálogo aprobado completo.');policyCanonicalText(proof);
 require(salaryExact(proof,['version','complete','tenantId','sourceBindingId','revision','approvalId','proposalId','catalogueVersion','itemsSha256','itemCount'])&&proof.version===OWN_CONDITIONAL_SOURCE_CATALOGUE_VERSION&&proof.complete===true&&[proof.tenantId,proof.sourceBindingId,proof.approvalId,proof.proposalId].every(salaryUuid)&&Number.isSafeInteger(proof.revision)&&proof.revision>0&&proof.revision===catalog?.revision&&[proof.catalogueVersion,proof.itemsSha256].every(salaryHash)&&proof.catalogueVersion===catalog.version&&programState.program.revision>0&&programState.program.salaryVersion===catalog.version&&Number.isSafeInteger(proof.itemCount)&&proof.itemCount>0&&proof.itemCount<=10000&&Array.isArray(catalog.items)&&proof.itemCount===catalog.items.length&&policyMonth(period),'CONDITIONAL_SOURCE_CAPTURE_INVALID','La prueba no conserva todos los items aprobados del catálogo.');
 require(policySha256(catalog.items)===proof.itemsSha256,'CONDITIONAL_SOURCE_CAPTURE_INVALID','El catálogo cambió o fue recortado.');
 require(salaryExact(population,['complete','version','employees'])&&population.complete===true&&salaryHash(population.version)&&Array.isArray(population.employees)&&population.employees.length>0&&population.employees.length<=10000,'CONDITIONAL_SOURCE_CAPTURE_INVALID','Falta la población completa y su identidad.');
 const employees=new Map();for(const e of population.employees){require(salaryExact(e,['contractId','employeeNumber','agreementCode','departmentCode','categoryCode','identityToken','origin'])&&salaryUuid(e.contractId)&&salaryHash(e.identityToken)&&[e.agreementCode,e.categoryCode,e.departmentCode].every(policyCode)&&e.origin==='MUNICONTROL'&&!employees.has(e.contractId),'CONDITIONAL_SOURCE_CAPTURE_INVALID','La captura contiene otra identidad o un encuadre incompleto.');employees.set(e.contractId,e);}
 salaryNativeCapture(salaryConditions,population.employees,period);
 require(salaryConditions.legacy.version===policySha256(['own-contract-salary-conditions.v1',period,salaryConditions.legacy.records])&&salaryConditions.version===policySha256(salaryNativeCaptureMaterial(salaryConditions,period)),'CONDITIONAL_SOURCE_CAPTURE_INVALID','La declaración nativa no conserva sus hashes originales.');
 const needsTime=program.bindings.some(b=>b.sourceKind==='conditional_working_time_fact');
 if(needsTime){workingTimeCapture(workingTime,population.employees,period);require(workingTime.version===policySha256([WORKING_TIME_VERSION,period,workingTime.records]),'CONDITIONAL_SOURCE_CAPTURE_INVALID','La jornada no conserva su fuente original.');}
 const populationSources={employees:population.employees};for(const key of ['periodContext','employmentFacts','periodParticipation','workingTime','agreementWorkingTime','salaryConditions','familyPayrollFacts'])if(payload[key]!==undefined)populationSources[key]=payload[key];
 require(population.version===policySha256(populationSources),'CONDITIONAL_SOURCE_CAPTURE_INVALID','La población no conserva sus fuentes completas.');
 const rows=salaryItems(catalog.items),scales=new Map();
 for(const row of rows)if(row.active&&row.kind==='scale'&&row.validFrom<=period&&(row.validUntil===null||period<=row.validUntil)){const k=[row.agreementCode,row.categoryCode,row.code].join(':');require(!scales.has(k),'CONDITIONAL_SOURCE_CAPTURE_INVALID','El catálogo contiene escalas ambiguas.');scales.set(k,row);}
 const native=new Map(salaryConditions.records.map(r=>[r.contractId,r])),times=new Map((workingTime?.records??[]).map(r=>[r.contractId,r.configuration])),bindings=new Map(program.bindings.map(b=>[b.agreementCode+':'+b.key,b])),policies=resolvePolicySuccession(program.conditionalSourcePolicies,{identity:p=>p.policyId,scope});
 return(employee,binding)=>{
  require(same(employees.get(employee.contractId),employee)&&same(bindings.get(employee.agreementCode+':'+binding.key),binding)&&conditionalSourceKind(binding.sourceKind),'CONDITIONAL_SOURCE_INPUT_INVALID','La entrada no coincide con el contrato y binding capturados.');
  const matches=policies.filter(e=>e.policy.inputKey===binding.key&&resolvedPolicyAppliesTo(e,{period,liquidationType,agreementCode:employee.agreementCode}));require(matches.length===1,'CONDITIONAL_SOURCE_POLICY_REQUIRED','Falta la política vigente de esa entrada.');const policy=matches[0].policy;
  const a=bindings.get(employee.agreementCode+':'+policy.activationInputKey),s=bindings.get(employee.agreementCode+':'+policy.selectorInputKey),r=native.get(employee.contractId);
  require(r?.revision>0&&r.definition!==null,'CONDITIONAL_SOURCE_APPROVAL_REQUIRED','Falta la declaración nativa aprobada del contrato.');
  const activation=r.definition[a.sourceField],selector=r.definition[s.sourceField];require(typeof activation==='boolean','CONDITIONAL_SOURCE_ACTIVATION_REQUIRED','Falta la habilitación explícita; sin informar no equivale a no.');
  let status='activation_false',value=null,row=null,time=null;
  if(activation){
   require(selector!==null&&money(selector),'CONDITIONAL_SOURCE_SELECTOR_REQUIRED','Falta el selector monetario exacto de la rama habilitada.');
   const equal=exactCompare(decimal(selector),decimal(policy.selectorValue))===0,selected=policy.selectorOperator==='eq'?equal:!equal;
   status=selected?'configured':'selector_not_equal';
   if(selected){
    if(binding.sourceKind==='conditional_scale'){
     row=scales.get([employee.agreementCode,employee.categoryCode,binding.sourceCode].join(':'));require(row&&row.value!==null&&row.unit==='money','CONDITIONAL_SOURCE_VALUE_REQUIRED','Falta la escala obligatoria de ese concepto, convenio, categoría y período.');value=quantize(decimal(row.value),{precision:8,mode:'exact'}).amount;
    }else{
     time=times.get(employee.contractId);require(time?.revision>0&&time.definition!==null&&time.definition[binding.sourceField]!==null,'CONDITIONAL_SOURCE_VALUE_REQUIRED','Falta el componente de jornada aprobado que esta rama necesita.');value=quantize(decimal(time.definition[binding.sourceField]),{precision:8,mode:'exact'}).amount;
    }
   }
  }
  const evidence={version:'own-payroll-conditional-source-resolution.v1',policyId:policy.policyId,policySha256:policySha256(policy),period,liquidationType,contractId:employee.contractId,identityToken:employee.identityToken,agreementCode:employee.agreementCode,categoryCode:employee.categoryCode,inputKey:binding.key,sourceKind:binding.sourceKind,sourceCode:binding.sourceCode??null,sourceField:binding.sourceField??null,catalogueVersion:proof.catalogueVersion,catalogueApprovalId:proof.approvalId,itemsSha256:proof.itemsSha256,itemCount:proof.itemCount,nativeVersion:salaryConditions.version,nativeApprovalId:r.approvalId,activationValue:activation,selectorValue:selector,status,rowKey:row?salaryRowKey(row):null,workingTimeVersion:time?workingTime.version:null,workingTimeApprovalId:time?time.approvalId:null,value};
  return{key:binding.key,unit:binding.unit,value,sourceReference:'Fuente condicional:'+status+':'+policySha256(evidence)};
 };
}
export function verifyConditionalSourceCapture(payload){
 const resolve=conditionalSourceResolver(payload);if(!resolve)return;const p=payload.programState.program.definition;
 const used=new Set(participationRules(p).filter(r=>active(r,payload.period,payload.liquidationType,r.agreementCode)).flatMap(r=>inputKeys(r.expression).map(key=>r.agreementCode+':'+key)));
 for(const employee of payload.population.employees)for(const binding of p.bindings.filter(b=>b.agreementCode===employee.agreementCode&&conditionalSourceKind(b.sourceKind)&&used.has(b.agreementCode+':'+b.key)))resolve(employee,binding);
}
export function verifyConditionalSourceInputs(payload,input){
 const resolve=conditionalSourceResolver(payload);if(!resolve)return;const p=payload.programState.program.definition;
 require(Array.isArray(input?.employees)&&input.employees.length===payload.population.employees.length&&new Set(input.employees.map(e=>e.contractId)).size===input.employees.length&&input.period===payload.period&&input.liquidationType===payload.liquidationType,'CONDITIONAL_SOURCE_INPUT_INVALID','El resultado no conserva la población original completa.');
 const actual=new Map(input.employees.map(e=>[e.contractId,e])),used=new Set(participationRules(p).filter(r=>active(r,payload.period,payload.liquidationType,r.agreementCode)).flatMap(r=>inputKeys(r.expression).map(key=>r.agreementCode+':'+key)));
 for(const employee of payload.population.employees){
  const value=actual.get(employee.contractId);require(value&&['employeeNumber','agreementCode','departmentCode'].every(k=>value[k]===employee[k])&&Array.isArray(value.inputs),'CONDITIONAL_SOURCE_INPUT_INVALID','La entrada cambió el contrato o su encuadre.');
  for(const binding of p.bindings.filter(b=>b.agreementCode===employee.agreementCode&&conditionalSourceKind(b.sourceKind))){const expected=used.has(binding.agreementCode+':'+binding.key)?[resolve(employee,binding)]:[],observed=value.inputs.filter(i=>i.key===binding.key);require(same(expected,observed),'CONDITIONAL_SOURCE_INPUT_INVALID','El valor, motivo o procedencia condicional no coincide con la fuente aprobada capturada.');}
 }
}
