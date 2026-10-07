// Complete, declared synthetic identities; no municipal files or database URL.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {buildAdoptedOwnCloseQa} from './adopted-own-payroll-close-qa.mjs';
import {qaLiteral as q} from './own-payroll-durable-qa.mjs';
export function buildAdoptedOwnReceiptQa(major){
 const qa=buildAdoptedOwnCloseQa(major),anchor='    END $seed$; COMMIT;',guard='CREATE TRIGGER grh_effective_baseline_rows';
 assert.equal(qa.sql.split(guard).length,2);
 qa.sql=qa.sql.replace(guard,()=>`UPDATE employment_contract ec SET legacy_legajo=CASE x.n WHEN 1 THEN '901' ELSE '0901' END FROM(SELECT id,row_number() OVER(ORDER BY id) n FROM employment_contract WHERE source_system='GRH' AND legacy_company_id=101 AND id<>${q(qa.ids.targetContract)}::uuid) x WHERE ec.id=x.id;\n`+guard);
 qa.sql=qa.sql.replace(guard,`UPDATE person_identity pi SET full_name='Persona adoptada exclusivamente sintética QA '||x.n,dni=(99008000+x.n)::text,cuil='20'||(99008000+x.n)::text||'0' FROM(SELECT ec.person_id,row_number() OVER(ORDER BY ec.id) n FROM employment_contract ec WHERE ec.source_system='GRH' AND ec.legacy_company_id=101) x WHERE pi.id=x.person_id;\n`+guard);
 assert.equal(qa.sql.split(anchor).length,2);
 const receipt=qa.relocate(fs.readFileSync(new URL('../migrations/126-own-payroll-receipts.sql',import.meta.url),'utf8'));
 qa.sql=qa.sql.replace(anchor,()=>`EXECUTE ${q(receipt)};INSERT INTO capabilities VALUES(${q(qa.ids.maker)}::uuid,'payroll.calculation.approve');INSERT INTO capabilities SELECT a.id,c.key FROM unnest(ARRAY[${q(qa.ids.maker)}::uuid,${q(qa.ids.checker)}::uuid,${q(qa.ids.samePerson)}::uuid]) a(id) CROSS JOIN unnest(ARRAY['payroll.receipt.prepare','payroll.receipt.approve']) c(key);\n`+anchor);
 return {...qa,adaptation:qa.adaptation+'\n'+qa.relocate(fs.readFileSync(new URL('../migrations/142-adopted-own-payroll-receipts.sql',import.meta.url),'utf8'))};
}

export async function adoptSyntheticReceiptContracts(db,qa){
 const j=v=>q(JSON.stringify(v))+'::jsonb',mk=j(qa.actors.maker),ck=j(qa.actors.checker);
 const adoption=`DO $adopt$ DECLARE source jsonb;boot jsonb;context_hash text;versions jsonb;rows_value jsonb;body jsonb;saved jsonb;stage jsonb;BEGIN
 source:=employment_adoption_source_v1(${mk});boot:=employment_adoption_bootstrap_v1(${mk});
 context_hash:=employment_adoption_hash_v1(jsonb_build_object('scope',source->'scope','source',source->'source'));
 SELECT jsonb_agg(jsonb_build_object('contractId',r.v->>'contractId','contractVersion',employment_adoption_hash_v1(jsonb_build_object('sourceContextVersion',context_hash,'row',r.v))) ORDER BY r.n) INTO versions FROM jsonb_array_elements(source->'rows') WITH ORDINALITY r(v,n);
 SELECT jsonb_agg(v||jsonb_build_object('jurisdictionCode','42') ORDER BY v->>'contractId') INTO rows_value FROM jsonb_array_elements(versions) v;
 body:=jsonb_build_object('sourceContextVersion',context_hash,'selectionVersion',employment_adoption_hash_v1(versions),'catalogVersion',boot->>'catalogVersion','rows',rows_value,'legalReference','Resolución inventada QA','reason','Adopción de contratos exclusivamente sintéticos QA');
 saved:=employment_adoption_propose_v1(${mk},body,gen_random_uuid());stage:=employment_adoption_decision_source_v1(${ck},(saved#>>'{receipt,proposalId}')::uuid);
 PERFORM employment_adoption_decide_v1(${ck},jsonb_build_object('reviewVersion',stage->>'reviewVersion','review',jsonb_build_object('proposalId',saved#>>'{receipt,proposalId}','proposalVersion',saved#>>'{receipt,proposalVersion}','sourceContextVersion',context_hash,'catalogVersion',boot->>'catalogVersion','decision','approve','reason','Revisión independiente de adopción sintética QA')),gen_random_uuid());END $adopt$`;
 await db.run(adoption);
}
