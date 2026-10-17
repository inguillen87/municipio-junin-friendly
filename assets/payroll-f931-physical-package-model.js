// Physical byte comparison only. No fiscal layout, person key or amount mapping.
export const F931_PHYSICAL_SCOPES = Object.freeze(['general','jurisdiction_42','jurisdiction_55']);
export const F931_PHYSICAL_LABELS = Object.freeze({general:'General',jurisdiction_42:'Jurisdicción 42',jurisdiction_55:'Jurisdicción 55'});
export const F931_PHYSICAL_MAX_BYTES = 8 * 1024 * 1024;
export const F931_PHYSICAL_MAX_ROWS = 100000;
const trusted = new WeakMap();
const freeze = v => {if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const fail = code => {throw Object.assign(new Error(code),{code});};
const exactKeys = (v,keys) => v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const current = valid => {if(!valid())throw Object.assign(new Error('F931_PHYSICAL_WITHDRAWN'),{name:'AbortError'});};

function byteKey(bytes,start,end){
 let value='';
 // A reversible byte-to-code-unit key; no decoder, normalization or hash collisions.
 for(let at=start;at<end;at+=8192)value+=String.fromCharCode(...bytes.subarray(at,Math.min(at+8192,end)));
 return value;
}
function scan(bytes){
 const rows=new Map(),endings={crlf:0,lf:0,cr:0,unterminated:0};
 let start=0,count=0,blank=0,min=Infinity,max=0;
 const add=(end,ending)=>{
  if(++count>F931_PHYSICAL_MAX_ROWS)fail('F931_PHYSICAL_TOO_MANY_ROWS');
  const width=end-start;min=Math.min(min,width);max=Math.max(max,width);if(width===0)blank++;
  const key=byteKey(bytes,start,end);rows.set(key,(rows.get(key)??0)+1);endings[ending]++;
 };
 for(let i=0;i<bytes.length;i++){
  if(bytes[i]===13){const paired=bytes[i+1]===10;add(i,paired?'crlf':'cr');if(paired)i++;start=i+1;}
  else if(bytes[i]===10){add(i,'lf');start=i+1;}
 }
 if(start<bytes.length)add(bytes.length,'unterminated');
 return {rows,summary:{byteLength:bytes.length,physicalRows:count,distinctRows:rows.size,repeatedOccurrences:count-rows.size,repeatedRowKinds:[...rows.values()].filter(n=>n>1).length,blankRows:blank,minRowBytes:min,maxRowBytes:max,lineEndings:endings}};
}
function intersection(a,b){let shared=0;for(const key of a.keys())if(b.has(key))shared++;return shared;}
function sameBytes(a,b){return a.length===b.length&&a.every((value,index)=>value===b[index]);}
async function digest(bytes,cryptoImpl){
 if(typeof cryptoImpl?.subtle?.digest!=='function')fail('F931_PHYSICAL_CRYPTO_REQUIRED');
 const hash=await cryptoImpl.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

export async function compareF931PhysicalPackage(value,{cryptoImpl=globalThis.crypto,valid=()=>true}={}){
 if(!exactKeys(value,['period','artifacts'])||typeof value.period!=='string'||!/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(value.period))fail('F931_PHYSICAL_PERIOD_INVALID');
 if(!Array.isArray(value.artifacts)||value.artifacts.length!==3||Object.keys(value.artifacts).length!==3)fail('F931_PHYSICAL_THREE_FILES_REQUIRED');
 const source=new Map();
 for(const a of value.artifacts){
  if(!exactKeys(a,['scope','bytes'])||!F931_PHYSICAL_SCOPES.includes(a.scope)||source.has(a.scope))fail('F931_PHYSICAL_SCOPES_INVALID');
  if(!(a.bytes instanceof Uint8Array)||!(a.bytes.buffer instanceof ArrayBuffer)||!a.bytes.length||a.bytes.length>F931_PHYSICAL_MAX_BYTES)fail('F931_PHYSICAL_BYTES_INVALID');
  source.set(a.scope,new Uint8Array(a.bytes));
 }
 current(valid);
 const scans=new Map(F931_PHYSICAL_SCOPES.map(scope=>[scope,scan(source.get(scope))]));
 const hashes=await Promise.all(F931_PHYSICAL_SCOPES.map(scope=>digest(source.get(scope),cryptoImpl)));
 current(valid);
 const artifacts=F931_PHYSICAL_SCOPES.map(scope=>({scope,...scans.get(scope).summary})),pairs=[];
 for(let i=0;i<F931_PHYSICAL_SCOPES.length;i++)for(let j=i+1;j<F931_PHYSICAL_SCOPES.length;j++){
  const left=F931_PHYSICAL_SCOPES[i],right=F931_PHYSICAL_SCOPES[j];
  pairs.push({left,right,sharedDistinctRows:intersection(scans.get(left).rows,scans.get(right).rows),identicalFileBytes:sameBytes(source.get(left),source.get(right))});
 }
 const general=scans.get('general').rows,union=new Map([...scans.get('jurisdiction_42').rows,...scans.get('jurisdiction_55').rows]),shared=intersection(general,union);
 const result=freeze({version:'f931-physical-package.v1',period:value.period,declaredPeriodOnly:true,complete:true,artifacts,pairs,
  generalVersusJurisdictionUnion:{generalDistinctRows:general.size,jurisdictionUnionDistinctRows:union.size,sharedDistinctRows:shared,generalOnlyDistinctRows:general.size-shared,jurisdictionOnlyDistinctRows:union.size-shared},
  physicalRowCountSum:artifacts.reduce((n,a)=>n+a.physicalRows,0),physicalRowCountSumIsPeople:false,comparisonIgnoresLineTerminators:true,
  fiscalLayoutValidated:false,fiscalPopulationValidated:false,canGenerate:false,canSubmit:false,sourceValuesIncluded:false,fileNamesIncluded:false,persistencePerformed:false,networkPerformed:false});
 // Only the complete-file digests survive privately for a fresh download check.
 // Byte keys, individual rows and per-row hashes never leave this invocation.
 trusted.set(result,JSON.stringify([value.period,...hashes]));
 return result;
}
export function f931PhysicalProof(result){if(!trusted.has(result))fail('F931_PHYSICAL_UNVERIFIED_RESULT');return trusted.get(result);}
export function f931PhysicalCsv(result){
 f931PhysicalProof(result);
 const rows=[['CONTROL FÍSICO LOCAL F.931 · NO ES TXT FISCAL','Ámbito','Comparación','Cantidad'],
  ['Período declarado',result.period,'No se deduce del archivo',''],
  ['Alcance','Tres archivos completos','La suma de filas no representa personas',result.physicalRowCountSum]];
 const labels={byteLength:'Bytes completos',physicalRows:'Filas físicas',distinctRows:'Filas distintas por bytes',repeatedOccurrences:'Repeticiones adicionales de filas idénticas',repeatedRowKinds:'Filas distintas con repetición',blankRows:'Filas vacías',minRowBytes:'Menor ancho de fila en bytes',maxRowBytes:'Mayor ancho de fila en bytes'};
 for(const a of result.artifacts){
  for(const [key,label]of Object.entries(labels))rows.push(['Archivo',F931_PHYSICAL_LABELS[a.scope],label,a[key]]);
  for(const [key,label]of Object.entries({crlf:'Terminaciones CRLF',lf:'Terminaciones LF',cr:'Terminaciones CR',unterminated:'Filas sin terminación final'}))rows.push(['Archivo',F931_PHYSICAL_LABELS[a.scope],label,a.lineEndings[key]]);
 }
 for(const p of result.pairs){const pair=F931_PHYSICAL_LABELS[p.left]+' / '+F931_PHYSICAL_LABELS[p.right];rows.push(['Entre archivos',pair,'Filas distintas idénticas sin terminación de línea',p.sharedDistinctRows],['Entre archivos',pair,'Archivos idénticos byte a byte',p.identicalFileBytes?'Sí':'No']);}
 const labelsUnion={generalDistinctRows:'Filas distintas de General',jurisdictionUnionDistinctRows:'Filas distintas reunidas de J42 y J55',sharedDistinctRows:'Filas distintas compartidas',generalOnlyDistinctRows:'Filas distintas sólo en General',jurisdictionOnlyDistinctRows:'Filas distintas sólo en J42/J55'};
 for(const [key,label]of Object.entries(labelsUnion))rows.push(['General frente a J42/J55','Comparación física',label,result.generalVersusJurisdictionUnion[key]]);
 rows.push(['Límite','Sin interpretación fiscal','Las diferencias pueden ser esperables; no se concilian personas ni importes',''],['Límite','Sin generación ni presentación','No acredita diseño vigente, aceptación fiscal ni envío','']);
 const cell=v=>'"'+String(v).replaceAll('"','""')+'"';
 return '\ufeff'+rows.map(r=>r.map(cell).join(';')).join('\r\n')+'\r\n';
}
