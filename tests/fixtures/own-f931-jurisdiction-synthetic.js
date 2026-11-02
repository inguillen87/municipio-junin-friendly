// Manufactured closed snapshots with conserved jurisdictions and a literal fiscal census.
// No municipal codes, roster data or acceptance. Reused by node tests and the browser QA.
import {jurisdictionFixture} from './own-payroll-jurisdiction-synthetic.js';
import {reportGroup} from './own-payroll-report-synthetic.js';
import {syntheticFiscalFactsDefinition} from './own-fiscal-facts-synthetic.js';
import {FISCAL_FACT_FIELDS,fiscalFactsHash} from '../../assets/own-fiscal-facts-model.js';
import {uid} from './own-payroll-program-synthetic.js';
import {ownRunHash} from '../../lib/internal-own-payroll-run.js';
// Same re-labelling as historicalReportFixture (own-payroll-report-synthetic.js), applied to a v2
// jurisdiction fixture: the closed snapshot keeps its conserved jurisdictions; the current rows and
// captures of that type are not kept, so its identity tokens are unknown to the fiscal association.
export function retypedJurisdictionFixture(count,choice,type,number){
 const f=jurisdictionFixture(count,choice),receipt=f.receipts[0],detail=f.details[0];
 receipt.id=uid(number);receipt.groupId=receipt.id;receipt.key=uid(number+1000);receipt.body.liquidationType=type;receipt.bodySha256=ownRunHash(receipt.body);receipt.snapshot.liquidationType=type;receipt.snapshotSha256=ownRunHash(receipt.snapshot);
 detail.liquidationType=type;detail.rows=[];detail.captures=[];detail.groups=[reportGroup(receipt)];f.query.types=[type];return f;
}
export function mergedJurisdictionFixture(...parts){
 const [first]=parts;return {query:{from:first.query.from,to:first.query.from,types:parts.flatMap(p=>p.query.types)},details:parts.flatMap(p=>p.details),receipts:parts.flatMap(p=>p.receipts)};
}
// Four contracts closed monthly as 42; the first two are also closed as 55 in a supplementary type
// whose captures were not kept. reportFixture(n) yields the same leading contracts for every n.
export function sharedJurisdictionFixture(){return mergedJurisdictionFixture(jurisdictionFixture(4,()=>'42'),retypedJurisdictionFixture(2,()=>'55','supplementary',701));}
// Complete, current, fully documented fiscal census for every monthly contract of the fixture,
// sealed with the real hash. Identity tokens come from the kept monthly captures.
export async function sharedJurisdictionCensus(fixture){
 const period=fixture.query.from,detail=fixture.details.find(d=>d.liquidationType==='monthly'),receipt=fixture.receipts.find(r=>r.snapshot.liquidationType==='monthly'),people=detail.captures.flatMap(c=>c.payload.population.employees),rows=[];
 for(const [index,employee]of receipt.snapshot.employees.entries()){
  const person=people.find(p=>p.contractId===employee.contractId),definition=syntheticFiscalFactsDefinition();definition.fields=Object.fromEntries(FISCAL_FACT_FIELDS.map(n=>[n,n===3?'0002':'0']));
  const source={version:'d'.repeat(64),period,fullPeriod:true,subject:{contractId:employee.contractId,registrationId:uid(index+8000),legajo:'ACTUAL-'+index,employeeName:'Nombre actual exclusivamente sintético '+index,identityToken:person.identityToken,sourceCutoff:null,origin:'MUNICONTROL',registeredAt:'2026-09-01T12:00:00Z'}};
  rows.push({contractId:employee.contractId,configuration:{version:'a'.repeat(64),revision:1,definition,proposalId:uid(index+9000),approvalId:uid(index+10000),identityToken:person.identityToken,sourceVersion:'d'.repeat(64)},source,current:true});
 }
 rows.sort((a,b)=>a.contractId.localeCompare(b.contractId));
 return {version:'own-fiscal-census.v1',period,scopeVersion:'a'.repeat(64),stateVersion:await fiscalFactsHash(rows),rows,complete:true,payrollCalculated:false,payrollPosted:false};
}
