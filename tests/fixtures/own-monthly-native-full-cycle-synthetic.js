// Authored QA arithmetic only. No municipal formula, tariff or default.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {salaryItems,salarySerialized} from '../../assets/native-salary-catalog-model.js';
import {ownProgramDefinition} from '../../assets/own-payroll-program-model.js';
import {participationRuleKey} from '../../assets/own-period-participation-program.js';
import {fixedForcedExpressionSet,ownFixedForcedRuleKey} from '../../assets/own-payroll-engine.js';

const sha=value=>createHash('sha256').update(salarySerialized(value)).digest('hex');
export function monthlyNativeFullCycleFixture(){
 const period='2026-10',liquidationDate='2026-10-31',literal=(value,unit)=>({op:'literal',value,unit}),input=(key,unit)=>({op:'input',key,unit});
 const declaration={recognizedDays:'30',baseDays:'30',unit:'days',policyVersion:'own-monthly-approved-days-policy.v1',fullMonthDeclared:true,asOfDate:'2026-10-01',documentReference:'Constancia exclusivamente sintética del circuito nativo193+196'};
 const rule=(code,nature,unit,expression)=>({agreementCode:'1',code,nature,unit,validFrom:period,validUntil:period,liquidationTypes:['monthly'],expression,rounding:{precision:unit==='money'?2:0,mode:'exact'},ruleReference:'Regla inventada exclusivamente para QA de la unión; sin norma municipal'});
 const rules=[
  rule('100','remuneration','money',{op:'multiply',left:literal('300','money'),right:{op:'divide',left:input('approvedDays','days'),right:input('approvedBase','days')}}),
  rule('110','remuneration','money',literal('0','money')),
  rule('120','non_remuneration','money',input('nativeNovelty','money')),
  rule('210','deduction','money',literal('0','money')),
  rule('310','employer_contribution','money',literal('0','money')),
  rule('900','auxiliary','days',input('approvedDays','days'))
 ];
 const bind=(key,sourceField)=>({agreementCode:'1',key,sourceKind:'monthly_day_declaration_fact',sourceField,unit:'days',onMissing:'error',combine:'single',ruleReference:'Binding tipado exclusivamente sintético de la unión'});
 const bindings=[bind('approvedDays','recognizedDays'),bind('approvedBase','baseDays'),{agreementCode:'1',key:'nativeNovelty',sourceKind:'monthly_amount',sourceCode:'120',unit:'money',onMissing:'error',combine:'single',ruleReference:'Importe del lote120 real, aprobado por la otra identidad sintética'}];
 const policy={ruleKey:ownFixedForcedRuleKey(rules[1]),sourceKind:'fixed_amount',sourceCode:'110',quantityPolicy:'reject',sourceSha256:sha('synthetic-full-cycle-fixed110'),ruleReference:'Fija110 de25 exclusivamente sintética; nunca un monto municipal'};
 const items=salaryItems(rules.map(r=>({kind:r.nature==='auxiliary'?'auxiliary':'concept',agreementCode:r.agreementCode,categoryCode:null,code:r.code,label:'Concepto exclusivamente sintético del circuito unido '+r.code,nature:r.nature,unit:r.unit,precision:r.unit==='money'?2:0,value:null,validFrom:period,validUntil:period,ruleReference:r.ruleReference,dependencies:[],active:true})));
 const definition=ownProgramDefinition({namespaceVersion:'own-payroll-namespaces.v2',monthlyDayDeclarationVersion:'own-monthly-approved-days.v1',totalsPrecision:2,rules,bindings,periodParticipation:{version:'own-period-participation.v1',fullPeriod:'neutral_fraction',fixedValidity:'reject',treatments:rules.map(r=>({ruleKey:participationRuleKey(r),treatment:'declared_formula',reference:'Sin segunda fracción ni prorrateo del importe forzado sintético'}))},fixedForcedAmountsVersion:'own-fixed-forced-amount.v1',fixedForcedAmountsPolicy:{quantityLineage:{version:'own-quantity-lineage-review.v1',sourceSha256:sha('synthetic-full-cycle-quantity-source'),sourceControlSha256:sha('synthetic-full-cycle-quantity-control'),expressionSetSha256:sha(fixedForcedExpressionSet(rules,[policy])),complete:true},policies:[policy]}},items);
 // Exact integer arithmetic of the literals above, not the product evaluator.
 const baseCents=30000n*BigInt(declaration.recognizedDays)/BigInt(declaration.baseDays),fixedCents=2500n,noveltyCents=2000n,grossCents=baseCents+fixedCents+noveltyCents,deductionCents=0n,employerCents=0n,netCents=grossCents-deductionCents;
 const decimal=cents=>(cents/100n).toString()+'.'+(cents%100n).toString().padStart(2,'0');
 assert.equal(baseCents*BigInt(declaration.baseDays),30000n*BigInt(declaration.recognizedDays));
 const expected={rowCount:6,moneyCount:5,auxiliaryCount:1,mappingCount:5,journalEntryCount:10,gross:decimal(grossCents),net:decimal(netCents),totals:{remuneration:decimal(baseCents+fixedCents),non_remuneration:decimal(noveltyCents),deduction:decimal(deductionCents),employer_contribution:decimal(employerCents),gross:decimal(grossCents),net:decimal(netCents)},fixedAmount:decimal(fixedCents),fixedAmountCents:fixedCents.toString(),noveltyAmountCents:noveltyCents.toString(),byCode:{'100':decimal(baseCents),'110':decimal(fixedCents),'120':decimal(noveltyCents),'210':'0.00','310':'0.00','900':'30'}};
 return{version:'monthly-native-full-cycle-synthetic.v1',period,liquidationDate,declaration,definition,items,forcedConcept:'110',expected,municipalFormula:false};
}
