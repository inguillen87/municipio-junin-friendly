import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {grhSinglePrecision} from '../assets/grh-single-precision.js';
import {ownGrhComparison,ownGrhComparisonView,ownGrhComparisonDocument,OWN_GRH_JOIN,OWN_GRH_STATUS} from '../assets/own-grh-comparison-model.js';
import {comparisonSources,resealComparison} from './fixtures/own-payroll-comparison-synthetic.js';

// Datos sintéticos. Los pares escala → importe liquidado son valores de catálogo, no de personas.
test('un importe exacto queda en GRH como su valor de precisión simple, escrito con los dígitos mínimos',()=>{
 for(const [exact,stored] of [['382692.71','382692.72'],['463058.18','463058.20'],['524289.01','524289.00'],['600827.55','600827.56'],['654404.53','654404.50'],['3192036.70','3192036.80']])
  assert.equal(grhSinglePrecision(exact),stored,exact);
 // Los que la precisión simple sí puede guardar no cambian.
 for(const same of ['551077.50','493673.60','15000.00','0.75','0.00','131071.99','20000000.00']) assert.equal(grhSinglePrecision(same),same,same);
 assert.equal(grhSinglePrecision('-382692.71'),'-382692.72');assert.equal(grhSinglePrecision('5'),'5.00');
});

test('por debajo de 131.072 pesos todos los centavos se guardan: ningún importe chico se acerca a otro',()=>{
 for(let cents=0;cents<13107200;cents+=977){const text=Math.floor(cents/100)+'.'+String(cents%100).padStart(2,'0');assert.equal(grhSinglePrecision(text),text,text);}
 for(let cents=13100000;cents<13107200;cents++){const text=Math.floor(cents/100)+'.'+String(cents%100).padStart(2,'0');assert.equal(grhSinglePrecision(text),text,text);}
});

test('por encima, el resultado nunca se aleja más de un paso de precisión simple y es estable',()=>{
 // Paso de la precisión simple en milésimas de centavo: 1/64, 1/32, 1/16, 1/8 y 1/4 de peso.
 const toCents=text=>{const [whole,part]=text.split('.');return BigInt(whole)*100n+BigInt(part);};
 for(const [from,step] of [[13107200,1563],[26214400,3125],[52428800,6250],[104857600,12500],[209715200,25000]]){
  for(let cents=from;cents<from+250000;cents+=7){
   const text=Math.floor(cents/100)+'.'+String(cents%100).padStart(2,'0'),stored=grhSinglePrecision(text);
   assert.match(stored,/^[0-9]+\.[0-9]{2}$/);
   const delta=toCents(stored)-BigInt(cents);assert.ok((delta<0n?-delta:delta)*1000n<=BigInt(step)+1000n,text+' → '+stored);
   assert.equal(grhSinglePrecision(stored),stored,'guardar dos veces no cambia nada: '+stored);
  }
 }
});

test('no afirma nada cuando no puede: otros formatos, más decimales que centavos o valores sin sentido',()=>{
 for(const bad of [null,undefined,382692.71,'','abc','1,50','1.','.5','01.00','1e5','NaN','Infinity','12345678901234.00','1.1234567']) assert.equal(grhSinglePrecision(bad),null,String(bad));
 assert.equal(grhSinglePrecision('123.456'),null,'la forma más corta no cabe en centavos: no se redondea');
});

const group={remuneration:'993',non_remuneration:'994',deduction:'996',employer_contribution:'990'};
const hex=n=>n.toString(16).padStart(64,'0'),id=n=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0');
function grhFrom(capture){
 const {input,result}=capture.saved,people=new Map(input.employees.map(e=>[e.contractId,e]));
 const statements=result.employeeTotals.map((t,i)=>{
  const lines=result.rows.filter(r=>r.contractId===t.contractId&&r.nature!=='auxiliary').map(r=>({code:r.conceptCode,description:'Concepto sintético '+r.conceptCode,amount:r.amount,quantity:null,totalGroup:group[r.nature],unit:null}));
  for(const [code,amount]of [['990',t.employer_contribution],['993',t.remuneration],['994',t.non_remuneration],['995','0.00'],['996',t.deduction],['999',t.net]])
   lines.push({code,description:'Total sintético '+code,amount,quantity:null,totalGroup:null,unit:null});
  return {legajo:people.get(t.contractId).employeeNumber,statementId:id(i+1),statementHash:hex(i+1),lines};
 });
 return {version:'grh-statement-lines.v1',official:false,datasetId:id(900),period:input.period,payrollType:'M',closureStatus:'closed',sourceHash:hex(900),complete:true,statements};
}

test('la comparación contra GRH distingue «igual con la precisión de GRH» de una diferencia real',()=>{
 const {base}=comparisonSources(2),grh=grhFrom(base),legajo=grh.statements[0].legajo,row=code=>grh.statements[0].lines.find(l=>l.code===code);
 const model=amount=>{const g=structuredClone(grh);g.statements[0].lines.find(l=>l.code==='100').amount=amount;return ownGrhComparison(base,g,{...OWN_GRH_JOIN});};
 assert.equal(row('100').amount,'100.10','el fixture liquida 100,10 en el concepto 100');
 // Importe chico: un centavo de diferencia es una diferencia. La precisión simple guarda todos los centavos ahí.
 const small=model('100.11').rows.find(r=>r.legajo===legajo&&r.code==='100');
 assert.deepEqual([small.status,small.review,small.delta],['difference',true,'-0.01']);
 assert.equal(OWN_GRH_STATUS.grh_precision,'Igual con la precisión de GRH');
 const source=fs.readFileSync('assets/own-grh-comparison-model.js','utf8');
 assert.match(source,/const single=grhSinglePrecision\(own\.amount\);\n if\(single!==null&&zero\(subtract\(single,grh\.amount\)\)\)return \{status:'grh_precision',delta\};/);
 assert.ok(source.indexOf("status:'equal',delta")<source.indexOf("status:'grh_precision',delta")&&source.indexOf("status:'grh_precision',delta")<source.indexOf("?'rounding':'difference'"),'primero igual, después precisión de GRH, después redondeo o diferencia');
 assert.match(source,/review:!\['equal','rounding','grh_precision'\]\.includes\(status\)/);
});

test('la vista y las descargas cuentan aparte lo igual por precisión de GRH y no lo mandan a revisar',()=>{
 const {base}=comparisonSources(2),real=ownGrhComparison(base,grhFrom(base),{...OWN_GRH_JOIN});
 // Modelo de presentación armado a mano sobre uno real: dos filas pasan a «igual con la precisión de GRH».
 const model=structuredClone(real),touched=model.rows.filter(r=>r.status==='equal').slice(0,2);
 for(const r of touched){r.status='grh_precision';r.state=OWN_GRH_STATUS.grh_precision;r.own.amount='382692.71';r.grh.amount='382692.72';r.delta='-0.01';r.review=false;}
 const all=ownGrhComparisonView(model,{view:'concepts'}),only=ownGrhComparisonView(model,{view:'concepts',status:'grh_precision'}),review=ownGrhComparisonView(model,{view:'concepts',status:'review'});
 assert.equal(all.grhPrecision,2);assert.equal(only.filtered,2);assert.ok(only.rows.every(r=>r.status==='grh_precision'));
 assert.equal(all.equal,ownGrhComparisonView(real,{view:'concepts'}).equal-2);assert.ok(review.rows.every(r=>r.status!=='grh_precision'));
 const doc=ownGrhComparisonDocument(model,'concepts');
 assert.deepEqual(doc.metadata.find(m=>m[0]==='Iguales con la precisión de GRH (vista completa)'),['Iguales con la precisión de GRH (vista completa)',2]);
 assert.ok(doc.notes.some(n=>/precisión simple/.test(n)));
 assert.ok(!ownGrhComparisonDocument(real,'concepts').notes.some(n=>/precisión simple/.test(n)),'sin filas de ese tipo no agrega la nota');
 assert.equal(real.summary.grhPrecision,0);
 assert.throws(()=>ownGrhComparisonView(model,{view:'concepts',status:'precision'}),/filtros válidos/);
});

test('el panel ofrece el filtro, la tarjeta y la explicación; el modelo de comparación sigue sin redondear',()=>{
 const panel=fs.readFileSync('assets/own-grh-comparison-panel.js','utf8'),model=fs.readFileSync('assets/own-grh-comparison-model.js','utf8'),rule=fs.readFileSync('assets/grh-single-precision.js','utf8');
 assert.match(panel,/<option value="grh_precision">Iguales con la precisión de GRH<\/option>/);
 assert.match(panel,/card\(v\.grhPrecision,v\.grhPrecision===1\?'Igual con la precisión de GRH':'Iguales con la precisión de GRH','grh_precision','info'\)/);
 assert.match(panel,/grh_precision:v\.grhPrecision/);assert.match(panel,/precisión simple/);
 assert.ok(!/Math\.round|toFixed/.test(model),'la comparación no redondea');assert.ok(!/Math\.round|toFixed|Math\.abs\(.*\)\s*<=/.test(rule),'la regla no redondea ni usa tolerancias');
 assert.match(model,/import \{grhSinglePrecision\} from '\.\/grh-single-precision\.js';/);
 // El sitio publicado copia una lista explícita de archivos: la regla tiene que estar en ella o la pantalla no carga.
 assert.match(fs.readFileSync('scripts/build-friendly.mjs','utf8'),/'assets\/grh-single-precision\.js',\n  'assets\/own-grh-comparison-model\.js',/);
});
