import {readGrhTxt} from './payroll-grh-input.js';
import {isPayrollRecordIdentity} from './payroll-record-identity.js';
import {MONTHLY_BATCH_WRITER_LIMITS,verifyMonthlyBatch} from './payroll-native-monthly-model.js';
export const GRH_IMPORT_CAPABILITIES=Object.freeze(['payroll.novelty.read','payroll.novelty.prepare','payroll.novelty.nominal.read','workforce.employee.read']);
const fail=()=>{throw Error('La respuesta no corresponde al archivo y la selección revisados. No se habilitó otro envío.');};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const verifiedPreviews=new WeakSet();
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const sha=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
export function grhAuthority(bootstrap){const p=bootstrap?.principal;if(!p||![p.tenantId,p.membershipId,p.certifiedBindingId].every(uuid)||!GRH_IMPORT_CAPABILITIES.slice(0,3).every(c=>p.capabilities?.includes(c)))throw Error('La sesión necesita preparación, lectura nominal y una membresía municipal vigente.');return [p.tenantId,p.membershipId,p.certifiedBindingId].join(':');}
export async function grhFileRequest(bytes,{concept,periodMonth,choices=[]}={}){
 if(!(bytes instanceof Uint8Array)||!/^20(?:0[8-9]|[1-9]\d)-(?:0[1-9]|1[0-2])-01$/.test(periodMonth||'')||typeof concept!=='string'||!/^[1-9]\d{0,19}$/.test(concept))throw Error('Elegí concepto y período mensual antes de revisar.');
 bytes=Uint8Array.from(bytes);const parsed=readGrhTxt(bytes,{profileId:'junin55',concept,impliedScale:null,groupByDni:false});
 let binary='';for(let i=0;i<bytes.length;i+=4096)binary+=String.fromCharCode(...bytes.subarray(i,i+4096));
 const request={profileId:'junin55',concept,periodMonth,payrollType:'monthly',contentBase64:btoa(binary),choices:structuredClone(choices),previewToken:null};
 return freeze({request,parsed,sourceSha256:await sha(bytes)});
}
export function grhPreview(payload,expected){
 if(payload?.ok!==true||payload.replayed!==false)fail();const d=payload.data,r=expected.request;
 if(!exact(d,['version','profileId','concept','periodMonth','payrollType','sourceSha256','previewToken','inputRows','outputRows','resolvedRows','readyToPrepare','writerLimit','rows','totalAmountCents','persistencePerformed','payrollCalculated','payrollPosted'])||d.version!=='grh-import-preview.v1'||d.sourceSha256!==expected.sourceSha256||!hash(d.previewToken)||d.profileId!==r.profileId||d.concept!==r.concept||d.periodMonth!==r.periodMonth||d.payrollType!==r.payrollType||d.inputRows!==expected.parsed.inputRows||d.outputRows!==expected.parsed.rows.length||!MONTHLY_BATCH_WRITER_LIMITS.includes(d.writerLimit)||!Array.isArray(d.rows)||d.rows.length!==d.outputRows||d.persistencePerformed!==false||d.payrollCalculated!==false||d.payrollPosted!==false)fail();
 const choices=new Map(r.choices.map(c=>[c.rowOrdinal,c.contractId]));let resolved=0,total=0n;const selectedLegajos=new Map();
 for(let i=0;i<d.rows.length;i++){
  const row=d.rows[i],original=expected.parsed.rows[i];if(!exact(row,['rowOrdinal','sourceLines','dni','conceptSourceId','quantityDecimal','amountCents','status','contractId','candidates'])||row.rowOrdinal!==i+1||JSON.stringify(row.sourceLines)!==JSON.stringify(original.sourceLines)||row.dni!==original.dni||row.conceptSourceId!==r.concept||row.quantityDecimal!==original.quantityDecimal||row.amountCents!==original.amountCents||!Array.isArray(row.candidates)||row.candidates.length>2000||!['resolved','choose_contract','not_found','duplicate_target','identity_review'].includes(row.status))fail();
  const ids=new Set();for(const c of row.candidates){if(!exact(c,['contractId','legajo','name','startDate','endDate'])||!isPayrollRecordIdentity(c.contractId)||ids.has(c.contractId)||typeof c.legajo!=='string'||!/^(0|[1-9]\d{0,19})$/.test(c.legajo)||typeof c.name!=='string'||!c.name.trim()||c.name.length>300||/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(c.name)||!validDate(c.startDate)||c.endDate!==null&&(!validDate(c.endDate)||c.endDate<c.startDate)||c.startDate.slice(0,7)>r.periodMonth.slice(0,7)||c.endDate!==null&&c.endDate<r.periodMonth)fail();ids.add(c.contractId);}
  const selected=row.status==='identity_review'?null:choices.get(i+1)||(row.candidates.length===1?row.candidates[0].contractId:null);if(row.contractId!==selected)fail();
  if(['resolved','duplicate_target'].includes(row.status)){const c=row.candidates.find(c=>c.contractId===row.contractId);if(!c)fail();selectedLegajos.set(c.legajo,(selectedLegajos.get(c.legajo)||0)+1);if(row.status==='resolved')resolved++;}
  else if(row.contractId!==null||row.status==='not_found'&&row.candidates.length!==0||['choose_contract','identity_review'].includes(row.status)&&row.candidates.length<2)fail();total+=BigInt(row.amountCents);
 }
 for(const row of d.rows)if(row.contractId){const c=row.candidates.find(c=>c.contractId===row.contractId),duplicate=selectedLegajos.get(c.legajo)>1;if(duplicate!==(row.status==='duplicate_target'))fail();}
 if(d.resolvedRows!==resolved||d.totalAmountCents!==total.toString()||d.readyToPrepare!==(resolved===d.outputRows&&d.outputRows<=d.writerLimit))fail();
 const checked=freeze(structuredClone(d));verifiedPreviews.add(checked);return checked;
}
// Only verified, immutable previews are accepted. No file/server text enters the CSV.
const incidentLabels=freeze({
 choose_contract:['Elegir contrato','Elegí el contrato correspondiente y volvé a revisar el archivo completo.'],
 identity_review:['Identidad duplicada','Solicitá la corrección de la identidad duplicada en el padrón y volvé a revisar.'],
 not_found:['Vínculo no encontrado','Revisá el vínculo laboral para el período elegido y volvé a revisar el archivo completo.'],
 duplicate_target:['Destino repetido','Revisá las filas que apuntan al mismo destino; corregí el archivo o los vínculos y volvé a revisar.']
});
export function grhIncidentReport(preview){
 if(!verifiedPreviews.has(preview))throw Error('Revisá el archivo completo antes de descargar las incidencias.');
 const rows=[],globalIssues=preview.outputRows>preview.writerLimit?1:0;
 for(const row of preview.rows){
  if(row.status==='resolved')continue;
  const labels=incidentLabels[row.status];
  for(const sourceLine of row.sourceLines){
   if(!Number.isSafeInteger(sourceLine)||sourceLine<1||sourceLine>preview.inputRows)fail();
   rows.push([String(sourceLine),...labels]);
  }
 }
 const affectedRows=rows.length;
 if(globalIssues)rows.push(['','Límite de cantidad','El archivo completo supera el límite de guardado. No se dividió ni se omitieron filas; solicitá revisión del límite.']);
 if(!rows.length)rows.push(['','Sin observaciones','La revisión completa no presenta incidencias. No acredita importación, aprobación ni liquidación.']);
 const cell=value=>'"'+value.replace(/"/g,'""')+'"';
 const csv='\uFEFF'+[['Fila de origen','Estado','Acción sugerida'],...rows].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
 return freeze({csv,affectedRows,globalIssues});
}
export function grhWriteAttempt(expected,preview,key,scopeKey){
 if(!uuid(key)||!scopeKey||!preview.readyToPrepare||expected.sourceSha256!==preview.sourceSha256)fail();
 const payload={...structuredClone(expected.request),previewToken:preview.previewToken};
 return freeze({url:'/api/internal-payroll-novelties',key,scopeKey,body:JSON.stringify({command:'grhPrepare',payload}),headers:{'Content-Type':'application/json',Accept:'application/json','Idempotency-Key':key}});
}
export async function grhReceipt(payload,expected,preview){
 if(payload?.ok!==true||typeof payload.replayed!=='boolean')fail();const d=payload.data;
 if(!exact(d,['version','sourceSha256','semanticSha256','profileId','concept','periodMonth','payrollType','inputRows','savedRows','omittedRows','batch','payrollCalculated','payrollPosted'])||d.version!=='grh-import-receipt.v1'||d.sourceSha256!==expected.sourceSha256||d.profileId!==preview.profileId||d.concept!==preview.concept||d.periodMonth!==preview.periodMonth||d.payrollType!==preview.payrollType||d.inputRows!==preview.inputRows||d.savedRows!==preview.outputRows||d.omittedRows!==0||d.payrollCalculated!==false||d.payrollPosted!==false)fail();
 const semantic=await sha(new TextEncoder().encode(canonical(expected.parsed.rows.map(r=>({dni:r.dni,amountCents:r.amountCents,quantityDecimal:r.quantityDecimal})).sort((a,b)=>a.dni.localeCompare(b.dni)))));
 if(d.semanticSha256!==semantic)fail();const b=verifyMonthlyBatch(d.batch,{mode:'receipt'});
 if(b.contractVersion!=='payroll-novelty-batch.v1'||b.sourceMode!=='bulk'||b.status!=='draft'||b.version!==1||b.periodMonth!==preview.periodMonth||b.payrollType!==preview.payrollType||b.rowCount!==preview.outputRows||b.rows.length!==preview.outputRows)fail();
 for(let i=0;i<b.rows.length;i++){const actual=b.rows[i],p=preview.rows[i],c=p.candidates.find(c=>c.contractId===p.contractId);if(!c||actual.rowOrdinal!==i+1||actual.employmentContractId!==c.contractId||actual.legajo!==c.legajo||actual.conceptSourceId!==p.conceptSourceId||actual.quantityDecimal!==p.quantityDecimal||actual.amountCents!==p.amountCents||actual.forced!==false||actual.costCenterSourceId!==null||actual.adjustmentMonth!==null||actual.movementType!==null||actual.legalInstrument!==null||actual.observation!=='Importación Formato Junín; contenido lógico SHA256 '+semantic+'.')fail();}
 return freeze(structuredClone(d));
}
export function grhAmount(cents){if(typeof cents!=='string'||!/^\d+$/.test(cents))return '—';const n=BigInt(cents);return '$ '+(n/100n).toLocaleString('es-AR')+','+(n%100n).toString().padStart(2,'0');}
