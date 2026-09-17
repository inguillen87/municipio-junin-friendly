// Pure planning. Term boundaries must be supplied from reviewed institutional evidence.
// No database, storage, deletes, default office-holder dates or provider calls.
const DAY=86400000;
function date(value){if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(value))throw Error('HISTORY_DATE_INVALID');const parsed=new Date(value+'T00:00:00Z');if(!Number.isFinite(+parsed)||parsed.toISOString().slice(0,10)!==value)throw Error('HISTORY_DATE_INVALID');return parsed;}
const iso=d=>d.toISOString().slice(0,10);
export function operationalHistoryCutoff(asOf){const d=date(asOf);d.setUTCDate(1);d.setUTCFullYear(d.getUTCFullYear()-10);return iso(d);}
export function comparableTermWindows({terms,asOf}){
 if(!Array.isArray(terms)||terms.length<2||terms.length>6)throw Error('TERM_SCOPE_INVALID');
 const periods=terms.map(t=>{if(!t||Object.keys(t).sort().join()!=='endExclusive,start')throw Error('TERM_SCOPE_INVALID');const start=date(t.start),end=date(t.endExclusive);if(end<=start||(end-start)/DAY>1500)throw Error('TERM_SCOPE_INVALID');return{start,end};});
 for(let i=1;i<periods.length;i++)if(+periods[i].end!==+periods[i-1].start)throw Error('TERM_BOUNDARIES_REQUIRE_REVIEW');
 const end=new Date(+date(asOf)+DAY),elapsed=end-periods[0].start;
 if(elapsed<=0||end>periods[0].end||periods.some(p=>p.end-p.start<elapsed))throw Error('TERM_COMPARABLE_WINDOW_UNAVAILABLE');
 const windows=periods.map((p,offset)=>({offset,start:iso(p.start),endExclusive:iso(new Date(+p.start+elapsed)),days:elapsed/DAY,fullTermEndExclusive:iso(p.end),completeTerm:elapsed===p.end-p.start}));
 return {version:'municipal-term-windows.v1',alignment:'equal_elapsed_days_from_verified_start',windows,countsRequireExposureNormalization:true,twoPreviousTermsMustRemainSeparate:true,uniquePeopleCannotBeSummed:true,nominalMoneyIsNotRealPurchasingPower:true};
}
export function planHistoryRetention({asOf,terms,measurements}){
 const cutoff=operationalHistoryCutoff(asOf),comparison=comparableTermWindows({terms,asOf});
 if(!Array.isArray(measurements)||measurements.length!==2)throw Error('HISTORY_MEASUREMENTS_INVALID');
 const allowed=new Set(['employment_movement','payroll_monthly_fact']),seen=new Set();
 for(const row of measurements){if(!row||Object.keys(row).sort().join()!=='eligibleRows,periodAnomalies,table,totalRows'||!allowed.has(row.table)||seen.has(row.table)||!['eligibleRows','periodAnomalies','totalRows'].every(k=>Number.isSafeInteger(row[k])&&row[k]>=0)||row.eligibleRows+row.periodAnomalies>row.totalRows)throw Error('HISTORY_MEASUREMENTS_INVALID');seen.add(row.table);}
 return {version:'municipal-history-retention-plan.v1',asOf,detailYears:10,retainFrom:cutoff,cutoffGranularity:'complete_month',measurements:structuredClone(measurements),comparison,aggregatesMustStartNoLaterThan:comparison.windows.at(-1).start,archiveRequiredBeforeRemoval:true,restoreRequiredBeforeRemoval:true,preserveNativeRecords:true,preserveEmploymentIdentity:true,preserveLegalAndAuditHistory:true,sourceReadersMigrationRequired:true,deletionEnabled:false,estimatedFreedBytes:null};
}
