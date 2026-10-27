// Private complete source candidate. No native operation was executed by author.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {employeeContext} from '../../lib/internal-native-employees.js';
import {annualBudgetOperation} from '../../lib/internal-annual-position-budget.js';
import {positionOperation} from '../../lib/internal-position-assignment.js';
import {positionComparisonOperation} from '../../lib/internal-position-comparison.js';
import {definition as syntheticAnnualDefinition,command as syntheticAnnualCommand} from '../../tests/fixtures/annual-position-budget-synthetic.js';
import {command as syntheticPositionCommand,source as syntheticPositionSource} from '../../tests/fixtures/position-assignment-synthetic.js';
import {salaryUuid,salaryExact} from '../../assets/native-salary-catalog-model.js';
import {budgetYear,annualBudgetCommand} from '../../assets/annual-position-budget-model.js';
import {positionCommand} from '../../assets/position-assignment-model.js';
import {OWN_RUN_TYPES} from '../../assets/own-payroll-run-workspace-model.js';
import {lifecycleProposalInput,lifecycleReviewInput} from '../../assets/native-employment-lifecycle-model.js';
import {ownArtParams} from '../../assets/own-art-report-model.js';
import {installPositions210Same190} from './positions210-same190-installation.mjs';
import {composePositions210Actors,installPositions210Actors} from './positions210-same190-actors.mjs';
import {installPositions211212Same190} from './positions211212-same190-installation.mjs';

const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const TYPES=Object.freeze({
 annual_budget_bootstrap_v1:['jsonb','integer'],annual_budget_attempt_v1:['jsonb','uuid'],annual_budget_command_v1:['jsonb','jsonb','uuid'],
 position_assignment_bootstrap_v1:['jsonb','uuid','integer'],position_assignment_capture_v1:['jsonb','uuid'],position_assignment_attempt_v1:['jsonb','uuid'],position_assignment_command_v1:['jsonb','jsonb','uuid'],
 position_comparison_detail_v2:['jsonb','integer','integer','text','text'],
 own_art_report_source_full_v1:['jsonb','jsonb'],
 native_employment_lifecycle_bootstrap_v2:['jsonb','uuid'],native_employment_lifecycle_history_v2:['jsonb','uuid'],
 native_employment_lifecycle_propose_v2:['jsonb','jsonb','uuid'],native_employment_lifecycle_review_v2:['jsonb','jsonb','uuid'],
 native_employment_lifecycle_proposal_v2:['jsonb','uuid','uuid'],native_employment_lifecycle_attempt_v2:['jsonb','uuid','uuid']
});
const CTX=['actorEmail','actorSessionId','actorSessionVersion','membershipId','releaseSha','tenantId'];
const admissions=new WeakMap();

// The source-owned driver uses the EXISTING native db.run. Therefore its
// capture/role/guard/envelope and expected-error latch remain the post269 ones.
export function positions210Rpc(text,values,schema){
 assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 const match=/^SELECT public\.([a-z0-9_]+)\(([^()]*)\) AS result$/.exec(text);
 assert.ok(match&&Object.hasOwn(TYPES,match[1]),'POSITIONS210_RPC_NOT_ALLOWED');
 const types=TYPES[match[1]];assert.equal(match[2],types.map((type,index)=>'$'+(index+1)+'::'+type).join(','));assert.equal(values.length,types.length);
 const context=JSON.parse(values[0]);assert.ok(salaryExact(context,CTX));assert.ok(salaryUuid(context.actorSessionId)&&salaryUuid(context.membershipId)&&salaryUuid(context.tenantId));assert.ok(Number.isSafeInteger(context.actorSessionVersion)&&context.actorSessionVersion>0);assert.match(context.releaseSha,/^[a-f0-9]{40}$/);assert.equal(typeof context.actorEmail,'string');
 const args=types.map((type,index)=>{const value=values[index];
  if(type==='jsonb'){assert.equal(typeof value,'string');const parsed=JSON.parse(value);assert.ok(parsed&&typeof parsed==='object'&&!Array.isArray(parsed));if(index===1){
   const normalize={annual_budget_command_v1:annualBudgetCommand,position_assignment_command_v1:positionCommand,own_art_report_source_full_v1:ownArtParams,native_employment_lifecycle_propose_v2:lifecycleProposalInput,native_employment_lifecycle_review_v2:lifecycleReviewInput}[match[1]];assert.equal(typeof normalize,'function');assert.deepEqual(normalize(parsed),parsed);
  }}
  else if(type==='uuid')assert.ok(salaryUuid(value));
  else if(type==='integer'){if(match[1]==='position_comparison_detail_v2'&&index===2)assert.ok(Number.isInteger(value)&&value>=1&&value<=1000);else assert.ok(budgetYear(value));}
  else {assert.equal(typeof value,'string');if(index===3)assert.ok(/^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(value)&&value.slice(0,4)===String(values[1]));else assert.ok(Object.hasOwn(OWN_RUN_TYPES,value));}
  return q(value)+'::'+type;
 });return 'SELECT '+schema+'.'+match[1]+'('+args.join(',')+')';
}
export function createPositions210Sql({h,db}){
 assert.strictEqual(h.qa.schema,h.prepared.positions210.schema);assert.equal(typeof db.run,'function');
 return Object.freeze({query:async(text,values)=>[{result:await db.run(positions210Rpc(text,values,h.qa.schema),true)}]});
}

export async function preparePositions210BeforeFirstCapture({h,db,qa,contracts,period}){
 assert.strictEqual(h.qa,qa);assert.equal(period,'2026-10');assert.equal(contracts.length,855);assert.equal(new Set(contracts).size,855);assert.deepEqual(contracts,[...contracts].sort());
 const installed=installPositions210Same190(h),dependentInstallations=installPositions211212Same190(h),actorPlan=composePositions210Actors({qa,contracts,read:h.read}),pair=installPositions210Actors(h,actorPlan),sql=createPositions210Sql({h,db}),year=Number(period.slice(0,4));
 const immutableActors=structuredClone({maker:qa.actor,checker:qa.checker}),sameOriginalActors=()=>assert.deepEqual({maker:qa.actor,checker:qa.checker},immutableActors);
 const nativeCounts=()=>h.json([`SELECT jsonb_build_object('registrations',(SELECT count(*)::integer FROM ${qa.schema}.native_employee_registration),'captures',(SELECT count(*)::integer FROM ${qa.schema}.own_payroll_run_capture),'results',(SELECT count(*)::integer FROM ${qa.schema}.own_payroll_run_result),'annualEvents',(SELECT count(*)::integer FROM ${qa.schema}.annual_position_budget_event),'assignmentEvents',(SELECT count(*)::integer FROM ${qa.schema}.own_position_assignment_event),'positionCaptures',(SELECT count(*)::integer FROM ${qa.schema}.own_payroll_run_position_capture),'dimensionCaptures',(SELECT count(*)::integer FROM ${qa.schema}.own_payroll_run_position_dimensions))`],{readOnly:true});
 const before=nativeCounts();assert.deepEqual(before,{registrations:855,captures:0,results:0,annualEvents:0,assignmentEvents:0,positionCaptures:0,dimensionCaptures:0});
 const annual=(name,operation,input)=>annualBudgetOperation(sql,pair.actors[name].principal,pair.actors[name].session,operation,input);
 const assignment=(name,operation,input)=>positionOperation(sql,pair.actors[name].principal,pair.actors[name].session,operation,input);
 h.setPhase('positions210-synthetic-annual-proposal');
 const start=await annual('maker','bootstrap',{year});assert.equal(start.catalog.revision,0);assert.equal(start.catalog.definition,null);assert.equal(start.proposalCount,0);
 const normative=syntheticAnnualDefinition(),propose=syntheticAnnualCommand({year,scopeVersion:start.scopeVersion,baseVersion:start.catalog.version,definition:normative}),proposal=await annual('maker','command',{body:propose,key:randomUUID()});assert.equal(proposal.status,'pending');
 const review=await annual('checker','bootstrap',{year}),pending=review.proposals.find(value=>value.id===proposal.proposalId);assert.ok(pending?.canReview);assert.deepEqual(pending.body.definition,normative);
 const approve={command:'approve',year,scopeVersion:review.scopeVersion,baseVersion:pending.body.baseVersion,proposalId:pending.id,proposalSha256:pending.requestSha256,definition:null,reason:'Revisión exclusivamente sintética de la norma210 sobre el mismo QA190',reviewConfirmed:true};
 h.setPhase('positions210-synthetic-annual-approval');const approved=await annual('checker','command',{body:approve,key:randomUUID()});assert.equal(approved.status,'approved');
 const durableAnnual=await annual('maker','bootstrap',{year});assert.equal(durableAnnual.catalog.revision,1);assert.deepEqual(durableAnnual.catalog.definition,normative);assert.equal(durableAnnual.catalog.proposalId,proposal.proposalId);
 const selectedRow=normative.rows.find(row=>row.code==='QA0002');assert.ok(selectedRow);assert.equal(selectedRow.unit,'contracted_staff');assert.equal(selectedRow.quantity,'1');
 const assignments=[];
 for(const contractId of pair.contractsReserved){
  h.setPhase('positions210-synthetic-assignment-proposal');const boot=await assignment('maker','bootstrap',{contractId,year});assert.equal(boot.subject.contractId,contractId);assert.equal(boot.subject.origin,'MUNICONTROL');assert.equal(boot.state.revision,0);assert.deepEqual(boot.state.allocations,[]);
  // Quantity and normative row come from the existing purely synthetic fixture.
  // No municipal hours/percentage equivalence or implicit category is inferred.
  const allocation={id:randomUUID(),budgetRevision:durableAnnual.catalog.revision,definitionSha256:durableAnnual.catalog.definitionSha256,rowCode:selectedRow.code,validFrom:period+'-01',validTo:new Date(Date.UTC(year,Number(period.slice(5,7)),0)).toISOString().slice(0,10),quantity:selectedRow.quantity,source:syntheticPositionSource()};
  const body=syntheticPositionCommand({contractId,year,scopeVersion:boot.scopeVersion,baseVersion:boot.state.version,annualVersion:boot.annual.catalog.version,allocations:[allocation]}),submitted=await assignment('maker','command',{body,key:randomUUID()});
  const checked=await assignment('checker','bootstrap',{contractId,year}),original=checked.proposals.find(value=>value.id===submitted.proposalId);assert.ok(original?.canReview);
  const decision={command:'approve',contractId,year,scopeVersion:checked.scopeVersion,baseVersion:original.body.baseVersion,annualVersion:original.body.annualVersion,reason:'Asignación exclusivamente sintética210, revisada por otra persona',reviewConfirmed:true,proposalId:original.id,proposalSha256:original.requestSha256};
  h.setPhase('positions210-synthetic-assignment-approval');const receipt=await assignment('checker','command',{body:decision,key:randomUUID()}),durable=await assignment('maker','bootstrap',{contractId,year});assert.equal(durable.state.revision,1);assert.equal(durable.state.allocations.length,1);assert.equal(durable.state.allocations[0].rowCode,selectedRow.code);assert.equal(durable.state.allocations[0].quantity,selectedRow.quantity);assignments.push({contractId,proposal:submitted,receipt,durable});
 }
 sameOriginalActors();const after=nativeCounts();assert.deepEqual(after,{...before,annualEvents:2,assignmentEvents:4});
 const admission=Object.freeze({version:'positions210-before-first-capture.v1',passed:true,sourceCommit:h.sourceCommit,installed,dependentInstallations,pair,year,period,normative,annualProposal:proposal,annualApproval:approved,annual:durableAnnual,assignments,before,after,registrations:855,newPeople:0,newContracts:0,businessCapturesAdded:0,syntheticOnlyNorm:true,productionWrites:0});
 admissions.set(admission,{h,db,qa,sql});return admission;
}

export function assertPositions210Admission({h,db,admission}){
 const record=admissions.get(admission);assert.ok(record,'POSITIONS210_ADMISSION_REQUIRED');assert.strictEqual(record.h,h);assert.strictEqual(record.db,db);assert.strictEqual(record.qa,h.qa);assert.equal(admission.sourceCommit,h.sourceCommit);return record;
}

export async function readPositions210Comparison({h,db,admission,revision=1}){
 const {sql}=assertPositions210Admission({h,db,admission}),actor=admission.pair.actors.checker;
 const before=h.readFullSnapshot(),query={year:admission.year,revision,period:admission.period,liquidationType:'monthly'};
 const value=await positionComparisonOperation(sql,actor.principal,actor.session,'detail-v2',query);assert.equal(value.version,'own-position-comparison.v2');assert.deepEqual(h.readFullSnapshot(),before);return value;
}
