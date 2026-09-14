#Requires -Version 5.1
#Requires -RunAsAdministrator
# SPDX-License-Identifier: GPL-2.0-only
# One-time municipal installation. Never asks for a Windows/Microsoft password.
[CmdletBinding()]
param([string]$NodePath = 'C:\Program Files\nodejs\node.exe')
$ErrorActionPreference = 'Stop'
$Base = Join-Path $env:ProgramData 'MuniControl\PM10'
$App = Join-Path $Base 'app'
$State = Join-Path $Base 'state'
$Private = Join-Path $Base 'private'
$Task = 'MuniControl-PM10-CapturaLocal'
$Source = Split-Path $PSScriptRoot -Parent
function Check-Exit([string]$Step) { if ($LASTEXITCODE -ne 0) { throw "Error en $Step (codigo $LASTEXITCODE). No se habilito una captura nueva." } }
if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf)) { throw 'Instale Node.js 22 o superior para todo el equipo, o indique -NodePath con la ruta de node.exe.' }
$major = & $NodePath -p 'process.versions.node.split(".")[0]'
Check-Exit 'Node.js'
if ([int]$major -lt 22) { throw 'Se requiere Node.js 22 o superior.' }
if ((Test-Path -LiteralPath $Base) -or (Get-ScheduledTask -TaskName $Task -ErrorAction SilentlyContinue)) { throw 'Ya existe una instalacion o carpeta PM10. No se sobrescribieron claves, cola ni tarea. Revise la instalacion existente.' }
Write-Host 'Destino unico: PM-10 Edificio Viejo. Captura local sin subida a Neon.'
Write-Host 'Coordine con Computos: no debe existir otro colector consultando este reloj.'
$approval = Read-Host 'Escriba AUTORIZO para instalar en este equipo municipal'
if ($approval -cne 'AUTORIZO') { throw 'Instalacion cancelada sin iniciar conexiones.' }
# Local routing lookup only: no clock connections and no changes before this check.
& $NodePath (Join-Path $Source 'check-host.mjs')
Check-Exit 'ruta municipal local; instalacion cancelada antes de cambios'
New-Item -ItemType Directory -Path $Base,$App,$State,$Private -Force | Out-Null
& icacls.exe $Base /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)(F)' '*S-1-5-32-544:(OI)(CI)(F)' '*S-1-5-19:(OI)(CI)(RX)' | Out-Null
Check-Exit 'permisos de instalacion'
& icacls.exe $State /grant:r '*S-1-5-19:(OI)(CI)(M)' | Out-Null
Check-Exit 'permisos de cola'
foreach ($file in @('service.mjs','store.mjs','config.mjs','route-guard.mjs','delivery-status.mjs','check-host.mjs','package.json','LICENSE')) { Copy-Item -LiteralPath (Join-Path $Source $file) -Destination $App }
Copy-Item -LiteralPath (Join-Path $Source 'reader') -Destination (Join-Path $App 'reader') -Recurse
$keyFile = Join-Path $Private 'commkey'
$secure = Read-Host 'CommKey YA VALIDADA del reloj (oculta, no es clave de Windows)' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  if ($plain -notmatch '^[0-9]{1,6}$' -or [uint64]$plain -gt [uint32]::MaxValue) { throw 'CommKey numerica fuera de formato. No se probo ninguna clave.' }
  [IO.File]::WriteAllText($keyFile, $plain, (New-Object Text.UTF8Encoding($false)))
} finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr); $plain = $null; $secure.Dispose() }
$configPath = Join-Path $Base 'config.json'
$config = [ordered]@{
  schema='pm10-capture-agent.v1'; mode='capture_only'; approved=$true;
  host='172.100.97.131'; port=4370; serial='CQTU225360168';
  stateDir=$State; credentialFile=$keyFile; pollSeconds=60; maxQueueMiB=256; minFreeMiB=64
}
[IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
# LocalService is noninteractive and has no administrator rights.
$principal = New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount -RunLevel Limited
$action = New-ScheduledTaskAction -Execute $NodePath -Argument ('"' + (Join-Path $App 'service.mjs') + '" run --config "' + $configPath + '"') -WorkingDirectory $App
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $Task -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'PM10: captura local, sin enviar a Neon. Sin borrar fichadas ni acceder a plantillas biometricas.' | Out-Null
Start-ScheduledTask -TaskName $Task
Write-Host "Tarea instalada. Estado local: $State\estado.html"
Write-Host 'La instalacion no acredita una lectura exitosa ni una recepcion de Neon. Revise status.json.'
