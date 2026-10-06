import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ownCloseDetail,ownCloseReceipt,ownCloseSnapshot} from '../assets/own-payroll-close-model.js';
import {ownReportBundle,ownReportDocument,emptyOwnReportFilters,ownReportContracts,verifiedOwnReportBundle} from '../assets/own-payroll-report-model.js';
import {reportCsv,reportXlsx,reportPdf} from '../assets/report-document.js';
import {closeError} from '../lib/internal-own-payroll-close.js';
import {closeDetail} from './fixtures/own-payroll-close-synthetic.js';
import {historicalReportFixture,rehashReportFixture} from './fixtures/own-payroll-report-synthetic.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';

function opaqueReport(numbers){
 const f=historicalReportFixture('2026-11','monthly'),s=f.receipts[0].snapshot;
 assert.equal(numbers.length,s.employees.length);
 s.employees.forEach((e,i)=>{e.employeeNumber=numbers[i];for(const r of s.concepts.filter(r=>r.contractId===e.contractId))r.employeeNumber=numbers[i];});
 return rehashReportFixture(f);
}
test('cierre preserva legajos exactos, espacios, ceros y Unicode sin cambiar clasificaciones',()=>{
 const d=closeDetail();d.rows[0].employeeNumber='  A/001 🙂  ';
 for(const c of d.captures){c.saved.input.employees[0].employeeNumber=d.rows[0].employeeNumber;for(const r of c.saved.result.rows.filter(r=>r.contractId===d.rows[0].contractId))r.employeeNumber=d.rows[0].employeeNumber;}
 assert.equal(ownCloseDetail(d).rows[0].employeeNumber,d.rows[0].employeeNumber);
 assert.equal(ownCloseSnapshot(d,{kind:'contracts',values:[d.rows[0].contractId]}).employees[0].employeeNumber,d.rows[0].employeeNumber);
 for(const bad of ['', 'x'.repeat(65),'A\t1','A\u00851']){const invalid=structuredClone(d);invalid.rows[0].employeeNumber=bad;assert.throws(()=>ownCloseDetail(invalid));}
 d.rows[0].agreementCode='A/1';assert.throws(()=>ownCloseDetail(d));
});
test('histórico cerrado opaco concilia, conserva cantidades y exporta todas las vistas',async()=>{
 const f=opaqueReport(['A/3501','001']),before=JSON.stringify(f),b=await verifiedOwnReportBundle(f.query,f.details,f.receipts);
 assert.equal(ownCloseReceipt(f.receipts[0]).snapshot.employees[0].employeeNumber,'A/3501');
 const doc=ownReportDocument(b);assert.deepEqual(doc.rows.map(r=>r[2]),['001','A/3501']);
 for(const view of ['payroll','summary','concepts','statistics','sources'])for(const format of [reportCsv,reportXlsx,reportPdf])assert.ok(format(ownReportDocument(b,emptyOwnReportFilters(),view)).length);
 assert.equal(JSON.stringify(f),before);
});
test('selección exacta admite destinos con igual legajo y mantiene todo el censo',()=>{
 const f=opaqueReport(['A/3501','A/3501']),b=ownReportBundle(f.query,f.details,f.receipts),id=f.receipts[0].snapshot.employees[1].contractId;
 assert.equal(ownReportDocument(b).rows.length,2);
 const doc=ownReportDocument(b,emptyOwnReportFilters(),'payroll','concept',[id]);assert.equal(doc.rows.length,1);assert.equal(doc.rows[0][2],'A/3501');
 assert.equal(ownReportDocument(b,emptyOwnReportFilters(),'sources','concept',[id]).rows[0][5],1);
 for(const ids of [[id,id],[uid(999)],['A/3501'],Array(2)] )assert.throws(()=>ownReportDocument(b,emptyOwnReportFilters(),'payroll','concept',ids));
 assert.deepEqual(ownReportContracts([id]),[id]);
});
test('rango numérico nunca convierte ni omite silenciosamente legajos opacos',()=>{
 const f=opaqueReport(['A/3501','001']),b=ownReportBundle(f.query,f.details,f.receipts),range={...emptyOwnReportFilters(),employeeFrom:'1'};
 assert.throws(()=>ownReportDocument(b,range),/No se omitieron filas/);
 const id=f.receipts[0].snapshot.employees[1].contractId;assert.equal(ownReportDocument(b,range,'payroll','concept',[id]).rows[0][2],'001');
 const altered=structuredClone(f);altered.receipts[0].snapshot.employees[0].employeeNumber='A\u00071';assert.throws(()=>ownReportBundle(altered.query,altered.details,altered.receipts));
});
test('CSV neutraliza un legajo que empieza como fórmula y conserva el valor histórico',()=>{
 const f=opaqueReport(['=1+2','  @SUM(1)']),b=ownReportBundle(f.query,f.details,f.receipts),d=ownReportDocument(b),csv=reportCsv(d);
 assert.match(csv,/'=1\+2/);assert.match(csv,/'  @SUM/);assert.equal(f.receipts[0].snapshot.employees[0].employeeNumber,'=1+2');
 const xml=Buffer.from(reportXlsx(d)).toString('utf8');assert.match(xml,/<c [^>]*t="inlineStr"[^>]*><is><t[^>]*>=1\+2<\/t>/);
 assert.deepEqual([...xml.matchAll(/<f>(.*?)<\/f>/g)].map(m=>m[1]),['COUNTA(Datos!A2:A3)']);
});
test('fuentes desconocidas producen correcciones accionables sin revelar datos ni ocultar fallas',()=>{
 assert.equal(closeError(Error('PAYROLL_FIXED_DATES_INVALID')).status,422);assert.match(closeError(Error('PAYROLL_FIXED_DATES_INVALID')).message,/no se omitieron/);
 assert.equal(closeError(Error('PAYROLL_FIXED_IDENTITY_CHANGED')).status,409);
 assert.equal(closeError(Error('UNKNOWN_UNEXPECTED_FAILURE')).status,503);
});
test('adaptador conserva el roster original y sus garantías, sin tablas ni cambios de permisos',()=>{
 const sql=fs.readFileSync(new URL('../scripts/migrations/141-adopted-own-payroll-close.sql',import.meta.url),'utf8');
 assert.match(sql,/63dcc6cb15f921d5c36ef9510ad9bceb4b4160d8cb69fcf51c1d0ee5ec750996/);
 assert.match(sql,/certifiedBindingId/);assert.match(sql,/to_jsonb\(updated\)-'prosrc'/);assert.match(sql,/aclexplode/);assert.match(sql,/OWN_CLOSE_ADOPTION_DEFINITION_CHANGED/);
 assert.doesNotMatch(sql,/CREATE TABLE|GRANT |UPDATE public\.|INSERT INTO public\.|DELETE FROM public\.|DISABLE TRIGGER/);
});
