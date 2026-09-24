// Deterministic source comparison. No database client, network or publication authority.
import {createHash} from 'node:crypto';
import {ExactCuratedNumber,canonicalCuratedNumber} from './grh-curated-numbers.mjs';
import {CURATED_REVIEW_SCHEMA} from '../../assets/grh-curated-review-model.js';
export const curatedDigest=value=>createHash('sha256').update(value).digest('hex');
export function curatedComparisonFault(code){throw Object.assign(new Error(code),{code});}
export function stableCuratedValue(value,depth=0){
 if(depth>40)curatedComparisonFault('GRH_CURATED_REVIEW_DEPTH_LIMIT');
 if(value instanceof ExactCuratedNumber)return 'number:'+value.canonical;
 if(typeof value==='number'){if(!Number.isSafeInteger(value))curatedComparisonFault('GRH_CURATED_REVIEW_UNSAFE_NUMBER');return 'number:'+canonicalCuratedNumber(JSON.stringify(value));}
 if(Array.isArray(value))return '['+value.map(v=>stableCuratedValue(v,depth+1)).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stableCuratedValue(value[k],depth+1)).join(',')+'}';
 if(typeof value==='number'&&!Number.isSafeInteger(value))curatedComparisonFault('GRH_CURATED_REVIEW_UNSAFE_NUMBER');
 if(value!==null&&!['string','number','boolean'].includes(typeof value))curatedComparisonFault('GRH_CURATED_REVIEW_VALUE_INVALID');
 return JSON.stringify(value);
}
export function compareCuratedArtifact(name,baseline,candidate){
 if(!Object.hasOwn(CURATED_REVIEW_SCHEMA,name)||!Array.isArray(baseline)||!Array.isArray(candidate)||baseline.length>100000||candidate.length>100000)curatedComparisonFault('GRH_CURATED_REVIEW_ENTITY_INVALID');
 const fields=CURATED_REVIEW_SCHEMA[name][2].split(' ');
 const index=rows=>{
  const map=new Map();
  for(const row of rows){
   if(!row||typeof row!=='object'||Array.isArray(row)||!row.sourceKey||typeof row.sourceKey!=='object'||Array.isArray(row.sourceKey)
    ||!Object.keys(row.sourceKey).length||Object.keys(row).some(k=>!fields.includes(k)))curatedComparisonFault('GRH_CURATED_REVIEW_RECORD_INVALID');
   for(const value of Object.values(row.sourceKey))if(!['string','number'].includes(typeof value)||value===''||typeof value==='number'&&!Number.isSafeInteger(value))curatedComparisonFault('GRH_CURATED_REVIEW_KEY_INVALID');
   const key=curatedDigest(stableCuratedValue(row.sourceKey));
   if(map.has(key))curatedComparisonFault('GRH_CURATED_REVIEW_DUPLICATE_KEY');
   map.set(key,{row,sha:curatedDigest(stableCuratedValue(row))});
  }
  return map;
 };
 const a=index(baseline),b=index(candidate);let added=0,changed=0,unchanged=0;const changedFields={};
 for(const [key,next]of b){
  const prev=a.get(key);if(!prev){added++;continue;}if(prev.sha===next.sha){unchanged++;continue;}changed++;
  for(const field of new Set([...Object.keys(prev.row),...Object.keys(next.row)])){
   const presentBefore=Object.hasOwn(prev.row,field),presentAfter=Object.hasOwn(next.row,field);
   if(presentBefore!==presentAfter||stableCuratedValue(prev.row[field])!==stableCuratedValue(next.row[field]))changedFields[field]=(changedFields[field]??0)+1;
  }
 }
 const fingerprint=map=>{const digest=createHash('sha256');for(const [key,row]of [...map].sort(([a],[b])=>a.localeCompare(b)))digest.update(key+':'+row.sha+'\n');return digest.digest('hex');};
 return {before:a.size,after:b.size,added,removed:a.size-b.size+added,changed,unchanged,
  changedFields:Object.fromEntries(Object.entries(changedFields).sort(([a],[b])=>a.localeCompare(b))),
  baselineProjectionSha256:fingerprint(a),candidateProjectionSha256:fingerprint(b)};
}
