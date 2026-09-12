/** Synthetic responses only: no real identity, account, wage rule or database seed. */
export const SOURCE_IDS=Array.from({length:6},(_,i)=>String(i+1).padStart(8,'0')+'-0000-4000-8000-000000000058');
export function sourcePickerFixtures(){
 const dates=['2026-08-31','2026-08-31','2026-07-31','2026-06-30','2025-12-31','2026-07-15'];
 const types=['M','M','M','S','X','P'],closures=['unknown','open','closed','closed','unknown','closed'];
 const reports=SOURCE_IDS.map((datasetId,i)=>({version:'payroll-source-report.v1',mode:'report',official:false,found:true,
  datasetId,date:dates[i],type:types[i],closureStatus:closures[i],statementCount:2,lineCount:6,
  sourceLabel:i<2?'Corte SINTÉTICO agosto':'Conjunto SINTÉTICO '+(i+1),payloadHash:String(i+1).repeat(64),reportHash:String(i+7).repeat(64).slice(0,64),
  rows:[{code:'1',description:'Haber sintético',totalGroup:'993',unit:null,sourceRows:2,missingAmounts:0,amount:'1000.10'},
   {code:'601',description:'Descuento sintético para revisión',totalGroup:'996',unit:null,sourceRows:2,missingAmounts:0,amount:'20.05'},
   {code:'994',description:'Total no remunerativo sintético sin importe',totalGroup:'0',unit:null,sourceRows:2,missingAmounts:1,amount:null}]
 }));
 const keys=['datasetId','date','type','closureStatus','statementCount','lineCount','sourceLabel','payloadHash'];
 return {reports,catalog:{version:'payroll-source-report.v1',mode:'catalog',official:false,total:6,truncated:false,items:reports.map(r=>Object.fromEntries(keys.map(key=>[key,r[key]])))}};
}
