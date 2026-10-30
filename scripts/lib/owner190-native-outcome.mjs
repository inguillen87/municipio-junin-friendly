// SOURCE PROPOSAL: no I/O. Framing is not yet empirically verified with psql.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {OWNER190_CLEANUP_NOTICE_VERSION,compileOwner190CleanupProfile,evaluateOwner190CleanupProfile} from './owner190-cleanup-profile.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const decode=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes);
const copy=value=>structuredClone(value);
export function owner190NativeError(error){
 if(!error)return null;
 return Object.fromEntries(['name','message','code','errno','syscall'].filter(key=>error[key]!==undefined).map(key=>[key,String(error[key])]));
}
const channel=bytes=>Buffer.isBuffer(bytes)?{available:true,bytes:bytes.length,sha256:hash(bytes)}:{available:false,bytes:null,sha256:null};

// This finite profile belongs only to the canonical seed. Expected messages
// are derived here, never supplied as a caller-controlled diagnostic allowlist.
const SEED_NOTICE_VERSION='canonical-seed-drop-if-exists.v1';
function canonicalSeedNotices({sql,framedSql,end,expectedCode,fullJson,profile}){
 assert.ok(profile&&typeof profile==='object'&&!Array.isArray(profile),'OWNER190_NATIVE_NOTICE_PROFILE_INVALID');
 assert.ok(Object.getPrototypeOf(profile)===Object.prototype||Object.getPrototypeOf(profile)===null,'OWNER190_NATIVE_NOTICE_PROFILE_INVALID');
 assert.deepEqual(Reflect.ownKeys(profile).sort(),['schema','sqlFile','version'],'OWNER190_NATIVE_NOTICE_PROFILE_FIELDS');
 assert.equal(profile.version,SEED_NOTICE_VERSION,'OWNER190_NATIVE_NOTICE_PROFILE_VERSION');
 assert.match(profile.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/,'OWNER190_NATIVE_NOTICE_SCHEMA');
 assert.equal(typeof profile.sqlFile,'string','OWNER190_NATIVE_NOTICE_SQL_FILE');
 const sqlFile=profile.sqlFile.replaceAll('\\','/');
 assert.ok(/^(?:[A-Za-z]:\/|\/)/.test(sqlFile)&&/\/[0-9]{3,}\.sql$/.test(sqlFile)&&!/[\0\r\n]/.test(sqlFile)&&!sqlFile.includes('//')&&!sqlFile.split('/').some(p=>p==='.'||p==='..'),'OWNER190_NATIVE_NOTICE_SQL_FILE');
 assert.equal(end,'COMMIT','OWNER190_NATIVE_NOTICE_SEED_COMMIT');
 assert.equal(expectedCode,null,'OWNER190_NATIVE_NOTICE_EXPECTED_ERROR');
 assert.equal(fullJson,false,'OWNER190_NATIVE_NOTICE_FULL_JSON');
 const unique=(text,anchor)=>{const at=text.indexOf(anchor);assert.ok(at>=0&&text.indexOf(anchor,at+anchor.length)===-1,'OWNER190_NATIVE_NOTICE_SQL_ANCHOR');return at;};
 const schemaAt=unique(sql,'CREATE SCHEMA '+profile.schema+';');
 const scopeAt=unique(sql,'SET LOCAL search_path='+profile.schema+',pg_catalog,public,pg_temp;');
 assert.ok(schemaAt<scopeAt,'OWNER190_NATIVE_NOTICE_SCHEMA_SCOPE');
 const specs=[
  {statement:'ALTER TABLE internal_users DROP CONSTRAINT IF EXISTS internal_users_active_password_ck;',message:'constraint "internal_users_active_password_ck" of relation "internal_users" does not exist, skipping'},
  {statement:'DROP TRIGGER IF EXISTS native_employment_catalog_proposal_immutable ON '+profile.schema+'.native_employment_catalog_proposal;',message:'trigger "native_employment_catalog_proposal_immutable" for relation "'+profile.schema+'.native_employment_catalog_proposal" does not exist, skipping'},
  {statement:'DROP TRIGGER IF EXISTS native_employment_catalog_review_immutable ON '+profile.schema+'.native_employment_catalog_review;',message:'trigger "native_employment_catalog_review_immutable" for relation "'+profile.schema+'.native_employment_catalog_review" does not exist, skipping'}
 ];
 let priorAt=scopeAt;
 const notices=specs.map(({statement,message})=>{
  const sqlAt=unique(sql,statement);assert.ok(sqlAt>priorAt,'OWNER190_NATIVE_NOTICE_SQL_ORDER');priorAt=sqlAt;
  const at=unique(framedSql,statement);
  // psql reports the line containing this one-line statement's semicolon.
  const line=framedSql.slice(0,at+statement.length).split('\n').length;
  return Object.freeze({statement,line,text:'psql:'+sqlFile+':'+line+': NOTICE:  '+message});
 });
 const lines=notices.map(n=>n.text);
 return Object.freeze({version:profile.version,schema:profile.schema,sqlFile,notices:Object.freeze(notices),lf:lines.join('\n')+'\n',crlf:lines.join('\r\n')+'\r\n'});
}

// This latch belongs ONLY to this live runner instance. It is not a global lock
// and does not survive Node death or prove EOF, descendant or OS-handle closure.
export function createOwner190NativeOutcomeLatch(){
 let pending=null,last=null,poisoned=false,sequence=0;
 const matching=attempt=>{assert.ok(pending&&pending.attempt===attempt,'OWNER190_NATIVE_ATTEMPT_CHANGED');return pending;};
 const active=attempt=>{const p=matching(attempt);assert.equal(poisoned||p.receipt.state==='UNCERTAIN',false,'OWNER190_NATIVE_SQL_LATCHED');return p;};
 const snapshot=()=>copy(pending?.receipt??last??{state:'IDLE',attempted:false,returned:false});
 return Object.freeze({
  get stopped(){return poisoned||pending!==null;},
  snapshot,
  begin({sql,end,expectedCode=null,fullJson=false,token,noticeProfile=null}){
   assert.equal(poisoned||pending!==null,false,'OWNER190_NATIVE_SQL_LATCHED');
   assert.equal(typeof sql,'string');assert.ok(sql.length>0,'OWNER190_NATIVE_SQL_REQUIRED');
   assert.ok(['COMMIT','ROLLBACK'].includes(end),'OWNER190_NATIVE_END_INVALID');
   assert.equal(typeof fullJson,'boolean','OWNER_PROGRAM_QA_FULL_PROFILE_INVALID');
   assert.ok(expectedCode===null||/^[A-Z][A-Z0-9_]{2,80}$/.test(expectedCode),'OWNER190_NATIVE_EXPECTED_CODE_INVALID');
   assert.match(token,/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/,'OWNER190_NATIVE_TOKEN_INVALID');
   const marker='MC_OWNER190_'+token.replaceAll('-','');assert.equal(sql.includes(marker),false,'OWNER190_NATIVE_FRAME_COLLISION');
   // The original SQL is still one contiguous, unchanged substring.
   const framedSql='\\set QUIET off\n\\echo '+marker+':BEGIN\n'+sql+'\n\\echo '+marker+':END\n';
   const notices=noticeProfile===null?null:noticeProfile.version===OWNER190_CLEANUP_NOTICE_VERSION
    ?compileOwner190CleanupProfile({sql,framedSql,end,expectedCode,fullJson,profile:noticeProfile})
    :canonicalSeedNotices({sql,framedSql,end,expectedCode,fullJson,profile:noticeProfile});
   const attempt=Object.freeze({id:++sequence,end,expectedCode,fullJson,marker,maxBuffer:(fullJson?40:20)*1024*1024,framedSql,noticeProfile:notices});
   pending={attempt,receipt:{version:'owner190-native-outcome.proposed.v1',id:attempt.id,state:'PENDING',sqlSha256:hash(Buffer.from(sql,'utf8')),sqlBytes:Buffer.byteLength(sql,'utf8'),expectedEnd:end,expectedCode,fullJson,maxBuffer:attempt.maxBuffer,attempted:false,returned:false,status:null,signal:null,error:null,stdout:null,stderr:null,rawPersisted:false,transactionTerminalObserved:false,observedEnd:null,rollbackObserved:false,descriptorClosureEstablished:false,protocolEmpiricallyVerified:false}};
   if(notices)pending.receipt.noticeProfile={version:notices.version,schema:notices.schema,sqlFile:notices.sqlFile,expectedCount:notices.kind==='cleanup'?1:3,sourceLines:notices.kind==='cleanup'?notices.sourceLines:notices.notices.map(n=>n.line)};
   return attempt;
  },
  markInvoked(attempt){active(attempt).receipt.attempted=true;},
  recordReturn(attempt,result){
   const p=active(attempt);assert.equal(p.receipt.attempted,true);assert.equal(p.receipt.returned,false,'OWNER190_NATIVE_DUPLICATE_RETURN');
   p.receipt.returned=true;p.receipt.status=result.status??null;p.receipt.signal=result.signal??null;p.receipt.error=owner190NativeError(result.error);
   p.receipt.stdout=channel(result.stdout);p.receipt.stderr=channel(result.stderr);return snapshot();
  },
  evaluate(attempt,result,persisted){
   const p=active(attempt),r=p.receipt;
   assert.equal(r.returned,true,'OWNER190_NATIVE_RETURN_MISSING');
   assert.deepEqual(persisted,{stdout:true,stderr:true,capture:true},'OWNER190_NATIVE_RAW_NOT_PERSISTED');
   r.rawPersisted=true;
   assert.deepEqual(channel(result.stdout),r.stdout,'OWNER190_NATIVE_STDOUT_CHANGED');assert.deepEqual(channel(result.stderr),r.stderr,'OWNER190_NATIVE_STDERR_CHANGED');
   if(r.error!==null)throw result.error;assert.equal(r.signal,null,'OWNER190_NATIVE_SIGNAL');
   assert.ok(r.stdout.available&&r.stderr.available,'OWNER190_NATIVE_CHANNEL_MISSING');
   assert.ok(r.stdout.bytes<attempt.maxBuffer&&r.stderr.bytes<attempt.maxBuffer,'OWNER190_NATIVE_BUFFER_LIMIT');
   const stdout=decode(result.stdout),stderr=decode(result.stderr);
   assert.ok(stdout.endsWith('\n'),'OWNER190_NATIVE_STDOUT_UNTERMINATED');
   const lines=stdout.split(/\r?\n/).filter(line=>line.trim()!==''),begin=attempt.marker+':BEGIN',end=attempt.marker+':END';
   assert.equal(lines[0],begin,'OWNER190_NATIVE_FRAME_BEGIN');assert.equal(lines.filter(line=>line===begin).length,1,'OWNER190_NATIVE_FRAME_DUPLICATE');
   assert.equal(lines[1],'BEGIN','OWNER190_NATIVE_SQL_BEGIN_POSITION');assert.equal(lines.filter(line=>line==='BEGIN').length,1,'OWNER190_NATIVE_SQL_BEGIN_COUNT');
   const terminals=lines.filter(line=>line==='COMMIT'||line==='ROLLBACK');
   let value,state,observedEnd=null,noticeDiagnostics=null;
   if(r.status===3&&attempt.expectedCode!==null){
    assert.equal(lines.includes(end),false,'OWNER190_NATIVE_ERROR_AFTER_FRAME');
    assert.equal(terminals.length,0,'OWNER190_NATIVE_ERROR_AFTER_TERMINAL');
    assert.ok(stderr.endsWith('\n'),'OWNER190_NATIVE_STDERR_UNTERMINATED');
    assert.equal(/\b(?:WARNING|NOTICE|FATAL|PANIC):/.test(stderr),false,'OWNER190_NATIVE_UNEXPECTED_DIAGNOSTIC');
    assert.equal((stderr.match(/\bERROR:/g)??[]).length,1,'OWNER190_NATIVE_EXPECTED_ERROR_COUNT');
    assert.match(stderr,new RegExp('\\bERROR:[^\\r\\n]*\\b'+attempt.expectedCode+'\\b'),'OWNER190_NATIVE_EXPECTED_ERROR_MISSING');
    // Exit 3 is an expected SQL error, NOT an observed ROLLBACK command tag.
    value={status:3,stderr};state='EXPECTED_SQL_ERROR';
   }else{
    assert.equal(r.status,0,'OWNER190_NATIVE_EXIT_INVALID');assert.equal(attempt.expectedCode,null,'OWNER190_NATIVE_EXPECTED_ERROR_NOT_SEEN');
    assert.equal(lines.at(-1),end,'OWNER190_NATIVE_FRAME_END');assert.equal(lines.filter(line=>line===end).length,1,'OWNER190_NATIVE_FRAME_DUPLICATE');
    assert.deepEqual(terminals,[attempt.end],'OWNER190_NATIVE_TERMINAL_MISMATCH');assert.equal(lines.at(-2),attempt.end,'OWNER190_NATIVE_TERMINAL_NOT_LAST');
    if(attempt.noticeProfile===null){
     assert.equal(stderr,'','OWNER190_NATIVE_STDERR_NONEMPTY');
    }else if(attempt.noticeProfile.kind==='cleanup'){
     const cleanup=evaluateOwner190CleanupProfile({profile:attempt.noticeProfile,lines,stderr});
     value=cleanup.value;noticeDiagnostics={...cleanup.diagnostics,sqlSha256:r.sqlSha256,stderrSha256:r.stderr.sha256};
    }else{
     const profile=attempt.noticeProfile;
     assert.ok(stderr===profile.lf||stderr===profile.crlf,'OWNER190_NATIVE_NOTICE_STDERR_MISMATCH');
     noticeDiagnostics={version:profile.version,count:3,sourceLines:profile.notices.map(n=>n.line),sqlSha256:r.sqlSha256,stderrSha256:r.stderr.sha256};
    }
    // Preserve the existing last-row convention ONLY after the complete terminal frame.
    // The actual psql tag/row transcript remains a separate HARD_PENDING proof.
    if(attempt.noticeProfile?.kind!=='cleanup'){const line=lines.slice(1,-2).at(-1);value=line?.startsWith('{')||line?.startsWith('[')?JSON.parse(line):line;}
    if(attempt.fullJson)assert.ok(value&&typeof value==='object','OWNER190_NATIVE_FULL_JSON_REQUIRED');
    state='TERMINAL_FRAME';observedEnd=attempt.end;
   }
   const receipt={...r,state,rawPersisted:true,transactionTerminalObserved:observedEnd!==null,observedEnd,rollbackObserved:observedEnd==='ROLLBACK',...(noticeDiagnostics?{noticeDiagnostics}:{})};
   return{attempt,value,receipt};
  },
  complete(attempt,outcome){active(attempt);assert.strictEqual(outcome.attempt,attempt);last=copy(outcome.receipt);pending=null;},
  fail(attempt,error,phase){
   const p=matching(attempt);
   if(poisoned||p.receipt.state==='UNCERTAIN'){p.receipt.secondaryFailures??=[];p.receipt.secondaryFailures.push({phase,failure:owner190NativeError(error)});return snapshot();}
   poisoned=true;p.receipt={...p.receipt,state:'UNCERTAIN',failurePhase:phase,failure:owner190NativeError(error)};return snapshot();
  }
 });
}
