import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {guideHtml,templates} from '../scripts/build-clock-windows11-kit.mjs';
import {validateOwnership} from '../local-agents/clock-fleet/gateway-config.mjs';

const diagnostic=fs.readFileSync(new URL('../docs/clock-windows11-kit/diagnostico-windows11.ps1',import.meta.url),'utf8').replace(/^\uFEFF/,'');
// Execute the actual parameter declaration and pure projection only. Nothing
// after this boundary runs: no runtime, config, scheduler, network or OS reads.
const boundary=diagnostic.indexOf('$ready=$false');
assert.ok(boundary>0);
const prelude=diagnostic.slice(0,boundary);
const shell=process.platform==='win32'?'powershell.exe':'pwsh';
const probe=spawnSync(shell,['-NoProfile','-NonInteractive','-Command','exit 0'],{windowsHide:true,timeout:15000});
// Vercel's Linux build image need not contain PowerShell. Windows must have its
// builtin runtime; the GitHub Linux runner also exercises this when pwsh exists.
const powershellTest={skip:process.platform!=='win32'&&probe.error?.code==='ENOENT'?'PowerShell is not installed on this build host':false};
function gatewayReport(fleetCount,pm10=false){
 const pairs=Array.from({length:fleetCount+(pm10?1:0)},(_,i)=>{
  const legacy=i===fleetCount;
  const identity={clockId:legacy?null:'qa-'+i,serial:'SYNTHETIC-'+i,stateDir:path.resolve('synthetic-only-queue-'+i)};
  return[{...identity,capture:true},{...identity,capture:false,connectorKey:'synthetic-connector-'+i}];
 }).flat();
 return{schema:'municipal-clock-gateway-preflight.v1',...validateOwnership(pairs),networkTested:false,realWrites:0};
}
function runCases(cases){
 const encoded=Buffer.from(JSON.stringify(cases)).toString('base64');
 const program=`$ProgressPreference='SilentlyContinue'
& {
${prelude}
$cases=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'))|ConvertFrom-Json
$results=@(foreach($case in $cases){
 try {
  $expected=$ExpectedClocks
  if($null -ne $case.expected){$expected=$case.expected}
  $matched=Test-GatewayPreflight $case.report $expected
  [ordered]@{accepted=$true;matched=$matched;defaultExpected=$ExpectedClocks}
 }catch{[ordered]@{accepted=$false;code=(Safe-Code $_.Exception.Message)}}
})
ConvertTo-Json -InputObject $results -Compress -Depth 4
} -BasePath '.'`;
 const r=spawnSync(shell,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(program,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true,timeout:15000});
 assert.ifError(r.error);assert.equal(r.status,0,r.stderr);assert.equal(r.stderr,'');
 return JSON.parse(r.stdout.trim());
}

test('diagnostic counts the actual six identities, pilot and sixteen plus PM10 without adding an extra clock',powershellTest,()=>{
 const six=gatewayReport(5,true);
 assert.equal(six.captureIdentities,6);
 const cases=[{report:six},{report:gatewayReport(1),expected:1},{report:gatewayReport(0,true),expected:1},
  {report:gatewayReport(5),expected:5},{report:gatewayReport(16),expected:16},{report:gatewayReport(16,true),expected:17},
  {report:gatewayReport(5)}];
 const results=runCases(cases);
 assert.deepEqual(results.map(r=>r.matched),[true,true,true,true,true,true,false]);
 assert.ok(results.every(r=>r.accepted&&r.defaultExpected===6));
});

test('diagnostic distinguishes missing delivery and disabled or empty capture from a complete pair',powershellTest,()=>{
 const six=gatewayReport(5,true);
 const results=runCases([{report:{...six,deliveryIdentities:5,allSendersConfigured:false}},
  {report:{...six,allSendersConfigured:false}},{report:gatewayReport(0)}]);
 assert.ok(results.every(r=>r.accepted&&r.matched===false));
});

test('diagnostic rejects malformed numbers, boolean coercion, unexpected schema and unsafe side-effect claims',powershellTest,()=>{
 const six=gatewayReport(5,true);
 const mutations=[null,{...six,schema:'different'},...['6',null,6.5,-1,18].map(captureIdentities=>({...six,captureIdentities})),
  {...six,deliveryIdentities:'6'},{...six,allSendersConfigured:'true'},{...six,allSendersConfigured:null},
  {...six,networkTested:true},{...six,networkTested:'false'},{...six,realWrites:'0'},{...six,realWrites:1},
  Object.fromEntries(Object.entries(six).filter(([key])=>key!=='deliveryIdentities'))];
 const results=runCases(mutations.map(report=>({report})));
 assert.ok(results.every(r=>r.accepted===false&&r.code==='GATEWAY_PREFLIGHT_FAILED'));
 const boundaries=runCases([{report:six,expected:0},{report:six,expected:18}]);
 assert.ok(boundaries.every(r=>r.accepted===false&&r.code==='REVISION_REQUERIDA'));
});

test('kit and installer guides have accurate runtime notices and a count-neutral title',()=>{
 const source='# Parque municipal\n\n<script>synthetic</script>\n\n**Seis equipos** con identidad conservada.';
 const kit=guideHtml(source),installer=guideHtml(source,{installer:true});
 assert.match(kit,/<title>MuniControl · Instalar relojes en Windows 11<\/title>/);
 assert.match(kit,/No incluye claves, datos de fichadas ni Node\.js/);
 assert.match(installer,/<title>MuniControl · Asistente de dispositivos<\/title>/);
 assert.match(installer,/Incluye Node\.js oficial/);
 assert.doesNotMatch(installer,/No incluye claves, datos de fichadas ni Node\.js/);
 for(const html of [kit,installer]){
  assert.doesNotMatch(html,/Instalar cinco|<script>/);
  assert.match(html,/&lt;script&gt;synthetic&lt;\/script&gt;/);
  assert.match(html,/<strong>Seis equipos<\/strong>/);
 }
 assert.throws(()=>guideHtml(source,{installer:'true'}),/KIT_GUIDE_VARIANT_INVALID/);
});

test('generic fleet examples remain disabled and do not invent a PM10 identity or credential',()=>{
 const examples=templates(),gateway=examples['modelos/gateway.example.json'];
 const capture=examples['modelos/fleet-capture.example.json'],delivery=examples['modelos/source-delivery.example.json'];
 assert.equal(capture.clocks.length,5);assert.equal(capture.approved,false);assert.equal(delivery.approved,false);assert.equal(delivery.enabled,false);
 assert.deepEqual(gateway.workers.map(w=>w.kind),['fleet-capture','fleet-source-delivery']);
 assert.ok(gateway.workers.every(w=>w.enabled===false));
 assert.deepEqual(capture.clocks.map(c=>[c.clockId,c.serial,c.enabled]),delivery.clocks.map(c=>[c.clockId,c.serial,c.enabled]));
 assert.ok(capture.clocks.every(c=>c.serial.startsWith('REEMPLAZAR_')&&c.enabled===false));
});
