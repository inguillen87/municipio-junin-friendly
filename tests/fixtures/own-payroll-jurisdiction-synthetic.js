import {reportFixture,reportGroup} from './own-payroll-report-synthetic.js';
import {ownCloseSnapshot} from '../../assets/own-payroll-close-model.js';
import {ownRunHash} from '../../lib/internal-own-payroll-run.js';
import {uid} from './own-payroll-program-synthetic.js';
export function jurisdictionFixture(count=61,choice=i=>i%2?'55':'42'){
 const f=reportFixture(count),d=f.details[0];d.version='own-close-detail.v2';
 for(const capture of d.captures){capture.payload.sourceInventory.jurisdictions={version:'own-run-jurisdictions.v1',complete:true,total:count,rows:capture.payload.population.employees.map((e,i)=>({contractId:e.contractId,employeeNumber:e.employeeNumber,registrationId:uid(4000+i),identityToken:e.identityToken,jurisdictionCode:choice(i)}))};capture.payloadSha256=ownRunHash(capture.payload);}
 for(const row of d.rows)Object.assign(row,{state:'confirmed',groupId:null,canClose:true});
 const r=f.receipts[0];r.snapshot=ownCloseSnapshot(d,{kind:'all',values:[]});r.snapshotSha256=ownRunHash(r.snapshot);d.groups=[reportGroup(r)];
 for(const row of d.rows)Object.assign(row,{state:'closed',groupId:r.groupId,canClose:false});return f;
}
