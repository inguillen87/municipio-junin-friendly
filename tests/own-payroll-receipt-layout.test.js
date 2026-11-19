import test from 'node:test';import assert from 'node:assert/strict';
import {ownReceiptPages,ownReceiptTextWidth} from '../assets/own-payroll-receipt-pdf.js';
import {receiptSnapshot} from './fixtures/own-payroll-receipt-synthetic.js';

// Text operations of a page: font, size, position and the text itself.
const L=38,R=557,MID=(L+R)/2;
const texts=page=>page.flatMap(op=>{const m=/^BT \/(F[12]) ([\d.]+) Tf [\d. ]+ rg 1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm <([a-f0-9]*)> Tj ET$/.exec(op);return m?[{bold:m[1]==='F2',size:+m[2],x:+m[3],y:+m[4],text:Buffer.from(m[5],'hex').toString('latin1')}]:[];});
const edge=t=>t.x+ownReceiptTextWidth(t.text,t.size,t.bold);
const near=(a,b)=>Math.abs(a-b)<0.02;
const concept=(base,code,label,nature,amount,unit='money')=>({...base,code,label,nature,amount,unit});
function sample(){
 const s=receiptSnapshot(2),r=s.records[0],base=r.concepts[0];
 r.concepts=[concept(base,'1','ASIGNACION DE LA CLASE','remuneration','1234567.89'),concept(base,'11','ADICIONAL POR ANTIGUEDAD','remuneration','345678.10'),concept(base,'550','BONO NO REMUNERATIVO','non_remuneration','240000.00'),
  concept(base,'601','JUBILACION','deduction','173826.95'),concept(base,'604','OBRA SOCIAL','deduction','94814.70'),concept(base,'801','CONTRIBUCION PATRONAL','employer_contribution','252838.55'),concept(base,'24','ANTIGUEDAD','auxiliary','14','years'),concept(base,'88','VALOR HORA','auxiliary','8123.456789')];
 r.totals={remuneration:'1580245.99',non_remuneration:'240000.00',deduction:'268641.65',employer_contribution:'252838.55',gross:'1820245.99',net:'1551604.34'};
 s.params.paymentDate='2026-11-05';
 return {s,r};
}

test('el ancho del texto sale de las medidas reales de la tipografía',()=>{
 assert.ok(near(ownReceiptTextWidth('0',10),5.56));assert.ok(near(ownReceiptTextWidth('1.234.567,89',10),9*5.56+3*2.78));
 assert.ok(near(ownReceiptTextWidth('A',10),6.67));assert.ok(near(ownReceiptTextWidth('A',10,true),7.22));
 assert.ok(near(ownReceiptTextWidth('ñ',10),ownReceiptTextWidth('n',10)));assert.ok(near(ownReceiptTextWidth('É',10,true),ownReceiptTextWidth('E',10,true)));
 assert.ok(ownReceiptTextWidth('WWWW',10)>ownReceiptTextWidth('iiii',10)*3);
 assert.throws(()=>ownReceiptTextWidth('漢',10),/carácter/);
});

test('haberes a la izquierda, descuentos a la derecha, cada concepto una sola vez',()=>{
 const {s,r}=sample(),pages=ownReceiptPages(r,s.params,s.sources[0]);assert.equal(pages.length,1);
 const all=texts(pages[0]),at=text=>{const found=all.filter(t=>t.text===text);assert.equal(found.length,1,text);return found[0];};
 const haberes=at('HABERES'),descuentos=at('DESCUENTOS');assert.ok(haberes.x<MID&&descuentos.x>MID&&haberes.y===descuentos.y);
 for(const c of r.concepts)assert.equal(all.filter(t=>t.text===c.label).length,1,'una vez: '+c.label);
 for(const label of ['ASIGNACION DE LA CLASE','ADICIONAL POR ANTIGUEDAD','BONO NO REMUNERATIVO'])assert.ok(at(label).x<MID&&at(label).y<haberes.y);
 for(const label of ['JUBILACION','OBRA SOCIAL'])assert.ok(at(label).x>MID&&at(label).y<descuentos.y);
 // The non-remunerative heading sits between both groups of the same column.
 const heading=text=>{const found=all.filter(t=>t.text===text&&t.bold&&t.x<MID);assert.equal(found.length,1,text);return found[0];};
 assert.ok(heading('Remunerativos').y>at('ASIGNACION DE LA CLASE').y&&heading('No remunerativos').y<at('ADICIONAL POR ANTIGUEDAD').y&&heading('No remunerativos').y>at('BONO NO REMUNERATIVO').y);
 // What is not pay goes below the net, apart from the columns.
 const neto=at('Neto');for(const label of ['CONTRIBUCION PATRONAL','ANTIGUEDAD','VALOR HORA'])assert.ok(at(label).y<neto.y,label);
 assert.ok(at('CONTRIBUCION PATRONAL').x<MID&&at('VALOR HORA').x>MID);
 assert.equal(at('14 años').bold,true);assert.equal(at('$ 8.123,456789').bold,true);
});

test('los totales de cada columna y el neto son los exactos de la liquidación, sin recalcular',()=>{
 const {s,r}=sample();r.totals={...r.totals,gross:'1820245.99',deduction:'268641.65',net:'1551604.34'};
 const all=texts(ownReceiptPages(r,s.params,s.sources[0])[0]),row=label=>{const head=all.find(t=>t.text===label);assert.ok(head,label);return all.filter(t=>t.y===head.y&&t!==head).map(t=>t.text);};
 assert.deepEqual(row('Total haberes'),['$ 1.820.245,99','Total descuentos','$ 268.641,65']);
 assert.deepEqual(row('Neto'),['$ 1.551.604,34']);
 assert.equal(all.filter(t=>t.text==='$ 1.551.604,34').length,2,'arriba, donde se mira primero, y junto a los totales');
 assert.ok(all.some(t=>t.text==='Neto a cobrar'));
 for(const label of ['Remunerativos','No remunerativos','Bruto','Retenciones','Aportes patronales'])assert.ok(all.some(t=>t.text===label&&!t.bold),label);
 assert.ok(all.some(t=>t.text==='$ 252.838,55'));
});

test('los importes quedan alineados al borde derecho de su columna',()=>{
 const {s,r}=sample(),all=texts(ownReceiptPages(r,s.params,s.sources[0])[0]);
 for(const [value,limit]of [['1.234.567,89',MID-6],['345.678,10',MID-6],['240.000,00',MID-6],['173.826,95',R-6],['94.814,70',R-6],['$ 252.838,55',MID-6],['14 años',R-6]]){
  const found=all.filter(t=>t.text===value&&near(edge(t),limit));assert.equal(found.length,1,value);
 }
 for(const t of all)assert.ok(t.x>=L-0.01&&edge(t)<=R+0.01,'dentro de los márgenes: '+t.text);
});

test('una etiqueta larga se parte dentro de su columna y no pierde texto',()=>{
 const {s,r}=sample(),long=Array.from({length:24},(_,i)=>'PALABRA'+i).join(' ');assert.equal(long.length<=240,true);
 r.concepts[0]={...r.concepts[0],label:long};r.concepts[3]={...r.concepts[3],label:'X'.repeat(120)};
 const pages=ownReceiptPages(r,s.params,s.sources[0]),all=pages.flatMap(texts);
 const left=all.filter(t=>near(t.x,L+38)&&t.text.startsWith('PALABRA')).sort((a,b)=>b.y-a.y);
 assert.ok(left.length>3);assert.equal(left.map(t=>t.text).join(' '),long);
 const amount=all.find(t=>t.text==='1.234.567,89');for(const t of left)assert.ok(edge(t)<amount.x,'la etiqueta no pisa el importe');
 const right=all.filter(t=>near(t.x,MID+38)&&/^X+$/.test(t.text));assert.ok(right.length>1);assert.equal(right.map(t=>t.text).join(''),'X'.repeat(120));
 for(const t of right)assert.ok(edge(t)<=R-6);
});

test('período, fecha y CUIL se leen como en un recibo; lo inesperado se imprime como llegó',()=>{
 const {s,r}=sample();let all=texts(ownReceiptPages(r,s.params,s.sources[0])[0]).map(t=>t.text);
 assert.ok(all.includes('Octubre de 2026'));assert.ok(all.includes('05/11/2026'));assert.ok(all.includes('20-99000100-0'));assert.ok(all.includes('Mensual'));
 assert.ok(all.includes('RECIBO DE HABERES'));assert.ok(all.includes('Recibo propio · copia para revisión'));assert.ok(all.some(v=>v.startsWith('CUIT 30-99000000-1 · ')));
 assert.ok(all.includes('SIN FIRMA DIGITAL · COPIA PARA REVISIÓN'));assert.ok(all.includes('Legajo 1001 · 2026-10 · Mensual'));
 s.params.paymentDate=null;r.cuil='SIN-FORMATO';r.employeeNumber='A/0001';
 all=texts(ownReceiptPages(r,s.params,s.sources[0])[0]).map(t=>t.text);
 assert.ok(all.includes('No informada'));assert.ok(all.includes('SIN-FORMATO'));assert.ok(all.includes('Legajo A/0001'));
});

test('sin descuentos lo dice; una naturaleza desconocida no se omite en silencio',()=>{
 const {s,r}=sample();r.concepts=r.concepts.filter(c=>c.nature!=='deduction');
 const all=texts(ownReceiptPages(r,s.params,s.sources[0])[0]);assert.ok(all.some(t=>t.text==='Sin descuentos en esta liquidación.'&&t.x>MID));
 r.concepts[0]={...r.concepts[0],nature:'otra'};assert.throws(()=>ownReceiptPages(r,s.params,s.sources[0]),/naturaleza desconocida/);
});

test('las páginas siguientes repiten de quién es y la última vuelve a decir el neto',()=>{
 const {s,r}=sample(),base=r.concepts[0];
 r.concepts=[...Array.from({length:70},(_,i)=>concept(base,String(1000+i),'HABER DE PRUEBA '+i,'remuneration','10.00')),...Array.from({length:55},(_,i)=>concept(base,String(6000+i),'DESCUENTO DE PRUEBA '+i,'deduction','1.00'))];
 const pages=ownReceiptPages(r,s.params,s.sources[0]);assert.ok(pages.length>=2);
 const byPage=pages.map(page=>texts(page));
 for(const [i,all]of byPage.entries()){
  const list=all.map(t=>t.text);
  assert.ok(list.includes(s.params.issuer.name));assert.ok(list.includes(r.name));assert.ok(list.includes(`${i+1} / ${pages.length}`));
  assert.equal(list.includes('Legajo 1001 · continuación'),i>0);assert.equal(list.includes('Neto a cobrar'),i===0);
  if(all.some(t=>/^(HABER|DESCUENTO) DE PRUEBA/.test(t.text)))assert.ok(list.includes('HABERES')&&list.includes('DESCUENTOS'),'cada tramo de la tabla lleva su encabezado');
 }
 const everything=byPage.flat().map(t=>t.text);
 for(let i=0;i<70;i++)assert.equal(everything.filter(v=>v==='HABER DE PRUEBA '+i).length,1);
 for(let i=0;i<55;i++)assert.equal(everything.filter(v=>v==='DESCUENTO DE PRUEBA '+i).length,1);
 // Both columns advance together: the second page continues each one where the first stopped.
 const firstLeft=byPage[0].filter(t=>t.text.startsWith('HABER DE PRUEBA')).length,firstRight=byPage[0].filter(t=>t.text.startsWith('DESCUENTO DE PRUEBA')).length;
 assert.ok(firstLeft>20&&firstLeft<70&&firstRight>20);
 assert.ok(byPage[1].some(t=>t.text==='HABER DE PRUEBA '+firstLeft&&t.x<MID));
 const netPage=byPage.findIndex(all=>all.some(t=>t.text==='Neto')),last=byPage.at(-1).map(t=>t.text);
 assert.ok(netPage>=1);assert.ok(last.includes('Neto')||last.includes(`Neto: $ 1.551.604,34 (totales en la página ${netPage+1})`));
 assert.ok(last.some(v=>v.includes('Firma digital pendiente')));
});

test('un recibo con muchas líneas técnicas sigue en otra página sin recortar ninguna',()=>{
 const {s,r}=sample(),base=r.concepts[0];
 r.concepts=[...r.concepts,...Array.from({length:130},(_,i)=>concept(base,String(9000+i),'VALOR TECNICO '+i,'auxiliary','1.5','coefficient'))];
 const pages=ownReceiptPages(r,s.params,s.sources[0]),everything=pages.flatMap(texts).map(t=>t.text);assert.ok(pages.length>=2);
 for(let i=0;i<130;i++)assert.equal(everything.filter(v=>v==='VALOR TECNICO '+i).length,1);
 assert.ok(everything.filter(v=>v==='VALORES TÉCNICOS · no suman ni restan').length>=2);
 assert.ok(pages.at(-1).some(op=>op.includes(Buffer.from('Neto: $ 1.551.604,34').toString('hex'))));
});
