// Synthetic declarations for a different agreement, target set and time range.
// These are not translated R9 policies, real approvals or trusted native reads.
import {salaryItems} from '../../assets/native-salary-catalog-model.js';
import {nonapplicationFixture,fictitiousDefinition,repinCapture} from './own-payroll-nonapplication-synthetic.js';
import {createOwnPayrollNonapplicationPolicyV2,OWN_PAYROLL_NONAPPLICATION_CAPTURE_V2_VERSION,nonapplicationHash} from '../../lib/own-payroll-nonapplication.js';

const targetCodes=['740','741'];
const additiveGroups=[{code:'800000993',removedCodes:[...targetCodes]}];
const leaf=code=>({op:'concept',code,stage:'exact'});
const sum=codes=>codes.map(leaf).reduce((left,right)=>({op:'add',left,right}));
const catalogue=d=>({kind:d.kind,agreementCode:d.agreementCode,categoryCode:null,code:d.code,label:d.label,active:d.active,nature:d.nature,unit:d.kind==='concept'?d.quantityUnit:d.outputUnit,precision:d.precision,validFrom:d.validFrom,validUntil:d.validUntil,value:d.value,dependencies:d.dependencies,ruleReference:d.ruleReference});
export function repinTemporalNonapplicationPolicy(f){
 f.policy=createOwnPayrollNonapplicationPolicyV2({policyId:'qa-nonapplication-'+f.scope.agreementCode+'-'+f.scope.validFrom,supersedes:null,scope:f.scope,sourceSha256:f.source.source.sha256,sourceReference:'Invented nonapplication scope for isolated QA',definitions:f.source.definitions,bindings:f.source.bindings,sourceRows:f.sourceRows,targetCodes:[...targetCodes],additiveGroups:structuredClone(additiveGroups)});
 return f;
}
export function temporalNonapplicationFixture({period='2027-08',validFrom='2027-08',validUntil=null,agreementCode='7'}={}){
 const f=nonapplicationFixture(),declaration={agreementCode,validFrom,validUntil};
 const definitions=[fictitiousDefinition('1',declaration),...targetCodes.map(code=>fictitiousDefinition(code,{...declaration,expression:{op:'choose',condition:{op:'compare',operator:'ne',left:{op:'source_presence',family:'monthly',code},right:{op:'literal',unit:'coefficient',value:'0'}},then:{op:'unresolved',reference:'invented:'+agreementCode+':'+code,unit:'money'},else:{op:'literal',unit:'money',value:'0'}}})),...additiveGroups.map(({code,removedCodes})=>fictitiousDefinition(code,{...declaration,kind:'auxiliary',role:'dependency',nature:'auxiliary',quantityUnit:null,expression:sum(['1',...removedCodes])}))];
 const items=salaryItems(definitions.map(catalogue));
 f.source.period=period;f.source.agreementCodes=[agreementCode];f.source.definitions=definitions;
 f.source.bindings=targetCodes.map(code=>({agreementCode,reference:'P['+code+']',sourceSha256:nonapplicationHash(['invented-binding',agreementCode,code]),binding:{agreementCode,key:'monthlyPresent'+code,unit:'coefficient',sourceKind:'monthly_presence',sourceCode:code,combine:'any',onMissing:'zero',ruleReference:'Invented presence binding; never a monetary default'}}));
 f.source.source={sha256:nonapplicationHash(['invented-complete-declarations',declaration]),complete:true,expectedDefinitions:definitions.length};
 f.source.salary.catalog.items=structuredClone(items);f.source.programme.salaryCatalog.items=structuredClone(items);
 f.sourceRows=targetCodes.map(code=>({CODI_02:agreementCode,CODI_27:code,CODI_36:'98',ACTI_27:'N',FOVM_27:null,LIQU_27:'M',QA_ONLY:true}));
 f.scope={scopeVersion:f.source.programme.scopeVersion,agreementCode,validFrom,validUntil,liquidationType:'monthly'};
 Object.assign(f.capture,{version:OWN_PAYROLL_NONAPPLICATION_CAPTURE_V2_VERSION,period,agreementCode});
 for(const employee of f.capture.population.employees)employee.agreementCode=agreementCode;
 for(const channel of ['list','export'])f.capture.fixed[channel].data.periodMonth=period+'-01';
 f.sources.period=period;f.sources.programState=structuredClone(f.source.programme);
 return repinCapture(repinTemporalNonapplicationPolicy(f));
}
