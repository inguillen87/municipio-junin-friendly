#Requires -Version 5.1
# SPDX-License-Identifier: GPL-2.0-only
# Installs only a current-user task; no passwords, elevation or device changes.
[CmdletBinding()]
param([string]$BasePath=(Join-Path $env:LOCALAPPDATA 'MuniControl\Gateways\MultiClock'))
$ErrorActionPreference='Stop'
$Base=[IO.Path]::GetFullPath($BasePath).TrimEnd('\')
$Allowed=[IO.Path]::GetFullPath($env:LOCALAPPDATA).TrimEnd('\')+'\'
if(-not $Base.StartsWith($Allowed,[StringComparison]::OrdinalIgnoreCase) -or $Base.Contains('"')){throw 'Base fuera de LOCALAPPDATA.'}
$Node=Join-Path $Base 'runtime\node.exe'
$Controller=Join-Path $Base 'app\clock-fleet\control.mjs'
foreach($entry in @($Base,$Node,$Controller,(Join-Path $Base 'config\fleet.json'),(Join-Path $Base 'control'))){
 $item=Get-Item -LiteralPath $entry -ErrorAction Stop
 if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'La instalacion no admite enlaces.'}
}
$Sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$Hasher=[Security.Cryptography.SHA256]::Create()
try{$Suffix=([BitConverter]::ToString($Hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($Base.ToLowerInvariant()+'|'+$Sid)))).Replace('-','').Substring(0,12)}finally{$Hasher.Dispose()}
$Task='MuniControl-MultiClock-'+$Suffix
$Wscript=Join-Path $env:WINDIR 'System32\wscript.exe'
$Launcher=Join-Path $Base 'capture-cycle.vbs'
$Arguments='//B //NoLogo "'+$Launcher+'"'
$Description='MuniControl multirreloj: captura por serie con colas independientes. Respeta detener despues del ciclo. Sesion de usuario requerida.'
$Existing=Get-ScheduledTask -ErrorAction Stop|Where-Object{$_.TaskName -eq $Task -and $_.TaskPath -eq '\'}
if($Existing){
 $ExistingSid=$Existing.Principal.UserId
 if($ExistingSid -notmatch '^S-1-'){$ExistingSid=(New-Object Security.Principal.NTAccount($ExistingSid)).Translate([Security.Principal.SecurityIdentifier]).Value}
 if($ExistingSid -ne $Sid -or $Existing.Actions.Count -ne 1 -or $Existing.Actions[0].Execute -ne $Wscript -or $Existing.Actions[0].Arguments -ne $Arguments -or $Existing.Description -ne $Description){throw 'Tarea existente diferente. No se modifica.'}
}
if(Test-Path -LiteralPath $Launcher){if((Get-Item -LiteralPath $Launcher).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Lanzador no seguro.'}}
$Command='"'+$Node+'" "'+$Controller+'" tick --base "'+$Base+'"'
$Vbs='WScript.Quit CreateObject("WScript.Shell").Run("'+$Command.Replace('"','""')+'", 0, True)'+[Environment]::NewLine
[IO.File]::WriteAllText($Launcher,$Vbs,[Text.Encoding]::Unicode)
if(-not $Existing){
 $Action=New-ScheduledTaskAction -Execute $Wscript -Argument $Arguments -WorkingDirectory $Base
 $Triggers=@((New-ScheduledTaskTrigger -AtLogOn -User $Sid),(New-ScheduledTaskTrigger -Once -At ([DateTime]::Now.AddMinutes(1)) -RepetitionInterval (New-TimeSpan -Minutes 5)))
 $Principal=New-ScheduledTaskPrincipal -UserId $Sid -LogonType Interactive -RunLevel Limited
 $Settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
 Register-ScheduledTask -TaskName $Task -TaskPath '\' -Action $Action -Trigger $Triggers -Principal $Principal -Settings $Settings -Description $Description|Out-Null
}
$Installed=Get-ScheduledTask -TaskName $Task
if($Installed.Settings.MultipleInstances -ne 'IgnoreNew' -or $Installed.Principal.LogonType -ne 'Interactive' -or $Installed.Principal.RunLevel -ne 'Limited' -or -not $Installed.Settings.Enabled){throw 'Revisar tarea instalada; no iniciar.'}
$Result=@{schema='clock-fleet-user-install.v1';state='registered';taskName=$Task;checkedAt=[DateTime]::UtcNow.ToString('o');scope='current_user_session';triggerMinutes=5;pollSchedule='per_device_configuration';operationWhileLoggedOutVerified=$false;pm10Modified=$false}
[IO.File]::WriteAllText((Join-Path $Base 'control\scheduler.json'),($Result|ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))
$Result|ConvertTo-Json
Write-Host 'Registrado sin iniciar ni alterar la captura existente de PM10. Detener conserva la cola y espera el fin del ciclo actual.'
