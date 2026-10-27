// Three causal native transactions, using the existing inactive maker and the
// exact valid row returned by the normal native journey. Every case ROLLBACKs.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {employeeContext} from '../../lib/internal-native-employees.js';
import {ownNoveltyReceipt} from '../../assets/own-payroll-novelties-model.js';
import {verifyOwnNoveltyHashes} from '../../lib/internal-own-payroll-novelties.js';
import {performancePreservationSnapshot} from '../verify-documentary-roster-performance.mjs';
const q=v=>"'"+String(v).replaceAll("'","''")+"'",j=v=>q(JSON.stringify(v))+'::jsonb';
export function verifyNovelty217AdministrativeCausality({qa,maker,created,row,period,json,expect}){
 assert.match(qa?.schema??'',/^mc_qa_fixed_092_[a-f0-9]{32}$/);for(const f of[qa.normalized,json,expect])assert.equal(typeof f,'function');assert.equal(row.contractId,created.contractId);assert.equal(row.legajo,created.legajo);
 const raw=employeeContext(maker.principal,maker.session),context=j(raw),schema=qa.schema;
 const snapshot=()=>json([qa.normalized(performancePreservationSnapshot()),"SELECT jsonb_build_object('fingerprint',encode(public.digest(current_setting('municontrol_documentary_install.after')::jsonb::text,'sha256'),'hex'))"],{readOnly:true,fullJson:true});
 const operator=json([`SELECT jsonb_build_object('linkCount',count(*),'personId',min(c.person_id::text),'contractId',min(c.id::text),'inactive',bool_and(c.status<>'active'),'activeLink',bool_and(l.active AND l.revoked_at IS NULL)) FROM ${schema}.tenant_action_employment_link l JOIN ${schema}.employment_contract c ON c.id=l.employment_contract_id WHERE l.membership_id=${q(raw.membershipId)}::uuid AND l.tenant_id=${q(raw.tenantId)}::uuid`],{readOnly:true,fullJson:true});
 assert.equal(operator.linkCount,1);assert.equal(operator.inactive,true,'NOVELTY217_CAUSAL_ORIGINAL_MAKER_MUST_BE_INACTIVE');assert.equal(operator.activeLink,true);assert.notEqual(operator.contractId,created.contractId);
 const deny=cap=>`INSERT INTO ${schema}.tenant_membership_capability_override(membership_id,capability_key,allow_override,deny_override,reason,granted_by_user_email,created_at) VALUES(${q(raw.membershipId)}::uuid,${q(cap)},false,true,'Negativa causal sintética217, sólo ROLLBACK',${q(raw.actorEmail)},transaction_timestamp()) ON CONFLICT(membership_id,capability_key) DO UPDATE SET allow_override=false,deny_override=true,reason=EXCLUDED.reason`;
 const baseline=snapshot(),negativeCases=[];
 for(const cap of ['payroll.novelty.read','payroll.novelty.nominal.read']){
  expect([deny(cap),'SET LOCAL ROLE municontrol_actions_runtime_app',`SELECT ${schema}.own_novelty_bootstrap_v1(${context})`],'OWN_NOVELTY_FORBIDDEN');assert.deepEqual(snapshot(),baseline,'NOVELTY217_NEGATIVE_ROLLBACK_CHANGED_STATE');negativeCases.push({capability:cap,error:'OWN_NOVELTY_FORBIDDEN',wholeSnapshotRestored:true});
 }
 const key=randomUUID(),body={command:'prepare',periodMonth:period+'-01',payrollType:'monthly',rows:[row],reviewConfirmed:true};
 const result=json([
  deny('payroll.parameter.read'),
  `DO $pre217$ BEGIN IF EXISTS(SELECT 1 FROM ${schema}.tenant_iam_effective_capabilities(${q(raw.membershipId)}::uuid) WHERE capability_key='payroll.parameter.read') OR(SELECT count(*) FROM ${schema}.tenant_iam_effective_capabilities(${q(raw.membershipId)}::uuid) WHERE capability_key IN('payroll.novelty.read','payroll.novelty.nominal.read'))<>2 THEN RAISE EXCEPTION 'NOVELTY217_CAUSAL_CAPABILITY_PRECONDITION';END IF;PERFORM set_config('municontrol_217.causal_contract',(SELECT to_jsonb(c)::text FROM ${schema}.employment_contract c WHERE c.id=${q(operator.contractId)}::uuid),true);END $pre217$`,
  'SET LOCAL ROLE municontrol_actions_runtime_app',
  `DO $runtime217$ DECLARE b jsonb;r jsonb;BEGIN b:=${schema}.own_novelty_bootstrap_v1(${context});IF NOT coalesce((b->>'complete')::boolean,false) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(b->'subjects') s WHERE s->>'contractId'=${q(created.contractId)}) THEN RAISE EXCEPTION 'NOVELTY217_CAUSAL_NATIVE_SUBJECT_MISSING';END IF;r:=${schema}.own_novelty_command_v1(${context},${j(body)},${q(key)}::uuid);PERFORM set_config('municontrol_217.causal_receipt',r::text,true);END $runtime217$`,
  'RESET ROLE',
  `SELECT jsonb_build_object('receipt',current_setting('municontrol_217.causal_receipt')::jsonb,'eventCount',(SELECT count(*) FROM ${schema}.own_payroll_novelty_event e WHERE e.request_key=${q(key)}::uuid),'actorPersonId',(SELECT e.actor_person_id::text FROM ${schema}.own_payroll_novelty_event e WHERE e.request_key=${q(key)}::uuid),'beneficiaryContractId',(SELECT e.snapshot#>>'{rows,0,subject,contractId}' FROM ${schema}.own_payroll_novelty_event e WHERE e.request_key=${q(key)}::uuid),'operatorContractUnchanged',(SELECT to_jsonb(c) FROM ${schema}.employment_contract c WHERE c.id=${q(operator.contractId)}::uuid)=current_setting('municontrol_217.causal_contract')::jsonb,'withoutParameterRead',NOT EXISTS(SELECT 1 FROM ${schema}.tenant_iam_effective_capabilities(${q(raw.membershipId)}::uuid) WHERE capability_key='payroll.parameter.read'))`
 ],{end:'ROLLBACK',fullJson:true});
 ownNoveltyReceipt(result.receipt,{key,body});verifyOwnNoveltyHashes(result.receipt.snapshot);assert.equal(result.eventCount,1);assert.equal(result.actorPersonId,operator.personId);assert.equal(result.beneficiaryContractId,created.contractId);assert.equal(result.operatorContractUnchanged,true);assert.equal(result.withoutParameterRead,true);assert.equal(result.receipt.snapshot.preparedBy.personId,operator.personId);assert.equal(result.receipt.snapshot.rows[0].values.contractId,created.contractId);assert.deepEqual(snapshot(),baseline,'NOVELTY217_POSITIVE_REHEARSAL_NOT_ROLLED_BACK');
 return{version:'novelty217-administrative-causal-native.v1',passed:true,negativeCases,readAndPrepareWithoutParameterRead:true,inactiveMaker:true,actorPersonPreserved:true,beneficiaryContractPreserved:true,allThreeCasesRollback:true,canonicalIamUnchanged:true,sourceCommit:qa.sourceCommit??null};
}
