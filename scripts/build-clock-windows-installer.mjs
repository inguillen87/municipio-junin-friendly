// SPDX-License-Identifier: GPL-2.0-only
// Offline, reproducible-input Windows builder. Never reads installed secrets or queues.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {zipSync,unzipSync} from 'fflate';
import {verifyRelease} from './verify-municipal-clock-release.mjs';
import {guideHtml,templates} from './build-clock-windows11-kit.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const CODE='local-agents/clock-fleet/windows-installer';
export const RELEASE_COMMIT='0b8d1a8d261b4c55556921cba1708305006e0e5e';
export const NODE_VERSION='24.21.0';
export const NODE_SHA256='ba4e6d110e8c1592a1ecd390f6b05f3da124b13871a5be62b341a07a853c6c32';
export const NODE_LICENSE_SHA256='5888dbb9a1d2b18f2c3e6c5f6af1b39de658372b402a0577b002777f14c62ace';
export const RELEASE_CONTENT_SHA256='337076ebe6ede21a285a1f5158c8dd962187ca9d100014bbda572710f8e33279';
const hash=b=>createHash('sha256').update(b).digest('hex');
const encode=v=>Buffer.from(JSON.stringify(v,null,2)+'\n');
export function safeEntry(name){
 return typeof name==='string'&&/^[a-zA-Z0-9_./-]+$/.test(name)&&!name.startsWith('/')&&name.split('/').every(p=>p&&!p.endsWith('.')&&p!=='.'&&p!=='..'&&!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p));
}
export function verifyEntries(entries,files){
 if(!Array.isArray(files)||!files.length||files.length>100)throw Error('INSTALLER_MANIFEST_INVALID');
 const found=new Set();
 for(const f of files){if(!safeEntry(f.path)||found.has(f.path.toLowerCase())||!Number.isSafeInteger(f.bytes)||f.bytes<0||!/^[a-f0-9]{64}$/.test(f.sha256))throw Error('INSTALLER_MANIFEST_INVALID');found.add(f.path.toLowerCase());const b=entries[f.path];if(!b||b.length!==f.bytes||hash(b)!==f.sha256)throw Error('INSTALLER_CONTENT_MISMATCH');}
 if(Object.keys(entries).length!==files.length)throw Error('INSTALLER_EXTRA_FILE');
}
function git(args){return execFileSync('git',args,{cwd:ROOT,encoding:'utf8',windowsHide:true}).trim();}
function pinnedSource(name){return execFileSync('git',['show',RELEASE_COMMIT+':'+name],{cwd:ROOT,windowsHide:true,maxBuffer:4*1024*1024});}
export function assertReleasePin(manifest){if(!manifest||Object.keys(manifest).sort().join()!==['schema','sourceCommit','sourceDirty','contentSha256','runtimeIncluded','credentialsIncluded','municipalRecordsIncluded','files'].sort().join()||manifest.schema!=='municipal-clock-release.v1'||manifest.runtimeIncluded!==false||manifest.credentialsIncluded!==false||manifest.municipalRecordsIncluded!==false||manifest.sourceCommit!==RELEASE_COMMIT||manifest.sourceDirty!==false||manifest.contentSha256!==RELEASE_CONTENT_SHA256||hash(JSON.stringify(manifest.files))!==RELEASE_CONTENT_SHA256)throw Error('INSTALLER_RELEASE_PIN_MISMATCH');}
async function read(file,max=150*1024*1024){const s=await fs.lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.size>max)throw Error('INSTALLER_SOURCE_UNSAFE');return fs.readFile(file);}
export async function buildInstaller({kit,runtime,runtimeLicense,output,allowDirtyForTest=false}){
 if(process.platform!=='win32'||process.arch!=='x64')throw Error('INSTALLER_WINDOWS_X64_REQUIRED');
 const out=path.resolve(output);if(!out.toLowerCase().endsWith('.exe'))throw Error('INSTALLER_EXE_REQUIRED');
 try{await fs.lstat(out);throw Error('INSTALLER_OUTPUT_EXISTS');}catch(e){if(e.code!=='ENOENT')throw e;}
 const installerCommit=git(['rev-parse','HEAD']);
 const dirty=!!git(['status','--porcelain','--',CODE,'docs/clock-windows-installer','scripts/build-clock-windows-installer.mjs']);
 if(dirty&&!allowDirtyForTest)throw Error('INSTALLER_SOURCE_NOT_CLEAN');
 if(allowDirtyForTest&&!out.endsWith('.test.exe'))throw Error('INSTALLER_TEST_NAME_REQUIRED');
 await verifyRelease(path.resolve(kit));
 const manifest=JSON.parse(await read(path.join(kit,'release-manifest.json')));
 assertReleasePin(manifest);
 const runtimeBytes=await read(runtime);if(hash(runtimeBytes)!==NODE_SHA256)throw Error('INSTALLER_NODE_HASH_MISMATCH');
 const runtimeResult=execFileSync(runtime,['--version'],{encoding:'utf8',windowsHide:true}).trim();
 if(runtimeResult!=='v'+NODE_VERSION)throw Error('INSTALLER_NODE_VERSION_MISMATCH');
 const signature=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop'; Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1') -ErrorAction Stop; $s=Get-AuthenticodeSignature -LiteralPath $env:MUNICONTROL_BUILD_RUNTIME; @{valid=($s.Status -eq 'Valid');publisher=$s.SignerCertificate.Subject}|ConvertTo-Json -Compress"],{encoding:'utf8',windowsHide:true,env:{...process.env,MUNICONTROL_BUILD_RUNTIME:path.resolve(runtime)}}));
 if(!signature.valid||!/(?:^|, )CN=OpenJS Foundation(?:,|$)/.test(signature.publisher))throw Error('INSTALLER_NODE_SIGNATURE_INVALID');
 const entries={};
 const add=(name,bytes)=>{if(!safeEntry(name)||Object.keys(entries).some(n=>n.toLowerCase()===name.toLowerCase()))throw Error('INSTALLER_PATH_INVALID');entries[name]=bytes;};
 for(const f of manifest.files){const b=await read(path.join(kit,f.path));const source=f.path==='verify-release.mjs'?'scripts/verify-municipal-clock-release.mjs':f.path.replace(/^app\//,'local-agents/');if(!b.equals(pinnedSource(source)))throw Error('INSTALLER_SOURCE_COMMIT_MISMATCH');add(f.path,b);}
 add('release-manifest.json',await read(path.join(kit,'release-manifest.json')));
 const nodeLicense=await read(runtimeLicense,2*1024*1024);if(hash(nodeLicense)!==NODE_LICENSE_SHA256)throw Error('INSTALLER_NODE_LICENSE_MISMATCH');
 add('runtime/node.exe',runtimeBytes);add('runtime/LICENSE',nodeLicense);
 if(!(await read(path.join(ROOT,'scripts/build-clock-windows11-kit.mjs'))).equals(pinnedSource('scripts/build-clock-windows11-kit.mjs')))throw Error('INSTALLER_TEMPLATE_SOURCE_CHANGED');
 for(const [name,value] of Object.entries(templates()))add(name,encode(value));
 const guide=await fs.readFile(path.join(ROOT,'docs/clock-windows-installer/README.md'),'utf8');
 add('README-INSTALADOR.md',Buffer.from(guide));
 add('LEEME-PRIMERO.html',Buffer.from(guideHtml(guide).replace('MuniControl · Instalar cinco relojes en Windows 11','MuniControl · Asistente de dispositivos').replace('<strong>Empezá por esta guía.</strong> Kit de instalación, desactivado por defecto. No incluye claves, datos de fichadas ni Node.js. No instalar un segundo lector mientras el origen siga activo.','<strong>MuniControl · Asistente de dispositivos.</strong> Incluye Node.js oficial. La configuración y los accesos de tu institución se preparan por separado.')));
 add('ADAPTADORES-Y-CRECIMIENTO.md',await read(path.join(ROOT,'docs/clock-windows-installer/ADAPTADORES-Y-CRECIMIENTO.md')));
 add('GUIA-TECNICA-WINDOWS11.md',pinnedSource('docs/clock-windows11-kit/GUIA-WINDOWS11.md'));
 add('LICENCIA-Y-DISTRIBUCION.md',pinnedSource('docs/clock-windows11-kit/LICENCIA-Y-DISTRIBUCION.md'));
 add('DATOS-DE-LA-INSTALACION.md',pinnedSource('docs/clock-windows11-kit/DATOS-DE-LA-INSTALACION.md'));
 add('device-adapters.json',await read(path.join(ROOT,CODE,'device-adapters.json')));
 const files=Object.entries(entries).sort(([a],[b])=>a.localeCompare(b)).map(([name,b])=>({path:name,bytes:b.length,sha256:hash(b)}));
 verifyEntries(entries,files);
 const metadata={schema:'municontrol-windows-installer.v1',productVersion:'1.0.0',releaseCommit:RELEASE_COMMIT,installerCommit,sourceDirty:dirty,nodeVersion:NODE_VERSION,credentialsIncluded:false,municipalRecordsIncluded:false,activationDefault:'stopped',architecture:'x64',files};
 const manifestBytes=encode(metadata);add('INSTALLER-MANIFEST.json',manifestBytes);
 const zipped=zipSync(entries,{level:9});const check=unzipSync(zipped);delete check['INSTALLER-MANIFEST.json'];verifyEntries(check,files);
 const stage=await fs.mkdtemp(path.join(os.tmpdir(),'municontrol-installer-build-'));
 await fs.writeFile(path.join(stage,'payload.zip'),zipped,{flag:'wx'});
 const strings={PayloadSha256:hash(zipped),ManifestSha256:hash(manifestBytes),ReleaseCommit:RELEASE_COMMIT,InstallerCommit:installerCommit,NodeSha256:NODE_SHA256,NodeVersion:NODE_VERSION,ProductVersion:'1.0.0'};
 const pins='namespace MuniControl.Setup { internal static class PackagePins {\n'+Object.entries(strings).map(([k,v])=>'internal const string '+k+' = "'+v+'";').join('\n')+'\ninternal const long PayloadBytes = '+zipped.length+'L;\ninternal const long ExpandedBytes = '+Object.values(entries).reduce((sum,b)=>sum+b.length,0)+'L;\n} }\n';
 await fs.writeFile(path.join(stage,'PackagePins.cs'),pins,{flag:'wx'});
 const png=await read(path.join(ROOT,'assets/pwa/icon-192.png'));
 const header=Buffer.alloc(22);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header[6]=192;header[7]=192;header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);
 await fs.writeFile(path.join(stage,'municontrol.ico'),Buffer.concat([header,png]),{flag:'wx'});
 await fs.mkdir(path.dirname(out),{recursive:true});
 const csc=path.join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
 const args=['/nologo','/target:winexe','/platform:x64','/optimize+','/utf8output','/out:'+out,'/win32manifest:'+path.join(ROOT,CODE,'MuniControlSetup.manifest'),'/win32icon:'+path.join(stage,'municontrol.ico'),'/resource:'+path.join(stage,'payload.zip')+',MuniControl.Payload.zip','/resource:'+path.join(ROOT,'assets/pwa/icon-192.png')+',MuniControl.Logo.png','/resource:'+path.join(ROOT,CODE,'device-adapters.json')+',MuniControl.DeviceAdapters.json',...['System.Windows.Forms','System.Drawing','System.Web.Extensions','System.IO.Compression','System.IO.Compression.FileSystem','System.Management'].map(n=>'/reference:'+n+'.dll'),path.join(ROOT,CODE,'MuniControlSetup.cs'),path.join(ROOT,CODE,'InstallerCore.cs'),path.join(stage,'PackagePins.cs')];
 const compile=execFileSync(csc,args,{encoding:'utf8',windowsHide:true,maxBuffer:2*1024*1024});
 // GPL source travels with every binary, including the actual release sources and build inputs.
 const sourceEntries={};
 for(const f of manifest.files){const source=f.path==='verify-release.mjs'?'scripts/verify-municipal-clock-release.mjs':f.path.replace(/^app\//,'local-agents/');sourceEntries[source]=pinnedSource(source);}
 const sourceNames=[CODE+'/MuniControlSetup.cs',CODE+'/InstallerCore.cs',CODE+'/MuniControlSetup.manifest',CODE+'/device-adapters.json','scripts/build-clock-windows-installer.mjs','scripts/build-clock-windows11-kit.mjs','scripts/build-municipal-clock-release.mjs','docs/clock-windows-installer/README.md','docs/clock-windows-installer/ADAPTADORES-Y-CRECIMIENTO.md','docs/clock-windows11-kit/GUIA-WINDOWS11.md','docs/clock-windows11-kit/LICENCIA-Y-DISTRIBUCION.md','docs/clock-windows11-kit/DATOS-DE-LA-INSTALACION.md','docs/clock-windows11-kit/diagnostico-windows11.ps1','assets/pwa/icon-192.png','package.json','package-lock.json', 'tests/clock-windows-installer-build.test.mjs','.github/workflows/clock-windows-installer.yml'];
 for(const source of sourceNames)sourceEntries[source]=await read(path.join(ROOT,source));
 sourceEntries['BUILD-PINS.json']=encode({schema:'municontrol-installer-source.v1',installerCommit,releaseCommit:RELEASE_COMMIT,nodeVersion:NODE_VERSION,nodeSha256:NODE_SHA256,nodeLicenseSha256:NODE_LICENSE_SHA256,sourceDirty:dirty,generatedPackagePins:pins});
 sourceEntries['build-assets/payload.zip']=zipped;sourceEntries['build-assets/PackagePins.cs']=Buffer.from(pins);sourceEntries['build-assets/municontrol.ico']=Buffer.concat([header,png]);
 const sourcePath=name=>'"%~dp0'+name.replaceAll('/','\\')+'"';
 const sourceArgs=['/nologo','/target:winexe','/platform:x64','/optimize+','/out:'+sourcePath('MuniControl-Recompilado.exe'),'/win32manifest:'+sourcePath(CODE+'/MuniControlSetup.manifest'),'/win32icon:'+sourcePath('build-assets/municontrol.ico'),'/resource:'+sourcePath('build-assets/payload.zip')+',MuniControl.Payload.zip','/resource:'+sourcePath('assets/pwa/icon-192.png')+',MuniControl.Logo.png','/resource:'+sourcePath(CODE+'/device-adapters.json')+',MuniControl.DeviceAdapters.json',...['System.Windows.Forms','System.Drawing','System.Web.Extensions','System.IO.Compression','System.IO.Compression.FileSystem','System.Management'].map(n=>'/reference:'+n+'.dll'),sourcePath(CODE+'/MuniControlSetup.cs'),sourcePath(CODE+'/InstallerCore.cs'),sourcePath('build-assets/PackagePins.cs')];
 sourceEntries['COMPILAR-FUENTES.cmd']=Buffer.from('@echo off\r\nsetlocal\r\nif exist "%~dp0MuniControl-Recompilado.exe" exit /b 2\r\n"%WINDIR%\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe" '+sourceArgs.join(' ')+'\r\nexit /b %ERRORLEVEL%\r\n');
 sourceEntries['README-COMPILAR.txt']=Buffer.from('MuniControl - fuentes correspondientes\nGPL-2.0-only para el lector e instalador. Conservar avisos de local-agents/pm10/LICENSE.\nPara recompilar esta entrega exacta: extraer este ZIP completo y ejecutar COMPILAR-FUENTES.cmd en Windows x64 con .NET Framework 4.8 (incluido en Windows 11). No necesita acceso a GitHub, npm ni una cuenta nuestra. Genera MuniControl-Recompilado.exe sin instalarlo.\nIncluye todos los fuentes C#, lector, verificadores, recursos y payload exacto. build-assets/PackagePins.cs vincula los recursos originales; al modificar el payload se debe reconstruir su manifiesto y pins, indicar la modificacion y validar antes de distribuir. Una compilacion modificada no es una version certificada por MuniControl.\nPara construir una nueva version desde Git, ver .github/workflows/clock-windows-installer.yml y scripts/build-clock-windows-installer.mjs; Node oficial y npm ci --ignore-scripts.\nRepositorio de origen: https://github.com/inguillen87/municipio-junin-friendly\nNo contiene fichadas ni credenciales. Runtime Node se obtiene de nodejs.org y su licencia se incluye en payload.zip bajo runtime/LICENSE.\n');
 const sourceZip=zipSync(sourceEntries,{level:9}),sourceArchive=out.replace(/\.exe$/i,'-fuentes.zip');await fs.writeFile(sourceArchive,sourceZip,{flag:'wx'});await fs.writeFile(sourceArchive+'.sha256',hash(sourceZip)+'  '+path.basename(sourceArchive)+'\n',{flag:'wx'});
 const exe=await read(out);const result={ok:true,file:out,bytes:exe.length,sha256:hash(exe),productVersion:'1.0.0',installerCommit,releaseCommit:RELEASE_COMMIT,sourceDirty:dirty,testBuild:allowDirtyForTest,files:files.length,payloadBytes:zipped.length,expandedBytes:Object.values(entries).reduce((n,b)=>n+b.length,0),runtimeIncluded:true,nodeVersion:NODE_VERSION,nodeHashVerified:true,nodeSignatureVerified:true,installerSigned:false,credentialsIncluded:false,municipalRecordsIncluded:false,correspondingSourceArchive:sourceArchive,sourceArchiveSha256:hash(sourceZip),compilerDiagnostics:compile.trim(),stage};
 await fs.writeFile(out+'.sha256',result.sha256+'  '+path.basename(out)+'\n',{flag:'wx'});await fs.writeFile(out+'.verification.json',encode(result),{flag:'wx'});return result;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){try{const args=process.argv.slice(2),options={};for(let i=0;i<args.length;i++){if(args[i]==='--allow-dirty-for-test'){options.allowDirtyForTest=true;continue;}const name={'--kit':'kit','--runtime':'runtime','--runtime-license':'runtimeLicense','--output':'output'}[args[i]];if(!name||!args[i+1])throw Error('INSTALLER_USAGE');options[name]=args[++i];}for(const name of ['kit','runtime','runtimeLicense','output'])if(!options[name])throw Error('INSTALLER_USAGE');console.log(JSON.stringify(await buildInstaller(options)));}catch(e){console.error(e.stdout?.toString()||e.message);process.exitCode=1;}}
