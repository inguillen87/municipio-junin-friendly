// Pure programme data only. No QA runner, SQL builder, formatter or database.
import test from 'node:test';
import assert from 'node:assert/strict';
import {census190ProgrammeCandidate} from './fixtures/own-payroll-report-census-program-synthetic.js';
import {ownProgramStructure,ownProgramDefinition,ownProgramHistory} from '../assets/own-payroll-program-model.js';
import {requireExactProgramChanges} from '../assets/own-payroll-program-precision.js';
import {prepareProgramWorkspace} from '../assets/own-payroll-program-workspace-model.js';
import {salaryItems} from '../assets/native-salary-catalog-model.js';
import {bootstrap,hash,uid} from './fixtures/own-payroll-program-synthetic.js';
import {rule,lit} from './fixtures/own-payroll-synthetic.js';

function definition(){return ownProgramStructure({namespaceVersion:'own-payroll-namespaces.v2',periodContextVersion:'own-payroll-period-context.v1',rules:[rule('1',lit('100.20','money'),{rounding:{precision:2,mode:'exact'}}),rule('101',{op:'input',key:'month',unit:'units'},{unit:'units',nature:'auxiliary',rounding:{precision:0,mode:'exact'}})],bindings:[{agreementCode:'1',key:'month',unit:'units',sourceKind:'period_context_fact',sourceField:'monthNumber',onMissing:'error',combine:'single',ruleReference:'Fuente exclusivamente sintética QA190'}],totalsPrecision:2});}
function items(base){return salaryItems(base.rules.map(value=>({kind:value.nature==='auxiliary'?'auxiliary':'concept',agreementCode:'1',categoryCode:null,code:value.code,label:'Concepto exclusivamente sintético QA200',nature:value.nature,unit:value.unit,value:null,precision:6,validFrom:value.validFrom,validUntil:null,dependencies:[],active:true,ruleReference:'Sólo fixture QA200; sin norma municipal'})));}

test('QA200 prepares a distinct proposal and preserves all previous formula data',()=>{
 const base=definition(),before=structuredClone(base),candidate=census190ProgrammeCandidate(base);
 assert.notDeepEqual(candidate,base,'The SQL writer rejects proposing the current definition unchanged');
 assert.notEqual(candidate,base);assert.notEqual(candidate.rules[0],base.rules[0]);assert.deepEqual(base,before);
 const restored=structuredClone(candidate);restored.rules[0].ruleReference=base.rules[0].ruleReference;assert.deepEqual(restored,base,'Only the explicit QA documentary reference may change');
 assert.match(candidate.rules[0].ruleReference,/exclusivamente sintética QA200; sin norma municipal/);
});

test('the distinct QA200 proposal satisfies the existing typed programme and workspace checks',()=>{
 const base=definition(),candidate=census190ProgrammeCandidate(base),catalog=items(base);
 assert.deepEqual(ownProgramDefinition(candidate,catalog),candidate);assert.doesNotThrow(()=>ownProgramHistory(base,candidate));assert.doesNotThrow(()=>requireExactProgramChanges(base,candidate));
 const boot=bootstrap({salaryCatalog:{version:hash('c'),revision:2,items:catalog},program:{version:hash('b'),revision:1,definition:base,salaryVersion:hash('d'),proposalId:uid(1),approvalId:uid(2)}});
 const body=prepareProgramWorkspace(boot,candidate,'Propuesta de censo exclusivamente sintética QA200');
 assert.equal(body.command,'propose');assert.deepEqual(body.program,candidate);assert.notDeepEqual(body.program,base);assert.equal(body.baseVersion,boot.program.version);assert.equal(body.salaryVersion,boot.salaryCatalog.version);assert.equal(body.reviewConfirmed,false);assert.equal(body.proposalId,null);assert.equal(body.proposalSha256,null);assert.deepEqual(boot.program.definition,base);
});

test('a changed or repeated QA190 fixture requires review instead of guessing a different rule',()=>{
 const base=definition();assert.throws(()=>census190ProgrammeCandidate(census190ProgrammeCandidate(base)),/CENSUS190_PROGRAMME_FIXTURE_CHANGED/);
 const missing=structuredClone(base);missing.rules=missing.rules.filter(value=>value.code!=='1');assert.throws(()=>census190ProgrammeCandidate(missing),/CENSUS190_PROGRAMME_FIXTURE_CHANGED/);
 const duplicate=structuredClone(base);duplicate.rules.push(structuredClone(duplicate.rules[0]));assert.throws(()=>census190ProgrammeCandidate(duplicate),/CENSUS190_PROGRAMME_FIXTURE_CHANGED/);
});
