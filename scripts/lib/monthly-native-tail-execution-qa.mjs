// Uses only the enclosing runner's guarded transaction callback. No executor.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {assertMonthlyNativeTailDurability} from './monthly-native-tail-installation-qa.mjs';
export async function executeMonthlyNativeTailStage({db,qa,sourceCommit,output,migration,base}){
 const plan=qa.monthlyNativeTailInstallation;
 assert.equal(plan.sourceCommit,sourceCommit);assert.equal(plan.schema,qa.schema);assert.equal(plan.normalized,qa.normalized);
 const found=plan.stages.filter(stage=>stage.migration===migration);assert.equal(found.length,1);const stage=found[0];
 assert.equal(stage.sourceCommit,sourceCommit);assert.equal(stage.schema,qa.schema);
 const before=db.connections.length;
 fs.writeFileSync(path.join(output,base+'.sql'),stage.installation.join(';\n')+';\n',{flag:'wx'});
 fs.writeFileSync(path.join(output,base+'-source-pins.json'),JSON.stringify({sourceCommit,sourceHashes:plan.sourceHashes,stage,projectionLedger:plan.projectionLedger},null,2)+'\n',{flag:'wx'});
 const installed=await db.run(stage.installation.join(';\n'),false,{readOnly:false});
 const durable=await db.run(stage.durableVerification.join(';\n'),false,{readOnly:true});
 assert.equal(db.connections.length,before+2);const installedConnection=db.connections[before],durableConnection=db.connections[before+1];
 assert.equal(installedConnection.readOnly,'off');assert.equal(durableConnection.readOnly,'on');assert.notEqual(installedConnection.backendPid,durableConnection.backendPid);
 const durability=assertMonthlyNativeTailDurability({stage,installed,durable});
 assert.equal(installed.eventRows,0);assert.equal(durable.eventRows,0);
 const proof={major:migration,sourceCommit,sourceHashes:plan.sourceHashes,installed,durable,durability,installedConnection,durableConnection,projectionLedger:plan.projectionLedger};
 fs.writeFileSync(path.join(output,base+'-proof.json'),JSON.stringify(proof,null,2)+'\n',{flag:'wx'});return proof;
}
