// SPDX-License-Identifier: GPL-2.0-only
// Small, source-only Windows kit. Never reads installed configs, tokens or queues.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {zipSync,unzipSync} from 'fflate';
import {buildRelease} from './build-municipal-clock-release.mjs';
import {verifyRelease} from './verify-municipal-clock-release.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const DOCS='docs/clock-windows11-kit';
const DOC_NAMES=['GUIA-WINDOWS11.md','LICENCIA-Y-DISTRIBUCION.md','DATOS-DE-LA-INSTALACION.md','diagnostico-windows11.ps1'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const encode=object=>Buffer.from(JSON.stringify(object,null,2)+'\n');
const escape=text=>text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const inline=text=>escape(text).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,'<code>$1</code>');
export function guideHtml(markdown,{installer=false}={}){
 if(typeof installer!=='boolean')throw Error('KIT_GUIDE_VARIANT_INVALID');
 const title=installer?'MuniControl · Asistente de dispositivos':'MuniControl · Instalar relojes en Windows 11';
 const notice=installer?'<strong>MuniControl · Asistente de dispositivos.</strong> Incluye Node.js oficial. La configuración y los accesos de tu institución se preparan por separado.':'<strong>Empezá por esta guía.</strong> Kit de instalación, desactivado por defecto. No incluye claves, datos de fichadas ni Node.js. No instalar un segundo lector mientras el origen siga activo.';
 const blocks=[];let code=null,table=false;
 const closeTable=()=>{if(table){blocks.push('</tbody></table></div>');table=false;}};
 for(const line of markdown.split(/\r?\n/)){
  if(line.startsWith('```')){closeTable();if(code!==null){blocks.push('<pre><code>'+escape(code.join('\n'))+'</code></pre>');code=null;}else code=[];continue;}
  if(code!==null){code.push(line);continue;}
  if(line.startsWith('|')){
   if(/^\|[\s:|-]+\|$/.test(line))continue;
   const cells=line.slice(1,-1).split('|').map(cell=>inline(cell.trim()));
   if(!table){blocks.push('<div class="table"><table><thead><tr>'+cells.map(c=>'<th>'+c+'</th>').join('')+'</tr></thead><tbody>');table=true;}
   else blocks.push('<tr>'+cells.map(c=>'<td>'+c+'</td>').join('')+'</tr>');continue;
  }
  closeTable();if(!line.trim())continue;
  const heading=/^(#{1,3}) (.+)$/.exec(line);if(heading){blocks.push('<h'+heading[1].length+'>'+inline(heading[2])+'</h'+heading[1].length+'>');continue;}
  blocks.push('<p'+(line.startsWith('- ')?' class="item"':'')+'>'+inline(line.startsWith('- ')?'• '+line.slice(2):line)+'</p>');
 }
 closeTable();if(code!==null)throw Error('KIT_GUIDE_CODE_UNCLOSED');
 return '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+title+'</title><style>body{font:17px/1.6 system-ui,sans-serif;color:#19323d;background:#f4f7f6;margin:0}main{max-width:1000px;margin:30px auto;padding:32px;background:white;border-top:8px solid #087c73;border-radius:10px}h1,h2{line-height:1.2}h2{margin-top:2em;color:#086e66}pre{background:#102c36;color:#eefbf6;padding:18px;overflow:auto;border-radius:6px}code{font-size:.87em;overflow-wrap:anywhere}p.item{padding-left:16px}td,th{text-align:left;border:1px solid #d5e1dd;padding:10px;vertical-align:top}.table{overflow:auto}table{border-collapse:collapse;width:100%}a{color:#086e66}.notice{padding:18px;background:#e9f5f2;border-left:4px solid #087c73}@media(max-width:600px){main{margin:0;padding:18px}body{font-size:16px}}@media print{body{background:white}main{margin:0;padding:0;border:0}pre{white-space:pre-wrap;background:#eee;color:black}}</style><main><p class="notice">'+notice+'</p><nav><a href="LICENCIA-Y-DISTRIBUCION.md">Licencia y distribución</a> · <a href="DATOS-DE-LA-INSTALACION.md">Hoja de preparación</a></nav>'+blocks.join('\n')+'</main></html>';
}
export function templates(){
 const base='C:\\ProgramData\\MuniControl\\ClockGateway',state=base+'\\state\\fleet';
 const clocks=Array.from({length:5},(_,i)=>({clockId:'equipo-'+String(i+1).padStart(2,'0'),label:'REEMPLAZAR_UBICACION_'+(i+1),host:'REEMPLAZAR_IP_'+(i+1),port:4370,serial:'REEMPLAZAR_SERIE_'+(i+1),credentialFile:base+'\\secrets\\equipo-'+String(i+1).padStart(2,'0')+'.commkey',pollSeconds:900,enabled:false}));
 return {
  'modelos/gateway.example.json':{schema:'municipal-clock-gateway.v1',approved:false,approvedHost:'REEMPLAZAR_NOMBRE_HOST',stateDir:base+'\\state\\coordinator',workers:[{kind:'fleet-capture',configFile:base+'\\config\\fleet-capture.json',enabled:false},{kind:'fleet-source-delivery',configFile:base+'\\config\\source-delivery.json',enabled:false}]},
  'modelos/fleet-capture.example.json':{schema:'municontrol-clock-fleet.v1',approved:false,stateDir:state,maxQueueMiB:256,minFreeMiB:1024,clocks},
  'modelos/source-delivery.example.json':{schema:'clock-fleet-source-config.v1',approved:false,enabled:false,stateDir:state,tenantId:'REEMPLAZAR_UUID_TENANT',windowSeconds:900,clocks:clocks.map(c=>({clockId:c.clockId,serial:c.serial,tokenFile:base+'\\secrets\\'+c.clockId+'.token',connectorKey:'REEMPLAZAR_CONECTOR_'+c.clockId,enabled:false}))}
 };
}
export async function buildWindowsKit(output){
 const destination=path.resolve(output);
 const release=await buildRelease(destination);
 if(release.sourceDirty)throw Error('KIT_SOURCE_NOT_CLEAN');
 const archiveEntries={},files=[];
 const put=async(name,bytes)=>{
  if(!/^[a-zA-Z0-9_./-]+$/.test(name)||name.split('/').includes('..'))throw Error('KIT_FILE_UNSAFE');
  await fs.mkdir(path.dirname(path.join(destination,name)),{recursive:true});
  await fs.writeFile(path.join(destination,name),bytes,{flag:'wx'});
 };
 for(const name of DOC_NAMES)await put(name,await fs.readFile(path.join(ROOT,DOCS,name)));
 await put('LEEME-PRIMERO.html',Buffer.from(guideHtml(await fs.readFile(path.join(ROOT,DOCS,'GUIA-WINDOWS11.md'),'utf8'))));
 for(const[name,value]of Object.entries(templates()))await put(name,encode(value));
 const releaseManifest=JSON.parse(await fs.readFile(path.join(destination,'release-manifest.json'),'utf8'));
 const names=[...releaseManifest.files.map(f=>f.path),'release-manifest.json',...DOC_NAMES,'LEEME-PRIMERO.html',...Object.keys(templates())].sort();
 for(const name of names){const bytes=await fs.readFile(path.join(destination,name));if(bytes.length>2*1024*1024)throw Error('KIT_FILE_TOO_LARGE');archiveEntries[name]=bytes;files.push({path:name,bytes:bytes.length,sha256:hash(bytes)});}
 const kitDirty=!!execFileSync('git',['status','--porcelain','--',DOCS,'scripts/build-clock-windows11-kit.mjs'],{cwd:ROOT,encoding:'utf8',windowsHide:true}).trim();
 const manifest={schema:'municipal-clock-windows11-kit.v1',sourceCommit:release.sourceCommit,sourceCodeClean:true,documentationStatus:kitDirty?'prepared_local_not_committed':'committed',runtimeIncluded:false,credentialsIncluded:false,municipalRecordsIncluded:false,containsDeploymentConstants:true,customerNeutral:false,requiresPrivateEnrollment:true,activationDefault:'disabled',files};
 const manifestBytes=encode(manifest);await put('KIT-MANIFEST.json',manifestBytes);archiveEntries['KIT-MANIFEST.json']=manifestBytes;
 const prefix=path.basename(destination)+'/';const zip=zipSync(Object.fromEntries(Object.entries(archiveEntries).map(([name,bytes])=>[prefix+name,bytes])),{level:9});
 // Read the actual archive back in memory. No second runtime or large staging copy.
 const readback=unzipSync(zip);if(Object.keys(readback).length!==Object.keys(archiveEntries).length)throw Error('KIT_ZIP_ENTRIES_MISMATCH');
 for(const[name,bytes]of Object.entries(archiveEntries))if(!Buffer.from(readback[prefix+name]??[]).equals(bytes))throw Error('KIT_ZIP_CONTENT_MISMATCH');
 await verifyRelease(destination);
 const archive=destination+'.zip';await fs.writeFile(archive,zip,{flag:'wx'});
 await fs.writeFile(archive+'.sha256',hash(zip)+'  '+path.basename(archive)+'\n',{flag:'wx'});
 const result={ok:true,archive,archiveBytes:zip.length,sha256:hash(zip),files:Object.keys(archiveEntries).length,uncompressedBytes:Object.values(archiveEntries).reduce((n,b)=>n+b.length,0),sourceCommit:release.sourceCommit,releaseFiles:release.files,zipReadbackVerified:true,runtimeIncluded:false,credentialsIncluded:false,municipalRecordsIncluded:false,containsDeploymentConstants:true,installed:false,networkRequests:0,serviceChanges:0};
 await fs.writeFile(destination+'.verification.json',encode(result),{flag:'wx'});return result;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 try{if(process.argv.length!==4||process.argv[2]!=='--output')throw Error('KIT_USAGE_OUTPUT_DIRECTORY');console.log(JSON.stringify(await buildWindowsKit(process.argv[3])));}
 catch(error){console.error(/^(KIT_|RELEASE_)/.test(error.message)?error.message:'KIT_BUILD_FAILED');process.exitCode=2;}
}
