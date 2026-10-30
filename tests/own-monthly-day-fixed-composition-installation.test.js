// Pure source plans only. No PostgreSQL, API, process or native runner is invoked.
import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import{createHash}from'node:crypto';
import{buildMonthlyDayFixedCompositionQa,monthlyFixedSqlFixture,monthlyFixedQaRpc}from'../scripts/lib/own-monthly-day-fixed-composition-qa.mjs';
import{buildMonthlyDayFixedCompositionInstallation,MONTHLY_FIXED_COMPOSITION_SQL,MONTHLY_FIXED_COMPOSITION_SHA256}from'../scripts/lib/own-monthly-day-fixed-composition-installation.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'),sha=s=>createHash('sha256').update(s).digest('hex');
for(const operationalPairBaseline of['pre107','published107'])test('guarded mixed196 retains exact194 capture/readiness and six predecessor OIDs for '+operationalPairBaseline,()=>{
 const qa=buildMonthlyDayFixedCompositionQa({major:17,sourceCommit:'a'.repeat(40),read,operationalPairBaseline}),b=qa.fixedComposition;
 assert.equal(qa.connects,false);assert.equal(qa.executesSql,false);assert.equal(b.connects,false);assert.equal(b.executesSql,false);assert.equal(b.executionAdmitted,false);assert.equal(b.run7Included,false);
 assert.equal(b.beforePins.length,6);assert.equal(b.afterPins.length,6);assert.equal(b.newPins.length,3);assert.equal(b.mutations.length,12);assert.equal(b.newPins.some(p=>p.runtime),false);
 assert.equal(sha(read(MONTHLY_FIXED_COMPOSITION_SQL)),MONTHLY_FIXED_COMPOSITION_SHA256);assert.equal(b.beforeCheck.startsWith(b.days.afterCheck),true);
 for(const p of[b.preservedCapturePin,b.preservedReadinessPin]){assert.ok(b.beforeCheck.includes(p.sha256));assert.ok(b.afterCheck.includes(p.sha256));assert.equal(b.mutations.some(d=>d.includes('FUNCTION public.'+p.name+'(')),false);}
 for(let n=0;n<6;n++){assert.deepEqual({...b.beforePins[n],sha256:null},{...b.afterPins[n],sha256:null});assert.ok(b.beforeCheck.includes(b.beforePins[n].sha256));assert.ok(b.afterCheck.includes(b.afterPins[n].sha256));assert.equal(b.afterCheck.includes(b.beforePins[n].sha256),false);}
 for(const s of['aclexplode','proowner','proconfig','proargnames','proparallel','has_function_privilege'])assert.ok(b.beforeCheck.includes(s),s);for(const s of["'roles'","'memberships'","'constraints'","'indexes'","'triggers'","'types'",'rowsSha256','last_value'])assert.ok(b.before.includes(s),s);
 assert.ok(b.mode.includes('MONTHLY_FIXED_BASELINE_CHANGED'));assert.ok(b.installation[0].includes('NOT IN(17,18)'));assert.ok(b.verification[0].includes("transaction_read_only')<>'on'"));assert.ok(b.rollback.includes(b.fixed.noHistory));assert.ok(b.rollback.indexOf(b.fixed.noHistory)<b.rollback.findIndex(s=>s.startsWith('CREATE OR REPLACE FUNCTION ')));
 assert.ok(qa.localFixed.installation.join('\n').includes(qa.schema+'.own_fixed_forced_capture_v1'));assert.ok(!qa.localFixed.installation.join('\n').includes('own_run_capture_fixed_full_v2'));
 assert.equal(b.beforePins.find(p=>p.name==='own_program_definition_v1').sha256,b.days.afterPins.find(p=>p.name==='own_program_definition_v1').sha256);
});
test('composition source rejects drift and keeps all fixed provenance/collision guards',()=>{
 const qa=buildMonthlyDayFixedCompositionQa({major:18,sourceCommit:'b'.repeat(40),read,operationalPairBaseline:'pre107'}),b=qa.fixedComposition,options={read,sourceCommit:b.sourceCommit,operationalPairBaseline:b.operationalPairBaseline,prerequisiteDefinitions:qa.qa193.foundation.base.definitions,prerequisiteRuntime:b.days.declaration.prerequisitePins.filter(p=>p.runtime).map(p=>p.signature)};
 assert.throws(()=>buildMonthlyDayFixedCompositionInstallation({...options,read:p=>read(p)+(p===MONTHLY_FIXED_COMPOSITION_SQL?'\n-- drift':'')}),/MONTHLY_FIXED_SOURCE_CHANGED/);
 const s=b.newDefinitions.find(d=>d.includes('FUNCTION public.own_fixed_forced_capture_v1('));for(const token of['sourceRowSha256','OWN_RUN_FORCED_SOURCE_COLLISION','OWN_RUN_FORCED_QUANTITY_UNKNOWN','OWN_RUN_SOURCE_UNUSED','fullMonthDeclared','monthly_day_declaration_fact','period_fact'])if(token==='monthly_day_declaration_fact')continue;else assert.ok(s.includes(token),token);
 assert.ok(s.includes("recognizedDays}')::numeric=30"));assert.ok(s.includes("fullPeriod'='true'::jsonb"));assert.ok(s.includes("definition->>'monthlyDayDeclarationVersion' IS DISTINCT FROM 'own-monthly-approved-days.v1' OR EXISTS"));assert.equal(b.adapted.some(s=>s.includes('own_run_capture_fixed_full_v2')),false);
});
test('forced synthetic programme retains catalog and scalar zero rule until a real fixed override is approved',()=>{
 const plain=monthlyFixedSqlFixture(),forced=monthlyFixedSqlFixture({forced:true}),generic=monthlyFixedSqlFixture({forced:true,generic:true,fullMonth192:true});assert.deepEqual(plain.items,forced.items);assert.deepEqual(plain.items,generic.items);assert.equal(plain.definition.fixedForcedAmountsVersion,undefined);assert.equal(forced.definition.rules.find(r=>r.code==='919409').expression.value,'0');assert.equal(forced.definition.bindings.some(b=>b.sourceKind==='period_fact'),false);assert.equal(generic.definition.bindings.some(b=>b.sourceKind==='period_fact'),true);
 const schema='mc_qa_fixed_092_'+'a'.repeat(32),text='SELECT public.payroll_fixed_registry_propose_v1($1::jsonb,$2::jsonb,$3::uuid) AS result';assert.match(monthlyFixedQaRpc(text,['{}','{}','10000000-0000-4000-8000-000000000001'],schema),new RegExp(schema+'\\.payroll_fixed_registry_propose_v1'));
 assert.throws(()=>monthlyFixedQaRpc('SELECT public.payroll_fixed_registry_context_v1($1::jsonb) AS result',['{}'],schema),/FACADE_REQUIRED/);
});

import{monthlyFixedQaHeader}from'../scripts/lib/own-monthly-day-fixed-composition-qa.mjs';
import{monthlyDayQaHeader}from'../scripts/lib/own-monthly-day-policy-qa.mjs';
test('196 compact TO header and quoted installation literal normalize without changing function bodies',()=>{
 const compact="CREATE OR REPLACE FUNCTION public.fixture() RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path TO 'pg_catalog','public','pg_temp' AS $$ SELECT 'source-body-unchanged'::text $$";
 assert.equal(monthlyDayQaHeader(compact),compact,'This is the exact missing194 normalization branch');const transformed=monthlyFixedQaHeader(compact);assert.ok(transformed.includes('SET search_path=pg_catalog,public,pg_temp'));assert.equal(transformed.slice(transformed.indexOf(' AS $$')),compact.slice(compact.indexOf(' AS $$')));
 const literal=compact.replaceAll("'","''");assert.equal(monthlyFixedQaHeader(literal).includes("SET search_path TO ''pg_catalog''"),false);assert.ok(monthlyFixedQaHeader(literal).includes('SET search_path=pg_catalog,public,pg_temp'));
});

test('fixed guard193 is monthly-only and all other liquidation types retain the exact157 requirement',()=>{
 const source=read(MONTHLY_FIXED_COMPOSITION_SQL),declared="IF c.body->>'liquidationType'='monthly' AND definition->>'monthlyDayDeclarationVersion' IS NOT DISTINCT FROM 'own-monthly-approved-days.v1' AND NOT EXISTS",generic="IF has_participation AND (c.body->>'liquidationType' IS DISTINCT FROM 'monthly' OR definition->>'monthlyDayDeclarationVersion' IS DISTINCT FROM 'own-monthly-approved-days.v1' OR EXISTS";
 assert.equal(source.split(declared).length-1,1);assert.equal(source.split(generic).length-1,1);assert.ok(source.includes("b->>'sourceKind'='period_fact'"));
 assert.equal(source.includes("IF definition->>'monthlyDayDeclarationVersion' IS NOT DISTINCT FROM 'own-monthly-approved-days.v1' AND NOT EXISTS"),false);
});

import{ownProgramParticipationSourceRequired}from'../assets/own-monthly-day-declaration-program.js';
test('typed monthly193 programme consumes157 only for its valid nonmonthly forced rule',()=>{const p=monthlyFixedSqlFixture({forced:true}).definition;assert.deepEqual(p.rules.find(r=>r.code==='919409').liquidationTypes,['monthly','supplementary']);assert.equal(ownProgramParticipationSourceRequired(p,'monthly'),false);assert.equal(ownProgramParticipationSourceRequired(p,'supplementary'),true);assert.equal(p.bindings.some(b=>b.sourceKind==='period_fact'),false);});
