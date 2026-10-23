// QA-only projection of the exact existing067 runtime grant. No connection,
// installer, production permission, identity or function body is created here.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck} from './native-leave-installation.mjs';

const file='scripts/migrations/067-native-employee-registration.sql';
const sourceSha256='aa33538cea459a275de8056b8316f3eb4465ebb88ad1de54578bb24380c4d749';
const runtimeRole='municontrol_actions_runtime_app';
const signatures=Object.freeze([
 'native_employee_bootstrap_v1(jsonb)',
 'native_employee_attempt_v1(jsonb,uuid)',
 'native_employee_create_v1(jsonb,jsonb,text,uuid)'
]);
// The185 graph also retains TABLE/text[] functions, whose headers are outside
// ownInstallationFunctionPin. Select ONLY the three literal067 declarations
// before parsing a complete pin; a selected malformed declaration still fails.
const definitionHeaders=Object.freeze({
 'native_employee_bootstrap_v1(jsonb)':'CREATE FUNCTION public.native_employee_bootstrap_v1(p jsonb) RETURNS jsonb',
 'native_employee_attempt_v1(jsonb,uuid)':'CREATE FUNCTION public.native_employee_attempt_v1(p jsonb,k uuid) RETURNS jsonb',
 'native_employee_create_v1(jsonb,jsonb,text,uuid)':'CREATE FUNCTION public.native_employee_create_v1(p jsonb,d jsonb,catalog_version text,k uuid) RETURNS jsonb'
});
const version='own-report-census-067-runtime-fixture.v1';
const slot='municontrol_census200.runtime067_before';
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const digest=value=>createHash('sha256').update(value).digest('hex');
const clean=value=>value.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim();
const functionSignatures=value=>[...value.matchAll(/(?:public\.)?[a-z][a-z0-9_]*\([^()]*\)/g)].map(match=>match[0].replace(/^public\./,'').replace(/\s+/g,''));

export function buildOwnReportCensus067RuntimeFixture({qa,read}){
 assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/,'CENSUS067_QA_SCHEMA_REQUIRED');
 assert.equal(qa.operationalPairBaseline,'published107','CENSUS067_QA_BASELINE_REQUIRED');
 assert.equal(typeof read,'function');assert.equal(typeof qa.normalized,'function');
 const source=read(file).replace(/\r\n?/g,'\n');
 assert.equal(digest(source),sourceSha256,'CENSUS067_SOURCE_CHANGED');
 assert.equal(qa.sourceHashes[file],sourceSha256,'CENSUS067_HOST_SOURCE_CHANGED');
 const acl=splitPostgresStatements(source).map(clean).map(statement=>/^(GRANT EXECUTE|REVOKE ALL) ON FUNCTION ([\s\S]+) (TO|FROM) ([a-zA-Z_,]+)$/.exec(statement)).filter(Boolean);
 const grants=acl.filter(row=>row[1]==='GRANT EXECUTE'&&functionSignatures(row[2]).some(signature=>signatures.includes(signature)));
 assert.equal(grants.length,1,'CENSUS067_SINGLE_SOURCE_GRANT_REQUIRED');
 const grant=grants[0];assert.equal(grant[3],'TO');assert.equal(grant[4],runtimeRole);
 assert.deepEqual(functionSignatures(grant[2]),[...signatures],'CENSUS067_FACADE_ALLOWLIST_CHANGED');
 for(const signature of signatures){
  const touching=acl.filter(row=>functionSignatures(row[2]).includes(signature));
  assert.equal(touching.at(-1),grant,'CENSUS067_LAST_SOURCE_GRANT_CHANGED');
  assert.ok(touching.some(row=>row[1]==='REVOKE ALL'&&row[3]==='FROM'&&row[4].split(',').includes('PUBLIC')),'CENSUS067_PUBLIC_REVOKE_REQUIRED');
 }
 // This is the SAME reviewed source graph that built the existing185 seed;
 // expected metadata is never obtained from an observed PostgreSQL catalogue.
 const graph=qa.foundation?.foundation?.foundation?.owner?.graph;
 assert.ok(graph&&Array.isArray(graph.definitions)&&Array.isArray(graph.desired)&&graph.pinHints instanceof Map,'CENSUS067_HOST_GRAPH_REQUIRED');
 const beforePins=signatures.map(signature=>{
  const wanted='public.'+signature;
  const header=definitionHeaders[signature];assert.equal(typeof header,'string','CENSUS067_CLOSED_HEADER_REQUIRED');
  const matches=graph.definitions.filter(definition=>definition.startsWith(header)&&/^\s/.test(definition.slice(header.length,header.length+1)));
  assert.equal(matches.length,1,'CENSUS067_SOURCE_DEFINITION_REQUIRED:'+signature);
  const pin=ownInstallationFunctionPin(matches[0]);assert.equal(pin.signature,wanted,'CENSUS067_SOURCE_SIGNATURE_CHANGED');
  const hint=graph.desired.find(value=>value.signature===pin.signature)??graph.pinHints.get(pin.signature+'|'+pin.sha256);
  return{...pin,runtime:!!hint?.runtime};
 });
 assert.deepEqual(beforePins.map(pin=>pin.signature),signatures.map(signature=>'public.'+signature));
 const afterPins=beforePins.map(pin=>({...pin,runtime:true}));
 const localSignatures=signatures.map(signature=>qa.schema+'.'+signature);
 const targetOids='ARRAY['+localSignatures.map(signature=>quote(signature)+'::regprocedure::oid').join(',')+']::oid[]';
 // The only permitted metadata delta is proacl of the three named functions.
 // Keep every other function byte/metadata field and role/schema/default ACL.
 const snapshot=`jsonb_build_object(
 'functions',(SELECT coalesce(jsonb_agg(jsonb_build_object('oid',p.oid,'record',CASE WHEN p.oid=ANY(${targetOids}) THEN to_jsonb(p)-'proacl' ELSE to_jsonb(p) END) ORDER BY p.oid),'[]'::jsonb) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'),
 'roles',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.oid),'[]'::jsonb) FROM pg_roles r),
 'memberships',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.roleid,m.member,m.grantor),'[]'::jsonb) FROM pg_auth_members m),
 'schemas',(SELECT coalesce(jsonb_agg(to_jsonb(n) ORDER BY n.oid),'[]'::jsonb) FROM pg_namespace n WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'),
 'defaultAcl',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.oid),'[]'::jsonb) FROM pg_default_acl a))`;
 const before=`DO $census067_before$ BEGIN PERFORM set_config(${quote(slot)},(${snapshot})::text,true);END $census067_before$`;
 const projectedGrant='GRANT EXECUTE ON FUNCTION '+localSignatures.join(',')+' TO '+runtimeRole;
 const after=`DO $census067_after$ BEGIN IF current_setting(${quote(slot)})::jsonb IS DISTINCT FROM ${snapshot} THEN RAISE EXCEPTION 'CENSUS067_UNRELATED_METADATA_CHANGED';END IF;END $census067_after$`;
 const beforeRuntime=beforePins.map(pin=>({signature:pin.signature,runtime:pin.runtime}));
 const proof=`SELECT jsonb_build_object('version',${quote(version)},'sourceSha256',${quote(sourceSha256)},'signatures',${quote(JSON.stringify(localSignatures))}::jsonb,'beforeRuntime',${quote(JSON.stringify(beforeRuntime))}::jsonb,'runtimeFacades',3,'restoredFacades',${beforePins.filter(pin=>!pin.runtime).length},'newRoles',0,'newFunctions',0,'definitionsChanged',0,'unrelatedMetadataPreserved',true,'preservationSha256',encode(public.digest(current_setting(${quote(slot)})::jsonb::text,'sha256'),'hex'))`;
 return{version,sourceHashes:{[file]:sourceSha256},sourceGrant:grant[0],signatures:localSignatures,beforeRuntime,restoredFacades:beforePins.filter(pin=>!pin.runtime).length,
  statements:[qa.normalized(pinsCheck(beforePins,'CENSUS067_BEFORE_METADATA_CHANGED')),before,projectedGrant,qa.normalized(pinsCheck(afterPins,'CENSUS067_AFTER_METADATA_CHANGED')),after,proof],
  newRoles:0,newFunctions:0,definitionsChanged:0,connects:false,executesSql:false};
}

export function assertOwnReportCensus067RuntimeFixture(plan,proof){
 assert.equal(proof.version,plan.version);assert.equal(proof.sourceSha256,sourceSha256);
 assert.deepEqual(proof.signatures,plan.signatures);assert.deepEqual(proof.beforeRuntime,plan.beforeRuntime);
 assert.equal(proof.runtimeFacades,3);assert.equal(proof.restoredFacades,plan.restoredFacades);
 for(const name of['newRoles','newFunctions','definitionsChanged'])assert.equal(proof[name],0);
 assert.equal(proof.unrelatedMetadataPreserved,true);assert.match(proof.preservationSha256,/^[a-f0-9]{64}$/);
 return{version,sourceSha256,signatures:plan.signatures,beforeRuntime:plan.beforeRuntime,runtimeFacades:3,restoredFacades:plan.restoredFacades,
  newRoles:0,newFunctions:0,definitionsChanged:0,unrelatedMetadataPreserved:true,preservationSha256:proof.preservationSha256};
}