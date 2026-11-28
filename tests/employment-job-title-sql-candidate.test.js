// Source derivation and synthetic logic only. This is not a PostgreSQL parser,
// execution test, installed-state attestation, or permission to run an installer.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {employmentJobTitleReasons,employmentJobTitleInput} from '../assets/employment-job-title-contract.js';
import {buildEmploymentJobTitleSqlCandidate,JOB_TITLE_SQL_INPUTS,JOB_TITLE_SQL_ORIGINALS,JOB_TITLE_SQL_BASE} from '../scripts/lib/employment-job-title-sql-candidate.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const hash=value=>createHash('sha256').update(value,'utf8').digest('hex');
const sources=()=>Object.fromEntries(Object.entries(JOB_TITLE_SQL_INPUTS).map(([key,{path}])=>[key,read(path)]));
const input=sources(),proposal=buildEmploymentJobTitleSqlCandidate(input);
const create=proposal.functions.find(row=>row.name==='native_employee_create_v1');
const propose=proposal.functions.find(row=>row.name==='native_employment_change_propose_v1');
const review=proposal.functions.find(row=>row.name==='native_employment_change_review_v1');
const marker='-- BEGIN employment-job-title-contract.v1:';
const stripGuard=body=>body.replace(/^ *-- BEGIN employment-job-title-contract\.v1: [a-z]+\n[\s\S]*?^ *-- END employment-job-title-contract\.v1: [a-z]+\n/gm,'');
function guard(body){
 const found=[...body.matchAll(/^ *-- BEGIN employment-job-title-contract\.v1: [a-z]+\n[\s\S]*?^ *-- END employment-job-title-contract\.v1: [a-z]+\n/gm)];
 assert.equal(found.length,1);return found[0][0];
}
function sourceBody(source,name){
 const start=source.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(');
 assert.notEqual(start,-1);
 const tail=source.slice(start),opener=/\bAS\s+(\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$)/.exec(tail);
 assert.ok(opener);const begin=opener.index+opener[0].length,end=tail.indexOf(opener[1]+';',begin);
 assert.ok(end>begin);return tail.slice(begin,end);
}
function assertOrder(body,parts){
 let offset=-1;
 for(const part of parts){const next=body.indexOf(part,offset+1);assert.ok(next>offset,'Missing or reordered: '+part);offset=next;}
}

test('derivation pins the exact originals and emits only current 167/224/224 signatures behind an unconditional barrier',()=>{
 const before=JSON.stringify(input),again=buildEmploymentJobTitleSqlCandidate(input);
 assert.equal(JSON.stringify(input),before);assert.equal(again.sql,proposal.sql);
 assert.equal(proposal.sourceBase,JOB_TITLE_SQL_BASE);assert.equal(proposal.installable,false);
 assert.equal(proposal.connects,false);assert.equal(proposal.executesSql,false);assert.equal(proposal.postgresExecuted,false);
 assert.equal(proposal.installedStateObserved,false);assert.equal(proposal.noeliaReady,false);assert.equal(proposal.newFunctions,0);
 assert.equal(proposal.requiresMetadataPreservingComposition,true);
 assert.deepEqual(proposal.functions.map(row=>row.signature),[
  'public.native_employee_create_v1(jsonb,jsonb,text,uuid)',
  'public.native_employment_change_propose_v1(jsonb,jsonb,uuid)',
  'public.native_employment_change_review_v1(jsonb,jsonb,uuid)',
 ]);
 assert.equal((proposal.sql.match(/^CREATE OR REPLACE FUNCTION /gm)||[]).length,3);
 assert.match(proposal.sql,/^--[^\n]+\nBEGIN;\nDO \$source_only\$ BEGIN RAISE EXCEPTION 'EMPLOYMENT_JOB_TITLE_SOURCE_REQUIRES_REVIEWED_COMPOSITION';END \$source_only\$;/);
 assert.match(proposal.sql,/\nROLLBACK;\n$/);
 assert.doesNotMatch(proposal.sql,/\b(?:COMMIT|GRANT|REVOKE|ALTER FUNCTION|CREATE TABLE)\b/);
 for(const fn of proposal.functions){assert.equal(hash(fn.body),fn.bodySha256);assert.equal(hash(fn.sql),fn.definitionSha256);}
});

test('registration lineage identifies overwritten definitions; the 095-header/167-body composition is never labeled an original full definition',()=>{
 assert.deepEqual(proposal.lineage.registration.map(row=>row.bodySha256),[
  JOB_TITLE_SQL_ORIGINALS.registration067Body,JOB_TITLE_SQL_ORIGINALS.registration095Body,
  JOB_TITLE_SQL_ORIGINALS.registration099Body,JOB_TITLE_SQL_ORIGINALS.registration103Body,JOB_TITLE_SQL_ORIGINALS.registration167Body,
 ]);
 assert.equal(proposal.lineage.registration.filter(row=>row.currentInRepository).length,1);
 assert.equal(proposal.lineage.registration.at(-1).definitionSha256,null);
 assert.deepEqual(proposal.lineage.registrationGuardOnlySources,[JOB_TITLE_SQL_INPUTS.changes104.path,JOB_TITLE_SQL_INPUTS.lifecycle110.path]);
 assert.equal(create.beforeDefinitionSha256,null);assert.equal(create.historicalCompleteDefinitionAvailable,false);
 assert.equal(create.headerSource,JOB_TITLE_SQL_INPUTS.registration095.path);assert.equal(create.headerSha256,JOB_TITLE_SQL_ORIGINALS.registration095Header);
 assert.equal(create.beforeBodySha256,JOB_TITLE_SQL_ORIGINALS.registration167Body);
 assert.deepEqual(proposal.registrationMetadataLiteral.argNames,['p','d','catalog_version','k']);
 assert.deepEqual(proposal.registrationMetadataLiteral.config,['search_path=public, pg_temp']);
 assert.equal(proposal.registrationMetadataLiteral.after,create.beforeBodySha256);
 for(const fn of [propose,review]){assert.equal(fn.source,JOB_TITLE_SQL_INPUTS.void224.path);assert.equal(fn.historicalCompleteDefinitionAvailable,true);}
});

test('removing exactly the inline addition recovers each effective historical body byte for byte',()=>{
 const tag="WHEN 'native_employee_create_v1' THEN after_body:=$body0$",start=input.classification167.indexOf(tag)+tag.length;
 assert.ok(start>=tag.length);
 const original167=input.classification167.slice(start,input.classification167.indexOf('$body0$;',start));
 assert.equal(stripGuard(create.body),original167);
 assert.equal(stripGuard(propose.body),sourceBody(input.void224,propose.name));
 assert.equal(stripGuard(review.body),sourceBody(input.void224,review.name));
 for(const fn of proposal.functions){
  assert.equal(hash(stripGuard(fn.body)),fn.beforeBodySha256);
  assert.equal(hash(guard(fn.body)),fn.insertedBlockSha256);
  // The added block is a validation only: it cannot mutate the input, a stored
  // title, any row, request fingerprint, replay receipt or authorization state.
  assert.doesNotMatch(guard(fn.body),/\b(?:INSERT|UPDATE|DELETE|PERFORM|RETURN|EXECUTE)\b|\b(?:d|values_value|after_row|p|fingerprint|replay|receipt_value)\s*:=/);
 }
});

test('new registration validation follows replay and all original checks without normalizing its fingerprinted draft',()=>{
 assertOrder(create.body,["ctx:=native_employee_context_v1(p,true)","fingerprint:=encode",'IF FOUND THEN',"RETURN native_employee_receipt_v1(r)||jsonb_build_object('replayed',true)",
  'PERFORM public.native_employment_catalog_lock_v1(ctx)',"item->'registrationAllowed'='false'",'NATIVE_EMPLOYEE_IDENTITY_EXISTS','NATIVE_EMPLOYEE_NUMBER_EXISTS',marker,'INSERT INTO person_identity']);
 assert.match(guard(create.body),/job_title_json jsonb:=d->'jobTitle'/);
 assert.match(create.body,/'cargoName',NULLIF\(d->>'jobTitle',''\)/);
 assert.doesNotMatch(guard(create.body),/job_title_value\s*:=\s*(?:normalize|btrim)/);
});

test('new proposals keep normalization/replay/withdrawn guards and reject invalid normalized cargo before the pending document is saved',()=>{
 assertOrder(propose.body,["native_employment_change_context_v1(ctx,'employee.record.propose')",'values_value:=public.native_employment_change_values_v1',
  'fingerprint:=encode','IF replay IS NOT NULL THEN RETURN replay; END IF','NATIVE_EMPLOYMENT_VOID_WITHDRAWN',
  'NATIVE_EMPLOYMENT_CHANGE_IDENTITY_CHANGED','NATIVE_EMPLOYMENT_CHANGE_SCOPE_CHANGED','NATIVE_EMPLOYMENT_CHANGE_BASE_CHANGED',
  'NATIVE_EMPLOYMENT_CHANGE_CATALOG_CHANGED','after_row:=public.native_employment_change_after_v1',
  'NATIVE_EMPLOYMENT_CHANGE_NO_CHANGE','native_employment_change_capacity_v1',marker,'INSERT INTO public.native_employment_change_proposal']);
 assert.match(guard(propose.body),/job_title_json jsonb:=values_value->'jobTitle'/);
 assert.match(input.changes104,/val:=normalize\(btrim\(raw_values->>field\),NFC\)/);
 assert.deepEqual(proposal.untouchedHelpers.map(row=>row.bodySha256),[JOB_TITLE_SQL_ORIGINALS.values104Body,JOB_TITLE_SQL_ORIGINALS.display104Body,JOB_TITLE_SQL_ORIGINALS.after104Body]);
 for(const name of ['values','display','after'])assert.doesNotMatch(proposal.sql,new RegExp('CREATE OR REPLACE FUNCTION public.native_employment_change_'+name+'_v1'));
});

test('approval validates the frozen after-contract only after replay, authority and consistency; rejection remains outside that branch',()=>{
 assertOrder(review.body,["native_employment_change_context_v1(ctx,'employee.record.approve')",'IF replay IS NOT NULL THEN RETURN replay; END IF',
  "IF decision_value='approve' AND public.native_employment_void_state_v1",'NATIVE_EMPLOYMENT_CHANGE_SCOPE_CHANGED',
  'NATIVE_EMPLOYMENT_CHANGE_DECIDED','NATIVE_EMPLOYMENT_CHANGE_MAKER_CHECKER_REQUIRED','NATIVE_EMPLOYMENT_CHANGE_IDENTITY_CHANGED',
  "IF decision_value='approve' THEN",'NATIVE_EMPLOYMENT_CHANGE_BASE_CHANGED','NATIVE_EMPLOYMENT_CHANGE_CATALOG_CHANGED',
  'p.after_contract IS DISTINCT FROM public.native_employment_change_after_v1','IF revision_value>=100',
  'applied_xid=pg_current_xact_id()',marker,'revision_value:=revision_value+1',
  'INSERT INTO public.native_employment_change_review','UPDATE public.employment_contract']);
 const approvalStart=review.body.indexOf(" IF decision_value='approve' THEN\n"),approvalEnd=review.body.indexOf('\n END IF;',approvalStart);
 assert.ok(review.body.indexOf(marker)>approvalStart&&review.body.indexOf(marker)<approvalEnd);
 assert.match(guard(review.body),/job_title_json jsonb:=p\.after_contract#>'\{source_payload,employment,cargoName\}'/);
 assert.doesNotMatch(guard(review.body),/body->'jobTitle'|native_employment_change_values_v1/);
 assert.match(review.body,/CASE decision_value WHEN 'approve' THEN 'approved' ELSE 'rejected' END/);
 assert.match(review.body,/source_payload=p\.after_contract->'source_payload'/);
});

test('historical adoption is explicitly preserved, including the exact source_payload conservation check',()=>{
 assert.equal(proposal.pendingStoredDocument.legacyAdoption.modified,false);
 assert.match(input.adoption133,/before_row\.source_payload=after_row\.source_payload-'native' AND NOT before_row\.source_payload \? 'native'/);
 assert.doesNotMatch(proposal.sql,/CREATE (?:OR REPLACE )?FUNCTION public\.employment_adoption_/);
 assert.equal(proposal.pendingStoredDocument.priorSuccessfulReplayRevalidated,false);
});

// Independently interpret the small numeric predicates emitted in the guard.
// The model deliberately does NOT interpret PL/pgSQL or reproduce DB state.
function codepointPredicate(text){
 const terms=text.trim().split(/\s+OR\s+/).map(term=>{
  let match=/^cp BETWEEN (\d+) AND (\d+)$/.exec(term);
  if(match){const lo=Number(match[1]),hi=Number(match[2]);return cp=>cp>=lo&&cp<=hi;}
  match=/^cp IN\(([\d,]+)\)$/.exec(term);assert.ok(match,'Unexpected SQL predicate: '+term);
  const values=new Set(match[1].split(',').map(Number));return cp=>values.has(cp);
 });
 return cp=>terms.some(term=>term(cp));
}
function guardLogicModel(block){
 const points=/job_title_points NOT BETWEEN (\d+) AND (\d+)/.exec(block),units=/job_title_units NOT BETWEEN (\d+) AND (\d+)/.exec(block);
 const weights=/CASE WHEN cp>(\d+) THEN (\d+) ELSE (\d+) END/.exec(block);
 const forbidden=/coalesce\(bool_or\((cp BETWEEN[\s\S]*?)\),false\),/.exec(block);
 const edges=/\(cp IN\(([\d,]+)\) OR cp BETWEEN (\d+) AND (\d+)\)/.exec(block);
 assert.ok(points&&units&&weights&&forbidden&&edges);
 assert.match(block,/normalize\(job_title_value,NFC\) IS DISTINCT FROM job_title_value/);
 assert.ok(block.indexOf('job_title_points NOT BETWEEN')<block.indexOf('generate_series(1,job_title_points)'));
 const banned=codepointPredicate(forbidden[1].replace(/\s+/g,' ').trim());
 const edge=codepointPredicate('cp IN('+edges[1]+') OR cp BETWEEN '+edges[2]+' AND '+edges[3]);
 return value=>{
  if(value===null)return block.includes("IF job_title_json IS DISTINCT FROM 'null'::jsonb THEN");
  if(typeof value!=='string')return false;
  const cps=Array.from(value,c=>c.codePointAt(0));
  if(cps.length<Number(points[1])||cps.length>Number(points[2]))return false;
  if(cps.length===0)return true;
  const count=cps.reduce((sum,cp)=>sum+(cp>Number(weights[1])?Number(weights[2]):Number(weights[3])),0);
  return count>=Number(units[1])&&count<=Number(units[2])&&!cps.some(banned)&&!edge(cps[0])&&!edge(cps.at(-1))&&value===value.normalize('NFC');
 };
}
const createModel=guardLogicModel(guard(create.body)),proposeModel=guardLogicModel(guard(propose.body)),reviewModel=guardLogicModel(guard(review.body));
const writerExpected=value=>typeof value==='string'&&(value===''||employmentJobTitleReasons(value).length===0);

test('emitted guard predicates agree with the shared capture contract; writer empty maps to null and PDF characters are not narrowed',()=>{
 const cases=[null,undefined,1,{},[],true,'','Jefe de área','Administración…','Coordinación → dirección','Nº 2','Á'.repeat(120),'a'.repeat(121),
  '😀'.repeat(60),'😀'.repeat(61),'a'.repeat(118)+'😀','a'.repeat(119)+'😀',
  'e\u0301','é',' cargo','cargo ','\u00a0cargo','cargo\ufeff','cargo\u00a0interior',
  'A\u202eB','A\u2069B','A\u0085B','A\u001fB','A\u0000B','A\ud800B','A\udfffB','<cargo>','A\u200bB','A\u2060B','A\u2028B'];
 for(const value of cases){
  assert.equal(createModel(value),writerExpected(value),JSON.stringify(value));
  assert.equal(proposeModel(value),writerExpected(value),JSON.stringify(value));
  assert.equal(reviewModel(value),employmentJobTitleReasons(value).length===0,JSON.stringify(value));
 }
 assert.equal(createModel(''),true);assert.equal(proposeModel(''),true);assert.equal(reviewModel(''),false);assert.equal(reviewModel(null),true);
 for(const value of ['…','→','A\u200bB','A\u2060B'])assert.equal(reviewModel(value),true);
});

test('all Unicode scalar/surrogate positions in the relevant ranges have equivalent acceptance in the generated predicates',()=>{
 const values=new Set();
 for(let cp=0;cp<=0x3100;cp++)values.add(cp);
 for(let cp=0xd7f0;cp<=0xe010;cp++)values.add(cp);
 for(let cp=0xfe00;cp<=0x10100;cp++)values.add(cp);
 for(let cp=0x10101;cp<=0x10ffff;cp+=499)values.add(cp);
 values.add(0x10ffff);
 for(const cp of values){const c=String.fromCodePoint(cp);
  for(const text of [c,c+'A','A'+c,'A'+c+'B']){
   const expected=employmentJobTitleReasons(text).length===0;
   assert.equal(reviewModel(text),expected,'U+'+cp.toString(16)+' '+JSON.stringify(text));
   assert.equal(createModel(text),expected,'registration U+'+cp.toString(16));
   assert.equal(proposeModel(text),expected,'proposal U+'+cp.toString(16));
  }
 }
});

test('raw SQL normalization is preserved rather than expanded to JavaScript trim or a stored-data repair',()=>{
 const nfd='Jefe de administracio\u0301n';
 assert.equal(createModel(nfd),false);assert.equal(createModel(employmentJobTitleInput(nfd).value),true);
 // values_v1 applies btrim (U+0020) then NFC, unchanged. Its result is what the
 // proposal checks; direct SQL does not silently gain JavaScript's Unicode trim.
 const values104Model=value=>value.replace(/^ +| +$/g,'').normalize('NFC');
 assert.equal(proposeModel(values104Model(' '+nfd+' ')),true);
 assert.equal(proposeModel(values104Model('\u00a0Cargo\u00a0')),false);
 assert.equal(proposeModel(employmentJobTitleInput('\u00a0Cargo\u00a0').value),true);
 assert.equal(reviewModel(nfd),false);
 for(const fn of proposal.functions)assert.doesNotMatch(guard(fn.body),/jsonb_set|jsonb_build_object|nullif\(|replace\(|trim\(/i);
});

test('source and manifest are reproducible text artifacts with exact bytes, provenance and no installed-state claim',()=>{
 const sql=read('scripts/candidates/employment-job-title-writers-v1.source.sql.txt');
 const manifest=JSON.parse(read('scripts/candidates/employment-job-title-writers-v1.source.manifest.json'));
 assert.equal(sql,proposal.sql);assert.equal(manifest.output.sha256,hash(sql));assert.equal(manifest.output.bytes,Buffer.byteLength(sql,'utf8'));
 const {functions,sql:ignored,...metadata}=proposal;
 assert.deepEqual({...manifest,functions:undefined,output:undefined},{...metadata,functions:undefined,output:undefined});
 assert.deepEqual(manifest.functions,functions.map(({body,sql,...value})=>value));
 for(const [key,{path,sha256}]of Object.entries(manifest.inputs)){assert.equal(hash(input[key]),sha256);assert.equal(path,JOB_TITLE_SQL_INPUTS[key].path);}
 assert.equal(manifest.preserved.acl,true);assert.equal(manifest.preserved.originalPins,true);
 const cli=read('scripts/build-employment-job-title-sql-candidate.mjs'),builder=read('scripts/lib/employment-job-title-sql-candidate.mjs');
 for(const text of [cli,builder])assert.doesNotMatch(text,/from ['"](?:pg|postgres|@neondatabase|node:child_process|node:https?|node:net)|process\.env|fetch\(/);
});

for(const key of Object.keys(JOB_TITLE_SQL_INPUTS))test('derivation refuses any byte drift in '+key,()=>{
 const changed={...input,[key]:input[key]+'\n'};
 assert.throws(()=>buildEmploymentJobTitleSqlCandidate(changed),new RegExp('Original source file pin mismatch: '+key));
});

test('derivation refuses absent, extra, reordered-header or duplicated historical input rather than guessing',()=>{
 const absent={...input};delete absent.void224;assert.throws(()=>buildEmploymentJobTitleSqlCandidate(absent));
 assert.throws(()=>buildEmploymentJobTitleSqlCandidate({...input,unknown:'x'}));
 assert.throws(()=>buildEmploymentJobTitleSqlCandidate({...input,void224:input.void224.replace('SECURITY DEFINER','SECURITY INVOKER')}));
 assert.throws(()=>buildEmploymentJobTitleSqlCandidate({...input,void224:input.void224+'\n'+input.void224}));
 assert.throws(()=>buildEmploymentJobTitleSqlCandidate({...input,classification167:input.classification167.replace("'registrationAllowed'='false'","'registrationAllowed'='true'")}));
});
