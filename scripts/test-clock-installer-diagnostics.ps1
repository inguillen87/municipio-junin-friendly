# Synthetic Windows self-test diagnostics. Never registers or runs a task.
param([Parameter(Mandatory=$true)][string]$Executable,[Parameter(Mandatory=$true)][string]$Output)
$ErrorActionPreference = 'Stop'
if (Test-Path -LiteralPath $Output) { throw 'Diagnostic output must be new' }
$assembly = [System.Reflection.Assembly]::LoadFile((Resolve-Path -LiteralPath $Executable).Path)
$type = $assembly.GetType('MuniControl.Setup.SetupBackend', $true)
$answer = $type.GetMethod('SelfTest').Invoke($null, @())
$result = [ordered]@{schema='installer-synthetic-diagnostics.v1';success=$answer.Success;code=$answer.Code;taskRegistered=$false;deviceConnections=$false}
# Inspect precisely the unregistered task definition used by the C# self-test.
$service = New-Object -ComObject 'Schedule.Service'
$service.Connect()
$task = $service.NewTask(0)
$task.Principal.UserId = 'S-1-5-19'
$task.Principal.LogonType = 5
$task.Principal.RunLevel = 0
$task.Settings.Enabled = $false
$task.Settings.MultipleInstances = 2
$task.Settings.ExecutionTimeLimit = 'PT0S'
$null = $task.Triggers.Create(8)
$action = $task.Actions.Create(0)
$action.Path = 'C:\MuniControl-QA\runtime\node.exe'
$action.Arguments = '"C:\MuniControl-QA\app\clock-fleet\gateway.mjs" run --config "C:\MuniControl-QA\config\gateway.json"'
$action.WorkingDirectory = 'C:\MuniControl-QA'
$result.syntheticTaskXml = $task.XmlText
$method = $type.GetMethod('ValidateTaskXml',[System.Reflection.BindingFlags]'Static,NonPublic')
try { $null = $method.Invoke($null,@($task.XmlText,'C:\MuniControl-QA'));$result.definitionValid=$true }
catch { $result.definitionValid=$false;$result.definitionErrorType=$_.Exception.InnerException.GetType().FullName }
$result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $Output -Encoding utf8
Write-Output ('SELF_TEST_CODE=' + $answer.Code)
