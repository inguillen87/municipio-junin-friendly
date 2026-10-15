// A verified wire is evidence, never authority. SQL resolves the actual owner.
import {salaryItems,salaryDiff,salarySerialized,salaryCommand} from './native-salary-catalog-model.js';
import {adoptionReviewHash,adoptionReviewJson} from './employment-adoption-review-model.js';

export const OWNER_SALARY_POLICY=Object.freeze({version:'municipal-owner-salary-policy.v1',domain:'salary_catalog',authority:'platform_owner_and_municipal_operator',operatorCapability:'payroll.parameter.prepare',decisionMode:'owner',independence:false,effect:'approve_exact_salary_proposal'});
export const OWNER_SALARY_POLICY_SHA256='c5f14b07e02ce1d3044627ea769b93e31803d507e025177746225d2c1dd12d71';
export const OWNER_SALARY_MAX_BYTES=16*1024*1024;
const previews=new WeakSet(),same=(a,b)=>adoptionReviewJson(a)===adoptionReviewJson(b);
export class OwnerSalaryError extends Error{constructor(code='CONTRACT_INVALID'){super('No se pudo verificar la decisión del propietario. Conservá el mismo intento.');Object.assign(this,{code:'OWNER_SALARY_'+code});}}
const need=(v,code)=>{if(!v)throw new OwnerSalaryError(code);};
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k))&&Object.values(Object.getOwnPropertyDescriptors(v)).every(d=>Object.hasOwn(d,'value'));
const uuid=v=>typeof v==='string'&&v.length===36&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
export const ownerSalaryAttemptKey=v=>uuid(v)&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const sha=v=>typeof v==='string'&&v.length===64&&/^[a-f0-9]{64}$/.test(v);
const text=(v,min,max)=>typeof v==='string'&&v===v.normalize('NFC').trim()&&[...v].length>=min&&[...v].length<=max&&!/[<>\u0000-\u001f\u007f-\u009f]/u.test(v);
const positive=v=>Number.isSafeInteger(v)&&v>0;
function data(v,stack=new Set(),depth=0){
 need(depth<=32);if(v===null||typeof v==='string'||typeof v==='boolean')return;
 if(typeof v==='number'){need(Number.isSafeInteger(v)&&!Object.is(v,-0));return;}
 need(v&&typeof v==='object'&&!stack.has(v));const a=Array.isArray(v),keys=Reflect.ownKeys(v),d=Object.getOwnPropertyDescriptors(v);
 need(a?Object.getPrototypeOf(v)===Array.prototype:[Object.prototype,null].includes(Object.getPrototypeOf(v)));
 need(keys.every(k=>typeof k==='string'&&Object.hasOwn(d[k],'value')&&(a&&k==='length'||d[k].enumerable)));
 if(a)need(keys.length===v.length+1&&keys.every(k=>k==='length'||/^(0|[1-9][0-9]*)$/.test(k)&&Number(k)<v.length));
 stack.add(v);for(const k of keys)if(!a||k!=='length')data(d[k].value,stack,depth+1);stack.delete(v);
}
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
function scope(v){need(exact(v,['tenantId','membershipId','bindingId','companyId'])&&[v.tenantId,v.membershipId,v.bindingId].every(uuid)&&positive(v.companyId));}
function authority(v){
 need(exact(v,['version','policyVersion','policySha256','actor'])&&v.version==='municipal-adoption-owner-authority.v1'&&v.policyVersion==='tenant-owner-adoption-policy.v1'&&v.policySha256==='3cd05ec553d4e19e511b4d755224efe36a470a02502704a621dec608ad312305');
 const a=v.actor;need(exact(a,['personId','email','identityVersion','sessionId','sessionVersion','releaseSha'])&&uuid(a.personId)&&text(a.email,3,320)&&a.email===a.email.toLowerCase()&&positive(a.identityVersion)&&uuid(a.sessionId)&&positive(a.sessionVersion)&&typeof a.releaseSha==='string'&&a.releaseSha.length===40&&/^[a-f0-9]{40}$/.test(a.releaseSha));
}
export function ownerSalaryAuthority(v){
 data(v);need(exact(v,['version','scope','authority','policy','scopeVersion'])&&v.version==='municipal-owner-salary-authority.v1'&&sha(v.scopeVersion));scope(v.scope);authority(v.authority);
 need(exact(v.policy,['version','sha256'])&&v.policy.version===OWNER_SALARY_POLICY.version&&v.policy.sha256===OWNER_SALARY_POLICY_SHA256);
 return freeze(structuredClone(v));
}
export async function ownerSalaryPreview(v,expected){
 data(v);need(exact(v,['version','decisionMode','independence','context','proposal','itemsSha256','current','previewSha256'])&&v.version==='municipal-owner-salary-preview.v1'&&v.decisionMode==='owner'&&v.independence===false&&v.current===true&&sha(v.itemsSha256)&&sha(v.previewSha256));
 const context=ownerSalaryAuthority(v.context);if(expected)need(same(context,ownerSalaryAuthority(expected)),'SCOPE_CHANGED');
 const p=v.proposal;need(exact(p,['id','requestSha256','baseVersion','classificationVersion','baseItems','items','reason','authorLabel','createdAt'])&&uuid(p.id)&&sha(p.requestSha256)&&sha(p.baseVersion)&&sha(p.classificationVersion)&&text(p.reason,10,1000)&&text(p.authorLabel,1,160)&&typeof p.createdAt==='string'&&Number.isFinite(Date.parse(p.createdAt)));
 salaryDiff(p.baseItems,p.items);need(salarySerialized(salaryItems(p.baseItems,{allowEmpty:true}))===salarySerialized(p.baseItems)&&salarySerialized(salaryItems(p.items))===salarySerialized(p.items));need(await adoptionReviewHash(p.items)===v.itemsSha256);
 const {previewSha256,...unsigned}=v;need(await adoptionReviewHash(unsigned)===previewSha256);
 const result=freeze(structuredClone(v));previews.add(result);return result;
}
export function ownerSalaryCommandInput(v){
 data(v);need(exact(v,['version','proposalId','proposalSha256','baseVersion','classificationVersion','scopeVersion','itemsSha256','previewSha256','reason','reviewConfirmed'])&&v.version==='municipal-owner-salary-command.v1'&&uuid(v.proposalId)&&[v.proposalSha256,v.baseVersion,v.classificationVersion,v.scopeVersion,v.itemsSha256,v.previewSha256].every(sha)&&text(v.reason,10,1000)&&v.reviewConfirmed===true,'INPUT_INVALID');return freeze(structuredClone(v));
}
export function ownerSalaryCommand(preview,{reason,reviewConfirmed}={}){
 need(previews.has(preview),'PREVIEW_REQUIRED');return ownerSalaryCommandInput({version:'municipal-owner-salary-command.v1',proposalId:preview.proposal.id,proposalSha256:preview.proposal.requestSha256,baseVersion:preview.proposal.baseVersion,classificationVersion:preview.proposal.classificationVersion,scopeVersion:preview.context.scopeVersion,itemsSha256:preview.itemsSha256,previewSha256:preview.previewSha256,reason,reviewConfirmed});
}
export function ownerSalaryReceipt(v,{key,command,preview}={}){
 data(v);need(exact(v,['version','decisionMode','independence','eventId','proposalId','requestKey','requestSha256','canonicalRequestSha256','catalogVersion','revision','total','previewSha256','itemsSha256','policySha256','replayed'])&&v.version==='municipal-owner-salary-receipt.v1'&&v.decisionMode==='owner'&&v.independence===false&&[v.eventId,v.proposalId].every(uuid)&&ownerSalaryAttemptKey(v.requestKey)&&[v.requestSha256,v.canonicalRequestSha256,v.catalogVersion,v.previewSha256,v.itemsSha256,v.policySha256].every(sha)&&v.policySha256===OWNER_SALARY_POLICY_SHA256&&positive(v.revision)&&v.revision<=1000&&Number.isSafeInteger(v.total)&&v.total>=1&&v.total<=10000&&typeof v.replayed==='boolean');
 if(key!==undefined)need(v.requestKey===key);if(command)need(v.proposalId===command.proposalId&&v.previewSha256===command.previewSha256&&v.itemsSha256===command.itemsSha256);if(preview)need(v.total===preview.proposal.items.length);return freeze(structuredClone(v));
}
export async function ownerSalaryAttempt(v,{key,command}={}){
 data(v);need(exact(v,['version','authorization','preview','command','receipt'])&&v.version==='municipal-owner-salary-attempt.v1');const authorization=ownerSalaryAuthority(v.authorization),preview=await ownerSalaryPreview(v.preview),stored=ownerSalaryCommandInput(v.command);
 need(same(authorization.scope,preview.context.scope)&&authorization.authority.actor.personId===preview.context.authority.actor.personId&&authorization.authority.actor.email===preview.context.authority.actor.email);
 const expected=ownerSalaryCommand(preview,{reason:stored.reason,reviewConfirmed:true});need(same(stored,expected));if(command)need(same(stored,ownerSalaryCommandInput(command)),'IDEMPOTENCY_REUSE');
 const receipt=ownerSalaryReceipt(v.receipt,{key,command:stored,preview});need(receipt.requestSha256===await adoptionReviewHash({operation:'approve_owner',body:stored}));need(receipt.canonicalRequestSha256===await adoptionReviewHash(ownerSalaryNativeCommand(stored)));return freeze({version:v.version,authorization,preview,command:stored,receipt});
}

export function ownerSalaryNativeCommand(value){const c=ownerSalaryCommandInput(value);return salaryCommand({command:'approve',scopeVersion:c.scopeVersion,baseVersion:c.baseVersion,classificationVersion:c.classificationVersion,proposalId:c.proposalId,proposalSha256:c.proposalSha256,items:null,reason:c.reason,reviewConfirmed:true});}

export function salaryErrorGuidance({code,status}={}){if(status===401)return 'La sesión terminó o cambió. Volvé a ingresar y consultá el mismo intento.';if(status===403)return 'Tu cuenta necesita autorización vigente de propietario y preparación salarial. Conservamos el intento.';if(code==='NATIVE_SALARY_NOT_FOUND')return 'El intento no tiene confirmación. Podés consultar otra vez o reenviar exactamente el mismo contenido.';if(status===409)return 'Cambió la propuesta, la versión o su autorización. Conservamos el mismo intento para consultar el resultado.';return 'No se confirmó la decisión. Consultá el mismo intento antes de repetirla.';}
