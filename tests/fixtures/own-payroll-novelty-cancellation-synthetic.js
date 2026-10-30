// Standalone source fixtures: no server adapter, payroll engine or SQL constructor.
import {createHash} from 'node:crypto';
import {salarySerialized} from '../../assets/native-salary-catalog-model.js';
export const uid=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
export const hash=value=>createHash('sha256').update(salarySerialized(value)).digest('hex');
export function batch(count=2,patch={}){
 const rows=Array.from({length:count},(_,i)=>{const n=i+1,subject={contractId:uid(n),legajo:String(1000+n),employeeName:'Persona sintética '+n,identityToken:'e'.repeat(64),sourceCutoff:null,origin:'MUNICONTROL',registrationId:uid(10000+n),registeredAt:'2026-10-01T00:00:00Z'};return {values:{rowOrdinal:n,contractId:subject.contractId,legajo:subject.legajo,identityToken:subject.identityToken,conceptSourceId:'120',costCenterSourceId:null,adjustmentMonth:null,quantityDecimal:null,amountCents:'2000',movementType:null,legalInstrument:null,observation:null,forced:false},subject,identityCurrent:true};});
 return {version:'own-payroll-novelty-batch.v1',id:uid(20000),revision:3,status:'approved',periodMonth:'2026-10-01',payrollType:'monthly',rows,rowCount:count,rowsSha256:hash(rows.map(({values,subject})=>({values,subject}))),preparedBy:{membershipId:uid(21001),personId:uid(21002)},decidedBy:{membershipId:uid(21003),personId:uid(21004)},approvals:[{membershipId:uid(21003),personId:uid(21004)}],grhMutation:false,payrollCalculated:false,payrollPosted:false,...patch};
}
