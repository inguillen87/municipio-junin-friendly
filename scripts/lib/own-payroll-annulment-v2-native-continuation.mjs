// SOURCE CANDIDATE ONLY. Fixed tail on the SAME, already admitted live190 host.
// No seed, transport injection, namespace rewrite, CLI callback or top-level IO.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {ownerDecisionQaLiteral as q} from './municipal-owner-adoption-decision-qa.mjs';
import {installOwnAnnulmentReviewV2On190,assertOwnAnnulmentReviewV2SourceBookend} from './own-payroll-annulment-review-v2-installation.mjs';
import {verifyOwnAnnulmentV2BrowserOn190} from './own-payroll-annulment-v2-native-browser.mjs';
import {ownRunHash} from '../../lib/internal-own-payroll-run.js';
import {RUN_CALCULATE} from '../../lib/internal-own-payroll-run.js';
import {OWN_LIQ_REVIEW,verifiedOwnLiquidationDetail} from '../../assets/own-payroll-liquidation-model.js';
import {verifiedOwnAnnulReceipt} from '../../assets/own-payroll-annulment-model.js';
import {verifiedOwnAnnulReviewIndex,loadOwnAnnulReview,ownAnnulReviewRows,ownAnnulReviewSelection,ownAnnulReviewAttempt,verifiedOwnAnnulReviewReceipt,loadOwnAnnulPreparation} from '../../assets/own-payroll-annulment-review-model.js';
import {verifiedOwnReportCensus} from '../../assets/own-payroll-report-census-model.js';

const FOUR=4*1024*1024,FULL=32*1024*1024;
const bytes=value=>Buffer.byteLength(JSON.stringify({ok:true,data:value}),'utf8');
const j=value=>q(JSON.stringify(value))+'::jsonb';
const all=()=>({kind:'all',values:[]});
const dates=Object.freeze(['2026-10-15','2026-10-20','2026-10-25']);
const reason='Anulación exclusivamente sintética v2 de capacidad855, conservando toda la historia';

// Return only table identities, counts and per-row hash multiplicities. Never
// return row values. The same schema is supplied by the canonical190 host.
function rowMultiset(h,qa){
 assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 return h.json([`DO $qa_annul_prefix$ DECLARE relation record;items jsonb;result jsonb:='[]';BEGIN
 FOR relation IN SELECT c.oid,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=${q(qa.schema)} AND c.relkind IN('r','p','m') ORDER BY c.oid LOOP
  EXECUTE format('SELECT coalesce(jsonb_agg(jsonb_build_object(''sha256'',s.sha256,''count'',s.multiplicity) ORDER BY s.sha256),''[]'') FROM (SELECT encode(public.digest(to_jsonb(r)::text,''sha256''),''hex'') sha256,count(*) multiplicity FROM %I.%I r GROUP BY 1) s',${q(qa.schema)},relation.relname) INTO items;
  result:=result||jsonb_build_array(jsonb_build_object('oid',relation.oid,'name',relation.relname,'hashes',items));
 END LOOP;
 PERFORM set_config('municontrol_annul208.prefix',result::text,true);
 END $qa_annul_prefix$;SELECT current_setting('municontrol_annul208.prefix')::jsonb`],{readOnly:true,fullJson:true});
}
function assertPrefix(before,after){
 assert.ok(Array.isArray(before)&&before.length>0&&Array.isArray(after));
 assert.equal(new Set(before.map(row=>row.oid)).size,before.length);
 for(const old of before){
  const current=after.find(row=>row.oid===old.oid);assert.ok(current,'ANNUL208_OLD_RELATION_REMOVED');assert.equal(current.name,old.name);
  const oldHashes=new Map(old.hashes.map(row=>[row.sha256,row.count])),newHashes=new Map(current.hashes.map(row=>[row.sha256,row.count]));
  assert.equal(oldHashes.size,old.hashes.length);assert.equal(newHashes.size,current.hashes.length);
  for(const [sha,count]of oldHashes){assert.match(sha,/^[a-f0-9]{64}$/);assert.ok(Number.isSafeInteger(count)&&count>0);assert.ok((newHashes.get(sha)??0)>=count,'ANNUL208_EXISTING_ROW_CHANGED_OR_REMOVED');}
 }
}
function tableSet(snapshot,names){return snapshot.filter(row=>names.includes(row.name));}
function compactCapture(capture){return{id:capture.id,key:capture.key,body:structuredClone(capture.body),bodySha256:capture.bodySha256,payloadSha256:capture.payloadSha256,inputSha256:capture.saved.inputSha256,resultSha256:capture.saved.resultSha256,employeeCount:capture.saved.result.employeeCount,conceptRowCount:capture.saved.result.rowCount};}

export async function runOwnAnnulmentV2NativeContinuation(context){
 assert.equal(context?.version,'own-annulment-v2-live190-context.v1');
 const {h,db,qa,maker,reviewer,definition,contracts,first,firstSaved,second,closed,reopened,annulKey,annulled,query,period,installation,iam,baselineSnapshot}=context;
 const {run,liq,annul,close}=context.operations;
 assert.strictEqual(h.qa,qa);assert.equal(h.sourceCommit.length,40);assert.ok([17,18].includes(h.major));assert.equal(qa.operationalPairBaseline,'published107');
 assert.equal(period,'2026-10');assert.deepEqual(query,{period,liquidationType:'monthly'});assert.equal(context.monthlyBusinessCovered,false);
 assert.equal(contracts.length,855);assert.equal(new Set(contracts).size,855);assert.deepEqual(contracts,[...contracts].sort());assert.equal(definition.rules.length,20);
 assert.ok(maker.principal.authorized&&reviewer.principal.authorized&&maker.principal.session.mfa&&reviewer.principal.session.mfa);
 assert.notEqual(maker.session.id,reviewer.session.id);assert.notEqual(qa.actor.membershipId,qa.checker.membershipId);
 for(const capability of RUN_CALCULATE)assert.ok(maker.principal.tenant.effectiveCapabilities.includes(capability));
 for(const capability of OWN_LIQ_REVIEW)assert.ok(reviewer.principal.tenant.effectiveCapabilities.includes(capability));
 assert.ok(RUN_CALCULATE.some(capability=>!reviewer.principal.tenant.effectiveCapabilities.includes(capability)),'ANNUL208_REVIEWER_MUST_NOT_GAIN_PREPARE');
 assert.equal(firstSaved.result.employeeCount,855);assert.equal(firstSaved.result.rowCount,17100);assert.deepEqual(first.saved,firstSaved);
 assert.equal(second.saved.result.employeeCount,855);assert.equal(second.saved.result.rowCount,17100);assert.equal(closed.snapshot.employeeCount,855);assert.equal(closed.snapshot.conceptCount,17100);assert.equal(reopened.snapshotSha256,closed.snapshotSha256);
 assert.deepEqual(context.readSnapshot(),baselineSnapshot,'ANNUL208_BASELINE_CHANGED_BEFORE_TAIL');
 const checks=[],measurements={indices:[],details:[],legacyConsolidated:[],captures:[],receipts:[]};
 const ok=(condition,label)=>{assert.ok(condition,label);checks.push(label);h.check(label);};
 const prefixBefore=rowMultiset(h,qa),originalSecond=structuredClone(second.saved),nativeBefore=h.json([`SELECT jsonb_build_object('count',count(*)::integer) FROM ${qa.schema}.native_employee_registration`],{readOnly:true});assert.equal(nativeBefore.count,855);
 const originalCensus=await verifiedOwnReportCensus(await close('report-census',query)),originalGroup=await close('group',{id:closed.groupId});
 const installation208=await installOwnAnnulmentReviewV2On190({h,db,baselineSnapshot,admission:{version:'own-annulment-review208-canonical-source.v1',sourceCommit:h.sourceCommit,monthly:h.prepared.monthly,capacityPlan:installation.plan}});
 assert.equal(installation208.passed,true);assert.equal(installation208.productionWrites,0);assert.equal(installation208.municipalAcceptance,false);
 const readIndex=async label=>{const value=await verifiedOwnAnnulReviewIndex(await annul('review',query));measurements.indices.push({label,runs:value.index.length,confirmed:value.index.reduce((sum,row)=>sum+row.states.confirmed,0),bytes:bytes(value)});assert.ok(bytes(value)<=FULL);if(bytes(value)<=FOUR){const ordinary=await annul('review',query,false);assert.deepEqual(ordinary,value);}return value;};
 const readDetail=async(id,label)=>{const value=await liq('detail',{id});await verifiedOwnLiquidationDetail(value);measurements.details.push({label,id,bytes:bytes(value),employees:value.capture.saved.result.employeeCount,conceptRows:value.capture.saved.result.rowCount});assert.ok(bytes(value)<=FULL);return value;};
 const readReview=async(label,index)=>{const order=[],review=await loadOwnAnnulReview(index,async id=>{order.push(id);return readDetail(id,label);});assert.deepEqual(order,index.index.filter(row=>row.states.confirmed>0).map(row=>row.id));return review;};
 const bodyFor=(index,selection=all())=>({version:'own-annul-command.v2',...query,scopeVersion:index.scopeVersion,stateVersion:index.stateVersion,reviewSha256:index.reviewSha256,selection,reason,reviewConfirmed:true});
 const attemptFor=(review,body,key=randomUUID())=>ownAnnulReviewAttempt(key,body,'qa-native208:'+qa.checker.membershipId,ownAnnulReviewSelection(review,body.selection));
 const ledgerCounts=()=>db.run("SELECT jsonb_build_object('parents',(SELECT count(*) FROM own_payroll_annul_event),'children',(SELECT count(*) FROM own_payroll_liquidation_event),'captures',(SELECT count(*) FROM own_payroll_run_capture),'results',(SELECT count(*) FROM own_payroll_run_result))");
 const command=async attempt=>{const before=await ledgerCounts(),value=await annul('command-v2',{key:attempt.key,body:attempt.body});await verifiedOwnAnnulReviewReceipt(value,attempt);const after=await ledgerCounts();assert.deepEqual(after,{...before,parents:before.parents+(value.replayed?0:1),children:before.children+(value.replayed?0:value.receipts.length)});measurements.receipts.push({version:value.version,bytes:bytes(value),affected:value.affected.length,children:value.receipts.length,parentDelta:after.parents-before.parents,childDelta:after.children-before.children,replayed:value.replayed});return value;};
 const keyAbsent=async key=>{assert.equal(await db.run('SELECT count(*)::integer FROM own_payroll_annul_event WHERE request_key='+q(key)+'::uuid'),0);await context.sameStateReject(()=>annul('attempt',{key}),error=>error.code==='OWN_LIQ_NOT_FOUND'&&error.status===404,'uncommitted aggregate key remains absent');};
 const receiptStable=async receipt=>{await verifiedOwnAnnulReviewReceipt(receipt);const replay=await annul('attempt',{key:receipt.key});assert.deepEqual(replay,{...receipt,replayed:true});return replay;};
 const legacyReceipt=await annul('attempt',{key:annulKey});await verifiedOwnAnnulReceipt(legacyReceipt);assert.deepEqual(legacyReceipt,{...annulled,replayed:true});assert.equal(legacyReceipt.version,'own-annul-receipt.v1');
 let index=await readIndex('baseline-two'),baselineReview=await readReview('baseline-second',index);
 assert.equal(index.index.length,2);assert.equal(ownAnnulReviewRows(baselineReview).length,855);assert.equal(index.closed.length,0);
 assert.deepEqual(index.index.map(row=>row.id).sort(),[first.id,second.id].sort());
 {const legacy=await annul('detail',query);assert.equal(legacy.stateVersion,index.stateVersion);assert.equal(legacy.scopeVersion,index.scopeVersion);measurements.legacyConsolidated.push({label:'baseline-two',status:'complete',bytes:bytes(legacy),runs:legacy.runs.length});}
 ok(true,'legacy201 state and original v1 receipt remain compatible with explicit review2');
 await context.sameStateReject(()=>db.run('SELECT own_annul_review_full_v2('+j(qa.actor)+','+q(period)+',\'monthly\')',true),error=>/OWN_LIQ_FORBIDDEN/.test(error.message),'real preparing actor cannot read aggregate review without existing approval access');
 // Private208 entry points have no mapper descriptors and no runtime grant.
 for(const expression of[
  'own_annul_review_core_v2('+j(qa.checker)+','+q(period)+',\'monthly\',33554432)',
  'own_annul_selected_index_v2('+j(qa.checker)+','+j(index)+','+j(all())+')',
  'own_annul_command_index_core_v2('+j(qa.checker)+','+j(bodyFor(index))+','+q(randomUUID())+'::uuid,33554432)'
 ])await context.sameStateReject(()=>db.run('SELECT '+expression,true),error=>/permission denied/.test(error.message),'runtime cannot call private208 helper or choose response budget');
 const secondAttempt=attemptFor(baselineReview,bodyFor(index)),secondAnnulment=await command(secondAttempt);assert.equal(secondAnnulment.affected.length,855);assert.equal(secondAnnulment.receipts.length,1);
 const receiptHistory=[structuredClone(annulled),structuredClone(secondAnnulment)];
 const partitionIds=Object.freeze([contracts.slice(0,285),contracts.slice(285,570),contracts.slice(570,855)].map(ids=>Object.freeze(ids)));
 assert.ok(partitionIds.every(ids=>ids.length===285));assert.deepEqual(partitionIds.flat(),contracts);
 const capturesById=new Map([[first.id,compactCapture(first)],[second.id,compactCapture(second)]]);
 const createMixedGroup=async label=>{
  const captures=[];
  // Calculate each complete run before any confirmation; never use a partial
  // capture or fake final state to manufacture the three285 partitions.
  for(const date of dates){
   const boot=await run('bootstrap');assert.equal(boot.canCalculate,true);const key=randomUUID(),body={version:'own-payroll-run-command.v2',...query,liquidationDate:date,selection:all(),scopeVersion:boot.scopeVersion,programVersion:boot.programVersion,populationDomain:'native_registered'},capture=await run('calculate',{key,body});
   assert.equal(capture.saved.result.employeeCount,855);assert.equal(capture.saved.result.rowCount,17100);assert.deepEqual(capture.saved.input.rules,definition.rules);assert.deepEqual(capture.saved.input.employees.map(row=>row.contractId).sort(),contracts);assert.deepEqual(capture.saved.result.rows,firstSaved.result.rows);assert.deepEqual(capture.saved.result.employeeTotals,firstSaved.result.employeeTotals);
   assert.ok(capture.saved.result.employeeTotals.every(row=>row.gross==='118.20'&&row.deduction==='0.00'&&row.net==='118.20'));assert.equal(capture.payload.monthly.batches.length,0);
   assert.equal(capture.body.liquidationDate,date);assert.ok(bytes(capture)>FOUR&&bytes(capture)<=FULL);measurements.captures.push({label,date,bytes:bytes(capture),employees:855,conceptRows:17100});captures.push(compactCapture(capture));capturesById.set(capture.id,compactCapture(capture));
  }
  for(let n=0;n<captures.length;n++){
   const detail=await readDetail(captures[n].id,label+'-confirm'),key=randomUUID(),body={runId:detail.id,resultSha256:detail.capture.saved.resultSha256,scopeVersion:detail.scopeVersion,stateVersion:detail.stateVersion,command:'confirm',selection:{kind:'contracts',values:[...partitionIds[n]]},reason:'Confirmación exclusivamente sintética285 de855, grupo '+label,reviewConfirmed:true},receipt=await liq('command',{key,body});
   assert.equal(receipt.affected.length,285);assert.deepEqual(receipt.affected.map(row=>row.contractId).sort(),partitionIds[n]);
  }
  const current=await readIndex(label),active=current.index.filter(row=>row.states.confirmed>0);assert.equal(active.length,3);assert.equal(current.index.length,capturesById.size);assert.deepEqual(active.map(row=>row.id).sort(),captures.map(row=>row.id).sort());
  for(let n=0;n<captures.length;n++){const row=active.find(row=>row.id===captures[n].id);assert.deepEqual(row.states,{calculated:570,confirmed:285,annulled:0,cancelled:0});assert.deepEqual(row.confirmedContractIds,partitionIds[n]);assert.equal(row.employeeCount,855);assert.equal(row.conceptRowCount,17100);assert.equal(row.liquidationDate,dates[n]);}
  return{captures,index:current};
 };
 const mixed=await createMixedGroup('native-three');index=mixed.index;
 const mixedReview=await readReview('native-active-sequential',index),selection=ownAnnulReviewSelection(mixedReview,all());
 assert.equal(selection.count,855);assert.equal(selection.runCount,3);assert.equal(selection.allowed,true);assert.deepEqual(selection.totals,{gross:'101061.00',deduction:'0.00',net:'101061.00'});
 assert.equal(JSON.stringify(mixedReview).includes('payload'),false);assert.equal(JSON.stringify(mixedReview).includes('saved'),false);
 // A plausible reseal is not authenticity. The real writer must recompute its
 // complete index digest BEFORE entering any child command, not after commit.
 const forged=structuredClone(index),hidden=forged.index.find(row=>row.states.confirmed>0);hidden.states.calculated+=hidden.states.confirmed;hidden.states.confirmed=0;hidden.confirmedContractIds=[];
 const {reviewSha256:ignored,...administrative}=forged;forged.reviewSha256=ownRunHash(administrative);assert.equal(forged.stateVersion,index.stateVersion);assert.notEqual(forged.reviewSha256,index.reviewSha256);await verifiedOwnAnnulReviewIndex(forged);
 const forgedKey=randomUUID();
 await db.run("CREATE FUNCTION qa_annul208_unexpected_child() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QA_ANNUL208_UNEXPECTED_CHILD';END $$;CREATE TRIGGER qa_annul208_unexpected_child BEFORE INSERT ON own_payroll_liquidation_event FOR EACH ROW EXECUTE FUNCTION qa_annul208_unexpected_child()");
 try{await context.sameStateReject(()=>annul('command-v2',{key:forgedKey,body:bodyFor(forged)}),error=>error.code==='OWN_LIQ_STATE_CHANGED'&&error.status===409,'resealed incomplete index fails before first child, without consuming aggregate key');}finally{await db.run('DROP TRIGGER qa_annul208_unexpected_child ON own_payroll_liquidation_event;DROP FUNCTION qa_annul208_unexpected_child()');}
 await keyAbsent(forgedKey);
 const honestBody=bodyFor(index),honestAttempt=attemptFor(mixedReview,honestBody),lateKey=randomUUID();
 const eventCount=await db.run('SELECT count(*)::integer FROM own_payroll_liquidation_event');
 await db.run(`CREATE FUNCTION qa_annul208_late_parent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF (SELECT count(*) FROM own_payroll_liquidation_event)<>${eventCount+3} OR jsonb_array_length(NEW.receipt->'receipts')<>3 OR jsonb_array_length(NEW.receipt->'affected')<>855 THEN RAISE EXCEPTION 'QA_ANNUL208_LATE_FAULT_NOT_REACHED';END IF;RAISE EXCEPTION 'QA_ANNUL208_PARENT_AFTER_THREE_CHILDREN';END $$;CREATE TRIGGER qa_annul208_late_parent BEFORE INSERT ON own_payroll_annul_event FOR EACH ROW EXECUTE FUNCTION qa_annul208_late_parent()`);
 try{await context.sameStateReject(()=>db.run('SELECT own_annul_command_full_v2('+j(qa.checker)+','+j(honestBody)+','+q(lateKey)+'::uuid)',true),error=>/ERROR:.*QA_ANNUL208_PARENT_AFTER_THREE_CHILDREN/.test(error.message),'parent insert after all three children rolls back complete855, parent, children and key');}finally{await db.run('DROP TRIGGER qa_annul208_late_parent ON own_payroll_annul_event;DROP FUNCTION qa_annul208_late_parent()');}
 await keyAbsent(lateKey);
 const aggregateBefore=context.readSnapshot(),receipt=await command(honestAttempt);assert.equal(receipt.affected.length,855);assert.equal(receipt.receipts.length,3);assert.deepEqual(receipt.affected.map(row=>row.contractId).sort(),contracts);assert.notDeepEqual(context.readSnapshot(),aggregateBefore);receiptHistory.push(structuredClone(receipt));
 const replaySnapshot=context.readSnapshot();assert.deepEqual(await command(honestAttempt),{...receipt,replayed:true});await receiptStable(receipt);assert.deepEqual(context.readSnapshot(),replaySnapshot);
 await context.sameStateReject(()=>annul('command-v2',{key:honestAttempt.key,body:{...honestBody,reason:reason+' modificado'}}),error=>error.code==='OWN_LIQ_IDEMPOTENCY_REUSE','same v2 key cannot consume a different reviewed body');
 await context.sameStateReject(()=>annul('command-v2',{key:annulKey,body:honestBody}),error=>error.code==='OWN_LIQ_IDEMPOTENCY_REUSE','persisted v1 key cannot be reinterpreted as v2 command');
 assert.deepEqual(await annul('attempt',{key:annulKey}),legacyReceipt);
 index=await readIndex('native-annulled');assert.equal(index.index.length,5);assert.equal(index.index.reduce((sum,row)=>sum+row.states.confirmed,0),0);
 for(const date of dates){const loaded=[],snapshot=context.readSnapshot(),prepared=await loadOwnAnnulPreparation(index,receipt,date,async id=>{loaded.push(id);return readDetail(id,'prepare-'+date);});assert.deepEqual(loaded,[...new Set(receipt.affected.map(row=>row.runId))].sort());const n=dates.indexOf(date);assert.equal(prepared.affected.length,285);assert.deepEqual(prepared.selection,{kind:'contracts',values:[...partitionIds[n]]});assert.equal(prepared.liquidationDate,date);assert.deepEqual(context.readSnapshot(),snapshot);}
 const legacyLoaded=[],legacyPrepared=await loadOwnAnnulPreparation(index,legacyReceipt,dates[0],async id=>{legacyLoaded.push(id);return readDetail(id,'prepare-original-v1');});assert.deepEqual(legacyLoaded,[first.id]);assert.equal(legacyPrepared.affected.length,855);assert.deepEqual(legacyPrepared.selection,{kind:'contracts',values:contracts});
 const corrupted=structuredClone(receipt);corrupted.affected[corrupted.affected.length-1].version++;
 await context.sameStateReject(()=>loadOwnAnnulPreparation(index,corrupted,dates[0],id=>readDetail(id,'must-not-read-corrupt-receipt')),error=>error.code?.startsWith('OWN_ANNUL_REVIEW_'),'one discordant affected employee blocks the whole date preparation');
 // Record a measured full legacy response or its actual capacity rejection.
 // Historical full payloads are not trimmed/relabelled into the new index.
 const measureLegacy=async label=>{const snapshot=context.readSnapshot();try{const value=await annul('detail',query);measurements.legacyConsolidated.push({label,status:'complete',bytes:bytes(value),runs:value.runs.length});assert.ok(bytes(value)<=FULL);}catch(error){if(error.code!=='OWN_LIQ_LIMIT'||error.status!==422)throw error;measurements.legacyConsolidated.push({label,status:'rejected-limit',bytes:null});}assert.deepEqual(context.readSnapshot(),snapshot);};
 await measureLegacy('after-five-real-captures');
 ok(true,'native index retains all five real captures while all three affected runs verify before date filtering');
 // A second actual group gives the browser its own honest855/3 command. This
 // is the same population and programme, not another fixture or foundation.
 const browserGroup=await createMixedGroup('browser-three');index=browserGroup.index;assert.equal(index.index.length,8);
 let readAfterReconfirm=0;await context.sameStateReject(()=>loadOwnAnnulPreparation(index,receipt,dates[0],async id=>{readAfterReconfirm++;return readDetail(id,'must-not-read-reconfirmed');}),error=>error.code==='OWN_ANNUL_REVIEW_CONFIRMED_AGAIN','actual current confirmation rejects whole historical preparation before detail IO');assert.equal(readAfterReconfirm,0);
 await measureLegacy('eight-real-captures-three-active');
 const browser=await verifyOwnAnnulmentV2BrowserOn190(Object.freeze({...context,installation208,iam,measurements,synthetic:true}),{captures:browserGroup.captures,index,partitionIds,receiptHistory});
 assert.equal(browser?.passed,true);assert.equal(browser.actualSql,true);assert.equal(browser.actualHttp,true);assert.equal(browser.fullAnnulmentBrowserProven,true);assert.equal(browser.fullCapacityBrowserProven,false);assert.equal(browser.receiptToPreparationBrowserProven,false);assert.equal(browser.monthlyBusinessCovered,false);assert.equal(browser.productionWrites,0);assert.equal(browser.paymentExecuted,false);assert.equal(browser.municipalAcceptance,false);
 // Verify append-only history and all previous monetary/registration/programme
 // rows, including the original accounting/journal tails, without exporting rows.
 assert.deepEqual((await readDetail(first.id,'final-original-first')).capture.saved,firstSaved);assert.deepEqual((await readDetail(second.id,'final-original-second')).capture.saved,originalSecond);
 assert.deepEqual(await close('group',{id:closed.groupId}),originalGroup);assert.deepEqual(await verifiedOwnReportCensus(await close('report-census',query)),originalCensus);
 for(const oldReceipt of receiptHistory)await receiptStable(oldReceipt);
 const finalIndex=await readIndex('after-native-browser');assert.equal(finalIndex.index.length,8);assert.deepEqual(finalIndex.index.map(row=>row.id).sort(),[...capturesById.keys()].sort());assert.equal(finalIndex.index.reduce((sum,row)=>sum+row.states.confirmed,0),0);
 for(const reference of finalIndex.index){const original=capturesById.get(reference.id);assert.equal(reference.bodySha256,original.bodySha256);assert.equal(reference.payloadSha256,original.payloadSha256);assert.equal(reference.inputSha256,original.inputSha256);assert.equal(reference.resultSha256,original.resultSha256);assert.equal(reference.employeeCount,855);assert.equal(reference.conceptRowCount,17100);}
 const prefixAfter=rowMultiset(h,qa);assertPrefix(prefixBefore,prefixAfter);
 const appendOnly=['own_payroll_run_capture','own_payroll_run_result','own_payroll_liquidation_event','own_payroll_annul_event'];
 assert.deepEqual(prefixAfter.filter(row=>!appendOnly.includes(row.name)),prefixBefore.filter(row=>!appendOnly.includes(row.name)),'ANNUL208_NO_OTHER_BUSINESS_TABLE_CHANGED');
 assert.deepEqual(tableSet(prefixAfter,['native_employee_registration']),tableSet(prefixBefore,['native_employee_registration']));
 assert.equal(h.json([`SELECT jsonb_build_object('count',count(*)::integer) FROM ${qa.schema}.native_employee_registration`],{readOnly:true}).count,855);
 const sourceBookend=await assertOwnAnnulmentReviewV2SourceBookend({h,db,installation:installation208});
 ok(true,'all pre-tail row-hash multiplicities, old immutable captures, reopened close and financial history survive native browser decisions');
 return{version:'own-annulment-v2-live190-native-browser-qa.v1',passed:true,sourceCommit:h.sourceCommit,major:h.major,population:855,conceptRowsPerRun:17100,historyRuns:8,partitions:[285,285,285],dates:[...dates],measurements,checks,installation:installation208,sourceBookend,browser,oldRowPrefix:{tables:prefixBefore.length,sha256:ownRunHash(prefixBefore),preserved:true},actualSql:true,actualHttp:browser.actualHttp,fullAnnulmentBrowserProven:browser.fullAnnulmentBrowserProven,fullCapacityBrowserProven:false,receiptToPreparationBrowserProven:false,synthetic:true,monthlyBusinessCovered:false,productionWrites:0,paymentExecuted:false,municipalAcceptance:false};
}
