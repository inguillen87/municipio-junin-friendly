// Read-only directory cost probes (S3-7): same access policy and filters as the page, timing-only response.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createInternalDataHandler,DIRECTORY_PROBES} from '../api/internal-data.js';
import {binding,principal,session} from './fixtures/employment-adoption-history-synthetic.js';
import {directoryRows} from './fixtures/native-current-directory-synthetic.js';

function fixture({mode='managed',sourceSnapshot=true}={}){
 const sqlCalls=[],phases=[],failures=[];
 const res={headers:{},setHeader(name,value){this.headers[name]=value;},status(value){this.code=value;return this;},json(value){this.body=value;return this;}};
 const sql={async query(statement,parameters=[]){
  sqlCalls.push({statement,parameters:structuredClone(parameters)});
  if(statement.includes('effective-source:snapshot'))return sourceSnapshot?[{token:'c'.repeat(64)}]:[];
  if(statement.startsWith('SELECT public.native_employee_directory_snapshot'))throw Error('probe must not read the native snapshot');
  if(statement.includes('__total'))return directoryRows(58);
  throw Error('Unexpected synthetic query boundary');
 }};
 const handler=createInternalDataHandler({
  env:{FRIENDLY_GRH_SOURCE_DATABASE:binding.database,FRIENDLY_GRH_COMPANY_ID:String(binding.companyId)},
  requireCompatibleInternalAccess:async()=>({mode,principal:structuredClone(principal)}),
  getInternalSql:async()=>sql,getActionCenterSql:async()=>sql,actionMutationSession:()=>structuredClone(session),
  reportReadFailure:value=>failures.push(value),reportEmployeesPhase:value=>phases.push(value),
 });
 return{res,sqlCalls,phases,failures,run:query=>handler({method:'GET',query},res)};
}
const directoryCall=f=>f.sqlCalls.find(call=>call.statement.includes('__total'));

test('the three probes run only the directory query of their variant and answer with timing and total',async()=>{
 assert.deepEqual([...DIRECTORY_PROBES],['directory-source','directory-lifecycle','directory-current']);
 const expectation={
  'directory-source':{projection:null},
  'directory-lifecycle':{projection:'native_employment_lifecycle_projection_v1'},
  'directory-current':{projection:'native_employee_read_projection_v1'},
 };
 for(const probe of DIRECTORY_PROBES){
  const f=fixture();await f.run({resource:'employees',status:'all',probe,search:'Needle'});
  assert.equal(f.res.code,200,probe);
  assert.deepEqual(Object.keys(f.res.body).sort(),['ok','probe']);
  assert.deepEqual(Object.keys(f.res.body.probe).sort(),['durationMs','query','total']);
  assert.equal(f.res.body.probe.query,probe);assert.equal(f.res.body.probe.total,58);
  assert.ok(Number.isSafeInteger(f.res.body.probe.durationMs)&&f.res.body.probe.durationMs>=0);
  assert.doesNotMatch(JSON.stringify(f.res.body),/legajo|nombre|contractId|token/);
  const directory=directoryCall(f);assert.ok(directory,probe);
  assert.equal(directory.statement.includes(') lifecycle ON true'),expectation[probe].projection!==null,probe);
  for(const projection of ['native_employment_lifecycle_projection_v1','native_employee_read_projection_v1'])
   assert.equal(directory.statement.includes(projection),projection===expectation[probe].projection,probe+' '+projection);
  assert.ok(directory.parameters.includes('%Needle%'),'page filters are kept');
  assert.deepEqual(f.sqlCalls.map(call=>call.statement.includes('__total')?'directory':'source').filter((v,i,a)=>a.indexOf(v)===i),['source','directory']);
  assert.ok(f.phases.some(v=>v.phase==='directory'&&v.event==='end'&&v.outcome==='fulfilled'),'phase trace keeps the directory timing');
  assert.deepEqual(f.failures,[]);
 }
});

test('an unknown probe or a non-managed session is rejected before any directory read',async()=>{
 for(const [probe,mode] of [['directory-all','managed'],['directory-current','legacy']]){
  const f=fixture({mode});await f.run({resource:'employees',status:'all',probe});
  assert.equal(f.res.code,400);assert.equal(f.res.body.code,'DIRECTORY_PROBE_INVALID');
  assert.equal(directoryCall(f),undefined);
 }
});
