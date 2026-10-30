// SOURCE ONLY. Native855 case inside the ONE existing canonical190.
// Existing IAM/source/readiness/MFA190/177 and outer cleanup stay authoritative.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {preparePositions210BeforeFirstCapture,readPositions210Comparison} from './positions210-same190-native-continuation.mjs';
import {verifyLifecycle212Same190} from './positions211212-same190-fixture.mjs';
import {verifyPositionAdministrative216BrowserOn190} from './position-administrative216-native-browser.mjs';
import {assertPositions210SidecarPlan,readPositions210SidecarSnapshot,assertPositions210SidecarDelta} from './positions210-same190-sidecar.mjs';
import {ownerDecisionQaLiteral as q} from './municipal-owner-adoption-decision-qa.mjs';
import {ownCapacityLiteralAdditions} from './own-payroll-capacity-literal-additions.mjs';
import {salaryBootstrap,salaryItems,salaryRowKey} from '../../assets/native-salary-catalog-model.js';
import {ownProgramBootstrap,ownProgramDefinition,ownProgramHistory} from '../../assets/own-payroll-program-model.js';
import {ownRunOperation,RUN_CALCULATE,ownRunHash} from '../../lib/internal-own-payroll-run.js';
import {ownLiquidationOperation,OWN_LIQ_REVIEW} from '../../lib/internal-own-payroll-liquidation.js';
import {ownAnnulOperation} from '../../lib/internal-own-payroll-annulment.js';
import {ownCloseOperation,OWN_CLOSE_WRITE} from '../../lib/internal-own-payroll-close.js';
import {employeeContext} from '../../lib/internal-native-employees.js';
import {ownCloseSnapshot,ownCloseCommand} from '../../assets/own-payroll-close-model.js';
import {ownAnnulCommand} from '../../assets/own-payroll-annulment-model.js';
import {employeeDraft,validCuil} from '../../assets/native-employee-contract.js';
import {verifiedOwnReportCensus} from '../../assets/own-payroll-report-census-model.js';
import {ownerProgramQaAccessSql,ownerProgramQaAccess} from './municipal-owner-program-qa.mjs';
import {buildOwnReportCensus190IamFixture,assertOwnReportCensus190IamFixture} from './own-payroll-report-census-190-iam-fixture.mjs';
import {canonical190Rpc} from './native-family-195-rpc.mjs';
import {runNativeFamily195Business,FAMILY195_BUSINESS_CONTEXT_VERSION} from './native-family-195-same190-continuation.mjs';
import {createOwn190NativeErrorExpectations} from './own-payroll-expected-native-rpc.mjs';
import {composeOwnFullCapacity190Installation,installOwnFullCapacity190,ownFullCapacity190Snapshot} from './own-payroll-full-capacity-190-installation.mjs';
import {assertNovelty217JointDownstream,advanceNovelty217JointAfter201} from './novelty-administrative217-joint.mjs';
import {composeOwnCloseSnapshot214Plan,installOwnCloseSnapshot214} from './own-close-snapshot214-installation.mjs';
import {composeOwnCloseSnapshot215Plan,installOwnCloseSnapshot215,projectOwnCloseSnapshot215Postflight} from './own-close-snapshot215-installation.mjs';
import {runOwnAccountingImputation190Continuation} from './own-accounting-imputation-190-continuation.mjs';
import {assertOwnAccountingImputation190SourceBookend} from './own-accounting-imputation-190-installation.mjs';
import {runOwnJournalFullCapacity190Continuation} from './own-journal-full-capacity-190-continuation.mjs';
import {verifyAccountingFullReadBrowserOn190} from './own-accounting-full-current190-browser.mjs';
import {runOwnAnnulmentV2NativeContinuation} from './own-payroll-annulment-v2-native-continuation.mjs';
import {verifyOwnCloseBrowserOn190} from './own-payroll-close-native-browser.mjs';
import {verifyOwnInitialEmptyBrowserOn190} from './own-payroll-initial-empty-current190-browser.mjs';
import {verifyOwnSqlRevocationBrowserOn190} from './own-payroll-sql-revocation-current190-browser.mjs';
import {runOwnReceipt126Backend190Continuation} from './own-payroll-receipt126-backend-190-continuation.mjs';
const FOUR=4*1024*1024,FULL=32*1024*1024,bytes=v=>Buffer.byteLength(JSON.stringify(v),'utf8'),j=v=>q(JSON.stringify(v))+'::jsonb';
async function seedLiteralProgramme(db,qa){
 // Keep190's actual current programme and entire catalogue, not a rebuilt six-rule fixture.
 const maker=j(qa.actors.maker),checker=j(qa.actors.checker),salary=salaryBootstrap(await db.run('SELECT native_salary_bootstrap_v1('+maker+')',true)),prior=ownProgramBootstrap(await db.run('SELECT own_program_bootstrap_v1('+maker+')',true));
 assert.equal(prior.salaryCatalog.version,salary.catalog.version);assert.deepEqual(prior.salaryCatalog.items,salary.catalog.items);
 const previous=ownProgramDefinition(structuredClone(prior.program.definition),salary.catalog.items);
 assert.equal(previous.namespaceVersion,'own-payroll-namespaces.v2');assert.equal(previous.periodContextVersion,'own-payroll-period-context.v1');
 assert.equal(previous.rules.length,2,'M7_190_EXACT_PRIOR_PROGRAMME');assert.deepEqual(previous.rules.map(r=>r.code).sort(),['1','101']);assert.ok(previous.rules.every(r=>r.agreementCode==='1'&&r.validFrom==='2026-10'&&r.validUntil==='2026-10'));
 assert.equal(previous.rules.find(r=>r.code==='1').expression.value,'100.20','M7_190_EXISTING_APPROVED_EVOLUTION_REQUIRED');
 assert.equal(previous.bindings.length,1);assert.ok(previous.bindings.some(b=>b.agreementCode==='1'&&b.key==='month'&&b.unit==='units'&&b.sourceKind==='period_context_fact'&&b.sourceField==='monthNumber'&&b.onMissing==='error'&&b.combine==='single'),'M7_190_REAL_PERIOD_BINDING_REQUIRED');
 const additions=ownCapacityLiteralAdditions();assert.equal(additions.length,18,'M7_CAPACITY_LITERAL_ADDITIONS_COUNT');
 assert.ok(additions.every(r=>r.ruleReference.length<=180));
 for(const rule of additions){assert.ok(!previous.rules.some(old=>old.agreementCode===rule.agreementCode&&old.code===rule.code),'M7_CAPACITY_PROGRAMME_CODE_COLLISION');assert.ok(!salary.catalog.items.some(old=>old.agreementCode===rule.agreementCode&&old.code===rule.code),'M7_CAPACITY_CATALOGUE_CODE_COLLISION');}
 const addedItems=additions.map(r=>({active:true,agreementCode:'1',categoryCode:null,code:r.code,dependencies:[],kind:'concept',label:'Concepto exclusivamente sintético M7 '+r.code,nature:r.nature,precision:2,ruleReference:r.ruleReference,unit:r.unit,validFrom:r.validFrom,validUntil:null,value:null}));
 const items=salaryItems([...structuredClone(salary.catalog.items),...addedItems]);
 for(const item of salary.catalog.items)assert.deepEqual(items.find(row=>salaryRowKey(row)===salaryRowKey(item)),item,'M7_CAPACITY_CATALOGUE_HISTORY_PRESERVED');
 const definition=ownProgramDefinition({...structuredClone(previous),rules:[...structuredClone(previous.rules),...additions]},items);assert.equal(definition.rules.length,20);assert.deepEqual(definition.bindings,previous.bindings);ownProgramHistory(previous,definition);
 for(const oldRule of previous.rules)assert.deepEqual(definition.rules.find(next=>next.agreementCode===oldRule.agreementCode&&next.code===oldRule.code),oldRule,'M7_CAPACITY_EXACT_OLD_RULE_PRESERVED');
 const salaryBody={command:'propose',scopeVersion:salary.scopeVersion,baseVersion:salary.catalog.version,classificationVersion:salary.classification.version,proposalId:null,proposalSha256:null,items,reason:'Maestro exclusivamente sintético de capacidad M7, conservando historia',reviewConfirmed:false};
 const salaryProposal=await db.run('SELECT native_salary_command_v1('+maker+','+j(salaryBody)+','+q(randomUUID())+'::uuid)',true),salaryReview=salaryBootstrap(await db.run('SELECT native_salary_bootstrap_v1('+checker+')',true));
 await db.run('SELECT native_salary_command_v1('+checker+','+j({...salaryBody,command:'approve',scopeVersion:salaryReview.scopeVersion,items:null,proposalId:salaryProposal.proposalId,proposalSha256:salaryProposal.requestSha256,reviewConfirmed:true})+','+q(randomUUID())+'::uuid)',true);
 const programme=ownProgramBootstrap(await db.run('SELECT own_program_bootstrap_v1('+maker+')',true));assert.equal(programme.program.version,prior.program.version);assert.deepEqual(programme.program.definition,prior.program.definition);assert.deepEqual(programme.salaryCatalog.items,items);
 const body={command:'propose',scopeVersion:programme.scopeVersion,baseVersion:programme.program.version,salaryVersion:programme.salaryCatalog.version,proposalId:null,proposalSha256:null,program:definition,reason:'Programa sintético de veinte reglas: dos originales de QA190 y dieciocho literales',reviewConfirmed:false};
 const proposal=await db.run('SELECT own_program_command_v1('+maker+','+j(body)+','+q(randomUUID())+'::uuid)',true),review=ownProgramBootstrap(await db.run('SELECT own_program_bootstrap_v1('+checker+')',true));
 await db.run('SELECT own_program_command_v1('+checker+','+j({...body,command:'approve',scopeVersion:review.scopeVersion,program:null,proposalId:proposal.proposalId,proposalSha256:proposal.requestSha256,reviewConfirmed:true})+','+q(randomUUID())+'::uuid)',true);
 const published=ownProgramBootstrap(await db.run('SELECT own_program_bootstrap_v1('+maker+')',true));assert.deepEqual(published.program.definition,definition);assert.deepEqual(published.salaryCatalog.items,items);return published.program.definition;
}
function bind(h){
 const {qa}=h,connections=[],trace=[],negatives=createOwn190NativeErrorExpectations();
 // The runtime cannot read the postgres backend's start time from the stats
 // view. Capture only this connection before SET ROLE, inside the same frame.
 // LOCAL state emits no row and cannot survive the native transaction.
 const connectionCapture=`DO $connection_capture$
 DECLARE native_pid integer:=pg_backend_pid();native_started timestamptz;
 BEGIN
  IF current_user IS DISTINCT FROM 'postgres' OR session_user IS DISTINCT FROM 'postgres'
  THEN RAISE EXCEPTION 'M7_190_CONNECTION_CAPTURE_ROLE';END IF;
  SELECT activity.backend_start INTO STRICT native_started
  FROM pg_catalog.pg_stat_activity activity
  WHERE activity.pid=native_pid AND activity.usename=session_user
    AND activity.datname=current_database() AND activity.backend_type='client backend';
  IF native_started IS NULL THEN RAISE EXCEPTION 'M7_190_CONNECTION_START_REQUIRED';END IF;
  PERFORM set_config('municontrol_capacity190.native_connection',
   jsonb_build_object('pid',native_pid,'backendStart',
    to_char(native_started AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))::text,true);
 END $connection_capture$`;
 const connectionGuard=`DO $connection_guard$ DECLARE captured jsonb:=current_setting('municontrol_capacity190.native_connection')::jsonb;
 BEGIN
  IF jsonb_typeof(captured) IS DISTINCT FROM 'object'
   OR jsonb_typeof(captured->'pid') IS DISTINCT FROM 'number'
   OR(captured->>'pid')::bigint IS DISTINCT FROM pg_backend_pid()
   OR jsonb_typeof(captured->'backendStart') IS DISTINCT FROM 'string'
   OR btrim(captured->>'backendStart')=''
  THEN RAISE EXCEPTION 'M7_190_CONNECTION_IDENTITY_CHANGED';END IF;
 END $connection_guard$`;
 const observe=value=>{assert.ok(value?.connection&&Object.hasOwn(value,'result'),'M7_190_NATIVE_RESPONSE');assert.ok(Number.isSafeInteger(value.connection.pid)&&value.connection.pid>0&&value.connection.pid<=2147483647,'M7_190_NATIVE_PID');assert.equal(typeof value.connection.backendStart,'string');assert.ok(value.connection.backendStart.trim().length>0&&Number.isFinite(Date.parse(value.connection.backendStart)),'M7_190_NATIVE_BACKEND_START');connections.push(value.connection.pid+':'+value.connection.backendStart);return value.result;};
 const envelope=expression=>"SELECT jsonb_build_object('connection',current_setting('municontrol_capacity190.native_connection')::jsonb,'result',("+expression+'))';
 const run=async(text,runtime=false,{readCommitted=false}={})=>{assert.equal(typeof text,'string');assert.equal(typeof readCommitted,'boolean','M7_190_READ_COMMITTED_INVALID');const statement=text;
  const query=/^SELECT /.test(statement)&&!statement.includes(';');
  assert.ok(!readCommitted||query&&runtime===false,'M7_190_READ_COMMITTED_OWNER_QUERY_REQUIRED');
  const command=runtime||readCommitted,role=runtime?['SET LOCAL ROLE municontrol_actions_runtime_app']:[],prefix=query?[connectionCapture,...role,connectionGuard]:role;
  const statements=[...prefix,query?envelope(statement.slice(7)):statement],expected=negatives.consumeRun({statement,runtime});
  if(expected)throw negatives.completeExpectedError(expected,h.expectRollback(statements,expected.nativeCode,{command}));
  if(query)return observe(h.json(statements,{command,fullJson:true}));
  // Command-only batches retain their original role, tags and latch profile.
  return h.json(statements,{command});
 };
 const query=async(text,values)=>{const {statement:rendered}=canonical190Rpc(text,values,qa.schema),statements=[connectionCapture,'SET LOCAL ROLE municontrol_actions_runtime_app',connectionGuard,envelope(rendered.slice(7,-' AS result'.length))];trace.push({sql:text});
  const expected=negatives.consumeQuery({text,values});
  if(expected)throw negatives.completeExpectedError(expected,h.expectRollback(statements,expected.nativeCode,{command:true}));
  return[{result:observe(h.json(statements,{command:true,fullJson:true}))}];
 };
 return{run,query,connections,trace,expectQueryError:negatives.expectQueryError,expectRunError:negatives.expectRunError,assertNoExpectedRpc:negatives.assertIdle};
}
export {bind as bindOwnFullCapacity190};
function access(h,actor){
 const value=h.json([ownerProgramQaAccessSql(h.qa.schema,actor)],{readOnly:true}),a=ownerProgramQaAccess(value,actor);assert.equal(a.principal.authorized,true);assert.equal(a.principal.session.mfa,true);assert.equal(a.principal.session.id,actor.actorSessionId);
 return{principal:a.principal,session:{id:a.session.id,email:actor.actorEmail,version:a.session.version,releaseSha:actor.releaseSha}};
}
function fictionalCuil(dni){
 for(const prefix of['20','23']){const value=prefix+dni,digit=11-[5,4,3,2,7,6,5,4,3,2].reduce((sum,w,n)=>sum+w*Number(value[n]),0)%11;if(digit===10)continue;const cuil=value+(digit===11?'0':String(digit));if(validCuil(cuil))return cuil;}assert.fail('M7_190_SYNTHETIC_CUIL_REQUIRED');
}
async function registerPopulation(h,db){
 const {qa}=h,initial=h.json([`SELECT jsonb_build_object('period',to_char(clock_timestamp() AT TIME ZONE 'America/Argentina/Mendoza','YYYY-MM'),'nativeCount',(SELECT count(*) FROM ${qa.schema}.native_employee_registration),'closeCount',(SELECT count(*) FROM ${qa.schema}.own_payroll_close_event))`],{readOnly:true});
 assert.equal(initial.period,'2026-10','M7_190_DATED_FIXTURE_REVIEW_REQUIRED');assert.equal(initial.nativeCount,0,'M7_190_INITIAL_NATIVE_POPULATION_CHANGED');assert.equal(initial.closeCount,0,'M7_190_INITIAL_CLOSE_HISTORY_CHANGED');
 const boot=await db.run('SELECT native_employee_bootstrap_v1('+j(qa.actor)+')',true);assert.equal(boot.canCreate,true);for(const kind of['agreements','categories','organizations','sectors'])assert.ok(boot.catalog.items.some(row=>row.kind===kind&&row.code==='1'&&(kind!=='categories'||row.agreementCode==='1')),'M7_190_REAL_CATALOGUE_SELECTION');
 const drafts=Array.from({length:855},(_,n)=>{const dni=String(96010000+n);return employeeDraft({legajo:String(31000+n),fullName:'Persona exclusivamente sintética M7 '+n,dni,cuil:fictionalCuil(dni),birthDate:'1990-01-01',sexCode:'X',startDate:'2026-10-01',agreementCode:'1',categoryCode:'1',organizationId:'1',sectorCode:'1',jurisdictionCode:'42',jobTitle:'Puesto exclusivamente ficticio M7',legalReference:'Alta exclusivamente sintética de volumen QA190'});});
 const oldSources=()=>h.json([`SELECT jsonb_build_object('sourceContracts',(SELECT ${qa.schema}.own_run_hash_v1(coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.id),'[]')) FROM ${qa.schema}.employment_contract c WHERE source_system<>'MUNICONTROL'),'sourcePeople',(SELECT ${qa.schema}.own_run_hash_v1(coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id),'[]')) FROM ${qa.schema}.person_identity p WHERE EXISTS(SELECT 1 FROM ${qa.schema}.employment_contract c WHERE c.person_id=p.id AND c.source_system<>'MUNICONTROL')))`],{readOnly:true}),baseline=oldSources();
 const hires=h.json(['SET LOCAL ROLE municontrol_actions_runtime_app',`DO $m7_hires$ DECLARE draft jsonb;receipt jsonb;all_receipts jsonb:='[]';BEGIN FOR draft IN SELECT value FROM jsonb_array_elements(${j(drafts)}) LOOP receipt:=${qa.schema}.native_employee_create_v1(${j(qa.actor)},draft,${q(boot.catalog.version)},gen_random_uuid());all_receipts:=all_receipts||jsonb_build_array(receipt);END LOOP;PERFORM set_config('municontrol_capacity190.hires',all_receipts::text,true);END $m7_hires$;SELECT current_setting('municontrol_capacity190.hires')::jsonb`],{command:true,fullJson:true});
 assert.equal(hires.length,855);assert.equal(new Set(hires.map(v=>v.contractId)).size,855);assert.ok(hires.every(v=>v.origin==='MUNICONTROL'&&v.startDate==='2026-10-01'&&v.accountCreated===false&&v.payrollCalculated===false));assert.deepEqual(oldSources(),baseline,'M7_190_OLD_SOURCE_ROWS_CHANGED');return hires.map(v=>v.contractId).sort();
}
export async function runOwnFullCapacity190Continuation(h,options={}){
 assert.ok(options&&typeof options==='object'&&!Array.isArray(options)&&(Object.getPrototypeOf(options)===Object.prototype||Object.getPrototypeOf(options)===null)&&Reflect.ownKeys(options).every(key=>key==='annulmentV2Browser'||key==='annulmentPreparation'||key==='positions210'||key==='family195Business'),'M7_190_EXTENSION_OPTIONS_INVALID');
 const annulmentV2BrowserEnabled=Object.hasOwn(options,'annulmentV2Browser')?options.annulmentV2Browser:false;assert.equal(typeof annulmentV2BrowserEnabled,'boolean','M7_190_EXTENSION_BOOLEAN_REQUIRED');
 const annulmentPreparation=Object.hasOwn(options,'annulmentPreparation')?options.annulmentPreparation:false;assert.equal(typeof annulmentPreparation,'boolean','M7_190_PREPARATION_BOOLEAN_REQUIRED');assert.ok(!annulmentPreparation||annulmentV2BrowserEnabled,'M7_190_PREPARATION_REQUIRES_COMPLETE208');
 const family195Business=Object.hasOwn(options,'family195Business')?options.family195Business:false;
 assert.equal(typeof family195Business,'boolean','M7_190_FAMILY195_BOOLEAN_REQUIRED');
 assert.ok(!family195Business||(annulmentV2BrowserEnabled&&annulmentPreparation),'M7_190_FAMILY195_REQUIRES_COMPLETE208_209');
  const positions210Enabled=Object.hasOwn(options,'positions210')?options.positions210:false;assert.equal(typeof positions210Enabled,'boolean');assert.ok(!positions210Enabled||(annulmentV2BrowserEnabled&&annulmentPreparation),'POSITIONS210_REQUIRES_COMPLETE208_209');
  const {qa,major}=h;assert.ok([17,18].includes(major));assert.equal(qa.operationalPairBaseline,'published107');
 const closeSnapshotPlan=composeOwnCloseSnapshot214Plan({foundation:qa,major,sourceCommit:h.sourceCommit,read:h.read});
 const closeIndexedPlan=composeOwnCloseSnapshot215Plan({foundation:qa,major,sourceCommit:h.sourceCommit,read:h.read});
 const runtime=()=>h.json(["SELECT jsonb_build_object('serverVersion',current_setting('server_version'),'serverVersionNum',current_setting('server_version_num'))"],{readOnly:true}),nativeBefore=runtime();assert.equal(Math.trunc(Number(nativeBefore.serverVersionNum)/10000),major);
 const iamPlan=buildOwnReportCensus190IamFixture({qa,read:h.read}),iamProof=h.json(iamPlan.statements),iam=assertOwnReportCensus190IamFixture(iamPlan,iamProof);
 if(h.prepared?.administrative217){const sourcePlan201=composeOwnFullCapacity190Installation(h);assertNovelty217JointDownstream(h,'201-post',sourcePlan201.postLocal);}
 const installation=await installOwnFullCapacity190(h);
 if(h.prepared?.administrative217)advanceNovelty217JointAfter201(h,installation);
 // Preserve the complete200/201 admission above;214 is a distinct successor.
 const closeSnapshot214=installOwnCloseSnapshot214(h,closeSnapshotPlan);
 const closeSnapshot215=installOwnCloseSnapshot215(h,closeIndexedPlan);
 const db=bind(h),ownerQa={...qa,actors:{maker:qa.actor,checker:qa.checker}};
 const definition=await seedLiteralProgramme(db,ownerQa),contracts=await registerPopulation(h,db),maker=access(h,qa.actor),reviewer=access(h,qa.checker),checks=[],ok=(condition,label)=>{assert.ok(condition,label);checks.push(label);h.check(label);};
 assert.notEqual(qa.actor.actorEmail,qa.checker.actorEmail);assert.notEqual(qa.actor.membershipId,qa.checker.membershipId);for(const c of RUN_CALCULATE)assert.ok(maker.principal.tenant.effectiveCapabilities.includes(c));for(const c of [...OWN_LIQ_REVIEW,...OWN_CLOSE_WRITE])assert.ok(reviewer.principal.tenant.effectiveCapabilities.includes(c));
 const checkerContext=JSON.stringify(employeeContext(reviewer.principal,reviewer.session));
 const run=(op,input,fullJson=true)=>ownRunOperation(db,maker.principal,maker.session,op,input,{fullJson}),liq=(op,input,fullJson=true)=>ownLiquidationOperation(db,reviewer.principal,reviewer.session,op,input,{fullJson}),annul=(op,input,fullJson=true)=>ownAnnulOperation(db,reviewer.principal,reviewer.session,op,input,{fullJson}),close=(op,input,fullJson=true)=>ownCloseOperation(db,reviewer.principal,reviewer.session,op,input,{fullJson});
  const period='2026-10';
  const positions210Admission=positions210Enabled?await preparePositions210BeforeFirstCapture({h,db,qa,contracts,period}):null;
  const positions210Sidecar=positions210Enabled?assertPositions210SidecarPlan({h,db,plan:h.prepared.positions210Sidecar}):null;
  const positions210SidecarProofs=[];
  const positions210Initial=positions210Sidecar?readPositions210SidecarSnapshot({h,db,plan:positions210Sidecar}):null;
  if(positions210Initial){assert.deepEqual(positions210Initial.captures,[]);assert.deepEqual(positions210Initial.positions,[]);assert.deepEqual(positions210Initial.dimensions,[]);}
 const calculate=async()=>{const b=await run('bootstrap');return run('calculate',{body:{version:'own-payroll-run-command.v2',period,liquidationType:'monthly',liquidationDate:period+'-15',selection:{kind:'all',values:[]},scopeVersion:b.scopeVersion,programVersion:b.programVersion,populationDomain:'native_registered'},key:randomUUID()});};
 const sameStateReject=async(operation,predicate,label)=>{const before=ownFullCapacity190Snapshot(h);await assert.rejects(operation,predicate);assert.deepEqual(ownFullCapacity190Snapshot(h),before);ok(true,label);};
 // Read-only initial UI epoch: the existing IAM/201/programme/855 population
 // above is ready, and the very first calculate below has NOT happened yet.
 // Keep this proof separate; it adds no capture, saved result or decision.
 const initialEmptyBrowser=annulmentV2BrowserEnabled?await verifyOwnInitialEmptyBrowserOn190(Object.freeze({version:'own-initial-empty-live190-context.v1',h,db,qa,maker,reviewer,contracts,readSnapshot:()=>ownFullCapacity190Snapshot(h)})):null;
 if(initialEmptyBrowser){assert.equal(initialEmptyBrowser.passed,true);assert.equal(initialEmptyBrowser.initialVerifiedEmptyBrowserProven,true);assert.equal(initialEmptyBrowser.ownRosterComplete,855);for(const key of ['initialCaptures','initialSavedResults','httpWrites','addedCaptures','addedSavedResults','addedLiquidationDecisions','addedAnnulments','addedCloseEvents'])assert.equal(initialEmptyBrowser[key],0);ok(true,'initial actual empty review and own855 preparation are authenticated read-only before the first capture');}
  const first=await calculate();ok(first.saved.result.employeeCount===855&&first.saved.result.rowCount===17100,'855 actual native registrations produce all17100 concept rows');assert.deepEqual(first.saved.input.rules,definition.rules);
  if(positions210Sidecar)positions210SidecarProofs.push(assertPositions210SidecarDelta({h,db,plan:positions210Sidecar,before:positions210Initial,after:readPositions210SidecarSnapshot({h,db,plan:positions210Sidecar}),phase:'calculation',newCaptureIds:[first.id]}));
 assert.equal(first.payload.monthly.batches.length,0,'M7_190_UNEXPECTED_MONTHLY_SOURCE');assert.deepEqual(first.saved.input.employees.map(e=>e.contractId).sort(),contracts);assert.ok(first.saved.input.employees.every(e=>e.inputs.some(i=>i.key==='month'&&i.value==='10')),'M7_190_PERIOD_CONTEXT_CONSUMED');
 ok(bytes(first.body)+bytes(first.payload)+8192<FOUR&&bytes(first)>FOUR&&bytes(first)<=FULL,'same valid capture has small initial input and full response above4MiB without irrelevant padding');
 const firstSaved=structuredClone(first.saved),detail=await liq('detail',{id:first.id});assert.equal(detail.capture.saved.resultSha256,first.saved.resultSha256);assert.equal(detail.capture.saved.result.rowCount,17100);
 // Same first855 capture BEFORE any decision: the auth fixture stays stale/full
 // while two existing SQL overrides are denied/restored one at a time. This
 // phase adds only four declared IAM transactions, never a business event.
 const sqlRevocationBrowser=annulmentV2BrowserEnabled?await verifyOwnSqlRevocationBrowserOn190(Object.freeze({version:'own-sql-revocation-live190-context.v1',h,db,qa,maker,reviewer,capture:first,readSnapshot:()=>ownFullCapacity190Snapshot(h)})):null;
 if(sqlRevocationBrowser){assert.equal(sqlRevocationBrowser.passed,true);assert.equal(sqlRevocationBrowser.sqlLevelRevocationProven,true);assert.equal(sqlRevocationBrowser.temporaryIamWriteCalls,4);assert.equal(sqlRevocationBrowser.existingOverrideRowsRestored,2);assert.equal(sqlRevocationBrowser.cases.length,2);for(const key of ['addedCaptures','addedSavedResults','addedLiquidationDecisions','addedAnnulments','addedCloseEvents','businessHttpPosts','newRoles','newGrants','newSessions','newIdentities','newRpcDescriptors'])assert.equal(sqlRevocationBrowser[key],0);ok(true,'actual SQL reviewer and nominal revocation withdraw previously loaded855 detail with unchanged auth/session; exact existing overrides restored');}
 const privateCoreBefore=ownFullCapacity190Snapshot(h),privateCoreProof=h.json([
  'SET LOCAL ROLE municontrol_actions_runtime_app',
  `DO $private855$ DECLARE state_value text;BEGIN BEGIN PERFORM ${qa.schema}.own_liquidation_detail_capacity_core_v2(${j(qa.checker)},${q(first.id)}::uuid,33554432);RAISE EXCEPTION 'QA_PRIVATE855_UNEXPECTED_SUCCESS';EXCEPTION WHEN insufficient_privilege THEN GET STACKED DIAGNOSTICS state_value=RETURNED_SQLSTATE;IF state_value IS DISTINCT FROM '42501' THEN RAISE EXCEPTION 'QA_PRIVATE855_SQLSTATE_CHANGED';END IF;PERFORM set_config('municontrol_private855.proof',jsonb_build_object('caseId','855-private-core','denied',true,'sqlstate',state_value)::text,true);END;END $private855$`,
  "SELECT current_setting('municontrol_private855.proof')::jsonb"
 ],{command:true,end:'ROLLBACK',fullJson:true});
 assert.deepEqual(privateCoreProof,{caseId:'855-private-core',denied:true,sqlstate:'42501'});assert.deepEqual(ownFullCapacity190Snapshot(h),privateCoreBefore);ok(true,'runtime cannot call the private capacity core or choose its budget; exact42501 observed in a complete ROLLBACK');
 await db.expectQueryError({caseId:'855-legacy-liquidation-detail',nativeCode:'OWN_LIQ_LIMIT',text:'SELECT public.own_liquidation_detail_v1($1::jsonb,$2::uuid) AS result',values:[checkerContext,first.id]},()=>sameStateReject(()=>liq('detail',{id:first.id},false),e=>e.code==='OWN_LIQ_LIMIT'&&e.status===422,'legacy detail refuses the whole capture without rows or metadata changes'));
 await sameStateReject(()=>run('calculate',{body:first.body,key:first.key},false),e=>e.code==='OWN_RUN_LIMIT'&&e.status===422,'legacy recovery cannot relabel or truncate a stored full calculation');
 const decide=async(d,command)=>liq('command',{key:randomUUID(),body:{runId:d.id,resultSha256:d.capture.saved.resultSha256,scopeVersion:d.scopeVersion,stateVersion:d.stateVersion,command,selection:{kind:'all',values:[]},reason:'Decisión independiente exclusivamente sintética de capacidad M7',reviewConfirmed:true}});
 await decide(detail,'confirm');let ann=await annul('detail',{period,liquidationType:'monthly'});ok(ann.runs.length===1&&ann.runs[0].capture.saved.result.rowCount===17100,'consolidated review retains exactly the confirmed full capture');
 await db.expectQueryError({caseId:'855-legacy-annul-detail',nativeCode:'OWN_LIQ_LIMIT',text:'SELECT public.own_annul_detail_v1($1::jsonb,$2::text,$3::text) AS result',values:[checkerContext,period,'monthly']},()=>sameStateReject(()=>annul('detail',{period,liquidationType:'monthly'},false),e=>e.code==='OWN_LIQ_LIMIT'&&e.status===422,'legacy consolidated detail fails atomically above4MiB'));
 const annulBody={period,liquidationType:'monthly',scopeVersion:ann.scopeVersion,stateVersion:ann.stateVersion,selection:{kind:'all',values:[]},reason:'Anulación exclusivamente sintética de855 contratos completos M7',reviewConfirmed:true};
 await db.run("CREATE FUNCTION qa_capacity_late_annul_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QA_M7_CAPACITY_LATE_ANNUL_FAULT';END $$;CREATE TRIGGER qa_capacity_late_annul_fault BEFORE INSERT ON own_payroll_annul_event FOR EACH ROW EXECUTE FUNCTION qa_capacity_late_annul_fault()");
 const lateFaultKey=randomUUID(),lateFaultStatement='SELECT own_annul_command_full_v1('+j(qa.checker)+','+j(annulBody)+','+q(lateFaultKey)+'::uuid)';
 try{await db.expectRunError({caseId:'855-late-annul',nativeCode:'QA_M7_CAPACITY_LATE_ANNUL_FAULT',statement:lateFaultStatement,runtime:true},()=>sameStateReject(()=>db.run(lateFaultStatement,true),e=>/ERROR:.*QA_M7_CAPACITY_LATE_ANNUL_FAULT/.test(e.message),'late consolidated write fault rolls back every child event, receipt and control metadata'));}finally{await db.run('DROP TRIGGER qa_capacity_late_annul_fault ON own_payroll_annul_event;DROP FUNCTION qa_capacity_late_annul_fault()');}
 const annulKey=randomUUID(),annulled=await annul('command',{key:annulKey,body:annulBody});ok(annulled.affected.length===855,'one full atomic annulment covers855 exact contracts');assert.deepEqual(await annul('command',{key:annulKey,body:annulBody}),{...annulled,replayed:true});assert.deepEqual(await annul('attempt',{key:annulKey}),{...annulled,replayed:true});
 const changedAnnulBody={...annulBody,reason:'Cambio exclusivamente sintético del cuerpo original'};
 await db.expectQueryError({caseId:'855-annul-key-body-reuse',nativeCode:'OWN_LIQ_IDEMPOTENCY_REUSE',text:'SELECT public.own_annul_command_full_v1($1::jsonb,$2::jsonb,$3::uuid) AS result',values:[checkerContext,JSON.stringify(ownAnnulCommand(changedAnnulBody)),annulKey]},()=>sameStateReject(()=>annul('command',{key:annulKey,body:changedAnnulBody}),e=>e.code==='OWN_LIQ_IDEMPOTENCY_REUSE','same-key different body is refused without persistent change'));
  const positions210BeforeSecond=positions210Sidecar?readPositions210SidecarSnapshot({h,db,plan:positions210Sidecar}):null;
  const second=await calculate();ok(second.id!==first.id,'annulled full scope recalculates into another immutable run');assert.deepEqual(second.saved.result.rows,first.saved.result.rows);assert.deepEqual(second.saved.result.employeeTotals,first.saved.result.employeeTotals);
  if(positions210Sidecar)positions210SidecarProofs.push(assertPositions210SidecarDelta({h,db,plan:positions210Sidecar,before:positions210BeforeSecond,after:readPositions210SidecarSnapshot({h,db,plan:positions210Sidecar}),phase:'calculation',newCaptureIds:[second.id]}));
  await decide(await liq('detail',{id:second.id}),'confirm');
 const query={period,liquidationType:'monthly'},beforeClose=await close('detail',query),closeBody={...query,scopeVersion:beforeClose.scopeVersion,stateVersion:beforeClose.stateVersion,selection:{kind:'all',values:[]},command:'close',groupId:null,reason:'Cierre completo exclusivamente sintético de capacidad M7',reviewConfirmed:true},closeKey=randomUUID();
 const serializedCloseBody=JSON.stringify(ownCloseCommand(closeBody));
 await db.expectQueryError({caseId:'855-legacy-first-close',nativeCode:'OWN_CLOSE_LIMIT',text:'SELECT public.own_close_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result',values:[checkerContext,serializedCloseBody,closeKey]},()=>sameStateReject(()=>close('command',{key:closeKey,body:closeBody},false),e=>e.code==='OWN_CLOSE_LIMIT'&&e.status===422,'legacy close refuses full scope without committing any partial group'));
 const closed=await close('command',{key:closeKey,body:closeBody});assert.deepEqual(closed.snapshot,ownCloseSnapshot(beforeClose,closeBody.selection));ok(closed.snapshot.employeeCount===855&&closed.snapshot.conceptCount===17100&&closed.snapshot.populationComplete,'full close freezes all855 employees and17100 concepts');ok(bytes(closed)>FOUR&&bytes(closed)<=FULL,'large close receipt stays inside the negotiated32MiB envelope');
 assert.deepEqual(await close('group',{id:closed.groupId}),{...closed,replayed:true});assert.deepEqual(await close('attempt',{key:closeKey}),{...closed,replayed:true});assert.deepEqual(await close('command',{key:closeKey,body:closeBody}),{...closed,replayed:true});
 for(const [op,input,caseId,text,values]of [
  ['group',{id:closed.groupId},'855-legacy-close-group','SELECT public.own_close_group_v1($1::jsonb,$2::uuid) AS result',[checkerContext,closed.groupId]],
  ['attempt',{key:closeKey},'855-legacy-close-attempt','SELECT public.own_close_attempt_v1($1::jsonb,$2::uuid) AS result',[checkerContext,closeKey]],
  ['command',{key:closeKey,body:closeBody},'855-legacy-close-command','SELECT public.own_close_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result',[checkerContext,serializedCloseBody,closeKey]]
 ])await db.expectQueryError({caseId,nativeCode:'OWN_CLOSE_LIMIT',text,values},()=>sameStateReject(()=>close(op,input,false),e=>e.code==='OWN_CLOSE_LIMIT'&&e.status===422,'legacy '+op+' cannot truncate an original full receipt'));
 const closedCensus=await close('report-census',query);await verifiedOwnReportCensus(closedCensus);assert.equal(closedCensus.eventCount,1);assert.equal(closedCensus.groups.length,1);assert.equal(closedCensus.groups[0].id,closed.groupId);assert.equal(closedCensus.groups[0].state,'closed');assert.equal(closedCensus.groups[0].employeeCount,855);assert.equal(closedCensus.groups[0].snapshotSha256,closed.snapshotSha256);assert.ok(bytes(closedCensus)<=FOUR);
 const receiptTail=await runOwnReceipt126Backend190Continuation({version:'own-receipt126-backend-after-closed127.v1',h,db,qa,maker,contracts,second,closed,closedCensus});
 let receiptPrimary=null;try{
 const accountingImputationTail=await runOwnAccountingImputation190Continuation({h,db,maker,reviewer,closed,second,contracts,sameStateReject,ok});
 const journalTail=await runOwnJournalFullCapacity190Continuation({h,db,maker,reviewer,closed,approvedImputation:accountingImputationTail.approvedImputation,sameStateReject,ok});
 const accountingFullBrowser=await verifyAccountingFullReadBrowserOn190({h,db,qa,reviewer,closed,approvedImputation:accountingImputationTail.approvedImputation,readSnapshot:()=>ownFullCapacity190Snapshot(h)});ok(accountingFullBrowser.passed&&accountingFullBrowser.imputationConcepts===17100&&accountingFullBrowser.journalEntries===38,'same190 approved imputation and posted journal read/export through current FULL panels without a ledger or metadata write');
 const current=await close('detail',query),reopenBody={...closeBody,scopeVersion:current.scopeVersion,stateVersion:current.stateVersion,command:'reopen',groupId:closed.groupId},reopenKey=randomUUID(),reopened=await close('command',{key:reopenKey,body:reopenBody});assert.deepEqual(reopened.snapshot,closed.snapshot);assert.equal(reopened.snapshotSha256,closed.snapshotSha256);assert.deepEqual(await close('attempt',{key:reopenKey}),{...reopened,replayed:true});assert.deepEqual(await close('command',{key:reopenKey,body:reopenBody}),{...reopened,replayed:true});
 const receipt126=await receiptTail.afterReopen(reopened);assert.equal(receipt126.passed,true);assert.equal(receipt126.actualNetworkHttp,true);assert.equal(receipt126.browserProven,true);assert.equal(receipt126.circuit.browserProof.passed,true);assert.equal(receipt126.circuit.browserProof.originalBodyAndKeyHttpReplay,true);assert.equal(receipt126.circuit.receiptEventsTotal,3);assert.equal(receipt126.circuit.receiptBatches,1);ok(true,'same190 receipt126 backend preserves855/17100, three receipt events and exact checker restoration without another close or reopen');
 const accountingImputation=await accountingImputationTail.afterReopen(reopened),journal=await journalTail.afterReopen(reopened);
 const accountingImputationSourceBookend=assertOwnAccountingImputation190SourceBookend(h,accountingImputation.installation);
 assert.deepEqual((await liq('detail',{id:first.id})).capture.saved,firstSaved);assert.equal(ownRunHash(reopened.snapshot),closed.snapshotSha256);ok(true,'reopen and fresh recovery preserve the exact full snapshot and original first capture');
 const reopenedCensus=await close('report-census',query);await verifiedOwnReportCensus(reopenedCensus);assert.equal(reopenedCensus.eventCount,2);assert.equal(reopenedCensus.groups.length,1);assert.equal(reopenedCensus.groups[0].state,'reopened');assert.equal(reopenedCensus.groups[0].id,closed.groupId);assert.equal(reopenedCensus.groups[0].snapshotSha256,closed.snapshotSha256);assert.notEqual(reopenedCensus.sourceVersion,closedCensus.sourceVersion);assert.deepEqual(reopenedCensus.events.map(e=>e.id).sort(),[closed.id,reopened.id].sort());assert.deepEqual(await close('group',{id:closed.groupId}),{...closed,replayed:true});
 const mutatedCensus={...reopenedCensus,sourceVersion:'0'.repeat(64)};await assert.rejects(()=>verifiedOwnReportCensus(mutatedCensus));assert.deepEqual(await close('report-census',query),reopenedCensus);ok(true,'whole historical census survives full close/reopen; changed source hash is rejected without a live-roster fallback');
 // Revoke the exact synthetic approval override through REAL IAM, retaining
 // the stale JS principal so SQL must independently reauthorize recovery.
 const override=h.json([`SELECT to_jsonb(o) FROM ${qa.schema}.tenant_membership_capability_override o WHERE membership_id=${q(qa.checker.membershipId)}::uuid AND capability_key='payroll.calculation.approve'`],{readOnly:true});assert.equal(override.allow_override,true);assert.equal(override.deny_override,false);
 h.json([`UPDATE ${qa.schema}.tenant_membership_capability_override SET allow_override=false,deny_override=true WHERE membership_id=${q(qa.checker.membershipId)}::uuid AND capability_key='payroll.calculation.approve'`]);
 try{await db.expectQueryError({caseId:'855-revoked-close-attempt',nativeCode:'OWN_CLOSE_FORBIDDEN',text:'SELECT public.own_close_attempt_full_v1($1::jsonb,$2::uuid) AS result',values:[checkerContext,closeKey]},()=>sameStateReject(()=>close('attempt',{key:closeKey}),e=>e.status===403,'real IAM denial defeats a stale full-profile JS principal'));}finally{h.json([`UPDATE ${qa.schema}.tenant_membership_capability_override SET allow_override=true,deny_override=false WHERE membership_id=${q(qa.checker.membershipId)}::uuid AND capability_key='payroll.calculation.approve'`]);}
 assert.deepEqual(h.json([`SELECT to_jsonb(o) FROM ${qa.schema}.tenant_membership_capability_override o WHERE membership_id=${q(qa.checker.membershipId)}::uuid AND capability_key='payroll.calculation.approve'`],{readOnly:true}),override);
 const final=ownFullCapacity190Snapshot(h);h.json([projectOwnCloseSnapshot215Postflight(h,closeIndexedPlan,installation.plan.postflight)],{readOnly:true});assert.deepEqual(ownFullCapacity190Snapshot(h),final);
 assert.ok(db.connections.length>0);assert.equal(new Set(db.connections).size,db.connections.length,'M7_190_CONNECTION_REUSED');const nativeAfter=runtime();assert.deepEqual(nativeAfter,nativeBefore);
 const baselineReport={version:'own-full-capacity-canonical190-native-qa.v1',passed:true,major,sourceCommit:h.sourceCommit,mode:'full32',population:855,conceptRows:17100,initialBytes:bytes(first.body)+bytes(first.payload),captureBytes:bytes(first),closeReceiptBytes:bytes(closed),checks,iam,closeSnapshot214,closeSnapshot215,installation:{version:installation.version,sourceSqlSha256:installation.sourceSqlSha256,epoch200:installation.epoch200,epoch201:installation.epoch201},nativeRuntime:{node:process.version,...nativeAfter},independentNativeConnections:db.connections.length,fullResultSha256:first.saved.resultSha256,snapshotSha256:closed.snapshotSha256,census:{closedSourceVersion:closedCensus.sourceVersion,reopenedSourceVersion:reopenedCensus.sourceVersion,eventCount:reopenedCensus.eventCount,groups:reopenedCensus.groups.length},accountingImputation,journal,accountingFullBrowser,accountingImputationSourceBookend,receipt126,...(initialEmptyBrowser?{initialEmptyBrowser}:{}),...(sqlRevocationBrowser?{sqlRevocationBrowser}:{}),actualSql:true,actualHttp:false,fullCapacityBrowserProven:false,synthetic:true,productionWrites:0,paymentExecuted:false,municipalAcceptance:false};
 // The original201 native epoch above remains unchanged and explicitly dated.
 // The built close browser appends four close/reopen events on this SAME host.
 const closeBrowser=await verifyOwnCloseBrowserOn190(Object.freeze({version:'own-close-browser-live190-context.v1',h,db,qa,maker,reviewer,contracts,first,firstSaved,second,closed,reopened,period,query,operations:Object.freeze({close,liq}),readSnapshot:()=>ownFullCapacity190Snapshot(h)}));
 assert.equal(closeBrowser.passed,true);assert.equal(closeBrowser.builtCloseBrowserProven,true);assert.equal(closeBrowser.httpPosts,6);assert.equal(closeBrowser.delegatedCommandRpcs,5);assert.equal(closeBrowser.appendedEvents,4);assert.equal(closeBrowser.finalCloseEvents,6);assert.equal(closeBrowser.allNewGroupsReopened,true);assert.equal(closeBrowser.newCaptures,0);assert.equal(closeBrowser.productionWrites,0);
 const closeBrowserSnapshot=ownFullCapacity190Snapshot(h);
 const afterCloseBrowser={...baselineReport,censusEpoch:'original201-native-before-close-browser',closeBrowser,actualHttp:true};
 if(!annulmentV2BrowserEnabled)return afterCloseBrowser;
 // Fixed, caller-selected extension AFTER every original201/native/financial
 // check. Never accept a callback, module path or new foundation from the CLI.
 assert.strictEqual(qa,h.qa);assert.equal(contracts.length,855);assert.equal(new Set(contracts).size,855);assert.equal(definition.rules.length,20);
 for(const capture of[first,second]){assert.equal(capture.saved.result.employeeCount,855);assert.equal(capture.saved.result.rowCount,17100);assert.deepEqual(capture.saved.input.rules,definition.rules);assert.deepEqual(capture.saved.input.employees.map(employee=>employee.contractId).sort(),contracts);assert.equal(capture.body.period,period);assert.equal(capture.body.liquidationDate,period+'-15');}
 assert.equal(maker.session.id,qa.actor.actorSessionId);assert.equal(reviewer.session.id,qa.checker.actorSessionId);assert.notEqual(maker.session.id,reviewer.session.id);
 assert.equal(closed.snapshot.employeeCount,855);assert.equal(closed.snapshot.conceptCount,17100);assert.equal(reopened.body.command,'reopen');assert.equal(reopened.groupId,closed.groupId);assert.equal(reopened.snapshotSha256,closed.snapshotSha256);
 const baselineChecks=Object.freeze([...checks]),secondSaved=structuredClone(second.saved);
 const context=Object.freeze({version:'own-annulment-v2-live190-context.v1',h,db,qa,maker,reviewer,definition,contracts,first,firstSaved,second,closed,reopened,annulKey,annulled,query,period,installation,iam,...(positions210Sidecar?{positions210Sidecar}:{}),baselineSnapshot:closeBrowserSnapshot,closedCensus,reopenedCensus,accountingImputation,journal,accountingImputationSourceBookend,operations:Object.freeze({run,liq,annul,close,decide,calculate}),readSnapshot:()=>ownFullCapacity190Snapshot(h),sameStateReject,ok,monthlyBusinessCovered:false});
 const annulmentV2Browser=await runOwnAnnulmentV2NativeContinuation(context,{annulmentPreparation});
 assert.ok(annulmentV2Browser&&typeof annulmentV2Browser==='object'&&!Array.isArray(annulmentV2Browser),'M7_190_ANNUL_V2_REPORT_REQUIRED');assert.equal(annulmentV2Browser.passed,true);assert.equal(annulmentV2Browser.monthlyBusinessCovered,false);assert.equal(annulmentV2Browser.productionWrites,0);assert.equal(annulmentV2Browser.paymentExecuted,false);assert.equal(annulmentV2Browser.municipalAcceptance,false);
 // New decisions legitimately extend history. Keep the immutable originals;
 // postflight201 must NOT be rerun as an alleged208 admission after the tail.
 assert.deepEqual((await liq('detail',{id:first.id})).capture.saved,firstSaved);assert.deepEqual((await liq('detail',{id:second.id})).capture.saved,secondSaved);
 assert.deepEqual(await close('group',{id:closed.groupId}),{...closed,replayed:true});assert.deepEqual(await annul('attempt',{key:annulKey}),{...annulled,replayed:true});
 assert.deepEqual(checks.slice(0,baselineChecks.length),baselineChecks);assert.equal(new Set(db.connections).size,db.connections.length,'M7_190_ANNUL_V2_CONNECTION_REUSED');assert.deepEqual(runtime(),nativeBefore);
 // Fixed business hook AFTER the complete208/209 tail and replay assertions.
 // Same h/db/qa/contracts, still inside the existing receiptTail disposal scope.
 const family195BusinessReport=family195Business?await runNativeFamily195Business(Object.freeze({version:FAMILY195_BUSINESS_CONTEXT_VERSION,h,db,qa,maker,reviewer,contracts,definition,query,readSnapshot:()=>ownFullCapacity190Snapshot(h)})):null;
 if(family195BusinessReport){assert.equal(family195BusinessReport.passed,true);assert.equal(family195BusinessReport.productionWrites,0);assert.equal(family195BusinessReport.municipalAcceptance,false);assert.equal(family195BusinessReport.scenarioRequestIds.length,5);assert.deepEqual(runtime(),nativeBefore);}
  let positions210=null;
  if(positions210Admission){
   const comparison=await readPositions210Comparison({h,db,admission:positions210Admission});
   const lifecycle212=await verifyLifecycle212Same190({h,db,admission:positions210Admission,contracts});
   const administrative216Browser=positions210Admission.administrative216?await verifyPositionAdministrative216BrowserOn190({h,db,qa,admission:positions210Admission,contracts,lifecycle212,family195Business:family195BusinessReport}):null;
   const finalSidecars=readPositions210SidecarSnapshot({h,db,plan:positions210Sidecar});
   positions210=Object.freeze({version:'positions210-212-same190-source-owned-native-qa.v1',passed:true,sourceCommit:h.sourceCommit,sameCanonical190:true,existingNativePopulation:855,additionalEmployees:0,additionalContracts:0,sourceOwnedSyntheticNorm:true,municipalNormInstalled:false,operationalPair:{makerCapabilities:6,checkerCapabilities:13,contractsReserved:[...positions210Admission.pair.contractsReserved],nativeContextsVerified:positions210Admission.pair.nativeContextsVerified,administrativeQaCheckerReused:false},installation210:positions210Admission.installed,installation211212:positions210Admission.dependentInstallations,...(positions210Admission.administrative216?{installationAdministrative216:positions210Admission.administrative216}:{}),...(administrative216Browser?{administrative216Browser}:{}),sidecarProofs:positions210SidecarProofs,captureSidecarsBijective:true,totalCaptures:finalSidecars.captures.length,totalPositionSidecars:finalSidecars.positions.length,totalDimensionSidecars:finalSidecars.dimensions.length,comparison,lifecycle212,art211NativeFinancialPositiveProven:false,m10Complete:false,positionBrowserProven:administrative216Browser?.passed===true,noeliaAdministrativeFlowProven:administrative216Browser?.passed===true,synthetic:true,productionWrites:0,paymentExecuted:false,municipalAcceptance:false});
  }
  return{...afterCloseBrowser,checks:baselineChecks,annulmentV2Browser,...(family195BusinessReport?{family195Business:family195BusinessReport}:{}),...(positions210?{positions210}:{})};
 }catch(error){receiptPrimary=error;throw error;}finally{try{await receiptTail.dispose();}catch(error){if(receiptPrimary)throw new AggregateError([receiptPrimary,error],'M7_190_RECEIPT_PRIMARY_AND_DISPOSE_FAILURE',{cause:receiptPrimary});throw error;}}
}
