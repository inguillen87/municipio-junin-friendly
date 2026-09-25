// Evidencia suplementaria: definición original fijada por huella y comparación portable acotada.
import {createHash} from 'node:crypto';
import {canonicalRestorationExpression} from './grh-restoration-expression.mjs';
const failure=()=>{throw Error('RESTORATION_DEFINITION_ATTESTATION_INVALID');};
const digest=value=>createHash('sha256').update(value).digest('hex');
const stable=value=>JSON.stringify(value,function(key,val){return val&&typeof val==='object'&&!Array.isArray(val)?Object.fromEntries(Object.entries(val).sort(([a],[b])=>a<b?-1:a>b?1:0)):val;});
const key=row=>row.schema+'.'+row.name;
export function definitionMaterialSql(sql){
 const start=sql.indexOf('encode(sha256(convert_to('),tail=",'UTF8')),'hex') AS definition_sha256",end=sql.indexOf(tail,start);
 if(start<0||end<0||sql.indexOf('encode(sha256(convert_to(',start+1)>=0)failure();
 const material=sql.slice(start+'encode(sha256(convert_to('.length,end),at=end+tail.length;
 return sql.slice(0,at)+', '+material+' AS definition_source'+sql.slice(at);
}
export function portableDefinitionMaterial(group,source){
 if(!['tables','routines','views','indexes'].includes(group)||typeof source!=='string')failure();let replacements=0;
 const expr=text=>{const r=canonicalRestorationExpression(text);replacements+=r.replacements;return r.sql;};
 if(group==='indexes')return {comparisonSha256:digest(expr(source)),replacements};
 let object;try{object=JSON.parse(source);}catch{failure();}
 const walk=value=>Array.isArray(value)?value.map(walk):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,['definition','default','using','check'].includes(k)&&typeof v==='string'?expr(v):walk(v)])):value;
 return {comparisonSha256:digest(stable(walk(object))),replacements};
}
export function attestDefinitionRows(image,observed){
 const groups={};for(const group of ['tables','routines','views','indexes']){
  const expected=new Map(image[group].map(r=>[key(r),r]));if(!Array.isArray(observed[group])||expected.size!==observed[group].length)failure();
  groups[group]=observed[group].map(row=>{const prior=expected.get(key(row));expected.delete(key(row));if(!prior||row.definition_sha256!==prior.definition_sha256||digest(row.definition_source)!==row.definition_sha256)throw Error('RESTORATION_CAPTURED_DEFINITION_CHANGED');
   return {object:key(row),rawSha256:row.definition_sha256,...portableDefinitionMaterial(group,row.definition_source)};
  });if(expected.size)failure();
 }
 const result={version:'municontrol-restoration-definitions.v1',imageSha256:image.imageSha256,rule:'postgresql17-constant-array-and-boolean-groups.v1',groups};
 return {...result,attestationSha256:digest(stable(result))};
}
export function verifyDefinitionAttestation(value,image){
 if(!value||Object.keys(value).sort().join('|')!=='attestationSha256|groups|imageSha256|rule|version'||value.version!=='municontrol-restoration-definitions.v1'||value.imageSha256!==image.imageSha256||value.rule!=='postgresql17-constant-array-and-boolean-groups.v1')failure();
 const {attestationSha256,...body}=value;if(digest(stable(body))!==attestationSha256||Object.keys(value.groups).sort().join('|')!=='indexes|routines|tables|views')failure();
 for(const group of Object.keys(value.groups)){const expected=new Map(image[group].map(r=>[key(r),r]));if(value.groups[group].length!==expected.size)failure();
  for(const row of value.groups[group]){const prior=expected.get(row.object);expected.delete(row.object);if(!prior||row.rawSha256!==prior.definition_sha256||!Number.isSafeInteger(row.replacements)||row.replacements<0||typeof row.comparisonSha256!=='string'||!/^[a-f0-9]{64}$/.test(row.comparisonSha256)||Object.keys(row).sort().join('|')!=='comparisonSha256|object|rawSha256|replacements')failure();}
  if(expected.size)failure();
 }
 return value;
}
export function portableDefinitionEquivalence(group,object,source,restored){
 const before=source.groups[group].find(r=>r.object===object),after=restored.groups[group].find(r=>r.object===object);
 return !!before&&!!after&&before.comparisonSha256===after.comparisonSha256&&before.replacements+after.replacements>0;
}
