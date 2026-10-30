// Pure fixture supplement for the existing190 synthetic seed. Not a product
// installer. Modern receipt params/snapshot/self definitions stay byte exact.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {buildOwnCloseSql} from './own-payroll-close-sql.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex'),q=s=>"'"+String(s).replaceAll("'","''")+"'";
const sources=Object.freeze({
 'scripts/migrations/124-own-payroll-liquidation-decisions.sql':'03035e3f7e126b1561222f1a894bcf1000dd586b6d05fb579cb4722d9aa41f4a',
 'scripts/migrations/125-own-payroll-close.sql':'443127dd55b9be5f37da47af303fcdd599b4d5dc0aad0a319a18253f8f139af5',
 'scripts/migrations/126-own-payroll-receipts.sql':'9f3e93154590b79d027d30a1408d07251211a67e87b581e570bdef013c2d33dc',
});
const strip=s=>s.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim();
const closeSources=Object.freeze({
 'scripts/migrations/123-own-payroll-runs.sql':'a9fe1129e921bb7c01985b8caadb009f6086aef9866e2298398175f7f25b4b6b',
 'scripts/lib/own-payroll-close-sql.mjs':'b30aa8751521a4df39f43b76ecc521308a9a0f8f158757a7c4c7e84e30f833f7',
});
const closeTargets=Object.freeze(['own_liquidation_rows_v1','own_liquidation_command_v1']);
const body=d=>{const m=/\bAS\s+(\$\w*\$)([\s\S]*)\1\s*;?\s*$/.exec(d);assert.ok(m,'CIRCUIT_CLOSE_BODY_REQUIRED');return m[2];};
// Header whitespace and CREATE/REPLACE spelling are fixture conventions. The
// complete AS body, argument names, types and function settings stay exact.
const definitionIdentity=d=>{const s=strip(d).replace(/;\s*$/,''),at=s.search(/\bAS\s+\$/);assert.ok(at>0,'CIRCUIT_CLOSE_HEADER_REQUIRED');return s.slice(0,at).replace(/^CREATE(?: OR REPLACE)? FUNCTION /,'CREATE OR REPLACE FUNCTION ').replace(/\s+/g,' ').trim()+' '+s.slice(at);};
const fnName=s=>/^CREATE(?: OR REPLACE)? FUNCTION (?:(?:public|mc_qa_fixed_092_[a-f0-9]{32})\.)?(own_[a-z0-9_]+)\(/.exec(strip(s))?.[1];
const groups=Object.freeze({
 liquidation:['own_liquidation_bootstrap_v1(jsonb)','own_liquidation_detail_v1(jsonb,uuid)','own_liquidation_attempt_v1(jsonb,uuid)','own_liquidation_command_v1(jsonb,jsonb,uuid)'],
 close:['own_close_detail_v1(jsonb,text,text)','own_close_attempt_v1(jsonb,uuid)','own_close_group_v1(jsonb,uuid)','own_close_command_v1(jsonb,jsonb,uuid)'],
 receipt:['own_receipt_preview_v1(jsonb,jsonb)','own_receipt_list_v1(jsonb,text)','own_receipt_batch_v1(jsonb,uuid)','own_receipt_attempt_v1(jsonb,uuid)','own_receipt_command_v1(jsonb,jsonb,uuid)','own_receipt_self_v1(jsonb)'],
});
function capabilitySupplement(s){
 const m=/^INSERT INTO public\.iam_capability\(([^)]+)\) VALUES([\s\S]+)$/.exec(s);assert.ok(m,'Canonical capability declaration required');
 const fields=m[1].split(',');assert.deepEqual(fields,['capability_key','label','description','scope_kind','sensitivity']);
 // Preserve existing synthetic capability rows; add only absent canonical keys.
 return `INSERT INTO public.iam_capability(${m[1]}) SELECT ${fields.map(f=>'fixture.'+f).join(',')} FROM (VALUES${m[2]}) fixture(${m[1]}) WHERE NOT EXISTS(SELECT 1 FROM public.iam_capability prior WHERE prior.capability_key=fixture.capability_key)`;
}
function facadeGrant(statements,group){
 const name=groups[group][0].split('(')[0],found=statements.filter(s=>s.startsWith('GRANT EXECUTE ON FUNCTION ')&&s.includes('public.'+name+'('));assert.equal(found.length,1);
 const grant=found[0],m=/^GRANT EXECUTE ON FUNCTION ([\s\S]+) TO municontrol_actions_runtime_app$/.exec(grant);assert.ok(m);
 const signatures=[...m[1].matchAll(/public\.([a-z0-9_]+\([^)]*\))/g)].map(v=>v[1].replace(/\s+/g,''));assert.deepEqual(signatures,groups[group]);
 return grant;
}
export function buildMonthlyDayCircuitFixture({read,normalized,schema,foundationSeed,actors}){
 assert.equal(typeof read,'function');assert.equal(typeof normalized,'function');assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 const all=Object.fromEntries(Object.entries(sources).map(([file,pin])=>{const text=read(file).replace(/\r\n?/g,'\n');assert.equal(sha(text),pin,'CIRCUIT_SOURCE_CHANGED:'+file);return[file,splitPostgresStatements(text).map(strip)];}));
 const existing=new Map(),existingCounts=new Map();for(const s of splitPostgresStatements(foundationSeed)){const name=fnName(s);if(name){existing.set(name,s);existingCounts.set(name,(existingCounts.get(name)??0)+1);}}
 const modern=['own_receipt_params_v1','own_receipt_self_v1','own_receipt_snapshot_v1'];
 assert.deepEqual([...existing.keys()].filter(n=>n.startsWith('own_receipt_')).sort(),modern,'The fixture must explicitly reconcile its three modern receipt supports');
 assert.ok(!new RegExp('CREATE TABLE (?:IF NOT EXISTS )?'+schema+'\\.own_payroll_receipt_event\\b').test(foundationSeed),'Receipt table already exists');
 for(const name of [...groups.liquidation,...groups.close].map(s=>s.split('(')[0]))assert.ok(existing.has(name),'Missing190 lifecycle support:'+name);
 const readClose=file=>{const pin=sources[file]??closeSources[file];assert.ok(pin,'CIRCUIT_CLOSE_SOURCE_REQUIRED:'+file);const text=read(file).replace(/\r\n?/g,'\n');assert.equal(sha(text),pin,'CIRCUIT_CLOSE_SOURCE_CHANGED:'+file);return text;};
 for(const file of Object.keys(closeSources))readClose(file);
 const close=buildOwnCloseSql(readClose),closeBefore=[],closeAfter=[],closeAdaptationLedger=[],closeEpochs=[];
 for(const name of closeTargets){
  assert.equal(existingCounts.get(name),1,'CIRCUIT_CLOSE_SINGLE_PREDECESSOR_REQUIRED:'+name);
  const before=close.before.filter(d=>fnName(d)===name),after=close.adapted.filter(d=>fnName(d)===name);assert.equal(before.length,1);assert.equal(after.length,1);
  const beforePin=ownInstallationFunctionPin(before[0]),afterPin=ownInstallationFunctionPin(after[0]);assert.deepEqual({...beforePin,sha256:null},{...afterPin,sha256:null},'CIRCUIT_CLOSE_METADATA_CHANGED:'+name);assert.equal(beforePin.runtime,false,'CIRCUIT_CLOSE_PRIVATE_PREDECESSOR_REQUIRED:'+name);
  const projectedBefore=normalized(before[0]),projectedAfter=normalized(after[0]);
  const actual=definitionIdentity(existing.get(name)),beforeIdentity=definitionIdentity(projectedBefore),afterIdentity=definitionIdentity(projectedAfter);
  assert.ok(actual===beforeIdentity||actual===afterIdentity,'CIRCUIT_CLOSE_PREDECESSOR_CHANGED:'+name);
  closeEpochs.push(actual===beforeIdentity?'124':'125');
  closeBefore.push({...beforePin,sha256:sha(body(projectedBefore))});closeAfter.push({...afterPin,sha256:sha(body(projectedAfter))});
  closeAdaptationLedger.push({name,sourceBeforeProsrcSha256:beforePin.sha256,sourceAfterProsrcSha256:afterPin.sha256,projectedBeforeProsrcSha256:sha(body(projectedBefore)),projectedAfterProsrcSha256:sha(body(projectedAfter)),sourceBeforeDefinitionSha256:sha(before[0]),sourceAfterDefinitionSha256:sha(after[0])});
 }
 // A whole source-derived pair defines the epoch. Mixed pairs and every
 // posterior197 body are refused; this fixture never rewinds a later guard.
 assert.equal(new Set(closeEpochs).size,1,'CIRCUIT_CLOSE_MIXED_EPOCH');const closePredecessorEpoch=closeEpochs[0];
 // 124 needs both125 guards. The canonical seed already at125 must retain
 // its complete bodies/OIDs/ACLs without emitting either replacement again.
 // Runtime authority is derived from124's complete published facade group.
 const existing125Pins=closeAfter.map(pin=>({...pin,runtime:groups.liquidation.includes(pin.signature.replace(/^public\./,''))}));
 const closeSupport=closePredecessorEpoch==='124'
  ?[normalized(pinsCheck(closeBefore,'CIRCUIT_CLOSE_PRIOR_METADATA')),...closeTargets.map(name=>normalized(close.adapted.find(d=>fnName(d)===name))),normalized(pinsCheck(closeAfter,'CIRCUIT_CLOSE_AFTER_METADATA'))]
  :[normalized(pinsCheck(existing125Pins,'CIRCUIT_CLOSE_EXISTING125_METADATA'))];
 const receipt=all['scripts/migrations/126-own-payroll-receipts.sql'],definitions=receipt.filter(s=>fnName(s)?.startsWith('own_receipt_'));
 assert.equal(definitions.length,14);const addedDefinitions=definitions.filter(s=>!existing.has(fnName(s)));assert.equal(addedDefinitions.length,11);
 const statements=[],selectedKinds=[];
 for(const s of receipt){
  const name=fnName(s);
  if(name){if(!existing.has(name)){statements.push(s);selectedKinds.push('function');}continue;}
  if(s.startsWith('INSERT INTO public.iam_capability(')){statements.push(capabilitySupplement(s));selectedKinds.push('capabilities');continue;}
  if(/^CREATE TABLE public\.own_payroll_receipt_event\(/.test(s)||/^ALTER TABLE public\.own_payroll_receipt_event ENABLE ROW LEVEL SECURITY$/.test(s)||/^REVOKE ALL ON public\.own_payroll_receipt_event FROM PUBLIC,municontrol_actions_runtime_app$/.test(s)||/^CREATE TRIGGER own_receipt_event_(?:immutable|no_truncate) /.test(s)){statements.push(s);selectedKinds.push('table-security');continue;}
  if(s.startsWith('DO $$ DECLARE fn record;BEGIN FOR fn IN SELECT oid::regprocedure signature FROM pg_proc ')&&s.includes("proname LIKE 'own_receipt_%'")&&s.includes("REVOKE ALL ON FUNCTION %s FROM PUBLIC,municontrol_actions_runtime_app")){statements.push(s);selectedKinds.push('canonical-private-function-acl');continue;}
  if(s===facadeGrant(receipt,'receipt')){statements.push(s);selectedKinds.push('canonical-facade-acl');continue;}
  assert.ok(s.startsWith('DO $$ BEGIN')&&s.includes('OWN_RECEIPT_ALREADY_INSTALLED')&&s.includes('OWN_RECEIPT_CAPABILITY_CONFLICT'),'Unexpected126 statement:'+s.slice(0,100));
  // Product126 installation preflight is deliberately not run against a fixture
  // that already has three modern definitions. Its complete expected before
  // state is asserted above; no product guard is edited or bypassed.
 }
 assert.equal(selectedKinds.filter(k=>k==='table-security').length,5);
 assert.equal(selectedKinds.filter(k=>k==='canonical-private-function-acl').length,1);
 assert.equal(selectedKinds.filter(k=>k==='canonical-facade-acl').length,1);
 const additionalCaps=[];for(const file of Object.keys(sources).slice(0,2)){const found=all[file].filter(s=>s.startsWith('INSERT INTO public.iam_capability('));assert.equal(found.length,1);additionalCaps.push(capabilitySupplement(found[0]));}
 const grants=[facadeGrant(all[Object.keys(sources)[0]],'liquidation'),facadeGrant(all[Object.keys(sources)[1]],'close')];
 const modelSource=read('assets/own-payroll-run-workspace-model.js').replace(/\r\n?/g,'\n');
 const quoted=s=>[...s.matchAll(/'([^']+)'/g)].map(m=>m[1]);
 const readMatch=/^export const OWN_RUN_READ = Object\.freeze\(\[([^\]]+)\]\);$/m.exec(modelSource),nominalMatch=/^export const OWN_RUN_NOMINAL = Object\.freeze\(\[\.\.\.OWN_RUN_READ,([^\]]+)\]\);$/m.exec(modelSource);
 assert.ok(readMatch&&nominalMatch,'Exact canonical nominal capability declarations required');
 const nominal=[...quoted(readMatch[1]),...quoted(nominalMatch[1])];assert.deepEqual(nominal,['workforce.employee.read','payroll.parameter.read','payroll.calculation.read','payroll.calculation.nominal.read','payroll.novelty.read','payroll.novelty.nominal.read','payroll.novelty.export']);
 const capabilities={maker:[...nominal,'payroll.calculation.approve','payroll.receipt.prepare'],checker:[...nominal,'payroll.calculation.approve','payroll.calculation.close','payroll.receipt.approve']};
 const roles=[];for(const kind of ['maker','checker']){const actor=actors[kind];assert.match(actor.membershipId,/^[a-f0-9-]{36}$/);assert.match(actor.actorEmail,/@[^@]*\.invalid$/);roles.push(`INSERT INTO public.iam_role_capability(role_key,capability_key) SELECT member.role_key,c.key FROM public.tenant_membership member CROSS JOIN(VALUES${capabilities[kind].map(c=>'('+q(c)+')').join(',')}) c(key) WHERE member.id=${q(actor.membershipId)}::uuid AND NOT EXISTS(SELECT 1 FROM public.iam_role_capability prior WHERE prior.role_key=member.role_key AND prior.capability_key=c.key)`);}
 const support=[...closeSupport,...[...additionalCaps,...statements,...grants,...roles].map(normalized)];
 for(const name of modern)assert.ok(!support.some(s=>fnName(s)===name),'A modern receipt definition would be overwritten');
 return {version:'own-monthly-day-circuit-fixture.v1',statements:support,sourceHashes:{...sources,...closeSources,'assets/own-payroll-run-workspace-model.js':sha(modelSource)},preservedDefinitions:modern.map(name=>({name,sha256:sha(existing.get(name))})),closeAdaptationLedger,newReceiptDefinitions:addedDefinitions.map(fnName),runtimeFacades:Object.values(groups).flat(),capabilities,closePredecessorEpoch,existingFunctionsReplaced:closePredecessorEpoch==='124'?2:0,newFixtureTables:1,productRoleAssignments:0,fixtureOnly:true,connects:false,executesSql:false};
}
