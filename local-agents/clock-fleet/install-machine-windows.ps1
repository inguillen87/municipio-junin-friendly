#Requires -Version 5.1
#Requires -RunAsAdministrator
# SPDX-License-Identifier: GPL-2.0-only
# Dedicated MUNICIPAL host only. No secrets, Windows passwords or clock reconfiguration.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$BasePath,[switch]$Activate)
$ErrorActionPreference='Stop'
$Base=[IO.Path]::GetFullPath($BasePath).TrimEnd('\')
$Allowed=[IO.Path]::GetFullPath($env:ProgramData).TrimEnd('\')+'\MuniControl\'
if(-not $Base.StartsWith($Allowed,[StringComparison]::OrdinalIgnoreCase) -or $Base.Contains('"')){throw 'GATEWAY_PROGRAMDATA_REQUIRED'}
function Assert-LocalPath([string]$Path){$p=[IO.Path]::GetFullPath($Path);if(-not $p.StartsWith($Base+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'GATEWAY_PATH_OUTSIDE_BASE'};$item=Get-Item -LiteralPath $p;while($item){if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'GATEWAY_REPARSE_DENIED'};$item=if($item -is [IO.FileInfo]){$item.Directory}else{$item.Parent};if($item -and $item.FullName -eq [IO.Path]::GetPathRoot($p)){break}};return $p}
$Node=Assert-LocalPath (Join-Path $Base 'runtime\node.exe')
$Verifier=Assert-LocalPath (Join-Path $Base 'verify-release.mjs')
$Script=Assert-LocalPath (Join-Path $Base 'app\clock-fleet\gateway.mjs')
$ConfigFile=Assert-LocalPath (Join-Path $Base 'config\gateway.json')
$Config=Get-Content -LiteralPath $ConfigFile -Raw | ConvertFrom-Json
if($Config.approvedHost -ine $env:COMPUTERNAME){throw 'GATEWAY_APPROVED_HOST_MISMATCH'}
$State=Assert-LocalPath $Config.stateDir
$Writable=@($State);$Secrets=@()
foreach($worker in $Config.workers){$file=Assert-LocalPath $worker.configFile;$c=Get-Content -LiteralPath $file -Raw|ConvertFrom-Json;$Writable+=Assert-LocalPath $c.stateDir;if($c.credentialFile){$Secrets+=Assert-LocalPath $c.credentialFile};if($c.tokenFile){$Secrets+=Assert-LocalPath $c.tokenFile};foreach($clock in $c.clocks){if($clock.credentialFile){$Secrets+=Assert-LocalPath $clock.credentialFile};if($clock.tokenFile){$Secrets+=Assert-LocalPath $clock.tokenFile}}}
$StatePrefix=(Join-Path $Base 'state').TrimEnd('\')+'\'
foreach($dir in $Writable){if(-not $dir.StartsWith($StatePrefix,[StringComparison]::OrdinalIgnoreCase)){throw 'GATEWAY_STATE_MUST_BE_ISOLATED'}}
foreach($secret in $Secrets){foreach($dir in $Writable){if($secret.StartsWith($dir.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'GATEWAY_SECRET_IN_WRITABLE_STATE'}}}
if((Get-AuthenticodeSignature -LiteralPath $Node).Status -ne 'Valid'){throw 'GATEWAY_RUNTIME_SIGNATURE_INVALID'}
$Major=& $Node -p 'Number(process.versions.node.split(".")[0])'
if($LASTEXITCODE -ne 0 -or [int]$Major -lt 22){throw 'GATEWAY_RUNTIME_VERSION_INVALID'}
$Verified=& $Node $Verifier $Base
if($LASTEXITCODE -ne 0){throw 'GATEWAY_RELEASE_VERIFICATION_FAILED'}
$Release=$Verified|ConvertFrom-Json
if($Release.ok -ne $true -or $Release.sourceDirty -ne $false){throw 'GATEWAY_RELEASE_NOT_CLEAN'}
$Preflight=& $Node $Script check --config $ConfigFile
if($LASTEXITCODE -ne 0){throw 'GATEWAY_PREFLIGHT_FAILED'}
$Report=$Preflight|ConvertFrom-Json
if($Report.captureIdentities -lt 1){throw 'GATEWAY_NO_CAPTURE_CONFIGURED'}
if($Activate){
 $Desired=& $Node --input-type=module -e 'import {pathToFileURL} from "node:url"; const {desiredState}=await import(pathToFileURL(process.argv[2]).href); console.log(await desiredState(process.argv[1]));' $State $Script
 if($LASTEXITCODE -ne 0 -or $Desired -ne 'running'){throw 'GATEWAY_EXPLICIT_START_REQUIRED'}
}
$Task='MuniControl-MunicipalClockGateway'
if(Get-ScheduledTask -TaskName $Task -ErrorAction SilentlyContinue){throw 'GATEWAY_TASK_EXISTS_REVIEW_REQUIRED'}
$Legacy=@(Get-ScheduledTask | Where-Object {$_.TaskName -like 'MuniControl*' -and $_.State -ne 'Disabled'})
if($Legacy.Count){throw 'GATEWAY_STOP_PREVIOUS_COLLECTORS_FIRST'}
# Grant the service read access to code/config and write access only to private state.
$LocalService=New-Object Security.Principal.SecurityIdentifier('S-1-5-19')
$Admins=New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544');$System=New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
$Entries=@(Get-Item -LiteralPath $Base)+@(Get-ChildItem -LiteralPath $Base -Force -Recurse)
foreach($entry in $Entries){if($entry.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'GATEWAY_REPARSE_DENIED'}}
foreach($entry in $Entries){
 $acl=Get-Acl -LiteralPath $entry.FullName;$acl.SetAccessRuleProtection($true,$false)
 foreach($rule in @($acl.Access)){$null=$acl.RemoveAccessRuleSpecific($rule)}
 $inherit=if($entry.PSIsContainer){[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'}else{[Security.AccessControl.InheritanceFlags]::None}
 foreach($sid in @($Admins,$System)){$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl',$inherit,'None','Allow')))}
 $canWrite=$false;foreach($dir in $Writable){if($entry.FullName -ieq $dir -or $entry.FullName.StartsWith($dir.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){$canWrite=$true}}
 $rights=if($canWrite){'Modify'}else{'ReadAndExecute'}
 $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($LocalService,$rights,$inherit,'None','Allow')))
 Set-Acl -LiteralPath $entry.FullName -AclObject $acl
}
$Action=New-ScheduledTaskAction -Execute $Node -Argument ('"'+$Script+'" run --config "'+$ConfigFile+'"') -WorkingDirectory $Base
$Principal=New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount -RunLevel Limited
$Triggers=@((New-ScheduledTaskTrigger -AtStartup),(New-ScheduledTaskTrigger -Once -At ([DateTime]::Now.AddMinutes(2)) -RepetitionInterval (New-TimeSpan -Minutes 5)))
$Settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$Definition=New-ScheduledTask -Action $Action -Principal $Principal -Trigger $Triggers -Settings $Settings -Description 'MuniControl municipal clock gateway; private queues; no interactive user required.'
$Definition.Settings.Enabled=[bool]$Activate
Register-ScheduledTask -TaskName $Task -InputObject $Definition|Out-Null
$Installed=Get-ScheduledTask -TaskName $Task
if($Installed.Principal.LogonType -ne 'ServiceAccount' -or $Installed.Principal.RunLevel -ne 'Limited' -or $Installed.Settings.MultipleInstances -ne 'IgnoreNew'){Disable-ScheduledTask -TaskName $Task|Out-Null;throw 'GATEWAY_SCHEDULER_MISMATCH'}
@{schema='municipal-clock-machine-install.v1';task=$Task;activated=[bool]$Activate;captureIdentities=$Report.captureIdentities;deliveryIdentities=$Report.deliveryIdentities;allSendersConfigured=$Report.allSendersConfigured;loggedOutTested=$false;networkVerified=$false}|ConvertTo-Json
