import test from 'node:test';import assert from 'node:assert/strict';
import {historicalF931BrowserFixture,historicalF931FiscalCoverageBrowserFixture,historicalF931BrowserReopen,historicalF931BrowserLiquidation,historicalF931BrowserFullResponse} from './fixtures/own-f931-historical-browser-synthetic.js';
import {loadOwnF931HistoricalPreparation} from '../assets/own-f931-preparation-client.js';
import {ownF931JurisdictionScope} from '../assets/own-f931-preparation-model.js';
import {verifyOwnRunReceipt} from '../lib/internal-own-payroll-run.js';
const params=f=>({period:f.query.from,presentationDate:'2026-10-31',types:f.query.types});
function deps(f,fiscal=null){return{session:async()=>{},read:async q=>q.resource==='report-census'?structuredClone(f.censuses.find(c=>c.period===q.period&&c.liquidationType===q.liquidationType)):q.resource==='group'?structuredClone(f.receipts.find(r=>r.groupId===q.id)):(()=>{throw Error('Operational fallback forbidden');})(),readCapture:async q=>historicalF931BrowserLiquidation(f.captures.find(c=>c.id===q.id)),...(fiscal?{readFiscal:async()=>structuredClone(fiscal)}:{})};}
test('canonical UI fixtures provide complete September/October captures and exact original jurisdiction scopes',async()=>{
 for(const period of ['2026-09','2026-10']){const f=historicalF931BrowserFixture({period});for(const c of f.captures)verifyOwnRunReceipt(c,{fullJson:true});const r=await loadOwnF931HistoricalPreparation(params(f),deps(f));assert.equal(r.version,'own-f931-preparation.v2');assert.equal(r.participations,61);assert.equal(r.historicalSources.captures,2);assert.equal(ownF931JurisdictionScope(r,'42').participations,31);assert.equal(ownF931JurisdictionScope(r,'55').participations,30);const wire=historicalF931BrowserFullResponse(f.receipts[0]);assert.equal(Number(wire.headers['x-municontrol-json-bytes']),Buffer.byteLength(wire.body));}
});
test('coverage runner retains63 participations,61 contracts and2 original missing identities while every capture exists',async()=>{
 const f=await historicalF931FiscalCoverageBrowserFixture();for(const c of f.report.captures)verifyOwnRunReceipt(c,{fullJson:true});
 const r=await loadOwnF931HistoricalPreparation(f.params,deps(f.report,f.census));assert.equal(r.participations,63);assert.equal(r.contracts,61);assert.equal(r.historicalSources.captures,4);assert.equal(r.fiscalCoverage.identityNotCaptured,2);assert.equal(r.fiscalRows.filter(x=>x.state==='documented').length,15);assert.equal(r.fiscalRows.filter(x=>x.state!=='documented').length,46);assert.ok(r.fiscalRows.some(x=>x.employeeNumbers.join(' / ')==='1001 / HIST-001'));assert.ok(f.census.rows.some(x=>x.configuration.definition.fields[3]==='0002'));assert.ok(f.census.rows.some(x=>Object.values(x.configuration.definition.fields).includes('0')));
 const incomplete=structuredClone(f.report);incomplete.captures.pop();await assert.rejects(loadOwnF931HistoricalPreparation(f.params,deps(incomplete,f.census)));
});
test('changing closed-history source means a verified reopen census, not a fabricated operational stateVersion',async()=>{
 const f=historicalF931BrowserFixture(),before=await loadOwnF931HistoricalPreparation(params(f),deps(f)),hash=f.censuses[0].sourceVersion;
 historicalF931BrowserReopen(f);assert.notEqual(f.censuses[0].sourceVersion,hash);assert.equal(f.censuses[0].eventCount,2);
 const after=await loadOwnF931HistoricalPreparation(params(f),deps(f));assert.equal(after.participations,0);assert.equal(after.coverage[0].reopenedGroups,1);assert.notEqual(after.sourceProof,before.sourceProof);assert.equal(after.totals.gross,null);
});
