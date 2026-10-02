import test from 'node:test';
import assert from 'node:assert/strict';
import {readSheet} from 'read-excel-file/node';
import {unzipSync,strFromU8} from 'fflate';
import {assertNativeLeaveExportSame,nativeLeaveExportTables,nativeLeaveCsv,nativeLeaveXlsx} from '../assets/native-leave-export.js';
import {CONTRACT,ID,annual,profile,entity,bootstrap,withRows} from './fixtures/native-leave-synthetic.js';

const at='2026-10-02T18:45:00.123Z';
const uuid=n=>String(n).padStart(8,'0')+'-0000-4000-8000-000000000000';
const object=(t,row)=>Object.fromEntries(t.headers.map((key,i)=>[key,row[i]]));
const csvRows=csv=>csv.replace(/^\uFEFF/,'').trimEnd().split('\r\n').map(line=>[...line.matchAll(/"((?:[^"]|"")*)"(?:;|$)/g)].map(m=>m[1].replaceAll('""','"')));
const ledger=()=>withRows(Array.from({length:75},(_,i)=>entity(uuid(i+1),annual(),['create','submit','approve'])),[entity(ID,profile({entitledUnits:200}),['profile_propose','profile_approve'],'profile')]);

test('complete ledger exports all 75 requests and 225 historical decisions without changing the source',()=>{
 const b=ledger(),before=JSON.stringify(b),t=nativeLeaveExportTables(b,CONTRACT,at);
 assert.equal(t.requests.length,75);assert.equal(t.decisions.length,225);assert.equal(t.profiles.length,3);assert.equal(t.balances.length,1);
 assert.equal(new Set(t.requests.map(r=>object(t,r).Referencia)).size,75);
 assert.deepEqual(t.control.find(r=>r[0]==='Solicitudes únicas'),['Solicitudes únicas',75]);
 assert.equal(JSON.stringify(b),before);
 const rows=csvRows(nativeLeaveCsv(b,CONTRACT,at));assert.equal(rows.filter(r=>r[0]==='Solicitud').length,75);assert.equal(rows.filter(r=>r[0]==='Decisión de solicitud').length,225);
 assert.ok(rows.every(r=>r.length===26));
});

test('each historical version retains its dates, state, version, actor, evidence and explicit review',()=>{
 const r=entity(ID,annual({startsOn:'2026-10-04',endsOn:'2026-10-05'}),['create','update_draft','submit','approve','cancel']);
 r.history[0].payload=annual();
 const t=nativeLeaveExportTables(withRows([r]),CONTRACT,at),rows=t.decisions.map(r=>object(t,r));
 assert.deepEqual(rows.map(r=>[r.Versión,r.Estado,r.Inicio,r['Final inclusive']]),[[1,'Borrador','2026-10-01','2026-10-02'],[2,'Borrador','2026-10-04','2026-10-05'],[3,'Pendiente de revisión','2026-10-04','2026-10-05'],[4,'Aprobada','2026-10-04','2026-10-05'],[5,'Cancelada','2026-10-04','2026-10-05']]);
 assert.equal(rows[3].Evidencia,'Verificada');assert.equal(rows[3]['Revisión manual'],'Sí');assert.equal(rows[0]['Revisión manual'],'No');assert.equal(rows[4].Acción,'Cancelar solicitud');assert.equal(rows[0].Responsable,'Preparador sintético');
});

test('cross-year requests keep one identity and explicit allocation rows, never duplicate the unique request count',()=>{
 const t=nativeLeaveExportTables(withRows([entity(ID,annual({startsOn:'2026-12-31',endsOn:'2027-01-02'}))]),CONTRACT,at);
 assert.deepEqual(t.requests.map(r=>[object(t,r).Referencia,object(t,r).Año,object(t,r).Unidades]),[[ID,2026,1],[ID,2027,2]]);
 assert.equal(t.decisions.length,2);assert.deepEqual(t.control.find(r=>r[0]==='Solicitudes únicas'),['Solicitudes únicas',1]);
});

test('minute requests preserve local times and exact requested minutes without converting to hours',()=>{
 const p=annual({reasonCode:'13',policyRuleId:'lactation',durationUnit:'minute',confidentiality:'restricted',startsOn:'2026-10-01',endsOn:'2026-10-01',startsAtLocal:'09:07',endsAtLocal:'09:48'});
 const t=nativeLeaveExportTables(withRows([entity(ID,p)]),CONTRACT,at),r=object(t,t.requests[0]);
 assert.equal(r['Hora inicial local'],'09:07');assert.equal(r['Hora final local'],'09:48');assert.equal(r.Unidades,41);assert.equal(r['Unidad declarada'],'Minutos');
});

test('zero, unknown and not applicable balances remain different and all profile decisions are preserved',()=>{
 const declarations=[entity(uuid(101),profile({entitledUnits:0}),['profile_propose','profile_approve'],'profile'),entity(uuid(102),profile({year:2027,mode:'not_applicable',entitledUnits:null}),['profile_propose','profile_approve'],'profile'),entity(uuid(103),profile({year:2029}),['profile_propose','profile_reject'],'profile')];
 const b=withRows([entity(ID,annual({startsOn:'2028-10-01',endsOn:'2028-10-02'}))],declarations),t=nativeLeaveExportTables(b,CONTRACT,at),rows=t.balances.map(r=>object(t,r));
 assert.deepEqual(rows.map(r=>[r.Año,r['Saldo total'],r.Disponibles,r['Tratamiento del saldo']]),[[2026,0,0,'Cantidad declarada con respaldo'],[2027,'','','No aplicable con respaldo'],[2028,'','','Sin declaración aprobada']]);
 assert.equal(t.profiles.length,9);assert.ok(t.profiles.some(r=>object(t,r).Estado==='Saldo rechazado'));assert.equal(t.profiles.filter(r=>r[0]==='Decisión de saldo').length,6);
});

test('empty complete review emits zero counts and five header-bearing sheets without inventing requests',async()=>{
 const b=bootstrap(),t=nativeLeaveExportTables(b,CONTRACT,at);assert.equal(t.requests.length+t.decisions.length+t.balances.length+t.profiles.length,0);
 assert.deepEqual(t.control.find(r=>r[0]==='Solicitudes únicas'),['Solicitudes únicas',0]);
 const rows=csvRows(nativeLeaveCsv(b,CONTRACT,at));assert.equal(rows.filter(r=>r[0]==='Solicitud').length,0);
 const bytes=Buffer.from(nativeLeaveXlsx(b,CONTRACT,at));for(const name of ['Solicitudes','Decisiones','Saldos','Declaraciones'])assert.equal((await readSheet(bytes,name)).length,1);
});

test('CSV quotes delimiters and apostrophes formula-leading subject and actor labels; XLSX uses literal string cells',async()=>{
 const b=withRows([entity(ID)]);b.subject.employeeName='=1+1; "QA"';b.requests[0].authorLabel='@SUM(1)';b.requests[0].history[0].actorLabel='@SUM(1)';
 const csv=nativeLeaveCsv(b,CONTRACT,at),rows=csvRows(csv),t=nativeLeaveExportTables(b,CONTRACT,at);
 assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.endsWith('\r\n'));assert.equal(rows.find(r=>r[0]==='Decisión de solicitud')[21],"'@SUM(1)");assert.equal(rows.find(r=>r[24]==='Persona')[25],"'=1+1; \"QA\"");
 const zip=unzipSync(nativeLeaveXlsx(b,CONTRACT,at));for(const [name,bytes]of Object.entries(zip))if(name.startsWith('xl/worksheets/')){const xml=strFromU8(bytes);assert.doesNotMatch(xml,/<f(?:\s|>)/);assert.doesNotMatch(xml,/<c[^>]+t="(?:n|b)"/);}
 const control=await readSheet(Buffer.from(nativeLeaveXlsx(b,CONTRACT,at)),'Control');assert.equal(control.find(r=>r[0]==='Persona')[1],b.subject.employeeName);
 assert.equal(t.requests.length,1);
});

for(const value of ['+1','-1','=SUM(1)','@SUM(1)'])test('CSV neutralizes formula prefix '+value,()=>{
 const b=bootstrap();b.subject.employeeName=value;assert.equal(csvRows(nativeLeaveCsv(b,CONTRACT,at)).find(r=>r[24]==='Persona')[25],"'"+value);
});

test('both formats omit free observations, decisions, legal references, identity/scope hashes and registration metadata',()=>{
 const p=annual({employeeNote:'OBSERVACION PRIVADA SINTETICA'}),r=entity(ID,p,['create','submit','approve']);r.history[1].reason='FUNDAMENTO PRIVADO SINTETICO';
 const b=withRows([r],[entity(uuid(101),profile({legalReference:'REFERENCIA PRIVADA SINTETICA',reason:'MOTIVO PRIVADO SINTETICO'}),['profile_propose','profile_approve'],'profile')]);
 const outputs=[nativeLeaveCsv(b,CONTRACT,at),Object.values(unzipSync(nativeLeaveXlsx(b,CONTRACT,at))).map(bytes=>strFromU8(bytes)).join('')];
 for(const output of outputs)for(const secret of ['OBSERVACION PRIVADA SINTETICA','FUNDAMENTO PRIVADO SINTETICO','REFERENCIA PRIVADA SINTETICA','MOTIVO PRIVADO SINTETICO',b.subject.identityToken,b.scopeVersion,b.snapshotVersion,b.employment.version,b.subject.registeredAt,CONTRACT])assert.ok(!output.includes(secret),secret);
});

test('Excel workbook opens all five full sheets, exact integers as strings, frozen headers and complete filters',async()=>{
 const b=ledger(),bytes=Buffer.from(nativeLeaveXlsx(b,CONTRACT,at)),expected=[['Solicitudes',76],['Decisiones',226],['Saldos',2],['Declaraciones',4],['Control',17]];
 for(const [name,count]of expected){const rows=await readSheet(bytes,name);assert.equal(rows.length,count,name);}
 const balances=await readSheet(bytes,'Saldos');assert.equal(balances[1][14],'200');assert.equal(balances[1][17],'50');
 const zip=unzipSync(bytes);for(let i=1;i<=5;i++){const xml=strFromU8(zip['xl/worksheets/sheet'+i+'.xml']);assert.match(xml,/state="frozen"/);assert.match(xml,new RegExp('autoFilter ref="A1:'+(i===5?'B':'Z')+expected[i-1][1]+'"'));}
});

test('complete export supports the existing 1000-request boundary and fails closed above it, without slicing',()=>{
 const b=withRows(Array.from({length:1000},(_,i)=>entity(uuid(i+1))));assert.equal(nativeLeaveExportTables(b,CONTRACT,at).requests.length,1000);
 b.requests.push(entity(uuid(1001)));for(const exporter of [nativeLeaveCsv,nativeLeaveXlsx])assert.throws(()=>exporter(b,CONTRACT,at));
});

test('changed identity, membership scope, employment, record data or permissions invalidate the reviewed download',()=>{
 const b=ledger();assert.equal(assertNativeLeaveExportSame(b,structuredClone(b),CONTRACT).requests.length,75);
 for(const mutate of [b=>b.subject.identityToken='f'.repeat(64),b=>b.scopeVersion='f'.repeat(64),b=>b.employment.version='f'.repeat(64),b=>b.permissions.canCreate=false,b=>b.requests[0].canCancel=false,b=>b.requests[0].history[1].actorLabel='Otro actor sintético',b=>b.snapshotVersion='f'.repeat(64)]){const after=structuredClone(b);mutate(after);assert.throws(()=>assertNativeLeaveExportSame(b,after,CONTRACT),/no se descargó/);}
});

test('incomplete, clipped, wrong-contract and malformed-history snapshots never produce a file',()=>{
 for(const mutate of [b=>b.complete=false,b=>b.requests=b.requests.slice(0,20),b=>b.subject.contractId=uuid(9999),b=>b.requests[0].history.pop(),b=>b.balances[0].approvedUnits=0,b=>b.subject.dni='12345678']){const b=structuredClone(ledger());mutate(b);for(const exporter of [nativeLeaveCsv,nativeLeaveXlsx])assert.throws(()=>exporter(b,CONTRACT,at));}
 for(const stamp of ['2026-02-30T18:45:00.123Z','2026-10-02','not a date',null])assert.throws(()=>nativeLeaveCsv(bootstrap(),CONTRACT,stamp));
});
