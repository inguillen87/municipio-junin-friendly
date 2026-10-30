// Serial orchestration of existing commands. No SQL, persistence or payroll calculation.
import {ownNoveltyBootstrap,ownNoveltyBatch,ownNoveltyCommand,ownNoveltyReceipt,ownNoveltySuccessionContext,ownNoveltyAffectedStatePreimage,OWN_NOVELTY_TYPES,OWN_NOVELTY_SUCCESSION_BATCH,OWN_NOVELTY_SUCCESSION_COMMAND} from './own-payroll-novelties-model.js';
import {salaryExact,salarySerialized,salaryKey,salaryUuid} from './native-salary-catalog-model.js';

const frozen=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(frozen);Object.freeze(value);}return value;};
const fail=message=>{throw Error(message);};
const active=batch=>['draft','submitted','approved'].includes(batch.status);
export function ownNoveltyCancellationScope(value){
 if(!salaryExact(value,['periodMonth','payrollType','conceptSourceId'])||!/^20(?:0[8-9]|[1-9]\d)-(0[1-9]|1[0-2])-01$/.test(value.periodMonth)||!OWN_NOVELTY_TYPES.includes(value.payrollType)||typeof value.conceptSourceId!=='string'||!/^(0|[1-9]\d{0,19})$/.test(value.conceptSourceId))fail('Elegí el concepto, mes y tipo completos de la eliminación.');
 return frozen({...value});
}
export function ownNoveltyCancellationCensus(bootstrap,scope){
 ownNoveltyBootstrap(bootstrap);ownNoveltyCancellationScope(scope);
 return frozen(structuredClone(bootstrap.batches.filter(b=>active(b)&&b.periodMonth===scope.periodMonth&&b.payrollType===scope.payrollType)).sort((a,b)=>a.id.localeCompare(b.id)));
}
const pin=batch=>({id:batch.id,revision:batch.revision,status:batch.status,periodMonth:batch.periodMonth,payrollType:batch.payrollType,rowCount:batch.rowCount,preparedBy:batch.preparedBy,version:batch.version,rowsSha256:batch.rowsSha256,decidedBy:batch.decidedBy,approvals:batch.approvals,...(batch.version===OWN_NOVELTY_SUCCESSION_BATCH?{supersedes:batch.supersedes,correctionReason:batch.correctionReason}:{})});
const summary=batch=>Object.fromEntries(['id','revision','status','periodMonth','payrollType','rowCount','preparedBy'].map(key=>[key,batch[key]]));

// A logical locator for in-memory recovery, never proof of membership/person ownership.
// The server reauthorizes every command and attempt lookup under the current session.
export function ownNoveltyCancellationOwnerKey(accessKey){
 let values;try{values=JSON.parse(accessKey);}catch{fail('No se verificó la cuenta para recuperar el conjunto.');}
 if(!Array.isArray(values)||values.length!==4||values.some(value=>typeof value!=='string'||!value)||!salaryUuid(values[2]))fail('No se verificó el ámbito para recuperar el conjunto.');
 return salarySerialized(values.slice(1));
}

export function createOwnNoveltyCancellation(deps){
 let plan=null,pending=null,results=[],cursor=0,ownerKey=null,reasonReference=null,busy=false,epoch=0,visible=true,notFound=false,message='';
 const live=()=>deps.isLive()!==false;
 const changed=()=>deps.onChange?.();
 const guard=token=>{if(token!==epoch||!live())throw Object.assign(Error('Se retiró la revisión conjunta.'),{name:'AbortError'});};
 const read=async(promise,token)=>{const value=await promise;guard(token);return value;};
 async function authorize(token){const key=await read(deps.authorize(),token);if(typeof key!=='string'||!key||ownerKey!==null&&key!==ownerKey)throw Object.assign(Error('Cambió la cuenta o el ámbito. Se conserva el intento de la revisión original.'),{status:403});return key;}
 async function restoreAccess(token){
  if(ownerKey===null)throw Object.assign(Error('No se verificó la cuenta original de la revisión.'),{status:403});
  const key=await authorize(token),bootstrap=ownNoveltyBootstrap(await read(deps.readBootstrap(),token));
  if(!bootstrap.permissions.canPrepare)throw Object.assign(Error('No se verificó el permiso actual de cancelación.'),{status:403});
  const current=new Map(bootstrap.batches.map(item=>[item.id,item]));
  const references=plan?.census??results.map(result=>({id:result.batchId,periodMonth:result.scope.periodMonth,payrollType:result.scope.payrollType,rowCount:result.rowCount,preparedBy:result.preparedBy}));
  for(const reference of references){const value=current.get(reference.id);if(!value||['periodMonth','payrollType','rowCount','preparedBy'].some(field=>salarySerialized(value[field])!==salarySerialized(reference[field])))throw Object.assign(Error('No se verificó que la revisión conservada pertenezca al ámbito actual.'),{status:403});}
  if(await authorize(token)!==key)throw Object.assign(Error('Cambió la cuenta durante la recuperación de la consulta.'),{status:403});
  guard(token);visible=true;
 }
 async function batch(id,token){const value=ownNoveltyBatch(await read(deps.readDetail(id),token));if(value.id!==id||value.rowsSha256!==await read(deps.hash(value.rows.map(({values,subject})=>({values,subject}))),token))fail('No se verificó el detalle completo del lote solicitado.');return value;}
 async function approvedBlock(value,token){
  if(value.version===OWN_NOVELTY_SUCCESSION_BATCH)return 'El reemplazo aprobado requiere una nueva corrección explícita.';
  const context=ownNoveltySuccessionContext(await read(deps.readContext(value.id),token));
  if(salarySerialized(pin(context.batch))!==salarySerialized(pin(value))||context.batch.rowsSha256!==await read(deps.hash(context.batch.rows.map(({values,subject})=>({values,subject}))),token)||context.snapshotSha256!==await read(deps.hash(context.batch),token)||context.affectedStateVersion!==await read(deps.hash(ownNoveltyAffectedStatePreimage(context)),token))fail('Cambió el lote o no se verificaron todos sus usos.');
  if(!context.effective||context.pendingSuccessor||context.approvedSuccessor)return 'Hay una corrección pendiente o un reemplazo; revisá el lote individualmente.';
  // This context includes related contracts, not just captures of this source.
  if(context.affectedState.captures.length||context.affectedState.groups.length)return 'Hay cálculos o cierres relacionados; revisá el lote individualmente.';
  return null;
 }
 async function operation(fn){
  if(busy||!live())return;busy=true;const token=epoch;changed();
  try{return await fn(token);}catch(error){if(token===epoch&&visible){message=error.message;changed();}throw error;}finally{busy=false;changed();}
 }
 async function locate(input){return operation(async token=>{
  if(pending||plan||results.length)fail('Terminá o cerrá la revisión conjunta antes de abrir otra.');
  const scope=ownNoveltyCancellationScope(input),key=await authorize(token),bootstrap=ownNoveltyBootstrap(await read(deps.readBootstrap(),token));
  if(!bootstrap.permissions.canPrepare)throw Object.assign(Error('Tu cuenta no permite preparar esta operación.'),{status:403});
  const census=ownNoveltyCancellationCensus(bootstrap,scope),targets=[],blocked=[];
  let matchingRows=0;
  for(const item of census){
   const value=await batch(item.id,token);if(salarySerialized(summary(value))!==salarySerialized(item))fail('Cambió un lote durante la búsqueda. Actualizá el conjunto completo.');
   const count=value.rows.filter(r=>r.values.conceptSourceId===scope.conceptSourceId).length;
   if(!count)continue;matchingRows+=count;
   let reason=count!==value.rowCount?'El lote contiene otros conceptos; cancelarlo completo ampliaría la selección.':value.status==='approved'?await approvedBlock(value,token):null;
   if(reason)blocked.push({batchId:value.id,rowCount:value.rowCount,matchingRows:count,reason});else targets.push(structuredClone(pin(value)));
  }
  if(await authorize(token)!==key)throw Object.assign(Error('Cambió la cuenta durante la revisión del conjunto.'),{status:403});
  const final=ownNoveltyCancellationCensus(await read(deps.readBootstrap(),token),scope);
  if(salarySerialized(final)!==salarySerialized(census))fail('Cambió el inventario de lotes. Volvé a localizar el conjunto completo.');
  plan=frozen({scope,census,targets,blocked,matchingRows});ownerKey=key;results=[];cursor=0;reasonReference=null;notFound=false;visible=true;
  message=blocked.length?'Hay lotes que requieren revisión individual. No se habilitó ninguna cancelación conjunta.':targets.length?'Conjunto completo revisado. La autoría se comprueba en el servidor al registrar cada cancelación.':'No hay novedades activas que coincidan con ese concepto, mes y tipo.';
  changed();return view();
 });}
 async function preflight(target,token){
  await authorize(token);
  const expected=plan.census.filter(item=>!results.some(result=>result.batchId===item.id));
  const bootstrap=ownNoveltyBootstrap(await read(deps.readBootstrap(),token));
  if(!bootstrap.permissions.canPrepare)throw Object.assign(Error('Se retiró el permiso para preparar la cancelación.'),{status:403});
  const current=ownNoveltyCancellationCensus(bootstrap,plan.scope);
  if(salarySerialized(expected)!==salarySerialized(current))fail('Cambió el conjunto revisado. Se conservaron los resultados anteriores y no se enviaron los restantes.');
  const value=await batch(target.id,token);
  if(salarySerialized(pin(value))!==salarySerialized(target))fail('Cambió la versión o el contenido de un lote. No se envió su cancelación.');
  if(value.status==='approved'){const reason=await approvedBlock(value,token);if(reason)fail(reason);}
  await authorize(token);
 }
 async function accept(value,token){
  ownNoveltyReceipt(value,pending);const snapshot=value.snapshot,target=plan.targets[cursor];
  if(value.requestSha256!==await read(deps.hash(value.body),token)||snapshot.rowsSha256!==await read(deps.hash(snapshot.rows.map(({values,subject})=>({values,subject}))),token)||salarySerialized(pin(snapshot))!==salarySerialized({...target,status:'cancelled',revision:target.revision+1}))fail('El comprobante no conserva el lote completo de esta revisión. Recuperá el mismo intento.');
  guard(token);
  results.push(frozen({batchId:snapshot.id,rowCount:snapshot.rowCount,revision:snapshot.revision,rowsSha256:snapshot.rowsSha256,requestKey:value.requestKey,requestSha256:value.requestSha256,body:structuredClone(value.body),scope:plan.scope,preparedBy:structuredClone(target.preparedBy)}));
  pending=null;notFound=false;cursor++;message=cursor===plan.targets.length?'Se verificaron todos los comprobantes de cancelación del conjunto.':'Se verificó el comprobante de un lote. Los restantes todavía no se enviaron.';changed();
 }
 async function recoverCurrent(token){
  if(!visible)await restoreAccess(token);else await authorize(token);
  try{await accept(await read(deps.readAttempt(pending.key),token),token);return true;}
  catch(error){if(error.status!==404)throw error;notFound=true;message='No hay comprobante registrado para este intento. Reintentá su misma clave o devolvé el conjunto a revisión.';changed();return false;}
 }
 async function execute(confirmed){return operation(async token=>{
  if(!plan||!confirmed||plan.blocked.length||!plan.targets.length)fail('Localizá y revisá el conjunto completo antes de confirmar.');
  if(!visible)await restoreAccess(token);
  if(pending){if(!await recoverCurrent(token)){
   await preflight(plan.targets[cursor],token);await accept(await read(deps.send(pending),token),token);
  }}
  while(cursor<plan.targets.length){
   const target=plan.targets[cursor];await preflight(target,token);
   if(reasonReference===null){const key=deps.key();if(!salaryKey(key))fail('No se verificó la referencia de la eliminación.');reasonReference='ref:'+key;}
   const key=deps.key();if(!salaryKey(key)||results.some(result=>result.requestKey===key))fail('No se verificó una referencia única para este intento.');
   const body=ownNoveltyCommand({...(target.version===OWN_NOVELTY_SUCCESSION_BATCH?{version:OWN_NOVELTY_SUCCESSION_COMMAND,affectedStateVersion:null}:{}),command:'cancel',batchId:target.id,expectedRevision:target.revision,reasonReference,reviewConfirmed:true});
   pending=frozen({key,body,ownerScopeKey:ownerKey});notFound=false;changed();guard(token);
   await accept(await read(deps.send(pending),token),token);
  }
  return view();
 });}
 async function recover(){return operation(async token=>{if(!pending)return;await recoverCurrent(token);return view();});}
 async function restore(){return operation(async token=>{
  if(!plan&&!pending&&!results.length)return view();
  visible=false;changed();await restoreAccess(token);
  message=pending?'Se recuperó la consulta de la revisión. Recuperá el comprobante pendiente antes de continuar.':plan?'Se recuperó la revisión y sus comprobantes históricos. Cualquier envío exige confirmar y verificar nuevamente las fuentes.':'Se recuperaron los comprobantes de la revisión anterior. No hay un conjunto preparado para enviar.';
  changed();return view();
 });}
 async function reviseMissing(){return operation(async token=>{
  if(!pending||!notFound)fail('Recuperá primero el comprobante del intento pendiente.');
  if(await recoverCurrent(token))return view();
  pending=null;notFound=false;plan=null;if(!results.length)ownerKey=null;reasonReference=null;cursor=0;message='El intento sin registro volvió a revisión. Las cancelaciones ya verificadas se conservan y no se deshacen.';changed();return view();
 });}
 function close(){if(busy||pending)fail('Recuperá primero el intento pendiente; su clave se conserva.');plan=null;results=[];cursor=0;ownerKey=null;reasonReference=null;notFound=false;message='Revisión cerrada. No se deshicieron cancelaciones registradas.';changed();}
 function withdraw(){epoch++;visible=false;message='Se retiró la revisión. Actualizá el acceso para recuperar el intento pendiente.';changed();}
 function view(){
  const base={active:plan!==null||pending!==null||results.length>0,pending:pending!==null,notFound,busy,visible,message};
  if(!visible)return {...base,scope:null,targets:[],blocked:[],results:[],matchingRows:0,remaining:0,complete:false};
  return {...base,scope:plan?.scope??results[0]?.scope??null,targets:plan?.targets??[],blocked:plan?.blocked??[],results:[...results],matchingRows:plan?.matchingRows??results.reduce((sum,result)=>sum+result.rowCount,0),remaining:plan?plan.targets.length-cursor:0,complete:!!plan&&plan.targets.length>0&&cursor===plan.targets.length,historyOnly:!plan&&results.length>0};
 }
 return {locate,execute,recover,restore,reviseMissing,close,withdraw,view,hasWork:()=>plan!==null||pending!==null||results.length>0,hasPending:()=>pending!==null};
}
