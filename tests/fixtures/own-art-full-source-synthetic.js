// All arithmetic, identities, jurisdictions and approvals below are invented QA.
// The salary engine produces the saved result; the close/ART authority envelopes
// are manufactured, as in own-art-report-synthetic.js, never SQL approvals.
// Only synthetic inputs are used; no municipal source or database is read.
import {approvedSources} from './own-payroll-approved-synthetic.js';
import {bootstrap,uid,hash} from './own-payroll-program-synthetic.js';
import {capture,saved} from './own-payroll-run-synthetic.js';
import {rule,lit} from './own-payroll-synthetic.js';
import {reportGroup} from './own-payroll-report-synthetic.js';
import {salaryItems} from '../../assets/native-salary-catalog-model.js';
import {ownProgramDefinition} from '../../assets/own-payroll-program-model.js';
import {ownCloseSnapshot} from '../../assets/own-payroll-close-model.js';
import {ownRunHash} from '../../lib/internal-own-payroll-run.js';

export const OWN_ART_FULL_QA_RULE_COUNT=24;
const cuil=dni=>{
 const base='20'+dni,remainder=11-[5,4,3,2,7,6,5,4,3,2].reduce((sum,weight,index)=>sum+weight*Number(base[index]),0)%11;
 return base+(remainder===11?'0':remainder===10?'9':String(remainder));
};

// No filler strings, repeated trace text, post-engine added concepts or altered
// totals. Each of the 24 rows per employee comes from an explicit effective rule.
export function ownArtFullSourceFixture(count=855){
 if(!Number.isInteger(count)||count<1||count>855)throw Error('ART full-source QA count must be 1..855.');
 const sources=approvedSources(count);
 const rules=[
  ...Array.from({length:22},(_,index)=>rule(String(100+index),lit(String(index+1)+'.00','money'),{
   rounding:{mode:'exact',precision:2},
   ruleReference:'Concepto '+String(100+index)+' de capacidad ART, literal exclusivamente QA; no norma municipal.'
  })),
  ...[['993','100.01'],['995','0.02']].map(([code,amount])=>rule(code,lit(amount,'money'),{
   nature:'auxiliary',rounding:{mode:'exact',precision:2},
   ruleReference:'Auxiliar '+code+' ART exclusivamente QA; importe literal inventado, sin norma municipal.'
  }))
 ];
 const items=salaryItems(rules.map(r=>({active:true,agreementCode:r.agreementCode,categoryCode:null,code:r.code,
  dependencies:[],kind:'concept',label:'Concepto de prueba de transporte ART '+r.code,nature:r.nature,
  precision:2,ruleReference:r.ruleReference,unit:r.unit,validFrom:r.validFrom,validUntil:r.validUntil,value:null})));
 const definition=ownProgramDefinition({rules,bindings:[],totalsPrecision:2},items);
 sources.programState=bootstrap({salaryCatalog:{version:hash('c'),revision:1,items},
  program:{version:hash('b'),revision:1,definition,salaryVersion:hash('c'),proposalId:uid(50),approvalId:uid(51)}});
 sources.monthly={complete:true,batches:[]};
 const jurisdictions={version:'own-run-jurisdictions.v1',complete:true,total:count,
  rows:sources.population.employees.map((e,index)=>({contractId:e.contractId,employeeNumber:e.employeeNumber,
   registrationId:uid(4000+index),identityToken:e.identityToken,jurisdictionCode:index%2?'55':'42'}))};
 const c=capture({payload:{...sources,sourceInventory:{populationDomain:'native_registered',jurisdictions}}});
 c.payloadSha256=ownRunHash(c.payload);c.saved=saved(c);
 const detail={version:'own-close-detail.v2',period:c.body.period,liquidationType:c.body.liquidationType,
  scopeVersion:c.body.scopeVersion,stateVersion:hash('b'),populationDomain:'native_registered',rosterVersion:sources.population.version,
  rows:c.saved.input.employees.map(e=>({contractId:e.contractId,employeeNumber:e.employeeNumber,
   agreementCode:e.agreementCode,departmentCode:e.departmentCode,state:'confirmed',runId:c.id,
   resultSha256:c.saved.resultSha256,liquidationVersion:1,groupId:null,canClose:true})),
  captures:[c],groups:[],canWrite:true,complete:true};
 const body={period:detail.period,liquidationType:detail.liquidationType,scopeVersion:detail.scopeVersion,
  stateVersion:detail.stateVersion,selection:{kind:'all',values:[]},command:'close',groupId:null,
  reason:'Cierre manufacturado exclusivamente para probar transporte ART completo',reviewConfirmed:true};
 const snapshot=ownCloseSnapshot(detail,body.selection),receipt={version:'own-close-receipt.v1',id:uid(800001),
  key:uid(800002),body,bodySha256:ownRunHash(body),groupId:uid(800001),snapshot,snapshotSha256:ownRunHash(snapshot),
  recordedAt:'2026-10-05T14:00:00.000Z',replayed:false};
 detail.groups=[reportGroup(receipt)];
 for(const row of detail.rows)Object.assign(row,{state:'closed',groupId:receipt.groupId,canClose:false});
 const people=snapshot.employees.map((e,index)=>{
  const dni=String(99010000+index);
  return {contractId:e.contractId,personId:uid(3000+index),registrationId:uid(4000+index),employeeNumber:e.employeeNumber,
   name:'Agente exclusivamente sintético ART QA '+index,dni,cuil:cuil(dni),sex:index%2?'F':'M',identityToken:hash('e'),
   days:{version:hash('f'),revision:1,definition:{workedDays:index===0?'0':'23',asOfDate:snapshot.period+'-01',
    documentReference:'Constancia de días inventados exclusivamente QA'},proposalId:uid(5000+index),
    approvalId:uid(6000+index),identityToken:hash('e'),sourceVersion:c.payloadSha256},daysCurrent:true};
 });
 const content={version:'own-art-source.v1',params:{period:snapshot.period,types:[snapshot.liquidationType]},
  groups:[receipt],people,sourceRecordCount:count,complete:true,origin:'MUNICONTROL'};
 const source={version:'own-art-preview.v1',scopeVersion:hash('a'),sourceVersion:ownRunHash(content),content};
 return {source,capture:c,detail,receipt,provenance:{version:'own-art-full-source-qa.v1',
  engineResult:'existing_pure_engine',closeAuthority:'manufactured_qa_only',identityAndDays:'manufactured_qa_only',
  municipalRule:false,sqlApproval:false,bankSubmitted:false,paymentExecuted:false}};
}
