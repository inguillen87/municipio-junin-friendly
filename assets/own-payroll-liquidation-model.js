import {salaryExact,salaryHash,salaryUuid,salaryKey,salarySerialized} from './native-salary-catalog-model.js';
import {ownRunCommand,ownRunCapture} from './own-payroll-run-model.js';
import {ownRunWorkspaceResult,verifiedWorkspaceCapture,OWN_RUN_NOMINAL,OWN_RUN_READ,OWN_RUN_PREPARE} from './own-payroll-run-workspace-model.js';
import {decimal,exactAdd,quantize} from './own-payroll-exact.js';
export const OWN_LIQ_READ=OWN_RUN_READ,OWN_LIQ_NOMINAL=OWN_RUN_NOMINAL;
export const OWN_LIQ_REVIEW=Object.freeze([...OWN_LIQ_NOMINAL,'payroll.calculation.approve']);
export const OWN_LIQ_CANCEL=OWN_RUN_PREPARE;
const fail=()=>{throw Error('No se pudo verificar la decisión y el alcance completo de la liquidación.');};
const exact=(v,keys)=>{if(!salaryExact(v,keys))fail();};
const states=['calculated','confirmed','annulled','cancelled'],commands=['confirm','annul','cancel'];
const date=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
export function ownLiquidationCommand(v){
 exact(v,['runId','resultSha256','scopeVersion','stateVersion','command','selection','reason','reviewConfirmed']);
 if(!salaryUuid(v.runId)||![v.resultSha256,v.scopeVersion,v.stateVersion].every(salaryHash)||!commands.includes(v.command)||v.reviewConfirmed!==true||typeof v.reason!=='string'||v.reason!==v.reason.trim()||v.reason.length<10||v.reason.length>500||/[\u0000-\u001f\u007f]/u.test(v.reason))fail();
 const selection=ownRunCommand({period:'2026-01',liquidationType:'monthly',selection:v.selection,scopeVersion:v.scopeVersion,programVersion:v.stateVersion,populationDomain:'native_registered'}).selection;
 return {...v,selection};
}
export function ownLiquidationBootstrap(v){
 exact(v,['version','scopeVersion','runs','complete']);if(v.version!=='own-liquidation-bootstrap.v1'||!salaryHash(v.scopeVersion)||v.complete!==true||!Array.isArray(v.runs)||v.runs.length>1000)fail();
 const ids=new Set();for(const r of v.runs){exact(r,['id','period','liquidationType','createdAt','employeeCount','resultSha256','canConsult']);if(!salaryUuid(r.id)||ids.has(r.id)||!date(r.createdAt)||!salaryHash(r.resultSha256)||typeof r.canConsult!=='boolean'||!Number.isSafeInteger(r.employeeCount)||r.employeeCount<1||r.employeeCount>10000)fail();ownRunCommand({period:r.period,liquidationType:r.liquidationType,selection:{kind:'all',values:[]},scopeVersion:v.scopeVersion,programVersion:v.scopeVersion,populationDomain:'native_registered'});ids.add(r.id);}return v;
}
export function ownLiquidationDetail(v){
 exact(v,['version','id','scopeVersion','stateVersion','capture','employees','effects','reviewAccessRequired']);
 if(v.version!=='own-liquidation-detail.v1'||!salaryUuid(v.id)||![v.scopeVersion,v.stateVersion].every(salaryHash)||!Array.isArray(v.employees)||typeof v.reviewAccessRequired!=='boolean')fail();
 ownRunCapture(v.capture);const verified=ownRunWorkspaceResult(v.capture);if(!verified||v.capture.id!==v.id||v.employees.length!==verified.result.employeeCount)fail();
 exact(v.effects,['paymentExecuted','accountingPosted','periodClosed']);if(Object.values(v.effects).some(e=>e!==false))fail();
 const expected=new Set(verified.result.employeeTotals.map(t=>t.contractId)),ids=new Set();
 for(const e of v.employees){exact(e,['contractId','state','version','liquidationVersion','blockedBy','allowedCommands','events']);
  if(!expected.has(e.contractId)||ids.has(e.contractId)||!states.includes(e.state)||!Number.isSafeInteger(e.version)||e.version<0||!(e.liquidationVersion===null||Number.isSafeInteger(e.liquidationVersion)&&e.liquidationVersion>0)||!(e.blockedBy===null||salaryUuid(e.blockedBy))||!Array.isArray(e.allowedCommands)||new Set(e.allowedCommands).size!==e.allowedCommands.length||e.allowedCommands.some(c=>!commands.includes(c))||!Array.isArray(e.events)||e.events.length!==e.version)fail();
  let prior='calculated',number=null;const eventIds=new Set();
  for(const [index,event]of e.events.entries()){exact(event,['id','command','version','liquidationVersion','recordedAt','actorLabel','reason']);if(!salaryUuid(event.id)||eventIds.has(event.id)||!commands.includes(event.command)||event.version!==index+1||!date(event.recordedAt)||typeof event.actorLabel!=='string'||!event.actorLabel||typeof event.reason!=='string'||event.reason.length<10||event.reason.length>500)fail();
   if(event.command==='confirm'){if(prior!=='calculated'||!Number.isSafeInteger(event.liquidationVersion)||event.liquidationVersion<1)fail();prior='confirmed';number=event.liquidationVersion;}
   else if(event.command==='annul'){if(prior!=='confirmed'||event.liquidationVersion!==number)fail();prior='annulled';}
   else{if(prior!=='calculated'||event.liquidationVersion!==null)fail();prior='cancelled';}eventIds.add(event.id);
  }
  if(e.state!==prior||e.liquidationVersion!==number||e.allowedCommands.some(c=>c==='confirm'?e.state!=='calculated'||e.blockedBy!==null:c==='annul'?e.state!=='confirmed':e.state!=='calculated'))fail();ids.add(e.contractId);
 }return v;
}
export async function verifiedOwnLiquidationDetail(v){ownLiquidationDetail(v);await verifiedWorkspaceCapture(v.capture);return v;}
export function ownLiquidationSelection(detail,selection,command){
 ownLiquidationDetail(detail);if(!commands.includes(command))fail();
 selection=ownRunCommand({...detail.capture.body,selection}).selection;
 const people=new Map(detail.capture.saved.input.employees.map(e=>[e.contractId,e]));
 const rows=detail.employees.filter(e=>selection.kind==='all'||selection.values.includes(selection.kind==='contracts'?e.contractId:selection.kind==='agreements'?people.get(e.contractId).agreementCode:people.get(e.contractId).departmentCode));
 if(!rows.length||selection.kind!=='all'&&selection.values.some(value=>!rows.some(e=>value===(selection.kind==='contracts'?e.contractId:selection.kind==='agreements'?people.get(e.contractId).agreementCode:people.get(e.contractId).departmentCode))))fail();
 return {rows,complete:true,allowed:rows.every(e=>e.allowedCommands.includes(command)),count:rows.length};
}
// Review the selected result, never the search or page. These amounts describe
// the stored calculation; they are not a new calculation or a payment order.
export function ownLiquidationReview(detail,selection,command){
 const selected=ownLiquidationSelection(detail,selection,command),saved=detail.capture.saved;
 const people=new Map(saved.input.employees.map(e=>[e.contractId,e])),totals=new Map(saved.result.employeeTotals.map(e=>[e.contractId,e]));
 const rows=selected.rows.map(e=>{
  const person=people.get(e.contractId),amounts=totals.get(e.contractId);
  return {contractId:e.contractId,employeeNumber:person.employeeNumber,agreementCode:person.agreementCode,departmentCode:person.departmentCode,state:e.state,liquidationVersion:e.liquidationVersion,allowed:e.allowedCommands.includes(command),gross:amounts.gross,deduction:amounts.deduction,net:amounts.net};
 });
 const aggregate=Object.fromEntries(['gross','deduction','net'].map(key=>[key,quantize(rows.reduce((sum,row)=>exactAdd(sum,decimal(row[key])),decimal('0')),{precision:saved.input.totalsPrecision,mode:'exact'}).amount]));
 return {rows,count:selected.count,allowed:selected.allowed,complete:true,totals:aggregate};
}
// Read the complete verified saved result. Search and pagination never define
// an individual's concepts; annulled values remain historical, never zeroed.
export function ownLiquidationIndividual(detail,contractId){
 ownLiquidationDetail(detail);if(!salaryUuid(contractId))fail();
 const decision=detail.employees.find(e=>e.contractId===contractId),saved=detail.capture.saved;
 const person=saved.input.employees.find(e=>e.contractId===contractId),totals=saved.result.employeeTotals.find(e=>e.contractId===contractId);
 if(!decision||!person||!totals)fail();
 return structuredClone({runId:detail.id,resultSha256:saved.resultSha256,stateVersion:detail.stateVersion,period:saved.result.period,liquidationDate:detail.capture.body.liquidationDate??null,liquidationType:saved.result.liquidationType,employeeNumber:person.employeeNumber,contractId,agreementCode:person.agreementCode,departmentCode:person.departmentCode,state:decision.state,liquidationVersion:decision.liquidationVersion,events:decision.events,totals,rows:saved.result.rows.filter(r=>r.contractId===contractId),complete:true,paymentExecuted:false});
}
// This supplies a preparation context only. The target must reread the receipt,
// detail, session and catalogs before offering a separate voluntary calculation.
export function ownLiquidationNextPreparation(detail,receipt){
 ownLiquidationDetail(detail);ownLiquidationReceipt(receipt);
 if(receipt.body.command!=='annul'||receipt.runId!==detail.id||receipt.resultSha256!==detail.capture.saved.resultSha256)fail();
 for(const affected of receipt.affected){const current=detail.employees.find(e=>e.contractId===affected.contractId);if(!current||current.state!=='annulled'||current.version!==affected.version||current.liquidationVersion!==affected.liquidationVersion)fail();}
 const selected=ownLiquidationSelection(detail,receipt.body.selection,'annul');
 if(salarySerialized(selected.rows.map(e=>e.contractId).sort())!==salarySerialized(receipt.affected.map(e=>e.contractId).sort()))fail();
 // "All" in the decision means all of that run, possibly a partial run.
 // Carry the exact affected contracts, never widen it to the whole municipality.
 return structuredClone({period:detail.capture.body.period,liquidationDate:detail.capture.body.liquidationDate??null,liquidationType:detail.capture.body.liquidationType,selection:{kind:'contracts',values:receipt.affected.map(e=>e.contractId).sort()},sourceSelection:receipt.body.selection,affected:receipt.affected.map(e=>({contractId:e.contractId,employeeNumber:detail.capture.saved.input.employees.find(p=>p.contractId===e.contractId).employeeNumber})),runId:detail.id,receiptKey:receipt.key});
}
export function ownLiquidationReceipt(v,attempt=null){
 exact(v,['version','id','key','body','bodySha256','runId','resultSha256','affected','recordedAt','replayed']);
 const body=ownLiquidationCommand(v.body);if(v.version!=='own-liquidation-receipt.v1'||!salaryUuid(v.id)||!salaryKey(v.key)||!salaryHash(v.bodySha256)||v.runId!==body.runId||v.resultSha256!==body.resultSha256||!date(v.recordedAt)||typeof v.replayed!=='boolean'||!Array.isArray(v.affected)||!v.affected.length||v.affected.length>10000)fail();
 const ids=new Set();for(const e of v.affected){exact(e,['contractId','state','version','liquidationVersion']);if(!salaryUuid(e.contractId)||ids.has(e.contractId)||e.state!==({confirm:'confirmed',annul:'annulled',cancel:'cancelled'}[body.command])||!Number.isSafeInteger(e.version)||e.version<1||!(body.command==='cancel'?e.liquidationVersion===null:Number.isSafeInteger(e.liquidationVersion)&&e.liquidationVersion>0))fail();ids.add(e.contractId);}
 if(body.selection.kind==='contracts'&&salarySerialized([...ids].sort())!==salarySerialized(body.selection.values))fail();
 if(attempt?.expectedContracts&&salarySerialized([...ids].sort())!==salarySerialized([...attempt.expectedContracts].sort()))fail();
 if(attempt&&(v.key!==attempt.key||salarySerialized(body)!==salarySerialized(attempt.body)))fail();return v;
}
export async function verifiedOwnLiquidationReceipt(v,attempt=null){
 ownLiquidationReceipt(v,attempt);
 const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(salarySerialized(v.body))))].map(b=>b.toString(16).padStart(2,'0')).join('');
 if(digest!==v.bodySha256)fail();return v;
}
