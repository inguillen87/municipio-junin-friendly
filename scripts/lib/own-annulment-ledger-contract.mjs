// G1, source only: the complete column/default contract of the five ledgers
// read by 208/209. No connection, catalogue input, row read or SQL execution.
// The census-ledger helper exports only its monolithic, pre-201 close guard;
// reusing it would assert obsolete capacity CHECKs. This module keeps G1 scoped
// to columns/defaults/table security. The existing 209 trigger guard and the
// existing capacity201/215 constraint guards MUST still run alongside it.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';

export const OWN_ANNULMENT_LEDGER_CONTRACT_VERSION='own-annulment-ledger-column-contract.v1';
const RUN='scripts/migrations/123-own-payroll-runs.sql';
const LIQ='scripts/migrations/124-own-payroll-liquidation-decisions.sql';
const CLOSE='scripts/migrations/125-own-payroll-close.sql';
const ANNUL='scripts/migrations/146-own-consolidated-annulment.sql';
const CAPACITY='scripts/migrations/201-own-full-payroll-decision-capacity.sql';
const SETTINGS='scripts/prepare-own-payroll-installation.mjs';
const SPLITTER='scripts/lib/sql-statements.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
export const OWN_ANNULMENT_LEDGER_SOURCE_PINS=freeze({
 [RUN]:{bytes:29960,sha256:'a9fe1129e921bb7c01985b8caadb009f6086aef9866e2298398175f7f25b4b6b'},
 [LIQ]:{bytes:21146,sha256:'03035e3f7e126b1561222f1a894bcf1000dd586b6d05fb579cb4722d9aa41f4a'},
 [CLOSE]:{bytes:27089,sha256:'443127dd55b9be5f37da47af303fcdd599b4d5dc0aad0a319a18253f8f139af5'},
 [ANNUL]:{bytes:14566,sha256:'8337df26dc3c22fe8c156e19d7511db6c537f08b219633f6add981c774a48fe6'},
 [CAPACITY]:{bytes:83125,sha256:'46de1308360a076eff1453f57a9e4f4d6c14ba176d73cf8531b7b0821ed35b1b'},
 [SETTINGS]:{bytes:4048,sha256:'8984ec722bf2928ec2e177e6e3bf4f21b4a95f182452bdaa5e29a6f1ea8854e7'},
 [SPLITTER]:{bytes:3124,sha256:'d81477c5aed918e944aefe16d05015080acc4fe543059cbf15e2c69e9f5201c2'}
});
const TABLE_SOURCES=freeze([
 ['own_payroll_run_capture',RUN],['own_payroll_run_result',RUN],
 ['own_payroll_liquidation_event',LIQ],['own_payroll_close_event',CLOSE],['own_payroll_annul_event',ANNUL]
]);
export const OWN_ANNULMENT_LEDGER_TABLE_NAMES=Object.freeze(TABLE_SOURCES.map(([name])=>name));
const TYPES=freeze({uuid:{catalog:'uuid',display:'uuid'},text:{catalog:'text',display:'text'},integer:{catalog:'int4',display:'integer'},jsonb:{catalog:'jsonb',display:'jsonb'},timestamptz:{catalog:'timestamptz',display:'timestamp with time zone'}});

function exactOptions(options){
 assert.ok(options&&typeof options==='object'&&!Array.isArray(options),'ANNUL_LEDGER_OPTIONS');
 assert.deepEqual(Reflect.ownKeys(options).sort(),['readRaw','sourceCommit'],'ANNUL_LEDGER_SOURCE_INPUTS_ONLY');
 assert.equal(typeof options.readRaw,'function','ANNUL_LEDGER_RAW_READER');
 assert.match(options.sourceCommit??'',/^[a-f0-9]{40}$/,'ANNUL_LEDGER_COMMIT');
}
function sources(readRaw){
 const texts={},sourceHashes={};
 for(const[file,pin]of Object.entries(OWN_ANNULMENT_LEDGER_SOURCE_PINS)){
  const raw=readRaw(file);assert.ok(Buffer.isBuffer(raw),'ANNUL_LEDGER_RAW_BUFFER:'+file);
  assert.equal(raw.length,pin.bytes,'ANNUL_LEDGER_SOURCE_BYTES:'+file);assert.equal(sha(raw),pin.sha256,'ANNUL_LEDGER_SOURCE_SHA:'+file);
  const text=raw.toString('utf8');assert.deepEqual(Buffer.from(text,'utf8'),raw,'ANNUL_LEDGER_UTF8:'+file);assert.ok(!text.includes('\r'),'ANNUL_LEDGER_LF:'+file);
  texts[file]=text;sourceHashes[file]=pin.sha256;
 }
 return{texts,sourceHashes};
}
function exactSpan(source,text,file,kind,start){
 assert.ok(Number.isSafeInteger(start)&&start>=0&&source.slice(start,start+text.length)===text,'ANNUL_LEDGER_EXACT_SOURCE_SPAN:'+kind);
 const prefix=source.slice(0,start),suffix=source.slice(start+text.length);
 assert.equal(prefix+text+suffix,source,'ANNUL_LEDGER_EXTRACTION_INVERSE:'+kind);
 return{file,kind,startByte:Buffer.byteLength(prefix),bytes:Buffer.byteLength(text),sha256:sha(text),text};
}
function uniqueSpan(source,text,file,kind){
 const start=source.indexOf(text);assert.ok(start>=0&&source.indexOf(text,start+text.length)<0,'ANNUL_LEDGER_UNIQUE_SOURCE_SPAN:'+kind);
 return exactSpan(source,text,file,kind,start);
}
function tableParts(body){
 const parts=[];let depth=0,inString=false,start=0;
 for(let at=0;at<body.length;at++){
  const char=body[at];
  if(char==="'"){if(inString&&body[at+1]==="'"){at++;continue;}inString=!inString;continue;}
  if(inString)continue;
  if(char==='(')depth++;else if(char===')'){depth--;assert.ok(depth>=0,'ANNUL_LEDGER_DDL_NESTING');}
  else if(char===','&&depth===0){parts.push(body.slice(start,at));start=at+1;}
 }
 assert.ok(!inString&&depth===0,'ANNUL_LEDGER_DDL_UNCLOSED');parts.push(body.slice(start));
 assert.equal(parts.join(','),body,'ANNUL_LEDGER_COLUMN_SPLIT_INVERSE');return parts;
}
function sourceTable(source,file,name){
 const pattern=new RegExp('^CREATE TABLE public\\.'+name+'\\(([\\s\\S]*?)\\n\\);$','gm'),matches=[...source.matchAll(pattern)];
 assert.equal(matches.length,1,'ANNUL_LEDGER_CREATE_TABLE:'+name);
 const match=matches[0],parts=tableParts(match[1]),columns=[],bodyStart=match.index+match[0].indexOf('(')+1;let partStart=bodyStart;
 for(const part of parts){
  const declaration=part.trim(),declarationStart=partStart+part.indexOf(declaration);partStart+=part.length+1;
  if(/^(?:UNIQUE\(|FOREIGN KEY\()/.test(declaration))continue;
  const column=/^([a-z_][a-z0-9_]*) (uuid|text|integer|jsonb|timestamptz)(?=\s|$)([\s\S]*)$/.exec(declaration);
  assert.ok(column,'ANNUL_LEDGER_COLUMN_GRAMMAR:'+name);const[,columnName,sourceType,tail]=column;
  assert.ok(!/\b(?:COLLATE|IDENTITY|GENERATED)\b/.test(tail),'ANNUL_LEDGER_COLUMN_EXTENSION:'+name+'.'+columnName);
  const defaults=[...tail.matchAll(/\bDEFAULT ([a-z_]+\(\))/g)];assert.ok(defaults.length<=1,'ANNUL_LEDGER_DEFAULT_ARITY');
  assert.equal(tail.includes('DEFAULT'),defaults.length===1,'ANNUL_LEDGER_DEFAULT_GRAMMAR');
  const expression=defaults[0]?.[1]??null;
  assert.ok(expression===null||['gen_random_uuid()','clock_timestamp()'].includes(expression),'ANNUL_LEDGER_DEFAULT_FUNCTION');
  const qualified=expression===null?null:'pg_catalog.'+expression;
  if(qualified!==null)assert.equal(qualified.slice('pg_catalog.'.length),expression,'ANNUL_LEDGER_DEFAULT_QUALIFICATION_INVERSE');
  const kind=expression===null?'none':'builtin-function';
  columns.push({position:columns.length+1,name:columnName,sourceType,type:'pg_catalog.'+TYPES[sourceType].catalog,displayType:TYPES[sourceType].display,typmod:-1,
   notNull:/\bNOT NULL\b|\bPRIMARY KEY\b/.test(tail),identity:'',generated:'',collation:'declared-type-default',
   default:{kind,sourceExpression:expression,expression,qualifiedFunction:qualified,dependencyRequired:false},
   source:exactSpan(source,declaration,file,'column:'+name+'.'+columnName,declarationStart)});
 }
 assert.equal(new Set(columns.map(c=>c.name)).size,columns.length,'ANNUL_LEDGER_DUPLICATE_COLUMN');
 const rls='ALTER TABLE public.'+name+' ENABLE ROW LEVEL SECURITY;';assert.equal(source.split(rls).length,2,'ANNUL_LEDGER_RLS_SOURCE');
 const revokes=[...source.matchAll(/^REVOKE ALL ON ([a-z0-9_.,]+) FROM PUBLIC,municontrol_actions_runtime_app;$/gm)].filter(m=>m[1].split(',').includes('public.'+name));
 assert.equal(revokes.length,1,'ANNUL_LEDGER_OWNER_ONLY_SOURCE');
 return{name,relation:'public.'+name,sourceFile:file,columns,
  security:{owner:'current_user',kind:'r',persistence:'p',rowSecurity:true,forceRowSecurity:false,policies:0,inheritance:false,partition:false,options:null,replicaIdentity:'d',tableAcl:'owner-only',columnAcl:null},
  sources:[uniqueSpan(source,match[0],file,'create:'+name),uniqueSpan(source,rls,file,'rls:'+name),uniqueSpan(source,revokes[0][0],file,'revoke:'+name)]};
}
function capacityChanges(source){
 const statements=splitPostgresStatements(source).map(s=>s.replace(/^(?:\s*--[^\n]*\n)+/,'').trim()).filter(s=>/^ALTER TABLE public\.own_payroll_/.test(s));
 assert.equal(statements.length,6,'ANNUL_LEDGER_FINITE_201_ALTERS');
 const allowed=new Map([
  ['own_payroll_close_event_snapshot_check',['own_payroll_close_event','snapshot',33546240]],
  ['own_payroll_close_event_receipt_check',['own_payroll_close_event','receipt',33554432]],
  ['own_payroll_annul_event_receipt_check',['own_payroll_annul_event','receipt',33554432]]
 ]),changes=[];
 for(let i=0;i<statements.length;i+=2){
  const drop=/^ALTER TABLE public\.([a-z_]+) DROP CONSTRAINT ([a-z_]+)$/.exec(statements[i]);assert.ok(drop,'ANNUL_LEDGER_201_DROP');
  const shape=allowed.get(drop[2]);assert.ok(shape&&shape[0]===drop[1],'ANNUL_LEDGER_201_CONSTRAINT');
  const[table,column,limit]=shape,add=`ALTER TABLE public.${table} ADD CONSTRAINT ${drop[2]} CHECK(jsonb_typeof(${column})='object' AND octet_length(${column}::text)<=${limit})`;
  assert.equal(statements[i+1],add,'ANNUL_LEDGER_201_ONLY_CHECK_CAPACITY');
  changes.push({table,column,constraint:drop[2],limit,changesColumns:false,sources:[uniqueSpan(source,statements[i]+';',CAPACITY,'drop:'+drop[2]),uniqueSpan(source,add+';',CAPACITY,'add:'+drop[2])]});
  allowed.delete(drop[2]);
 }
 assert.equal(allowed.size,0,'ANNUL_LEDGER_ALL_201_CAPS');return changes;
}
function catalogGuard(tables){
 const expected=tables.map(table=>({name:table.name,columns:table.columns.map(({source,sourceType,displayType,default:defaultValue,...column})=>({...column,default:defaultValue.expression,defaultFunction:defaultValue.qualifiedFunction}))}));
 // With pg_catalog first, pg_get_expr renders the builtin as gen_random_uuid()
 // and the pgcrypto wrapper as public.gen_random_uuid(). Do not normalize the
 // latter. The FuncExpr root also binds the exact builtin OID, resolved by name
 // in pg_catalog; pg_depend may legitimately contain NO builtin dependency.
 // No built-in OID, extension identity or observed adbin bytes are hardcoded.
 return `DO $annul_ledger_columns$ DECLARE t jsonb;x jsonb;r oid;a pg_catalog.pg_attribute;d pg_catalog.pg_attrdef;expected_function oid;BEGIN
 IF pg_catalog.current_setting('search_path')<>'pg_catalog, public, pg_temp' OR pg_catalog.current_setting('standard_conforming_strings')<>'on' OR pg_catalog.current_setting('server_version_num')::integer/10000 NOT IN(17,18) THEN RAISE EXCEPTION 'ANNUL_LEDGER_CATALOG_CONTEXT';END IF;
 FOR t IN SELECT value FROM pg_catalog.jsonb_array_elements(${q(JSON.stringify(expected))}::jsonb) LOOP
 r:=pg_catalog.to_regclass('public.'||(t->>'name'));
 IF r IS NULL OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c WHERE c.oid=r AND c.relowner=current_user::regrole AND c.relkind='r' AND c.relpersistence='p' AND c.relrowsecurity AND NOT c.relforcerowsecurity AND NOT c.relispartition AND c.reloptions IS NULL AND c.relreplident='d')
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) acl WHERE c.oid=r AND acl.grantee<>c.relowner)
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid=r) OR EXISTS(SELECT 1 FROM pg_catalog.pg_inherits WHERE inhrelid=r OR inhparent=r)
 THEN RAISE EXCEPTION 'ANNUL_LEDGER_TABLE_SECURITY' USING DETAIL=t->>'name';END IF;
 IF(SELECT count(*) FROM pg_catalog.pg_attribute WHERE attrelid=r AND attnum>0)<>pg_catalog.jsonb_array_length(t->'columns')
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid=r AND attnum>0 AND(attisdropped OR attidentity<>'' OR attgenerated<>'' OR attacl IS NOT NULL))
 THEN RAISE EXCEPTION 'ANNUL_LEDGER_COLUMN_SET' USING DETAIL=t->>'name';END IF;
 FOR x IN SELECT value FROM pg_catalog.jsonb_array_elements(t->'columns') LOOP
 SELECT * INTO a FROM pg_catalog.pg_attribute WHERE attrelid=r AND attnum=(x->>'position')::integer;
 IF a.attnum IS NULL OR a.attname IS DISTINCT FROM x->>'name' OR a.atttypid IS DISTINCT FROM pg_catalog.to_regtype(x->>'type') OR a.atttypmod IS DISTINCT FROM(x->>'typmod')::integer
 OR a.attnotnull IS DISTINCT FROM(x->>'notNull')::boolean OR a.attidentity<>'' OR a.attgenerated<>'' OR a.attisdropped OR a.attacl IS NOT NULL
 OR a.attcollation IS DISTINCT FROM(SELECT typcollation FROM pg_catalog.pg_type WHERE oid=a.atttypid)
 THEN RAISE EXCEPTION 'ANNUL_LEDGER_COLUMN_METADATA' USING DETAIL=(t->>'name')||'.'||(x->>'name');END IF;
 SELECT * INTO d FROM pg_catalog.pg_attrdef WHERE adrelid=r AND adnum=a.attnum;
 IF(x->>'default') IS NULL THEN
  IF d.oid IS NOT NULL OR a.atthasdef THEN RAISE EXCEPTION 'ANNUL_LEDGER_UNEXPECTED_DEFAULT' USING DETAIL=(t->>'name')||'.'||(x->>'name');END IF;
 ELSE
  expected_function:=pg_catalog.to_regprocedure(x->>'defaultFunction');
  IF expected_function IS NULL OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid=expected_function AND p.pronamespace='pg_catalog'::regnamespace AND p.pronargs=0 AND p.prokind='f' AND NOT p.proretset AND p.prorettype=a.atttypid)
  OR d.oid IS NULL OR NOT a.atthasdef OR pg_catalog.pg_get_expr(d.adbin,d.adrelid,false) IS DISTINCT FROM x->>'default'
  OR pg_catalog.substring(d.adbin::text,'^\\{FUNCEXPR :funcid ([0-9]+) ') IS DISTINCT FROM expected_function::text
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_depend dep WHERE dep.classid='pg_catalog.pg_attrdef'::regclass AND dep.objid=d.oid AND dep.refclassid='pg_catalog.pg_proc'::regclass AND dep.refobjid<>expected_function)
  THEN RAISE EXCEPTION 'ANNUL_LEDGER_DEFAULT_BINDING' USING DETAIL=(t->>'name')||'.'||(x->>'name');END IF;
 END IF;
 END LOOP;END LOOP;
 END $annul_ledger_columns$`;
}

export function buildOwnAnnulmentLedgerContract(options){
 exactOptions(options);const{readRaw,sourceCommit}=options,{texts,sourceHashes}=sources(readRaw);
 const settings=texts[SETTINGS],pathSetting='SET LOCAL search_path=pg_catalog,public,pg_temp';
 assert.equal(settings.split(pathSetting).length,2,'ANNUL_LEDGER_BUILTIN_RESOLUTION_POLICY');
 const tables=TABLE_SOURCES.map(([name,file])=>sourceTable(texts[file],file,name)),changes201=capacityChanges(texts[CAPACITY]);
 const guard=catalogGuard(tables);
 return freeze({version:OWN_ANNULMENT_LEDGER_CONTRACT_VERSION,sourceCommit,sourceHashes,tables,changes201,guard,statements:[guard],
  defaultResolution:{settingsSource:SETTINGS,setting:pathSetting,searchPath:'pg_catalog, public, pg_temp',qualifiedBuiltinUuid:'pg_catalog.gen_random_uuid()',catalogDependencyRequired:false,observedCatalogUsed:false},
  scope:{columns:true,defaults:true,tableSecurity:true,constraints:false,triggers:false,requiresExisting209TriggerGuard:true,requiresExisting201215ConstraintGuards:true},
  derivation:{sourceMode:'exact-lf-utf8-raw',createTables:5,columnSplitInverseVerified:true,sourceSpanInverseVerified:true,defaultQualificationInverseVerified:true,capacity201ChangesColumns:false},
  sourceBookend:()=>{const current=sources(readRaw);assert.deepEqual(current.sourceHashes,sourceHashes,'ANNUL_LEDGER_SOURCE_BOOKEND');return{sourceCommit,sourceHashes:{...sourceHashes},sourceOnly:true};},
  readOnly:true,connects:false,executesSql:false,observedCatalogUsed:false,nominalRowsReturned:0,businessWrites:0,executionAdmitted:false});
}
