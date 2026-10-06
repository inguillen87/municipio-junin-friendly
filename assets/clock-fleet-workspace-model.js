import {assertClockFleet,clockFleetStatus} from './clock-fleet-model.js';
import {assertClockSourceDashboard} from './clock-source-model.js';
import {csvCell} from './clock-dashboard-model.js';
// A composed, revalidated read of two stages; no inferred event-level reconciliation.
const fail=()=>{throw Error('CLOCK_WORKSPACE_CONTRACT_INVALID');};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export const WORKSPACE_STATES=Object.freeze({consultable:'Marcaciones consultables',source_pending:'Archivo recibido · por incorporar',incomplete:'Archivo por completar',waiting:'Esperando archivo',configuration:'Configuración pendiente',unavailable:'Archivo sin verificar',restricted:'Equipo restringido',registration:'Inscripción pendiente'});
export function assertReportedClockPark(v){
 if(!exact(v,['version','pointCount','points','physicalConnectionVerified'])||v.version!=='clock-reported-park.v1'||v.physicalConnectionVerified!==false||!Number.isSafeInteger(v.pointCount)||v.pointCount<1||v.pointCount>200||!Array.isArray(v.points)||v.points.length!==v.pointCount)fail();
 const seen=new Set();
 for(const p of v.points){
  if(!exact(p,['siteKey','label','model'])||typeof p.siteKey!=='string'||!/^[a-z0-9][a-z0-9-]{0,63}$/.test(p.siteKey)||seen.has(p.siteKey)||['label','model'].some(k=>typeof p[k]!=='string'||!p[k].trim()||p[k].length>240||/[\x00-\x1f\x7f]/.test(p[k])))fail();
  seen.add(p.siteKey);
 }
 return v;
}
export function createClockWorkspace(reception,archive,archiveErrorCode=null,reportedPark=null){
 const v={version:reportedPark?'clock-fleet-workspace.v2':'clock-fleet-workspace.v1',checkedAt:archive?.checkedAt??reception.checkedAt,snapshotConsistency:'composed_revalidated',reception,archive,archiveAvailability:archive?'available':'unavailable',archiveErrorCode,payrollModified:false,liveConnectionVerified:false,...(reportedPark?{reportedPark}: {})};
 return assertClockWorkspace(v);
}
export function assertClockWorkspace(v){
 const extended=v?.version==='clock-fleet-workspace.v2';
 if(!exact(v,['version','checkedAt','snapshotConsistency','reception','archive','archiveAvailability','archiveErrorCode','payrollModified','liveConnectionVerified',...(extended?['reportedPark']:[])])||!['clock-fleet-workspace.v1','clock-fleet-workspace.v2'].includes(v.version)||v.snapshotConsistency!=='composed_revalidated'||v.payrollModified!==false||v.liveConnectionVerified!==false)fail();
 if(extended)assertReportedClockPark(v.reportedPark);
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
 const rows=v.reception.devices.map(d=>{
  const a=archive.get(d.deviceId)??null,restricted=['suspended','retired'].includes(d.deviceState)||['suspended','retired'].includes(d.connectorState);
  const key=restricted?'restricted':a?.pendingBatches>0?'incomplete':d.canConsult?'consultable':a?.recordsPersisted>0?'source_pending':!a?'unavailable':!a.enrolled||!a.enabled?'configuration':'waiting';
  const guidance={consultable:'Abrí las marcaciones y revisá sus jornadas. La consulta disponible no certifica vinculación ni horas pagables.',source_pending:'El archivo original llegó; falta incorporar y vincular las marcas para consultar jornadas. No se deduce una cantidad pendiente restando contadores.',incomplete:'Hay envíos con partes pendientes. Revisá el colector antes de considerar completa esa captura.',waiting:'El archivo no tiene recepciones en este corte. Comprobá la primera captura y el envío.',configuration:'Completá la configuración del canal de archivo. No significa que el equipo físico esté apagado.',unavailable:'No se pudo verificar el archivo. Los datos de recepción operativa permanecen separados; el desconocido no se muestra como cero.',restricted:'Equipo o conector suspendido/retirado. La consulta del histórico no autoriza reanudar su recepción.'};
  return {point:{siteKey:d.siteKey,label:d.label,model:d.model},device:d,archive:a,state:key,label:WORKSPACE_STATES[key],guidance:guidance[key],receptionStatus:clockFleetStatus(d,v.reception.checkedAt)};
 });
 const registered=new Set(rows.map(r=>r.point.siteKey.toLowerCase()));
 for(const p of v.reportedPark?.points??[]){if(!registered.has(p.siteKey))rows.push({point:p,device:null,archive:null,state:'registration',label:WORKSPACE_STATES.registration,guidance:'El punto está informado en el inventario municipal. Falta verificar su conexión privada, protocolo y serie e inscribir el equipo. Sus marcas, fechas y cantidades todavía no están verificadas en este circuito.',receptionStatus:null});}
 return rows.filter(r=>(state==='all'||r.state===state)&&words.every(w=>normalized([r.point.siteKey,r.point.label,r.point.model].join(' ')).includes(w))).sort((a,b)=>a.point.siteKey.localeCompare(b.point.siteKey,undefined,{numeric:true})||(a.device?.deviceId??'').localeCompare(b.device?.deviceId??''));
}
export function workspaceSummary(v){
 const rows=workspaceRows(v),states=Object.fromEntries(Object.keys(WORKSPACE_STATES).map(k=>[k,0]));for(const r of rows)states[r.state]++;
 return {points:new Set(rows.map(r=>r.point.siteKey.toLowerCase())).size,devices:v.reception.devices.length,unregistered:rows.filter(r=>!r.device).length,archiveReceived:v.archive?rows.filter(r=>r.archive?.recordsPersisted>0).length:null,consultable:rows.filter(r=>r.device?.canConsult).length,awaitingIncorporation:v.archive?rows.filter(r=>r.device&&!r.device.canConsult&&r.archive?.recordsPersisted>0).length:null,states};
}
export function workspaceCsv(v,options={}){
 const rows=workspaceRows(v,options),header=['Punto','Lugar','Modelo','Etapa a revisar','Consulta operativa UTC','Consulta archivo UTC','Registros guardados en archivo','Envíos completos en archivo','Envíos pendientes en archivo','Marcaciones nuevas incorporadas','Observaciones operativas','Reenvíos duplicados','Puede consultar marcaciones','Último acuse operativo UTC','Último acuse de archivo UTC','Alcance'];
 return '\ufeff'+[header,...rows.map(r=>[r.point.siteKey.toUpperCase(),r.point.label,r.point.model??'No informado',r.label,v.reception.checkedAt,v.archive?.sourceCheckedAt??'Sin verificar',r.archive?.recordsPersisted??'No verificado',r.archive?.completedBatches??'No verificado',r.archive?.pendingBatches??'No verificado',r.device?.newCanonical??'No verificado',r.device?.observations??'No verificado',r.device?.duplicates??'No verificado',r.device?(r.device.canConsult?'Sí':'No'):'Sin verificar',r.device?.lastReceivedAt??'',r.archive?.lastReceivedAt??'', r.device?'Dos etapas distintas; no sumar/restar registros de archivo y marcas. Sin nombres de agentes, cálculo salarial o prueba de conexión permanente.':'Inventario informado; equipo sin inscripción verificada. Sin cantidades, cálculo salarial o prueba de conexión permanente.'])].map(r=>r.map(csvCell).join(';')).join('\r\n')+'\r\n';
}
