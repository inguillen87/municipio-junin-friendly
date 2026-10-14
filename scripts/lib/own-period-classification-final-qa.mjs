// A separate, fully fictional final-source adoption. No data or observed SQL
// bodies are copied from the parent fixture. All later baseline definitions are
// reproduced from reviewed source generators; this is a semantic fixture, not
// a second claim that the production installation protocol ran here.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {buildFinalAdoptionQa,relocateFinalAdoption} from './final-contract-adoption-qa.mjs';
import {buildFinalContractAdoptionInstallation} from './final-contract-adoption-installation.mjs';
import {buildInactiveJurisdictionInstallation} from './adoption-inactive-jurisdiction-installation.mjs';
import {relocateInactiveJurisdictionInstallation} from './adoption-inactive-jurisdiction-qa.mjs';
import {buildAdoptedOwnNoveltyInstallation} from './adopted-own-novelties-installation.mjs';
import {buildOwnJurisdictionInstallation} from './own-payroll-jurisdiction-installation.mjs';
import {createNoeliaCircuitPsqlQa,relocateNoeliaNoveltyInstallation,relocateNoeliaJurisdictionInstallation} from './noelia-payroll-circuit-qa.mjs';
import {buildSalaryAdministrativeIdentityInstallation} from './salary-administrative-identity-installation.mjs';
import {ADOPTION_ADMINISTRATIVE_CONTEXT} from './adoption-administrative-identity-installation.mjs';
import {buildSalaryAuxiliaryNamespaceSql} from './salary-auxiliary-namespace-installation.mjs';
import {buildOwnRunDateInstallation} from './own-payroll-run-date-installation.mjs';
import {buildOwnSalarySenioritySql} from './own-salary-seniority-installation.mjs';
import {buildOwnPeriodParticipationSql} from './own-period-participation-installation.mjs';
import {buildOwnContractWorkingTimeInstallation} from './own-contract-working-time-installation.mjs';
import {WORKING_TIME_CONSUMER_DEFINITION_HASHES,WORKING_TIME_PRIOR_PINS} from './own-contract-working-time-source-pins.mjs';
import {buildNativeSalaryCapacityInstallation} from './native-salary-capacity-installation.mjs';
import {buildSalaryDayUnitsInstallation} from './salary-day-units-installation.mjs';
import {buildClassificationRegistrationUseInstallation} from './classification-registration-use-installation.mjs';
import {buildOwnContractSalaryConditionsInstallation} from './own-contract-salary-conditions-installation.mjs';
import {buildOwnPayrollAdministrativeOperatorInstallation} from './own-payroll-administrative-operator-installation.mjs';
import {buildCatalogStorageCapacityInstallation,CATALOG_PROVIDER_BUDGET_BYTES} from './catalog-storage-capacity-installation.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {splitPostgresStatements} from './sql-statements.mjs';
import {qaLiteral as q} from './own-payroll-durable-qa.mjs';
import {adoptionPreparationOperation} from '../../lib/internal-employment-adoption.js';
import {municipalAdoptionOperation} from '../../lib/internal-municipal-adoption.js';
import {adoptionPreparationPayload} from '../../assets/employment-adoption-preparation-model.js';
import {periodClassificationBootstrap,preparePeriodClassification,periodClassificationDetail,decidePeriodClassification} from '../../assets/own-period-classification-model.js';
import {emptyOwnReceiptParams} from '../../assets/own-payroll-receipt-model.js';
import {prepareOwnPlanilla} from '../../assets/own-payroll-receipt-planilla-model.js';
import {createNativeSalaryHandler} from '../../api/internal-native-salary.js';
import {createOwnProgramHandler} from '../../api/internal-own-payroll-program.js';
import {createOwnRunHandler} from '../../api/internal-own-payroll-run.js';
import {createOwnLiquidationHandler} from '../../api/internal-own-payroll-liquidation.js';
import {createOwnCloseHandler} from '../../api/internal-own-payroll-close.js';
import {createOwnReceiptHandler} from '../../api/internal-own-payroll-receipts.js';
import {createOwnSalarySeniorityHandler} from '../../api/internal-own-salary-seniority.js';
import {createOwnPeriodParticipationHandler} from '../../api/internal-own-period-participation.js';
import {createOwnContractWorkingTimeHandler} from '../../api/internal-own-contract-working-time.js';
import {createOwnContractSalaryConditionsHandler} from '../../api/internal-own-contract-salary-conditions.js';
import {createOwnPeriodClassificationHandler} from '../../api/internal-own-period-classification.js';

const j=v=>q(JSON.stringify(v))+'::jsonb';
const fileHash=s=>createHash('sha256').update(s.replace(/\r\n?/g,'\n')).digest('hex');
const readyName='municipal_adoption_ready_v1';
const definitionName=s=>/^CREATE (?:OR REPLACE )?FUNCTION public\.(\w+)\(/.exec(s)?.[1]??null;
const replaceable=s=>s.replace(/^CREATE FUNCTION /,'CREATE OR REPLACE FUNCTION ');
const withoutReady=rows=>rows.filter(s=>definitionName(s)!==readyName);
const subjectReason='Encuadre histórico final exclusivamente sintético QA177';
const reviewReason='Revisión independiente final exclusivamente sintética QA177';

// PostgreSQL-shaped source artifacts use TO in the header. Relocate
// only that header, preserving every byte of the separately pinned SQL body.
export function normalizeFinalClassificationQaHeader(source){
 if(!definitionName(source))return source;
 const at=source.search(/\bAS\s+\$/);assert.ok(at>=0,'FINAL_CLASSIFICATION_FUNCTION_HEADER_REQUIRED');
 return source.slice(0,at).replace("SET search_path TO 'pg_catalog', 'public', 'pg_temp'",'SET search_path=pg_catalog,public,pg_temp').replace(/SET (?:\"TimeZone\"|timezone) TO 'UTC'/i,"SET timezone='UTC'")+source.slice(at);
}

// Keep the published guard hashes as the authority. Only undo the explicitly
// known disposable-schema relocation inside their verification expressions.
export function relocateFinalClassificationQaStatement(source,qa){
 assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);let value=qa.normalized(normalizeFinalClassificationQaHeader(source));
 if(source.includes('WORKING_TIME_CONSUMER_CHANGED:')){
  assert.match(source,/DO \$guard\$ BEGIN/);assert.equal(source.match(/WORKING_TIME_CONSUMER_CHANGED:/g)?.length,4);
  const from="SET search_path TO 'pg_catalog', '"+qa.schema+"', 'public', 'pg_temp'",to="SET search_path TO 'pg_catalog', 'public', 'pg_temp'";
  for(const expected of WORKING_TIME_CONSUMER_DEFINITION_HASHES){
   assert.equal(source.split(expected.sha256).length,2,'FINAL_CLASSIFICATION_GUARD_PIN_CHANGED');
   const pin=WORKING_TIME_PRIOR_PINS.find(p=>p.name===expected.name);assert.ok(pin);
   const anchor='pg_get_functiondef(to_regprocedure('+q(pin.signature.replace('public.',qa.schema+'.'))+'))';assert.equal(value.split(anchor).length,2,'FINAL_CLASSIFICATION_GUARD_ANCHOR_CHANGED');
   value=value.replace(anchor,()=> 'replace(replace('+anchor+','+q(from)+','+q(to)+'),'+q(qa.schema+'.')+",'public'||'.')");
  }
  assert.ok(value.includes('WORKING_TIME_PREREQUISITE'));assert.equal(value.match(/WORKING_TIME_CONSUMER_CHANGED:/g)?.length,4);
 }
 // Same finite alias normalization as the existing167/168 QA verifiers.
 const aliases=source.includes('DO $classification_use$')?['updated.prosrc','f.prosrc']:source.includes('DO $catalog_storage$')?['updated.prosrc','after_body']:[];
 const canonical=qa.normalized("replace(p.prosrc,E'\\r\\n',E'\\n')");
 for(const alias of aliases){const anchor="replace("+alias+",E'\\r\\n',E'\\n')";assert.equal(value.split(anchor).length,2,'FINAL_CLASSIFICATION_BODY_ALIAS_CHANGED: '+alias);value=value.replace(anchor,()=>canonical.replaceAll('p.prosrc',alias));}
 return value;
}

// Every repin below comes from two immutable source artifacts. A changed
// runtime body/hash is never accepted as a new authority for this fixture.
function repinReady(ready,beforePins,afterPins){
 for(const before of beforePins??[]){if(before.name===readyName)continue;const after=afterPins?.find(p=>p.signature===before.signature);if(after&&after.sha256!==before.sha256)ready=ready.replaceAll(before.sha256,after.sha256);}
 return ready;
}

export function buildOwnPeriodClassificationFinalQa({read,sourceCommit,major,installation}){
 assert.equal(typeof read,'function');assert.match(sourceCommit,/^[a-f0-9]{40}$/);assert.ok([17,18].includes(major));
 const qa=buildFinalAdoptionQa(major,{contractCount:57,activeCount:2}),options={read,sourceCommit};
 const base=relocateNoeliaNoveltyInstallation(buildAdoptedOwnNoveltyInstallation(options),qa);
 const jurisdiction=relocateNoeliaJurisdictionInstallation(buildOwnJurisdictionInstallation(options),qa,base);
 const inactive=relocateInactiveJurisdictionInstallation(buildInactiveJurisdictionInstallation(options),qa,jurisdiction);
 const final=relocateFinalAdoption(buildFinalContractAdoptionInstallation(options),qa,inactive);
 assert.equal(qa.contractCount,57);assert.equal(qa.activeCount,2);
 // This exactly reproduces relocateFinalAdoption's published full readiness:
 // all final-source checks remain; no runtime inspection or no-op substitute.
 const readySource=final.afterDefinitions.at(-1);
 let ready=qa.normalized(readySource.slice(0,readySource.indexOf(' BEGIN ')))+' BEGIN '+final.readyChecks.map(s=>'EXECUTE '+q(qa.normalized(s))+';').join('\n')+' END $operator$';
 assert.equal(ownInstallationFunctionPin(ready.replace('CREATE FUNCTION '+qa.schema+'.','CREATE FUNCTION public.')).sha256,final.readyPin.sha256);
 const administrative=buildSalaryAdministrativeIdentityInstallation(options),namespace=buildSalaryAuxiliaryNamespaceSql(options),dated=buildOwnRunDateInstallation(options),seniority=buildOwnSalarySenioritySql(options),participation=buildOwnPeriodParticipationSql(options),working=buildOwnContractWorkingTimeInstallation(options),salaryCapacity=buildNativeSalaryCapacityInstallation(options),days=buildSalaryDayUnitsInstallation(options),classificationUse=buildClassificationRegistrationUseInstallation(options),conditions=buildOwnContractSalaryConditionsInstallation(options),operator=buildOwnPayrollAdministrativeOperatorInstallation(options),capacity=buildCatalogStorageCapacityInstallation({...options,verifiedBudgetBytes:CATALOG_PROVIDER_BUDGET_BYTES});
 const groups=[
  {name:'salary-administrative',definitions:[administrative.context,...administrative.mutations],before:administrative.beforePins,after:administrative.afterPins},
  {name:'auxiliary-namespace',definitions:namespace.mutations,before:namespace.beforePins,after:namespace.afterPins},
  {name:'declared-date',definitions:dated.migration,before:dated.beforePins,after:dated.afterPins},
  {name:'seniority',definitions:seniority.statements,before:seniority.beforePins,after:seniority.afterPins},
  {name:'participation',definitions:participation.statements,before:participation.beforePins,after:participation.afterPins},
  {name:'working-time',definitions:working.mutations,before:working.beforePins,after:working.afterPins},
  {name:'native-salary-capacity',definitions:salaryCapacity.mutations,before:salaryCapacity.beforePins,after:salaryCapacity.afterPins},
  {name:'day-units',definitions:days.mutations,before:days.beforePins,after:days.afterPins},
  {name:'adoption-administrative-context',definitions:[ADOPTION_ADMINISTRATIVE_CONTEXT,'REVOKE ALL ON FUNCTION public.employment_adoption_administrative_context_v1(jsonb,text) FROM PUBLIC,municontrol_actions_runtime_app'],before:[],after:[]},
  {name:'classification-registration-use',definitions:[classificationUse.prerequisite,classificationUse.state,...classificationUse.mutations,classificationUse.afterCheck],before:classificationUse.beforePins,after:classificationUse.afterPins},
  {name:'salary-conditions-full-response',definitions:conditions.mutations,before:conditions.beforePins,after:conditions.afterPins},
  {name:'administrative-run-operator',definitions:operator.migration,before:operator.beforePins,after:operator.afterPins},
  // The1GiB budget is a declared disposable-fixture value. State retains the
  // normal guard and sets its transaction-local budget before the168 mutation.
  {name:'catalogue-capacity',definitions:[capacity.state,...capacity.mutations,capacity.afterCheck],before:capacity.beforePins,after:capacity.afterPins},
 ];
 // Make the complete canonical bridge explicit instead of presuming that an
 // older predecessor fixture happened to seed every current private helper.
 const direct=new Set(groups.flatMap(g=>g.definitions.map(definitionName)).filter(Boolean));
 const needed=installation.prerequisitePins.concat(installation.beforePins).filter(p=>p.name!==readyName&&!direct.has(p.name));
 const sourceFiles=['scripts/migrations/103-native-employment-catalog.sql','scripts/migrations/112-native-salary-definitions.sql','scripts/migrations/122-own-payroll-programs.sql','scripts/migrations/123-own-payroll-runs.sql','scripts/migrations/138-adopted-fixed-novelties.sql','scripts/migrations/143-own-payroll-jurisdiction-snapshot.sql'];
 const sourceArtifacts=sourceFiles.map(file=>{const text=read(file).replace(/\r\n?/g,'\n');if(installation.sourceHashes[file])assert.equal(fileHash(text),installation.sourceHashes[file],'FINAL_CLASSIFICATION_BASE_SOURCE_CHANGED: '+file);return {file,text};});
 // The current close/detail consumer is a reviewed source derivation of125,
 //141 and143. Use that canonical generated artifact, never a database body.
 sourceArtifacts.push({file:'source-generated:own-period-classification.originals',text:withoutReady(installation.originals).join(';\n')});
 const candidates=sourceArtifacts.flatMap(a=>splitPostgresStatements(a.text).map(s=>s.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim()).filter(s=>definitionName(s)).map(s=>{const source=normalizeFinalClassificationQaHeader(s);return {source,file:a.file,pin:ownInstallationFunctionPin(source)};}));
 const bridgePins=[],bridge=[];
 for(const target of needed){
  const expected=target.name==='native_employment_catalog_capacity_v1'?capacity.beforePins[0]:target;
  const matches=candidates.filter(c=>c.pin.signature===expected.signature&&c.pin.sha256===expected.sha256);assert.ok(matches.length,'FINAL_CLASSIFICATION_UNSEEDED_DEPENDENCY: '+target.name);
  const selected=matches[0];for(const key of ['argNames','defaults','resultType','language','returnsSet','strict','definer','volatility','config'])assert.deepEqual(selected.pin[key],expected[key],'FINAL_CLASSIFICATION_BASE_METADATA: '+target.name+' '+key);
  bridge.push(replaceable(selected.source),'REVOKE ALL ON FUNCTION '+expected.signature+' FROM PUBLIC,municontrol_actions_runtime_app');if(expected.runtime)bridge.push('GRANT EXECUTE ON FUNCTION '+expected.signature+' TO municontrol_actions_runtime_app');bridgePins.push({name:target.name,sourceFile:selected.file,sourceSha256:fileHash(sourceArtifacts.find(a=>a.file===selected.file).text),before:expected.sha256,after:target.sha256});
 }
 groups.unshift({name:'canonical-base-prerequisites',definitions:bridge,before:[],after:[]});
 const statements=[];
 for(const group of groups){ready=repinReady(ready,group.before,group.after);statements.push(...withoutReady(group.definitions).map(s=>relocateFinalClassificationQaStatement(replaceable(s),qa)));}
 // The immutable final-source adapter suite does not use the operational v7
 // readiness chain. Validate every relevant published payroll source directly
 // in addition to all retained final144/adoption checks.
 const priorPins=installation.prerequisitePins.concat(installation.beforePins).filter(p=>p.name!==readyName);
 ready=ready.replace(' BEGIN ',()=> ' BEGIN EXECUTE '+q(qa.normalized(pinsCheck(priorPins,'FINAL_PERIOD_CLASSIFICATION_BASELINE_METADATA')))+';');
 statements.push(replaceable(ready));
 const afterReady=repinReady(ready,installation.beforePins,installation.afterConsumerPins).replace(' BEGIN ',()=> ' BEGIN EXECUTE '+q(qa.normalized(pinsCheck(installation.newPins,'FINAL_PERIOD_CLASSIFICATION_NEW_METADATA')))+';');
 const beforeReadyPin={...ownInstallationFunctionPin(ready.replace('CREATE FUNCTION '+qa.schema+'.','CREATE FUNCTION public.')),signature:qa.schema+'.municipal_adoption_ready_v1()',runtime:false};
 const afterReadyPin={...ownInstallationFunctionPin(afterReady.replace('CREATE FUNCTION '+qa.schema+'.','CREATE FUNCTION public.')),signature:qa.schema+'.municipal_adoption_ready_v1()',runtime:false};
 const beforeCheck=qa.normalized(pinsCheck(priorPins,'FINAL_PERIOD_CLASSIFICATION_BASELINE_METADATA'))+';'+pinsCheck([beforeReadyPin],'FINAL_PERIOD_CLASSIFICATION_READY_METADATA');
 const afterPins=installation.prerequisitePins.concat(installation.afterConsumerPins,installation.newPins).filter(p=>p.name!==readyName);
 const afterCheck=qa.normalized(pinsCheck(afterPins,'FINAL_PERIOD_CLASSIFICATION_SOURCE_METADATA'))+';'+pinsCheck([afterReadyPin],'FINAL_PERIOD_CLASSIFICATION_READY_METADATA');
 const classification=[...installation.migration,...withoutReady(installation.changed).map(replaceable)].map(s=>relocateFinalClassificationQaStatement(s,qa)).concat(replaceable(afterReady));
 assert.ok(classification.every(s=>!/^\s*(?:BEGIN|COMMIT|ROLLBACK)\b/i.test(s)));
 return {qa,base,jurisdiction,inactive,final,groups:groups.map(g=>g.name),bridgePins,baseline:statements,classification,beforeCheck,afterCheck,technicalInstallationProtocol:false,connects:false,executesSql:false};
}

function makeHandlers({qa,db}){
 let current=qa.actors.maker;
 const caps=[...new Set([...qa.caps,'payroll.parameter.read','payroll.parameter.prepare','payroll.parameter.approve'])];
 const adapter={query:async(query,values)=>{
  assert.match(query,/^SELECT public\.(?:native_salary|own_program|own_run|own_liquidation|own_close|own_receipt|own_seniority|own_participation|own_working_time|own_salary_conditions|own_period_classification)_\w+\([\s\S]+\) AS result$/);
  const rendered=query.replaceAll('public.',qa.schema+'.').replace(/\$(\d+)/g,(_,n)=>{assert.ok(Number(n)>0&&Number(n)<=values.length);return values[Number(n)-1]===null?'NULL':q(values[Number(n)-1]);});
  return [{result:await db.run(rendered,true)}];
 }};
 const env={INTERNAL_APP_ORIGIN:'https://final-period-classification-qa.example'},deps={env,requireAccess:()=>({mode:'managed',principal:{user:{email:current.actorEmail},tenant:{source:'membership',id:current.tenantId,membershipId:current.membershipId,effectiveCapabilities:caps}}}),sessionFor:()=>({email:current.actorEmail,id:current.actorSessionId,version:current.actorSessionVersion,releaseSha:current.releaseSha}),getSql:()=>adapter};
 const handlers={salary:createNativeSalaryHandler(deps),program:createOwnProgramHandler(deps),run:createOwnRunHandler(deps),liquidation:createOwnLiquidationHandler(deps),close:createOwnCloseHandler(deps),receipt:createOwnReceiptHandler(deps),seniority:createOwnSalarySeniorityHandler(deps),participation:createOwnPeriodParticipationHandler(deps),workingTime:createOwnContractWorkingTimeHandler(deps),salaryConditions:createOwnContractSalaryConditionsHandler(deps),classification:createOwnPeriodClassificationHandler(deps)};
 const api=async(kind,{query={resource:'bootstrap'},key=randomUUID(),body,previewParams,expected=200}={})=>{
  assert.equal(typeof handlers[kind],'function');const res={setHeader(){},status(n){this.statusCode=n;return this;},json(v){this.value=v;return this;}},posted=!!(body||previewParams);
  await handlers[kind]({method:posted?'POST':'GET',url:'/api/final-qa-'+kind+(posted?'':'?'+new URLSearchParams(query)),query:posted?{}:query,headers:posted?{origin:env.INTERNAL_APP_ORIGIN,'content-type':'application/json','idempotency-key':key}:{},...(posted?{body:JSON.stringify(previewParams?{operation:'preview',params:previewParams}:{operation:kind==='run'?'calculate':'command',payload:body})}:{})},res);
  assert.equal(res.statusCode,expected,JSON.stringify(res.value));return res.value.data??res.value;
 };
 return {handlers,adapter,env,api,setActor:a=>{current=a;},caps};
}

export async function finalAdoptedHistory({h,installation,major,transport='local'}){
 assert.ok([17,18].includes(major));assert.ok(['local','ci'].includes(transport));
 const {prepareOwnPeriodClassificationFixtureFacts,publishOwnPeriodClassificationFixtureProgram}=await import('./own-period-classification-qa.mjs');
 const blueprint=buildOwnPeriodClassificationFinalQa({...h.options,major,installation}),{qa}=blueprint;
 assert.notEqual(qa.schema,h.qa.schema);
 const folder=path.join(h.destination,'final-adopted-history');assert.ok(!fs.existsSync(folder));fs.mkdirSync(folder);
 const db=createNoeliaCircuitPsqlQa({major,port:55400+major,schema:qa.schema,pins:qa.pins,transport,browser:'none',executable:h.db.executable});
 let step=0,seeded=false,proof;
 const tx=(rows,end='COMMIT')=>'BEGIN ISOLATION LEVEL REPEATABLE READ;SET LOCAL TIME ZONE \'UTC\';SET LOCAL statement_timeout=\'180s\';SET LOCAL lock_timeout=\'2s\';SET LOCAL search_path=pg_catalog,'+qa.schema+',public,pg_temp;DO $destination$ BEGIN '+qa.pins+' END $destination$;'+rows.join(';\n')+';'+end+';';
 const sql=async source=>{
  const file=path.join(folder,String(++step).padStart(3,'0')+'.sql');fs.writeFileSync(file,source,{flag:'wx'});
  const r=spawnSync(db.executable,[...db.args,'--no-password','-f',file],{encoding:'utf8',windowsHide:true,env:db.environment,maxBuffer:12*1024*1024});fs.writeFileSync(file+'.log',r.stdout+r.stderr);assert.equal(r.status,0,r.stderr.slice(-3000));
  const last=r.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);return last?.startsWith('{')||last?.startsWith('[')?JSON.parse(last):null;
 };
 const parentState=()=>h.db.run('SELECT jsonb_build_object(\'people\',(SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY id),\'[]\')::text) FROM person_identity p),\'contracts\',(SELECT md5(coalesce(jsonb_agg(to_jsonb(c) ORDER BY id),\'[]\')::text) FROM employment_contract c),\'captures\',(SELECT md5(coalesce(jsonb_agg(to_jsonb(c) ORDER BY id),\'[]\')::text) FROM own_payroll_run_capture c),\'results\',(SELECT md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY capture_id),\'[]\')::text) FROM own_payroll_run_result r),\'decisions\',(SELECT md5(coalesce(jsonb_agg(to_jsonb(e) ORDER BY id),\'[]\')::text) FROM own_payroll_liquidation_event e),\'close\',(SELECT md5(coalesce(jsonb_agg(to_jsonb(e) ORDER BY id),\'[]\')::text) FROM own_payroll_close_event e),\'receipts\',(SELECT md5(coalesce(jsonb_agg(to_jsonb(e) ORDER BY id),\'[]\')::text) FROM own_payroll_receipt_event e))');
 const schemaInventory=()=>h.db.run("SELECT coalesce(jsonb_agg(nspname ORDER BY nspname COLLATE \"C\"),'[]') FROM pg_namespace WHERE nspname~'^mc_qa_'");
 const parentBefore=await parentState(),schemasBefore=await schemaInventory();assert.ok(!schemasBefore.includes(qa.schema));
 const sourceState=()=>db.run("SELECT jsonb_build_object('contracts',(SELECT md5(coalesce(jsonb_agg(to_jsonb(c) ORDER BY id),'[]')::text) FROM employment_contract c),'registrations',(SELECT md5(coalesce(jsonb_agg(to_jsonb(n) ORDER BY id),'[]')::text) FROM native_employee_registration n),'proposals',(SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY id),'[]')::text) FROM employment_adoption_proposal p),'decisions',(SELECT md5(coalesce(jsonb_agg(to_jsonb(d) ORDER BY id),'[]')::text) FROM employment_adoption_decision d),'applications',(SELECT md5(coalesce(jsonb_agg(to_jsonb(a) ORDER BY contract_id),'[]')::text) FROM employment_adoption_application a),'seals',(SELECT md5(coalesce(jsonb_agg(to_jsonb(s) ORDER BY proposal_id),'[]')::text) FROM employment_adoption_seal s))");
 const identity=a=>({principal:{user:{email:a.actorEmail},tenant:{source:'membership',id:a.tenantId,membershipId:a.membershipId,effectiveCapabilities:qa.caps}},session:{email:a.actorEmail,id:a.actorSessionId,version:a.actorSessionVersion,releaseSha:a.releaseSha}});
 const maker=identity(qa.actors.maker),checker=identity(qa.actors.checker);
 try{
  await sql(qa.sql);seeded=true;assert.deepEqual(await schemaInventory(),schemasBefore.concat(qa.schema).sort());
  for(const rows of [blueprint.base.operator.consumers.statements,blueprint.base.operator.statements,blueprint.base.installation,blueprint.jurisdiction.installation,blueprint.inactive.installation,[qa.sourceFixture],blueprint.final.installation])await sql(tx(rows));
  const selected={revisionId:qa.revision,packageSha256:qa.packageSha},boot=await adoptionPreparationOperation(db,maker.principal,maker.session,'final-bootstrap',selected);
  assert.equal(boot.review.total,57);assert.ok(boot.review.rows.every(r=>r.sourceIssues.length===0));
  const body=await adoptionPreparationPayload(boot.review,boot.catalogVersion,'','Constancia final exclusivamente sintética QA177','Adopción final completa exclusivamente sintética QA177');assert.equal(body.version,'employment-adoption-input.v3');assert.equal(body.rows.length,57);
  const key=randomUUID(),pending=await adoptionPreparationOperation(db,maker.principal,maker.session,'propose',{key,body});
  const stage=await municipalAdoptionOperation(db,checker.principal,checker.session,'review',{id:pending.receipt.proposalId}),decision={reviewVersion:stage.reviewVersion,review:{proposalId:pending.receipt.proposalId,proposalVersion:pending.receipt.proposalVersion,sourceContextVersion:body.sourceContextVersion,catalogVersion:body.catalogVersion,decision:'approve',reason:reviewReason},reviewConfirmed:true};
  await assert.rejects(municipalAdoptionOperation(db,maker.principal,maker.session,'command',{key:randomUUID(),body:decision}));
  const adopted=await municipalAdoptionOperation(db,checker.principal,checker.session,'command',{key:randomUUID(),body:decision});assert.equal(adopted.receipt.effects.contractsAdopted,57);assert.equal(adopted.receipt.effects.payrollCalculated,false);
  const originals=await sourceState();
  await sql(tx(["ALTER TABLE tenant_action_employment_link ADD COLUMN IF NOT EXISTS revoked_at timestamptz",...blueprint.baseline,blueprint.beforeCheck]));assert.deepEqual(await sourceState(),originals);
  await sql(tx([...blueprint.classification,blueprint.afterCheck]));assert.deepEqual(await sourceState(),originals);
  const f=makeHandlers({qa,db}),child={...h,qa,db,sql:source=>sql(tx([source])),...f},actors=qa.actors;
  // Current catalogue additions are declared fictional input and independently
  // reviewed. They do not replace the immutable final-source facts.
  let cb=await db.run('SELECT native_employment_catalog_bootstrap_v1('+j(actors.maker)+')',true);
  const added=[{kind:'categories',key:'categories:1:7',code:'7',label:'Clase histórica exclusivamente sintética QA177',agreementCode:'1'},{kind:'sectors',key:'sectors::21',code:'21',label:'Repartición histórica exclusivamente sintética QA177',agreementCode:null}],items=[...cb.catalog.items,...added];
  const cp=await db.run('SELECT native_employment_catalog_propose_v1('+j(actors.maker)+','+j({scopeVersion:cb.scopeVersion,baseVersion:cb.catalog.version,items,reason:subjectReason})+','+q(randomUUID())+'::uuid)',true);cb=await db.run('SELECT native_employment_catalog_bootstrap_v1('+j(actors.checker)+')',true);await db.run('SELECT native_employment_catalog_review_v1('+j(actors.checker)+','+j({scopeVersion:cb.scopeVersion,proposalId:cp.proposalId,decision:'approve',reason:reviewReason})+','+q(randomUUID())+'::uuid)',true);
  const dates=await db.run("SELECT jsonb_build_object('createdDate',to_char(min(n.created_at) AT TIME ZONE 'America/Argentina/Mendoza','YYYY-MM-DD'),'period',to_char((min(n.created_at) AT TIME ZONE 'America/Argentina/Mendoza')::date-interval '1 month','YYYY-MM'),'lastDate',to_char(date_trunc('month',min(n.created_at) AT TIME ZONE 'America/Argentina/Mendoza')-interval '1 day','YYYY-MM-DD'),'today',to_char(clock_timestamp() AT TIME ZONE 'America/Argentina/Mendoza','YYYY-MM-DD')) FROM native_employee_registration n JOIN employment_adoption_application a ON a.registration_id=n.id");
  assert.equal(dates.createdDate,dates.today);const period=dates.period,targets=[qa.ids.makerContract,qa.ids.checkerContract].sort();
  const eligible=await db.run('SELECT coalesce(jsonb_agg(c.id ORDER BY c.id),\'[]\') FROM employment_adoption_application a JOIN employment_contract c ON c.id=a.contract_id WHERE c.status=\'active\'');assert.deepEqual(eligible,targets);
  await prepareOwnPeriodClassificationFixtureFacts(child,actors,targets,period);await publishOwnPeriodClassificationFixtureProgram(child,actors,period);
  const declaration={agreementCode:'1',categoryCode:'7',organizationId:'10',sectorCode:'21',jurisdictionCode:'55',startDate:'2001-02-03',endDate:null,effectiveFrom:period+'-01',effectiveUntil:dates.lastDate,documentDate:dates.today,documentReference:subjectReason};
  let provenanceValue=null;
  for(const contractId of targets){
   child.setActor(actors.maker);const b=periodClassificationBootstrap(await child.api('classification',{query:{resource:'bootstrap',contractId,period}})),p=b.preparation.source.provenance;
   const applied=await db.run('SELECT jsonb_build_object(\'decisionId\',a.decision_id,\'registrationId\',a.registration_id,\'finalRevision\',r.before_snapshot#>\'{source,finalRevision}\',\'sealSha256\',s.facts_sha256) FROM employment_adoption_application a JOIN employment_adoption_decision d ON d.id=a.decision_id JOIN employment_adoption_proposal r ON r.id=d.proposal_id JOIN employment_adoption_seal s ON s.proposal_id=r.id WHERE a.contract_id='+q(contractId)+'::uuid');
   assert.equal(p.kind,'employment_adoption_final');assert.equal(p.adoptionProposalId,pending.receipt.proposalId);assert.equal(p.adoptionReviewId,applied.decisionId);assert.equal(p.registrationId,applied.registrationId);assert.equal(p.sealSha256,applied.sealSha256);assert.deepEqual(p.finalRevision,applied.finalRevision);assert.equal(p.finalRevision.revisionId,qa.revision);assert.equal(p.finalRevision.packageSha256,qa.packageSha);assert.equal(Object.keys(p.finalRevision).length,7);provenanceValue=p;
   const command=preparePeriodClassification(b.preparation,declaration,subjectReason),proposed=await child.api('classification',{body:command,expected:201});child.setActor(actors.checker);
   const review=await child.api('classification',{query:{resource:'bootstrap',contractId,period}}),detail=await periodClassificationDetail(await child.api('classification',{query:{resource:'detail',id:proposed.proposalId}}));await child.api('classification',{body:await decidePeriodClassification(review,detail,'approve',reviewReason),expected:201});
  }
  child.setActor(actors.maker);const runBoot=await child.api('run'),runBody={...h.oldBody,period,scopeVersion:runBoot.scopeVersion,programVersion:runBoot.programVersion,selection:{kind:'contracts',values:targets},populationDomain:'native_registered'},run=await child.api('run',{body:runBody,expected:201});
  assert.equal(run.saved.result.employeeCount,2);assert.ok(run.saved.result.employeeTotals.every(t=>t.net==='500.22'));assert.equal(run.payload.sourceInventory.periodClassifications.rows.length,2);for(const row of run.payload.sourceInventory.periodClassifications.rows){assert.equal(row.basis,'approved_own_period_classification');assert.equal(row.provenance.kind,'employment_adoption_final');assert.equal(row.provenance.finalRevision.revisionId,qa.revision);assert.deepEqual(row.definition,declaration);}
  child.setActor(actors.checker);const ld=await child.api('liquidation',{query:{resource:'detail',id:run.id}});await child.api('liquidation',{body:{runId:run.id,resultSha256:run.saved.resultSha256,scopeVersion:ld.scopeVersion,stateVersion:ld.stateVersion,command:'confirm',selection:{kind:'all',values:[]},reason:reviewReason,reviewConfirmed:true},expected:201});
  const cd=await child.api('close',{query:{resource:'detail',period,liquidationType:'monthly'}}),closed=await child.api('close',{body:{period,liquidationType:'monthly',scopeVersion:cd.scopeVersion,stateVersion:cd.stateVersion,selection:{kind:'all',values:[]},command:'close',groupId:null,reason:reviewReason,reviewConfirmed:true},expected:201});assert.equal(closed.snapshot.populationCount,2);assert.equal(closed.snapshot.employeeCount,2);assert.ok(closed.snapshot.employees.every(e=>e.departmentCode==='21'&&e.jurisdiction.basis==='captured_own_period_classification'&&e.jurisdiction.code==='55'));
  child.setActor(actors.maker);const params={...emptyOwnReceiptParams(period),contracts:targets,issuer:{name:'Municipio exclusivamente sintético final QA177',taxId:'30990000001',address:'Domicilio exclusivamente ficticio final QA177'}},preview=await child.api('receipt',{previewParams:params});assert.equal(preview.snapshot.recordCount,2);
  const receiptBody={command:'prepare',scopeVersion:preview.scopeVersion,sourceVersion:preview.snapshot.sourceVersion,params,batchId:null,batchSha256:null,reason:subjectReason,reviewConfirmed:false},emission=await child.api('receipt',{body:receiptBody,expected:201});child.setActor(actors.checker);const rb=await child.api('receipt',{query:{resource:'batch',id:emission.batchId}}),rp=await child.api('receipt',{previewParams:params});await child.api('receipt',{body:{...receiptBody,command:'approve',scopeVersion:rp.scopeVersion,sourceVersion:rp.snapshot.sourceVersion,params:null,batchId:emission.batchId,batchSha256:rb.snapshotSha256,reason:reviewReason,reviewConfirmed:true},expected:201});
  const issued=await child.api('receipt',{query:{resource:'batch',id:emission.batchId}}),group=await child.api('close',{query:{resource:'group',id:closed.groupId}}),planilla=await prepareOwnPlanilla(issued,[group],'55');assert.equal(planilla.total,2);assert.equal(planilla.selected,2);assert.ok(planilla.records.every(r=>r.departmentCode==='21'&&r.jurisdiction==='55'&&r.totals.net==='500.22'));
  assert.deepEqual(await sourceState(),originals);assert.deepEqual(await parentState(),parentBefore);
  proof={version:'own-period-classification-final-qa.v1',actualSql:true,actualHandlers:true,normalFinalApplication:true,historicalCaptureConfirmedClosedReceipt:true,technicalInstallationProtocol:false,predecessorAdapters:true,finalInputVersion:body.version,cohort:57,active:2,inactive:55,period,originalRegistrationDate:dates.createdDate,declaredHistoricalCategory:'7',declaredHistoricalSector:'21',declaredHistoricalJurisdiction:'55',provenance:provenanceValue,sourceAndApplicationsPreserved:true,parentCapturesAndResultsPreserved:true,productiveBusinessWrites:0,syntheticOnly:true};
 }finally{
  if(seeded){assert.equal(await db.run('SELECT to_jsonb(count(*)) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND application_name='+q(db.applicationName)),0);await sql(tx(['DROP SCHEMA '+qa.schema+' CASCADE']));assert.deepEqual(await parentState(),parentBefore);assert.deepEqual(await schemaInventory(),schemasBefore);if(proof){proof.syntheticSchemaRemoved=true;proof.priorSchemaInventoryPreserved=true;}}
 }
 assert.ok(proof?.syntheticSchemaRemoved);fs.writeFileSync(path.join(folder,'result.json'),JSON.stringify(proof,null,2)+'\n');return proof;
}
