#Requires -RunAsAdministrator
# Preparacion local de PM-10. Sin conexiones al reloj ni cambios de firewall.
[CmdletBinding()]
param([switch]$EnableCapture)
$ErrorActionPreference = 'Stop'
$Package = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$Root = Join-Path $env:ProgramData 'MuniControl\PM10'
$Code = Join-Path $Root 'app'
$Node = Join-Path $env:ProgramFiles 'nodejs\node.exe'
$TaskName = 'MuniControl-PM10-Captura'
if (-not (Test-Path -LiteralPath $Node -PathType Leaf)) { throw 'Instale Node.js 22 o superior en Program Files. No se usa Node desde un perfil personal.' }
$Major = [int]((& $Node --version).TrimStart('v').Split('.')[0])
if ($LASTEXITCODE -ne 0 -or $Major -lt 22) { throw 'Se requiere Node.js 22 o superior.' }
if (Test-Path -LiteralPath $Root) { throw 'PM10 ya tiene una carpeta. Revisar la instalacion existente: no se reemplazan claves ni capturas.' }
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) { throw 'Ya existe la tarea PM10. No se reemplaza automaticamente.' }
New-Item -ItemType Directory -Path $Root | Out-Null
# Resolve principals by SID, independent of the installation language.
$System = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
$Admins = [Security.Principal.SecurityIdentifier]::new('S-1-5-32-544')
$LocalService = [Security.Principal.SecurityIdentifier]::new('S-1-5-19')
$Acl = [Security.AccessControl.DirectorySecurity]::new()
$Acl.SetAccessRuleProtection($true, $false)
foreach ($Sid in @($System, $Admins)) {
 $Acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($Sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
}
$Acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($LocalService, 'ReadAndExecute', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
Set-Acl -LiteralPath $Root -AclObject $Acl
Copy-Item -LiteralPath $Package -Destination $Code -Recurse
Copy-Item -LiteralPath (Join-Path $Code 'config.example.json') -Destination (Join-Path $Root 'config.json')
Write-Host 'Ingrese SOLO la CommKey ya validada, en este equipo municipal. No la envie por chat.'
& $Node (Join-Path $Code 'cli.mjs') init --root $Root
if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar la credencial. No se registro ni inicio la tarea.' }
$Data = Join-Path $Root 'data'
$DataAcl = Get-Acl -LiteralPath $Data
$DataAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($LocalService, 'Modify', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
Set-Acl -LiteralPath $Data -AclObject $DataAcl
$CfgPath = Join-Path $Root 'config.json'
$Cfg = Get-Content -LiteralPath $CfgPath -Raw | ConvertFrom-Json
$Cfg.enabled = [bool]$EnableCapture
# UTF-8 without BOM: Node's JSON.parse does not accept a BOM.
[IO.File]::WriteAllText($CfgPath, ($Cfg | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
$Arguments = '"' + (Join-Path $Code 'cli.mjs') + '" run --root "' + $Root + '"'
$Action = New-ScheduledTaskAction -Execute $Node -Argument $Arguments -WorkingDirectory $Code
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Account = $LocalService.Translate([Security.Principal.NTAccount]).Value
$Principal = New-ScheduledTaskPrincipal -UserId $Account -LogonType ServiceAccount -RunLevel Limited
$Settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 2)
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Description 'Captura local cifrada PM10. No envia datos a Neon.' | Out-Null
if ($EnableCapture) {
 Start-ScheduledTask -TaskName $TaskName
 Write-Host 'Tarea iniciada. Verifique el estado de lectura; iniciar la tarea no demuestra conectividad.'
} else { Write-Host 'Tarea preparada, lectura DESHABILITADA. Aun no se ha consultado el reloj.' }
Write-Host 'Estado: ejecutar node.exe cli.mjs status --root con la carpeta PM10. La subida a Neon no esta implementada en esta etapa.'
