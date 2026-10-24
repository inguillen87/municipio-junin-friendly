// Invented arithmetic and approved-source envelopes only. No municipal rule,
// SQL approval, browser observation, payment or production write is implied.
import {approvedSources} from './own-payroll-approved-synthetic.js';
import {bootstrap,uid,hash} from './own-payroll-program-synthetic.js';
import {capture,saved} from './own-payroll-run-synthetic.js';
import {fixedFixture,fixedApprovedRecord,fixedNativeSubject} from './payroll-fixed-novelties-synthetic.js';
import {rule,lit,fact,ref} from './own-payroll-synthetic.js';
import {reportGroup} from './own-payroll-report-synthetic.js';
import {salaryItems} from '../../assets/native-salary-catalog-model.js';
import {ownProgramDefinition} from '../../assets/own-payroll-program-model.js';
import {ownFixedForcedRuleKey,fixedForcedExpressionSet,OWN_FIXED_FORCED_AMOUNTS_VERSION} from '../../assets/own-payroll-engine.js';
import {ownCloseSnapshot} from '../../assets/own-payroll-close-model.js';
import {ownRunHash} from '../../lib/internal-own-payroll-run.js';

// The rounded variant is an explicitly authored PRIOR synthetic approval, as
// in own-fixed-forced-amount.test.js. It does not propose a new rounding rule.
function programme(kind,stage,quantityChoose){
 const precision=kind==='fixed'?2:3;
 const quantity={op:'quantity_phase',code:'100',unit:'units',stage,
  rounding:stage==='rounded'?{mode:'half_up',precision:2}:null,
  value:quantityChoose?{op:'choose',condition:{op:'compare',operator:'eq',left:lit('1'),right:lit('1')},then:fact('fixedUnits100','units'),else:fact('otherUnits','units')}:fact('fixedUnits100','units'),
  sourceReference:'Cantidad exclusivamente sintética QA; aprobación anterior',sourceSha256:hash('d')};
 const rules=[
  rule('100',kind==='fixed'?{op:'convert',value:fact('fixedUnits100','units'),unit:'money',factor:'12.50',conversionReference:'Conversión ficticia QA; no tarifa municipal'}:lit('10.00','money')),
  rule('110',kind==='fixed'?ref('100','exact'):{op:'convert',value:quantity,unit:'money',factor:'1',conversionReference:'Conversión ficticia explícita QA'}),
  rule('120',ref('110','exact'),{nature:'non_remuneration'}),
  rule('900',ref('120','exact'),{nature:'auxiliary',unit:'money'})
 ];
 for(const r of rules)r.rounding={mode:'exact',precision};
 const policies=[{ruleKey:ownFixedForcedRuleKey(rules[0]),sourceKind:'fixed_amount',sourceCode:'100',quantityPolicy:'reject',sourceSha256:hash('e'),ruleReference:'Política ficticia aprobada QA; sin norma municipal'}];
 const definition={namespaceVersion:'own-payroll-namespaces.v2',rules,
  bindings:[{agreementCode:'1',key:'fixedUnits100',unit:'units',sourceKind:'fixed_quantity',sourceCode:'100',onMissing:'error',combine:'single',ruleReference:'Cantidad fija aprobada exclusivamente sintética QA'},...(quantityChoose?[{agreementCode:'1',key:'otherUnits',unit:'units',sourceKind:'fixed_quantity',sourceCode:'100',onMissing:'error',combine:'single',ruleReference:'La misma cantidad capturada para la rama no ejecutada QA'}]:[])],totalsPrecision:precision,
  fixedForcedAmountsVersion:OWN_FIXED_FORCED_AMOUNTS_VERSION,
  fixedForcedAmountsPolicy:{quantityLineage:{version:'own-quantity-lineage-review.v1',sourceSha256:hash('a'),sourceControlSha256:hash('f'),expressionSetSha256:ownRunHash(fixedForcedExpressionSet(rules,policies)),complete:true},policies}};
 const items=salaryItems(rules.map(r=>({active:true,agreementCode:r.agreementCode,categoryCode:null,code:r.code,dependencies:[],kind:r.nature==='auxiliary'?'auxiliary':'concept',label:'Descripción original sintética '+r.code,nature:r.nature,precision,ruleReference:'Fuente ficticia aprobada QA',unit:r.code==='100'?'units':r.unit,validFrom:r.validFrom,validUntil:r.validUntil,value:null})));
 return bootstrap({salaryCatalog:{version:hash('c'),revision:1,items},program:{version:hash('b'),revision:1,definition:ownProgramDefinition(definition,items),salaryVersion:hash('c'),proposalId:uid(50),approvalId:uid(51)}});
}

// One capture, complete native synthetic census and one manufactured immutable
// close receipt. count>25 is reusable by the existing browser harness; the
// legacy fixed-source fixture's real capacity remains 500, without chunking.
export function currentTraceReportFixture(count=1,{kind='fixed',amountCents='12863',stage='exact',quantityChoose=false}={}){
 if(!Number.isInteger(count)||count<1||count>100||!['fixed','quantity'].includes(kind)||!['exact','rounded'].includes(stage)||typeof quantityChoose!=='boolean'||quantityChoose&&kind!=='quantity')throw Error('Alcance sintético M8 no admitido.');
 const sources=approvedSources(count);sources.programState=programme(kind,stage,quantityChoose);sources.monthly={complete:true,batches:[]};
 const fixed=fixedFixture();
 for(const [index,e]of sources.population.employees.entries()){
  const record=fixedApprovedRecord(index+1,{conceptSourceId:'100',quantityDecimal:kind==='fixed'?null:'1.005',amountCents:kind==='fixed'?amountCents:null,forced:kind==='fixed',forcedReason:kind==='fixed'?'Importe forzado con aprobación exclusivamente sintética QA':null,validFrom:'2026-10-01',validTo:'2026-10-31'});
  record.subject={...fixedNativeSubject(e.employeeNumber),contractId:e.contractId,legajo:e.employeeNumber,identityToken:e.identityToken};fixed.state.records.push(record);
 }
 sources.fixed={list:{ok:true,data:fixed.list('2026-10-01')},export:{ok:true,data:fixed.exporter('2026-10-01')}};
 const c=capture({payload:{...sources,sourceInventory:{populationDomain:'native_registered'}}});
 c.bodySha256=ownRunHash(c.body);c.payloadSha256=ownRunHash(c.payload);c.saved=saved(c);
 const detail={version:'own-close-detail.v1',period:c.body.period,liquidationType:c.body.liquidationType,scopeVersion:c.body.scopeVersion,stateVersion:hash('b'),populationDomain:'native_registered',rosterVersion:sources.population.version,
  rows:c.saved.input.employees.map(e=>({contractId:e.contractId,employeeNumber:e.employeeNumber,agreementCode:e.agreementCode,departmentCode:e.departmentCode,state:'confirmed',runId:c.id,resultSha256:c.saved.resultSha256,liquidationVersion:1,groupId:null,canClose:true})),captures:[structuredClone(c)],groups:[],canWrite:true,complete:true};
 const body={period:detail.period,liquidationType:detail.liquidationType,scopeVersion:detail.scopeVersion,stateVersion:detail.stateVersion,selection:{kind:'all',values:[]},command:'close',groupId:null,reason:'Cierre exclusivamente sintético para regresión M8',reviewConfirmed:true};
 const snapshot=ownCloseSnapshot(detail,body.selection),receipt={version:'own-close-receipt.v1',id:uid(400),key:uid(401),body,bodySha256:ownRunHash(body),groupId:uid(400),snapshot,snapshotSha256:ownRunHash(snapshot),recordedAt:'2026-10-05T14:00:00.000Z',replayed:false};
 detail.groups=[reportGroup(receipt)];for(const row of detail.rows)Object.assign(row,{state:'closed',groupId:receipt.groupId,canClose:false});
 return {query:{from:detail.period,to:detail.period,types:[detail.liquidationType]},details:[detail],receipts:[receipt],captures:[c]};
}
