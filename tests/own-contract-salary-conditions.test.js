import test from 'node:test';
import assert from 'node:assert/strict';
import { salaryConditionsDefinition as definition, salaryConditionsItems as items, salaryConditionsSource as source, salaryConditionsCommand as command, salaryConditionsBootstrap as bootstrap, salaryConditionsConfiguration as configuration, salaryConditionsHash as hash, salaryConditionsDetail as detail, prepareSalaryConditions as prepare, decideSalaryConditions as decide, salaryConditionsReceipt as receipt, salaryConditionsCapture as capture } from '../assets/own-contract-salary-conditions-model.js';
import { conditionsId as id, conditionsHash as h, conditionsReason as reason, syntheticConditionsDefinition as def, syntheticConditionsItems as rows, syntheticConditionsSource as src, syntheticConditionsBootstrap as boot, syntheticConditionsCommand as body, syntheticConditionsDetail as proposal, syntheticConditionsReceipt as acknowledgement } from './fixtures/own-contract-salary-conditions-synthetic.js';
const period='2026-10', clone=v=>structuredClone(v);
const fails=(fn,code)=>assert.throws(fn,e=>e.code===code);

test('partial seniority, title absence and unhealthy-work absence are separate facts',()=>{
 const v=definition(def(),period); assert.equal(v.partialSeniorityYears,null);assert.equal(v.title.status,'not_reported');assert.equal(v.unhealthyWork,null);
 const none=definition({...def(),partialSeniorityYears:'0',title:{status:'none',code:null,percentage:null},unhealthyWork:false},period);
 assert.equal(none.partialSeniorityYears,'0');assert.equal(none.title.percentage,null);assert.equal(none.unhealthyWork,false);
 assert.throws(()=>definition({...def(),totalSeniorityYears:'12'},period));
});
test('title code and exact percentage retain their original meaning and precision',()=>{
 const title={status:'declared',code:'056',percentage:'12.00000001'};
 assert.deepEqual(definition({...def(),title},period).title,title);
 assert.equal(definition({...def(),title:{...title,percentage:'0.000'}},period).title.percentage,'0.000');
 assert.equal(definition({...def(),title:{...title,percentage:null}},period).title.percentage,null);
 assert.equal(definition({...def(),title:{...title,percentage:'125.25'}},period).title.percentage,'125.25');
 assert.notEqual(definition({...def(),title},period).title.code,'58');
});
test('no-title declarations never acquire an invented zero percentage or code',()=>{
 for(const status of ['none','not_reported'])for(const patch of [{code:'0'},{percentage:'0'},{percentage:0}]) assert.throws(()=>definition({...def(),title:{status,code:null,percentage:null,...patch}},period));
 for(const unhealthyWork of [0,1,'0','1','false','true',undefined])assert.throws(()=>definition({...def(),unhealthyWork},period));
});
test('rejects numeric rates, exponent notation, rounding requests and malformed dates',()=>{
 for(const percentage of [0,12.5,'1e2','-1','01.2',' 1','1,2','1.000000001','1000000000000000000',''])assert.throws(()=>definition({...def(),title:{status:'declared',code:'50',percentage}},period));
 for(const partialSeniorityYears of [0,'-1','01','1.5','1e2',''])assert.throws(()=>definition({...def(),partialSeniorityYears},period));
 for(const asOfDate of ['2026-11-01','2026-02-30','2026-10-01T00:00:00Z'])assert.throws(()=>definition({...def(),asOfDate},period));
 assert.throws(()=>definition({...def(),rounding:'nearest'},period));
});
test('non-JSON definitions and executable accessors are rejected before being read',()=>{
 let calls=0;const accessor=def();Object.defineProperty(accessor,'partialSeniorityYears',{enumerable:true,get(){calls++;return'1';}});
 assert.throws(()=>definition(accessor,period));assert.equal(calls,0);
 const inherited=Object.assign(Object.create({secret:true}),def());assert.throws(()=>definition(inherited,period));
 const hidden=def();Object.defineProperty(hidden,'hidden',{value:'extra'});assert.throws(()=>definition(hidden,period));
 const symbolic=def();symbolic[Symbol('extra')]='x';assert.throws(()=>definition(symbolic,period));
});
test('855 rows remain complete beyond the first page and a filtered screen cannot become a proposal',()=>{
 const full=rows(855), b=boot(855), prepared=prepare(b,full,reason);
 assert.equal(prepared.items.length,855);assert.equal(prepared.items[854].contractId,id(855));
 fails(()=>prepare(b,full.filter(r=>r.contractId===id(855)),reason),'SALARY_CONDITIONS_POPULATION_CHANGED');
 assert.equal(full.length,855);assert.equal(b.source.subjects.length,855);
});
test('a changed identity in the last row rejects the entire complete proposal',()=>{
 const full=rows(855);full[854].identityToken='b'.repeat(64);
 fails(()=>prepare(boot(855),full,reason),'SALARY_CONDITIONS_POPULATION_CHANGED');
 assert.equal(full.length,855);
});
test('missing and extra contracts cannot replace one another under an equal row count',()=>{
 const full=rows(2);full[1].contractId=id(3);
 fails(()=>prepare(boot(2),full,reason),'SALARY_CONDITIONS_POPULATION_CHANGED');
 fails(()=>prepare(boot(1),rows(2),reason),'SALARY_CONDITIONS_POPULATION_CHANGED');
});
test('duplicate, unsorted, sparse and accessor-backed row sets are rejected without collapsing them',()=>{
 const duplicate=rows(2);duplicate[1]=clone(duplicate[0]);assert.throws(()=>items(duplicate,period));
 assert.throws(()=>items(rows(2).reverse(),period));
 const sparse=rows(2);delete sparse[0];assert.throws(()=>items(sparse,period));
 const decorated=rows();decorated.extra=true;assert.throws(()=>items(decorated,period));
 let calls=0;const accessor=rows();Object.defineProperty(accessor,'0',{get(){calls++;return rows()[0];},enumerable:true});assert.throws(()=>items(accessor,period));assert.equal(calls,0);
});
test('row and JSONB byte limits reject the full set without truncation or splitting',()=>{
 const tooMany=rows(10001);assert.throws(()=>items(tooMany,period));assert.equal(tooMany.length,10001);
 const tooLarge=rows(10000);for(const r of tooLarge)r.definition.documentReference='Q'.repeat(180);
 fails(()=>items(tooLarge,period),'SALARY_CONDITIONS_LIMIT');assert.equal(tooLarge.length,10000);assert.equal(tooLarge[9999].definition.documentReference.length,180);
});
test('sources require their own registration, complete order and no GRH fallback',()=>{
 assert.equal(source(src(2)).subjects.length,2);
 const legacy=src();legacy.subjects[0].origin='GRH';assert.throws(()=>source(legacy));
 const missing=src();delete missing.subjects[0].registrationId;assert.throws(()=>source(missing));
 const repeat=src(2);repeat.subjects[1]=clone(repeat.subjects[0]);assert.throws(()=>source(repeat));
 const extra=src();extra.subjects[0].rawTxt='private';assert.throws(()=>source(extra));
});
test('preparation detaches the conserved body from editable rows and makes no decision',()=>{
 const draft=rows(), prepared=prepare(boot(),draft,reason);draft[0].definition.title.status='none';draft[0].definition.documentReference='Changed synthetic draft';
 assert.equal(prepared.items[0].definition.title.status,'not_reported');assert.equal(prepared.items[0].definition.documentReference,def().documentReference);assert.equal(prepared.command,'propose');assert.equal(prepared.reviewConfirmed,false);
 fails(()=>prepare({...boot(),permissions:{canPropose:false,canReview:true}},rows(),reason),'SALARY_CONDITIONS_FORBIDDEN');
});
test('new declarations must have changes against the entire approved configuration',()=>{
 const b=boot();b.configuration={version:h,revision:1,items:rows(),proposalId:id(10001),approvalId:id(10002)};
 assert.throws(()=>prepare(b,rows(),reason));
 const changed=rows();changed[0].definition.unhealthyWork=false;assert.equal(prepare(b,changed,reason).items[0].definition.unhealthyWork,false);
});
test('proposal and decision bodies cannot substitute fields or mix operation states',()=>{
 assert.deepEqual(command(body()),body());
 for(const change of [{command:'approve'},{items:null},{reviewConfirmed:true},{sourceVersion:null},{period:'2026-13'},{proposalId:id(10001)},{payrollCalculated:true}])assert.throws(()=>command({...body(),...change}));
 const decided={...body(),command:'approve',proposalId:id(10001),proposalSha256:h,items:null,reviewConfirmed:true};assert.deepEqual(command(decided),decided);
 assert.throws(()=>command({...decided,items:rows()}));
});
test('an empty first configuration differs from a claimed approval without rows',()=>{
 assert.equal(configuration(boot().configuration,period).revision,0);
 assert.throws(()=>configuration({...boot().configuration,revision:1,proposalId:id(1),approvalId:id(2)},period));
 assert.throws(()=>configuration({...boot().configuration,items:rows()},period));
});
test('bootstrap never claims a calculation, posting or incomplete successful response',()=>{
 assert.equal(bootstrap(boot()).complete,true);
 for(const change of [{complete:false},{payrollCalculated:true},{payrollPosted:true},{permissions:{canPropose:true}},{version:'legacy'}])assert.throws(()=>bootstrap({...boot(),...change}));
});
test('detail binds the entire body, every last-row value, source and count to its hash',async()=>{
 const d=await proposal(855);assert.equal((await detail(d)).body.items.length,855);
 const tampered=clone(d);tampered.body.items[854].definition.unhealthyWork=false;await assert.rejects(detail(tampered));
 const cropped=clone(d);cropped.proposal.itemCount=1;await assert.rejects(detail(cropped));
 const sourceChanged=clone(d);sourceChanged.source.subjects[854].identityToken='b'.repeat(64);await assert.rejects(detail(sourceChanged));
});
test('review needs another authorized actor and cannot approve stale versions',async()=>{
 const d=await detail(await proposal()), b=boot();b.permissions.canReview=true;b.proposals=[d.proposal];
 assert.equal((await decide(b,d,'approve',reason)).command,'approve');
 await assert.rejects(decide({...b,permissions:{canPropose:true,canReview:false}},d,'approve',reason),e=>e.code==='SALARY_CONDITIONS_INDEPENDENT_REQUIRED');
 await assert.rejects(decide(b,{...d,proposal:{...d.proposal,canReview:false}},'approve',reason),e=>e.code==='SALARY_CONDITIONS_INDEPENDENT_REQUIRED');
 await assert.rejects(decide(b,{...d,current:false},'approve',reason),e=>e.code==='SALARY_CONDITIONS_BASE_CHANGED');
 await assert.rejects(decide({...b,source:{...b.source,version:'b'.repeat(64)}},d,'approve',reason),e=>e.code==='SALARY_CONDITIONS_BASE_CHANGED');
 assert.equal((await decide(b,{...d,current:false},'reject',reason)).command,'reject');
});
test('review revalidates the last row even if a caller forgot the detail validator',async()=>{
 const d=await proposal(855),b=boot(855);b.permissions.canReview=true;b.proposals=[d.proposal];d.body.items[854].definition.unhealthyWork=false;
 await assert.rejects(decide(b,d,'approve',reason),e=>e.code==='SALARY_CONDITIONS_CONTRACT_INVALID');
});
test('review stops when the refreshed proposal list withdraws its decision permission',async()=>{
 const d=await proposal(),b=boot();b.permissions.canReview=true;b.proposals=[{...d.proposal,canReview:false}];
 await assert.rejects(decide(b,d,'approve',reason),e=>e.code==='SALARY_CONDITIONS_INDEPENDENT_REQUIRED');
});
test('an independent reviewer has another scope without rewriting the preparer request',async()=>{
 const reviewerScope='b'.repeat(64),d=await proposal(),originalBody=clone(d.body);
 d.scopeVersion=reviewerScope;await detail(d);
 const b=boot();b.scopeVersion=reviewerScope;b.permissions.canReview=true;b.proposals=[d.proposal];
 const decision=await decide(b,d,'approve',reason);
 assert.equal(decision.scopeVersion,reviewerScope);assert.equal(d.body.scopeVersion,h);assert.deepEqual(d.body,originalBody);
 assert.equal(await hash(d.body),d.proposal.requestSha256);
 await assert.rejects(decide({...b,scopeVersion:'c'.repeat(64)},d,'approve',reason),e=>e.code==='SALARY_CONDITIONS_INDEPENDENT_REQUIRED');
});
test('receipt hashes and pending retries conserve exact body and request key',async()=>{
 const r=await acknowledgement(855), attempt={key:r.requestKey,body:clone(r.body)};
 assert.equal((await receipt(r,attempt)).body.items.length,855);
 const tampered=clone(r);tampered.body.items[854].definition.partialSeniorityYears='0';await assert.rejects(receipt(tampered,attempt));
 await assert.rejects(receipt({...r,requestSha256:'b'.repeat(64)},attempt));
 await assert.rejects(receipt(r,{...attempt,key:id(20002)}));
 const changed=clone(attempt);changed.body.reason='Changed exclusively synthetic reason';await assert.rejects(receipt(r,changed));
 assert.equal(await hash(r.body),r.requestSha256);
});
test('receipts cannot pretend to approve, calculate or pay the preparation',async()=>{
 const r=await acknowledgement();
 for(const patch of [{status:'approved'},{payrollCalculated:true},{payrollPosted:true},{proposalId:id(2)},{configurationVersion:'b'.repeat(64)}])await assert.rejects(receipt({...r,...patch}));
});
test('capture preserves unapproved facts as missing, including the last selected contract',()=>{
 const selected=rows(855).map(({contractId,identityToken})=>({contractId,identityToken}));
 const v={complete:true,version:h,records:selected.map(e=>({...e,revision:0,definition:null,approvalId:null}))};
 assert.equal(capture(v,selected,period).records[854].definition,null);
 assert.throws(()=>capture({...v,records:v.records.slice(0,854)},selected,period));
 const changed=clone(v);changed.records[854].identityToken='b'.repeat(64);assert.throws(()=>capture(changed,selected,period));
});
test('capture requires whole-selection identities, approvals and unchanged period facts',()=>{
 const selected=[{contractId:id(1),identityToken:h}], r={contractId:id(1),identityToken:h,revision:1,definition:def(),approvalId:id(10002)},v={complete:true,version:h,records:[r]};
 assert.deepEqual(capture(v,selected,period),v);
 for(const patch of [{revision:0},{approvalId:null},{contractId:id(2)},{identityToken:'b'.repeat(64)}])assert.throws(()=>capture({...v,records:[{...r,...patch}]},selected,period));
 assert.throws(()=>capture(v,[...selected,...selected],period));
 assert.throws(()=>capture({...v,complete:false},selected,period));
 assert.throws(()=>capture({...v,records:[{...r,definition:{...def(),asOfDate:'2026-11-01'}}]},selected,period));
});
