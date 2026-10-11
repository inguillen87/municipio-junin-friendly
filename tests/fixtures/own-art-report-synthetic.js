import {reportFixture} from './own-payroll-report-synthetic.js';
import {ownRunHash} from '../../lib/internal-own-payroll-run.js';
import {uid} from './own-payroll-program-synthetic.js';
import {decimal,exactEvidence} from '../../assets/own-payroll-exact.js';
export const artFixtureHash=ownRunHash;
const cuil=dni=>{const b='20'+dni,r=11-[5,4,3,2,7,6,5,4,3,2].reduce((n,w,i)=>n+w*Number(b[i]),0)%11;return b+(r===11?'0':r===10?'9':String(r));};
export function rehashArtFixture(v){for(const g of v.content.groups){g.snapshotSha256=ownRunHash(g.snapshot);g.bodySha256=ownRunHash(g.body);}v.sourceVersion=ownRunHash(v.content);return v;}
export function ownArtFixture(count=61){
 const g=reportFixture(count).receipts[0],s=g.snapshot;s.version='own-close-snapshot.v2';
 for(const [i,e]of s.employees.entries()){e.jurisdiction={code:i%2?'55':'42',basis:'captured_own_registration',sourceSha256:'a'.repeat(64)};
  for(const [code,amount]of[['993','100.01'],['995','0.02']]){const value=exactEvidence(decimal(amount));s.concepts.push({...s.concepts.find(r=>r.contractId===e.contractId),conceptCode:code,nature:'auxiliary',amount,exactValue:value,rounding:{precision:2,mode:'exact'},dependencies:[],trace:[{operation:'literal',reference:null,stage:null,result:value}]});e.conceptCount++;}
 }s.conceptCount=s.concepts.length;
 const people=s.employees.map((e,i)=>{const dni=String(99010000+i);return {contractId:e.contractId,personId:uid(i+3000),registrationId:uid(i+4000),employeeNumber:e.employeeNumber,name:'Agente exclusivamente sintético QA '+i,dni,cuil:cuil(dni),sex:i%2?'F':'M',identityToken:'a'.repeat(64),days:{version:'b'.repeat(64),revision:1,definition:{workedDays:i===0?'0':'23',asOfDate:s.period+'-01',documentReference:'Constancia exclusivamente sintética QA'},proposalId:uid(i+5000),approvalId:uid(i+6000),identityToken:'a'.repeat(64),sourceVersion:'c'.repeat(64)},daysCurrent:true};});
 return rehashArtFixture({version:'own-art-preview.v1',scopeVersion:'a'.repeat(64),sourceVersion:'b'.repeat(64),content:{version:'own-art-source.v1',params:{period:s.period,types:[s.liquidationType]},groups:[g],people,sourceRecordCount:count,complete:true,origin:'MUNICONTROL'}});
}
