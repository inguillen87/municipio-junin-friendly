// Source custody only: restore the whole pre-fiscal workflow before its older
// CI-budget inverse. The current release contract still reads current bytes.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const FILE='.github/workflows/noelia-payroll-circuit.yml';
const hash=value=>createHash('sha256').update(value).digest('hex');
// Finite successor only: the explicit period-annulment profile restores the
// complete reviewed fiscal workflow before the older fiscal/budget inverses.
export function projectNoeliaAnnulmentWorkflowToFiscalEpoch(file,value){
 assert.equal(typeof file,'string');assert.ok(Buffer.isBuffer(value));if(file!==FILE)return value;
 assert.equal(value.length,15103,'ANNULMENT_WORKFLOW_CURRENT_BYTES');assert.equal(hash(value),'e58ee59c3ade7a66b4577f1434dd238affd39fc90f2f08789deb44ae22a37090','ANNULMENT_WORKFLOW_CURRENT_SHA');
 const current=value.toString('utf8'),addition=' --annulment=true';
 assert.equal(current.split(addition).length,2,'ANNULMENT_WORKFLOW_UNIQUE_ADDITION');
 const prior=Buffer.from(current.replace(addition,''));
 assert.equal(prior.length,15086,'ANNULMENT_WORKFLOW_PARENT_BYTES');assert.equal(hash(prior),'e3a700eb4f9acc9108179d4308a43198ed10282c527bdcb5e09f961bd0cb16b8','ANNULMENT_WORKFLOW_PARENT_SHA');return prior;
}
export function projectNoeliaFiscalWorkflowToBudgetEpoch(file,value){
 assert.equal(typeof file,'string');assert.ok(Buffer.isBuffer(value));if(file!==FILE)return value;
 value=projectNoeliaAnnulmentWorkflowToFiscalEpoch(file,value);
 assert.equal(value.length,15086,'FISCAL_WORKFLOW_CURRENT_BYTES');assert.equal(hash(value),'e3a700eb4f9acc9108179d4308a43198ed10282c527bdcb5e09f961bd0cb16b8','FISCAL_WORKFLOW_CURRENT_SHA');
 let restored=value.toString('utf8');
 for(const addition of [" --fiscal=true","            verification/noelia-circuit-ci/noelia-f931-native-readback.json\n","            verification/noelia-circuit-ci/noelia-fiscal160-installation.json\n"]){assert.equal(restored.split(addition).length,2,'FISCAL_WORKFLOW_UNIQUE_ADDITION');restored=restored.replace(addition,'');}
 const prior=Buffer.from(restored);assert.equal(prior.length,14918,'FISCAL_WORKFLOW_PARENT_BYTES');assert.equal(hash(prior),'e87d8e2490cffbbe081d4a0345cdaa9e482d66fdac8b3825bba1e2bb6e7ef754','FISCAL_WORKFLOW_PARENT_SHA');return prior;
}
