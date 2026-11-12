// Imputación de un cierre con total oficial (V4/V5): los renglones originales se imputan como siempre y la diferencia con
// el total oficial se muestra aparte, como ajustes por contrato, sin destino inventado y sin quedar lista para registrar.
// Datos exclusivamente sintéticos.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {officialCloseCorpus,officialCloseDetail,officialCloseReceipt,hash} from './fixtures/own-payroll-official-close-synthetic.js';
import {imputationFixture} from './fixtures/own-payroll-imputation-synthetic.js';
import {buildOwnOfficialCloseSnapshot} from '../assets/own-payroll-official-snapshot-model.js';
import {ownClosedJurisdiction} from '../assets/own-payroll-jurisdiction-model.js';
import {accountingHash} from '../assets/own-payroll-accounting-model.js';
import {calculateImputation,calculateOfficialImputation,verifiedImputation,verifiedOfficialImputation,imputationSourceHashValue,imputationAdjustmentSummary,IMPUTATION_ISSUES,IMPUTATION_ADJUSTMENT_KINDS,IMPUTATION_RESULT_VERSION,IMPUTATION_OFFICIAL_RESULT_VERSION} from '../assets/own-payroll-imputation-model.js';
import {deriveAccountingAdjustmentCandidate,cents,COMPONENT_KINDS} from '../assets/own-accounting-adjustments.js';

const u9=n=>'90000000-0000-4000-8000-'+String(n).padStart(12,'0');
// Una fuente de imputación sobre un cierre oficial del corpus, con TODOS sus conceptos y contratos asociados.
async function officialSource(name){
 const detail=officialCloseDetail(name,1),capture=detail.captures[0];
 const jurisdictions=capture.payload.population.employees.map((e,i)=>({contractId:e.contractId,employeeNumber:e.employeeNumber,registrationId:u9(30000+i),identityToken:e.identityToken,jurisdictionCode:i%2?'55':'42'}));
 capture.payload.sourceInventory.jurisdictions={version:'own-run-jurisdictions.v1',complete:true,total:jurisdictions.length,rows:jurisdictions};capture.payloadSha256=hash(capture.payload);
 const s=buildOwnOfficialCloseSnapshot(detail,{kind:'all',values:[]}),receipt=officialCloseReceipt(s),f=await imputationFixture(1),proof=f.dateSources[0],base=f.configuration.definition.mappings[0],assign=f.configuration.definition.assignments[0];
 const body={...proof.body,period:s.period,liquidationType:s.liquidationType};
 f.group=receipt;f.dateSources=[{runId:capture.id,body,bodySha256:await accountingHash(body),inputSha256:s.employees[0].inputSha256}];
 const mappings=new Map(),employees=new Map(s.employees.map(e=>[e.contractId,e]));
 for(const r of s.concepts){if(r.nature==='auxiliary')continue;const e=employees.get(r.contractId),j=ownClosedJurisdiction(e,s.version).code,key=[j,e.agreementCode,e.departmentCode,r.conceptCode].join(':');
  if(!mappings.has(key))mappings.set(key,{...base,jurisdictionCode:j,agreementCode:e.agreementCode,departmentCode:e.departmentCode,conceptCode:r.conceptCode,nature:r.nature,budgetItemReference:'PARTIDA-SINTETICA-'+r.conceptCode});}
 f.configuration.definition={mappings:[...mappings.values()],assignments:s.employees.map(e=>({...assign,contractId:e.contractId}))};
 f.sourceVersion=await accountingHash(imputationSourceHashValue(f));return f;
}
const four=['remuneration','non_remuneration','deduction','employer_contribution'];

test('un cierre con total oficial, con todo asociado, ya no se detiene: muestra renglones y ajustes y no queda listo',async()=>{
 const source=await officialSource('days14_both_omitted'),before=structuredClone(source),r=await verifiedOfficialImputation(source);
 assert.deepEqual(source,before,'la fuente no se modifica');
 assert.equal(r.version,IMPUTATION_OFFICIAL_RESULT_VERSION);assert.equal(r.ready,false);assert.equal(r.originalRowsReady,true,'los renglones originales tienen destino');
 assert.deepEqual(r.globalIssues,['adjustment_destination_required','adjustment_circuit_pending']);assert.equal(r.issues.length,0);
 // Los renglones concilian con la suma de renglones; el total oficial se conserva aparte y no se reparte.
 for(const k of four)assert.equal(r.allocatedTotals[k],r.lineTotals[k],k);
 assert.equal(r.sourceTotals.remuneration,'200.01');assert.equal(r.lineTotals.remuneration,'200.02');
 assert.equal(r.adjustmentRows.length,COMPONENT_KINDS.length,'los nueve componentes, también los que valen cero');assert.equal(r.adjustmentCount,1);
 const pending=r.adjustmentRows.filter(a=>a.state==='destination_required');
 assert.deepEqual(pending.map(a=>[a.kind,a.amount,a.destination]),[['category.remuneration','-0.01',null]]);
 assert.ok(r.adjustmentRows.every(a=>a.destination===null&&/^[a-f0-9]{64}$/.test(a.key)&&(a.state==='zero')===(a.amount==='0.00')));
 assert.match(r.adjustmentProjectionSha256,/^[a-f0-9]{64}$/);assert.equal(r.accountingPosted,false);assert.equal(r.paymentExecuted,false);
 assert.deepEqual(imputationAdjustmentSummary(r),{count:1,employees:1,net:'-0.01',byKind:[{kind:'category.remuneration',label:'Redondeo del remunerativo (993)',count:1,amount:'-0.01'}]});
});

test('en todo el corpus oficial: nunca lista, y renglones + efectos de los ajustes = total oficial, al centavo',async()=>{
 let adjusted=0;
 for(const one of officialCloseCorpus){
  const r=await verifiedOfficialImputation(await officialSource(one.name));
  assert.equal(r.version,IMPUTATION_OFFICIAL_RESULT_VERSION,one.name);assert.equal(r.ready,false,one.name);assert.ok(r.globalIssues.includes('adjustment_circuit_pending'),one.name);
  assert.equal(r.globalIssues.includes('adjustment_destination_required'),r.adjustmentCount>0,one.name);
  for(const k of [...four,'gross','net'])assert.equal(cents(r.lineTotals[k])+cents(r.adjustmentTotalEffects[k]),cents(r.sourceTotals[k]),one.name+' '+k);
  assert.equal(r.adjustmentRows.length,r.employeeCount*COMPONENT_KINDS.length,one.name);
  const summary=imputationAdjustmentSummary(r);assert.equal(summary.count,r.adjustmentCount);assert.equal(summary.byKind.reduce((n,k)=>n+k.count,0),r.adjustmentCount);
  if(r.adjustmentCount)adjusted++;
 }
 assert.ok(adjusted>=2,'el corpus tiene casos con diferencia');
});

test('los ajustes salen del recibo verificado de ese mismo cierre: sin ellos, o con los de otro cierre, no hay resultado',async()=>{
 const source=await officialSource('days14_both_omitted');
 assert.throws(()=>calculateOfficialImputation(source),/Faltan los ajustes del total oficial/);
 const other=await deriveAccountingAdjustmentCandidate((await officialSource(officialCloseCorpus.find(c=>c.name!=='days14_both_omitted').name)).group);
 assert.throws(()=>calculateOfficialImputation(source,{adjustments:other}),/Faltan los ajustes del total oficial/);
 const own=await deriveAccountingAdjustmentCandidate(source.group);
 assert.throws(()=>calculateOfficialImputation(source,{adjustments:{...own,ready:true}}),/Faltan los ajustes del total oficial/,'un candidato marcado como listo no se acepta');
 assert.equal(calculateOfficialImputation(source,{adjustments:own}).ready,false);
 await assert.rejects(async()=>calculateOfficialImputation(await imputationFixture(),{adjustments:own}),/no tiene total oficial/);
});

test('el resultado v1 no cambia: es el que calcula la base y contra el que se coteja la previa del servidor',async()=>{
 // Cierre oficial con todo asociado: v1 sigue rechazándolo igual que la base, hasta que exista el SQL de ajustes.
 const full=await officialSource('days14_both_omitted');
 await assert.rejects(verifiedImputation(full),/La imputación no concilia con todos los conceptos del cierre/);
 // Cierre oficial sin configuración aprobada: v1 devuelve su resultado de siempre, sin campos nuevos.
 const pending=await officialSource('days14_both_omitted');pending.configuration={...pending.configuration,revision:0,definition:null,proposalId:null,approvalId:null};pending.sourceVersion=await accountingHash(imputationSourceHashValue(pending));
 const r=await verifiedImputation(pending);assert.equal(r.version,IMPUTATION_RESULT_VERSION);assert.equal(r.ready,false);assert.deepEqual(r.globalIssues,['configuration_required']);assert.ok(!('adjustmentRows' in r));
 const view=await verifiedOfficialImputation(pending);assert.equal(view.originalRowsReady,false);assert.deepEqual(view.globalIssues,['configuration_required','adjustment_destination_required','adjustment_circuit_pending']);
 assert.deepEqual(view.rows,r.rows,'los renglones originales son los mismos en las dos versiones');
});

test('un cierre anterior al total oficial sigue igual: resultado v1, sin campos nuevos',async()=>{
 const r=await verifiedImputation(await imputationFixture());
 assert.equal(r.version,IMPUTATION_RESULT_VERSION);assert.equal(r.ready,true);
 for(const k of ['adjustmentRows','adjustmentCount','lineTotals','originalRowsReady','adjustmentProjectionSha256'])assert.ok(!(k in r),k);
 assert.throws(()=>imputationAdjustmentSummary(r),/no tiene ajustes/);
});

test('cada clase de ajuste y cada aviso nuevo tiene nombre en pantalla, y la pantalla no ofrece registrar',()=>{
 assert.deepEqual(Object.keys(IMPUTATION_ADJUSTMENT_KINDS),[...COMPONENT_KINDS]);
 for(const code of ['adjustment_destination_required','adjustment_circuit_pending'])assert.equal(IMPUTATION_ISSUES[code].length,2,code);
 const panel=fs.readFileSync(new URL('../assets/own-payroll-imputation-panel.js',import.meta.url),'utf8');
 assert.match(panel,/!preview\?\.allocation\.ready/,'«Preparar» sigue exigiendo un resultado listo: un cierre oficial nunca lo es');
 assert.match(panel,/\|\|!preview\?\.allocation\.ready\|\|officialViews\.has\(preview\);/,'con total oficial no se ofrece «Preparar», aunque los renglones tengan destino');
 assert.match(panel,/if\(IMPUTATION_OFFICIAL_SNAPSHOTS\.includes\(v\.source\.group\.snapshot\.version\)\)\{const view=await verifiedOfficialImputation\(v\.source\);/,'la vista sale de la misma fuente verificada de la previa');
 assert.match(panel,/imputationAdjustmentSummary\(view\)/);
 assert.match(panel,/total oficial · \$\{view\.lineTotals\[nature\]\} en renglones · \$\{a\.allocatedTotals\[nature\]\} con destino/);
 assert.ok(fs.readFileSync(new URL('../scripts/build-friendly.mjs',import.meta.url),'utf8').includes("'assets/own-accounting-adjustments.js'"),'el módulo de ajustes se publica');
});
