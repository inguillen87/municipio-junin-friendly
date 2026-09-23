#Requires -Version 5.1
# SPDX-License-Identifier: GPL-2.0-only
# Read-only: no task/service/ACL change, device socket, token read or cloud request.
[CmdletBinding()]
param([string]$BasePath=$PSScriptRoot,[ValidateRange(1,17)][int]$ExpectedClocks=6)
$ErrorActionPreference='Stop'
$Base=[IO.Path]::GetFullPath($BasePath)
$checks=New-Object 'System.Collections.Generic.List[object]'
function Add-Check($name,$state,$detail){$checks.Add([pscustomobject]@{comprobacion=$name;estado=$state;detalle=$detail})}
function Safe-Code($value){if(@('RUNTIME_SIGNATURE_INVALID','RUNTIME_VERSION_INVALID','RELEASE_CHECK_FAILED','RELEASE_NOT_CLEAN','GATEWAY_PREFLIGHT_FAILED') -contains [string]$value){return [string]$value};return 'REVISION_REQUERIDA'}
function Test-GatewayPreflight($Report,[ValidateRange(1,17)][int]$Expected) {
 # The gateway already counts enabled fleet identities and PM10. Never add a clock here.
 if($null -eq $Report -or $Report.schema -cne 'municipal-clock-gateway-preflight.v1'){throw 'GATEWAY_PREFLIGHT_FAILED'}
 foreach($count in @($Report.captureIdentities,$Report.deliveryIdentities)) {
  if(($count -isnot [int] -and $count -isnot [long]) -or $count -lt 0 -or $count -gt 17){throw 'GATEWAY_PREFLIGHT_FAILED'}
 }
 if($Report.allSendersConfigured -isnot [bool] -or $Report.networkTested -isnot [bool] -or $Report.networkTested -ne $false -or ($Report.realWrites -isnot [int] -and $Report.realWrites -isnot [long]) -or $Report.realWrites -ne 0){throw 'GATEWAY_PREFLIGHT_FAILED'}
 return ($Report.captureIdentities -eq $Expected -and $Report.deliveryIdentities -eq $Expected -and $Report.allSendersConfigured -eq $true)
}
$ready=$false
try {
 $os=Get-CimInstance Win32_OperatingSystem
 Add-Check 'Sistema' 'Informado' ([string]$os.Caption)
 $drive=Get-PSDrive -Name ([IO.Path]::GetPathRoot($Base).Substring(0,1))
 $free=[math]::Floor($drive.Free/1MB)
 Add-Check 'Disco libre (MiB)' $(if($free -ge 1024){'Disponible'}else{'Revisar'}) $free
}catch{Add-Check 'Sistema y disco' 'Pendiente' 'No se pudo consultar; revisar en Windows.'}
$Node=Join-Path $Base 'runtime\node.exe'
$RuntimeReady=$false
if(Test-Path -LiteralPath $Node -PathType Leaf){
 try{
  $signature=Get-AuthenticodeSignature -LiteralPath $Node
  if($signature.Status -ne 'Valid'){throw 'RUNTIME_SIGNATURE_INVALID'}
  $major=& $Node -p 'Number(process.versions.node.split(".")[0])'
  if($LASTEXITCODE -ne 0 -or [int]$major -lt 22){throw 'RUNTIME_VERSION_INVALID'}
  $RuntimeReady=$true;Add-Check 'Node oficial firmado' 'Correcto' ('Version mayor '+[int]$major)
 }catch{Add-Check 'Node oficial firmado' 'Revisar' (Safe-Code $_.Exception.Message)}
}else{Add-Check 'Node oficial firmado' 'Pendiente' 'Preparar runtime\node.exe oficial; no está incluido en el ZIP.'}
$ReleaseReady=$false
if($RuntimeReady){
 try{
  $verified=& $Node (Join-Path $Base 'verify-release.mjs') $Base 2>$null
  if($LASTEXITCODE -ne 0){throw 'RELEASE_CHECK_FAILED'}
  $release=$verified|ConvertFrom-Json
  if($release.ok -ne $true -or $release.sourceDirty -ne $false){throw 'RELEASE_NOT_CLEAN'}
  $ReleaseReady=$true;Add-Check 'Integridad del programa' 'Correcto' ($release.files.ToString()+' archivos; commit '+$release.sourceCommit)
 }catch{Add-Check 'Integridad del programa' 'Revisar' (Safe-Code $_.Exception.Message)}
}else{Add-Check 'Integridad del programa' 'Pendiente' 'Necesita el runtime firmado.'}
$Config=Join-Path $Base 'config\gateway.json'
if($ReleaseReady -and (Test-Path -LiteralPath $Config -PathType Leaf)){
 try{
  $preflight=& $Node (Join-Path $Base 'app\clock-fleet\gateway.mjs') check --config $Config 2>$null
  if($LASTEXITCODE -ne 0){throw 'GATEWAY_PREFLIGHT_FAILED'}
  $report=$preflight|ConvertFrom-Json
  $ready=Test-GatewayPreflight $report $ExpectedClocks
  Add-Check 'Correspondencia de capturas y entregas' $(if($ready){'Correcto'}else{'Revisar'}) ([ordered]@{esperados=$ExpectedClocks;capturas=$report.captureIdentities;entregas=$report.deliveryIdentities;correspondencia=$report.allSendersConfigured})
 }catch{Add-Check 'Configuracion' 'Revisar' (Safe-Code $_.Exception.Message)}
}else{Add-Check 'Configuracion' 'Pendiente' 'Preparar y revisar los tres archivos privados; las plantillas no son una instalación activa.'}
try{
 $task=Get-ScheduledTask -TaskName 'MuniControl-MunicipalClockGateway' -ErrorAction SilentlyContinue
 if($task){Add-Check 'Tarea municipal' 'Informado' ([ordered]@{estado=[string]$task.State;habilitada=[bool]$task.Settings.Enabled;tipoSesion=[string]$task.Principal.LogonType})}
 else{Add-Check 'Tarea municipal' 'Pendiente' 'No instalada en este host.'}
}catch{Add-Check 'Tarea municipal' 'Pendiente' 'No se pudo consultar la tarea; no se modificó.'}
[ordered]@{schema='municipal-clock-windows11-diagnostic.v1';soloLectura=$true;configurada=($ready -eq $true);comprobaciones=$checks;redProbada=$false;relojesContactados=0;solicitudesNube=0;cambiosServicios=0;recepcionFisicaVerificada=$false}|ConvertTo-Json -Depth 6
