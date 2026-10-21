// Pure metadata validation/classification only. No SQL, IO or installation authority.
export const RECEIPT126_INVENTORY_VERSION='own-receipt126-catalog-inventory.v1';
export const RECEIPT126_FUNCTION_NAMES=Object.freeze(['own_receipt_attempt_v1','own_receipt_batch_v1','own_receipt_batch_value_v1','own_receipt_command_v1','own_receipt_context_v1','own_receipt_event_v1','own_receipt_immutable_v1','own_receipt_list_v1','own_receipt_params_v1','own_receipt_preview_v1','own_receipt_self_v1','own_receipt_snapshot_v1','own_receipt_source_version_v1','own_receipt_text_v1']);
export const RECEIPT126_CAPABILITY_KEYS=Object.freeze(['payroll.receipt.approve','payroll.receipt.prepare','payroll.receipt.self.read']);
const invalid=()=>{throw Object.assign(Error('No se verifico la forma completa del inventario tecnico126.'),{code:'RECEIPT126_INVENTORY_INVALID'});};
const need=condition=>{if(!condition)invalid();};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
function exact(value,keys){need(object(value));const own=Reflect.ownKeys(value);need(own.length===keys.length&&own.every(key=>typeof key==='string'&&keys.includes(key)));for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);need(d&&Object.hasOwn(d,'value'));}}
const list=value=>{need(Array.isArray(value)&&Reflect.ownKeys(value).length===value.length+1);for(let n=0;n<value.length;n++)need(Object.hasOwn(value,n));return value;};
const text=value=>typeof value==='string'&&value.length>0;
const integer=(value,min=0)=>Number.isSafeInteger(value)&&value>=min;
const boolean=value=>typeof value==='boolean';
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const nullableHash=value=>value===null||hash(value);
function unique(rows,key){const values=rows.map(row=>row[key]);need(new Set(values).size===values.length);}
function acl(value){if(value===null)return;for(const row of list(value)){exact(row,['grantorOid','granteeOid','privilegeType','grantable']);need(integer(row.grantorOid,1)&&integer(row.granteeOid)&&text(row.privilegeType)&&boolean(row.grantable));}need(new Set(value.map(row=>[row.grantorOid,row.granteeOid,row.privilegeType].join(':'))).size===value.length);}
function table(value){
 if(value===null)return;
 exact(value,['oid','kind','persistence','ownerOid','ownerMatchesSchema','rlsEnabled','forceRls','acl','columns','constraints','triggers','indexes','policies']);
 need(integer(value.oid,1)&&text(value.kind)&&value.kind.length===1&&text(value.persistence)&&value.persistence.length===1&&integer(value.ownerOid,1)&&[value.ownerMatchesSchema,value.rlsEnabled,value.forceRls].every(boolean));acl(value.acl);
 for(const column of list(value.columns)){exact(column,['position','name','type','notNull','dropped','identityKind','generatedKind','defaultSha256','acl']);need(integer(column.position,1)&&text(column.name)&&text(column.type)&&boolean(column.notNull)&&boolean(column.dropped)&&typeof column.identityKind==='string'&&typeof column.generatedKind==='string'&&nullableHash(column.defaultSha256));acl(column.acl);}unique(value.columns,'position');
 for(const row of list(value.constraints)){exact(row,['oid','name','type','validated','deferrable','initiallyDeferred','keyPositions','referencedTableOid','definitionSha256']);need(integer(row.oid,1)&&text(row.name)&&text(row.type)&&row.type.length===1&&[row.validated,row.deferrable,row.initiallyDeferred].every(boolean)&&(row.keyPositions===null||list(row.keyPositions).every(n=>integer(n)))&&integer(row.referencedTableOid)&&hash(row.definitionSha256));}unique(value.constraints,'oid');
 for(const row of list(value.triggers)){exact(row,['oid','name','internal','enabled','eventMask','functionOid','functionSchema','functionName','definitionSha256']);need(integer(row.oid,1)&&text(row.name)&&boolean(row.internal)&&text(row.enabled)&&row.enabled.length===1&&integer(row.eventMask)&&integer(row.functionOid,1)&&text(row.functionSchema)&&text(row.functionName)&&hash(row.definitionSha256));}unique(value.triggers,'oid');
 for(const row of list(value.indexes)){exact(row,['oid','name','unique','primary','valid','ready','keyPositions','definitionSha256']);need(integer(row.oid,1)&&text(row.name)&&[row.unique,row.primary,row.valid,row.ready].every(boolean)&&list(row.keyPositions).every(n=>integer(n))&&hash(row.definitionSha256));}unique(value.indexes,'oid');
 for(const row of list(value.policies)){exact(row,['oid','name','permissive','command','roleOids','usingSha256','checkSha256']);need(integer(row.oid,1)&&text(row.name)&&boolean(row.permissive)&&text(row.command)&&row.command.length===1&&list(row.roleOids).every(n=>integer(n))&&nullableHash(row.usingSha256)&&nullableHash(row.checkSha256));}unique(value.policies,'oid');
}
export function validateReceipt126Inventory(value,expectedSchema){
 need(typeof expectedSchema==='string'&&/^mc_qa_fixed_092_[a-f0-9]{32}$/.test(expectedSchema));
 exact(value,['version','schema','table','functions','capabilityDefinitions','bodyHashBasis']);need(value.version===RECEIPT126_INVENTORY_VERSION&&value.bodyHashBasis==='pg_proc.prosrc_utf8_lf');
 exact(value.schema,['name','oid','ownerOid']);need(value.schema.name===expectedSchema&&integer(value.schema.oid,1)&&integer(value.schema.ownerOid,1));table(value.table);
 for(const fn of list(value.functions)){
  exact(fn,['oid','name','identityArguments','resultType','language','kind','securityDefiner','leakproof','strict','returnsSet','volatility','parallel','config','ownerOid','ownerMatchesSchema','acl','bodySha256']);
  need(integer(fn.oid,1)&&typeof fn.name==='string'&&/^own_receipt_[a-z0-9_]+$/.test(fn.name)&&typeof fn.identityArguments==='string'&&(fn.resultType===null||text(fn.resultType))&&text(fn.language)&&['f','p','a','w'].includes(fn.kind)&&[fn.securityDefiner,fn.leakproof,fn.strict,fn.returnsSet,fn.ownerMatchesSchema].every(boolean)&&['i','s','v'].includes(fn.volatility)&&['u','r','s'].includes(fn.parallel)&&integer(fn.ownerOid,1)&&hash(fn.bodySha256));if(fn.config!==null)need(list(fn.config).every(text));acl(fn.acl);
 }unique(value.functions,'oid');need(new Set(value.functions.map(fn=>fn.name+'('+fn.identityArguments+')')).size===value.functions.length);
 for(const cap of list(value.capabilityDefinitions)){exact(cap,['key','label','description','scopeKind','sensitivity']);need(RECEIPT126_CAPABILITY_KEYS.includes(cap.key)&&[cap.label,cap.description,cap.scopeKind,cap.sensitivity].every(value=>typeof value==='string'));}unique(value.capabilityDefinitions,'key');
 return value;
}
const freeze=value=>{if(value!==null&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
export function classifyReceipt126Inventory(value,expectedSchema){
 validateReceipt126Inventory(value,expectedSchema);
 const missingFunctionNames=RECEIPT126_FUNCTION_NAMES.filter(name=>!value.functions.some(fn=>fn.name===name)),missingCapabilityKeys=RECEIPT126_CAPABILITY_KEYS.filter(key=>!value.capabilityDefinitions.some(cap=>cap.key===key));
 const counts={tables:value.table===null?0:1,functions:value.functions.length,capabilityDefinitions:value.capabilityDefinitions.length};
 const absent=counts.tables===0&&counts.functions===0&&counts.capabilityDefinitions===0;
 // Names present are diagnostic only. Wrong bodies, ACLs, shape or versions can
 // still be present here; no metadata/count ever grants installation authority.
 const classification=absent?'ausente':value.table!==null&&missingFunctionNames.length===0&&missingCapabilityKeys.length===0?'objetos_presentes_sin_admision':'parcial';
 return freeze({version:'own-receipt126-inventory-classification.v1',formValidated:true,classification,counts,missingFunctionNames,missingCapabilityKeys,installationAllowed:false,receiptWorkflowExecuted:false,metadataOnly:true,inventory:structuredClone(value)});
}
