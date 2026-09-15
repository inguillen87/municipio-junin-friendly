#Requires -Version 5.1
# SPDX-License-Identifier: GPL-2.0-only
# Optional provisional current-user installation. No elevation or credential prompts.
[CmdletBinding()]
param(
 [string]$BasePath = (Join-Path $env:LOCALAPPDATA 'MuniControl\Gateways\PM10'),
 [string]$NodePath = (Get-Command node.exe -ErrorAction Stop).Source,
 [switch]$NoStartup
)
$ErrorActionPreference='Stop'
$Base=[IO.Path]::GetFullPath($BasePath)
$LocalRoot=[IO.Path]::GetFullPath($env:LOCALAPPDATA).TrimEnd('\')+'\'
if(-not $Base.StartsWith($LocalRoot,[StringComparison]::OrdinalIgnoreCase) -or $Base.Contains('"')){throw 'La instalacion provisional debe estar dentro de LOCALAPPDATA.'}
$Source=Split-Path $PSScriptRoot -Parent
$App=Join-Path $Base 'app';$Runtime=Join-Path $Base 'runtime';$Control=Join-Path $Base 'control'
$Node=Join-Path $Runtime 'node.exe'
if(-not(Test-Path -LiteralPath $NodePath -PathType Leaf)){throw 'No se encontro node.exe.'}
$major=& $NodePath -p 'process.versions.node.split(".")[0]'
if($LASTEXITCODE -ne 0 -or [int]$major -lt 22){throw 'Se requiere Node.js 22 o superior.'}
# Preserve another installation's startup entry before any installation changes.
$Shell=New-Object -ComObject WScript.Shell
$WScript=Join-Path $env:WINDIR 'System32\wscript.exe'
$StartupPath=Join-Path ([Environment]::GetFolderPath('Startup')) 'MuniControl PM10 provisional.lnk'
$StartupArguments='"'+(Join-Path $Base 'run.vbs')+'"'
if(-not $NoStartup -and (Test-Path -LiteralPath $StartupPath)){
 $existing=$Shell.CreateShortcut($StartupPath)
 if(-not [string]::Equals($existing.TargetPath,$WScript,[StringComparison]::OrdinalIgnoreCase) -or -not [string]::Equals($existing.Arguments,$StartupArguments,[StringComparison]::OrdinalIgnoreCase)){
  throw 'El acceso de inicio pertenece a otra instalacion. Se conservo sin cambios; revise la exclusividad antes de continuar.'
 }
}
# Do not replace an application while any existing worker owns its directory.
foreach($lockRoot in @($Control,(Join-Path $Base 'state'),(Join-Path $Base 'state\delivery'))){
 $owner=Join-Path $lockRoot 'process.lock\owner.json'
 if(Test-Path -LiteralPath $owner){
  $metadata=Get-Content -LiteralPath $owner -Raw|ConvertFrom-Json
  if(-not $metadata.pid -or (Get-Process -Id $metadata.pid -ErrorAction SilentlyContinue)){throw 'Detenga el supervisor y las lecturas antes de preparar o actualizar el programa.'}
 }
}
foreach($dir in @($Base,$App,$Runtime,$Control,(Join-Path $Base 'private'),(Join-Path $Base 'state'))){
 if(Test-Path -LiteralPath $dir){if((Get-Item -LiteralPath $dir).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'No se admiten enlaces en la instalacion.'}}
 else{New-Item -ItemType Directory -Path $dir|Out-Null}
}
$UserSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls.exe $Base /inheritance:r /grant:r "*${UserSid}:(OI)(CI)(F)" '*S-1-5-18:(OI)(CI)(F)' '*S-1-5-32-544:(OI)(CI)(F)'|Out-Null
if($LASTEXITCODE -ne 0){throw 'No se pudieron restringir los permisos de la instalacion.'}
if([IO.Path]::GetFullPath($NodePath) -ne $Node){Copy-Item -LiteralPath $NodePath -Destination $Node -Force}
foreach($file in @('service.mjs','sender.mjs','delivery.mjs','store.mjs','config.mjs','route-guard.mjs','delivery-status.mjs','check-host.mjs','host-readiness.mjs','user-supervisor.mjs','package.json','LICENSE')){
 Copy-Item -LiteralPath (Join-Path $Source $file) -Destination (Join-Path $App $file) -Force
}
$Reader=Join-Path $App 'reader';if(-not(Test-Path -LiteralPath $Reader)){New-Item -ItemType Directory -Path $Reader|Out-Null}
foreach($file in @('lector-fichadas.mjs','zk-core-v3.mjs','REFERENCIAS.md')){Copy-Item -LiteralPath (Join-Path $Source "reader\$file") -Destination (Join-Path $Reader $file) -Force}
# A new installation is prepared stopped; preserve an existing user's desired state.
$Desired=Join-Path $Control 'desired.json'
if(-not(Test-Path -LiteralPath $Desired)){
 [IO.File]::WriteAllText($Desired,'{"schema":"pm10-user-control.v1","desired":"stopped"}',(New-Object Text.UTF8Encoding($false)))
}
$Supervisor=Join-Path $App 'user-supervisor.mjs'
foreach($mode in @('start','stop','run')){
 $command='"'+$Node+'" "'+$Supervisor+'" '+$mode+' --base "'+$Base+'"'
 $vbs='CreateObject("WScript.Shell").Run "'+$command.Replace('"','""')+'", 0, False'+[Environment]::NewLine
 [IO.File]::WriteAllText((Join-Path $Base ($mode+'.vbs')),$vbs,[Text.Encoding]::Unicode)
}
foreach($entry in @(@('Iniciar PM10','start'),@('Detener PM10','stop'))){
 $shortcut=$Shell.CreateShortcut((Join-Path $Base ($entry[0]+'.lnk')))
 $shortcut.TargetPath=Join-Path $env:WINDIR 'System32\wscript.exe'
 $shortcut.Arguments='"'+(Join-Path $Base ($entry[1]+'.vbs'))+'"'
 $shortcut.WorkingDirectory=$Base;$shortcut.Description='PM10 provisional para la sesion de este usuario';$shortcut.Save()
}
if(-not $NoStartup){
 $shortcut=$Shell.CreateShortcut($StartupPath)
 $shortcut.TargetPath=$WScript
 $shortcut.Arguments=$StartupArguments;$shortcut.WorkingDirectory=$Base
 $shortcut.Description='PM10 provisional al iniciar sesion; respeta una detencion guardada';$shortcut.Save()
}
Write-Host "Programa provisional preparado: $Base"
Write-Host 'No se modificaron config.json, sender.json, claves, capturas ni acuses. No se inicio ningun colector.'
Write-Host 'Usa la sesion actual. No funciona con la PC apagada y no acredita continuidad al cerrar sesion.'
Write-Host 'Con la configuracion y el conector listos, abra Iniciar PM10. Para detener ambos, abra Detener PM10.'
Write-Host ('Estado: "'+$Node+'" "'+$Supervisor+'" status --base "'+$Base+'"')
