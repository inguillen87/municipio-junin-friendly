// Preparation-only economic nonapplication. This is not receipt filtering,
// a monetary zero, a default for missing inputs, or a source certification API.
// A future SQL caller must acquire the complete native sources in one trusted
// transaction. A consistent client-supplied hash does not attest that read.
import {createHash} from 'node:crypto';
import {salarySerialized,salaryUuid,salaryHash} from '../assets/native-salary-catalog-model.js';
import {ownPayrollEmployeeNumber} from '../assets/own-payroll-engine.js';
import {verifyMonthlyBatch,assertNativeMonthlySubject} from '../assets/payroll-native-monthly-model.js';
import {ownNoveltyBatch} from '../assets/own-payroll-novelties-model.js';
import {fixedList,fixedExportData,fixedCoverage} from '../assets/payroll-fixed-novelties-model.js';
import {payrollRequire as require} from '../assets/own-payroll-exact.js';
import {policyCode,requirePolicyScope,policyAppliesTo,policyRuleIntersects,requirePolicyDeclaration} from '../assets/own-payroll-policy-validity.js';

export const OWN_PAYROLL_NONAPPLICATION_VERSION='own-payroll-nonapplication.v1';
export const OWN_PAYROLL_NONAPPLICATION_CAPTURE_VERSION='own-payroll-nonapplication-capture.v1';
export const OWN_PAYROLL_NONAPPLICATION_PLAN_VERSION='own-payroll-nonapplication-plan.v1';
export const OWN_PAYROLL_NONAPPLICATION_V2_VERSION='own-payroll-nonapplication.v2';
export const OWN_PAYROLL_NONAPPLICATION_CAPTURE_V2_VERSION='own-payroll-nonapplication-capture.v2';
export const OWN_PAYROLL_NONAPPLICATION_PLAN_V2_VERSION='own-payroll-nonapplication-plan.v2';
export const NONAPPLICATION_CODES=Object.freeze(['22','49','55','72','74','81','94','111','145','318','458','459','560','598']);
export const NONAPPLICATION_ADDITIVE_GROUPS=Object.freeze(Object.fromEntries(Object.entries({
  '800000993':['22','49','55','145'],
  '800000994':['72','74','81','94','111','560'],
  '800000995':['318','458','459'],
  '800000996':['598'],
  '810993100':['22','49','55','145'],
  '810993108':['22','49','55','145'],
  '810993110':['22','49','55'],
  '810993196':['22','49','55','145'],
  '810995320':['318']
}).map(([key,value])=>[key,Object.freeze(value)])));
export const nonapplicationHash=value=>createHash('sha256').update(salarySerialized(value),'utf8').digest('hex');
export const freezeNonapplication=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freezeNonapplication);Object.freeze(value);}return value;};
const order=(a,b)=>a<b?-1:a>b?1:0;
const identity=d=>[d.kind,d.agreementCode,d.code].join(':');
const legacySelected=d=>d.agreementCode==='1'&&d.validFrom<='2026-10'&&(d.validUntil===null||d.validUntil>='2026-10')&&d.liquidationTypes?.includes('monthly');
const childKeys=['left','right','condition','then','else','value'];
const text=value=>typeof value==='string'&&value===value.trim()&&value===value.normalize('NFC')&&value.length>=3&&value.length<=180&&!/[<>\x00-\x1f\x7f]/.test(value);

export function nonapplicationCopy(value,depth=0,parents=new Set(),budget={nodes:0}){
  require(depth<=64&&++budget.nodes<=1000000,'NONAPPLICATION_LIMIT','La evidencia completa supera la capacidad; no se recorta.');
  if(value===null||typeof value==='string'||typeof value==='boolean')return value;
  if(typeof value==='number'){require(Number.isSafeInteger(value),'NONAPPLICATION_CONTRACT_INVALID','Los decimales deben conservarse como texto.');return value;}
  require(value&&typeof value==='object'&&!parents.has(value),'NONAPPLICATION_CONTRACT_INVALID','La evidencia no admite ciclos ni valores ejecutables.');
  const array=Array.isArray(value),descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(value);
  require(Object.getPrototypeOf(value)===(array?Array.prototype:Object.prototype)&&keys.every(k=>typeof k==='string'&&Object.hasOwn(descriptors[k],'value')&&(array&&k==='length'||descriptors[k].enumerable)),'NONAPPLICATION_CONTRACT_INVALID','La evidencia no admite accesores ni propiedades ocultas.');
  if(array)list(value,0,1000000);
  parents.add(value);
  const result=array?Array.from({length:value.length},(_,i)=>nonapplicationCopy(descriptors[String(i)].value,depth+1,parents,budget)):Object.fromEntries(keys.map(k=>[k,nonapplicationCopy(descriptors[k].value,depth+1,parents,budget)]));
  parents.delete(value);return result;
}
function shape(value,keys){require(value&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).sort().join('|')===[...keys].sort().join('|'),'NONAPPLICATION_CONTRACT_INVALID','El contrato necesita todos sus campos explícitos.');}
function list(value,min,max){require(Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length>=min&&value.length<=max&&Reflect.ownKeys(value).length===value.length+1&&Array.from({length:value.length},(_,i)=>Object.getOwnPropertyDescriptor(value,String(i))).every(d=>d&&Object.hasOwn(d,'value')&&d.enumerable),'NONAPPLICATION_CONTRACT_INVALID','El conjunto debe estar completo y sin huecos.');}
function same(a,b){return salarySerialized(a)===salarySerialized(b);}
function walk(node,visit,path='amount'){
  if(node===null)return;
  require(node&&typeof node==='object'&&!Array.isArray(node)&&typeof node.op==='string','NONAPPLICATION_AST_INVALID','La revisión requiere el árbol tipado original.');
  visit(node,path);
  for(const key of childKeys)if(node[key]&&typeof node[key]==='object')walk(node[key],visit,path+'/'+key);
}

/** Pins a reviewed, complete source set. It creates no approval or read receipt. */
export function createOwnPayrollNonapplicationPolicy(raw){
  const input=nonapplicationCopy(raw);
  shape(input,['scopeVersion','sourceSha256','sourceReference','definitions','bindings','sourceRows']);
  require(salaryHash(input.scopeVersion)&&salaryHash(input.sourceSha256)&&text(input.sourceReference),'NONAPPLICATION_SOURCE_REQUIRED','La política requiere alcance y procedencia exactos.');
  list(input.definitions,1,1000);list(input.bindings,0,1000);list(input.sourceRows,14,14);
  require(new Set(input.definitions.map(identity)).size===input.definitions.length,'NONAPPLICATION_SOURCE_DUPLICATE','No puede repetirse una definición fuente.');
  const targets=NONAPPLICATION_CODES.map(code=>{
    const definitions=input.definitions.filter(d=>d.kind==='concept'&&d.agreementCode==='1'&&d.code===code);
    const rows=input.sourceRows.filter(r=>r.CODI_02==='1'&&r.CODI_27===code);
    require(definitions.length===1&&rows.length===1,'NONAPPLICATION_SOURCE_INCOMPLETE','Deben conservarse las catorce definiciones y filas originales.');
    const d=definitions[0],row=rows[0];
    require(d.role==='payable'&&d.active===true&&d.outputUnit==='money'&&d.nature!=='auxiliary'&&d.validFrom==='2026-10'&&d.validUntil==='2026-10'&&same(d.liquidationTypes,['monthly'])&&salaryHash(d.sourceSha256),'NONAPPLICATION_SCOPE_UNSUPPORTED','Este candidato sólo cubre los catorce conceptos N del convenio 1, mensual de octubre 2026.');
    require(row.ACTI_27==='N'&&row.CODI_36==='98'&&(row.FOVM_27===null||row.FOVM_27==='')&&typeof row.LIQU_27==='string'&&row.LIQU_27.split(',').includes('M'),'NONAPPLICATION_SOURCE_SEMANTICS_INVALID','La fuente debe conservar activación N, método 98 y fórmula monetaria vacía; no se deducen de resultados.');
    return{code,definitionSha256:nonapplicationHash(d),sourceRowSha256:nonapplicationHash(row),sourceRow:row};
  });
  const aggregates=Object.entries(NONAPPLICATION_ADDITIVE_GROUPS).map(([code,removedCodes])=>{
    const found=input.definitions.filter(d=>d.kind==='auxiliary'&&d.agreementCode==='1'&&d.code===code);
    require(found.length===1&&found[0].nature==='auxiliary'&&found[0].outputUnit==='money'&&found[0].role==='dependency'&&found[0].active===true&&found[0].validFrom==='2026-10'&&found[0].validUntil==='2026-10'&&same(found[0].liquidationTypes,['monthly']),'NONAPPLICATION_AGGREGATE_REQUIRED','Falta un totalizador o prefijo aditivo exacto del alcance.');
    return{code,definitionSha256:nonapplicationHash(found[0]),removedCodes:[...removedCodes]};
  });
  return freezeNonapplication({version:OWN_PAYROLL_NONAPPLICATION_VERSION,scope:{scopeVersion:input.scopeVersion,agreementCode:'1',period:'2026-10',liquidationType:'monthly'},source:{sha256:input.sourceSha256,reference:input.sourceReference},expectedDefinitions:input.definitions.length,definitionsSha256:nonapplicationHash(input.definitions),bindingsSha256:nonapplicationHash(input.bindings),targets,aggregates,onPresent:'error',onAbsent:'no_economic_row',requiredSources:['monthly','fixed'],approved:false,registered:false});
}

/** Declares the exact future scope and memberships for review; it establishes
 * neither an approval nor absence in any employee/month. No V1 defaults are
 * copied into V2, including the original fourteen codes or nine aggregates. */
export function createOwnPayrollNonapplicationPolicyV2(raw){
  const input=nonapplicationCopy(raw);
  shape(input,['policyId','supersedes','scope','sourceSha256','sourceReference','definitions','bindings','sourceRows','targetCodes','additiveGroups']);
  requirePolicyDeclaration(input);
  require(input.supersedes===null,'NONAPPLICATION_HISTORY_REQUIRED','La preparación aislada no puede acreditar una sucesión: requiere un futuro programa que conserve y revise el conjunto completo de políticas.');
  shape(input.scope,['scopeVersion','agreementCode','validFrom','validUntil','liquidationType']);
  requirePolicyScope(input.scope);
  require(input.scope.liquidationType==='monthly'&&salaryHash(input.scope.scopeVersion)&&salaryHash(input.sourceSha256)&&text(input.sourceReference),'NONAPPLICATION_SOURCE_REQUIRED','La política mensual necesita vigencia, convenio y procedencia declarados.');
  list(input.definitions,1,1000);list(input.bindings,0,1000);list(input.targetCodes,1,1000);list(input.sourceRows,input.targetCodes.length,input.targetCodes.length);list(input.additiveGroups,0,1000);
  require(input.sourceRows.every(row=>row&&Object.getPrototypeOf(row)===Object.prototype),'NONAPPLICATION_SOURCE_SEMANTICS_INVALID','Cada fila fuente debe conservar sus campos explícitos.');
  require(input.targetCodes.every(policyCode)&&new Set(input.targetCodes).size===input.targetCodes.length&&new Set(input.definitions.map(identity)).size===input.definitions.length,'NONAPPLICATION_SOURCE_DUPLICATE','Los conceptos condicionales y las definiciones fuente deben ser explícitos y únicos.');
  const scope=input.scope,within=d=>d.validFrom===scope.validFrom&&d.validUntil===scope.validUntil&&same(d.liquidationTypes,[scope.liquidationType]);
  const targets=[...input.targetCodes].sort(order).map(code=>{
    const definitions=input.definitions.filter(d=>d.kind==='concept'&&d.agreementCode===scope.agreementCode&&d.code===code),rows=input.sourceRows.filter(r=>r.CODI_02===scope.agreementCode&&r.CODI_27===code);
    require(definitions.length===1&&rows.length===1,'NONAPPLICATION_SOURCE_INCOMPLETE','Cada concepto condicional requiere su definición y fila fuente originales completas.');
    const d=definitions[0],row=rows[0];
    require(d.role==='payable'&&d.active===true&&d.outputUnit==='money'&&d.nature!=='auxiliary'&&within(d)&&salaryHash(d.sourceSha256),'NONAPPLICATION_SCOPE_UNSUPPORTED','Cada definición conserva exactamente la vigencia y el convenio declarados; no se extiende una regla histórica.');
    require(row.ACTI_27==='N'&&row.CODI_36==='98'&&(row.FOVM_27===null||row.FOVM_27==='')&&typeof row.LIQU_27==='string'&&row.LIQU_27.split(',').includes('M'),'NONAPPLICATION_SOURCE_SEMANTICS_INVALID','La fuente debe acreditar activación N, método 98 y fórmula monetaria vacía.');
    return{code,definitionSha256:nonapplicationHash(d),sourceRowSha256:nonapplicationHash(row),sourceRow:row};
  });
  const aggregateCodes=new Set(),targetSet=new Set(input.targetCodes);
  const aggregates=input.additiveGroups.map(group=>{
    shape(group,['code','removedCodes']);list(group.removedCodes,1,1000);
    require(policyCode(group.code)&&!aggregateCodes.has(group.code)&&!targetSet.has(group.code)&&group.removedCodes.every(c=>targetSet.has(c))&&new Set(group.removedCodes).size===group.removedCodes.length,'NONAPPLICATION_MEMBERSHIP_CHANGED','Cada suma y su membresía retirada deben declararse sin duplicados.');aggregateCodes.add(group.code);
    const found=input.definitions.filter(d=>d.kind==='auxiliary'&&d.agreementCode===scope.agreementCode&&d.code===group.code);
    require(found.length===1&&found[0].nature==='auxiliary'&&found[0].outputUnit==='money'&&found[0].role==='dependency'&&found[0].active===true&&within(found[0]),'NONAPPLICATION_AGGREGATE_REQUIRED','La suma declarada necesita su definición auxiliar íntegra en la misma vigencia.');
    return{code:group.code,definitionSha256:nonapplicationHash(found[0]),removedCodes:[...group.removedCodes].sort(order)};
  }).sort((a,b)=>order(a.code,b.code));
  return freezeNonapplication({version:OWN_PAYROLL_NONAPPLICATION_V2_VERSION,policyId:input.policyId,supersedes:null,scope,source:{sha256:input.sourceSha256,reference:input.sourceReference},expectedDefinitions:input.definitions.length,definitionsSha256:nonapplicationHash(input.definitions),bindingsSha256:nonapplicationHash(input.bindings),targets,aggregates,onPresent:'error',onAbsent:'no_economic_row',requiredSources:['monthly','fixed'],approved:false,registered:false});
}

/** Validated scope for consumers of a captured policy. Source review separately
 * rebuilds its full definition/binding pins; this helper cannot certify reads. */
export function ownPayrollNonapplicationPolicyContext(raw){
  const policy=nonapplicationCopy(raw);
  const temporal=policy.version===OWN_PAYROLL_NONAPPLICATION_V2_VERSION;
  shape(policy,['version',...(temporal?['policyId','supersedes']:[]),'scope','source','expectedDefinitions','definitionsSha256','bindingsSha256','targets','aggregates','onPresent','onAbsent','requiredSources','approved','registered']);
  if(temporal){requirePolicyDeclaration(policy);require(policy.supersedes===null,'NONAPPLICATION_HISTORY_REQUIRED','La preparación aislada conserva su identidad y no sustituye una aprobación de sucesión.');}
  require(temporal||policy.version===OWN_PAYROLL_NONAPPLICATION_VERSION,'NONAPPLICATION_VERSION_INVALID','La versión condicional debe ser explícita.');
  shape(policy.scope,temporal?['scopeVersion','agreementCode','validFrom','validUntil','liquidationType']:['scopeVersion','agreementCode','period','liquidationType']);requirePolicyScope(policy.scope);
  require(salaryHash(policy.scope.scopeVersion)&&policy.scope.liquidationType==='monthly'&&(temporal||policy.scope.agreementCode==='1'&&policy.scope.period==='2026-10'),'NONAPPLICATION_SCOPE_UNSUPPORTED','El alcance histórico se conserva y el nuevo se declara por vigencia.');
  shape(policy.source,['sha256','reference']);
  require(salaryHash(policy.source.sha256)&&text(policy.source.reference)&&Number.isSafeInteger(policy.expectedDefinitions)&&policy.expectedDefinitions>0&&policy.expectedDefinitions<=1000&&[policy.definitionsSha256,policy.bindingsSha256].every(salaryHash)&&policy.onPresent==='error'&&policy.onAbsent==='no_economic_row'&&same(policy.requiredSources,['monthly','fixed'])&&policy.approved===false&&policy.registered===false,'NONAPPLICATION_POLICY_CHANGED','La política debe conservar todos sus pines y sus estados no aprobados.');
  list(policy.targets,temporal?1:14,temporal?1000:14);list(policy.aggregates,temporal?0:9,temporal?1000:9);
  for(const target of policy.targets){
    shape(target,['code','definitionSha256','sourceRowSha256','sourceRow']);
    require(policyCode(target.code)&&salaryHash(target.definitionSha256)&&salaryHash(target.sourceRowSha256)&&target.sourceRow&&Object.getPrototypeOf(target.sourceRow)===Object.prototype&&nonapplicationHash(target.sourceRow)===target.sourceRowSha256&&target.sourceRow.CODI_02===policy.scope.agreementCode&&target.sourceRow.CODI_27===target.code&&target.sourceRow.ACTI_27==='N'&&target.sourceRow.CODI_36==='98'&&(target.sourceRow.FOVM_27===null||target.sourceRow.FOVM_27==='')&&typeof target.sourceRow.LIQU_27==='string'&&target.sourceRow.LIQU_27.split(',').includes('M'),'NONAPPLICATION_POLICY_CHANGED','Cada concepto condicional conserva su fila y semántica fuente exactas.');
  }
  const codes=policy.targets.map(t=>t.code),targetSet=new Set(codes),groups={};
  require(targetSet.size===codes.length&&(temporal||same(codes,NONAPPLICATION_CODES)),'NONAPPLICATION_POLICY_CHANGED','Los conceptos condicionales no pueden repetirse ni sustituir el alcance histórico.');
  for(const group of policy.aggregates){
    shape(group,['code','definitionSha256','removedCodes']);list(group.removedCodes,1,1000);
    require(policyCode(group.code)&&salaryHash(group.definitionSha256)&&!Object.hasOwn(groups,group.code)&&!targetSet.has(group.code)&&new Set(group.removedCodes).size===group.removedCodes.length&&group.removedCodes.every(c=>targetSet.has(c)),'NONAPPLICATION_MEMBERSHIP_CHANGED','La membresía de cada suma debe estar completa y referir sólo a conceptos declarados.');groups[group.code]=group.removedCodes;
  }
  require(temporal||same(groups,NONAPPLICATION_ADDITIVE_GROUPS),'NONAPPLICATION_MEMBERSHIP_CHANGED','La política histórica conserva sus nueve sumas originales.');
  return{policy,temporal,agreementCode:policy.scope.agreementCode,targetCodes:codes,additiveGroups:groups,captureVersion:temporal?OWN_PAYROLL_NONAPPLICATION_CAPTURE_V2_VERSION:OWN_PAYROLL_NONAPPLICATION_CAPTURE_VERSION,planVersion:temporal?OWN_PAYROLL_NONAPPLICATION_PLAN_V2_VERSION:OWN_PAYROLL_NONAPPLICATION_PLAN_VERSION};
}

/** Static review only. Without a complete native capture this is not a plan. */
export function inspectOwnPayrollNonapplicationSource(raw){
  const input=nonapplicationCopy(raw);shape(input,['policy','source','definitions','bindings','priorProgram']);
  const {policy,source,definitions,bindings,priorProgram}=input,context=ownPayrollNonapplicationPolicyContext(policy);
  const targetCodes=new Set(context.targetCodes),selected=d=>context.temporal?policyRuleIntersects(d,policy.scope):legacySelected(d);
  shape(source,['sha256','complete','expectedDefinitions']);
  require(typeof source.complete==='boolean'&&source.expectedDefinitions===definitions.length&&source.sha256===policy?.source?.sha256,'NONAPPLICATION_SOURCE_INCOMPLETE','El inventario declarado no coincide con la política; no se prepara un subconjunto.');
  const declaration={sourceSha256:source.sha256,sourceReference:policy.source.reference,definitions,bindings,sourceRows:policy.targets.map(t=>t.sourceRow)};
  const expected=context.temporal?createOwnPayrollNonapplicationPolicyV2({...declaration,policyId:policy.policyId,supersedes:policy.supersedes,scope:policy.scope,targetCodes:context.targetCodes,additiveGroups:policy.aggregates.map(({code,removedCodes})=>({code,removedCodes}))}):createOwnPayrollNonapplicationPolicy({...declaration,scopeVersion:policy.scope.scopeVersion});
  require(same(policy,expected),'NONAPPLICATION_POLICY_CHANGED','La política no conserva las definiciones, bindings o filas fuente revisadas.');
  const aggregateCodes=new Set(policy.aggregates.map(a=>a.code)),references=[],changes=[];
  const inspect=(d,expression,path)=>walk(expression,(node,nodePath)=>{
    const direct=(node.op==='concept'||node.op==='quantity')&&targetCodes.has(node.code);
    const sourceDirect=['source','source_match'].includes(node.op)&&targetCodes.has(/^[RU]\[([0-9]{1,9})\]$/.exec(node.reference??'')?.[1]);
    if(!direct&&!sourceDirect)return;
    require(node.op==='concept'&&d.kind==='auxiliary'&&aggregateCodes.has(d.code)&&path==='amount','NONAPPLICATION_DIRECT_REFERENCE','Una referencia R/U fuera de un totalizador aditivo impide omitir la fila.');
    references.push({owner:identity(d),path:nodePath,op:node.op,code:node.code});
  },path);
  for(const d of definitions.filter(selected)){
    inspect(d,d.expression,'amount');
    if(d.quantity!==null)inspect(d,d.quantity.expression,'quantity');
  }
  // Never retire or change an existing approved rule through a source shortcut.
  for(const r of priorProgram?.rules??[]){
    const d={...r,kind:r.nature==='auxiliary'?'auxiliary':'concept'};
    if(!selected(d))continue;
    require(!(d.kind==='concept'&&targetCodes.has(d.code))&&!(d.kind==='auxiliary'&&aggregateCodes.has(d.code)),'NONAPPLICATION_PRIOR_RULE_ACTIVE','La política no puede retirar ni reescribir una regla ya vigente.');
    walk(r.expression,n=>require(!((n.op==='concept'||n.op==='quantity')&&targetCodes.has(n.code)),'NONAPPLICATION_DIRECT_REFERENCE','Un programa previo consume una fila que se intenta omitir.'));
  }
  for(const q of priorProgram?.quantityPhases??[])if(selected(q))walk(q.expression,n=>require(!((n.op==='concept'||n.op==='quantity')&&targetCodes.has(n.code)),'NONAPPLICATION_DIRECT_REFERENCE','Una cantidad previa consume una fila que se intenta omitir.'));
  function prune(node,removed,path='amount'){
    if(node.op==='add'){
      shape(node,['op','left','right']);
      const left=prune(node.left,removed,path+'/left'),right=prune(node.right,removed,path+'/right');
      return left===null?right:right===null?left:{op:'add',left,right};
    }
    require(node.op==='concept'&&node.stage==='exact','NONAPPLICATION_NONADDITIVE_REFERENCE','Sólo se retiran hojas conceptuales exactas de una suma pura; no se cambia una resta, condición o redondeo.');
    shape(node,['op','code','stage']);
    if(targetCodes.has(node.code)){removed.push({path,code:node.code});return null;}
    return node;
  }
  const transformed=definitions.map(d=>{
    if(d.kind!=='auxiliary'||d.agreementCode!==context.agreementCode||!aggregateCodes.has(d.code))return d;
    const removed=[],expression=prune(d.expression,removed);
    require(expression!==null,'NONAPPLICATION_EMPTY_AGGREGATE','No se inventa un cero para un acumulador sin miembros.');
    require(same(removed.map(r=>r.code).sort(order),[...context.additiveGroups[d.code]].sort(order)),'NONAPPLICATION_MEMBERSHIP_CHANGED','La membresía o multiplicidad del acumulador cambió respecto del conjunto explícito.');
    changes.push({owner:identity(d),beforeSha256:nonapplicationHash(d.expression),afterSha256:nonapplicationHash(expression),removed});
    return{...d,expression};
  });
  const expectedReferences=Object.values(context.additiveGroups).reduce((sum,members)=>sum+members.length,0);
  require(references.length===expectedReferences&&changes.length===policy.aggregates.length&&changes.reduce((sum,c)=>sum+c.removed.length,0)===expectedReferences,'NONAPPLICATION_MEMBERSHIP_CHANGED','La revisión debe reconocer todos los términos y acumuladores declarados, sin pérdida ni multiplicación.');
  const excluded=new Set(context.targetCodes.map(code=>'concept:'+context.agreementCode+':'+code)),usedRefs=new Set(),excludedRefs=new Set();
  for(const d of transformed){
    const refs=excluded.has(identity(d))?excludedRefs:usedRefs;
    const add=n=>{if(n.op==='source'||n.op==='source_match')refs.add(d.agreementCode+':'+n.reference);if(n.op==='source_presence')refs.add(d.agreementCode+':'+(n.family==='monthly'?'P':'F')+'['+n.code+']');};
    walk(d.expression,add);if(d.quantity!==null)walk(d.quantity.expression,add,'quantity');
  }
  const removedBindings=bindings.filter(b=>excludedRefs.has(b.agreementCode+':'+b.reference)&&!usedRefs.has(b.agreementCode+':'+b.reference));
  const keptBindings=bindings.filter(b=>!removedBindings.includes(b));
  return freezeNonapplication({version:context.temporal?'own-payroll-nonapplication-source-review.v2':'own-payroll-nonapplication-source-review.v1',policy,sourceDeclaredComplete:source.complete,originalDefinitionsSha256:nonapplicationHash(definitions),transformedDefinitionsSha256:nonapplicationHash(transformed),definitions:transformed,bindings:keptBindings,excludedDefinitionIds:[...excluded],changes,references,removedBindings:removedBindings.map(b=>({agreementCode:b.agreementCode,reference:b.reference,sha256:nonapplicationHash(b)})),requiresNativeCapture:true,approved:false,executable:false});
}

/** Validate complete own sources, not GRH historical activity or a UI search. */
export function captureOwnPayrollNonapplication(raw,policy){
  require(raw!==null&&raw!==undefined,'NONAPPLICATION_NATIVE_CAPTURE_REQUIRED','Falta la captura propia completa mensual y fija; GRH no acredita esta ausencia.');
  const capture=nonapplicationCopy(raw),context=ownPayrollNonapplicationPolicyContext(policy),targetCodes=new Set(context.targetCodes);
  shape(capture,['version','origin','tenantId','scopeVersion','period','liquidationType','agreementCode','contractIds','population','monthly','fixed','completeness','sourceSha256','sourceReference']);
  require(capture.version===context.captureVersion&&capture.origin==='MUNICONTROL'&&salaryUuid(capture.tenantId)&&capture.scopeVersion===policy.scope.scopeVersion&&policyAppliesTo(policy.scope,capture)&&capture.agreementCode===policy.scope.agreementCode&&text(capture.sourceReference),'NONAPPLICATION_CAPTURE_SCOPE_INVALID','La captura debe provenir del alcance propio exacto, con período y tipo explícitos.');
  shape(capture.completeness,['population','monthly','fixed']);require(Object.values(capture.completeness).every(v=>v===true),'NONAPPLICATION_SOURCE_INCOMPLETE','Población, novedades mensuales y fijas deben estar completas.');
  shape(capture.sourceSha256,['population','monthly','fixed']);
  require(Object.keys(capture.sourceSha256).every(k=>salaryHash(capture.sourceSha256[k])&&capture.sourceSha256[k]===nonapplicationHash(capture[k])),'NONAPPLICATION_CAPTURE_CHANGED','La captura no conserva sus fuentes íntegras.');
  list(capture.contractIds,1,10000);require(capture.contractIds.every(salaryUuid)&&new Set(capture.contractIds).size===capture.contractIds.length&&same(capture.contractIds,[...capture.contractIds].sort(order)),'NONAPPLICATION_POPULATION_INVALID','Los contratos seleccionados deben ser únicos y explícitos.');
  const population=capture.population;shape(population,['complete','version','employees']);list(population.employees,1,10000);
  require(population.complete===true&&salaryHash(population.version),'NONAPPLICATION_SOURCE_INCOMPLETE','La población propia debe estar completa y versionada.');
  const byId=new Map();
  for(const e of population.employees){
    shape(e,['contractId','employeeNumber','agreementCode','departmentCode','categoryCode','identityToken','origin']);
    require(salaryUuid(e.contractId)&&ownPayrollEmployeeNumber(e.employeeNumber)&&e.agreementCode===context.agreementCode&&[e.departmentCode,e.categoryCode].every(v=>typeof v==='string'&&/^[0-9]{1,9}$/.test(v))&&salaryHash(e.identityToken)&&e.origin==='MUNICONTROL'&&!byId.has(e.contractId),'NONAPPLICATION_POPULATION_INVALID','No se sustituye la identidad ni el encuadre propio por una fila histórica.');
    byId.set(e.contractId,e);
  }
  require(same([...byId.keys()].sort(order),capture.contractIds),'NONAPPLICATION_POPULATION_INCOMPLETE','La captura debe cubrir exactamente todos los contratos declarados.');
  const checkIdentity=s=>{assertNativeMonthlySubject(s);const e=byId.get(s.contractId);require(e&&s.origin==='MUNICONTROL'&&s.legajo===e.employeeNumber&&s.identityToken===e.identityToken,'NONAPPLICATION_IDENTITY_CHANGED','La novedad no conserva la identidad de la población propia.');};
  const observations=[],seen=new Set(),month=capture.period+'-01';
  const observe=(r,contractId,family,reference)=>{
    require(family==='fixed'||r.adjustmentMonth===null||r.adjustmentMonth===month,'NONAPPLICATION_SOURCE_SCOPE_INVALID','Un ajuste de otro período necesita tratamiento explícito.');
    require(!targetCodes.has(r.conceptSourceId),'NONAPPLICATION_EVENT_PRESENT','Un concepto N tiene un evento presente, incluso si declara cero o Forzado. Falta su regla monetaria; no se omite.');
    observations.push({family,contractId,conceptCode:r.conceptSourceId,reference});
  };
  const monthly=capture.monthly;shape(monthly,['complete','batches','nativeBatches']);list(monthly.batches,0,10000);list(monthly.nativeBatches,0,1000);
  require(monthly.complete===true,'NONAPPLICATION_SOURCE_INCOMPLETE','Deben declararse completos ambos canales mensuales propios.');
  for(const batch of monthly.batches){
    verifyMonthlyBatch(batch,{mode:'export'});
    require(batch.contractVersion==='payroll-novelty-batch.v2'&&batch.periodMonth===month&&batch.payrollType===capture.liquidationType&&!seen.has(batch.id),'NONAPPLICATION_SOURCE_SCOPE_INVALID','Un lote mensual es ajeno, antiguo o está repetido.');seen.add(batch.id);
    for(const r of batch.rows){checkIdentity(r.subject);require(r.employmentContractId===r.subject.contractId&&r.identityCurrent===true,'NONAPPLICATION_IDENTITY_CHANGED','La identidad de una novedad mensual cambió.');observe(r,r.employmentContractId,'monthly',batch.id+':'+r.rowOrdinal);}
  }
  for(const batch of monthly.nativeBatches){
    ownNoveltyBatch(batch);
    require(batch.status==='approved'&&batch.periodMonth===month&&batch.payrollType===capture.liquidationType&&batch.rowsSha256===nonapplicationHash(batch.rows.map(({values,subject})=>({values,subject})))&&!seen.has(batch.id),'NONAPPLICATION_SOURCE_SCOPE_INVALID','El lote nativo no conserva su aprobación, huella o alcance.');seen.add(batch.id);
    for(const row of batch.rows){checkIdentity(row.subject);require(row.identityCurrent===true&&row.values.contractId===row.subject.contractId,'NONAPPLICATION_IDENTITY_CHANGED','La identidad de una novedad propia cambió.');observe(row.values,row.values.contractId,'monthly',batch.id+':'+row.values.rowOrdinal);}
  }
  shape(capture.fixed,['list','export']);
  const fixedData=fixedList(capture.fixed.list,month),fixedRows=fixedExportData(capture.fixed.export,fixedData);
  for(const r of fixedData.rows){
    checkIdentity(r.subject);
    if(r.pending?.operation==='set'&&r.pending.values?.payrollType===capture.liquidationType&&fixedCoverage(r.pending.values,month).intersects&&targetCodes.has(r.pending.values.conceptSourceId))require(false,'NONAPPLICATION_FIXED_PENDING','Una novedad fija del alcance tiene revisión pendiente; la ausencia no está cerrada.');
  }
  for(const r of fixedRows.rows){
    checkIdentity(r.subject);require(r.values.payrollType===capture.liquidationType,'NONAPPLICATION_SOURCE_SCOPE_INVALID','Una fija pertenece a otro tipo de liquidación.');
    observe(r.values,r.subject.contractId,'fixed',r.recordId+':'+r.proposalId);
  }
  const captureSha256=nonapplicationHash(capture);
  const decisions=capture.contractIds.flatMap(contractId=>context.targetCodes.map(conceptCode=>({contractId,agreementCode:context.agreementCode,period:capture.period,liquidationType:capture.liquidationType,conceptCode,decision:'not_applicable',reason:'no_approved_monthly_or_effective_fixed_event',monthlyEventCount:0,fixedEventCount:0,captureSha256})));
  return freezeNonapplication({version:context.captureVersion,capture,captureSha256,decisions,observedOtherEventCount:observations.length,sourceCertification:'requires_trusted_complete_native_read',approved:false,registered:false});
}

export function prepareOwnPayrollNonapplicationPlan(raw){
  const input=nonapplicationCopy(raw);shape(input,['policy','source','definitions','bindings','priorProgram','capture']);
  const {capture,...source}=input,review=inspectOwnPayrollNonapplicationSource(source),evidence=capture===null?null:captureOwnPayrollNonapplication(capture,review.policy);
  const plan={version:ownPayrollNonapplicationPolicyContext(review.policy).planVersion,status:evidence?'capture_validated_for_preview':'conditional_preparation',policy:review.policy,definitions:review.definitions,bindings:review.bindings,excludedDefinitionIds:review.excludedDefinitionIds,sourceReview:review,evidence,requiresCompleteNativeCaptureAtExecution:true,approved:false,registered:false,payrollPosted:false};
  return freezeNonapplication({...plan,planSha256:nonapplicationHash(plan)});
}

/** Effective compilation view for composition/totals. The fourteen originals
 * remain in sourceDefinitions and in the unchanged full source coverage. Their
 * role/active flags are never changed to disguise monetary concepts as inputs.
 * It is still a conditional program: the new programmeOptions make an old
 * command/model reject it instead of accepting the reduced view unguarded. */
export function createOwnPayrollNonapplicationEffectiveBundle(raw){
  const input=nonapplicationCopy(raw);shape(input,['bundle','policy','source','priorProgram']);
  const {bundle,policy,source,priorProgram}=input,context=ownPayrollNonapplicationPolicyContext(policy);
  require(policyAppliesTo(policy.scope,{period:bundle.period,liquidationType:'monthly',agreementCode:context.agreementCode})&&same(bundle.agreementCodes,[context.agreementCode])&&bundle.approved===false&&bundle.executable===false&&bundle.presentable===false&&!Object.hasOwn(bundle,'nonApplication')&&!Object.hasOwn(bundle.programmeOptions,'nonApplicationVersion')&&!Object.hasOwn(bundle.programmeOptions,'nonApplicationPolicy'),'NONAPPLICATION_EFFECTIVE_BUNDLE_INVALID','La vista requiere el bundle original; no se aplica dos veces ni se reutiliza una aprobación.');
  const review=inspectOwnPayrollNonapplicationSource({policy,source,definitions:bundle.definitions,bindings:bundle.bindings,priorProgram});
  const excluded=new Set(review.excludedDefinitionIds),sourceDefinitions=bundle.definitions.filter(d=>excluded.has(identity(d))),effectiveDefinitions=review.definitions.filter(d=>!excluded.has(identity(d)));
  require(sourceDefinitions.length===context.targetCodes.length&&effectiveDefinitions.length+sourceDefinitions.length===bundle.definitions.length,'NONAPPLICATION_SOURCE_INCOMPLETE','La vista debe conservar la cobertura original íntegra.');
  const metadata={version:policy.version,policy,policySha256:nonapplicationHash(policy),sourceBundleCanonicalSha256:nonapplicationHash(bundle),sourceReviewSha256:nonapplicationHash(review),expectedSourceDefinitions:bundle.definitions.length,effectiveDefinitions:effectiveDefinitions.length,sourceDefinitions,removedBindings:bundle.bindings.filter(b=>review.removedBindings.some(r=>r.agreementCode===b.agreementCode&&r.reference===b.reference)),requiresCompleteNativeCaptureAtExecution:true,nativeAbsenceEstablished:false,approved:false,registered:false};
  const effective={...bundle,definitions:effectiveDefinitions,bindings:review.bindings,programmeOptions:{...bundle.programmeOptions,nonApplicationVersion:policy.version,nonApplicationPolicy:policy},nonApplication:metadata};
  const receipt={version:context.temporal?'own-payroll-nonapplication-effective-bundle.v2':'own-payroll-nonapplication-effective-bundle.v1',sourceBundleCanonicalSha256:nonapplicationHash(bundle),effectiveBundleCanonicalSha256:nonapplicationHash(effective),policySha256:nonapplicationHash(policy),sourceReviewSha256:nonapplicationHash(review),sourceDefinitions:bundle.definitions.length,effectiveDefinitions:effectiveDefinitions.length,conditionalDefinitions:sourceDefinitions.length,prunedReferences:review.references.length,changedAdditiveDefinitions:review.changes.length,removedExclusiveBindings:review.removedBindings.length,sourceDeclaredComplete:source.complete,nativeAbsenceEstablished:false,approved:false,registered:false,municipalWrites:0};
  return freezeNonapplication({bundle:effective,review,receipt});
}
