import test from 'node:test';
import assert from 'node:assert/strict';
import {fixedGroupDraft,fixedGroupEligible,fixedGroupReceipt,fixedGroupUnchanged} from '../assets/payroll-fixed-groups-model.js';
import {fixedApprovedRecord,fixedUuid as uuid,fixedEffects,fixedNativeSubject} from './fixtures/payroll-fixed-novelties-synthetic.js';
test('selection across pages keeps historical/native identities and original null/zero values',()=>{
 const rows=Array.from({length:45},(_,i)=>fixedApprovedRecord(i,{quantityDecimal:i===0?'0':'1',amountCents:null}));rows[25].subject=fixedNativeSubject();
 const chosen=[rows[0],rows[25]],draft=fixedGroupDraft(chosen,'Conjunto revisado sintético');assert.equal(draft.items.length,2);assert.equal(draft.items[1].contractId,rows[25].subject.contractId);assert.equal(rows[0].approved.values.quantityDecimal,'0');assert.equal(rows[0].approved.values.amountCents,null);assert.ok(Object.isFrozen(draft.items));
});
test('ineligible rows have explicit limits; duplicate selections never become a smaller group',()=>{
 const row=fixedApprovedRecord(1);for(const patch of [{identityCurrent:false},{canPropose:false},{pending:{operation:'annul'}},{approved:{operation:'annul'}},{version:200}]){assert.equal(fixedGroupEligible({...row,...patch}),false);assert.throws(()=>fixedGroupDraft([{...row,...patch}],'Ensayo grupal'));}assert.throws(()=>fixedGroupDraft([row,row],'Ensayo grupal'));
});
test('preflight checks complete fields and authority, not just record version',()=>{
 const row=fixedApprovedRecord(0);assert.ok(fixedGroupUnchanged([row],{rows:[structuredClone(row)]}));for(const change of [r=>r.approved.values.amountCents='0',r=>r.subject.identityToken='a'.repeat(64),r=>r.canPropose=false,r=>r.pending={operation:'annul'},r=>r.approved.reason='Motivo diferente']){const fresh=structuredClone(row);change(fresh);assert.equal(fixedGroupUnchanged([row],{rows:[fresh]}),false);}assert.equal(fixedGroupUnchanged([row],{rows:[]}),false);
});
test('browser rejects incomplete, reordered, wrong-key and salaried group acknowledgements',()=>{
 const rows=[fixedApprovedRecord(0),fixedApprovedRecord(25)],payload=fixedGroupDraft(rows,'Ensayo conjunto'),key=uuid(777);
 const data={version:'payroll-fixed-annul-group.v1',groupId:uuid(9),key,requestSha256:'a'.repeat(64),total:2,duplicate:false,effects:{...fixedEffects},rows:rows.map((r,i)=>({version:'payroll-fixed-receipt.v1',command:'propose',recordId:r.id,proposalId:uuid(i+700),recordVersion:3,duplicate:false}))};
 assert.deepEqual(fixedGroupReceipt({ok:true,data},key,payload),data);for(const change of [r=>r.rows.reverse(),r=>r.rows.pop(),r=>r.key=uuid(778),r=>r.effects.payrollPosted=true,r=>r.rows[0].recordVersion++]){const bad=structuredClone(data);change(bad);assert.throws(()=>fixedGroupReceipt({ok:true,data:bad},key,payload));}
});
