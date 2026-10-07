// Same actual API/SQL circuit as payroll. Invented norms and assignments only.
import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {annualBudgetOperation} from '../../lib/internal-annual-position-budget.js';
import {positionOperation} from '../../lib/internal-position-assignment.js';
import {positionComparisonOperation} from '../../lib/internal-position-comparison.js';
import {definition} from '../../tests/fixtures/annual-position-budget-synthetic.js';
import {positionComparisonDocument,positionComparisonSummary,positionComparisonVisible} from '../../assets/position-comparison-model.js';
import {reportCsv,reportXlsx,reportPdf} from '../../assets/report-document.js';
import {employeeContext} from '../../lib/internal-native-employees.js';
import {verifiedPositionComparison} from '../../assets/position-comparison-model.js';
import {qaLiteral} from './own-payroll-durable-qa.mjs';
// The existing QA normalizer verifies the original public-body hashes by
// normalizing only relocated schema references inside pg_proc.prosrc.
export function relocateAdoptedPositionsInstallation(batch,qa){const q=v=>"'"+v.replaceAll("'","''")+"'",initial="DO $initial$ BEGIN IF current_setting('municontrol_adopted_positions.mode')='first' THEN EXECUTE "+q(qa.normalized(batch.beforeCheck))+";ELSIF current_setting('municontrol_adopted_positions.mode')='legacy' THEN EXECUTE "+q(qa.normalized(batch.legacyCheck))+';ELSE EXECUTE '+q(qa.normalized(batch.afterCheck))+';END IF;END $initial$',map=s=>s===batch.initial?initial:qa.normalized(s);return {...batch,installation:batch.installation.map(map),durableVerification:batch.durableVerification.map(map)};}
export function adoptedPositionsCircuit({db,maker,checker,period,ok,write,qa,originalDetailDefinition,optimizedDetailDefinition}){
 const year=Number(period.slice(0,4)),invoke=(fn,a,op,input)=>fn(db,a.principal,a.session,op,input),annual=(a,op,input)=>invoke(annualBudgetOperation,a,op,input),position=(a,op,input)=>invoke(positionOperation,a,op,input);let old,oldKey,oldContract;
 const assign=async contractId=>{const b=await position(maker,'bootstrap',{year,contractId}),a={id:randomUUID(),budgetRevision:1,definitionSha256:b.annual.catalog.definitionSha256,rowCode:'QA0001',validFrom:period+'-01',validTo:year+'-12-31',quantity:'1.000000000000000001',source:{instrument:'Acto exclusivamente sintético QA',documentSha256:'e'.repeat(64),reference:'Documento ficticio QA'}},body={command:'propose',contractId,year,scopeVersion:b.scopeVersion,baseVersion:b.state.version,annualVersion:b.annual.catalog.version,reason:'Asignación exclusivamente sintética para comparación',reviewConfirmed:false,allocations:[{...a,rowCode:'QA0000',quantity:'1'},{...a,id:randomUUID()}].sort((a,b)=>a.id<b.id?-1:1)},key=randomUUID(),p=await position(maker,'command',{key,body}),review=await position(checker,'bootstrap',{year,contractId});await assert.rejects(()=>position(maker,'command',{key:randomUUID(),body:{command:'approve',contractId,year,scopeVersion:b.scopeVersion,baseVersion:body.baseVersion,annualVersion:body.annualVersion,proposalId:p.proposalId,proposalSha256:review.proposals.find(x=>x.id===p.proposalId).requestSha256,reason:'Autor intenta decidir su propia propuesta sintética',reviewConfirmed:true}}),e=>e.status===403);await position(checker,'command',{key:randomUUID(),body:{command:'approve',contractId,year,scopeVersion:review.scopeVersion,baseVersion:body.baseVersion,annualVersion:body.annualVersion,proposalId:p.proposalId,proposalSha256:review.proposals.find(x=>x.id===p.proposalId).requestSha256,reason:'Revisión exclusivamente sintética independiente',reviewConfirmed:true}});return {value:await position(maker,'bootstrap',{year,contractId}),key};};
 return {
  year,identity:name=>name==='maker'?maker:checker,
  async original(contractId){const initial=await annual(maker,'bootstrap',{year}),normBody={command:'propose',year,scopeVersion:initial.scopeVersion,baseVersion:initial.catalog.version,proposalId:null,proposalSha256:null,definition:definition(26),reason:'Planta exclusivamente sintética para comparación',reviewConfirmed:false},p=await annual(maker,'command',{body:normBody,key:randomUUID()});await annual(checker,'command',{key:randomUUID(),body:{...normBody,command:'approve',scopeVersion:(await annual(checker,'bootstrap',{year})).scopeVersion,proposalId:p.proposalId,proposalSha256:p.requestSha256,definition:null,reviewConfirmed:true}});const a=await assign(contractId);old=a.value;oldKey=a.key;oldContract=contractId;},
  async assignments(subjects){assert.deepEqual(await position(maker,'bootstrap',{year,contractId:oldContract}),old);ok(true,'old native annual proposal, decision, allocation and scope preserved exactly');const replay=await position(maker,'attempt',{key:oldKey});ok(replay.replayed===true,'old annual request key remains recoverable');for(const s of subjects.filter(s=>s.contractId!==oldContract))await assign(s.contractId);ok(subjects.length===29,'all29 adopted and native subjects receive independent annual assignments');},
  async outputs(){
   assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
   const reference=qa.schema+'.position_comparison_detail_reference_qa',anchor='CREATE FUNCTION public.position_comparison_detail_v1(';
   assert.equal(originalDetailDefinition.split(anchor).length,2);
   await db.run(qa.normalized(originalDetailDefinition.replace(anchor,'CREATE FUNCTION public.position_comparison_detail_reference_qa('))+`;REVOKE ALL ON FUNCTION ${reference}(jsonb,integer,integer,text,text) FROM PUBLIC;GRANT EXECUTE ON FUNCTION ${reference}(jsonb,integer,integer,text,text) TO municontrol_actions_runtime_app`);
   let value,referenceMs,optimizedMs;
   try{
    const params={year,revision:1,period,liquidationType:'monthly'},start=Date.now(),raw=await db.run(`SELECT ${reference}(${qaLiteral(JSON.stringify(employeeContext(checker.principal,checker.session)))}::jsonb,${year},1,${qaLiteral(period)},'monthly')`,true);
    referenceMs=Date.now()-start;const before=await verifiedPositionComparison(raw,params),freshStart=Date.now();
    value=await invoke(positionComparisonOperation,checker,'detail',params);optimizedMs=Date.now()-freshStart;
    assert.deepEqual(value,before);ok(true,'optimized stable comparison equals the original full SQL result with every employee and source check');
    // Corrupt only a local loop value in private QA clones. No municipal row,
    // immutable trigger, runtime permission or production function is changed.
    const invokeReference=()=>db.run(`SELECT ${reference}(${qaLiteral(JSON.stringify(employeeContext(checker.principal,checker.session)))}::jsonb,${year},1,${qaLiteral(period)},'monthly')`,true);
    for(const [field,invalid]of [['inputSha256','0'.repeat(64)],['employeeNumber','Identidad sintética incorrecta QA']]){
     for(const source of [originalDetailDefinition,optimizedDetailDefinition]){
      const guard='IF c.id IS NULL OR r.capture_id IS NULL OR ';assert.equal(source.split(guard).length,2);
      const modified=source.replace(guard,`IF c.id=ANY(ids) THEN e:=jsonb_set(e,${qaLiteral('{'+field+'}')},to_jsonb(${qaLiteral(invalid)}::text));END IF;\n   `+guard).replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION ').replace('public.position_comparison_detail_v1(','public.position_comparison_detail_reference_qa(');
      await db.run(qa.normalized(modified));await assert.rejects(invokeReference,/POSITION_COMPARISON_SOURCE_INVALID/);
     }
     ok(true,'original and optimized SQL refuse changed '+field+' on an employee sharing an already verified capture');
    }
   }finally{await db.run(`DROP FUNCTION ${reference}(jsonb,integer,integer,text,text)`);}
   const doc=positionComparisonDocument(value,{active:'all',order:'number',view:'detailed'}),summary=positionComparisonSummary(value),csv=reportCsv(doc);ok(value.employees.length===29&&value.groups.length===1&&doc.rows.length===58,'closed comparison captures29 employees and58 complete allocations');ok(['A/3501','0901','901'].every(n=>doc.rows.filter(r=>r[1]===n).length===2),'annual comparison preserves opaque and zero-prefixed source identifiers');ok(value.captures.every(c=>c.dimensions.status==='captured'&&c.positions.status==='captured'),'original positions and dimensions captured atomically in every payroll version');ok(summary[1].credited==='29.000000000000000029','annual teaching-hour sum preserves all18 decimals');ok(positionComparisonVisible(doc,'A/3501').rows.length===2&&csv.split('\r\n').length===60,'search and pagination do not truncate58 export rows');for(const [file,data] of [['cargos.csv',csv],['cargos.xlsx',reportXlsx(doc)],['cargos.pdf',reportPdf(doc)]])write(file,data);return {value,rows:58,employees:29,summary,originalPreserved:true,originalReaderEquivalent:true,referenceMs,optimizedMs};}
 };
}
