import {verifyCappedSources} from './own-payroll-capped-sources.js';
export function cappedContractResult(result,contractId){
 if(!cappedResultFields(result).length)return{};
 const effects=result.cappedDeductionEffects.filter(e=>e.contractId===contractId);
 return{cappedDeductionsVersion:result.cappedDeductionsVersion,cappedDeductionEffectCount:effects.length,cappedDeductionEffects:structuredClone(effects)};
}
export function verifyCappedEconomicSource(source,value){
 const material=normalizeCappedCapture(source,undefined,source.officialTotalsPolicy);
 const input={...material,officialTotalsPolicy:source.officialTotalsPolicy,rules:material.cappedDeductionCapture?.ruleClosure};
 const expected=calculateCappedEffects(input,value.rows,[value.contractId]);
 require(same(expected,Object.fromEntries(cappedResultFields(value).map(k=>[k,value[k]]))),'CAPPED_EFFECT_MISMATCH','El cierre conserva exactamente los efectos por contrato de su fuente original.');
 return value;
}
// Opt-in deduction effects. These records explain a calculation; they do not
// create debt, alter salary facts, approve a programme or execute a payment.
import {salaryExact,salaryHash,salarySerialized} from './native-salary-catalog-model.js';
import {decimal,rational,exactAdd,exactSubtract,exactCompare,exactEvidence,quantize,payrollRequire as require} from './own-payroll-exact.js';
import {normalizeOwnPayrollRules} from './own-payroll-engine.js';
import {payrollExpressionReference} from './own-payroll-expression.js';
import {applyCappedDeduction,methodExact} from './own-payroll-special-methods.js';
import {participationRules} from './own-period-participation-program.js';
import {policyCode,policyMonth,requirePolicyScope,requirePolicyDeclaration,resolvePolicySuccession,resolvedPolicyAppliesTo,policyBoundaryMonths,policySha256} from './own-payroll-policy-validity.js';

export const OWN_CAPPED_DEDUCTIONS_VERSION='own-capped-deductions.v1';
export const OWN_CAPPED_CAPTURE_VERSION='own-capped-deductions-capture.v1';
const programFields=['cappedDeductionsVersion','cappedDeductionPolicies'];
const inputFields=['cappedDeductionsVersion','cappedDeductionCapture'];
const resultFields=['cappedDeductionsVersion','cappedDeductionEffectCount','cappedDeductionEffects'];
const policyFields=['policyId','supersedes','agreementCode','validFrom','validUntil','liquidationType','cashBaseReference','officialBaseReference','consumptionStage','officialConsumptionStage','reserveStage','limitPrecision','lineRounding','officialDestination','incompatibleSourceCodes','priorDeductionCodes','steps','orderReference','sourceSha256'];
const stepFields=['kind','conceptCode','availableCode','officialAvailableCode','reserveCode','requestedCode','limitCode','method','effectStage','sourceRowSha256','ruleReference'];
const same=(a,b)=>salarySerialized(a)===salarySerialized(b);
const present=(p,fields)=>fields.some(k=>Object.hasOwn(p??{},k));
const scope=p=>[p.agreementCode,p.liquidationType].join(':');
const order=(a,b)=>a<b?-1:a>b?1:0;
const active=(r,p,period)=>r.agreementCode===p.agreementCode&&r.validFrom<=period&&(r.validUntil===null||period<=r.validUntil)&&r.liquidationTypes.includes(p.liquidationType);
const ref=(space,code,stage='exact')=>({op:space,code,stage});
const lit=value=>({op:'literal',value,unit:'money'});
const binary=(op,left,right)=>({op,left,right});
const lineRound=value=>({op:'round',value,rounding:{precision:2,mode:'half_up'}});
const zero=decimal('0');
const money=n=>quantize(n,{precision:2,mode:'half_up'}).amount;
const sign=n=>exactCompare(n,zero);
const minimum=(a,b)=>exactCompare(a,b)<=0?a:b;
const maximum=(a,b)=>exactCompare(a,b)>=0?a:b;
const ev=exactEvidence;
function list(v,min,max){require(Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length>=min&&v.length<=max&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,String(i))).every(d=>d&&Object.hasOwn(d,'value')&&d.enumerable),'CAPPED_CONTRACT_INVALID','La política y sus efectos deben estar completos, sin huecos.');}
function reference(v){require(salaryExact(v,['op','code','stage'])&&['concept','auxiliary'].includes(v.op)&&policyCode(v.code)&&['exact','rounded'].includes(v.stage),'CAPPED_REFERENCE_INVALID','Declarar fuente monetaria y etapa explícitas.');return {...v};}
function refs(n){return !n||typeof n!=='object'?[]:[...(['concept','auxiliary'].includes(n.op)?[n]:[]),...['left','right','value','condition','then','else'].flatMap(k=>refs(n[k]))];}
const rowId=r=>(r.nature==='auxiliary'?'auxiliary:':'concept:')+(r.code??r.conceptCode);
const referenceId=r=>r.op+':'+r.code;
export const cappedProgramFields=p=>present(p,programFields)?[...programFields]:[];
export const cappedInputFields=p=>present(p,inputFields)?[...inputFields]:[];
export const cappedResultFields=p=>present(p,resultFields)?[...resultFields]:[];
export const ownProgramCappedDeductions=p=>p?.cappedDeductionsVersion===OWN_CAPPED_DEDUCTIONS_VERSION;

// floor(allowance, 2), using only already admitted expression operations. The
// comparison protects a sub-cent reserve from a later half-up line rounding.
export function cappedLimitExpression(step){
 const allowance=binary('max',binary('subtract',binary('min',ref('auxiliary',step.availableCode),ref('auxiliary',step.officialAvailableCode)),ref('auxiliary',step.reserveCode)),lit('0'));
 const rounded=lineRound(allowance);
 return {op:'choose',condition:{op:'compare',operator:'gt',left:rounded,right:allowance},then:binary('subtract',rounded,lit('0.01')),else:rounded};
}
export function cappedStepExpressions(policy,index){
 const s=policy.steps[index],prev=policy.steps[index-1];
 return {
  available:index===0?policy.cashBaseReference:binary('subtract',ref('auxiliary',prev.availableCode),ref('concept',prev.conceptCode,'rounded')),
  officialAvailable:index===0?policy.officialBaseReference:binary('subtract',ref('auxiliary',prev.officialAvailableCode),ref('concept',prev.conceptCode,'exact')),
  ...(s.kind==='capped'?{limit:cappedLimitExpression(s),amount:binary('min',ref('auxiliary',s.requestedCode),ref('auxiliary',s.limitCode))}:{})
 };
}

export function normalizeCappedPolicies(version,raw){
 require(version===OWN_CAPPED_DEDUCTIONS_VERSION,'CAPPED_VERSION_INVALID','La política requiere su versión explícita.');list(raw,1,128);
 const policies=raw.map(p=>{
  require(salaryExact(p,policyFields),'CAPPED_CONTRACT_INVALID','Faltan campos o hay decisiones no admitidas.');requirePolicyScope(p);requirePolicyDeclaration(p);
  require(p.liquidationType==='monthly'&&p.consumptionStage==='rounded'&&p.officialConsumptionStage==='exact'&&p.reserveStage==='exact'&&p.limitPrecision===2&&same(p.lineRounding,{precision:2,mode:'half_up'})&&p.officialDestination==='996'&&payrollExpressionReference(p.orderReference)&&salaryHash(p.sourceSha256),'CAPPED_CONTRACT_INVALID','Declarar etapas, reserva, precisión, destino y respaldo de orden.');
  reference(p.cashBaseReference);reference(p.officialBaseReference);list(p.incompatibleSourceCodes,0,1000);require(p.incompatibleSourceCodes.every(policyCode)&&new Set(p.incompatibleSourceCodes).size===p.incompatibleSourceCodes.length,'CAPPED_SOURCE_POLICY_INVALID','Declarar las fuentes incompatibles completas, sin códigos implícitos ni repetidos.');list(p.priorDeductionCodes,0,1000);require(p.priorDeductionCodes.every(policyCode)&&new Set(p.priorDeductionCodes).size===p.priorDeductionCodes.length,'CAPPED_ORDER_INVALID','Los descuentos anteriores deben declararse completos y sin repetirse.');list(p.steps,1,128);
  const concepts=new Set(),owned=new Set();let capped=0;
  for(const s of p.steps){
   require(salaryExact(s,stepFields)&&['capped','existing_deduction'].includes(s.kind)&&[s.conceptCode,s.availableCode,s.officialAvailableCode,s.reserveCode].every(policyCode)&&salaryHash(s.sourceRowSha256)&&payrollExpressionReference(s.ruleReference),'CAPPED_STEP_INVALID','Cada posición requiere concepto, saldos, reserva y evidencia propios.');
   require(!concepts.has(s.conceptCode),'CAPPED_ORDER_INVALID','Un concepto no puede repetirse en el orden explícito.');concepts.add(s.conceptCode);
   const codes=[s.availableCode,s.officialAvailableCode,...(s.kind==='capped'?[s.limitCode]:[])];
   require(codes.every(policyCode)&&codes.every(c=>!owned.has(c))&&new Set(codes).size===codes.length,'CAPPED_ORDER_INVALID','Los saldos y límites requieren auxiliares distintos por posición.');codes.forEach(c=>owned.add(c));
   if(s.kind==='capped'){capped++;require(policyCode(s.requestedCode)&&['27','29'].includes(s.method)&&['exact','rounded'].includes(s.effectStage),'CAPPED_STEP_INVALID','El descuento limitado requiere pedido, método y etapa del efecto explícitos.');}
   else require([s.requestedCode,s.limitCode,s.method,s.effectStage].every(v=>v===null),'CAPPED_STEP_INVALID','Un descuento existente conserva su fórmula y no recibe efectos implícitos.');
  }
  require(!p.priorDeductionCodes.some(c=>concepts.has(c)),'CAPPED_ORDER_INVALID','Una deducción no puede ser anterior y parte del tramo a la vez.');
  require(capped>0&&p.steps.every(s=>!owned.has(s.reserveCode)&&(s.requestedCode===null||!owned.has(s.requestedCode))),'CAPPED_STEP_INVALID','Pedidos y reservas no pueden reemplazarse por saldos o límites de la misma cadena.');
  return structuredClone(p);
 });
 resolvePolicySuccession(policies,{identity:p=>p.policyId,scope});return policies;
}

function activeRules(rules,p,month){const rows=rules.filter(r=>active(r,p,month)),map=new Map(rows.map(r=>[rowId(r),r]));require(map.size===rows.length,'CAPPED_RULE_AMBIGUOUS','Una referencia tiene varias reglas vigentes.');return map;}
function checkRule(map,space,code){const r=map.get(space+':'+code);require(r&&r.unit==='money'&&(space==='auxiliary'?r.nature==='auxiliary':r.nature==='deduction'),'CAPPED_RULE_REQUIRED','Falta una regla monetaria con la naturaleza declarada.');return r;}
function closureFrom(map,roots){const found=new Set(),visiting=new Set();const visit=id=>{require(!visiting.has(id),'CAPPED_DEPENDENCY_CYCLE','El saldo no puede depender de su propio descuento ni de una etapa futura.');if(found.has(id))return;const r=map.get(id);require(r,'CAPPED_RULE_REQUIRED','Falta una dependencia de la política.');visiting.add(id);for(const n of refs(r.expression))visit(referenceId(n));visiting.delete(id);found.add(id);};roots.forEach(visit);return found.size?normalizeOwnPayrollRules([...found].map(id=>map.get(id)),{namespaced:true,typedConditions:true}):[];}
function policyRoots(p){return [referenceId(p.cashBaseReference),referenceId(p.officialBaseReference),...p.steps.flatMap(s=>['concept:'+s.conceptCode,'auxiliary:'+s.availableCode,'auxiliary:'+s.officialAvailableCode,'auxiliary:'+s.reserveCode,...(s.kind==='capped'?['auxiliary:'+s.requestedCode,'auxiliary:'+s.limitCode]:[])])];}
function dependencies(map,node){const direct=refs(node).map(referenceId);return new Set(closureFrom(map,direct).map(rowId));}

export function validateCappedContext(policy,rules,month,official){
 const map=activeRules(rules,policy,month),managed=new Map();
 policy.steps.forEach((s,i)=>{managed.set('concept:'+s.conceptCode,i);for(const c of [s.availableCode,s.officialAvailableCode,...(s.limitCode?[s.limitCode]:[])])managed.set('auxiliary:'+c,i);});
 const allDeductions=[...policy.priorDeductionCodes,...policy.steps.map(s=>s.conceptCode)];require(same([...allDeductions].sort(),[...(official?.contributions?.['996']??[])].sort()),'CAPPED_ORDER_INVALID','Cada deducción oficial debe figurar en el tramo o como anterior, incluido cualquier empate.');
 for(const base of [policy.cashBaseReference,policy.officialBaseReference]){
  const r=map.get(referenceId(base));require(r&&r.unit==='money','CAPPED_BASE_REQUIRED','Falta la base monetaria explícita.');
  const baseDependencies=dependencies(map,base);require(policy.priorDeductionCodes.every(code=>baseDependencies.has('concept:'+code)),'CAPPED_ORDER_INVALID','Las deducciones anteriores deben estar presentes en ambas bases declaradas.');
  require([...baseDependencies].every(id=>!managed.has(id)),'CAPPED_BASE_CYCLE','La base inicial no puede incluir un descuento o saldo del tramo que limita.');
 }
 for(let i=0;i<policy.steps.length;i++){
  const s=policy.steps[i],expressions=cappedStepExpressions(policy,i),amount=checkRule(map,'concept',s.conceptCode),available=checkRule(map,'auxiliary',s.availableCode),officialAvailable=checkRule(map,'auxiliary',s.officialAvailableCode),reserve=checkRule(map,'auxiliary',s.reserveCode);
  require(same(amount.rounding,policy.lineRounding)&&same(available.expression,expressions.available)&&same(officialAvailable.expression,expressions.officialAvailable),'CAPPED_ORDER_INVALID','El orden declarado debe coincidir con ambas cadenas efectivas de saldos.');
  require([...dependencies(map,reserve.expression)].every(id=>!managed.has(id)||managed.get(id)<i),'CAPPED_FUTURE_DEPENDENCY','Una reserva no puede leer el mismo descuento ni uno posterior.');
  if(s.kind==='capped'){
   const requested=checkRule(map,'auxiliary',s.requestedCode),limit=checkRule(map,'auxiliary',s.limitCode);
   require(same(amount.expression,expressions.amount)&&same(limit.expression,expressions.limit),'CAPPED_FORMULA_INVALID','Conservar pedido, límite exacto de centavos y fórmula limitada explícitos.');
   require([...dependencies(map,requested.expression)].every(id=>!managed.has(id)||managed.get(id)<i),'CAPPED_FUTURE_DEPENDENCY','El pedido no puede leer su descuento ni una posición posterior.');
  }else require([...dependencies(map,amount.expression)].every(id=>!managed.has(id)||managed.get(id)<i),'CAPPED_FUTURE_DEPENDENCY','El descuento existente no puede anticipar otra posición del tramo.');
  require(official?.agreementCode===policy.agreementCode&&official.liquidationType===policy.liquidationType&&official.contributions?.['996']?.includes(s.conceptCode),'CAPPED_DESTINATION_REQUIRED','Cada descuento del tramo necesita su destino oficial 996 explícito.');
 }
 return closureFrom(map,policyRoots(policy));
}

export function normalizeCappedProgram(programme){
 if(!present(programme,programFields))return{};
 require(programme.namespaceVersion==='own-payroll-namespaces.v2'&&programme.totalsPrecision===2&&programme.quantityPhasesVersion==='own-payroll-quantity-phases.v1'&&['own-payroll-official-totals.v1','own-payroll-official-totals.v2'].includes(programme.officialTotalsVersion),'CAPPED_OFFICIAL_PROGRAM_REQUIRED','Los efectos requieren cantidades y totales oficiales explícitos, con precisión monetaria de dos decimales.');
 const policies=normalizeCappedPolicies(programme.cappedDeductionsVersion,programme.cappedDeductionPolicies),rules=participationRules(programme),official=programme.officialTotalsPolicies??[];
 const officialEntries=resolvePolicySuccession(official,{identity:p=>p.version==='own-payroll-official-totals.v2'?p.policyId:'legacy:official-totals:'+p.agreementCode+':'+p.period+':'+p.liquidationType,scope,hash:p=>policySha256(p,{preserveLegacyUnicode:p.version==='own-payroll-official-totals.v1'})});
 for(const entry of resolvePolicySuccession(policies,{identity:p=>p.policyId,scope})){
  for(const month of policyBoundaryMonths(entry,[...rules,...officialEntries])){
   const selected=officialEntries.filter(e=>resolvedPolicyAppliesTo(e,{period:month,agreementCode:entry.policy.agreementCode,liquidationType:entry.policy.liquidationType}));
   require(selected.length===1,'CAPPED_DESTINATION_REQUIRED','La vigencia completa del tramo necesita un único destino oficial.');validateCappedContext(entry.policy,rules,month,selected[0].policy);
  }
 }
 return {cappedDeductionsVersion:OWN_CAPPED_DEDUCTIONS_VERSION,cappedDeductionPolicies:policies};
}
export function cappedProgramHistory(before,after){
 if(!present(before,programFields))return;require(present(after,programFields),'PROGRAM_HISTORY_REQUIRED','Conservar las decisiones anteriores de límites y efectos.');
 const old=normalizeCappedPolicies(before.cappedDeductionsVersion,before.cappedDeductionPolicies),next=normalizeCappedPolicies(after.cappedDeductionsVersion,after.cappedDeductionPolicies);
 require(old.every(p=>next.some(n=>same(p,n))),'PROGRAM_HISTORY_REQUIRED','Una decisión de límites anterior es inmutable; declarar su sucesión.');
}
export function captureCappedPolicies(programme,period,liquidationType,officialPolicy){
 if(!present(programme,programFields))return{};const options=normalizeCappedProgram(programme),agreementCode=officialPolicy.agreementCode;
 const policies=options.cappedDeductionPolicies.filter(p=>p.agreementCode===agreementCode&&p.liquidationType===liquidationType),selected=resolvePolicySuccession(policies,{identity:p=>p.policyId,scope}).filter(e=>resolvedPolicyAppliesTo(e,{period,liquidationType,agreementCode}));
 require(selected.length===1,'CAPPED_POLICY_REQUIRED','El período necesita una política efectiva completa; no se prolonga la anterior.');
 const ruleClosure=validateCappedContext(selected[0].policy,participationRules(programme),period,officialPolicy);
 return {cappedDeductionsVersion:OWN_CAPPED_DEDUCTIONS_VERSION,cappedDeductionCapture:{version:OWN_CAPPED_CAPTURE_VERSION,period,liquidationType,agreementCode,policies,policiesSha256:policySha256(policies),ruleClosure,ruleClosureSha256:policySha256(ruleClosure),officialPolicySha256:policySha256(officialPolicy)}};
}
export function normalizeCappedCapture(raw,rules,officialPolicy){
 if(!present(raw,inputFields))return{};
 require(raw.cappedDeductionsVersion===OWN_CAPPED_DEDUCTIONS_VERSION,'CAPPED_VERSION_INVALID','Conservar la versión del límite capturado.');const c=raw.cappedDeductionCapture;
 require(salaryExact(c,['version','period','liquidationType','agreementCode','policies','policiesSha256','ruleClosure','ruleClosureSha256','officialPolicySha256'])&&c.version===OWN_CAPPED_CAPTURE_VERSION&&policyMonth(c.period)&&c.liquidationType==='monthly'&&policyCode(c.agreementCode)&&[c.policiesSha256,c.ruleClosureSha256,c.officialPolicySha256].every(salaryHash),'CAPPED_CAPTURE_INVALID','La captura debe conservar políticas, reglas, alcance y huellas completos.');
 const policies=normalizeCappedPolicies(raw.cappedDeductionsVersion,c.policies);require(policies.every(p=>scope(p)===scope(c))&&policySha256(policies)===c.policiesSha256&&policySha256(c.ruleClosure)===c.ruleClosureSha256&&policySha256(officialPolicy)===c.officialPolicySha256,'CAPPED_CAPTURE_CHANGED','La captura no conserva sus políticas, reglas o destino originales.');
 const selected=resolvePolicySuccession(policies,{identity:p=>p.policyId,scope}).filter(e=>resolvedPolicyAppliesTo(e,c));require(selected.length===1,'CAPPED_POLICY_REQUIRED','La captura requiere una única política efectiva.');
 const normalizedRules=normalizeOwnPayrollRules(c.ruleClosure,{namespaced:true,typedConditions:true});
 require(same(normalizedRules,c.ruleClosure),'CAPPED_CAPTURE_CHANGED','La clausura de reglas debe conservar su forma canónica.');
 const expected=validateCappedContext(selected[0].policy,rules??normalizedRules,c.period,officialPolicy);
 require(same(expected,c.ruleClosure),'CAPPED_CAPTURE_CHANGED','La clausura debe corresponder exactamente a todas las reglas capturadas del tramo.');
 return {cappedDeductionsVersion:OWN_CAPPED_DEDUCTIONS_VERSION,cappedDeductionCapture:structuredClone(c)};
}

function evidenceNumber(v){const n=methodExact(v);require(same(ev(n),v),'CAPPED_EXACT_INVALID','La fracción del efecto debe conservar su forma canónica.');return n;}
export function calculateCappedEffects(input,rows,contracts){
 const normalized=normalizeCappedCapture(input,input.rules,input.officialTotalsPolicy);if(!present(normalized,inputFields))return{};
 const c=normalized.cappedDeductionCapture,[entry]=resolvePolicySuccession(c.policies,{identity:p=>p.policyId,scope}).filter(e=>resolvedPolicyAppliesTo(e,c)),p=entry.policy,effects=[];
 const ids=[...contracts].sort();require(new Set(ids).size===ids.length,'CAPPED_POPULATION_INVALID','La población del efecto no puede repetirse.');
 for(const contractId of ids){
  const relevant=rows.filter(r=>r.contractId===contractId),map=new Map(relevant.map(r=>[rowId(r),r]));require(map.size===relevant.length,'CAPPED_ROW_DUPLICATE','Una fila económica se repite.');
  const get=(space,code,stage='exact')=>{const row=map.get(space+':'+code);require(row&&row.agreementCode===c.agreementCode&&row.unit==='money','CAPPED_ROW_REQUIRED','Falta una fila monetaria del efecto capturado.');return stage==='rounded'?decimal(row.amount):evidenceNumber(row.exactValue);};
  let cash=get(p.cashBaseReference.op,p.cashBaseReference.code,p.cashBaseReference.stage),official=get(p.officialBaseReference.op,p.officialBaseReference.code,p.officialBaseReference.stage);
  for(let i=0;i<p.steps.length;i++){
   const s=p.steps[i],before=cash,officialBefore=official,reserve=get('auxiliary',s.reserveCode),applied=get('concept',s.conceptCode),line=get('concept',s.conceptCode,'rounded');
   require(sign(reserve)>=0&&sign(applied)>=0&&exactCompare(line,decimal(money(applied)))===0&&same(map.get('concept:'+s.conceptCode).rounding,p.lineRounding),'CAPPED_VALUE_INVALID','Reserva y descuento deben ser no negativos y conservar el redondeo declarado.');
   require(exactCompare(before,get('auxiliary',s.availableCode))===0&&exactCompare(officialBefore,get('auxiliary',s.officialAvailableCode))===0,'CAPPED_ORDER_INVALID','Los saldos observados no siguen el orden efectivo declarado.');
   const allowance=maximum(exactSubtract(minimum(before,officialBefore),reserve),zero),cashLimit=decimal(quantize(allowance,{precision:2,mode:'floor'}).amount);
   let requested=null,unapplied=null,effect=null;
   if(s.kind==='capped'){
    requested=get('auxiliary',s.requestedCode);require(sign(requested)>=0&&exactCompare(cashLimit,get('auxiliary',s.limitCode))===0,'CAPPED_VALUE_INVALID','El pedido debe ser no negativo y el límite debe conservar el centavo seguro.');
    const calculated=applyCappedDeduction({method:s.method,conceptCode:s.conceptCode,requestedAmount:ev(requested),availableAmount:ev(cashLimit)});
    require(same(calculated.applied.exact,ev(applied)),'CAPPED_AMOUNT_MISMATCH','El importe no corresponde al pedido y al límite declarado.');unapplied=exactSubtract(requested,applied);
    const effectValue=s.method==='29'?applied:unapplied;
    effect={kind:s.method==='29'?'applied_assignment':'unapplied_discount_contribution',target:s.method==='29'?'L[133]':'DCTONEFE',sourceConceptCode:s.conceptCode,stage:s.effectStage,exact:ev(s.effectStage==='rounded'?decimal(money(effectValue)):effectValue),amount:money(effectValue),debtWritten:false};
   }
   cash=exactSubtract(before,line);official=exactSubtract(officialBefore,applied);
   require(exactCompare(cash,minimum(before,reserve))>=0&&exactCompare(official,minimum(officialBefore,reserve))>=0,'CAPPED_RESERVE_VIOLATION','El descuento no puede agravar una insuficiencia ni consumir la reserva de ninguna etapa.');
   const requestMoney=requested===null?null:money(requested),unappliedMoney=unapplied===null?null:money(unapplied);
   if(requested!==null)require(exactCompare(decimal(requestMoney),exactAdd(line,decimal(unappliedMoney)))===0,'CAPPED_ROUNDING_RECONCILIATION','Pedido, aplicado y no aplicado deben conciliar también en centavos.');
   effects.push({contractId,agreementCode:c.agreementCode,policyId:p.policyId,policySha256:policySha256(p),position:i+1,kind:s.kind,conceptCode:s.conceptCode,method:s.method,consumptionStage:p.consumptionStage,officialConsumptionStage:p.officialConsumptionStage,requested:requested===null?null:{exact:ev(requested),amount:requestMoney},availableBefore:ev(before),officialAvailableBefore:ev(officialBefore),reserve:ev(reserve),allowance:ev(allowance),cashLimit:ev(cashLimit),applied:{exact:ev(applied),amount:money(line)},unapplied:unapplied===null?null:{exact:ev(unapplied),amount:unappliedMoney},availableAfter:ev(cash),officialAvailableAfter:ev(official),rounding:{appliedDelta:ev(exactSubtract(line,applied)),requestedDelta:requested===null?null:ev(exactSubtract(decimal(requestMoney),requested)),unappliedDelta:unapplied===null?null:ev(exactSubtract(decimal(unappliedMoney),unapplied)),remainingDifference:ev(exactSubtract(cash,official))},effect,sourceRowSha256:s.sourceRowSha256,ruleReference:s.ruleReference});
  }
  const officialNet=get('auxiliary',input.officialTotalsPolicy.totalCodes['999']),cashNet=exactAdd(relevant.filter(r=>['remuneration','non_remuneration'].includes(r.nature)).reduce((v,r)=>exactAdd(v,decimal(r.amount)),zero),get('auxiliary',input.officialTotalsPolicy.totalCodes['888'],'rounded')),cashNetAfter=exactSubtract(cashNet,relevant.filter(r=>r.nature==='deduction').reduce((v,r)=>exactAdd(v,decimal(r.amount)),zero));
  require(exactCompare(official,officialNet)<=0&&exactCompare(cash,cashNetAfter)<=0,'CAPPED_NET_RECONCILIATION','El saldo reservado no puede superar el neto real de su etapa oficial o de líneas.');
 }
 return {cappedDeductionsVersion:OWN_CAPPED_DEDUCTIONS_VERSION,cappedDeductionEffectCount:effects.length,cappedDeductionEffects:effects};
}
export function verifyCappedResult(input,result){
 const wanted=calculateCappedEffects(input,result.rows,result.employeeTotals.map(e=>e.contractId));
 const observed=Object.fromEntries(cappedResultFields(result).map(k=>[k,result[k]]));require(same(wanted,observed),'CAPPED_EFFECT_MISMATCH','El resultado debe conservar exactamente todos los efectos, incluidos los importes aplicados cero.');return result;
}
export function verifyCappedSource(payload,input=null,result=null){
 const programme=payload.programState?.program?.definition,inventory=payload.sourceInventory??{},has=present(programme,programFields),hasInventory=Object.hasOwn(inventory,'cappedDeductions');
 require(has===hasInventory,'CAPPED_CAPTURE_REQUIRED','La fuente debe conservar la política de límites del programa capturado.');
 if(!has){require(!input||!present(input,inputFields),'CAPPED_CAPTURE_UNEXPECTED','El programa histórico no declara efectos de límites.');require(!result||!present(result,resultFields),'CAPPED_CAPTURE_UNEXPECTED','Un resultado histórico no puede agregar efectos implícitos.');return null;}
 const material=inventory.cappedDeductions;
 require(salaryExact(material,inputFields)&&material.cappedDeductionCapture.period===payload.period&&material.cappedDeductionCapture.liquidationType===payload.liquidationType,'CAPPED_CAPTURE_INVALID','La política capturada debe corresponder al período original.');
 // The inventory is certified by captureCappedPolicies in the writer; here the
 // reader compares it with the immutable programme and the selected total.
 const policy=input?.officialTotalsPolicy??(programme.officialTotalsPolicies??[]).find(p=>policySha256(p)===material.cappedDeductionCapture.officialPolicySha256);
 require(policy&&same(captureCappedPolicies(programme,payload.period,payload.liquidationType,policy),material),'CAPPED_CAPTURE_CHANGED','El inventario no coincide con la política y reglas del programa original.');
 verifyCappedSources(payload,material.cappedDeductionCapture.policies);
 if(input){require(same(Object.fromEntries(inputFields.map(k=>[k,input[k]])),material),'CAPPED_CAPTURE_CHANGED','La entrada perdió la política original de límites.');if(result)verifyCappedResult(input,result);}
 return material;
}
