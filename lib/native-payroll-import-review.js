// Read-only domain review against a MuniControl-owned registry revision.
// No source-system predicates, source bindings, connections, database writes or salary rules.
// The caller must obtain the registry through its authorized tenant reader; this is not an authorization gateway.
import {isPayrollRecordIdentity as recordId} from '../assets/payroll-record-identity.js';
const MAX_ROWS=2000,MAX_CONTRACTS=10000,MAX_AMOUNT=9223372036854775807n;
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export class NativeImportReviewError extends Error{constructor(code){super(code);this.name='NativeImportReviewError';this.code=code;}}
const fail=code=>{throw new NativeImportReviewError(code);};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const clean=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/.test(v);
const date=v=>typeof v==='string'&&/^(?:19|20)\d{2}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const month=v=>date(v)&&v.endsWith('-01');
const number=v=>typeof v==='string'&&/^[1-9]\d{0,19}$/.test(v);
const dni=v=>typeof v==='string'&&/^[1-9]\d{4,7}$/.test(v);
const amount=v=>v===null||typeof v==='string'&&/^(?:0|-?[1-9]\d{0,18})$/.test(v)&&BigInt(v)<=MAX_AMOUNT&&BigInt(v)>=-MAX_AMOUNT;
const quantity=v=>v===null||typeof v==='string'&&/^-?(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/.test(v)&&!/^-0(?:\.0+)?$/.test(v);
function registryCopy(raw){
 if(!exact(raw,['tenantId','version','contracts','concepts'])||!recordId(raw.tenantId)||!Number.isSafeInteger(raw.version)||raw.version<1||!Array.isArray(raw.contracts)||raw.contracts.length>MAX_CONTRACTS||!Array.isArray(raw.concepts)||raw.concepts.length>2000)fail('NATIVE_IMPORT_REGISTRY_INVALID');
 const registry=structuredClone(raw),seen=new Set(),conceptIds=new Set(),people=new Map();
 for(const c of registry.contracts){
  if(!exact(c,['id','tenantId','personId','number','dni','name','startDate','endDate','status','revision'])||!recordId(c.id)||!recordId(c.personId)||c.tenantId!==registry.tenantId||seen.has(c.id)||!number(c.number)||!dni(c.dni)||!clean(c.name,300)||!date(c.startDate)||c.endDate!==null&&(!date(c.endDate)||c.endDate<c.startDate)||!['active','inactive'].includes(c.status)||!Number.isSafeInteger(c.revision)||c.revision<1)fail('NATIVE_IMPORT_REGISTRY_INVALID');
  const person=people.get(c.personId);if(person&&(person.dni!==c.dni||person.name!==c.name))fail('NATIVE_IMPORT_REGISTRY_INVALID');
  people.set(c.personId,{dni:c.dni,name:c.name});seen.add(c.id);
 }
 for(const c of registry.concepts){
  if(!exact(c,['code','name','startMonth','endMonth'])||!number(c.code)||!clean(c.name,160)||conceptIds.has(c.code)||!month(c.startMonth)||c.endMonth!==null&&(!month(c.endMonth)||c.endMonth<c.startMonth))fail('NATIVE_IMPORT_REGISTRY_INVALID');
  conceptIds.add(c.code);
 }
 return registry;
}
export function reviewNativePayrollImport({registry:raw,periodMonth,inputRows,rows:rawRows,choices=[]}={}){
 const registry=registryCopy(raw);
 if(!month(periodMonth)||periodMonth<'2008-01-01'||periodMonth>'2099-12-01'||!Number.isInteger(inputRows)||inputRows<1||inputRows>MAX_ROWS||!Array.isArray(rawRows)||rawRows.length<1||rawRows.length>inputRows||!Array.isArray(choices)||choices.length>rawRows.length)fail('NATIVE_IMPORT_INPUT_INVALID');
 const input=structuredClone(rawRows),selection=structuredClone(choices),sourceLines=new Set(),byChoice=new Map(),issues=[];
 for(let i=0;i<input.length;i++){
  const r=input[i];
  if(!exact(r,['rowOrdinal','dni','conceptCode','quantityDecimal','amountCents','sourceLines'])||r.rowOrdinal!==i+1||!dni(r.dni)||!number(r.conceptCode)||!amount(r.amountCents)||!quantity(r.quantityDecimal)||r.amountCents===null&&r.quantityDecimal===null||!Array.isArray(r.sourceLines)||r.sourceLines.length<1){issues.push(i+1);continue;}
  let last=0;for(const n of r.sourceLines){if(!Number.isInteger(n)||n<1||n>inputRows||n<=last||sourceLines.has(n))issues.push(i+1);last=n;sourceLines.add(n);}
 }
 if(issues.length){const e=new NativeImportReviewError('NATIVE_IMPORT_ROWS_INVALID');e.issues=Object.freeze([...new Set(issues)].map(rowOrdinal=>Object.freeze({rowOrdinal,code:'INVALID_ROW'})));throw e;}
 if(sourceLines.size!==inputRows)fail('NATIVE_IMPORT_ROWS_INCOMPLETE');
 for(const c of selection){if(!exact(c,['rowOrdinal','contractId'])||!Number.isInteger(c.rowOrdinal)||c.rowOrdinal<1||c.rowOrdinal>input.length||!recordId(c.contractId)||byChoice.has(c.rowOrdinal))fail('NATIVE_IMPORT_CHOICE_INVALID');byChoice.set(c.rowOrdinal,c.contractId);}
 const byDni=new Map(),concepts=new Map(registry.concepts.map(c=>[c.code,c]));
 for(const c of registry.contracts){if(c.status==='active'&&c.startDate.slice(0,7)<=periodMonth.slice(0,7)&&(c.endDate===null||c.endDate>=periodMonth)){const a=byDni.get(c.dni)||[];a.push(c);byDni.set(c.dni,a);}}
 const result=input.map(r=>{
  const candidates=[...(byDni.get(r.dni)||[])].sort((a,b)=>a.id.localeCompare(b.id,'en'));
  const personCount=new Set(candidates.map(c=>c.personId)).size,choice=byChoice.get(r.rowOrdinal),concept=concepts.get(r.conceptCode);
  if(choice&&(personCount!==1||!candidates.some(c=>c.id===choice)))fail('NATIVE_IMPORT_CHOICE_CHANGED');
  const selected=personCount>1?null:choice?candidates.find(c=>c.id===choice):candidates.length===1?candidates[0]:null;
  const conceptValid=Boolean(concept&&concept.startMonth<=periodMonth&&(concept.endMonth===null||concept.endMonth>=periodMonth));
  const status=!conceptValid?'concept_unavailable':personCount>1?'identity_review':selected?'resolved':candidates.length?'choose_contract':'not_found';
  return {...r,status,subject:selected,concept:conceptValid?concept:null,candidates};
 });
 const targets=new Map();for(const r of result)if(r.subject){const key=r.subject.id+':'+r.conceptCode;targets.set(key,(targets.get(key)||0)+1);}
 for(const r of result)if(r.subject&&targets.get(r.subject.id+':'+r.conceptCode)>1)r.status='duplicate_target';
 const resolvedRows=result.filter(r=>r.status==='resolved').length,missingAmountRows=result.filter(r=>r.amountCents===null).length;
 const view={version:'native-payroll-import-review.v1',tenantId:registry.tenantId,registryVersion:registry.version,periodMonth,inputRows,outputRows:result.length,resolvedRows,ready:resolvedRows===result.length,reviewLimit:MAX_ROWS,
  totalKnownAmountCents:result.reduce((n,r)=>n+BigInt(r.amountCents??'0'),0n).toString(),missingAmountRows,rows:result,persistencePerformed:false,payrollCalculated:false};
 return freeze(view);
}
