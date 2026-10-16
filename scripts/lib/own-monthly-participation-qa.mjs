import {OWNER_ADOPTION_OPERATIONAL_PAIR_BASELINES} from './municipal-owner-adoption-authority-installation.mjs';
// Pure SQL/fixture preparation. No connection, process, HTTP call or SQL execution.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {buildOwnerDecisionQa} from './municipal-owner-adoption-decision-qa.mjs';
import {buildOwnMonthlyParticipationInstallation} from './own-monthly-participation-installation.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {splitPostgresStatements} from './sql-statements.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
import {employeeDraft} from '../../assets/native-employee-contract.js';
export const monthlyQaHash=v=>createHash('sha256').update(v).digest('hex');
export const monthlyQaLiteral=v=>"'"+String(v).replaceAll("'","''")+"'";
const q=monthlyQaLiteral,j=v=>q(JSON.stringify(v))+'::jsonb';
const body=d=>{const m=/\bAS\s+(\$\w*\$)([\s\S]*)\1\s*;?$/.exec(d);assert.ok(m);return m[2];};
// Public facade groups used by the real fixture writers/HTTP handler. Private
// source/hash helpers in monthlyQaAdoption execute as the fixture owner only.
export const MONTHLY_QA_RUNTIME_GROUPS=Object.freeze([
 {file:'scripts/migrations/067-native-employee-registration.sql',signatures:['native_employee_bootstrap_v1(jsonb)','native_employee_attempt_v1(jsonb,uuid)','native_employee_create_v1(jsonb,jsonb,text,uuid)']},
 {file:'scripts/migrations/136-adopted-employment-lifecycle.sql',signatures:['native_employment_lifecycle_bootstrap_v2(jsonb,uuid)','native_employment_lifecycle_proposal_v2(jsonb,uuid,uuid)','native_employment_lifecycle_propose_v2(jsonb,jsonb,uuid)','native_employment_lifecycle_review_v2(jsonb,jsonb,uuid)','native_employment_lifecycle_attempt_v2(jsonb,uuid,uuid)','native_employment_lifecycle_read_v2(jsonb,uuid)','native_employment_lifecycle_projection_v2(jsonb,uuid)']},
 {file:'scripts/migrations/157-own-period-participation.sql',signatures:['own_participation_bootstrap_v1(jsonb,uuid,text)','own_participation_detail_v1(jsonb,uuid)','own_participation_attempt_v1(jsonb,uuid)','own_participation_command_v1(jsonb,jsonb,uuid)']},
].map(group=>Object.freeze({...group,signatures:Object.freeze(group.signatures)})));
const signatures=sql=>[...sql.matchAll(/\b(?:(?:public|mc_qa_fixed_092_[a-f0-9]{32})\.)?[a-z0-9_]+\([^)]*\)/g)].map(m=>m[0].replace(/\s+/g,''));
export function monthlyQaRuntimeGrants({read,sourceHashes}){
 return MONTHLY_QA_RUNTIME_GROUPS.map(group=>{
  const source=read(group.file).replace(/\r\n?/g,'\n');assert.equal(monthlyQaHash(source),sourceHashes[group.file],'MONTHLY_QA_RUNTIME_SOURCE_CHANGED:'+group.file);
  const acl=splitPostgresStatements(source).map(s=>/^(GRANT EXECUTE|REVOKE ALL) ON FUNCTION ([\s\S]+) (TO|FROM) ([a-zA-Z_,]+)$/.exec(s.trim())).filter(Boolean),name=group.signatures[0].split('(')[0],grants=acl.filter(m=>m[1]==='GRANT EXECUTE'&&signatures(m[2]).some(s=>s.replace(/^public\./,'').split('(')[0]===name));
  assert.equal(grants.length,1,'MONTHLY_QA_RUNTIME_GRANT_SOURCE_CHANGED:'+group.file);const grant=grants[0];assert.equal(grant[3],'TO');assert.equal(grant[4],'municontrol_actions_runtime_app');assert.deepEqual(signatures(grant[2]).map(s=>s.replace(/^public\./,'')),group.signatures,'MONTHLY_QA_RUNTIME_FACADES_CHANGED:'+group.file);
  for(const signature of group.signatures){const touching=acl.filter(m=>signatures(m[2]).some(s=>s.replace(/^public\./,'')===signature));assert.equal(touching.at(-1),grant,'MONTHLY_QA_RUNTIME_LAST_ACL_CHANGED:'+signature);assert.ok(touching.some(m=>m[1]==='REVOKE ALL'&&m[4].split(',').includes('PUBLIC')),'MONTHLY_QA_RUNTIME_PUBLIC_REVOKE_REQUIRED:'+signature);}
  return{file:group.file,sourceSha256:sourceHashes[group.file],grant:grant[0],signatures:group.signatures.map(s=>'public.'+s)};
 });
}
export function monthlyQaRuntimeAcl(sql,schema){
 assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);const runtime=new Set();
 for(const statement of splitPostgresStatements(sql)){const m=/^(GRANT EXECUTE|REVOKE ALL) ON FUNCTION ([\s\S]+) (?:TO|FROM) ([a-zA-Z_,]+)$/.exec(statement.trim());if(!m||!m[3].split(',').includes('municontrol_actions_runtime_app'))continue;for(const signature of signatures(m[2])){const key=signature.replace(/^public\./,schema+'.'),resolved=key.slice(0,key.indexOf('(')).includes('.')?key:schema+'.'+key;if(m[1]==='GRANT EXECUTE')runtime.add(resolved);else runtime.delete(resolved);}}
 return runtime;
}
export function monthlyQaPrivateDateSource(read){
 const file='scripts/migrations/092-payroll-fixed-novelties.sql',source=read(file).replace(/\r\n?/g,'\n'),sourceSha256=monthlyQaHash(source);assert.equal(sourceSha256,'47b30fc484d04f3456e8710b2da04c3cdd19b700ea910ce1ea6a4cd00fa63d49','MONTHLY_QA_DATE_SOURCE_CHANGED');
 const statements=splitPostgresStatements(source),found=statements.filter(s=>s.startsWith('CREATE OR REPLACE FUNCTION public.payroll_fixed_registry_date_v1('));assert.equal(found.length,1);const definition=found[0];assert.ok(definition.startsWith('CREATE OR REPLACE FUNCTION public.payroll_fixed_registry_date_v1(value text,required boolean DEFAULT true) RETURNS date\nLANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$'));
 // The shared metadata parser admits DEFAULTfalse but not DEFAULTtrue. Adapt
 // only its input header and restore the exact default in the expected pin;
 // the emitted canonical definition/body are never changed by this adapter.
 const pin={...ownInstallationFunctionPin(definition.replace('DEFAULT true','DEFAULT false')),defaults:'true',runtime:false};assert.equal(pin.sha256,'dd36fdd1ed32b385a7d269c461759943db267997449075c19d843beeff3443f9');
 const acl=statements.map(s=>/^(GRANT EXECUTE|REVOKE ALL) ON FUNCTION ([\s\S]+) (?:TO|FROM) ([a-zA-Z_,]+)$/.exec(s.trim())).filter(m=>m&&signatures(m[2]).includes(pin.signature));assert.equal(acl.at(-1)?.[1],'REVOKE ALL');assert.equal(acl.at(-1)?.[3],'PUBLIC,municontrol_actions_runtime_app');
 return{file,sourceSha256,definition,pin};
}
export function monthlyQaReachableFunctions(sql,{schema,roots}){
 assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.ok(Array.isArray(roots)&&roots.every(n=>/^[a-z0-9_]+_v[0-9]+$/.test(n)));const definitions=new Map(),tables=new Set();
 for(const raw of splitPostgresStatements(sql)){const clean=raw.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim(),f=/^CREATE(?: OR REPLACE)? FUNCTION (?:public\.|mc_qa_fixed_092_[a-f0-9]{32}\.)?([a-z0-9_]+)\(/.exec(clean),t=/^CREATE TABLE (?:IF NOT EXISTS )?(?:public\.|mc_qa_fixed_092_[a-f0-9]{32}\.)?([a-z0-9_]+)\b/.exec(clean);if(f)definitions.set(f[1],clean);if(t)tables.add(t[1]);}
 const seen=new Set(),queue=[...roots],missing=new Map(),calls={},dynamicSql=[];
 for(let i=0;i<queue.length;i++){const name=queue[i];if(seen.has(name))continue;seen.add(name);const definition=definitions.get(name);if(!definition){missing.set(name,new Set(['root']));continue;}const match=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?$/.exec(definition);assert.ok(match,'MONTHLY_QA_CALL_BODY_REQUIRED:'+name);const executable=match[2].replace(/'(?:[^']|'')*'/g,"''").replace(/--[^\n]*(?:\n|$)/g,'\n');if(/\bEXECUTE\b/.test(executable))dynamicSql.push(name);const names=[...new Set([...executable.matchAll(new RegExp('(?:'+schema+'|public)\\.([a-z0-9_]+)\\(','g'))].map(m=>m[1]))].filter(n=>n!==name&&n!=='digest'&&!tables.has(n));calls[name]=names;
  for(const called of names){if(!definitions.has(called)){if(!missing.has(called))missing.set(called,new Set());missing.get(called).add(name);}else if(!seen.has(called))queue.push(called);}
 }
 return{kind:'static_named_executable_call_closure',roots:[...roots],reached:[...seen].sort(),calls,missing:[...missing].map(([name,parents])=>({name,parents:[...parents].sort()})),dynamicSql:dynamicSql.sort(),overloadResolutionProven:false,dynamicSqlResolutionProven:false,extensionFunctions:['public.digest']};
}
export function monthlyQaOptions(argv){
 const a={};for(const v of argv){const m=/^--(major|source-commit|output|transport|operational-pair-baseline)=(.+)$/.exec(v);assert.ok(m&&!Object.hasOwn(a,m[1]),'MONTHLY_QA_ARGUMENT_INVALID');a[m[1]]=m[2];}
 assert.ok(['17','18'].includes(a.major));assert.match(a['source-commit']??'',/^[a-f0-9]{40}$/);assert.match(a.output??'',/^verification[\\/][A-Za-z0-9_.-]+$/);assert.ok(a.transport===undefined||['local','ci'].includes(a.transport));
 assert.ok(a['operational-pair-baseline']===undefined||OWNER_ADOPTION_OPERATIONAL_PAIR_BASELINES.includes(a['operational-pair-baseline']),'OWNER_AUTHORITY184_OPERATIONAL_PAIR_BASELINE_REQUIRED');
 return{major:Number(a.major),sourceCommit:a['source-commit'],output:a.output,transport:a.transport??'local',...(a['operational-pair-baseline']===undefined?{}:{operationalPairBaseline:a['operational-pair-baseline']})};
}
export function monthlyQaQuery(text,args,schema){
 assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.match(text,/^SELECT public\.(?:own_monthly_participation_source_v1|own_participation_(?:bootstrap|detail|attempt|command)_v1)\([^;]*\) AS result$/);assert.ok(Array.isArray(args));
 const used=new Set(),result=text.replaceAll('public.',schema+'.').replace(/\$(\d+)\b/g,(_,n)=>{const i=Number(n)-1;assert.ok(i>=0&&i<args.length);assert.equal(typeof args[i],'string');used.add(i);return q(args[i]);});assert.equal(used.size,args.length);return result;
}
export function buildMonthlyParticipationQa({major,sourceCommit,read,schema='mc_qa_fixed_092_'+randomUUID().replaceAll('-',''),operationalPairBaseline='pre107'}){
 assert.ok([17,18].includes(major));assert.match(sourceCommit,/^[a-f0-9]{40}$/);assert.equal(typeof read,'function');assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 const base=buildOwnerDecisionQa({major,sourceCommit,read,schema,operationalPairBaseline}),batch=buildOwnMonthlyParticipationInstallation({read,sourceCommit,operationalPairBaseline}),privateDate=monthlyQaPrivateDateSource(read);assert.equal(base.definitions.some(d=>/FUNCTION (?:public\.)?payroll_fixed_registry_date_v1\(/.test(d)),false,'MONTHLY_QA_DATE_ALREADY_PRESENT');
 const bySignature=new Map(base.definitions.map(d=>{try{return[ownInstallationFunctionPin(d).signature,d];}catch{return[null,null];}}));
 for(const p of batch.prerequisitePins){const d=bySignature.get(p.signature);assert.ok(d,'MONTHLY_QA_CANONICAL_PREREQUISITE_MISSING:'+p.signature);const actual=ownInstallationFunctionPin(d);assert.deepEqual({...actual,runtime:p.runtime},p,'MONTHLY_QA_CANONICAL_PREREQUISITE_CHANGED:'+p.signature);}
 const sourceHashes={...base.sourceHashes,...batch.sourceHashes,[privateDate.file]:privateDate.sourceSha256},newHash=monthlyQaHash(body(base.normalized(batch.newDefinition))),hashes={...base.hashes,[batch.newPin.sha256]:newHash,[privateDate.pin.sha256]:monthlyQaHash(body(base.normalized(privateDate.definition)))};
 const normalized=s=>{let v=base.normalized(s);for(const[a,b]of Object.entries(hashes))v=v.replaceAll(a,b);return v;};
 const local=Object.fromEntries(['rehearsal','installation','verification','repetition','rollback','rollbackVerification'].map(k=>[k,batch[k].map(normalized)]));
 // Reuse the authentic185 foundation, but not its184 resolver installation or
 // any owner decision. All authentication/effective-capability SQL stays real.
 const authorityTail=base.base.local.installation.join(';\n');assert.ok(base.seed.endsWith(authorityTail),'MONTHLY_QA_AUTHORITY_TAIL_CHANGED');
 let seed=base.seed.slice(0,-authorityTail.length);const unknown=base.rows.find(r=>r.active);assert.ok(unknown);
 // Edit only the two fictional seed INSERTs before the parent source is sealed.
 const contractMarker='INSERT INTO employment_contract(id,person_id,source_system,source_batch_id,legacy_company_id,legacy_legajo,status,start_date,agreement_code,category_code,organization_unit_source_id,sector_source_id,jurisdiction_code) VALUES('+q(unknown.contractId);
 const curatedMarker='INSERT INTO grh_employees(company_id,legajo,person_id,nombre,dni,fecha_ingreso,fecha_egreso,activo,convenio_code,categoria_code,cargo_code,sector_code,source_payload,import_run_id) VALUES(101,'+q(unknown.legajo)+',';
 const lines=seed.split('\n');for(const[marker,old,next]of[[contractMarker,"'active','2000-01-01'","'active',NULL"],[curatedMarker,q(unknown.dni)+",'2000-01-01',",q(unknown.dni)+',NULL,']]){const selected=lines.map((s,i)=>s.includes(marker)?i:-1).filter(i=>i>=0);assert.equal(selected.length,1,'MONTHLY_QA_SOURCE_DATE_ANCHOR');const at=selected[0];assert.equal(lines[at].split(old).length,2);lines[at]=lines[at].replace(old,()=>next);}seed=lines.join('\n');
 const caps=['payroll.parameter.read','payroll.parameter.prepare','payroll.parameter.approve','employee.record.create'];
 const a=base.actor,c=base.checker,fixture=[
  ...caps.map(cap=>`INSERT INTO ${schema}.iam_capability(capability_key,label,description,scope_kind) VALUES(${q(cap)},'QA189','Exclusivamente ficticio','tenant') ON CONFLICT(capability_key) DO NOTHING`),
  ...['payroll.parameter.read','payroll.parameter.prepare','employee.record.create'].map(cap=>`INSERT INTO ${schema}.iam_role_capability VALUES('QA_AUTHORITY_OPERATOR',${q(cap)})`),
  ...['payroll.parameter.read','payroll.parameter.approve'].map(cap=>`INSERT INTO ${schema}.iam_role_capability VALUES('QA_ADOPTION_CHECKER',${q(cap)})`),
  `DELETE FROM ${schema}.platform_user_role WHERE user_email IN(${q(a.actorEmail)},${q(c.actorEmail)})`,
 ];
 seed+=';\n'+fixture.join(';\n')+';\n'+normalized(privateDate.definition.replace(/^CREATE OR REPLACE FUNCTION /,'CREATE FUNCTION '))+';\n'+normalized('REVOKE ALL ON FUNCTION '+privateDate.pin.signature+' FROM PUBLIC,municontrol_actions_runtime_app')+';\n'+normalized(pinsCheck([privateDate.pin],'MONTHLY_QA_PRIVATE_DATE_METADATA_CHANGED'));
 // Restore only whole canonical public facade grants; no body/ACL from the
 // application is replaced and no private helper is exposed to the runtime.
 const runtimeGrants=monthlyQaRuntimeGrants({read,sourceHashes});seed+=';\n'+runtimeGrants.map(group=>normalized(group.grant)).join(';\n');
 const access=monthlyQaRuntimeAcl(seed,schema),runtimeFacades=runtimeGrants.flatMap(group=>group.signatures);
 for(const signature of runtimeFacades)assert.ok(access.has(signature.replace('public.',schema+'.')),'MONTHLY_QA_RUNTIME_FACADE_REQUIRED:'+signature);
 for(const pin of batch.prerequisitePins)assert.equal(access.has(pin.signature.replaceAll('public.',schema+'.')),pin.runtime,'MONTHLY_QA_PREREQUISITE_ACL_CHANGED:'+pin.signature);
 for(const signature of['public.employment_adoption_source_v1(jsonb)','public.employment_adoption_hash_v1(jsonb)'])assert.equal(access.has(signature.replace('public.',schema+'.')),false,'MONTHLY_QA_PRIVATE_SOURCE_EXPOSED');
 assert.equal(batch.migration.at(-1),'GRANT EXECUTE ON FUNCTION public.own_monthly_participation_source_v1(jsonb,uuid,text) TO municontrol_actions_runtime_app');
 const callRoots=[...runtimeFacades.map(s=>s.slice('public.'.length,s.indexOf('('))),'own_monthly_participation_source_v1','employment_adoption_source_v1','employment_adoption_hash_v1','employment_adoption_bootstrap_v1','employment_adoption_propose_v1','employment_adoption_decision_source_v1','employment_adoption_decide_v1'],reachableFunctions=monthlyQaReachableFunctions(seed+';\n'+normalized(batch.newDefinition),{schema,roots:callRoots});assert.deepEqual(reachableFunctions.missing,[],'MONTHLY_QA_REACHABLE_FUNCTION_MISSING');assert.equal(access.has(privateDate.pin.signature.replace('public.',schema+'.')),false,'MONTHLY_QA_DATE_RUNTIME_EXPOSED');
 return{version:'own-monthly-participation-qa.v1',major,sourceCommit,operationalPairBaseline,schema,base,batch,normalized,hashes,sourceHashes,seed,local,privateDate,reachableFunctions,runtimeGrants,runtimeFacades,runtimeAclAudit:{prerequisites:batch.prerequisitePins.length,seedFacades:runtimeFacades.length,installed189Facade:true,privateAdoptionSourcesExposed:false},actor:a,checker:c,unknownContract:unknown.contractId,knownContract:base.rows.find(r=>r.active&&r!==unknown).contractId,canonicalGuardCount:batch.prerequisitePins.length,installsOwnerAuthority:false,ownerAuthorityRequired:false,sqlAuthorityStubs:false,connects:false,executesSql:false};
}
export function monthlyQaFreshDraft(index,startDate){
 assert.ok(Number.isInteger(index)&&index>=0&&index<50);const dni=String(97018900+index),prefix='20'+dni,remainder=11-[5,4,3,2,7,6,5,4,3,2].reduce((n,w,i)=>n+w*Number(prefix[i]),0)%11,cuil=prefix+(remainder===11?'0':remainder===10?'9':String(remainder));
 return employeeDraft({legajo:String(718900+index),fullName:'Agente exclusivamente ficticio QA189 '+index,dni,cuil,birthDate:'1990-01-01',sexCode:'X',startDate,agreementCode:'1',categoryCode:'1',organizationId:'1',sectorCode:'1',jobTitle:'Prueba mensual propia',legalReference:'Alta exclusivamente sintética QA189',jurisdictionCode:'42'});
}
export function monthlyQaAdoption(qa){
 const a=j(qa.actor),c=j(qa.checker);return qa.normalized(`DO $monthly_adopt$ DECLARE raw jsonb;boot jsonb;context_sha text;versions jsonb;input jsonb;receipt jsonb;stage jsonb;BEGIN
 raw:=public.employment_adoption_source_v1(${a});boot:=public.employment_adoption_bootstrap_v1(${a});
 context_sha:=public.employment_adoption_hash_v1(jsonb_build_object('scope',raw->'scope','source',raw->'source'));
 SELECT jsonb_agg(jsonb_build_object('contractId',v->>'contractId','contractVersion',public.employment_adoption_hash_v1(jsonb_build_object('sourceContextVersion',context_sha,'row',v))) ORDER BY n) INTO versions FROM jsonb_array_elements(raw->'rows') WITH ORDINALITY r(v,n);
 SELECT jsonb_agg(v||jsonb_build_object('jurisdictionCode','42') ORDER BY n) INTO input FROM jsonb_array_elements(versions) WITH ORDINALITY r(v,n);
 receipt:=public.employment_adoption_propose_v1(${a},jsonb_build_object('sourceContextVersion',context_sha,'selectionVersion',public.employment_adoption_hash_v1(versions),'catalogVersion',boot->>'catalogVersion','rows',input,'legalReference','Antecedente exclusivamente ficticio QA189','reason','Adopción íntegra exclusivamente sintética QA189'),gen_random_uuid());
 stage:=public.employment_adoption_decision_source_v1(${c},(receipt#>>'{receipt,proposalId}')::uuid);
 PERFORM public.employment_adoption_decide_v1(${c},jsonb_build_object('reviewVersion',stage->>'reviewVersion','review',jsonb_build_object('proposalId',receipt#>>'{receipt,proposalId}','proposalVersion',receipt#>>'{receipt,proposalVersion}','sourceContextVersion',context_sha,'catalogVersion',boot->>'catalogVersion','decision','approve','reason','Revisión independiente exclusivamente ficticia QA189')),gen_random_uuid());END $monthly_adopt$`);
}
export function monthlyQaStateSql(qa){
 return `SELECT jsonb_build_object('participationEvents',(SELECT count(*) FROM ${qa.schema}.own_participation_event),'businessSha256',encode(public.digest(jsonb_build_object(${['person_identity','employment_contract','native_employee_registration','employment_adoption_application','employment_adoption_decision','own_participation_event','native_employment_lifecycle_proposal','native_employment_lifecycle_review','own_payroll_run_capture','own_payroll_run_result'].map(t=>q(t)+`,(SELECT jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text COLLATE "C") FROM ${qa.schema}.${t} r)`).join(',')})::text,'sha256'),'hex'))`;
}
export function monthlyQaInput(contractId,period){return{contractId,period,policyId:'junin-monthly-confirmed-30.v1',asOfDate:period+'-01',documentReference:'Constancia exclusivamente sintética QA189',reason:'Preparación de fechas exclusivamente sintética QA189'};}
export function monthlyQaContextCases(qa){return[
 ['staleSession',{...qa.actor,actorSessionVersion:999},'PARTICIPATION_SESSION_INVALID'],
 ['wrongRelease',{...qa.actor,releaseSha:'f'.repeat(40)},'PARTICIPATION_SESSION_INVALID'],
 ['foreignMembership',{...qa.actor,membershipId:qa.base.base.ids.foreignMembership},'PARTICIPATION_SESSION_INVALID'],
 ['foreignTenant',{...qa.actor,tenantId:qa.base.base.ids.foreignTenant},'PARTICIPATION_SESSION_INVALID'],
 ];}
