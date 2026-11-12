// REVIEW CANDIDATE ONLY. Not enabled by a deployed programme or SQL contract.
// This accepts a declared monthly amount already used by an unchanged rule.
// It does not override a computed amount and does not reuse fixed novelties.
import {salaryExact,salarySerialized,salaryHash} from './native-salary-catalog-model.js';
import {payrollRequire as require} from './own-payroll-exact.js';
import {participationRules} from './own-period-participation-program.js';
import {ownNoveltyBatch} from './own-payroll-novelties-model.js';

export const OWN_MONTHLY_FORCED_AMOUNT_VERSION='own-monthly-forced-passthrough.v1';
const fields=['monthlyForcedAmountsVersion','monthlyForcedAmountPolicies'];
const policyFields=['agreementCode','period','liquidationType','sourceContract','sourceKind','sourceCode','amountInputKey','presenceInputKey','treatment','quantityPolicy','sourceSha256','ruleReference'];
const code=v=>typeof v==='string'&&/^[0-9]{1,9}$/.test(v);
const key=v=>typeof v==='string'&&/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(v);
const reference=v=>typeof v==='string'&&v===v.trim()&&v===v.normalize('NFC')&&v.length>=3&&v.length<=180&&!/[<>\u0000-\u001f\u007f]/.test(v);
const same=(a,b)=>salarySerialized(a)===salarySerialized(b);
const pkey=p=>[p.agreementCode,p.period,p.liquidationType,p.sourceCode].join(':');
const active=(r,p)=>r.agreementCode===p.agreementCode&&r.validFrom<=p.period&&(r.validUntil===null||r.validUntil>=p.period)&&r.liquidationTypes.includes(p.liquidationType);
const hasReference=(node,code)=>node&&typeof node==='object'&&((node.op==='quantity_phase'&&node.code===code)||Object.values(node).some(v=>v&&typeof v==='object'&&hasReference(v,code)));
const present=p=>fields.some(k=>Object.hasOwn(p??{},k));
export const monthlyForcedProgramFields=p=>present(p)?[...fields]:[];

export function monthlyForcedExpectedExpression(policy){
 return {op:'choose',condition:{op:'compare',operator:'eq',left:{op:'input',key:policy.presenceInputKey,unit:'coefficient'},right:{op:'literal',unit:'coefficient',value:'1'}},then:{op:'input',key:policy.amountInputKey,unit:'money'},else:{op:'literal',unit:'money',value:'0'}};
}
export function normalizeMonthlyForcedProgram(program){
 if(!present(program))return {};
 require(program.monthlyForcedAmountsVersion===OWN_MONTHLY_FORCED_AMOUNT_VERSION&&program.namespaceVersion==='own-payroll-namespaces.v2'&&program.noveltyPresenceVersion==='own-payroll-novelty-presence.v1','MONTHLY_FORCED_POLICY_INVALID','El importe mensual forzado requiere su contrato y presencia explícitos.');
 const policies=program.monthlyForcedAmountPolicies;
 require(Array.isArray(policies)&&policies.length>0&&policies.length<=128&&Reflect.ownKeys(policies).length===policies.length+1,'MONTHLY_FORCED_POLICY_INVALID','Revisá el conjunto completo de políticas mensuales.');
 const effective=participationRules(program),seen=new Set();
 const normalized=policies.map(p=>{
  require(salaryExact(p,policyFields)&&code(p.agreementCode)&&typeof p.period==='string'&&/^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(p.period)&&p.liquidationType==='monthly'&&p.sourceContract==='own-payroll-novelty-batch.v1'&&p.sourceKind==='monthly_amount'&&code(p.sourceCode)&&key(p.amountInputKey)&&key(p.presenceInputKey)&&p.amountInputKey!==p.presenceInputKey&&p.treatment==='declared_amount_passthrough'&&p.quantityPolicy==='explicit_zero'&&salaryHash(p.sourceSha256)&&reference(p.ruleReference),'MONTHLY_FORCED_POLICY_INVALID','La política requiere origen, alcance, importe, cantidad y respaldo explícitos.');
  require(!seen.has(pkey(p)),'MONTHLY_FORCED_POLICY_DUPLICATE','La misma fuente mensual tiene dos políticas.');seen.add(pkey(p));
  const targets=effective.filter(r=>active(r,p)&&r.nature!=='auxiliary'&&r.code===p.sourceCode);
  require(targets.length===1,'MONTHLY_FORCED_RULE_REQUIRED','Debe existir un único renglón monetario propio del período.');
  const target=targets[0];
  require(target.nature==='deduction'&&target.unit==='money'&&target.validFrom===p.period&&target.validUntil===p.period&&same(target.liquidationTypes,['monthly'])&&target.rounding.precision===2&&same(target.expression,monthlyForcedExpectedExpression(p)),'MONTHLY_FORCED_PASSTHROUGH_REQUIRED','La regla debe conservar exactamente el importe mensual con presencia, sin reemplazo ni prorrateo.');
  const sourceBindings=program.bindings.filter(b=>b.agreementCode===p.agreementCode&&b.sourceCode===p.sourceCode&&/^(monthly|fixed)_/.test(b.sourceKind));
  require(sourceBindings.length===2,'MONTHLY_FORCED_SOURCE_COLLISION','Esta política admite sólo el importe único y su presencia del mismo canal.');
  const amount=sourceBindings.find(b=>b.key===p.amountInputKey),presence=sourceBindings.find(b=>b.key===p.presenceInputKey);
  require(amount?.sourceKind==='monthly_amount'&&amount.unit==='money'&&amount.combine==='single'&&amount.onMissing==='zero'&&presence?.sourceKind==='monthly_presence'&&presence.unit==='coefficient'&&presence.combine==='any'&&presence.onMissing==='zero','MONTHLY_FORCED_BINDING_REQUIRED','El importe debe ser único y su presencia debe provenir del canal mensual completo.');
  const activeExpressions=[...effective,...(program.quantityPhases??[])].filter(r=>active(r,p));
  require(!activeExpressions.some(r=>hasReference(r.expression,p.sourceCode))&&!(program.quantityPhases??[]).some(r=>active(r,p)&&r.code===p.sourceCode),'MONTHLY_FORCED_QUANTITY_POLICY_REQUIRED','Esta política no define una fase de cantidad ni permite usarla implícitamente.');
  return {...p};
 }).sort((a,b)=>pkey(a)<pkey(b)?-1:pkey(a)>pkey(b)?1:0);
 return {monthlyForcedAmountsVersion:OWN_MONTHLY_FORCED_AMOUNT_VERSION,monthlyForcedAmountPolicies:normalized};
}
export function monthlyForcedProgramHistory(before,after){
 if(!present(before))return;
 const previous=normalizeMonthlyForcedProgram(before),next=normalizeMonthlyForcedProgram(after);
 require(next.monthlyForcedAmountsVersion===previous.monthlyForcedAmountsVersion&&previous.monthlyForcedAmountPolicies.every(old=>next.monthlyForcedAmountPolicies.some(p=>same(old,p))),'PROGRAM_HISTORY_REQUIRED','Conservá las políticas mensuales ya aprobadas y sus referencias originales.');
}

// Called only after the existing native-batch validator has checked the whole
// batch, its independent review (including historical two-review receipts),
// all identities and the captured hash.
export function monthlyForcedSourceResolver(program){
 const normalized=normalizeMonthlyForcedProgram(program),policies=normalized.monthlyForcedAmountPolicies??[];
 return ({row,family,agreementCode,period,liquidationType,sourceContract})=>{
  if(row.forced!==true||family!=='monthly')return null;
  const matching=policies.filter(p=>p.agreementCode===agreementCode&&p.period===period&&p.liquidationType===liquidationType&&p.sourceCode===row.conceptSourceId);
  if(matching.length===0)return null;
  require(matching.length===1,'MONTHLY_FORCED_POLICY_DUPLICATE','La fuente tiene una política ambigua.');
  const policy=matching[0];
  require(sourceContract===policy.sourceContract,'MONTHLY_FORCED_NATIVE_BATCH_REQUIRED','El contrato candidato sólo admite el lote propio con su revisión completa.');
  require(row.quantityDecimal==='0','MONTHLY_FORCED_QUANTITY_REQUIRED','Esta política conserva una cantidad cero explícita; ausente o distinta requiere otra política.');
  require(typeof row.amountCents==='string'&&/^-?(0|[1-9][0-9]{0,17})$/.test(row.amountCents)&&row.amountCents!=='-0','MONTHLY_FORCED_AMOUNT_REQUIRED','El importe debe estar informado en centavos exactos; no se calcula desde la cantidad.');
  return {version:OWN_MONTHLY_FORCED_AMOUNT_VERSION,policy};
 };
}

const centsText=(amount,precision)=>{
 const n=BigInt(amount),a=n<0n?-n:n;
 return(n<0n?'-':'')+(a/100n).toString()+'.'+(a%100n).toString().padStart(2,'0')+'0'.repeat(precision-2);
};
const selected=(input,e)=>input.selection.kind==='all'||input.selection.values.includes(e[{contracts:'contractId',agreements:'agreementCode',departments:'departmentCode'}[input.selection.kind]]);
// Shared by historical readers. All facts come from the immutable original
// payload, never today's registry or an external lookup.
export function monthlyForcedCaptureSourceRecords(payload,input,result){
 const program=payload.programState.program.definition;
 if(!present(program))return [];
 const normalized=normalizeMonthlyForcedProgram(program),resolve=monthlyForcedSourceResolver(program),records=[];
 const population=new Map(payload.population.employees.map(e=>[e.contractId,e])),people=new Map(input.employees.map(e=>[e.contractId,e]));
 const sourceRows=[];
 for(const b of payload.monthly.batches)for(const r of b.rows){
  const person=population.get(r.employmentContractId);
  if(person&&r.forced===true&&normalized.monthlyForcedAmountPolicies.some(p=>p.agreementCode===person.agreementCode&&p.period===input.period&&p.liquidationType===input.liquidationType&&p.sourceCode===r.conceptSourceId))require(false,'MONTHLY_FORCED_NATIVE_BATCH_REQUIRED','La política no admite una fila forzada del canal anterior.');
  sourceRows.push({family:'monthly',contractId:r.employmentContractId,concept:r.conceptSourceId});
 }
 for(const b of payload.monthly.nativeBatches??[])for(const r of b.rows)sourceRows.push({family:'monthly',contractId:r.values.contractId,concept:r.values.conceptSourceId});
 for(const r of payload.fixed.export.data.rows)sourceRows.push({family:'fixed',contractId:r.subject.contractId,concept:r.values.conceptSourceId});
 for(const batch of payload.monthly.nativeBatches??[]){
  ownNoveltyBatch(batch);
  require(batch.status==='approved'&&batch.periodMonth===input.period+'-01'&&batch.payrollType===input.liquidationType,'MONTHLY_FORCED_CAPTURE_CHANGED','El lote original debe conservar período, tipo y aprobación.');
  for(const row of batch.rows){
   const r=row.values,person=population.get(r.contractId);if(!person)continue;
   const matches=normalized.monthlyForcedAmountPolicies.filter(p=>p.agreementCode===person.agreementCode&&p.period===input.period&&p.liquidationType===input.liquidationType&&p.sourceCode===r.conceptSourceId);
   if(matches.length===0)continue; // Existing quantity-only treatment stays owned by its original contract.
   const forced=resolve({row:r,family:'monthly',agreementCode:person.agreementCode,period:input.period,liquidationType:input.liquidationType,sourceContract:batch.version}),policy=matches[0],employee=people.get(r.contractId);
   require(typeof r.amountCents==='string'&&/^-?(0|[1-9][0-9]{0,17})$/.test(r.amountCents)&&r.amountCents!=='-0','MONTHLY_FORCED_CAPTURE_CHANGED','La entrada monetaria requiere el importe original informado.');
   require(row.identityCurrent===true&&r.identityToken===person.identityToken&&r.legajo===person.employeeNumber&&employee&&employee.agreementCode===person.agreementCode,'MONTHLY_FORCED_CAPTURE_CHANGED','La fuente original no coincide con la identidad capturada.');
   require(r.adjustmentMonth===null||r.adjustmentMonth===input.period+'-01','MONTHLY_FORCED_CAPTURE_CHANGED','No se admite retroactividad implícita.');
   require(sourceRows.filter(s=>s.contractId===r.contractId&&s.concept===r.conceptSourceId).length===1,'MONTHLY_FORCED_SOURCE_COLLISION','El importe declarado exige una sola fuente, sin duplicados entre canales.');
   const amounts=employee.inputs.filter(x=>x.key===policy.amountInputKey),presences=employee.inputs.filter(x=>x.key===policy.presenceInputKey);
   require(amounts.length===1&&presences.length===1&&amounts[0].unit==='money'&&amounts[0].value===centsText(r.amountCents,8)&&presences[0].unit==='coefficient'&&presences[0].value==='1','MONTHLY_FORCED_CAPTURE_CHANGED','La entrada guardada debe conservar importe y presencia de la fuente original.');
   if(selected(input,employee)){
    const rows=result.rows.filter(x=>x.contractId===r.contractId&&x.conceptCode===r.conceptSourceId&&x.nature!=='auxiliary');
    require(rows.length===1&&rows[0].nature==='deduction'&&rows[0].amount===centsText(r.amountCents,2),'MONTHLY_FORCED_CAPTURE_CHANGED','El resultado debe conservar el importe de la regla declarada.');
   }
   records.push({batch,row,policy,forced,amount:amounts[0],presence:presences[0],amountBinding:program.bindings.find(b=>b.agreementCode===person.agreementCode&&b.key===policy.amountInputKey),presenceBinding:program.bindings.find(b=>b.agreementCode===person.agreementCode&&b.key===policy.presenceInputKey)});
  }
 }
 return records;
}
export async function monthlyForcedCaptureHashChecks(payload,input,result,hash){
 const checks=[],seen=new Set();
 for(const record of monthlyForcedCaptureSourceRecords(payload,input,result)){
  const {batch,row,forced,policy,amount,presence,presenceBinding}=record,r=row.values;
  if(!seen.has(batch.id)){checks.push([batch.rows.map(({values,subject})=>({values,subject})),batch.rowsSha256]);seen.add(batch.id);}
  const observation={sourceKind:'monthly',contractId:r.contractId,concept:r.conceptSourceId,quantity:r.quantityDecimal,amount:r.amountCents,reference:batch.id+':'+r.rowOrdinal,...(forced?{forced:true,forcedTreatment:'declared_monthly_amount_passthrough',forcedPolicySha256:await hash(forced)}:{})};
  require(typeof amount.sourceReference==='string'&&amount.sourceReference.startsWith('Novedades:')&&typeof presence.sourceReference==='string'&&presence.sourceReference.startsWith('Presencia mensual:'),'MONTHLY_FORCED_CAPTURE_CHANGED','La procedencia debe conservar el canal mensual original.');
  checks.push([[observation],amount.sourceReference.slice('Novedades:'.length)]);
  checks.push([{complete:true,period:input.period,liquidationType:input.liquidationType,contractId:r.contractId,binding:presenceBinding,observations:[observation]},presence.sourceReference.slice('Presencia mensual:'.length)]);
 }
 return checks;
}
