import test from 'node:test';import assert from 'node:assert/strict';
import {verifiedOwnArtSource,prepareOwnArtReport,ownArtVisibleRows,ownArtParams,ownClosedTotalCode} from '../assets/own-art-report-model.js';
import {ownArtCsv,ownArtXlsx} from '../assets/own-art-report-export.js';
import {ownArtFixture,rehashArtFixture,artFixtureHash} from './fixtures/own-art-report-synthetic.js';
const report=async v=>prepareOwnArtReport(await verifiedOwnArtSource(v));
test('ART uses the complete own closed census across pages and a search never shortens exports',async()=>{const r=await report(ownArtFixture());assert.equal(r.total,61);assert.equal(r.sourceRecordCount,61);assert.equal(r.canExport,true);assert.equal(r.issueCount,0);assert.equal(r.salaryCents,'610183');assert.equal(ownArtVisibleRows(r,'',3).rows.length,11);const filtered=ownArtVisibleRows(r,'QA 60',1);assert.equal(filtered.rows.length,1);assert.equal(filtered.total,61);assert.equal(ownArtCsv(r).split('\r\n').length,63);assert.equal(r.rows[0].workedDays,'0');});
test('Excel has the five requested nominal columns, exact cent texts, full census and source provenance without macros or formulas',async()=>{const r=await report(ownArtFixture(37)),bytes=ownArtXlsx(r),text=new TextDecoder().decode(bytes);assert.equal(bytes[0],0x50);assert.equal(bytes[1],0x4b);for(const value of['DNI','CUIL','Sexo','Días trabajados','Sueldo (993 + 995)','100.03',r.sourceVersion])assert.ok(text.includes(value));assert.equal((text.match(/<row r=/g)??[]).length,38+48);assert.doesNotMatch(text,/<f>|vbaProject|externalLink|macroEnabled/);assert.ok(text.includes(r.rows.at(-1).dni));});
test('missing days, sex and 995 remain explicit; no 30 or zero defaults and no partial download',async()=>{const v=ownArtFixture(2);v.content.people[0].days.definition.workedDays=null;v.content.people[0].sex=null;v.content.groups[0].snapshot.concepts=v.content.groups[0].snapshot.concepts.filter(r=>!(r.contractId===v.content.people[1].contractId&&r.conceptCode==='995'));v.content.groups[0].snapshot.employees[1].conceptCount--;v.content.groups[0].snapshot.conceptCount--;const r=await report(rehashArtFixture(v));assert.equal(r.canExport,false);assert.equal(r.rows[0].workedDays,null);assert.equal(r.rows[1].salaryCents,null);assert.equal(r.salaryCents,null);assert.match(r.rows[0].issues.join(' '),/sin informar/);assert.throws(()=>ownArtXlsx(r),/todas las observaciones/);assert.throws(()=>ownArtCsv(r),/todas las observaciones/);});
test('old day approval no longer authorizes output after employment source changed',async()=>{const v=ownArtFixture(1);v.content.people[0].daysCurrent=false;const r=await report(rehashArtFixture(v));assert.equal(r.rows[0].workedDays,null);assert.equal(r.canExport,false);assert.match(r.rows[0].issues[0],/vigentes/);});
test('sub-cent precision is rejected without rounding and a partial monetary sum is not a total',async()=>{const v=ownArtFixture(1),row=v.content.groups[0].snapshot.concepts.find(r=>r.conceptCode==='995');row.amount='0.001';row.exactValue={numerator:'1',denominator:'1000'};row.trace[0].result=row.exactValue;row.rounding={precision:3,mode:'exact'};const r=await report(rehashArtFixture(v));assert.equal(r.canExport,false);assert.equal(r.salaryCents,null);assert.match(r.rows[0].issues.join(' '),/No se redondea/);});
test('selected liquidation types sum salary components while counting worked days once',async()=>{const v=ownArtFixture(1),g=structuredClone(v.content.groups[0]);g.id='20000000-0000-4000-8000-000000000001';g.groupId=g.id;g.key='20000000-0000-4000-8000-000000000002';g.body.liquidationType='sac';g.snapshot.liquidationType='sac';v.content.groups.push(g);v.content.params.types=['monthly','sac'];v.content.sourceRecordCount=2;const r=await report(rehashArtFixture(v));assert.equal(r.total,1);assert.equal(r.rows[0].salaryCents,'20006');assert.equal(r.rows[0].workedDays,'0');assert.equal(r.rows[0].sources.length,2);});
test('multiple contracts of one agent and duplicate nominal identity are explicit and disable complete export',async()=>{for(const change of[v=>{v.content.people[1].personId=v.content.people[0].personId;},v=>{v.content.people[1].dni=v.content.people[0].dni;v.content.people[1].cuil=v.content.people[0].cuil;}]){const v=ownArtFixture(2);change(v);const r=await report(rehashArtFixture(v));assert.equal(r.canExport,false);assert.match(r.rows.flatMap(r=>r.issues).join(' '),/contrato|duplicada/);}});
test('an empty closed scope does not invent errors or a nominal file',async()=>{const v=ownArtFixture(1);Object.assign(v.content,{groups:[],people:[],sourceRecordCount:0});const r=await report(rehashArtFixture(v));assert.equal(r.total,0);assert.equal(r.issueCount,0);assert.equal(r.canExport,false);});
test('hash changes, incomplete population, substituted period and repeated closes cannot become trusted artifacts',async()=>{const unverified=ownArtFixture(1);assert.throws(()=>prepareOwnArtReport(unverified),/Verificá/);for(const change of[v=>v.content.complete=false,v=>v.content.sourceRecordCount++,v=>v.content.people.push(v.content.people[0]),v=>v.content.groups.push(v.content.groups[0]),v=>v.content.params.period='2026-09',v=>v.content.people[0].dni='invalid']){const v=ownArtFixture(1);change(v);await assert.rejects(()=>verifiedOwnArtSource(v));}assert.throws(()=>ownArtParams({period:'2026-10',types:['monthly','monthly']}));const r=await report(ownArtFixture(1));assert.throws(()=>ownArtXlsx(structuredClone(r)),/verificar/);});
test('CSV escapes cells and contains only the requested five fields, never names or source identifiers',async()=>{const v=ownArtFixture(1);v.content.people[0].name='=HYPERLINK("https://example.invalid")';const r=await report(rehashArtFixture(v)),csv=ownArtCsv(r);assert.doesNotMatch(csv,/HYPERLINK|1001|source|contract|runId/);assert.match(csv,/"0";"100.03"\r\n/);assert.equal(artFixtureHash(v.content),v.sourceVersion);});
test('extra-SUSS template matches the official layout: eight headers, B and G empty, numeric A/C/F/H, Hoja1, same export gate',async()=>{
 const {ownArtExtraSussXlsx}=await import('../assets/own-art-report-export.js');
 const {ART_EXTRA_SUSS_HEADERS}=await import('../assets/art-extra-suss-template.js');
 const r=await report(ownArtFixture(5)),bytes=ownArtExtraSussXlsx(r),text=new TextDecoder().decode(bytes);
 assert.equal(bytes[0],0x50);assert.equal(bytes[1],0x4b);assert.equal(bytes.rowCount,5);assert.equal(bytes.templateVersion,'art-extra-suss-template.v1');
 const sheet=text.slice(text.indexOf('<worksheet'),text.indexOf('</worksheet>'));
 assert.equal((sheet.match(/<row r=/g)??[]).length,6);
 for(const header of ART_EXTRA_SUSS_HEADERS)assert.ok(sheet.includes('<t xml:space="preserve">'+header.replace('\n','\n')+'</t>')||sheet.includes(header.replace(/&/g,'&amp;')),header);
 assert.equal(ART_EXTRA_SUSS_HEADERS.length,8);assert.equal(ART_EXTRA_SUSS_HEADERS[4],'Sexo (M:Masculino F:Femenino \nX: No Binario)');
 // Data rows: A, C, F, H numeric (<v>), D and E inline strings, no B or G cells at all.
 const rows=sheet.match(/<row r="[2-9]">.*?<\/row>/g);assert.equal(rows.length,5);
 for(const row of rows){assert.match(row,/<c r="A\d+"><v>\d+<\/v><\/c>/);assert.match(row,/<c r="C\d+"><v>\d{11}<\/v><\/c>/);assert.match(row,/<c r="F\d+"><v>\d+<\/v><\/c>/);assert.match(row,/<c r="H\d+"><v>\d+\.\d{2}<\/v><\/c>/);assert.match(row,/<c r="D\d+" t="inlineStr"><is><t xml:space="preserve">[A-ZÁÉÍÓÚÜÑ0-9 .,'-]+<\/t>/);assert.match(row,/<c r="E\d+" t="inlineStr"><is><t xml:space="preserve">[FMX]<\/t>/);assert.doesNotMatch(row,/<c r="[BG]\d+"/);}
 assert.ok(text.includes('<sheet name="Hoja1"'));assert.doesNotMatch(text,/<f>|vbaProject|externalLink|macroEnabled/);
 const blocked=await report(rehashArtFixture(Object.assign(ownArtFixture(1),{})));assert.equal(blocked.canExport,true);
 const incomplete=ownArtFixture(2);incomplete.content.people[0].days.definition.workedDays=null;const b=await report(rehashArtFixture(incomplete));assert.throws(()=>ownArtExtraSussXlsx(b),/todas las observaciones/);
 assert.throws(()=>ownArtExtraSussXlsx(structuredClone(r)),/verificar/);
});
test('extra-SUSS readiness is exact: salary beyond the numeric-cell profile, unrepresentable names or days block only the template, with a visible observation and no rounding',async()=>{
 const {ownArtExtraSussXlsx,ownArtXlsx,ownArtCsv}=await import('../assets/own-art-report-export.js');
 const {artExtraSussReadiness,artExtraSussExactCents,artExtraSussName}=await import('../assets/art-extra-suss-template.js');
 const {decimal,exactEvidence}=await import('../assets/own-payroll-exact.js');
 // 90071992547409.93 is not a double: a Number consumer would read .94 (root finding on PR #263).
 assert.equal(artExtraSussExactCents('9007199254740993'),null);assert.equal(artExtraSussExactCents('9007199254740991'),null);assert.equal(artExtraSussExactCents('999999999999999'),'9999999999999.99');assert.equal(artExtraSussExactCents('10003'),'100.03');assert.equal(artExtraSussExactCents('7'),'0.07');assert.equal(artExtraSussExactCents('-1'),null);assert.equal(artExtraSussExactCents('01'),null);
 const huge=ownArtFixture(1),line=huge.content.groups[0].snapshot.concepts.find(r=>r.conceptCode==='993'),value=exactEvidence(decimal('90071992547409.91'));
 Object.assign(line,{amount:'90071992547409.91',exactValue:value});line.trace[0].result=value;
 const h=await report(rehashArtFixture(huge));assert.equal(h.canExport,true);assert.equal(h.rows[0].salaryCents,'9007199254740993');
 const readiness=artExtraSussReadiness(h);assert.equal(readiness.canExport,false);assert.equal(readiness.issueCount,1);assert.match(readiness.rows[0].issues[0],/rango exacto/);
 assert.throws(()=>ownArtExtraSussXlsx(h),/observaciones propias/);assert.ok(ownArtXlsx(h).length>0);assert.ok(ownArtCsv(h).includes('90071992547409.93'));
 // Names: NFC equivalence is accepted; symbols the insurer's text column cannot carry are an observation, not a crash.
 assert.equal(artExtraSussName('Muñoz, José'),'MUÑOZ, JOSÉ');assert.equal(artExtraSussName(''),null);assert.equal(artExtraSussName('=HYPERLINK("x")'),null);
 for(const [change,pattern]of[[v=>{v.content.people[0].name='=HYPERLINK("https://example.invalid")';},/Apellido y nombre/],[v=>{v.content.people[0].name='Nombré Compuesto';},null]]){
  const v=ownArtFixture(1);change(v);const r=await report(rehashArtFixture(v));assert.equal(r.canExport,true);const ready=artExtraSussReadiness(r);
  if(pattern){assert.equal(ready.canExport,false);assert.match(ready.rows[0].issues[0],pattern);assert.throws(()=>ownArtExtraSussXlsx(r),/observaciones propias/);}
  else{assert.equal(ready.canExport,true);assert.ok(new TextDecoder().decode(ownArtExtraSussXlsx(r)).includes('NOMBRÉ COMPUESTO'));}
 }
 const ok=await report(ownArtFixture(3));assert.deepEqual(artExtraSussReadiness(ok),{canExport:true,issueCount:0,rows:[]});
});
test('extra-SUSS rejects the changed-cent counterexample and noncanonical cents without coercion or truncation',async()=>{
 const {artExtraSussExactCents,artExtraSussIssues}=await import('../assets/art-extra-suss-template.js');
 const changed='70368744177664.12';
 // The former multiplication-based round trip passed despite the consumer changing a cent.
 assert.equal(Math.round(Number(changed)*100).toString(),'7036874417766412');
 assert.equal(Number(changed).toFixed(2),'70368744177664.13');
 for(const value of['7036874417766412','1000000000000000','9007199254740991',7,7n,true,null,undefined,'',' 7','7 ','+7','-0','-1','00','01','7.0','7.00','1e2','1,00','NaN','Infinity'])assert.equal(artExtraSussExactCents(value),null,String(value));
 for(const [value,text]of[['0','0.00'],['7','0.07'],['10003','100.03'],['999999999999998','9999999999999.98'],['999999999999999','9999999999999.99']]){assert.equal(artExtraSussExactCents(value),text);assert.equal(Number(text).toFixed(2),text);}
 const row=(await report(ownArtFixture(1))).rows[0];
 assert.match(artExtraSussIssues({...row,salaryCents:10003}).join(' '),/Sueldo fuera del rango exacto/);
});
test('extra-SUSS monetary readiness and export agree at the numeric-cell limits while native exact amounts remain intact',async()=>{
 const {ownArtExtraSussXlsx}=await import('../assets/own-art-report-export.js');
 const {artExtraSussReadiness}=await import('../assets/art-extra-suss-template.js');
 const {decimal,exactEvidence}=await import('../assets/own-payroll-exact.js');
 for(const[amount,ready]of[['70368744177664.12',false],['10000000000000.00',false],['9999999999999.99',true],['0.00',true],['0.07',true],['100.03',true]]){
  const source=ownArtFixture(1);
  for(const[code,value]of[['993',amount],['995','0.00']]){const line=source.content.groups[0].snapshot.concepts.find(r=>r.conceptCode===code),exact=exactEvidence(decimal(value));Object.assign(line,{amount:value,exactValue:exact,trace:[{operation:'literal',reference:null,stage:null,result:exact}]});}
  rehashArtFixture(source);const original=JSON.stringify(source),r=await report(source),state=artExtraSussReadiness(r);
  assert.equal(r.canExport,true);assert.equal(r.rows[0].salaryCents,BigInt(amount.replace('.','')).toString());assert.equal(state.canExport,ready);assert.ok(ownArtCsv(r).includes(amount));assert.ok(ownArtXlsx(r).length>0);
  if(ready){const text=new TextDecoder().decode(ownArtExtraSussXlsx(r));assert.ok(text.includes('<c r="H2"><v>'+amount+'</v></c>'));assert.equal(Number(amount).toFixed(2),amount);assert.equal(state.issueCount,0);}
  else{assert.equal(state.issueCount,1);assert.match(state.rows[0].issues[0],/15 dígitos/);assert.throws(()=>ownArtExtraSussXlsx(r),/observaciones propias/);}
  assert.equal(JSON.stringify(source),original);
 }
});
test('extra-SUSS does not invent names by converting non-string source values',async()=>{
 const {ownArtExtraSussXlsx}=await import('../assets/own-art-report-export.js');
 const {artExtraSussName,artExtraSussReadiness}=await import('../assets/art-extra-suss-template.js');
 for(const name of[true,12345,['QA'],null,{first:'QA'}]){
  assert.equal(artExtraSussName(name),null);
  const source=ownArtFixture(1);source.content.people[0].name=name;rehashArtFixture(source);const original=JSON.stringify(source),r=await report(source),state=artExtraSussReadiness(r);
  assert.equal(r.canExport,true);assert.equal(state.canExport,false);assert.equal(state.issueCount,1);assert.match(state.rows[0].issues[0],/Apellido y nombre/);assert.throws(()=>ownArtExtraSussXlsx(r),/observaciones propias/);assert.ok(ownArtCsv(r).length>0);assert.ok(ownArtXlsx(r).length>0);assert.equal(JSON.stringify(source),original);
 }
});
test('extra-SUSS NFC output does not replace the original recorded name',async()=>{
 const {ownArtExtraSussXlsx}=await import('../assets/own-art-report-export.js');
 const {artExtraSussReadiness}=await import('../assets/art-extra-suss-template.js');
 const source=ownArtFixture(1),name='  Muñoz,\tJosé  ';source.content.people[0].name=name;rehashArtFixture(source);const original=JSON.stringify(source),r=await report(source);
 assert.equal(r.rows[0].name,name);assert.equal(artExtraSussReadiness(r).canExport,true);assert.ok(new TextDecoder().decode(ownArtExtraSussXlsx(r)).includes('MUÑOZ, JOSÉ'));assert.equal(JSON.stringify(source),original);
});
test('extra-SUSS readiness catches normalized CUIL length before the existing exporter guard',async()=>{
 const {ownArtExtraSussXlsx}=await import('../assets/own-art-report-export.js');
 const {artExtraSussReadiness}=await import('../assets/art-extra-suss-template.js');
 // Deliberately synthetic prefix accepted by the current source checksum contract.
 // This checks agreement with the existing exporter, not the legal validity of a CUIL prefix.
 const source=ownArtFixture(1),p=source.content.people[0],base='00'+p.dni,n=11-[5,4,3,2,7,6,5,4,3,2].reduce((sum,w,i)=>sum+w*Number(base[i]),0)%11;
 p.cuil=base+(n===11?'0':n===10?'9':String(n));rehashArtFixture(source);const original=JSON.stringify(source),r=await report(source),state=artExtraSussReadiness(r);
 assert.equal(r.canExport,true);assert.equal(state.canExport,false);assert.equal(state.issueCount,1);assert.match(state.rows[0].issues[0],/CUIL de 11 dígitos/);assert.throws(()=>ownArtExtraSussXlsx(r),/observaciones propias/);assert.ok(ownArtCsv(r).includes(p.cuil));assert.ok(ownArtXlsx(r).length>0);assert.equal(JSON.stringify(source),original);
});

// Cierre con total oficial (V4/V5): documentos que devolvió PostgreSQL 18.6 con el candidato nativo. El cierre guarda los
// totales de GRH como 800000993 y 800000995, y conserva esa correspondencia en cada legajo.
const officialArtSource=async version=>{
 const {nativeOfficial}=await import('./fixtures/own-payroll-native-official-pg18.js'),receipt=nativeOfficial(version).closeReceipt,s=receipt.snapshot,v=ownArtFixture(s.employeeCount);
 v.content.groups=[receipt];v.content.params={period:s.period,types:[s.liquidationType]};v.content.sourceRecordCount=s.employeeCount;
 s.employees.forEach((e,i)=>Object.assign(v.content.people[i],{contractId:e.contractId,employeeNumber:e.employeeNumber}));
 v.sourceVersion=artFixtureHash(v.content);return v;
};
for(const version of ['v5','v4'])test('ART lee 993 y 995 de un cierre con total oficial '+version.toUpperCase()+' con el código que el cierre conservó',async()=>{
 const v=await officialArtSource(version),e=v.content.groups[0].snapshot.employees[0],codes=v.content.groups[0].snapshot.concepts.map(r=>r.conceptCode);
 assert.deepEqual([e.totalReconciliation.sourceTotals['993'],e.totalReconciliation.sourceTotals['995']],['800000993','800000995']);
 assert.ok(!codes.includes('993')&&!codes.includes('995'),'el cierre oficial no trae renglones 993 ni 995');
 assert.equal(ownClosedTotalCode(e,'993'),'800000993');assert.equal(ownClosedTotalCode(e,'701'),'701','un código que el cierre no conservó como total queda igual');
 const r=await report(v);
 assert.equal(r.rows[0].concept993Cents,'20001');assert.equal(r.rows[0].concept995Cents,'25230000');assert.equal(r.rows[0].salaryCents,'25250001');
 assert.equal(r.salaryCents,'25250001');assert.deepEqual(r.rows[0].issues,[]);assert.equal(r.canExport,true);
 assert.equal(r.rows[0].salaryCents,String(Math.round(Number(e.totals.remuneration)*100)+Math.round(Number(e.totals.non_remuneration)*100)),'993 + 995 es el remunerativo más el no remunerativo oficiales');
});
test('ART no inventa el total oficial: si falta el renglón conservado lo informa, y un cierre anterior sigue leyendo 993 y 995',async()=>{
 const v=await officialArtSource('v5'),s=v.content.groups[0].snapshot;
 assert.equal(ownClosedTotalCode({totalReconciliation:null},'993'),'993');assert.equal(ownClosedTotalCode({},'995'),'995');assert.equal(ownClosedTotalCode({totalReconciliation:{sourceTotals:{'993':800000993}}},'993'),'993','una correspondencia que no es texto no se usa');
 const plain=ownArtFixture(1).content.groups[0].snapshot;assert.ok(plain.concepts.some(r=>r.conceptCode==='993')&&!plain.concepts.some(r=>r.conceptCode==='800000993'),'el cierre anterior trae 993 con su código');
 const before=await report(ownArtFixture(1));assert.equal(before.canExport,true);assert.equal(before.rows[0].issues.length,0);
 // Sin la correspondencia conservada, el mismo cierre oficial no tiene de dónde leer 993 ni 995: se informa, no se supone.
 const lines=code=>s.concepts.filter(r=>r.conceptCode===ownClosedTotalCode({totalReconciliation:null},code));assert.equal(lines('993').length,0);assert.equal(lines('995').length,0);
});

