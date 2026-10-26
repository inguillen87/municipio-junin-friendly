// Closed synthetic source construction. Imports never connect or execute SQL.
import assert from'node:assert/strict';import{createHash,randomUUID}from'node:crypto';
import{buildMunicipalOwnerAdoptionDecisionInstallation}from'./municipal-owner-adoption-decision-installation.mjs';
import{buildOwnAgreementWorkingTimeInstallation}from'./own-agreement-working-time-installation.mjs';
import{buildAdoptionSourceStreamingInstallation}from'./adoption-source-streaming-installation.mjs';
import{buildOwnerAuthorityQa}from'../verify-municipal-owner-adoption-authority.mjs';
import{SALARY_ADMINISTRATIVE_CONTEXT}from'./salary-administrative-identity-installation.mjs';
import{ADOPTION_ADMINISTRATIVE_CONTEXT}from'./adoption-administrative-identity-installation.mjs';
import{CONSUMER_BEFORE_PINS}from'./adopted-consumers-installation-pins.mjs';
import{buildOwnCloseSql}from'./own-payroll-close-sql.mjs';
import{buildSalaryAuxiliaryNamespaceSql}from'./salary-auxiliary-namespace-installation.mjs';
import{splitPostgresStatements}from'./sql-statements.mjs';import{ownInstallationFunctionPin}from'./own-payroll-installation.mjs';
export const ownerDecisionQaHash=value=>createHash('sha256').update(value).digest('hex');
export const ownerDecisionQaLiteral=value=>"'"+String(value).replaceAll("'","''")+"'";
const lf=s=>s.replace(/\r\n?/g,'\n'),clean=s=>s.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim(),q=ownerDecisionQaLiteral;
const body=d=>{const m=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?$/.exec(d);assert.ok(m,'OWNER_DECISION_QA_BODY_REQUIRED');return m[2];};
const replaceBody=(d,next)=>d.replace(body(d),()=>next),identity=d=>{try{return ownInstallationFunctionPin(d);}catch{const m=/^CREATE(?: OR REPLACE)? FUNCTION public\.(\w+)\s*\(([^)]*)\)\s+RETURNS\s+(TABLE\b|text\[\])/i.exec(d);assert.ok(m,'OWNER_DECISION_QA_HEADER_UNSUPPORTED');const types=(m[2]?m[2].split(','):[]).map(s=>{const p=/^\s*\w+\s+([\w.]+)(?:\s+DEFAULT\s+(?:NULL|false))?\s*$/.exec(s);assert.ok(p);return p[1];});return{name:m[1],signature:'public.'+m[1]+'('+types.join(',')+')',sha256:ownerDecisionQaHash(body(d)),tableResult:m[3]==='TABLE'};}},name=d=>identity(d).name;
const fixed=d=>{const at=/\bAS\s+\$\w*\$/.exec(d);if(!at)return d;const header=d.slice(0,at.index).replaceAll("SET search_path TO 'pg_catalog', 'public', 'pg_temp'",'SET search_path=pg_catalog,public,pg_temp').replaceAll("SET search_path TO 'public', 'pg_temp'",'SET search_path=public,pg_temp').replace(/SET (?:"TimeZone"|timezone) TO 'UTC'/gi,"SET timezone='UTC'");return(header+d.slice(at.index)).replace(/^CREATE(?: OR REPLACE)? FUNCTION (?!public\.)(\w+)\(/,'CREATE FUNCTION public.$1(').replace(/^CREATE OR REPLACE FUNCTION /,'CREATE FUNCTION ');};
const extraSources=['scripts/internal-schema.sql','scripts/migrations/002-canonical-integration.sql','scripts/migrations/025-governed-payroll-control-import.sql','scripts/migrations/026-governed-payroll-novelties.sql','scripts/migrations/092-payroll-fixed-novelties.sql','scripts/migrations/093-native-fixed-novelties.sql','scripts/migrations/098-grh-curated-source-version.sql','scripts/migrations/099-grh-curated-consumers.sql','scripts/migrations/108-payroll-fixed-junin638.sql','scripts/migrations/146-own-consolidated-annulment.sql','scripts/lib/salary-administrative-identity-installation.mjs','scripts/lib/adoption-administrative-identity-installation.mjs','tests/fixtures/native-employee-installed-067.json'];
export function ownerDecisionQaEmbeddedPins(source){const result=[];for(const start of source.matchAll(/\[\{"(?:name|signature)":/g)){const at=start.index;let depth=0,quoted=false,escaped=false,end=at;for(;end<source.length;end++){const c=source[end];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}else if(c==='"')quoted=true;else if(c==='['||c==='{')depth++;else if(c===']'||c==='}')if(--depth===0){end++;break;}}let values;try{values=JSON.parse(source.slice(at,end));}catch{continue;}if(Array.isArray(values)&&values.every(p=>typeof p?.signature==='string'&&typeof p.sha256==='string'))result.push(...values);}return result;}

// Evaluate only the constant string substitutions in the already pinned
// SQL138/139 patches. No SQL grammar, queries, dynamic code or host evaluation.
function constantExpression(source,state){let at=0;const ws=()=>{while(/\s/.test(source[at]??'')&&at<source.length)at++;};function atom(){ws();const dollar=/^\$\w*\$/.exec(source.slice(at));if(dollar){const start=at+dollar[0].length,end=source.indexOf(dollar[0],start);assert.ok(end>=0);at=end+dollar[0].length;return source.slice(start,end);}let escape=false;if(source[at]==='E'&&source[at+1]==="'"){escape=true;at++;}if(source[at]==="'"){at++;let value='';while(at<source.length){if(source[at]==="'"){if(source[at+1]==="'"){value+="'";at+=2;continue;}at++;return value;}if(escape&&source[at]==='\\'){const next=source[++at];assert.ok(Object.hasOwn({'n':'\n','r':'\r','t':'\t','\\':'\\',"'":"'"},next),'OWNER_DECISION_QA_ESCAPE_UNSUPPORTED');value+=({'n':'\n','r':'\r','t':'\t','\\':'\\',"'":"'"})[next];at++;}else value+=source[at++];}assert.fail('OWNER_DECISION_QA_LITERAL_UNTERMINATED');}if(source.startsWith('replace(',at)){at+=8;const a=expr();ws();assert.equal(source[at++],',');const b=expr();ws();assert.equal(source[at++],',');const c=expr();ws();assert.equal(source[at++],')');assert.ok(b&&a.includes(b),'OWNER_DECISION_QA_PATCH_ANCHOR');return a.split(b).join(c);}const id=/^(?:original\.prosrc|[a-z_]+)/.exec(source.slice(at));assert.ok(id&&Object.hasOwn(state,id[0]),'OWNER_DECISION_QA_EXPRESSION_UNSUPPORTED:'+source.slice(at,30));at+=id[0].length;assert.equal(typeof state[id[0]],'string');return state[id[0]];}
 function expr(){let value=atom();ws();while(source.startsWith('||',at)){at+=2;value+=atom();ws();}return value;}const result=expr();ws();assert.equal(at,source.length,'OWNER_DECISION_QA_EXPRESSION_TRAILING');return result;
}
function assignmentBlock(source,state){let at=0;while(at<source.length){const quote=/^(?:E)?'(?:[^']|'')*'|^\$(\w*)\$[\s\S]*?\$\1\$/.exec(source.slice(at));if(quote){at+=quote[0].length;continue;}const m=/^(old_text|new_text|definition|previous|replacement)\s*:=/.exec(source.slice(at));if(!m){at++;continue;}at+=m[0].length;const start=at;let depth=0;while(at<source.length){const literal=/^(?:E)?'(?:[^']|'')*'|^\$(\w*)\$[\s\S]*?\$\1\$/.exec(source.slice(at));if(literal){at+=literal[0].length;continue;}if(source[at]==='(')depth++;if(source[at]===')')depth--;if(source[at]===';'&&depth===0)break;at++;}state[m[1]]=constantExpression(source.slice(start,at).trim(),state);at++;}return state;}
const section=(source,start,end)=>{const a=source.indexOf(start);assert.ok(a>=0,'OWNER_DECISION_QA_SECTION:'+start);const b=source.indexOf(end,a+start.length);assert.ok(b>a,'OWNER_DECISION_QA_SECTION_END:'+end);return source.slice(a+start.length,b);};
function deriveConsumerPatches(pool,add,load){const byName=n=>{const expected=CONSUMER_BEFORE_PINS.find(p=>p.name===n),all=[...pool.values()].filter(d=>name(d)===n&&(!expected||identity(d).sha256===expected.sha256));assert.ok(all.length,'OWNER_DECISION_QA_ORIGINAL_MISSING:'+n+':'+expected?.sha256);return all.at(-1);},s138=load('scripts/migrations/138-adopted-fixed-novelties.sql'),s139=load('scripts/migrations/139-adopted-monthly-novelties.sql');
 const branches={context:section(s138,"IF item.name='context' THEN","ELSIF item.name='identity_current' THEN"),identity_current:section(s138,"ELSIF item.name='identity_current' THEN","ELSIF item.name='export' THEN"),export:section(s138,"ELSIF item.name='export' THEN",'  ELSE'),other:section(s138,"   old_text:='public.payroll_fixed_registry_subject_by_contract_v1'",'  END IF;')};branches.other="old_text:='public.payroll_fixed_registry_subject_by_contract_v1'"+branches.other;
 for(const suffix of['context','identity_current','export','employee_by_contract','event_identity','native_dates','propose','review']){const d=byName('payroll_fixed_registry_'+suffix+'_v1'),state={'original.prosrc':body(d),definition:d};assignmentBlock(branches[suffix]??branches.other,state);state.definition=state.definition.split(state.old_text).join(state.new_text);if(suffix==='native_dates')state.definition=state.definition.replaceAll('public.native_employment_lifecycle_range_v1','public.payroll_fixed_registry_range_v2');if(suffix==='review')assignmentBlock(section(s138,"  IF item.name='review' THEN","  IF item.name='propose' THEN"),state);if(suffix==='propose')assignmentBlock(section(s138,"  IF item.name='propose' THEN",'  EXECUTE definition;'),state);add(state.definition);}
 const monthly={assert_context_v1:section(s139,"IF item.name='assert_context_v1' THEN","ELSIF item.name='subject_v2' THEN"),subject_v2:section(s139,"ELSIF item.name='subject_v2' THEN","ELSIF item.name='native_rows_valid_v2' THEN"),native_rows_valid_v2:section(s139,"ELSIF item.name='native_rows_valid_v2' THEN",'  ELSE'),native_subject_v2:section(s139,"   old_text:='public.native_employment_lifecycle_range_v1'",'  END IF;')};monthly.native_subject_v2="old_text:='public.native_employment_lifecycle_range_v1'"+monthly.native_subject_v2;
 for(const suffix of Object.keys(monthly)){const d=byName('payroll_novelty_'+suffix),state={'original.prosrc':body(d),definition:d};assignmentBlock(monthly[suffix],state);state.definition=state.definition.split(state.old_text).join(state.new_text);if(suffix==='subject_v2')assignmentBlock(section(s139,"  IF item.name IN('subject_v2','native_subject_v2') THEN",'  EXECUTE definition;'),state);add(state.definition);}
 const guard=byName('grh_effective_baseline_guard_v1');add(guard.replace(" IF TG_TABLE_NAME='employment_contract' THEN",()=>" IF TG_TABLE_NAME='employment_contract' THEN\n  IF TG_OP='UPDATE' AND public.employment_adoption_update_allowed_v1(OLD,NEW) IS TRUE THEN RETURN NEW; END IF;"));
 add(byName('own_run_fixed_v1').replaceAll('public.native_employment_lifecycle_range_v1','public.payroll_fixed_registry_range_v2'));add(byName('own_novelty_bootstrap_v1').replace('public.payroll_fixed_registry_subject_by_contract_v1','public.payroll_fixed_registry_subject_v2'));
}

/** Match installed bodies against reviewed source, never against observed DB
 * hashes. Published067 replacements and literal167/168 patches are explicit. */
export function buildOwnerDecisionQaDefinitions({read,sourceCommit,operationalPairBaseline='pre107',batch=buildMunicipalOwnerAdoptionDecisionInstallation({read,sourceCommit,operationalPairBaseline})}){
 assert.equal(batch.authority.operationalPairBaseline,operationalPairBaseline,'OWNER_DECISION_QA_BASELINE_CHANGED');
 const sources={},load=file=>{if(!Object.hasOwn(sources,file))sources[file]=lf(read(file));return sources[file];};
 const prior=buildOwnAgreementWorkingTimeInstallation({read:load,sourceCommit}),streaming=buildAdoptionSourceStreamingInstallation({read:load,sourceCommit}),pool=new Map(),latest=new Map(),seen=new Set(),pinHints=new Map();
 function add(value){const d=fixed(clean(value));if(!/^CREATE FUNCTION /.test(d))return;let p;try{p=identity(d);}catch{return;}if(p.name.startsWith('municipal_owner_adoption_'))return;pool.set(p.signature+'|'+p.sha256,d);latest.set(p.signature,d);}
 function visit(value){if(typeof value==='string')add(value);else if(value&&typeof value==='object'&&!seen.has(value)){seen.add(value);if(typeof value.signature==='string'&&typeof value.sha256==='string'&&typeof value.runtime==='boolean')pinHints.set(value.signature+'|'+value.sha256,value);Object.values(value).forEach(visit);}}
 const files=[...new Set([...Object.keys(batch.sourceHashes),...Object.keys(prior.sourceHashes),...extraSources])];
 for(const file of files)load(file);
 // Never install107 wholesale. Only the explicitly selected pre107 or
 // published107 authority/support definition enters this isolated fixture.
 const authorityProvenance=new Set(['scripts/migrations/107-operational-profile-catalog.sql','scripts/migrations/113-native-employee-self-access.sql','scripts/fixtures/operational-profile-before.sql']);
 for(const file of files.filter(p=>p.endsWith('.sql')&&!p.includes('/185-')&&!authorityProvenance.has(p)).sort()){
  const source=load(file);for(const s of splitPostgresStatements(source))add(s);
  for(const m of source.matchAll(/CREATE(?: OR REPLACE)? FUNCTION (?:public\.)?\w+\s*\([\s\S]*?\bAS\s+(\$[\w]*\$)[\s\S]*?\1/g))add(m[0]);
 }
 visit(prior);visit(streaming);visit(batch.operational);visit(batch.period);add(SALARY_ADMINISTRATIVE_CONTEXT);add(ADOPTION_ADMINISTRATIVE_CONTEXT);
 const published=JSON.parse(load('tests/fixtures/native-employee-installed-067.json'));assert.equal(published.version,'native-employee-installed-067.v1');
 for(const f of published.functions){assert.equal(ownerDecisionQaHash(f.body),f.sha256);const d=[...pool.values()].find(d=>name(d)===f.name);assert.ok(d,'OWNER_DECISION_QA_PUBLISHED_HEADER:'+f.name);add(replaceBody(d,f.body));}
 const authority=buildOwnerAuthorityQa({major:17,sourceCommit,read:load,schema:'mc_qa_fixed_092_'+'a'.repeat(32),operationalPairBaseline});
 for(const d of [...authority.originals,...authority.supportDefinitions])add(d);
 const use=load('scripts/migrations/167-classification-registration-use.sql');let count=0;
 for(const m of use.matchAll(/WHEN '(\w+)' THEN after_body:=(\$body\d+\$)([\s\S]*?)\2;/g)){const d=[...pool.values()].find(s=>name(s)===m[1]);assert.ok(d,'OWNER_DECISION_QA167_HEADER:'+m[1]);add(replaceBody(d,m[3]));count++;}assert.equal(count,5,'OWNER_DECISION_QA167_BODY_SET');
 const capacity=[...pool.values()].find(d=>identity(d).sha256==='d0be23b2b5f275b9ba91179bc2f303cf6828c33b5007b01cb68dc225512cb6cf');assert.ok(capacity);assert.equal(body(capacity).split('520093696').length,2);add(replaceBody(capacity,body(capacity).replace('520093696','1056964608')));
 const context=[...pool.values()].find(d=>identity(d).sha256==='b821464173f73ed7457a2892e246febfe6ab8535df4f37778b2366283c84cb7d');assert.ok(context);const patch137=load('scripts/migrations/137-adopted-operator-context.sql'),calls=[...patch137.matchAll(/(?:old_call|new_call) text:='((?:[^']|'')*)';/g)].map(m=>m[1].replaceAll("''","'"));assert.equal(calls.length,2);assert.equal(context.split(calls[0]).length,2);add(context.replace(calls[0],()=>calls[1]));
 const source093=load('scripts/migrations/093-native-fixed-novelties.sql'),branches093={propose:section(source093,"  IF name='propose' THEN","  ELSIF name IN ('review','event_identity') THEN"),event_identity:section(source093,"  ELSIF name IN ('review','event_identity') THEN","  ELSIF name='list' THEN"),list:section(source093,"  ELSIF name='list' THEN",'  ELSE'),export:section(source093,"  ELSE\n   previous:=$old$ LOCK TABLE",'  END IF;')};branches093.export="previous:=$old$ LOCK TABLE"+branches093.export;branches093.review=branches093.event_identity;
 const pins093=[...source093.matchAll(/\('(propose|review|event_identity|list|export)','[^']+','([a-f0-9]{64})','([a-f0-9]{64})'\)/g)];assert.equal(pins093.length,5);
 for(const pin of pins093){const d=[...pool.values()].find(d=>identity(d).sha256===pin[2]);assert.ok(d,'OWNER_DECISION_QA093_ORIGINAL:'+pin[1]);const state={definition:d};assignmentBlock(branches093[pin[1]],state);assert.equal(state.definition.split(state.previous).length,2);state.definition=state.definition.replace(state.previous,()=>state.replacement);
 if(pin[1]==='review'){assignmentBlock(section(source093,"  IF name='review' THEN","  IF name='list' THEN"),state);}
 if(pin[1]==='list'){state.definition=replaceBody(state.definition,body(state.definition).replace(/\nEND $/,"\nEXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'PAYROLL_FIXED_SESSION_BUSY';\nEND "));}
 state.definition=state.definition.replace('\nBEGIN','\n-- native-fixed093\nBEGIN');assert.equal(identity(state.definition).sha256,pin[3],'OWNER_DECISION_QA093_SHA:'+pin[1]);add(state.definition);}
 const patch110=splitPostgresStatements(load('scripts/migrations/110-native-employment-lifecycle.sql')).find(s=>s.startsWith('DO $fixed_export$'));assert.ok(patch110);const anchor110=/anchor text:=('(?:[^']|'')*');/.exec(patch110),call110=/d:=replace\(d,anchor,([\s\S]*?)\);\n EXECUTE d;/.exec(patch110);assert.ok(anchor110&&call110);const anchor=constantExpression(anchor110[1],{}),next=constantExpression(call110[1],{anchor});for(const d of [...pool.values()].filter(d=>name(d)==='payroll_fixed_registry_export_v1'&&d.includes(anchor)))add(d.replace(anchor,()=>next));
 deriveConsumerPatches(pool,add,load);
 const desired=new Map([...ownerDecisionQaEmbeddedPins(batch.originalReady),...batch.period.prerequisites,...batch.period.afterPins,...batch.authority.prerequisitePins,...batch.authority.supportPins,...batch.beforePins,identity(batch.legacyWriter)].map(p=>[p.signature,p]));
 // The current167 creation writer preserves the jurisdiction declared in095.
 // Replaying compact067 bodies above must not leave that writer paired with
 // the old receipt, which omits the declared field and the real API rejects.
 // Pin the existing095 helper only; keep it private and retain both bodies in
 // the pool as source history. No API check, IAM fact or runtime grant changes.
 const receiptSignature='public.native_employee_receipt_v1(native_employee_registration)',receiptSha256='1a57c2445f344f37d59c8c798237efefa0bb4671d101d9a177744c8fbac2c18e';
 const receiptDefinition=pool.get(receiptSignature+'|'+receiptSha256);assert.ok(receiptDefinition,'OWNER_DECISION_QA095_RECEIPT_REQUIRED');
 const receiptPin=identity(receiptDefinition);assert.equal(receiptPin.runtime,false,'OWNER_DECISION_QA095_RECEIPT_MUST_STAY_PRIVATE');
 assert.ok(!desired.has(receiptSignature)||desired.get(receiptSignature).sha256===receiptSha256,'OWNER_DECISION_QA095_RECEIPT_CONFLICT');desired.set(receiptSignature,receiptPin);
 // The same canonical seed must actually own SQL146 before201 can replace it.
 // Loading its reviewed source above feeds the existing table/function/metadata
 // plan, while these exact source pins retain its three declared facades only.
 const annulSource=load('scripts/migrations/146-own-consolidated-annulment.sql');assert.equal(ownerDecisionQaHash(annulSource),'8337df26dc3c22fe8c156e19d7511db6c537f08b219633f6add981c774a48fe6','OWNER_DECISION_QA146_SOURCE_CHANGED');
 const annulDefinitions=splitPostgresStatements(annulSource).map(clean).filter(d=>d.startsWith('CREATE FUNCTION public.own_annul_'));
 const annulRuntime=new Set(['own_annul_detail_v1','own_annul_attempt_v1','own_annul_command_v1']);assert.equal(annulDefinitions.length,5,'OWNER_DECISION_QA146_FUNCTION_SET');
 const annulPins=annulDefinitions.map(d=>{const p=identity(d);return{...p,runtime:annulRuntime.has(p.name)};});assert.equal(annulPins.filter(p=>p.runtime).length,3,'OWNER_DECISION_QA146_RUNTIME_SET');
 for(const pin of annulPins){assert.ok(pool.has(pin.signature+'|'+pin.sha256),'OWNER_DECISION_QA146_DEFINITION_MISSING:'+pin.signature);assert.ok(!desired.has(pin.signature)||desired.get(pin.signature).sha256===pin.sha256,'OWNER_DECISION_QA146_PIN_CONFLICT:'+pin.signature);desired.set(pin.signature,pin);}
 // SQL197 requires the close125 protections on these two liquidation bodies.
 // Preserve their complete124 preimages, and select only the two reviewed125
 // successors. Capture/readiness have their own later composition and stay put.
 assert.equal(ownerDecisionQaHash(load('scripts/lib/own-payroll-close-sql.mjs')),'b30aa8751521a4df39f43b76ecc521308a9a0f8f158757a7c4c7e84e30f833f7','OWNER_DECISION_QA125_HELPER_CHANGED');
 const close125=buildOwnCloseSql(load),close125Selections=[
  ['own_liquidation_command_v1','d9cb410d0ba21a298d50c23672e0afb9e3b661cc4fd23ba63175ab47c1eb3753','575d80c105d2ebf149e914bbfd975f21dbafa8c8bdd64d0eaf3e55ff357b96bc',true],
  ['own_liquidation_rows_v1','c3698d0ea703d4d87028c5b414a1f244dfe0158bd2a8ff7caaeda115b89acb17','7220b153509fc944c787104ce52c12af15678b8db29dbebf1dbecb32f993ea25',false]
 ];
 for(const[functionName,beforeSha,afterSha,runtime]of close125Selections){
  const before=close125.before.filter(d=>name(d)===functionName),after=close125.adapted.filter(d=>name(d)===functionName);assert.equal(before.length,1);assert.equal(after.length,1);
  const beforePin=identity(before[0]),afterPin=identity(after[0]);assert.equal(beforePin.sha256,beforeSha,'OWNER_DECISION_QA125_BEFORE_CHANGED');assert.equal(afterPin.sha256,afterSha,'OWNER_DECISION_QA125_AFTER_CHANGED');
  assert.deepEqual({...beforePin,sha256:null},{...afterPin,sha256:null},'OWNER_DECISION_QA125_METADATA_CHANGED');
  assert.ok(pool.has(beforePin.signature+'|'+beforeSha),'OWNER_DECISION_QA125_PREIMAGE_MISSING');
  assert.equal(desired.has(beforePin.signature),false,'OWNER_DECISION_QA125_EARLY_EPOCH_DEPENDENCY');
  add(after[0]);desired.set(afterPin.signature,{...afterPin,runtime});
 }
 // SQL201 protects the jurisdiction/namespace snapshot already in its source
 // predecessor. Only this private helper enters the seed; the namespace batch
 // also contains six older consumers which must keep their later selections.
 assert.equal(ownerDecisionQaHash(load('scripts/lib/salary-auxiliary-namespace-installation.mjs')),'6d492a4c56adba6a78242604f27b86ba18067359c1b28dc39879e50d43eed9b9','OWNER_DECISION_QA_SNAPSHOT_NAMESPACE_SOURCE_CHANGED');
 const namespaceSnapshot=buildSalaryAuxiliaryNamespaceSql({read:load,sourceCommit}),snapshotSignature='public.own_close_snapshot_v1(jsonb,jsonb)';
 const originalSnapshot=[...pool.values()].filter(d=>identity(d).signature===snapshotSignature&&identity(d).sha256==='02ef5825c524bb7b7168b2ec8f567c323482fee8ac7ac7fbfeba8071c37ee14f');assert.equal(originalSnapshot.length,1,'OWNER_DECISION_QA_SNAPSHOT125_REQUIRED');
 const jurisdictionSnapshot=namespaceSnapshot.originals.filter(d=>identity(d).signature===snapshotSignature),selectedSnapshot=namespaceSnapshot.changed.filter(d=>identity(d).signature===snapshotSignature);assert.equal(jurisdictionSnapshot.length,1);assert.equal(selectedSnapshot.length,1);
 const snapshotPin=identity(selectedSnapshot[0]);assert.equal(snapshotPin.sha256,'11d46e478ab606b0a9d4602e83a072a16924e47d7b8d2da064ed1d7abd2885b0','OWNER_DECISION_QA_SNAPSHOT201_PREDECESSOR');assert.equal(snapshotPin.runtime,false,'OWNER_DECISION_QA_SNAPSHOT_MUST_STAY_PRIVATE');
 for(const historical of [originalSnapshot[0],jurisdictionSnapshot[0]]){assert.deepEqual({...identity(historical),sha256:null},{...snapshotPin,sha256:null},'OWNER_DECISION_QA_SNAPSHOT_SECURITY_CHANGED');add(historical);}
 assert.ok(!desired.has(snapshotSignature),'OWNER_DECISION_QA_SNAPSHOT_EARLY_EPOCH_DEPENDENCY');add(selectedSnapshot[0]);desired.set(snapshotSignature,snapshotPin);
 // Runtime exposure comes from the two complete published GRANT statements,
 // not from the generic own_program/own_run header parser or a name prefix.
 // Keep each final source body already chosen by the graph:125 command and177
 // close detail must never be replaced by their older124/125 definitions here.
 const publishedFacadeGroups=[
  ['scripts/migrations/124-own-payroll-liquidation-decisions.sql','03035e3f7e126b1561222f1a894bcf1000dd586b6d05fb579cb4722d9aa41f4a','own_liquidation_',[
   'public.own_liquidation_bootstrap_v1(jsonb)',
   'public.own_liquidation_detail_v1(jsonb,uuid)',
   'public.own_liquidation_attempt_v1(jsonb,uuid)',
   'public.own_liquidation_command_v1(jsonb,jsonb,uuid)',
  ]],
  ['scripts/migrations/125-own-payroll-close.sql','443127dd55b9be5f37da47af303fcdd599b4d5dc0aad0a319a18253f8f139af5','own_close_',[
   'public.own_close_detail_v1(jsonb,text,text)',
   'public.own_close_attempt_v1(jsonb,uuid)',
   'public.own_close_group_v1(jsonb,uuid)',
   'public.own_close_command_v1(jsonb,jsonb,uuid)',
  ]],
 ];
 const classifiedFacadeSignatures=new Set();
 for(const[file,sourceSha,family,signatures]of publishedFacadeGroups){
  const source=load(file);assert.equal(ownerDecisionQaHash(source),sourceSha,'OWNER_DECISION_QA124125_FACADE_SOURCE_CHANGED:'+file);
  const statements=splitPostgresStatements(source).map(clean);
  const grants=statements.filter(s=>s.startsWith('GRANT EXECUTE ON FUNCTION ')&&s.includes('public.'+family));
  assert.deepEqual(grants,['GRANT EXECUTE ON FUNCTION '+signatures.join(',')+' TO municontrol_actions_runtime_app'],'OWNER_DECISION_QA124125_FACADE_GRANT_CHANGED:'+file);
  for(const signature of signatures){
   assert.equal(classifiedFacadeSignatures.has(signature),false,'OWNER_DECISION_QA124125_FACADE_DUPLICATE');classifiedFacadeSignatures.add(signature);
   const functionName=signature.slice(7,signature.indexOf('('));
   const published=statements.filter(s=>s.startsWith('CREATE FUNCTION public.'+functionName+'('));
   assert.equal(published.length,1,'OWNER_DECISION_QA124125_FACADE_DEFINITION_REQUIRED:'+signature);
   const canonical=identity(fixed(published[0]));assert.equal(canonical.signature,signature);
   const priorSelection=desired.get(signature);
   if(priorSelection)assert.equal(priorSelection.runtime,true,'OWNER_DECISION_QA124125_EARLY_EPOCH_ACL_CONFLICT:'+signature);
   const current=priorSelection?pool.get(signature+'|'+priorSelection.sha256):latest.get(signature);
   assert.ok(current,'OWNER_DECISION_QA124125_FINAL_SOURCE_MISSING:'+signature);
   const pin=identity(current);assert.equal(pin.signature,signature);
   assert.equal(pool.get(signature+'|'+pin.sha256),current,'OWNER_DECISION_QA124125_FINAL_SOURCE_NOT_IN_POOL:'+signature);
   if(priorSelection)assert.equal(pin.sha256,priorSelection.sha256,'OWNER_DECISION_QA124125_FINAL_SOURCE_CHANGED:'+signature);
   assert.deepEqual({...pin,sha256:null,runtime:null},{...canonical,sha256:null,runtime:null},'OWNER_DECISION_QA124125_FACADE_SECURITY_CHANGED:'+signature);
   desired.set(signature,{...pin,runtime:true});
  }
 }
 assert.equal(classifiedFacadeSignatures.size,8);
 // Restore the exact three runtime facades already published by067.
 // Select their current source bodies; never restore the older067 create body.
 const native067File='scripts/migrations/067-native-employee-registration.sql';
 const native067Source=load(native067File);
 assert.equal(ownerDecisionQaHash(native067Source),'aa33538cea459a275de8056b8316f3eb4465ebb88ad1de54578bb24380c4d749','OWNER_DECISION_QA067_SOURCE_CHANGED');
 const native067Signatures=[
  'public.native_employee_bootstrap_v1(jsonb)',
  'public.native_employee_attempt_v1(jsonb,uuid)',
  'public.native_employee_create_v1(jsonb,jsonb,text,uuid)',
 ];
 const native067Statements=splitPostgresStatements(native067Source).map(clean);
 const native067Grant='GRANT EXECUTE ON FUNCTION '+native067Signatures.map(s=>s.slice(7)).join(',')+' TO municontrol_actions_runtime_app';
 assert.equal(native067Statements.filter(s=>s===native067Grant).length,1,'OWNER_DECISION_QA067_PUBLISHED_GRANT_REQUIRED');
 const native067Definitions=native067Statements.filter(s=>/^CREATE(?: OR REPLACE)? FUNCTION /.test(s)).map(fixed);
 for(const signature of native067Signatures){
  const functionName=signature.slice(7,signature.indexOf('('));
  const declarations=native067Definitions.filter(d=>d.startsWith('CREATE FUNCTION public.'+functionName+'('));
  assert.equal(declarations.length,1,'OWNER_DECISION_QA067_DECLARATION_REQUIRED:'+signature);
  const canonical=identity(declarations[0]);assert.equal(canonical.signature,signature);
  const previous=desired.get(signature);
  if(previous)assert.equal(previous.runtime,true,'OWNER_DECISION_QA067_EARLY_EPOCH_ACL_CONFLICT:'+signature);
  const current=previous?pool.get(signature+'|'+previous.sha256):latest.get(signature);
  assert.ok(current,'OWNER_DECISION_QA067_FINAL_SOURCE_REQUIRED:'+signature);
  const pin=identity(current);assert.equal(pin.signature,signature);
  assert.equal(pool.get(signature+'|'+pin.sha256),current,'OWNER_DECISION_QA067_FINAL_SOURCE_NOT_IN_POOL:'+signature);
  if(previous)assert.equal(pin.sha256,previous.sha256,'OWNER_DECISION_QA067_FINAL_BODY_CHANGED:'+signature);
  assert.deepEqual({...pin,sha256:null,runtime:null},{...canonical,sha256:null,runtime:null},'OWNER_DECISION_QA067_METADATA_CHANGED:'+signature);
  desired.set(signature,{...pin,runtime:true});
 }
 const missing=[...desired.values()].filter(p=>!pool.has(p.signature+'|'+p.sha256));assert.deepEqual(missing.map(p=>p.signature+':'+p.sha256),[],'OWNER_DECISION_QA_CANONICAL_DEFINITION_MISSING');
 for(const p of desired.values())latest.set(p.signature,pool.get(p.signature+'|'+p.sha256));
 assert.equal(latest.get('public.employment_adoption_decision_guard_v1()'),fixed(batch.originalGuard));assert.equal(latest.get('public.municipal_adoption_ready_v1()'),fixed(batch.originalReady));
 const definitions=[...latest.values()];return{batch,prior,sources,sourceHashes:Object.fromEntries(Object.entries(sources).map(([p,s])=>[p,ownerDecisionQaHash(s)])),pool,pinHints,definitions,desired:[...desired.values()],connects:false,executesSql:false};
}

// The authority fixture owns all actual IAM/session/membership declarations.
// Additional table declarations preserve source constraints and foreign keys.
export function ownerDecisionQaTablePlan(sources,existing){
 const pool=new Map();for(const[file,source]of Object.entries(sources).filter(([p])=>p.endsWith('.sql')&&!p.includes('/185-')).sort())for(const raw of splitPostgresStatements(source)){
  const s=clean(raw),m=/^CREATE TABLE(?: IF NOT EXISTS)? (?:public\.)?(\w+)\s*\(/.exec(s);if(m&&(file!=='scripts/internal-schema.sql'||['grh_employees','grh_absences','grh_leaves','grh_family','grh_catalog_rows'].includes(m[1]))&&!existing.has(m[1])&&!pool.has(m[1]))pool.set(m[1],s);
 }
 const done=new Set(existing),statements=[];while(pool.size){let progressed=false;for(const[n,s]of pool){const refs=[...s.matchAll(/\bREFERENCES\s+(?:public\.)?(\w+)\s*\(/g)].map(m=>m[1]);if(refs.every(r=>r===n||done.has(r))){statements.push(s);done.add(n);pool.delete(n);progressed=true;}}assert.ok(progressed,'OWNER_DECISION_QA_DDL_CLOSURE:'+JSON.stringify([...pool].map(([n,s])=>({table:n,missing:[...s.matchAll(/\bREFERENCES\s+(?:public\.)?(\w+)\s*\(/g)].map(m=>m[1]).filter(r=>r!==n&&!done.has(r))}))));}
 return{statements,tables:[...done].sort()};
}

// Bounded static audit of the physical declarations, insert targets and
// unambiguous typed/SQL aliases. Dynamic JSON fields and PostgreSQL catalogue
// aliases are deliberately not interpreted as physical fixture columns.
function commaParts(source){const result=[];let start=0,depth=0,quoted=false;for(let at=0;at<source.length;at++){const c=source[at];if(quoted){if(c==="'"&&source[at+1]==="'")at++;else if(c==="'")quoted=false;continue;}if(c==="'")quoted=true;else if(c==='(')depth++;else if(c===')')depth--;else if(c===','&&depth===0){result.push(source.slice(start,at));start=at+1;}}result.push(source.slice(start));return result;}
const maskStrings=source=>source.replace(/--[^\n]*|\/(?:\*[^]*?\*\/)\s*|(?:E|U&)?'(?:[^']|'')*'/g,s=>' '.repeat(s.length));
export function ownerDecisionQaColumnAudit(seed,definitions=[]){
 const tables=new Map(),unknown=[],bindingsChecked=[],statements=splitPostgresStatements(seed).map(clean),reserved=new Set(['where','join','on','set','values','returning','cross','left','right','inner','outer','full','order','group','limit','for','union','lateral','with','ordinality']);
 for(const s of statements){let m=/^CREATE TABLE(?: IF NOT EXISTS)? (?:(?:\w+)\.)?(\w+)\s*\(([\s\S]*)\)\s*$/.exec(s);if(m){const columns=new Set();for(const part of commaParts(m[2])){const column=/^\s*(\w+)\s+/.exec(maskStrings(part))?.[1];if(column&&!['constraint','primary','foreign','check','unique','exclude'].includes(column.toLowerCase()))columns.add(column);}tables.set(m[1],columns);continue;}
  m=/^ALTER TABLE\s+(?:(?:\w+)\.)?(\w+)\s+ADD COLUMN(?: IF NOT EXISTS)?\s+(\w+)\b/.exec(s);if(m&&tables.has(m[1]))tables.get(m[1]).add(m[2]);
 }
 const typedBindings=sql=>{const aliases=new Map();for(const m of sql.matchAll(/\b(\w+)\s+(?:public|mc_qa_fixed_092_[a-f0-9]{32})\.(\w+)(?:%ROWTYPE)?(?=\s*[,;)])/gi))if(tables.has(m[2]))aliases.set(m[1],new Set([m[2]]));return aliases;};
 const inspect=(source,label,variables=new Map())=>{const sql=maskStrings(source),root={start:0,end:sql.length,parent:null,aliases:new Map()},regions=[root],stack=[];
  // A nested SELECT has its own aliases. A missing local alias may correlate
  // to its parent; a local JSON alias shadows only inside that SELECT.
  for(let at=0;at<sql.length;at++){if(sql[at]==='(')stack.push(at);else if(sql[at]===')'&&stack.length){const begin=stack.pop();if(/^\s*(?:SELECT|WITH)\b/i.test(sql.slice(begin+1,at)))regions.push({start:begin+1,end:at,parent:null,aliases:new Map()});}}
  // Set-operation arms are sibling queries, even without parentheses.
  for(const region of [...regions]){let depth=0,begin=region.start;const arms=[];for(let at=region.start;at<region.end;at++){if(sql[at]==='(')depth++;else if(sql[at]===')')depth--;else if(depth===0&&(at===region.start||!/[\w]/.test(sql[at-1]))){const operator=/^(?:UNION|INTERSECT|EXCEPT)\b/i.exec(sql.slice(at,region.end));if(operator){arms.push({start:begin,end:at,parent:null,aliases:new Map()});at+=operator[0].length-1;begin=at+1;}}}if(arms.length)regions.push(...arms,{start:begin,end:region.end,parent:null,aliases:new Map()});}
  regions.sort((a,b)=>a.start-b.start||b.end-a.end);
  for(const region of regions.slice(1)){let parent=root;for(const possible of regions){if(possible===region)break;if(possible.start<=region.start&&possible.end>=region.end&&possible.end-possible.start<parent.end-parent.start)parent=possible;}region.parent=parent;}
  const scope=at=>{let selected=root;for(const region of regions)if(at>=region.start&&at<region.end&&region.end-region.start<=selected.end-selected.start)selected=region;return selected;};
  const add=(at,alias,table)=>{const aliases=scope(at).aliases;if(!aliases.has(alias))aliases.set(alias,new Set());aliases.get(alias).add(table);};
  const lookup=(at,alias)=>{for(let region=scope(at);region;region=region.parent)if(region.aliases.has(alias))return region.aliases.get(alias);return variables.get(alias);};
  for(const m of sql.matchAll(/\b(?:FROM|JOIN|UPDATE)\s+(?:(?:public|mc_qa_fixed_092_[a-f0-9]{32})\.)?(\w+)(?:\s+(?:AS\s+)?(\w+))?/gi)){add(m.index,m[1],m[1]);if(m[2]&&!reserved.has(m[2].toLowerCase()))add(m.index,m[2],m[1]);}
  for(const m of sql.matchAll(/\b(?:FROM|JOIN)\s+(?:LATERAL\s+)?(?:(?:public|mc_qa_fixed_092_[a-f0-9]{32})\.)?(\w+)\s*\(/gi)){let at=m.index+m[0].length,depth=1;for(;at<sql.length&&depth;at++){if(sql[at]==='(')depth++;else if(sql[at]===')')depth--;}const alias=/^\s+(?:WITH\s+ORDINALITY\s+)?(?:AS\s+)?(\w+)/i.exec(sql.slice(at))?.[1];if(alias&&!reserved.has(alias.toLowerCase())){const cast=m[1]==='jsonb_populate_record'?/NULL::(?:public|mc_qa_fixed_092_[a-f0-9]{32})\.(\w+)/.exec(sql.slice(m.index,at))?.[1]:null;add(m.index,alias,cast??'@function:'+m[1]);}}
  for(const m of sql.matchAll(/\b(?:FROM|JOIN)\s*\(/gi)){let at=m.index+m[0].length,depth=1;for(;at<sql.length&&depth;at++){if(sql[at]==='(')depth++;else if(sql[at]===')')depth--;}const alias=/^\s+(?:AS\s+)?(\w+)/i.exec(sql.slice(at))?.[1];if(alias&&!reserved.has(alias.toLowerCase()))add(m.index,alias,'@subquery');}
  for(const m of sql.matchAll(/,\s*(\w+)\s+(\w+)(?=\s+(?:WHERE|JOIN|ON|FOR)\b)/gi))add(m.index,m[2],m[1]);
  for(const m of sql.matchAll(/\bINSERT\s+INTO\s+(?:(?:public|mc_qa_fixed_092_[a-f0-9]{32})\.)?(\w+)\s*\(([^)]*)\)/gi))if(tables.has(m[1]))for(const part of m[2].split(',')){const column=part.trim();bindingsChecked.push(label+':'+m[1]+'.'+column);if(!tables.get(m[1]).has(column))unknown.push({label,table:m[1],column,kind:'insert'});}
  for(const m of sql.matchAll(/\b(\w+)\.(\w+)\b/g)){const bound=lookup(m.index,m[1]);if(!bound||[...bound].some(t=>!tables.has(t)))continue;bindingsChecked.push(label+':'+m[0]);if(![...bound].some(t=>tables.get(t).has(m[2])))unknown.push({label,alias:m[1],tables:[...bound],column:m[2],kind:'reference'});}
 };
 for(const s of statements)if(!/^CREATE(?: OR REPLACE)? FUNCTION/.test(s))inspect(s,'seed',typedBindings(maskStrings(s)));
 for(const d of definitions){const source=body(d),variables=typedBindings(maskStrings(d));for(const s of splitPostgresStatements(source))inspect(s,identity(d).name,variables);}
 return{tables:Object.fromEntries([...tables].map(([table,columns])=>[table,[...columns].sort()])),checkedReferences:bindingsChecked.length,unknown,scope:'physical inserts and unambiguous aliases by statement/subquery; not dynamic SQL or PostgreSQL catalogue aliases'};
}

export function buildOwnerDecisionQa({major,sourceCommit,read,schema='mc_qa_fixed_092_'+randomUUID().replaceAll('-',''),operationalPairBaseline='pre107'}){
 assert.ok([17,18].includes(major));assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.equal(typeof read,'function');assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 const graph=buildOwnerDecisionQaDefinitions({read,sourceCommit,operationalPairBaseline}),base=buildOwnerAuthorityQa({major,sourceCommit,read,schema,operationalPairBaseline});
 const existing=new Set([...base.seed.matchAll(/CREATE TABLE(?: IF NOT EXISTS)? (?:\w+\.)?(\w+)\s*\(/g)].map(m=>m[1]));
 const tables=ownerDecisionQaTablePlan(graph.sources,existing);
 // Authority relocation also maps explicit public namespace predicates and
 // search_path metadata. Every changed digest comes from a source body.
 const relocate=sql=>base.relocate(sql).replace(/('+)public\1(?=::regnamespace)/g,(_,quotes)=>quotes+schema+quotes).replaceAll('pg_get_indexdef(i.indexrelid)',`replace(pg_get_indexdef(i.indexrelid),$qa_namespace$${schema}.$qa_namespace$,$qa_public$public.$qa_public$)`).replaceAll('pg_get_triggerdef(t.oid)',`replace(pg_get_triggerdef(t.oid),$qa_namespace$${schema}.$qa_namespace$,$qa_public$public.$qa_public$)`);
 const definitions=graph.definitions,allDefinitions=[...definitions,graph.batch.authority.newDefinition,...graph.batch.definitions,graph.batch.guard,graph.batch.ready],hashes={...base.hashes};
 // A readiness body embeds the child digests. Derive its relocated hash only
 // after replacing those digests, to a fixed point, from source bytes alone.
 let stable=false;for(let pass=0;pass<12;pass++){let changed=false;for(const d of allDefinitions){let value=relocate(d);for(const[a,b]of Object.entries(hashes))value=value.replaceAll(a,b);const before=ownerDecisionQaHash(body(d)),after=ownerDecisionQaHash(body(value));if(hashes[before]!==after){hashes[before]=after;changed=true;}}if(!changed){stable=true;break;}}assert.ok(stable,'OWNER_DECISION_QA_HASH_GRAPH_CYCLE');
 const normalized=s=>{let value=relocate(s);for(const[a,b]of Object.entries(hashes))value=value.replaceAll(a,b);return value;};
 const local=Object.fromEntries(['rehearsal','installation','repetition','verification','rollback','rollbackVerification'].map(k=>[k,graph.batch[k].map(normalized)]));
 const qa={major,schema,sourceCommit,graph,base,tables,definitions,hashes,normalized,relocate,sourceHashes:graph.sourceHashes,local,connects:false,executesSql:false};
 const completed={...qa,...ownerDecisionQaSeed(qa)};completed.columnAudit=ownerDecisionQaColumnAudit(completed.seed+';'+graph.batch.statements.filter(s=>/^CREATE TABLE/.test(s)).map(normalized).join(';'),[...definitions,...graph.batch.definitions]);
 assert.deepEqual(completed.columnAudit.unknown,[],'OWNER_DECISION_QA_COLUMN_MISSING');return completed;
}

const json=v=>q(JSON.stringify(v))+'::jsonb';
const coreEntities=['payrollRuns','payrollSnapshot','movements','payrollMonthly','employmentReconciliation'];
const curatedEntities=['grh_employees','grh_absences','grh_leaves','grh_family','grh_catalog_rows'];
const parentSource='5a604acfe5ea32832b630d8aab29e494038d4c8940b231e283a53d14112665c7';
function canonicalStatement(source,pattern){const matches=splitPostgresStatements(source).map(clean).filter(s=>pattern.test(s));assert.equal(matches.length,1,'OWNER_DECISION_QA_STATEMENT:'+pattern);return matches[0];}

/** All fixture facts are fictional. The physical roots and the sealed source
 * projections use their actual declarations and source functions. No resolver,
 * capability, source adapter or conservation guard is replaced by a fixture. */
export function ownerDecisionQaSeed(qa){
 const {base,graph,normalized:n,relocate:r}=qa,a=base.actor,i=base.ids;
 const ids={...i,...Object.fromEntries(['baselineBatch','core','curated','revision','catalogProposal','catalogReview','checkerPerson','checkerContract','checkerMembership','checkerSession'].map(k=>[k,randomUUID()]))};
 const checker={...a,actorEmail:'independent-checker@example.invalid',membershipId:ids.checkerMembership,actorSessionId:ids.checkerSession};
 const rows=Array.from({length:63},(_,index)=>({personId:randomUUID(),contractId:randomUUID(),legajo:String(90001+index),dni:String(98000001+index),sourcePersonId:700001+index,active:true}));
 rows.push({personId:i.person,contractId:i.contract,legajo:'QA-184',dni:'99000081',sourcePersonId:799981,active:false},{personId:ids.checkerPerson,contractId:ids.checkerContract,legajo:'QA-185-CHECKER',dni:'99000083',sourcePersonId:799983,active:false});
 const source=file=>graph.sources[file],migration=number=>source(Object.keys(graph.sources).find(p=>p.startsWith('scripts/migrations/'+number+'-')));
 const importDdl=canonicalStatement(source('scripts/internal-schema.sql'),/^CREATE TABLE IF NOT EXISTS data_import_runs\s*\(/);
 const userDdl=canonicalStatement(source('scripts/internal-schema.sql'),/^CREATE TABLE IF NOT EXISTS internal_users\s*\(/);
 const userAlters=[...splitPostgresStatements(migration('004')).map(clean).filter(s=>/^ALTER TABLE internal_users (?:ADD COLUMN|ALTER COLUMN)/.test(s)),...splitPostgresStatements(migration('005')).map(clean).filter(s=>/^ALTER TABLE internal_users /.test(s))];
 let foundation=base.seed.replace('CREATE TABLE data_import_runs(id bigint PRIMARY KEY)',importDdl)
  .replace('CREATE TABLE internal_users(email text PRIMARY KEY,display_name text,password_hash text,active boolean NOT NULL,auth_mode varchar(16) NOT NULL,identity_version integer NOT NULL CHECK(identity_version>0))',()=>userDdl+';'+userAlters.join(';'))
  .replaceAll('INSERT INTO internal_users VALUES(','INSERT INTO internal_users(email,display_name,password_hash,active,auth_mode,identity_version) VALUES(')
  .replace('INSERT INTO data_import_runs VALUES(1)',`INSERT INTO data_import_runs(id,source_name,source_sha256,source_cutoff,status) VALUES(1,'grh_junin_curated',${q('c'.repeat(64))},'2026-09-01 00:00:00','completed')`);
 assert.ok(foundation.includes(importDdl));
 // Do not derive a post-install state by running an old installer against
 // unverified current bodies. Definitions already matched the source pins.
 const functions=graph.definitions.map(d=>n(d).replace(/^CREATE FUNCTION /,'CREATE OR REPLACE FUNCTION '));
 const acl=graph.definitions.map(d=>{const p=identity(d),pin=graph.desired.find(x=>x.signature===p.signature)??graph.pinHints.get(p.signature+'|'+p.sha256);return `REVOKE ALL ON FUNCTION ${r(p.signature)} FROM PUBLIC,municontrol_actions_runtime_app`+(pin?.runtime?`;GRANT EXECUTE ON FUNCTION ${r(p.signature)} TO municontrol_actions_runtime_app`:'');});
 const prerequisites=[...qa.tables.statements.map(r),...functions,...acl];
 const fixture=[
  `INSERT INTO internal_users(email,display_name,password_hash,active,auth_mode,identity_version) VALUES(${q(checker.actorEmail)},'Revisor ficticio QA',NULL,true,'managed',4)`,
  "INSERT INTO iam_role(role_key,label,description,scope_kind) VALUES('QA_ADOPTION_CHECKER','QA','Ficticio','tenant')",
  "INSERT INTO iam_capability(capability_key,label,description,scope_kind) VALUES('employee.record.approve','QA','Ficticio','tenant')",
  ...['actions.read','workforce.employee.read','employee.record.approve'].map(c=>`INSERT INTO iam_role_capability VALUES('QA_ADOPTION_CHECKER',${q(c)})`),
  `INSERT INTO tenant_membership(id,tenant_id,user_email,role_key,status,invited_by_user_email,activated_at) VALUES(${q(ids.checkerMembership)},${q(i.tenant)},${q(checker.actorEmail)},'QA_ADOPTION_CHECKER','active',${q(a.actorEmail)},now())`,
  `INSERT INTO tenant_identity_session(id,user_email,active_tenant_id,source,auth_level,session_version,identity_version,expires_at) VALUES(${q(ids.checkerSession)},${q(checker.actorEmail)},${q(i.tenant)},'membership','mfa',3,4,now()+interval '1 hour')`,
  `INSERT INTO person_identity(id,full_name,dni) VALUES(${q(ids.checkerPerson)},'Identidad ficticia QA185', '99000083')`,
  `INSERT INTO employment_contract(id,person_id,source_system,source_batch_id,legacy_company_id,legacy_legajo,status,start_date,end_date) VALUES(${q(ids.checkerContract)},${q(ids.checkerPerson)},'GRH',${q(i.batch)},101,'QA-185-CHECKER','inactive','2000-01-01','2020-01-01')`,
  `INSERT INTO tenant_action_authority(membership_id,tenant_id) VALUES(${q(ids.checkerMembership)},${q(i.tenant)})`,
  `INSERT INTO tenant_action_employment_link(membership_id,tenant_id,source_binding_id,employment_contract_id,linked_by_user_email) VALUES(${q(ids.checkerMembership)},${q(i.tenant)},${q(i.binding)},${q(ids.checkerContract)},${q(checker.actorEmail)})`,
  `INSERT INTO source_import_batch(id,source_system,source_database,source_file_name,source_sha256,source_cutoff,legacy_import_run_id,validation_state) VALUES(${q(ids.baselineBatch)},'GRH','owner_qa_source','fictional-baseline',${q('C'.repeat(64))},timestamp '2026-09-01 00:00:00' AT TIME ZONE 'America/Argentina/Buenos_Aires',1,'published')`,
  `INSERT INTO data_import_runs(id,source_name,source_sha256,source_cutoff,status) VALUES(2,'grh_junin_curated',${q(parentSource)},'2026-09-10 15:17:30','completed')`,
  `UPDATE source_import_batch SET source_sha256=${q(parentSource.toUpperCase())},source_cutoff=timestamp '2026-09-10 15:17:30' AT TIME ZONE 'America/Argentina/Buenos_Aires',legacy_import_run_id=2 WHERE id=${q(i.batch)}`,
 ];
 for(const row of rows){
  const fullName=row.personId===i.person?'Identidad administrativa ficticia QA':'Identidad ficticia QA185';
  const payload={personId:row.sourcePersonId,identity:{documentNumber:row.dni,cuil:null,fullName,birthDate:null,sexLabel:null,sexCode:null},employment:{activeProxy:row.active,organizationId:'1'},sourceFields:{iddepartamento:'1'},sourceKey:{companyCode:'101',employeeNumber:row.legajo},sourceProvenance:{table:'legajo',primaryKey:{CODI_01:'101',LEGA_12:row.legajo}},sourceReferences:{department:{table:'departamento',primaryKey:{iddepartamento:'1'},sourceFields:{nombre:'042'}}}};
  if(row.active)fixture.push(`INSERT INTO person_identity(id,full_name,dni) VALUES(${q(row.personId)},${q(fullName)},${q(row.dni)})`,`INSERT INTO employment_contract(id,person_id,source_system,source_batch_id,legacy_company_id,legacy_legajo,status,start_date,agreement_code,category_code,organization_unit_source_id,sector_source_id,jurisdiction_code) VALUES(${q(row.contractId)},${q(row.personId)},'GRH',${q(i.batch)},101,${q(row.legajo)},'active','2000-01-01','1','1','1','1',NULL)`);
  fixture.push(`INSERT INTO source_xref(source_system,source_entity,source_id,source_batch_id,canonical_entity,canonical_id,match_method,confidence,valid_from) VALUES('GRH','persona',${q(row.sourcePersonId)},${q(ids.baselineBatch)},'person_identity',${q(row.personId)},'grh_person_seed',1,'2026-09-01')`,
   `INSERT INTO employment_status_snapshot(employment_contract_id,snapshot_date,administrative_status,payroll_status,source_batch_id,evidence) VALUES(${q(row.contractId)},'2026-09-01',${q(row.active?'active':'inactive')},'not_applicable',${q(ids.baselineBatch)},${json({administrativeActive:row.active,liquidatedCurrent:false,evidenceStatus:'synthetic_explicit'})})`,
   `INSERT INTO grh_employees(company_id,legajo,person_id,nombre,dni,fecha_ingreso,fecha_egreso,activo,convenio_code,categoria_code,cargo_code,sector_code,source_payload,import_run_id) VALUES(101,${q(row.legajo)},${row.sourcePersonId},${q(fullName)},${q(row.dni)},'2000-01-01',${row.active?'NULL':"'2020-01-01'"},${row.active},'1','1','1','1',${json(payload)},1)`);
 }
 const coreArray='ARRAY['+coreEntities.map(q).join(',')+']',curatedArray='ARRAY['+curatedEntities.map(q).join(',')+']';
 fixture.push(`DO $parents$ DECLARE fp jsonb;ev jsonb;counts jsonb;publication text;BEGIN
 SELECT jsonb_object_agg(e,grh_core_source_base_fingerprint_v1(${q(ids.baselineBatch)},e)) INTO fp FROM unnest(${coreArray})e;
 SELECT jsonb_object_agg(key,jsonb_build_object('counts',jsonb_build_object('candidate',(value->>'rows')::bigint))) INTO ev FROM jsonb_each(fp);
 INSERT INTO grh_core_source_version(id,tenant_id,source_binding_id,baseline_batch_id,baseline_import_run_id,source_sha256,baseline_source_sha256,payload_sha256,manifest_sha256,baseline_manifest_sha256,source_cutoff,baseline_cutoff,source_payroll_date,baseline_payroll_date,source_profile,source_database,source_company_id,entity_evidence,baseline_fingerprints)
 VALUES(${q(ids.core)},${q(i.tenant)},${q(i.binding)},${q(ids.baselineBatch)},1,${q(parentSource)},${q('c'.repeat(64))},employment_adoption_hash_v1(jsonb_build_object('fixture','core-payload','fp',fp)),employment_adoption_hash_v1(jsonb_build_object('fixture','core-manifest','fp',fp)),employment_adoption_hash_v1(jsonb_build_object('fixture','baseline-core','fp',fp)),'2026-09-10 15:17:30','2026-09-01 00:00:00','2026-09-01','2026-08-01','synthetic-parent','owner_qa_source',101,ev,fp);
 INSERT INTO grh_core_source_version_seal SELECT ${q(ids.core)},jsonb_object_agg(e,grh_core_source_version_fingerprint_v1(${q(ids.core)},e)),now() FROM unnest(${coreArray})e;
 SELECT jsonb_object_agg(e,grh_curated_source_base_fingerprint_v1(1,e)) INTO fp FROM unnest(${curatedArray})e;
 SELECT jsonb_object_agg(key,jsonb_build_object('counts',jsonb_build_object('candidate',(value->>'rows')::bigint))),jsonb_object_agg(key,(value->>'rows')::bigint) INTO ev,counts FROM jsonb_each(fp);
 UPDATE data_import_runs SET table_counts=counts,quality_flags='[]'::jsonb WHERE id=2;
 INSERT INTO grh_curated_source_version(id,tenant_id,source_binding_id,core_version_id,source_batch_id,import_run_id,baseline_batch_id,baseline_import_run_id,baseline_source_sha256,source_sha256,baseline_cutoff,source_cutoff,payload_sha256,baseline_manifest_sha256,manifest_sha256,source_database,source_company_id,entity_evidence,baseline_fingerprints,candidate_expected)
 VALUES(${q(ids.curated)},${q(i.tenant)},${q(i.binding)},${q(ids.core)},${q(i.batch)},2,${q(ids.baselineBatch)},1,${q('c'.repeat(64))},${q(parentSource)},'2026-09-01 00:00:00','2026-09-10 15:17:30',employment_adoption_hash_v1(jsonb_build_object('fixture','curated-payload','fp',fp)),employment_adoption_hash_v1(jsonb_build_object('fixture','baseline-curated','fp',fp)),employment_adoption_hash_v1(jsonb_build_object('fixture','curated-manifest','fp',fp)),'owner_qa_source',101,ev,fp,jsonb_build_object('tableCounts',counts,'qualityFlags','[]'::jsonb));
 INSERT INTO grh_curated_source_version_seal SELECT ${q(ids.curated)},jsonb_object_agg(e,grh_curated_source_version_fingerprint_v1(${q(ids.curated)},e)),now() FROM unnest(${curatedArray})e;
 publication:=employment_adoption_hash_v1(jsonb_build_object('core',${q(ids.core)},'curated',${q(ids.curated)},'fixture','selected-parent'));
 INSERT INTO grh_effective_source_binding(tenant_id,source_binding_id,source_version_id,baseline_batch_id,source_batch_id,import_run_id,publication_sha256) VALUES(${q(i.tenant)},${q(i.binding)},${q(ids.core)},${q(ids.baselineBatch)},${q(i.batch)},2,publication);
 SELECT jsonb_object_agg(entity,jsonb_build_object('baseline',fingerprint,'candidate',fingerprint,'changes',jsonb_build_object('add',0,'remove',0,'replace',0))) INTO ev FROM(SELECT 'core/'||e entity,grh_core_source_version_fingerprint_v1(${q(ids.core)},e) fingerprint FROM unnest(${coreArray})e UNION ALL SELECT 'curated/'||e,grh_curated_source_version_fingerprint_v1(${q(ids.curated)},e) FROM unnest(${curatedArray})e) fingerprints;
 INSERT INTO grh_final_source_revision(id,tenant_id,source_binding_id,parent_core_version_id,parent_curated_version_id,parent_publication_sha256,source_profile,source_sha256,source_cutoff,core_manifest_sha256,curated_manifest_sha256,package_sha256,evidence)
 SELECT ${q(ids.revision)},${q(i.tenant)},${q(i.binding)},${q(ids.core)},${q(ids.curated)},publication,'grh-junin-2026-10-01','50a4cc2673be5e275dc5850aa8779f46de82dd81733a87e4b2cfa2aec49e025f','2026-10-01 15:17:29',c.manifest_sha256,v.manifest_sha256,employment_adoption_hash_v1(jsonb_build_object('fixture','final-package','evidence',ev)),ev FROM grh_core_source_version c,grh_curated_source_version v WHERE c.id=${q(ids.core)} AND v.id=${q(ids.curated)};
 INSERT INTO grh_final_source_seal SELECT ${q(ids.revision)},jsonb_object_agg(e,grh_final_source_fingerprint_v1(${q(ids.revision)},e,false)),clock_timestamp() FROM unnest(grh_final_source_entities_v1())e;
 END $parents$`);
 const items=['agreements','categories','organizations','sectors'].map(kind=>({kind,code:'1',key:kind+':'+(kind==='categories'?'1':'')+':1',agreementCode:kind==='categories'?'1':null,label:'Referencia ficticia QA185'}));
 fixture.push(`INSERT INTO native_employment_catalog_proposal(id,tenant_id,source_binding_id,base_version,base_items,items,reason,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,author_label,request_key,request_sha256,receipt)
 VALUES(${q(ids.catalogProposal)},${q(i.tenant)},${q(i.binding)},employment_adoption_hash_v1('[]'::jsonb),'[]',${json(items)},'Catálogo exclusivamente ficticio QA185',${q(i.membership)},${q(i.person)},${q(a.actorEmail)},${q(i.session)},3,${q(a.releaseSha)},'Preparador ficticio',${q(randomUUID())},employment_adoption_hash_v1(${json(items)}),'{}')`,
 `INSERT INTO native_employment_catalog_review(id,tenant_id,source_binding_id,proposal_id,decision,reason,revision,catalog_version,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,reviewer_label,request_key,request_sha256,receipt) VALUES(${q(ids.catalogReview)},${q(i.tenant)},${q(i.binding)},${q(ids.catalogProposal)},'approve','Publicación exclusivamente ficticia QA185',1,employment_adoption_hash_v1(${json(items)}),${q(ids.checkerMembership)},${q(ids.checkerPerson)},${q(checker.actorEmail)},${q(ids.checkerSession)},3,${q(a.releaseSha)},'Revisor ficticio',${q(randomUUID())},employment_adoption_hash_v1(${json(items)}),'{}')`);
 const metadata=[];
 for(const number of ['061','067','096','098','103','130','132','133','144'])for(const s of splitPostgresStatements(migration(number)).map(clean)){
  if(/^ALTER TABLE .* ENABLE ROW LEVEL SECURITY|^CREATE (?:UNIQUE )?INDEX|^CREATE (?:CONSTRAINT )?TRIGGER|^DROP TRIGGER IF EXISTS|^CREATE VIEW |^REVOKE ALL ON (?!FUNCTION)/.test(s)||/^DO \$(?:triggers|protect)\$/.test(s)||(['061','098'].includes(number)&&/^DO \$\$ DECLARE t text;/.test(s)))metadata.push(s);
 }
 // The period182 prerequisite checks179's complete ledger, and the baseline
 // must also retain each other declared native payroll ledger's protections.
 // Select literal source DDL only; never manufacture a weaker table shape.
 const ledger=name=>qa.tables.tables.includes(name)&&/^(?:own_|native_salary_event$)/.test(name);
 for(const[file,sourceText]of Object.entries(graph.sources).filter(([p])=>/^scripts\/migrations\/\d+/.test(p)&&!p.includes('/185-')).sort())for(const s of splitPostgresStatements(sourceText).map(clean)){
  const m=/^ALTER TABLE (?:public\.)?(\w+) ENABLE ROW LEVEL SECURITY/.exec(s)
   ??/^CREATE (?:UNIQUE )?INDEX(?: IF NOT EXISTS)? \w+ ON (?:public\.)?(\w+)\s*\(/.exec(s)
   ??/^CREATE (?:CONSTRAINT )?TRIGGER \w+[\s\S]*?\bON (?:public\.)?(\w+)\b/.exec(s);
  if(m&&ledger(m[1])&&!metadata.includes(s))metadata.push(s);
  const revoke=/^REVOKE ALL ON (?!FUNCTION)([\s\S]*?)\s+FROM PUBLIC,\s*municontrol_actions_runtime_app$/.exec(s);
  if(revoke&&revoke[1].split(',').every(t=>ledger(t.trim().replace(/^public\./,'')))&&!metadata.includes(s))metadata.push(s);
 }
 // SQL101 extends the existing026 row before139 installs the reviewed shape.
 metadata.unshift(...splitPostgresStatements(migration('067')).map(clean).filter(s=>/^ALTER TABLE employment_contract (?:ALTER COLUMN source_batch_id|DROP CONSTRAINT employment_contract_grh_authority_ck|ADD CONSTRAINT employment_contract_origin_ck)/.test(s)));
 metadata.unshift(canonicalStatement(migration('095'),/^ALTER TABLE public\.employment_contract ADD COLUMN IF NOT EXISTS jurisdiction_code text$/),canonicalStatement(migration('095'),/^DO \$constraint\$/));
 metadata.unshift(...splitPostgresStatements(migration('101')).map(clean).filter(s=>/^ALTER TABLE public.payroll_novelty_row ADD COLUMN/.test(s)));
 metadata.push(...splitPostgresStatements(migration('139')).map(clean).filter(s=>/^ALTER TABLE public.payroll_novelty_row /.test(s)));
 fixture.push('SELECT native_employment_catalog_items_v1('+json(items)+')');
 const seed=['SET LOCAL check_function_bodies=off',foundation,...prerequisites,...metadata.map(r),...fixture.map(r),...qa.base.local.installation].join(';\n');
 return {seed,ids,actor:a,checker,rows,syntheticCounts:{source:65,active:63,archived:2},seedSourceStatements:metadata.length,sourceProfile:'grh-junin-2026-10-01',sourceMetadataBeforeOwnerDecision:true};
}
