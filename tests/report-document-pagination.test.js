import test from 'node:test';
import assert from 'node:assert/strict';
import {reportPdf} from '../assets/report-document.js';

const headers=['Período / tipo','Legajo / convenio / repartición','Variable / descripción conservada','Valor original','Unidad declarada','Conceptos con uso directo','Conceptos con uso por referencia','Fuente original','Versión / fecha declarada'];
function report(rows){
 return {layout:'own-payroll-report.v1',title:'Variables originales de las liquidaciones propias',
  columns:headers.map((label,i)=>({label,type:[5,6].includes(i)?'integer':'text',width:24})),rows,
  metadata:[['Períodos','2026-11 a 2026-11'],['Tipos','Mensual'],['Jurisdicción elegida','J42'],['Repartición elegida','Todas'],['Convenio elegido','Todos'],['Rangos','Legajos: inicio a fin'],['Selección de legajos','Todos'],['Grupos originales cerrados',1],['Participaciones seleccionadas',rows.length],['Contratos distintos',rows.length],['Filas completas del informe',rows.length],['Bruto exacto del alcance','1.00'],['Retenciones exactas del alcance','0.00'],['Neto exacto del alcance','1.00']],
  notes:['Datos exclusivamente sintéticos para verificar el documento completo.'],totals:[],filename:'municontrol_pdf_pagination_qa'};
}
const row=(label,value='Detalle breve')=>['2026-11 / Mensual',label,value,'-12345678901234567890.12000000','Unidades',1,0,'Fuente sintética declarada','1 / 2026-11-04'];
function parsedPdf(bytes){
 const raw=new TextDecoder().decode(bytes),dimensions=[...raw.matchAll(/\/Type \/Page \/Parent .*?\/MediaBox \[0 0 (\d+) (\d+)\]/g)].map(m=>({width:Number(m[1]),height:Number(m[2])}));
 const streams=[...raw.matchAll(/\nstream\n([\s\S]*?)\nendstream/g)];
 assert.equal(streams.length,dimensions.length);
 return streams.map((m,index)=>{
  const operations=[...m[1].matchAll(/BT \/(F1|F2) ([\d.]+) Tf [\d. ]+ rg 1 0 0 1 ([\d.eE+-]+) ([\d.eE+-]+) Tm <([a-f0-9]*)> Tj ET/g)].map(v=>({font:v[1],size:Number(v[2]),x:Number(v[3]),y:Number(v[4]),text:new TextDecoder('windows-1252').decode(Buffer.from(v[5],'hex'))}));
  const footer=operations.findIndex(v=>v.y===31&&v.text==='Página '+(index+1));assert.ok(footer>=0,'Página numerada');
  const data=operations.slice(footer+1).filter(v=>v.text!==''&&!/^(Norma|Consulta|Resultado base|Resultado comparada) SHA-256:/.test(v.text));
  return {...dimensions[index],operations,data};
 });
}
const normal=v=>String(v).replace(/\s/g,'');
function assertAllData(document,pages,{cover=false}={}){
 const dataPages=cover?pages.slice(1):pages;
 assert.ok(dataPages.length>0);
 for(const p of dataPages){
  assert.ok(p.data.length>0,'No se agrega una página de tabla sin datos');
  assert.ok(p.operations.some(v=>v.text===document.title),'Se repite el título de la tabla');
  for(const op of p.data)assert.ok(op.y>=62&&op.y<=p.height-88,'Texto dentro del cuerpo de la página: '+op.y);
 }
 const widths=document.columns.map(c=>(c.width||23)/document.columns.reduce((n,c)=>n+(c.width||23),0)*(dataPages[0].width-72)),starts=[];let x=42;
 for(const width of widths){starts.push(x);x+=width;}
 for(let i=0;i<document.columns.length;i++){
  const actual=dataPages.flatMap(p=>p.data).filter(op=>Math.abs(op.x-starts[i])<0.0001).map(op=>op.text).join('');
  const expected=document.rows.map(r=>r[i]===null?'No informado':document.columns[i].type==='integer'?new Intl.NumberFormat('es-AR').format(r[i]):String(r[i])).join('');
  assert.equal(normal(actual),normal(expected),'Se conservan todos los valores, orden y precisión de la columna '+i);
 }
}

test('PDF: la primera fila alta se divide sin página inicial vacía y conserva la siguiente',()=>{
 const d=report([row('EMP-PRIMERO','W'.repeat(1000)),row('EMP-SIGUIENTE','Fin del conjunto')]),before=structuredClone(d);
 const pages=parsedPdf(reportPdf(d));assert.ok(pages.length>1);assertAllData(d,pages);assert.deepEqual(d,before);
 assert.equal(pages.flatMap(p=>p.data).filter(v=>v.text==='EMP-SIGUIENTE').length,1);
});

test('PDF: una fila alta intermedia conserva textos de varias columnas y los importes literales',()=>{
 const middle=row('EMP-INTERMEDIO',('Descripción ÁÑ y detalle. '.repeat(38)).trim());middle[7]=('Origen confirmado / '.repeat(45)).trim();
 const d=report([row('EMP-ANTES'),middle,row('EMP-DESPUÉS','Última fila')]),pages=parsedPdf(reportPdf(d));
 assertAllData(d,pages);
 assert.equal(pages.flatMap(p=>p.data).filter(v=>v.text==='EMP-ANTES').length,1);
 assert.equal(pages.flatMap(p=>p.data).filter(v=>v.text==='EMP-DESPUÉS').length,1);
});

test('PDF: las W no invaden la columna siguiente al ajustar una celda larga',()=>{
 const d=report([row('EMP-ANCHO','W'.repeat(1000))]),pages=parsedPdf(reportPdf(d)),available=(842-72)/9-12;
 assertAllData(d,pages);
 // Helvetica and Helvetica-Bold both declare W as 944/1000 em.
 for(const op of pages.flatMap(p=>p.data).filter(v=>/^W+$/.test(v.text)))assert.ok(op.text.length*0.944*op.size<=available+0.0001,'Ancho físico de la celda');
});

test('PDF: el formato vertical de cargos conserva una fila alta y la fila posterior',()=>{
 const d={...report([]),layout:'own-position-comparison.v1',title:'Cargos presupuestarios por año',columns:[{label:'Cargo',type:'text',width:24},{label:'Detalle conservado',type:'text',width:24},{label:'Cantidad',type:'integer',width:24}],rows:[['CARGO-PRIMERO','W'.repeat(1000),1],['CARGO-SIGUIENTE','Detalle posterior',2]]};
 const pages=parsedPdf(reportPdf(d));assert.ok(pages.every(p=>p.width===595&&p.height===842));assertAllData(d,pages);
});

test('PDF: la primera hoja de conciliación se conserva antes del detalle paginado',()=>{
 const d=report([row('EMP-CONCILIADO','W'.repeat(1000)),row('EMP-ÚLTIMO')]),totals=[['Remunerativo','1.00'],['No remunerativo','0.00'],['Retenciones','0.00'],['Contribuciones','0.00'],['Bruto','1.00'],['Neto','1.00']];
 d.payrollStatement={version:'own-payroll-statement.v1',totals,reconciliation:totals.map(([label,value])=>[label,value,value,'0.00']),coverage:[['Grupos',1],['Participaciones',2],['Contratos',2],['Filas',2]],status:'Conciliación sintética verificada',populationNotice:'Población sintética completa'};
 const pages=parsedPdf(reportPdf(d));assert.equal(pages[0].height,842);assert.equal(pages[0].data.length,0);assertAllData(d,pages,{cover:true});
 assert.ok(pages[0].operations.some(v=>v.text==='Conciliación sintética verificada'));
});

test('PDF: un encabezado sin espacio útil rechaza la exportación sin entregar un PDF recortado',()=>{
 const d=report([row('EMP-NO-RECORTAR')]);d.notes=Array.from({length:10},()=>('Información de procedencia declarada. '.repeat(40)).trim());
 assert.throws(()=>reportPdf(d),/El encabezado no deja espacio para el detalle del PDF/);
});

test('PDF: las filas breves conservan orden, celdas vacías, cero y precisión',()=>{
 const a=row('EMP-CORTO',''),b=row('EMP-CERO','Cero explícito');a[3]='0.00000000';b[3]='-0.01000000';
 const d=report([a,b]),pages=parsedPdf(reportPdf(d));assert.equal(pages.length,1);assertAllData(d,pages);
});
