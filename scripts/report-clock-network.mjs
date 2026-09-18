import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {assessClockNetwork} from './lib/clock-network-diagnostic.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cell=s=>String(s).replaceAll('|','\\|').replaceAll('`','');
const labels={tcpReachable:'Respondió TCP 4370 por VPN; protocolo/acuse no probado',vpnNoTcpResponse:'Ruta VPN presente; conexión TCP no establecida',outsideVpn:'Fuera del túnel esperado; no se probó el puerto',missingAddress:'Dirección no informada'};
export function renderNetworkRequest(evidence,report){return [
 '# MuniControl · Solicitud de conectividad para Cómputos','',
 'Corte observado: '+report.observedOn+' · '+evidence.timezone+'. Evidencia del cliente, no auditoría de routers remotos.',
 'La VPN asignó '+evidence.sourceAddress+'; rutas municipales observadas: '+evidence.routes.join(', ')+'.',
 'No se cambiaron rutas, no se abrieron puertos y no se enviaron comandos a los relojes. Cada prueba TCP tuvo un límite de '+evidence.probeLimitMs+' ms.','',
 '| Punto | IP informada | Ruta elegida | Resultado |','|---|---|---|---|',
 ...report.rows.map(r=>'| '+cell(r.code+' · '+r.name)+' | '+(r.ip||'Pendiente')+' | '+(r.route||'—')+' | '+labels[r.result]+' |'),'',
 '## Solicitud','',
 'Necesitamos habilitar conectividad privada entre el colector de MuniControl y las sedes que no tienen ruta VPN. No solicitamos publicar los relojes en Internet ni habilitar una DMZ.',
 'Para cada sede: confirmar PM/nombre, IP y máscara reales, gateway, VLAN, modelo/serie, protocolo y puerto configurado, responsable local y estado del enlace. Los números del programa del proveedor no son los códigos PM.',
 'Configurar enrutamiento en el servidor VPN y en los routers intermedios, permisos mínimos del colector al equipo y ruta de retorno al pool VPN. La máscara del pool y las redes remotas deben confirmarlas ustedes; esta captura no las deduce.',
 'Si se empieza por rutas de host, estos son los destinos fuera de VPN: '+report.rows.filter(r=>r.result==='outsideVpn').map(r=>r.code+' '+r.ip+'/32').join('; ')+'.',
 'Separadamente, revisar reloj/energía/IP/gateway/firewall y si el protocolo es TCP o UDP en: '+report.rows.filter(r=>r.result==='vpnNoTcpResponse').map(r=>r.code+' '+r.ip).join('; ')+'. Un timeout TCP no acredita equipo apagado.',
 'Para sedes sin enlace municipal, evaluar VPN sitio a sitio o colector local con cola y salida HTTPS autenticada. Informar si el acceso WAN está bajo CGNAT; no hace falta una IP pública para el reloj.',
 'Validación de entrega: ruta del cliente por el túnel, conexión al protocolo requerido, identidad/serie correcta y primer acuse de recepción MuniControl. Un puerto TCP abierto no acredita captura ni liquidación.','',
 '## Direccionamiento a revisar','',
 'Las siguientes direcciones no son privadas RFC1918: '+report.rows.filter(r=>r.ip&&r.privateAddress===false).map(r=>r.code+' '+r.ip).join('; ')+'. Confirmar si son rangos asignados o si se reutilizan internamente; no renumerar sin coordinación.',
 'No se propuso una máscara de LAN ni una ruta amplia para esos rangos.','',
 'Referencias técnicas: RFC1918; Microsoft VPN routing decisions; OpenVPN Setting Up Routing; RFC6598.',
 ].join('\n');}
export async function main(argv=process.argv.slice(2)){
 if(argv.length!==4||argv[0]!=='--evidence'||argv[2]!=='--out'||!path.isAbsolute(argv[1])||!path.isAbsolute(argv[3])||path.extname(argv[3])!=='.md')throw Error('CLOCK_NETWORK_ARGUMENTS');
 const source=await fs.lstat(argv[1]),parent=await fs.realpath(path.dirname(argv[3]));
 if(!source.isFile()||source.isSymbolicLink()||source.size>65536||parent===root||parent.startsWith(root+path.sep))throw Error('CLOCK_NETWORK_PRIVATE_FILES_REQUIRED');
 const data=await fs.readFile(argv[1]);if(data.length>65536)throw Error('CLOCK_NETWORK_INPUT_TOO_LARGE');const evidence=JSON.parse(data.toString('utf8')),report=assessClockNetwork(evidence);
 const text=renderNetworkRequest(evidence,report)+'\n\nHuella de la evidencia: '+createHash('sha256').update(data).digest('hex')+'\n';
 await fs.writeFile(argv[3],text,{flag:'wx',mode:0o600});
 console.log(JSON.stringify({ok:true,observedOn:report.observedOn,counts:report.counts,networkConnections:0,routeChanges:0,output:'private_markdown_created'}));return report;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)main().catch(()=>{console.error('Network report stopped. No routes, clocks, or files were overwritten.');process.exitCode=1;});
