#Requires -RunAsAdministrator
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$InstallDirectory,[Parameter(Mandatory=$true)][string]$NodePath,[Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference = 'Stop'
# Installs at boot without a personal user's password. Does not start or enable the cloud connector.
$root=(Resolve-Path -LiteralPath $InstallDirectory).Path
$node=(Resolve-Path -LiteralPath $NodePath).Path
$configFile=(Resolve-Path -LiteralPath $ConfigPath).Path
if ($root -match '["\r\n]' -or $configFile -match '["\r\n]') {throw 'Ruta inválida'}
$config=Get-Content -LiteralPath $configFile -Raw | ConvertFrom-Json
if (!$config.approved) {throw 'Revisá la configuración y autorizá la instalación antes de programarla.'}
$service=Join-Path $root 'services\pm10-collector\service.mjs'
if (!(Test-Path -LiteralPath $service)) {throw 'No se encontró el código del servicio'}
$name='MuniControl-PM10'
if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {throw 'La tarea ya existe. Revisala antes de modificarla.'}
foreach($dir in @($config.stateDirectory,$config.credentialDirectory)) {
 if (![System.IO.Path]::IsPathRooted($dir)) {throw 'Usá rutas absolutas para datos y credenciales'}
 New-Item -ItemType Directory -Path $dir -Force | Out-Null
 & icacls.exe $dir /inheritance:r /grant:r '*S-1-5-19:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
 if ($LASTEXITCODE -ne 0) {throw 'No se pudieron restringir los permisos de las carpetas'}
}
foreach($nameSecret in @('commkey','token','spool-key')) {if(!(Test-Path -LiteralPath (Join-Path $config.credentialDirectory $nameSecret))) {throw "Configurá el archivo de credencial: $nameSecret"}}
$action=New-ScheduledTaskAction -Execute $node -Argument ('"'+$service+'" --config "'+$configFile+'"') -WorkingDirectory $root
$principal=New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName 'MuniControl-PM10' -Action $action -Principal $principal -Trigger (New-ScheduledTaskTrigger -AtStartup) -Settings $settings -Description 'Colector de lectura PM-10. Sin plantillas biométricas ni liquidación automática.' | Out-Null
Write-Output 'Tarea instalada, sin iniciar. Completá la habilitación autorizada del conector antes de iniciar MuniControl-PM10.'
