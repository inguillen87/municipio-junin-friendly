import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {ownPlanillaPages,ownPlanillaPdf} from '../assets/own-payroll-receipt-planilla-export.js';
import {ownReceiptTextWidth} from '../assets/own-payroll-receipt-pdf.js';
import {prepareOwnPlanilla} from '../assets/own-payroll-receipt-planilla-model.js';
import {bankOutputFixture} from './fixtures/own-bank-output-synthetic.js';

const L=38,R=557,MID=(L+R)/2;
const texts=page=>page.flatMap(op=>{const m=/^BT \/(F[12]) ([\d.]+) Tf [\d. ]+ rg 1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm <([a-f0-9]*)> Tj ET$/.exec(op);return m?[{bold:m[1]==='F2',size:+m[2],x:+m[3],y:+m[4],text:Buffer.from(m[5],'hex').toString('latin1')}]:[];});
const edge=t=>t.x+ownReceiptTextWidth(t.text,t.size,t.bold);
const near=(a,b)=>Math.abs(a-b)<0.02;
const concept=(code,label,nature,amount,unit='money')=>({code,label,nature,unit,amount,labelSourceSha256:'d'.repeat(64)});
const person=(i,concepts,totals)=>({period:'2026-10',type:'monthly',jurisdiction:'42',employeeNumber:String(1000+i),dni:String(99000100+i),name:'Agente sintético '+i,agreementCode:'1',departmentCode:'7',liquidationVersion:1,precision:2,totals,concepts});
const TOTALS={remuneration:'1580245.99',non_remuneration:'240000.00',deduction:'268641.65',employer_contribution:'252838.55',gross:'1820245.99',net:'1551604.34'};
const ordinary=i=>person(i,[concept('1','ASIGNACION DE LA CLASE','remuneration','1234567.89'),concept('11','ADICIONAL POR ANTIGUEDAD','remuneration','345678.10'),concept('550','BONO NO REMUNERATIVO','non_remuneration','240000.00'),concept('601','JUBILACION','deduction','173826.95'),concept('604','OBRA SOCIAL','deduction','94814.70'),concept('801','CONTRIBUCION PATRONAL','employer_contribution','252838.55'),concept('24','ANTIGUEDAD','auxiliary','14','years')],TOTALS);
// A sheet shaped like the verified one; the page drawing itself does not verify, which is why downloads use ownPlanillaPdf.
function sheet(groups,extra={}){
 const all=groups.flatMap(g=>g.records);
 return {issuer:{name:'Municipio de ensayo sintético'},legend:'Sólo prueba sintética',paymentDate:'2026-11-05',total:all.length,selected:all.length,totals:{remuneration:'1.00',non_remuneration:'2.00',deduction:'3.00',employer_contribution:'4.00',gross:'5.00',net:'6.00'},
  groups:groups.map(g=>({period:'2026-10',type:'monthly',jurisdiction:'42',agreementCode:'1',departmentCode:'7',totals:{remuneration:'10.00',non_remuneration:'20.00',deduction:'30.00',employer_contribution:'40.00',gross:'50.00',net:'60.00'},...g})),...extra};
}

test('la planilla junta varias personas por página, cada una con haberes a la izquierda y descuentos a la derecha',async()=>{
 const pages=await ownPlanillaPages(sheet([{records:Array.from({length:12},(_,i)=>ordinary(i))}]));
 assert.ok(pages.length<=3,'doce personas comunes no ocupan doce páginas: '+pages.length);
 const first=texts(pages[0]),names=first.filter(t=>/^Agente sintético \d+$/.test(t.text));assert.ok(names.length>=5,'al menos cinco personas en la primera página');
 const band=first.filter(t=>t.y===names[0].y).map(t=>t.text);assert.deepEqual(band,['Legajo 1000','Agente sintético 0','DNI 99000100','Versión 1','Neto $ 1.551.604,34']);
 const below=y=>first.filter(t=>t.y<names[0].y&&t.y>names[1].y);
 const block=below(),find=text=>{const found=block.filter(t=>t.text===text);assert.equal(found.length,1,text);return found[0];};
 for(const label of ['ASIGNACION DE LA CLASE','ADICIONAL POR ANTIGUEDAD','BONO NO REMUNERATIVO','CONTRIBUCION PATRONAL'])assert.ok(find(label).x<MID,label);
 for(const label of ['JUBILACION','OBRA SOCIAL','ANTIGUEDAD'])assert.ok(find(label).x>MID,label);
 assert.ok(find('No remunerativos').y<find('ADICIONAL POR ANTIGUEDAD').y&&find('No remunerativos').y>find('BONO NO REMUNERATIVO').y);
 assert.ok(find('A cargo del empleador').y<find('BONO NO REMUNERATIVO').y);assert.ok(find('Valores técnicos · no suman ni restan').y<find('OBRA SOCIAL').y);
 assert.ok(near(edge(find('1.234.567,89')),MID-6));assert.ok(near(edge(find('173.826,95')),R-6));assert.ok(near(edge(find('$ 252.838,55')),MID-6));assert.ok(near(edge(find('14 años')),R-6));
 find('Remunerativos $ 1.580.245,99 · No remunerativos $ 240.000,00 · Bruto $ 1.820.245,99 · Retenciones $ 268.641,65 · Aportes patronales $ 252.838,55');
 for(const page of pages)for(const t of texts(page))assert.ok(t.x>=L-0.01&&edge(t)<=R+0.01,'dentro de los márgenes: '+t.text);
});

test('una persona no se parte entre páginas si entra entera en una',async()=>{
 const pages=await ownPlanillaPages(sheet([{records:Array.from({length:40},(_,i)=>ordinary(i))}])),where=new Map();
 pages.forEach((page,index)=>{for(const t of texts(page)){const m=/^Legajo (\d+)$/.exec(t.text);if(m)where.set(m[1],index);}});
 assert.equal(where.size,40);
 pages.forEach((page,index)=>{const all=texts(page),bands=all.filter(t=>/^Legajo \d+$/.test(t.text)).sort((a,b)=>b.y-a.y);assert.ok(!all.some(t=>t.text==='continuación'));
  // Every block that starts on a page also ends there: its summary line is on the same page.
  assert.equal(all.filter(t=>t.text.startsWith('Remunerativos $ ')).length,bands.length,'página '+(index+1));});
});

test('una persona con más líneas que una página sigue en la siguiente con su nombre y sin perder ninguna',async()=>{
 const long=person(0,[...Array.from({length:150},(_,i)=>concept(String(2000+i),'HABER LARGO '+i,'remuneration','1.00')),...Array.from({length:20},(_,i)=>concept(String(6000+i),'DESCUENTO LARGO '+i,'deduction','1.00'))],TOTALS);
 const pages=await ownPlanillaPages(sheet([{records:[ordinary(1),long,ordinary(2)]}])),all=pages.map(texts);assert.ok(pages.length>=3);
 const every=all.flat().map(t=>t.text);for(let i=0;i<150;i++)assert.equal(every.filter(v=>v==='HABER LARGO '+i).length,1);for(let i=0;i<20;i++)assert.equal(every.filter(v=>v==='DESCUENTO LARGO '+i).length,1);
 const continued=all.map(page=>page.some(t=>t.text==='continuación'));assert.ok(continued.filter(Boolean).length>=1);
 all.forEach((page,index)=>{if(!continued[index])return;const mark=page.find(t=>t.text==='continuación'),line=page.filter(t=>t.y===mark.y).map(t=>t.text);assert.deepEqual(line.slice(0,3),['Legajo 1000','Agente sintético 0','DNI 99000100']);assert.ok(page.some(t=>t.text==='PLANILLA DE SUELDOS'));});
 assert.equal(every.filter(v=>v.startsWith('Neto $ ')).length,3,'el neto de cada persona, una sola vez');
});

test('cada grupo empieza en su página y cierra con sus totales exactos; el total general sólo si hay más de un grupo',async()=>{
 const two=sheet([{jurisdiction:'42',records:[ordinary(0),ordinary(1)]},{jurisdiction:'55',departmentCode:'9',records:[ordinary(2)]}]);
 const pages=await ownPlanillaPages(two),all=pages.map(texts),list=all.map(page=>page.map(t=>t.text));assert.equal(pages.length,2);
 assert.ok(list[0].includes('Octubre de 2026 · Mensual · J42'));assert.ok(list[0].includes('Convenio 1 · Repartición 7'));assert.ok(list[1].includes('Octubre de 2026 · Mensual · J55'));assert.ok(list[1].includes('Convenio 1 · Repartición 9'));
 assert.ok(list[0].includes('2 recibos de esta repartición · Emisión completa: 3 · Selección: 3 · Orden: DNI / número'));assert.ok(list[0].includes('Fecha de pago declarada: 05/11/2026 · no acredita pago'));
 for(const page of list){assert.equal(page.filter(v=>v==='Sólo prueba sintética').length,1);assert.ok(page.includes('USO INTERNO · FIRMA DIGITAL PENDIENTE · NO ACREDITA PAGO'));}
 assert.ok(list[0].includes('TOTALES EXACTOS · REPARTICIÓN 7'));assert.ok(list[0].includes('Firma digital pendiente de Contaduría.'));
 assert.ok(list[1].includes('TOTALES EXACTOS · REPARTICIÓN 9'));assert.ok(list[1].includes('Firma digital pendiente de Contaduría y Coordinación de jardines maternales.'));
 const title=all[0].find(t=>t.text==='TOTALES EXACTOS · REPARTICIÓN 7'),values=all[0].filter(t=>t.y<title.y&&t.y>title.y-30&&t.text.startsWith('$ ')).sort((a,b)=>a.x-b.x).map(t=>t.text);
 assert.deepEqual(values,['$ 10,00','$ 20,00','$ 30,00','$ 40,00','$ 50,00','$ 60,00']);
 const general=all[1].find(t=>t.text==='TOTAL GENERAL DE LA PLANILLA · todos los grupos incluidos');assert.ok(general);
 assert.deepEqual(all[1].filter(t=>t.y<general.y&&t.y>general.y-30&&t.text.startsWith('$ ')).sort((a,b)=>a.x-b.x).map(t=>t.text),['$ 1,00','$ 2,00','$ 3,00','$ 4,00','$ 5,00','$ 6,00']);
 assert.ok(all[1].some(t=>t.text==='3 recibos'));assert.ok(!list[0].some(v=>v.startsWith('TOTAL GENERAL')));
 const one=(await ownPlanillaPages(sheet([{records:[ordinary(0)]}]))).flatMap(texts).map(t=>t.text);assert.ok(!one.some(v=>v.startsWith('TOTAL GENERAL')));
});

test('la descarga sigue verificando la emisión; el dibujo solo no reemplaza esa verificación',async()=>{
 await assert.rejects(ownPlanillaPdf(sheet([{records:[ordinary(0)]}])),/verificar la emisión/);
 const fixture=bankOutputFixture(35),planilla=await prepareOwnPlanilla(fixture.batch,fixture.closes,'all'),pdf=await ownPlanillaPdf(planilla);
 assert.equal(pdf.recordCount,35);assert.ok(pdf.pageCount>=2&&pdf.pageCount<=10,'35 recibos sintéticos: '+pdf.pageCount+' páginas');
 const panel=fs.readFileSync(new URL('../assets/own-payroll-receipt-planilla-panel.js',import.meta.url),'utf8');assert.match(panel,/ownPlanillaPdf/);assert.doesNotMatch(panel,/ownPlanillaPages/);
 await assert.rejects(ownPlanillaPages(sheet([{records:[person(0,[concept('1','Texto 漢','remuneration','1.00')],TOTALS)]}])),/carácter original/);
 const controller=new AbortController();controller.abort();await assert.rejects(ownPlanillaPages(sheet([{records:[ordinary(0)]}]),{signal:controller.signal}),{name:'AbortError'});
});
