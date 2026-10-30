// Six finite native ABI contracts. Expectations derive only from these exact
// existing producer bytes, never a database observation or a synthetic receipt.
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const SHA=/^[a-f0-9]{64}$/,minted=new WeakSet();
const sources=Object.freeze({
 '127':['scripts/lib/annual-position-budget-installation.mjs','fb335901ab5497138c17807ff2c4007ac85da4a71ae8e9ab480b3cd0c1bbcbd6'],
 '128':['scripts/lib/position-assignment-installation.mjs','14f86d4b033a9558d40e197ca6f315d486d82490a3579e8d4eade390a29de426'],
 '129':['scripts/lib/position-comparison-installation.mjs','4a136504b70f66c00391614274474a1d4f7dd46dc55bbbe1e02972b9eda2fd7d'],
 'adopted-v2':['scripts/lib/adopted-positions-installation.mjs','b5e1f9185e42c3a3372b443e8d6383d8259b155217e9db48b121f5d07cc56ab9'],
 '210':['scripts/lib/position-population-installation.mjs','9a03e7cace602eefea07931ccfaacd643adb7d1c11e49da46e648361e5d25141'],
 '211':['scripts/lib/own-art-full-installation.mjs','11dc18a0c1a44c683098bab740fd52fbaa589e41adead31c8921444ba5309383']
});
const fixed=Object.freeze({
 '127':{allChecksPassed:true,eventRows:0,newTables:1,newFunctions:11,runtimeFacades:3,capabilityDefinitionsAdded:2,roleAssignmentsAdded:0,nominalRowsReturned:0},
 '128':{allChecksPassed:true,newTables:2,newFunctions:11,runtimeFacades:4,originalCaptureTriggersAdded:1,eventRows:0,positionCaptureRows:0,capabilityDefinitionsAdded:2,roleAssignmentsAdded:0,nominalRowsReturned:0},
 '129':{allChecksPassed:true,newTables:1,newFunctions:4,runtimeFacades:1,originalCaptureTriggersAdded:1,dimensionRows:0,capabilityDefinitionsAdded:0,roleAssignmentsAdded:0,nominalRowsReturned:0},
 'adopted-v2':{allChecksPassed:true,adaptedFunctions:5,newTables:0,newFunctions:0,permissionChanges:0,businessOperations:0,nominalRowsReturned:0},
 '210':{allChecksPassed:true,newTables:0,newFunctions:2,runtimeFacades:1,capabilityDefinitionsAdded:0,roleAssignmentsAdded:0,businessOperations:0,nominalRowsReturned:0},
 '211':{allChecksPassed:true,newTables:0,newFunctions:1,adaptedFunctions:0,runtimeFacades:1,capabilityDefinitionsAdded:0,roleAssignmentsAdded:0,existingAclChanges:0,businessOperations:0,nominalRowsReturned:0,artHistoryPreserved:true}
});
const versions={'adopted-v2':'adopted-positions-installation.v2','210':'own-position-population-installation.v1','211':'own-art-full-installation.v1'};
export function m10OriginalPhaseContract({id,batch,read}){
 const row=sources[id];assert.ok(row,'M10_UNKNOWN_ORIGINAL_PHASE');const[file,digest]=row,source=read(file).replace(/\r\n?/g,'\n');assert.equal(createHash('sha256').update(source).digest('hex'),digest,'M10_ORIGINAL_PHASE_SOURCE_CHANGED:'+id);
 const contract=Object.freeze({id,source:file,sourceSha256:digest,counts:Object.freeze({...fixed[id]}),legacy:['127','128','129'].includes(id),version:versions[id]??null,sourceCommit:batch.sourceCommit});minted.add(contract);return contract;
}
export function assertM10OriginalStagePhase({contract,batch,phase,receipt,installed}){
 assert.ok(minted.has(contract),'M10_UNMINTED_PHASE_CONTRACT');assert.ok(['installation','durable','repetition'].includes(phase));assert.ok(receipt&&typeof receipt==='object'&&!Array.isArray(receipt),'M10_NATIVE_PROOF_REQUIRED');
 const initial=phase==='installation',id=contract.id,legacy=contract.legacy;
 const expected={sourceCommit:batch.sourceCommit,...contract.counts};
 if(legacy)expected['sql'+id+'Sha256']=batch['sql'+id+'Sha256'];
 else{expected.version=contract.version;expected.sourceHashes=batch.sourceHashes;if(id==='210'||id==='211')expected.predecessorVersion=batch.predecessorVersion;}
 const hashes=legacy?['afterFingerprint','newObjectFingerprint',...(initial?['beforeFingerprint']:[])]:['priorFingerprint','objectFingerprint'];
 assert.deepEqual(Reflect.ownKeys(receipt).sort(),[...Object.keys(expected),...hashes].sort(),'M10_NATIVE_PROOF_SHAPE:'+id);
 for(const[key,value]of Object.entries(expected))assert.deepEqual(receipt[key],value,'M10_NATIVE_PROOF_FIELD:'+id+':'+key);
 for(const key of hashes)assert.match(receipt[key],SHA,'M10_NATIVE_FINGERPRINT:'+id+':'+key);
 if(initial&&legacy)assert.equal(receipt.beforeFingerprint,receipt.afterFingerprint,'M10_NATIVE_PRIOR_STATE_CHANGED:'+id);
 if(!initial){assert.ok(installed,'M10_REAL_INSTALL_PROOF_REQUIRED');assertM10OriginalStagePhase({contract,batch,phase:'installation',receipt:installed});const previous=legacy?Object.fromEntries(Object.entries(installed).filter(([key])=>key!=='beforeFingerprint')):installed;assert.deepEqual(receipt,previous,'M10_NATIVE_DURABLE_PROOF_CHANGED:'+id);}
 return {phaseValidated:true,stage:id,phase};
}
