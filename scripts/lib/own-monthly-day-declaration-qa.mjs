// Reuse the admitted synthetic189/185/157 foundation, not their later installers.
// Building a fixture/SQL protocol is pure. This module does not execute SQL.
import assert from'node:assert/strict';import{createHash,randomUUID}from'node:crypto';
import{buildMonthlyParticipationQa,monthlyQaRuntimeAcl,monthlyQaReachableFunctions,monthlyQaOptions,monthlyQaLiteral as q}from'./own-monthly-participation-qa.mjs';
import{buildOwnMonthlyDayDeclarationInstallation,MONTHLY193_SQL}from'./own-monthly-day-declaration-installation.mjs';
import{memoizeInstallationPhaseText}from'./installation-phase-text-map.mjs';
export const monthly193Hash=v=>createHash('sha256').update(v).digest('hex');
export function monthly193Options(argv){const o=monthlyQaOptions(argv);assert.equal(o.transport,'ci','MONTHLY193_CI_ONLY');return o;}
export function monthly193Query(text,args,schema){
 assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.match(text,/^SELECT public\.own_monthly_days_(?:bootstrap|detail|attempt|command)_v1\([^;]*\) AS result$/);assert.ok(Array.isArray(args));
 const used=new Set(),query=text.replaceAll('public.',schema+'.').replace(/\$(\d+)\b/g,(_,n)=>{const i=Number(n)-1;assert.ok(i>=0&&i<args.length);assert.equal(typeof args[i],'string');used.add(i);return q(args[i]);});assert.equal(used.size,args.length);return query;
}
export function buildMonthlyDayDeclarationQa({major,sourceCommit,read,schema='mc_qa_fixed_092_'+randomUUID().replaceAll('-',''),operationalPairBaseline='pre107'}){
 const foundation=buildMonthlyParticipationQa({major,sourceCommit,read,schema,operationalPairBaseline});
 const sourceHashes={...foundation.sourceHashes},checkedRead=f=>{const s=read(f).replace(/\r\n?/g,'\n');sourceHashes[f]=monthly193Hash(s);return s;},acl=monthlyQaRuntimeAcl(foundation.seed,schema);
 const batch=buildOwnMonthlyDayDeclarationInstallation({read:checkedRead,sourceCommit,prerequisiteDefinitions:foundation.base.definitions,prerequisiteRuntime:[...acl].map(s=>s.replaceAll(schema+'.','public.'))});
 const body=d=>{const m=/\bAS\s+(\$\w*\$)([\s\S]*)\1\s*;?$/.exec(d);assert.ok(m);return m[2];},hashes={};
 for(let i=0;i<batch.definitions.length;i++)hashes[batch.newPins[i].sha256]=monthly193Hash(body(foundation.normalized(batch.definitions[i])));
 const normalized=s=>{let value=foundation.normalized(s);for(const[a,b]of Object.entries(hashes))value=value.replaceAll(a,b);return value;};
 const phaseText=memoizeInstallationPhaseText(normalized);
 const local=Object.fromEntries(['rehearsal','installation','verification','repetition'].map(k=>[k,batch[k].map(phaseText)]));
 const seed=foundation.seed+`;\nINSERT INTO ${schema}.iam_role_capability VALUES('QA_AUTHORITY_OPERATOR','payroll.parameter.approve')`;
 const roots=batch.newPins.map(p=>p.name),reachableFunctions=monthlyQaReachableFunctions(seed+';\n'+normalized(batch.migration.join(';\n')),{schema,roots});assert.deepEqual(reachableFunctions.missing,[],'MONTHLY193_REACHABLE_FUNCTION_MISSING');
 assert.equal(foundation.installsOwnerAuthority,false);assert.equal(foundation.sqlAuthorityStubs,false);assert.ok(!foundation.seed.includes('CREATE FUNCTION '+schema+'.own_monthly_participation_source_v1('));assert.ok(!foundation.seed.includes('CREATE FUNCTION '+schema+'.own_monthly_days_'));
 assert.equal(sourceHashes[MONTHLY193_SQL],batch.sqlSha256);
 return{version:'own-monthly-day-declaration-qa.v1',major,sourceCommit,operationalPairBaseline,schema,foundation,batch,sourceHashes,seed,normalized,local,reachableFunctions,actor:foundation.actor,checker:foundation.checker,base:foundation.base,fixtureMakerBothParameterCapabilities:true,installs189:false,installs184:false,changes190:false,changes192:false,sqlAuthorityStubs:false,connects:false,executesSql:false};
}
export function monthly193EventStateSql(qa){assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);return`SELECT jsonb_build_object('events',(SELECT count(*) FROM ${qa.schema}.own_monthly_days_event),'proposals',(SELECT count(*) FROM ${qa.schema}.own_monthly_days_event WHERE command='propose'),'approvals',(SELECT count(*) FROM ${qa.schema}.own_monthly_days_event WHERE command='approve'),'genericEvents',(SELECT count(*) FROM ${qa.schema}.own_participation_event),'captures',(SELECT count(*) FROM ${qa.schema}.own_payroll_run_capture),'results',(SELECT count(*) FROM ${qa.schema}.own_payroll_run_result))`;}
