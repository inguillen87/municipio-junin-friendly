// SPDX-License-Identifier: GPL-2.0-only
// Read-only readiness check. It does not allocate an IP, install, or contact the clock.
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {readMunicipalRoute} from './route-guard.mjs';
import {VERSION,safeCode} from './config.mjs';
import {inspectHostReadiness} from './host-readiness.mjs';
export async function checkHost({routeCheck=readMunicipalRoute,nodeVersion=process.versions.node,hostInspector=inspectHostReadiness}={}){
 const result={schema:'pm10-host-preflight.v1',version:VERSION,checkedAt:new Date().toISOString(),nodeSupported:Number(nodeVersion.split('.')[0])>=22,routePresent:false,route:null,error:null,clockContacted:false,credentialsRead:false,networkChanged:false,installationPerformed:false,cloudConnected:false};
 try{result.route=await routeCheck();result.routePresent=true;}catch(e){result.error=safeCode(e);}
 result.localPrerequisitesReady=result.nodeSupported&&result.routePresent;
 // Keep this legacy field and the CLI exit status limited to Node + route.
 result.exitCodeScope='route_node_only';result.nodeAndRouteAvailable=result.localPrerequisitesReady;
 result.installationReady=false;result.installationReadiness='not_established';result.autonomyVerified=false;
 result.hostAssignment='not_evidenced';result.host=null;
 try{result.host=await hostInspector({nodeVersion});}catch{result.hostInspectionError='HOST_METADATA_UNAVAILABLE';}
 result.operatorChecks=['La ruta y Node disponibles no acreditan un host municipal permanente',
  'Falta contrastar el equipo con una asignación municipal y su disponibilidad continua',
  'Verificar Node, permisos, red y almacenamiento desde la cuenta del servicio',
  'La exclusividad entre equipos y la protección/copia de la cola no se comprueban aquí',
  'No se leen claves ni se prueba el reloj; la autonomía requiere reinicio, recuperación de enlace y acuse con la PC personal apagada'];
 return result;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 const r=await checkHost();console.log(JSON.stringify(r,null,2));process.exitCode=r.localPrerequisitesReady?0:2;
}
