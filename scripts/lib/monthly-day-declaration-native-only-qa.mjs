// Prepared integration scenario only. Not executed by unit tests or at import.
// Wire these callbacks to the existing guarded PG17/18 QA transport,067 writer,
// new193 HTTP/RPC adapters and authoritative database proof query. No seed of
// a native contract or prefilled approval is an acceptable substitute.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {salaryUuid,salaryExact} from '../../assets/native-salary-catalog-model.js';
import {prepareMonthlyDayDeclaration,decideMonthlyDayDeclaration,monthlyDayDeclarationDetail} from '../../assets/own-monthly-day-declaration-model.js';
import {approvedMonthlyDayInputs} from '../../lib/own-monthly-day-declaration-input.js';

export const MONTHLY_DAY_NATIVE_ONLY_PROOF_QUERY = `SELECT jsonb_build_object(
 'nativeRegistrations',(SELECT count(*) FROM public.native_employee_registration n JOIN public.employment_contract c ON c.id=n.contract_id WHERE c.id=$1::uuid AND c.source_system='MUNICONTROL' AND c.source_batch_id IS NULL),
 'legacyCounterparts',(SELECT count(*) FROM public.grh_employees WHERE company_id=$2::bigint AND legajo=$3::text),
 'adoptionApplications',(SELECT count(*) FROM public.employment_adoption_application WHERE contract_id=$1::uuid)) AS result`;

export async function verifyMonthlyDayNativeOnlyScenario({native,monthly,nativeProof,capture,draft,maker,checker}){
 assert.equal(typeof native,'function');assert.equal(typeof monthly,'function');assert.equal(typeof nativeProof,'function');assert.equal(typeof capture,'function');
 assert.equal(draft?.startDate,'2026-10-16','Use the existing monthlyQaFreshDraft(index,2026-10-16) and the real067 create writer.');
 assert.ok(maker&&checker&&maker!==checker,'Use the two existing independently verified QA actors, with unchanged roles.');
 const period='2026-10',catalog=await native('bootstrap',maker,{});
 const created=await native('create',maker,{draft,catalogVersion:catalog.catalog.version,key:randomUUID()});
 assert.equal(created.origin,'MUNICONTROL');assert.ok(salaryUuid(created.contractId));
 const target={contractId:created.contractId,period};
 // nativeProof executes the fixed query above with actual tenant/company/legajo
 // of this newly created contract, before and after the193 ledger operations.
 const initial=await nativeProof(created,draft);
 assert.ok(salaryExact(initial,['nativeRegistrations','legacyCounterparts','adoptionApplications']));assert.deepEqual(initial,{nativeRegistrations:1,legacyCounterparts:0,adoptionApplications:0});
 const boot=await monthly('bootstrap',maker,target);
 assert.equal(boot.source.subject.origin,'MUNICONTROL');assert.equal(boot.source.subject.contractId,created.contractId);assert.equal(boot.source.subject.sourceCutoff,null);assert.equal(boot.source.fullPeriod,false);
 const definition={recognizedDays:'16',baseDays:'30',unit:'days',policyVersion:'own-monthly-approved-days-policy.v1',fullMonthDeclared:false,asOfDate:'2026-10-01',documentReference:'Constancia exclusivamente sintética QA193 de16 días'};
 const body=prepareMonthlyDayDeclaration(boot,definition,'Propuesta exclusivamente sintética de días mensuales'),key=randomUUID();
 const proposed=await monthly('command',maker,{body,key});assert.equal(proposed.status,'pending');assert.equal(proposed.replayed,false);assert.equal(proposed.payrollCalculated,false);
 const replay=await monthly('command',maker,{body,key});assert.equal(replay.replayed,true);assert.equal(replay.eventId,proposed.eventId);
 await assert.rejects(()=>monthly('command',maker,{body:{...body,definition:{...body.definition,recognizedDays:'15'}},key}),e=>e?.code==='MONTHLY_DAY_DECLARATION_IDEMPOTENCY_REUSE');
 const recovered=await monthly('attempt',maker,{key});assert.equal(recovered.eventId,proposed.eventId);assert.deepEqual(recovered.body,body);
 const reviewBoot=await monthly('bootstrap',checker,target),detail=await monthlyDayDeclarationDetail(await monthly('detail',checker,{id:proposed.proposalId}));
 assert.equal(detail.proposal.canReview,true);assert.deepEqual(detail.body.definition,definition);
 const decision=decideMonthlyDayDeclaration(reviewBoot,detail,'approve','Revisión independiente exclusivamente sintética QA193'),approvalKey=randomUUID();
 await assert.rejects(()=>monthly('command',maker,{body:{...decision,scopeVersion:boot.scopeVersion},key:randomUUID()}),e=>e?.code==='MONTHLY_DAY_DECLARATION_INDEPENDENT_REQUIRED');
 const approved=await monthly('command',checker,{body:decision,key:approvalKey});assert.equal(approved.status,'approved');assert.equal(approved.revision,1);assert.equal(approved.payrollCalculated,false);assert.equal(approved.payrollPosted,false);
 const finalBoot=await monthly('bootstrap',maker,target);assert.deepEqual(finalBoot.configuration.definition,definition);assert.equal(finalBoot.configuration.revision,1);assert.equal(finalBoot.configuration.sourceVersion,finalBoot.source.version);
 const employees=[{contractId:created.contractId,identityToken:finalBoot.source.subject.identityToken}],facts=await capture(maker,{employees,period}),inputs=approvedMonthlyDayInputs(facts,employees,period);
 assert.equal(inputs.length,1);assert.equal(inputs[0].recognizedDays,'16');assert.equal(inputs[0].baseDays,'30');assert.equal(inputs[0].unit,'days');assert.equal(inputs[0].approvalId,approved.eventId);
 assert.deepEqual(await nativeProof(created,draft),initial);
 return {nativeOnlyContracts:1,legacyCounterparts:0,adoptionApplications:0,approvedDayDeclarations:1,replayedProposals:1,recoveredAttempts:1,idempotencyCollisionRejected:true,selfApprovalRejected:true,recordsCaptured:1,payrollCalculated:false,payrollPosted:false};
}
