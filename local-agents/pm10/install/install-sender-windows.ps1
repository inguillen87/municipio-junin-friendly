#Requires -Version 5.1
#Requires -RunAsAdministrator
# SPDX-License-Identifier: GPL-2.0-only
[CmdletBinding()]
param([string]$NodePath = 'C:\Program Files\nodejs\node.exe')
$ErrorActionPreference='Stop'
$Base=Join-Path $env:ProgramData 'MuniControl\PM10'
$App=Join-Path $Base 'app'; $State=Join-Path $Base 'state'; $Private=Join-Path $Base 'private'
$Source=Split-Path $PSScriptRoot -Parent
$Task='MuniControl-PM10-EnvioHTTPS'
if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf) -or -not (Test-Path (Join-Path $Base 'config.json')) -or -not (Test-Path (Join-Path $State 'pending'))) { throw 'Se requiere Node.js 22+ y una captura local instalada.' }
$major=& $NodePath -p 'process.versions.node.split(".")[0]'
if($LASTEXITCODE -ne 0 -or [int]$major -lt 22){throw 'Se requiere Node.js 22 o superior.'}
foreach ($p in @((Join-Path $Private 'api-token'),(Join-Path $Base 'sender.json'))) { if(Test-Path $p) {throw 'Existe una configuracion de envio. No se sobrescribio.'} }
if(Get-ScheduledTask -TaskName $Task -ErrorAction SilentlyContinue){throw 'La tarea de envio ya existe.'}
foreach ($f in @('store.mjs','config.mjs')) {if((Get-FileHash (Join-Path $Source $f)).Hash -ne (Get-FileHash (Join-Path $App $f)).Hash){throw "Revisar version instalada de $f"}}
if((Read-Host 'Escriba AUTORIZO ENVIO para preparar el servicio') -cne 'AUTORIZO ENVIO'){throw 'Cancelado'}
$Connector=Read-Host 'Clave publica external_key del conector (no token)'
if($Connector -cnotmatch '^[a-z0-9][a-z0-9._-]{7,127}$'){throw 'Clave de conector invalida'}
$TokenFile=Join-Path $Private 'api-token';$ConfigFile=Join-Path $Base 'sender.json'
$bytes=New-Object byte[] 32;$rng=[Security.Cryptography.RandomNumberGenerator]::Create();$rng.GetBytes($bytes);$rng.Dispose()
$token=[Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
try{
 [IO.File]::WriteAllText($TokenFile,$token,(New-Object Text.UTF8Encoding($false)))
 $sha=[Security.Cryptography.SHA256]::Create();$hash=([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($token)))).Replace('-','').ToLowerInvariant();$sha.Dispose()
 $cfg=[ordered]@{schema='pm10-delivery-config.v1';approved=$true;stateDir=$State;tokenFile=$TokenFile;connectorKey=$Connector;pollSeconds=60}
 [IO.File]::WriteAllText($ConfigFile,($cfg|ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))
}finally{$token=$null;[Array]::Clear($bytes,0,$bytes.Length)}
foreach($f in @('delivery.mjs','sender.mjs')){Copy-Item -LiteralPath (Join-Path $Source $f) -Destination $App}
$principal=New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount -RunLevel Limited
$action=New-ScheduledTaskAction -Execute $NodePath -Argument ('"'+(Join-Path $App 'sender.mjs')+'" run --config "'+$ConfigFile+'"') -WorkingDirectory $App
$trigger=New-ScheduledTaskTrigger -AtStartup
$settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $Task -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'PM10 HTTPS: confirma cada parte; no borra capturas ni calcula haberes.' | Out-Null
Disable-ScheduledTask -TaskName $Task | Out-Null
Write-Host "SHA-256 para registrar en el conector autorizado (no token): $hash"
Write-Host 'Tarea preparada, deshabilitada y no iniciada. Registrar el hash y habilitar el conector primero.'
Write-Host 'Despues: Enable-ScheduledTask -TaskName MuniControl-PM10-EnvioHTTPS; Start-ScheduledTask -TaskName MuniControl-PM10-EnvioHTTPS'
