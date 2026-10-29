// PROPOSED by Claude (R3; source only; never imported or run by Claude). Target: assets/own-payroll-zero-difference.js
// Pure "zero differences" check over ONE captured own-payroll result (own-payroll-result.v1/v2) and its normalized
// input. Three separate questions, never mixed:
//  1. ARITHMETIC: every per-contract total recomputed from the conserved concept rows with exact arithmetic equals the
//     saved employeeTotals; aggregate and per-group sums derive from the same rows. States: reconciled | difference |
//     incomplete. Absence is coverage, never zero and never a quantified difference.
//  2. LINE SCALE (observation only): money rows summed into totals whose scale is finer than totalsPrecision. They are
//     conserved and printed as they are (receipt-model/receipt-pdf keep the original scale); this is not an infraction.
//  3. INSTRUMENT (only when the caller provides the instrument's own rule): compatibility of the amount the instrument
//     actually consumes (net per contract, as own-bank-output-model.js does). No precision is assumed here.
// Pins are proven either by the caller's hasher (generator protocol, as own-payroll-monetary-policy.js) or, in the
// run panel, by verifiedWorkspaceCapture + ownRunWorkspaceResult that already ran on the same capture (sync variant).
import {decimal,rational,exactAdd,exactSubtract,exactCompare,quantize,roundingPolicy,payrollRequire as require} from './own-payroll-exact.js';
import {salarySerialized} from './native-salary-catalog-model.js';

export const OWN_ZERO_DIFFERENCE_VERSION='own-payroll-zero-difference.v3';
export const OWN_ZERO_DIFFERENCE_STATES=Object.freeze({reconciled:'Conciliado',difference:'Diferencia',incomplete:'Incompleto'});
export const OWN_ZERO_DIFFERENCE_ACTIONS=Object.freeze({
 reconciled:'Sin diferencias entre conceptos y totales de esta captura. Cada documento debe tomar estos mismos importes; no certifica el padrón municipal ni aceptaciones de terceros.',
 difference:'Revisá el legajo y el total indicados: el total guardado no coincide con sus conceptos. Recalculá la corrida; no se corrige a mano.',
 incomplete:'Faltan conceptos o legajos en el resultado guardado; no se supone cero ni se muestran sumas parciales. Recalculá la corrida completa antes de cerrar o exportar.',
});
const RESULT_VERSIONS=['own-payroll-result.v1','own-payroll-result.v2'];
const TOTAL_KEYS=['remuneration','non_remuneration','deduction','employer_contribution','gross','net'];
const NATURES=['remuneration','non_remuneration','deduction','employer_contribution'];
// Operator labels: the same words the run panel's tables use. Keys never reach the operator.
export const OWN_ZERO_DIFFERENCE_TOTAL_LABELS=Object.freeze({remuneration:'Remunerativo',non_remuneration:'No remunerativo',deduction:'Retenciones',employer_contribution:'Aportes patronales',gross:'Bruto',net:'Neto calculado'});
const NATURE_LABELS=Object.freeze({remuneration:'Remunerativo',non_remuneration:'No remunerativo',deduction:'Retención',employer_contribution:'Aporte patronal',auxiliary:'Auxiliar'});
const LINE_SCALE_LIMIT=50;
const HASH=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const DECIMAL=/^-?(?:0|[1-9]\d*)(?:\.\d{1,8})?$/;
const fail=(code,message)=>require(false,code,message);
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const emptyTotals=()=>Object.fromEntries(TOTAL_KEYS.map(k=>[k,rational(0n)]));
function closeTotals(t){t.gross=exactAdd(t.remuneration,t.non_remuneration);t.net=exactSubtract(t.gross,t.deduction);return t;}
// Scale of a saved decimal literal (digits after the point), never a rounding.
const scaleOf=amount=>{const i=amount.indexOf('.');return i<0?0:amount.length-i-1;};
// Exact text at the totals precision; a value that would need rounding is reported as evidence, never rounded.
function text(value,precision){try{return quantize(value,{precision,mode:'exact'}).amount;}catch(error){if(error?.code==='ROUNDING_NEEDED')return {numerator:value.n.toString(),denominator:value.d.toString()};throw error;}}
// Presentation of a saved decimal literal in es-AR, as formatOwnRunDecimal does; evidence objects are named, never rounded.
export function ownZeroDifferenceMoney(value){
 if(typeof value!=='string'||!DECIMAL.test(value))return 'no representable';
 const negative=value.startsWith('-'),[integer,fraction]=value.replace(/^-/,'').split('.');
 return '$ '+(negative?'-':'')+BigInt(integer).toLocaleString('es-AR')+(fraction===undefined?'':','+fraction);
}
// The same literal validation ownRunWorkspaceResult applies (formatOwnRunDecimal); what it rejects is rejected here.
const literal=(value,code,message)=>{require(typeof value==='string'&&DECIMAL.test(value),code,message);return decimal(value);};

/** Optional instrument rule supplied by the caller (e.g. {name:'bank', consumes:'net', representable:v=>bankOutputCents(v)!==null}). */
export function ownZeroDifferenceInstrument(raw){
 if(raw===undefined||raw===null)return null;
 require(raw&&typeof raw==='object'&&Object.keys(raw).sort().join('|')==='consumes|name|representable'&&typeof raw.name==='string'&&raw.name.length>=1&&raw.name.length<=40&&raw.consumes==='net'&&typeof raw.representable==='function',
  'OWN_ZERO_DIFFERENCE_INSTRUMENT_INVALID','El instrumento de pago se declara con su propia regla sobre el neto; no se supone una precisión.');
 return {name:raw.name,consumes:'net',representable:raw.representable};
}

function* pinSteps(input,result,pins){
 require(pins&&typeof pins==='object'&&Object.keys(pins).sort().join('|')==='inputSha256|resultSha256'&&HASH(pins.inputSha256)&&HASH(pins.resultSha256),'OWN_ZERO_DIFFERENCE_PINS_INVALID','Faltan los hashes guardados de la captura.');
 const resultSha256=yield salarySerialized(result);
 require(HASH(resultSha256)&&resultSha256===pins.resultSha256,'OWN_ZERO_DIFFERENCE_CAPTURE_CHANGED','El resultado no coincide con su hash guardado. Consultá el mismo intento; no se concilia un resultado alterado.');
 const inputSha256=yield salarySerialized(input);
 require(HASH(inputSha256)&&inputSha256===pins.inputSha256,'OWN_ZERO_DIFFERENCE_CAPTURE_CHANGED','La entrada no coincide con su hash guardado. Consultá el mismo intento; no se concilia una entrada alterada.');
 return {inputSha256,resultSha256,verifiedBy:'generator'};
}
const ruleKey=(namespaced,nature,code)=>(namespaced?(nature==='auxiliary'?'auxiliary:':'concept:'):'')+code;
const active=(input,rule)=>rule.validFrom<=input.period&&(rule.validUntil===null||rule.validUntil>=input.period)&&rule.liquidationTypes.includes(input.liquidationType);
function activeRule(input,row,namespaced){return input.rules.find(rule=>rule.code===row.conceptCode&&(!namespaced||(rule.nature==='auxiliary')===(row.nature==='auxiliary'))&&rule.agreementCode===row.agreementCode&&active(input,rule));}
function activeRules(input,employee){return input.rules.filter(rule=>rule.agreementCode===employee.agreementCode&&active(input,rule));}

function evaluate(input,result,pins,instrument){
 require(input&&typeof input==='object'&&result&&typeof result==='object','OWN_ZERO_DIFFERENCE_INPUT','Faltan la entrada y el resultado guardados.');
 require(RESULT_VERSIONS.includes(result.version),'OWN_ZERO_DIFFERENCE_VERSION','La versión del resultado no es la conservada por el motor.');
 const namespaced=input.version==='own-payroll-input.v2';
 require((result.version==='own-payroll-result.v2')===namespaced,'OWN_ZERO_DIFFERENCE_VERSION','La versión del resultado no corresponde a la de su entrada.');
 require(result.payrollCalculated===true&&result.payrollPosted===false&&result.period===input.period&&result.liquidationType===input.liquidationType&&salarySerialized(result.selection)===salarySerialized(input.selection),
  'OWN_ZERO_DIFFERENCE_SCOPE','El resultado no corresponde al período, tipo y alcance de su entrada.');
 require(Number.isInteger(input.totalsPrecision)&&input.totalsPrecision>=0&&input.totalsPrecision<=8,'OWN_ZERO_DIFFERENCE_PRECISION','La precisión aprobada de totales no está declarada.');
 require(Array.isArray(result.rows)&&Array.isArray(result.employeeTotals)&&Array.isArray(input.employees)&&Array.isArray(input.rules),'OWN_ZERO_DIFFERENCE_INPUT','El resultado no contiene filas y totales completos.');
 const precision=input.totalsPrecision,findings=[];
 const finding=(severity,stage,detail)=>findings.push(freeze({severity,stage,...detail}));
 // Expected contracts come from the saved input and its saved selection, never from the result and never from an
 // external roster: "complete" below means complete for the SAVED scope, not for the municipal population.
 const sel=input.selection,expected=input.employees.filter(e=>sel.kind==='all'||sel.values.includes(sel.kind==='contracts'?e.contractId:sel.kind==='agreements'?e.agreementCode:e.departmentCode));
 const expectedIds=new Map(expected.map(e=>[e.contractId,e]));
 require(expectedIds.size===expected.length,'OWN_ZERO_DIFFERENCE_SCOPE','La entrada repite legajos.');
 if(result.rowCount!==result.rows.length||result.employeeCount!==result.employeeTotals.length)finding('incomplete','run',{issue:'partial_output',declaredRows:result.rowCount,rows:result.rows.length,declaredContracts:result.employeeCount,contracts:result.employeeTotals.length});
 const declared=new Map();
 for(const t of result.employeeTotals){
  require(t&&typeof t==='object'&&expectedIds.has(t.contractId)&&!declared.has(t.contractId),'OWN_ZERO_DIFFERENCE_SCOPE','El resultado contiene legajos repetidos o ajenos al alcance.');
  const totals={};for(const key of TOTAL_KEYS)totals[key]=literal(t[key],'OWN_ZERO_DIFFERENCE_TOTAL_INVALID','Un total guardado no es un importe decimal exacto; la captura no es válida.');
  declared.set(t.contractId,{saved:t,totals});
 }
 const byContract=new Map();
 for(const row of result.rows){
  const employee=expectedIds.get(row?.contractId);
  require(employee&&row.employeeNumber===employee.employeeNumber&&row.agreementCode===employee.agreementCode&&row.departmentCode===employee.departmentCode,'OWN_ZERO_DIFFERENCE_SCOPE','Hay un concepto de un legajo ajeno al alcance o con datos distintos de la entrada.');
  const rule=activeRule(input,row,namespaced);
  require(rule&&row.nature===rule.nature&&row.unit===rule.unit&&row.ruleReference===rule.ruleReference&&salarySerialized(roundingPolicy(row.rounding))===salarySerialized(roundingPolicy(rule.rounding)),
   'OWN_ZERO_DIFFERENCE_RULE_CHANGED','Hay un concepto sin regla vigente igual en la entrada guardada (código, naturaleza, unidad, redondeo o referencia distintos).');
  // Every row, auxiliary included, must carry a valid literal: what upstream rejects is not a valid capture here.
  const value=literal(row.amount,'OWN_ZERO_DIFFERENCE_AMOUNT_INVALID','Un concepto guardado no tiene un importe decimal exacto; la captura no es válida.');
  const list=byContract.get(row.contractId)??new Map(),key=ruleKey(namespaced,row.nature,row.conceptCode);
  require(!list.has(key),'OWN_ZERO_DIFFERENCE_SCOPE','El resultado repite un concepto para el mismo legajo.');
  list.set(key,{row,value});byContract.set(row.contractId,list);
 }
 const groups={agreement:new Map(),department:new Map()},contracts=[],lineScale=new Map(),lineScaleOmitted=new Set(),instrumentIncompatible=[];
 let rowsExpected=0,rowsPresent=0,contractsIncomplete=0,contractsCompared=0,differences=0,finerThanTotals=0;
 const aggregateSaved=emptyTotals(),aggregateComputed=emptyTotals();
 for(const [contractId,employee] of expectedIds){
  const rows=byContract.get(contractId)??new Map(),declaredTotals=declared.get(contractId);
  let complete=true;
  for(const rule of activeRules(input,employee)){
   rowsExpected++;const key=ruleKey(namespaced,rule.nature,rule.code);
   if(rows.has(key))rowsPresent++;else{complete=false;finding('incomplete','rule_result',{contractId,employeeNumber:employee.employeeNumber,conceptCode:rule.code,nature:rule.nature,issue:'missing_amount'});}
  }
  if(!declaredTotals){complete=false;finding('incomplete','contract_total',{contractId,employeeNumber:employee.employeeNumber,issue:'missing_contract'});}
  const own=[['agreement',employee.agreementCode],['department',employee.departmentCode]].map(([dimension,code])=>{
   const g=groups[dimension].get(code)??{code,contracts:0,complete:true,totals:emptyTotals()};g.contracts++;if(!complete)g.complete=false;groups[dimension].set(code,g);return g;
  });
  if(!complete){contractsIncomplete++;contracts.push({contractId,employeeNumber:employee.employeeNumber,agreementCode:employee.agreementCode,departmentCode:employee.departmentCode,state:'incomplete'});continue;}
  const sums=emptyTotals();
  for(const {row,value} of rows.values()){
   if(row.nature==='auxiliary')continue;
   if(row.unit==='money'&&scaleOf(row.amount)>precision){
    finerThanTotals++;const k=employee.agreementCode+':'+ruleKey(namespaced,row.nature,row.conceptCode);
    // Distinct rules are listed up to the limit; the rest are counted once per distinct rule, never per occurrence.
    if(!lineScale.has(k)&&!lineScaleOmitted.has(k)){if(lineScale.size<LINE_SCALE_LIMIT)lineScale.set(k,{conceptCode:row.conceptCode,agreementCode:employee.agreementCode,nature:row.nature,declaredPrecision:row.rounding.precision,totalsPrecision:precision});else lineScaleOmitted.add(k);}
   }
   if(NATURES.includes(row.nature))sums[row.nature]=exactAdd(sums[row.nature],value);
  }
  closeTotals(sums);contractsCompared++;
  let state='reconciled';
  for(const key of TOTAL_KEYS){
   const saved=declaredTotals.totals[key];
   if(exactCompare(saved,sums[key])!==0){differences++;state='difference';finding('difference','contract_total',{contractId,employeeNumber:employee.employeeNumber,key,saved:declaredTotals.saved[key],computed:text(sums[key],precision),difference:text(exactSubtract(saved,sums[key]),precision)});}
   // Arithmetic equality is not close aptitude: ownCloseSavedTotals requires the saved literal to be exactly the
   // totalsPrecision text (own-payroll-close-model.js:24). A literal such as 128.630 is equal and still rejected there.
   else if(declaredTotals.saved[key]!==text(sums[key],precision)){differences++;state='difference';finding('difference','contract_total',{contractId,employeeNumber:employee.employeeNumber,key,issue:'total_scale',saved:declaredTotals.saved[key],expected:text(sums[key],precision),closeGuard:'own-payroll-close-model.js ownCloseSavedTotals'});}
   aggregateSaved[key]=exactAdd(aggregateSaved[key],saved);aggregateComputed[key]=exactAdd(aggregateComputed[key],sums[key]);
   for(const g of own)g.totals[key]=exactAdd(g.totals[key],sums[key]);
  }
  if(instrument&&instrument.representable(declaredTotals.saved.net)!==true)instrumentIncompatible.push(contractId);
  if(state!=='reconciled')contracts.push({contractId,employeeNumber:employee.employeeNumber,agreementCode:employee.agreementCode,departmentCode:employee.departmentCode,state});
 }
 const runIncomplete=findings.some(f=>f.stage==='run'),coverageComplete=contractsIncomplete===0&&!runIncomplete;
 if(coverageComplete)for(const key of TOTAL_KEYS)for(const dimension of ['agreement','department']){
  let sum=rational(0n);for(const g of groups[dimension].values())sum=exactAdd(sum,g.totals[key]);
  require(exactCompare(sum,aggregateComputed[key])===0,'OWN_ZERO_DIFFERENCE_INTERNAL','La suma por grupos no coincide con el agregado recalculado.');
 }
 const state=!coverageComplete?'incomplete':differences>0?'difference':'reconciled';
 const totalsText=t=>Object.fromEntries(TOTAL_KEYS.map(k=>[k,text(t[k],precision)]));
 const groupRows=dimension=>[...groups[dimension].values()].sort((a,b)=>a.code<b.code?-1:a.code>b.code?1:0).map(g=>({code:g.code,contracts:g.contracts,complete:g.complete&&!runIncomplete,totals:g.complete&&!runIncomplete?totalsText(g.totals):null}));
 return freeze({
  version:OWN_ZERO_DIFFERENCE_VERSION,state,label:OWN_ZERO_DIFFERENCE_STATES[state],nextAction:OWN_ZERO_DIFFERENCE_ACTIONS[state],
  period:input.period,liquidationType:input.liquidationType,resultVersion:result.version,
  pins:{inputSha256:pins.inputSha256,resultSha256:pins.resultSha256,verifiedBy:pins.verifiedBy},
  scope:{kind:sel.kind,values:[...sel.values],savedScope:sel.kind==='all'?'all':'filtered',populationCertified:false},
  coverage:{complete:coverageComplete,contracts:{expected:expected.length,present:declared.size,incomplete:contractsIncomplete},rows:{expected:rowsExpected,present:rowsPresent}},
  precision:{totals:precision},
  arithmetic:{contractsCompared,differences},
  // Derived sums exist only over a complete coverage; a partial sum is never shown as if it were the run.
  aggregate:coverageComplete?{saved:totalsText(aggregateSaved),computed:totalsText(aggregateComputed)}:null,
  groups:{agreement:groupRows('agreement'),department:groupRows('department')},
  lineScale:{finerThanTotals,rules:[...lineScale.values()],rulesOmitted:lineScaleOmitted.size,policyInfringed:false,
   note:'Las líneas se conservan e imprimen con su escala original; la precisión aprobada rige los totales. No se redondea.'},
  instrument:instrument?{name:instrument.name,consumes:'net',contractsChecked:contractsCompared,incompatible:[...instrumentIncompatible],incompatibleEmployeeNumbers:instrumentIncompatible.map(id=>expectedIds.get(id).employeeNumber),compatible:coverageComplete&&instrumentIncompatible.length===0}:null,
  contracts,findings,
  counts:{rows:result.rows.length,contracts:expected.length,findings:findings.length,contractsWithFindings:contracts.length},
  closeAptitude:{claimed:false,guard:'own-payroll-close-model.js ownCloseSavedTotals (conservado; no se reemplaza)'},
  payrollCalculated:true,payrollPosted:false,municipalApprovalVerified:false,paymentExecuted:false,
 });
}

function* checkSteps(captured,instrument){const proven=yield* pinSteps(captured.input,captured.result,captured.pins);return evaluate(captured.input,captured.result,proven,instrument);}
/** Independent verification: capture is cloned synchronously here, before the generator is returned. */
export function beginOwnZeroDifferenceCheck({input,result,pins,instrument}={}){
 const captured={input:structuredClone(input),result:structuredClone(result),pins:structuredClone(pins)},declared=ownZeroDifferenceInstrument(instrument);
 return checkSteps(captured,declared);
}
export async function ownZeroDifferenceCheck(options){
 const steps=beginOwnZeroDifferenceCheck(options);let current=steps.next();
 while(!current.done){const bytes=new TextEncoder().encode(current.value),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');current=steps.next(hash);}
 return current.value;
}
/**
 * Run-panel variant, synchronous: ONLY after verifiedWorkspaceCapture(value) and ownRunWorkspaceResult(value) ran on
 * the same capture (they recomputed both hashes and validated the structure). The pins are recorded as verified by
 * the caller; nothing is awaited, so the panel's valid() sequencing is untouched.
 */
export function ownZeroDifferenceOfVerified({input,result,inputSha256,resultSha256,instrument}={}){
 require(HASH(inputSha256)&&HASH(resultSha256),'OWN_ZERO_DIFFERENCE_PINS_INVALID','Faltan los hashes guardados de la captura verificada.');
 return evaluate(structuredClone(input),structuredClone(result),{inputSha256,resultSha256,verifiedBy:'caller'},ownZeroDifferenceInstrument(instrument));
}

/** Short Spanish lines for the run workspace: legajo numbers and the panel's own labels, never keys or UUIDs. */
export function ownZeroDifferenceLines(check,limit=12){
 require(check&&check.version===OWN_ZERO_DIFFERENCE_VERSION,'OWN_ZERO_DIFFERENCE_INPUT','Falta la comprobación.');
 const money=ownZeroDifferenceMoney,label=key=>OWN_ZERO_DIFFERENCE_TOTAL_LABELS[key]??key;
 const scope=check.scope.savedScope==='all'?'alcance guardado: todos':'alcance guardado filtrado';
 const lines=[check.state==='reconciled'
  ?check.label+' · '+check.counts.contracts+' legajos, '+check.counts.rows+' conceptos · captura completa del '+scope+' · hash verificado'
  :check.label+' · '+check.counts.findings+' hallazgos · cobertura '+(check.coverage.contracts.expected-check.coverage.contracts.incomplete)+' de '+check.coverage.contracts.expected+' legajos completos · '+scope];
 for(const f of check.findings.slice(0,limit)){
  if(f.stage==='run'){lines.push('Corrida: conteos declarados distintos de las filas guardadas ('+f.declaredRows+' vs '+f.rows+' conceptos, '+f.declaredContracts+' vs '+f.contracts+' legajos); no se supone cero.');continue;}
  const who='Legajo '+f.employeeNumber;
  if(f.issue==='missing_contract')lines.push(who+': sin totales guardados; no se supone cero.');
  else if(f.issue==='missing_amount')lines.push(who+' · concepto '+f.conceptCode+' ('+(NATURE_LABELS[f.nature]??f.nature)+'): importe ausente, no se supone cero.');
  else if(f.issue==='total_scale')lines.push(who+' · '+label(f.key)+': el total guardado '+f.saved+' no está escrito en la precisión aprobada de totales ('+check.precision.totals+'); el cierre existente lo rechaza. Esperado '+money(f.expected)+'.');
  else lines.push(who+' · '+label(f.key)+': guardado '+money(f.saved)+' vs conceptos '+money(f.computed)+' (diferencia '+money(f.difference)+').');
 }
 if(check.findings.length>limit)lines.push('… y '+(check.findings.length-limit)+' hallazgos más en el detalle completo.');
 if(check.lineScale.finerThanTotals>0)lines.push('Observación: '+check.lineScale.finerThanTotals+' líneas de dinero con escala mayor que la precisión de totales ('+check.precision.totals+'); se conservan e imprimen tal cual, no se redondean.');
 if(check.instrument){
  const n=check.instrument.incompatibleEmployeeNumbers,shown=n.slice(0,10).join(', ')+(n.length>10?' … y '+(n.length-10)+' más':'');
  lines.push(n.length===0&&check.instrument.compatible?'Instrumento '+check.instrument.name+': el neto de cada legajo es representable según su propia regla.':'Instrumento '+check.instrument.name+': neto no representable según su propia regla en '+n.length+' legajos ('+shown+'); revisá antes de emitir.');
 }else lines.push('Compatibilidad con el instrumento de pago: se comprueba en la emisión bancaria sobre el neto; esta captura no la supone.');
 lines.push(check.nextAction);
 return lines;
}
