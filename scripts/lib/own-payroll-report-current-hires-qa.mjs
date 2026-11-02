// Pure adapter for this six-person CURRENT-hire report fixture only.
// No connection, backdating, UPDATE, history invention or production SQL change.
import assert from 'node:assert/strict';
const expected=Object.freeze(['19041','19043','19102','19103','19104','19105']);
const monthSql="to_jsonb(to_char(date_trunc('month',greatest(DATE '2026-10-01',statement_timestamp() AT TIME ZONE 'America/Argentina/Mendoza')),'YYYY-MM-DD'))";
export function currentOwnReportHireSeed(seed){
 assert.equal(typeof seed,'string','REPORT_CURRENT_HIRES_SOURCE_REQUIRED');
 const matches=[...seed.matchAll(/hire:=native_employee_create_v1\(maker,('(?:[^']|'')*')::jsonb,/g)];
 assert.equal(matches.length,6,'REPORT_CURRENT_HIRES_EXACT_SIX_REQUIRED');
 const seen=new Set(),changes=[];let sql=seed;
 for(const match of matches){
  const draft=JSON.parse(match[1].slice(1,-1).replaceAll("''","'"));
  assert.ok(expected.includes(draft.legajo)&&!seen.has(draft.legajo),'REPORT_CURRENT_HIRES_EXACT_IDENTITIES_REQUIRED');
  assert.equal(draft.startDate,'2026-10-01','REPORT_CURRENT_HIRES_PREIMAGE_CHANGED');seen.add(draft.legajo);
  const before=match[0],after="hire:=native_employee_create_v1(maker,jsonb_set("+match[1]+"::jsonb,'{startDate}',"+monthSql+",false),";
  assert.equal(sql.split(before).length,2,'REPORT_CURRENT_HIRES_UNIQUE_CALL_REQUIRED');sql=sql.replace(before,()=>after);changes.push({legajo:draft.legajo,before,after});
 }
 assert.deepEqual([...seen].sort(),[...expected].sort());
 let inverse=sql;for(const change of [...changes].reverse()){assert.equal(inverse.split(change.after).length,2);inverse=inverse.replace(change.after,()=>change.before);}
 assert.equal(inverse,seed,'REPORT_CURRENT_HIRES_INVERSE_CHANGED');
 return Object.freeze({sql,rewrittenHires:changes.length,calendarExpression:monthSql,inverseVerified:true,derivations:Object.freeze(changes.map(v=>Object.freeze(v)))});
}
