// Canonical local receipt custody for the EXISTING institutional M7 executor.
// No database/client/imported QA envelope; a passed flag is never an admission.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {assertOwnM7PublicNovelty217PriorRecord,assertOwnM7PublicNovelty217Capacity201Record} from './own-m7-public-novelty217-source.mjs';
import {assertOwnM7PublicAnnulmentTailRecord} from './own-m7-public-annulment208209.mjs';
import {M10_PUBLIC_STAGE_ORDER,assertM10PublicStageRecord} from './own-m10-public-schema-plan.mjs';
const minted=new WeakMap(),MAX=16*1024*1024,SHA=/^[a-f0-9]{64}$/;
const hash=b=>createHash('sha256').update(b).digest('hex');
const bytes=v=>Buffer.from(JSON.stringify(v,null,2)+'\n','utf8');
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;};
const exact=(value,keys,code)=>{assert.ok(value&&typeof value==='object'&&!Array.isArray(value),code);assert.deepEqual(Reflect.ownKeys(value).sort(),[...keys].sort(),code);};
const sameIdentity=(a,b)=>{assert.equal(a.dev,b.dev,'M7_PRIOR_FILE_ID_CHANGED');assert.equal(a.ino,b.ino,'M7_PRIOR_FILE_ID_CHANGED');};

// lstat rejects symlinks/junctions. Windows attributes also reject other reparse
// types; the literal command and environment path do not interpolate shell code.
function noReparse(file){
 const stat=fs.lstatSync(file);assert.equal(stat.isSymbolicLink(),false,'M7_PRIOR_REPARSE_REJECTED');
 return stat;
}
function windowsNoReparse(files){
 if(process.platform==='win32'){
  const command='$custodyPaths=ConvertFrom-Json -InputObject $env:MUNICONTROL_M7_CUSTODY_PATHS;foreach($custodyPath in $custodyPaths){[Console]::WriteLine([int](Get-Item -LiteralPath $custodyPath -Force -ErrorAction Stop).Attributes)}';
  const text=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:4096,env:{...process.env,MUNICONTROL_M7_CUSTODY_PATHS:JSON.stringify(files)}}).trim();
  const attributes=text.split(/\r?\n/);assert.equal(attributes.length,files.length,'M7_PRIOR_ATTRIBUTES_UNAVAILABLE');for(const value of attributes){assert.match(value,/^\d+$/,'M7_PRIOR_ATTRIBUTES_UNAVAILABLE');assert.equal(Number(value)&0x400,0,'M7_PRIOR_REPARSE_REJECTED');}
 }
}
function receiptPath(root,file,{newFile=false}={}){
 root=path.resolve(root);const absolute=path.resolve(root,file),relative=path.relative(root,absolute).split(path.sep).join('/');
 assert.ok(/^verification\/[A-Za-z0-9_./-]+\.json$/.test(relative),'M7_PRIOR_VERIFICATION_PATH_REQUIRED');
 assert.ok(relative.split('/').every(v=>v&&v!=='.'&&v!=='..'),'M7_PRIOR_PATH_SEGMENT_REJECTED');
 assert.equal(fs.realpathSync.native(root),root,'M7_PRIOR_ROOT_REALPATH_CHANGED');
 const parts=relative.split('/'),checked=[root];let current=root;assert.ok(noReparse(root).isDirectory());
 for(let i=0;i<parts.length;i++){
  current=path.join(current,parts[i]);if(newFile&&i===parts.length-1){assert.equal(fs.existsSync(current),false,'M7_PRIOR_OUTPUT_EXISTS');break;}
  const stat=noReparse(current);checked.push(current);assert.equal(fs.realpathSync.native(current),current,'M7_PRIOR_REALPATH_CHANGED');
  if(i<parts.length-1)assert.ok(stat.isDirectory(),'M7_PRIOR_PARENT_DIRECTORY_REQUIRED');else{assert.ok(stat.isFile(),'M7_PRIOR_REGULAR_FILE_REQUIRED');assert.equal(stat.nlink,1,'M7_PRIOR_HARDLINK_REJECTED');}
 }
 windowsNoReparse(checked);return {root,absolute,relative};
}
function rawReceipt(root,file,expected){
 const p=receiptPath(root,file),before=noReparse(p.absolute);assert.ok(before.size>0&&before.size<=MAX,'M7_PRIOR_SIZE_REJECTED');
 const fd=fs.openSync(p.absolute,'r');let raw;
 try{sameIdentity(before,fs.fstatSync(fd));raw=fs.readFileSync(fd);sameIdentity(before,fs.fstatSync(fd));}finally{fs.closeSync(fd);}
 sameIdentity(before,noReparse(p.absolute));assert.ok(raw.length>0&&raw.length<=MAX,'M7_PRIOR_SIZE_REJECTED');
 const text=raw.toString('utf8');assert.ok(Buffer.from(text,'utf8').equals(raw),'M7_PRIOR_STRICT_UTF8_REQUIRED');
 let value;try{value=JSON.parse(text);}catch{assert.fail('M7_PRIOR_JSON_REQUIRED');}
 // Also rejects BOM, duplicate keys, trailing bytes and alternate serialization.
 assert.ok(bytes(value).equals(raw),'M7_PRIOR_CANONICAL_RAW_REQUIRED');
 const pin={path:p.relative,bytes:raw.length,sha256:hash(raw)};
 if(expected){exact(expected,['path','bytes','sha256'],'M7_PRIOR_RAW_PIN_SHAPE');assert.match(expected.sha256,SHA);assert.deepEqual(pin,expected,'M7_PRIOR_ORIGINAL_RAW_CHANGED');}
 return {pin,value:freeze(value),raw};
}
const baseKeys=['stage','version','sourceCommit','target','phase','state','preflight','rehearsed','installed','durableObserved','durabilityVerified','repeated','businessOperations','nominalRowsReturned','automaticRetry','installedProof','durableProof','validation','validatedReceiptCount','nativeEquivalencePublicIncluded'];
function recordShape(record,stage,batch,targetPlan){
 const extra=stage==='novelty217'?['repeatedProof']:['novelty217Prior','novelty217Before201Proof','novelty217After201Proof','novelty217BoundaryReceiptCount'];
 exact(record,[...baseKeys,...extra],'M7_PRIOR_STAGE_RECORD_SHAPE');assert.equal(record.stage,stage);assert.equal(record.sourceCommit,batch.sourceCommit,'M7_PRIOR_SOURCE_COMMIT_CHANGED');
 assert.equal(record.version,stage==='novelty217'?targetPlan.version:batch.stageBatches.capacity201.version,'M7_PRIOR_STAGE_VERSION_CHANGED');
 const target=targetPlan.target;exact(record.target,[...Object.keys(target),'transport','postgresSsl'],'M7_PRIOR_TARGET_SHAPE');
 for(const [key,value]of Object.entries(target))assert.equal(record.target[key],value,'M7_PRIOR_DESTINATION_CHANGED:'+key);
 assert.equal(record.target.transport,'neon_https');assert.equal(record.target.postgresSsl,true,'M7_PRIOR_SSL_REQUIRED');
 assert.equal(record.nativeEquivalencePublicIncluded,false);if(stage==='capacity201')assert.equal(record.novelty217BoundaryReceiptCount,2);
}

export function readOwnM7PriorReceipts({root,file,batch,stageId,major}){
 if(stageId.startsWith('m10-'))return readM10PriorReceipts({root,file,batch,stageId,major});
 const target=batch.targets.find(t=>t.major===major),targetPlan=target?.stageBatches?.novelty217;
 const needs217=['census200','capacity201'].includes(stageId),needs201=['bootstrap213','snapshot214','snapshot215','annul208209'].includes(stageId);
 // Legacy unit transport fixtures have no committed stageOrder. The real CLI
 // always recomposes the closed batch and therefore always requires its217 plan.
 if(!batch.stageOrder?.includes('novelty217')){assert.equal(file,undefined,'M7_PRIOR_FORBIDDEN');return undefined;}
 assert.ok(targetPlan,'M7_PRIOR_CANONICAL217_STAGE_REQUIRED');
 if(!needs217&&!needs201){assert.equal(file,undefined,'M7_PRIOR_FORBIDDEN');return undefined;}
 assert.equal(typeof file,'string','M7_PRIOR_REQUIRED');const selected=rawReceipt(root,file);
 let original217=selected;
 if(needs201){recordShape(selected.value,'capacity201',batch,targetPlan);const pin=selected.value.novelty217Prior;exact(pin,['path','bytes','sha256'],'M7_PRIOR_RAW_PIN_SHAPE');original217=rawReceipt(root,pin.path,pin);}
 const validate=(current217,current201)=>{
  recordShape(current217,'novelty217',batch,targetPlan);assertOwnM7PublicNovelty217PriorRecord({targetPlan,record:current217});
  if(current201){recordShape(current201,'capacity201',batch,targetPlan);assertOwnM7PublicNovelty217Capacity201Record({targetPlan,prior217Record:current217,record:current201});}
 };
 validate(original217.value,needs201?selected.value:null);
 const recheck=()=>{const fresh217=rawReceipt(root,original217.pin.path,original217.pin),fresh201=needs201?rawReceipt(root,selected.pin.path,selected.pin):null;validate(fresh217.value,fresh201?.value);return true;};
 const links={novelty217Prior:original217.pin,...(needs201?{capacity201Prior:selected.pin}:{})};
 const prior=freeze({targetPlan,prior217Record:original217.value,...(needs201?{prior201Record:selected.value}:{}),links,recheck});
 minted.set(prior,{batch,stageId,major});return prior;
}
export function assertOwnM7PriorForStage({prior,batch,stageId,major}){
 const required=batch.stageOrder?.includes('novelty217')&&(['census200','capacity201','bootstrap213','snapshot214','snapshot215','annul208209'].includes(stageId)||stageId.startsWith('m10-'));
 if(!required){assert.equal(prior,undefined,'M7_PRIOR_FORBIDDEN');return undefined;}
 const seal=minted.get(prior);assert.ok(seal,'M7_PRIOR_UNMINTED_RECEIPTS');assert.strictEqual(seal.batch,batch,'M7_PRIOR_RECOMPOSED_BATCH_CHANGED');assert.equal(seal.stageId,stageId);assert.equal(seal.major,major);prior.recheck();return prior;
}

// Persist the actual executor record, then verify its exact RAW bytes through
// the same regular-file fence. A replaced output is detected before truncation.
export function createOwnM7RecordWriter({root,file}){
 const first=receiptPath(root,file,{newFile:true});let identity;
 return value=>{
  const raw=bytes(value);assert.ok(raw.length<=MAX,'M7_PRIOR_SIZE_REJECTED');
  if(identity){receiptPath(root,file);sameIdentity(identity,noReparse(first.absolute));}
  else receiptPath(root,file,{newFile:true});
  const fd=fs.openSync(first.absolute,identity?'r+':'wx+');
  try{const opened=fs.fstatSync(fd);if(identity)sameIdentity(identity,opened);else identity=opened;fs.ftruncateSync(fd,0);let at=0;while(at<raw.length){const count=fs.writeSync(fd,raw,at,raw.length-at,at);assert.ok(count>0);at+=count;}fs.fsyncSync(fd);sameIdentity(identity,fs.fstatSync(fd));}finally{fs.closeSync(fd);}
  const saved=rawReceipt(root,first.absolute);sameIdentity(identity,noReparse(first.absolute));assert.ok(saved.raw.equals(raw),'M7_PRIOR_OUTPUT_READBACK_CHANGED');
 };
}

function readM10PriorReceipts({root,file,batch,stageId,major}){
 const id=stageId.slice(4),index=M10_PUBLIC_STAGE_ORDER.indexOf(id);assert.ok(index>=0,'M10_PRIOR_UNKNOWN_STAGE');assert.equal(typeof file,'string','M10_PRIOR_REQUIRED');assert.ok(batch.stageOrder.includes('annul208209'),'M10_REQUIRES_COMPLETE_M7_TAIL');
 const target=batch.targets.find(t=>t.major===major),plan=target?.m10PublicPlan,targetPlan=target?.stageBatches?.novelty217;assert.ok(plan&&targetPlan,'M10_PRIOR_CANONICAL_PLAN_REQUIRED');
 const pins=[],stages=[];let selected=rawReceipt(root,file),tail;
 // Strict predecessor IDs cap depth at seven; a link never permits a cycle,
 // skipped stage, second source commit, different destination or later epoch.
 for(let n=index-1;n>=0;n--){
  const record=selected.value,expectedId=M10_PUBLIC_STAGE_ORDER[n],fields=[...baseKeys,'repeatedProof','novelty217Prior','capacity201Prior','annulmentPrior',...(n>0?['m10Prior']:[]),...(expectedId==='212'?['finalFunctionProof']:[])];exact(record,fields,'M10_PRIOR_CLOSED_RECORD_SHAPE');
  const targetKeys=[...Object.keys(targetPlan.target),'transport','postgresSsl'];exact(record.target,targetKeys,'M10_PRIOR_TARGET_SHAPE');assertM10PublicStageRecord({plan,id:expectedId,record,actualTarget:record.target});
  stages.push({pin:selected.pin,id:expectedId});pins.push(selected.pin);
  for(const key of ['novelty217Prior','capacity201Prior','annulmentPrior'])exact(record[key],['path','bytes','sha256'],'M10_PRIOR_RAW_PIN_SHAPE');
  const link=n>0?record.m10Prior:record.annulmentPrior;exact(link,['path','bytes','sha256'],'M10_PRIOR_RAW_PIN_SHAPE');selected=rawReceipt(root,link.path,link);
 }
 tail=selected;assert.equal(tail.value.stage,'annul208209','M10_ORIGINAL_M7_TAIL_REQUIRED');assertOwnM7PublicAnnulmentTailRecord({batch,major,record:tail.value});pins.push(tail.pin);
 for(const key of ['novelty217Prior','capacity201Prior'])exact(tail.value[key],['path','bytes','sha256'],'M10_M7_RAW_PIN_REQUIRED');
 const original201=rawReceipt(root,tail.value.capacity201Prior.path,tail.value.capacity201Prior);
 const original217=rawReceipt(root,tail.value.novelty217Prior.path,tail.value.novelty217Prior);assert.deepEqual(original201.value.novelty217Prior,original217.pin,'M10_M7_ORIGINAL217_LINK_CHANGED');
 const base=readOwnM7PriorReceipts({root,file:original201.pin.path,batch,stageId:'annul208209',major});assert.deepEqual(base.links.capacity201Prior,original201.pin);assert.deepEqual(base.links.novelty217Prior,original217.pin);
 const links={novelty217Prior:original217.pin,capacity201Prior:original201.pin,annulmentPrior:tail.pin,...(index>0?{m10Prior:pins[0]}:{})};
 const validateStageLinks=(record,n)=>{
  assert.deepEqual(record.novelty217Prior,original217.pin);assert.deepEqual(record.capacity201Prior,original201.pin);assert.deepEqual(record.annulmentPrior,tail.pin,'M10_ORIGINAL_TAIL_LINK_CHANGED');
  if(n>0)assert.deepEqual(record.m10Prior,stages.find(row=>row.id===M10_PUBLIC_STAGE_ORDER[n-1]).pin,'M10_ORIGINAL_PREDECESSOR_LINK_CHANGED');
 };
 for(const row of stages){const record=rawReceipt(root,row.pin.path,row.pin).value;validateStageLinks(record,M10_PUBLIC_STAGE_ORDER.indexOf(row.id));}
 const recheck=()=>{
  base.recheck();const observedTail=rawReceipt(root,tail.pin.path,tail.pin);assertOwnM7PublicAnnulmentTailRecord({batch,major,record:observedTail.value});
  for(const row of stages){const observed=rawReceipt(root,row.pin.path,row.pin);validateStageLinks(observed.value,M10_PUBLIC_STAGE_ORDER.indexOf(row.id));assertM10PublicStageRecord({plan,id:row.id,record:observed.value,actualTarget:observed.value.target});}return true;
 };
 const prior=freeze({targetPlan,prior217Record:base.prior217Record,prior201Record:base.prior201Record,originalTailRecord:tail.value,links,recheck});minted.set(prior,{batch,stageId,major});return prior;
}
