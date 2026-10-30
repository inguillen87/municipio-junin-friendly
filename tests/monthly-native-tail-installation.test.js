import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {buildMonthlyDayFixedCompositionQa} from '../scripts/lib/own-monthly-day-fixed-composition-qa.mjs';
import {buildMonthlyNativeTailInstallation} from '../scripts/lib/monthly-native-tail-installation-qa.mjs';
import {splitPostgresStatements} from '../scripts/lib/sql-statements.mjs';
import {ownInstallationFunctionPin} from '../scripts/lib/own-payroll-installation.mjs';
import {buildOwnBankAccountsInstallation} from '../scripts/lib/own-bank-accounts-installation.mjs';
import {buildOwnAccountingInstallation} from '../scripts/lib/own-accounting-installation.mjs';
import {buildOwnImputationInstallation} from '../scripts/lib/own-imputation-installation.mjs';
import {buildOwnJournalInstallation} from '../scripts/lib/own-journal-installation.mjs';

// One complete, deliberately synthetic17/pre107 source plan. This test neither
// imports a verifier as its entrypoint nor invokes SQL, a process or transport.
const root=fs.realpathSync(fileURLToPath(new URL('../',import.meta.url)));
const sourceCommit='fdafac9e6a2ec7bdccbb8ff556af15d0d6b34f3f';
const schema='mc_qa_fixed_092_0123456789abcdef0123456789abcdef';
const hash=value=>createHash('sha256').update(value).digest('hex');
const read=file=>{
  assert.equal(typeof file,'string');
  assert.ok(file&&!path.isAbsolute(file)&&!file.includes('\\')&&!file.split('/').includes('..'));
  assert.ok(!/^(?:\.git|\.handoff|verification)(?:\/|$)/.test(file)&&!/(?:^|\/)\.env(?:\.|$)/.test(file));
  const target=fs.realpathSync(path.resolve(root,file)),relative=path.relative(root,target);
  assert.ok(relative&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative));
  return fs.readFileSync(target,'utf8').replace(/\r\n?/g,'\n');
};
const strip=value=>value.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim();
const definitions=source=>splitPostgresStatements(source).map(strip).filter(value=>/^CREATE(?: OR REPLACE)? FUNCTION public\./.test(value));
const stageSources=[
  [149,'scripts/migrations/149-own-bank-accounts.sql',buildOwnBankAccountsInstallation],
  [147,'scripts/migrations/147-own-payroll-accounting-mappings.sql',buildOwnAccountingInstallation],
  [148,'scripts/migrations/148-own-payroll-imputation.sql',buildOwnImputationInstallation],
  [152,'scripts/migrations/152-own-payroll-journal.sql',buildOwnJournalInstallation],
];
function projectedPin(source,normalize,runtime){
  const projected=normalize(source);
  // Only restore the declaration qualifier so the public pure pin reader can
  // parse it. Body, argument types and search_path remain genuinely projected.
  const header=new RegExp('^(CREATE(?: OR REPLACE)? FUNCTION )'+schema+'\\.');
  assert.match(projected,header);
  const pin=ownInstallationFunctionPin(projected.replace(header,'$1public.'));
  return {...pin,signature:pin.signature.replace(/^public\./,schema+'.'),runtime};
}
function checkPins(statement){
  const match=/jsonb_array_elements\('((?:[^']|'')*)'::jsonb\)/.exec(statement);
  assert.ok(match,'A complete metadata guard must carry its exact expected pins');
  return JSON.parse(match[1].replaceAll("''","'"));
}
function foundationArrays(qa){
  return {
    predecessor190:qa.qa192.qa.predecessorInstallation,
    programme190:qa.qa192.qa.local,
    policy192:qa.qa192.local,
    declaration193:qa.local193,
    capture194:qa.local,
    fixed196:qa.localFixed,
  };
}
const sorted=rows=>rows.toSorted((a,b)=>a.signature.localeCompare(b.signature));

test('one complete190+196 source plan preserves contexts and projects every financial guard',{timeout:600000},()=>{
  const qa=buildMonthlyDayFixedCompositionQa({major:17,sourceCommit,schema,operationalPairBaseline:'pre107',read});
  const before=JSON.stringify(foundationArrays(qa));
  const tail=buildMonthlyNativeTailInstallation({qa,read,sourceCommit});
  assert.equal(JSON.stringify(foundationArrays(qa)),before,'The supplemental must not mutate or normalize prior phases again');
  assert.equal(tail.version,'monthly-native-tail-installation.v2');
  assert.equal(tail.schema,qa.schema);
  assert.deepEqual(tail.stages.map(stage=>stage.migration),[149,147,148,152]);
  assert.equal(tail.backendReady,false);
  assert.equal(tail.connects,false);assert.equal(tail.executesSql,false);

  const expectedPins=[],expectedLedger=[];
  for(const [migration,file,build]of stageSources){
    const source=read(file),functions=definitions(source),stage=tail.stages.find(value=>value.migration===migration);
    const facadeNames=new Set([...source.matchAll(/GRANT EXECUTE ON FUNCTION ([\s\S]*?) TO municontrol_actions_runtime_app;/g)]
      .flatMap(match=>[...match[1].matchAll(/public\.(\w+)\(/g)].map(value=>value[1])));
    assert.equal(functions.length,new Map([[149,14],[147,13],[148,11],[152,13]]).get(migration));
    for(const definition of functions){
      const raw=ownInstallationFunctionPin(definition),projected=tail.normalized(definition);
      const expected=projectedPin(definition,tail.normalized,facadeNames.has(raw.name));
      expectedPins.push(expected);
      expectedLedger.push({name:raw.name,sourceSignature:raw.signature,expectedQaSignature:expected.signature,
        sourceProsrcSha256:raw.sha256,sourceDefinitionSha256:hash(definition),expectedQaProsrcSha256:expected.sha256,
        projectedDefinitionSha256:hash(projected),bodyChanged:raw.sha256!==expected.sha256});
    }
    const original=build({read,sourceCommit});
    assert.equal(stage.installation.at(-1),tail.normalized(original.proof),'The original installation proof stays last');
    assert.equal(stage.durableVerification.at(-1),tail.normalized(original.durableProof),'The original durable proof stays last');
    assert.equal(stage.canonicalInstallationSha256,hash(original.installation.join(';\n')));
    assert.equal(stage.canonicalDurableVerificationSha256,hash(original.durableVerification.join(';\n')));
  }
  assert.equal(expectedPins.length,51);
  assert.deepEqual(sorted(tail.stages.flatMap(stage=>stage.expectedQaOwnPins)),sorted(expectedPins));
  assert.deepEqual(tail.projectionLedger,expectedLedger);
  assert.ok(expectedLedger.some(row=>row.bodyChanged));
  assert.ok(expectedLedger.some(row=>!row.bodyChanged));

  const contextDefinitions=[
    definitions(read('scripts/migrations/176-own-payroll-administrative-operator.sql')).find(value=>value.startsWith('CREATE OR REPLACE FUNCTION public.own_run_context_v1(')),
    definitions(read('scripts/migrations/125-own-payroll-close.sql')).find(value=>value.startsWith('CREATE FUNCTION public.own_close_context_v1(')),
  ];
  assert.ok(contextDefinitions.every(Boolean));
  const expectedContexts=contextDefinitions.map(value=>projectedPin(value,tail.normalized,false));
  const oldContext=definitions(read('scripts/migrations/123-own-payroll-runs.sql')).find(value=>value.startsWith('CREATE FUNCTION public.own_run_context_v1('));
  assert.notEqual(ownInstallationFunctionPin(oldContext).sha256,tail.contextPins[0].sha256);
  for(const stage of tail.stages){
    for(const phase of [stage.installation,stage.durableVerification]){
      const guards=phase.filter(value=>value.includes("RAISE EXCEPTION 'MONTHLY_NATIVE_TAIL_CONTEXT_METADATA_CHANGED'"));
      assert.deepEqual(guards.map(checkPins),[expectedContexts,expectedContexts],'Both private contexts are checked before and after the phase');
    }
    const old=stage.originalPrerequisitePins.find(pin=>pin.name==='own_run_context_v1');
    if(stage.migration===148||stage.migration===152){
      assert.ok(old);
      const replacement=stage.contextPinReplacement;
      assert.deepEqual(replacement.before,old);
      assert.deepEqual(replacement.after,tail.contextPins[0]);
      assert.equal(stage.composedPreflight.replace(JSON.stringify(replacement.after),JSON.stringify(replacement.before)),stage.originalPreflight);
    }else assert.equal(stage.composedPreflight,stage.originalPreflight);
  }
});
