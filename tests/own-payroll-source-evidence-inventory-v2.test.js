import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {inventoryOwnPayrollSourceEvidenceV2,OWN_SOURCE_EVIDENCE_AGREEMENTS} from '../lib/own-payroll-source-evidence-inventory-v2.js';

const sha=s=>createHash('sha256').update(s).digest('hex');
const conceptFields=['FOVM_27','UNIM_27','CONM_27','FOVJ_27','UNIJ_27','CONJ_27','FOFM_27','FOFJ_27','FORMULA_PRE','FORMULA_POST'];
const auxFields=['ALGV_77','ALGF_77','COND_77','NPIF_77','NPIV_77','CNPI_77'];
function fixture(){
 const table=(table,keys,rows)=>({table,rowCount:rows.length,schema:{columns:keys.map(name=>({name,type:name.startsWith('FOV')?'decimal(8,2)':'varchar(1024)',nullable:!name.startsWith('CODI')}))},rows});
 return {version:'synthetic-configuration14.v1',source:{sha256:'a'.repeat(64)},allowlistedTables:['codliq','auxical','concepto','calauxi'],payrollExecutionAllowed:false,approved:false,tables:[
  table('codliq',['CODI_02','CODI_27','ACTI_27','LIQU_27','CALC_27','UNID_27',...conceptFields],OWN_SOURCE_EVIDENCE_AGREEMENTS.map(CODI_02=>({CODI_02,CODI_27:'1',ACTI_27:'A',LIQU_27:'M',CALC_27:'98',UNID_27:'H',...Object.fromEntries(conceptFields.map(f=>[f,null])),FOVM_27:'N[1] * 1.00',UNIM_27:'L[10]',FOVJ_27:'N[2] + 2.50',FOFM_27:'A[1]',FOFJ_27:'',FORMULA_PRE:'sourceHookNeverExecuted'}))),
  table('auxical',['CODI_01','CODI_02','ITEM_77',...auxFields],OWN_SOURCE_EVIDENCE_AGREEMENTS.map(CODI_02=>({CODI_01:'1',CODI_02,ITEM_77:'1',ALGV_77:'L[10] * 1.00',NPIV_77:'L[10] 1 *',ALGF_77:'L[10] + 2',NPIF_77:'L[10] 2 +',COND_77:'N[1] = 0',CNPI_77:'N[1] 0 ='}))),
  table('concepto',['CODI_27','DETA_15','UNID_15'],[{CODI_27:'1',DETA_15:'Concepto exclusivamente sintético',UNID_15:'H'}]),
  table('calauxi',['CODI_01','ITEM_77','DETA_77'],[{CODI_01:'1',ITEM_77:'1',DETA_77:'Auxiliar exclusivamente sintético'}]),
 ]};
}
const call=(cfg=fixture(),metadataSets=[])=>inventoryOwnPayrollSourceEvidenceV2({configurationText:JSON.stringify(cfg),companyId:'1',metadataSets});
const cell=(r,field,rowId='codliq:1:1')=>r.expressions.find(x=>x.rowId===rowId&&x.field===field);
const table=(cfg,name)=>cfg.tables.find(t=>t.table===name);
const nativeItem=()=>({active:true,agreementCode:'1',categoryCode:null,code:'1',dependencies:[],kind:'concept',label:'Sintético independiente',nature:'remuneration',precision:2,ruleReference:'Fuente sintética de prueba',unit:'money',validFrom:'2026-10',validUntil:null,value:null});

test('all 14 agreements and every source field are retained; no execution or approval follows',()=>{
 const r=call();assert.deepEqual(r.requestedAgreements,Array.from({length:14},(_,i)=>String(i+1)));
 assert.equal(r.summary.sourceRows,30);assert.equal(r.summary.formulaDefinitionRows,28);assert.equal(r.summary.expressionCells,224);assert.equal(r.summary.potentialMonthlySourceRoots,14);assert.equal(r.summary.representationPairs,42);
 assert.equal(r.coverage.length,14);assert.ok(r.coverage.every(c=>c.conceptDefinitions===1&&c.auxiliaryDefinitions===1));
 assert.equal(r.rows.find(x=>x.id==='codliq:1:1').sourceMetadata.row.FOVJ_27,'N[2] + 2.50');
 assert.equal(cell(r,'FOFM_27').sourceText,'A[1]');assert.equal(cell(r,'FOFJ_27').state,'source_empty');
 assert.equal(r.audit.summary.rows,r.rows.length);assert.equal(r.payrollExecutionAllowed,false);assert.equal(r.programmePrepared,false);assert.equal(r.approved,false);assert.equal(r.municipalAcceptance,null);
});
test('source null, empty, missing column, omitted value and literal zero stay distinct',()=>{
 const c=fixture(),t=table(c,'codliq');t.schema.columns=t.schema.columns.filter(x=>x.name!=='CONJ_27');for(const row of t.rows)delete row.CONJ_27;
 delete t.rows[0].CONM_27;t.rows[0].UNIM_27='0';const r=call(c);
 assert.equal(cell(r,'FORMULA_POST').state,'source_null');assert.equal(cell(r,'FOFJ_27').state,'source_empty');
 assert.equal(cell(r,'CONJ_27').state,'source_column_missing');assert.equal(cell(r,'CONM_27').state,'source_value_unprovided');assert.equal(cell(r,'UNIM_27').sourceText,'0');
 assert.equal(cell(r,'FORMULA_POST').sourceTextSha256,null);assert.equal(cell(r,'FORMULA_POST').sourceValueJsonSha256,sha('null'));
 assert.equal(cell(r,'FOFJ_27').sourceTextSha256,sha(''));assert.equal(cell(r,'CONM_27').sourceValueJsonSha256,null);
 assert.equal(cell(r,'UNIM_27').sourceTextSha256,sha('0'));assert.equal(cell(r,'UNIM_27').normalizedAst[1],'0');
});
test('decimal spellings, negative values and integers beyond Number precision are not rewritten',()=>{
 const c=fixture();table(c,'codliq').rows[0].FOVM_27='9007199254740993.00 + -0.2500';const r=call(c),e=cell(r,'FOVM_27');
 assert.equal(e.sourceText,'9007199254740993.00 + -0.2500');assert.equal(e.literals[0].raw,'9007199254740993.00');assert.equal(e.literals[1].raw,'0.2500');
 assert.deepEqual(e.normalizedAst,['binary','+',['number','9007199254740993'],['number','-0.25']]);assert.equal(JSON.stringify(e.rawAst).includes('"value"'),false);
});
test('infix and postfix trees compare structurally while literal spelling remains separate',()=>{
 const r=call(),p=r.representations.find(x=>x.rowId==='auxical:1:1:1'&&x.infixField==='ALGV_77');
 assert.equal(p.status,'same_normalized_tree');assert.equal(p.literalSpellingDifferent,true);assert.equal(p.selectedRuntimeField,null);assert.equal(p.precedenceProved,false);assert.deepEqual(p.differences,[]);
});
test('67 versus 66 and associative regrouping retain precise divergence paths without choosing a winner',()=>{
 const c=fixture(),a=table(c,'auxical').rows[0];a.ALGV_77='L[10] * 67 / 100';a.NPIV_77='L[10] 66 * 100 /';a.ALGF_77='L[10] - (2 - 3)';a.NPIF_77='L[10] 2 - 3 -';const r=call(c);
 for(const field of['ALGV_77','ALGF_77']){const p=r.representations.find(x=>x.rowId==='auxical:1:1:1'&&x.infixField===field);assert.equal(p.status,'different_tree_requires_review');assert.ok(p.differences.length);assert.ok(p.differences.every(d=>d.path.startsWith('$[')));assert.equal(p.selectedRuntimeField,null);}
});
test('unsupported postfix and source routines remain opaque and never execute source text',()=>{
 const c=fixture();globalThis.__sourceEvidenceExecuted=false;table(c,'auxical').rows[0].NPIV_77='globalThis.__sourceEvidenceExecuted = true';table(c,'codliq').rows[0].FORMULA_PRE='globalThis.__sourceEvidenceExecuted = true';const r=call(c);
 assert.equal(globalThis.__sourceEvidenceExecuted,false);delete globalThis.__sourceEvidenceExecuted;
 assert.equal(cell(r,'FORMULA_PRE').state,'special_routine_requires_implementation');assert.equal(cell(r,'NPIV_77','auxical:1:1:1').state,'postfix_unresolved');
 assert.equal(r.representations.find(x=>x.rowId==='auxical:1:1:1'&&x.infixField==='ALGV_77').status,'representation_unavailable');
});
test('only exact A and comma-separated M are potential monthly roots; case and delimiters are evidence',()=>{
 const c=fixture(),t=table(c,'codliq');t.rows[0].ACTI_27='a';t.rows[1].LIQU_27='M.J';const r=call(c);
 assert.equal(r.summary.potentialMonthlySourceRoots,12);assert.equal(r.coverage[0].sourceCaseAmbiguities,1);assert.equal(r.rows.find(x=>x.id==='codliq:1:1').sourceMetadata.row.ACTI_27,'a');
});
test('same-agreement references are unresolved locally instead of borrowing another agreement',()=>{
 const c=fixture();table(c,'codliq').rows[0].FOVM_27='A[999] + L[311]';const r=call(c);
 assert.ok(r.audit.bindings.some(x=>x.reference==='A[999]'&&x.target==='auxical:1:1:999'&&x.status==='definition_absent_in_this_context'));
 assert.ok(cell(r,'FOVM_27').dependencies.includes('L[311]'));assert.equal(cell(r,'FOVM_27').referenceStage,null);
});
test('DDL precision and literal H versus native money metadata cannot invent quantity, result or rounding units',()=>{
 const item=nativeItem(),r=call(fixture(),[{id:'master352',itemsText:JSON.stringify([item])}]),row=r.rows.find(x=>x.id==='codliq:1:1');
 assert.equal(row.sourceMetadata.row.UNID_27,'H');assert.equal(row.nativeMetadata[0].literalUnit,'money');assert.equal(row.nativeMetadata[0].quantityUnit,null);assert.equal(row.nativeMetadata[0].resultUnit,null);assert.equal(row.nativeMetadata[0].roundingPolicy,null);
 assert.equal(row.sourceMetadata.columns.find(x=>x.name==='FOVM_27').type,'decimal(8,2)');assert.equal(cell(r,'FOVM_27').roundingPolicy,null);assert.equal(r.unresolvedPolicies.ddlPrecisionIsStorageOnly,true);assert.equal(row.sourceMetadata.effectiveFrom,null);
});
test('1001 source roots stay complete and report capacity uncertainty instead of truncating or changing programme limits',()=>{
 const c=fixture(),t=table(c,'codliq'),first=t.rows.shift();t.rows.unshift(...Array.from({length:988},(_,i)=>({...first,CODI_27:String(i+1)})));t.rowCount=t.rows.length;const r=call(c);
 assert.equal(r.summary.potentialMonthlySourceRoots,1001);assert.equal(r.coverage[0].conceptDefinitions,988);assert.equal(r.programmeCapacity.currentRuleLimit,1000);assert.equal(r.programmeCapacity.sourcePotentialRootsAboveRuleLimit,true);
 assert.equal(r.programmeCapacity.actualEmittedRules,0);assert.equal(r.programmeCapacity.actualRequiredProgrammeRules,null);assert.equal(r.programmeCapacity.actualRequiredProgrammeBindings,null);assert.equal(r.programmeCapacity.noAutomaticTruncationSplittingOrLimitIncrease,true);
});
test('a complete report is deterministic and input objects are unchanged',()=>{
 const c=fixture(),before=structuredClone(c),a=call(c),b=call(c);assert.deepEqual(c,before);assert.deepEqual(a,b);assert.equal(a.configurationSha256,sha(JSON.stringify(c)));
});
test('duplicate rows and mismatched table counts fail the entire report',()=>{
 for(const mode of['duplicate','count','table']){const c=fixture(),t=table(c,'codliq');if(mode==='duplicate'){t.rows.push({...t.rows[0]});t.rowCount++;}else if(mode==='count')t.rowCount++;else c.tables[3]=structuredClone(c.tables[2]);assert.throws(()=>call(c),/SOURCE_EVIDENCE_(ROW_DUPLICATE|TABLE_INVALID)/);}
});
test('missing or undeclared agreements fail rather than producing a partial fleet',()=>{
 for(const mode of['missing','unknown']){const c=fixture(),t=table(c,'codliq');if(mode==='missing'){t.rows.pop();t.rowCount--;}else t.rows[0].CODI_02='15';assert.throws(()=>call(c),/SOURCE_EVIDENCE_AGREEMENT_(MISSING|UNDECLARED)/);}
});
test('unknown nominal columns, rows, wrong data types and source schemas fail the allowlist',()=>{
 for(const mode of['column','row','type','schema']){const c=fixture(),t=table(c,'codliq');if(mode==='column')t.schema.columns.push({name:'DNI',type:'varchar(20)',nullable:true});if(mode==='row')t.rows[0].DNI='not-a-person';if(mode==='type')t.rows[0].FOVM_27=0;if(mode==='schema')t.schema.columns[0].nullable='false';assert.throws(()=>call(c),/SOURCE_EVIDENCE_(COLUMNS|ROW)_INVALID/);}
});
test('duplicate JSON properties and undeclared extra tables cannot pass source validation',()=>{
 const c=fixture(),raw=JSON.stringify(c),input={configurationText:raw.replace('"approved":false','"approved":false,"approved":false'),companyId:'1',metadataSets:[]};assert.throws(()=>inventoryOwnPayrollSourceEvidenceV2(input),/SOURCE_EVIDENCE_JSON_INVALID/);
 c.allowlistedTables.push('personas');assert.throws(()=>call(c),/SOURCE_EVIDENCE_ALLOWLIST_INVALID/);
});
test('input accessors and metadata array accessors are rejected without invocation',()=>{
 let hits=0;const raw={companyId:'1',metadataSets:[]};Object.defineProperty(raw,'configurationText',{enumerable:true,get(){hits++;throw Error('unsafe getter');}});assert.throws(()=>inventoryOwnPayrollSourceEvidenceV2(raw),/SOURCE_EVIDENCE_CONTRACT_INVALID/);
 const arr=[];Object.defineProperty(arr,'0',{enumerable:true,get(){hits++;throw Error('unsafe array getter');}});assert.throws(()=>inventoryOwnPayrollSourceEvidenceV2({configurationText:JSON.stringify(fixture()),companyId:'1',metadataSets:arr}),/SOURCE_EVIDENCE_CONTEXT_INVALID/);assert.equal(hits,0);
});
test('explicit nonzero company and bounded metadata identity sets are mandatory',()=>{
 const raw={configurationText:JSON.stringify(fixture()),companyId:'0',metadataSets:[]};assert.throws(()=>inventoryOwnPayrollSourceEvidenceV2(raw),/SOURCE_EVIDENCE_CONTEXT_INVALID/);
 assert.throws(()=>call(fixture(),[{id:'same',itemsText:JSON.stringify([nativeItem()])},{id:'same',itemsText:JSON.stringify([nativeItem()])}]),/SOURCE_EVIDENCE_METADATA_DUPLICATE/);
 assert.throws(()=>call(fixture(),Array.from({length:9},()=>({id:'same',itemsText:'[]'}))),/SOURCE_EVIDENCE_CONTEXT_INVALID/);
});
test('overlong expressions are rejected whole, including routine hooks, never clipped before the canonical audit',()=>{
 for(const field of['FOVM_27','FORMULA_PRE']){const c=fixture();table(c,'codliq').rows[0][field]='1'.repeat(4097);assert.throws(()=>call(c),/SOURCE_EVIDENCE_EXPRESSION_LIMIT/);}
});
test('opaque hooks retain lexical dependencies as evidence without contributing executable AST edges',()=>{
 const c=fixture();table(c,'codliq').rows[0].FORMULA_PRE='privateRoutine(L[311], A[999])';const r=call(c),e=cell(r,'FORMULA_PRE');
 assert.deepEqual(e.dependencies,['A[999]','L[311]']);assert.equal(e.rawAst,null);assert.equal(e.state,'special_routine_requires_implementation');
 assert.equal(r.audit.bindings.some(b=>b.field==='FORMULA_PRE'),false);
});
test('company101 is explicit source context and is never silently substituted with company1',()=>{
 const c=fixture();for(const t of c.tables)for(const row of t.rows)if(Object.hasOwn(row,'CODI_01'))row.CODI_01='101';
 assert.throws(()=>call(c),/FORMULA_AUDIT_COMPANY_ABSENT/);
 const r=inventoryOwnPayrollSourceEvidenceV2({configurationText:JSON.stringify(c),companyId:'101',metadataSets:[]});assert.equal(r.companyId,'101');assert.equal(r.summary.sourceRows,30);assert.ok(r.coverage.every(c=>c.auxiliaryDefinitions===1));
 assert.ok(r.audit.bindings.some(b=>b.reference==='A[1]'&&b.target==='auxical:101:1:1'));
});
test('other-company auxiliary rows are conserved without joining their references into the selected-company graph',()=>{
 const c=fixture(),a=table(c,'auxical');a.rows.push({...a.rows[0],CODI_01:'101',ALGV_77:'A[999]'});a.rowCount++;
 const r=call(c);assert.equal(r.summary.sourceRows,31);assert.ok(r.rows.some(x=>x.id==='auxical:101:1:1'));
 assert.equal(r.audit.bindings.some(b=>b.rowId==='auxical:101:1:1'),false);assert.equal(r.coverage[0].auxiliaryDefinitions,1);assert.equal(r.summary.expressionCells,230);
});
