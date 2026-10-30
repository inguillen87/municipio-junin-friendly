// Opt-in Noelia native fiscal tail. Disposable synthetic destination only.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {createOwnPeriodFiscalFactsHandler} from '../../api/internal-own-fiscal-facts.js';
import {createEmploymentChangesHandler} from '../../api/internal-employment-changes.js';
import {composeNoeliaFiscal160Qa,installNoeliaFiscal160Qa,assertNoeliaFiscal160Bookend} from './noelia-fiscal160-qa.mjs';
import {createNoeliaFiscal160Sql} from './noelia-fiscal160-rpc.mjs';
import {verifyNoeliaF931NativeReadback,fiscalPhaseIdentity} from './noelia-fiscal160-native.mjs';
import {fiscalNativeNegativesBefore,fiscalNativeNegativesAfter} from './noelia-fiscal160-negative-qa.mjs';
export async function verifyNoeliaFiscal160Tail({db,qa,sourceCommit,major,fullQa,ready,maker,checker,getCurrent,setCurrent,journey,handlers,deps,period,transport,output,executeStage,run,tx,ok,read}){
 assert.ok(transport&&fullQa&&ready&&journey,'NOELIA_FISCAL_REAL_PREREQUISITES_REQUIRED');assert.equal(typeof transport.nativeF931ReadExport,'function');assert.equal(typeof executeStage,'function');assert.ok(!Object.hasOwn(handlers,'fiscalFacts')&&!Object.hasOwn(handlers,'employmentChanges'),'NOELIA_FISCAL_HANDLERS_ALREADY_PRESENT');
 const writeEvidence=(name,value)=>{assert.ok(/^[a-z0-9-]+\.json$/.test(name),'NOELIA_FISCAL_EVIDENCE_NAME');fs.writeFileSync(path.join(output,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});},plan=composeNoeliaFiscal160Qa({fullQa,ready,major,sourceCommit,read}),fiscalStage=async options=>executeStage(options);
 const installation=await installNoeliaFiscal160Qa({plan,executeStage:fiscalStage,writeEvidence}),negativeBefore=await fiscalNativeNegativesBefore({db,qa,plan,run,tx,ok,maker}),scopedSql=createNoeliaFiscal160Sql(db,qa.schema);
 handlers.fiscalFacts=createOwnPeriodFiscalFactsHandler({...deps,getSql:()=>scopedSql});handlers.employmentChanges=createEmploymentChangesHandler({...deps,getSql:()=>scopedSql});const original=getCurrent();
 try{
  // Owner-only SQL probes read counts/fixture authority. Every business command
  // crosses the existing HTTP handler and original RC/RW runtime ROLE adapter.
  const proof=await verifyNoeliaF931NativeReadback({qa,period,journey,maker,checker,getCurrent,setCurrent,transport,executeRuntime:statement=>db.run(statement),ok,writeEvidence});proof.negativeBefore=negativeBefore;proof.negativeAfter=await fiscalNativeNegativesAfter({db,qa,ok});
  setCurrent(fiscalPhaseIdentity(maker,'maker'));proof.ui=await transport.nativeF931ReadExport({period,expected:proof});setCurrent(original);proof.bookend=await assertNoeliaFiscal160Bookend({installation,executeStage:fiscalStage});proof.sourceCommit=sourceCommit;proof.institutional160Admitted=false;proof.gateProven=false;proof.productionAuthority=false;writeEvidence('noelia-fiscal-tail-proof.json',proof);return proof;
 }finally{setCurrent(original);delete handlers.fiscalFacts;delete handlers.employmentChanges;}
}
