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
import {readReceipt126Same190Inventory} from './own-payroll-receipt126-same190-inventory.mjs';
import {ownAnnulPreparationOperation,annulPreparationError} from '../../lib/internal-own-payroll-annulment-preparation.js';
import {createOwnAnnulPreparationHandler} from '../../api/internal-own-payroll-annulment-preparation.js';
import {verifyOwnAnnulPreparation209BrowserOn190} from './own-payroll-annulment-preparation-209-native-browser.mjs';
import {verifyOwnLiquidationDecision124BrowserOn190} from './own-payroll-liquidation-decision-124-native-browser.mjs';
import {verifyOwnLiquidationCurrent190Regressions} from './own-payroll-liquidation-current190-regressions-browser.mjs';
import {verifyOwnDecision124CalculationRecoveryOn190,verifyOwnDepartmentConfirmationOn190} from './own-payroll-liquidation-current190-continuation-browser.mjs';
import {verifyOwnAgreementAnnulmentRecoveryOn190} from './own-payroll-agreement-annulment-current190-browser.mjs';
import {OWN_RUN_PREPARE} from '../../assets/own-payroll-run-workspace-model.js';
import {OWN_RUN_FULL_JSON} from '../../assets/own-payroll-response.js';
import {verifiedOwnLiquidationDetail,ownLiquidationDecisionPreparation} from '../../assets/own-payroll-liquidation-model.js';
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
 'scripts/lib/own-payroll-annulment-preparation-209-installation.mjs':'dc07631c214de1d4780134577f94fcaa2891c9ff45dc4d8b1a580b7ee5e5a222',
 'scripts/lib/own-annulment-preparation-209-actors-fixture.mjs':'8d6831ece3f52b3b8fb6e6a10cdb797d6d5c1959fa2edca736a66370abf4d2c9',
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
 assert.equal(completed208.actualSql,true);assert.equal(completed208.actualHttp,true);assert.equal(completed208.historyRuns,10);assert.equal(completed208.historyRunsBefore29,8);
 assert.equal(completed208.selected29?.passed,true);assert.equal(completed208.selected29.population,29);assert.deepEqual(completed208.selected29.partitions,[14,15]);
 assert.equal(completed208.selected29.historyRunsBefore,8);assert.equal(completed208.selected29.historyRunsAfter,10);
 assert.equal(completed208.selected29.browser?.selected29AnnulmentBrowserProven,true);assert.equal(completed208.selected29.browser.receiptToPreparationBrowserProven,false);
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
 let index=await readIndex();assert.equal(index.index.length,10);assert.equal(index.index.reduce((n,row)=>n+row.states.confirmed,0),0);
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
 index=await readIndex();assert.equal(index.index.length,12);assert.equal(index.index.reduce((n,row)=>n+row.states.confirmed,0),855);
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
 // Positive handoff after the complete855/two-creator projection. The existing
 // ledger assertion below remains12 captures/12 saved/two creators; no command
 // is sent by opening, consulting or applying this single285-row draft.
 const handoffBrowser=await verifyOwnAnnulPreparation209BrowserOn190(
  Object.freeze({h,db,qa,readSnapshot,synthetic:true}),
  Object.freeze({sourceId:receipt.id,projection,expectedGroups:ownAnnulPreparationDates(projection),draftDate:dates[0],phase:'handoff',
   actors:{reviewer:{...reviewer,raw:qa.checker,roleKey:'QA_CANONICAL190_REVIEWER'},receiver:{...accesses.receiver,raw:actorPlan.actors.receiver,roleKey:'QA_ANNUL_PREPARER_209'}}}));
 assert.equal(handoffBrowser.version,'own-annul-preparation209-live190-native-browser.v1');assert.equal(handoffBrowser.phase,'handoff');
 assert.equal(handoffBrowser.sourceCommit,h.sourceCommit);assert.equal(handoffBrowser.major,h.major);assert.equal(handoffBrowser.passed,true);
 assert.equal(handoffBrowser.actualSql,true);assert.equal(handoffBrowser.actualHttp,true);assert.equal(handoffBrowser.actualBrowser,true);
 assert.equal(handoffBrowser.receiptToPreparationBrowserProven,true);assert.equal(handoffBrowser.crossRoleHandoffProven,true);
 assert.equal(handoffBrowser.calculationPosts,0);assert.equal(handoffBrowser.pagePosts,0);assert.equal(handoffBrowser.mutations,0);
 assert.equal(handoffBrowser.affected,855);assert.equal(handoffBrowser.projectedRuns,2);assert.deepEqual(handoffBrowser.dateGroups,ownAnnulPreparationDates(projection));
 assert.equal(handoffBrowser.draftDate,dates[0]);assert.equal(handoffBrowser.draftCount,partitions[0].length);
 assert.equal(handoffBrowser.productionWrites,0);assert.equal(handoffBrowser.paymentExecuted,false);assert.equal(handoffBrowser.municipalAcceptance,false);
 assert.deepEqual(readSnapshot(),projectionBefore);assertSameOwnAnnulPreparation(projection,await preparation(receipt.id));
 ok(true,'third managed preparer opens the source-only link in her own browser session, verifies all855 of both runs before any date, prepares one exact unconfirmed date draft and sends nothing');
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
 let previous=projection,census=await ledger();assert.equal(census.captures,12);assert.equal(census.saved,12);assert.equal(census.creators,2);measurements.census.push({stage:'after-two-creator-annulment',...census});
 // SEPARATE INDIVIDUAL124 PHASE. H1/projection and its12/12/2 census above
 // remain the original epoch. These ten disjoint contracts were calculated,
 // never confirmed, in creator1's capture; creator2's old rows are annulled.
 const decisionIds=partitions[1].slice(0,10);assert.equal(decisionIds.length,10);
 assert.ok(decisionIds.every(id=>!partitions[0].includes(id)));
 const decisionDetailBefore=await readDetail(captures[0].id);assert.deepEqual(decisionDetailBefore.capture.saved,captures[0].saved);
 for(const id of decisionIds){const row=decisionDetailBefore.employees.find(value=>value.contractId===id);assert.ok(row);assert.equal(row.state,'calculated');assert.equal(row.blockedBy,null);assert.ok(row.allowedCommands.includes('confirm'));}
 const decisionBefore=(await readIndex()).index.find(row=>row.id===captures[0].id).states;assert.equal(decisionBefore.confirmed,0);
 const decisionSnapshotBefore=readSnapshot(),decisionRowsBefore=rowMultiset(h),decisionLedgerBefore=await ledger();assert.deepEqual(decisionLedgerBefore,census);
 const decisionActors=Object.freeze({reviewer:{...reviewer,raw:qa.checker,roleKey:'QA_CANONICAL190_REVIEWER'},creator:{...accesses.creator1,raw:actorPlan.actors.creator1,roleKey:'QA_ANNUL209_CREATOR1'},receiver:{...accesses.receiver,raw:actorPlan.actors.receiver,roleKey:'QA_ANNUL_PREPARER_209'}});
 // The UI performs the SAME single confirmation previously sent here by liq.
 // Two withheld responses plus exact replay add one event, not another phase.
 const confirmationRegressionBrowser=await verifyOwnLiquidationCurrent190Regressions(Object.freeze({h,db,qa,readSnapshot,readLedger:ledger,synthetic:true}),Object.freeze({run:captures[0],contractIds:decisionIds,detailBefore:decisionDetailBefore,actors:decisionActors,reason}));
 assert.equal(confirmationRegressionBrowser.version,'own-liquidation-current190-regressions-browser.v1');assert.equal(confirmationRegressionBrowser.passed,true);
 assert.equal(confirmationRegressionBrowser.population,captures[0].saved.result.employeeCount);assert.equal(confirmationRegressionBrowser.conceptRows,captures[0].saved.result.rowCount);assert.equal(confirmationRegressionBrowser.affected,decisionIds.length);
 assert.equal(confirmationRegressionBrowser.addedCaptures,0);assert.equal(confirmationRegressionBrowser.addedSavedResults,0);assert.equal(confirmationRegressionBrowser.addedLiquidationDecisions,1);assert.equal(confirmationRegressionBrowser.addedAnnulments,0);assert.equal(confirmationRegressionBrowser.addedCloseEvents,0);
 assert.equal(confirmationRegressionBrowser.firstConfirmationBrowserProven,true);assert.equal(confirmationRegressionBrowser.immutableDecisionRetryBrowserProven,true);assert.equal(confirmationRegressionBrowser.mixedSelectionRejected,true);assert.equal(confirmationRegressionBrowser.positiveDepartmentConfirmationProven,false);assert.equal(confirmationRegressionBrowser.allLegacyDecisionUiCasesCovered,false);
 const decisionConfirm=confirmationRegressionBrowser.receipt;assert.equal(decisionConfirm.runId,captures[0].id);assert.equal(decisionConfirm.body.command,'confirm');assert.equal(decisionConfirm.affected.length,decisionIds.length);assert.deepEqual(decisionConfirm.affected.map(row=>row.contractId).sort(),[...decisionIds].sort());assert.ok(decisionConfirm.affected.every(row=>row.state==='confirmed'));
 const decisionBrowser=await verifyOwnLiquidationDecision124BrowserOn190(Object.freeze({h,db,qa,readSnapshot,synthetic:true}),Object.freeze({run:captures[0],contractIds:decisionIds,actors:decisionActors,reason,phase:'handoff'}));
 assert.equal(decisionBrowser.version,'own-liquidation-decision124-live190-native-browser.v1');assert.equal(decisionBrowser.phase,'handoff');assert.equal(decisionBrowser.passed,true);
 assert.equal(decisionBrowser.sourceCommit,h.sourceCommit);assert.equal(decisionBrowser.major,h.major);assert.equal(decisionBrowser.actualSql,true);assert.equal(decisionBrowser.actualHttp,true);assert.equal(decisionBrowser.actualBrowser,true);
 assert.equal(decisionBrowser.decisionPosts,1);assert.equal(decisionBrowser.mutations,1);assert.equal(decisionBrowser.pagePosts,1);assert.equal(decisionBrowser.calculationPosts,0);assert.equal(decisionBrowser.affected,decisionIds.length);
 assert.equal(decisionBrowser.individualDecisionBrowserProven,true);assert.equal(decisionBrowser.blockedDecisionBrowserProven,false);assert.equal(decisionBrowser.receiverForbidden,true);assert.equal(decisionBrowser.foreignAttemptNotFound,true);
 assert.equal(decisionBrowser.productionWrites,0);assert.equal(decisionBrowser.paymentExecuted,false);assert.equal(decisionBrowser.municipalAcceptance,false);
 const decisionReceipt=decisionBrowser.receipt;assert.equal(decisionReceipt.version,'own-liquidation-receipt.v1');assert.equal(decisionReceipt.runId,captures[0].id);assert.equal(decisionReceipt.body.command,'annul');
 assert.deepEqual(decisionReceipt.affected.map(row=>row.contractId).sort(),[...decisionIds].sort());assert.ok(decisionReceipt.affected.every(row=>row.state==='annulled'));
 // Derive both versions from the actual confirmation, never assume a v1 amount.
 const decisionConfirmedRows=new Map(decisionConfirm.affected.map(row=>[row.contractId,row]));
 for(const row of decisionReceipt.affected){const confirmed=decisionConfirmedRows.get(row.contractId);assert.ok(confirmed);assert.equal(row.liquidationVersion,confirmed.liquidationVersion);assert.equal(row.version,confirmed.version+1);}
 assert.deepEqual(await liq('attempt',{key:decisionReceipt.key}),{...decisionReceipt,replayed:true});
 await sameStateReject(()=>ownLiquidationOperation(db,accesses.creator1.principal,accesses.creator1.session,'attempt',{key:decisionReceipt.key},{fullJson:true}),error=>error.code==='OWN_LIQ_NOT_FOUND'&&error.status===404,'P cannot recover R\'s individual receipt even knowing its key');
 const decisionDraft=ownLiquidationDecisionPreparation(await readDetail(captures[0].id),decisionReceipt.id);assert.deepEqual(decisionDraft.selection,{kind:'contracts',values:[...decisionIds].sort()});assert.equal(decisionDraft.liquidationDate,dates[0]);assert.equal(decisionDraft.runId,captures[0].id);
 const decisionAfter=(await readIndex()).index.find(row=>row.id===captures[0].id).states;assert.deepEqual(decisionAfter,{...decisionBefore,calculated:decisionBefore.calculated-decisionIds.length,annulled:decisionBefore.annulled+decisionIds.length});
 const decisionCensus=await ledger();assert.deepEqual(decisionCensus,{...decisionLedgerBefore,liquidationEvents:decisionLedgerBefore.liquidationEvents+2});assert.notDeepEqual(readSnapshot(),decisionSnapshotBefore);
 const decisionRowsAfter=rowMultiset(h);assertPrefix(decisionRowsBefore,decisionRowsAfter);assert.deepEqual(decisionRowsAfter.filter(row=>row.name!=='own_payroll_liquidation_event'),decisionRowsBefore.filter(row=>row.name!=='own_payroll_liquidation_event'));
 // R2 SEPARATE EFFECTFUL124 CONTINUATION. The complete original12/12 decision
 // epoch and its exact+2 events above remain unchanged. A fresh explicit P
 // action now adds ONE10-person/200-concept capture/result, never a decision.
 const recoveryOriginalDetail=await readDetail(captures[0].id),recoveryRowsBefore=rowMultiset(h),recoveryBefore=await ledger();assert.deepEqual(recoveryBefore,decisionCensus);
 measurements.census.push({stage:'after-individual124-decision',...decisionCensus});
 const calculationRecoveryBrowser=await verifyOwnDecision124CalculationRecoveryOn190(Object.freeze({h,db,qa,readSnapshot,readLedger:ledger,synthetic:true}),Object.freeze({run:captures[0],decision:decisionReceipt,contractIds:decisionIds,actors:decisionActors,reason}));
 assert.equal(calculationRecoveryBrowser.version,'own-decision124-calculation-recovery-live190-browser.v1');assert.equal(calculationRecoveryBrowser.passed,true);assert.equal(calculationRecoveryBrowser.calculationContinuationProven,true);assert.equal(calculationRecoveryBrowser.lostCalculationAcknowledgementProven,true);
 assert.equal(calculationRecoveryBrowser.addedCaptures,1);assert.equal(calculationRecoveryBrowser.addedSavedResults,1);assert.equal(calculationRecoveryBrowser.addedLiquidationDecisions,0);assert.equal(calculationRecoveryBrowser.addedCloseEvents,0);assert.equal(calculationRecoveryBrowser.pagePosts,1);assert.equal(calculationRecoveryBrowser.captureRpcCalls,1);assert.equal(calculationRecoveryBrowser.completionRpcCalls,1);assert.equal(calculationRecoveryBrowser.recoveryAddedRows,0);
 const recovered124=calculationRecoveryBrowser.capture;assert.ok(recovered124.saved);assert.equal(recovered124.saved.result.employeeCount,10);assert.equal(recovered124.saved.result.rowCount,200);assert.deepEqual(recovered124.body.selection,contractsSelection(decisionIds));assert.notEqual(recovered124.id,captures[0].id);
 const recoveryAfter=await ledger();assert.deepEqual(recoveryAfter,{...recoveryBefore,captures:13,saved:13});assert.deepEqual(calculationRecoveryBrowser.after,recoveryAfter);measurements.census.push({stage:'after-individual124-calculation-recovery',...recoveryAfter});
 const recoveryRowsAfter=rowMultiset(h);assertPrefix(recoveryRowsBefore,recoveryRowsAfter);const recoveryTables=['own_payroll_run_capture','own_payroll_run_result'];assert.deepEqual(recoveryRowsAfter.filter(row=>!recoveryTables.includes(row.name)),recoveryRowsBefore.filter(row=>!recoveryTables.includes(row.name)),'DECISION124_RECOVERY_CHANGED_OTHER_LEDGER_OR_IAM');
 assert.deepEqual((await readDetail(captures[0].id)).capture.saved,captures[0].saved);assert.deepEqual((await readDetail(captures[0].id)).employees.map(row=>({contractId:row.contractId,state:row.state,version:row.version,liquidationVersion:row.liquidationVersion})),recoveryOriginalDetail.employees.map(row=>({contractId:row.contractId,state:row.state,version:row.version,liquidationVersion:row.liquidationVersion})));
 ok(true,'an explicit creator calculation after124 saves only the exact10 annulled legajos and200 concepts; lost completion ACK recovers the same immutable attempt without another write');
 // SQL197's stateVersion commits every liquidation event in this period/type.
 // Preserve const projection (H1); bind the later pending reads to a NEW epoch.
 const projectionPostIndividual124=await preparation(receipt.id);
 const {runs:post124Runs,sourceStateSha256:post124State,preparationSha256:post124Sha,...post124Unchanged}=projectionPostIndividual124;
 const {runs:h1Runs,sourceStateSha256:h1State,preparationSha256:h1Sha,...h1Unchanged}=projection;
 assert.deepEqual(post124Unchanged,h1Unchanged);assert.deepEqual(projectionPostIndividual124.affected,projection.affected);assert.equal(post124Runs.length,2);
 assert.deepEqual(post124Runs.map(({stateVersion,...row})=>row),h1Runs.map(({stateVersion,...row})=>row));
 for(const run of post124Runs){const previousRun=h1Runs.find(row=>row.id===run.id);assert.ok(previousRun);assert.notEqual(run.stateVersion,previousRun.stateVersion,'DECISION124_STATE_VERSION_MOVED:'+run.id);}
 assert.notEqual(post124State,h1State);assert.notEqual(post124Sha,h1Sha);assert.throws(()=>assertSameOwnAnnulPreparation(projection,projectionPostIndividual124),error=>error.code==='OWN_ANNUL_PREPARATION_CHANGED');
 assertSameOwnAnnulPreparation(projectionPostIndividual124,await preparation(receipt.id));
 previous=projectionPostIndividual124;census=recoveryAfter;
 ok(true,'an individual124 annul by the real reviewer panel hands over only run+decision; P rebuilds the exact draft, the third preparer keeps403 and the separate epoch adds exactly two liquidation events');
 // Two separate ordinary, unsaved captures exercise the COMPLETE inventory:
 // another creator and the receiver. These are explicit synthetic fixture
 // writes, not a side effect of preparing a date or receiving a GET response.
 for(const name of['creator2','receiver']){
  const boot=await run(name,'bootstrap',{contractVersion:'2'}),pendingBody={version:'own-payroll-run-command.v2',...query,liquidationDate:dates[0],selection:all(),scopeVersion:boot.scopeVersion,programVersion:boot.programVersion,populationDomain:'native_registered'},key=randomUUID();
  const result=await db.query('SELECT public.own_run_capture_v1($1::jsonb,$2::jsonb,$3::uuid,$4::text) AS result',[JSON.stringify(employeeContext(accesses[name].principal,accesses[name].session)),JSON.stringify(pendingBody),key,ownRunAlgorithmHash()]);
  const pending=result[0].result;assert.equal(pending.saved,null);assert.equal(pending.key,key);
  const pendingRow=await db.run('SELECT jsonb_build_object(\'captureCount\',(SELECT count(*)::integer FROM own_payroll_run_capture WHERE id='+q(pending.id)+'::uuid),\'resultCount\',(SELECT count(*)::integer FROM own_payroll_run_result WHERE capture_id='+q(pending.id)+'::uuid))');assert.deepEqual(pendingRow,{captureCount:1,resultCount:0});
  const refreshed=await preparation(receipt.id);assert.deepEqual(refreshed.affected,projection.affected);assert.deepEqual(refreshed.runs,projectionPostIndividual124.runs);assert.notEqual(refreshed.sourceStateSha256,previous.sourceStateSha256);assert.notEqual(refreshed.preparationSha256,previous.preparationSha256);
  assert.throws(()=>assertSameOwnAnnulPreparation(previous,refreshed),error=>error.code==='OWN_ANNUL_PREPARATION_CHANGED');
  census=await ledger();assert.equal(census.saved,13);assert.equal(census.captures,14+(name==='receiver'?1:0));measurements.census.push({stage:'pending-'+name,...census});previous=refreshed;
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
 // Distinct negative phase after the real cross-creator reconfirmation. Its
 // result cannot substitute the positive handoffBrowser proof or enable its flag.
 const rejectionBefore=readSnapshot();
 const rejectionBrowser=await verifyOwnAnnulPreparation209BrowserOn190(
  Object.freeze({h,db,qa,readSnapshot,synthetic:true}),
  Object.freeze({sourceId:receipt.id,projection,expectedGroups:ownAnnulPreparationDates(projection),draftDate:dates[0],phase:'current-state-changed',
   actors:{reviewer:{...reviewer,raw:qa.checker,roleKey:'QA_CANONICAL190_REVIEWER'},receiver:{...accesses.receiver,raw:actorPlan.actors.receiver,roleKey:'QA_ANNUL_PREPARER_209'}}}));
 assert.equal(rejectionBrowser.version,'own-annul-preparation209-live190-native-browser.v1');assert.equal(rejectionBrowser.phase,'current-state-changed');
 assert.equal(rejectionBrowser.sourceCommit,h.sourceCommit);assert.equal(rejectionBrowser.major,h.major);assert.equal(rejectionBrowser.passed,true);
 assert.equal(rejectionBrowser.actualSql,true);assert.equal(rejectionBrowser.actualHttp,true);assert.equal(rejectionBrowser.actualBrowser,true);
 assert.equal(rejectionBrowser.currentStateRejectionBrowserProven,true);assert.equal(rejectionBrowser.receiptToPreparationBrowserProven,false);
 assert.equal(rejectionBrowser.pagePosts,0);assert.equal(rejectionBrowser.calculationPosts,0);assert.equal(rejectionBrowser.mutations,0);
 assert.equal(rejectionBrowser.productionWrites,0);assert.equal(rejectionBrowser.paymentExecuted,false);assert.equal(rejectionBrowser.municipalAcceptance,false);
 assert.deepEqual(readSnapshot(),rejectionBefore);
 ok(true,'the real panel reports the current-state rejection as such and keeps the opaque reference without any draft');
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
 const finalCensus=await ledger();assert.equal(finalCensus.captures,15);assert.equal(finalCensus.saved,13);assert.equal(finalCensus.creators,3);assert.ok(finalCensus.liquidationEvents>census.liquidationEvents);assert.equal(finalCensus.closeEvents,census.closeEvents+2);measurements.census.push({stage:'after-real-confirm-close-reopen-annul-history',...finalCensus});
 // The preparation phase ends at an unconfirmed draft, without automatic
 // calculation or sourceReference inside run-command.v2. The separate phase
 // below tests explicit commands with their own current bootstrap and keys.
 const noAutomaticRun=readSnapshot(),renewedDraft=ownAnnulPreparationForDate(finalProjection,dates[0]);assert.equal(renewedDraft.reviewConfirmed,false);assert.deepEqual(renewedDraft.selection,contractsSelection(partitions[0]));assert.deepEqual(readSnapshot(),noAutomaticRun);
 assert.deepEqual(await annul('attempt',{key:receipt.key}),receiptReplay);
 assert.deepEqual((await readDetail(first.id)).capture.saved,firstSaved);assert.deepEqual((await readDetail(second.id)).capture.saved,second.saved);
 assert.deepEqual(await close('group',{id:closed.groupId}),originalGroup);
 const finalIndex=await readIndex();assert.equal(finalIndex.index.length,13);assert.equal(finalIndex.index.reduce((n,row)=>n+row.states.confirmed,0),0);
 const prefixAfter=rowMultiset(h);assertPrefix(prefixBefore,prefixAfter);
 const appended=['own_payroll_run_capture','own_payroll_run_result','own_payroll_liquidation_event','own_payroll_annul_event','own_payroll_close_event'];
 assert.deepEqual(prefixAfter.filter(row=>!appended.includes(row.name)),prefixBefore.filter(row=>!appended.includes(row.name)),'ANNUL209_UNRELATED_ROWS_CHANGED');
 assert.deepEqual(h.json([actorPlan.metadataReadStatement],{readOnly:true,fullJson:true}),metadata);
 const source208=assertOwnAnnulmentReviewV2SourceBookend({h,db,installation:installation208}),source209=assertOwnAnnulPreparation209SourceBookend({h,db,installation:installation209});
 assert.equal(source209.priorBusinessRowsRecompared,false);
 ok(true,'original immutable captures, receipts, preexisting rows and reopened close survive complete209 native preparation tests');

 // SEPARATE POST-DRAFT PHASE. Every preceding209 check remains above, including
 // original12/12 epoch plus the explicit R2 capture: captures15/saved13 and index13. These calls model two new explicit synthetic
 // calculate actions; neither GET nor applying a draft invokes a calculation.
 // Same db/run/receiver/programme: no new adapter, SQL, role, host or protocol.
 const recalcBefore=await ledger();assert.deepEqual(recalcBefore,finalCensus);
 const recalcPrefixBefore=rowMultiset(h),recalculated=[],recalculationMeasurements=[];
 let preparedBeforeCalculation=finalProjection;
 for(let n=0;n<dates.length;n++){
  const fresh=await preparation(receipt.id);
  assert.deepEqual(fresh.affected,finalProjection.affected);assert.deepEqual(fresh.dateGroups,finalProjection.dateGroups);
  if(n===0)assertSameOwnAnnulPreparation(finalProjection,fresh);
  else{
   assert.notEqual(fresh.sourceStateSha256,preparedBeforeCalculation.sourceStateSha256);
   assert.throws(()=>assertSameOwnAnnulPreparation(preparedBeforeCalculation,fresh),error=>error.code==='OWN_ANNUL_PREPARATION_CHANGED');
  }
  const noDraftEffect=readSnapshot(),draft=ownAnnulPreparationForDate(fresh,dates[n]);assert.equal(draft.reviewConfirmed,false);
  assert.deepEqual(draft.selection,contractsSelection(partitions[n]));assert.equal(draft.affected.length,partitions[n].length);
  assert.deepEqual(readSnapshot(),noDraftEffect);
  const boot=await run('receiver','bootstrap',{contractVersion:'2'});assert.equal(boot.version,'own-payroll-bootstrap.v2');assert.equal(boot.canCalculate,true);
  assert.equal(boot.scopeVersion,draft.scopeVersion);assert.equal(boot.programVersion,bootstraps.receiver.programVersion);
  const key=randomUUID();assert.ok(!boot.runs.some(row=>row.key===key));assert.notEqual(key,receipt.key);
  const command={version:'own-payroll-run-command.v2',period:draft.period,liquidationType:draft.liquidationType,liquidationDate:draft.liquidationDate,selection:draft.selection,scopeVersion:boot.scopeVersion,programVersion:boot.programVersion,populationDomain:'native_registered'};
  assert.equal(Object.hasOwn(command,'sourceReference'),false);assert.equal(Object.hasOwn(command,'reviewConfirmed'),false);
  // This invocation is the separate explicit action, using the current command.
  const capture=await run('receiver','calculate',{key,body:command});
  assert.equal(capture.replayed,false);assert.equal(capture.key,key);assert.deepEqual(capture.body,command);assert.ok(!finalIndex.index.some(row=>row.id===capture.id));
  assert.ok(capture.saved);assert.equal(capture.saved.result.payrollCalculated,true);assert.equal(capture.saved.result.paymentExecuted,false);
  assert.equal(capture.saved.result.employeeCount,partitions[n].length);assert.equal(capture.saved.result.rowCount,partitions[n].length*20);
  assert.deepEqual(capture.saved.input.employees.map(row=>row.contractId).sort(),partitions[n]);assert.deepEqual(capture.saved.input.rules,definition.rules);
  assert.equal(capture.saved.inputSha256,ownRunHash(capture.saved.input));assert.equal(capture.saved.resultSha256,ownRunHash(capture.saved.result));
  const selected=new Set(partitions[n]);assert.deepEqual(capture.saved.result.rows,firstSaved.result.rows.filter(row=>selected.has(row.contractId)));assert.deepEqual(capture.saved.result.employeeTotals,firstSaved.result.employeeTotals.filter(row=>selected.has(row.contractId)));
  assert.ok(bytes(capture)<=FULL);
  const savedState=readSnapshot(),savedLedger=await ledger();assert.equal(savedLedger.captures,recalcBefore.captures+n+1);assert.equal(savedLedger.saved,recalcBefore.saved+n+1);
  assert.equal(savedLedger.liquidationEvents,recalcBefore.liquidationEvents);assert.equal(savedLedger.closeEvents,recalcBefore.closeEvents);assert.equal(savedLedger.creators,recalcBefore.creators);
  const storedIdentity=value=>{
   assert.equal(value.replayed,true);
   for(const field of['version','id','key','bodySha256','payloadSha256','algorithmSha256','createdAt'])assert.equal(value[field],capture[field]);
   assert.deepEqual(value.body,capture.body);assert.ok(value.saved);
   for(const field of['version','id','algorithmSha256','inputSha256','resultSha256','recordedAt'])assert.equal(value.saved[field],capture.saved[field]);
   assert.deepEqual(value.saved.input,capture.saved.input);assert.deepEqual(value.saved.result,capture.saved.result);
  };
  const recovered=await run('receiver','attempt',{key});storedIdentity(recovered);
  assert.deepEqual(readSnapshot(),savedState);assert.deepEqual(await ledger(),savedLedger);
  const replayed=await run('receiver','calculate',{key,body:command});storedIdentity(replayed);
  assert.deepEqual(readSnapshot(),savedState);assert.deepEqual(await ledger(),savedLedger);
  recalculationMeasurements.push({date:dates[n],employeeCount:capture.saved.result.employeeCount,conceptRows:capture.saved.result.rowCount,bytes:bytes(capture),inputSha256:capture.saved.inputSha256,resultSha256:capture.saved.resultSha256,recoveredIdentityAndHashesExact:true,replayedIdentityAndHashesExact:true,recoveryAndReplayAddedRows:0});
  recalculated.push(capture);preparedBeforeCalculation=fresh;
 }
 assert.equal(recalculated.length,2);assert.notEqual(recalculated[0].id,recalculated[1].id);assert.notEqual(recalculated[0].key,recalculated[1].key);
 const recalculatedIds=recalculated.flatMap(capture=>capture.saved.input.employees.map(row=>row.contractId));assert.equal(new Set(recalculatedIds).size,855);assert.deepEqual([...recalculatedIds].sort(),contracts);
 assert.equal(recalculated.reduce((count,capture)=>count+capture.saved.result.rowCount,0),17100);
 const recalcAfter=await ledger();assert.deepEqual(recalcAfter,{...recalcBefore,captures:17,saved:15});
 const recalcIndex=await readIndex();assert.equal(recalcIndex.index.length,15);assert.equal(recalcIndex.index.reduce((count,row)=>count+row.states.confirmed,0),0);
 for(const capture of recalculated){const row=recalcIndex.index.find(value=>value.id===capture.id);assert.ok(row);assert.equal(row.resultSha256,capture.saved.resultSha256);assert.deepEqual(row.states,{calculated:capture.saved.result.employeeCount,confirmed:0,annulled:0,cancelled:0});}
 const afterRecalculation=await preparation(receipt.id);assert.deepEqual(afterRecalculation.affected,finalProjection.affected);assert.deepEqual(afterRecalculation.dateGroups,finalProjection.dateGroups);assert.notEqual(afterRecalculation.sourceStateSha256,preparedBeforeCalculation.sourceStateSha256);
 assert.deepEqual(await annul('attempt',{key:receipt.key}),receiptReplay);
 assert.deepEqual((await readDetail(first.id)).capture.saved,firstSaved);assert.deepEqual((await readDetail(second.id)).capture.saved,second.saved);assert.deepEqual(await close('group',{id:closed.groupId}),originalGroup);
 const recalcPrefixAfter=rowMultiset(h);assertPrefix(recalcPrefixBefore,recalcPrefixAfter);
 const calculationOnly=['own_payroll_run_capture','own_payroll_run_result'];assert.deepEqual(recalcPrefixAfter.filter(row=>!calculationOnly.includes(row.name)),recalcPrefixBefore.filter(row=>!calculationOnly.includes(row.name)),'ANNUL209_RECALC_CHANGED_OTHER_LEDGER_OR_IAM');
 const recalculationSource208=assertOwnAnnulmentReviewV2SourceBookend({h,db,installation:installation208}),recalculationSource209=assertOwnAnnulPreparation209SourceBookend({h,db,installation:installation209});assert.equal(recalculationSource209.priorBusinessRowsRecompared,false);
 const postPreparationRecalculation={version:'own-annul-preparation-explicit-recalculation.v1',passed:true,dates:[...dates],partitions:[285,570],populationUnion:855,conceptRowsUnion:17100,addedCaptures:2,addedSavedResults:2,addedLiquidationDecisions:0,addedCloseEvents:0,before:recalcBefore,after:recalcAfter,measurements:recalculationMeasurements,fresh209ReadAfterFirstCapture:true,recoveryAndReplayAddedRows:0,previousRowsPreserved:true,source208:recalculationSource208,source209:recalculationSource209,actualSql:true,actualCalculationService:true,actualCalculationApiHandler:false,actualHttp:false,actualBrowser:false,atomicGetToCalculation:false,durableReceiptLinkCreated:false,receiptLinkedRecalculationExecuted:false,automaticRecalculation:false,monthlyBusinessCovered:false,synthetic:true,productionWrites:0,paymentExecuted:false,municipalAcceptance:false};
 ok(true,'two separate explicit current commands save285/570 after209 drafts, recover and replay exactly, and preserve all originals');

 // SEPARATE POST-RECALCULATION PHASE. All preceding calculated/confirmed0
 // assertions and postPreparationRecalculation remain literal evidence above.
 // Reuse the independent checker and current services; no new actor authority.
 for(const capability of['payroll.calculation.approve','payroll.calculation.close'])assert.ok(reviewer.principal.tenant.effectiveCapabilities.includes(capability),'ANNUL209_CONFIRM_CLOSE_CHECKER_CAPABILITY_REQUIRED:'+capability);
 assert.ok(!reviewer.principal.tenant.effectiveCapabilities.includes('payroll.calculation.prepare'));
 const checkerContext=employeeContext(reviewer.principal,reviewer.session),receiverContext=employeeContext(accesses.receiver.principal,accesses.receiver.session);
 assert.notEqual(checkerContext.membershipId,receiverContext.membershipId);assert.notEqual(checkerContext.actorEmail,receiverContext.actorEmail);
 // Person identities come from the existing verified seed/proof, not employeeContext.
 const checkerPersonId=qa.ids.checkerPerson,receiverPersonId=actorProof.actors.find(row=>row.name==='receiver')?.personId;
 for(const personId of[checkerPersonId,receiverPersonId])assert.match(personId,/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
 assert.notEqual(checkerPersonId,receiverPersonId);
 const confirmCloseBefore=await ledger();assert.deepEqual(confirmCloseBefore,recalcAfter);
 const confirmClosePrefixBefore=rowMultiset(h),newRunIds=new Set(recalculated.map(capture=>capture.id)),confirmationReceipts=[],confirmationMeasurements=[];let departmentConfirmationBrowser=null;
 assert.equal(newRunIds.size,2);
 // A global current-state fingerprint may legitimately change. Compare the
 // historical run states and immutable source references without freezing it.
 const historicalReference=row=>({id:row.id,bodySha256:row.bodySha256,payloadSha256:row.payloadSha256,inputSha256:row.inputSha256,resultSha256:row.resultSha256,algorithmSha256:row.algorithmSha256,employeeCount:row.employeeCount,conceptRowCount:row.conceptRowCount,totalsPrecision:row.totalsPrecision,createdAt:row.createdAt,liquidationDate:row.liquidationDate,states:row.states,confirmedContractIds:row.confirmedContractIds});
 const historicalReferences=recalcIndex.index.filter(row=>!newRunIds.has(row.id)).map(historicalReference);
 const preserveHistoricalRuns=async()=>{const current=await readIndex();assert.equal(current.index.length,15);assert.deepEqual(current.index.filter(row=>!newRunIds.has(row.id)).map(historicalReference),historicalReferences);return current;};
 for(let n=0;n<recalculated.length;n++){
  const capture=recalculated[n],detail=await readDetail(capture.id);assert.deepEqual(detail.capture.saved,capture.saved);
  assert.deepEqual(detail.employees.map(row=>row.contractId).sort(),partitions[n]);assert.ok(detail.employees.every(row=>row.state==='calculated'&&row.allowedCommands.includes('confirm')));
  const detailBytes=bytes(detail);assert.ok(detailBytes<=FULL);
  // R2 substitutes the ONE scheduled confirmation of the legitimate285-person
  // calculated/unblocked capture in department1. It adds no capture or event.
  if(n===0){departmentConfirmationBrowser=await verifyOwnDepartmentConfirmationOn190(Object.freeze({h,db,qa,readSnapshot,readLedger:ledger,synthetic:true}),Object.freeze({run:capture,actors:{reviewer:decisionActors.reviewer,creator:decisionActors.receiver},reason}));assert.equal(departmentConfirmationBrowser.positiveDepartmentConfirmationProven,true);assert.equal(departmentConfirmationBrowser.addedLiquidationDecisions,1);assert.equal(departmentConfirmationBrowser.addedCaptures,0);assert.equal(departmentConfirmationBrowser.addedSavedResults,0);assert.equal(departmentConfirmationBrowser.recoveryAddedRows,0);}
  const decision=n===0?departmentConfirmationBrowser.receipt:await confirm(capture,partitions[n]);assert.equal(decision.replayed,false);assert.equal(decision.runId,capture.id);assert.equal(decision.resultSha256,capture.saved.resultSha256);
  assert.equal(decision.body.command,'confirm');assert.deepEqual(decision.body.selection,n===0?{kind:'departments',values:['1']}:contractsSelection(partitions[n]));assert.equal(decision.body.reviewConfirmed,true);
  assert.equal(decision.bodySha256,ownRunHash(decision.body));assert.deepEqual(decision.affected.map(row=>row.contractId).sort(),partitions[n]);assert.ok(decision.affected.every(row=>row.state==='confirmed'));
  assert.ok(!confirmationReceipts.some(row=>row.id===decision.id||row.key===decision.key));assert.notEqual(decision.key,receipt.key);assert.ok(!recalculated.some(row=>row.key===decision.key));assert.ok(bytes(decision)<=FULL);
  const decidedSnapshot=readSnapshot(),decidedLedger=await ledger();assert.deepEqual(decidedLedger,{...confirmCloseBefore,liquidationEvents:confirmCloseBefore.liquidationEvents+n+1});
  const decisionIdentity=value=>{assert.equal(value.replayed,true);for(const field of['version','id','key','bodySha256','runId','resultSha256','recordedAt'])assert.equal(value[field],decision[field]);assert.deepEqual(value.body,decision.body);assert.deepEqual(value.affected,decision.affected);};
  const recovered=await liq('attempt',{key:decision.key});decisionIdentity(recovered);assert.deepEqual(readSnapshot(),decidedSnapshot);assert.deepEqual(await ledger(),decidedLedger);
  const replayed=await liq('command',{key:decision.key,body:decision.body});decisionIdentity(replayed);assert.deepEqual(readSnapshot(),decidedSnapshot);assert.deepEqual(await ledger(),decidedLedger);
  const confirmedDetail=await readDetail(capture.id);assert.deepEqual(confirmedDetail.capture.saved,capture.saved);assert.ok(confirmedDetail.employees.every(row=>row.state==='confirmed'));
  for(const employee of confirmedDetail.employees){const affected=decision.affected.find(row=>row.contractId===employee.contractId);assert.equal(employee.version,affected.version);assert.equal(employee.liquidationVersion,affected.liquidationVersion);}
  await preserveHistoricalRuns();confirmationReceipts.push(decision);confirmationMeasurements.push({runId:capture.id,date:capture.body.liquidationDate,employeeCount:decision.affected.length,detailBytes,receiptBytes:bytes(decision),recoveryBytes:bytes(recovered),replayBytes:bytes(replayed),recoveryAndReplayAddedRows:0,storedIdentityAndHashesExact:true});
 }
 const confirmedIndex=await preserveHistoricalRuns();assert.equal(confirmedIndex.index.reduce((count,row)=>count+row.states.confirmed,0),855);
 for(const capture of recalculated){const row=confirmedIndex.index.find(value=>value.id===capture.id);assert.deepEqual(row.states,{calculated:0,confirmed:capture.saved.result.employeeCount,annulled:0,cancelled:0});assert.deepEqual(row.confirmedContractIds,capture.saved.input.employees.map(employee=>employee.contractId).sort());}
 const confirmationIds=new Set(confirmationReceipts.map(row=>row.id));assert.equal(confirmationIds.size,2);
 assert.deepEqual(confirmedIndex.liquidationHistory.filter(row=>!confirmationIds.has(row.id)),recalcIndex.liquidationHistory);
 assert.deepEqual(confirmedIndex.closeHistory,recalcIndex.closeHistory);assert.deepEqual(confirmedIndex.closed,recalcIndex.closed);
 for(const decision of confirmationReceipts)assert.deepEqual(confirmedIndex.liquidationHistory.find(row=>row.id===decision.id),{id:decision.id,runId:decision.runId,bodySha256:decision.bodySha256});
 await sameStateReject(()=>preparation(receipt.id),error=>error.code==='OWN_ANNUL_PREPARATION_CURRENT_STATE_CHANGED'&&error.status===409,'original209 preparation rejects the newly confirmed global state without a write');
 // SEPARATE POSITIVE AGREEMENT PHASE. The original confirmations retain their
 // exact +2 events and index15 above. Capture0's complete285 convenio1 is now
 // confirmed and unclosed. SQL124 cannot confirm an annulled source again:
 // explicitly calculate a NEW285 capture, then confirm it independently.
 const agreementBefore=await ledger(),agreementPrefixBefore=rowMultiset(h);assert.deepEqual(agreementBefore,{...confirmCloseBefore,liquidationEvents:confirmCloseBefore.liquidationEvents+2});
 const agreementOriginalDetail=await readDetail(recalculated[0].id);assert.equal(agreementOriginalDetail.employees.length,285);assert.ok(agreementOriginalDetail.employees.every(row=>row.state==='confirmed'&&row.blockedBy===null&&row.allowedCommands.includes('annul')));
 const agreementAnnulmentBrowser=await verifyOwnAgreementAnnulmentRecoveryOn190(Object.freeze({h,db,qa,readSnapshot,readLedger:ledger,synthetic:true}),Object.freeze({run:recalculated[0],detailBefore:agreementOriginalDetail,actors:{reviewer:decisionActors.reviewer,creator:decisionActors.receiver},reason}));
 assert.equal(agreementAnnulmentBrowser.version,'own-agreement-annulment-loss-before-live190-browser.v1');assert.equal(agreementAnnulmentBrowser.passed,true);assert.equal(agreementAnnulmentBrowser.positiveAgreementAnnulmentProven,true);assert.equal(agreementAnnulmentBrowser.lostBeforeSqlRecovered,true);assert.equal(agreementAnnulmentBrowser.originalBodyAndKeyRetained,true);
 assert.equal(agreementAnnulmentBrowser.population,285);assert.equal(agreementAnnulmentBrowser.reviewPages,12);assert.equal(agreementAnnulmentBrowser.pagePosts,2);assert.equal(agreementAnnulmentBrowser.decisionRpcAttempts,2);assert.equal(agreementAnnulmentBrowser.decisionRpcReachedSql,1);assert.equal(agreementAnnulmentBrowser.addedLiquidationDecisions,1);assert.equal(agreementAnnulmentBrowser.addedCaptures,0);assert.equal(agreementAnnulmentBrowser.addedSavedResults,0);assert.equal(agreementAnnulmentBrowser.addedCloseEvents,0);
 assert.deepEqual(agreementAnnulmentBrowser.captureReference,{id:recalculated[0].id,bodySha256:recalculated[0].bodySha256,payloadSha256:recalculated[0].payloadSha256,inputSha256:recalculated[0].saved.inputSha256,resultSha256:recalculated[0].saved.resultSha256,employeeCount:285,rowCount:5700});
 const agreementAnnulled=agreementAnnulmentBrowser.receipt;assert.deepEqual(agreementAnnulmentBrowser.decisionReference,{id:agreementAnnulled.id,bodySha256:agreementAnnulled.bodySha256,runId:agreementAnnulled.runId,resultSha256:agreementAnnulled.resultSha256,affectedCount:agreementAnnulled.affected.length});assert.equal(agreementAnnulled.replayed,false);assert.equal(agreementAnnulled.runId,recalculated[0].id);assert.equal(agreementAnnulled.body.command,'annul');assert.deepEqual(agreementAnnulled.body.selection,{kind:'agreements',values:['1']});assert.deepEqual(agreementAnnulled.affected.map(row=>row.contractId).sort(),partitions[0]);
 const initialConfirmationById=new Map(confirmationReceipts[0].affected.map(row=>[row.contractId,row]));for(const row of agreementAnnulled.affected){const prior=initialConfirmationById.get(row.contractId);assert.ok(prior);assert.equal(row.state,'annulled');assert.equal(row.version,prior.version+1);assert.equal(row.liquidationVersion,prior.liquidationVersion);}
 const agreementAfterAnnul=await ledger();assert.deepEqual(agreementAfterAnnul,{...agreementBefore,liquidationEvents:agreementBefore.liquidationEvents+1});
 const agreementAnnulledDetail=await readDetail(recalculated[0].id);assert.deepEqual(agreementAnnulledDetail.capture.saved,recalculated[0].saved);assert.ok(agreementAnnulledDetail.employees.every(row=>row.state==='annulled'&&!row.allowedCommands.includes('confirm')),'ANNULLED_SOURCE_CANNOT_BE_RECONFIRMED');
 const replacementBootstrap=await run('receiver','bootstrap',{contractVersion:'2'});assert.equal(replacementBootstrap.canCalculate,true);assert.equal(replacementBootstrap.programVersion,bootstraps.receiver.programVersion);
 const replacementBody={version:'own-payroll-run-command.v2',...query,liquidationDate:dates[0],selection:contractsSelection(partitions[0]),scopeVersion:replacementBootstrap.scopeVersion,programVersion:replacementBootstrap.programVersion,populationDomain:'native_registered'},replacementKey=randomUUID();
 assert.ok(!replacementBootstrap.runs.some(row=>row.key===replacementKey));assert.equal(Object.hasOwn(replacementBody,'sourceReference'),false);
 const agreementReplacement=await run('receiver','calculate',{key:replacementKey,body:replacementBody});assert.equal(agreementReplacement.replayed,false);assert.equal(agreementReplacement.key,replacementKey);assert.deepEqual(agreementReplacement.body,replacementBody);assert.ok(agreementReplacement.saved);assert.equal(agreementReplacement.saved.result.employeeCount,285);assert.equal(agreementReplacement.saved.result.rowCount,5700);assert.deepEqual(agreementReplacement.saved.input.employees.map(row=>row.contractId).sort(),partitions[0]);assert.deepEqual(agreementReplacement.saved.input.rules,definition.rules);assert.deepEqual(agreementReplacement.saved.result.rows,recalculated[0].saved.result.rows);assert.deepEqual(agreementReplacement.saved.result.employeeTotals,recalculated[0].saved.result.employeeTotals);
 assert.ok(!recalcIndex.index.some(row=>row.id===agreementReplacement.id));assert.ok(!newRunIds.has(agreementReplacement.id));assert.equal(agreementReplacement.saved.inputSha256,ownRunHash(agreementReplacement.saved.input));assert.equal(agreementReplacement.saved.resultSha256,ownRunHash(agreementReplacement.saved.result));
 const agreementAfterCalculation=await ledger();assert.deepEqual(agreementAfterCalculation,{...agreementAfterAnnul,captures:18,saved:16});assert.equal(agreementAfterCalculation.creators,3);
 const replacementCalculatedDetail=await readDetail(agreementReplacement.id);assert.ok(replacementCalculatedDetail.employees.every(row=>row.state==='calculated'&&row.blockedBy===null&&row.allowedCommands.includes('confirm')));
 const replacementConfirmation=await confirm(agreementReplacement,partitions[0]);assert.equal(replacementConfirmation.replayed,false);assert.equal(replacementConfirmation.body.command,'confirm');assert.equal(replacementConfirmation.runId,agreementReplacement.id);assert.equal(replacementConfirmation.resultSha256,agreementReplacement.saved.resultSha256);assert.deepEqual(replacementConfirmation.affected.map(row=>row.contractId).sort(),partitions[0]);
 for(const row of replacementConfirmation.affected){const calculated=replacementCalculatedDetail.employees.find(value=>value.contractId===row.contractId),prior=initialConfirmationById.get(row.contractId);assert.equal(row.state,'confirmed');assert.equal(row.version,calculated.version+1);assert.equal(row.liquidationVersion,prior.liquidationVersion+1);}
 const agreementAfter=await ledger();assert.deepEqual(agreementAfter,{...agreementBefore,captures:18,saved:16,liquidationEvents:agreementBefore.liquidationEvents+2});
 const replacementSnapshot=readSnapshot();assert.deepEqual(await run('receiver','attempt',{key:replacementKey}),{...agreementReplacement,replayed:true});assert.deepEqual(await liq('attempt',{key:replacementConfirmation.key}),{...replacementConfirmation,replayed:true});assert.deepEqual(await liq('attempt',{key:agreementAnnulled.key}),{...agreementAnnulled,replayed:true});assert.deepEqual(readSnapshot(),replacementSnapshot);assert.deepEqual(await ledger(),agreementAfter);
 const activeCloseCaptures=[agreementReplacement,recalculated[1]],activeConfirmationReceipts=[replacementConfirmation,confirmationReceipts[1]],activeRunIds=new Set(activeCloseCaptures.map(capture=>capture.id));assert.equal(activeRunIds.size,2);
 const agreementPhaseRuns=new Set([...newRunIds,agreementReplacement.id]);assert.equal(agreementPhaseRuns.size,3);
 const retiredAgreementReference=historicalReference((await readIndex()).index.find(row=>row.id===recalculated[0].id));assert.deepEqual(retiredAgreementReference.states,{calculated:0,confirmed:0,annulled:285,cancelled:0});assert.deepEqual(retiredAgreementReference.confirmedContractIds,[]);
 const preserveAfterAgreementHistory=async()=>{const current=await readIndex();assert.equal(current.index.length,16);assert.deepEqual(current.index.filter(row=>!agreementPhaseRuns.has(row.id)).map(historicalReference),historicalReferences);assert.deepEqual(historicalReference(current.index.find(row=>row.id===recalculated[0].id)),retiredAgreementReference);return current;};
 const activeConfirmedIndex=await preserveAfterAgreementHistory();assert.equal(activeConfirmedIndex.index.reduce((count,row)=>count+row.states.confirmed,0),855);for(const capture of activeCloseCaptures){const row=activeConfirmedIndex.index.find(value=>value.id===capture.id);assert.deepEqual(row.states,{calculated:0,confirmed:capture.saved.result.employeeCount,annulled:0,cancelled:0});assert.deepEqual(row.confirmedContractIds,capture.saved.input.employees.map(employee=>employee.contractId).sort());}
 const agreementNewEvents=new Set([agreementAnnulled.id,replacementConfirmation.id]);assert.equal(agreementNewEvents.size,2);assert.deepEqual(activeConfirmedIndex.liquidationHistory.filter(row=>!agreementNewEvents.has(row.id)),confirmedIndex.liquidationHistory);assert.deepEqual(activeConfirmedIndex.closeHistory,confirmedIndex.closeHistory);assert.deepEqual(activeConfirmedIndex.closed,confirmedIndex.closed);
 const agreementPrefixAfter=rowMultiset(h);assertPrefix(agreementPrefixBefore,agreementPrefixAfter);const agreementChangedTables=['own_payroll_run_capture','own_payroll_run_result','own_payroll_liquidation_event'];assert.deepEqual(agreementPrefixAfter.filter(row=>!agreementChangedTables.includes(row.name)),agreementPrefixBefore.filter(row=>!agreementChangedTables.includes(row.name)),'AGREEMENT190_CHANGED_OTHER_LEDGER_OR_IAM');
 assert.deepEqual((await readDetail(recalculated[0].id)).capture.saved,recalculated[0].saved);const retiredCurrentDetail=await readDetail(recalculated[0].id),retiredState=row=>({contractId:row.contractId,state:row.state,version:row.version,liquidationVersion:row.liquidationVersion,events:row.events});assert.deepEqual(retiredCurrentDetail.employees.map(retiredState),agreementAnnulledDetail.employees.map(retiredState));assert.ok(retiredCurrentDetail.employees.every(row=>row.blockedBy===agreementReplacement.id));assert.deepEqual((await readDetail(recalculated[1].id)).capture.saved,recalculated[1].saved);
 const agreementAnnulmentContinuation={version:'own-agreement-annulment-explicit-restoration190.v1',passed:true,before:agreementBefore,afterAnnul:agreementAfterAnnul,afterCalculation:agreementAfterCalculation,after:agreementAfter,agreementCode:'1',population:285,conceptRows:5700,addedCaptures:1,addedSavedResults:1,addedLiquidationDecisions:2,addedConsolidatedAnnulments:0,addedCloseEvents:0,recoveryAddedRows:0,initialConfirmationDecisionsPreserved:2,retiredRunId:recalculated[0].id,replacementRunId:agreementReplacement.id,replacementResultSha256:agreementReplacement.saved.resultSha256,replacementConfirmedVersions:replacementConfirmation.affected.map(row=>({contractId:row.contractId,version:row.version,liquidationVersion:row.liquidationVersion})),activeSourceRunIds:[...activeRunIds].sort(),sourceSavedBytesPreserved:true,historicalThirteenRunsPreserved:true,annulledSourceReconfirmationRejectedByCurrentContract:true,browser:agreementAnnulmentBrowser,replacementCalculationService:true,replacementCalculationBrowser:false,replacementConfirmationService:true,replacementConfirmationBrowser:false,synthetic:true,productionWrites:0,paymentExecuted:false,municipalAcceptance:false};
 measurements.census.push({stage:'after-positive-agreement-annul-replacement',...agreementAfter});
 ok(true,'a complete convenio285 annul survives loss-before-SQL and GET recovery; one explicit new285 calculation and independent confirmation restore855, adding one saved capture and exactly two decisions');
 // SEPARATE BLOCKED124 READ PHASE. The two existing recalculation confirmations
 // above contribute +4 including agreement annul/replacement; this view sends no command.
 const blockedDetail=await readDetail(captures[0].id);
 for(const id of decisionIds)assert.equal(blockedDetail.employees.find(row=>row.contractId===id).blockedBy,recalculated[1].id);
 assert.throws(()=>ownLiquidationDecisionPreparation(blockedDetail,decisionReceipt.id),/otra liquidación confirmada/);
 const blockedBefore=readSnapshot();
 const blockedBrowser=await verifyOwnLiquidationDecision124BrowserOn190(Object.freeze({h,db,qa,readSnapshot,synthetic:true}),Object.freeze({run:captures[0],contractIds:decisionIds,actors:decisionActors,reason,phase:'blocked',decisionId:decisionReceipt.id}));
 assert.equal(blockedBrowser.version,'own-liquidation-decision124-live190-native-browser.v1');assert.equal(blockedBrowser.phase,'blocked');assert.equal(blockedBrowser.passed,true);
 assert.equal(blockedBrowser.sourceCommit,h.sourceCommit);assert.equal(blockedBrowser.major,h.major);assert.equal(blockedBrowser.actualSql,true);assert.equal(blockedBrowser.actualHttp,true);assert.equal(blockedBrowser.actualBrowser,true);
 assert.equal(blockedBrowser.blockedDecisionBrowserProven,true);assert.equal(blockedBrowser.individualDecisionBrowserProven,false);assert.equal(blockedBrowser.receiverForbidden,true);assert.equal(blockedBrowser.affected,decisionIds.length);
 assert.equal(blockedBrowser.mutations,0);assert.equal(blockedBrowser.pagePosts,0);assert.equal(blockedBrowser.calculationPosts,0);assert.equal(blockedBrowser.decisionPosts,0);
 assert.equal(blockedBrowser.productionWrites,0);assert.equal(blockedBrowser.paymentExecuted,false);assert.equal(blockedBrowser.municipalAcceptance,false);
 assert.deepEqual(readSnapshot(),blockedBefore);assert.deepEqual(await ledger(),agreementAfter);
 ok(true,'a later confirmed liquidation elsewhere blocks the whole individual124 decision in the real panel without a write');
 const closeDetail=await close('detail',query),closeDetailBytes=bytes(closeDetail);assert.ok(closeDetailBytes<=FULL);
 assert.equal(closeDetail.rows.length,855);assert.deepEqual(closeDetail.rows.map(row=>row.contractId).sort(),contracts);assert.ok(closeDetail.rows.every(row=>row.state==='confirmed'&&row.canClose&&activeRunIds.has(row.runId)));
 const sourceByContract=new Map(activeCloseCaptures.flatMap(capture=>capture.saved.input.employees.map(employee=>[employee.contractId,capture])));
 for(const row of closeDetail.rows){const capture=sourceByContract.get(row.contractId);assert.equal(row.runId,capture.id);assert.equal(row.resultSha256,capture.saved.resultSha256);assert.deepEqual(closeDetail.captures.find(value=>value.id===row.runId).saved,capture.saved);}
 let legacyDetailRejected=false;
 if(closeDetailBytes>FOUR){await sameStateReject(()=>close('detail',query,false),error=>error.code==='OWN_CLOSE_LIMIT'&&error.status===422,'legacy close detail rejects the measured whole source above4MiB');legacyDetailRejected=true;}
 const closeBody={...query,scopeVersion:closeDetail.scopeVersion,stateVersion:closeDetail.stateVersion,selection:contractsSelection(contracts),command:'close',groupId:null,reason,reviewConfirmed:true},closeKey=randomUUID();
 assert.notEqual(closeKey,receipt.key);assert.ok(!confirmationReceipts.some(row=>row.key===closeKey));assert.ok(!recalculated.some(row=>row.key===closeKey));
 const closedRecalculation=await close('command',{key:closeKey,body:closeBody});assert.equal(closedRecalculation.replayed,false);assert.equal(closedRecalculation.key,closeKey);assert.deepEqual(closedRecalculation.body,closeBody);assert.notEqual(closedRecalculation.groupId,closed.groupId);
 assert.equal(closedRecalculation.bodySha256,ownRunHash(closeBody));assert.equal(closedRecalculation.snapshotSha256,ownRunHash(closedRecalculation.snapshot));assert.ok(bytes(closedRecalculation)<=FULL);
 const snapshot=closedRecalculation.snapshot;assert.equal(snapshot.employeeCount,855);assert.equal(snapshot.populationCount,855);assert.equal(snapshot.populationComplete,true);assert.equal(snapshot.conceptCount,17100);assert.equal(snapshot.payrollCalculated,true);assert.equal(snapshot.payrollPosted,false);assert.equal(snapshot.paymentExecuted,false);assert.deepEqual(snapshot.selection,closeBody.selection);
 assert.deepEqual(snapshot.employees.map(row=>row.contractId).sort(),contracts);assert.deepEqual([...new Set(snapshot.employees.map(row=>row.runId))].sort(),[...activeRunIds].sort());
 assert.deepEqual(snapshot.totals,closed.snapshot.totals);
 const expectedConcepts=contracts.flatMap(id=>sourceByContract.get(id).saved.result.rows.filter(row=>row.contractId===id));assert.deepEqual(snapshot.concepts,expectedConcepts);
 const confirmedByContract=new Map(activeConfirmationReceipts.flatMap(decision=>decision.affected.map(row=>[row.contractId,row])));
 for(const employee of snapshot.employees){const capture=sourceByContract.get(employee.contractId),person=capture.saved.input.employees.find(row=>row.contractId===employee.contractId),total=capture.saved.result.employeeTotals.find(row=>row.contractId===employee.contractId);assert.equal(employee.runId,capture.id);assert.equal(employee.inputSha256,capture.saved.inputSha256);assert.equal(employee.resultSha256,capture.saved.resultSha256);assert.equal(employee.liquidationVersion,confirmedByContract.get(employee.contractId).liquidationVersion);assert.equal(employee.precision,capture.saved.input.totalsPrecision);assert.equal(employee.conceptCount,capture.saved.result.rows.filter(row=>row.contractId===employee.contractId).length);assert.deepEqual(employee.totals,total);for(const field of['employeeNumber','agreementCode','departmentCode'])assert.equal(employee[field],person[field]);}
 const closedSnapshot=readSnapshot(),closedLedger=await ledger();assert.deepEqual(closedLedger,{...agreementAfter,closeEvents:agreementAfter.closeEvents+1});
 const closeIdentity=value=>{assert.equal(value.replayed,true);for(const field of['version','id','key','bodySha256','groupId','snapshotSha256','recordedAt'])assert.equal(value[field],closedRecalculation[field]);assert.deepEqual(value.body,closedRecalculation.body);assert.deepEqual(value.snapshot,snapshot);};
 const closeRecoveryMeasurements=[];let legacyReceiptRejections=0;
 for(const[operation,input]of[['group',{id:closedRecalculation.groupId}],['attempt',{key:closeKey}],['command',{key:closeKey,body:closeBody}]]){
  const value=await close(operation,input);closeIdentity(value);assert.deepEqual(readSnapshot(),closedSnapshot);assert.deepEqual(await ledger(),closedLedger);closeRecoveryMeasurements.push({operation,bytes:bytes(value),recoveryAndReplayAddedRows:0,storedIdentityAndHashesExact:true});
  if(bytes(value)>FOUR){await sameStateReject(()=>close(operation,input,false),error=>error.code==='OWN_CLOSE_LIMIT'&&error.status===422,'legacy '+operation+' rejects this measured full receipt without truncation');legacyReceiptRejections++;}
 }
 const closedIndex=await preserveAfterAgreementHistory();assert.deepEqual(closedIndex.index.map(row=>({id:row.id,states:row.states,confirmedContractIds:row.confirmedContractIds})),activeConfirmedIndex.index.map(row=>({id:row.id,states:row.states,confirmedContractIds:row.confirmedContractIds})));assert.deepEqual(closedIndex.liquidationHistory,activeConfirmedIndex.liquidationHistory);
 assert.deepEqual(closedIndex.closeHistory.filter(row=>row.id!==closedRecalculation.id),activeConfirmedIndex.closeHistory);assert.deepEqual(closedIndex.closeHistory.find(row=>row.id===closedRecalculation.id),{id:closedRecalculation.id,bodySha256:closedRecalculation.bodySha256,snapshotSha256:closedRecalculation.snapshotSha256});
 const newClosedReferences=contracts.map(contractId=>({runId:sourceByContract.get(contractId).id,contractId,groupId:closedRecalculation.groupId}));assert.deepEqual(closedIndex.closed,[...activeConfirmedIndex.closed,...newClosedReferences].sort((left,right)=>left.contractId<right.contractId?-1:1));
 await sameStateReject(()=>preparation(receipt.id),error=>error.code==='OWN_ANNUL_PREPARATION_CURRENT_STATE_CHANGED'&&error.status===409,'original209 preparation rejects the active new closure without a write');
 for(const capture of recalculated)assert.deepEqual((await readDetail(capture.id)).capture.saved,capture.saved);
 assert.deepEqual((await readDetail(first.id)).capture.saved,firstSaved);assert.deepEqual((await readDetail(second.id)).capture.saved,second.saved);for(const capture of captures)assert.deepEqual((await readDetail(capture.id)).capture.saved,capture.saved);assert.deepEqual((await readDetail(recovered124.id)).capture.saved,recovered124.saved);assert.deepEqual((await readDetail(agreementReplacement.id)).capture.saved,agreementReplacement.saved);
 assert.deepEqual(await annul('attempt',{key:receipt.key}),receiptReplay);assert.deepEqual(await close('group',{id:closed.groupId}),originalGroup);
 const confirmClosePrefixAfter=rowMultiset(h);assertPrefix(confirmClosePrefixBefore,confirmClosePrefixAfter);
 const decisionTables=['own_payroll_run_capture','own_payroll_run_result','own_payroll_liquidation_event','own_payroll_close_event'];assert.deepEqual(confirmClosePrefixAfter.filter(row=>!decisionTables.includes(row.name)),confirmClosePrefixBefore.filter(row=>!decisionTables.includes(row.name)),'ANNUL209_CONFIRM_CLOSE_CHANGED_OTHER_LEDGER_OR_IAM');
 assert.deepEqual(h.json([actorPlan.metadataReadStatement],{readOnly:true,fullJson:true}),metadata);
 const confirmCloseSource208=assertOwnAnnulmentReviewV2SourceBookend({h,db,installation:installation208}),confirmCloseSource209=assertOwnAnnulPreparation209SourceBookend({h,db,installation:installation209});assert.equal(confirmCloseSource209.priorBusinessRowsRecompared,false);
 assert.equal(postPreparationRecalculation.addedLiquidationDecisions,0);assert.equal(postPreparationRecalculation.addedCloseEvents,0);assert.deepEqual(postPreparationRecalculation.after,recalcAfter);
 const postPreparationConfirmationClose={version:'own-annul-preparation-explicit-confirm-close.v1',passed:true,sourceRunIds:[...activeRunIds].sort(),initialConfirmationRunIds:recalculated.map(capture=>capture.id).sort(),confirmedRuns:2,confirmedPopulation:855,closedPopulation:855,closedConceptRows:17100,addedCaptures:1,addedSavedResults:1,addedLiquidationDecisions:4,initialConfirmationDecisions:2,agreementContinuationAddedDecisions:2,addedCloseEvents:1,before:confirmCloseBefore,after:closedLedger,confirmationMeasurements,closeDetailBytes,closeReceiptBytes:bytes(closedRecalculation),closeRecoveryMeasurements,legacyDetailRejected,legacyReceiptRejections,closedGroupId:closedRecalculation.groupId,closedSnapshotSha256:closedRecalculation.snapshotSha256,recoveryAndReplayAddedRows:0,exactNewRunIds:true,previousRunStatesPreserved:true,previousRunStatesScope:'thirteen historical runs preceding the original two confirmations',retiredAgreementRunIntentionallyAnnulled:true,previousRowsPreserved:true,oldGroupPreserved:true,originalPreparationRejectedByCurrentState:true,source208:confirmCloseSource208,source209:confirmCloseSource209,actualSql:true,actualLiquidationService:true,actualCloseService:true,actualApiHandler:true,actualHttp:true,actualBrowser:true,actualCloseApiHandler:false,actualCloseHttp:false,actualCloseBrowser:false,departmentConfirmationBrowser,agreementAnnulmentContinuation,atomicGetToCalculation:false,durableReceiptLinkCreated:false,receiptLinkedRecalculationExecuted:false,monthlyBusinessCovered:false,ownPayrollReceiptsPrepared:false,synthetic:true,productionWrites:0,paymentExecuted:false,municipalAcceptance:false};
 ok(true,'two original confirmations plus agreement annul/replacement close the active855/17100 union with four actual decision events, preserve the thirteen earlier histories and reject stale209');
 // Metadata-only observation AFTER the entire explicit confirm/close phase.
 // One existing read-only h.json call: no receipt event rows or receipt RPCs.
 const receipt126Inventory=readReceipt126Same190Inventory(h);
 assert.equal(receipt126Inventory.formValidated,true);assert.equal(receipt126Inventory.sameCanonical190,true);assert.equal(receipt126Inventory.queryCount,1);
 assert.equal(receipt126Inventory.installationAllowed,false);assert.equal(receipt126Inventory.receiptWorkflowExecuted,false);assert.equal(receipt126Inventory.metadataOnly,true);
 assert.ok(['ausente','parcial','objetos_presentes_sin_admision'].includes(receipt126Inventory.classification));
 ok(true,'same190 catalog inventory126 is complete metadata only, without installation admission or receipt execution');
 return{version:'own-annul-preparation209-live190-native-qa.v1',passed:true,sourceCommit:h.sourceCommit,major:h.major,operationalPairBaseline:'published107',pre107Admitted:false,population:855,conceptRowsPerRun:17100,sourceCandidateRevision:'decision124-r3-positive-agreement',newSavedCaptures:6,preparationPhaseSavedCaptures:2,individual124SavedCaptures:1,postAgreementReplacementSavedCaptures:1,newPendingCaptures:2,creatorCount:3,projectedCreators:2,receiverIsThirdManagedPreparer:true,partitions:[285,570],dates:[...dates],measurements,checks,actors,source208,source209,postPreparationRecalculation,postPreparationConfirmationClose,confirmationRegressionBrowser,calculationRecoveryBrowser,departmentConfirmationBrowser,agreementAnnulmentBrowser,agreementAnnulmentContinuation,individualDecisionBrowser:decisionBrowser,blockedDecisionBrowser:blockedBrowser,receipt126Inventory,oldRows:{tables:prefixBefore.length,sha256:ownRunHash(prefixBefore),preserved:true},actualSql:true,actualApiHandler:true,actualHttp:handoffBrowser.actualHttp,actualBrowser:handoffBrowser.actualBrowser,receiptToPreparationNativeProven:true,receiptToPreparationBrowserProven:handoffBrowser.receiptToPreparationBrowserProven,individualDecisionBrowserProven:decisionBrowser.individualDecisionBrowserProven&&blockedBrowser.blockedDecisionBrowserProven,handoffBrowser,rejectionBrowser,fullCapacityBrowserProven:false,projectionAbove4MiB:measurements.projections.some(row=>row.above4MiB),globalCensusMoreThan1000Proven:false,independentDigestOracleProven:false,legacyNullDateNativeProven:false,activeCloseIndependentlyOfConfirmationProven:false,atomicGetToCalculation:false,automaticRecalculation:false,receiptLinkedRecalculationExecuted:false,monthlyBusinessCovered:false,synthetic:true,productionWrites:0,paymentExecuted:false,municipalAcceptance:false};
}
