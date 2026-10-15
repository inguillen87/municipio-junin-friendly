// Fictional programme only; this is not a municipal formula or approval.
import {auxiliarySources} from './own-payroll-auxiliary-synthetic.js';
import {capture,saved} from './own-payroll-run-synthetic.js';
import {ownRunHash} from '../../lib/internal-own-payroll-run.js';
import {periodContextFields,OWN_PAYROLL_PERIOD_CONTEXT_VERSION} from '../../assets/own-payroll-period-context.js';
import{closeDetail,closeReceipt,closeCommand}from'./own-payroll-close-synthetic.js';import{reportGroup}from'./own-payroll-report-synthetic.js';
import{ownCloseSnapshot}from'../../assets/own-payroll-close-model.js';

export function sealPeriodContextSources(s){
 const fields=periodContextFields(s.period);s.periodContext={...fields,sha256:ownRunHash(fields)};
 const sources={employees:s.population.employees,periodContext:s.periodContext};
 for(const key of['employmentFacts','periodParticipation','workingTime','agreementWorkingTime','salaryConditions'])if(s[key])sources[key]=s[key];
 s.population.version=ownRunHash(sources);return s;
}
export function periodContextSources(period='2026-09',count=1){
 const s=auxiliarySources(count),p=s.programState.program.definition;s.period=period;
 p.periodContextVersion=OWN_PAYROLL_PERIOD_CONTEXT_VERSION;
 for(const r of [...p.rules,...s.programState.salaryCatalog.items])r.validFrom='1900-01';
 for(const r of[s.fixed.list.data,s.fixed.export.data])r.periodMonth=period+'-01';
 p.bindings.push({agreementCode:'1',key:'periodMonth',unit:'units',sourceKind:'period_context_fact',sourceField:'monthNumber',combine:'single',onMissing:'error',ruleReference:'Mes declarado exclusivamente sintético QA'});
 p.rules.find(r=>r.code==='95').expression={op:'choose',condition:{op:'compare',operator:'eq',left:{op:'input',key:'periodMonth',unit:'units'},right:{op:'literal',unit:'units',value:'9'}},then:{op:'literal',unit:'money',value:'1.11'},else:{op:'literal',unit:'money',value:'2.22'}};
 return sealPeriodContextSources(s);
}
export function periodContextCaptureFixture(period='2026-09',liquidationDate='2027-12-31'){
 const c=capture(),s=periodContextSources(period);
 c.body={...c.body,version:'own-payroll-run-command.v2',period,liquidationDate};c.version='own-payroll-run.v2';
 c.payload={...s,sourceInventory:{populationDomain:'native_registered',periodContext:{version:s.periodContext.sha256,total:1,complete:true}}};
 c.bodySha256=ownRunHash(c.body);c.payloadSha256=ownRunHash(c.payload);c.saved=saved(c);return c;
}
export function periodContextReportFixture(){
 const c=periodContextCaptureFixture(),detail=closeDetail(1);detail.period=c.body.period;detail.liquidationType=c.body.liquidationType;detail.captures=[c];detail.groups=[];
 detail.rows=detail.rows.slice(0,1).map(r=>({...r,runId:c.id,resultSha256:c.saved.resultSha256,state:'confirmed',groupId:null,canClose:true}));
 const body=closeCommand({period:c.body.period,liquidationType:c.body.liquidationType}),snapshot=ownCloseSnapshot(detail,body.selection),receipt=closeReceipt({body,bodySha256:ownRunHash(body),snapshot,snapshotSha256:ownRunHash(snapshot)});
 detail.groups=[reportGroup(receipt)];for(const r of detail.rows)Object.assign(r,{state:'closed',groupId:receipt.groupId,canClose:false});
 return{query:{from:c.body.period,to:c.body.period,types:[c.body.liquidationType]},details:[detail],receipts:[receipt],captures:[c]};
}
