#Requires -Version 5.1
# SPDX-License-Identifier: GPL-2.0-only
# Current-user Task Scheduler only. No elevation, password or policy changes.
[CmdletBinding()]
param([string]$BasePath = (Join-Path $env:LOCALAPPDATA 'MuniControl\Gateways\PM10'))
$ErrorActionPreference='Stop'
$Base=[IO.Path]::GetFullPath($BasePath).TrimEnd('\')
$LocalRoot=[IO.Path]::GetFullPath($env:LOCALAPPDATA).TrimEnd('\')+'\'
if(-not $Base.StartsWith($LocalRoot,[StringComparison]::OrdinalIgnoreCase) -or $Base.Contains('"')){throw 'La instalacion provisional debe estar dentro de LOCALAPPDATA.'}
$Node=Join-Path $Base 'runtime\node.exe'
$Supervisor=Join-Path $Base 'app\user-supervisor.mjs'
$Control=Join-Path $Base 'control'
foreach($entry in @($Base,(Join-Path $Base 'app'),(Join-Path $Base 'runtime'),$Control,$Node,$Supervisor)){
 $item=Get-Item -LiteralPath $entry -ErrorAction Stop
 if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'No se admiten enlaces en la instalacion.'}
}
# This setup reads no capture/sender configuration, secret, raw record or receipt.
if(-not (Select-String -LiteralPath $Supervisor -SimpleMatch 'export async function watchdog(' -Quiet)){throw 'Actualice el supervisor detenido antes de registrar su recuperacion.'}
$UserSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$Hash=[Security.Cryptography.SHA256]::Create()
try{$Suffix=([BitConverter]::ToString($Hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($Base.ToLowerInvariant()+'|'+$UserSid)))).Replace('-','').Substring(0,12)}finally{$Hash.Dispose()}
$TaskName='MuniControl-PM10-Provisional-'+$Suffix
$WScript=Join-Path $env:WINDIR 'System32\wscript.exe'
$Launcher=Join-Path $Base 'watchdog.vbs'
$Arguments='//B //NoLogo "'+$Launcher+'"'
$Description='MuniControl PM10 provisional: recuperacion en la sesion del usuario; respeta Detener PM10.'
$StatusPath=Join-Path $Control 'watchdog-install.json'
if(Test-Path -LiteralPath $StatusPath){if((Get-Item -LiteralPath $StatusPath).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'No se admiten enlaces en el estado de instalacion.'}}
try{
 $Existing=Get-ScheduledTask -ErrorAction Stop | Where-Object { $_.TaskName -eq $TaskName -and $_.TaskPath -eq '\' }
 if($Existing){
  $ExistingSid=$Existing.Principal.UserId
  if($ExistingSid -notmatch '^S-1-'){$ExistingSid=(New-Object Security.Principal.NTAccount($ExistingSid)).Translate([Security.Principal.SecurityIdentifier]).Value}
  if($Existing.Actions.Count -ne 1 -or $Existing.Actions[0].Execute -ne $WScript -or $Existing.Actions[0].Arguments -ne $Arguments -or $ExistingSid -ne $UserSid -or $Existing.Principal.RunLevel -ne 'Limited' -or $Existing.Principal.LogonType -ne 'Interactive' -or $Existing.Description -ne $Description){
   throw 'La tarea existente no corresponde a esta instalacion. Se conservo sin cambios.'
  }
  $Periodic=@($Existing.Triggers|Where-Object{$_.Repetition.Interval -eq 'PT1M' -and -not $_.Repetition.Duration -and $_.Enabled})
  $Logon=@($Existing.Triggers|Where-Object{$_.CimClass.CimClassName -eq 'MSFT_TaskLogonTrigger' -and $_.Enabled})
  if(-not $Existing.Settings.Enabled -or $Existing.Settings.MultipleInstances -ne 'IgnoreNew' -or $Existing.Settings.ExecutionTimeLimit -ne 'PT0S' -or $Periodic.Count -ne 1 -or $Logon.Count -ne 1){
   throw 'La recuperacion existente fue modificada o deshabilitada. Se conservo sin cambios; revise su programacion.'
  }
 }
 if(Test-Path -LiteralPath $Launcher){if((Get-Item -LiteralPath $Launcher).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'No se admiten enlaces en el lanzador.'}}
 $Command='"'+$Node+'" "'+$Supervisor+'" watchdog --base "'+$Base+'"'
 # Wait keeps the task alive while its supervisor runs. IgnoreNew and the
 # supervisor/capture/sender locks prevent duplicate ownership at every layer.
 $Vbs='WScript.Quit CreateObject("WScript.Shell").Run("'+$Command.Replace('"','""')+'", 0, True)'+[Environment]::NewLine
 [IO.File]::WriteAllText($Launcher,$Vbs,[Text.Encoding]::Unicode)
 if(-not $Existing){
  $Action=New-ScheduledTaskAction -Execute $WScript -Argument $Arguments -WorkingDirectory $Base
  $Triggers=@((New-ScheduledTaskTrigger -AtLogOn -User $UserSid),(New-ScheduledTaskTrigger -Once -At ([DateTime]::Now.AddMinutes(1)) -RepetitionInterval (New-TimeSpan -Minutes 1)))
  $Principal=New-ScheduledTaskPrincipal -UserId $UserSid -LogonType Interactive -RunLevel Limited
  $Settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
  Register-ScheduledTask -TaskPath '\' -TaskName $TaskName -Action $Action -Trigger $Triggers -Principal $Principal -Settings $Settings -Description $Description -ErrorAction Stop | Out-Null
 }
 $Status=@{schema='pm10-user-watchdog-install.v1';state='registered';taskName=$TaskName;checkedAt=[DateTime]::UtcNow.ToString('o');scope='current_user_session';runsWhenComputerOff=$false;operationWhileLoggedOutVerified=$false}
 [IO.File]::WriteAllText($StatusPath,($Status|ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))
 Write-Host "Recuperacion de sesion registrada: $TaskName"
 Write-Host 'Comprueba cada minuto y al iniciar sesion; respeta una detencion guardada. No se inicio ni detuvo el colector.'
}catch{
 $Status=@{schema='pm10-user-watchdog-install.v1';state='unavailable';taskName=$TaskName;checkedAt=[DateTime]::UtcNow.ToString('o');errorId=$_.FullyQualifiedErrorId;errorMessage=$_.Exception.Message;hresult=$_.Exception.HResult;scope='current_user_session'}
 [IO.File]::WriteAllText($StatusPath,($Status|ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))
 throw
}
