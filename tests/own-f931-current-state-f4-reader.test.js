// Integración activa propuesta. Negativas inactivas por fixture explícito; lector R9 y contrato histórico conservados.
// sobre el mismo ledger sintético de 26 eventos. Sin conexiones, SQL ni datos nominales.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {INACTIVE_F931_HISTORY_ADMISSION as INACTIVE} from './fixtures/own-f931-inactive-admission.js';
import {OWN_F931_HISTORY_ADMISSION,OWN_F931_HISTORY_ADMISSION_VERSION,OWN_F931_CURRENT_STATE_ADMISSION_VERSION,OWN_F931_CURRENT_STATE_MODES,OWN_F931_CURRENT_STATE_EPOCHS,ownF931HistoryAdmission,ownF931HistoryActive} from '../assets/own-f931-history-admission.js';
import {loadOwnF931HistoricalPreparation} from '../assets/own-f931-preparation-client.js';
import {prepareOwnF931,ownF931Proof} from '../assets/own-f931-preparation-model.js';
import {verifiedOwnReportCensus,OWN_REPORT_CENSUS_VERSION,OWN_REPORT_CENSUS_MAX_EVENTS} from '../assets/own-payroll-report-census-model.js';
import {verifiedWorkspaceCapture} from '../assets/own-payroll-run-workspace-model.js';
import {ownRunHash} from '../lib/internal-own-payroll-run.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';
import {reportFixture} from './fixtures/own-payroll-report-synthetic.js';
import {reportCensusFixture,liquidationDetailFor,fiscalCensusFor,withIdentityToken} from './fixtures/own-payroll-report-census-synthetic.js';
import {syntheticLedgerSlices} from './fixtures/own-f931-current-state-ledger-synthetic.js';

const TOTAL_KEYS=['remuneration','non_remuneration','deduction','employer_contribution','gross','net'];
const H=c=>c.repeat(64);
const TARGET={major:17,projectId:'noisy-poetry-54471701',branchId:'br-plain-dust-acpjgebb',endpointId:'ep-shiny-cherry-actlyudg',database:'neondb',role:'neondb_owner'};
const FACADES={census:H('1'),groupFull:H('2'),liquidationDetailFull:H('3')};
// Valores SINTÉTICOS de forma: no son una admisión real ni texto activable para producción.
const syntheticCurrent=()=>({version:OWN_F931_CURRENT_STATE_ADMISSION_VERSION,activated:true,sourceCommit:'4dc2c19b7549e07e1cad52b16924d25f87ea5589',epoch:'201+215',target:{...TARGET},protocol:'b'.repeat(32),mode:'admit_current_state',
 installedProvenance:{sourceCommit:'47c98ecb6115ea6c60a58d3f56c79b5d0ba9ff11',major:17},capacityPostflightSha256:H('4'),ledgerProjectionSha256:H('5'),facades:{...FACADES},censusObjectFingerprint:H('6'),snapshot215ObjectFingerprint:H('7'),
 eventRows:26,ledgerDigest:H('8'),descriptorSha256:H('9'),runSha256:H('a'),receiptSha256:{t1:H('c'),t2:H('d')},m7ProvenanceSha256:H('e'),durableProofSha256:H('f')});
const syntheticHistorical=()=>({version:OWN_F931_HISTORY_ADMISSION_VERSION,activated:true,sourceCommit:'4dc2c19b7549e07e1cad52b16924d25f87ea5589',epoch:'201+215',target:{...TARGET},protocol:'b'.repeat(32),mode:'admit_existing',custodyRunSha256:H('a'),capacityPostflightSha256:H('4'),ledgerProjectionSha256:H('5'),facades:{...FACADES},durableProofSha256:H('f')});
const inactiveCurrent=()=>Object.fromEntries(Object.keys(syntheticCurrent()).map(k=>[k,k==='version'?OWN_F931_CURRENT_STATE_ADMISSION_VERSION:k==='activated'?false:null]));

test('F4-1 fixture explícito inactivo v1 con nulos; ningún literal activado en el fixture; contrato histórico intacto',()=>{
 assert.equal(INACTIVE.version,OWN_F931_HISTORY_ADMISSION_VERSION);assert.equal(INACTIVE.activated,false);
 for(const[k,v]of Object.entries(INACTIVE))if(!['version','activated'].includes(k))assert.equal(v,null,k);
 assert.equal(ownF931HistoryActive(INACTIVE),false);assert.equal(ownF931HistoryAdmission(INACTIVE),INACTIVE);
 const source=fs.readFileSync(new URL('./fixtures/own-f931-inactive-admission.js',import.meta.url),'utf8');assert.equal(/activated:\s*true/.test(source),false);
 const h=syntheticHistorical();assert.equal(ownF931HistoryAdmission(h),h);assert.equal(ownF931HistoryActive(h),true);
 for(const k of['custodyRunSha256','target','protocol','mode'])assert.throws(()=>ownF931HistoryAdmission({...h,[k]:null}),/incompleta/,k);
 assert.throws(()=>ownF931HistoryAdmission({...h,mode:'admit_current_state'}),/incompleta/);
 assert.deepEqual(OWN_F931_CURRENT_STATE_MODES,['admit_current_state']);assert.deepEqual(OWN_F931_CURRENT_STATE_EPOCHS,['201+215']);
});

test('F4-3 source default is the exact real emitted current-state literal; validator and all runtime defaults consume that source',()=>{
 const source=fs.readFileSync(new URL('../assets/own-f931-history-admission.js',import.meta.url)),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
 assert.equal(hash(source),'5029287ebd07ec4048a7a8e1b1da6b225d23b211a8c987bbf06091a643b62240');
 assert.equal(hash(Buffer.from(JSON.stringify(OWN_F931_HISTORY_ADMISSION),'utf8')),'b99e504707bffe37bd4be98f24ad0a4f3b3786907579eec48c455cf0e15d2871');
 assert.equal(ownF931HistoryAdmission(),OWN_F931_HISTORY_ADMISSION);assert.equal(ownF931HistoryActive(),true);assert.equal(Object.isFrozen(OWN_F931_HISTORY_ADMISSION),true);
 assert.equal(OWN_F931_HISTORY_ADMISSION.version,OWN_F931_CURRENT_STATE_ADMISSION_VERSION);assert.equal(OWN_F931_HISTORY_ADMISSION.mode,'admit_current_state');assert.equal(OWN_F931_HISTORY_ADMISSION.epoch,'201+215');
 assert.equal(OWN_F931_HISTORY_ADMISSION.target.major,17);assert.equal(OWN_F931_HISTORY_ADMISSION.installedProvenance.major,17);assert.equal(OWN_F931_HISTORY_ADMISSION.eventRows,0);
 // Metadata of the already-emitted source, not a new SQL proof or a readiness claim.
});
test('F4-2 current-state: inactiva sólo con nulos; activa exacta aceptada; cruces de versión/claves rechazados',()=>{
 const inactive=inactiveCurrent();assert.equal(ownF931HistoryAdmission(inactive).activated,false);assert.equal(ownF931HistoryActive(inactive),false);
 const active=syntheticCurrent();for(const k of Object.keys(active).filter(k=>!['version','activated'].includes(k)))assert.throws(()=>ownF931HistoryAdmission({...inactive,[k]:active[k]}),/no conserva pruebas/,k);
 assert.equal(ownF931HistoryAdmission(active),active);assert.equal(ownF931HistoryActive(active),true);
 // ROOT R1: PG18 coherente y coerciones RegExp por arrays deben rechazarse en CURRENT; contrato legacy intacto.
 const coherent18={...active,target:{...active.target,major:18},installedProvenance:{...active.installedProvenance,major:18}};
 assert.throws(()=>ownF931HistoryAdmission(coherent18),/incompleta/,'CURRENT PG18 con procedencia PG18');
 for(const key of ['sourceCommit','protocol','capacityPostflightSha256','ledgerProjectionSha256','censusObjectFingerprint','snapshot215ObjectFingerprint','ledgerDigest','descriptorSha256','runSha256','m7ProvenanceSha256','durableProofSha256'])assert.throws(()=>ownF931HistoryAdmission({...active,[key]:[active[key]]}),/incompleta/,'CURRENT array '+key);
 assert.throws(()=>ownF931HistoryAdmission({...active,installedProvenance:{...active.installedProvenance,sourceCommit:[active.installedProvenance.sourceCommit]}}),/incompleta/,'CURRENT array installedProvenance.sourceCommit');
 for(const key of ['t1','t2'])assert.throws(()=>ownF931HistoryAdmission({...active,receiptSha256:{...active.receiptSha256,[key]:[active.receiptSha256[key]]}}),/incompleta/,'CURRENT array receipt '+key);
 for(const key of ['census','groupFull','liquidationDetailFull'])assert.throws(()=>ownF931HistoryAdmission({...active,facades:{...active.facades,[key]:[active.facades[key]]}}),/incompleta/,'CURRENT array facade '+key);
 assert.throws(()=>ownF931HistoryAdmission({...active,version:OWN_F931_HISTORY_ADMISSION_VERSION}),/no es válida/);
 assert.throws(()=>ownF931HistoryAdmission({...syntheticHistorical(),version:OWN_F931_CURRENT_STATE_ADMISSION_VERSION}),/no es válida/);
 for(const extra of[{custodyRunSha256:H('a')},{historyFrom:'2026-11-03T12:00:00.000001Z'}])assert.throws(()=>ownF931HistoryAdmission({...active,...extra}),/no es válida/);
 const bad={mode:'admit_existing',epoch:'201',sourceCommit:'4dc2c19',protocol:'x',eventRows:-1,ledgerDigest:'0',receiptSha256:{t1:H('c'),t2:H('c')},installedProvenance:{sourceCommit:'47c98ecb6115ea6c60a58d3f56c79b5d0ba9ff11',major:18},facades:{census:H('1'),groupFull:H('2')},target:{...TARGET,major:16}};
 for(const[k,v]of Object.entries(bad))assert.throws(()=>ownF931HistoryAdmission({...active,[k]:v}),/incompleta/,k);
 const {receiptSha256,...missing}=active;assert.throws(()=>ownF931HistoryAdmission(missing),/no es válida/);
});

// Adaptador del lector R9 (mismo contrato; sin fallback operativo).
function historical(f,census){return {query:f.query,census,receipts:census.groups.some(g=>g.state==='closed')?structuredClone(f.receipts):[],captures:structuredClone(f.details[0].captures)};}
function adapter(h){
 const calls=[],captureCalls=[];
 return {calls,captureCalls,session:async()=>{},
  read:async q=>{calls.push(structuredClone(q));if(q.resource==='report-census')return structuredClone(h.census);if(q.resource==='group'){const r=h.receipts.find(r=>r.groupId===q.id);if(!r)throw Object.assign(Error('No se encontró el grupo.'),{status:404});return structuredClone(r);}throw Error('Operational fallback forbidden: '+q.resource);},
  readCapture:async q=>{captureCalls.push(structuredClone(q));const c=h.captures.find(c=>c.id===q.id);if(!c)throw Object.assign(Error('No se encontró la corrida.'),{status:404});return liquidationDetailFor(structuredClone(c));}};
}
const params=(f,jurisdiction='all')=>({period:f.query.from,presentationDate:'2026-10-31',types:f.query.types,jurisdiction});

test('R1 lector sobre el ledger de 26 eventos: censos completos, sin corte por época, reapertura, capturas originales obligatorias, all/42/55',async()=>{
 const slices=syntheticLedgerSlices();assert.equal(slices.reduce((n,s)=>n+s.census.eventCount,0),26);
 for(const s of slices){await verifiedOwnReportCensus(structuredClone(s.census));assert.equal(s.census.version,OWN_REPORT_CENSUS_VERSION);assert.equal(s.census.complete,true);}
 const complete=slices.find(s=>s.label==='v2-complete'),f=complete.fixture,h=historical(f,complete.census);
 const r=await loadOwnF931HistoricalPreparation(params(f),adapter(h));
 assert.equal(r.version,'own-f931-preparation.v2');assert.deepEqual([r.participations,r.closedGroups,r.historicalSources.captures],[4,1,2]);
 assert.equal(r.canGenerate,false);assert.equal(r.canSubmit,false);
 assert.ok(r.fiscalRows.every(x=>x.state==='not_queried'));assert.deepEqual([r.fiscalCoverage.notQueried,r.fiscalCoverage.missing],[4,0]);
 const only55=await loadOwnF931HistoricalPreparation(params(f,'55'),adapter(h));assert.deepEqual([only55.participations,only55.scopeParticipations],[0,4]);for(const k of TOTAL_KEYS)assert.equal(only55.totals[k],null);
 const reopened=slices.find(s=>s.label==='v1-reopened'),hr=historical(reopened.fixture,reopened.census);
 const after=await loadOwnF931HistoricalPreparation(params(reopened.fixture),adapter(hr));assert.deepEqual([after.participations,after.closedGroups,after.coverage[0].reopenedGroups,after.totals.gross],[0,0,1,null]);
 // Cierres v1/v2 sin capturas originales conservadas: el lector falla cerrado; nunca completa con padrón actual ni GRH.
 for(const s of slices.filter(s=>['v1-historical','v2-retyped'].includes(s.label)))await assert.rejects(loadOwnF931HistoricalPreparation(params(s.fixture),adapter(historical(s.fixture,s.census))),/No se encontró la corrida/,s.label);
});

test('R2 v1 sin jurisdicción/periodContext: identityToken válido distinto ⇒ stale y cambia captureProof; census/snapshot/fiscalProof iguales',async()=>{
 const f=reportFixture(2),census=reportCensusFixture(f),a=historical(f,census);
 assert.equal(a.receipts[0].snapshot.version,'own-close-snapshot.v1');assert.equal(Object.hasOwn(a.captures[0].payload,'periodContext'),false);
 const contractId=a.receipts[0].snapshot.employees[0].contractId,run=a.captures.find(c=>c.id===a.receipts[0].snapshot.employees.find(e=>e.contractId===contractId).runId);
 const b={...a,captures:a.captures.map(c=>c.id===run.id?withIdentityToken(c,contractId,'9'.repeat(64)):c)};for(const c of b.captures)await verifiedWorkspaceCapture(structuredClone(c));
 const fiscal=await fiscalCensusFor(a.receipts[0],a.captures);
 const withFiscal=h=>({...adapter(h),readFiscal:async()=>structuredClone(fiscal)});
 const ra=await loadOwnF931HistoricalPreparation(params(f),withFiscal(a)),rb=await loadOwnF931HistoricalPreparation(params(f),withFiscal(b));
 assert.equal(ra.sourceProof,rb.sourceProof);assert.deepEqual(ra.sourceHashes,rb.sourceHashes);assert.equal(ra.fiscalProof,rb.fiscalProof);
 assert.equal(ra.fiscalRows.find(x=>x.contractId===contractId).state,'documented');assert.equal(rb.fiscalRows.find(x=>x.contractId===contractId).state,'stale');
 assert.notEqual(ra.historicalSources.captureProof,rb.historicalSources.captureProof);assert.notEqual(ownF931Proof(ra),ownF931Proof(rb));
 const v1=await prepareOwnF931(params(f),f.details,f.receipts,fiscal);assert.equal(v1.version,'own-f931-preparation.v1');
});

test('R3 capturas y censo adversariales: faltante/ajena/duplicada/sin input/alterada/jurisdicción; censo incompleto, >2000, reapertura huérfana',async()=>{
 const slices=syntheticLedgerSlices(),complete=slices.find(s=>s.label==='v2-complete'),f=complete.fixture,base=()=>historical(f,complete.census);
 const missing=base();missing.captures.pop();await assert.rejects(loadOwnF931HistoricalPreparation(params(f),adapter(missing)),/No se encontró la corrida/);
 const foreign=base();const other=structuredClone(foreign.captures[0]);other.id='ffffffff-0000-4000-8000-00000000f00d';other.saved.id=other.id;foreign.captures=[other,foreign.captures[1]];
 await assert.rejects(loadOwnF931HistoricalPreparation(params(f),adapter(foreign)),/No se encontró la corrida|pertenece a otra liquidación|ajena/);
 const duplicate=base(),dup=adapter(duplicate);dup.readCapture=async()=>liquidationDetailFor(structuredClone(duplicate.captures[0]));
 await assert.rejects(loadOwnF931HistoricalPreparation(params(f),dup),/pertenece a otra liquidación|repetida/);
 // Sin input guardado: rechazo (mensaje del verificador de detalle o del modelo; no se fija por no haber sido leído).
 const noInput=base();delete noInput.captures[0].saved.input;await assert.rejects(loadOwnF931HistoricalPreparation(params(f),adapter(noInput)));
 const altered=base(),c=altered.captures[0];c.saved.result.rows[0].amount=String(Number(c.saved.result.rows[0].amount)+1);c.saved.resultSha256=ownRunHash(c.saved.result);
 await assert.rejects(loadOwnF931HistoricalPreparation(params(f),adapter(altered)),/no corresponde a los conceptos, importes e identidad/);
 const moved=base(),j=moved.captures[0];j.payload.sourceInventory.jurisdictions.rows[0].jurisdictionCode='55';j.payloadSha256=ownRunHash(j.payload);
 await assert.rejects(loadOwnF931HistoricalPreparation(params(f),adapter(moved)),/La jurisdic|no corresponde a los conceptos/);
 const incomplete=structuredClone(complete.census);incomplete.complete=false;await assert.rejects(verifiedOwnReportCensus(incomplete),/No se verificó el censo completo de cierres/);
 await assert.rejects(loadOwnF931HistoricalPreparation(params(f),adapter({...base(),census:incomplete})),/No se verificó el censo completo de cierres/);
 const over=structuredClone(complete.census),e0=over.events[0];over.events=Array.from({length:OWN_REPORT_CENSUS_MAX_EVENTS+1},()=>({...e0}));over.eventCount=over.events.length;
 await assert.rejects(verifiedOwnReportCensus(over),/No se verificó el conjunto completo de eventos de cierre/);
 const orphan=structuredClone(complete.census);orphan.events.push({id:uid(999999),groupId:uid(888888),command:'reopen',bodySha256:'1'.repeat(64),snapshotSha256:'2'.repeat(64),recordedAt:'2026-10-07T10:00:00.000Z'});orphan.eventCount++;
 await assert.rejects(verifiedOwnReportCensus(orphan),/Una reapertura perdió su cierre original/);
});
