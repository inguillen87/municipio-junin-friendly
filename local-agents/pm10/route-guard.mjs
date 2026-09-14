// SPDX-License-Identifier: GPL-2.0-only
// Local FIB lookup only: no ping, ARP probe, port scan, address assignment or socket.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {access} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fault} from './config.mjs';
import {TARGET} from './reader/lector-fichadas.mjs';
const execute=promisify(execFile);
export const MUNICIPAL_PREFIX='172.100.96.0/19';
export const ROUTE_ERRORS=new Set(['MUNICIPAL_ROUTE_REQUIRED','ROUTE_LOOKUP_UNAVAILABLE','ROUTE_OUTPUT_INVALID','ROUTE_PLATFORM_UNSUPPORTED']);
function ipv4(value){
 if(typeof value!=='string'||!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value))throw fault('ROUTE_OUTPUT_INVALID');
 const a=value.split('.');
 if(a.some(n=>Number(n)>255||(n.length>1&&n[0]==='0')))throw fault('ROUTE_OUTPUT_INVALID');
 return a.reduce((v,n)=>v*256+Number(n),0)>>>0;
}
export function requireMunicipalPrefix(prefix){
 if(prefix==='default'||prefix==='0.0.0.0/0')throw fault('MUNICIPAL_ROUTE_REQUIRED');
 if(typeof prefix!=='string')throw fault('ROUTE_OUTPUT_INVALID');
 const bits=prefix.split('/');
 if(bits.length>2||bits.length===2&&!/^(?:[0-9]|[12][0-9]|3[0-2])$/.test(bits[1]))throw fault('ROUTE_OUTPUT_INVALID');
 const n=bits.length===1?32:Number(bits[1]),ip=ipv4(bits[0]);
 if(n<19)throw fault('MUNICIPAL_ROUTE_REQUIRED');
 const mask=(0xffffffff<<(32-n))>>>0;
 if((ip&mask)!==(ipv4(TARGET)&mask))throw fault('MUNICIPAL_ROUTE_REQUIRED');
 return `${bits[0]}/${n}`;
}
function json(text){
 if(typeof text!=='string'||text.length>32768)throw fault('ROUTE_OUTPUT_INVALID');
 try{return JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw fault('ROUTE_OUTPUT_INVALID');}
}
export function parseLinuxRoute(text){
 const all=json(text);
 if(!Array.isArray(all)||all.length!==1||!all[0]||typeof all[0]!=='object')throw fault('ROUTE_OUTPUT_INVALID');
 const r=all[0],prefix=requireMunicipalPrefix(r.dst);
 if((r.type!==undefined&&r.type!=='unicast')||r.nexthops||r.nhid||r.encap||r.dev==='lo'||typeof r.dev!=='string'||!r.dev.length||r.dev.length>80||/[\x00-\x1f]/.test(r.dev)||r.flags?.includes('linkdown'))throw fault('MUNICIPAL_ROUTE_REQUIRED');
 return {prefix,interface:r.dev,localLookup:true};
}
export const WINDOWS_ROUTE_COMMAND=[
 "$ErrorActionPreference='Stop'",
 '[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)',
 `$found=@(Find-NetRoute -RemoteIPAddress '${TARGET}' -ErrorAction Stop)`,
 "$routes=@($found | Where-Object { $_.CimClass.CimClassName -eq 'MSFT_NetRoute' })",
 'if($routes.Count -ne 1){throw "ROUTE_NOT_UNIQUE"}',
 '$r=$routes[0]',
 "$interfaces=@(Get-NetIPInterface -InterfaceIndex $r.InterfaceIndex -AddressFamily IPv4 -ErrorAction Stop)",
 'if($interfaces.Count -ne 1){throw "INTERFACE_NOT_UNIQUE"}',
 '$i=$interfaces[0]',
 '@{prefix=[string]$r.DestinationPrefix;interface=[string]$r.InterfaceAlias;interfaceIndex=[int]$r.InterfaceIndex;connected=([string]$i.ConnectionState -eq "Connected")} | ConvertTo-Json -Compress'
].join(';');
export function parseWindowsRoute(text){
 const r=json(text);
 if(!r||typeof r!=='object'||Array.isArray(r))throw fault('ROUTE_OUTPUT_INVALID');
 const prefix=requireMunicipalPrefix(r.prefix);
 if(r.connected!==true||!Number.isSafeInteger(r.interfaceIndex)||r.interfaceIndex<1||typeof r.interface!=='string'||!r.interface.length||r.interface.length>200||/[\x00-\x1f]/.test(r.interface))throw fault('MUNICIPAL_ROUTE_REQUIRED');
 return {prefix,interface:r.interface,localLookup:true};
}
export async function readMunicipalRoute({platform=process.platform,run=execute,canAccess=access,systemRoot=process.env.SystemRoot}={}){
 try{
  const options={encoding:'utf8',timeout:5000,maxBuffer:32768,windowsHide:true,shell:false};
  if(platform==='linux'){
   let binary;
   for(const p of ['/usr/sbin/ip','/usr/bin/ip','/sbin/ip','/bin/ip']){try{await canAccess(p,constants.X_OK);binary=p;break;}catch{}}
   if(!binary)throw fault('ROUTE_LOOKUP_UNAVAILABLE');
   const {stdout}=await run(binary,['-j','-4','route','get',TARGET,'ipproto','tcp','dport','4370','fibmatch'],options);
   return parseLinuxRoute(stdout);
  }
  if(platform==='win32'){
   if(typeof systemRoot!=='string'||!path.win32.isAbsolute(systemRoot)||!/^[a-z]:[\\/]/i.test(systemRoot)||/[\x00-\x1f]/.test(systemRoot))throw fault('ROUTE_LOOKUP_UNAVAILABLE');
   const binary=path.win32.join(systemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
   const {stdout}=await run(binary,['-NoLogo','-NoProfile','-NonInteractive','-Command',WINDOWS_ROUTE_COMMAND],options);
   return parseWindowsRoute(stdout);
  }
  throw fault('ROUTE_PLATFORM_UNSUPPORTED');
 }catch(e){if(ROUTE_ERRORS.has(e?.code))throw e;throw fault('ROUTE_LOOKUP_UNAVAILABLE');}
}
