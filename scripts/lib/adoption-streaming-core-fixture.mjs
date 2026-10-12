// Fictional predecessor data for the additional streaming scenario only.
// Original fixtures remain the default and run independently, unchanged.
import assert from 'node:assert/strict';
import {splitPostgresStatements} from './sql-statements.mjs';
export function adoptionStreamingCoreFixture({qa,read,revision}){
 const definitions=splitPostgresStatements(read('scripts/migrations/061-grh-core-source-version.sql').replace(/\r\n?/g,'\n')).map(s=>s.replace(/^(?:\s*--[^\n]*\n)+\s*/,''));
 const base=definitions.find(s=>s.startsWith('CREATE OR REPLACE FUNCTION grh_core_source_base_rows_v1('));assert.ok(base);
 const contract="'"+qa.ids.makerContract+"'::uuid",batch=`(SELECT source_batch_id FROM employment_contract WHERE id=${contract})`;
 return `
 UPDATE grh_core_source_version SET baseline_batch_id=${batch} WHERE source_company_id=101;
 CREATE TABLE grh_core_source_delta(version_id uuid,entity text,source_id text,operation text,record jsonb,PRIMARY KEY(version_id,entity,source_id));
 ALTER TABLE employment_movement ADD COLUMN source_id text,ADD COLUMN installment integer,ADD COLUMN automatic_source_value numeric,ADD COLUMN adjustment_source_value numeric,ADD COLUMN forced_source_value numeric,ADD COLUMN legal_instrument text,ADD COLUMN movement_status text;
 CREATE TABLE payroll_monthly_fact(source_id text,employment_contract_id uuid,source_batch_id uuid,source_system text,payroll_date date,source_period integer,source_month integer,payroll_type text,item_count integer,quantity_sum numeric,technical_source_amount_sum numeric,employer_contributions numeric,social_security_taxable_base numeric,health_taxable_base numeric,total_subject_earnings numeric,total_non_subject_earnings numeric,family_allowance numeric,employee_withholdings numeric,employer_taxable_base numeric,net numeric,net_payable numeric,dominant_agreement_source_id text,dominant_sector_source_id text,distinct_concepts integer,source_payload jsonb);
 INSERT INTO employment_movement(source_id,employment_contract_id,source_batch_id,source_system,movement_period,payroll_type,movement_type,concept_source_id,cost_center_source_id,quantity,installment,automatic_source_value,adjustment_source_value,forced_source_value,legal_instrument,movement_status) VALUES(repeat(md5('synthetic-movement'),2),${contract},${batch},'GRH','2026-09-01','monthly','standard','QA-CODE','QA-AREA',9007199254740993.0000001,1,NULL,0,0,'QA only','review');
 INSERT INTO payroll_monthly_fact(source_id,employment_contract_id,source_batch_id,source_system,payroll_date,source_period,source_month,payroll_type,item_count,quantity_sum,technical_source_amount_sum,net,net_payable,distinct_concepts,source_payload)
 VALUES(repeat(md5('synthetic-monthly'),2),${contract},${batch},'GRH','2026-09-01',2026,9,'monthly',1,9007199254740993.0000001,100.01,NULL,100.01,1,'{"qualityFlags":[]}'::jsonb);
 ${base};
 REVOKE ALL ON FUNCTION grh_core_source_base_rows_v1(uuid,text) FROM PUBLIC,municontrol_actions_runtime_app;
 DELETE FROM qa_final_rows WHERE entity IN('core/movements','core/payrollMonthly');
 INSERT INTO qa_final_rows SELECT '${revision}'::uuid,'core/'||entity,b.source_id,b.record FROM unnest(ARRAY['movements','payrollMonthly']) entity CROSS JOIN LATERAL grh_core_source_base_rows_v1(${batch},entity) b;
 `;
}
