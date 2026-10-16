import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {unzipSync,strFromU8} from 'fflate';
const root=process.cwd(),fromRoot=file=>import(pathToFileURL(path.join(root,file)));
const {roster}=await fromRoot('tests/fixtures/native-roster-synthetic.js');
const {currentRoster,currentSnapshot}=await fromRoot('tests/fixtures/native-current-directory-synthetic.js');
const {principal,session}=await fromRoot('tests/fixtures/employment-adoption-history-synthetic.js');
const {bootstrap,hash}=await fromRoot('tests/fixtures/own-payroll-program-synthetic.js');

// Bundle the actual reader, model and exporters together so their verification
// WeakSet is shared. Only the SQL transport is synthetic; no DB or HTTP runs.
const candidate=fs.readFileSync(new URL('../assets/native-roster-model.js',import.meta.url),'utf8');
const bundle=await build({stdin:{contents:"export {nativeRoster} from './native-roster-model.js';export {ownPayrollReadiness,ownPayrollReadinessAllowsNew} from './own-payroll-readiness-model.js';export {nativeRosterCsv,nativeRosterXlsx} from './native-roster-export.js';export {internalNativeRoster,NATIVE_ROSTER_V2_SQL} from '../lib/internal-native-roster.js';",sourcefile:'native-roster-adopted-sex-entry.js',resolveDir:path.join(root,'assets')},bundle:true,write:false,format:'cjs',platform:'node',logLevel:'silent',plugins:[{name:'candidate-roster-model',setup(b){
 b.onResolve({filter:/native-roster-model\.js$/},()=>({path:'native-roster-model.js',namespace:'candidate-roster'}));
 b.onLoad({filter:/.*/,namespace:'candidate-roster'},()=>({contents:candidate,resolveDir:path.join(root,'assets'),loader:'js'}));
}}]});
const module={exports:{}},nodeRequire=createRequire(import.meta.url),context=vm.createContext({module,exports:module.exports,Buffer,TextEncoder,Uint8Array,ArrayBuffer,URLSearchParams,console,require:name=>{assert.equal(name,'node:crypto');return nodeRequire(name);}});
vm.runInContext('globalThis.structuredClone=value=>JSON.parse(JSON.stringify(value))',context);
new vm.Script(bundle.outputFiles[0].text).runInContext(context);
const {nativeRoster,nativeRosterCsv,nativeRosterXlsx,internalNativeRoster,NATIVE_ROSTER_V2_SQL,ownPayrollReadiness,ownPayrollReadinessAllowsNew}=module.exports;
const clone=value=>vm.runInContext('JSON.parse('+JSON.stringify(JSON.stringify(value))+')',context);
const raw=value=>{const{origin,complete,filters,snapshot,...rest}=value;return rest;};
function completeSynthetic(){
 const value=roster(851),scope=currentRoster().scope;
 return{...value,version:'native-roster.v2',scope,counts:{...value.counts,unknown:0},rows:value.rows.map((r,i)=>({...r,recordKind:'adopted',sexCode:i===0?'Femenino':i===1?'Masculino':null}))};
}
function mockSql(value,{changeToken=false,denied=false}={}){
 const calls=[];let snapshots=0;
 return{calls,query:async(statement,parameters)=>{
  calls.push({statement,parameters});
  if(statement===NATIVE_ROSTER_V2_SQL)return[{result:clone(raw(value))}];
  assert.equal(statement,'SELECT public.native_employee_directory_snapshot_v1($1::jsonb) AS result');
  snapshots++;if(denied)throw Error('NATIVE_EMPLOYEE_FORBIDDEN');
  return[{result:clone(currentSnapshot(value.total,changeToken&&snapshots===2?{token:'b'.repeat(64)}:{}))}];
 }};
}

for(const label of ['Femenino','Masculino'])test('adopted v2 keeps the canonical stored label exactly: '+label,()=>{
 const source=currentRoster();source.rows[0].sexCode=label;const result=nativeRoster(source);
 assert.equal(result.rows[0].sexCode,label);assert.equal(source.rows[0].sexCode,label);assert.equal(result.total,57);assert.ok(Object.isFrozen(result.rows[0]));
});

test('v1 and own-hire v2 retain the original F/M/X/null vocabulary',()=>{
 for(const label of ['Femenino','Masculino','']){
  const v1=roster(1);v1.rows[0].sexCode=label;assert.throws(()=>nativeRoster(v1));
  const v2=currentRoster();v2.rows[3].sexCode=label;assert.throws(()=>nativeRoster(v2));
 }
 for(const sex of ['F','M','X',null]){const v=currentRoster();v.rows[3].sexCode=sex;assert.equal(nativeRoster(v).rows[3].sexCode,sex);}
});

test('adopted labels have the canonical16-character bound and reject controls or wrong types without normalization',()=>{
 for(const sex of [null,'','F','M','X','Femenino','Masculino','X'.repeat(16),' Femenino ']){const v=currentRoster();v.rows[0].sexCode=sex;assert.equal(nativeRoster(v).rows[0].sexCode,sex);}
 for(const sex of ['X'.repeat(17),7,false,{},[],undefined,...Array.from({length:32},(_,i)=>'F'+String.fromCharCode(i)),String.fromCharCode(127)]){const v=currentRoster();v.rows[0].sexCode=sex;assert.throws(()=>nativeRoster(v));}
});

test('the real v2 server reader retains all851 synthetic rows and both source labels after complete cohort checks',async()=>{
 const value=completeSynthetic(),sql=mockSql(value),result=await internalNativeRoster(sql,{query:{resource:'nativeroster',schema:'2'}},principal,session);
 assert.equal(result.status,200);assert.equal(sql.calls.length,3);assert.equal(sql.calls.filter(c=>c.statement===NATIVE_ROSTER_V2_SQL).length,1);
 assert.equal(result.payload.data.total,851);assert.equal(result.payload.data.people,851);assert.equal(result.payload.data.rows.length,851);assert.equal(result.payload.data.rows[0].sexCode,'Femenino');assert.equal(result.payload.data.rows[1].sexCode,'Masculino');assert.equal(result.payload.data.rows[850].contractId,value.rows[850].contractId);
 assert.ok(sql.calls.every(c=>!/^\s*(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|GRANT)\b/i.test(c.statement)));
});

test('CSV and Excel preserve all851 source rows and literal labels, without inventing normalized identity values',()=>{
 const d=nativeRoster(completeSynthetic()),csv=nativeRosterCsv(d),zip=unzipSync(new Uint8Array(nativeRosterXlsx(d))),sheet=strFromU8(zip['xl/worksheets/sheet1.xml']);
 assert.equal(csv.split('\r\n').length,853);assert.match(csv,/"Femenino"/);assert.match(csv,/"Masculino"/);assert.match(sheet,/autoFilter ref="A1:T852"/);assert.match(sheet,/>Femenino<\/t>/);assert.match(sheet,/>Masculino<\/t>/);assert.doesNotMatch(sheet,/<f[\s>]/);
});

test('malformed last row, partial cohort, duplicate or stale scope rejects the whole response without removing a row',async()=>{
 for(const mutate of [v=>v.rows[850].sexCode='X'.repeat(17),v=>v.rows[850].sexCode='M\n',v=>v.rows.pop(),v=>v.rows[850].contractId=v.rows[0].contractId]){
  const v=completeSynthetic();mutate(v);await assert.rejects(internalNativeRoster(mockSql(v),{query:{schema:'2'}},principal,session));
 }
 await assert.rejects(internalNativeRoster(mockSql(completeSynthetic(),{changeToken:true}),{query:{schema:'2'}},principal,session),{code:'NATIVE_ROSTER_CHANGED'});
});

test('revocation is still checked before the roster query and source sex changes affect the canonical response fingerprint',async()=>{
 const denied=mockSql(completeSynthetic(),{denied:true});await assert.rejects(internalNativeRoster(denied,{query:{schema:'2'}},principal,session));assert.equal(denied.calls.length,1);assert.notEqual(denied.calls[0].statement,NATIVE_ROSTER_V2_SQL);
 const before=completeSynthetic(),after=completeSynthetic();after.rows[0].sexCode='F';
 const a=await internalNativeRoster(mockSql(before),{query:{schema:'2'}},principal,session),b=await internalNativeRoster(mockSql(after),{query:{schema:'2'}},principal,session);assert.notEqual(a.payload.data.snapshot,b.payload.data.snapshot);assert.equal(a.payload.data.rows[0].sexCode,'Femenino');
});

test('CALCULAR readiness sees all851 adopted rows and still requires the actual approved program rather than inventing eligibility',()=>{
 const roster=completeSynthetic(),values={run:{version:'own-payroll-bootstrap.v2',scopeVersion:hash('a'),programVersion:hash('b'),canCalculate:true,runs:[],complete:true},program:bootstrap(),roster};
 const result=ownPayrollReadiness(clone(values),roster.scope.tenantId);assert.equal(result.rosterTotal,851);assert.equal(result.state,'program_required');assert.equal(result.catalogRevision,1);assert.equal(result.programRevision,0);assert.equal(ownPayrollReadinessAllowsNew(result),false);assert.match(result.description,/programa de cálculo propio aprobado/);
 values.roster.rows[850].sexCode='X'.repeat(17);assert.throws(()=>ownPayrollReadiness(clone(values),roster.scope.tenantId));
});
