import { createHash } from 'node:crypto';
export const BANK_REPORT_VERSION = 'payroll-bank-report.v1';
export const BANK_SOURCE_VERSION = 'payroll-bank-source.v1';
export const BANK_CAPABILITIES = Object.freeze(['payroll.read', 'workforce.employee.read']);
export const bankUuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
export const bankHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const string = (value, max=250) => typeof value === 'string' && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
const nullable = (value,max) => value === null || string(value,max);
const rawBankText = value => value === null || typeof value === 'string' && value.length <= 128;
const code = value => typeof value === 'string' && /^[0-9]{1,12}$/.test(value);
const period = value => typeof value === 'string' && /^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(value);
const date = value => typeof value === 'string' && /^(19|20)[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(value) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype,null].includes(Object.getPrototypeOf(value));
const errors = {
 QUERY_INVALID:[400,'Elegí una liquidación válida.'], METHOD_NOT_ALLOWED:[405,'Este reporte sólo permite consulta.'],
 SESSION_INVALID:[401,'La sesión ya no es válida. Volvé a ingresar.'], CAPABILITY_REQUIRED:[403,'No tenés permiso para consultar los datos bancarios de nómina.'],
 SOURCE_REQUIRED:[503,'Los datos bancarios de este respaldo todavía no están incorporados.'], NOT_FOUND:[404,'La liquidación ya no está disponible. Volvé a consultar.'],
 SOURCE_DRIFT:[503,'No se pudo conciliar la fuente bancaria con la liquidación.'], UNAVAILABLE:[503,'No se pudo consultar la planilla bancaria. Reintentá.'],
 SESSION_BUSY:[409,'El acceso se está actualizando. Reintentá en un momento.'], RELEASE_NOT_CERTIFIED:[503,'La fuente municipal no está disponible para esta consulta.'],
};
export class BankSourceError extends Error {
 constructor(key) { const k=Object.hasOwn(errors,key)?key:'UNAVAILABLE'; super(errors[k][1]); this.code='PAYROLL_BANK_'+k;this.status=errors[k][0]; }
}
export function bankFail(key) { throw new BankSourceError(key); }
export function bankSafeError(error) {
 if(error instanceof BankSourceError)return error;
 const value=[error?.code,error?.message].find(v=>typeof v==='string'&&/^PAYROLL_BANK_/.test(v));
 const aliases={ACTION_SESSION_INVALID:'SESSION_INVALID',ACTION_SESSION_BUSY:'SESSION_BUSY',ACTION_RELEASE_NOT_CERTIFIED:'RELEASE_NOT_CERTIFIED',ACTION_SOURCE_BINDING_REQUIRED:'RELEASE_NOT_CERTIFIED',ACTION_TENANT_AUTHORITY_REQUIRED:'CAPABILITY_REQUIRED'};
 return new BankSourceError(value?.slice(13)||aliases[error?.message]||aliases[error?.code]||'UNAVAILABLE');
}
export function bankExact(value, keys) { if(!plain(value)||Object.keys(value).length!==keys.length||Object.keys(value).some(k=>!keys.includes(k)))bankFail('SOURCE_DRIFT'); }
export function validateBankSourcePayload(value) {
 bankExact(value,['version','sourceSha256','sourceDatabase','cutoff','company','banks','employees','assignments']);
 if(value.version!==BANK_SOURCE_VERSION||!bankHash(value.sourceSha256)||value.sourceDatabase!=='grh_junin'||!code(value.company)
  ||!string(value.cutoff,19)||!date(value.cutoff.slice(0,10))||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value.cutoff)
  ||!Array.isArray(value.banks)||value.banks.length<1||value.banks.length>50||!Array.isArray(value.employees)||value.employees.length<1||value.employees.length>5000
  ||!Array.isArray(value.assignments)||value.assignments.length>5000)bankFail('SOURCE_DRIFT');
 const seen=new Set();
 for(const row of value.banks){bankExact(row,['code','label','routingCode']);if(!code(row.code)||!nullable(row.label,250)||!nullable(row.routingCode,12)||seen.has(row.code))bankFail('SOURCE_DRIFT');seen.add(row.code)}
 seen.clear();
 for(const row of value.employees){bankExact(row,['legajo','name','cuil','bankCode','accountTypeCode','accountNumber','cbuLegacy','cbuCurrent']);if(!code(row.legajo)||seen.has(row.legajo)||!nullable(row.name,250)||!nullable(row.cuil,32)||!nullable(row.bankCode,12)||!nullable(row.accountTypeCode,8)||!rawBankText(row.accountNumber)||!rawBankText(row.cbuLegacy)||!rawBankText(row.cbuCurrent))bankFail('SOURCE_DRIFT');seen.add(row.legajo)}
 seen.clear();
 for(const row of value.assignments){bankExact(row,['legajo','period','date','type','repartitionCode','repartitionLabel']);const key=[row.legajo,row.period,row.date,row.type].join('|');if(!code(row.legajo)||!period(row.period)||!date(row.date)||!/^\w$/.test(row.type)||!nullable(row.repartitionCode,12)||!nullable(row.repartitionLabel,250)||seen.has(key))bankFail('SOURCE_DRIFT');seen.add(key)}
 return value;
}
const roster42=new Set(['01','02','03','04','06','07','13','14','15','16','40']);
const roster55=new Set(['17','18','19','20','21','22','23','24','25','26','27','33','35','36','37','38','39']);
export function validBankCbu(value) {
 if(typeof value!=='string'||!/^\d{22}$/.test(value)||/^0+$/.test(value))return false;
 const checksum=(digits,weights)=>String((10-digits.split('').reduce((sum,n,i)=>sum+Number(n)*weights[i],0)%10)%10);
 return checksum(value.slice(0,7),[7,1,3,9,7,1,3])===value[7]&&checksum(value.slice(8,21),[3,9,7,1,3,9,7,1,3,9,7,1,3])===value[21];
}
const present = value => typeof value==='string'&&value.trim()!==''?value.trim():null;
function keyForBank(label) { const s=(label||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();return /CREDICOOP|BCO CRED-/.test(s)?'credicoop':/SANTANDER|BCO SANT\./.test(s)?'santander':/NACION/.test(s)?'nacion':null; }
export function buildBankReport(raw) {
 bankExact(raw,['version','mode','dataset','bankSource','rows']);
 if(raw.version!=='payroll-bank-source-read.v1'||raw.mode!=='report')bankFail('SOURCE_DRIFT');
 bankExact(raw.dataset,['datasetId','period','date','type','statementCount','sourceLabel','sourceSha256','payloadHash']);
 bankExact(raw.bankSource,['sourceSha256','payloadSha256','cutoff']);
 const d=raw.dataset,b=raw.bankSource;
 if(!bankUuid(d.datasetId)||!period(d.period)||!date(d.date)||!/^[A-Z]$/.test(d.type)||!string(d.sourceLabel,250)||!bankHash(d.sourceSha256)||!bankHash(d.payloadHash)
  ||d.sourceSha256!==b.sourceSha256||!bankHash(b.payloadSha256)||!string(b.cutoff,19)||!date(b.cutoff.slice(0,10))||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(b.cutoff)
  ||!Number.isInteger(d.statementCount)||d.statementCount<1||d.statementCount>5000||!Array.isArray(raw.rows)||raw.rows.length!==d.statementCount)bankFail('SOURCE_DRIFT');
 const seen=new Set();
 const rows=raw.rows.map(row=>{
  bankExact(row,['legajo','name','cuil','bankCode','bankLabel','accountTypeCode','accountNumber','cbuLegacy','cbuCurrent','repartitionCode','repartitionLabel','netAmount']);
  if(!code(row.legajo)||seen.has(row.legajo)||Object.entries(row).some(([k,v])=>!['legajo','netAmount','accountNumber','cbuLegacy','cbuCurrent'].includes(k)&&!nullable(v,250))
   ||!rawBankText(row.accountNumber)||!rawBankText(row.cbuLegacy)||!rawBankText(row.cbuCurrent)
   ||!(row.netAmount===null||typeof row.netAmount==='string'&&row.netAmount!=='-0.00'&&/^-?(0|[1-9]\d{0,21})\.\d{2}$/.test(row.netAmount)))bankFail('SOURCE_DRIFT');
  seen.add(row.legajo);const issues=[],bankKey=keyForBank(row.bankLabel),a=present(row.cbuCurrent),legacy=present(row.cbuLegacy);
  let cbu=a||legacy;
  if(a&&legacy&&a!==legacy){cbu=null;issues.push('CBU_CONFLICT')}else if(!cbu){issues.push('CBU_MISSING')}else if(!validBankCbu(cbu)){cbu=null;issues.push('CBU_INVALID')}
  if(!bankKey)issues.push('BANK_UNMAPPED');
  // TCTA codes are preserved. Their CA/CC meaning has not been homologated.
  issues.push('ACCOUNT_TYPE_UNVERIFIED');
  let accountNumber=present(row.accountNumber);
  if(!accountNumber)issues.push('ACCOUNT_NUMBER_MISSING');else if(!string(row.accountNumber,128)){accountNumber=null;issues.push('ACCOUNT_NUMBER_INVALID')}
  if(!present(row.name)||!present(row.cuil))issues.push('IDENTITY_MISSING');
  const repartitionCode=present(row.repartitionCode)?.padStart(2,'0')??null;
  const jurisdiction=roster42.has(repartitionCode)?'42':roster55.has(repartitionCode)?'55':null;
  if(!jurisdiction)issues.push('JURISDICTION_UNAVAILABLE');if(row.netAmount===null)issues.push('NET_AMOUNT_MISSING');
  return {legajo:row.legajo,name:row.name,cuil:row.cuil,bankCode:row.bankCode,bankLabel:row.bankLabel,bankKey,accountTypeCode:row.accountTypeCode,
   accountType:null,accountNumber,cbu,jurisdiction,repartitionCode,repartitionLabel:row.repartitionLabel,netAmount:row.netAmount,issues};
 }).sort((a,b)=>a.legajo.length-b.legajo.length||a.legajo.localeCompare(b.legajo));
 const data={version:BANK_REPORT_VERSION,mode:'report',dataset:d,bankSource:b,rows,scope:{official:false,payrollPosted:false,bankTransferGenerated:false}};
 return {...data,reportHash:createHash('sha256').update(JSON.stringify(data)).digest('hex')};
}
