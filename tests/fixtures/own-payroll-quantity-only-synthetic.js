// Synthetic source quantities; no GRH formula or operational decision is implied.
import {adjustmentSources,sealAdjustmentSources} from './own-payroll-declared-adjustments-synthetic.js';
import {fixedApprovedRecord} from './payroll-fixed-novelties-synthetic.js';
import {subject} from './own-payroll-novelties-synthetic.js';
import {salaryItems} from '../../assets/native-salary-catalog-model.js';
import {ownProgramDefinition} from '../../assets/own-payroll-program-model.js';
import {rule,lit,fact,binary} from './own-payroll-synthetic.js';

export const quantityOnlyPolicy=(code='204',unit='money',sourceKind='monthly_quantity',patch={})=>({
 policyId:'synthetic-quantity-'+code,supersedes:null,agreementCode:'1',validFrom:'2026-10',validUntil:null,liquidationType:'monthly',
 sourceCode:code,quantityInputKey:'quantity'+code,quantityUnit:unit,sourceKind,
 sourceContracts:sourceKind==='monthly_quantity'?['own-payroll-novelty-batch.v1','payroll-novelty-batch.v2']:['payroll-fixed-export.v1'],
 amountPolicy:'absent_or_zero',forcedPolicy:'reject',otherChannelPolicy:'reject',adjustmentMonthPolicy:'absent_or_current_month',
 absencePolicy:'zero_only_after_existing_complete_capture',sourceSha256:'a'.repeat(64),ruleReference:'Synthetic explicit source quantity policy',...patch
});
export function quantityOnlyProgramme(code='204',unit='money',sourceKind='monthly_quantity'){
 const p=quantityOnlyPolicy(code,unit,sourceKind),expression=unit==='money'?fact(p.quantityInputKey,unit):binary('multiply',lit(code==='5'?'5.7':'10','money'),binary('divide',fact(p.quantityInputKey,unit),lit('1',unit)));
 return {namespaceVersion:'own-payroll-namespaces.v2',quantityOnlyInputsVersion:'own-quantity-only-inputs.v1',quantityOnlyInputPolicies:[p],totalsPrecision:2,
 rules:[rule(code,expression,{rounding:{precision:2,mode:'half_up'}})],bindings:[{agreementCode:'1',key:p.quantityInputKey,sourceKind,sourceCode:code,unit,combine:'sum',onMissing:'zero',ruleReference:p.ruleReference}]};
}
export function quantityOnlySources({code='204',unit='money',sourceKind='monthly_quantity',events=[{quantity:'10',amount:'0'}],channel='native',period='2026-10'}={}){
 const p=quantityOnlyProgramme(code,unit,sourceKind),s=adjustmentSources({events:[],period});
 const items=salaryItems([{kind:'concept',code,agreementCode:'1',categoryCode:null,label:'Synthetic quantity-owned concept',nature:'remuneration',unit,precision:2,value:null,validFrom:'2026-10',validUntil:null,ruleReference:'Synthetic quantity-owned catalogue',dependencies:[],active:true}]);
 s.programState.salaryCatalog.items=items;s.programState.program.definition=ownProgramDefinition(p,items);
 if(sourceKind==='fixed_quantity'||channel==='fixed'){
  const rows=events.map((event,i)=>{const record=fixedApprovedRecord(i+1,{conceptSourceId:code,quantityDecimal:event.quantity,amountCents:event.amount??null,validFrom:period+'-01',validTo:null,...event.values});record.subject=subject(1);return record;});
  s.fixed.list.data.rows=rows;s.fixed.list.data.total=rows.length;s.fixed.export.data.rows=rows.map(r=>({recordId:r.id,version:r.version,proposalId:r.approved.id,subject:structuredClone(r.subject),values:structuredClone(r.approved.values)}));s.fixed.export.data.total=rows.length;
 }else{
  for(const [i,event] of events.entries()){
   const selected=channel==='mixed'?(i%2?'imported':'native'):channel;
   const m=adjustmentSources({period,channel:selected,events:[{code,cents:event.amount??null,origin:null,values:{quantityDecimal:event.quantity,...event.values}}]}).monthly;
   for(const field of ['batches','nativeBatches'])for(const b of m[field]){b.id='00000000-0000-4000-8000-'+String(87000+i).padStart(12,'0');s.monthly[field].push(b);}
  }
 }
 return sealAdjustmentSources(s);
}
