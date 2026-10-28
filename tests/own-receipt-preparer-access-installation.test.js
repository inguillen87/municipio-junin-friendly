// Source/guard tests only. No PostgreSQL, connection, auth or business receipt.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import child from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
const blocked=()=>{throw Error('UNIT_IO_FORBIDDEN');};
for(const[module,keys]of [[net,['connect','createConnection','createServer']],[tls,['connect','createServer']],[http,['request','get','createServer']],[https,['request','get','createServer']],[dns,['lookup','resolve']],[child,['exec','execSync','execFile','execFileSync','spawn','spawnSync','fork']]])for(const key of keys)module[key]=blocked;
globalThis.fetch=blocked;syncBuiltinESMExports();
const {buildOwnReceiptPreparerAccessInstallation:build,assertOwnReceiptPreparerAccessInstallation:assertPlan,OWN_RECEIPT_PREPARER_ACCESS_PINS:pins,OWN_RECEIPT_PREPARER_ACCESS_EDITS:edits}=await import('../scripts/lib/own-receipt-preparer-access-installation.mjs');
const root=new URL('../',import.meta.url),read=file=>fs.readFileSync(new URL(file,root),'utf8'),hash=value=>createHash('sha256').update(value).digest('hex');
const body=sql=>{const first=sql.indexOf('$$'),last=sql.lastIndexOf('$$');assert.ok(first>0&&last>first);return sql.slice(first+2,last);};
const oldDefinition=pin=>{const text=read(pins.source126.path),start=text.indexOf(pin.header),end=text.indexOf('$$;',start+pin.header.length+2);assert.ok(start>=0&&end>start);return text.slice(start,end+2);};

test('adopts exactly two historical definitions and verifies the complete inverse, preserving self bytes',()=>{
 const p=build({read});assert.equal(assertPlan(p),p);assert.equal(p.version,'own-receipt-preparer-access.v1');assert.equal(p.statements.length,4);
 assert.deepEqual(p.functions.map(f=>f.name),['own_receipt_context_v1','own_receipt_batch_value_v1']);assert.equal(p.statements.filter(s=>s.startsWith('CREATE OR REPLACE FUNCTION ')).length,2);
 pins.functions.forEach((pin,index)=>{
  const before=oldDefinition(pin),after=p.statements[index+1],change=edits[pin.name];assert.equal(after.slice(0,after.indexOf('$$')),pin.header.replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION '));
  assert.equal(hash(body(before)),pin.pre);assert.equal(hash(body(after)),pin.post);assert.equal(body(after).split(change.new).length-1,1);
  assert.equal(body(after).replace(change.new,change.old),body(before));
 });
 const self=text=>text.slice(text.indexOf(" IF operation='self' THEN"),text.indexOf(' ELSE\n'));
 assert.equal(self(p.statements[1]),self(oldDefinition(pins.functions[0])));assert.equal(hash(self(p.statements[1])),pins.selfBranchSha256);
 assert.equal(p.wholeInverseVerified,true);assert.equal(p.selfByteIdentical,true);assert.equal(p.executes,false);assert.equal(p.connects,false);assert.equal(p.executionAdmitted,false);
});

test('closed source custody pins 126 and actual 176 dependency and rejects any mutation or normalization',()=>{
 const p=build({read});assert.deepEqual(Object.keys(p.sourceHashes).sort(),[pins.source126.path,pins.source176.path].sort());
 for(const pin of [pins.source126,pins.source176]){
  assert.equal(Buffer.byteLength(read(pin.path)),pin.bytes);assert.equal(hash(read(pin.path)),pin.sha256);
  for(const changed of [read(pin.path)+'\n',read(pin.path).replace(/\n/g,'\r\n')])assert.throws(()=>build({read:file=>file===pin.path?changed:read(file)}),/SOURCE_BYTES|SOURCE_SHA256|LF_REQUIRED/);
 }
 const changedHeader=read(pins.source126.path).replace('LANGUAGE plpgsql SECURITY DEFINER','LANGUAGE plpgsql SECURITY INVOKER');assert.throws(()=>build({read:file=>file===pins.source126.path?changedHeader:read(file)}),/SOURCE_BYTES|SOURCE_SHA256/);
 const changedDep=read(pins.source176.path).replace('write_access THEN','write_access OR nominal THEN');assert.throws(()=>build({read:file=>file===pins.source176.path?changedDep:read(file)}),/SOURCE_BYTES|SOURCE_SHA256/);
 assert.throws(()=>build({read,observedMetadata:{passed:true}}),/OPTIONS_EXACT/);assert.throws(()=>build({read:()=>Buffer.from('not a string')}));
});

test('body change removes only the preparation dependency, retaining explicit reviewer and independence gates',()=>{
 const p=build({read}),context=body(p.statements[1]),batch=body(p.statements[2]);
 assert.equal(context.includes('own_close_context_v1'),false);assert.ok(context.includes('public.own_run_context_v1(p,true,false)'));
 assert.ok(context.includes("WHEN 'read' THEN NOT(public.action_center_context_has_capability(ctx,'payroll.receipt.prepare') OR public.action_center_context_has_capability(ctx,'payroll.calculation.approve'))"));
 assert.ok(context.includes("WHEN 'prepare' THEN NOT public.action_center_context_has_capability(ctx,'payroll.receipt.prepare')"));
 assert.ok(context.includes("ELSE NOT(public.action_center_context_has_capability(ctx,'payroll.calculation.approve') AND public.action_center_context_has_capability(ctx,'payroll.receipt.approve'))"));
 for(const capability of ['payroll.calculation.prepare','payroll.calculation.close'])assert.equal(context.includes(capability),false);
 for(const clause of ["e.actor_membership_id IS DISTINCT FROM(ctx->>'membershipId')::uuid","e.actor_person_id IS DISTINCT FROM(ctx->>'actorPersonId')::uuid","e.actor_email IS DISTINCT FROM ctx->>'actorEmail'","state_value='prepared' AND current_value AND independent","state_value<>'withdrawn' AND current_value"])assert.ok(batch.includes(clause));
 assert.equal((batch.match(/has_capability\(ctx,'payroll.calculation.approve'\)/g)??[]).length,2);
});

test('source regression groups the complete CASE condition before the PL/pgSQL IF THEN',()=>{
 const context=body(build({read}).statements[1]);
 assert.match(context,/  IF \(CASE operation WHEN 'read' THEN [^\n]+ END\) THEN RAISE EXCEPTION 'OWN_RECEIPT_FORBIDDEN';END IF;/);
 assert.doesNotMatch(context,/\bIF\s+CASE\s+operation\b/);
 // Removing only the two grouping parentheses reconstructs the failed source;
 // this source assertion does not compile or execute PL/pgSQL.
 const ungrouped=context.replace('  IF (CASE operation ','  IF CASE operation ').replace(" END) THEN RAISE EXCEPTION 'OWN_RECEIPT_FORBIDDEN';"," END THEN RAISE EXCEPTION 'OWN_RECEIPT_FORBIDDEN';");
 assert.equal(context.length,ungrouped.length+2);
 assert.equal(hash(ungrouped),'c6cf6a91fdabb9811668fdfa78b6305cf2cb7a1ebe0d435f33650797e88d3fdb');
 assert.equal(hash(context),pins.functions[0].post);
});

test('guards close every original metadata/ACL property and reject mixed pre/post pairs',()=>{
 const p=build({read});
 for(const guard of [p.preflight,p.statements[0],p.statements[3],p.durable,p.repeat]){
  for(const required of ["p.proowner<>current_user::regrole","p.prokind<>'f'","p.proparallel<>'u'",'p.proleakproof','p.prosupport<>0','p.procost<>100','p.prorows<>0','p.provariadic<>0','p.probin IS NOT NULL','p.prosqlbody IS NOT NULL','p.proargmodes IS NOT NULL','p.proallargtypes IS NOT NULL','p.pronargs<>','p.pronargdefaults<>','p.proargnames IS DISTINCT FROM','pg_catalog.pg_get_expr(p.proargdefaults,0) IS DISTINCT FROM','p.proconfig IS DISTINCT FROM','overload.proname=','acldefault(\'f\',p.proowner))))<>1','acl.grantee<>p.proowner','acl.grantor<>p.proowner',"acl.privilege_type<>'EXECUTE'",'acl.is_grantable','pg_catalog.has_function_privilege','OWN_RECEIPT_ACCESS_MIXED_PAIR'])assert.ok(guard.includes(required),required);
  assert.ok(guard.includes(pins.dependency.sha256));assert.ok(guard.includes('check_function_bodies'));assert.ok(guard.includes('pg_event_trigger'));
  assert.equal(guard.includes('replace(p.prosrc'),false,'stored body bytes are checked without CRLF normalization');
 }
 for(const pin of pins.functions){assert.ok(p.preflight.includes("NOT(pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex')='"+pin.pre+"')"));assert.ok(p.durable.includes("NOT(pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex')='"+pin.post+"')"));}
 assert.ok(p.statements[0].includes("IN('"+pins.functions[0].pre+"','"+pins.functions[0].post+"')"));
});

test('apply preserves the whole function identity inside one frame; durable and repeat do not depend on local GUC',()=>{
 const p=build({read}),post=p.statements[3];assert.ok(p.statements[0].includes("current_setting('transaction_read_only')<>'off'"));
 assert.ok(post.includes('OWN_RECEIPT_ACCESS_SAME_TRANSACTION_REQUIRED'));assert.ok(post.includes("previous->>'version' IS DISTINCT FROM"));assert.ok(post.includes("previous->>'pid' IS DISTINCT FROM pg_catalog.pg_backend_pid()::text"));assert.ok(post.includes('pg_catalog.transaction_timestamp()::text'));
 assert.equal((post.match(/pg_catalog\.to_jsonb\(p\)-'prosrc'\) IS DISTINCT FROM previous/g)??[]).length,2);
 assert.ok(p.apply.startsWith('DO $receipt_access_apply$ BEGIN '));assert.equal((p.apply.match(/EXECUTE '/g)??[]).length,4);assert.equal(p.applySha256,hash(p.apply));assert.equal(p.statementsSha256,hash(JSON.stringify(p.statements)));assert.equal(p.callerOwnsTransactionEnd,true);
 for(const standalone of [p.preflight,p.durable,p.repeat])assert.equal(standalone.includes('municontrol_receipt_access.pre'),false);
 assert.equal(p.repeat,p.durable);assert.equal(p.statements.join('\n').match(/\bGRANT\b|\bREVOKE\b|\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE)\b/g),null);
});

test('minted source plans remain frozen and bookend every input; cloning never admits an installation',()=>{
 let drift=false;const p=build({read:file=>drift&&file===pins.source176.path?read(file)+'\n':read(file)});
 assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.functions)&&Object.isFrozen(pins.functions[0].argNames));assert.equal(p.sourceBookend(),true);assert.equal(assertPlan(p),p);
 assert.throws(()=>pins.functions[0].argNames.push('injected'));assert.throws(()=>p.functions.push({passed:true}));assert.throws(()=>assertPlan({...p,passed:true}),/MINTED_REQUIRED/);
 drift=true;assert.throws(()=>assertPlan(p),/SOURCE_BOOKEND/);
 const code=read('scripts/lib/own-receipt-preparer-access-installation.mjs');assert.doesNotMatch(code,/from ['"](?:node:(?:fs|net|tls|child_process|http)|@neondatabase|pg['"])/);assert.doesNotMatch(code,/\.query\s*\(|\b(?:fetch|execFile|createClient)\s*\(/);
});
