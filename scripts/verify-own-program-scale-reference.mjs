// Real handlers and loopback PostgreSQL; every actor/value is synthetic.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {verifySalaryAuxiliaryNamespace} from './verify-salary-auxiliary-namespace.mjs';
import {prepareProgramScaleReference} from '../assets/own-payroll-program-scale-reference-model.js';
import {ownProgramDefinition} from '../assets/own-payroll-program-model.js';
import {salaryItems,salaryRowKey,salarySerialized} from '../assets/native-salary-catalog-model.js';
import {row} from '../tests/fixtures/native-salary-synthetic.js';

export async function verifyOwnProgramScaleReference(options){
 return verifySalaryAuxiliaryNamespace({...options,continuation:async({api,qa,setActor,ok,period,destination,oldBody})=>{
  const start=[];const check=(condition,label)=>{ok(condition,label);start.push(label);};
  setActor(qa.actors.maker);const salary=await api('salary');
  const category=salary.classification.items.find(r=>r.kind==='categories'&&r.agreementCode==='1');assert.ok(category,'Existing synthetic catalogue must declare a reference class');
  const source=row({kind:'scale',nature:null,categoryCode:category.code,agreementCode:'1',code:'9001',unit:'money',value:'100.010',precision:3,validFrom:period,validUntil:period,ruleReference:'Clase y valor inventados exclusivamente QA'});
  const auxiliary=row({kind:'auxiliary',nature:'auxiliary',code:'9000',unit:'money',value:null,precision:6,validFrom:period,validUntil:period,ruleReference:'Auxiliar inventado exclusivamente QA'});
  const items=salaryItems([...salary.catalog.items,source,auxiliary]);
  const sp=await api('salary',{expected:201,body:{command:'propose',scopeVersion:salary.scopeVersion,baseVersion:salary.catalog.version,classificationVersion:salary.classification.version,proposalId:null,proposalSha256:null,items,reason:'Maestro sintético con clase y auxiliar de referencia',reviewConfirmed:false}});
  setActor(qa.actors.checker);const checkerSalary=await api('salary');await api('salary',{expected:201,body:{command:'approve',scopeVersion:checkerSalary.scopeVersion,baseVersion:sp.body.baseVersion,classificationVersion:sp.body.classificationVersion,proposalId:sp.proposalId,proposalSha256:sp.requestSha256,items:null,reason:'Decisión independiente exclusivamente sintética QA',reviewConfirmed:true}});
  setActor(qa.actors.maker);const boot=await api('program'),draft=structuredClone(boot.program.definition),original=salarySerialized(draft);
  const intent={sourceKey:salaryRowKey(source),auxiliaryCode:'9000',targets:['1'],validFrom:period,validUntil:period,liquidationTypes:['monthly'],factor:'1.50',precision:6,ruleReference:'Referencia de clase y factor inventados QA',mode:'add',periodTreatment:null};
  const plan=prepareProgramScaleReference(boot,draft,intent);check(plan.preview.amount==='150.015000'&&salarySerialized(draft)===original,'new native reference plan keeps exact basis and leaves every approved rule unchanged');
  check(plan.program.rules.length===draft.rules.length+1&&plan.program.bindings.length===draft.bindings.length+1,'reference adds exactly one rule and one declared-class source without trimming old rules');
  const body={command:'propose',scopeVersion:boot.scopeVersion,baseVersion:boot.program.version,salaryVersion:boot.salaryCatalog.version,proposalId:null,proposalSha256:null,program:plan.program,reason:'Programa sintético completo con referencia nativa',reviewConfirmed:false};
  await api('program',{expected:409,body:{...body,salaryVersion:'f'.repeat(64)}});check(true,'actual handler rejects a substituted salary version before a reference write');
  const bad=structuredClone(body);bad.program.bindings.find(b=>b.sourceKind==='scale_reference'&&b.sourceCode==='9001').sourceCategoryCode='999999999';await api('program',{expected:422,body:bad});check(true,'actual SQL rejects a missing reference class without substituting employee class');
  const key=randomUUID(),proposal=await api('program',{expected:201,key,body});check(salarySerialized(proposal.body)===salarySerialized(body),'actual SQL records the whole reference proposal with its exact original body');
  const recovered=await api('program',{query:{resource:'attempt',key}});assert.deepEqual(recovered.body,body);const replay=await api('program',{expected:200,key,body});check(replay.replayed===true&&salarySerialized(replay.body)===salarySerialized(body),'reference recovery and replay preserve the same key/body and create no second proposal');
  setActor(qa.actors.samePerson);const same=await api('program');check(same.proposals.find(p=>p.id===proposal.proposalId)?.canReview===false,'same person through another membership cannot decide the reference proposal');
  setActor(qa.actors.checker);const cb=await api('program');await api('program',{expected:201,body:{command:'approve',scopeVersion:cb.scopeVersion,baseVersion:body.baseVersion,salaryVersion:body.salaryVersion,proposalId:proposal.proposalId,proposalSha256:proposal.requestSha256,program:null,reason:'Decisión independiente del programa sintético completo',reviewConfirmed:true}});
  setActor(qa.actors.maker);const adopted=await api('program');assert.deepEqual(ownProgramDefinition(adopted.program.definition,adopted.salaryCatalog.items),plan.program);check(salarySerialized(adopted.program.definition)===salarySerialized(plan.program),'independent SQL decision publishes the full exact native reference program');
  check(draft.rules.every(r=>adopted.program.definition.rules.some(n=>salarySerialized(n)===salarySerialized(r)))&&draft.bindings.every(b=>adopted.program.definition.bindings.some(n=>salarySerialized(n)===salarySerialized(b))),'all previous rule expressions, stages, precision and sources survive the reference approval');
  const rb=await api('run');await api('run',{expected:409,body:{...oldBody,scopeVersion:rb.scopeVersion,programVersion:rb.programVersion}});check(true,'a new reference program cannot recalculate the already closed synthetic period');
  const result={ok:true,checksPassed:start.length,checks:start,exactReferenceAmount:plan.preview.amount,syntheticOnly:true,productiveBusinessWrites:0};fs.writeFileSync(path.join(destination,'scale-reference-proof.json'),JSON.stringify(result,null,2)+'\n');return result;
 }});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const o={};for(const arg of process.argv.slice(2)){const m=/^--(major|transport|source-commit|output|browser)=(.+)$/.exec(arg);assert.ok(m&&!Object.hasOwn(o,m[1]));o[m[1]]=m[2];}
 try{const r=await verifyOwnProgramScaleReference({major:Number(o.major),transport:o.transport,sourceCommit:o['source-commit'],output:o.output,browser:o.browser??'none'});console.log(JSON.stringify({ok:r.ok,major:r.major,checksPassed:r.checksPassed,referenceChecks:r.continuation.checksPassed,syntheticOnly:true,productiveBusinessWrites:0}));}catch(e){console.error(e);process.exitCode=1;}
}
