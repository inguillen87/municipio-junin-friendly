// SOURCE ONLY. Pure supplemental for the canonical190 synthetic foundation.
// No transport, SQL invocation, application handler, seed, grant or actor writer.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
import {buildOwnBankAccountsInstallation,assertOwnBankAccountsDurability} from './own-bank-accounts-installation.mjs';
import {buildOwnAccountingInstallation,assertOwnAccountingDurability} from './own-accounting-installation.mjs';
import {buildOwnImputationInstallation,assertOwnImputationDurability} from './own-imputation-installation.mjs';
import {buildOwnJournalInstallation,assertOwnJournalDurability} from './own-journal-installation.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const lf=value=>value.replace(/\r\n?/g,'\n');
const schemaPattern=/^mc_qa_fixed_092_[a-f0-9]{32}$/;
const contextNames=['own_run_context_v1','own_close_context_v1'];
// Filled from Git object fdafac9, never from a live PostgreSQL catalogue.
const expectedSources=Object.freeze({
  "scripts/lib/sql-statements.mjs": "d81477c5aed918e944aefe16d05015080acc4fe543059cbf15e2c69e9f5201c2",
  "scripts/lib/own-payroll-installation.mjs": "6ad8f07733adfb17b6a32a6efd228073bfb3566844b858167581e2d7896bb3d0",
  "scripts/lib/native-leave-installation.mjs": "57d7f79c358665dc208dfcb9b0d7b2a2ecebaba84dfb6c6057bb3acef6bb25ef",
  "scripts/lib/own-bank-accounts-installation.mjs": "63eff497a07e8ec3ad986586fc98f17f8320b79da3d621ca3b5374663efa193a",
  "scripts/lib/own-accounting-installation.mjs": "f43cc7f43c489f5bf5fee00b744ea96c3deeae7cf41b3909f0e391856f0ccce9",
  "scripts/lib/own-imputation-installation.mjs": "64a6cd8045764ea3bd4d49a136884ba8dd14a6ae20ed8aea2dc31792b328a54d",
  "scripts/lib/own-journal-installation.mjs": "c0b66469524d31ccd5a35f4e8939a579e2ef1962ecc4d14fa008fee9338fda51",
  "scripts/lib/own-monthly-day-fixed-composition-qa.mjs": "0a3a62f077dc150241bd1d339e699a5f0b9d229fb233e54b55057e75b6fe8f66",
  "scripts/migrations/007-action-center-read-facades.sql": "d0e04ca20e3b67518d1340fe38d409fc3c7b339da4dee20e7a6850ebadbc8a1e",
  "scripts/migrations/103-native-employment-catalog.sql": "759bde35236dc0add938e55664f0addb3c301f79e4ecfdf0771300dbd9795cd6",
  "scripts/migrations/112-native-salary-definitions.sql": "da72986b8eb8b834f8f11f0cdfd793708eba90c96de59c399ff063fe31a95cd3",
  "scripts/migrations/122-own-payroll-programs.sql": "edaf70ef87f9ac3de170e079c460d38c4188b36de349b5c58808f5a09a9f9785",
  "scripts/migrations/123-own-payroll-runs.sql": "a9fe1129e921bb7c01985b8caadb009f6086aef9866e2298398175f7f25b4b6b",
  "scripts/migrations/125-own-payroll-close.sql": "443127dd55b9be5f37da47af303fcdd599b4d5dc0aad0a319a18253f8f139af5",
  "scripts/migrations/147-own-payroll-accounting-mappings.sql": "7ad5a7e143a2e03437b5e3077581c32220a730bc3f72f2a6711fb2bc70ab2360",
  "scripts/migrations/148-own-payroll-imputation.sql": "aff78937747b45cdcf36b35a308f46c31fc6329e8c08f8f6fac83f96b3753bf9",
  "scripts/migrations/149-own-bank-accounts.sql": "73b48664acb16f2a5435dcfa03d28d4db6e37906ff2c81493ee0848e3433aa41",
  "scripts/migrations/152-own-payroll-journal.sql": "1e79fda4c8b2636d040f0d8c639743095fa40e18c2a850e94ac3735672afa42d",
  "scripts/migrations/176-own-payroll-administrative-operator.sql": "f75fa2cddf6fe2e837044e73c6465eecdf41fbad7ec740745527e1bd54b94732"
});
const stageDefinitions=Object.freeze([
  [149,buildOwnBankAccountsInstallation,assertOwnBankAccountsDurability],
  [147,buildOwnAccountingInstallation,assertOwnAccountingDurability],
  [148,buildOwnImputationInstallation,assertOwnImputationDurability],
  [152,buildOwnJournalInstallation,assertOwnJournalDurability],
]);
const strip=source=>source.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim();
const body=source=>{
  const found=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?\s*$/.exec(source);
  assert.ok(found,'MONTHLY_NATIVE_TAIL_FUNCTION_BODY_REQUIRED');return found[2];
};
// A projected CREATE changes prosrc whenever a body contains qualified calls.
// Derive every new-family expected hash through the SAME canonical normalizer
// used on its DDL. No installed pg_proc data is accepted by this function.
export function createMonthlyNativeTailProjection({definitions,normalized}){
  assert.equal(typeof normalized,'function');
  assert.ok(Array.isArray(definitions)&&definitions.length===51,'MONTHLY_NATIVE_TAIL_ALL_51_DEFINITIONS_REQUIRED');
  const rows=definitions.map(definition=>({definition,pin:ownInstallationFunctionPin(definition)}));
  assert.equal(new Set(rows.map(row=>row.pin.signature)).size,51,'MONTHLY_NATIVE_TAIL_DUPLICATE_DEFINITION');
  const projectedBase=rows.map(row=>normalized(row.definition)),hashes={};
  const apply=source=>{let result=source;for(const [from,to]of Object.entries(hashes))result=result.replaceAll(from,to);return result;};
  let stable=false;
  for(let pass=0;pass<16;pass++){
    let changed=false;
    for(let index=0;index<rows.length;index++){
      const from=rows[index].pin.sha256,to=hash(body(apply(projectedBase[index])));
      if(Object.hasOwn(hashes,from)){
        const duplicates=rows.filter(row=>row.pin.sha256===from);
        if(duplicates.length>1)assert.ok(duplicates.every(row=>hash(body(apply(normalized(row.definition))))===to),
          'MONTHLY_NATIVE_TAIL_AMBIGUOUS_BODY_PROJECTION');
      }
      if(hashes[from]!==to){hashes[from]=to;changed=true;}
    }
    if(!changed){stable=true;break;}
  }
  assert.ok(stable,'MONTHLY_NATIVE_TAIL_PROJECTION_HASH_GRAPH_CYCLE');
  for(const [from,to]of Object.entries(hashes))assert.ok(from===to||!Object.hasOwn(hashes,to),'MONTHLY_NATIVE_TAIL_PROJECTION_HASH_ALIAS');
  const projected=source=>apply(normalized(source));
  const ledger=rows.map(row=>{
    const localDefinition=projected(row.definition),expected=hash(body(localDefinition));
    assert.equal(hashes[row.pin.sha256],expected,'MONTHLY_NATIVE_TAIL_PROJECTED_BODY_MISMATCH');
    return {name:row.pin.name,sourceSignature:row.pin.signature,expectedQaSignature:normalized(row.pin.signature),sourceProsrcSha256:row.pin.sha256,
      sourceDefinitionSha256:hash(row.definition),expectedQaProsrcSha256:expected,
      projectedDefinitionSha256:hash(localDefinition),bodyChanged:expected!==row.pin.sha256};
  });
  return {version:'monthly-native-tail-projection.v1',normalized:projected,hashes,ledger,
    definitions:51,sourceDerived:true,observedCatalogueUsed:false};
}
function definition(source,name){
  const found=splitPostgresStatements(source).map(strip).filter(value=>
    new RegExp('^CREATE(?: OR REPLACE)? FUNCTION public\\.'+name+'\\(').test(value));
  assert.equal(found.length,1,'MONTHLY_NATIVE_TAIL_SOURCE_DEFINITION:'+name);
  return found[0];
}
function privatePin(source){return {...ownInstallationFunctionPin(source),runtime:false};}
function exactOnce(source,oldValue,newValue,label){
  assert.equal(source.split(oldValue).length,2,'MONTHLY_NATIVE_TAIL_EXACT_ANCHOR:'+label);
  return source.replace(oldValue,()=>newValue);
}
function stageTransactionGuard(readOnly){
  return `DO $monthly_native_tail_transaction$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>${readOnly?"'on'":"'off'"} THEN RAISE EXCEPTION 'MONTHLY_NATIVE_TAIL_TRANSACTION_REQUIRED';END IF;END $monthly_native_tail_transaction$`;
}
function sourceDefinitions(qa){
  const definitions=qa.qa193?.foundation?.base?.definitions;
  assert.ok(Array.isArray(definitions)&&definitions.length>0,'MONTHLY_NATIVE_TAIL_CANONICAL_SOURCE_CLOSURE_REQUIRED');
  const result=new Map();
  for(const value of definitions){
    const header=/^CREATE(?: OR REPLACE)? FUNCTION public\.(\w+)\(/.exec(strip(value));
    if(header)result.set(header[1],[...(result.get(header[1])??[]),value]);
  }
  return result;
}
function verifyPrerequisiteSource({pin,definitions,stage}){
  const candidates=definitions.get(pin.name);
  assert.ok(candidates,'MONTHLY_NATIVE_TAIL_PREREQUISITE_SOURCE_MISSING:'+stage+':'+pin.name);
  assert.equal(candidates.length,1,'MONTHLY_NATIVE_TAIL_AMBIGUOUS_PREREQUISITE_SOURCE:'+stage+':'+pin.name);
  const candidate=candidates[0];
  // Runtime ACL is supplied by the canonical prerequisite contract, never
  // inferred from an installed catalogue or weakened after a failure.
  assert.deepEqual({...ownInstallationFunctionPin(candidate),runtime:pin.runtime},pin,
    'MONTHLY_NATIVE_TAIL_PREREQUISITE_SOURCE_CHANGED:'+stage+':'+pin.name);
}
function wrapPhase(values,{preflight,composedPreflight,contextCheck,readOnly,normalized}){
  assert.equal(values.filter(value=>value===preflight).length,1,'MONTHLY_NATIVE_TAIL_PHASE_PREFLIGHT_REQUIRED');
  const mapped=values.map(value=>value===preflight?composedPreflight:value);
  const proof=mapped.at(-1);
  assert.ok(/^SELECT jsonb_build_object\(/.test(proof),'MONTHLY_NATIVE_TAIL_PROOF_MUST_REMAIN_LAST');
  // All original absence, table, ACL, row, trigger, dependency and whole-prior
  // conservation statements remain in order. Context guards are additive.
  return [stageTransactionGuard(readOnly),contextCheck,...mapped.slice(0,-1),contextCheck,proof].map(normalized);
}

export function buildMonthlyNativeTailInstallation({qa,read,sourceCommit}){
  assert.equal(qa?.version,'own-monthly-day-fixed-composition-qa.v1','MONTHLY_NATIVE_TAIL_FIXED_FOUNDATION_REQUIRED');
  assert.match(qa.schema,schemaPattern);
  assert.equal(typeof qa.normalized,'function');
  assert.match(sourceCommit??'',/^[a-f0-9]{40}$/);
  assert.equal(qa.sourceCommit,sourceCommit,'MONTHLY_NATIVE_TAIL_COMMIT_CHANGED');
  assert.equal(typeof read,'function');
  assert.equal(Object.keys(expectedSources).length,19,'MONTHLY_NATIVE_TAIL_UNFROZEN_SOURCE');
  const sourceHashes={},cache=new Map(),checkedRead=file=>{
    assert.ok(Object.hasOwn(expectedSources,file),'MONTHLY_NATIVE_TAIL_UNREVIEWED_SOURCE:'+file);
    if(!cache.has(file)){
      const value=lf(read(file));assert.equal(hash(value),expectedSources[file],'MONTHLY_NATIVE_TAIL_SOURCE_CHANGED:'+file);
      cache.set(file,value);sourceHashes[file]=hash(value);
    }
    return cache.get(file);
  };
  for(const file of Object.keys(expectedSources))checkedRead(file);
  const oldRun=privatePin(definition(checkedRead('scripts/migrations/123-own-payroll-runs.sql'),'own_run_context_v1'));
  const currentRun=privatePin(definition(checkedRead('scripts/migrations/176-own-payroll-administrative-operator.sql'),'own_run_context_v1'));
  const currentClose=privatePin(definition(checkedRead('scripts/migrations/125-own-payroll-close.sql'),'own_close_context_v1'));
  assert.notEqual(oldRun.sha256,currentRun.sha256,'MONTHLY_NATIVE_TAIL_ADMINISTRATIVE_CONTEXT_REQUIRED');
  assert.deepEqual({...oldRun,sha256:null},{...currentRun,sha256:null},'MONTHLY_NATIVE_TAIL_CONTEXT_HEADER_CHANGED');
  const contexts=[currentRun,currentClose],definitions=sourceDefinitions(qa);
  for(const pin of contexts)verifyPrerequisiteSource({pin,definitions,stage:'canonical190'});
  const contextCheck=pinsCheck(contexts,'MONTHLY_NATIVE_TAIL_CONTEXT_METADATA_CHANGED');
  const batches=stageDefinitions.map(([migration,build])=>({migration,batch:build({read:checkedRead,sourceCommit})}));
  const newDefinitions=batches.flatMap(({batch})=>batch.migration.map(strip).filter(value=>/^CREATE FUNCTION public\./.test(value)));
  const projection=createMonthlyNativeTailProjection({definitions:newDefinitions,normalized:qa.normalized});
  const stages=[];
  for(const {migration,batch} of batches){
    assert.equal(batch.connects,false);assert.equal(batch.executesSql,false);
    const legacyRun=batch.prerequisitePins.filter(pin=>pin.name==='own_run_context_v1');
    assert.equal(legacyRun.length,migration===148||migration===152?1:0,'MONTHLY_NATIVE_TAIL_CONTEXT_SCOPE_CHANGED');
    if(legacyRun.length)assert.deepEqual(legacyRun[0],oldRun,'MONTHLY_NATIVE_TAIL_LEGACY_CONTEXT_CHANGED');
    const prerequisites=batch.prerequisitePins.map(pin=>pin.name==='own_run_context_v1'?currentRun:pin);
    for(const pin of prerequisites)verifyPrerequisiteSource({pin,definitions,stage:migration});
    let composedPreflight=batch.preflight;
    if(legacyRun.length){
      composedPreflight=exactOnce(batch.preflight,JSON.stringify(oldRun),JSON.stringify(currentRun),'context-'+migration);
      assert.equal(exactOnce(composedPreflight,JSON.stringify(currentRun),JSON.stringify(oldRun),'inverse-'+migration),batch.preflight,
        'MONTHLY_NATIVE_TAIL_PREFLIGHT_INVERSE_CHANGED');
    }
    const options={preflight:batch.preflight,composedPreflight,contextCheck,normalized:projection.normalized};
    const installation=wrapPhase(batch.installation,{...options,readOnly:false});
    const durableVerification=wrapPhase(batch.durableVerification,{...options,readOnly:true});
    stages.push({version:'monthly-native-tail-installation-stage.v1',migration,sourceCommit,schema:qa.schema,
      batchVersion:batch.version,sourceHashes:{...batch.sourceHashes},
      originalPrerequisitePins:batch.prerequisitePins,prerequisitePins:prerequisites,ownPins:batch.ownPins,
      expectedQaPrerequisitePins:JSON.parse(projection.normalized(JSON.stringify(prerequisites))),
      expectedQaOwnPins:JSON.parse(projection.normalized(JSON.stringify(batch.ownPins))),
      contextPins:contexts,contextPinReplacement:legacyRun.length?{before:oldRun,after:currentRun}:null,
      originalPreflight:batch.preflight,composedPreflight,
      installation,durableVerification,
      canonicalInstallationSha256:hash(batch.installation.join(';\n')),
      canonicalDurableVerificationSha256:hash(batch.durableVerification.join(';\n')),
      installationSha256:hash(installation.join(';\n')),durableVerificationSha256:hash(durableVerification.join(';\n')),
      expectedNewTables:1,expectedEventRows:0,connects:false,executesSql:false});
    // Later stages require the exact prior migration's source definitions.
    // The destination's absence/shape checks remain authoritative at execution.
    for(const value of batch.migration){
      const clean=strip(value),header=/^CREATE(?: OR REPLACE)? FUNCTION public\.(\w+)\(/.exec(clean);
      if(header)definitions.set(header[1],[clean]);
    }
  }
  assert.deepEqual(stages.map(stage=>stage.migration),[149,147,148,152]);
  return {version:'monthly-native-tail-installation.v2',sourceCommit,schema:qa.schema,sourceHashes,
    normalized:projection.normalized,projectionLedger:projection.ledger,projectionHashes:projection.hashes,
    sourceOriginCommit:'fdafac9e6a2ec7bdccbb8ff556af15d0d6b34f3f',stages,
    contextPins:contexts,oldRunContextPin:oldRun,
    contextPreservation:{sourceDerived:true,runContextSource:'scripts/migrations/176-own-payroll-administrative-operator.sql',
      closeContextSource:'scripts/migrations/125-own-payroll-close.sql',contextDefinitionsWritten:0,
      sourceCatalogueObservationUsed:false,originalWholePriorSnapshotsPreserved:true,readOnlyDurabilityRequired:true},
    originalNoelia29Used:false,actorOrRoleAssignmentsAdded:0,populationWrites:0,
    connects:false,executesSql:false,backendReady:false};
}

export function assertMonthlyNativeTailDurability({stage,installed,durable}){
  assert.equal(stage?.version,'monthly-native-tail-installation-stage.v1');
  assert.match(stage.schema,schemaPattern);
  const entry=stageDefinitions.find(([migration])=>migration===stage.migration);
  assert.ok(entry,'MONTHLY_NATIVE_TAIL_DURABILITY_STAGE_REQUIRED');
  assert.equal(stage.contextPins.length,2);
  assert.deepEqual(stage.contextPins.map(pin=>pin.name),contextNames);
  const result=entry[2]({installed,durable,sourceCommit:stage.sourceCommit});
  // The original verifier proves equality of the complete prior-state hash and
  // installed metadata. Additive exact context guards precede both proof rows.
  // This return is meaningful only for receipts from those exact stage arrays.
  return {...result,version:'monthly-native-tail-installation-durability.v1',migration:stage.migration,
    sourceCommit:stage.sourceCommit,contextGuardsRequired:true,priorContextDefinitionsPreserved:true,
    installationSha256:stage.installationSha256,durableVerificationSha256:stage.durableVerificationSha256};
}
