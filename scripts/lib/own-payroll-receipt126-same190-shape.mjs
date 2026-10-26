// INERT SOURCE. Catalog audit text only; no filesystem, app imports or executor.
// No expected value is learned from an installed catalog observation.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const VERSION='own-receipt126-same190-shape.v1',TABLE='own_payroll_receipt_event';
const SOURCE_PINS=Object.freeze([
 ['scripts/migrations/126-own-payroll-receipts.sql',28950,'9f3e93154590b79d027d30a1408d07251211a67e87b581e570bdef013c2d33dc'],
 ['scripts/lib/own-payroll-installation.mjs',20421,'6ad8f07733adfb17b6a32a6efd228073bfb3566844b858167581e2d7896bb3d0'],
 ['scripts/lib/native-leave-installation.mjs',18492,'57d7f79c358665dc208dfcb9b0d7b2a2ecebaba84dfb6c6057bb3acef6bb25ef'],
 ['scripts/lib/own-payroll-receipt126-same190-inventory.mjs',7020,'ebd438ac7a791dec61a46223acece55b0b6d2599f901fb18f0a7406b4f2297cc'],
 ['scripts/lib/own-payroll-receipt126-inventory-model.mjs',7906,'3fb1ac17aea553ef37b5b832057482fdd3011c3bae26d9420a28675ece43232c'],
 ['scripts/verify-municipal-owner-adoption-authority.mjs',43441,'6194ab3f20092277c7b30c8a3c1fd7cb2bae3041ce8a3a63df107ea3b628cfeb'],
 ['scripts/lib/municipal-owner-adoption-decision-qa.mjs',49560,'fc572cea16849315b1a7c7d0efc2d90a1ce8ca47f10dd7461245c324ea678c93']
]);
const COLUMNS=Object.freeze([
 ['id','uuid',true,'gen_random_uuid()'],['tenant_id','uuid',true,null],['source_binding_id','uuid',true,null],['batch_id','uuid',true,null],['command','text',true,null],
 ['actor_membership_id','uuid',true,null],['actor_person_id','uuid',true,null],['actor_email','text',true,null],['actor_label','text',true,null],['actor_session_id','uuid',true,null],
 ['actor_session_version','integer',true,null],['release_sha','text',true,null],['request_key','uuid',true,null],['body','jsonb',true,null],['body_sha256','text',true,null],
 ['snapshot','jsonb',false,null],['snapshot_sha256','text',true,null],['recorded_at','timestamp with time zone',true,'clock_timestamp()']
]);
const INDEX_KEYS=[[1],[2,3,6,13],[2,3,4,5]];
const FOREIGN=Object.freeze([
 {keys:[2],table:'platform_tenant',references:['id']},
 {keys:[7],table:'person_identity',references:['id']},
 {keys:[10],table:'tenant_identity_session',references:['id']},
 {keys:[2,3],table:'platform_tenant_source_binding',references:['tenant_id','id']},
 {keys:[6,2],table:'tenant_membership',references:['id','tenant_id']}
]);
const q=value=>"'"+String(value).replaceAll("'","''")+"'",j=value=>q(JSON.stringify(value))+'::jsonb';
const sha=value=>createHash('sha256').update(value).digest('hex');
const ordered=value=>[...value].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b),'en'));
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===[...keys].sort().join('|');
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
function sourceText(readRaw){
 assert.equal(typeof readRaw,'function');const sources={};
 for(const [file,bytes,hash] of SOURCE_PINS){const raw=readRaw(file);assert.ok(Buffer.isBuffer(raw),'RECEIPT126_SHAPE_RAW_BUFFER_REQUIRED');assert.equal(raw.length,bytes,'RECEIPT126_SHAPE_RAW_BYTES:'+file);assert.equal(sha(raw),hash,'RECEIPT126_SHAPE_RAW_SHA:'+file);const text=raw.toString('utf8');assert.equal(Buffer.compare(raw,Buffer.from(text,'utf8')),0,'RECEIPT126_SHAPE_UTF8');sources[file]=text;}
 return{source:sources['scripts/migrations/126-own-payroll-receipts.sql'],authorityNormalizer:sources['scripts/verify-municipal-owner-adoption-authority.mjs'],decisionNormalizer:sources['scripts/lib/municipal-owner-adoption-decision-qa.mjs']};
}
function same190ImmutableConfig(definition,schema,sources){
 // Derive the ONE header/config from canonical126 through the pinned SAME190
 // authority rewrite and its decision-QA delegation; never from pg_proc.
 const authorityRewrite=".replace(/SET search_path\\s*=\\s*(?:pg_catalog,\\s*)?public,\\s*pg_temp/gi,'SET search_path=pg_catalog,'+schema+',public,pg_temp');";
 const decisionRelocate="const relocate=sql=>base.relocate(sql).replace(";
 const decisionNormalize="const normalized=s=>{let value=relocate(s);for(const[a,b]of Object.entries(hashes))value=value.replaceAll(a,b);return value;};";
 for(const [text,anchor] of [[sources.authorityNormalizer,authorityRewrite],[sources.decisionNormalizer,decisionRelocate],[sources.decisionNormalizer,decisionNormalize]]){
  assert.equal(text.split(anchor).length,2,'RECEIPT126_SAME190_CONFIG_SOURCE_GAP');
 }
 const header=definition.slice(0,definition.indexOf(' AS $$'));
 const rewritten=header.replace(/SET search_path\s*=\s*(?:pg_catalog,\s*)?public,\s*pg_temp/gi,'SET search_path=pg_catalog,'+schema+',public,pg_temp');
 assert.notEqual(rewritten,header,'RECEIPT126_SAME190_HEADER_NOT_RELOCATED');
 const setting=/\bSET search_path=([^\n]+)$/.exec(rewritten);assert.ok(setting,'RECEIPT126_SAME190_CONFIG_REQUIRED');
 return 'search_path='+setting[1].split(',').map(value=>value.trim()).join(', ');
}
function sourceChecks(tableSource){
 // Bounded canonical CHECK extraction, preserving SQL strings and nesting.
 const expressions=[];let quote=false;
 for(let at=0;at<tableSource.length;at++){
  if(tableSource[at]==="'"){if(quote&&tableSource[at+1]==="'"){at++;continue;}quote=!quote;continue;}
  if(quote||!tableSource.slice(at).startsWith('CHECK('))continue;
  let n=at+6,depth=1,inString=false,start=n;
  for(;n<tableSource.length;n++){
   const c=tableSource[n];if(c==="'"){if(inString&&tableSource[n+1]==="'"){n++;continue;}inString=!inString;continue;}
   if(inString)continue;if(c==='(')depth++;if(c===')'&&--depth===0)break;
  }
  assert.equal(depth,0,'RECEIPT126_CHECK_SOURCE_UNCLOSED');expressions.push(tableSource.slice(start,n));at=n;
 }
 assert.equal(quote,false);assert.equal(expressions.length,10,'RECEIPT126_CANONICAL_TEN_CHECKS_REQUIRED');return expressions;
}
function tokens(text){
 assert.equal(typeof text,'string');assert.ok(text.length<8192);const out=[];
 for(let at=0;at<text.length;){
  if(/\s/.test(text[at])){at++;continue;}
  if(text[at]==="'"){let value='',closed=false;at++;for(;at<text.length;at++){if(text[at]!=="'"){value+=text[at];continue;}if(text[at+1]==="'"){value+="'";at++;continue;}at++;closed=true;break;}assert.ok(closed,'RECEIPT126_CHECK_STRING');out.push({kind:'string',value});continue;}
  const word=/^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(at));if(word){out.push({kind:'word',value:word[0].toLowerCase()});at+=word[0].length;continue;}
  const number=/^\d+/.exec(text.slice(at));if(number){out.push({kind:'number',value:String(BigInt(number[0]))});at+=number[0].length;continue;}
  const symbol=/^(?:::|<=|>=|<>|!=|[()\[\],=~><.])/.exec(text.slice(at));assert.ok(symbol,'RECEIPT126_CHECK_UNSUPPORTED_TOKEN');out.push({kind:'symbol',value:symbol[0]});at+=symbol[0].length;
 }
 assert.ok(out.length>0&&out.length<512);return out;
}
function checkTree(text){
 // Closed grammar, only these canonical expressions. Not a general SQL parser.
 const input=tokens(text);let at=0;
 const is=value=>input[at]?.value===value,take=value=>{assert.ok(is(value),'RECEIPT126_CHECK_EXPECTED_TOKEN:'+value);return input[at++];};
 function atom(){
  let value;
  if(is('(')){take('(');value=or();take(')');}
  else if(input[at]?.kind==='string')value=['string',input[at++].value];
  else if(input[at]?.kind==='number')value=['number',input[at++].value];
  else if(is('array')){take('array');take('[');const values=[atom()];while(is(',')){take(',');values.push(atom());}take(']');assert.ok(values.every(v=>v[0]==='string'),'RECEIPT126_CHECK_LITERAL_ARRAY');value=['array',values];}
  else{
   assert.equal(input[at]?.kind,'word','RECEIPT126_CHECK_ATOM');let name=input[at++].value,qualified=false;
   if(name==='pg_catalog'&&is('.')){take('.');assert.equal(input[at]?.kind,'word');name=input[at++].value;qualified=true;}
   if(is('(')){assert.ok(['lower','jsonb_typeof','octet_length'].includes(name),'RECEIPT126_CHECK_FUNCTION');take('(');const argument=or();take(')');value=['call',name,argument];}
   else{assert.equal(qualified,false,'RECEIPT126_CHECK_QUALIFIED_COLUMN');assert.ok(COLUMNS.some(c=>c[0]===name),'RECEIPT126_CHECK_COLUMN');value=['column',name];}
  }
  while(is('::')){take('::');take('text');if(is('[')){take('[');take(']');assert.equal(value[0],'array');}else if(value[0]!=='string')value=['cast',value,'text'];}
  return value;
 }
 function compare(){
  const left=atom();
  if(is('is')){take('is');let not=false;if(is('not')){take('not');not=true;}take('null');return['is-null',left,not];}
  if(is('in')){take('in');take('(');const values=[atom()];while(is(',')){take(',');values.push(atom());}take(')');assert.ok(values.every(v=>v[0]==='string'));return['in',left,values];}
  if(['=','~','>','<='].includes(input[at]?.value)){
   const operation=input[at++].value;
   if(operation==='='&&is('any')){take('any');take('(');const array=atom();take(')');assert.equal(array[0],'array');return['in',left,array[1]];}
   return['compare',operation,left,atom()];
  }
  return left;
 }
 function and(){let value=compare();while(is('and')){take('and');value=['and',value,compare()];}return value;}
 function or(){let value=and();while(is('or')){take('or');value=['or',value,and()];}return value;}
 const result=or();assert.equal(at,input.length,'RECEIPT126_CHECK_TRAILING_TOKEN');return result;
}
const treeKeys=tree=>{const values=[];const visit=node=>{if(!Array.isArray(node))return;if(node[0]==='column')values.push(COLUMNS.findIndex(c=>c[0]===node[1])+1);for(const value of node)if(Array.isArray(value))visit(value);};visit(tree);return [...new Set(values)].sort((a,b)=>a-b);};
function fkSql(schema,r){
 const names=alias=>`(SELECT jsonb_agg(a.attname ORDER BY k.n) FROM unnest(${alias}.confkey) WITH ORDINALITY k(num,n) JOIN pg_attribute a ON a.attrelid=${alias}.confrelid AND a.attnum=k.num)`;
 const expected=FOREIGN.map(f=>[f.keys,schema+'.'+f.table,f.references]);
 const actual=`(SELECT coalesce(jsonb_agg(v ORDER BY v::text COLLATE "C"),'[]') FROM(SELECT jsonb_build_array(to_jsonb(c.conkey),ns.nspname||'.'||rc.relname,${names('c')}) v FROM pg_constraint c JOIN pg_class rc ON rc.oid=c.confrelid JOIN pg_namespace ns ON ns.oid=rc.relnamespace WHERE c.conrelid=${r} AND c.contype='f') f)`;
 const wanted=`(SELECT jsonb_agg(v ORDER BY v::text COLLATE "C") FROM jsonb_array_elements(${j(expected)}) v)`;
 return `${actual} IS NOT DISTINCT FROM ${wanted}`;
}
function fkTriggerValid(c,t,r,referencedOnly=false){
 const common=`${t}.tgisinternal AND ${t}.tgenabled='O' AND NOT ${t}.tgdeferrable AND NOT ${t}.tginitdeferred AND ${t}.tgparentid=0 AND ${t}.tgnargs=0 AND octet_length(${t}.tgargs)=0 AND ${t}.tgqual IS NULL AND ${t}.tgattr::text='' AND ${t}.tgoldtable IS NULL AND ${t}.tgnewtable IS NULL AND ${t}.tgconstraint=${c}.oid AND ${t}.tgconstrindid=${c}.conindid AND ${c}.contype='f' AND ${c}.conrelid=${r} AND ${c}.convalidated AND NOT ${c}.condeferrable AND NOT ${c}.condeferred AND ${c}.confmatchtype='s' AND ${c}.confupdtype='a' AND ${c}.confdeltype='a'`;
 const parent=`(${t}.tgrelid=${c}.confrelid AND ${t}.tgconstrrelid=${r} AND ((${t}.tgtype=9 AND ${t}.tgfoid='pg_catalog."RI_FKey_noaction_del"()'::regprocedure) OR (${t}.tgtype=17 AND ${t}.tgfoid='pg_catalog."RI_FKey_noaction_upd"()'::regprocedure)))`;
 const child=`(${t}.tgrelid=${r} AND ${t}.tgconstrrelid=${c}.confrelid AND ((${t}.tgtype=5 AND ${t}.tgfoid='pg_catalog."RI_FKey_check_ins"()'::regprocedure) OR (${t}.tgtype=17 AND ${t}.tgfoid='pg_catalog."RI_FKey_check_upd"()'::regprocedure)))`;
 return common+' AND '+(referencedOnly?parent:'('+parent+' OR '+child+')');
}

export function buildOwnReceipt126Same190Shape({schema,major,sourceCommit,readRaw}){
 assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.ok([17,18].includes(major));assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 const sources=sourceText(readRaw),source=sources.source,start=source.indexOf('CREATE TABLE public.own_payroll_receipt_event(\n'),end=source.indexOf('\n);\nALTER TABLE public.own_payroll_receipt_event',start);assert.ok(start>=0&&end>start,'RECEIPT126_TABLE_SOURCE_REQUIRED');
 const expressions=sourceChecks(source.slice(start,end)),expectedChecks=expressions.map(expression=>{const tree=checkTree(expression);return{sourceExpression:expression,tree,keys:treeKeys(tree)};});assert.equal(new Set(expectedChecks.map(c=>JSON.stringify(c.tree))).size,10);
 const immutable=/CREATE FUNCTION public\.own_receipt_immutable_v1\(\) RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS \$\$([\s\S]*?)\$\$;/.exec(source);assert.ok(immutable,'RECEIPT126_IMMUTABLE_SOURCE_REQUIRED');
 const immutableConfig=same190ImmutableConfig(immutable[0],schema,sources);
 assert.ok(source.includes('CREATE TRIGGER own_receipt_event_immutable BEFORE UPDATE OR DELETE ON public.own_payroll_receipt_event FOR EACH ROW EXECUTE FUNCTION public.own_receipt_immutable_v1();'));
 assert.ok(source.includes('CREATE TRIGGER own_receipt_event_no_truncate BEFORE TRUNCATE ON public.own_payroll_receipt_event FOR EACH STATEMENT EXECUTE FUNCTION public.own_receipt_immutable_v1();'));
 const receipt=q(schema+'.'+TABLE),r=`to_regclass(${receipt})`,metadataKey='municontrol_receipt126.shape_proof',expectedTriggers=[['own_receipt_event_immutable',27],['own_receipt_event_no_truncate',34]];
 const sql=`DO $receipt126_shape$ DECLARE r oid:=${r};fn oid;item record;actual jsonb;proof jsonb;BEGIN
 IF current_setting('server_version_num')::integer/10000<>${major} THEN RAISE EXCEPTION 'RECEIPT126_SHAPE_MAJOR_REQUIRED';END IF;
 IF r IS NULL OR NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.oid=r AND n.nspname=${q(schema)} AND c.relowner=current_user::regrole AND c.relowner=n.nspowner AND c.relkind='r' AND c.relpersistence='p' AND c.relrowsecurity AND NOT c.relforcerowsecurity AND c.reloptions IS NULL AND NOT c.relispartition AND c.relreplident='d') OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid=r OR inhparent=r) OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=r) THEN RAISE EXCEPTION 'RECEIPT126_TABLE_OWNER_RLS_SHAPE';END IF;
 IF (SELECT jsonb_agg(attnum ORDER BY attnum) FROM pg_attribute WHERE attrelid=r AND attnum>0) IS DISTINCT FROM ${j(Array.from({length:18},(_,n)=>n+1))} OR EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=r AND a.attnum>0 AND (a.attisdropped OR a.attidentity<>'' OR a.attgenerated<>'' OR a.attacl IS NOT NULL OR NOT a.attislocal OR a.attinhcount<>0 OR a.attndims<>0 OR a.attcollation<>(SELECT typcollation FROM pg_type WHERE oid=a.atttypid))) OR (SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=r AND a.attnum>0) IS DISTINCT FROM ${j(COLUMNS)} THEN RAISE EXCEPTION 'RECEIPT126_EXACT_18_COLUMNS_DEFAULTS';END IF;
 IF (SELECT jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable) ORDER BY a.grantor,a.grantee,a.privilege_type) FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid=r) IS DISTINCT FROM (SELECT jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable) ORDER BY a.grantor,a.grantee,a.privilege_type) FROM pg_class c CROSS JOIN LATERAL aclexplode(acldefault('r',c.relowner)) a WHERE c.oid=r) OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(acldefault('r',c.relowner)) p WHERE c.oid=r AND has_table_privilege('municontrol_actions_runtime_app',r,p.privilege_type)) THEN RAISE EXCEPTION 'RECEIPT126_OWNER_ONLY_TABLE_ACL';END IF;
 IF (SELECT count(*) FROM pg_constraint WHERE conrelid=r AND contype='c')<>10 OR (SELECT count(*) FROM pg_constraint WHERE conrelid=r AND contype='f')<>5 OR (SELECT count(*) FROM pg_constraint WHERE conrelid=r AND contype='p')<>1 OR (SELECT count(*) FROM pg_constraint WHERE conrelid=r AND contype='u')<>2 OR EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid=r AND (c.contype NOT IN('c','f','p','u','n') OR NOT c.convalidated OR c.condeferrable OR c.condeferred OR NOT c.conislocal OR c.coninhcount<>0 OR c.conparentid<>0 OR coalesce((to_jsonb(c)->>'conenforced')::boolean,true)=false OR c.contype='c' AND (c.connoinherit OR c.conbin IS NULL) OR c.contype='f' AND (c.confupdtype<>'a' OR c.confdeltype<>'a' OR c.confmatchtype<>'s' OR c.confdelsetcols IS NOT NULL))) THEN RAISE EXCEPTION 'RECEIPT126_CONSTRAINT_FLAGS_COUNTS';END IF;
 IF NOT (${fkSql(schema,'r')}) THEN RAISE EXCEPTION 'RECEIPT126_EXACT_FIVE_FK_KEYS_REFERENCES';END IF;
 IF ${major}=17 AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=r AND contype='n') OR ${major}=18 AND ((SELECT count(*) FROM pg_constraint WHERE conrelid=r AND contype='n')<>17 OR (SELECT jsonb_agg(conkey[1] ORDER BY conkey[1]) FROM pg_constraint WHERE conrelid=r AND contype='n') IS DISTINCT FROM (SELECT jsonb_agg(attnum ORDER BY attnum) FROM pg_attribute WHERE attrelid=r AND attnum>0 AND attnotnull) OR EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=r AND contype='n' AND cardinality(conkey)<>1)) THEN RAISE EXCEPTION 'RECEIPT126_MAJOR_NOT_NULL_CONSTRAINTS';END IF;
 IF (SELECT count(*) FROM pg_index WHERE indrelid=r)<>3 OR EXISTS(SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_am am ON am.oid=c.relam WHERE i.indrelid=r AND (NOT i.indisunique OR NOT i.indisvalid OR NOT i.indisready OR NOT i.indislive OR NOT i.indimmediate OR i.indnullsnotdistinct OR i.indexprs IS NOT NULL OR i.indpred IS NOT NULL OR i.indnatts<>i.indnkeyatts OR am.amname<>'btree' OR c.relowner<>(SELECT relowner FROM pg_class WHERE oid=r))) OR EXISTS(SELECT 1 FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid CROSS JOIN LATERAL unnest(i.indkey::smallint[],i.indclass::oid[],i.indcollation::oid[],i.indoption::smallint[]) WITH ORDINALITY k(att,opclass,collation,options,n) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.att JOIN pg_opclass oc ON oc.oid=k.opclass WHERE i.indrelid=r AND (oc.opcnamespace<>'pg_catalog'::regnamespace OR oc.opcmethod<>ic.relam OR NOT oc.opcdefault OR oc.opcintype<>a.atttypid OR k.collation<>a.attcollation OR k.options<>0)) THEN RAISE EXCEPTION 'RECEIPT126_INDEX_FLAGS';END IF;
 IF (SELECT jsonb_agg(v ORDER BY v::text COLLATE "C") FROM(SELECT jsonb_build_array(c.contype,(SELECT jsonb_agg(k ORDER BY n) FROM unnest(c.conkey) WITH ORDINALITY x(k,n))) v FROM pg_constraint c JOIN pg_index i ON i.indexrelid=c.conindid WHERE c.conrelid=r AND c.contype IN('p','u') AND i.indrelid=r AND i.indisprimary=(c.contype='p') AND i.indkey::text=array_to_string(c.conkey,' ')) x) IS DISTINCT FROM (SELECT jsonb_agg(v ORDER BY v::text COLLATE "C") FROM jsonb_array_elements(${j([['p',INDEX_KEYS[0]],['u',INDEX_KEYS[1]],['u',INDEX_KEYS[2]]])}) v) THEN RAISE EXCEPTION 'RECEIPT126_EXACT_PK_TWO_UNIQUES';END IF;
 SELECT p.oid INTO fn FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure(${q(schema+'.own_receipt_immutable_v1()')}) AND p.prorettype='trigger'::regtype AND p.pronargs=0 AND p.pronargdefaults=0 AND p.prosecdef AND NOT p.proisstrict AND NOT p.proretset AND NOT p.proleakproof AND p.provolatile='v' AND p.proparallel='u' AND l.lanname='plpgsql' AND p.prosrc=${q(immutable[1])} AND p.proconfig=ARRAY[${q(immutableConfig)}] AND p.proowner=current_user::regrole AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.privilege_type='EXECUTE' AND (a.grantee=0 OR a.grantee=(SELECT oid FROM pg_roles WHERE rolname='municontrol_actions_runtime_app')));
 IF fn IS NULL OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=r AND NOT tgisinternal)<>2 OR (SELECT jsonb_agg(jsonb_build_array(tgname,tgtype) ORDER BY tgname COLLATE "C") FROM pg_trigger WHERE tgrelid=r AND NOT tgisinternal AND tgfoid=fn AND tgenabled='O' AND tgqual IS NULL AND tgnargs=0 AND octet_length(tgargs)=0 AND tgattr::text='' AND NOT tgdeferrable AND NOT tginitdeferred AND tgconstraint=0 AND tgparentid=0 AND tgoldtable IS NULL AND tgnewtable IS NULL) IS DISTINCT FROM ${j(expectedTriggers)} THEN RAISE EXCEPTION 'RECEIPT126_EXACT_IMMUTABLE_TRIGGERS';END IF;
 FOR item IN SELECT * FROM pg_constraint c WHERE c.conrelid=r AND c.contype='f' LOOP
  IF (SELECT count(*) FROM pg_trigger t WHERE t.tgconstraint=item.oid)<>4 OR (SELECT count(DISTINCT (t.tgrelid,t.tgtype,t.tgfoid)) FROM pg_trigger t WHERE t.tgconstraint=item.oid)<>4 OR (SELECT count(*) FROM pg_trigger t JOIN pg_constraint c ON c.oid=t.tgconstraint WHERE c.oid=item.oid AND ${fkTriggerValid('c','t','r')})<>4 OR (SELECT count(*) FROM pg_trigger t JOIN pg_constraint c ON c.oid=t.tgconstraint WHERE c.oid=item.oid AND ${fkTriggerValid('c','t','r',true)})<>2 THEN RAISE EXCEPTION 'RECEIPT126_EXACT_RI_TRIGGERS';END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_trigger WHERE tgrelid=r AND tgisinternal)<>10 OR (SELECT count(*) FROM pg_trigger t JOIN pg_constraint c ON c.oid=t.tgconstraint WHERE c.conrelid=r AND ${fkTriggerValid('c','t','r',true)})<>10 THEN RAISE EXCEPTION 'RECEIPT126_EXACT_TEN_REFERENCED_TRIGGERS';END IF;
 proof:=jsonb_build_object('version',${q(VERSION)},'sourceCommit',${q(sourceCommit)},'sourceSqlSha256',${q(SOURCE_PINS[0][2])},'schema',${q(schema)},'major',${major},'tableOid',r::bigint,'structuralChecksPassed',true,'checkExpressions',(SELECT jsonb_agg(jsonb_build_object('oid',c.oid::bigint,'expression',pg_get_expr(c.conbin,c.conrelid,false),'keys',to_jsonb(c.conkey)) ORDER BY c.oid) FROM pg_constraint c WHERE c.conrelid=r AND c.contype='c'),'foreignConstraintOids',(SELECT jsonb_agg(c.oid::bigint ORDER BY c.oid) FROM pg_constraint c WHERE c.conrelid=r AND c.contype='f'),'referencedTriggerOids',(SELECT jsonb_agg(t.oid::bigint ORDER BY t.oid) FROM pg_trigger t JOIN pg_constraint c ON c.oid=t.tgconstraint WHERE c.conrelid=r AND ${fkTriggerValid('c','t','r',true)}),'sourceCheckSemanticsVerified',false,'globalPreservationVerified',false,'installationAllowed',false);
 PERFORM set_config(${q(metadataKey)},proof::text,true);
 END $receipt126_shape$;SELECT current_setting(${q(metadataKey)})::jsonb`;
 return freeze({version:VERSION,schema,major,sourceCommit,sourcePins:SOURCE_PINS.map(([path,bytes,sha256])=>({path,bytes,sha256})),expectedColumns:COLUMNS.map(c=>[...c]),expectedForeign:FOREIGN.map(f=>({...f,keys:[...f.keys],references:[...f.references]})),expectedIndexKeys:INDEX_KEYS.map(v=>[...v]),expectedChecks,shapeSql:sql,requiresSeparateCheckSemanticVerification:true,globalPreservationCallerOwned:true,modernReceiptFunctionsUntouched:['own_receipt_params_v1','own_receipt_self_v1','own_receipt_snapshot_v1'],connects:false,executesSql:false,executionAdmission:false,GLOBAL_SQL_STOP:true});
}

export function assertOwnReceipt126Same190ShapeProof(plan,proof){
 assert.equal(plan.version,VERSION);assert.ok(exact(proof,['version','sourceCommit','sourceSqlSha256','schema','major','tableOid','structuralChecksPassed','checkExpressions','foreignConstraintOids','referencedTriggerOids','sourceCheckSemanticsVerified','globalPreservationVerified','installationAllowed']));
 for(const field of ['version','sourceCommit','schema','major'])assert.equal(proof[field],plan[field]);assert.equal(proof.sourceSqlSha256,SOURCE_PINS[0][2]);assert.equal(proof.structuralChecksPassed,true);assert.equal(proof.sourceCheckSemanticsVerified,false);assert.equal(proof.globalPreservationVerified,false);assert.equal(proof.installationAllowed,false);
 assert.ok(Number.isSafeInteger(proof.tableOid)&&proof.tableOid>0);assert.ok(Array.isArray(proof.checkExpressions)&&proof.checkExpressions.length===10);
 const observed=proof.checkExpressions.map(row=>{assert.ok(exact(row,['oid','expression','keys']));assert.ok(Number.isSafeInteger(row.oid)&&row.oid>0);const tree=checkTree(row.expression),keys=treeKeys(tree);assert.deepEqual([...row.keys].sort((a,b)=>a-b),keys);return{tree,keys};});
 assert.equal(new Set(proof.checkExpressions.map(c=>c.oid)).size,10);assert.deepEqual(ordered(observed),ordered(plan.expectedChecks.map(({tree,keys})=>({tree,keys}))),'RECEIPT126_CHECK_SEMANTICS_CHANGED');
 for(const [key,count] of [['foreignConstraintOids',5],['referencedTriggerOids',10]]){assert.ok(Array.isArray(proof[key])&&proof[key].length===count);assert.ok(proof[key].every(v=>Number.isSafeInteger(v)&&v>0));assert.equal(new Set(proof[key]).size,count);}
 return{version:VERSION,sourceCheckSemanticsVerified:true,checkedSemantics:10,structuralChecksPassed:true,tableOid:proof.tableOid,foreignConstraintOids:[...proof.foreignConstraintOids],referencedTriggerOids:[...proof.referencedTriggerOids],installationAllowed:false,globalPreservationVerified:false};
}

export function receipt126ExactForeignTriggerExclusion(plan,proof){
 const checked=assertOwnReceipt126Same190ShapeProof(plan,proof),r=`to_regclass(${q(plan.schema+'.'+TABLE)})`,constraints=checked.foreignConstraintOids.join(','),triggers=checked.referencedTriggerOids.join(',');
 // Caller alias is literally t. Only these ten referenced-side NEW RI triggers,
 // linked to the five source-validated FKs; all other trigger rows remain visible.
 const predicate=`(${r}=${checked.tableOid}::oid AND t.oid IN(${triggers}) AND EXISTS(SELECT 1 FROM pg_constraint c WHERE c.oid IN(${constraints}) AND c.oid=t.tgconstraint AND ${fkSql(plan.schema,r)} AND ${fkTriggerValid('c','t',r,true)}))`;
 return{version:'own-receipt126-exact-referenced-fk-trigger-exclusion.v1',triggerAlias:'t',predicate,foreignConstraintOids:[...checked.foreignConstraintOids],referencedTriggerOids:[...checked.referencedTriggerOids],exactForeignConstraints:5,maximumExcludedTriggers:10,newTableInternalTriggersExcludedByThisPredicate:0,globalSnapshotExternal:true,requiresSameSourceGuardedCatalogEpoch:true,admission:false,GLOBAL_SQL_STOP:true};
}
