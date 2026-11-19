// Synthetic visual-QA corpus. Never uses payroll production or sends receipts to employees.
import {mkdirSync,writeFileSync} from 'node:fs';
import {reportPdf} from '../assets/report-document.js';
import {createReportPdf} from '../assets/absence-report-pdf.js';
import {ownReceiptPages} from '../assets/own-payroll-receipt-pdf.js';
import {encodePayrollPages} from '../assets/payroll-detail-export.js';
import {receiptSnapshot} from '../tests/fixtures/own-payroll-receipt-synthetic.js';
import {budgetStructurePdf} from '../assets/budget-structure-pdf.js';
import {parseBudgetStructure} from '../assets/budget-structure-model.js';
import {syntheticStructurePages} from './budget-structure-synthetic.mjs';

export function qaPdfProSamples(){
 const long='DOCUMENTACION-LARGA-SIN-CORTES-'.repeat(8);
 const report={layout:'pdf-pro-qa.v1',filename:'municontrol_qa_reporte',title:'Detalle nominal de nómina sintética y conciliación de importes',
  columns:[{label:'Legajo',type:'text',width:13},{label:'Concepto y descripción original',type:'text',width:28},
   {label:'Bruto ARS',type:'money',width:18,align:'right'},{label:'Retenciones ARS',type:'money',width:20,align:'right'},
   {label:'Neto ARS',type:'money',width:18,align:'right'},{label:'Estado',type:'text',width:15}],
  rows:Array.from({length:68},(_,i)=>[String(1000+i),'Concepto administrativo de prueba '+(i%9===0?long:'sin alteración de fuentes'),
   '1234567.89','1234.56','1233333.33','Revisión documental']),
  totals:[],metadata:[['Período','2026-10'],['Fuente','QA sintética'],['Estado','Consulta']],notes:['Los importes son sintéticos, sin efecto contable. Las etiquetas largas se reproducen completas.']};
 const abs=createReportPdf({title:'Ausentismo · control de calidad',subtitle:'Período octubre 2026',footer:'Prueba visual sin datos reales'})
  .heading('Indicadores de asistencia').kpis([{label:'Registros',value:'68'},{label:'Período',value:'Octubre 2026'}])
  .text('Reporte sintético para revisar la continuidad de las tablas, los nombres de origen y el pie de cada página.')
  .table([{label:'Legajo',weight:1},{label:'Descripción del motivo y trazabilidad',weight:4},{label:'Días',weight:1,align:'right'}],
   Array.from({length:68},(_,i)=>[String(1000+i),i===0?long:'Motivo documentado con detalles de prueba número '+i,String((i%5)+1)]));
 const receipt=receiptSnapshot(2);
 const source=receipt.sources[0],record=receipt.records[0];
 const budget=parseBudgetStructure(syntheticStructurePages(),{sha256:'a'.repeat(64)});
 return new Map([
  ['report-general',reportPdf(report)],
  ['absence-report',abs.bytes()],
  ['receipt-preview',encodePayrollPages(ownReceiptPages(record,receipt.params,source,{state:'prepared'}))],
  ['budget-structure',budgetStructurePdf(budget,{mode:'detailed'})],
 ]);
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const dir=new URL('../out/pdf-pro/',import.meta.url);mkdirSync(dir,{recursive:true});
 for(const [name,bytes] of qaPdfProSamples()){writeFileSync(new URL(name+'.pdf',dir),bytes);console.log(name+': '+bytes.byteLength+' bytes');}
}
