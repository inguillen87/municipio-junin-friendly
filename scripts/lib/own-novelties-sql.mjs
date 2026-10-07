import assert from 'node:assert/strict';
import {buildOwnCloseSql} from './own-payroll-close-sql.mjs';
export function ownNoveltyCaptureSql(read){
 const matches=buildOwnCloseSql(read).adapted.filter(s=>s.startsWith('CREATE OR REPLACE FUNCTION public.own_run_capture_v1('));assert.equal(matches.length,1);
 let sql=matches[0];
 const once=(from,to)=>{assert.equal(sql.split(from).length,2,from);sql=sql.replace(from,to);};
 once("batches jsonb:='[]';","batches jsonb:='[]';native_batches jsonb:='[]';");
 once("s:=public.own_run_fixed_v1(p,first_date,ids,body->>'liquidationType');","native_batches:=public.own_novelty_sources_v1(p,first_date,body->>'liquidationType',ids);\n s:=public.own_run_fixed_v1(p,first_date,ids,body->>'liquidationType');");
 once("'monthlyBatches',jsonb_array_length(batches)","'monthlyBatches',jsonb_array_length(batches),'ownNativeBatches',jsonb_array_length(native_batches)");
 once("'monthly',jsonb_build_object('complete',true,'batches',batches)","'monthly',CASE WHEN jsonb_array_length(native_batches)=0 THEN jsonb_build_object('complete',true,'batches',batches) ELSE jsonb_build_object('complete',true,'batches',batches,'nativeBatches',native_batches) END");
 return sql+';\n';
}
