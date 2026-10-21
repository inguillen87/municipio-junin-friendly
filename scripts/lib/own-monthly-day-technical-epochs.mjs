// Synchronous technical192→193→194→196→197 protocol over caller-owned custody.
// Callbacks perform effects; this module owns no transport, fixture, seed or cleanup.
import assert from 'node:assert/strict';

export function verifyOwnMonthlyDayTechnicalEpochs({qa,json,expectRollback,readFullSnapshot,check,setPhase,durability,fixedComposition,noveltySuccession,proofs,privateHelperAclStatements}){
 assert.equal(typeof fixedComposition,'boolean');assert.equal(typeof noveltySuccession,'boolean');assert.ok(!noveltySuccession||fixedComposition,'MONTHLY197_REQUIRES_GUARDED196');
 assert.match(qa?.schema??'',/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 for(const value of[json,expectRollback,readFullSnapshot,check,setPhase])assert.equal(typeof value,'function');
 assert.ok(proofs&&typeof proofs==='object'&&!Array.isArray(proofs));assert.ok(durability&&typeof durability==='object');
 assert.ok(Array.isArray(privateHelperAclStatements)&&privateHelperAclStatements.length>0&&privateHelperAclStatements.every(value=>typeof value==='string'),'MONTHLY_TECHNICAL_PRIVATE_ACL_STATEMENTS_REQUIRED');
 for(const key of['sql192','sql193','sql194',...(fixedComposition?['sql196Days']:[]),...(noveltySuccession?['sql197']:[])])assert.equal(typeof durability[key],'function');
 const install=(local,batch,assertDurable,label)=>{const baseline=readFullSnapshot();proofs[label+'Rehearsal']=json(local.rehearsal,{end:'ROLLBACK'});assert.deepEqual(readFullSnapshot(),baseline);const installed=json(local.installation),durable=json(local.verification,{readOnly:true}),repeated=json(local.repetition);proofs[label]={installed,durable,repeated,durability:assertDurable({installed,durable,repeated,batch})};};
 setPhase('192-installation');install(qa.qa192.local,qa.qa192.batch,durability.sql192,'sql192');
 setPhase('193-installation');install(qa.local193,qa.batch.declaration,durability.sql193,'sql193');
 setPhase('194-installation');install(qa.local,qa.batch,durability.sql194,'sql194');expectRollback(qa.local.installation,'MONTHLY194_PHASE_CHANGED');const installedBaseline=readFullSnapshot();json(qa.local.rollback,{expectJson:false});json([qa.normalized(qa.batch.beforeCheck)],{readOnly:true,expectJson:false});json(qa.local.installation);assert.deepEqual(readFullSnapshot(),installedBaseline);check(true,'192/193/194 canonical installation, separate durable reads, exact repetition and194 no-history reversal/reinstall');
 if(fixedComposition){
  setPhase('196-days-composition-installation');const baseline=readFullSnapshot();
  install(qa.localFixed,qa.fixedComposition,durability.sql196Days,'sql196Days');expectRollback(qa.localFixed.installation,'MONTHLY_FIXED_PHASE_CHANGED');
  json(qa.localFixed.rollback,{expectJson:false});json([qa.normalized(qa.fixedComposition.beforeCheck)],{readOnly:true,expectJson:false});assert.deepEqual(readFullSnapshot(),baseline);
  // Reversal drops three new helpers. Recreated physical identities start a new
  // installation epoch; predecessor FULL conservation was proved above.
  const installed=json(qa.localFixed.installation),reinstalledBaseline=readFullSnapshot(),durable=json(qa.localFixed.verification,{readOnly:true}),repeated=json(qa.localFixed.repetition);
  proofs.sql196DaysReinstalled={installed,durable,repeated,durability:durability.sql196Days({installed,durable,repeated,batch:qa.fixedComposition})};
  assert.deepEqual(readFullSnapshot(),reinstalledBaseline);
  check(true,'mixed196 installs after exact194, rehearses/rolls back/reinstalls without history and preserves capture/readiness194, rows, security and previous metadata');
 }
 if(noveltySuccession){
  setPhase('197-rehearsal-rollback');const baseline=readFullSnapshot();proofs.sql197Rehearsal=json(qa.local197.rehearsal,{end:'ROLLBACK'});assert.deepEqual(readFullSnapshot(),baseline);
  setPhase('197-installation');const installed=json(qa.local197.installation);
  setPhase('197-durable-readonly');const durable=json(qa.local197.verification,{readOnly:true});
  setPhase('197-repetition');const repeated=json(qa.local197.repetition);proofs.sql197={installed,durable,repeated,durability:durability.sql197({installed,durable,repeated,batch:qa.novelty197})};
  expectRollback(qa.local197.installation,'NOVELTY197_PHASE_CHANGED');
  setPhase('197-no-history-reversal');json(qa.local197.rollback,{expectJson:false});json(qa.local197.rollbackVerification,{readOnly:true,expectJson:false});assert.deepEqual(readFullSnapshot(),baseline);
  setPhase('197-reinstallation');const reinstalled=json(qa.local197.installation),reinstalledBaseline=readFullSnapshot();
  setPhase('197-reinstallation-durable-readonly');const durableReinstalled=json(qa.local197.verification,{readOnly:true});
  setPhase('197-reinstallation-repetition');const repeatedReinstalled=json(qa.local197.repetition);proofs.sql197Reinstalled={installed:reinstalled,durable:durableReinstalled,repeated:repeatedReinstalled,durability:durability.sql197({installed:reinstalled,durable:durableReinstalled,repeated:repeatedReinstalled,batch:qa.novelty197})};
  assert.deepEqual(readFullSnapshot(),reinstalledBaseline);check(true,'197 exact source/QA pins, rehearsal ROLLBACK, installation, independent durable read, repetition and history-free reversal/reinstallation preserve predecessor rows/security/metadata');
 }
 proofs.helperAcl=json(privateHelperAclStatements,{readOnly:true});assert.deepEqual(proofs.helperAcl,{days:false,ledger:false});check(true,'all private193/192 helpers and ledger remain inaccessible to runtime');
 return{passed:true,proofs};
}
