// The cargo is written by registration and by rectification and conserved later by the payroll capture and the receipt.
// Every title a writer accepts must also be accepted by that reader, so one title can never stop a monthly liquidation.
// Synthetic values only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {employmentJobTitleReasons,employmentJobTitleInput,EMPLOYMENT_JOB_TITLE_MAX_UNITS} from '../assets/employment-job-title-contract.js';
import {ownEmploymentJobTitleReasons} from '../assets/own-payroll-employment-print-facts.js';
import {employeeDraft,EmployeeInputError} from '../assets/native-employee-contract.js';
import {CHANGE_VERSION,ChangeInputError,changeValues,changeProposalInput,validateChangeBootstrap} from '../assets/native-employment-change-model.js';
import {CONTRACT,ID,draft,catalog as sourceCatalog} from './fixtures/native-employee-synthetic.js';

const today='2026-11-15';
const baseVersion='b'.repeat(64),scopeVersion='d'.repeat(64),identityToken='e'.repeat(64),catalogVersion='c'.repeat(64);
const values=(jobTitle='Administrativo QA')=>({agreementCode:'1',categoryCode:'6',organizationId:'7',sectorCode:'2',jobTitle});
const proposal=jobTitle=>({contractId:CONTRACT,identityToken,scopeVersion,baseVersion,catalogVersion,values:values(jobTitle),legalReference:'Resolución sintética QA',reason:'Rectificación administrativa sintética QA'});
const labels=()=>({agreementName:'Convenio QA',categoryName:'Clase QA',organizationName:'Sector QA',sectorName:'Repartición QA'});
const subject=()=>({contractId:CONTRACT,legajo:'5001',employeeName:'PERSONA SINTÉTICA QA',identityToken,sourceCutoff:null,origin:'MUNICONTROL',registrationId:ID,registeredAt:'2026-09-23T12:00:00Z'});
const bootstrap=jobTitle=>({version:CHANGE_VERSION,scopeVersion,subject:subject(),employment:{values:values(jobTitle),labels:labels(),version:baseVersion,revision:0,appliedAt:null},
 catalog:{items:sourceCatalog.items.map((r,i)=>({...r,key:`source-${i}`,agreementCode:r.agreementCode??null})),version:catalogVersion,origin:'GRH',revision:0,publishedAt:null},
 permissions:{canPropose:true,canReview:true},proposals:[],historyTruncated:false});
const registered=jobTitle=>employeeDraft(draft({jobTitle}),today).jobTitle;
const rectified=jobTitle=>changeProposalInput(proposal(jobTitle)).values.jobTitle;
const writers=[['registration',registered,EmployeeInputError],['rectification',rectified,ChangeInputError]];

test('the payroll reader uses the very same contract as the writers',()=>{
 assert.equal(ownEmploymentJobTitleReasons,employmentJobTitleReasons);
 assert.equal(EMPLOYMENT_JOB_TITLE_MAX_UNITS,120);
});

test('both writers reject the titles that the capture and the receipt would refuse later',()=>{
 const refused=[['Cargo‮','bidirectional_controls'],['Jefe⁦A⁩','bidirectional_controls'],['Chofer\u0085B','control_characters'],
  ['😀'.repeat(61),'utf16_length'],['A'.repeat(121),'utf16_length']];
 for(const [name,write,error]of writers)for(const [value,reason]of refused){
  assert.deepEqual(employmentJobTitleReasons(value).slice(0,1),[reason],value);
  assert.throws(()=>write(value),e=>e instanceof error,name+' '+reason);
 }
});

test('both writers keep accepting what they accepted before and store what the reader accepts',()=>{
 const accepted=[['','' ],['Chofer de camión','Chofer de camión'],['😀'.repeat(60),'😀'.repeat(60)],['A'.repeat(120),'A'.repeat(120)],
  ['  Técnico ','Técnico'],['Jefa de área','Jefa de área'],['Técnico… “Turno B” – Nº 3','Técnico… “Turno B” – Nº 3'],["O'Connor","O'Connor"]];
 for(const [name,write]of writers)for(const [input,stored]of accepted){
  const value=write(input);assert.equal(value,stored,name+' '+JSON.stringify(input));
  if(value!=='')assert.deepEqual(employmentJobTitleReasons(value),[],name+' '+JSON.stringify(input));
 }
});

test('the input helper normalizes like the writers did and never repairs a refused title',()=>{
 assert.deepEqual(employmentJobTitleInput('  Técnico  '),{value:'Técnico'});
 assert.deepEqual(employmentJobTitleInput(''),{value:''});
 const refused=employmentJobTitleInput('Cargo‮');
 assert.equal(refused.value,undefined);assert.deepEqual(refused.reasons,['bidirectional_controls']);
 assert.ok(!refused.message.includes('Cargo'));
 assert.equal(employmentJobTitleInput(null).value,undefined);
});

test('a stored legacy title can still be opened and corrected; only a new proposal must meet the contract',()=>{
 for(const legacy of ['Cargo‮','😀'.repeat(61)]){
  assert.equal(changeValues(values(legacy)).jobTitle,legacy);
  assert.doesNotThrow(()=>validateChangeBootstrap(bootstrap(legacy),CONTRACT));
  assert.equal(rectified('Cargo corregido'),'Cargo corregido');
  assert.throws(()=>rectified(legacy),ChangeInputError);
 }
});

test('every single character a writer admits in a title is admitted by the payroll reader (all code points to U+3100 and the specials block, sampled elsewhere)',()=>{
 let checked=0;
 for(let cp=1;cp<=0x10ffff;cp++){
  if(cp>=0xd800&&cp<=0xdfff)continue;
  if(cp>0x3100&&cp<0xfe00&&cp%61)continue; // dense below U+3100 and in the specials block, sampled in between
  if(cp>0xffff&&cp%257)continue;
  const c=String.fromCodePoint(cp);
  for(const value of ['A'+c+'B',c+'A','A'+c]){
   for(const [name,write]of writers){
    let stored;try{stored=write(value);}catch{continue;}
    checked++;
    if(stored!=='')assert.deepEqual(employmentJobTitleReasons(stored),[],name+' U+'+cp.toString(16));
   }
  }
 }
 assert.ok(checked>20000,String(checked));
});

test('the new pure module is shipped with the static build',()=>{
 assert.ok(readFileSync(new URL('../scripts/build-friendly.mjs',import.meta.url),'utf8').includes("'assets/employment-job-title-contract.js'"));
});
