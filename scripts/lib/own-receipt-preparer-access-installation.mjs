// Source forward adopted from Claude R1, with exact metadata/ACL and pair guards.
// Forward-only update of TWO private SQL126 bodies so a receipt preparer does not
// need payroll.calculation.approve. Pure composer: no connection, no execution.
// Root runs the statements inside its own atomic protocol (rehearsal + literal
// ROLLBACK observer, then installation + durable observation) as the owner role.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const OWN_RECEIPT_PREPARER_ACCESS_VERSION='own-receipt-preparer-access.v1';
const sha=value=>createHash('sha256').update(value,'utf8').digest('hex');
const RUNTIME='municontrol_actions_runtime_app';
const CONFIG=['search_path=pg_catalog, public, pg_temp'];
const minted=new WeakMap();
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}

export const OWN_RECEIPT_PREPARER_ACCESS_PINS=freeze({
 source126:Object.freeze({path:'scripts/migrations/126-own-payroll-receipts.sql',bytes:28950,sha256:'9f3e93154590b79d027d30a1408d07251211a67e87b581e570bdef013c2d33dc'}),
 source176:{path:'scripts/migrations/176-own-payroll-administrative-operator.sql',bytes:5003,sha256:'f75fa2cddf6fe2e837044e73c6465eecdf41fbad7ec740745527e1bd54b94732'},
 // Expected prosrc bytes are derived from the pinned historical definitions.
 functions:Object.freeze([
  Object.freeze({name:'own_receipt_context_v1',signature:'public.own_receipt_context_v1(jsonb,text)',argNames:['p','operation'],defaults:"'read'::text",sourceLine:28,
   header:"CREATE FUNCTION public.own_receipt_context_v1(p jsonb,operation text DEFAULT 'read') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS ",
   pre:'983d4ec843dae1caea2c561b268fb305ae94612a9a9100a5769b237aee0b345c',post:'b02546f2c6fb785de3bf3f742735e4b2f5bf1136b18ad0c42b4203d7816ff22f'}),
  Object.freeze({name:'own_receipt_batch_value_v1',signature:'public.own_receipt_batch_value_v1(jsonb,public.own_payroll_receipt_event)',argNames:['ctx','e'],defaults:null,sourceLine:89,
   header:'CREATE FUNCTION public.own_receipt_batch_value_v1(ctx jsonb,e public.own_payroll_receipt_event) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS ',
   pre:'f7fb515a8a6f3622059bf88ca8305a808279af1eddde0a5d96f744ab81d968dc',post:'ce3456323aeb99e5532ab04c7e7ca1aa39d15224b85a739c5c88b0ace7d51fe2'})
 ]),
 // Behavioural dependency: the nominal context already used by own_close_context_v1 (176 body, pinned elsewhere too).
 dependency:Object.freeze({name:'own_run_context_v1',signature:'public.own_run_context_v1(jsonb,boolean,boolean)',argNames:['p','nominal','write_access'],defaults:'false, false',
  header:'CREATE OR REPLACE FUNCTION public.own_run_context_v1(p jsonb,nominal boolean DEFAULT false,write_access boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS ',
  sha256:'7902263d0b7208fc259abf58bbc7a225b301956abe04db73b57d6c2c42ff3e30'}),
 selfBranchSha256:'26831cbc30794a2d6a46584e1580117c26668867ee6984688c08476244960e7b'
});

// Exact single replacements. Everything else in both bodies stays byte-identical.
export const OWN_RECEIPT_PREPARER_ACCESS_EDITS=freeze({
 own_receipt_context_v1:Object.freeze({
  old:"  ctx:=public.own_close_context_v1(p,true,false);\n  IF operation<>'read' AND NOT public.action_center_context_has_capability(ctx,CASE WHEN operation='prepare' THEN 'payroll.receipt.prepare' ELSE 'payroll.receipt.approve' END) THEN RAISE EXCEPTION 'OWN_RECEIPT_FORBIDDEN';END IF;\n",
  new:"  ctx:=public.own_run_context_v1(p,true,false);\n  IF (CASE operation WHEN 'read' THEN NOT(public.action_center_context_has_capability(ctx,'payroll.receipt.prepare') OR public.action_center_context_has_capability(ctx,'payroll.calculation.approve')) WHEN 'prepare' THEN NOT public.action_center_context_has_capability(ctx,'payroll.receipt.prepare') ELSE NOT(public.action_center_context_has_capability(ctx,'payroll.calculation.approve') AND public.action_center_context_has_capability(ctx,'payroll.receipt.approve')) END) THEN RAISE EXCEPTION 'OWN_RECEIPT_FORBIDDEN';END IF;\n"
 }),
 own_receipt_batch_value_v1:Object.freeze({
  old:"'canApprove',state_value='prepared' AND current_value AND independent AND public.action_center_context_has_capability(ctx,'payroll.receipt.approve'),'canWithdraw',state_value<>'withdrawn' AND public.action_center_context_has_capability(ctx,'payroll.receipt.approve')",
  new:"'canApprove',state_value='prepared' AND current_value AND independent AND public.action_center_context_has_capability(ctx,'payroll.calculation.approve') AND public.action_center_context_has_capability(ctx,'payroll.receipt.approve'),'canWithdraw',state_value<>'withdrawn' AND public.action_center_context_has_capability(ctx,'payroll.calculation.approve') AND public.action_center_context_has_capability(ctx,'payroll.receipt.approve')"
 })
});

const count=(text,part)=>text.split(part).length-1;
function extract(source,name,replace=false){
 const marker='CREATE '+(replace?'OR REPLACE ':'')+'FUNCTION public.'+name+'(';assert.equal(count(source,marker),1,'RECEIPT_ACCESS_SOURCE_DEFINITION:'+name);
 const start=source.indexOf(marker),open=source.indexOf('$$',start),close=source.indexOf('$$;',open+2);assert.ok(open>start&&close>open,'RECEIPT_ACCESS_SOURCE_DOLLAR:'+name);
 return Object.freeze({header:source.slice(start,open),body:source.slice(open+2,close)});
}
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
const shaSql=column=>`pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(${column},'UTF8')),'hex')`;

// Closed SQL126/176 metadata, including the exact owner-only effective ACL.
// Capturing an arbitrary existing ACL is insufficient: PUBLIC/other grantees,
// an empty ACL, grant options and foreign grantors all fail before mutation.
function checks(pin,bodyTest){return `
  IF p.oid IS NULL OR p.pronamespace<>'public'::regnamespace OR p.proowner<>current_user::regrole OR p.prokind<>'f'
   OR (SELECT l.lanname FROM pg_catalog.pg_language l WHERE l.oid=p.prolang)<>'plpgsql' OR NOT p.prosecdef OR p.proisstrict OR p.proretset OR p.provolatile<>'v' OR p.prorettype<>'jsonb'::regtype
   OR p.proparallel<>'u' OR p.proleakproof OR p.prosupport<>0 OR p.procost<>100 OR p.prorows<>0 OR p.provariadic<>0 OR p.probin IS NOT NULL OR p.prosqlbody IS NOT NULL
   OR p.proargmodes IS NOT NULL OR p.proallargtypes IS NOT NULL OR p.pronargs<>${pin.argNames.length} OR p.pronargdefaults<>${pin.defaults===null?0:pin.argNames.length===3?2:1}
   OR p.proargnames IS DISTINCT FROM ARRAY[${pin.argNames.map(literal).join(',')}]::text[] OR pg_catalog.pg_get_expr(p.proargdefaults,0) IS DISTINCT FROM ${pin.defaults===null?'NULL::text':literal(pin.defaults)}
   OR p.proconfig IS DISTINCT FROM ARRAY[${CONFIG.map(literal).join(',')}]::text[]
   OR (SELECT count(*) FROM pg_catalog.pg_proc overload WHERE overload.pronamespace='public'::regnamespace AND overload.proname=${literal(pin.name)})<>1
   OR (SELECT count(*) FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))))<>1
   OR EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl WHERE acl.grantee<>p.proowner OR acl.grantor<>p.proowner OR acl.privilege_type<>'EXECUTE' OR acl.is_grantable)
   OR pg_catalog.has_function_privilege(${literal(RUNTIME)},p.oid,'EXECUTE') OR NOT(${bodyTest})
  THEN RAISE EXCEPTION 'OWN_RECEIPT_ACCESS_METADATA_OR_BODY_CHANGED:${pin.name}';END IF;`;}

function guard(pins,mode,{capture=false,preserve=false}={}){
 assert.ok(['pre','post','either'].includes(mode));
 const dependency=pins.dependency,dep=checks(dependency,shaSql('p.prosrc')+'='+literal(dependency.sha256));
 const bodies=pins.functions.map(pin=>{
  const actual=shaSql('p.prosrc'),test=mode==='either'?actual+' IN('+literal(pin.pre)+','+literal(pin.post)+')':actual+'='+literal(pin[mode]);
  return ` SELECT * INTO p FROM pg_catalog.pg_proc WHERE oid=pg_catalog.to_regprocedure(${literal(pin.signature)});${checks(pin,test)}
  next_epoch:=CASE WHEN ${actual}=${literal(pin.pre)} THEN 'pre' ELSE 'post' END;
  IF epoch IS NOT NULL AND epoch<>next_epoch THEN RAISE EXCEPTION 'OWN_RECEIPT_ACCESS_MIXED_PAIR';END IF;epoch:=next_epoch;
  ${capture?`captured:=captured||pg_catalog.jsonb_build_object(${literal(pin.name)},pg_catalog.to_jsonb(p)-'prosrc');`:''}
  ${preserve?`IF (pg_catalog.to_jsonb(p)-'prosrc') IS DISTINCT FROM previous#>ARRAY['functions',${literal(pin.name)}] THEN RAISE EXCEPTION 'OWN_RECEIPT_ACCESS_IDENTITY_METADATA_CHANGED:${pin.name}';END IF;`:''}`;
 }).join('\n');
 return `DO $receipt_access_${capture?'pre':preserve?'post':mode}$
DECLARE p pg_catalog.pg_proc;epoch text;next_epoch text;captured jsonb:='{}'::jsonb;previous jsonb;
BEGIN
 IF pg_catalog.current_setting('check_function_bodies')<>'on' THEN RAISE EXCEPTION 'OWN_RECEIPT_ACCESS_CHECK_FUNCTION_BODIES_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_event_trigger WHERE evtenabled<>'D') THEN RAISE EXCEPTION 'OWN_RECEIPT_ACCESS_EVENT_TRIGGER_PRESENT';END IF;
 ${capture?`IF pg_catalog.current_setting('transaction_read_only')<>'off' THEN RAISE EXCEPTION 'OWN_RECEIPT_ACCESS_WRITE_TRANSACTION_REQUIRED';END IF;`:''}
 ${preserve?`previous:=nullif(pg_catalog.current_setting('municontrol_receipt_access.pre',true),'')::jsonb;
 IF previous IS NULL OR previous->>'version' IS DISTINCT FROM ${literal(OWN_RECEIPT_PREPARER_ACCESS_VERSION)} OR previous->>'pid' IS DISTINCT FROM pg_catalog.pg_backend_pid()::text OR previous->>'transaction' IS DISTINCT FROM pg_catalog.transaction_timestamp()::text THEN RAISE EXCEPTION 'OWN_RECEIPT_ACCESS_SAME_TRANSACTION_REQUIRED';END IF;`:''}
 SELECT * INTO p FROM pg_catalog.pg_proc WHERE oid=pg_catalog.to_regprocedure(${literal(dependency.signature)});${dep}
 ${bodies}
 ${capture?`PERFORM pg_catalog.set_config('municontrol_receipt_access.pre',pg_catalog.jsonb_build_object('version',${literal(OWN_RECEIPT_PREPARER_ACCESS_VERSION)},'pid',pg_catalog.pg_backend_pid(),'transaction',pg_catalog.transaction_timestamp()::text,'functions',captured)::text,true);`:''}
END $receipt_access_${capture?'pre':preserve?'post':mode}$`;
}

/** read(path) -> string (UTF-8, LF). Returns the closed statement list and its custody hash. */
export function buildOwnReceiptPreparerAccessInstallation(options){
 assert.ok(options&&typeof options==='object'&&!Array.isArray(options));assert.deepEqual(Reflect.ownKeys(options),['read'],'RECEIPT_ACCESS_OPTIONS_EXACT');const {read}=options;
 assert.equal(typeof read,'function','RECEIPT_ACCESS_READ_REQUIRED');
 const pins=OWN_RECEIPT_PREPARER_ACCESS_PINS,sources={};
 for(const pin of [pins.source126,pins.source176]){const value=read(pin.path);assert.equal(typeof value,'string');assert.equal(value.includes('\r'),false,'RECEIPT_ACCESS_LF_REQUIRED');assert.equal(Buffer.byteLength(value,'utf8'),pin.bytes,'RECEIPT_ACCESS_SOURCE_BYTES');assert.equal(sha(value),pin.sha256,'RECEIPT_ACCESS_SOURCE_SHA256');sources[pin.path]=value;}
 const source=sources[pins.source126.path],dependency=extract(sources[pins.source176.path],pins.dependency.name,true);assert.equal(dependency.header,pins.dependency.header,'RECEIPT_ACCESS_DEPENDENCY_HEADER');assert.equal(sha(dependency.body),pins.dependency.sha256,'RECEIPT_ACCESS_DEPENDENCY_BODY');
 const definitions=pins.functions.map(pin=>{
  const {header,body}=extract(source,pin.name),edit=OWN_RECEIPT_PREPARER_ACCESS_EDITS[pin.name];
  assert.equal(header,pin.header,'RECEIPT_ACCESS_HEADER:'+pin.name);assert.equal(sha(body),pin.pre,'RECEIPT_ACCESS_PREIMAGE:'+pin.name);
  assert.equal(count(body,edit.old),1,'RECEIPT_ACCESS_SINGLE_EDIT:'+pin.name);assert.equal(body.includes('$$'),false);
  const next=body.replace(edit.old,()=>edit.new);assert.equal(sha(next),pin.post,'RECEIPT_ACCESS_POSTIMAGE:'+pin.name);assert.equal(next.includes('$$'),false);
  assert.equal(count(next,edit.new),1);assert.equal(next.replace(edit.new,()=>edit.old),body,'RECEIPT_ACCESS_WHOLE_INVERSE:'+pin.name);
  if(pin.name==='own_receipt_context_v1'){
   const branch=text=>text.slice(text.indexOf(" IF operation='self' THEN"),text.indexOf(' ELSE\n'));
   assert.equal(sha(branch(body)),pins.selfBranchSha256);assert.equal(branch(next),branch(body),'RECEIPT_ACCESS_SELF_BRANCH_CHANGED');
   assert.equal(next.includes('own_close_context_v1'),false);assert.equal(count(next,'public.own_run_context_v1(p,true,false)'),1);
  }
  return Object.freeze({...pin,definition:'CREATE OR REPLACE FUNCTION '+header.slice('CREATE FUNCTION '.length)+'$$'+next+'$$'});
 });
 const pre=guard(pins,'either',{capture:true}),post=guard(pins,'post',{preserve:true});
 const statements=Object.freeze([pre,...definitions.map(d=>d.definition),post]);
 for(const s of statements)assert.equal(/\b(?:GRANT|REVOKE|ALTER|DROP|TRUNCATE|INSERT|UPDATE|DELETE|CREATE\s+(?:TABLE|ROLE|TRIGGER|INDEX|VIEW|SCHEMA|EXTENSION))\b/i.test(s.replace(/'(?:[^']|'')*'/g,"''")),false,'RECEIPT_ACCESS_CLOSED_SURFACE');
 const apply='DO $receipt_access_apply$ BEGIN '+statements.map(sql=>'EXECUTE '+literal(sql)+';').join('\n')+' END $receipt_access_apply$';
 const sourceBookend=()=>{for(const[file,before]of Object.entries(sources)){const after=read(file);assert.equal(typeof after,'string');assert.equal(after,before,'RECEIPT_ACCESS_SOURCE_BOOKEND:'+file);}return true;};
 const value=freeze({version:OWN_RECEIPT_PREPARER_ACCESS_VERSION,statements,statementsSha256:sha(JSON.stringify(statements)),apply,applySha256:sha(apply),preflight:guard(pins,'pre'),durable:guard(pins,'post'),repeat:guard(pins,'post'),sourceHashes:Object.fromEntries([pins.source126,pins.source176].map(pin=>[pin.path,pin.sha256])),sourceBookend,
  functions:definitions.map(d=>Object.freeze({name:d.name,signature:d.signature,pre:d.pre,post:d.post})),dependency:pins.dependency,
  sourceOnly:true,wholeInverseVerified:true,selfByteIdentical:true,callerOwnsTransactionEnd:true,executionAdmitted:false,executes:false,connects:false,grants:0,newFunctions:0,newTables:0,iamAssociations:0,historicalSourcesEdited:0});
 minted.set(value,sourceBookend);sourceBookend();return value;
}

export function assertOwnReceiptPreparerAccessInstallation(plan){const bookend=minted.get(plan);assert.equal(typeof bookend,'function','RECEIPT_ACCESS_MINTED_REQUIRED');bookend();return plan;}
