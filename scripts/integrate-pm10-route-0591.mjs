// Apply only reviewed source changes on b21e3722-compatible files; no municipal execution.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
const root='local-agents/pm10';
function once(file,old,value){const p=path.join(root,file),s=fs.readFileSync(p,'utf8');if(s.includes(value))return;if(s.split(old).length!==2)throw Error('PM10_INTEGRATION_DRIFT '+file);fs.writeFileSync(p,s.replace(old,value));}
once('service.mjs',"import {CaptureStore,acquireLock,atomicJson,splitRaw} from './store.mjs';","import {CaptureStore,acquireLock,atomicJson,splitRaw} from './store.mjs';\nimport {readMunicipalRoute,ROUTE_ERRORS} from './route-guard.mjs';");
once('service.mjs','credentialReader=readCredential,now=()=>new Date(),signal','credentialReader=readCredential,routeCheck=readMunicipalRoute,now=()=>new Date(),signal');
once('service.mjs','  key=await credentialReader(config.credentialFile);',"  // Re-check the selected local route before reading the secret or opening a socket.\n  const route=await routeCheck();\n  if(!route||route.localLookup!==true)throw fault('ROUTE_OUTPUT_INVALID');\n  key=await credentialReader(config.credentialFile);");
once('service.mjs','  const code=safeCode(e);state.lastError=code;state.failureCount=Math.min(1000,state.failureCount+1);',`  const code=safeCode(e);
  if(ROUTE_ERRORS.has(code)){
   // Route lookup retries are local only, so do not consume clock/auth retry budget.
   return {...state,...store.summary(),status:'network_wait',lastError:code,blocked:false,
    nextPollAt:new Date(now().getTime()+config.pollSeconds*1000).toISOString(),
    cloudReception:'not_connected',cloudConfirmedRecords:0};
  }
  state.lastError=code;state.failureCount=Math.min(1000,state.failureCount+1);`);
once('service.mjs',"waiting:'Esperando la primera lectura',","waiting:'Esperando la primera lectura',network_wait:'Sin ruta municipal: no se consulta el reloj',");
once('service.mjs','<section class="card"><h2>Continuidad de la captura</h2>', '${s.status===\'network_wait\'?\'<div class="alert"><strong>Lectura pausada antes de conectar.</strong><p>No se confirmó una ruta específica hacia la red municipal. Se revisará nuevamente la tabla de rutas local; no se prueban claves ni se escanea la red. Si vuelve la ruta, se retoma la captura. Esto no sustituye la restricción de salida por interfaz que debe validar Cómputos.</p></div>\':\'\'}\n <section class="card"><h2>Continuidad de la captura</h2>');
once('tests/service.test.mjs','import {runCycle,initialState,','import {runCycle as guardedRunCycle,initialState,');
once('tests/service.test.mjs',"const fixedNow=()=>new Date('2026-09-13T09:00:00.000Z');", "const fixedNow=()=>new Date('2026-09-13T09:00:00.000Z');\n// Existing protocol tests inject a synthetic route; real-route refusal is tested separately.\nconst runCycle=(cfg,store,state,deps={})=>guardedRunCycle(cfg,store,state,{routeCheck:async()=>({prefix:'172.100.96.0/19',interface:'synthetic',localLookup:true}),...deps});");
once('config.mjs',"VERSION='0.1.0'","VERSION='0.1.1'");
once('package.json','"version": "0.1.0"','"version": "0.1.1"');
once('install/install-linux.sh','[ "$approval" = AUTORIZO ] || exit 1','[ "$approval" = AUTORIZO ] || exit 1\n# Local routing lookup only, before user/directory/service changes.\n/usr/bin/node "$source_dir/check-host.mjs" || { echo \'Sin ruta municipal específica. No se instaló ni se contactó el reloj.\' >&2; exit 1; }');
once('install/install-linux.sh','service.mjs store.mjs config.mjs package.json LICENSE','service.mjs store.mjs config.mjs route-guard.mjs check-host.mjs package.json LICENSE');
once('install/municontrol-pm10.service','AF_UNIX AF_INET','AF_UNIX AF_INET AF_NETLINK');
once('install/install-windows.ps1','New-Item -ItemType Directory -Path $Base,$App,$State,$Private -Force | Out-Null',"# Local routing lookup only: no clock connections and no changes before this check.\n& $NodePath (Join-Path $Source 'check-host.mjs')\nCheck-Exit 'ruta municipal local; instalacion cancelada antes de cambios'\nNew-Item -ItemType Directory -Path $Base,$App,$State,$Private -Force | Out-Null");
once('install/install-windows.ps1',"'config.mjs','package.json'","'config.mjs','route-guard.mjs','check-host.mjs','package.json'");
const readme=root+'/README.md',note='## Protección de ruta 059.1.1';
let s=fs.readFileSync(readme,'utf8');
if(!s.includes(note))fs.writeFileSync(readme,s+`\n${note}\n\nNo se elige una IP libre ni se cambia la del equipo o reloj. La opción preferida es un host municipal asignado, usando su dirección existente; una VM nueva obtiene dirección desde el DHCP/IPAM institucional. No basta que una IP no responda.\n\nLos instaladores comprueban la ruta local antes de crear cuentas, directorios y tareas. Cada captura vuelve a comprobarla antes de leer la CommKey y abrir una conexión. Se exige el prefijo municipal /19 o más específico; se rechaza salida por defecto, rutas amplias, inactivas o ambiguas. Si falta la ruta, el agente entra en network_wait y sólo repite el chequeo local; retoma al volver una ruta aceptada. No elimina un bloqueo anterior de autenticación. El panel mantiene separadas captura local y recepción en Neon.\n\nDiagnóstico sin conexión al reloj: node check-host.mjs. No lee claves ni asigna direcciones. Un resultado favorable no prueba disponibilidad física, exclusividad, capacidad del host ni autorización administrativa.\n\nEs un prechequeo, no un firewall: Cómputos debe validar la ruta y la restricción de salida por interfaz ante cambios durante una conexión ya iniciada. La unidad Linux permite AF_NETLINK para consultas locales, sin privilegios extra. No se instaló en la municipalidad ni se completó el receptor 059.2. Ver docs/SPRINT_059_1_1_RUTA_MUNICIPAL.md.\n`);
const files=fs.readdirSync(root,{recursive:true}).filter(f=>fs.statSync(path.join(root,f)).isFile()&&f!=='SHA256SUMS.json').sort();
const hashes=Object.fromEntries(files.map(f=>[f.replaceAll('\\','/'),crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')]));
fs.writeFileSync(root+'/SHA256SUMS.json',JSON.stringify(hashes,null,2)+'\n');
