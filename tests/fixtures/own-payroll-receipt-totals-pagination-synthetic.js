import {ownReceiptRecord,ownReceiptParams} from '../../assets/own-payroll-receipt-model.js';

// The same eight concept nature/unit/amount combinations as the browser witness.
// This finite record needs no calculator, source constructor or SQL fixture.
const uid=n=>'11111111-1111-4111-8111-'+String(n).padStart(12,'0');
export function ownReceiptTotalsPaginationFixture(){
 const combinations=[
  ['remuneration','money','100.12345678'],
  ['non_remuneration','money','0.00000000'],
  ['deduction','money','-1.00000000'],
  ['employer_contribution','money','20.00000000'],
  ['auxiliary','days','0.00000000'],
  ['auxiliary','hours','2.12345678'],
  ['auxiliary','percent','67.00000000'],
  ['auxiliary','constructor','3.00000000'],
 ];
 const record={sourceGroupId:uid(1),contractId:uid(2),personId:uid(3),registrationId:uid(4),employeeNumber:'900000001',name:'Agente sintético 0',dni:'99000100',cuil:'20999999906',agreementCode:'1',departmentCode:'1',runId:uid(5),liquidationVersion:1,precision:8,
  totals:{remuneration:'100.12345678',non_remuneration:'0.00000000',deduction:'-1.00000000',employer_contribution:'20.00000000',gross:'100.12345678',net:'101.12345678'},
  concepts:combinations.map(([nature,unit,amount],index)=>({code:String(8000+index),label:'Descripción histórica sintética '+index+' conservada sin reemplazos',nature,unit,amount,labelSourceSha256:'a'.repeat(64)}))};
 const params={period:'2026-10',types:['monthly'],filters:{employeeFrom:'',employeeTo:'',departmentFrom:'',departmentTo:'',agreementFrom:'',agreementTo:''},issuer:{name:'Municipio de ensayo sintético',taxId:'30990000001',address:'Domicilio inventado 123'},paymentDate:null,legend:''};
 ownReceiptRecord(record);ownReceiptParams(params);
 return{record,params,source:{id:uid(1),period:'2026-10',type:'monthly',snapshotSha256:'b'.repeat(64)}};
}
