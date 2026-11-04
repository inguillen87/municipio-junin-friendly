// Only explicit fictional membership overrides in the existing canonical190
// fixture. No role, identity, function, schema or database is created here.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';

const files=Object.freeze({
 'scripts/migrations/067-native-employee-registration.sql':'aa33538cea459a275de8056b8316f3eb4465ebb88ad1de54578bb24380c4d749',
 'scripts/migrations/123-own-payroll-runs.sql':'a9fe1129e921bb7c01985b8caadb009f6086aef9866e2298398175f7f25b4b6b',
 'scripts/migrations/124-own-payroll-liquidation-decisions.sql':'03035e3f7e126b1561222f1a894bcf1000dd586b6d05fb579cb4722d9aa41f4a',
 'scripts/migrations/125-own-payroll-close.sql':'443127dd55b9be5f37da47af303fcdd599b4d5dc0aad0a319a18253f8f139af5',
 'scripts/migrations/026-governed-payroll-novelties.sql':'4be6efc1dedcb4e883988f1c3f0d3d0e7751d29f24e2a6bfe0d0e4ea12ad340c'
});
const keys=Object.freeze({
 maker:['employee.record.create','payroll.calculation.read','payroll.calculation.nominal.read','payroll.calculation.prepare','payroll.novelty.read','payroll.novelty.nominal.read','payroll.novelty.export'],
 checker:['payroll.calculation.read','payroll.calculation.nominal.read','payroll.calculation.approve','payroll.calculation.close','payroll.novelty.read','payroll.novelty.nominal.read','payroll.novelty.export']
});
const quote=v=>"'"+v.replaceAll("'","''")+"'",hash=v=>createHash('sha256').update(v).digest('hex');
const fields=['capability_key','label','description','scope_kind','sensitivity'];
const tuple="\\(\\s*('(?:[^']|'')*')\\s*,\\s*('(?:[^']|'')*')\\s*,\\s*('(?:[^']|'')*')\\s*,\\s*('(?:[^']|'')*')\\s*,\\s*('(?:[^']|'')*')\\s*\\)";
const reason='Asignación exclusivamente ficticia y acotada de censo QA200';
const ordered=values=>[...values].sort();
export function buildOwnReportCensus190IamFixture({qa,read}){
 assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.equal(qa.operationalPairBaseline,'published107');
 const declarations=new Map(),sourceHashes={};
 for(const[file,expected]of Object.entries(files)){
  const source=read(file).replace(/\r\n?/g,'\n');assert.equal(hash(source),expected,'CENSUS190_IAM_SOURCE_CHANGED:'+file);sourceHashes[file]=expected;
  for(const statement of splitPostgresStatements(source)){
   const clean=statement.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim();
   if(!/^INSERT INTO (?:public\.)?iam_capability\s*\(\s*capability_key\s*,\s*label\s*,\s*description\s*,\s*scope_kind\s*,\s*sensitivity\s*\)\s*VALUES\b/.test(clean))continue;
   const valuePart=clean.slice(clean.indexOf('VALUES')+6).split(/\bON CONFLICT\b/)[0];
   for(const match of valuePart.matchAll(new RegExp(tuple,'g'))){
    const literals=match.slice(1),values=literals.map(value=>value.slice(1,-1).replaceAll("''","'"));
    if(![...keys.maker,...keys.checker].includes(values[0]))continue;
    assert.equal(values[3],'tenant');assert.ok(!declarations.has(values[0]),'CENSUS190_IAM_DUPLICATE_DECLARATION');
    declarations.set(values[0],{sql:match[0],record:Object.fromEntries(fields.map((field,index)=>[field,values[index]])),file});
   }
  }
 }
 assert.equal(declarations.size,9,'CENSUS190_IAM_DECLARATIONS_REQUIRED');
 const assignments=Object.entries(keys).flatMap(([who,capabilities])=>capabilities.map(capability=>({membershipId:(who==='maker'?qa.actor:qa.checker).membershipId,capability,grantedBy:qa.actor.actorEmail}))).sort((a,b)=>(a.membershipId+':'+a.capability).localeCompare(b.membershipId+':'+b.capability));assert.equal(assignments.length,14);
 const agg=(table,alias,order)=>"(SELECT coalesce(jsonb_agg(to_jsonb("+alias+") ORDER BY "+order+"),'[]'::jsonb) FROM public."+table+' '+alias+')';
 const effective="(SELECT coalesce(jsonb_agg(jsonb_build_object('membershipId',m.id,'capabilities',coalesce((SELECT jsonb_agg(capability_key ORDER BY capability_key COLLATE \"C\") FROM public.tenant_iam_effective_capabilities(m.id)),'[]'::jsonb)) ORDER BY m.id),'[]'::jsonb) FROM public.tenant_membership m)";
 const state="jsonb_build_object('roles',"+agg('iam_role','r','role_key COLLATE "C"')+",'roleCapabilities',"+agg('iam_role_capability','r','role_key COLLATE "C",capability_key COLLATE "C"')+",'memberships',"+agg('tenant_membership','m','id')+",'overrides',"+agg('tenant_membership_capability_override','o','membership_id,capability_key COLLATE "C"')+",'capabilities',"+agg('iam_capability','c','capability_key COLLATE "C"')+",'conflicts',"+agg('iam_capability_conflict','c','capability_key COLLATE "C",conflicts_with_key COLLATE "C"')+",'effective',"+effective+')';
 const wanted=quote(JSON.stringify(assignments))+'::jsonb';
 const sod="FOR membership IN SELECT id FROM public.tenant_membership ORDER BY id LOOP PERFORM public.tenant_iam_assert_no_sod_conflict(membership.id);END LOOP;";
 const before=`DO $census_iam_before$ DECLARE membership record;BEGIN IF EXISTS(SELECT 1 FROM public.tenant_membership_capability_override o JOIN jsonb_array_elements(${wanted}) wanted ON o.membership_id=(wanted->>'membershipId')::uuid AND o.capability_key=wanted->>'capability') THEN RAISE EXCEPTION 'CENSUS190_IAM_ASSIGNMENT_ALREADY_EXISTS';END IF;${sod}PERFORM set_config('municontrol_census200.iam_before',(${state})::text,true);END $census_iam_before$`;
 const inserts=[...declarations.values()].map(({sql,record})=>`INSERT INTO public.iam_capability(${fields.join(',')}) VALUES ${sql} ON CONFLICT(capability_key) DO NOTHING;DO $definition$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.iam_capability c WHERE c.capability_key=${quote(record.capability_key)} AND to_jsonb(c)-'created_at'=${quote(JSON.stringify(record))}::jsonb) THEN RAISE EXCEPTION 'CENSUS190_IAM_DEFINITION_CHANGED';END IF;END $definition$`);
 const overrides=assignments.map(value=>`INSERT INTO public.tenant_membership_capability_override(membership_id,capability_key,allow_override,deny_override,reason,granted_by_user_email) VALUES(${quote(value.membershipId)}::uuid,${quote(value.capability)},true,false,${quote(reason)},${quote(value.grantedBy)})`);
 const proof=`DO $census_iam_sod$ DECLARE membership record;BEGIN ${sod}END $census_iam_sod$;SELECT jsonb_build_object('version','own-report-census-190-iam-fixture.v1','before',current_setting('municontrol_census200.iam_before')::jsonb,'after',${state},'assignments',${wanted})`;
 return{version:'own-report-census-190-iam-fixture.v1',sourceHashes,assignments,declarations:[...declarations.values()].map(value=>value.record),reason,statements:[before,...inserts,...overrides,proof].map(qa.normalized),newRoles:0,newMemberships:0,newFunctions:0,newSchemas:0,roleAssignmentsChanged:0,connects:false,executesSql:false};
}
export function assertOwnReportCensus190IamFixture(plan,proof){
 assert.equal(proof.version,plan.version);assert.deepEqual(proof.assignments,plan.assignments);
 const fields=['roles','roleCapabilities','memberships','overrides','capabilities','conflicts','effective'];
 for(const value of[proof.before,proof.after]){assert.deepEqual(Object.keys(value).sort(),[...fields].sort());for(const field of fields)assert.ok(Array.isArray(value[field]));}
 for(const field of['roles','roleCapabilities','memberships','conflicts'])assert.deepEqual(proof.after[field],proof.before[field],'CENSUS190_IAM_PRIOR_STATE_CHANGED:'+field);
 const assigned=new Map(plan.assignments.map(value=>[value.membershipId+':'+value.capability,value])),beforeOverrides=new Map(proof.before.overrides.map(value=>[value.membership_id+':'+value.capability_key,value]));
 assert.equal(proof.after.overrides.length,proof.before.overrides.length+plan.assignments.length);
 for(const value of proof.after.overrides){const key=value.membership_id+':'+value.capability_key,expected=assigned.get(key);if(!expected){assert.deepEqual(value,beforeOverrides.get(key));beforeOverrides.delete(key);continue;}assert.equal(beforeOverrides.has(key),false);const{created_at,...record}=value;assert.equal(typeof created_at,'string');assert.ok(Number.isFinite(Date.parse(created_at)));assert.deepEqual(record,{membership_id:expected.membershipId,capability_key:expected.capability,allow_override:true,deny_override:false,reason:plan.reason,granted_by_user_email:expected.grantedBy});assigned.delete(key);}
 assert.equal(assigned.size,0);assert.equal(beforeOverrides.size,0);
 const definitions=new Map(plan.declarations.map(value=>[value.capability_key,value])),beforeCapabilities=new Map(proof.before.capabilities.map(value=>[value.capability_key,value]));
 for(const value of proof.after.capabilities){const prior=beforeCapabilities.get(value.capability_key);if(prior){assert.deepEqual(value,prior);beforeCapabilities.delete(value.capability_key);}else{const{created_at,...record}=value;assert.equal(typeof created_at,'string');assert.ok(Number.isFinite(Date.parse(created_at)));assert.deepEqual(record,definitions.get(value.capability_key));}definitions.delete(value.capability_key);}
 assert.equal(beforeCapabilities.size,0);assert.equal(definitions.size,0);
 const expectedEffective=proof.before.effective.map(value=>({membershipId:value.membershipId,capabilities:ordered(new Set([...value.capabilities,...plan.assignments.filter(row=>row.membershipId===value.membershipId).map(row=>row.capability)]))}));
 assert.deepEqual(proof.after.effective,expectedEffective,'CENSUS190_IAM_EFFECTIVE_SET_CHANGED');
 return{passed:true,overridesAdded:plan.assignments.length,canonicalDefinitions:plan.declarations.length,rolesChanged:0,membershipsChanged:0,functionsChanged:0,allMembershipSodChecked:true};
}
