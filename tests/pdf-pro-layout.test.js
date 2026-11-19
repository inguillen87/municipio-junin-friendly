import test from 'node:test';
import assert from 'node:assert/strict';
import {qaPdfProSamples} from '../scripts/qa-pdf-pro.mjs';
import {reportPdf,reportCsv,reportXlsx} from '../assets/report-document.js';
import {ownReceiptPages} from '../assets/own-payroll-receipt-pdf.js';
import {receiptSnapshot} from './fixtures/own-payroll-receipt-synthetic.js';
import {createReportPdf} from '../assets/absence-report-pdf.js';
const textNodes = pdf => [...Buffer.from(pdf).toString('latin1').matchAll(/<([0-9a-f]+)> Tj/g)]
 .map(m => Buffer.from(m[1],'hex').toString('latin1'));
const countPages = pdf => (Buffer.from(pdf).toString('latin1').match(/\/Type \/Page \/Parent/g) || []).length;
const allText=pdf=>textNodes(pdf).join('');
test('QA visual: cuatro PDF sintéticos reales, integridad y cantidad de páginas',()=>{
 const files=qaPdfProSamples();
 assert.deepEqual([...files.keys()],['report-general','absence-report','receipt-preview','budget-structure']);
 for(const [name,pdf] of files){
  const raw=Buffer.from(pdf).toString('latin1');
  assert.ok(raw.startsWith('%PDF-1.4'),name);
  assert.ok(raw.endsWith('%%EOF\n'),name);
  assert.ok(countPages(pdf)>=1,name);
 }
 assert.ok(countPages(files.get('report-general'))>1,'la tabla de nómina debe paginar');
 assert.ok(countPages(files.get('absence-report'))>1,'la tabla de ausentismo debe paginar');
 assert.ok(countPages(files.get('budget-structure'))>1,'el presupuesto debe paginar');
});
test('reporte general: encabezado por página, orientado en horizontal, pie con total y fecha, valores sin alterar',()=>{
 const pdf=qaPdfProSamples().get('report-general'),bytes=Buffer.from(pdf).toString('latin1'),n=countPages(pdf),texts=allText(pdf);
 assert.ok(bytes.includes('/MediaBox [0 0 842 595]'));
 assert.equal(textNodes(pdf).filter(t=>t==='MuniControl | Centro de reportes').length,n);
 for(let i=1;i<=n;i++)assert.ok(texts.includes('Página '+i+' de '+n),'footer page '+i);
 assert.ok(texts.includes('Emitido '));
 assert.ok(texts.includes('1.234.567,89'),'el importe original permanece');
});
test('ausentismo: cada línea larga sobrevive sin elipsis y con cabeceras repetidas',()=>{
 const pdf=qaPdfProSamples().get('absence-report'),n=countPages(pdf),texts=allText(pdf),long='DOCUMENTACION-LARGA-SIN-CORTES-'.repeat(8);
 assert.ok(texts.includes(long),'el texto sin espacios debe conservarse entero en la tabla');
 assert.equal(textNodes(pdf).filter(t=>t==='Ausentismo · control de calidad').length,n);
 assert.ok(texts.includes('Emitido '));
 for(let i=1;i<=n;i++)assert.ok(texts.includes('Página '+i+' de '+n));
 assert.ok(texts.includes('1067'),'última fila no se pierde');
});
test('recibo: identidad, neto y número de página; origen económico inmutable',()=>{
 const source=receiptSnapshot(2),prior=JSON.stringify(source);
 const pages=ownReceiptPages(source.records[0],source.params,source.sources[0],{state:'prepared'}),texts=pages.map(p=>p.join('\n')).join('\n');
 assert.equal(JSON.stringify(source),prior);
 assert.equal(pages.length>=1,true);
 assert.ok(texts.includes('PDF generado')===false,'el PDF guarda texto hex, no texto sin codificar');
 const printable=pages.flatMap(p=>p.flatMap(line=>[...line.matchAll(/<([0-9a-f]+)> Tj/g)].map(m=>Buffer.from(m[1],'hex').toString('latin1'))));
 assert.equal(printable.filter(t=>t==='RECIBO DE HABERES').length,pages.length);
 // This synthetic sample uses a V1–V5 receipt: frozen bytes keep the historical footer.
 for(let i=1;i<=pages.length;i++)assert.ok(printable.includes(i+' / '+pages.length));
 assert.ok(!printable.some(t=>/PDF generado|Emitido /.test(t)),'no wall-clock date in receipts');
 assert.ok(printable.includes('Neto'));
});
test('presupuesto: cada hoja mantiene los títulos y la fuente, nombres y legajos',()=>{
 const pdf=qaPdfProSamples().get('budget-structure'),n=countPages(pdf),texts=allText(pdf);
 assert.equal(textNodes(pdf).filter(t=>t==='Estructura presupuestaria de cargos').length,n);
 assert.ok(texts.includes('SHA-256 del PDF fuente'));
 assert.ok(texts.includes('PERSONA QA 030'));
 assert.ok(texts.includes('0001'));
 for(let i=1;i<=n;i++)assert.ok(texts.includes('Página '+i+' de '+n));
});
test('la presentación PDF nunca modifica filas ni bytes CSV/XLSX',()=>{
 const d={layout:'pdf-pro-qa.v1',filename:'municontrol_qa_stable',title:'Totales sintéticos',
  columns:[{label:'Concepto',type:'text',width:20},{label:'Importe',type:'money',width:20,align:'right'}],
  rows:[['Total','1234.56'],['Conservado','0.01']],totals:[],metadata:[],notes:[]};
 const before=JSON.stringify(d),csv=reportCsv(d),xlsx=reportXlsx(d);
 const pdf=reportPdf(d),text=allText(pdf);
 assert.equal(JSON.stringify(d),before);assert.equal(reportCsv(d),csv);
 assert.deepEqual(reportXlsx(d),xlsx);
 assert.ok(Buffer.from(pdf).toString('latin1').includes('0.87 0.95 0.93 rg'));
 assert.ok(text.includes('1.234,56'));
});

test('ausentismo: «Total general» (con espacio) recibe banda de total sin modificar la celda',()=>{
 const pdf=createReportPdf({title:'QA de totales'}).table(
  [{label:'Detalle',weight:3},{label:'Cantidad',weight:1,align:'right'}],
  [['Detalle individual','7'],['Total general','7']]
 ).bytes();
 const bytes=Buffer.from(pdf).toString('latin1');
 assert.ok(bytes.includes('0.898 0.953 0.937 rg'),'RGB del total con separación por espacio');
 assert.ok(allText(pdf).includes('Total general'));
 assert.ok(allText(pdf).includes('7'));
});
