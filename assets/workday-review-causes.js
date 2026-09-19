// Classifies verified reconstruction issues; never pairs marks, values time or approves payroll.
export const WORKDAY_REVIEW_CAUSES=Object.freeze({
 all:Object.freeze({label:'Todas las causas',guidance:'Abrí la jornada y contrastá los eventos y su fuente antes de decidir.'}),
 boundaries:Object.freeze({label:'Entradas o salidas',guidance:'Revisá entrada, salida y tipo declarado en el detalle. Una marca aislada no permite completar horas ni presumir una ausencia.'}),
 pauses:Object.freeze({label:'Pausas por revisar',guidance:'Contrastá salida y regreso de pausa. No completes el regreso ni descuentes una duración que no está respaldada.'}),
 identity:Object.freeze({label:'Vínculo laboral',guidance:'Revisá la vinculación entre identificador del reloj, persona y contrato vigente. No asignes la marca a otro legajo por semejanza del nombre.'}),
 timing:Object.freeze({label:'Secuencia o turno',guidance:'Contrastá marcas simultáneas, duración y cruce de fecha con el turno documentado. No inventes un orden ni una jornada distinta.'}),
 source:Object.freeze({label:'Fuente o perfil',guidance:'Pedí revisión de captura, código o perfil del equipo. Conservar el original; no forzar su interpretación ni borrar marcaciones.'}),
 other:Object.freeze({label:'Otras incidencias',guidance:'Revisá el motivo original y su evidencia. No hay una clasificación específica comprobada para este caso.'}),
});
const CODE_CAUSE=Object.freeze({missing_exit:'boundaries',missing_entry:'boundaries',repeated_entry:'boundaries',mixed_interval:'boundaries',wrong_exit:'boundaries',
 pause_without_entry:'pauses',repeated_pause:'pauses',return_without_pause:'pauses',pause_not_closed:'pauses',identity_unlinked:'identity',
 simultaneous_events:'timing',span_exceeded:'timing',overnight_review:'timing',unknown_code:'source',source_observation:'source',unplaced_source_observation:'source'});
const fail=()=>{throw Object.assign(Error('No se pudieron verificar las causas de revisión. Actualizá la consulta.'),{code:'WORKDAY_REVIEW_CAUSE_INVALID'});};
export function normalizeReviewCause(value='all'){if(typeof value!=='string'||!Object.hasOwn(WORKDAY_REVIEW_CAUSES,value))fail();return value;}
export function workdayReviewCauses(row){
 if(!row||!['closed','review'].includes(row.status)||!Array.isArray(row.issues))fail();
 const found=new Set();for(const issue of row.issues){if(!issue||typeof issue.code!=='string'||!/^[a-z][a-z0-9_]{0,79}$/.test(issue.code))fail();found.add(Object.hasOwn(CODE_CAUSE,issue.code)?CODE_CAUSE[issue.code]:'other');}
 if(row.status==='closed'&&found.size)fail();if(row.status==='review'&&!found.size)found.add('other');
 return Object.keys(WORKDAY_REVIEW_CAUSES).filter(k=>found.has(k));
}
export function filterReviewCause(rows,cause='all'){normalizeReviewCause(cause);if(!Array.isArray(rows))fail();return cause==='all'?[...rows]:rows.filter(r=>workdayReviewCauses(r).includes(cause));}
export function summarizeReviewCauses(rows){
 if(!Array.isArray(rows)||rows.length>25000)fail();const counts=Object.fromEntries(Object.keys(WORKDAY_REVIEW_CAUSES).map(k=>[k,0]));let reviewDays=0;
 for(const row of rows){const causes=workdayReviewCauses(row);counts.all++;if(causes.length)reviewDays++;for(const cause of causes)counts[cause]++;}
 return {version:'workday-review-causes.v1',scope:'status_and_search_before_cause',totalDays:rows.length,reviewDays,counts,overlap:true,payrollEligible:false};
}
export function verifyReviewCauses(data,cause){
 normalizeReviewCause(cause);const f=data?.reviewFacets,n=value=>Number.isSafeInteger(value)&&value>=0&&value<=25000;
 if(data?.filters?.cause!==cause||!f||f.version!=='workday-review-causes.v1'||f.scope!=='status_and_search_before_cause'||f.overlap!==true||f.payrollEligible!==false||!n(f.totalDays)||!n(f.reviewDays)||f.reviewDays>f.totalDays)fail();
 if(!f.counts||Object.keys(f.counts).sort().join('|')!==Object.keys(WORKDAY_REVIEW_CAUSES).sort().join('|')||f.counts.all!==f.totalDays||f.totalDays>data.periodSummary.days)fail();
 for(const [key,count]of Object.entries(f.counts))if(!n(count)||key!=='all'&&count>f.reviewDays)fail();
 if(Object.values(f.counts).reduce((a,b)=>a+b,0)-f.counts.all<f.reviewDays||data.pagination.total!==f.counts[cause])fail();
 if(!Array.isArray(data.rows)||data.rows.some(row=>cause!=='all'&&!workdayReviewCauses(row).includes(cause)))fail();
 if(data.summary.reviewDays!==(cause==='all'?f.reviewDays:data.pagination.total))fail();
 const visible=summarizeReviewCauses(data.rows);if(visible.reviewDays>f.reviewDays)fail();
 for(const key of Object.keys(f.counts))if(visible.counts[key]>f.counts[key])fail();
 if(cause==='all'&&data.pagination.total===data.rows.length){if(JSON.stringify(visible)!==JSON.stringify(f))fail();}
 return f;
}
export function reviewCauseLabels(row){return workdayReviewCauses(row).map(key=>WORKDAY_REVIEW_CAUSES[key].label).join(' | ');}
export function reviewCauseGuidance(row){return workdayReviewCauses(row).map(key=>WORKDAY_REVIEW_CAUSES[key].guidance).join(' | ');}
