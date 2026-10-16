// A verified wire is evidence, never authority. SQL resolves the actual owner.
import {catalogItems} from './native-employment-catalog-model.js';
import {adoptionReviewHash,adoptionReviewJson} from './employment-adoption-review-model.js';

export const OWNER_CATALOG_POLICY=Object.freeze({version:'municipal-owner-catalog-policy.v1',domain:'employment_catalog',authority:'platform_owner_and_municipal_operator',operatorCapability:'employee.catalog.propose',decisionMode:'owner',independence:false,effect:'approve_exact_catalog_proposal'});
export const OWNER_CATALOG_POLICY_SHA256='17fbc499030196be8e40594bd19dbc82913b7278683f87eba3aa6124f805982f';
export const OWNER_CATALOG_MAX_BYTES=4*1024*1024;
const previews=new WeakSet(),same=(a,b)=>adoptionReviewJson(a)===adoptionReviewJson(b);
export class OwnerCatalogError extends Error{constructor(code='CONTRACT_INVALID'){super('No se pudo verificar la decisión del propietario. Conservá el mismo intento.');Object.assign(this,{code:'OWNER_CATALOG_'+code});}}
const need=(v,code)=>{if(!v)throw new OwnerCatalogError(code);};
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k))&&Object.values(Object.getOwnPropertyDescriptors(v)).every(d=>Object.hasOwn(d,'value'));
const uuid=v=>typeof v==='string'&&v.length===36&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
export const ownerCatalogAttemptKey=v=>uuid(v)&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
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
 need(exact(v,['version','policyVersion','policySha256','actor'])&&v.version==='municipal-adoption-owner-authority.v1'&&v.policyVersion==='tenant-owner-adoption-policy.v1'&&sha(v.policySha256));
 const a=v.actor;need(exact(a,['personId','email','identityVersion','sessionId','sessionVersion','releaseSha'])&&uuid(a.personId)&&text(a.email,3,320)&&a.email===a.email.toLowerCase()&&positive(a.identityVersion)&&uuid(a.sessionId)&&positive(a.sessionVersion)&&typeof a.releaseSha==='string'&&a.releaseSha.length===40&&/^[a-f0-9]{40}$/.test(a.releaseSha));
}
export function ownerCatalogAuthority(v){
 data(v);need(exact(v,['version','scope','authority','policy','scopeVersion'])&&v.version==='municipal-owner-catalog-authority.v1'&&sha(v.scopeVersion));scope(v.scope);authority(v.authority);
 need(exact(v.policy,['version','sha256'])&&v.policy.version===OWNER_CATALOG_POLICY.version&&v.policy.sha256===OWNER_CATALOG_POLICY_SHA256);
 return freeze(structuredClone(v));
}
export async function ownerCatalogPreview(v,expected){
 data(v);need(exact(v,['version','decisionMode','independence','context','proposal','itemsSha256','current','previewSha256'])&&v.version==='municipal-owner-catalog-preview.v1'&&v.decisionMode==='owner'&&v.independence===false&&v.current===true&&sha(v.itemsSha256)&&sha(v.previewSha256));
 const context=ownerCatalogAuthority(v.context);if(expected)need(same(context,ownerCatalogAuthority(expected)),'SCOPE_CHANGED');
 const p=v.proposal;need(exact(p,['id','requestSha256','baseVersion','baseItems','items','reason','authorLabel','createdAt'])&&uuid(p.id)&&sha(p.requestSha256)&&sha(p.baseVersion)&&text(p.reason,10,1000)&&text(p.authorLabel,1,160)&&typeof p.createdAt==='string'&&Number.isFinite(Date.parse(p.createdAt)));
 catalogItems(p.baseItems);catalogItems(p.items);need(await adoptionReviewHash(p.items)===v.itemsSha256);
 const {previewSha256,...unsigned}=v;need(await adoptionReviewHash(unsigned)===previewSha256);
 const result=freeze(structuredClone(v));previews.add(result);return result;
}
export function ownerCatalogCommandInput(v){
 data(v);need(exact(v,['version','proposalId','proposalSha256','baseVersion','scopeVersion','itemsSha256','previewSha256','reason','reviewConfirmed'])&&v.version==='municipal-owner-catalog-command.v1'&&uuid(v.proposalId)&&[v.proposalSha256,v.baseVersion,v.scopeVersion,v.itemsSha256,v.previewSha256].every(sha)&&text(v.reason,10,1000)&&v.reviewConfirmed===true,'INPUT_INVALID');return freeze(structuredClone(v));
}
export function ownerCatalogCommand(preview,{reason,reviewConfirmed}={}){
 need(previews.has(preview),'PREVIEW_REQUIRED');return ownerCatalogCommandInput({version:'municipal-owner-catalog-command.v1',proposalId:preview.proposal.id,proposalSha256:preview.proposal.requestSha256,baseVersion:preview.proposal.baseVersion,scopeVersion:preview.context.scopeVersion,itemsSha256:preview.itemsSha256,previewSha256:preview.previewSha256,reason,reviewConfirmed});
}
export function ownerCatalogReceipt(v,{key,command,preview}={}){
 data(v);need(exact(v,['version','decisionMode','independence','reviewId','proposalId','requestKey','requestSha256','catalogVersion','revision','total','previewSha256','itemsSha256','policySha256','replayed'])&&v.version==='municipal-owner-catalog-receipt.v1'&&v.decisionMode==='owner'&&v.independence===false&&[v.reviewId,v.proposalId].every(uuid)&&ownerCatalogAttemptKey(v.requestKey)&&[v.requestSha256,v.catalogVersion,v.previewSha256,v.itemsSha256,v.policySha256].every(sha)&&v.policySha256===OWNER_CATALOG_POLICY_SHA256&&positive(v.revision)&&v.revision<=1000&&Number.isSafeInteger(v.total)&&v.total>=4&&v.total<=1500&&typeof v.replayed==='boolean');
 if(key!==undefined)need(v.requestKey===key);if(command)need(v.proposalId===command.proposalId&&v.previewSha256===command.previewSha256&&v.itemsSha256===command.itemsSha256);if(preview)need(v.total===preview.proposal.items.length);return freeze(structuredClone(v));
}
export async function ownerCatalogAttempt(v,{key,command}={}){
 data(v);need(exact(v,['version','authorization','preview','command','receipt'])&&v.version==='municipal-owner-catalog-attempt.v1');const authorization=ownerCatalogAuthority(v.authorization),preview=await ownerCatalogPreview(v.preview),stored=ownerCatalogCommandInput(v.command);
 need(same(authorization.scope,preview.context.scope)&&authorization.authority.actor.personId===preview.context.authority.actor.personId&&authorization.authority.actor.email===preview.context.authority.actor.email);
 const expected=ownerCatalogCommand(preview,{reason:stored.reason,reviewConfirmed:true});need(same(stored,expected));if(command)need(same(stored,ownerCatalogCommandInput(command)),'IDEMPOTENCY_REUSE');
 const receipt=ownerCatalogReceipt(v.receipt,{key,command:stored,preview});need(receipt.requestSha256===await adoptionReviewHash({operation:'approve_owner',body:stored}));return freeze({version:v.version,authorization,preview,command:stored,receipt});
}
