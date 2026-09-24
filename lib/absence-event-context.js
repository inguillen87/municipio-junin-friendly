// Read-side quality signal; never changes dates or decides justification, payroll or leave eligibility.
export const ABSENCE_RANGE_REVIEW_DAYS = 366;
export function absenceRangeIntegrity(from,to){
 if(!to)return 'until_date_not_reported';
 const civil=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
 if(!civil(from)||!civil(to))return 'invalid_source_date';
 if(to<from)return 'inverted_source_range';
 return (Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000+1>ABSENCE_RANGE_REVIEW_DAYS?'extended_source_range':'valid_source_range';
}
export function normalizeAbsenceDetailScope(query={}){
 const contractId=String(query.contractId??'').trim(),search=String(query.search??'').trim();
 if(contractId&&!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(contractId)||search.length>120||/[\x00-\x1f\x7f]/.test(search)){
  throw Object.assign(new Error('ABSENCE_DETAIL_FILTER_INVALID'),{code:'ABSENCE_DETAIL_FILTER_INVALID'});
 }
 return {contractId:contractId.toLowerCase(),search};
}
export function absenceSearchPattern(value){return '%'+value.replace(/[\\%_]/g,'\\$&')+'%';}
