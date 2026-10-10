import {salaryExact,salaryHash,salaryUuid,salaryKey,salarySerialized} from './native-salary-catalog-model.js';
import {ownReportQuery,ownReportFilters,emptyOwnReportFilters} from './own-payroll-report-model.js';
import {OWN_CLOSE_NOMINAL,OWN_CLOSE_TOTAL_KEYS} from './own-payroll-close-model.js';
import {OWN_RUN_TYPES,OWN_RUN_NATURES,formatOwnRunDecimal} from './own-payroll-run-workspace-model.js';
import {decimal,rational,exactAdd,exactSubtract,quantize} from './own-payroll-exact.js';
import {ownPayrollEmployeeNumber,OWN_PAYROLL_NAMESPACE_VERSION} from './own-payroll-engine.js';

export const OWN_RECEIPT_READ=Object.freeze([...OWN_CLOSE_NOMINAL]);
export const OWN_RECEIPT_PREPARE=Object.freeze([...OWN_RECEIPT_READ,'payroll.receipt.prepare']);
export const OWN_RECEIPT_APPROVE=Object.freeze([...OWN_RECEIPT_READ,'payroll.receipt.approve']);
export const OWN_RECEIPT_SELF=Object.freeze(['actions.read','payroll.receipt.self.read']);
export const OWN_RECEIPT_MAX_RECORDS=20000;
export const OWN_RECEIPT_MAX_CONCEPTS=250000;
export const OWN_RECEIPT_MAX_BYTES=32*1024*1024;
const need=(value,message)=>{if(!value)throw Error(message);};
const text=(value,min,max)=>typeof value==='string'&&value===value.trim()&&value===value.normalize('NFC')&&value.length>=min&&value.length<=max&&!/[<>\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(value);
const code=value=>typeof value==='string'&&/^\d{1,9}$/.test(value);
export function ownReceiptContracts(value){
 need(Array.isArray(value)&&value.length<=200&&Object.keys(value).length===value.length&&value.every(salaryUuid)&&new Set(value).size===value.length,'Elegí hasta 200 contratos distintos de la previa completa; no se recorta la selección.');
 return [...value].sort();
}
export const ownReceiptDay=value=>typeof value==='string'&&/^(19|20)\d{2}-(0[1-9]|1[0-2])-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
const at=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};

export function ownReceiptParams(value){
 const selected=salaryExact(value,['period','types','filters','issuer','paymentDate','legend','contracts']);
 need(selected||salaryExact(value,['period','types','filters','issuer','paymentDate','legend']),'Revisá período, tipos, rangos y datos de emisión.');
 const query=ownReportQuery({from:value.period,to:value.period,types:value.types}),filters=ownReportFilters(value.filters),issuer=value.issuer;
 need(salaryExact(issuer,['name','taxId','address'])&&text(issuer.name,3,160)&&typeof issuer.taxId==='string'&&/^\d{11}$/.test(issuer.taxId)&&text(issuer.address,3,240),'Informá nombre, CUIT de once dígitos y domicilio del emisor. Se conservarán como datos declarados para revisión.');
 need(value.paymentDate===null||ownReceiptDay(value.paymentDate),'Elegí una fecha válida o dejala sin informar. La fecha declarada no acredita pago.');
 need(text(value.legend,0,240),'La leyenda admite hasta 240 caracteres sin controles ni marcado.');
 return {period:query.from,types:query.types,filters,issuer:{...issuer},paymentDate:value.paymentDate,legend:value.legend,...(selected?{contracts:ownReceiptContracts(value.contracts)}:{})};
}
export function emptyOwnReceiptParams(period){return {period,types:['monthly'],filters:emptyOwnReportFilters(),issuer:{name:'',taxId:'',address:''},paymentDate:null,legend:''};}
export function ownReceiptCommand(value){
 need(salaryExact(value,['command','scopeVersion','sourceVersion','params','batchId','batchSha256','reason','reviewConfirmed'])&&['prepare','approve','withdraw'].includes(value.command)&&[value.scopeVersion,value.sourceVersion].every(salaryHash)&&text(value.reason,10,1000)&&typeof value.reviewConfirmed==='boolean','Revisá operación, revisión completa y fundamento de la emisión.');
 if(value.command==='prepare'){
  need(value.batchId===null&&value.batchSha256===null&&value.params!==null&&value.reviewConfirmed===false,'Preparar conserva una copia para revisión; no la aprueba.');
  return {...value,params:ownReceiptParams(value.params)};
 }
 need(salaryUuid(value.batchId)&&salaryHash(value.batchSha256)&&value.params===null&&value.reviewConfirmed===true,'Elegí la emisión completa y confirmá su revisión.');
 return {...value};
}

export function ownReceiptRecord(record){
 const namespaced=record?.namespaceVersion===OWN_PAYROLL_NAMESPACE_VERSION;
 need(salaryExact(record,['sourceGroupId','contractId','personId','registrationId','employeeNumber','name','dni','cuil','agreementCode','departmentCode','runId','liquidationVersion','precision','totals','concepts',...(namespaced?['namespaceVersion']:[])])&&[record.sourceGroupId,record.contractId,record.personId,record.registrationId,record.runId].every(salaryUuid)&&ownPayrollEmployeeNumber(record.employeeNumber)&&[record.agreementCode,record.departmentCode].every(code)&&text(record.name,3,160)&&typeof record.dni==='string'&&/^\d{5,12}$/.test(record.dni)&&typeof record.cuil==='string'&&/^\d{11}$/.test(record.cuil)&&Number.isSafeInteger(record.liquidationVersion)&&record.liquidationVersion>0&&Number.isInteger(record.precision)&&record.precision>=0&&record.precision<=8&&salaryExact(record.totals,OWN_CLOSE_TOTAL_KEYS)&&Array.isArray(record.concepts)&&record.concepts.length<=OWN_RECEIPT_MAX_CONCEPTS,'No se verificó la identidad propia o la copia financiera del recibo.');
 const seen=new Set(),sums=Object.fromEntries(OWN_CLOSE_TOTAL_KEYS.slice(0,4).map(key=>[key,rational(0n)]));
 for(const concept of record.concepts){
  const key=namespaced?(concept.nature==='auxiliary'?'auxiliary:':'concept:')+concept.code:concept.code;
  need(salaryExact(concept,['code','label','nature','unit','amount','labelSourceSha256'])&&code(concept.code)&&!seen.has(key)&&text(concept.label,1,240)&&Object.hasOwn(OWN_RUN_NATURES,concept.nature)&&text(concept.unit,1,80)&&salaryHash(concept.labelSourceSha256),'Hay un concepto repetido, incompleto o sin etiqueta de la fuente conservada.');
  formatOwnRunDecimal(concept.amount,concept.unit==='money');seen.add(key);
  if(Object.hasOwn(sums,concept.nature))sums[concept.nature]=exactAdd(sums[concept.nature],decimal(concept.amount));
 }
 sums.gross=exactAdd(sums.remuneration,sums.non_remuneration);sums.net=exactSubtract(sums.gross,sums.deduction);
 for(const key of OWN_CLOSE_TOTAL_KEYS){formatOwnRunDecimal(record.totals[key]);need(quantize(sums[key],{precision:record.precision,mode:'exact'}).amount===record.totals[key],'Los conceptos no concilian con el total original conservado.');}
 return record;
}
export function ownReceiptSnapshot(value){
 need(salaryExact(value,['version','params','sourceVersion','sources','records','recordCount','conceptCount','identityBasis','paymentDateBasis','signatureState','payrollPosted','paymentExecuted'])&&((value.version==='own-receipt-snapshot.v1'&&value.identityBasis==='native_registration_immutable')||(['own-receipt-snapshot.v2','own-receipt-snapshot.v3'].includes(value.version)&&value.identityBasis==='owned_registration_verified_at_capture'))&&salaryHash(value.sourceVersion)&&value.paymentDateBasis==='declared'&&value.signatureState==='pending'&&value.payrollPosted===false&&value.paymentExecuted===false,'No se verificó la copia de emisión y sus estados.');
 const params=ownReceiptParams(value.params),groups=new Map(),identities=new Set();
 need(value.version!=='own-receipt-snapshot.v1'||!Object.hasOwn(params,'contracts'),'La selección exacta requiere una copia de emisión v2.');
 need(Array.isArray(value.sources)&&value.sources.length<=1000&&Array.isArray(value.records)&&value.records.length<=OWN_RECEIPT_MAX_RECORDS&&value.recordCount===value.records.length&&Number.isSafeInteger(value.conceptCount)&&value.conceptCount>=0&&value.conceptCount<=OWN_RECEIPT_MAX_CONCEPTS,'La emisión completa supera la capacidad o perdió documentos; no se exportará un subconjunto.');
 for(const source of value.sources){
  need(salaryExact(source,['id','snapshotSha256','period','type','employeeCount','populationCount','selectedCount'])&&salaryUuid(source.id)&&!groups.has(source.id)&&salaryHash(source.snapshotSha256)&&source.period===params.period&&params.types.includes(source.type)&&Number.isSafeInteger(source.employeeCount)&&source.employeeCount>0&&Number.isSafeInteger(source.populationCount)&&source.populationCount>=source.employeeCount&&Number.isSafeInteger(source.selectedCount)&&source.selectedCount>=0&&source.selectedCount<=source.employeeCount,'Una fuente está repetida, incompleta o fuera del alcance elegido.');groups.set(source.id,source);
 }
 let concepts=0;const sourceCounts=new Map();
 for(const record of value.records){
  ownReceiptRecord(record);need(value.version==='own-receipt-snapshot.v3'||!Object.hasOwn(record,'namespaceVersion'),'La emisión anterior no declara referencias separadas.');need(value.version!=='own-receipt-snapshot.v1'||code(record.employeeNumber),'La copia original v1 requiere un legajo numérico.');need(!params.contracts?.length||params.contracts.includes(record.contractId),'El recibo está fuera de la selección exacta revisada.');const source=groups.get(record.sourceGroupId);need(source,'Un recibo no pertenece a una fuente original verificada.');
  const identity=source.period+':'+source.type+':'+record.contractId;need(!identities.has(identity),'Un contrato está repetido en el mismo período y tipo.');identities.add(identity);concepts+=record.concepts.length;sourceCounts.set(source.id,(sourceCounts.get(source.id)??0)+1);
  need(!(params.filters.employeeFrom||params.filters.employeeTo)||code(record.employeeNumber),'El rango numérico no puede ordenar un legajo no numérico. Elegí contratos exactos de la previa completa.');
  for(const [range,field] of [['employee','employeeNumber'],['agreement','agreementCode'],['department','departmentCode']])need((!params.filters[range+'From']||BigInt(record[field])>=BigInt(params.filters[range+'From']))&&(!params.filters[range+'To']||BigInt(record[field])<=BigInt(params.filters[range+'To'])),'El recibo está fuera de los límites inclusivos revisados.');
 }
 need(concepts===value.conceptCount&&value.sources.every(source=>(sourceCounts.get(source.id)??0)===source.selectedCount),'Faltan recibos o conceptos del conjunto completo.');
 need(value.version!=='own-receipt-snapshot.v3'||value.records.some(r=>r.namespaceVersion===OWN_PAYROLL_NAMESPACE_VERSION),'La emisión v3 requiere una referencia separada conservada.');
 return value;
}
export function ownReceiptPreview(value){
 need(salaryExact(value,['version','scopeVersion','snapshot','snapshotSha256','permissions'])&&value.version==='own-receipt-preview.v1'&&salaryHash(value.scopeVersion)&&salaryHash(value.snapshotSha256)&&salaryExact(value.permissions,['canPrepare'])&&typeof value.permissions.canPrepare==='boolean','No se verificó la previa de emisión.');ownReceiptSnapshot(value.snapshot);return value;
}
export async function ownReceiptVerifyHash(value,expected){
 need(salaryHash(expected),'No se verificó la huella de emisión.');const actual=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(salarySerialized(value))))].map(byte=>byte.toString(16).padStart(2,'0')).join('');need(actual===expected,'Cambió el contenido conservado de la emisión.');return value;
}
export async function verifiedOwnReceiptPreview(value){ownReceiptPreview(value);await ownReceiptVerifyHash(value.snapshot,value.snapshotSha256);return value;}
export function ownReceiptBatch(value){
 need(salaryExact(value,['version','id','preparedAt','preparedBy','snapshot','snapshotSha256','state','sourceCurrent','review','permissions'])&&value.version==='own-receipt-batch.v1'&&salaryUuid(value.id)&&at(value.preparedAt)&&text(value.preparedBy,1,160)&&salaryHash(value.snapshotSha256)&&['prepared','approved','withdrawn'].includes(value.state)&&typeof value.sourceCurrent==='boolean'&&salaryExact(value.permissions,['canApprove','canWithdraw','canDownload'])&&Object.values(value.permissions).every(v=>typeof v==='boolean'),'No se verificó la emisión conservada.');ownReceiptSnapshot(value.snapshot);
 if(value.state==='prepared')need(value.review===null,'La preparación no tiene una aprobación implícita.');
 else need(salaryExact(value.review,['id','decision','at','by','reason'])&&salaryUuid(value.review.id)&&value.review.decision===value.state&&at(value.review.at)&&text(value.review.by,1,160)&&text(value.review.reason,10,1000),'La decisión no corresponde al estado del recibo.');
 need(!value.permissions.canDownload||value.sourceCurrent&&value.state!=='withdrawn','Una fuente reabierta o emisión retirada no permite una descarga vigente.');return value;
}
export function ownReceiptEvent(value,attempt=null){
 need(salaryExact(value,['version','id','key','body','bodySha256','batchId','recordedAt','replayed'])&&value.version==='own-receipt-event.v1'&&salaryUuid(value.id)&&salaryKey(value.key)&&salaryHash(value.bodySha256)&&salaryUuid(value.batchId)&&at(value.recordedAt)&&typeof value.replayed==='boolean','No se verificó el resultado del envío.');ownReceiptCommand(value.body);
 if(attempt)need(value.key===attempt.key&&salarySerialized(value.body)===salarySerialized(attempt.body),'La confirmación corresponde a otro intento.');return value;
}
export function ownReceiptAttempt(key,body,accessKey){need(salaryKey(key)&&typeof accessKey==='string'&&accessKey,'Se necesita una referencia de envío y cuenta municipal.');return freeze({key,body:structuredClone(ownReceiptCommand(body)),accessKey});}
export function ownReceiptVisibleRecords(snapshot,search='',page=1){
 ownReceiptSnapshot(snapshot);need(Number.isSafeInteger(page)&&page>0,'Elegí una página válida.');const term=String(search).trim().toLocaleLowerCase('es'),rows=snapshot.records.filter(record=>!term||[record.employeeNumber,record.name,record.departmentCode,record.agreementCode].some(value=>value.toLocaleLowerCase('es').includes(term))),pages=Math.max(1,Math.ceil(rows.length/25)),current=Math.min(page,pages);return {rows:rows.slice((current-1)*25,current*25),total:snapshot.recordCount,filtered:rows.length,pages,page:current};
}
export const ownReceiptType=type=>OWN_RUN_TYPES[type];
export function ownReceiptList(value){
 need(salaryExact(value,['version','scopeVersion','period','items'])&&value.version==='own-receipt-list.v1'&&salaryHash(value.scopeVersion)&&/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(value.period)&&Array.isArray(value.items)&&value.items.length<=1000,'No se verificó el historial de emisiones.');const seen=new Set();
 for(const item of value.items){need(salaryExact(item,['id','preparedAt','preparedBy','recordCount','types'])&&salaryUuid(item.id)&&!seen.has(item.id)&&at(item.preparedAt)&&text(item.preparedBy,1,160)&&Number.isSafeInteger(item.recordCount)&&item.recordCount>0&&item.recordCount<=OWN_RECEIPT_MAX_RECORDS,'El historial contiene una emisión incompleta o repetida.');ownReportQuery({from:value.period,to:value.period,types:item.types});seen.add(item.id);}return value;
}
export function ownReceiptSelf(value){
 need(salaryExact(value,['version','items'])&&value.version==='own-receipt-self.v1'&&Array.isArray(value.items)&&value.items.length<=1000,'No se verificó la consulta de tus recibos.');let contract,person;const seen=new Set();
 for(const item of value.items){
  need(salaryExact(item,['batchId','preparedAt','approvedAt','params','record','source','signatureState','paymentDateBasis','payrollPosted','paymentExecuted'])&&salaryUuid(item.batchId)&&at(item.preparedAt)&&at(item.approvedAt)&&item.signatureState==='pending'&&item.paymentDateBasis==='declared'&&item.payrollPosted===false&&item.paymentExecuted===false,'No se verificaron la revisión y estados de tu recibo.');
  need(salaryExact(item.params,['period','issuer','paymentDate','legend'])&&salaryExact(item.source,['id','snapshotSha256','period','type'])&&salaryUuid(item.source.id)&&salaryHash(item.source.snapshotSha256)&&item.source.period===item.params.period&&Object.hasOwn(OWN_RUN_TYPES,item.source.type),'La consulta propia contiene datos de otro alcance.');
  ownReceiptParams({...item.params,types:[item.source.type],filters:emptyOwnReportFilters()});ownReceiptRecord(item.record);need(item.record.sourceGroupId===item.source.id,'No se verificó la fuente de tu recibo.');
  contract??=item.record.contractId;person??=item.record.personId;const key=item.batchId+':'+item.source.id;need(contract===item.record.contractId&&person===item.record.personId&&!seen.has(key),'La consulta no pertenece exclusivamente a un agente.');seen.add(key);
 }return value;
}
