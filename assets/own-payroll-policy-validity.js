// Inclusive civil-month validity; an explicit null end means no declared end.
// A scope is declared evidence, never an
// approval or an instruction to extend an earlier table into a later period.
import {payrollRequire as require} from './own-payroll-exact.js';
import {salarySerialized} from './native-salary-catalog-model.js';

export const POLICY_LIQUIDATION_TYPES=Object.freeze(['monthly','first_fortnight','sac','vacation','supplementary','final','other']);
export const policyMonth=value=>typeof value==='string'&&/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(value);
export const policyCode=value=>typeof value==='string'&&/^[0-9]{1,9}$/.test(value);
export const policyId=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
const digest=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
function dataShape(value,keys){
 require(value&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===keys.length&&Reflect.ownKeys(value).every(k=>typeof k==='string'&&keys.includes(k))&&Object.values(Object.getOwnPropertyDescriptors(value)).every(d=>Object.hasOwn(d,'value')&&d.enumerable),'POLICY_SUCCESSION_INVALID','La sucesión necesita todos sus campos explícitos, sin accesores.');
}
export function requirePolicyDeclaration(policy){
 require(policy&&Object.getPrototypeOf(policy)===Object.prototype&&['policyId','supersedes'].every(k=>{const d=Object.getOwnPropertyDescriptor(policy,k);return d&&Object.hasOwn(d,'value')&&d.enumerable;}),'POLICY_SUCCESSION_INVALID','La identidad y el antecedente deben ser datos propios explícitos.');
 require(policyId(policy.policyId)&&Object.hasOwn(policy,'supersedes'),'POLICY_SUCCESSION_INVALID','La nueva política necesita identificador propio y antecedente explícito o null.');
 if(policy.supersedes!==null){
  dataShape(policy.supersedes,['policyId','policySha256']);
  require(typeof policy.supersedes.policyId==='string'&&policy.supersedes.policyId.length<=256&&/^[A-Za-z0-9][A-Za-z0-9._:\-]{0,255}$/.test(policy.supersedes.policyId)&&digest(policy.supersedes.policySha256),'POLICY_SUCCESSION_INVALID','El antecedente necesita ID y SHA256 completos.');
 }
 policyCanonicalText(policy);
 return policy;
}

// Canonical policy preimage: the existing salarySerialized order, UTF-8,
// ASCII object keys, scalar NFC strings, original array order and explicit null.
// This validation never normalizes values or invokes getters/toJSON. SQL uses
// the same canonical text; jsonb::text is not an equivalent preimage.
export function policyCanonicalText(value,{preserveLegacyUnicode=false}={}){
 require(typeof preserveLegacyUnicode==='boolean','POLICY_CANONICAL_INVALID','El modo de conservación Unicode debe ser explícito.');
 const parents=new Set();let nodes=0;
 function visit(v,depth=0){
  require(depth<=64&&++nodes<=1000000,'POLICY_CANONICAL_INVALID','La política supera su capacidad íntegra.');
  if(v===null||typeof v==='boolean')return;
  if(typeof v==='string'){
   let scalar=true;for(let i=0;i<v.length;i++){const c=v.charCodeAt(i);if(c===0){scalar=false;break;}if(c>=0xd800&&c<=0xdbff){const next=v.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff)){scalar=false;break;}}else if(c>=0xdc00&&c<=0xdfff){scalar=false;break;}}
   require(scalar&&(preserveLegacyUnicode||v===v.normalize('NFC')),'POLICY_CANONICAL_INVALID','Los textos nuevos deben conservar Unicode NFC válido; el legado se conserva sin normalización.');return;
  }
  if(typeof v==='number'){require(Number.isSafeInteger(v)&&!Object.is(v,-0),'POLICY_CANONICAL_INVALID','Los decimales se conservan como texto.');return;}
  require(v&&typeof v==='object'&&!parents.has(v),'POLICY_CANONICAL_INVALID','La política no admite valores ejecutables ni ciclos.');
  const array=Array.isArray(v),descriptors=Object.getOwnPropertyDescriptors(v),keys=Reflect.ownKeys(v);
  require(Object.getPrototypeOf(v)===(array?Array.prototype:Object.prototype)&&keys.every(k=>typeof k==='string'&&(array&&k==='length'||/^[\x20-\x7e]+$/.test(k)&&descriptors[k].enumerable)&&Object.hasOwn(descriptors[k],'value')),'POLICY_CANONICAL_INVALID','Las claves son ASCII y las propiedades deben ser datos explícitos.');
  if(array)require(keys.length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.hasOwn(descriptors,String(i))).every(Boolean),'POLICY_CANONICAL_INVALID','Los arrays deben estar completos.');
  parents.add(v);for(const key of keys)if(!(array&&key==='length'))visit(descriptors[key].value,depth+1);parents.delete(v);
 }
 visit(value);return salarySerialized(value);
}
const sha256RoundConstants=Object.freeze([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
const rotate=(value,n)=>(value>>>n)|(value<<(32-n));
export function policySha256(value,options){
 const bytes=new TextEncoder().encode(policyCanonicalText(value,options)),length=Math.ceil((bytes.length+9)/64)*64,padded=new Uint8Array(length),view=new DataView(padded.buffer);
 padded.set(bytes);padded[bytes.length]=0x80;const bits=BigInt(bytes.length)*8n;view.setUint32(length-8,Number(bits>>32n));view.setUint32(length-4,Number(bits&0xffffffffn));
 const state=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]),words=new Uint32Array(64);
 for(let offset=0;offset<length;offset+=64){
  for(let i=0;i<16;i++)words[i]=view.getUint32(offset+i*4);
  for(let i=16;i<64;i++){const x=words[i-15],y=words[i-2];words[i]=(words[i-16]+(rotate(x,7)^rotate(x,18)^(x>>>3))+words[i-7]+(rotate(y,17)^rotate(y,19)^(y>>>10)))>>>0;}
  let[a,b,c,d,e,f,g,h]=state;
  for(let i=0;i<64;i++){const first=(h+(rotate(e,6)^rotate(e,11)^rotate(e,25))+((e&f)^(~e&g))+sha256RoundConstants[i]+words[i])>>>0,second=((rotate(a,2)^rotate(a,13)^rotate(a,22))+((a&b)^(a&c)^(b&c)))>>>0;h=g;g=f;f=e;e=(d+first)>>>0;d=c;c=b;b=a;a=(first+second)>>>0;}
  [a,b,c,d,e,f,g,h].forEach((word,i)=>state[i]=(state[i]+word)>>>0);
 }
 return [...state].map(word=>word.toString(16).padStart(8,'0')).join('');
}
export function policyValidity(policy){
 require(policy&&Object.getPrototypeOf(policy)===Object.prototype,'POLICY_VALIDITY_INVALID','La política necesita vigencia explícita.');
 const descriptors=Object.getOwnPropertyDescriptors(policy),legacy=Object.hasOwn(descriptors,'period'),keys=legacy?['period']:['validFrom','validUntil'];
 require(keys.every(k=>descriptors[k]&&Object.hasOwn(descriptors[k],'value')&&descriptors[k].enumerable)&&!(legacy&&(Object.hasOwn(descriptors,'validFrom')||Object.hasOwn(descriptors,'validUntil'))),'POLICY_VALIDITY_INVALID','La vigencia debe ser inequívoca, sin campos omitidos ni accesores.');
 const from=legacy?descriptors.period.value:descriptors.validFrom.value;
 const until=legacy?descriptors.period.value:descriptors.validUntil.value;
 require(policyMonth(from)&&(until===null&&!legacy||policyMonth(until)&&from<=until),'POLICY_VALIDITY_INVALID','La política necesita inicio mensual y fin ordenado, o null explícito cuando la fuente no declara vencimiento.');
 return{validFrom:from,validUntil:until};
}
export function requirePolicyScope(policy){
 require(policyCode(policy.agreementCode)&&POLICY_LIQUIDATION_TYPES.includes(policy.liquidationType),'POLICY_SCOPE_INVALID','Convenio y tipo de liquidación deben declararse explícitamente.');
 return policyValidity(policy);
}
export function policyAppliesTo(policy,{period,liquidationType,agreementCode}){
 const range=policyValidity(policy);
 return policyMonth(period)&&range.validFrom<=period&&(range.validUntil===null||period<=range.validUntil)
  &&policy.liquidationType===liquidationType&&(agreementCode===undefined||policy.agreementCode===agreementCode);
}
export function requireDisjointPolicyValidity(policies,identity,errorCode){
 const groups=new Map();
 for(const policy of policies){
  const key=identity(policy),range=policyValidity(policy),group=groups.get(key)??[];
  group.push(range);groups.set(key,group);
 }
 for(const group of groups.values()){
  group.sort((a,b)=>a.validFrom.localeCompare(b.validFrom));
  for(let i=1;i<group.length;i++)require(group[i-1].validUntil!==null&&group[i-1].validUntil<group[i].validFrom,errorCode,'Dos políticas del mismo alcance se superponen; no se elige una por orden ni por última versión.');
 }
 return policies;
}
export function policyRuleIntersects(rule,policy){
 const range=policyValidity(policy);
 return rule.agreementCode===policy.agreementCode&&rule.liquidationTypes.includes(policy.liquidationType)
  &&(range.validUntil===null||rule.validFrom<=range.validUntil)&&(rule.validUntil===null||rule.validUntil>=range.validFrom);
}

const previousMonth=month=>{const year=Number(month.slice(0,4)),number=Number(month.slice(5));return number===1?String(year-1).padStart(4,'0')+'-12':String(year).padStart(4,'0')+'-'+String(number-1).padStart(2,'0');};
/** Resolve only explicitly linked succession. The supplied policies are never
 * edited; a captured older revision retains its original open-ended result. */
export function resolvePolicySuccession(policies,{identity,scope,hash=policySha256}){
 const entries=new Map();
 for(const policy of policies){const id=identity(policy),validity=policyValidity(policy);require(typeof id==='string'&&!entries.has(id),'POLICY_ID_DUPLICATE','Cada política conserva una identidad única.');entries.set(id,{policy,policyId:id,...validity,successor:null});}
 for(const entry of entries.values()){
  const predecessor=entry.policy.supersedes;
  if(predecessor===null||predecessor===undefined)continue;
  const prior=entries.get(predecessor.policyId);require(prior,'POLICY_PREDECESSOR_MISSING','El programa/captura debe conservar íntegro el antecedente referido.');
  require(prior.successor===null,'POLICY_SUCCESSION_BRANCH','Un antecedente no puede tener dos sucesores ambiguos.');prior.successor=entry.policyId;
 }
 const visiting=new Set(),visited=new Set();
 const visit=id=>{if(visited.has(id))return;require(!visiting.has(id),'POLICY_SUCCESSION_CYCLE','La sucesión no admite ciclos.');visiting.add(id);const next=entries.get(id).successor;if(next!==null)visit(next);visiting.delete(id);visited.add(id);};
 for(const id of entries.keys())visit(id);
 for(const entry of entries.values()){
  const predecessor=entry.policy.supersedes;
  if(predecessor===null||predecessor===undefined)continue;
  const prior=entries.get(predecessor.policyId);
  require(hash(prior.policy)===predecessor.policySha256,'POLICY_PREDECESSOR_CHANGED','El antecedente no conserva su SHA256 canónico completo.');
  require(scope(prior.policy)===scope(entry.policy),'POLICY_SUCCESSION_SCOPE_CHANGED','Una sucesión no puede cruzar convenio, tipo ni identidad económica.');
  require(entry.validFrom>prior.validFrom,'POLICY_SUCCESSION_DATE_INVALID','La sucesora debe entrar después del inicio explícito del antecedente.');
  const end=previousMonth(entry.validFrom);if(prior.validUntil===null||end<prior.validUntil)prior.validUntil=end;
 }
 const resolved=[...entries.values()];
 requireDisjointPolicyValidity(resolved.map(entry=>({scope:scope(entry.policy),validFrom:entry.validFrom,validUntil:entry.validUntil})),entry=>entry.scope,'POLICY_VALIDITY_OVERLAP');
 return resolved;
}
export function resolvedPolicyAppliesTo(entry,context){return policyAppliesTo({...entry.policy,...(Object.hasOwn(entry.policy,'period')?{}:{validFrom:entry.validFrom,validUntil:entry.validUntil})},context);}

/** Civil-month boundaries for proofs over piecewise-constant declarations.
 * No loop over months/years and no synthetic expiry is introduced. */
export function policyNextMonth(month){
 require(policyMonth(month),'POLICY_VALIDITY_INVALID','El límite mensual debe ser válido.');
 if(month==='2099-12')return null; // Outside the existing engine's civil domain.
 const year=Number(month.slice(0,4)),number=Number(month.slice(5));
 return number===12?String(year+1).padStart(4,'0')+'-01':String(year).padStart(4,'0')+'-'+String(number+1).padStart(2,'0');
}
export function policyRangeIntersection(left,right){
 const a=policyValidity(left),b=policyValidity(right),validFrom=a.validFrom>b.validFrom?a.validFrom:b.validFrom;
 const validUntil=a.validUntil===null?b.validUntil:b.validUntil===null?a.validUntil:a.validUntil<b.validUntil?a.validUntil:b.validUntil;
 return validUntil!==null&&validFrom>validUntil?null:{validFrom,validUntil};
}
export function policyBoundaryMonths(rawRange,declarations){
 const range=policyValidity(rawRange),months=new Set([range.validFrom]),inside=month=>month!==null&&month>=range.validFrom&&(range.validUntil===null||month<=range.validUntil);
 for(const declaration of declarations){
  const own=policyValidity(declaration);if(inside(own.validFrom))months.add(own.validFrom);
  if(own.validUntil!==null){const after=policyNextMonth(own.validUntil);if(inside(after))months.add(after);}
 }
 return[...months].sort();
}
