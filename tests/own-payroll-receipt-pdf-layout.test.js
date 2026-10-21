import test from 'node:test';
import assert from 'node:assert/strict';
import {ownReceiptRecord,ownReceiptParams} from '../assets/own-payroll-receipt-model.js';
import {ownReceiptPages} from '../assets/own-payroll-receipt-pdf.js';

// Independent output geometry: known Helvetica AFM advances of this deliberately
// finite glyph set. No product width/wrap helper is imported by these tests.
const advances={'W':944,'i':222,'0':556,'1':556,'2':556,'3':556,'4':556,'5':556,'6':556,'7':556,'8':556,'9':556,'$':556,' ':278,'.':278,',':278,'-':333};
const width=(text,size)=>[...text].reduce((n,char)=>{assert.ok(Object.hasOwn(advances,char),'TEST_GLYPH_NOT_DECLARED');return n+advances[char]*size/1000;},0);
function texts(pages){
 const pattern=/^BT \/(F[12]) ([0-9.]+) Tf [0-9. ]+ rg 1 0 0 1 (-?[0-9.]+) (-?[0-9.]+) Tm <([a-f0-9]*)> Tj ET$/;
 return pages.flatMap((ops,page)=>ops.map(op=>{const m=pattern.exec(op);return m?{font:m[1],size:Number(m[2]),x:Number(m[3]),y:Number(m[4]),text:Buffer.from(m[5],'hex').toString('latin1'),page}:null;}).filter(Boolean));
}
// Same finite, model-valid identity/params shape as the root overlap witness.
// No calculator, source constructor, closed population or legacy fixture runs.
const uid=n=>'11111111-1111-4111-8111-'+String(n).padStart(12,'0');
function fixture(label,amount='123456789012.12'){
 const precision=amount.split('.')[1]?.length??0,zero=precision?'0.'+'0'.repeat(precision):'0';
 const record={sourceGroupId:uid(1),contractId:uid(2),personId:uid(3),registrationId:uid(4),employeeNumber:'900000001',name:'PERSONA EXCLUSIVAMENTE SINTETICA QA',dni:'99999990',cuil:'20999999906',agreementCode:'1',departmentCode:'1',runId:uid(5),liquidationVersion:1,precision,totals:{remuneration:amount,non_remuneration:zero,deduction:zero,employer_contribution:zero,gross:amount,net:amount},concepts:[{code:'7000',label,nature:'remuneration',unit:'money',amount,labelSourceSha256:'a'.repeat(64)}]};
 const params={period:'2026-10',types:['monthly'],filters:{employeeFrom:'',employeeTo:'',departmentFrom:'',departmentTo:'',agreementFrom:'',agreementTo:''},issuer:{name:'MUNICIPIO EXCLUSIVAMENTE SINTETICO QA',taxId:'30990000001',address:'DOMICILIO INVENTADO QA'},paymentDate:null,legend:'CASO SINTETICO DE LIMITES DE MAQUETACION'};
 ownReceiptRecord(record);ownReceiptParams(params);return{record,params,source:{id:uid(1),period:'2026-10',type:'monthly',snapshotSha256:'b'.repeat(64)}};
}
function conceptGeometry(f,formatted){
 const pages=ownReceiptPages(f.record,f.params,f.source),draws=texts(pages),descriptions=draws.filter(x=>/^[Wi ]+$/.test(x.text)&&/[Wi]/.test(x.text)),amounts=draws.filter(x=>x.text===formatted);
 assert.equal(amounts.length,1,'the complete formatted amount occurs once in the concept row');
 const amount=amounts[0],right=amount.x+width(amount.text,amount.size);
 for(const d of descriptions){
  const end=d.x+width(d.text,d.size);assert.ok(d.x>=92&&end<=553+1e-7,'description stays within its page');
  if(d.page===amount.page&&Math.abs(d.y-amount.y)<1e-7)assert.ok(end<=amount.x-8+1e-7,'description and amount retain an eight-point gap');
 }
 assert.ok(Math.abs(right-553)<1e-7,'amount is right-aligned by actual font advances');
 assert.ok(amount.x>=38-1e-7&&right<=553+1e-7,'the entire amount stays within the page, without slicing');
 assert.equal(descriptions.map(x=>x.text).join(''),f.record.concepts[0].label,'all description characters and spaces remain present');
 return{pages,draws,descriptions,amount};
}

test('model-valid180 wide glyphs do not overlap the exact large amount',()=>{
 const f=fixture('W'.repeat(180)),g=conceptGeometry(f,'$ 123.456.789.012,12');
 assert.ok(g.descriptions.length>1);assert.equal(g.amount.size,9);
});

test('a96-digit negative amount retains all eight decimals on one bounded line',()=>{
 const digits='9'.repeat(96),f=fixture('W'.repeat(80)+'  '+'i'.repeat(80),'-'+digits+'.12345678');
 const formatted='$ -'+Array(32).fill('999').join('.')+',12345678',g=conceptGeometry(f,formatted);
 assert.ok(g.amount.size>0&&g.amount.size<9,'wide amount scales only its font, never its numeric value');
 assert.ok(g.descriptions.every(d=>d.page!==g.amount.page||d.y>g.amount.y),'wide amount uses a separate block below description');
});

test('240 narrow glyphs preserve the full text without count-based wrapping',()=>{
 const f=fixture('i'.repeat(240),'1.00'),g=conceptGeometry(f,'$ 1,00');
 assert.ok(g.descriptions.length<5,'available point width is used without a49-character cut');
});

test('long concept rows keep every code, description and complete amount across pages',()=>{
 const f=fixture('W'.repeat(180),'1.00');f.record.concepts=Array.from({length:80},(_,index)=>({...f.record.concepts[0],code:String(7000+index)}));
 f.record.totals={remuneration:'80.00',non_remuneration:'0.00',deduction:'0.00',employer_contribution:'0.00',gross:'80.00',net:'80.00'};ownReceiptRecord(f.record);
 const pages=ownReceiptPages(f.record,f.params,f.source),draws=texts(pages);assert.ok(pages.length>2);
 for(let index=0;index<80;index++)assert.equal(draws.filter(x=>x.text===String(7000+index)).length,1,'each source concept appears once');
 assert.equal(draws.filter(x=>/^W+$/.test(x.text)).map(x=>x.text).join(''),'W'.repeat(80*180));
 assert.equal(draws.filter(x=>x.text==='$ 1,00').length,80);
 for(const row of draws.filter(x=>/^W+$/.test(x.text)||x.text==='$ 1,00')){assert.ok(row.y>=78&&row.y<=796);assert.ok(row.x+width(row.text,row.size)<=553+1e-7);}
});
