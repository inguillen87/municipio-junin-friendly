// Read-only arithmetic over reconstructed intervals. Not an approved schedule or payable overtime.
export function referenceDuration(value){
 if(typeof value!=='string'||!/^\d{1,2}:[0-5]\d$/.test(value))return null;
 const [h,m]=value.split(':').map(Number);return h>24||h===24&&m!==0?null:h*3600+m*60;
}
export function compareWorkdayReference(row,reference){
 const expected=referenceDuration(reference);
 if(expected===null||expected===0)return {status:'invalid_reference',payableSeconds:null};
 if(!row||!Array.isArray(row.intervals)||row.status!=='closed'||row.identityState!=='mapped'||row.issues?.length)return {status:'needs_review',payableSeconds:null};
 let ordinary=0,extra=0,paused=0;
 for(const i of row.intervals){
  if(!['ordinary','extra'].includes(i.kind)||![i.netSeconds,i.pauseSeconds,i.elapsedSeconds].every(v=>Number.isSafeInteger(v)&&v>=0)||i.elapsedSeconds!==i.netSeconds+i.pauseSeconds)return {status:'needs_review',payableSeconds:null};
  if(i.kind==='ordinary')ordinary+=i.netSeconds;else extra+=i.netSeconds;paused+=i.pauseSeconds;
 }
 if(!row.intervals.length)return {status:'needs_review',payableSeconds:null};
 const observed=ordinary+extra;
 return {status:'reference_only',expectedSeconds:expected,ordinarySeconds:ordinary,declaredExtraSeconds:extra,pauseSeconds:paused,observedSeconds:observed,differenceSeconds:observed-expected,payableSeconds:null};
}
export function clockCodeSummary(data){
 if(!data?.dashboard||!Array.isArray(data.dashboard.codes)||!Number.isSafeInteger(data.summary?.marks))return null;
 const supported=/^K20(?:\/|$)/i.test(data.dashboard.device?.model||'');
 const groups={entries:0,exits:0,pauses:0,extra:0,unknown:0};let seen=new Set(),total=0;
 for(const item of data.dashboard.codes){
  if(!Number.isInteger(item.code)||seen.has(item.code)||!Number.isSafeInteger(item.marks)||item.marks<0)return null;
  seen.add(item.code);total+=item.marks;
  const key=!supported?'unknown':item.code===0?'entries':item.code===1?'exits':[2,3].includes(item.code)?'pauses':[4,5].includes(item.code)?'extra':'unknown';groups[key]+=item.marks;
 }
 return total===data.summary.marks?{...groups,profileSupported:supported,total}:null;
}
