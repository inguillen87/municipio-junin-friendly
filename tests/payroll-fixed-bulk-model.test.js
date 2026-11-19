import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixedBulkDraft,fixedBulkExists,fixedBulkPayload} from '../assets/payroll-fixed-bulk-model.js';
import {fixedApprovedRecord,fixedSubject} from './fixtures/payroll-fixed-novelties-synthetic.js';

const options={legalInstrument:'Acto sintético común',reason:'Carga sintética de prueba'};
const line=['1001','80','1,000001','123,45','15/09/2026','',''];
const header=['Legajo','Concepto','Unidades','Importe','Fecha de alta','Vencimiento','Instrumento'];
const csv=(cells,separator)=>cells.map(value=>separator===','?'"'+value.replaceAll('"','""')+'"':value).join(separator);
for(const separator of ['\t',';',','])for(const withHeader of [false,true])test('separador '+JSON.stringify(separator)+' con encabezado '+withHeader,()=>{
  const source=(withHeader?'\ufeff'+csv(header,separator)+'\r\n':'')+csv(line,separator)+'\r\n';
  const [row]=fixedBulkDraft(source,options);assert.equal(row.error,null);assert.equal(row.number,withHeader?2:1);
  assert.equal(row.draft.values.quantityDecimal,'1.000001');assert.equal(row.draft.values.amountCents,'12345');assert.equal(row.draft.values.validFrom,'2026-09-15');assert.equal(row.draft.values.validTo,null);
  assert.equal(row.draft.values.forced,false);assert.equal(row.draft.values.forcedReason,null);assert.equal(row.draft.values.costCenterSourceId,null);
});
test('fechas ISO, vencimiento y valores exactos sin redondear',()=>{
 const [row]=fixedBulkDraft('1001;80;999999999999.123456;9999999999999999.99;2026-09-15;31/12/2026;Acto por fila',options);
 assert.equal(row.error,null);assert.equal(row.draft.values.quantityDecimal,'999999999999.123456');assert.equal(row.draft.values.amountCents,'999999999999999999');assert.equal(row.draft.values.validTo,'2026-12-31');assert.equal(row.draft.values.legalInstrument,'Acto por fila');
});
test('instrumento común con columna ausente o vacía y concepto por nombre exacto',()=>{
 for(const ending of ['',';']){const [row]=fixedBulkDraft('1001;Afiliación al Sindicato Municipal;1;;2026-09-15;'+ending,options);assert.equal(row.error,null);assert.equal(row.draft.values.legalInstrument,options.legalInstrument);assert.equal(row.draft.values.conceptSourceId,'901000617');}
});
test('vacíos se conservan como ausencia; cero explícito se conserva',()=>{
 for(const [units,amount,quantityDecimal,amountCents]of [['','0',null,'0'],['0','','0',null]]){const row=fixedBulkDraft(['1001','80',units,amount,'2026-09-15'].join(';'),options)[0];assert.equal(row.error,null);assert.equal(row.draft.values.quantityDecimal,quantityDecimal);assert.equal(row.draft.values.amountCents,amountCents);}
 const row=fixedBulkDraft('1001;80;;;2026-09-15',options)[0];assert.match(row.error,/Fila 1:.*ausente no equivale a cero/);
});
for(const [label,index,value,pattern]of [
 ['legajo',0,'01001',/legajo exacto/],['concepto',1,'08',/concepto/],['unidades',2,'1,0000001',/unidades/],['importe',3,'1,001',/importe/],
 ['alta inválida',4,'31/02/2026',/fecha de alta válida/],['alta incompleta',4,'1/9/2026',/fecha de alta válida/],['vencimiento anterior',5,'2025-09-01',/anterior/],['instrumento inseguro',6,'<script>',/una sola línea/]
])test('error de '+label+' indica fila física',()=>{
 const changed=[...line];changed[index]=value;const rows=fixedBulkDraft('\n'+header.join(';')+'\n\n'+changed.join(';'),options);assert.match(rows[0].error,/^Fila 4:/);assert.match(rows[0].error,pattern);
});
test('rechaza todas las repeticiones normalizadas, sin omitirlas',()=>{
 const rows=fixedBulkDraft(line.join(';')+'\n'+line.join(';'),options);assert.equal(rows.length,2);assert.ok(rows.every(row=>/repiten/.test(row.error)));
});
test('200 filas se aceptan; 201 bloquean la carga completa',()=>{
 const source=Array.from({length:200},(_,i)=>[String(i+1),...line.slice(1)].join(';'));assert.equal(fixedBulkDraft(source.join('\n'),options).length,200);
 assert.throws(()=>fixedBulkDraft([...source,'201;80;1;;2026-09-15'].join('\n'),options),/hasta 200/);
});
test('encabezado solo, planilla vacía y motivo o instrumento ausentes no se guardan',()=>{
 assert.throws(()=>fixedBulkDraft(' \n',options),/al menos/);assert.throws(()=>fixedBulkDraft(header.join(';'),options),/no tiene novedades/);
 for(const missing of ['reason','legalInstrument'])assert.match(fixedBulkDraft(line.join(';'),{...options,[missing]:''})[0].error,/^Fila 1:/);
});
test('comillas escapadas, separadores dentro del instrumento y CSV inválido',()=>{
 const quoted=[...line];quoted[6]='Acto "sintético"; conjunto';assert.equal(fixedBulkDraft(csv(quoted,','),options)[0].draft.values.legalInstrument,quoted[6]);
 for(const text of ['1001,80,1,5,123,45,2026-09-15,,Acto sintético','1001;80;1;;2026-09-15;;"Acto sin cierre','1001;80;1;;2026-09-15;;"Acto"extra'])assert.match(fixedBulkDraft(text,options)[0].error,/^Fila 1:/);
});
test('CSV con comas no confunde punto y coma dentro del instrumento',()=>{
 const [row]=fixedBulkDraft('1001,80,1,,2026-09-15,,Acto sintético; respaldo',options);assert.equal(row.error,null);assert.equal(row.draft.values.legalInstrument,'Acto sintético; respaldo');
});
test('tipo común válido se conserva y tipo inválido se rechaza por fila',()=>{
 assert.equal(fixedBulkDraft(line.join(';'),{...options,payrollType:'sac'})[0].draft.values.payrollType,'sac');assert.match(fixedBulkDraft(line.join(';'),{...options,payrollType:'unknown'})[0].error,/tipo de liquidación/);
});
test('ya existe por contrato, concepto y tipo aprobado o pendiente, sin confundir anulaciones o rechazos',()=>{
 const row=fixedApprovedRecord(0),subject=fixedSubject(),values=row.approved.values;
 assert.equal(fixedBulkExists([row],subject,values),true);assert.equal(fixedBulkExists([row],fixedSubject('1002'),values),false);
 assert.equal(fixedBulkExists([row],subject,{...values,payrollType:'sac'}),false);assert.equal(fixedBulkExists([row],subject,{...values,conceptSourceId:'81'}),false);
 assert.equal(fixedBulkExists([{...row,approved:{operation:'annul',values:null},pending:null}],subject,values),false);
 assert.equal(fixedBulkExists([{...row,approved:null,pending:row.approved}],subject,values),true);
 assert.equal(fixedBulkExists([{...row,approved:null,pending:null}],subject,values),false);
});
test('el cuerpo de alta coincide con la propuesta individual y el modelo no usa DOM ni redondeos',()=>{
 const draft=fixedBulkDraft(line.join(';'),options)[0].draft,subject=fixedSubject();assert.deepEqual(fixedBulkPayload(draft,subject),{recordId:null,expectedVersion:0,contractId:subject.contractId,legajo:subject.legajo,identityToken:subject.identityToken,operation:'set',values:draft.values,reason:draft.reason});
 assert.throws(()=>fixedBulkPayload(draft,fixedSubject('1002')),/legajo cambió/);
 const source=fs.readFileSync('assets/payroll-fixed-bulk-model.js','utf8');assert.doesNotMatch(source,/document\.|fetch\(|innerHTML|parseFloat|Math\.round|toFixed|localStorage|sessionStorage/);
 assert.match(fs.readFileSync('scripts/build-friendly.mjs','utf8'),/'assets\/payroll-fixed-bulk-model\.js'/);
});
