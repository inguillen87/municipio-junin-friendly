// File compatibility is a boundary adapter. The registry and identity decisions are owned by MuniControl.
// In-memory review/recheck only. It neither authenticates users nor writes or approves payroll records.
import {createHash} from 'node:crypto';
import {readGrhTxt} from '../assets/payroll-grh-input.js';
import {reviewNativePayrollImport,NativeImportReviewError} from './native-payroll-import-review.js';
const privateInputs=new WeakMap();
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
function snapshot(registry){
 const v=structuredClone(registry);
 if(!v||!Array.isArray(v.contracts)||!Array.isArray(v.concepts))throw new NativeImportReviewError('NATIVE_IMPORT_REGISTRY_INVALID');
 v.contracts.sort((a,b)=>String(a.id).localeCompare(String(b.id),'en'));
 v.concepts.sort((a,b)=>String(a.code).localeCompare(String(b.code),'en'));
 return v;
}
export function previewNativeEntityFile(registry,file,{profileId,concept,periodMonth,impliedScale=null,groupByDni=false,choices=[]}={}){
 if(profileId!=='junin55'||impliedScale!==null||groupByDni!==false)throw new NativeImportReviewError('NATIVE_IMPORT_PROFILE_UNVERIFIED');
 const captured=file instanceof Uint8Array?Uint8Array.from(file):file;
 const options=structuredClone({profileId,concept,periodMonth,impliedScale,groupByDni,choices});
 const parsed=readGrhTxt(captured,options),basis=snapshot(registry);
 const rows=parsed.rows.map(r=>({rowOrdinal:r.rowOrdinal,dni:r.dni,conceptCode:r.conceptSourceId,quantityDecimal:r.quantityDecimal,amountCents:r.amountCents,sourceLines:r.sourceLines}));
 const review=reviewNativePayrollImport({registry:basis,periodMonth,inputRows:parsed.inputRows,rows,choices:options.choices});
 const fileSha256=sha(captured),registrySha256=sha(canonical(basis));
 const token=sha(canonical({fileSha256,registrySha256,profileId:parsed.profileId,periodMonth,concept:parsed.concept,scale:parsed.impliedScale,groupByDni,review}));
 const result=freeze({version:'native-entity-preview.v1',fileSha256,registrySha256,token,profileId:parsed.profileId,concept:parsed.concept,periodMonth,impliedScale:parsed.impliedScale,groupByDni,review});
 privateInputs.set(result,{bytes:captured,options,registrySha256,tenantId:basis.tenantId});return result;
}
export function recheckNativeEntityPreview(previous,currentRegistry){
 const captured=privateInputs.get(previous);
 if(!captured)throw new NativeImportReviewError('NATIVE_IMPORT_PREVIEW_UNKNOWN');
 let basis;try{basis=snapshot(currentRegistry);}catch{retireNativeEntityPreview(previous);throw new NativeImportReviewError('NATIVE_IMPORT_REGISTRY_INVALID');}
 if(basis.tenantId!==captured.tenantId||sha(canonical(basis))!==captured.registrySha256){retireNativeEntityPreview(previous);throw new NativeImportReviewError('NATIVE_IMPORT_REGISTRY_CHANGED');}
 const checked=previewNativeEntityFile(basis,captured.bytes,captured.options);
 if(checked.token!==previous.token){retireNativeEntityPreview(checked);throw new NativeImportReviewError('NATIVE_IMPORT_PREVIEW_CHANGED');}
 retireNativeEntityPreview(checked);return previous;
}
export function retireNativeEntityPreview(previous){
 const captured=privateInputs.get(previous);if(!captured)return false;
 captured.bytes.fill(0);privateInputs.delete(previous);return true;
}
