// Synthetic source only: no municipal rows or identities.
export function syntheticCostReport() {
  const amounts = {701:'70.00',703:'100.00',990:'170.08',993:'1000.00',994:'50.00',995:'25.00',996:'200.00',999:'876.00'};
  const rows = [...Array.from({length:83},(_,i)=>({code:String(i+1),description:'Concepto sintético de prueba '+(i+1),totalGroup:'993',amount:'12.00'})),
    ...Object.entries(amounts).map(([code,amount])=>({code,amount,description:'Concepto de control '+code,totalGroup:['701','703'].includes(code)?'990':'0'}))]
    .map(r=>({...r,sourceRows:2,missingAmounts:0,unit:null}));
  return {version:'payroll-source-report.v1',mode:'report',found:true,official:false,
    datasetId:'00000000-0000-4000-8000-000000000001',payloadHash:'a'.repeat(64),reportHash:'b'.repeat(64),
    date:'2026-08-31',type:'M',statementCount:2,lineCount:rows.length*2,sourceLabel:'Fuente sintética QA · sin datos municipales',closureStatus:'unknown',rows};
}
