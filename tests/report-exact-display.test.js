import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reportCsv,reportPdf,reportExactShown} from '../assets/report-document.js';
import {ownComparisonDocument,ownComparisonUnit} from '../assets/own-payroll-comparison-model.js';
import {comparisonSources} from './fixtures/own-payroll-comparison-synthetic.js';

// Los informes de liquidación llevan importes exactos como texto para no pasar por números de máquina. En el PDF, que es
// para leer, antes salían como «382692.71» y con la clave interna de la unidad («money»). Estas guardas fijan lo que ve una
// persona (382.692,71 · Pesos) y que CSV y Excel siguen llevando el texto original.
const pdfText=bytes=>[...Buffer.from(bytes).toString('latin1').matchAll(/<([a-f0-9]+)> Tj/gi)].map(m=>Buffer.from(m[1],'hex').toString('latin1')).join(' ');

test('un decimal exacto se muestra con separadores es-AR sin redondear ni recortar',()=>{
 for(const [raw,shown]of[['382692.71','382.692,71'],['3865.94','3.865,94'],['0.01','0,01'],['-0.01','-0,01'],['-1234567.5','-1.234.567,5'],['240000','240.000'],['0','0'],['1.00000000000000001','1,00000000000000001'],['123456789012345678.12345678','123.456.789.012.345.678,12345678']]){
  assert.equal(reportExactShown(raw),shown,raw);
  // Ida y vuelta: quitando los separadores vuelve exactamente el texto original.
  assert.equal(shown.replaceAll('.','').replace(',','.'),raw,raw);
 }
});

test('lo que no es un decimal exacto se deja tal cual: legajos, períodos, textos y vacíos',()=>{
 for(const value of['0901','A/3501','2026-11','No figura','No evaluable','1,5','1e3','.5','5.','',' 12.5','12.5 ',null,undefined,12.5])assert.equal(reportExactShown(value),value);
});

test('la comparación muestra la unidad en palabras y los importes legibles sólo en el PDF',()=>{
 assert.equal(ownComparisonUnit('money'),'Pesos');assert.equal(ownComparisonUnit('hours'),'Horas');assert.equal(ownComparisonUnit('unidad nueva'),'unidad nueva');
 const {base,target}=comparisonSources(1),document=ownComparisonDocument({base,target});
 const exact=document.columns.filter(column=>column.pdfExact).map(column=>column.label);
 assert.deepEqual(exact,['Base exacta','Comparada exacta','Diferencia exacta']);
 const row=document.rows.find(r=>/^\d+\.\d+$/.test(r[4]));assert.ok(row,'hay un importe con decimales en la base sintética');
 assert.doesNotMatch(document.rows.map(r=>r[3]).join(' '),/money|hours/);assert.match(row[3],/ \/ Pesos/);
 // El documento conserva el texto exacto; el CSV lo lleva igual y el PDF lo muestra con coma decimal.
 const csv=reportCsv(document),pdf=pdfText(reportPdf(document));
 assert.ok(csv.includes(row[4]));assert.ok(pdf.includes(reportExactShown(row[4])));assert.notEqual(reportExactShown(row[4]),row[4]);
});

test('los informes propios marcan como exactas sólo las columnas de importes',()=>{
 const model=readFileSync(new URL('../assets/own-payroll-report-model.js',import.meta.url),'utf8');
 assert.match(model,/const text=label=>\(\{label,type:'text',width:24,\.\.\.\(\/exact\[oa\]s\?\\b\/\.test\(label\)\?\{pdfExact:true\}:\{\}\)\}\)/);
 const positions=readFileSync(new URL('../assets/position-comparison-model.js',import.meta.url),'utf8');
 assert.match(positions,/\['Presupuestados','Acreditados del alcance','Diferencia del alcance','Cantidad declarada'\]\.includes\(label\)\?\{pdfExact:true\}/);
 const shared=readFileSync(new URL('../assets/report-document.js',import.meta.url),'utf8');
 // CSV y Excel no usan la forma de lectura: sólo el PDF pasa por `shown`.
 assert.equal(shared.split('reportExactShown(').length-1,5,'la celda del PDF, los tres totales del encabezado y la conciliación de la primera hoja');
});
