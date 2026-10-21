// PRIVATE SOURCE CANDIDATE. Never imported, parsed or executed by its author.
// Future tail ONLY: install209 immediately after install208, finish ALL208
// business/browser unchanged, then invoke this tail on that SAME canonical190.
// No foundation, transport, new schema, production data or automatic recalculation.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {ownerDecisionQaLiteral as q} from './municipal-owner-adoption-decision-qa.mjs';
import {ownerProgramQaAccessSql,ownerProgramQaAccess} from './municipal-owner-program-qa.mjs';
import {assertOwnAnnulmentReviewV2SourceBookend} from './own-payroll-annulment-review-v2-installation.mjs';
import {assertOwnAnnulPreparation209SourceBookend} from './own-payroll-annulment-preparation-209-installation.mjs';
import {buildOwnAnnulPreparation209ActorsFixture,assertOwnAnnulPreparation209ActorsProof,OWN_ANNUL_PREPARER_209_CAPABILITIES} from './own-annulment-preparation-209-actors-fixture.mjs';
import {ownRunOperation,ownRunAlgorithmHash,ownRunHash} from '../../lib/internal-own-payroll-run.js';
import {employeeContext} from '../../lib/internal-native-employees.js';
import {ownLiquidationOperation} from '../../lib/internal-own-payroll-liquidation.js';
import {ownAnnulOperation} from '../../lib/internal-own-payroll-annulment.js';
import {ownCloseOperation} from '../../lib/internal-own-payroll-close.js';
import {ownAnnulPreparationOperation,annulPreparationError} from '../../lib/internal-own-payroll-annulment-preparation.js';
import {createOwnAnnulPreparationHandler} from '../../api/internal-own-payroll-annulment-preparation.js';
import {OWN_RUN_PREPARE} from '../../assets/own-payroll-run-workspace-model.js';
import {OWN_RUN_FULL_JSON} from '../../assets/own-payroll-response.js';
import {verifiedOwnLiquidationDetail} from '../../assets/own-payroll-liquidation-model.js';
import {verifiedOwnAnnulReviewIndex,loadOwnAnnulReview,ownAnnulReviewRows,ownAnnulReviewSelection,ownAnnulReviewAttempt,verifiedOwnAnnulReviewReceipt} from '../../assets/own-payroll-annulment-review-model.js';
import {ownAnnulPreparationDates,ownAnnulPreparationForDate,assertSameOwnAnnulPreparation} from '../../assets/own-payroll-annulment-preparation-model.js';

const FOUR=4*1024*1024,FULL=32*1024*1024;
const dates=Object.freeze(['2026-10-17','2026-10-19']);
const j=value=>q(JSON.stringify(value))+'::jsonb';
const bytes=value=>Buffer.byteLength(JSON.stringify({ok:true,data:value}),'utf8');
const all=()=>({kind:'all',values:[]});
const contractsSelection=values=>({kind:'contracts',values:[...values]});
const reason='Decisión exclusivamente sintética de custodia209 en el host190 existente';
const expectedPins=Object.freeze({
 'scripts/migrations/209-own-annulment-preparation-projection.sql':'5b0a9896d762f90a25ff84b5d8417d0e178350dd3864b73e47eb5654b2eafd56',
 'scripts/lib/own-payroll-annulment-preparation-209-installation.mjs':'3550621b23b5c524e386b5c3099903a6204fd6b0aa80424672e26bddfcbdb612',
 'scripts/lib/own-annulment-preparation-209-actors-fixture.mjs':'e7e7b754d80cab939973511128067ee4e8202715ba8513a396c504bc9e349f3c',
 'assets/own-payroll-annulment-preparation-model.js':'f431df5c55db1a38bff70337cfed8bc6e2bf8a66a093ef1c8e381933c2982b3e'
});

// Canonical native access reader, not a copy of maker's principal with another
// actor ID. The database derives each new actor's employment/person/scope.
function managedAccess(h,actor){
 const value=h.json([ownerProgramQaAccessSql(h.qa.schema,actor)],{readOnly:true});
 const access=ownerProgramQaAccess(value,actor);
 assert.equal(access.mode,'managed');assert.equal(access.principal.authorized,true);
 assert.equal(access.principal.session.mfa,true);assert.equal(access.session.id,actor.actorSessionId);
 assert.equal(access.session.version,actor.actorSessionVersion);
 const session={...access.session,releaseSha:actor.releaseSha};
 assert.deepEqual(employeeContext(access.principal,session),actor);
 return{principal:access.principal,session};
}

// Hash multiplicities preserve every old row without returning nominal values.
// Source-equivalent to208's prefix proof, with an independent209 result slot.
function rowMultiset(h){
 const schema=h.qa.schema;assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 return h.json([`DO $annul209_prefix$ DECLARE relation record;items jsonb;result jsonb:='[]';BEGIN
 FOR relation IN SELECT c.oid,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=${q(schema)} AND c.relkind IN('r','p','m') ORDER BY c.oid LOOP
 EXECUTE format('SELECT coalesce(jsonb_agg(jsonb_build_object(''sha256'',s.sha256,''count'',s.multiplicity) ORDER BY s.sha256),''[]'') FROM (SELECT encode(public.digest(to_jsonb(r)::text,''sha256''),''hex'') sha256,count(*) multiplicity FROM %I.%I r GROUP BY 1) s',${q(schema)},relation.relname) INTO items;
 result:=result||jsonb_build_array(jsonb_build_object('oid',relation.oid,'name',relation.relname,'hashes',items));END LOOP;
 PERFORM set_config('municontrol_annul209.prefix',result::text,true);END $annul209_prefix$;
 SELECT current_setting('municontrol_annul209.prefix')::jsonb`],{readOnly:true,fullJson:true});
}
function assertPrefix(before,after){
 assert.equal(after.length,before.length);assert.equal(new Set(after.map(row=>row.oid)).size,after.length);
 for(const old of before){
  const current=after.find(row=>row.oid===old.oid);assert.ok(current);assert.equal(current.name,old.name);
  const hashes=new Map(current.hashes.map(row=>[row.sha256,row.count]));assert.equal(hashes.size,current.hashes.length);
  for(const row of old.hashes){assert.match(row.sha256,/^[a-f0-9]{64}$/);assert.ok(Number.isSafeInteger(row.count)&&row.count>0);assert.ok((hashes.get(row.sha256)??0)>=row.count,'ANNUL209_PRIOR_ROW_CHANGED_OR_REMOVED');}
 }
}
function response(){
 const value=new EventEmitter();Object.assign(value,{headers:{},chunks:[],statusCode:null,headersSent:false,destroyed:false,
  setHeader(key,item){this.headers[key]=item;},status(code){this.statusCode=code;return this;},
  json(item){this.value=item;return this;},destroy(){this.destroyed=true;},
  write(chunk){this.headersSent=true;this.chunks.push(Buffer.from(chunk));return true;},
  end(){this.ended=true;this.value=JSON.parse(Buffer.concat(this.chunks).toString('utf8'));}});return value;
}

export async function runOwnAnnulPreparation209NativeContinuation(context){
 assert.equal(context?.version,'own-annul-preparation209-live190-context.v1');
 const {baselineContext:base,installation208,installation209,completed208}=context;
 assert.equal(base?.version,'own-annulment-v2-live190-context.v1');
 const {h,db,qa,contracts,definition,first,firstSaved,second,closed,reopened,period,query}=base;
 assert.strictEqual(h.qa,qa);assert.ok([17,18].includes(h.major));assert.equal(qa.operationalPairBaseline,'published107');
 assert.equal(period,'2026-10');assert.deepEqual(query,{period,liquidationType:'monthly'});
 assert.equal(base.monthlyBusinessCovered,false);assert.equal(completed208?.passed,true);
 assert.equal(completed208.version,'own-annulment-v2-live190-native-browser-qa.v1');
 assert.equal(completed208.actualSql,true);assert.equal(completed208.actualHttp,true);assert.equal(completed208.historyRuns,8);
 assert.equal(completed208.population,855);assert.equal(completed208.conceptRowsPerRun,17100);
 assert.equal(completed208.productionWrites,0);assert.equal(completed208.municipalAcceptance,false);
 assert.strictEqual(completed208.installation,installation208);
 assert.equal(installation209?.passed,true);assert.equal(installation209.sourceCommit,h.sourceCommit);
 assert.equal(installation209.operationalPairBaseline,'published107');assert.equal(installation209.pre107Admitted,false);
 assert.equal(installation209.productionWrites,0);assert.equal(installation209.municipalAcceptance,false);
 // Both WeakMaps authenticate the exact installation object and SAME h/db.
 assertOwnAnnulmentReviewV2SourceBookend({h,db,installation:installation208});
 assertOwnAnnulPreparation209SourceBookend({h,db,installation:installation209});
 for(const[file,pin]of Object.entries(expectedPins))assert.equal(createHash('sha256').update(h.read(file).replace(/\r\n?/g,'\n')).digest('hex'),pin,'ANNUL209_TAIL_SOURCE_CHANGED:'+file);
 assert.equal(contracts.length,855);assert.equal(new Set(contracts).size,855);assert.deepEqual(contracts,[...contracts].sort());
 assert.equal(definition.rules.length,20);assert.deepEqual(first.saved,firstSaved);
 const checks=[],measurements={captures:[],projections:[],nativeErrors:[],census:[]};
 const ok=(condition,label)=>{assert.ok(condition,label);checks.push(label);h.check(label);};
 const readSnapshot=()=>base.readSnapshot();
 const sameStateReject=async(operation,predicate,label)=>{const before=readSnapshot();await assert.rejects(operation,predicate);assert.deepEqual(readSnapshot(),before);ok(true,label);};
 const reviewer=managedAccess(h,qa.checker);
 assert.ok(!reviewer.principal.tenant.effectiveCapabilities.includes('payroll.calculation.prepare'),'ANNUL209_CHECKER_MUST_REMAIN_WITHOUT_PREPARE');
 const liq=(operation,input={},fullJson=true)=>ownLiquidationOperation(db,reviewer.principal,reviewer.session,operation,input,{fullJson});
 const annul=(operation,input={},fullJson=true)=>ownAnnulOperation(db,reviewer.principal,reviewer.session,operation,input,{fullJson});
 const close=(operation,input={},fullJson=true)=>ownCloseOperation(db,reviewer.principal,reviewer.session,operation,input,{fullJson});
 const readIndex=async()=>verifiedOwnAnnulReviewIndex(await annul('review',query));
 let index=await readIndex();assert.equal(index.index.length,8);assert.equal(index.index.reduce((n,row)=>n+row.states.confirmed,0),0);
 const originalGroup=await close('group',{id:closed.groupId});assert.equal(originalGroup.groupId,reopened.groupId);
 const prefixBeforeActors=rowMultiset(h),beforeActors=readSnapshot();
 // FIRST actor-fixture construction is here, AFTER208 has returned. Its late
 // fault runs on the existing guarded host and is rolled back, not repaired.
 const actorPlan=buildOwnAnnulPreparation209ActorsFixture({qa,contracts,read:h.read});
 await assert.rejects(async()=>h.json([...actorPlan.statements,actorPlan.lateFaultStatement],{end:'ROLLBACK',fullJson:true}),error=>/QA_ANNUL209_ACTORS_LATE_FAULT/.test(error.message));
 assert.deepEqual(readSnapshot(),beforeActors);assert.deepEqual(rowMultiset(h),prefixBeforeActors);
 const actorProof=h.json(actorPlan.statements,{fullJson:true}),actors=assertOwnAnnulPreparation209ActorsProof(actorPlan,actorProof);
 assertPrefix(prefixBeforeActors,rowMultiset(h));
 const accesses=Object.fromEntries(Object.entries(actorPlan.actors).map(([name,actor])=>[name,managedAccess(h,actor)]));
 assert.notEqual(accesses.creator1.session.id,accesses.creator2.session.id);
 assert.notEqual(accesses.creator1.principal.user.email,accesses.creator2.principal.user.email);
 for(const name of['creator1','creator2','receiver']){
  for(const capability of OWN_RUN_PREPARE)assert.ok(accesses[name].principal.tenant.effectiveCapabilities.includes(capability));
  for(const forbidden of['payroll.calculation.approve','payroll.calculation.close'])assert.ok(!accesses[name].principal.tenant.effectiveCapabilities.includes(forbidden));
 }
 for(const name of['creator2','receiver'])assert.deepEqual([...accesses[name].principal.tenant.effectiveCapabilities].sort(),OWN_ANNUL_PREPARER_209_CAPABILITIES);
 const prefixBefore=rowMultiset(h),metadata=actorProof.after.metadata;
 const run=(name,operation,input={},fullJson=true)=>ownRunOperation(db,accesses[name].principal,accesses[name].session,operation,input,{fullJson});
 const preparation=(id,fullJson=true)=>ownAnnulPreparationOperation(db,accesses.receiver.principal,accesses.receiver.session,'detail',{id},{fullJson});
 const readDetail=async id=>verifiedOwnLiquidationDetail(await liq('detail',{id}));
 const bootstraps={};for(const name of['creator1','creator2','receiver']){bootstraps[name]=await run(name,'bootstrap',{contractVersion:'2'});assert.equal(bootstraps[name].version,'own-payroll-bootstrap.v2');assert.equal(bootstraps[name].canCalculate,true);}
 assert.equal(new Set(Object.values(bootstraps).map(row=>row.scopeVersion)).size,3);
 for(const row of actorProof.actors){const name=row.name==='secondCreator'?'creator2':'receiver';assert.equal(row.scopeVersion,bootstraps[name].scopeVersion);}
 const captures=[];
 for(const [n,name]of['creator1','creator2'].entries()){
  const boot=await run(name,'bootstrap',{contractVersion:'2'}),body={version:'own-payroll-run-command.v2',...query,liquidationDate:dates[n],selection:all(),scopeVersion:boot.scopeVersion,programVersion:boot.programVersion,populationDomain:'native_registered'},key=randomUUID();
  const capture=await run(name,'calculate',{body,key});
  assert.equal(capture.saved.result.employeeCount,855);assert.equal(capture.saved.result.rowCount,17100);
  assert.deepEqual(capture.saved.input.rules,definition.rules);assert.deepEqual(capture.saved.input.employees.map(row=>row.contractId).sort(),contracts);
  assert.deepEqual(capture.saved.result.rows,firstSaved.result.rows);assert.deepEqual(capture.saved.result.employeeTotals,firstSaved.result.employeeTotals);
  assert.equal(capture.payload.monthly.batches.length,0);assert.equal(capture.body.liquidationDate,dates[n]);
  assert.ok(bytes(capture)>FOUR&&bytes(capture)<=FULL);
  measurements.captures.push({creator:name,date:dates[n],bytes:bytes(capture),employeeCount:855,conceptRowCount:17100});captures.push(capture);
 }
 assert.notEqual(captures[0].body.scopeVersion,captures[1].body.scopeVersion);
 const partitions=[contracts.slice(0,285),contracts.slice(285)];assert.deepEqual(partitions.map(row=>row.length),[285,570]);assert.deepEqual(partitions.flat(),contracts);
 const confirm=async(capture,ids)=>{const detail=await readDetail(capture.id);return liq('command',{key:randomUUID(),body:{runId:detail.id,resultSha256:detail.capture.saved.resultSha256,scopeVersion:detail.scopeVersion,stateVersion:detail.stateVersion,command:'confirm',selection:contractsSelection(ids),reason,reviewConfirmed:true}});};
 for(let n=0;n<2;n++){const receipt=await confirm(captures[n],partitions[n]);assert.equal(receipt.affected.length,partitions[n].length);assert.deepEqual(receipt.affected.map(row=>row.contractId).sort(),partitions[n]);}
 index=await readIndex();assert.equal(index.index.length,10);assert.equal(index.index.reduce((n,row)=>n+row.states.confirmed,0),855);
 for(let n=0;n<2;n++){const row=index.index.find(row=>row.id===captures[n].id);assert.ok(row);assert.deepEqual(row.states,{calculated:855-partitions[n].length,confirmed:partitions[n].length,annulled:0,cancelled:0});}
 const review=await loadOwnAnnulReview(index,readDetail);assert.equal(ownAnnulReviewRows(review).length,855);
 const body={version:'own-annul-command.v2',...query,scopeVersion:index.scopeVersion,stateVersion:index.stateVersion,reviewSha256:index.reviewSha256,selection:all(),reason,reviewConfirmed:true};
 const attempt=ownAnnulReviewAttempt(randomUUID(),body,'qa-native209:'+qa.checker.membershipId,ownAnnulReviewSelection(review,body.selection));
 const receipt=await annul('command-v2',{key:attempt.key,body:attempt.body});await verifiedOwnAnnulReviewReceipt(receipt,attempt);
 assert.equal(receipt.affected.length,855);assert.equal(receipt.receipts.length,2);assert.deepEqual(receipt.affected.map(row=>row.contractId).sort(),contracts);
 const receiptReplay=await annul('attempt',{key:receipt.key});assert.deepEqual(receiptReplay,{...receipt,replayed:true});
 // Existing ownership/approval gates stay closed to a real third preparer.
 for(const capture of captures){
  await sameStateReject(()=>run('receiver','attempt',{key:capture.key}),error=>error.code==='OWN_RUN_NOT_FOUND'&&error.status===404,'receiver cannot recover another creator\'s old run attempt');
  await sameStateReject(()=>ownLiquidationOperation(db,accesses.receiver.principal,accesses.receiver.session,'detail',{id:capture.id},{fullJson:true}),error=>error.code==='OWN_LIQ_FORBIDDEN'&&error.status===403,'receiver cannot download another creator\'s old liquidation detail');
 }
 await sameStateReject(()=>ownAnnulOperation(db,accesses.receiver.principal,accesses.receiver.session,'attempt',{key:receipt.key},{fullJson:true}),error=>error.code==='OWN_LIQ_FORBIDDEN'&&error.status===403,'receiver gains no approval access to the old annulment-attempt route');
 await sameStateReject(()=>ownAnnulPreparationOperation(db,reviewer.principal,reviewer.session,'detail',{id:receipt.id},{fullJson:true}),error=>error.code==='OWN_ANNUL_PREPARATION_FORBIDDEN'&&error.status===403,'checker without prepare cannot use209');
 // Verify ALL855 and both runs FIRST. Date filtering below is local only.
 const projectionBefore=readSnapshot(),traceStart=db.trace.length,projection=await preparation(receipt.id);
 assert.deepEqual(readSnapshot(),projectionBefore);assert.equal(projection.scopeVersion,bootstraps.receiver.scopeVersion);
 assert.equal(projection.affected.length,855);assert.equal(projection.runs.length,2);assert.deepEqual(projection.affected.map(row=>row.contractId),contracts);
 assert.deepEqual(projection.runs.map(row=>row.id).sort(),captures.map(row=>row.id).sort());assert.equal(projection.source.receiptVersion,'own-annul-receipt.v2');
 assert.equal(projection.source.id,receipt.id);assert.equal(projection.source.receiptSha256,ownRunHash(receipt));
 for(const capture of captures){const row=projection.runs.find(value=>value.id===capture.id);assert.equal(row.creatorScopeVersion,capture.body.scopeVersion);assert.notEqual(row.creatorScopeVersion,projection.scopeVersion);assert.equal(row.resultSha256,capture.saved.resultSha256);assert.equal(row.employeeCount,855);assert.equal(row.conceptRowCount,17100);}
 const readTrace=db.trace.slice(traceStart);assert.equal(readTrace.length,3);assert.ok(readTrace.every(row=>/own_run_bootstrap_v2|own_annul_preparation_full_v1/.test(row.sql)));assert.ok(readTrace.every(row=>!/attempt|liquidation_detail|command|capture|complete/.test(row.sql)));
 assert.deepEqual(ownAnnulPreparationDates(projection),dates.map((liquidationDate,n)=>({liquidationDate,count:partitions[n].length})));
 for(let n=0;n<2;n++){const draft=ownAnnulPreparationForDate(projection,dates[n]);assert.equal(draft.reviewConfirmed,false);assert.deepEqual(draft.selection,contractsSelection(partitions[n]));assert.equal(draft.affected.length,partitions[n].length);assert.equal(draft.sourceReference.preparationSha256,projection.preparationSha256);assert.deepEqual(readSnapshot(),projectionBefore);}
 // Both declared media profiles read the same real DTO. This is an in-process
 // real API invocation, NOT a browser or HTTP-listener acceptance claim.
 for(const accept of['application/json',OWN_RUN_FULL_JSON]){
  const currentAccess=managedAccess(h,actorPlan.actors.receiver),res=response(),params={resource:'detail',id:receipt.id};
  const handler=createOwnAnnulPreparationHandler({env:{},requireAccess:async(_req,_res,options)=>{assert.deepEqual(options.requiredCapabilities,OWN_RUN_PREPARE);assert.equal(options.capabilityMode,'all');assert.equal(options.requireDataPlaneReady,true);assert.equal(options.requireCertifiedDataBinding,true);assert.equal(options.allowLegacy,false);return{mode:'managed',principal:currentAccess.principal};},sessionFor:()=>currentAccess.session,getSql:async()=>db});
  await handler({method:'GET',url:'/api/internal-own-payroll-annulment-preparation?'+new URLSearchParams(params),query:params,headers:{accept}},res);
  assert.equal(res.statusCode,200);assert.equal(res.destroyed,false);assert.deepEqual(res.value,{ok:true,data:projection});
  const wireBytes=accept===OWN_RUN_FULL_JSON?Buffer.concat(res.chunks).length:Buffer.byteLength(JSON.stringify(res.value));
  assert.ok(wireBytes<=(accept===OWN_RUN_FULL_JSON?FULL:FOUR));if(accept===OWN_RUN_FULL_JSON)assert.equal(Number(res.headers['X-MuniControl-JSON-Bytes']),wireBytes);
  measurements.projections.push({receiptVersion:projection.source.receiptVersion,accept,wireBytes,maximumBytes:accept===OWN_RUN_FULL_JSON?FULL:FOUR,affected:855,projectedRuns:2,above4MiB:wireBytes>FOUR});
  assert.deepEqual(readSnapshot(),projectionBefore);
 }
 for(const capture of captures)await sameStateReject(()=>liq('detail',{id:capture.id},false),error=>error.code==='OWN_LIQ_LIMIT'&&error.status===422,'actual855/17100 capture above4MiB still rejects whole legacy download');
 assertSameOwnAnnulPreparation(projection,await preparation(receipt.id));
 const legacy=await preparation(base.annulled.id);assert.equal(legacy.source.receiptVersion,'own-annul-receipt.v1');assert.equal(legacy.affected.length,855);assert.equal(legacy.runs.length,1);assert.equal(legacy.runs[0].id,first.id);assert.equal(legacy.scopeVersion,bootstraps.receiver.scopeVersion);
 ok(true,'real third managed preparer reads complete855 from two distinct creator scopes while old gates and checker separation remain intact');
 const currentContext=employeeContext(accesses.receiver.principal,accesses.receiver.session),schema=qa.schema;
 // Native negative probes are single, explicitly rolled-back transactions on
 // h.json. The caught error must come from209's real call, not a fake adapter.
 const nativeRejected=async(label,expected,{ctx=currentContext,changes=[]}={})=>{
  const before=readSnapshot(),sourceId=receipt.id;
  const probe=`DO $annul209_negative$ DECLARE detail text;state text;BEGIN BEGIN
  PERFORM ${schema}.own_annul_preparation_v1(${j(ctx)},${q(sourceId)}::uuid);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS detail=MESSAGE_TEXT,state=RETURNED_SQLSTATE;
  IF detail<>${q(expected)} THEN RAISE EXCEPTION 'ANNUL209_UNEXPECTED_NATIVE_ERROR:%:%',state,detail;END IF;
  PERFORM set_config('municontrol_annul209.negative',jsonb_build_object('label',${q(label)},'message',detail,'sqlstate',state)::text,true);RETURN;END;
  RAISE EXCEPTION 'ANNUL209_EXPECTED_NATIVE_REJECTION_MISSING';END $annul209_negative$;
  SELECT current_setting('municontrol_annul209.negative')::jsonb`;
  const proof=h.json([...changes,'SET LOCAL ROLE municontrol_actions_runtime_app',probe],{end:'ROLLBACK',fullJson:true});
  assert.equal(proof.message,expected);assert.equal(proof.sqlstate,'P0001');assert.deepEqual(readSnapshot(),before);
  const safe=annulPreparationError(new Error(expected));assert.ok(!safe.message.includes(expected));
  measurements.nativeErrors.push({label,databaseCode:expected,safeCode:safe.code,safeStatus:safe.status,rollbackPreserved:true});return safe;
 };
 const checkerError=await nativeRejected('checker-without-prepare','OWN_ANNUL_PREPARATION_FORBIDDEN',{ctx:qa.checker});assert.equal(checkerError.status,403);
 const wrongTenant=await nativeRejected('wrong-tenant','ACTION_SESSION_INVALID',{ctx:{...currentContext,tenantId:randomUUID()}});assert.equal(wrongTenant.status,401);
 const wrongSession=await nativeRejected('wrong-session','ACTION_SESSION_INVALID',{ctx:{...currentContext,actorSessionId:randomUUID()}});assert.equal(wrongSession.status,401);
 const revoked=await nativeRejected('revoked-session','ACTION_SESSION_INVALID',{changes:[`UPDATE ${schema}.tenant_identity_session SET status='revoked',revoked_at=transaction_timestamp(),revoked_by_user_email=${q(qa.actor.actorEmail)},version=version+1 WHERE id=${q(currentContext.actorSessionId)}::uuid`]});assert.equal(revoked.status,401);
 const denied=await nativeRejected('prepare-revoked','OWN_ANNUL_PREPARATION_FORBIDDEN',{changes:[`INSERT INTO ${schema}.tenant_membership_capability_override(membership_id,capability_key,allow_override,deny_override,reason,granted_by_user_email) VALUES(${q(currentContext.membershipId)}::uuid,'payroll.calculation.prepare',false,true,${q(reason)},${q(qa.actor.actorEmail)})`]});assert.equal(denied.status,403);
 const bindingError=await nativeRejected('binding-unverified','ACTION_SOURCE_BINDING_REQUIRED',{changes:[`UPDATE ${schema}.platform_tenant_source_binding SET verified=false,verified_at=NULL WHERE id=${q(qa.ids.binding)}::uuid`]});assert.equal(bindingError.status,503);assert.equal(bindingError.code,'OWN_ANNUL_PREPARATION_UNAVAILABLE');
 await sameStateReject(()=>preparation(randomUUID()),error=>error.code==='OWN_ANNUL_PREPARATION_NOT_FOUND'&&error.status===404,'unknown source ID never exposes another receipt');
 const ledger=()=>db.run(`SELECT jsonb_build_object('captures',(SELECT count(*)::integer FROM own_payroll_run_capture c WHERE c.tenant_id=${q(qa.actor.tenantId)}::uuid AND c.source_binding_id=${q(qa.ids.binding)}::uuid AND c.body->>'period'=${q(period)} AND c.body->>'liquidationType'='monthly'),'saved',(SELECT count(*)::integer FROM own_payroll_run_capture c JOIN own_payroll_run_result r ON r.capture_id=c.id WHERE c.tenant_id=${q(qa.actor.tenantId)}::uuid AND c.source_binding_id=${q(qa.ids.binding)}::uuid AND c.body->>'period'=${q(period)} AND c.body->>'liquidationType'='monthly'),'creators',(SELECT count(DISTINCT actor_membership_id)::integer FROM own_payroll_run_capture WHERE tenant_id=${q(qa.actor.tenantId)}::uuid AND source_binding_id=${q(qa.ids.binding)}::uuid AND body->>'period'=${q(period)} AND body->>'liquidationType'='monthly'),'liquidationEvents',(SELECT count(*)::integer FROM own_payroll_liquidation_event),'closeEvents',(SELECT count(*)::integer FROM own_payroll_close_event))`);
 let previous=projection,census=await ledger();assert.equal(census.captures,10);assert.equal(census.saved,10);assert.equal(census.creators,2);measurements.census.push({stage:'after-two-creator-annulment',...census});
 // Two separate ordinary, unsaved captures exercise the COMPLETE inventory:
 // another creator and the receiver. These are explicit synthetic fixture
 // writes, not a side effect of preparing a date or receiving a GET response.
 for(const name of['creator2','receiver']){
  const boot=await run(name,'bootstrap',{contractVersion:'2'}),pendingBody={version:'own-payroll-run-command.v2',...query,liquidationDate:dates[0],selection:all(),scopeVersion:boot.scopeVersion,programVersion:boot.programVersion,populationDomain:'native_registered'},key=randomUUID();
  const result=await db.query('SELECT public.own_run_capture_v1($1::jsonb,$2::jsonb,$3::uuid,$4::text) AS result',[JSON.stringify(employeeContext(accesses[name].principal,accesses[name].session)),JSON.stringify(pendingBody),key,ownRunAlgorithmHash()]);
  const pending=result[0].result;assert.equal(pending.saved,null);assert.equal(pending.key,key);
  const pendingRow=await db.run('SELECT jsonb_build_object(\'captureCount\',(SELECT count(*)::integer FROM own_payroll_run_capture WHERE id='+q(pending.id)+'::uuid),\'resultCount\',(SELECT count(*)::integer FROM own_payroll_run_result WHERE capture_id='+q(pending.id)+'::uuid))');assert.deepEqual(pendingRow,{captureCount:1,resultCount:0});
  const refreshed=await preparation(receipt.id);assert.deepEqual(refreshed.affected,projection.affected);assert.deepEqual(refreshed.runs,projection.runs);assert.notEqual(refreshed.sourceStateSha256,previous.sourceStateSha256);assert.notEqual(refreshed.preparationSha256,previous.preparationSha256);
  assert.throws(()=>assertSameOwnAnnulPreparation(previous,refreshed),error=>error.code==='OWN_ANNUL_PREPARATION_CHANGED');
  census=await ledger();assert.equal(census.saved,10);assert.equal(census.captures,11+(name==='receiver'?1:0));measurements.census.push({stage:'pending-'+name,...census});previous=refreshed;
 }
 assert.equal(census.creators,3);assertSameOwnAnnulPreparation(previous,await preparation(receipt.id));
 ok(true,'complete209 commitment changes for each real pending capture from another managed creator without changing the projected855');
 // Reconfirm ONE affected contract on the OTHER existing creator's capture.
 // The original affected row stays annulled, so this specifically exercises
 // global current state, not merely per-source-row status.
 const affectedId=partitions[0][0],sourceRow=previous.affected.find(row=>row.contractId===affectedId);
 assert.equal(sourceRow.runId,captures[0].id);
 const originalAffectedEmployee=structuredClone((await readDetail(captures[0].id)).employees.find(row=>row.contractId===affectedId));
 assert.equal(originalAffectedEmployee.state,'annulled');const stateBefore=await readDetail(captures[1].id);
 assert.equal(stateBefore.employees.find(row=>row.contractId===affectedId).state,'calculated');
 const reconfirmed=await confirm(captures[1],[affectedId]);assert.equal(reconfirmed.affected.length,1);
 await sameStateReject(()=>preparation(receipt.id),error=>error.code==='OWN_ANNUL_PREPARATION_CURRENT_STATE_CHANGED'&&error.status===409,'global confirmation on another creator blocks whole historical preparation');
 assert.deepEqual((await readDetail(captures[0].id)).employees.find(row=>row.contractId===affectedId),originalAffectedEmployee);
 // A legal active close retains its current confirmation. This checks the
 // real combined state; it is not an isolated counterfactual close predicate.
 const closing=await close('detail',query),closedNow=await close('command',{key:randomUUID(),body:{...query,scopeVersion:closing.scopeVersion,stateVersion:closing.stateVersion,selection:contractsSelection([affectedId]),command:'close',groupId:null,reason,reviewConfirmed:true}});
 assert.equal(closedNow.snapshot.employeeCount,1);
 await sameStateReject(()=>preparation(receipt.id),error=>error.code==='OWN_ANNUL_PREPARATION_CURRENT_STATE_CHANGED'&&error.status===409,'active native close blocks whole historical preparation');
 const reopening=await close('detail',query);await close('command',{key:randomUUID(),body:{...query,scopeVersion:reopening.scopeVersion,stateVersion:reopening.stateVersion,selection:contractsSelection([affectedId]),command:'reopen',groupId:closedNow.groupId,reason,reviewConfirmed:true}});
 index=await readIndex();const finalReview=await loadOwnAnnulReview(index,readDetail),finalBody={version:'own-annul-command.v2',...query,scopeVersion:index.scopeVersion,stateVersion:index.stateVersion,reviewSha256:index.reviewSha256,selection:contractsSelection([affectedId]),reason,reviewConfirmed:true};
 const finalAttempt=ownAnnulReviewAttempt(randomUUID(),finalBody,'qa-native209-final:'+qa.checker.membershipId,ownAnnulReviewSelection(finalReview,finalBody.selection)),finalAnnulled=await annul('command-v2',{key:finalAttempt.key,body:finalAttempt.body});await verifiedOwnAnnulReviewReceipt(finalAnnulled,finalAttempt);assert.equal(finalAnnulled.affected.length,1);
 const finalProjection=await preparation(receipt.id);assert.deepEqual(finalProjection.affected,projection.affected);assert.notEqual(finalProjection.sourceStateSha256,previous.sourceStateSha256);assert.throws(()=>assertSameOwnAnnulPreparation(previous,finalProjection),error=>error.code==='OWN_ANNUL_PREPARATION_CHANGED');
 const finalCensus=await ledger();assert.equal(finalCensus.captures,12);assert.equal(finalCensus.saved,10);assert.equal(finalCensus.creators,3);assert.ok(finalCensus.liquidationEvents>census.liquidationEvents);assert.equal(finalCensus.closeEvents,census.closeEvents+2);measurements.census.push({stage:'after-real-confirm-close-reopen-annul-history',...finalCensus});
 // No sourceReference is smuggled into run-command.v2. No fresh capture or
 // calculation follows the renewed draft: a later explicit reviewed action
 // needs its own current bootstrap, population, programme, consent and key.
 const noAutomaticRun=readSnapshot(),renewedDraft=ownAnnulPreparationForDate(finalProjection,dates[0]);assert.equal(renewedDraft.reviewConfirmed,false);assert.deepEqual(renewedDraft.selection,contractsSelection(partitions[0]));assert.deepEqual(readSnapshot(),noAutomaticRun);
 assert.deepEqual(await annul('attempt',{key:receipt.key}),receiptReplay);
 assert.deepEqual((await readDetail(first.id)).capture.saved,firstSaved);assert.deepEqual((await readDetail(second.id)).capture.saved,second.saved);
 assert.deepEqual(await close('group',{id:closed.groupId}),originalGroup);
 const finalIndex=await readIndex();assert.equal(finalIndex.index.length,10);assert.equal(finalIndex.index.reduce((n,row)=>n+row.states.confirmed,0),0);
 const prefixAfter=rowMultiset(h);assertPrefix(prefixBefore,prefixAfter);
 const appended=['own_payroll_run_capture','own_payroll_run_result','own_payroll_liquidation_event','own_payroll_annul_event','own_payroll_close_event'];
 assert.deepEqual(prefixAfter.filter(row=>!appended.includes(row.name)),prefixBefore.filter(row=>!appended.includes(row.name)),'ANNUL209_UNRELATED_ROWS_CHANGED');
 assert.deepEqual(h.json([actorPlan.metadataReadStatement],{readOnly:true,fullJson:true}),metadata);
 const source208=assertOwnAnnulmentReviewV2SourceBookend({h,db,installation:installation208}),source209=assertOwnAnnulPreparation209SourceBookend({h,db,installation:installation209});
 assert.equal(source209.priorBusinessRowsRecompared,false);
 ok(true,'original immutable captures, receipts, preexisting rows and reopened close survive complete209 native preparation tests');
 return{version:'own-annul-preparation209-live190-native-qa.v1',passed:true,sourceCommit:h.sourceCommit,major:h.major,operationalPairBaseline:'published107',pre107Admitted:false,population:855,conceptRowsPerRun:17100,newSavedCaptures:2,newPendingCaptures:2,creatorCount:3,projectedCreators:2,receiverIsThirdManagedPreparer:true,partitions:[285,570],dates:[...dates],measurements,checks,actors,source208,source209,oldRows:{tables:prefixBefore.length,sha256:ownRunHash(prefixBefore),preserved:true},actualSql:true,actualApiHandler:true,actualHttp:false,actualBrowser:false,receiptToPreparationNativeProven:true,receiptToPreparationBrowserProven:false,fullCapacityBrowserProven:false,projectionAbove4MiB:measurements.projections.some(row=>row.above4MiB),globalCensusMoreThan1000Proven:false,independentDigestOracleProven:false,legacyNullDateNativeProven:false,activeCloseIndependentlyOfConfirmationProven:false,atomicGetToCalculation:false,automaticRecalculation:false,receiptLinkedRecalculationExecuted:false,monthlyBusinessCovered:false,synthetic:true,productionWrites:0,paymentExecuted:false,municipalAcceptance:false};
}
