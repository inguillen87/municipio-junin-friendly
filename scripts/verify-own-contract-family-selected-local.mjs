// Selected-scope regression. Setup is the existing V1 local harness, with explicitly synthetic identity/range readers.
// Only an ephemeral127.0.0.1 cluster with a fresh password is accepted. No municipal connection.
// Includes preexisting V1 approval and pending848, overlays, source/SOD/idempotency and untouched capture checks.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {randomBytes, randomUUID} from 'node:crypto';
import {createOwnContractFamilyPayrollFactsHandler} from '../api/internal-own-contract-family-payroll-facts.js';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
import {FAMILY_PAYROLL_FACT_QUANTITIES, familyPayrollFactsDefinition, prepareFamilyPayrollFacts, decideFamilyPayrollFacts, familyPayrollFactsCapture} from '../assets/own-contract-family-payroll-facts-model.js';

import {createOwnContractFamilySelectedHandler} from '../api/internal-own-contract-family-payroll-facts-selection.js';
import {prepareFamilySelected,decideFamilySelected} from '../assets/own-contract-family-payroll-facts-selection.js';
import {syntheticFamilyDefinition} from '../tests/fixtures/own-contract-family-payroll-facts-synthetic.js';

const root = fs.realpathSync(new URL('..', import.meta.url));
const options = {};
for (const arg of process.argv.slice(2)) {
 const match = /^--(loopback|port)=(.+)$/.exec(arg);
 assert.ok(match && !Object.hasOwn(options, match[1]), 'LOCAL_OPTION_INVALID');
 options[match[1]] = match[2];
}
assert.equal(options.loopback,'127.0.0.1','LOCAL_LOOPBACK_REQUIRED');
assert.ok(typeof process.env.PGPASSWORD==='string'&&process.env.PGPASSWORD.length>=24,'EPHEMERAL_PASSWORD_REQUIRED');
assert.match(options.port ?? '', /^[0-9]{4,5}$/, 'LOCAL_PORT_REQUIRED');
const environment = {PATH: process.env.PATH, PGPASSWORD:process.env.PGPASSWORD, PGCLIENTENCODING: 'UTF8', PGCONNECT_TIMEOUT: '5', PGAPPNAME: 'municontrol-family-facts-local'};
function psql(database, sql) {
 const run = spawnSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-h', options.loopback, '-p', options.port, '-U', 'postgres', '-d', database, '-f', '-'],
  {input: sql, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, env: environment});
 if (run.status !== 0) throw Error((run.stderr || 'LOCAL_PSQL_FAILED').trim());
 return run.stdout;
}
const literal = v => "'" + String(v).replaceAll("'", "''") + "'";
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function published(file, name) {
 const match = new RegExp('CREATE FUNCTION public\\.' + name + '\\([\\s\\S]*?\\$\\$;').exec(read(file));
 assert.ok(match, 'LOCAL_PUBLISHED_FUNCTION_MISSING ' + name); return match[0];
}

// The driver creates a new password and pins the ephemeral loopback cluster; no remote destination is accepted.
assert.equal(psql('postgres', "SELECT host(inet_server_addr())||'|'||current_setting('municontrol.qa_ephemeral',true)").trim(),'127.0.0.1|yes','EPHEMERAL_LOOPBACK_REQUIRED');
const database = 'mc_family_local_' + randomBytes(8).toString('hex');
const checks = [];
const check = (name, ok) => { checks.push([name, !!ok]); assert.ok(ok,name); };
psql('postgres', 'CREATE DATABASE ' + database + ';');
try {
 const id = n => '50000000-0000-4000-8000-' + n.toString(16).padStart(12, '0');
 const tenant = id(1), binding = id(2), people = [id(11), id(12)], memberships = [id(21), id(22)], sessions = [id(31), id(32)], count = 848;
 const emails = ['preparer-family-local@example.invalid', 'reviewer-family-local@example.invalid'];
 psql(database, `
CREATE EXTENSION pgcrypto;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='municontrol_actions_runtime_app') THEN CREATE ROLE municontrol_actions_runtime_app NOLOGIN;END IF;END $$;
CREATE TABLE public.platform_tenant(id uuid PRIMARY KEY);
CREATE TABLE public.person_identity(id uuid PRIMARY KEY);
CREATE TABLE public.tenant_identity_session(id uuid PRIMARY KEY,session_version integer,status text,expires_at timestamptz,last_seen_at timestamptz);
CREATE TABLE public.platform_tenant_source_binding(tenant_id uuid,id uuid,PRIMARY KEY(tenant_id,id));
CREATE TABLE public.tenant_membership(id uuid,tenant_id uuid,source_binding_id uuid,person_id uuid,email text,label text,capabilities text[],verified boolean,PRIMARY KEY(id,tenant_id));
CREATE TABLE public.native_employee_registration(contract_id uuid PRIMARY KEY,id uuid,tenant_id uuid,source_binding_id uuid,legajo text,in_range boolean,token text,registered_at timestamptz);
CREATE TABLE public.employment_contract(id uuid);CREATE TABLE public.employment_adoption_application(id uuid);CREATE TABLE public.employment_adoption_decision(id uuid);
CREATE TABLE public.employment_adoption_proposal(id uuid);CREATE TABLE public.native_employment_lifecycle_review(id uuid);
-- Synthetic stand-ins for the identity, lifecycle and registry readers.
CREATE FUNCTION public.native_salary_administrative_context_v1(p jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE m public.tenant_membership;
BEGIN
 SELECT * INTO m FROM public.tenant_membership WHERE id=(p->>'membershipId')::uuid AND tenant_id=(p->>'tenantId')::uuid AND email=p->>'actorEmail';
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_SALARY_FORBIDDEN';END IF;
 RETURN jsonb_build_object('tenantId',m.tenant_id,'sourceBindingId',m.source_binding_id,'membershipId',m.id,'actorPersonId',m.person_id,'actorEmail',m.email,'actorLabel',m.label,'capabilities',to_jsonb(m.capabilities),'scopes','[]'::jsonb,'parameterActorVerified',m.verified);
END $$;
CREATE FUNCTION public.action_center_context_has_capability(ctx jsonb,capability text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT coalesce(ctx->'capabilities' ? capability,false) $$;
CREATE FUNCTION public.native_salary_lock_v1(ctx jsonb) RETURNS void LANGUAGE sql AS $$ SELECT $$;
CREATE FUNCTION public.payroll_fixed_registry_range_v2(ctx jsonb,contract uuid,first_date date,last_date date,strict boolean) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT in_range FROM public.native_employee_registration WHERE contract_id=contract $$;
CREATE FUNCTION public.payroll_fixed_registry_subject_v2(ctx jsonb,contract uuid,strict boolean) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('subject',jsonb_build_object('contractId',contract_id,'registrationId',id,'legajo',legajo,'employeeName','Agente exclusivamente sintético','identityToken',token,'sourceCutoff',NULL,'origin','MUNICONTROL','registeredAt',registered_at)) FROM public.native_employee_registration WHERE contract_id=contract $$;
${published('scripts/migrations/112-native-salary-definitions.sql', 'native_salary_serialized_v1')}
${published('scripts/migrations/112-native-salary-definitions.sql', 'native_salary_scope_v1')}
${published('scripts/migrations/122-own-payroll-programs.sql', 'own_program_exact_v1')}
${published('scripts/migrations/122-own-payroll-programs.sql', 'own_program_text_v1')}
${read('scripts/migrations/226-own-contract-family-payroll-facts.sql')}
INSERT INTO public.platform_tenant VALUES(${literal(tenant)});
INSERT INTO public.platform_tenant_source_binding VALUES(${literal(tenant)},${literal(binding)});
INSERT INTO public.person_identity VALUES(${literal(people[0])}),(${literal(people[1])});
INSERT INTO public.tenant_identity_session VALUES(${literal(sessions[0])},1,'active',now()+interval '1 day',now()),(${literal(sessions[1])},1,'active',now()+interval '1 day',now());
INSERT INTO public.tenant_membership VALUES
 (${literal(memberships[0])},${literal(tenant)},${literal(binding)},${literal(people[0])},${literal(emails[0])},'Preparador exclusivamente sintético',ARRAY['workforce.employee.read','payroll.parameter.read','payroll.calculation.nominal.read','payroll.parameter.prepare'],true),
 (${literal(memberships[1])},${literal(tenant)},${literal(binding)},${literal(people[1])},${literal(emails[1])},'Revisora exclusivamente sintética',ARRAY['workforce.employee.read','payroll.parameter.read','payroll.calculation.nominal.read','payroll.parameter.approve'],true);
INSERT INTO public.native_employee_registration
 SELECT ('60000000-0000-4000-8000-'||lpad(to_hex(n),12,'0'))::uuid,('70000000-0000-4000-8000-'||lpad(to_hex(n),12,'0'))::uuid,${literal(tenant)},${literal(binding)},'QA-'||n,n<=${count},encode(digest('synthetic:'||n,'sha256'),'hex'),TIMESTAMPTZ '2026-09-01 12:00:00+00'
 FROM generate_series(1,${count + 1}) n;
CREATE FUNCTION public.mc_local_definition_verdict(d jsonb,period_value text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN PERFORM public.own_family_payroll_facts_definition_v1(d,period_value);RETURN true;
EXCEPTION WHEN raise_exception THEN IF SQLERRM='FAMILY_PAYROLL_FACTS_INPUT_INVALID' THEN RETURN false;END IF;RAISE;END $$;
`);

 const valid=()=>({...syntheticFamilyDefinition(),asOfDate:'2026-09-01'});
 const origin='https://municipio.example',endpoint='/api/internal-own-contract-family-payroll-facts';
 const caps=[['workforce.employee.read','payroll.parameter.read','payroll.calculation.nominal.read','payroll.parameter.prepare'],['workforce.employee.read','payroll.parameter.read','payroll.calculation.nominal.read','payroll.parameter.approve']];
 const actor=i=>({principal:{user:{email:emails[i]},tenant:{source:'membership',id:tenant,membershipId:memberships[i],effectiveCapabilities:caps[i]}},session:{email:emails[i],id:sessions[i],version:1,releaseSha:'d'.repeat(40)}});
 const sql={query:async(text,values)=>[{result:JSON.parse(psql(database,text.replace(/\$([0-9]+)/g,(_,n)=>literal(values[n-1]))+';'))}]};
 const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.value=v;return this;}});
 async function call(i,request,selected=false){const a=actor(i),out=response();await (selected?createOwnContractFamilySelectedHandler:createOwnContractFamilyPayrollFactsHandler)({env:{INTERNAL_APP_ORIGIN:origin},requireAccess:async()=>({mode:'managed',principal:a.principal}),sessionFor:()=>a.session,getSql:async()=>sql})(request,out);return out;}
 const get=(i,query,selected=false)=>call(i,{method:'GET',url:endpoint+(selected?'-selection':'')+'?'+new URLSearchParams(query),query,headers:{origin}},selected);
 const post=(i,payload,key=randomUUID(),selected=false)=>call(i,{method:'POST',url:endpoint+(selected?'-selection':''),query:{},headers:{origin,'content-type':'application/json','idempotency-key':key},body:JSON.stringify({operation:'command',payload})},selected);
 const bootSelected=(i,period,contractIds)=>call(i,{method:'POST',url:endpoint+'-selection',query:{},headers:{origin,'content-type':'application/json'},body:JSON.stringify({operation:'bootstrap',payload:{period,contractIds}})},true);
 const reason='Declaración exclusivamente sintética respaldada para este alcance';
 const rowsFor=subjects=>subjects.map(s=>({contractId:s.contractId,identityToken:s.identityToken,definition:valid()}));
 const good=out=>{assert.ok(out.statusCode<400,JSON.stringify({status:out.statusCode,result:out.value}));return out.value.data;};
 const context=JSON.stringify({tenantId:tenant,sourceBindingId:binding});
 const capture=(period,employees)=>JSON.parse(psql(database,`SELECT public.own_family_payroll_facts_capture_v1(${literal(context)}::jsonb,${literal(JSON.stringify(employees))}::jsonb,${literal(period)});`));
 const countEvents=()=>Number(psql(database,'SELECT count(*) FROM public.own_family_payroll_facts_event;').trim());
 const refuse=statement=>{try{psql(database,statement);return '';}catch(e){return String(e.message);}};
 const hashEvent=proposal=>psql(database,`SELECT encode(digest(to_jsonb(e)::text,'sha256'),'hex') FROM public.own_family_payroll_facts_event e WHERE id=${literal(proposal)};`).trim();

 // Preserve a real V1 approval and a large V1 pending proposal before applying
 // any candidate function. No preexisting event is transformed by the migration.
 const sep=good(await get(0,{resource:'bootstrap',period:'2026-09'}));
 const sepItems=rowsFor(sep.source.subjects);sepItems[0].definition.quantities.children='1';
 const sepProposal=good(await post(0,prepareFamilyPayrollFacts(sep,sepItems,reason)));
 const sepReviewBoot=good(await get(1,{resource:'bootstrap',period:'2026-09'})),sepDetail=good(await get(1,{resource:'detail',id:sepProposal.proposalId}));
 const sepApproved=good(await post(1,await decideFamilyPayrollFacts(sepReviewBoot,sepDetail,'approve',reason)));
 const oct=good(await get(0,{resource:'bootstrap',period:'2026-10'}));
 const all=oct.source.subjects,selected=all.slice(0,2).map(s=>s.contractId),third=[all[2].contractId],fourth=[all[3].contractId];
 const octPending=good(await post(0,prepareFamilyPayrollFacts(oct,rowsFor(all),reason)));
 const pendingHash=hashEvent(octPending.proposalId),approvalHash=hashEvent(sepApproved.eventId);
 const historicalCapture=capture('2026-09',all.slice(0,4));
 check('baseline has848 eligible subjects and an unchanged full pending proposal',all.length===848&&octPending.body.items.length===848&&countEvents()===3);
 psql(database,'BEGIN;\n'+read('scripts/migrations/228-own-contract-family-selected-scope.sql')+'\nROLLBACK;');
 check('technical migration rollback preserves historical rows and leaves no V2 object',hashEvent(octPending.proposalId)===pendingHash&&hashEvent(sepApproved.eventId)===approvalHash&&psql(database,"SELECT to_regprocedure('public.own_family_payroll_facts_ids_v2(jsonb)') IS NULL;").trim()==='t');
 psql(database,'BEGIN;\n'+read('scripts/migrations/228-own-contract-family-selected-scope.sql')+'\nCOMMIT;');
 check('migration preserves existing V1 approval and pending848 byte for byte',hashEvent(octPending.proposalId)===pendingHash&&hashEvent(sepApproved.eventId)===approvalHash&&countEvents()===3);
 check('saved-format V1 capture is byte-equivalent when only V1 history exists',JSON.stringify(capture('2026-09',all.slice(0,4)))===JSON.stringify(historicalCapture));
 check('double installation fails before replacing any existing routine',/FAMILY_PAYROLL_FACTS_OBJECT_CONFLICT/.test(refuse(read('scripts/migrations/228-own-contract-family-selected-scope.sql'))));

 let b=good(await bootSelected(0,'2026-10',selected));
 check('bootstrap seals exactly two identities and no empty declarations for846 others',b.source.subjects.length===2&&b.contractIds.length===2&&b.configuration.items.length===0&&b.configuration.records.length===0);
 check('overlapping pending V1 proposal remains visible without blocking selected preparation',b.legacyPendingProposals.length===1&&b.legacyPendingProposals[0].id===octPending.proposalId);
 const selectedRows=rowsFor(b.source.subjects);selectedRows[0].definition.quantities.children='2';selectedRows[1].definition.quantities.prenatal='0';
 const prepared=prepareFamilySelected(b,selectedRows,reason),key=randomUUID(),pending=good(await post(0,prepared,key,true));
 check('propose writes exactly the selected two rows with no payroll effect',pending.body.items.length===2&&pending.body.contractIds.length===2&&pending.payrollCalculated===false&&pending.payrollPosted===false);
 const afterProposal=countEvents(),replayed=good(await post(0,prepared,key,true));
 check('same selected attempt replays its original body without another event',replayed.replayed&&replayed.eventId===pending.eventId&&countEvents()===afterProposal);
 const recovered=good(await get(0,{resource:'attempt',key},true));
 check('selected attempt recovery preserves the entire original selection and key',recovered.requestKey===key&&JSON.stringify(recovered.body)===JSON.stringify(pending.body));
 const reused=await post(0,{...prepared,reason:reason+' diferente'},key,true);
 check('same request key cannot be rebound to another selected body',reused.statusCode===409&&reused.value.code==='FAMILY_PAYROLL_FACTS_IDEMPOTENCY_REUSE');
 check('old V1 detail cannot reinterpret a selected V2 proposal', (await get(1,{resource:'detail',id:pending.proposalId})).statusCode===404);
 check('V1 history continues to show its original pending848 and not V2 payloads',good(await get(1,{resource:'bootstrap',period:'2026-10'})).proposals.every(p=>p.id!==pending.proposalId));

 const reviewDetail=good(await get(1,{resource:'detail',id:pending.proposalId},true));
 const approvalBody=await decideFamilySelected(reviewDetail,'approve',reason);
 const self=await post(0,approvalBody,randomUUID(),true);
 check('preparer without approve capability cannot decide',self.statusCode===403&&self.value.code==='FAMILY_PAYROLL_FACTS_FORBIDDEN');
 psql(database,`UPDATE public.tenant_membership SET capabilities=array_append(capabilities,'payroll.parameter.approve') WHERE id=${literal(memberships[0])};`);caps[0].push('payroll.parameter.approve');
 const authorDetail=good(await get(0,{resource:'detail',id:pending.proposalId},true));
 const authorAttempt=await post(0,{...approvalBody,scopeVersion:authorDetail.scopeVersion},randomUUID(),true);
 check('holding both capabilities does not let the preparer approve own proposal',!authorDetail.proposal.canReview&&authorAttempt.statusCode===403&&authorAttempt.value.code==='FAMILY_PAYROLL_FACTS_INDEPENDENT_REQUIRED');
 psql(database,`UPDATE public.tenant_membership SET person_id=${literal(people[0])} WHERE id=${literal(memberships[1])};`);
 const samePerson=good(await get(1,{resource:'detail',id:pending.proposalId},true));
 check('a different account for the same real person is not an independent reviewer',samePerson.proposal.canReview===false);
 psql(database,`UPDATE public.tenant_membership SET person_id=${literal(people[1])} WHERE id=${literal(memberships[1])};`);

 // An unrelated contract can be approved between proposal and decision.
 const thirdBoot=good(await bootSelected(0,'2026-10',third));
 const thirdRows=rowsFor(thirdBoot.source.subjects);thirdRows[0].definition.quantities.spouse='1';
 const thirdProposal=good(await post(0,prepareFamilySelected(thirdBoot,thirdRows,reason),randomUUID(),true));
 const thirdDetail=good(await get(1,{resource:'detail',id:thirdProposal.proposalId},true));
 const thirdApproval=good(await post(1,await decideFamilySelected(thirdDetail,'approve',reason),randomUUID(),true));
 const thirdCaptureBefore=capture('2026-10',[all[2]]),afterThird=good(await bootSelected(0,'2026-10',selected));
 check('approval of another contract leaves this selected base and source unchanged',afterThird.configuration.version===b.configuration.version&&afterThird.source.version===b.source.version);
 psql(database,`UPDATE public.native_employee_registration SET token=repeat('e',64),in_range=false WHERE contract_id=${literal(fourth[0])};`);
 const afterUnrelatedIdentity=good(await bootSelected(0,'2026-10',selected));
 check('a range or identity change outside the selection does not invalidate its source',afterUnrelatedIdentity.source.version===b.source.version);
 const stillCurrent=good(await get(1,{resource:'detail',id:pending.proposalId},true));
 const approved=good(await post(1,await decideFamilySelected(stillCurrent,'approve',reason),randomUUID(),true));
 check('independent reviewer approves exactly the original two after unrelated changes',approved.status==='approved'&&approved.revision===2&&approved.body.contractIds.length===2);
 const mixed=capture('2026-10',all.slice(0,4));
 check('two selected rows have their own approval while the third keeps its earlier approval',mixed.records[0].approvalId===approved.eventId&&mixed.records[1].approvalId===approved.eventId&&mixed.records[2].approvalId===thirdApproval.eventId&&mixed.records[2].revision===1);
 check('unselected contract without declaration remains revision0 null and never zero',mixed.records[3].revision===0&&mixed.records[3].definition===null&&mixed.records[3].approvalId===null);
 check('the other contract capture hash and records remain byte-equivalent after this approval',JSON.stringify(capture('2026-10',[all[2]]))===JSON.stringify(thirdCaptureBefore));
 check('V1 pending848 is still pending and unchanged but cannot approve a superseded base',hashEvent(octPending.proposalId)===pendingHash&&good(await get(1,{resource:'detail',id:octPending.proposalId})).current===false);
 check('selected configuration carries each real positive revision and approval',good(await bootSelected(0,'2026-10',[...selected,...third])).configuration.records.map(r=>r.revision).join(',')==='2,2,1');
 check('complete V1 current view includes the effective partial items without claiming missing846',good(await get(0,{resource:'bootstrap',period:'2026-10'})).configuration.items.length===3);
 psql(database,`UPDATE public.native_employee_registration SET token=${literal(all[3].identityToken)},in_range=true WHERE contract_id=${literal(fourth[0])};`);

 // Overlap matters; unrelated work does not. No synthetic records are created
 // to stand in for untouched contracts.
 b=good(await bootSelected(0,'2026-10',selected));
 const changed=structuredClone(b.configuration.items);changed[0].definition.quantities.children='3';
 const first=good(await post(0,prepareFamilySelected(b,changed,reason),randomUUID(),true));
 const secondItems=structuredClone(changed);secondItems[0].definition.quantities.children='4';
 const second=good(await post(0,prepareFamilySelected(b,secondItems,reason),randomUUID(),true));
 const firstDetail=good(await get(1,{resource:'detail',id:first.proposalId},true));
 const selectedBefore=countEvents();good(await post(1,await decideFamilySelected(firstDetail,'approve',reason),randomUUID(),true));
 const secondDetail=good(await get(1,{resource:'detail',id:second.proposalId},true));
 const staleBody={...await decideFamilySelected({...secondDetail,current:true},'approve',reason)};
 const stale=await post(1,staleBody,randomUUID(),true);
 check('a change to the same selected contract invalidates a competing approval without extra events',!secondDetail.current&&stale.statusCode===409&&stale.value.code==='FAMILY_PAYROLL_FACTS_BASE_CHANGED'&&countEvents()===selectedBefore+1);
 const rejected=good(await post(1,await decideFamilySelected(secondDetail,'reject',reason),randomUUID(),true));
 check('a stale selected proposal can be rejected through the normal independent route',rejected.status==='rejected');

 const rangedBoot=good(await bootSelected(0,'2026-10',fourth)),rangedRows=rowsFor(rangedBoot.source.subjects);
 const ranged=good(await post(0,prepareFamilySelected(rangedBoot,rangedRows,reason),randomUUID(),true));
 psql(database,`UPDATE public.native_employee_registration SET in_range=false WHERE contract_id=${literal(fourth[0])};`);
 const expiredRange=await bootSelected(0,'2026-10',fourth);
 check('bootstrap rejects an ineligible selected contract rather than silently dropping it',expiredRange.statusCode===422&&expiredRange.value.code==='FAMILY_PAYROLL_FACTS_SOURCE_REQUIRED');
 const rangedDetail=good(await get(1,{resource:'detail',id:ranged.proposalId},true));
 const rangeApproval=await post(1,{...await decideFamilySelected({...rangedDetail,current:true},'approve',reason)},randomUUID(),true);
 check('approval rechecks selected period eligibility and rejects a range change',!rangedDetail.current&&rangeApproval.statusCode===422&&rangeApproval.value.code==='FAMILY_PAYROLL_FACTS_SOURCE_REQUIRED');
 check('a saved proposal with ineligible source remains independently rejectable',good(await post(1,await decideFamilySelected(rangedDetail,'reject',reason),randomUUID(),true)).status==='rejected');
 psql(database,`UPDATE public.native_employee_registration SET in_range=true WHERE contract_id=${literal(fourth[0])};`);

 const identityBoot=good(await bootSelected(0,'2026-10',fourth)),identityPending=good(await post(0,prepareFamilySelected(identityBoot,rowsFor(identityBoot.source.subjects),reason),randomUUID(),true));
 psql(database,`UPDATE public.native_employee_registration SET token=repeat('f',64) WHERE contract_id=${literal(fourth[0])};`);
 const identityDetail=good(await get(1,{resource:'detail',id:identityPending.proposalId},true));
 const identityResult=await post(1,{...await decideFamilySelected({...identityDetail,current:true},'approve',reason)},randomUUID(),true);
 check('current identity is rechecked at approval and cannot be substituted by a saved token',!identityDetail.current&&identityResult.statusCode===409&&identityResult.value.code==='FAMILY_PAYROLL_FACTS_BASE_CHANGED');
 psql(database,`UPDATE public.native_employee_registration SET token=${literal(all[3].identityToken)} WHERE contract_id=${literal(fourth[0])};`);
 const scopeBefore=countEvents();
 psql(database,`UPDATE public.native_employee_registration SET source_binding_id=${literal(id(999))} WHERE contract_id=${literal(fourth[0])};`);
 const foreign=await bootSelected(0,'2026-10',fourth);
 check('a contract outside authoritative tenant binding cannot enter the selection',foreign.statusCode===422&&countEvents()===scopeBefore);
 psql(database,`UPDATE public.native_employee_registration SET source_binding_id=${literal(binding)} WHERE contract_id=${literal(fourth[0])};`);
 const rebindDetail=good(await get(1,{resource:'detail',id:identityPending.proposalId},true)),otherBoot=good(await bootSelected(1,'2026-10',third));
 const rebind=await post(1,{...await decideFamilySelected(rebindDetail,'approve',reason),contractIds:third,scopeVersion:otherBoot.scopeVersion},randomUUID(),true);
 check('valid IDs and scope from another selection cannot rebind the saved proposal',rebind.statusCode===409&&rebind.value.code==='FAMILY_PAYROLL_FACTS_PROPOSAL_CHANGED');
 check('capture still refuses a selected identity mismatch',/FAMILY_PAYROLL_FACTS_IDENTITY_CHANGED/.test(refuse(`SELECT public.own_family_payroll_facts_capture_v1(${literal(context)}::jsonb,${literal(JSON.stringify([{...all[0],identityToken:'f'.repeat(64)}]))}::jsonb,'2026-10');`)));

 // Historic V1 approvals can coexist with selected updates without reassigning
 // their per-contract approval; a later deliberate full approval is still V1.
 const sepBeforeOutside=capture('2026-09',[all[2]]),sepSelected=good(await bootSelected(0,'2026-09',selected));
 const sepChange=structuredClone(sepSelected.configuration.items);sepChange[0].definition.quantities.children='2';
 const sepPartial=good(await post(0,prepareFamilySelected(sepSelected,sepChange,reason),randomUUID(),true));
 const sepPartialDetail=good(await get(1,{resource:'detail',id:sepPartial.proposalId},true));good(await post(1,await decideFamilySelected(sepPartialDetail,'approve',reason),randomUUID(),true));
 check('V2 leaves all untouched V1 declarations and their exact capture hashes intact',JSON.stringify(capture('2026-09',[all[2]]))===JSON.stringify(sepBeforeOutside)&&good(await get(0,{resource:'bootstrap',period:'2026-09'})).configuration.items.length===848);
 const whole=good(await get(0,{resource:'bootstrap',period:'2026-09'})),wholeItems=structuredClone(whole.configuration.items);wholeItems[2].definition.quantities.spouse='1';
 const newWhole=good(await post(0,prepareFamilyPayrollFacts(whole,wholeItems,reason))),newWholeBoot=good(await get(1,{resource:'bootstrap',period:'2026-09'})),newWholeDetail=good(await get(1,{resource:'detail',id:newWhole.proposalId}));
 const fullApproved=good(await post(1,await decideFamilyPayrollFacts(newWholeBoot,newWholeDetail,'approve',reason)));
 check('a deliberate later V1 complete approval remains valid and has its own full provenance',capture('2026-09',all.slice(0,4)).records.every(r=>r.approvalId===fullApproved.eventId&&r.revision===fullApproved.revision));
 check('original pending848 and historical approval rows still retain their original bytes',hashEvent(octPending.proposalId)===pendingHash&&hashEvent(sepApproved.eventId)===approvalHash);
 const emptyCapture=capture('2026-10',[]);check('empty captures remain the exact empty V1 shape',emptyCapture.complete===true&&emptyCapture.records.length===0);
 check('event update deletion and truncate remain prohibited',['UPDATE public.own_family_payroll_facts_event SET revision=9;','DELETE FROM public.own_family_payroll_facts_event;','TRUNCATE public.own_family_payroll_facts_event;'].every(s=>/FAMILY_PAYROLL_FACTS_IMMUTABLE/.test(refuse(s))));
 const exposed=psql(database,`SELECT string_agg(p.proname,',' ORDER BY p.proname) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'own_family_payroll_facts_%' AND has_function_privilege('municontrol_actions_runtime_app',p.oid,'EXECUTE');`).trim().split(',');
 const expected=['attempt_v1','attempt_v2','bootstrap_v1','bootstrap_v2','command_v1','command_v2','detail_v1','detail_v2','history_v2'].map(s=>'own_family_payroll_facts_'+s).sort();
 check('runtime sees only the nine declared entry points and no helper or table access',JSON.stringify(exposed)===JSON.stringify(expected)&&psql(database,"SELECT has_table_privilege('municontrol_actions_runtime_app','public.own_family_payroll_facts_event','SELECT')::text;").trim()==='false');
 psql(database,`UPDATE public.tenant_identity_session SET expires_at=now()-interval '1 minute' WHERE id=${literal(sessions[0])};`);
 check('expired session cannot read the new selected bootstrap',(await bootSelected(0,'2026-10',selected)).statusCode===401);
} finally {
 psql('postgres','DROP DATABASE IF EXISTS '+database+' WITH (FORCE);');
}
const failed=checks.filter(([,ok])=>!ok);
for(const[name,ok]of checks)console.log((ok?'ok   ':'FAIL ')+name);
console.log(JSON.stringify({version:'family-selected-local-sql-qa.v1',checks:checks.length,pass:checks.length-failed.length,fail:failed.length,identityAndRegistryReaders:'synthetic stubs; unchanged production dependencies are separately pinned',productionConnections:0}));
process.exit(failed.length?1:0);
