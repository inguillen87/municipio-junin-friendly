import {receiptBatch} from './own-payroll-receipt-synthetic.js';
import {syntheticCbu, syntheticBankAccountsBootstrap, syntheticBankAccountsDefinition} from './own-bank-accounts-synthetic.js';
import {uid,hash} from './own-payroll-program-synthetic.js';
import {validCuil} from '../../assets/native-employee-contract.js';
import {ownRunHash} from '../../lib/internal-own-payroll-run.js';
import {closeDetail,closeReceipt} from './own-payroll-close-synthetic.js';
import {ownCloseSnapshot} from '../../assets/own-payroll-close-model.js';
export function syntheticTaxId(base) { for(let i=0;i<10;i++)if(validCuil(base+i))return base+i;throw Error('Invalid synthetic base'); }
export function bankOutputFixture(count=35) {
  const batch=receiptBatch(count);batch.state='approved';batch.permissions.canApprove=false;batch.review={id:uid(810),decision:'approved',at:'2026-10-09T12:00:00Z',by:'Revisor ficticio',reason:'Revisión independiente exclusivamente sintética'};
  batch.snapshot.params.issuer.taxId=syntheticTaxId('3099000000');
  for(const r of batch.snapshot.records)r.cuil=syntheticTaxId('20'+r.dni.padStart(8,'0'));
  batch.snapshotSha256=ownRunHash(batch.snapshot);
  const accounts=syntheticBankAccountsBootstrap();accounts.sources.contracts=batch.snapshot.records.map(r=>({contractId:r.contractId,registrationId:r.registrationId,employeeNumber:r.employeeNumber,name:r.name}));
  accounts.configuration={version:hash('c'),revision:1,proposalId:uid(900),approvalId:uid(901),definition:{accounts:batch.snapshot.records.map((r,i)=>({...syntheticBankAccountsDefinition().accounts[0],id:uid(40000+i),contractId:r.contractId,cbu:syntheticCbu('9990001',String(i+1).padStart(13,'0')),validFrom:'2026-01-01'}))}};
  const profile={jurisdictionCode:'42',payerCbu:syntheticCbu('0110001'),currency:'ARS',compensationDate:'2026-10-08',creditDate:'2026-10-09',agreementCode:'00004455',sendNumber:'000001',information:'PRUEBA SINTETICA',loanIdentifier:'0000',calendarConfirmed:true,allowRepeatedDestinations:false};
  const snapshot=ownCloseSnapshot(closeDetail(count),{kind:'all',values:[]});snapshot.version='own-close-snapshot.v2';for(const e of snapshot.employees)e.jurisdiction={code:'42',basis:'captured_own_registration',sourceSha256:hash('f')};
  const closes=[closeReceipt({snapshot,snapshotSha256:ownRunHash(snapshot)})];batch.snapshot.sources[0].snapshotSha256=closes[0].snapshotSha256;batch.snapshotSha256=ownRunHash(batch.snapshot);
  return {batch,accounts,profile,closes};
}
export function syntheticNet(fixture, net) {
  const {batch,closes}=fixture;
  const r=batch.snapshot.records[0],precision=net.split('.')[1]?.length??0,zero=precision?'0.'+'0'.repeat(precision):'0';r.precision=precision;
  let found=false;for(const c of r.concepts){if(c.nature==='remuneration'&&!found){c.amount=net;found=true;}else c.amount=zero;}
  r.totals={remuneration:net,non_remuneration:zero,deduction:zero,employer_contribution:zero,gross:net,net};
  const s=closes[0].snapshot; if(s.employeeCount!==1)throw Error('This edge fixture declares exactly one saved net.');
  s.precision=precision;s.totals={...r.totals};s.employees[0].precision=precision;s.employees[0].totals={contractId:r.contractId,...r.totals};for(const c of s.concepts)c.amount=r.concepts.find(v=>v.code===c.conceptCode).amount;
  closes[0].snapshotSha256=ownRunHash(s);batch.snapshot.sources[0].snapshotSha256=closes[0].snapshotSha256;batch.snapshotSha256=ownRunHash(batch.snapshot);return fixture;
}
