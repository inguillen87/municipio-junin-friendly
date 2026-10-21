import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ownFullCapacity190SourceProjection as p} from './fixtures/own-payroll-full-capacity-190-source-projection.js';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),hash=value=>createHash('sha256').update(value).digest('hex');

test('Vercel bundle retains every pinned full-capacity source while private inputs stay excluded',()=>{
 const rules=read('.vercelignore').split(/\r?\n/).map(rule=>rule.trim()).filter(rule=>rule&&!rule.startsWith('#'));
 const included=file=>{let keep=true;for(const rule of rules){const neg=rule.startsWith('!'),pattern=neg?rule.slice(1):rule;if(pattern.endsWith('/')?file.startsWith(pattern):path.matchesGlob(file,pattern)||!pattern.includes('/')&&path.matchesGlob(path.basename(file),pattern))keep=neg;}return keep;};
 for(const file of Object.keys({...p.candidatePins,...p.dependencies}))assert.ok(included(file),'Build dependency excluded: '+file);
 for(const file of ['.handoff/result.json','AGENTS.md','CODEX_TASK.md','MUNICONTROL_HANDOFF.md','.env.local','verification/result.json','source.sql','source.sql.gz','private.backup_2026100115_plataforma.sql.gz'])assert.equal(included(file),false,file);
});
test('M7 source bytes pin the exact canonical190 overlay and admitted source dependencies',()=>{
 for(const[file,digest]of Object.entries({...p.candidatePins,...p.dependencies}))assert.equal(hash(fs.readFileSync(new URL('../'+file,import.meta.url))),digest,file);
});
test('trusted full transport leaves every other190 source byte equal to its parent',()=>{
 let source=read('scripts/verify-municipal-owner-program.mjs').replace(/\r\n/g,'\n');
 const changes=[
  ["const run=(sql,expected,{fullJson=false}={})=>{assert.equal(typeof fullJson,'boolean','OWNER_PROGRAM_QA_FULL_PROFILE_INVALID');",'const run=(sql,expected)=>{'],
  ['maxBuffer:fullJson===true?40*1024*1024:20*1024*1024','maxBuffer:20*1024*1024'],
  ["json:(statements,{fullJson=false,...options}={})=>{assert.equal(typeof fullJson,'boolean','OWNER_PROGRAM_QA_FULL_PROFILE_INVALID');return run(tx(statements,options),undefined,{fullJson});}",'json:(statements,options={})=>run(tx(statements,options))']
 ];
 for(const[after,before]of changes){assert.equal(source.split(after).length,2);source=source.replace(after,()=>before);}assert.equal(hash(source),p.parentRunnerLfSha256);
});
test('M7 uses the existing190 caller, fixed published107 and whole201R4 after separate200 admission',()=>{
 const wrapper=read('scripts/verify-own-payroll-full-capacity.mjs'),install=read('scripts/lib/own-payroll-full-capacity-190-installation.mjs');
 assert.equal((wrapper.match(/await verifyMunicipalOwnerProgram\(/g)??[]).length,1);assert.ok(wrapper.includes('continuation:runOwnFullCapacity190Continuation'));assert.ok(wrapper.includes("operationalPairBaseline:'published107'"));
 assert.ok(install.includes('graph.pool.get(p.signature+\'|\'+p.bodySha256)'));assert.ok(install.includes("assert.equal(pre.items.length,11);assert.equal(post.items.length,27)"));assert.ok(install.includes('statements:[keep.before,local,keep.after,keep.compare,keep.proof]'));
 assert.ok(install.indexOf('const installed=h.json(plan.censusStatements)')<install.indexOf('fullRehearsal=h.json(plan.statements'));assert.ok(install.includes('verification:[postflight,keep.after,keep.proof]'));
 const later=install.slice(install.indexOf('const fullInstalled='));assert.ok(!later.includes('plan.censusVerification'));assert.ok(!/child_process|spawn\(|execFile\(|ownerAdoptionQaTransport\(/.test(install));
});
test('855 lifecycle uses actual IAM, preserves the current programme and keeps runtime JSON opaque',()=>{
 const source=read('scripts/lib/own-payroll-full-capacity-190-continuation.mjs'),rpc=read('scripts/lib/own-payroll-full-capacity-190-rpc.mjs');
 const binding=source.slice(source.indexOf('function bind('),source.indexOf('function access('));assert.ok(!binding.includes('qa.normalized'));assert.ok(binding.includes('const statement=text'));assert.ok(rpc.includes("text.replace('public.'+entry.name,schema+'.'+entry.name).replace("));
 for(const value of['buildOwnReportCensus190IamFixture','ownerProgramQaAccess','tenant_membership_capability_override','M7_190_EXISTING_APPROVED_EVOLUTION_REQUIRED','M7_190_REAL_PERIOD_BINDING_REQUIRED','length:18','length:855','native_employee_create_v1','17100','QA_M7_CAPACITY_LATE_ANNUL_FAULT','reopenedCensus.sourceVersion,closedCensus.sourceVersion'])assert.ok(source.includes(value),value);
 assert.ok(!/FROM capabilities|DELETE FROM capabilities|INSERT INTO capabilities/.test(source));assert.ok(!/ALTER.*DISABLE|CREATE SCHEMA|CREATE DATABASE|ownerAdoptionQaTransport\(/.test(source));
 assert.ok(source.includes("'SELECT own_annul_command_full_v1('+j(qa.checker)"));assert.ok(source.includes('assert.deepEqual(reopenedCensus.events.map(e=>e.id).sort(),[closed.id,reopened.id].sort())'));
 const workflow=read('.github/workflows/own-payroll-full-capacity.yml');for(const value of['pg: [17, 18]','--transport=ci','--operational-pair-baseline=published107','--source-commit=${{ github.sha }}','--output=verification/own-full-capacity-pg${{ matrix.pg }}','own-full-capacity-pg${{ matrix.pg }}-published107-${{ github.sha }}'])assert.ok(workflow.includes(value),value);
});

test('every continuation entry satisfies the unchanged exact190 entry guard',()=>{
 const wrapper=read('scripts/verify-own-payroll-full-capacity.mjs'),runner=read('scripts/verify-municipal-owner-program.mjs'),match=/const entries=\[([\s\S]*?)\];/.exec(wrapper);assert.ok(match);
 const entries=[...match[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);assert.ok(entries.length>0);
 assert.ok(runner.includes("Array.isArray(continuationEntries)&&continuationEntries.every(value=>typeof value==='string'&&!value.startsWith('.')&&!value.includes('..'))"));
 assert.ok(Array.isArray(entries)&&entries.every(value=>typeof value==='string'&&!value.startsWith('.')&&!value.includes('..')),'the real190 guard must admit every declared continuation entry');
 assert.ok(!entries.includes('.github/workflows/own-payroll-full-capacity.yml'));assert.ok(Object.hasOwn(p.candidatePins,'.github/workflows/own-payroll-full-capacity.yml'),'workflow stays pinned separately as non-runtime source metadata');
});
