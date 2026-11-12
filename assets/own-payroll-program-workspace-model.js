import {ownProgramBootstrap,ownProgramStructure,ownProgramDefinition,ownProgramHistory,ownProgramCommand,ownProgramReceipt,ownProgramRuleKey} from './own-payroll-program-model.js';
import {salarySerialized,salaryKey} from './native-salary-catalog-model.js';
import {ownRunWorkspaceAccess} from './own-payroll-run-workspace-model.js';
import {requireExactProgramChanges} from './own-payroll-program-precision.js';
import {ownPayrollConditions} from './own-payroll-conditions.js';
import {FAMILY_FACT_FIELDS} from './own-contract-family-payroll-facts-workspace.js';

export const PROGRAM_UNITS=Object.freeze({money:'Dinero',hours:'Horas',minutes:'Minutos',days:'Días',percent:'Porcentaje',units:'Unidades',coefficient:'Coeficiente'});
export const PROGRAM_CONDITION_TYPES=Object.freeze({code:'Código o situación declarada',boolean:'Declaración de sí o no'});
export const PROGRAM_CONDITION_FIELDS=Object.freeze({partialSeniorityYears:'Años de antigüedad parcial',titleStatus:'Situación del título',titleCode:'Código del título',titlePercentage:'Porcentaje del título',unhealthyWork:'Insalubridad declarada',teacherPayEnabled:'Habilitación de pago docente',housingHigherDedicationPayEnabled:'Habilitación de mayor dedicación de vivienda',payrollMonthBaseDays:'Base de días de liquidación del mes'});
export const PROGRAM_CLASSIFICATION_FIELDS=Object.freeze({categoryCode:'Clase del contrato propio',agreementCode:'Convenio del contrato propio'});
export const PROGRAM_FAMILY_FIELDS=Object.freeze({...Object.fromEntries(FAMILY_FACT_FIELDS.map(f=>[f.key,f.label])),prenatalAdjustmentMonths:'Meses de ajuste prenatal',tariffRegion:'Región de la tarifa',semesterAverage:'Promedio del semestre anterior'});
export const PROGRAM_SOURCES=Object.freeze({conditional_scale:'Escala obligatoria cuando se cumplen las condiciones declaradas',conditional_working_time_fact:'Jornada contractual cuando se cumplen las condiciones declaradas',optional_scale:'Escala opcional del concepto: cero si no hay configuración aprobada',family_fact:'Dato familiar propio aprobado',family_tariff:'Tarifa familiar según región y promedio aprobados',monthly_presence:'Presencia de novedad mensual aprobada',fixed_presence:'Presencia de novedad fija aprobada',period_context_fact:'Mes del período de liquidación declarado',agreement_time_fact:'Horas mensuales del convenio aprobadas',classification_fact:'Encuadre propio capturado',salary_condition_fact:'Condiciones propias aprobadas',working_time_fact:'Jornada contractual aprobada',period_fact:'Participación aprobada del período',employment_fact:'Antigüedad reconocida y aprobada',parameter:'Valor del concepto aprobado',auxiliary_parameter:'Valor del auxiliar aprobado',scale:'Escala de la clase del empleado',scale_reference:'Escala de una clase de referencia',monthly_quantity:'Cantidad de novedad mensual',monthly_amount:'Importe de novedad mensual',fixed_quantity:'Cantidad de novedad fija',fixed_amount:'Importe de novedad fija'});
export const PROGRAM_ROUNDING=Object.freeze({exact:'Exigir resultado exacto',half_up:'Más cercano; mitad alejada del cero',half_even:'Más cercano; mitad al par',toward_zero:'Hacia cero',floor:'Hacia el inferior',ceiling:'Hacia el superior'});
export const PROGRAM_OPERATIONS=Object.freeze({input:'Usar una entrada',concept:'Usar otro concepto calculado',auxiliary:'Usar un auxiliar calculado',literal:'Valor explícito',add:'Sumar',subtract:'Restar',multiply:'Multiplicar',divide:'Dividir',min:'Elegir el menor',max:'Elegir el mayor',round:'Tratamiento de precisión en esta etapa',convert:'Convertir con respaldo',compare:'Comparar',choose:'Elegir según una condición'});
const conditionOperations=Object.freeze({match:'Comprobar un código o declaración'});
export const programWorkspaceOperations=definition=>ownPayrollConditions(definition)?{...PROGRAM_OPERATIONS,...conditionOperations}:PROGRAM_OPERATIONS;
export const PROGRAM_COMPARE=Object.freeze({lt:'Menor que',le:'Menor o igual',eq:'Igual',ne:'Distinto',ge:'Mayor o igual',gt:'Mayor que'});
export const PROGRAM_READ=Object.freeze(['workforce.employee.read','payroll.parameter.read']);
const require=(v,message)=>{if(!v)throw Error(message);};
export const programWorkspaceAccess=ownRunWorkspaceAccess;
// Only the verified bootstrap can describe these prerequisites. This is not
// payroll eligibility, formula homologation, or permission to calculate.
export function programWorkspaceGuidance(value){
 const boot=ownProgramBootstrap(value),catalogApproved=boot.salaryCatalog.revision>0,programApproved=boot.program.revision>0;
 const catalogMatches=programApproved&&boot.program.salaryVersion===boot.salaryCatalog.version;
 const pending=boot.proposals.filter(p=>p.status==='pending');
 return {
  state:!catalogApproved?'catalog_required':!programApproved?'program_required':!catalogMatches?'catalog_changed':'linked',
  canPrepare:catalogApproved&&boot.permissions.canPropose,
  preparationAllowed:boot.permissions.canPropose,
  reviewAllowed:boot.permissions.canReview,
  pendingCount:pending.length,
  reviewableCount:pending.filter(p=>boot.permissions.canReview&&p.canReview&&p.baseVersion===boot.program.version&&p.salaryVersion===boot.salaryCatalog.version).length,
  catalogRevision:boot.salaryCatalog.revision,programRevision:boot.program.revision,
 };
}
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export function programWorkspaceAttempt(key,body,accessKey){
 require(salaryKey(key)&&typeof accessKey==='string'&&accessKey,'No se pudo identificar el intento de reglas.');
 return freeze({key,body:structuredClone(ownProgramCommand(body)),accessKey});
}
export async function verifiedProgramWorkspaceReceipt(value,attempt){
 ownProgramReceipt(value,attempt);
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(salarySerialized(value.body))))].map(b=>b.toString(16).padStart(2,'0')).join('');
 require(value.requestSha256===hash,'El comprobante no conserva el contenido verificado. Consultá el mismo intento.');return value;
}
export function prepareProgramWorkspace(bootstrap,definition,reason){
 const boot=ownProgramBootstrap(bootstrap);
 require(boot.permissions.canPropose,'Tu cuenta no permite preparar reglas.');
 require(boot.salaryCatalog.revision>0,'Primero debe aprobarse el catálogo de conceptos y valores.');
 const program=ownProgramDefinition(definition,boot.salaryCatalog.items);ownProgramHistory(boot.program.definition,program);requireExactProgramChanges(boot.program.definition,program);
 return ownProgramCommand({command:'propose',scopeVersion:boot.scopeVersion,baseVersion:boot.program.version,salaryVersion:boot.salaryCatalog.version,proposalId:null,proposalSha256:null,program,reason,reviewConfirmed:false});
}
export function decideProgramWorkspace(bootstrap,proposalId,command,reason,reviewConfirmed){
 const boot=ownProgramBootstrap(bootstrap),proposal=boot.proposals.find(p=>p.id===proposalId);
 require(['approve','reject'].includes(command)&&proposal?.status==='pending','Seleccioná una propuesta pendiente completa.');
 require(boot.permissions.canReview&&proposal.canReview,'La decisión requiere otra persona habilitada.');
 if(command==='approve')require(proposal.baseVersion===boot.program.version&&proposal.salaryVersion===boot.salaryCatalog.version,'Cambió el programa o el catálogo aprobado. Esta propuesta necesita una revisión nueva.');
 return ownProgramCommand({command,scopeVersion:boot.scopeVersion,baseVersion:proposal.baseVersion,salaryVersion:proposal.salaryVersion,proposalId:proposal.id,proposalSha256:proposal.requestSha256,program:null,reason,reviewConfirmed});
}
export function expressionChildren(node){
 if(['add','subtract','multiply','divide','min','max','compare'].includes(node.op))return ['left','right'];
 if(['round','convert'].includes(node.op))return ['value'];
 if(node.op==='choose')return ['condition','then','else'];return [];
}
export function expressionSize(node){
 let count=0,depth=0;const walk=(n,level)=>{
  require(n&&typeof n==='object'&&(Object.hasOwn(PROGRAM_OPERATIONS,n.op)||Object.hasOwn(conditionOperations,n.op)),'Elegí una operación para la fórmula.');
  require(++count<=256&&level<=32,'La fórmula supera su capacidad. No se recortaron operaciones.');depth=Math.max(depth,level);
  for(const child of expressionChildren(n))walk(n[child],level+1);
 };walk(node,0);return {nodes:count,depth};
}
export function changeExpressionOperation(previous,op){
 require(Object.hasOwn(PROGRAM_OPERATIONS,op)||Object.hasOwn(conditionOperations,op),'La operación no está admitida.');
 const leaf=()=>({op:'literal',unit:'',value:''});
 if(op==='input')return {op,unit:previous?.unit??'',key:previous?.key??''};
 if(op==='match')return{op,key:previous?.key??'',type:previous?.type??(Object.hasOwn(PROGRAM_CONDITION_TYPES,previous?.unit)?previous.unit:''),operator:previous?.operator??'',value:typeof previous?.value==='boolean'||typeof previous?.value==='string'?previous.value:''};
 if(op==='literal')return {op,unit:previous?.unit??'',value:typeof previous?.value==='string'?previous.value:''};
 if(['concept','auxiliary'].includes(op))return {op,code:previous?.code??'',stage:previous?.stage??'exact'};
 if(op==='choose')return {op,condition:previous?.condition??{op:'compare',operator:'',left:leaf(),right:leaf()},then:previous?.then??leaf(),else:previous?.else??leaf()};
 if(op==='round')return {op,value:previous?.value&&typeof previous.value==='object'?previous.value:leaf(),rounding:previous?.rounding??{precision:null,mode:'exact'}};
 if(op==='convert')return {op,value:previous?.value&&typeof previous.value==='object'?previous.value:leaf(),unit:previous?.unit??'',factor:previous?.factor??'',conversionReference:previous?.conversionReference??''};
 return {op,...(op==='compare'?{operator:previous?.operator??''}:{}),left:previous?.left??leaf(),right:previous?.right??leaf()};
}
export function describeProgramExpression(node){
 expressionSize(node);
 const show=n=>{
  if(n.op==='input')return `Entrada ${n.key} (${PROGRAM_UNITS[n.unit]??'unidad pendiente'})`;
  if(n.op==='match')return `Entrada ${n.key} (${PROGRAM_CONDITION_TYPES[n.type]??'tipo pendiente'}), ${PROGRAM_COMPARE[n.operator]??'comparación pendiente'} a ${typeof n.value==='boolean'?(n.value?'Sí':'No'):n.value}`;
  if(n.op==='literal')return `${n.value} (${PROGRAM_UNITS[n.unit]??'unidad pendiente'})`;
  if(['concept','auxiliary'].includes(n.op))return `${n.op==='auxiliary'?'Auxiliar':'Concepto'} ${n.code}, ${n.stage==='exact'?'antes':'después'} del redondeo`;
  if(n.op==='round')return `Redondear [${show(n.value)}] a ${n.rounding.precision} decimales, ${PROGRAM_ROUNDING[n.rounding.mode]}`;
  if(n.op==='convert')return `Convertir [${show(n.value)}] a ${PROGRAM_UNITS[n.unit]}, factor ${n.factor}; respaldo: ${n.conversionReference}`;
  if(n.op==='choose')return `Si [${show(n.condition)}], usar [${show(n.then)}]; en otro caso [${show(n.else)}]`;
  return `${n.op==='compare'?PROGRAM_COMPARE[n.operator]:PROGRAM_OPERATIONS[n.op]} [${show(n.left)}] y [${show(n.right)}]`;
 };return show(node);
}
export const PROGRAM_POLICY_LABELS=Object.freeze({
 cappedDeductionsVersion:'Formato de descuentos con límite',cappedDeductionPolicies:'Pedido, reserva y orden de los descuentos',
 conditionalSourcesVersion:'Formato de las fuentes condicionales',conditionalSourcePolicies:'Cuándo resolver una escala o jornada',
 quantityOnlyInputsVersion:'Formato de entradas sólo de cantidad',quantityOnlyInputPolicies:'Políticas de cantidad y rechazo de importes incompatibles',
 sourceCoverageVersion:'Formato de la cobertura de fuente',sourceCoveragePolicies:'Cobertura de conceptos y exclusiones documentadas',
 familyPayrollFactsVersion:'Datos familiares aprobados',
 familyTariffsVersion:'Formato de las tarifas familiares',familyTariffPolicies:'Tarifas familiares y vigencias',
 rowEmissionVersion:'Formato de la emisión de recibos',rowEmissionPolicies:'Cuándo incluir un concepto en el recibo',
 officialTotalsVersion:'Formato de los totales oficiales',officialTotalsPolicies:'Composición de los totales oficiales',
 quantityPhasesVersion:'Formato de las cantidades',quantityPhases:'Cálculo de cantidades',
 monthlyDeclaredAdjustmentsVersion:'Formato de los importes con mes de origen',monthlyDeclaredAdjustmentPolicies:'Importes declarados y meses de origen',
 monthlyForcedAmountsVersion:'Formato de los importes forzados',monthlyForcedAmountPolicies:'Importes forzados del período',
});
const policyFieldLabels=Object.freeze({
 incompatibleSourceCodes:'Fuentes que impiden este cálculo',priorDeductionCodes:'Descuentos anteriores al tramo',cashBaseReference:'Base de líneas disponibles',officialBaseReference:'Base exacta disponible',consumptionStage:'Etapa que consume el saldo de líneas',officialConsumptionStage:'Etapa que consume el saldo oficial',reserveStage:'Etapa de la reserva',limitPrecision:'Decimales seguros del límite',lineRounding:'Redondeo de la línea',officialDestination:'Total de destino',steps:'Orden efectivo del tramo',orderReference:'Respaldo del orden',availableCode:'Auxiliar del saldo de líneas',officialAvailableCode:'Auxiliar del saldo exacto',reserveCode:'Auxiliar del importe reservado',requestedCode:'Auxiliar del importe solicitado',limitCode:'Auxiliar del límite seguro',method:'Efecto declarado',effectStage:'Etapa del efecto',
 consumerCode:'Concepto que consume la entrada',inputKey:'Entrada condicional',activationInputKey:'Habilitación aprobada',selectorInputKey:'Importe de referencia aprobado',selectorOperator:'Comparación del importe',selectorValue:'Importe comparado',inactivePolicy:'Tratamiento de la rama que no se consume',
 quantityInputKey:'Entrada de cantidad',quantityUnit:'Unidad de cantidad',amountPolicy:'Importe informado',otherChannelPolicy:'Novedades de otro canal',
 inventory:'Inventario íntegro de conceptos',inventorySha256:'Huella del inventario',expectedSourceRows:'Filas esperadas de la fuente',nativeInputs:'Entradas propias adicionales',sourceRowSha256:'Huella de la fila original',evidenceSha256:'Respaldo documental',bindingKeys:'Entradas que usan este código',targetCode:'Auxiliar propio del total',decisionSha256:'Respaldo de la decisión',basis:'Fundamento de la exclusión',sourceActivation:'Activación original',methodCode:'Método de origen',methodRowSha256:'Huella del método original',nonAmountEffects:'Efectos independientes de cantidad y fases',phaseReviewSha256:'Respaldo de la revisión de fases',applicableLiquidationTypes:'Tipos a los que sí aplica',dispatchScope:'Alcance de la exclusión',
 version:'Formato',policyId:'Identificador de la política',supersedes:'Política anterior que reemplaza',policySha256:'Huella de la política anterior',
 agreementCode:'Convenio',conceptCode:'Concepto',code:'Código',period:'Período',validFrom:'Desde',validUntil:'Hasta',liquidationType:'Tipo de liquidación',liquidationTypes:'Tipos de liquidación',
 selection:'Selección de la tarifa',outsideRange:'Si no existe una tarifa aplicable',mappings:'Correspondencias de tarifas',rows:'Tabla de importes',rowsSha256:'Huella de la tabla',
 sourceCode:'Código de origen',typeCode:'Tipo de asignación',regionCode:'Región',upperBound:'Tope inclusivo',amount:'Importe',sourceReference:'Respaldo',ruleReference:'Respaldo de la regla',sourceSha256:'Huella de la fuente',
 conditions:'Condiciones que deben cumplirse',quantityCode:'Cantidad del concepto',unit:'Unidad',operator:'Comparación',value:'Valor',valueDomain:'Valores admitidos',whenFalse:'Si no se cumple',nonzeroAction:'Si el importe no es cero',nonPositiveNet:'Si el neto es cero o negativo',
 totalCodes:'Auxiliares que forman los totales',contributions:'Conceptos incluidos en cada total',employerContribution:'Contribución patronal',remuneration:'Remuneraciones',nonSubject:'No sujetos',familyAllowances:'Asignaciones familiares',deduction:'Descuentos',net:'Neto',
 employer_contribution:'Contribución patronal',non_subject:'No sujetos',family_allowances:'Asignaciones familiares',
 '990':'Contribuciones patronales (990)','993':'Remuneraciones (993)','994':'No sujetos (994)','995':'Asignaciones familiares (995)','996':'Descuentos (996)','888':'Auxiliar de salida (888)','998':'Auxiliar de salida (998)','999':'Auxiliar de salida (999)',
 stage:'Etapa',rounding:'Tratamiento de precisión',precision:'Decimales',mode:'Criterio',expression:'Fórmula de la cantidad',amountUse:'Uso en el importe',periodTreatment:'Tratamiento del período',kind:'Tratamiento',reference:'Respaldo',
 sourceContracts:'Canales aprobados',adjustmentMonthPolicy:'Mes que se ajusta',evidencePolicy:'Constancia del importe',forcedPolicy:'Tratamiento de importes forzados',fixedPolicy:'Tratamiento de novedades fijas',monetaryRecognition:'Mes de reconocimiento económico',absencePolicy:'Tratamiento de ausencia',
 sourceContract:'Formato de la fuente',sourceKind:'Origen',amountInputKey:'Entrada del importe',presenceInputKey:'Entrada de presencia',treatment:'Tratamiento del importe',quantityPolicy:'Tratamiento de la cantidad',
 op:'Operación',left:'Primer valor',right:'Segundo valor',condition:'Condición',then:'Si se cumple',else:'Si no se cumple',key:'Entrada',factor:'Factor',conversionReference:'Respaldo de la conversión',
});
const policyValues=Object.freeze({
 capped:'Descuento limitado',existing_deduction:'Descuento existente conservado',27:'Conservar lo no aplicado por concepto',29:'Conservar el importe aplicado, incluso cero',
 null_with_reason:'Conservar sin informar y registrar el motivo',
 rule:'Regla pagable',input:'Entrada de otra regla',total:'Total propio',excluded_total:'Total excluido por decisión documentada',excluded:'Concepto excluido con guarda de novedades',event_activation_only:'Se activa únicamente con una novedad',source_dispatch_disabled:'Ejecución inhibida en la fuente revisada',outside_liquidation_type:'No corresponde a este tipo de liquidación',documented_retirement:'Retiro por decisión documentada',whole_definition:'Toda la definición, incluidas cantidades y fases',
 ...PROGRAM_UNITS,...PROGRAM_ROUNDING,...PROGRAM_COMPARE,...PROGRAM_SOURCES,...PROGRAM_OPERATIONS,
 monthly:'Mensual',annual_bonus:'Sueldo anual complementario',final_settlement:'Liquidación final',
 first_upper_bound_inclusive:'Primer tope que incluye el valor',error:'Detener y revisar',omit_receipt_row:'Omitir la fila del recibo',
 declared_amount_passthrough:'Usar el importe aprobado sin recalcularlo',explicit_zero:'Cantidad cero declarada',independent:'Cantidad independiente del importe',
 absent_or_current_month:'Sin ajuste o mes corriente explícito',explicit_prior_month:'Exigir un mes anterior al liquidado',explicit_not_future_month:'Exigir el mes liquidado o uno anterior',nonempty_legal_instrument:'Exigir una constancia identificable',absent_or_zero:'Cantidad sin informar o cero explícito',current_payroll_no_historical_recalculation:'Registrar en el mes liquidado y conservar el mes de origen',zero_only_after_existing_complete_capture:'Cero sólo ante ausencia en una captura completa aprobada',
 none:'Sin prorrateo',fraction:'Fracción documentada',rounded:'Después del redondeo',reject:'Rechazar',nonnegative:'Cero o positivo',nonnegative_integer:'Entero cero o positivo',
});
const policyEnumFields=new Set(['method','effectStage','consumptionStage','officialConsumptionStage','reserveStage','selectorOperator','inactivePolicy','amountPolicy','otherChannelPolicy','quantityUnit','adjustmentMonthPolicy','evidencePolicy','forcedPolicy','fixedPolicy','monetaryRecognition','absencePolicy','unit','operator','liquidationType','liquidationTypes','applicableLiquidationTypes','dispatchScope','selection','outsideRange','whenFalse','nonzeroAction','nonPositiveNet','valueDomain','stage','mode','kind','treatment','quantityPolicy','sourceKind','op']);
export const programPolicyLabel=key=>PROGRAM_POLICY_LABELS[key]??policyFieldLabels[key]??key;
// The values come from ownProgramStructure. Render every field, including source
// evidence and empty/null values, as text; decimal strings never pass through Number.
export function describeProgramPolicy(field,value){
 const scalar=(key,v)=>v===null?(key==='validUntil'?'Sin término':key==='supersedes'?'No reemplaza otra política':'Sin declarar'):typeof v==='boolean'?(v?'Sí':'No'):key==='amountPolicy'&&v==='absent_or_zero'?'Importe sin informar o cero explícito':key==='nonAmountEffects'&&v==='none'?'Sin efectos independientes':key==='stage'&&v==='exact'?'Antes del redondeo':policyEnumFields.has(key)?policyValues[v]??String(v):String(v);
 function lines(key,v,depth){
  if(v===null||typeof v!=='object')return[scalar(key,v)];
  if(Array.isArray(v)){
   if(v.length===0)return['Sin elementos'];
   if(v.every(item=>item===null||typeof item!=='object'))return[v.map(item=>scalar(key,item)).join(', ')];
   return v.flatMap((item,i)=>{const content=lines(key,item,depth+1);return[`${i+1}. ${content[0]}`,...content.slice(1).map(line=>'   '+line)];});
  }
  return Object.entries(v).flatMap(([name,item])=>{const content=lines(name,item,depth+1);return[`${programPolicyLabel(name)}: ${content[0]}`,...content.slice(1).map(line=>'  '+line)];});
 }
 if(field==='sourceCoveragePolicies'&&Array.isArray(value)){
  const summaries=value.map(p=>{const counts={};for(const r of p.inventory)counts[r.kind]=(counts[r.kind]??0)+1;return `Convenio ${p.agreementCode}, ${p.validFrom} a ${p.validUntil??'sin término'}: ${p.inventory.length} filas de origen; ${Object.entries(counts).map(([kind,count])=>`${policyValues[kind]??kind}: ${count}`).join('; ')}; entradas propias adicionales: ${p.nativeInputs.length}.`;});
  return [...summaries,'',...lines(field,value,0)].join('\n');
 }
 return value===null?'Sin declarar':lines(field,value,0).join('\n');
}
// These fields already have their own complete comparison below. Everything
// else in the validated program must be counted and displayed too, including
// future versioned policy fields; otherwise a policy-only update looks unchanged.
const separatelyComparedProgramFields=new Set(['rules','bindings','totalsPrecision','namespaceVersion','noveltyPresenceVersion','periodContextVersion','agreementWorkingTimeVersion','salaryConditionsVersion','workingTimeVersion','employmentFactsVersion','periodParticipation']);
export function programWorkspaceChanges(before,after){
 const next=ownProgramStructure(after),prior=before?ownProgramStructure(before):{rules:[],bindings:[],totalsPrecision:null},rows=[];
 for(const [kind,key] of [['rules',r=>ownProgramRuleKey(r,next.namespaceVersion)],['bindings',b=>b.agreementCode+':'+b.key]]){
  const old=new Map(prior[kind].map(v=>[key(v),v])),fresh=new Map(next[kind].map(v=>[key(v),v]));
  for(const id of new Set([...old.keys(),...fresh.keys()])){const a=old.get(id)??null,b=fresh.get(id)??null;rows.push({kind,key:id,before:a,after:b,status:!a?'added':!b?'removed':salarySerialized(a)===salarySerialized(b)?'unchanged':'modified'});}
 }
 if(next.periodParticipation||prior.periodParticipation) {
  const old=new Map((prior.periodParticipation?.treatments??[]).map(t=>[t.ruleKey,t])),fresh=new Map((next.periodParticipation?.treatments??[]).map(t=>[t.ruleKey,t]));
  for(const id of new Set([...old.keys(),...fresh.keys()])){const a=old.get(id)??null,b=fresh.get(id)??null;rows.push({kind:'participation',key:id,before:a,after:b,status:!a?'added':!b?'removed':salarySerialized(a)===salarySerialized(b)?'unchanged':'modified'});}
 }
 for(const key of new Set([...Object.keys(prior),...Object.keys(next)])){
  if(separatelyComparedProgramFields.has(key))continue;
  const a=Object.hasOwn(prior,key)?prior[key]:null,b=Object.hasOwn(next,key)?next[key]:null;
  rows.push({kind:'policies',key,before:a,after:b,status:!Object.hasOwn(prior,key)?'added':!Object.hasOwn(next,key)?'removed':salarySerialized(a)===salarySerialized(b)?'unchanged':'modified'});
 }
 return {...(next.noveltyPresenceVersion||prior.noveltyPresenceVersion?{noveltyPresenceVersion:{before:prior.noveltyPresenceVersion??null,after:next.noveltyPresenceVersion??null}}:{}),...(next.periodContextVersion||prior.periodContextVersion?{periodContextVersion:{before:prior.periodContextVersion??null,after:next.periodContextVersion??null}}:{}),...(next.agreementWorkingTimeVersion||prior.agreementWorkingTimeVersion?{agreementWorkingTimeVersion:{before:prior.agreementWorkingTimeVersion??null,after:next.agreementWorkingTimeVersion??null}}:{}),...(next.salaryConditionsVersion||prior.salaryConditionsVersion?{salaryConditionsVersion:{before:prior.salaryConditionsVersion??null,after:next.salaryConditionsVersion??null}}:{}),...(next.workingTimeVersion||prior.workingTimeVersion?{workingTimeVersion:{before:prior.workingTimeVersion??null,after:next.workingTimeVersion??null}}:{}),...(next.periodParticipation||prior.periodParticipation?{periodParticipation:{before:prior.periodParticipation??null,after:next.periodParticipation??null}}:{}),rows,totalsPrecision:{before:prior.totalsPrecision,after:next.totalsPrecision},namespaceVersion:{before:prior.namespaceVersion??null,after:next.namespaceVersion??null},...(next.employmentFactsVersion||prior.employmentFactsVersion?{employmentFactsVersion:{before:prior.employmentFactsVersion??null,after:next.employmentFactsVersion??null}}:{}),changed:(prior.noveltyPresenceVersion!==next.noveltyPresenceVersion?1:0)+(prior.periodContextVersion!==next.periodContextVersion?1:0)+(prior.agreementWorkingTimeVersion!==next.agreementWorkingTimeVersion?1:0)+(prior.salaryConditionsVersion!==next.salaryConditionsVersion?1:0)+(prior.workingTimeVersion!==next.workingTimeVersion?1:0)+(salarySerialized(prior.periodParticipation??null)!==salarySerialized(next.periodParticipation??null)?1:0)+(prior.employmentFactsVersion!==next.employmentFactsVersion?1:0)+rows.filter(r=>r.status!=='unchanged').length+(prior.totalsPrecision!==next.totalsPrecision?1:0)+(prior.namespaceVersion!==next.namespaceVersion?1:0)};
}
