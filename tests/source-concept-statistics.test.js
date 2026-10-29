// Proposed synthetic regressions for the source-concept statistic. Not executed by this author.
import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {sourceConceptStatistics,sourceConceptStatisticsDocument,safeCurrencyExact,sourceSalaryCost,sourceReportDocument} from '../assets/payroll-source-report-model.js';
import {reportPdf,reportXlsx} from '../assets/report-document.js';
const row=(code,totalGroup,amount,sourceRows=1,missingAmounts=0)=>({code,totalGroup,amount,sourceRows,missingAmounts,description:'Concepto sintético '+code,unit:null});
const report=(rows,extra={})=>({version:'payroll-source-report.v1',mode:'report',found:true,official:false,
 datasetId:'11111111-1111-4111-8111-111111111111',payloadHash:'a'.repeat(64),reportHash:'b'.repeat(64),
 date:'2026-09-30',type:'M',closureStatus:'closed',sourceLabel:'Fuente sintética local',statementCount:3,
 lineCount:rows.reduce((sum,value)=>sum+value.sourceRows,0),rows,...extra});
const basicRows=()=>[
 row('1','993','60.74',2),row('2','993','40.00'),row('110','994','20.21'),row('210','995','5.00'),
 row('701','990','6.00',2),row('703','990','4.00'),row('510','996','12.02',2),
 row('993','0','100.00',3),row('994','0','20.00',3),row('995','0','5.00',3),
 row('990','0','10.03',3),row('996','0','12.00',3),row('999','0','113.00',3),
];
const fixture=()=>report(basicRows());
const changed=(code,values)=>report(basicRows().map(value=>value.code===code?{...value,...values}:value));
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};

// The fixture values are synthetic; none are copied from a municipal payroll.
test('source component statistics keep 993/994 differences exact and conserve the old totalizers separately',()=>{
 const raw=fixture(),before=JSON.stringify(raw),value=sourceConceptStatistics(raw);
 assert.equal(value.version,'source-concept-statistics.v1');assert.equal(value.scope,'complete-dataset');
 assert.equal(value.basis,'classified-source-components');assert.deepEqual(value.groupOrder,['993','994','995','990','996']);
 assert.equal(value.groups['993'].amount,'100.74');assert.equal(value.groups['993'].storedTotalizer.amount,'100.00');assert.equal(value.groups['993'].difference,'0.74');
 assert.equal(value.groups['994'].amount,'20.21');assert.equal(value.groups['994'].storedTotalizer.amount,'20.00');assert.equal(value.groups['994'].difference,'0.21');
 assert.equal(value.groups['995'].difference,'0.00');assert.equal(value.groups['990'].amount,'10.00');assert.equal(value.groups['990'].difference,'-0.03');
 assert.equal(value.groups['996'].amount,'12.02');assert.equal(value.groups['996'].difference,'0.02');
 assert.deepEqual(value.totals,{gross:'125.95',contributions:'10.00',withholdings:'12.02',cost:'135.95',net:'113.93',storedNet:'113.00',netDifference:'0.93'});
 assert.equal(value.official,false);assert.equal(value.payrollModified,false);assert.equal(value.individualReconciliationProven,false);
 assert.equal(JSON.stringify(raw),before);assert.equal(sourceSalaryCost(raw).amount,'135.00','the existing stored-totalizer cost remains unchanged');
});

test('all ten totalizer codes stay outside components even if their metadata claims a component group',()=>{
 const raw=report([...basicRows().map(value=>Number(value.code)>=990?{...value,totalGroup:'993'}:value),
 ...['991','992','997','998'].map(code=>row(code,'993','999.99',3))]);
 const value=sourceConceptStatistics(raw);
 assert.equal(value.groups['993'].amount,'100.74');assert.deepEqual(value.groups['993'].codes,['1','2']);
 assert.equal(value.counts.totalizerConceptCount,10);assert.equal(value.counts.totalizerOccurrences,30);
 assert.equal(value.counts.classifiedConceptCount,7);assert.equal(value.counts.classifiedOccurrences,10);
 assert.equal(value.counts.unclassifiedConceptCount,0);assert.equal(value.counts.sourceOccurrences,40);
});

test('negative source components and differences retain their sign without rounding',()=>{
 const value=sourceConceptStatistics(changed('1',{amount:'-60.74'}));
 assert.equal(value.groups['993'].amount,'-20.74');assert.equal(value.groups['993'].difference,'-120.74');
 assert.equal(value.totals.gross,'4.47');assert.equal(value.totals.cost,'14.47');assert.equal(value.totals.net,'-7.55');
 assert.equal(safeCurrencyExact(value.totals.net),'$ -7,55');
});

test('an explicit zero component is available while an absent group is unknown rather than zero',()=>{
 const zero=sourceConceptStatistics(changed('210',{amount:'0.00'}));
 assert.equal(zero.groups['995'].status,'available');assert.equal(zero.groups['995'].amount,'0.00');assert.equal(zero.totals.gross,'120.95');
 const absent=sourceConceptStatistics(report(basicRows().filter(value=>value.code!=='210')));
 assert.equal(absent.groups['995'].status,'missing');assert.equal(absent.groups['995'].amount,null);
 assert.equal(absent.groups['995'].storedTotalizer.amount,'5.00');assert.equal(absent.groups['995'].difference,null);
 assert.equal(absent.totals.gross,null);assert.equal(absent.totals.cost,null);assert.equal(absent.totals.net,null);
 assert.equal(absent.totals.contributions,'10.00');assert.equal(absent.totals.withholdings,'12.02');
});

test('one unknown amount invalidates the whole affected component group and every dependent total',()=>{
 const value=sourceConceptStatistics(changed('2',{amount:null,missingAmounts:1}));
 assert.equal(value.groups['993'].status,'incomplete');assert.equal(value.groups['993'].missingAmounts,1);
 assert.equal(value.groups['993'].conceptCount,2);assert.equal(value.groups['993'].occurrences,3);assert.equal(value.groups['993'].amount,null);
 assert.equal(value.groups['993'].difference,null);assert.equal(value.totals.gross,null);assert.equal(value.totals.cost,null);assert.equal(value.totals.net,null);
 assert.equal(value.groups['994'].amount,'20.21');
});

test('an absent or incomplete totalizer does not remove the complete source-component sum',()=>{
 for(const raw of [report(basicRows().filter(value=>value.code!=='993')),changed('993',{amount:null,missingAmounts:1})]){
  const value=sourceConceptStatistics(raw);assert.equal(value.groups['993'].amount,'100.74');assert.equal(value.groups['993'].status,'available');
  assert.equal(value.groups['993'].storedTotalizer.amount,null);assert.equal(value.groups['993'].difference,null);assert.equal(value.totals.gross,'125.95');
 }
 const absent=sourceConceptStatistics(report(basicRows().filter(value=>value.code!=='993')));
 assert.deepEqual(absent.groups['993'].storedTotalizer,{code:'993',present:false,amount:null,occurrences:null,missingAmounts:null});
 const incomplete=sourceConceptStatistics(changed('993',{amount:null,missingAmounts:1}));
 assert.equal(incomplete.groups['993'].storedTotalizer.present,true);assert.equal(incomplete.groups['993'].storedTotalizer.missingAmounts,1);
});

test('unknown and non-string groups are counted without inferring classification from description or code',()=>{
 const raw=report([...basicRows(),{...row('600','777','999.99'),description:'Haber remunerativo'},row('601',993,'777.00'),row('602',null,'1.00')]);
 const value=sourceConceptStatistics(raw);
 assert.equal(value.groups['993'].amount,'100.74');assert.equal(value.totals.cost,'135.95');
 assert.deepEqual(value.unclassifiedCodes,['600','601','602']);assert.equal(value.counts.unclassifiedConceptCount,3);assert.equal(value.counts.unclassifiedOccurrences,3);
 assert.match(sourceConceptStatisticsDocument(raw).notes.join(' '),/3 conceptos sin clasificación/);
});

test('sourceRows are occurrences and never become a fabricated unique-person count',()=>{
 const raw=report(basicRows().map(value=>['1','2'].includes(value.code)?{...value,sourceRows:3}:value));
 const value=sourceConceptStatistics(raw);
 assert.equal(value.counts.datasetStatementCount,3);assert.equal(value.groups['993'].occurrences,6);
 for(const key of ['legajos','uniqueEmployees','uniqueContracts','statementCoverage'])assert.equal(Object.hasOwn(value.groups['993'],key),false);
 assert.equal(value.counts.classifiedOccurrences+value.counts.unclassifiedOccurrences+value.counts.totalizerOccurrences,value.counts.sourceOccurrences);
 assert.match(sourceConceptStatisticsDocument(raw).notes.join(' '),/no legajos únicos/);
});

test('component sums remain exact beyond 2^53 cents and with sixteen integer digits',()=>{
 const rows=Array.from({length:997},(_,index)=>row(String(1000+index),'993','9999999999999.99'));
 rows.push(row('2000','994','0.01'),row('2001','995','0.01'),row('2002','990','0.01'));
 const raw=report(rows,{statementCount:1}),value=sourceConceptStatistics(raw);
 assert.equal(value.groups['993'].amount,'9969999999999990.03');assert.equal(value.groups['993'].conceptCount,997);
 assert.equal(value.totals.gross,'9969999999999990.05');assert.equal(value.totals.cost,'9969999999999990.06');assert.equal(value.totals.net,null);
 assert.equal(safeCurrencyExact(value.groups['993'].amount),'$ 9.969.999.999.999.990,03');
 const doc=sourceConceptStatisticsDocument(raw),zip=unzipSync(reportXlsx(doc));
 assert.ok(strFromU8(zip['xl/worksheets/sheet1.xml']).includes('$ 9.969.999.999.999.990,03'));
 assert.ok(strFromU8(zip['xl/worksheets/sheet3.xml']).includes('$ 9.969.999.999.999.990,06'));
});

test('complete-source validation rejects filtered, duplicate or malformed reports before returning statistics',()=>{
 const raw=fixture();
 assert.throws(()=>sourceConceptStatistics({...raw,rows:raw.rows.slice(1)}),/completo/);
 assert.throws(()=>sourceConceptStatistics({...raw,rows:[...raw.rows,raw.rows[0]]}),/inválido/);
 for(const amount of [0.1,'1.1','1e2','NaN','10000000000000.00'])assert.throws(()=>sourceConceptStatistics(changed('1',{amount})));
 assert.throws(()=>sourceConceptStatistics(changed('1',{missingAmounts:1})),/inválido/);
 assert.throws(()=>sourceConceptStatistics(changed('993',{missingAmounts:1})),/inválido/,'a partial non-null stored totalizer fails the existing DTO validator');
 assert.throws(()=>sourceConceptStatistics({version:raw.version,mode:'catalog',official:false,items:[],total:0,truncated:false}),/Consultá una liquidación/);
 assert.throws(()=>sourceConceptStatistics({version:raw.version,mode:'report',official:false,found:false}),/Consultá una liquidación/);
});

test('detail filters, a frozen input and the current stored-totalizer document leave the full statistic unchanged',()=>{
 const raw=freeze(fixture()),before=JSON.stringify(raw),statistics=sourceConceptStatistics(raw);
 const detail=sourceReportDocument(raw,{group:'discounts',search:'510'});
 assert.equal(detail.rows.length,1);assert.equal(detail.salaryCost.amount,'135.00');
 assert.deepEqual(sourceConceptStatistics(raw,{group:'discounts',search:'nothing'}),statistics);
 assert.deepEqual(sourceConceptStatisticsDocument(raw,{group:'totals',search:'nothing'}),sourceConceptStatisticsDocument(raw));
 assert.equal(JSON.stringify(raw),before);
});

test('the statistic document exports five full-source groups in four exact textual columns',()=>{
 const raw=fixture(),doc=sourceConceptStatisticsDocument(raw);
 assert.equal(doc.columns.length,4);assert.ok(doc.columns.every(column=>column.type==='text'));assert.equal(doc.rows.length,5);assert.deepEqual(doc.totals,[]);
 assert.deepEqual(doc.rows[0],['993 - Haberes remunerativos','$ 100,74','$ 100,00','$ +0,74']);
 assert.deepEqual(doc.rows[1],['994 - Haberes no remunerativos','$ 20,21','$ 20,00','$ +0,21']);
 assert.equal(doc.filename,'municontrol_source_statistics_2026-09-30_m');assert.equal(doc.salaryCost,undefined);
 assert.ok(doc.metadata.length<=30);assert.ok(doc.notes.length<=10);
 for(const [label,value]of [['Conjunto',raw.datasetId],['SHA-256 del reporte',raw.reportHash],['Huella de conjunto',raw.payloadHash],['Costo desde conceptos clasificados','$ 135,95'],['Neto desde conceptos clasificados','$ 113,93']])assert.ok(doc.metadata.some(pair=>pair[0]===label&&pair[1]===value),label);
 assert.match(doc.notes.join(' '),/no modifica la fuente ni demuestra su causa/);assert.match(doc.notes.join(' '),/no es una presentación fiscal/);
 const pdf=new TextDecoder('latin1').decode(reportPdf(doc));assert.match(pdf,/\/MediaBox \[0 0 595 842\]/);
 for(const value of [raw.date,raw.datasetId,raw.reportHash,raw.payloadHash,'135,95','113,93'])assert.ok(pdf.includes(Buffer.from(value,'latin1').toString('hex')),'PDF must retain exact scope/total '+value);
 assert.ok((pdf.match(/\/Type \/Page /g)||[]).length<=2,'the complete five-group statistic remains compact');
 const zip=unzipSync(reportXlsx(doc)),xml=strFromU8(zip['xl/worksheets/sheet1.xml']);
 assert.match(xml,/t="inlineStr"/);assert.ok(xml.includes('$ +0,74'));assert.ok(xml.includes('$ 100,74'));
});

test('the document keeps missing groups and missing totalizers distinct from explicit zero amounts',()=>{
 const missing=sourceConceptStatisticsDocument(report(basicRows().filter(value=>!['210','995'].includes(value.code))));
 assert.deepEqual(missing.rows[2],['995 - Asignaciones familiares','No informado','No informado','No informado']);
 const zero=sourceConceptStatisticsDocument(report(basicRows().map(value=>['210','995'].includes(value.code)?{...value,amount:'0.00'}:value)));
 assert.deepEqual(zero.rows[2],['995 - Asignaciones familiares','$ 0,00','$ 0,00','$ 0,00']);
});

test('safeCurrencyExact accepts bounded decimal strings, preserves cents and never uses binary-money conversion',()=>{
 assert.equal(safeCurrencyExact('1234567890123456.78'),'$ 1.234.567.890.123.456,78');
 assert.equal(safeCurrencyExact('-0.01'),'$ -0,01');assert.equal(safeCurrencyExact('0.00',{signed:true}),'$ 0,00');
 assert.equal(safeCurrencyExact('0000123.40',{signed:true}),'$ +123,40');assert.equal(safeCurrencyExact(null),'No informado');
 const maximum='9'.repeat(96)+'.99';assert.equal(safeCurrencyExact(maximum).replaceAll('.','').replace(',','.'),'$ '+maximum);
 for(const value of [undefined,1,1n,'','NaN','1e2','1.0','1.000','+1.00','1,00',' 1.00','9'.repeat(97)+'.99'])assert.throws(()=>safeCurrencyExact(value),/Importe exacto inválido/);
 assert.throws(()=>safeCurrencyExact('1.00',{signed:'yes'}),/Importe exacto inválido/);
});
