-- Preserve absent closure evidence. Publish the compatible UI before this mapping.
-- No payroll data or authorization boundary is changed.
DO $$
DECLARE definition text;
 old_mapping text := '''closureStatus'',CASE WHEN ds.source_closed_flag=1 THEN ''closed'' ELSE ''open'' END';
 new_mapping text := '''closureStatus'',CASE ds.source_closed_flag WHEN 1 THEN ''closed'' WHEN 0 THEN ''open'' ELSE ''unknown'' END';
BEGIN
 IF to_regprocedure('employee_payroll_detail_v1(text,uuid,integer,text,uuid,uuid,uuid,date,text,integer,integer)') IS NULL THEN
   RAISE EXCEPTION 'PAYROLL_DETAIL_FUNCTION_REQUIRED';
 END IF;
 SELECT pg_get_functiondef('employee_payroll_detail_v1(text,uuid,integer,text,uuid,uuid,uuid,date,text,integer,integer)'::regprocedure) INTO definition;
 IF position(new_mapping IN definition)>0 THEN RETURN; END IF;
 IF (length(definition)-length(replace(definition,old_mapping,'')))/length(old_mapping)<>1 THEN
   RAISE EXCEPTION 'PAYROLL_CLOSURE_MAPPING_DRIFT';
 END IF;
 EXECUTE replace(definition,old_mapping,new_mapping);
END $$;
