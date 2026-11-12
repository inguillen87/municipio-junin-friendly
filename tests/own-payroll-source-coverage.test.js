import test from 'node:test';
import assert from 'node:assert/strict';
import {ownProgramStructure,ownProgramDefinition,ownProgramHistory} from '../assets/own-payroll-program-model.js';
import {normalizeSourceCoveragePolicies,normalizeSourceCoverageProgram,sourceCoverageInventorySha256} from '../assets/own-payroll-source-coverage.js';
import {programWorkspaceChanges,describeProgramPolicy,programPolicyLabel,prepareProgramWorkspace} from '../assets/own-payroll-program-workspace-model.js';
import {reviewPreparedProgramDraft,applyPreparedProgramDraft} from '../assets/own-payroll-program-prepared-draft.js';
import {prepareOwnPayrollProgrammeSource} from '../lib/own-payroll-programme-source-preparation.js';
import {prepareOwnPayrollInput} from '../lib/own-payroll-approved-input.js';
import {createOwnPayrollSnapshot} from '../lib/own-payroll-snapshot.js';
import {programError} from '../lib/internal-own-payroll-program.js';
import {municipalOwnerProgramError} from '../lib/internal-municipal-owner-program.js';
import {runError} from '../lib/internal-own-payroll-run.js';
import {coverageSources,coveragePolicy,coverageRow,excludedCoverageRow,coverageOptions,coverageHash} from './fixtures/own-payroll-source-coverage-synthetic.js';
import {preparedProgramFixture} from './fixtures/own-payroll-program-prepared-synthetic.js';
import {approvedSources} from './fixtures/own-payroll-approved-synthetic.js';
import {fixedApprovedRecord} from './fixtures/payroll-fixed-novelties-synthetic.js';

const is=code=>error=>error?.code===code;
const definition=s=>s.programState.program.definition;
const policy=s=>definition(s).sourceCoveragePolicies[0];
const rehash=p=>{p.inventorySha256=sourceCoverageInventorySha256(p.inventory);p.expectedSourceRows=p.inventory.length;return p;};

test('complete empty native channels preserve the three auxiliaries and all four bindings',()=>{
  const source=coverageSources({withEvent:false}),before=structuredClone(source),input=prepareOwnPayrollInput(source),snapshot=createOwnPayrollSnapshot(input);
  assert.deepEqual(input.rules,ownProgramStructure(definition(source)).rules);
  assert.deepEqual(input.employees[0].inputs.map(r=>r.key),['source100','source102','source105','source110']);
  assert.ok(input.employees[0].inputs.every(r=>r.value==='0.00000000'));
  assert.deepEqual(snapshot.result.rows.filter(r=>r.nature==='auxiliary').map(r=>r.conceptCode).sort(),['379','79','82']);
  assert.deepEqual(source,before);
});

for(const channel of ['monthly_imported','monthly_native','fixed'])for(const code of ['100','102','105','110']){
  for(const [name,extra]of [
    ['positive quantity',{quantity:'2',amount:'0'}],
    ['explicit zero',{quantity:'0',amount:'0'}],
    ['forced zero',{quantity:'0',amount:'0',forced:true}],
    ['nonzero unused amount',{quantity:'2',amount:'900'}],
    ['absent amount',{quantity:'2',amount:null}]
  ])test(`${channel} ${code}: ${name} is blocked before auxiliary or forced consumption`,()=>{
    const source=coverageSources({channel,code,...extra}),before=structuredClone(source);
    assert.throws(()=>prepareOwnPayrollInput(source),is('SOURCE_COVERAGE_EXCLUDED_EVENT'));
    assert.deepEqual(source,before);
  });
}

test('the counterexample exists without coverage: the same event is consumed by an auxiliary',()=>{
  const source=coverageSources(),p=definition(source);delete p.sourceCoverageVersion;delete p.sourceCoveragePolicies;
  const input=prepareOwnPayrollInput(source);
  assert.equal(input.employees[0].inputs.find(r=>r.key==='source102').value,'2.00000000');
  assert.equal(createOwnPayrollSnapshot(input).result.rows.find(r=>r.conceptCode==='79').amount,'2.00');
});

for(const [name,change,expected]of [
  ['monthly completeness',s=>s.monthly.complete=false,'SOURCE_COVERAGE_CHANNEL_INCOMPLETE'],
  ['native channel omitted',s=>delete s.monthly.nativeBatches,'SOURCE_COVERAGE_CHANNEL_INCOMPLETE'],
  ['native channel not an array',s=>s.monthly.nativeBatches=null,'SOURCE_COVERAGE_CHANNEL_INCOMPLETE'],
  ['fixed list truncated',s=>s.fixed.list.data.total=1,'FIXED_CONTRACT_INVALID'],
  ['month outside declaration',s=>{policy(s).validUntil='2026-10';s.period='2026-11';},'SOURCE_COVERAGE_POLICY_REQUIRED'],
  ['another liquidation type',s=>s.liquidationType='sac','SOURCE_COVERAGE_POLICY_REQUIRED'],
  ['unknown source code',s=>{s.monthly.batches=coverageSources({code:'900'}).monthly.batches;},'SOURCE_COVERAGE_UNKNOWN_EVENT']
])test(name+' is not interpreted as a successful absence proof',()=>{
  const source=coverageSources({withEvent:false});change(source);
  if(name==='fixed list truncated')assert.throws(()=>prepareOwnPayrollInput(source));
  else assert.throws(()=>prepareOwnPayrollInput(source),is(expected));
});

test('legacy source handling remains unchanged when the programme has no coverage extension',()=>{
  const source=approvedSources(1),input=prepareOwnPayrollInput(source);
  assert.equal(input.employees[0].inputs.find(r=>r.key==='addition').value,'20.00000000');
  source.monthly.batches[0].rows[0].conceptSourceId='900';
  assert.throws(()=>prepareOwnPayrollInput(source),is('SOURCE_UNUSED'));
});

for(const [name,change,expected]of [
  ['missing row',p=>p.inventory.pop(),'SOURCE_COVERAGE_INCOMPLETE'],
  ['changed source row pin',p=>p.inventory[0].sourceRowSha256=coverageHash('changed'),'SOURCE_COVERAGE_INVENTORY_CHANGED'],
  ['duplicate source row',p=>{p.inventory.push(p.inventory[0]);rehash(p);},'SOURCE_COVERAGE_INVENTORY_CHANGED'],
  ['diagnostic-only disposition',p=>{p.inventory[1].kind='diagnostic_only';},'SOURCE_COVERAGE_EXCLUSION_UNRESOLVED'],
  ['unresolved condition',p=>{p.inventory[1].basis.kind='condition_false';},'SOURCE_COVERAGE_EXCLUSION_UNRESOLVED'],
  ['lowercase activation',p=>{p.inventory[1].basis.sourceActivation='n';},'SOURCE_COVERAGE_EXCLUSION_UNRESOLVED'],
  ['automatic activation labelled manual',p=>{p.inventory[1].basis.sourceActivation='A';},'SOURCE_COVERAGE_EXCLUSION_UNRESOLVED'],
  ['missing documentary proof',p=>{delete p.inventory[1].basis.evidenceSha256;},'SOURCE_COVERAGE_EXCLUSION_UNRESOLVED']
])test(name+' cannot become a complete source programme by re-counting definitions',()=>{
  const s=coverageSources({withEvent:false});change(policy(s));
  assert.throws(()=>ownProgramStructure(definition(s)),is(expected));
});

test('an omitted payable rule and a fake input are rejected independently of inventory cardinality',()=>{
  let s=coverageSources({withEvent:false});policy(s).inventory[0]=excludedCoverageRow('1');rehash(policy(s));
  assert.throws(()=>ownProgramStructure(definition(s)),is('SOURCE_COVERAGE_ROLE_CONFLICT'));
  s=coverageSources({withEvent:false});policy(s).inventory[1]=coverageRow('100','input',{bindingKeys:['source102']});
  assert.throws(()=>ownProgramStructure(definition(s)),is('SOURCE_COVERAGE_BINDING_REQUIRED'));
  s=coverageSources({withEvent:false});policy(s).inventory[0]=coverageRow('2');rehash(policy(s));policy(s).inventory.sort((a,b)=>a.code<b.code?-1:1);rehash(policy(s));
  assert.throws(()=>ownProgramStructure(definition(s)),is('SOURCE_COVERAGE_RULE_REQUIRED'));
});

test('documented static bases need their full declaration; method 29 and partial dispatch are not guessed',()=>{
  const original=policy(coverageSources({withEvent:false}));
  for(const basis of [
    {kind:'source_dispatch_disabled',methodCode:'0',methodRowSha256:coverageHash('method'),nonAmountEffects:'none',phaseReviewSha256:coverageHash('phases'),evidenceSha256:coverageHash('evidence')},
    {kind:'outside_liquidation_type',applicableLiquidationTypes:['sac'],dispatchScope:'whole_definition',evidenceSha256:coverageHash('types')}
  ]){
    const p=structuredClone(original);p.inventory[1].basis=basis;
    assert.equal(normalizeSourceCoveragePolicies([p])[0].inventory[1].basis.kind,basis.kind);
    if(basis.kind==='source_dispatch_disabled')p.inventory[1].basis.methodCode='29';else p.inventory[1].basis.dispatchScope='amount_only';
    assert.throws(()=>normalizeSourceCoveragePolicies([p]),is('SOURCE_COVERAGE_EXCLUSION_UNRESOLVED'));
  }
});

test('a documentary retirement preserves both pins and rejects approved events including zero',()=>{
  const s=coverageSources({code:'296',quantity:'0'}),p=policy(s);
  p.inventory.push(coverageRow('296','excluded',{basis:{kind:'documented_retirement',decisionSha256:coverageHash('existing retirement decision'),evidenceSha256:coverageHash('retirement provenance')}}));
  p.inventory.sort((a,b)=>a.code<b.code?-1:1);rehash(p);
  assert.throws(()=>prepareOwnPayrollInput(s),is('SOURCE_COVERAGE_EXCLUDED_EVENT'));
  delete p.inventory.find(r=>r.code==='296').basis.decisionSha256;
  assert.throws(()=>ownProgramStructure(definition(s)),is('SOURCE_COVERAGE_EXCLUSION_UNRESOLVED'));
});

test('a pending fixed proposal stays pending and is not fabricated into an approved economic event',()=>{
  const s=coverageSources({withEvent:false}),r=fixedApprovedRecord(1,{conceptSourceId:'102',validFrom:'2026-10-01',validTo:null});
  r.subject=structuredClone(coverageSources().monthly.batches[0].rows[0].subject);
  r.version=1;r.canPropose=false;r.pending={...r.approved,review:null};r.approved=null;r.latest=r.pending;
  s.fixed.list.data.rows=[r];s.fixed.list.data.total=1;
  const before=structuredClone(s),input=prepareOwnPayrollInput(s);
  assert.equal(input.employees[0].inputs.find(r=>r.key==='source102').value,'0.00000000');
  assert.deepEqual(s,before);assert.equal(s.fixed.list.data.rows[0].approved,null);
});

test('native aliases are additional documented inputs, never counterfeit source inventory rows',()=>{
  const s=coverageSources({code:'901000100'}),p=definition(s),entry={code:'901000100',evidenceSha256:coverageHash('synthetic native alias'),bindingKeys:['source100']};
  p.sourceCoveragePolicies[0].nativeInputs=[entry];p.bindings.find(b=>b.key==='source100').sourceCode=entry.code;
  s.programState.salaryCatalog.items.push({...s.programState.salaryCatalog.items.find(r=>r.code==='100'),code:entry.code});
  const input=prepareOwnPayrollInput(s);
  assert.equal(input.employees[0].inputs.find(r=>r.key==='source100').value,'2.00000000');
  assert.equal(p.sourceCoveragePolicies[0].inventory.length,5);
  entry.bindingKeys=['source102'];assert.throws(()=>ownProgramStructure(p),is('SOURCE_COVERAGE_BINDING_REQUIRED'));
});

test('total dispositions keep their monetary auxiliary and still reject source events',()=>{
  const s=coverageSources({code:'999'}),p=definition(s);
  p.rules.push({...structuredClone(p.rules[0]),code:'800000999',nature:'auxiliary'});
  s.programState.salaryCatalog.items.push({...s.programState.salaryCatalog.items.find(r=>r.code==='1'),code:'800000999',kind:'auxiliary',nature:'auxiliary'});
  const row=coverageRow('999','total',{targetCode:'800000999'});policy(s).inventory.push(row);rehash(policy(s));
  ownProgramDefinition(p,s.programState.salaryCatalog.items);
  assert.throws(()=>prepareOwnPayrollInput(s),is('SOURCE_COVERAGE_EXCLUDED_EVENT'));
  row.targetCode='379';assert.throws(()=>ownProgramStructure(p),is('SOURCE_COVERAGE_TOTAL_REQUIRED'));
});

test('the cross-boundary inspection budget rejects oversized evidence without truncating it',()=>{
  const s=coverageSources({withEvent:false}),p=definition(s),inventory=[coverageRow('1'),...Array.from({length:999},(_,i)=>excludedCoverageRow(String(i+2)))];
  p.sourceCoveragePolicies=[coveragePolicy(inventory)];
  p.rules=[p.rules[0],...Array.from({length:51},(_,i)=>{
    const month=2026*12+9+i,y=Math.floor(month/12),m=month%12+1,period=String(y)+'-'+String(m).padStart(2,'0');
    return{...structuredClone(p.rules[1]),validFrom:period,validUntil:period};
  })];
  const before=structuredClone(p);
  assert.throws(()=>normalizeSourceCoverageProgram(p),is('SOURCE_COVERAGE_LIMIT'));
  assert.deepEqual(p,before);
});

test('a changed disposition survives the ordinary proposal comparison with counts and full evidence',()=>{
  const source=coverageSources({withEvent:false}),before=definition(source),after=structuredClone(before);
  after.sourceCoveragePolicies[0].inventory[1].basis.evidenceSha256=coverageHash('another reviewed document');
  const diff=programWorkspaceChanges(before,after);
  assert.equal(diff.changed,1);assert.ok(diff.rows.filter(r=>r.kind!=='policies').every(r=>r.status==='unchanged'));
  assert.equal(diff.rows.find(r=>r.key==='sourceCoveragePolicies').status,'modified');
  const text=describeProgramPolicy('sourceCoveragePolicies',after.sourceCoveragePolicies);
  assert.match(programPolicyLabel('sourceCoveragePolicies'),/Cobertura/);
  assert.match(text,/5 filas de origen/);assert.match(text,/Concepto excluido con guarda de novedades: 4/);
  assert.ok(text.includes(after.sourceCoveragePolicies[0].inventory[1].basis.evidenceSha256));
  assert.throws(()=>ownProgramHistory(before,after),is('PROGRAM_HISTORY_REQUIRED'));
});

test('successor policies preserve earlier source evidence and enforce all rule validity boundaries',()=>{
  const source=coverageSources({withEvent:false}),before=ownProgramDefinition(definition(source),source.programState.salaryCatalog.items),after=structuredClone(before);
  const previous=after.sourceCoveragePolicies[0],successor=structuredClone(previous);
  Object.assign(successor,{policyId:'synthetic-source-coverage-2027',validFrom:'2027-08',supersedes:{policyId:previous.policyId,policySha256:coverageHash(previous)}});
  after.sourceCoveragePolicies.push(successor);
  ownProgramStructure(after);ownProgramHistory(before,after);
  for(const period of ['2027-08','2027-09','2027-10','2027-11','2027-12','2028-01','2028-12']){
    const s=coverageSources({withEvent:false});s.programState.program.definition=structuredClone(after);s.period=period;s.fixed.list.data.periodMonth=period+'-01';s.fixed.export.data.periodMonth=period+'-01';
    assert.equal(prepareOwnPayrollInput(s).period,period);
  }
  const stopped=structuredClone(after);stopped.rules[0].validUntil='2027-10';
  assert.throws(()=>ownProgramStructure(stopped),is('SOURCE_COVERAGE_RULE_REQUIRED'));
  const stale=structuredClone(after);stale.sourceCoveragePolicies[1].supersedes.policySha256=coverageHash('wrong');
  assert.throws(()=>ownProgramStructure(stale),is('POLICY_PREDECESSOR_CHANGED'));
  const dropped=structuredClone(after);delete dropped.sourceCoverageVersion;delete dropped.sourceCoveragePolicies;
  assert.throws(()=>ownProgramHistory(before,dropped),is('PROGRAM_HISTORY_REQUIRED'));
});

function preparedSource(){
  const raw=preparedProgramFixture().input,d=raw.definitions[0];
  d.precision=2;d.rounding={precision:2,mode:'half_up'};d.expression={op:'literal',unit:'money',value:'10.25'};
  for(const items of [raw.salary.catalog.items,raw.programme.salaryCatalog.items])items.find(r=>r.code===d.code).precision=2;
  raw.totalsPrecision=2;
  raw.programmeOptions={...raw.programmeOptions,...coverageOptions(coveragePolicy([coverageRow(d.code),excludedCoverageRow('999')],{agreementCode:d.agreementCode,validFrom:d.validFrom}))};
  return raw;
}
test('a complete typed source enters the normal draft/import/propose circuit with coverage retained',async()=>{
  const raw=preparedSource(),before=structuredClone(raw),prepared=prepareOwnPayrollProgrammeSource(raw);
  assert.deepEqual(prepared.incidents,[]);assert.equal(prepared.status,'proposal_draft');
  const blank={rules:[],bindings:[],totalsPrecision:null};
  const plan=await reviewPreparedProgramDraft(raw.salary,raw.programme,blank,JSON.stringify(prepared));
  const draft=await applyPreparedProgramDraft(raw.salary,raw.programme,blank,plan);
  const command=prepareProgramWorkspace(raw.programme,draft,'Synthetic reviewed coverage proposal, no municipal approval');
  assert.equal(command.command,'propose');assert.equal(command.reviewConfirmed,false);
  assert.deepEqual(command.program.sourceCoveragePolicies,raw.programmeOptions.sourceCoveragePolicies);
  for(const flag of ['approved','executable','payrollCalculated','payrollPosted'])assert.equal(prepared[flag],false);
  assert.deepEqual(raw,before);
});
test('missing individual facts are not a typed-source incompleteness condition',()=>{
  const raw=preparedSource(),d=raw.definitions[0];
  d.expression={op:'multiply',left:{op:'literal',unit:'money',value:'10'},right:{op:'divide',left:{op:'source',reference:'L[401]',unit:'units'},right:{op:'literal',unit:'units',value:'1'}}};
  raw.programmeOptions.employmentFactsVersion='own-salary-seniority.v1';
  raw.bindings=[{agreementCode:d.agreementCode,reference:'L[401]',sourceSha256:coverageHash('synthetic employment evidence'),binding:{agreementCode:d.agreementCode,key:'recognizedSeniority',unit:'units',sourceKind:'employment_fact',sourceField:'seniorityYears',onMissing:'error',combine:'single',ruleReference:'Synthetic explicit native fact; no employee value supplied'}}];
  const prepared=prepareOwnPayrollProgrammeSource(raw);
  assert.equal(prepared.status,'proposal_draft');assert.deepEqual(prepared.incidents,[]);
  assert.equal(prepared.completeness.sourceDeclaredComplete,true);
  assert.equal(prepared.draft.programme.bindings[0].onMissing,'error');
});
test('coverage never sets an incomplete input source to true or admits unresolved source dispositions',()=>{
  let raw=preparedSource();raw.source.complete=false;let prepared=prepareOwnPayrollProgrammeSource(raw);
  assert.equal(raw.source.complete,false);assert.equal(prepared.completeness.sourceDeclaredComplete,false);
  assert.ok(prepared.incidents.some(i=>i.code==='SOURCE_SET_INCOMPLETE'));assert.equal(prepared.draft.programme,null);
  raw=preparedSource();raw.programmeOptions.sourceCoveragePolicies[0].inventory[1].basis.kind='diagnostic_only';
  prepared=prepareOwnPayrollProgrammeSource(raw);
  assert.ok(prepared.incidents.some(i=>i.code==='PROGRAMME_CURRENT_CONTRACT_REJECTED'&&i.path==='SOURCE_COVERAGE_EXCLUSION_UNRESOLVED'));
  assert.equal(prepared.draft.programme,null);
});

test('SQL programme coverage failures retain actionable 422 errors through both normal and owner paths',()=>{
  for(const code of ['LIMIT','INCOMPLETE','INVENTORY_CHANGED','EXCLUSION_UNRESOLVED','BINDING_REQUIRED','ROLE_CONFLICT']){
    const token='OWN_PROGRAM_SOURCE_COVERAGE_'+code;
    for(const adapt of [programError,municipalOwnerProgramError]){const error=adapt(new Error(token));assert.equal(error.code,token);assert.equal(error.status,422);assert.ok(!error.message.includes('No se confirmó'));}
  }
});
test('SQL capture failures preserve distinct coverage causes without exposing source rows',()=>{
  for(const code of ['POLICY_REQUIRED','CHANNEL_INCOMPLETE','UNKNOWN_EVENT','EXCLUDED_EVENT']){
    const token='OWN_RUN_SOURCE_COVERAGE_'+code,error=runError(new Error(token));assert.equal(error.code,token);assert.equal(error.status,422);
  }
});
