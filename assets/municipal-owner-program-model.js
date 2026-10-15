// A verified wire is evidence, never authority. SQL resolves the actual owner.
import {salaryItems,salarySerialized} from './native-salary-catalog-model.js';
import {ownProgramDefinition,ownProgramStructure,ownProgramHistory,ownProgramCommand} from './own-payroll-program-model.js';
import {adoptionReviewHash,adoptionReviewJson} from './employment-adoption-review-model.js';

export const OWNER_PROGRAM_POLICY=Object.freeze({version:'municipal-owner-program-policy.v1',domain:'payroll_program',authority:'platform_owner_and_municipal_operator',operatorCapability:'payroll.parameter.prepare',decisionMode:'owner',independence:false,effect:'approve_exact_program_proposal'});
export const OWNER_PROGRAM_POLICY_SHA256='e338f565f1a03bc3b4a1de2997156d8bb76a37aaed27adffe36e28555d6fd0dc';
export const OWNER_PROGRAM_MAX_BYTES=16*1024*1024;
const previews=new WeakSet(),same=(a,b)=>adoptionReviewJson(a)===adoptionReviewJson(b);
export class OwnerProgramError extends Error{constructor(code='CONTRACT_INVALID'){super('No se pudo verificar la decisión del propietario. Conservá el mismo intento.');Object.assign(this,{code:'OWNER_PROGRAM_'+code});}}
const need=(v,code)=>{if(!v)throw new OwnerProgramError(code);};
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k))&&Object.values(Object.getOwnPropertyDescriptors(v)).every(d=>Object.hasOwn(d,'value'));
const uuid=v=>typeof v==='string'&&v.length===36&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
export const ownerProgramAttemptKey=v=>uuid(v)&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const sha=v=>typeof v==='string'&&v.length===64&&/^[a-f0-9]{64}$/.test(v);
const text=(v,min,max)=>typeof v==='string'&&v===v.normalize('NFC').trim()&&[...v].length>=min&&[...v].length<=max&&!/[<>\u0000-\u001f\u007f-\u009f]/u.test(v);
const positive=v=>Number.isSafeInteger(v)&&v>0;
function data(v,stack=new Set(),depth=0){
 // The existing expression validator owns its32-level AST limit; the wire
 // adds proposal/context containers around that complete expression.
 need(depth<=64);if(v===null||typeof v==='string'||typeof v==='boolean')return;
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
export function ownerProgramAuthority(v){
 data(v);need(exact(v,['version','scope','authority','policy','scopeVersion'])&&v.version==='municipal-owner-program-authority.v1'&&sha(v.scopeVersion));scope(v.scope);authority(v.authority);
 need(exact(v.policy,['version','sha256'])&&v.policy.version===OWNER_PROGRAM_POLICY.version&&v.policy.sha256===OWNER_PROGRAM_POLICY_SHA256);
 return freeze(structuredClone(v));
}
export async function ownerProgramPreview(v,expected){
 data(v);need(exact(v,['version','decisionMode','independence','context','proposal','definitionSha256','salaryItemsSha256','classificationVersion','current','previewSha256'])&&v.version==='municipal-owner-program-preview.v1'&&v.decisionMode==='owner'&&v.independence===false&&v.current===true&&[v.definitionSha256,v.salaryItemsSha256,v.classificationVersion,v.previewSha256].every(sha));
 const context=ownerProgramAuthority(v.context);if(expected)need(same(context,ownerProgramAuthority(expected)),'SCOPE_CHANGED');
 const p=v.proposal;need(exact(p,['id','requestSha256','baseVersion','salaryVersion','baseDefinition','definition','salaryItems','reason','authorLabel','createdAt'])&&uuid(p.id)&&[p.requestSha256,p.baseVersion,p.salaryVersion].every(sha)&&text(p.reason,10,1000)&&text(p.authorLabel,1,160)&&typeof p.createdAt==='string'&&Number.isFinite(Date.parse(p.createdAt)));
 need(salarySerialized(salaryItems(p.salaryItems))===salarySerialized(p.salaryItems));
 need(salarySerialized(ownProgramDefinition(p.definition,p.salaryItems))===salarySerialized(p.definition));
 if(p.baseDefinition!==null)need(salarySerialized(ownProgramStructure(p.baseDefinition))===salarySerialized(p.baseDefinition));
 ownProgramHistory(p.baseDefinition,p.definition);
 need(await adoptionReviewHash(p.definition)===v.definitionSha256&&await adoptionReviewHash(p.salaryItems)===v.salaryItemsSha256);
 const {previewSha256,...unsigned}=v;need(await adoptionReviewHash(unsigned)===previewSha256);
 const result=freeze(structuredClone(v));previews.add(result);return result;
}
export function ownerProgramCommandInput(v){
 data(v);need(exact(v,['version','proposalId','proposalSha256','baseVersion','salaryVersion','scopeVersion','definitionSha256','salaryItemsSha256','previewSha256','reason','reviewConfirmed'])&&v.version==='municipal-owner-program-command.v1'&&uuid(v.proposalId)&&[v.proposalSha256,v.baseVersion,v.salaryVersion,v.scopeVersion,v.definitionSha256,v.salaryItemsSha256,v.previewSha256].every(sha)&&text(v.reason,10,1000)&&v.reviewConfirmed===true,'INPUT_INVALID');return freeze(structuredClone(v));
}
export function ownerProgramCommand(preview,{reason,reviewConfirmed}={}){
 need(previews.has(preview),'PREVIEW_REQUIRED');return ownerProgramCommandInput({version:'municipal-owner-program-command.v1',proposalId:preview.proposal.id,proposalSha256:preview.proposal.requestSha256,baseVersion:preview.proposal.baseVersion,salaryVersion:preview.proposal.salaryVersion,scopeVersion:preview.context.scopeVersion,definitionSha256:preview.definitionSha256,salaryItemsSha256:preview.salaryItemsSha256,previewSha256:preview.previewSha256,reason,reviewConfirmed});
}
export function ownerProgramReceipt(v,{key,command,preview}={}){
 data(v);need(exact(v,['version','decisionMode','independence','eventId','proposalId','requestKey','requestSha256','canonicalRequestSha256','programVersion','revision','rulesTotal','bindingsTotal','definitionSha256','salaryItemsSha256','previewSha256','policySha256','replayed'])&&v.version==='municipal-owner-program-receipt.v1'&&v.decisionMode==='owner'&&v.independence===false&&[v.eventId,v.proposalId].every(uuid)&&ownerProgramAttemptKey(v.requestKey)&&[v.requestSha256,v.canonicalRequestSha256,v.programVersion,v.previewSha256,v.definitionSha256,v.salaryItemsSha256,v.policySha256].every(sha)&&v.policySha256===OWNER_PROGRAM_POLICY_SHA256&&positive(v.revision)&&v.revision<=1000&&Number.isSafeInteger(v.rulesTotal)&&v.rulesTotal>=1&&v.rulesTotal<=1000&&Number.isSafeInteger(v.bindingsTotal)&&v.bindingsTotal>=0&&v.bindingsTotal<=1000&&typeof v.replayed==='boolean');
 if(key!==undefined)need(v.requestKey===key);if(command)need(v.proposalId===command.proposalId&&v.previewSha256===command.previewSha256&&v.definitionSha256===command.definitionSha256&&v.salaryItemsSha256===command.salaryItemsSha256);if(preview)need(v.rulesTotal===preview.proposal.definition.rules.length&&v.bindingsTotal===preview.proposal.definition.bindings.length);return freeze(structuredClone(v));
}
export async function ownerProgramAttempt(v,{key,command}={}){
 data(v);need(exact(v,['version','authorization','preview','command','receipt'])&&v.version==='municipal-owner-program-attempt.v1');const authorization=ownerProgramAuthority(v.authorization),preview=await ownerProgramPreview(v.preview),stored=ownerProgramCommandInput(v.command);
 need(same(authorization.scope,preview.context.scope)&&authorization.authority.actor.personId===preview.context.authority.actor.personId&&authorization.authority.actor.email===preview.context.authority.actor.email);
 const expected=ownerProgramCommand(preview,{reason:stored.reason,reviewConfirmed:true});need(same(stored,expected));if(command)need(same(stored,ownerProgramCommandInput(command)),'IDEMPOTENCY_REUSE');
 const receipt=ownerProgramReceipt(v.receipt,{key,command:stored,preview});need(receipt.requestSha256===await adoptionReviewHash({operation:'approve_owner',body:stored}));need(receipt.canonicalRequestSha256===await adoptionReviewHash(ownerProgramNativeCommand(stored)));return freeze({version:v.version,authorization,preview,command:stored,receipt});
}
export function ownerProgramNativeCommand(value){const c=ownerProgramCommandInput(value);return ownProgramCommand({command:'approve',scopeVersion:c.scopeVersion,baseVersion:c.baseVersion,salaryVersion:c.salaryVersion,proposalId:c.proposalId,proposalSha256:c.proposalSha256,program:null,reason:c.reason,reviewConfirmed:true});}
export function programErrorGuidance({code,status}={}){if(status===401)return 'La sesión terminó o cambió. Volvé a ingresar y consultá el mismo intento.';if(status===403)return 'Tu cuenta necesita autorización vigente de propietario y preparación del programa. Conservamos el intento.';if(code==='OWN_PROGRAM_NOT_FOUND')return 'El intento no tiene confirmación. Podés consultar otra vez o reenviar exactamente el mismo contenido.';if(status===409)return 'Cambió la propuesta, la versión o su autorización. Conservamos el mismo intento para consultar el resultado.';return 'No se confirmó la decisión. Consultá el mismo intento antes de repetirla.';}
