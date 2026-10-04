import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {fixedCorrectionGroupDraft,fixedGroupReceipt} from '../assets/payroll-fixed-groups-model.js';
import {prepareFixedGroup,fixedGroupResponse} from '../lib/internal-payroll-fixed-groups.js';
import {createInternalPayrollFixedGroupsHandler} from '../api/internal-payroll-fixed-groups.js';
import {fixedApprovedRecord,fixedNativeSubject,fixedUuid as uuid,fixedEffects} from './fixtures/payroll-fixed-novelties-synthetic.js';
import {prepareFixedCorrectionGroupsInstallation} from '../scripts/prepare-fixed-correction-groups-installation.mjs';
import {assertFixedCorrectionGroupsDurability} from '../scripts/lib/fixed-correction-groups-installation.mjs';
import {buildFixedCorrectionGroupsQa} from '../scripts/verify-payroll-fixed-correction-groups-sql.mjs';
const rows=()=>Array.from({length:45},(_,i)=>{const row=fixedApprovedRecord(i,{quantityDecimal:i===0?'0':'1',amountCents:i===1?'0':null,costCenterSourceId:i%2?'7':null,legalInstrument:'Instrumento sintético '+i});if(i===25)row.subject=fixedNativeSubject();return row;});
const draft=()=>fixedCorrectionGroupDraft(rows(),{conceptSourceId:'614',validTo:'2026-12-31'},'Corrección conjunta sintética');
const receipt=payload=>({version:'payroll-fixed-correction-group.v1',groupId:uuid(990),key:uuid(777),requestSha256:'a'.repeat(64),total:payload.items.length,duplicate:false,effects:{...fixedEffects},rows:payload.items.map((r,i)=>({version:'payroll-fixed-receipt.v1',command:'propose',recordId:r.recordId,proposalId:uuid(i+500),recordVersion:r.expectedVersion+1,duplicate:false}))});
test('correction reviews all 45 rows including native origin; unchosen individual values and null/zero survive',()=>{
 const original=rows(),payload=draft();assert.equal(payload.items.length,45);assert.deepEqual(prepareFixedGroup(payload,'correct'),payload);
 original.forEach((r,i)=>{for(const key of Object.keys(r.approved.values)){assert.equal(payload.items[i].values[key],key==='conceptSourceId'?'614':key==='validTo'?'2026-12-31':r.approved.values[key]);}assert.equal(payload.items[i].contractId,r.subject.contractId);});
 assert.equal(payload.items[0].values.quantityDecimal,'0');assert.equal(payload.items[1].values.amountCents,'0');assert.equal(payload.items[0].values.amountCents,null);assert.ok(Object.isFrozen(payload.items[0].values));
});
test('explicit optional clears stay null, zeros remain declared, and no arithmetic or identities are accepted',()=>{
 const r=rows()[2];assert.equal(fixedCorrectionGroupDraft([r],{quantityDecimal:'0'},'Motivo documentado').items[0].values.quantityDecimal,'0');
 assert.equal(fixedCorrectionGroupDraft([r],{amountArs:'0'},'Motivo documentado').items[0].values.amountCents,'0');
 assert.equal(fixedCorrectionGroupDraft([r],{amountArs:'1234567890123456,78'},'Motivo documentado').items[0].values.amountCents,'123456789012345678');
 const withMoney={...r,approved:{...r.approved,values:{...r.approved.values,amountCents:'15'}}};assert.equal(fixedCorrectionGroupDraft([withMoney],{amountArs:''},'Motivo documentado').items[0].values.amountCents,null);
 for(const patch of [{},{contractId:uuid(10)},{legajo:'2000'},{operation:'annul'},{amountArs:'=1+1'},{quantityDecimal:'1e5'},{validFrom:'2027-01-01',validTo:'2026-01-01'},{forced:true},{forcedReason:'Fundamento ajeno'}])assert.throws(()=>fixedCorrectionGroupDraft([r],patch,'Motivo documentado'));
});
test('a no-change or ineligible row rejects the whole selection instead of silently omitting it',()=>{
 const r=rows()[2];assert.throws(()=>fixedCorrectionGroupDraft([r],{quantityDecimal:'1'},'Motivo documentado'),/no se omiten/);
 const other=structuredClone(r);other.id=uuid(900);other.approved.values.quantityDecimal='2';assert.throws(()=>fixedCorrectionGroupDraft([r,other],{quantityDecimal:'2'},'Motivo documentado'),/no se omiten/);
 for(const bad of [{...r,identityCurrent:false},{...r,pending:r.latest},{...r,canPropose:false},{...r,version:200}])assert.throws(()=>fixedCorrectionGroupDraft([r,bad],{conceptSourceId:'614'},'Motivo documentado'));
});
test('correction acknowledgement cannot be substituted with an annulment, partial, reordered or salary result',()=>{
 const payload=draft(),data=receipt(payload);assert.deepEqual(fixedGroupReceipt({ok:true,data},data.key,payload),data);assert.deepEqual(fixedGroupResponse(data,{key:data.key,payload,command:'correct'}),data);
 for(const change of [r=>r.version='payroll-fixed-annul-group.v1',r=>r.rows.reverse(),r=>r.rows.pop(),r=>r.effects.payrollPosted=true,r=>r.rows[0].recordVersion++]){const bad=structuredClone(data);change(bad);assert.throws(()=>fixedGroupReceipt({ok:true,data:bad},data.key,payload));assert.throws(()=>fixedGroupResponse(bad,{key:data.key,payload,command:'correct'}));}
 assert.throws(()=>prepareFixedGroup(payload,'annul'));assert.throws(()=>prepareFixedGroup({...payload,items:[{...payload.items[0],values:null}]},'correct'));
});
test('correction API calls one parameterized transaction with existing authority; transport and revocation reject before SQL',async()=>{
 const payload=draft(),data=receipt(payload),caps=['payroll.novelty.read','payroll.novelty.nominal.read','payroll.fixed.prepare'];
 const request={method:'POST',query:{},headers:{origin:'https://municipio.example','content-type':'application/json','idempotency-key':data.key},body:{command:'correct',payload}};
 const run=async(req,authority=caps,result=data)=>{const calls=[],session={id:uuid(900),email:'preparer@example.invalid',version:1,releaseSha:'a'.repeat(40)},handler=createInternalPayrollFixedGroupsHandler({env:{INTERNAL_APP_ORIGIN:'https://municipio.example'},requireCompatibleInternalAccess:async()=>({mode:'managed',principal:{user:{email:session.email},tenant:{source:'membership',id:uuid(1),membershipId:uuid(2),certifiedReleaseSha:session.releaseSha,effectiveCapabilities:authority}}}),actionMutationSession:()=>session,getInternalSql:async()=>({query:async(sql,args)=>{calls.push({sql,args});return [{result}];}})},'correct');const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(s){this.statusCode=s;return this;},json(body){this.body=body;return this;}};await handler(req,res);return {calls,res};};
 const good=await run(request);assert.equal(good.res.statusCode,201);assert.equal(good.calls.length,1);assert.match(good.calls[0].sql,/correction_group_propose_v1\(\$1::jsonb,\$2::jsonb,\$3::uuid\)/);assert.deepEqual(JSON.parse(good.calls[0].args[1]),payload);
 for(const bad of [{...request,body:{command:'annul',payload}},{...request,headers:{...request.headers,origin:'https://foreign.example'}},{...request,body:{command:'correct',payload:{...payload,actorEmail:'forged@example.invalid'}}}]){const r=await run(bad);assert.ok(r.res.statusCode>=400);assert.equal(r.calls.length,0);}
 for(const authority of [[],caps.slice(0,2)]){const r=await run(request,authority);assert.equal(r.res.statusCode,403);assert.equal(r.calls.length,0);}
 const recovered=await run({method:'GET',query:{resource:'attempt',key:data.key}},caps,{...data,duplicate:true});assert.equal(recovered.res.statusCode,200);assert.match(recovered.calls[0].sql,/correction_group_attempt_v1/);assert.equal(recovered.calls[0].args[1],data.key);
});
test('SQL118 installation is exact/additive on the existing targets and durability rejects any prior/installed change',()=>{
 const sourceCommit='a'.repeat(40),batch=prepareFixedCorrectionGroupsInstallation({read:f=>fs.readFileSync(f,'utf8'),sourceCommit});assert.equal(batch.prerequisitePins.length,9);assert.equal(batch.ownPins.length,3);assert.equal(batch.targets.length,2);assert.ok(batch.before.includes('payroll_fixed_correction_group'));assert.ok(!batch.before.includes("p.proname LIKE 'payroll_fixed_group_%'"));assert.ok(batch.audit.includes('OLD_TRIGGER_CHANGED'));
 assert.throws(()=>prepareFixedCorrectionGroupsInstallation({read:f=>fs.readFileSync(f,'utf8')+(f.includes('118-')?'--changed':''),sourceCommit}),/Unreviewed/);
 const installed={sourceCommit,sqlSha256:batch.sqlSha256,allChecksPassed:true,functions118:3,runtimeFacades:2,eventRows:0,nominalRowsReturned:0,priorTableCount:100,beforeFingerprint:'b'.repeat(64),afterFingerprint:'b'.repeat(64),newObjectFingerprint:'c'.repeat(64)},durable={...installed};delete durable.beforeFingerprint;
 assert.equal(assertFixedCorrectionGroupsDurability({installed,durable,sourceCommit}).ok,true);for(const patch of [{afterFingerprint:'d'.repeat(64)},{eventRows:1},{functions118:4},{newObjectFingerprint:'e'.repeat(64)}])assert.throws(()=>assertFixedCorrectionGroupsDurability({installed,durable:{...durable,...patch},sourceCommit}));
});
test('correction SQL QA preserves all 237 existing checks and exact embedded migration on both versions',()=>{
 for(const serverMajor of [17,18]){const qa=buildFixedCorrectionGroupsQa({serverMajor});assert.equal(qa.report.groupChecksPassed,30);assert.equal(qa.report.correctionGroupChecksPassed,36);assert.equal(qa.report.checksPassed,273);
 const exact=fs.readFileSync('scripts/migrations/118-fixed-novelty-correction-groups.sql','utf8').replaceAll('public.',qa.schema+'.').replaceAll(qa.schema+'.digest(','public.digest(').replaceAll('SET search_path=pg_catalog,public,pg_temp','SET search_path=pg_catalog,'+qa.schema+',public,pg_temp');assert.ok(qa.sql.includes("EXECUTE '"+exact.replaceAll("'","''")+"';"));
 for(const label of ['a no-change second row is not silently omitted','invalid second date rolls back the entire corrected group','every stored correction exactly matches its reviewed values','same key cannot change the proposed exact values','same key cannot shrink'])assert.ok(qa.sql.includes(label));assert.ok(!/INSERT\s+INTO\s+public\./i.test(qa.sql));
 }
});
