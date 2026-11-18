import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {ownGrhComparison,grhStatementLines,OWN_GRH_JOIN,OWN_GRH_STATUS,OWN_GRH_GROUP_NATURES,OWN_GRH_TYPES} from '../assets/own-grh-comparison-model.js';
import {comparisonSources} from './fixtures/own-payroll-comparison-synthetic.js';

// Datos sintéticos: legajos y conceptos del fixture propio, sin personas reales.
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
const setup=(n=2)=>{const {base}=comparisonSources(n);return {own:base,grh:grhFrom(base)};};
const join={...OWN_GRH_JOIN};
const line=(grh,legajo,code)=>grh.statements.find(s=>s.legajo===legajo).lines.find(l=>l.code===code);
const plus=(v,c)=>{const n=BigInt(v.replace('.',''))+BigInt(c),a=n<0n?-n:n;return (n<0n?'-':'')+(a/100n)+'.'+String(a%100n).padStart(2,'0');};
const find=(m,legajo,label,kind='concept')=>(kind==='concept'?m.rows:m.totals).filter(r=>r.legajo===legajo&&r.label===label);

test('igualdad: todo lo que GRH informa coincide y los auxiliares propios quedan a la vista como sólo en MuniControl',()=>{
 const {own,grh}=setup(),before=structuredClone({own,grh}),m=ownGrhComparison(own,grh,join);
 assert.deepEqual({own,grh},before,'no modifica las fuentes');assert.ok(Object.isFrozen(m)&&Object.isFrozen(m.rows[0]));
 assert.equal(m.version,'own-grh-comparison.v1');assert.equal(m.summary.legajos,2);assert.equal(m.totals.length,8);
 for(const r of m.totals){assert.equal(r.status,'equal');assert.equal(r.delta,'0.00');assert.equal(r.review,false);}
 const aux=m.rows.filter(r=>r.own?.nature==='auxiliary');assert.ok(aux.length>0);
 for(const r of aux){assert.equal(r.status,'only_own');assert.equal(r.grh,null);assert.equal(r.delta,null);assert.equal(r.state,'Sólo en MuniControl');}
 for(const r of m.rows.filter(r=>r.own?.nature!=='auxiliary')){assert.equal(r.status,'equal');assert.equal(r.state,'Sin diferencia');}
 assert.equal(m.summary.difference+m.summary.rounding+m.summary.onlyGrh+m.summary.notComparable+m.summary.missing,0);
 assert.deepEqual(m.rows.map(r=>r.legajo+':'+r.code),[...m.rows].sort((a,b)=>a.legajo.localeCompare(b.legajo)||Number(a.code)-Number(b.code)).map(r=>r.legajo+':'+r.code));
});

test('3 centavos en retenciones se rotulan como redondeo, visibles y sin igualar',()=>{
 const {own,grh}=setup(1),l=line(grh,'1001','210'),t=line(grh,'1001','996');
 l.amount=plus(l.amount,3);t.amount=plus(t.amount,3);
 const m=ownGrhComparison(own,grh,join),[c]=find(m,'1001','210'),[total]=find(m,'1001','Retenciones','total');
 for(const r of [c,total]){assert.equal(r.status,'rounding');assert.equal(r.delta,'-0.03');assert.equal(r.rounding,true);assert.equal(r.review,false);
  assert.equal(r.state,'Diferencia de redondeo (hasta 5 centavos)');assert.notEqual(r.own.amount,r.grh.amount);}
 assert.equal(m.summary.rounding,2);
 // El mismo desvío en un concepto que no es retención es una diferencia real; en un total, redondeo.
 const {own:o2,grh:g2}=setup(1),h=line(g2,'1001','100'),b=line(g2,'1001','993');h.amount=plus(h.amount,3);b.amount=plus(b.amount,3);
 const m2=ownGrhComparison(o2,g2,join);assert.equal(find(m2,'1001','100')[0].status,'difference');assert.equal(find(m2,'1001','Bruto','total')[0].status,'rounding');
});

test('6 centavos son una variación real que pide revisión',()=>{
 const {own,grh}=setup(1),l=line(grh,'1001','210'),t=line(grh,'1001','996');
 l.amount=plus(l.amount,-6);t.amount=plus(t.amount,-6);
 const m=ownGrhComparison(own,grh,join);
 for(const r of [find(m,'1001','210')[0],find(m,'1001','Retenciones','total')[0]]){assert.equal(r.status,'difference');assert.equal(r.delta,'0.06');assert.equal(r.review,true);assert.equal(r.rounding,false);assert.equal(r.state,'Diferencia');}
});

test('un legajo en un solo lado se informa entero, nunca como cero',()=>{
 const {own,grh}=setup(2);grh.statements=grh.statements.filter(s=>s.legajo!=='1002');
 grh.statements.push({...structuredClone(grh.statements[0]),legajo:'9999',statementId:id(77),statementHash:hex(77)});
 const m=ownGrhComparison(own,grh,join);
 const onlyOwn=[...m.rows,...m.totals].filter(r=>r.legajo==='1002'),onlyGrh=[...m.rows,...m.totals].filter(r=>r.legajo==='9999');
 assert.ok(onlyOwn.length>4&&onlyOwn.every(r=>r.status==='only_own'&&r.grh===null&&r.delta===null&&r.review&&r.own!==null&&r.statementId===null));
 assert.ok(onlyGrh.length>4&&onlyGrh.every(r=>r.status==='only_grh'&&r.own===null&&r.delta===null&&r.contractId===null&&r.state==='Sólo en GRH'));
 assert.equal(m.summary.onlyOwnLegajos,1);assert.equal(m.summary.onlyGrhLegajos,1);assert.ok(m.warnings.some(w=>/no coinciden/.test(w)));
});

test('un concepto en un solo lado dentro de un legajo presente',()=>{
 const {own,grh}=setup(1),s=grh.statements[0];s.lines=s.lines.filter(l=>l.code!=='120');
 s.lines.push({code:'777',description:'Concepto sintético GRH',amount:'5.00',quantity:null,totalGroup:'994',unit:null});
 const m=ownGrhComparison(own,grh,join),[a]=find(m,'1001','120'),[b]=find(m,'1001','777');
 assert.equal(a.status,'only_own');assert.equal(a.own.amount,'20.00');assert.equal(a.grh,null);assert.equal(a.delta,null);
 assert.equal(b.status,'only_grh');assert.equal(b.grh.amount,'5.00');assert.equal(b.own,null);assert.equal(b.delta,null);
});

test('unidad o naturaleza incompatibles: diferencia no evaluable',()=>{
 // Sólo un auxiliar propio puede tener otra unidad (el motor exige pesos al resto); GRH informa importes en pesos.
 const {own,grh}=setup(1),r=own.saved.result.rows.find(r=>r.conceptCode==='900'),rule=own.saved.input.rules.find(r=>r.code==='900');
 r.unit='hours';rule.unit='hours';rule.expression={op:'literal',value:'1',unit:'hours'};
 grh.statements[0].lines.push({code:'900',description:'Concepto sintético en pesos',amount:'33.37',quantity:null,totalGroup:'993',unit:null});
 line(grh,'1001','110').totalGroup='996';
 const m=ownGrhComparison(own,grh,join),[hours]=find(m,'1001','900');
 assert.equal(hours.own.unit,'hours');assert.equal(hours.grh.unit,'money');
 for(const code of ['900','110']){const [x]=find(m,'1001',code);assert.equal(x.status,'not_comparable');assert.equal(x.delta,null);assert.equal(x.review,true);assert.match(x.state,/no evaluable/);assert.ok(x.own.amount!==null&&x.grh.amount!==null,'ambos importes quedan visibles');}
 line(grh,'1001','110').totalGroup=null;assert.equal(find(ownGrhComparison(own,grh,join),'1001','110')[0].status,'not_comparable','un renglón GRH sin acumulador no tiene naturaleza declarada');
});

test('un total GRH incompleto no se completa con cero',()=>{
 const {own,grh}=setup(1),s=grh.statements[0];s.lines=s.lines.filter(l=>l.code!=='995');
 const [b]=find(ownGrhComparison(own,grh,join),'1001','Bruto','total');assert.equal(b.status,'missing');assert.equal(b.grh.amount,null);assert.equal(b.delta,null);assert.equal(b.review,true);
 line(grh,'1001','100').amount=null;assert.equal(find(ownGrhComparison(own,grh,join),'1001','100')[0].status,'missing');
});

test('la unión se declara, es texto exacto y nunca ambigua',()=>{
 const {own,grh}=setup(2);
 for(const bad of [undefined,{},{own:'employeeNumber'},{own:'contractId',grh:'legajo'},{own:'employeeNumber',grh:'legajo',extra:true}])assert.throws(()=>ownGrhComparison(own,grh,bad),/Declará la unión/);
 const zeros=structuredClone(grh);zeros.statements[0].legajo='01001';
 const m=ownGrhComparison(own,zeros,join);assert.ok(m.totals.filter(r=>r.legajo==='1001').every(r=>r.status==='only_own'));assert.ok(m.totals.filter(r=>r.legajo==='01001').every(r=>r.status==='only_grh'));
 const dup=structuredClone(grh);dup.statements[1].legajo='1001';assert.throws(()=>ownGrhComparison(own,dup,join),/ambigua/);
 const twin=structuredClone(own);twin.saved.input.employees[1].employeeNumber='1001';for(const r of twin.saved.result.rows.filter(r=>r.contractId===twin.saved.input.employees[1].contractId))r.employeeNumber='1001';
 assert.throws(()=>ownGrhComparison(twin,grh,join),/ambigua/);
});

test('mismo período y tipo, fuente GRH completa y bien formada',()=>{
 const {own,grh}=setup(1);
 assert.throws(()=>ownGrhComparison(own,{...grh,period:'2026-09'},join),/mismo período/);
 assert.throws(()=>ownGrhComparison(own,{...grh,payrollType:'S'},join),/mismo tipo/);
 assert.throws(()=>ownGrhComparison(own,{...grh,complete:false},join),/completa/);
 assert.throws(()=>ownGrhComparison(own,{...grh,official:true},join),/formato/);
 for(const change of [s=>{s.lines[0].amount='1.5';},s=>{s.lines.push({...s.lines[0]});},s=>{s.legajo='A1';},s=>{s.lines[0].extra=1;},s=>{s.lines=[];},s=>{s.lines[0].unit='x'.repeat(13);}]){
  const copy=structuredClone(grh);change(copy.statements[0]);assert.throws(()=>grhStatementLines(copy));
 }
 assert.equal(OWN_GRH_TYPES.supplementary,undefined,'suplementaria no tiene letra GRH declarada');
});

test('la correspondencia acumulador → naturaleza es la del motor oficial y los rótulos son fijos',()=>{
 const src=fs.readFileSync('assets/own-payroll-official-totals.js','utf8');
 assert.ok(src.includes("const expectedNatures="+JSON.stringify(OWN_GRH_GROUP_NATURES).replaceAll('"',"'")+';'));
 assert.equal(OWN_GRH_STATUS.rounding,'Diferencia de redondeo (hasta 5 centavos)');assert.equal(OWN_GRH_STATUS.only_own,'Sólo en MuniControl');assert.equal(OWN_GRH_STATUS.only_grh,'Sólo en GRH');
 const model=fs.readFileSync('assets/own-grh-comparison-model.js','utf8');assert.ok(!/fetch\(|sql|localStorage|Math\.round|toFixed/.test(model),'modelo puro, sin redondeos ni lecturas');
});

test('el límite es de la comparación completa: si no entra entera, no se compara ni se recorta',()=>{
 const {own,grh}=setup(1),extra=Array.from({length:62500},(_,i)=>({legajo:String(100000+i),statementId:'30000000-0000-4000-8000-'+String(i).padStart(12,'0'),statementHash:hex(5000+i),
  lines:[{code:'999',description:null,amount:'1.00',quantity:null,totalGroup:null,unit:null}]}));
 grh.statements.push(...extra);
 assert.throws(()=>ownGrhComparison(own,grh,join),/supera 250\.000 filas\. No se omitieron ni dividieron registros/);
 grh.statements.length=1+62000;const m=ownGrhComparison(own,grh,join);assert.equal(m.summary.legajos,62001);assert.equal(m.totals.length,62001*4);
});
