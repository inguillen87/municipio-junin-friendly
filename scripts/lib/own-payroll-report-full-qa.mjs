// Synthetic six-person report verifier only. Reuses its ONE existing seed.
// This is not public/canonical200 authority admission: its capabilities and IAM
// are the existing explicit fixture. Real full readers and whole SQL201 run
// unchanged after source-derived predecessors, with complete201 conservation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildOwnCloseQa,createOwnClosePsqlQa} from './own-payroll-close-qa.mjs';
import {qaLiteral as q} from './own-payroll-durable-qa.mjs';
import {splitPostgresStatements} from './sql-statements.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {buildOwnPeriodClassificationInstallation} from './own-period-classification-installation.mjs';
import {buildSalaryAuxiliaryNamespaceSql} from './salary-auxiliary-namespace-installation.mjs';
import {ownFullCapacity190Conservation} from './own-full-capacity-190-public-installation.mjs';
const SOURCE_PINS=Object.freeze({
 "scripts/lib/own-period-classification-installation.mjs": "fc256e947a505dcb6606c95372575b9755af4a426888db783573e1737e95def6",
 "scripts/migrations/177-own-period-classification.sql": "d99fede293297f1c1e8876188a39cd24eac568b12ad84fea026b10a459131291",
 "scripts/lib/own-payroll-close-qa.mjs": "84f70a7b7ab5ef4b1be0ff30e6fa6f870aef5368c353b91bbba9aaba74378af8",
 "scripts/lib/own-payroll-liquidation-qa.mjs": "8d9b227a8b864f981c6be54d4ea9a743c01abbbf87a2eff015e893f92351b1f7",
 "scripts/lib/own-payroll-durable-qa.mjs": "9dbe7430969b9acf44fdb927e9909030bdac3b7d1bb63e77ce3b4380bbdd2e56",
 "scripts/lib/own-payroll-close-sql.mjs": "b30aa8751521a4df39f43b76ecc521308a9a0f8f158757a7c4c7e84e30f833f7",
 "scripts/lib/own-payroll-jurisdiction-installation.mjs": "d8eb592da960a5b9b988bc533faf0b1cf42f59974bb05ece67962e3bf94f4e03",
 "scripts/lib/salary-auxiliary-namespace-installation.mjs": "6d492a4c56adba6a78242604f27b86ba18067359c1b28dc39879e50d43eed9b9",
 "scripts/lib/own-full-capacity-190-public-installation.mjs": "f220a79c990dc7f303fe52c49b3436af9c6b5924a5e1167810d8811127ee5378",
 "scripts/lib/own-payroll-installation.mjs": "6ad8f07733adfb17b6a32a6efd228073bfb3566844b858167581e2d7896bb3d0",
 "scripts/lib/sql-statements.mjs": "d81477c5aed918e944aefe16d05015080acc4fe543059cbf15e2c69e9f5201c2",
 "scripts/migrations/124-own-payroll-liquidation-decisions.sql": "03035e3f7e126b1561222f1a894bcf1000dd586b6d05fb579cb4722d9aa41f4a",
 "scripts/migrations/125-own-payroll-close.sql": "443127dd55b9be5f37da47af303fcdd599b4d5dc0aad0a319a18253f8f139af5",
 "scripts/migrations/143-own-payroll-jurisdiction-snapshot.sql": "1486014334a5e70d8c1bb7dbb4025cdddfb3a741dc299d51cfc2803a938aa5fe",
 "scripts/migrations/145-own-declared-liquidation-date.sql": "26db273be2b24cad51e67f8e465b73c2855aedb6daed7a079f4e274c0434099d",
 "scripts/migrations/146-own-consolidated-annulment.sql": "8337df26dc3c22fe8c156e19d7511db6c537f08b219633f6add981c774a48fe6",
 "scripts/migrations/200-own-payroll-report-census.sql": "1f6933af2f1067e99bf24005c37d434c51c58f0ba51865ed7b99834842f5f198",
 "scripts/migrations/201-own-full-payroll-decision-capacity.sql": "46de1308360a076eff1453f57a9e4f4d6c14ba176d73cf8531b7b0821ed35b1b"
});
const sha=s=>createHash('sha256').update(s).digest('hex'),lf=s=>s.replace(/\r\n?/g,'\n');
const clean=s=>s.replace(/^(?:\s*--[^\n]*(?:\n|$))+/g,'').trim();
const body=d=>{const m=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?$/.exec(d);assert.ok(m,'REPORT_FULL_QA_BODY');return m[2];};
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'REPORT_FULL_QA_ANCHOR');return s.replace(a,()=>b);};
function phase(s,name){const a='DO $'+name+'$',z='END $'+name+'$;',from=s.indexOf(a),to=s.indexOf(z,from);assert.ok(from>=0&&to>from,'REPORT_FULL_QA_PHASE');assert.equal(s.indexOf(a,from+a.length),-1);return s.slice(from,to+z.length);}
function metadata(s){const m=/jsonb_array_elements\('((?:[^']|'')*)'::jsonb\)/.exec(s);assert.ok(m,'REPORT_FULL_QA_METADATA');return{literal:m[0],items:JSON.parse(m[1].replaceAll("''","'"))};}
function definitions(s){const found=new Map();for(const m of s.matchAll(/\bCREATE(?: OR REPLACE)? FUNCTION public\.([a-z0-9_]+)\(([\s\S]*?)\bAS\s+(\$[\w]*\$)([\s\S]*?)\3/g)){assert.ok(!found.has(m[1]),'REPORT_FULL_QA_OVERLOAD');found.set(m[1],m[0]);}return found;}
function sourcePin(record,d){const p=ownInstallationFunctionPin(d);assert.equal(p.signature,record.signature);assert.equal(p.sha256,record.bodySha256,'REPORT_FULL_QA_PREDECESSOR_BODY:'+record.name);assert.deepEqual(p.argNames,record.argNames);assert.deepEqual(p.config,record.config);assert.equal(p.volatility,record.volatility);assert.equal(p.language,record.language??'plpgsql');assert.equal(p.resultType,record.result??'jsonb');assert.equal(p.definer,true);assert.equal(p.strict,false);assert.equal(p.returnsSet,false);assert.equal(p.defaults,'');return p;}
// Only the current-native-registration branch is part of this six-person UX
// fixture. Keep the real177 bodies/table/immutability/ACL; do not install its
// approval facade, adopted-source graph, capture adapter, or any synthetic stub.
function nativeClassificationReadClosure(period){
 const names=['own_period_classification_configuration_v1','own_period_classification_current_v1','own_period_classification_resolve_v1','own_period_classification_close_match_v1'];
 const firstFunction=period.migration.findIndex(s=>s.startsWith('CREATE FUNCTION public.own_period_classification_lifecycle_subject_v1('));
 assert.equal(firstFunction,8,'REPORT_FULL_QA_PERIOD_SCHEMA_SOURCE');
 const schema=period.migration.slice(0,firstFunction);
 assert.ok(schema[0].startsWith('CREATE TABLE public.own_period_classification_event('));
 assert.match(schema[4],/^REVOKE ALL ON public\.own_period_classification_event FROM PUBLIC,municontrol_actions_runtime_app$/);
 assert.ok(schema[5].startsWith('CREATE FUNCTION public.own_period_classification_immutable_v1('));
 const selected=names.map(name=>{const found=period.migration.filter(s=>s.startsWith('CREATE FUNCTION public.'+name+'('));assert.equal(found.length,1,'REPORT_FULL_QA_PERIOD_HELPER:'+name);return found[0];});
 const signatures=[schema[5],...selected].map(s=>ownInstallationFunctionPin(s).signature);
 for(const signature of signatures){
  const revokes=period.migration.filter(s=>s.startsWith('REVOKE ALL ON FUNCTION ')&&s.endsWith(' FROM PUBLIC,municontrol_actions_runtime_app'));
  assert.equal(revokes.filter(s=>s.slice('REVOKE ALL ON FUNCTION '.length,-' FROM PUBLIC,municontrol_actions_runtime_app'.length).split(signature).length===2).length,1,'REPORT_FULL_QA_PERIOD_PRIVATE_ACL');
  assert.ok(!period.migration.some(s=>s.startsWith('GRANT ')&&s.includes(signature)),'REPORT_FULL_QA_PERIOD_NO_FACADE');
 }
 // The two omitted177 branches require approved177 events or a177 capture.
 // This new owner-only table has no writer facade, capability or runtime grant.
 const empty="DO $report_native_period$ BEGIN IF EXISTS(SELECT 1 FROM public.own_period_classification_event) OR EXISTS(SELECT 1 FROM public.own_payroll_run_capture) THEN RAISE EXCEPTION 'REPORT_FULL_QA_PERIOD_FIXTURE_NOT_EMPTY';END IF;END $report_native_period$";
 return{names,statements:[...schema,...selected,'REVOKE ALL ON FUNCTION '+signatures.join(',')+' FROM PUBLIC,municontrol_actions_runtime_app',empty]};
}
export function composeOwnReportFullQaSources({read,sourceCommit,schema}){
 assert.equal(typeof read,'function');assert.match(sourceCommit,/^[a-f0-9]{40}$/);assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 const sourceHashes={},texts=new Map();const load=file=>{const value=lf(read(file)),digest=sha(value);if(Object.hasOwn(SOURCE_PINS,file))assert.equal(digest,SOURCE_PINS[file],'REPORT_FULL_QA_SOURCE_CHANGED:'+file);if(texts.has(file))assert.equal(texts.get(file),value,'REPORT_FULL_QA_READ_CHANGED');texts.set(file,value);sourceHashes[file]=digest;return value;};
 for(const file of Object.keys(SOURCE_PINS))load(file);
 const opts={read:load,sourceCommit},period=buildOwnPeriodClassificationInstallation(opts),namespace=buildSalaryAuxiliaryNamespaceSql(opts);
 const detail=period.changed.filter(d=>d.startsWith('CREATE OR REPLACE FUNCTION public.own_close_detail_v1('));assert.equal(detail.length,1);
 const periodRead=nativeClassificationReadClosure(period);
 const snapshot=namespace.changed.filter(d=>d.startsWith('CREATE OR REPLACE FUNCTION public.own_close_snapshot_v1('));assert.equal(snapshot.length,1);
 const raw=file=>load('scripts/migrations/'+file),raw201=raw('201-own-full-payroll-decision-capacity.sql');
 const pre=metadata(phase(raw201,'capacity_preflight')),post=metadata(phase(raw201,'capacity_postflight'));assert.equal(pre.items.length,11);assert.equal(post.items.length,27);
 const prior=new Map();for(const file of['124-own-payroll-liquidation-decisions.sql','125-own-payroll-close.sql','146-own-consolidated-annulment.sql','200-own-payroll-report-census.sql'])for(const[n,d]of definitions(raw(file)))prior.set(n,d);
 prior.set('own_close_detail_v1',detail[0]);prior.set('own_close_snapshot_v1',snapshot[0]);
 const emitted=definitions(raw201);assert.equal(emitted.size,25);
 const localize=s=>s.replaceAll('public.',schema+'.').replaceAll(schema+'.digest(','public.digest(')
  .replaceAll("'public'::regnamespace",q(schema)+'::regnamespace')
  .replace(/SET search_path\s*=\s*(?:pg_catalog,\s*)?public,\s*pg_temp/gi,`SET search_path=pg_catalog,${schema},public,pg_temp`);
 const map=(record,before)=>{const d=(before?prior:emitted).get(record.name)??prior.get(record.name);assert.ok(d,'REPORT_FULL_QA_SOURCE_DEFINITION:'+record.name);sourcePin(record,d);return{...record,signature:record.signature.replace('public.',schema+'.'),config:record.config.map(c=>c.replace('search_path=pg_catalog, public, pg_temp',`search_path=pg_catalog, ${schema}, public, pg_temp`)),bodySha256:sha(body(localize(d)))};};
 const preLocal=pre.items.map(r=>map(r,true)),postLocal=post.items.map(r=>map(r,false));
 let sql201=once(raw201,pre.literal,'jsonb_array_elements('+q(JSON.stringify(preLocal))+'::jsonb)');sql201=once(sql201,post.literal,'jsonb_array_elements('+q(JSON.stringify(postLocal))+'::jsonb)');sql201=localize(sql201);
 const oldCensus=pre.items.find(p=>p.name==='own_close_report_census_v1'),newCensus=preLocal.find(p=>p.name===oldCensus.name);assert.equal(sql201.split(oldCensus.bodySha256).length,2,'REPORT_FULL_QA_CENSUS_GUARD_ANCHOR');sql201=once(sql201,oldCensus.bodySha256,newCensus.bodySha256);
 const names={legacyNames:post.items.filter(p=>p.kind==='legacy'||p.kind==='known_census_successor').map(p=>p.name),newNames:post.items.filter(p=>p.kind==='core'||p.kind==='full').map(p=>p.name)};assert.equal(names.legacyNames.length,9);assert.equal(names.newNames.length,16);
 const keep=ownFullCapacity190Conservation({schema,sourceCommit},names);
 // Source177's actual final close-detail follows its private native read path;
 // the unchanged123 fixture capture never contains periodClassifications.
 // Only the source schema, five private helpers and existing detail/snapshot
 // are emitted. No177 facade, writer, IAM grant, adoption or second seed.
 const prerequisites=[raw('143-own-payroll-jurisdiction-snapshot.sql'),...periodRead.statements,detail[0],snapshot[0],raw('146-own-consolidated-annulment.sql'),raw('200-own-payroll-report-census.sql')].map(localize);
 const installation=[keep.before,sql201,keep.after,keep.compare];
 return{version:'own-report-six-person-full-fixture.v1',sourceCommit,schema,sourceHashes,preLocal,postLocal,prerequisites,installation,local201:sql201,
  beforeGuard:phase(sql201,'capacity_preflight'),afterGuard:phase(sql201,'capacity_postflight'),
  authorityFixture:'existing-synthetic-capabilities',institutionalAuthority200Proven:false,newSeedCount:0,newDatabaseCount:0,
  nativePeriodReadClosure:periodRead.names,periodClassificationWritersInstalled:0,
  inheritedFullFunctions:16,fullRpcsAreReal:true,legacyRpcsPreserved:true};
}
export function buildOwnReportFullQa(major,{employees=6,sourceCommit,read=file=>fs.readFileSync(new URL('../../'+file,import.meta.url),'utf8')}={}){
 assert.equal(employees,6);assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 //145 adds bootstrap_v2 required by146. Its capture adapter explicitly still
 // accepts the original v1 command;125 then reuses the existing close adapter.
 const qa=buildOwnCloseQa(major,{employees,declaredDate:true});
 assert.ok(!qa.sql.includes('periodClassifications'),'REPORT_FULL_QA_CAPTURE_EPOCH_CHANGED');
 const plan=composeOwnReportFullQaSources({read,sourceCommit,schema:qa.schema});
 const anchor='    END $seed$; COMMIT;';assert.equal(qa.sql.split(anchor).length,2);
 const added=[...plan.prerequisites,...plan.installation].map(s=>'EXECUTE '+q(s)+';').join('\n');
 const sql=qa.sql.replace(anchor,()=>added+'\n'+anchor);assert.equal((sql.match(/DO \$seed\$/g)??[]).length,1);
 return{...qa,sql,seedSha256:sha(sql),reportFullFixture:{version:plan.version,sourceCommit,sourceHashes:plan.sourceHashes,predecessors:plan.preLocal.map(p=>({signature:p.signature,bodySha256:p.bodySha256})),authorityFixture:plan.authorityFixture,institutionalAuthority200Proven:false,fullFunctions:16,employees:6}};
}
const fullReaders=Object.freeze({
 'SELECT public.own_close_report_census_v1($1::jsonb,$2::text,$3::text) AS result':3,
 'SELECT public.own_close_group_full_v1($1::jsonb,$2::uuid) AS result':2,
 'SELECT public.own_liquidation_detail_full_v1($1::jsonb,$2::uuid) AS result':2
});
export function createOwnReportFullPsqlQa(options,{createClose=createOwnClosePsqlQa}={}){
 const db=createClose(options);return{...db,query:async(text,values)=>{
  if(!Object.hasOwn(fullReaders,text))return db.query(text,values);
  assert.ok(Array.isArray(values));assert.equal(values.length,fullReaders[text]);
  const rendered=text.replaceAll('public.own_',options.schema+'.own_').replace(/\$(\d+)/g,(_,n)=>q(values[Number(n)-1]));
  return[{result:await db.run(rendered,true)}];
 }};
}
