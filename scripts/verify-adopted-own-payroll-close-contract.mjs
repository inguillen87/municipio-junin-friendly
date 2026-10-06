import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {ownCloseSnapshot,verifiedOwnCloseDetail,verifiedOwnCloseReceipt} from '../assets/own-payroll-close-model.js';
import {verifiedOwnReportBundle,ownReportDocument,emptyOwnReportFilters} from '../assets/own-payroll-report-model.js';
import {prepareOwnPayrollInput} from '../lib/own-payroll-approved-input.js';import {createOwnPayrollSnapshot} from '../lib/own-payroll-snapshot.js';
export async function readAdoptedCloseSqlFixture(input){
 const root=fs.realpathSync(new URL('../verification/',import.meta.url)),file=fs.realpathSync(path.resolve(input)),relative=path.relative(root,file);
 assert.ok(!relative.startsWith('..')&&!path.isAbsolute(relative));
 assert.ok(file.endsWith('-fixture.json'));const passed=JSON.parse(fs.readFileSync(file.replace('-fixture.json','.json'),'utf8'));assert.equal(passed.passed,true);assert.equal(passed.completePopulation,29);
 const fixture=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(fixture.synthetic,true);
 for(const c of fixture.captures){const {sourceInventory:_audit,...sources}=c.payload,expected=createOwnPayrollSnapshot(prepareOwnPayrollInput(sources));for(const key of ['input','inputSha256','result','resultSha256'])assert.deepEqual(c.saved[key],expected[key]);}
 await verifiedOwnCloseDetail(fixture.before);await verifiedOwnCloseDetail(fixture.detail);
 for(const name of ['receipt','partial','old','reopened'])await verifiedOwnCloseReceipt(fixture[name]);
 assert.deepEqual(fixture.receipt.snapshot,ownCloseSnapshot(fixture.before,fixture.receipt.body.selection));
 assert.deepEqual(fixture.partial.snapshot,fixture.reopened.snapshot);
 const query={from:fixture.detail.period,to:fixture.detail.period,types:[fixture.detail.liquidationType]},bundle=await verifiedOwnReportBundle(query,[fixture.detail],[fixture.receipt]);
 assert.equal(ownReportDocument(bundle).rows.length,29);assert.equal(bundle.employees.filter(e=>e.employee.employeeNumber==='A/3501').length,1);
 const selected=ownReportDocument(bundle,emptyOwnReportFilters(),'concepts','concept',fixture.partial.body.selection.values);assert.equal(selected.rows.length,fixture.partial.snapshot.conceptCount);
 return {fixture,bundle,report:{passed:true,synthetic:true,completePopulation:29,allCapturedCalculationsRecomputed:true,closedSnapshotIndependentlyAggregated:true,oldCloseAndReopenedSnapshotVerified:true,sqlChecks:passed.checks,municipalInstallation:false}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){assert.equal(process.argv.length,3);const {report}=await readAdoptedCloseSqlFixture(process.argv[2]);console.log(JSON.stringify(report));}
