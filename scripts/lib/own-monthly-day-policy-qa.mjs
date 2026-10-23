// Pure composition of the existing190 foundation. Never connects or executes.
import assert from'node:assert/strict';import{createHash}from'node:crypto';
import{buildOwnerProgramQa,ownerProgramQaOrdinaryQuery}from'./municipal-owner-program-qa.mjs';
import{resolveMonthlyDayQaFoundation}from'./own-monthly-day-qa-foundation.mjs';
import{buildMonthlyDayPolicyInstallation}from'./own-monthly-day-policy-installation.mjs';
import{monthlyQaRuntimeGrants}from'./own-monthly-participation-qa.mjs';
import{splitPostgresStatements}from'./sql-statements.mjs';
import{ownerDecisionQaLiteral as q}from'./municipal-owner-adoption-decision-qa.mjs';
import{monthlyDaySqlFixture}from'../../tests/fixtures/own-monthly-day-policy-sql-synthetic.js';
import{monthlyDayLegacyCompatibilityFixture,MONTHLY_DAY_LEGACY_FIXTURE_SOURCE}from'./monthly-day-policy-legacy-fixture.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex'),body=d=>{const m=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?\s*$/.exec(d);assert.ok(m,'MONTHLY192_BODY_REQUIRED');return m[2];};
export function monthlyDayQaHeader(sql){return sql.replaceAll("SET search_path TO 'pg_catalog', 'public', 'pg_temp'",'SET search_path=pg_catalog,public,pg_temp').replaceAll("SET search_path TO ''pg_catalog'', ''public'', ''pg_temp''",'SET search_path=pg_catalog,public,pg_temp').replaceAll('SET "TimeZone" TO \'UTC\'',"SET timezone='UTC'").replaceAll('SET "TimeZone" TO \'\'UTC\'\'',"SET timezone=''UTC''");}
export function buildMonthlyDayPolicyQa({major,sourceCommit,read,schema,operationalPairBaseline,foundation}){
 assert.ok([17,18].includes(major));assert.match(sourceCommit??'',/^[a-f0-9]{40}$/);assert.equal(typeof read,'function');assert.ok(['pre107','published107'].includes(operationalPairBaseline),'MONTHLY192_EXPLICIT_BASELINE_REQUIRED');
 const qa=resolveMonthlyDayQaFoundation({major,sourceCommit,read,schema,operationalPairBaseline,foundation},buildOwnerProgramQa),batch=buildMonthlyDayPolicyInstallation({read,sourceCommit,operationalPairBaseline});
 const hashes={};let stable=false;for(let pass=0;pass<12;pass++){let changed=false;for(const d of[...batch.newDefinitions,...batch.adapted]){let local=qa.normalized(monthlyDayQaHeader(d));for(const[a,b]of Object.entries(hashes))local=local.replaceAll(a,b);const raw=hash(body(d)),next=hash(body(local));if(hashes[raw]!==next){hashes[raw]=next;changed=true;}}if(!changed){stable=true;break;}}assert.ok(stable,'MONTHLY192_HASH_GRAPH_CYCLE');
 const normalized=sql=>{let local=qa.normalized(monthlyDayQaHeader(sql));for(const[a,b]of Object.entries(hashes))local=local.replaceAll(a,b);return local;};
 const local=Object.fromEntries(['rehearsal','installation','repetition','verification','rollback'].map(k=>[k,batch[k].map(normalized)]));
 // These grants are fixture restoration from the exact published groups and
 // their last ACL, not changes to product grants or an error-triggered retry.
 const runtimeGrants=monthlyQaRuntimeGrants({read,sourceHashes:qa.sourceHashes});
 // The190 fixture covers catalogue/programme authority, not registration or
 // capture. Configure those synthetic maker capabilities before any protocol;
 // never grant on a failed request, and never modify a real role or product ACL.
 const capabilitySources=[['scripts/migrations/067-native-employee-registration.sql','employee.record.create'],['scripts/migrations/123-own-payroll-runs.sql','payroll.calculation.read'],['scripts/migrations/026-governed-payroll-novelties.sql','payroll.novelty.read']].map(([file,key])=>{
  const source=read(file).replace(/\r\n?/g,'\n');assert.equal(hash(source),qa.sourceHashes[file],'MONTHLY192_CAPABILITY_SOURCE_CHANGED:'+file);
  const matches=splitPostgresStatements(source).map(s=>s.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim()).filter(s=>/^INSERT INTO (?:public\.)?iam_capability\s*\(/.test(s)&&s.includes("'"+key+"'"));assert.equal(matches.length,1,'MONTHLY192_CAPABILITY_DECLARATION_REQUIRED:'+file);
  return{file,sourceSha256:hash(source),statement:matches[0]};
 });
 const makerCapabilities=['employee.record.create','payroll.calculation.read','payroll.calculation.nominal.read','payroll.calculation.prepare','payroll.novelty.read','payroll.novelty.nominal.read','payroll.novelty.export'];
 const capabilitySeed=capabilitySources.map(row=>normalized(row.statement)).join(';\n')+`;\nINSERT INTO ${qa.schema}.iam_role_capability(role_key,capability_key) SELECT role_key,c.capability_key FROM ${qa.schema}.tenant_membership CROSS JOIN(VALUES${makerCapabilities.map(k=>'('+q(k)+')').join(',')}) c(capability_key) WHERE id=${q(qa.actor.membershipId)};`;

 const legacyFixture=monthlyDayLegacyCompatibilityFixture(read),legacyCompatibilitySeed=legacyFixture.statements.map(normalized).join(';\n');
 return{major,sourceCommit,operationalPairBaseline,schema:qa.schema,qa,batch,normalized,local,hashes,runtimeGrants,capabilitySources,makerCapabilities,capabilitySeed,legacyCompatibilitySeed,runtimeGrantSeed:runtimeGrants.map(r=>normalized(r.grant)).join(';\n'),actor:qa.actor,checker:qa.checker,ids:qa.ids,sourceHashes:{...qa.sourceHashes,...batch.sourceHashes,[MONTHLY_DAY_LEGACY_FIXTURE_SOURCE]:legacyFixture.sourceSha256},fixture:monthlyDaySqlFixture(),connects:false,executesSql:false};
}
const signatures={
 'native_employment_catalog_bootstrap_v1':['jsonb'], 'native_employment_catalog_propose_v1':['jsonb','jsonb','uuid'], 'native_employment_catalog_review_v1':['jsonb','jsonb','uuid'], 'native_employment_catalog_attempt_v1':['jsonb','uuid'],
 'native_salary_bootstrap_v1':['jsonb'], 'native_salary_command_v1':['jsonb','jsonb','uuid'], 'native_salary_attempt_v1':['jsonb','uuid'],
 'native_employee_bootstrap_v1':['jsonb'], 'native_employee_create_v1':['jsonb','jsonb','text','uuid'], 'native_employee_attempt_v1':['jsonb','uuid'],
 'own_run_bootstrap_v1':['jsonb'], 'own_run_bootstrap_v2':['jsonb'], 'own_run_attempt_v1':['jsonb','uuid'], 'own_run_capture_v1':['jsonb','jsonb','uuid','text'], 'own_run_complete_v1':['jsonb','uuid','jsonb','jsonb','text']
};
export function monthlyDayQaRpc(text,values,schema){
 assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.ok(Array.isArray(values)&&values.every(v=>typeof v==='string'),'MONTHLY192_RPC_VALUES_REQUIRED');
 if(/^SELECT public\.own_program_(?:bootstrap|attempt|command)_v1\(/.test(text))return ownerProgramQaOrdinaryQuery(text,values,schema);
 const m=/^SELECT public\.([a-z0-9_]+)\(([^()]*)\) AS result$/.exec(text);assert.ok(m&&Object.hasOwn(signatures,m[1]),'MONTHLY192_RPC_REQUIRED');const types=signatures[m[1]];assert.equal(m[2],types.map((t,n)=>'$'+(n+1)+'::'+t).join(','));assert.equal(values.length,types.length);return text.replace('public.',schema+'.').replace(/\$(\d+)\b/g,(_,n)=>q(values[Number(n)-1]));
}
export function assertMonthlyDayInstallationDurability({installed,durable,repeated,batch}){
 const fields=['version','sourceCommit','sourceHashes','mode','newTables','newFunctions','adaptedFunctions','existingAclChanges','roleAssignmentsAdded','businessWrites','nominalRowsReturned','transactionDataPreserved','preservationSha256','priorMetadataSha256','objectSha256'].sort();
 for(const[p,mode,preserved]of[[installed,'install',true],[durable,'verify',false],[repeated,'verify',true]]){assert.deepEqual(Object.keys(p??{}).sort(),fields);assert.equal(p.version,batch.version);assert.equal(p.sourceCommit,batch.sourceCommit);assert.deepEqual(p.sourceHashes,batch.sourceHashes);assert.equal(p.mode,mode);assert.equal(p.transactionDataPreserved,preserved);for(const[k,v]of Object.entries({newTables:0,newFunctions:2,adaptedFunctions:4,existingAclChanges:0,roleAssignmentsAdded:0,businessWrites:0,nominalRowsReturned:0}))assert.equal(p[k],v);for(const key of['preservationSha256','priorMetadataSha256','objectSha256'])assert.match(p[key],/^[a-f0-9]{64}$/);}
 for(const p of[durable,repeated])for(const key of['preservationSha256','priorMetadataSha256','objectSha256'])assert.equal(p[key],installed[key]);return{passed:true,independentConnection:true,repeatUnchanged:true};
}
