import {assertClockFleet,clockFleetStatus} from './clock-fleet-model.js';
import {assertClockSourceDashboard} from './clock-source-model.js';
import {csvCell} from './clock-dashboard-model.js';
// A composed, revalidated read of two stages; no inferred event-level reconciliation.
const fail=()=>{throw Error('CLOCK_WORKSPACE_CONTRACT_INVALID');};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export const WORKSPACE_STATES=Object.freeze({consultable:'Marcaciones consultables',source_pending:'Archivo recibido · por incorporar',incomplete:'Archivo por completar',waiting:'Esperando archivo',configuration:'Configuración pendiente',unavailable:'Archivo sin verificar',restricted:'Equipo restringido'});
export function createClockWorkspace(reception,archive,archiveErrorCode=null){
 const v={version:'clock-fleet-workspace.v1',checkedAt:archive?.checkedAt??reception.checkedAt,snapshotConsistency:'composed_revalidated',reception,archive,archiveAvailability:archive?'available':'unavailable',archiveErrorCode,payrollModified:false,liveConnectionVerified:false};
 return assertClockWorkspace(v);
}
export function assertClockWorkspace(v){
 if(!exact(v,['version','checkedAt','snapshotConsistency','reception','archive','archiveAvailability','archiveErrorCode','payrollModified','liveConnectionVerified'])||v.version!=='clock-fleet-workspace.v1'||v.snapshotConsistency!=='composed_revalidated'||v.payrollModified!==false||v.liveConnectionVerified!==false)fail();
 assertClockFleet(v.reception);if(v.checkedAt!==(v.archive?.checkedAt??v.reception.checkedAt))fail();
 const unique=new Set(v.reception.devices.map(d=>d.deviceId.toLowerCase()));if(unique.size!==v.reception.devices.length)fail();
 if(v.archiveAvailability==='unavailable'){
  if(v.archive!==null||!['CLOCK_SOURCE_UNAVAILABLE','CLOCK_SOURCE_NOT_CONFIGURED'].includes(v.archiveErrorCode))fail();
 }else{
  if(v.archiveAvailability!=='available'||v.archiveErrorCode!==null)fail();assertClockSourceDashboard(v.archive);
  if(v.archive.coreCheckedAt!==v.reception.checkedAt||v.archive.devices.length!==v.reception.devices.length)fail();
  const byId=new Map(v.archive.devices.map(d=>[d.deviceId.toLowerCase(),d]));if(byId.size!==v.archive.devices.length)fail();
  for(const d of v.reception.devices){const a=byId.get(d.deviceId.toLowerCase());if(!a||['deviceId','siteKey','label','model','deviceState'].some(k=>a[k]!==d[k]))fail();}
 }
 return v;
}
const normalized=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-AR');
export function workspaceRows(value,{search='',state='all'}={}){
 const v=assertClockWorkspace(value);if(typeof search!=='string'||search.length>120||/[\x00-\x1f\x7f]/.test(search)||state!=='all'&&!Object.hasOwn(WORKSPACE_STATES,state))fail();
 const archive=new Map((v.archive?.devices??[]).map(d=>[d.deviceId,d])),words=normalized(search).trim().split(/\s+/).filter(Boolean);
 return v.reception.devices.map(d=>{
  const a=archive.get(d.deviceId)??null,restricted=['suspended','retired'].includes(d.deviceState)||['suspended','retired'].includes(d.connectorState);
  const key=restricted?'restricted':a?.pendingBatches>0?'incomplete':d.canConsult?'consultable':a?.recordsPersisted>0?'source_pending':!a?'unavailable':!a.enrolled||!a.enabled?'configuration':'waiting';
  const guidance={consultable:'Abrí las marcaciones y revisá sus jornadas. La consulta disponible no certifica vinculación ni horas pagables.',source_pending:'El archivo original llegó; falta incorporar y vincular las marcas para consultar jornadas. No se deduce una cantidad pendiente restando contadores.',incomplete:'Hay envíos con partes pendientes. Revisá el colector antes de considerar completa esa captura.',waiting:'El archivo no tiene recepciones en este corte. Comprobá la primera captura y el envío.',configuration:'Completá la configuración del canal de archivo. No significa que el equipo físico esté apagado.',unavailable:'No se pudo verificar el archivo. Los datos de recepción operativa permanecen separados; el desconocido no se muestra como cero.',restricted:'Equipo o conector suspendido/retirado. La consulta del histórico no autoriza reanudar su recepción.'};
  return {device:d,archive:a,state:key,label:WORKSPACE_STATES[key],guidance:guidance[key],receptionStatus:clockFleetStatus(d,v.reception.checkedAt)};
 }).filter(r=>(state==='all'||r.state===state)&&words.every(w=>normalized([r.device.siteKey,r.device.label,r.device.model].join(' ')).includes(w))).sort((a,b)=>a.device.siteKey.localeCompare(b.device.siteKey,undefined,{numeric:true})||a.device.deviceId.localeCompare(b.device.deviceId));
}
export function workspaceSummary(v){
 const rows=workspaceRows(v),states=Object.fromEntries(Object.keys(WORKSPACE_STATES).map(k=>[k,0]));for(const r of rows)states[r.state]++;
 return {devices:rows.length,archiveReceived:v.archive?rows.filter(r=>r.archive.recordsPersisted>0).length:null,consultable:rows.filter(r=>r.device.canConsult).length,awaitingIncorporation:v.archive?rows.filter(r=>!r.device.canConsult&&r.archive.recordsPersisted>0).length:null,states};
}
export function workspaceCsv(v,options={}){
 const rows=workspaceRows(v,options),header=['Punto','Lugar','Modelo','Etapa a revisar','Consulta operativa UTC','Consulta archivo UTC','Registros guardados en archivo','Envíos completos en archivo','Envíos pendientes en archivo','Marcaciones nuevas incorporadas','Observaciones operativas','Reenvíos duplicados','Puede consultar marcaciones','Último acuse operativo UTC','Último acuse de archivo UTC','Alcance'];
 return '\ufeff'+[header,...rows.map(r=>[r.device.siteKey.toUpperCase(),r.device.label,r.device.model??'No informado',r.label,v.reception.checkedAt,v.archive?.sourceCheckedAt??'Sin verificar',r.archive?.recordsPersisted??'No verificado',r.archive?.completedBatches??'No verificado',r.archive?.pendingBatches??'No verificado',r.device.newCanonical,r.device.observations,r.device.duplicates,r.device.canConsult?'Sí':'No',r.device.lastReceivedAt??'',r.archive?.lastReceivedAt??'', 'Dos etapas distintas; no sumar/restar registros de archivo y marcas. Sin nombres de agentes, cálculo salarial o prueba de conexión permanente.'])].map(r=>r.map(csvCell).join(';')).join('\r\n')+'\r\n';
}
