#Requires -Version 5.1
# SPDX-License-Identifier: GPL-2.0-only
# Explicit Windows acceptance test: isolated base, no clock/sender configuration.
[CmdletBinding()]
param([string]$NodePath=(Get-Command node.exe -ErrorAction Stop).Source)
$ErrorActionPreference='Stop'
$Source=Split-Path $PSScriptRoot -Parent
$TestParent=Join-Path $env:LOCALAPPDATA 'MuniControl\Gateways'
$TestBase=Join-Path $TestParent ('PM10-watchdog-test-'+[Guid]::NewGuid().ToString('N'))
$TaskName=$null
$TestNode=Join-Path $TestBase 'runtime\node.exe'
$Supervisor=Join-Path $TestBase 'app\user-supervisor.mjs'
function Wait-Check([scriptblock]$Check,[int]$Seconds=80){
 $Deadline=[DateTime]::UtcNow.AddSeconds($Seconds)
 do{if(& $Check){return};Start-Sleep -Milliseconds 250}while([DateTime]::UtcNow -lt $Deadline)
 throw 'La prueba aislada no alcanzo el estado esperado.'
}
function Read-State{
 $File=Join-Path $TestBase 'control\status.json'
 if(Test-Path -LiteralPath $File){return (Get-Content -LiteralPath $File -Raw|ConvertFrom-Json)}
 return $null
}
try{
 foreach($Dir in @('app','app\reader','runtime','control')){New-Item -ItemType Directory -Path (Join-Path $TestBase $Dir) -Force|Out-Null}
 Copy-Item -LiteralPath $NodePath -Destination $TestNode
 foreach($File in @('user-supervisor.mjs','store.mjs','config.mjs')){Copy-Item -LiteralPath (Join-Path $Source $File) -Destination (Join-Path $TestBase ('app\'+$File))}
 foreach($File in @('lector-fichadas.mjs','zk-core-v3.mjs')){Copy-Item -LiteralPath (Join-Path $Source ('reader\'+$File)) -Destination (Join-Path $TestBase ('app\reader\'+$File))}
 & (Join-Path $Source 'install\install-user-watchdog-windows.ps1') -BasePath $TestBase
 $TaskName=(Get-Content (Join-Path $TestBase 'control\watchdog-install.json') -Raw|ConvertFrom-Json).taskName
 # No launch command: only change the synthetic desired state, then let Windows start it.
 [IO.File]::WriteAllText((Join-Path $TestBase 'control\desired.json'),'{"schema":"pm10-user-control.v1","desired":"running"}',(New-Object Text.UTF8Encoding($false)))
 Wait-Check { $State=Read-State; $State -and $State.state -eq 'running' }
 Write-Output 'Inicio sintetico desde el temporizador confirmado.'
 $First=Read-State;$FirstProcess=Get-CimInstance Win32_Process -Filter ('ProcessId='+$First.pid)
 if($FirstProcess.ExecutablePath -ne $TestNode){throw 'El proceso sintetico no pertenece al directorio aislado.'}
 # No configs exist, so there are no workers and no device connection to interrupt.
 if(@($First.workers.PSObject.Properties|Where-Object{$_.Value.pid}).Count -ne 0){throw 'La prueba sintetica no debe tener colectores.'}
 Stop-Process -Id $First.pid -ErrorAction Stop
 Wait-Check { $State=Read-State; $State -and $State.state -eq 'running' -and $State.pid -ne $First.pid }
 $Recovered=Read-State
 if(-not(Get-Process -Id $Recovered.pid -ErrorAction SilentlyContinue)){throw 'No hay proceso recuperado.'}
 Write-Output 'Recuperacion sintetica en el siguiente ciclo confirmada.'
 & $TestNode $Supervisor stop --base $TestBase
 Wait-Check { $State=Read-State; $State -and $State.state -eq 'stopped' -and -not(Get-Process -Id $Recovered.pid -ErrorAction SilentlyContinue) }
 $StoppedAt=(Read-State).updatedAt
 $PriorRun=(Get-ScheduledTaskInfo -TaskName $TaskName).LastRunTime
 Wait-Check { (Get-ScheduledTaskInfo -TaskName $TaskName).LastRunTime -gt $PriorRun }
 Wait-Check { (Get-ScheduledTask -TaskName $TaskName).State -eq 'Ready' }
 if((Read-State).updatedAt -ne $StoppedAt){throw 'Una detencion manual fue alterada.'}
 if((Get-ScheduledTaskInfo -TaskName $TaskName).LastTaskResult -ne 0){throw 'La comprobacion detenida fallo.'}
 Write-Output 'PASS: Windows inicio automaticamente, recupero un cierre forzado aislado y respeto Detener PM10 en el siguiente ciclo.'
}finally{
 if(Test-Path -LiteralPath $Supervisor){& $TestNode $Supervisor stop --base $TestBase|Out-Null}
 if($TaskName){
  $Task=Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if($Task -and $Task.Actions[0].Arguments -eq ('//B //NoLogo "'+(Join-Path $TestBase 'watchdog.vbs')+'"')){
   Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
   Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  }
 }
 $Resolved=[IO.Path]::GetFullPath($TestBase)
 $ExpectedParent=[IO.Path]::GetFullPath($TestParent).TrimEnd('\')+'\'
 if(-not $Resolved.StartsWith($ExpectedParent,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($Resolved) -notmatch '^PM10-watchdog-test-[a-f0-9]{32}$'){throw 'Ruta de limpieza invalida.'}
 # Only the generated synthetic fixture can be removed; the real PM10 base is excluded.
 if(Test-Path -LiteralPath $Resolved){Remove-Item -LiteralPath $Resolved -Recurse -Force}
}
