// SPDX-License-Identifier: GPL-2.0-only
// Read-only readiness check. It does not allocate an IP, install, or contact the clock.
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {readMunicipalRoute} from './route-guard.mjs';
import {VERSION,safeCode} from './config.mjs';
export async function checkHost({routeCheck=readMunicipalRoute,nodeVersion=process.versions.node}={}){
 const result={schema:'pm10-host-preflight.v1',version:VERSION,checkedAt:new Date().toISOString(),nodeSupported:Number(nodeVersion.split('.')[0])>=22,routePresent:false,route:null,error:null,clockContacted:false,credentialsRead:false,networkChanged:false,installationPerformed:false,cloudConnected:false};
 try{result.route=await routeCheck();result.routePresent=true;}catch(e){result.error=safeCode(e);}
 result.localPrerequisitesReady=result.nodeSupported&&result.routePresent;
 result.operatorChecks=['Host municipal permanente asignado','Sin otro colector simultáneo','Protección de disco y cola local','Ruta y restricción de salida validadas por Cómputos','Cuenta de instalación y CommKey ya validada'];
 return result;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 const r=await checkHost();console.log(JSON.stringify(r,null,2));process.exitCode=r.localPrerequisitesReady?0:2;
}
