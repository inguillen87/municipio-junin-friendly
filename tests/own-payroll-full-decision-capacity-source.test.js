// Proposed filesystem contracts only. No application, SQL, API or UI imports.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {FULL_CAPACITY_SOURCE_PINS,projectFullCapacitySourceToParent} from './fixtures/own-payroll-full-capacity-source-projection.js';
import {projectOwnAnnulPreparationToHead,projectOwnClaude209HandoffSourceToParent,projectOwnIndividualHandoffSourceToParent} from './fixtures/own-payroll-annulment-preparation-source-projection.js';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sha=value=>createHash('sha256').update(value).digest('hex');
test('all15 source targets reconstruct their complete383649a4 parents with finite deltas',()=>{
 assert.equal(Object.keys(FULL_CAPACITY_SOURCE_PINS).length,15);
 for(const [path,pin]of Object.entries(FULL_CAPACITY_SOURCE_PINS))assert.equal(sha(projectFullCapacitySourceToParent(path,projectOwnAnnulPreparationToHead(path,projectOwnClaude209HandoffSourceToParent(path,projectOwnIndividualHandoffSourceToParent(path,read(path)))))),pin.before);
 assert.match(read('assets/own-payroll-run-model.js'),/OWN_RUN_MAX_RESPONSE = 4 \* 1024 \* 1024/);
 assert.match(read('assets/own-payroll-response.js'),/OWN_RUN_FULL_MAX_BYTES=32\*1024\*1024/);
});
test('only trusted fullJson can select the eight declared full SQL facades; body, permission, hashes and small commands stay intact',()=>{
 const run=read('lib/internal-own-payroll-run.js');assert.match(run,/verifyOwnRunReceipt\(value,\{fullJson=false\}=\{\}\)/);assert.match(run,/checkedCapture\(value,null,fullJson===true\?OWN_RUN_FULL_MAX_BYTES:OWN_RUN_MAX_RESPONSE\)/);
 const fullNames=[];
 for(const domain of ['liquidation','annulment','close']){const s=read('lib/internal-own-payroll-'+domain+'.js');assert.match(s,/const fullJson=deps.fullJson===true,limit=fullJson\?OWN_RUN_FULL_MAX_BYTES:OWN_RUN_MAX_RESPONSE/);for(const name of s.matchAll(/SELECT public\.(own_[a-z_]+_full_v1)\(/g))fullNames.push(name[1]);assert.doesNotMatch(s,/deps\.(?:maxBytes|limit)|input\.fullJson/);}
 assert.deepEqual(fullNames.sort(),['own_liquidation_detail_full_v1','own_annul_detail_full_v1','own_annul_attempt_full_v1','own_annul_command_full_v1','own_close_detail_full_v1','own_close_group_full_v1','own_close_attempt_full_v1','own_close_command_full_v1'].sort());
 const liq=read('lib/internal-own-payroll-liquidation.js');assert.match(liq,/own_liquidation_command_v1/);assert.match(liq,/own_liquidation_attempt_v1/);assert.doesNotMatch(liq,/own_liquidation_(?:command|attempt|bootstrap)_full/);
});
test('every affected API negotiates before authorization and destroys a failed already-started stream',()=>{
 for(const domain of ['liquidation','annulment','close','receipts']){const s=read('api/internal-own-payroll-'+domain+'.js');const negotiation=s.indexOf("schoolCertificateHttp.header(req,'accept').trim().toLowerCase()===OWN_RUN_FULL_JSON"),stream=s.indexOf('if(fullJson&&!supportsOwnPayrollStream(res))'),access=s.indexOf('await authorize(');assert.ok(negotiation>=0&&stream>negotiation&&access>stream);assert.match(s,/if\(fullJson\)return await sendOwnPayrollStream\(res,status,data\)/);assert.match(s,/if\(res.headersSent\)\{res.destroy\(\);return;\}/);}
 assert.doesNotMatch(read('api/internal-own-payroll-receipts.js'),/own_receipt_.*_full_v1/);
});
test('all seven relevant UIs use the actual bounded shared reader with abort signals and preserve complete comparisons',()=>{
 for(const file of ['own-payroll-liquidation-panel.js','own-payroll-annulment-panel.js','own-payroll-close-panel.js','own-payroll-comparison-panel.js','own-payroll-receipt-panel.js','own-payroll-receipt-self.js','own-payroll-receipt-planilla-panel.js']){const s=read('assets/'+file);assert.match(s,/readOwnPayrollResponse/);assert.match(s,/Accept:.*OWN_RUN_FULL_JSON/);assert.match(s,/signal/);assert.doesNotMatch(s,/await (?:response|r)\.text\(\)/);}
 const comparison=read('assets/own-payroll-comparison-panel.js');assert.match(comparison,/firstProof!==verified.proof/);assert.match(comparison,/remaining-=fullResponseBytes.get\(response\)/);assert.match(comparison,/for\(const d of sources\)binding\(d,after\)/);
 const planilla=read('assets/own-payroll-receipt-planilla-panel.js');assert.match(planilla,/remaining-=fullResponseBytes.get\(sourceResponse\)/);assert.match(planilla,/prepareOwnPlanilla\(batch,closes,\$\('jurisdiction'\)\.value\)/);assert.match(planilla,/maxBytes=65536/);
});
