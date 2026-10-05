import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {OWN_INSTALL_SHA} from './own-payroll-installation.mjs';
import {SQL124_SHA} from './own-payroll-liquidation-installation.mjs';
export function buildOwnCloseSql(read){
 const source=id=>read(id).replace(/\r\n?/g,'\n'),runs=source('scripts/migrations/123-own-payroll-runs.sql'),decisions=source('scripts/migrations/124-own-payroll-liquidation-decisions.sql');
 const hash=v=>createHash('sha256').update(v).digest('hex');assert.equal(hash(runs),OWN_INSTALL_SHA[123]);assert.equal(hash(decisions),SQL124_SHA);
 const get=(s,name)=>{const definitions=splitPostgresStatements(s).filter(s=>s.startsWith('CREATE FUNCTION public.'+name+'('));assert.equal(definitions.length,1);return definitions[0];};
 const replace=(s,needle,value)=>{assert.equal(s.split(needle).length,2,'Guard anchor changed');return s.replace(needle,value);};
 const guard=(period,type,ids)=>`PERFORM public.own_close_guard_v1(ctx,${period},${type},${ids});`;
 let capture=get(runs,'own_run_capture_v1');
 capture=replace(capture,'RETURN public.own_run_receipt_v1(prior,true);',`IF NOT EXISTS(SELECT 1 FROM public.own_payroll_run_result WHERE capture_id=prior.id) THEN ${guard("prior.body->>'period'","prior.body->>'liquidationType'","ARRAY(SELECT(value->>'contractId')::uuid FROM jsonb_array_elements(prior.payload#>'{population,employees}'))")} END IF;RETURN public.own_run_receipt_v1(prior,true);`);
 capture=replace(capture,' INSERT INTO public.own_payroll_run_capture(',` ${guard("body->>'period'","body->>'liquidationType'",'ids')}\n INSERT INTO public.own_payroll_run_capture(`);
 let complete=get(runs,'own_run_complete_v1');complete=replace(complete,' INSERT INTO public.own_payroll_run_result(',` ${guard("c.body->>'period'","c.body->>'liquidationType'","ARRAY(SELECT(value->>'contractId')::uuid FROM jsonb_array_elements(input_value->'employees'))")}\n INSERT INTO public.own_payroll_run_result(`);
 let command=get(decisions,'own_liquidation_command_v1');command=replace(command,' rows_value:=public.own_liquidation_rows_v1(ctx,c);',` ${guard("c.body->>'period'","c.body->>'liquidationType'","ARRAY(SELECT(value->>'contractId')::uuid FROM jsonb_array_elements(r.input->'employees') WHERE kind='all' OR selection->'values' ? (value->>CASE kind WHEN 'contracts' THEN 'contractId' WHEN 'agreements' THEN 'agreementCode' ELSE 'departmentCode' END))")}\n rows_value:=public.own_liquidation_rows_v1(ctx,c);`);
 let rows=get(decisions,'own_liquidation_rows_v1');rows=replace(rows,'  rows_value:=rows_value||',`  IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.own_close_active_v1(ctx,c.body->>'period',c.body->>'liquidationType')) g CROSS JOIN LATERAL jsonb_array_elements(g.value#>'{snapshot,employees}') e WHERE e.value->>'contractId'=person->>'contractId') THEN allowed:='[]';END IF;\n  rows_value:=rows_value||`);
 return {base:source('scripts/migrations/125-own-payroll-close.sql'),before:[get(runs,'own_run_capture_v1'),get(runs,'own_run_complete_v1'),get(decisions,'own_liquidation_command_v1'),get(decisions,'own_liquidation_rows_v1')],adapted:[capture,complete,command,rows].map(s=>s.replace(/^CREATE FUNCTION /,'CREATE OR REPLACE FUNCTION ')),get sql(){return this.base+'\n'+this.adapted.join(';\n')+';\n';}};
}
