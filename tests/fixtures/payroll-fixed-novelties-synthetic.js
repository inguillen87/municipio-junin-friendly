/** Synthetic browser responses only; never submit these fixtures to a real API. */
import {createHash} from 'node:crypto';
export const fixedUuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const fixedEffects=Object.freeze({approvalEffect:'control_export_only',grhMutation:false,payrollCalculated:false,payrollPosted:false});
export const fixedPayrollTypes=['monthly','first_fortnight','sac','vacation','supplementary','final','other'];
export const fixedValues=(overrides={})=>({conceptSourceId:'80',costCenterSourceId:null,payrollType:'monthly',quantityDecimal:'1',amountCents:null,forced:false,forcedReason:null,legalInstrument:'Acto administrativo sintético QA',validFrom:'2026-09-15',validTo:'2026-12-31',...overrides});
export const fixedSubject=(legajo='1001')=>({contractId:fixedUuid(Number(legajo)),legajo,employeeName:'AGENTE SINTÉTICO '+legajo,identityToken:createHash('sha256').update('fixed-qa:'+legajo).digest('hex'),sourceCutoff:'2026-09-01T12:00:00.000000Z'});
export function fixedApprovedRecord(n,overrides={}){
  const subject=fixedSubject(String(1001+n)),id=fixedUuid(20000+n);
  const proposal={id:fixedUuid(30000+n),recordId:id,version:1,operation:'set',values:fixedValues(overrides),reason:'Alta administrativa sintética',proposedAt:'2026-09-20T12:00:00.000000Z',proposedBy:'preparer@example.invalid',review:{decision:'approve',reason:'Cotejo sintético de datos declarados',reviewedAt:'2026-09-20T13:00:00.000000Z',reviewedBy:'reviewer@example.invalid',version:2},canReview:false};
  return {id,version:2,subject,identityCurrent:true,approved:proposal,pending:null,latest:proposal,canPropose:true};
}
export function fixedFixture(){
  const state={role:'preparer',employmentLinked:true,denied:false,records:[],histories:new Map(),attempts:new Map(),sequence:0,epoch:0};
  const cap=()=>['payroll.novelty.read','payroll.novelty.nominal.read',...(state.role==='preparer'?['payroll.fixed.prepare','payroll.novelty.export']:state.role==='reviewer'?['payroll.fixed.approve','payroll.novelty.export']:[])];
  const principal=()=>({tenantId:fixedUuid(1),membershipId:fixedUuid(state.role==='preparer'?2:state.role==='reviewer'?3:4),certifiedBindingId:fixedUuid(5),capabilities:cap(),employmentLinked:state.employmentLinked});
  const allowed=r=>{const row=structuredClone(r);row.canPropose=state.role==='preparer'&&state.employmentLinked&&r.identityCurrent&&!r.pending;for(const p of [row.approved,row.pending,row.latest])if(p)p.canReview=!!r.identityCurrent&&p.review===null&&state.role==='reviewer'&&p.proposedBy!=='reviewer@example.invalid';return row;};
  const intersects=(v,month)=>{if(!month||!v)return !month;const last=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);return v.validFrom<=last&&(!v.validTo||v.validTo>=month);};
  const rows=month=>state.records.filter(r=>!month||intersects(r.approved?.values,month)||intersects(r.latest?.values,month));
  const token=month=>createHash('sha256').update(JSON.stringify({epoch:state.epoch,month,records:rows(month)})).digest('hex');
  const bootstrap=()=>({version:'payroll-fixed-bootstrap.v1',principal:principal(),limits:{maxRecords:500,maxHistory:100},payrollTypes:fixedPayrollTypes,effects:fixedEffects});
  const list=month=>({version:'payroll-fixed-list.v1',periodMonth:month,rows:rows(month).map(allowed),total:rows(month).length,snapshotToken:token(month),effects:fixedEffects});
  const detail=id=>{const row=state.records.find(r=>r.id===id);return row?{version:'payroll-fixed-detail.v1',record:allowed(row),history:(state.histories.get(id)||[row.latest]).map(p=>({...structuredClone(p),canReview:p.review===null&&state.role==='reviewer'&&row.identityCurrent}))}:null;};
  const exporter=month=>({version:'payroll-fixed-export.v1',periodMonth:month,snapshotToken:token(month),rows:rows(month).filter(r=>r.approved?.operation==='set'&&intersects(r.approved.values,month)).map(r=>({recordId:r.id,version:r.version,proposalId:r.approved.id,subject:structuredClone(r.subject),values:structuredClone(r.approved.values)})),total:rows(month).filter(r=>r.approved?.operation==='set'&&intersects(r.approved.values,month)).length,effects:fixedEffects});
  function mutate(command,payload,key){
    const attemptKey=state.role+':'+command+':'+key,previous=state.attempts.get(attemptKey);
    if(previous){if(JSON.stringify(previous.payload)!==JSON.stringify(payload))return {status:409,code:'PAYROLL_FIXED_IDEMPOTENCY_REUSE'};return{status:200,data:{...previous.receipt,duplicate:true}};}
    let row=state.records.find(r=>r.id===payload.recordId);
    if(row&&row.version!==payload.expectedVersion)return{status:409,code:'PAYROLL_FIXED_VERSION_CONFLICT'};
    if(command==='propose'){
      if(state.role!=='preparer')return{status:403,code:'PAYROLL_FIXED_CAPABILITY_REQUIRED'};
      if(row?.pending)return{status:409,code:'PAYROLL_FIXED_PENDING_EXISTS'};
      const subject=row?.subject||fixedSubject(payload.legajo);
      if(payload.contractId!==subject.contractId||payload.identityToken!==subject.identityToken||row?.identityCurrent===false)return{status:409,code:'PAYROLL_FIXED_IDENTITY_CHANGED'};
      if(!row){row={id:fixedUuid(40000+(++state.sequence)),version:0,subject,identityCurrent:true,approved:null,pending:null,latest:null,canPropose:true};state.records.unshift(row);}
      row.version++;
      const proposal={id:fixedUuid(50000+(++state.sequence)),recordId:row.id,version:row.version,operation:payload.operation,values:structuredClone(payload.values),reason:payload.reason,proposedAt:'2026-09-21T12:00:00.123456Z',proposedBy:'preparer@example.invalid',review:null,canReview:false};
      row.pending=proposal;row.latest=proposal;state.histories.set(row.id,[proposal,...(state.histories.get(row.id)||[])]);
    }else{
      if(state.role!=='reviewer')return{status:403,code:'PAYROLL_FIXED_MAKER_CHECKER_REQUIRED'};
      if(!row?.pending||row.pending.id!==payload.proposalId)return{status:409,code:'PAYROLL_FIXED_VERSION_CONFLICT'};
      row.version++;row.pending.review={decision:payload.decision,reason:payload.reason,reviewedAt:'2026-09-21T13:00:00.123456Z',reviewedBy:'reviewer@example.invalid',version:row.version};
      if(payload.decision==='approve')row.approved=row.pending;row.pending=null;
    }
    const receipt={version:'payroll-fixed-receipt.v1',command,recordId:row.id,proposalId:row.latest.id,recordVersion:row.version,duplicate:false};
    state.attempts.set(attemptKey,{payload:structuredClone(payload),receipt});return{status:201,data:receipt};
  }
  return{state,cap,principal,bootstrap,list,detail,exporter,token,mutate};
}
