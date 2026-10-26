// Pure bounded cleanup transcript profile. No SQL, filesystem or process I/O.
// PG17.11/PG18 source: dependency.c reportDependentObjects(MAX_REPORTED_DEPS=100)
// and objectaddress.c pg_describe_object/getObjectDescription(existing object).
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const OWNER190_CLEANUP_NOTICE_VERSION='canonical-owned-schema-cleanup.v1';
const bindings=new WeakMap();
const hash=b=>createHash('sha256').update(b).digest('hex');
const exact=(value,keys,label)=>assert.deepEqual(Reflect.ownKeys(value).sort(),[...keys].sort(),label);
const freeze=value=>{if(value&&typeof value==='object'){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;};
const positive=n=>Number.isSafeInteger(n)&&n>0&&n<=4294967295;
function filePath(value){
 assert.equal(typeof value,'string');
 const p=value.replaceAll('\\','/');
 assert.ok(/^(?:[A-Za-z]:\/|\/)/.test(p)&&/\/[0-9]{3,}\.sql$/.test(p)
  &&!p.includes('//')&&!/[\x00-\x1f\x7f]/.test(p)&&!p.split('/').some(s=>s==='.'||s==='..'),'OWNER190_CLEANUP_FILE');
 return p;
}
function baseline(value){
 exact(value,['fingerprint','tables'],'OWNER190_CLEANUP_BASELINE_FIELDS');
 assert.ok(Number.isSafeInteger(value.tables)&&value.tables>=0);
 assert.match(value.fingerprint,/^[a-f0-9]{64}$/);
}
// Internal producer API. Only owner190-canonical-cleanup's minted plan calls
// this; neither h.json nor the continuation options expose registration.
export function registerOwner190CleanupProfile(record,sqlFile){
 exact(record,['sql','schema','schemaOid','ownerOid','sourceCommit','outerBefore'],'OWNER190_CLEANUP_BINDING_FIELDS');
 assert.equal(typeof record.sql,'string');assert.match(record.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 assert.ok(positive(record.schemaOid)&&positive(record.ownerOid));assert.match(record.sourceCommit,/^[a-f0-9]{40}$/);baseline(record.outerBefore);
 const profile=Object.freeze({version:OWNER190_CLEANUP_NOTICE_VERSION,schema:record.schema,sqlFile:filePath(sqlFile)});
 bindings.set(profile,freeze(structuredClone(record)));
 return profile;
}
export function compileOwner190CleanupProfile({sql,framedSql,end,expectedCode,fullJson,profile}){
 const record=bindings.get(profile);assert.ok(record,'OWNER190_CLEANUP_UNMINTED_PROFILE');
 exact(profile,['version','schema','sqlFile'],'OWNER190_CLEANUP_PROFILE_FIELDS');
 assert.equal(profile.version,OWNER190_CLEANUP_NOTICE_VERSION);assert.equal(profile.schema,record.schema);
 assert.equal(end,'COMMIT');assert.equal(expectedCode,null);assert.equal(fullJson,true);
 assert.equal(sql,record.sql,'OWNER190_CLEANUP_COMPLETE_SQL_CHANGED');
 const drop='DROP SCHEMA '+record.schema+' CASCADE;';
 const at=framedSql.indexOf(drop);assert.ok(at>=0&&framedSql.indexOf(drop,at+drop.length)===-1,'OWNER190_CLEANUP_DROP_COUNT');
 assert.equal((sql.match(/\bDROP\s+SCHEMA\b/g)||[]).length,1);
 assert.equal(/\bclient_min_messages\b/i.test(sql),false);
 const line=framedSql.slice(0,at+drop.length).split('\n').length;
 return freeze({...record,version:profile.version,kind:'cleanup',sqlFile:profile.sqlFile,dropLine:line,expectedCount:1,sourceLines:[line]});
}
export function tokenizeOwner190CleanupNotice(stderr,{sqlFile,dropLine}){
 assert.equal(typeof stderr,'string');assert.ok(stderr.endsWith('\n'),'OWNER190_CLEANUP_STDERR_UNTERMINATED');
 if(stderr.includes('\r\n'))assert.equal(stderr.replaceAll('\r\n','').includes('\n'),false,'OWNER190_CLEANUP_MIXED_EOL');
 const text=stderr.replaceAll('\r\n','\n');assert.equal(text.includes('\r'),false);
 const lines=text.slice(0,-1).split('\n'),prefix='psql:'+filePath(sqlFile)+':'+dropLine+': NOTICE:  drop cascades to ';
 assert.ok(Number.isSafeInteger(dropLine)&&dropLine>0);assert.ok(lines[0].startsWith(prefix),'OWNER190_CLEANUP_NOTICE_HEADER');
 const match=/^([1-9][0-9]*) other objects$/.exec(lines[0].slice(prefix.length));assert.ok(match,'OWNER190_CLEANUP_NOTICE_SUMMARY');
 const announced=Number(match[1]);assert.ok(Number.isSafeInteger(announced)&&announced>=2&&announced<=4096,'OWNER190_CLEANUP_NOTICE_BOUND');
 const shown=Math.min(announced,100),truncated=announced-shown;
 assert.equal(lines.length,1+shown+(truncated?1:0),'OWNER190_CLEANUP_DETAIL_COUNT');
 const found=new Set();
 for(let n=0;n<shown;n++){
  const lead=n===0?'DETAIL:  drop cascades to ':'drop cascades to ';
  assert.ok(lines[n+1].startsWith(lead),'OWNER190_CLEANUP_DETAIL_PREFIX');
  const description=lines[n+1].slice(lead.length);
  assert.ok(description.length>0&&!/[\0-\x1f\x7f]/.test(description),'OWNER190_CLEANUP_DESCRIPTION');
  assert.equal(found.has(description),false,'OWNER190_CLEANUP_DUPLICATE_DESCRIPTION');found.add(description);
 }
 if(truncated)assert.equal(lines.at(-1),'and '+truncated+' other '+(truncated===1?'object':'objects')+' (see server log for list)','OWNER190_CLEANUP_TRUNCATED_COUNT');
 return {count:1,announcedObjects:announced,listedObjects:shown,truncatedObjects:truncated,dropSourceLine:dropLine,descriptions:[...found]};
}
export function inspectOwner190CleanupNotice(stderr,{sqlFile,dropLine,allowedDescriptions,nodeCount}){
 const {descriptions,...result}=tokenizeOwner190CleanupNotice(stderr,{sqlFile,dropLine});
 assert.ok(Number.isSafeInteger(nodeCount)&&nodeCount>=result.announcedObjects&&nodeCount<=16384,'OWNER190_CLEANUP_NODE_BOUND');
 assert.ok(allowedDescriptions instanceof Set);
 for(const description of descriptions)assert.ok(allowedDescriptions.has(description),'OWNER190_CLEANUP_FOREIGN_DESCRIPTION');
 return result;
}
export function evaluateOwner190CleanupProfile({profile,lines,stderr}){
 assert.equal(profile.kind,'cleanup');
 const jsons=lines.map((line,index)=>({line,index})).filter(row=>row.line.startsWith('{'));
 assert.equal(jsons.length,2,'OWNER190_CLEANUP_TWO_PROOFS_REQUIRED');
 const pre=JSON.parse(jsons[0].line),post=JSON.parse(jsons[1].line);
 exact(pre,['version','sourceCommit','schema','schemaOid','ownerOid','objects','nodeCount','inventorySha256'],'OWNER190_CLEANUP_PRE_FIELDS');
 exact(post,['version','sourceCommit','schema','schemaOidBefore','schemaAbsent','globalTables','globalFingerprint','inventorySha256','production'],'OWNER190_CLEANUP_POST_FIELDS');
 assert.equal(pre.version,'owner190-cleanup-inventory.v1');assert.equal(post.version,'owner190-cleanup-proof.v1');
 for(const p of [pre,post]){assert.equal(p.schema,profile.schema);assert.equal(p.sourceCommit,profile.sourceCommit);}
 assert.equal(pre.schemaOid,profile.schemaOid);assert.equal(pre.ownerOid,profile.ownerOid);assert.equal(post.schemaOidBefore,profile.schemaOid);
 assert.equal(post.schemaAbsent,true);assert.equal(post.production,false);assert.equal(post.globalTables,profile.outerBefore.tables);assert.equal(post.globalFingerprint,profile.outerBefore.fingerprint);
 assert.match(pre.inventorySha256,/^[a-f0-9]{64}$/);assert.equal(post.inventorySha256,pre.inventorySha256);
 assert.ok(Array.isArray(pre.objects)&&pre.objects.length===pre.nodeCount&&pre.nodeCount>1&&pre.nodeCount<=16384);
 const descriptions=new Set();
 for(const o of pre.objects){
  exact(o,['classid','objid','objsubid','description'],'OWNER190_CLEANUP_OBJECT_FIELDS');
  assert.ok(positive(o.classid)&&positive(o.objid)&&Number.isSafeInteger(o.objsubid)&&o.objsubid>=0);
  assert.equal(typeof o.description,'string');assert.ok(o.description.length>0&&!/[\0-\x1f\x7f]/.test(o.description));
  descriptions.add(o.description);
 }
 const transcript=lines.slice(1,-1).map((line,n)=>n+1===jsons[0].index?'INVENTORY':n+1===jsons[1].index?'PROOF':line);
 assert.deepEqual(transcript,['BEGIN','SET','SET','SET','SET','DO','DO','DO','INVENTORY','DO','DROP SCHEMA','DO','DO','PROOF','COMMIT'],'OWNER190_CLEANUP_TRANSCRIPT_SHAPE');
 const drops=lines.map((line,index)=>({line,index})).filter(r=>r.line==='DROP SCHEMA');
 assert.equal(drops.length,1,'OWNER190_CLEANUP_DROP_TAG');
 assert.ok(jsons[0].index<drops[0].index&&drops[0].index<jsons[1].index,'OWNER190_CLEANUP_PROOF_ORDER');
 assert.equal(jsons[1].index,lines.length-3,'OWNER190_CLEANUP_POST_NOT_LAST');
 const diagnostic=inspectOwner190CleanupNotice(stderr,{sqlFile:profile.sqlFile,dropLine:profile.dropLine,allowedDescriptions:descriptions,nodeCount:pre.nodeCount});
 return {value:post,diagnostics:{version:profile.version,...diagnostic,ownedInventoryFingerprint:pre.inventorySha256,
  preControlSha256:hash(Buffer.from(jsons[0].line)),postProofSha256:hash(Buffer.from(jsons[1].line))}};
}
