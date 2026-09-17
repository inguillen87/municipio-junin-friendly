import {csvCell} from './clock-dashboard-model.js';
import {attendancePointCode} from './attendance-point-label.js';
// Fleet reception is a server receipt view, not a device heartbeat or payable attendance.
export const FLEET_MAX_DEVICES=200;
export const FLEET_RECENT_MS=30*60*1000;
const fleetExact=(value,keys)=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
const fleetTime=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const fleetFail=()=>{throw new Error('CLOCK_FLEET_CONTRACT_INVALID');};
export function assertClockFleet(value){
 if(!fleetExact(value,['version','checkedAt','devices','liveConnectionVerified','payrollModified'])||value.version!=='clock-fleet.v1'||!fleetTime(value.checkedAt)||value.liveConnectionVerified!==false||value.payrollModified!==false||!Array.isArray(value.devices)||value.devices.length>FLEET_MAX_DEVICES)fleetFail();
 const seen=new Set(),keys=['siteKey','label','deviceId','model','deviceState','connectorState','enrolled','lastReceivedAt','lastCapturedAt','receipts','recordsConfirmed','newCanonical','observations','duplicates','canConsult'];
 let total=0;
 for(const d of value.devices){
  if(!fleetExact(d,keys)||typeof d.siteKey!=='string'||!/^[a-z0-9][a-z0-9._-]{1,95}$/.test(d.siteKey)||typeof d.label!=='string'||d.label.trim().length<1||d.label.length>180||/[\x00-\x1f\x7f]/.test(d.label)||typeof d.deviceId!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(d.deviceId)||seen.has(d.deviceId)||d.model!==null&&(typeof d.model!=='string'||d.model.length>120||/[\x00-\x1f\x7f]/.test(d.model))||!['draft','active','offline','suspended','retired'].includes(d.deviceState)||!['active','suspended','retired','not_configured'].includes(d.connectorState)||typeof d.enrolled!=='boolean'||typeof d.canConsult!=='boolean')fleetFail();
  if(!['receipts','recordsConfirmed','newCanonical','observations','duplicates'].every(k=>Number.isSafeInteger(d[k])&&d[k]>=0)||!Number.isSafeInteger(d.newCanonical+d.observations+d.duplicates)||d.recordsConfirmed!==d.newCanonical+d.observations+d.duplicates||d.receipts>d.recordsConfirmed)fleetFail();
  if(!['lastReceivedAt','lastCapturedAt'].every(k=>d[k]===null||fleetTime(d[k]))||d.receipts===0&&(d.recordsConfirmed!==0||d.lastReceivedAt!==null||d.lastCapturedAt!==null)||d.receipts>0&&(d.lastReceivedAt===null||d.lastCapturedAt===null||!d.canConsult))fleetFail();
  if(d.lastReceivedAt!==null&&Date.parse(d.lastReceivedAt)>Date.parse(value.checkedAt)+300000)fleetFail();
  seen.add(d.deviceId);total+=d.recordsConfirmed;if(!Number.isSafeInteger(total))fleetFail();
 }
 return value;
}
export function clockFleetStatus(d,asOf){
 if(!fleetTime(asOf))fleetFail();
 if(['retired','suspended'].includes(d.deviceState)||['retired','suspended'].includes(d.connectorState))return {key:'restricted',label:'Recepción suspendida o retirada',tone:'attention',next:'Revisar el estado administrativo del equipo y su conector antes de reanudar.'};
 if(!d.enrolled||d.connectorState==='not_configured'||d.deviceState==='draft')return {key:'configuration',label:'Configuración pendiente',tone:'attention',next:'Completar identidad, punto y conector. Un equipo leído localmente aún puede no estar inscripto en el servidor.'};
 if(d.receipts===0)return {key:'waiting',label:'Sin acuses recibidos',tone:'attention',next:'Comprobar el envío del colector y una primera recepción. No se infieren ausencias.'};
 const age=Math.max(0,Date.parse(asOf)-Date.parse(d.lastReceivedAt));
 if(age>FLEET_RECENT_MS)return {key:'previous',label:'Última recepción anterior',tone:'attention',next:'El último acuse supera 30 minutos en este corte. Revisar captura, cola y envío; no demuestra que el reloj esté apagado.'};
 return {key:'recent',label:'Recepción reciente',tone:'confirmed',next:'Hay un acuse en los últimos 30 minutos de esta consulta. No acredita conexión permanente ni cobertura completa del mes.'};
}
export function clockFleetRows(data,{search='',filter='all'}={}){
 assertClockFleet(data);if(!['all','attention','received'].includes(filter)||typeof search!=='string'||search.length>120)fleetFail();
 const normal=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-AR'),words=normal(search).trim().split(/\s+/).filter(Boolean);
 return data.devices.filter(d=>words.every(w=>normal([d.siteKey,d.label,d.model].join(' ')).includes(w))&&(filter==='all'||filter==='received'&&d.receipts>0||filter==='attention'&&clockFleetStatus(d,data.checkedAt).tone==='attention'));
}
export function clockFleetSummary(data){assertClockFleet(data);return {registered:data.devices.length,withReceipts:data.devices.filter(d=>d.receipts>0).length,attention:data.devices.filter(d=>clockFleetStatus(d,data.checkedAt).tone==='attention').length,records:data.devices.reduce((n,d)=>n+d.recordsConfirmed,0)};}
export function clockFleetCsv(data,options={}){
 const rows=clockFleetRows(data,options),header=['Punto','Lugar','Modelo','Estado de recepción en el corte','Consulta UTC','Último acuse UTC','Captura declarada UTC','Partes confirmadas','Registros con acuse','Eventos incorporados','Observaciones','Duplicados','Alcance'];
 return '\ufeff'+[header,...rows.map(d=>[attendancePointCode(d.siteKey),d.label,d.model??'No informado',clockFleetStatus(d,data.checkedAt).label,data.checkedAt,d.lastReceivedAt??'',d.lastCapturedAt??'',d.receipts,d.recordsConfirmed,d.newCanonical,d.observations,d.duplicates,'Control de recepción por equipo; no personas, horas, cobertura ni cálculo salarial'])].map(r=>r.map(csvCell).join(';')).join('\r\n')+'\r\n';
}
export function clockFleetSites(data){
 assertClockFleet(data);const sites=new Map();
 for(const d of data.devices){let s=sites.get(d.siteKey);if(!s){s={key:d.siteKey,devices:0,receipts:0,records:0,lastReceivedAt:null};sites.set(d.siteKey,s);}s.devices++;s.receipts+=d.receipts;s.records+=d.recordsConfirmed;if(!s.lastReceivedAt||d.lastReceivedAt&&Date.parse(d.lastReceivedAt)>Date.parse(s.lastReceivedAt))s.lastReceivedAt=d.lastReceivedAt;}
 return [...sites.values()].sort((a,b)=>a.key.localeCompare(b.key));
}
