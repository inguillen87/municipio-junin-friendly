// Synthetic source dispositions. Numeric codes mirror the binding counterexample,
// but these declarations do not certify the real C1 source or any municipal facts.
import {createHash} from 'node:crypto';
import {salaryItems,salarySerialized} from '../../assets/native-salary-catalog-model.js';
import {OWN_PAYROLL_SOURCE_COVERAGE_VERSION,sourceCoverageInventorySha256} from '../../assets/own-payroll-source-coverage.js';
import {approvedSources} from './own-payroll-approved-synthetic.js';
import {fixedApprovedRecord} from './payroll-fixed-novelties-synthetic.js';
import {uid} from './own-payroll-program-synthetic.js';
import {rule,lit,fact} from './own-payroll-synthetic.js';

export const coverageHash=value=>createHash('sha256').update(salarySerialized(value)).digest('hex');
export function coveragePolicy(inventory,{agreementCode='1',validFrom='2026-10',validUntil=null,policyId='synthetic-source-coverage',nativeInputs=[],liquidationType='monthly',supersedes=null}={}){
  inventory=structuredClone(inventory).sort((a,b)=>a.code.localeCompare(b.code,'en'));
  return{policyId,supersedes,agreementCode,liquidationType,validFrom,validUntil,sourceSha256:coverageHash('synthetic documentary source'),inventorySha256:sourceCoverageInventorySha256(inventory),expectedSourceRows:inventory.length,inventory,nativeInputs};
}
export const coverageRow=(code,kind='rule',extra={})=>({code,sourceRowSha256:coverageHash({syntheticSourceRow:code}),kind,...extra});
export const excludedCoverageRow=code=>coverageRow(code,'excluded',{basis:{kind:'event_activation_only',sourceActivation:'N',evidenceSha256:coverageHash({syntheticManualActivation:code})}});
export const coverageOptions=policy=>({sourceCoverageVersion:OWN_PAYROLL_SOURCE_COVERAGE_VERSION,sourceCoveragePolicies:[policy]});
export function coverageSources({code='102',channel='monthly_imported',withEvent=true,forced=false,amount='0',quantity='2'}={}){
  const s=approvedSources(1),original=s.monthly.batches[0].rows[0];
  const inputCodes=['100','102','105','110'];
  const auxiliary=(code,expression)=>rule(code,expression,{nature:'auxiliary',unit:'days'});
  const bindings=inputCodes.map(code=>({agreementCode:'1',key:'source'+code,unit:'days',sourceKind:(channel==='fixed'?'fixed':'monthly')+'_quantity',sourceCode:code,combine:'sum',onMissing:'zero',ruleReference:'Synthetic quantity consumed by a separate auxiliary'}));
  const rules=[
    rule('1',lit('100','money'),{nature:'remuneration'}),
    auxiliary('79',{op:'add',left:fact('source100','days'),right:fact('source102','days')}),
    auxiliary('82',fact('source105','days')),
    auxiliary('379',fact('source110','days'))
  ];
  const policy=coveragePolicy([coverageRow('1'),...inputCodes.map(excludedCoverageRow)]);
  s.programState.program.definition={...coverageOptions(policy),namespaceVersion:'own-payroll-namespaces.v2',rules,bindings,totalsPrecision:2};
  const row=(code,kind,nature,unit)=>({active:true,agreementCode:'1',categoryCode:null,code,dependencies:[],kind,label:'Synthetic source coverage '+code,nature,precision:2,ruleReference:'Synthetic source coverage; no municipal decision',unit,validFrom:'2026-10',validUntil:null,value:null});
  s.programState.salaryCatalog.items=salaryItems([
    ...rules.map(r=>row(r.code,r.nature==='auxiliary'?'auxiliary':'concept',r.nature,r.unit)),
    ...inputCodes.map(code=>row(code,'concept','remuneration','days'))
  ]);
  Object.assign(original,{conceptSourceId:code,quantityDecimal:quantity,amountCents:amount,forced,observation:'Synthetic excluded event; never discard a zero or a quantity binding.'});
  s.monthly.nativeBatches=[];
  if(!withEvent){s.monthly.batches=[];return s;}
  if(channel==='fixed'){
    const r=fixedApprovedRecord(1,{conceptSourceId:code,quantityDecimal:quantity,amountCents:amount,forced,forcedReason:forced?'Synthetic previously approved forced quantity':null,validFrom:'2026-10-01',validTo:null});
    r.subject=structuredClone(original.subject);s.monthly.batches=[];
    s.fixed.list.data.rows=[r];s.fixed.list.data.total=1;
    s.fixed.export.data.rows=[{recordId:r.id,version:r.version,proposalId:r.approved.id,subject:r.subject,values:r.approved.values}];s.fixed.export.data.total=1;
  }else if(channel==='monthly_native'){
    const subject=structuredClone(original.subject),values={rowOrdinal:1,legajo:subject.legajo,contractId:subject.contractId,identityToken:subject.identityToken,conceptSourceId:code,costCenterSourceId:null,adjustmentMonth:null,quantityDecimal:quantity,amountCents:amount,movementType:null,legalInstrument:null,observation:'Synthetic complete native source event.',forced};
    const rows=[{values,subject,identityCurrent:true}],preparedBy={membershipId:uid(8101),personId:uid(8102)},reviewer={membershipId:uid(8103),personId:uid(8104)},legacySecond={membershipId:uid(8106),personId:uid(8107)};
    // Preserve the existing V1 historical fixture contract; this candidate adds
    // no reviewer requirement to the current V2 writer or its two-person flow.
    const approvals=forced?[reviewer,legacySecond]:[reviewer],decidedBy=approvals.at(-1);
    const batch={version:'own-payroll-novelty-batch.v1',id:uid(8105),revision:forced?4:3,status:'approved',periodMonth:'2026-10-01',payrollType:'monthly',rows,rowCount:1,rowsSha256:coverageHash(rows.map(({values,subject})=>({values,subject}))),preparedBy,decidedBy,approvals,grhMutation:false,payrollCalculated:false,payrollPosted:false};
    s.monthly.batches=[];s.monthly.nativeBatches=[batch];
  }
  return s;
}
