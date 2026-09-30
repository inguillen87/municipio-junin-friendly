// One PostgreSQL statement: unchanged governed writer plus identity/receipt guards.
// A failed postcondition raises inside the same statement and rolls the write back.
export const LEGACY_PREPARE_CALL='SELECT payroll_novelty_prepare_v1($1::jsonb, $2, $3::date, $4, $5::jsonb, $6::uuid, $7) AS result';
export const GRH_GUARDED_PREPARE_SQL=`
WITH before_subjects AS MATERIALIZED (
 SELECT coalesce(jsonb_agg(payroll_novelty_employee_v2($1::jsonb,(s.item->>'contractId')::uuid)->'subject' ORDER BY s.ord),'[]'::jsonb) AS subjects
 FROM jsonb_array_elements($8::jsonb) WITH ORDINALITY s(item,ord)
), checked_before AS MATERIALIZED (
 SELECT 1/(CASE WHEN subjects=$8::jsonb AND jsonb_array_length(subjects)=jsonb_array_length($5::jsonb) THEN 1 ELSE 0 END) AS valid FROM before_subjects
), prepared AS MATERIALIZED (
 SELECT payroll_novelty_prepare_v1($1::jsonb,$2,$3::date,$4,$5::jsonb,$6::uuid,$7) AS receipt
 FROM checked_before WHERE valid=1
), checked_after AS MATERIALIZED (
 SELECT prepared.receipt,(SELECT coalesce(jsonb_agg(payroll_novelty_employee_v2($1::jsonb,(s.item->>'contractId')::uuid)->'subject' ORDER BY s.ord),'[]'::jsonb)
 FROM jsonb_array_elements(CASE WHEN prepared.receipt IS NOT NULL THEN $8::jsonb ELSE '[]'::jsonb END) WITH ORDINALITY s(item,ord)) AS subjects
 FROM prepared
)
SELECT jsonb_build_object('receipt',receipt,'verified',1/(CASE WHEN subjects=$8::jsonb
 AND (receipt#>>'{data,rowCount}')::integer=jsonb_array_length($5::jsonb)
 AND jsonb_array_length(receipt#>'{data,rows}')=jsonb_array_length($5::jsonb)
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements($5::jsonb) WITH ORDINALITY e(input,ord)
  WHERE ((receipt#>'{data,rows}')->(e.ord::integer-1))-ARRAY['employmentContractId','issues'] IS DISTINCT FROM e.input)
 AND receipt#>'{data,grhMutation}'='false'::jsonb AND receipt#>'{data,payrollCalculated}'='false'::jsonb AND receipt#>'{data,payrollPosted}'='false'::jsonb
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements($8::jsonb) WITH ORDINALITY e(subject,ord)
   LEFT JOIN LATERAL (SELECT row FROM jsonb_array_elements(receipt#>'{data,rows}') row WHERE row->>'rowOrdinal'=e.ord::text) actual ON true
   WHERE actual.row->>'employmentContractId' IS DISTINCT FROM e.subject->>'contractId' OR actual.row->>'legajo' IS DISTINCT FROM e.subject->>'legajo')
 THEN 1 ELSE 0 END)) AS result FROM checked_after`;
