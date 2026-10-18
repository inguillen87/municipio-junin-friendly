// Pure extension of the public194 fixture. SQL is returned, never executed here.
import assert from'node:assert/strict';import{createHash}from'node:crypto';
import{buildMonthly194Qa,monthly194QaRpc}from'./own-monthly-day-engine-source-qa.mjs';import{monthlyDayQaHeader}from'./own-monthly-day-policy-qa.mjs';
import{buildMonthlyDayFixedCompositionInstallation}from'./own-monthly-day-fixed-composition-installation.mjs';
import{monthly194SqlFixture}from'../../tests/fixtures/own-monthly-day-engine-source-sql-synthetic.js';
import{salarySerialized,salaryItems}from'../../assets/native-salary-catalog-model.js';import{ownProgramDefinition}from'../../assets/own-payroll-program-model.js';
import{fixedForcedExpressionSet,ownFixedForcedRuleKey}from'../../assets/own-payroll-engine.js';import{participationRuleKey}from'../../assets/own-period-participation-program.js';
const hash=s=>createHash('sha256').update(s).digest('hex'),valueHash=v=>hash(salarySerialized(v)),q=s=>"'"+String(s).replaceAll("'","''")+"'",body=d=>{const m=/\bAS\s+(\$\w*\$)([\s\S]*)\1\s*;?\s*$/.exec(d);assert.ok(m);return m[2];};
export function monthlyFixedQaHeader(sql){
 return monthlyDayQaHeader(sql.replace(/SET search_path TO 'pg_catalog',\s*'public',\s*'pg_temp'/g,'SET search_path=pg_catalog,public,pg_temp').replace(/SET search_path TO ''pg_catalog'',\s*''public'',\s*''pg_temp''/g,'SET search_path=pg_catalog,public,pg_temp'));
}
export function monthlyFixedSqlFixture({forced=false,...options}={}){
 const base=monthly194SqlFixture(options),rule={agreementCode:'1',code:'919409',nature:'remuneration',unit:'money',validFrom:base.period,validUntil:base.period,liquidationTypes:['monthly','supplementary'],expression:{op:'literal',unit:'money',value:'0'},rounding:{precision:8,mode:'exact'},ruleReference:'Importe base cero exclusivamente sintético QA196; sin norma municipal'};
 const items=salaryItems([...base.items,{kind:'concept',agreementCode:'1',categoryCode:null,code:rule.code,label:'Concepto forzado exclusivamente sintético QA196',nature:'remuneration',unit:'money',precision:8,value:null,validFrom:base.period,validUntil:base.period,ruleReference:'Metadata exclusivamente sintética QA196',dependencies:[],active:true}]);
 if(!forced)return{...base,items};
 const definition=structuredClone(base.definition);definition.rules.push(rule);definition.periodParticipation.treatments.push({ruleKey:participationRuleKey(rule),treatment:'declared_formula',reference:'Sin prorrateo implícito del importe forzado sintético'});
 const policy={ruleKey:ownFixedForcedRuleKey(rule),sourceKind:'fixed_amount',sourceCode:rule.code,quantityPolicy:'reject',sourceSha256:valueHash('synthetic196-fixed-source'),ruleReference:'Reemplazo monetario íntegro exclusivamente sintético QA196'};
 definition.fixedForcedAmountsVersion='own-fixed-forced-amount.v1';definition.fixedForcedAmountsPolicy={quantityLineage:{version:'own-quantity-lineage-review.v1',sourceSha256:valueHash('synthetic196-quantity-source'),sourceControlSha256:valueHash('synthetic196-quantity-control'),expressionSetSha256:valueHash(fixedForcedExpressionSet(definition.rules,[policy])),complete:true},policies:[policy]};
 return{...base,items,definition:ownProgramDefinition(definition,items),forced:true,forcedConcept:rule.code,forcedAmountCents:'2500'};
}
export function buildMonthlyDayFixedCompositionQa(options){
 const qa=buildMonthly194Qa(options),batch=buildMonthlyDayFixedCompositionInstallation({read:options.read,sourceCommit:options.sourceCommit,operationalPairBaseline:options.operationalPairBaseline,prerequisiteDefinitions:qa.qa193.foundation.base.definitions,prerequisiteRuntime:qa.batch.declaration.prerequisitePins.filter(p=>p.runtime).map(p=>p.signature)}),hashes={};
 const base=s=>qa.normalized(monthlyFixedQaHeader(s));let stable=false;
 for(let pass=0;pass<12;pass++){let changed=false;for(const d of[...batch.adapted,...batch.newDefinitions]){let local=base(d);for(const[a,b]of Object.entries(hashes))local=local.replaceAll(a,b);const raw=hash(body(d)),next=hash(body(local));if(hashes[raw]!==next){hashes[raw]=next;changed=true;}}if(!changed){stable=true;break;}}
 assert.ok(stable,'MONTHLY_FIXED_QA_HASH_GRAPH_CYCLE');const normalized=s=>{let local=base(s);for(const[a,b]of Object.entries(hashes))local=local.replaceAll(a,b);return local;};
 const localFixed=Object.fromEntries(['rehearsal','installation','repetition','verification','rollback'].map(k=>[k,batch[k].map(normalized)]));
 const fixedCapabilitySeed=[];for(const[actor,cap]of[[qa.actor,'payroll.fixed.prepare'],[qa.checker,'payroll.fixed.approve']])fixedCapabilitySeed.push(`INSERT INTO ${qa.schema}.iam_role_capability(role_key,capability_key) SELECT role_key,${q(cap)} FROM ${qa.schema}.tenant_membership WHERE id=${q(actor.membershipId)}::uuid AND NOT EXISTS(SELECT 1 FROM ${qa.schema}.iam_role_capability prior WHERE prior.role_key=tenant_membership.role_key AND prior.capability_key=${q(cap)})`);
 fixedCapabilitySeed.push(qa.fixtureCapabilitySeed);
 return{...qa,version:'own-monthly-day-fixed-composition-qa.v1',fixedComposition:batch,localFixed,normalized,fixedHashes:hashes,fixedCapabilitySeed,fixture:monthlyFixedSqlFixture(),sourceHashes:{...qa.sourceHashes,...batch.sourceHashes},run7Included:false,connects:false,executesSql:false};
}
const fixedFacades=Object.freeze({payroll_fixed_registry_employee_by_contract_v1:['jsonb','uuid'],payroll_fixed_registry_propose_v1:['jsonb','jsonb','uuid'],payroll_fixed_registry_review_v1:['jsonb','jsonb','uuid']});
export function monthlyFixedQaRpc(text,values,schema){
 const match=/^SELECT public\.(payroll_fixed_registry_[a-z_]+_v1)\(([^()]*)\) AS result$/.exec(text);if(!match)return monthly194QaRpc(text,values,schema);
 assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.ok(Object.hasOwn(fixedFacades,match[1]),'MONTHLY_FIXED_FACADE_REQUIRED');const types=fixedFacades[match[1]];assert.equal(match[2],types.map((t,n)=>'$'+(n+1)+'::'+t).join(','));assert.ok(Array.isArray(values)&&values.length===types.length&&values.every(v=>typeof v==='string'));return text.replace('public.',schema+'.').replace(/\$(\d+)\b/g,(_,n)=>q(values[Number(n)-1]));
}
