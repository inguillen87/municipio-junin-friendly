// Proposed FS/source cases only. This test does not import any application or QA.
// Not executed or syntax-checked. Does not establish native SQL or runtime compatibility.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=()=>readFileSync(new URL('../scripts/lib/own-monetary-program-technical-epoch.mjs',import.meta.url),'utf8');
const hash=text=>createHash('sha256').update(text).digest('hex');
function section(text,start,end){const begin=text.indexOf(start),finish=text.indexOf(end,begin);assert.ok(begin>=0&&finish>begin);return text.slice(begin,finish);}
function tokens(text,values){for(const value of values)assert.ok(text.includes(value),value);}

test('only epoch v2 and QA v2 are admitted with nine exact data options',()=>{
 const text=read();tokens(text,["const VERSION='own-monetary-program-technical-epoch.v2'","const QA_VERSION='own-monetary-program-qa-projection.v2'","const OPTION_KEYS=Object.freeze(['check','expectRollback','foundation','json','qa','readFullSnapshot','setPhase','sourceCustody','technicalEpochs'])",'Reflect.ownKeys(options).sort(),OPTION_KEYS',"Object.hasOwn(descriptor,'value')&&descriptor.enumerable"]);
 assert.equal(text.includes("const QA_VERSION='own-monetary-program-qa-projection.v1'"),false);
});

test('the host foundation and live actors require identity and existing mode',()=>{
 const text=read(),required=["qa.monetaryFoundationMode,'existing','MONETARY_TECHNICAL_EXISTING_HOST_REQUIRED'","assert.strictEqual(qa.qa192.qa,host.foundation,'MONETARY_TECHNICAL_FOUNDATION_CHANGED')","assert.strictEqual(host.foundation.actor,host.actor,'MONETARY_TECHNICAL_HOST_ACTOR_CHANGED')","assert.strictEqual(host.foundation.checker,host.checker,'MONETARY_TECHNICAL_HOST_CHECKER_CHANGED')","assert.strictEqual(qa.actor,host.actor,'MONETARY_TECHNICAL_ACTOR_CHANGED')","assert.strictEqual(qa.checker,host.checker,'MONETARY_TECHNICAL_CHECKER_CHANGED')","['major','schema','sourceCommit','operationalPairBaseline']"];
 tokens(text,required);assert.throws(()=>tokens(text.replace(required[1],''),required),assert.AssertionError);
});

test('source bookends invoke the real public validator with committed bytes',()=>{
 const text=read();tokens(text,["import {assertOwnerAuthorityQaSourceBookend} from '../verify-municipal-owner-adoption-authority.mjs'",'const proof=assertOwnerAuthorityQaSourceBookend(state.closure,{committedBytes:state.committedBytes})',"proof.committedBytesVerified,true","proof.externalParserRawBookend,true"]);
 assert.equal(text.includes('assertSourceBookend:'),false);assert.equal(text.includes('sourceBookend:()=>true'),false);
});

test('the frozen host closure retains complete scope and the pinned v2 sources',()=>{
 const text=read();tokens(text,["['closure','committedBytes','sourceCommit']","value.sourceCommit,qa.sourceCommit,'MONETARY_TECHNICAL_SOURCE_COMMIT_CHANGED'","['externalModules','externalParser','files']",'for(const path of[SELF_SOURCE,...Object.keys(qa.sourceHashes)])',"60cc7b6ad3a868b923b51b26c7361a25a12a062f715f8be77dbcd3483e50d837","0c55c03740a792e86061dbd8bcc05fb80969d46a5d2ca58969d5789532ecd243","6194ab3f20092277c7b30c8a3c1fd7cb2bae3041ce8a3a63df107ea3b628cfeb",'return Object.freeze(Object.fromEntries(entries))','const closure=Object.freeze({files,externalModules:Object.freeze([...original.externalModules])']);
 assert.equal(text.includes('files[path]=proof'),false);
});

test('SQL callbacks have real bookends even when they throw and both failures survive',()=>{
 const text=read(),wrapper=section(text,' const sqlCallback=(kind,label,invoke)=>{',' const snapshot=label=>');
 tokens(wrapper,['const before=sourceBookend(custody)','value=nativeObject(invoke(),label)','after=sourceBookend(custody);assertHost()','new AggregateError([callbackFailure,sourceFailure]','if(failed)throw callbackFailure','throw sourceFailure']);
 assert.ok(wrapper.indexOf('const before=sourceBookend(custody)')<wrapper.indexOf('invoke()'));
 assert.ok(wrapper.indexOf('invoke()')<wrapper.indexOf('after=sourceBookend(custody)'));
 assert.ok(wrapper.indexOf('after=sourceBookend(custody)')<wrapper.indexOf('sourceCalls.push('));
});

test('json, expected rollback and full snapshots all pass through that one wrapper',()=>{
 const text=read();tokens(text,["fullSnapshot(()=>sqlCallback('readFullSnapshot',label,readFullSnapshot),label)","sqlCallback('json',label,()=>json(statements,settings))","sqlCallback('expectRollback','phase-negative',()=>expectRollback(local.installation,PHASE_ERROR))"]);
 assert.equal(text.split('json(statements,settings)').length,2);assert.equal(text.split('expectRollback(local.installation,PHASE_ERROR)').length,2);
});

test('complete receipt, snapshot and seven-helper ACL validators remain byte exact',()=>{
 const text=read();assert.equal(hash(section(text,'function rehearsalReceipt(value,batch){','export function verifyOwnMonetaryProgramTechnicalEpoch(options){')),'3478e2a7ba8cfb6e4528be5d4cb2bc47f728f638061af11b32785353d38961bf');
 tokens(text,['requireOwnMonetaryInstallationEpoch({technicalEpochs,batch})','assertOwnMonetaryInstallationDurability({installed,durable,repeated,batch})','assertOwnMonetaryInstallationRollback({rolledBack,durable:rollbackDurable,batch})']);
});

test('every old protocol byte survives after removing the one rollback callback wrapper',()=>{
 const text=read(),start=" setPhase('monetary-rehearsal-rollback');",end=' assertHost();const finalSourceBookend=';
 const wrapped="proofs.phaseNegative=sqlCallback('expectRollback','phase-negative',()=>expectRollback(local.installation,PHASE_ERROR));",prior='proofs.phaseNegative=expectRollback(local.installation,PHASE_ERROR);';
 const protocol=section(text,start,end);assert.equal(protocol.split(wrapped).length,2);assert.equal(hash(protocol.replace(wrapped,()=>prior)),'9aa9dfb15985a98c94d5e2da2f57862e3a361b7ce622b477c142d76e0f1067b2');
});

test('success follows the final real bookend and still denies business completion',()=>{
 const text=read();tokens(text,['const finalSourceBookend=sourceBookend(custody)','calls:sourceCalls,final:finalSourceBookend','monetaryProgrammeApproved:false','payrollCalculated:false','payrollPosted:false','sourcePromotionAdmitted:false','complete:false']);
 assert.ok(text.indexOf('const finalSourceBookend=sourceBookend(custody)')<text.indexOf(' return{version:VERSION,passed:true'));
});
