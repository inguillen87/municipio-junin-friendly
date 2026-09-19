import {exactFields,followupId,FollowupInputError,FOLLOWUP_STATES} from './legal-followups-model.js';
const fail=()=>{throw new FollowupInputError('Revisá la persona responsable, próxima actuación y motivo.');};
const integer=(n,a,b)=>Number.isSafeInteger(n)&&n>=a&&n<=b;
const text=(s,min,max)=>typeof s==='string'&&s===s.trim()&&s.length>=min&&s.length<=max&&!/[<>\u0000-\u001f\u007f]/.test(s);
const instant=s=>typeof s==='string'&&s.length<=60&&/^\d{4}-\d{2}-\d{2}T/.test(s)&&Number.isFinite(Date.parse(s));
export function normalizeCoordination(v){
 exactFields(v,['followupId','expectedRevision','expectedFollowupVersion','responsibleId','nextAction','reason']);
 if(!followupId(v.followupId)||!integer(v.expectedRevision,0,99)||!integer(v.expectedFollowupVersion,1,100)||v.responsibleId!==null&&!followupId(v.responsibleId)||!text(v.nextAction,0,500)||v.nextAction!==''&&v.nextAction.length<3||v.responsibleId!==null&&v.nextAction.length<3||!text(v.reason,5,500))fail();
 return structuredClone(v);
}
function member(v,eligible=false){exactFields(v,eligible?['id','label','eligible']:['id','label']);if(!followupId(v.id)||!text(v.label,1,254)||eligible&&typeof v.eligible!=='boolean')fail();}
export function verifyCoordination(op,d){
 if(op==='save'||op==='attempt'){
  exactFields(d,['version','followupId','revision','followupVersion','replayed']);if(d.version!=='legal-coordination-receipt.v1'||!followupId(d.followupId)||!integer(d.revision,1,100)||!integer(d.followupVersion,1,100)||typeof d.replayed!=='boolean')fail();return d;
 }
 if(op!=='detail')fail();exactFields(d,['version','followup','canManage','candidates','revision','nextAction','responsible','history']);
 exactFields(d.followup,['id','normId','normVersion','version','title','status']);const f=d.followup;
 if(d.version!=='legal-coordination.v1'||!followupId(f.id)||!followupId(f.normId)||!integer(f.normVersion,1,1000)||!integer(f.version,1,100)||!text(f.title,3,160)||!Object.hasOwn(FOLLOWUP_STATES,f.status)||typeof d.canManage!=='boolean'||!integer(d.revision,0,100)||!text(d.nextAction,0,500)||!Array.isArray(d.history)||d.history.length!==d.revision||!Array.isArray(d.candidates)||d.candidates.length>1000)fail();
 if(d.canManage&&(f.status!=='open'||d.revision>=100)||!d.canManage&&d.candidates.length)fail();
 const ids=new Set();let previous='';for(const c of d.candidates){member(c);if(ids.has(c.id)||c.id<=previous)fail();ids.add(c.id);previous=c.id;}
 if(d.responsible!==null){member(d.responsible,true);if(d.revision===0||d.nextAction.length<3)fail();if(d.canManage&&d.responsible.eligible!==ids.has(d.responsible.id))fail();}
 if(d.revision===0&&(d.responsible!==null||d.nextAction!==''))fail();
 for(const [i,h] of d.history.entries()){
  exactFields(h,['revision','followupVersion','responsibleId','responsibleLabel','nextAction','reason','actorLabel','recordedAt']);
  if(h.revision!==d.revision-i||!integer(h.followupVersion,1,f.version)||!text(h.nextAction,0,500)||!text(h.reason,5,500)||!text(h.actorLabel,1,254)||!instant(h.recordedAt))fail();
  if(h.responsibleId===null?h.responsibleLabel!==null:!followupId(h.responsibleId)||!text(h.responsibleLabel,1,254)||h.nextAction.length<3)fail();
 }
 if(d.revision){const h=d.history[0];if(h.nextAction!==d.nextAction||h.responsibleId!==(d.responsible?.id??null)||h.responsibleLabel!==(d.responsible?.label??null))fail();}
 return d;
}
export function coordinationProposal(body,baseline){
 const d=normalizeCoordination(body);verifyCoordination('detail',baseline);
 if(!baseline.canManage||baseline.followup.id!==d.followupId||baseline.revision!==d.expectedRevision||baseline.followup.version!==d.expectedFollowupVersion)fail();
 const selected=d.responsibleId===null?null:baseline.candidates.find(c=>c.id===d.responsibleId);if(d.responsibleId!==null&&!selected)fail();
 if(d.responsibleId===(baseline.responsible?.id??null)&&d.nextAction===baseline.nextAction)throw new FollowupInputError('No cambió el responsable ni la próxima actuación. El motivo solo no crea otra revisión.');
 return {body:d,beforeLabel:baseline.responsible?.label??'Sin responsable',afterLabel:selected?.label??'Sin responsable',beforeAction:baseline.nextAction||'Sin próxima actuación',afterAction:d.nextAction||'Sin próxima actuación',nextRevision:baseline.revision+1};
}
export function sameCoordination(a,b){verifyCoordination('detail',a);verifyCoordination('detail',b);return JSON.stringify(a)===JSON.stringify(b);}
