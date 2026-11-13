// Invented values and identities only; this fixture creates no municipal approval.
import {approvedSources} from './own-payroll-approved-synthetic.js';
import {uid,hash} from './own-payroll-program-synthetic.js';
import {salaryItems} from '../../assets/native-salary-catalog-model.js';
import {policySha256} from '../../assets/own-payroll-policy-validity.js';
import {ownProgramStructure} from '../../assets/own-payroll-program-model.js';
import {catalogueSourceContracts,OWN_APPROVED_PERIOD_VALUES_VERSION,OWN_CATALOGUE_VALUES_CAPTURE_VERSION} from '../../assets/own-payroll-catalogue-values.js';

export function stampPeriodCatalogue(source,{approvalId=uid(902),proposalId=uid(903)}={}){
 const state=source.programState,program=state.program,catalog=state.salaryCatalog;
 const original=state.proposals.find(p=>p.id===program.proposalId);
 const contracts=catalogueSourceContracts(program.definition,original.salaryItems);
 source.sourceInventory={...(source.sourceInventory??{}),catalogueValues:{
  version:OWN_CATALOGUE_VALUES_CAPTURE_VERSION,complete:true,tenantId:uid(900),sourceBindingId:uid(901),revision:catalog.revision,
  approvalId,proposalId,catalogueVersion:catalog.version,itemsSha256:policySha256(catalog.items),itemCount:catalog.items.length,
  programVersion:program.version,programApprovalId:program.approvalId,programProposalId:program.proposalId,programSalaryVersion:program.salaryVersion,
  originalItemsSha256:policySha256(original.salaryItems),sourceContractsSha256:policySha256(contracts),sourceContracts:contracts
 }};
 return source;
}
export function attachPeriodCatalogue(source){
 const state=source.programState,p=state.program;
 p.definition=ownProgramStructure({...p.definition,catalogueValueResolutionVersion:OWN_APPROVED_PERIOD_VALUES_VERSION});
 state.proposals=[{id:p.proposalId,requestSha256:hash('9'),baseVersion:hash('8'),salaryVersion:p.salaryVersion,salaryItems:structuredClone(state.salaryCatalog.items),baseDefinition:null,
  definition:structuredClone(p.definition),reason:'Synthetic programme approval for laboratory only',createdAt:'2026-11-01T12:00:00Z',authorLabel:'Synthetic preparer',canReview:false,status:'approved',
  decision:{command:'approve',reason:'Synthetic distinct review for laboratory only',actorLabel:'Synthetic reviewer',recordedAt:'2026-11-01T12:01:00Z',revision:p.revision}}];
 return stampPeriodCatalogue(source);
}
export function changePeriod(source,period){
 source.period=period;
 source.fixed.list.data.periodMonth=period+'-01';source.fixed.export.data.periodMonth=period+'-01';
 return source;
}
export function periodValueSources({period='2026-11',sourceKind='auxiliary_parameter',count=2,value='123.45'}={}){
 const s=changePeriod(approvedSources(count),period);s.monthly.batches=[];
 const binding={agreementCode:'1',key:'monthlyRate',unit:'money',sourceKind,sourceCode:'800009001',onMissing:'error',combine:'single',ruleReference:'Synthetic approved monthly parameter'};
 if(sourceKind==='scale_reference')Object.assign(binding,{sourceAgreementCode:'2',sourceCategoryCode:'7'});
 const rule={code:'9001',agreementCode:'1',nature:'remuneration',unit:'money',validFrom:'2026-11',validUntil:null,liquidationTypes:['monthly'],rounding:{precision:2,mode:'half_up'},ruleReference:'Synthetic stable formula; no municipal authority',expression:{op:'input',key:'monthlyRate',unit:'money'}};
 s.programState.program.definition=ownProgramStructure({namespaceVersion:'own-payroll-namespaces.v2',catalogueValueResolutionVersion:OWN_APPROVED_PERIOD_VALUES_VERSION,rules:[rule],bindings:[binding],totalsPrecision:2});
 const common={active:true,agreementCode:'1',categoryCode:null,dependencies:[],precision:2,ruleReference:'Synthetic configuration for isolated QA only',unit:'money',validFrom:'2026-11'};
 const scale=['scale','scale_reference'].includes(sourceKind);
 s.programState.salaryCatalog.items=salaryItems([
  {...common,kind:'concept',code:'9001',nature:'remuneration',label:'Synthetic stable concept',validUntil:null,value:null},
  {...common,kind:scale?'scale':sourceKind==='auxiliary_parameter'?'auxiliary':'concept',code:'800009001',nature:scale?null:sourceKind==='auxiliary_parameter'?'auxiliary':'remuneration',
   agreementCode:sourceKind==='scale_reference'?'2':'1',categoryCode:scale?(sourceKind==='scale_reference'?'7':'6'):null,label:'Synthetic November parameter',validUntil:'2026-11',value}
 ]);
 return attachPeriodCatalogue(s);
}
export function addPeriodValue(source,period,value='234.56'){
 const catalog=source.programState.salaryCatalog,original=catalog.items.find(r=>r.code==='800009001');
 catalog.items=salaryItems([...catalog.items,{...original,validFrom:period,validUntil:period,value}]);
 catalog.revision++;catalog.version=policySha256({revision:catalog.revision,items:catalog.items});
 return stampPeriodCatalogue(source,{approvalId:uid(902+catalog.revision),proposalId:uid(903+catalog.revision)});
}
