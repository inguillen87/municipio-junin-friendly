// Pure bounded contract. Dates are internal targets, not statutory deadlines.
export const FOLLOWUP_STATES=Object.freeze({open:'Pendiente',done:'Resuelto',cancelled:'Cancelado'});
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export class FollowupInputError extends Error {constructor(message='Revisá los datos del seguimiento interno.'){super(message);this.name='FollowupInputError';}}
const bad=()=>{throw new FollowupInputError();};
export const followupId=v=>typeof v==='string'&&UUID.test(v);
export function exactFields(v,keys){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join('|')!==[...keys].sort().join('|'))bad();}
export function targetDate(v,optional=false){if(optional&&v==='')return v;if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||v<'1900-01-01'||v>'2100-12-31')bad();const d=new Date(v+'T00:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==v)bad();return v;}
function text(v,min,max,multi=false){if(typeof v!=='string'||v!==v.trim()||v.length<min||v.length>max||/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)||!multi&&/[\r\n\t]/.test(v))bad();}
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const instant=v=>typeof v==='string'&&v.length<=60&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&Number.isFinite(Date.parse(v));
export function normalizeFollowup(v){
 exactFields(v,['id','normId','normVersion','expectedVersion','title','dueDate','status','note','reason']);
 if(v.id!==null&&!followupId(v.id)||!followupId(v.normId)||!integer(v.normVersion,1,1000)||!integer(v.expectedVersion,0,99)||!Object.hasOwn(FOLLOWUP_STATES,v.status))bad();
 if(v.id===null&&(v.expectedVersion!==0||v.status!=='open')||v.id!==null&&v.expectedVersion===0)bad();
 text(v.title,3,160);text(v.note,0,2000,true);text(v.reason,5,500);targetDate(v.dueDate,true);return structuredClone(v);
}
export function followupTiming(row,today){targetDate(today);targetDate(row.dueDate,true);if(!Object.hasOwn(FOLLOWUP_STATES,row.status))bad();return row.status!=='open'?'closed':!row.dueDate?'undated':row.dueDate<today?'overdue':row.dueDate===today?'today':'upcoming';}
function event(r){if(!r||!integer(r.version,1,100)||!Object.hasOwn(FOLLOWUP_STATES,r.status)||!instant(r.recordedAt))bad();text(r.title,3,160);text(r.note,0,2000,true);text(r.reason,5,500);text(r.recordedBy,1,254);targetDate(r.dueDate,true);}
function record(r,history=false){event(r);if(!followupId(r.id)||!followupId(r.normId)||!integer(r.normVersion,1,1000)||!integer(r.currentNormVersion,r.normVersion,1000))bad();if(history){if(!Array.isArray(r.history)||r.history.length!==r.version)bad();r.history.forEach((h,i)=>{event(h);if(h.version!==r.version-i)bad();});for(const k of ['title','dueDate','status','note','reason','recordedBy','recordedAt'])if(r[k]!==r.history[0][k])bad();}}
export function verifyFollowupResponse(op,d){
 if(!d||d.version!=='legal-followup.v1')bad();
 if(op==='save'||op==='attempt'){if(!followupId(d.id)||!integer(d.recordVersion,1,100)||typeof d.replayed!=='boolean')bad();return d;}
 targetDate(d.today);if(typeof d.canManage!=='boolean')bad();
 if(op==='list'){if(!followupId(d.normId)||d.limit!==100||!Array.isArray(d.rows)||d.rows.length>100)bad();const ids=new Set();for(const r of d.rows){record(r);if(r.normId!==d.normId||ids.has(r.id))bad();ids.add(r.id);}}
 else if(op==='detail')record(d.record,true);else bad();return d;
}
