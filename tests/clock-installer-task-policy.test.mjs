// Static regressions complement the compiled Windows self-test; no tasks are modified here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const engine=readFileSync(new URL('../local-agents/clock-fleet/windows-installer/InstallerCore.cs',import.meta.url),'utf8');
const ui=readFileSync(new URL('../local-agents/clock-fleet/windows-installer/MuniControlSetup.cs',import.meta.url),'utf8');
const section=(start,end)=>engine.slice(engine.indexOf(start),engine.indexOf(end,engine.indexOf(start)));
test('registration invokes only the pinned local machine installer, never inline commands or a policy bypass',()=>{
 const call=section('static ProcessAnswer RegisterPinnedScript()','public static BackendResult RegisterMachineTask()');
 assert.match(call,/WindowsPowerShell/);assert.match(call,/install-machine-windows\.ps1/);
 assert.match(call,/-NoLogo -NoProfile -NonInteractive -File/);assert.match(call,/-BasePath/);
 assert.doesNotMatch(call,/-Activate|ExecutionPolicy|DownloadString|EncodedCommand| -Command/);
 const body=section('public static BackendResult RegisterMachineTask()','public static BackendResult Stop()');
 for(const guard of ['Need(Admin()', '!current.LegacyDetected', 'current.Installed&&current.Configured', '!current.TaskRegistered', 'ValidateTask(task)', '!(bool)Get(task,"Enabled")'])assert.ok(body.includes(guard),guard);
});
test('stop is graceful, blocks restarts and preserves queues and the running state distinction',()=>{
 const body=section('public static BackendResult Stop()','public static BackendResult Check()');
 assert.match(body,/"stop","--config"/);assert.match(body,/GATEWAY_STOP_REQUESTED/);assert.match(body,/Set\(task,"Enabled",false\)/);
 assert.match(body,/r.TaskRunning\?"STOP_REQUESTED":"STOPPED"/);assert.doesNotMatch(body,/\.Kill\(|Directory\.Delete|File\.Delete|Call\(task,"Stop"/);
});
test('Windows task definition checks identity, exact command, service privilege, boot and overlap policy',()=>{
 const body=section('internal static void ValidateTaskXml','static Inspection Inspect()');
 for(const value of ['S-1-5-19','ServiceAccount','LeastPrivilege','IgnoreNew','BootTrigger','PT0S','WorkingDirectory','DtdProcessing.Prohibit'])assert.ok(body.includes(value),value);
 assert.match(body,/Actions\/\*/);assert.match(engine,/TestSchedulerDefinition\(\);return/);
});
test('registration and stopping require explicit UI actions and preserve backend authorization',()=>{
 for(const value of ['Registrar tarea automática','Detener sin borrar colas','SetupBackend.RegisterMachineTask','SetupBackend.Stop','MessageBoxButtons.YesNo'])assert.ok(ui.includes(value),value);
 assert.match(ui,/taskRegistered = result != null && result.TaskRegistered/);
 assert.match(ui,/readOnly = true, installationActions = false, activationActions = false/);
});
test('the installer still cannot create arbitrary endpoints, tenants or tokens',()=>{
 const install=section('public static BackendResult Install()','public static void ConfirmSourceStopped');
 assert.doesNotMatch(install,/RegisterMachineTask\(|RegisterPinnedScript\(|Set\(task/);
 assert.match(engine,/TASK_ALREADY_REGISTERED/);assert.match(engine,/CONFIGURATION_REQUIRED/);
 assert.doesNotMatch(engine,/\bInvoke-Expression\b|\bSet-ExecutionPolicy\b/);
});
