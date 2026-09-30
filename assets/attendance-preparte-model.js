// Table supplied by Noelia. Exact reference points only; no interpolation or payroll activation.
export const MONTHLY_DEDICATION_REFERENCE = Object.freeze([[4,3],[6,5],[12,10],[17,15],[20,17],[24,20],[30,25],[36,30],[48,40],[53,45],[60,50],[96,80],[100,83],[120,100]].map(Object.freeze));
export const preparteDuration = seconds => Number.isSafeInteger(seconds) && seconds >= 0
  ? String(Math.floor(seconds/3600)).padStart(2,'0')+':'+String(Math.floor(seconds/60)%60).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0') : 'No reconstruido';
export function reviewedSeconds(value) {
  if (typeof value !== 'string' || !/^\d{1,3}:[0-5]\d$/.test(value)) throw Error('Usá horas y minutos: HH:MM. Ejemplo: 13:30, no 13,3.');
  return Number(value.split(':')[0])*3600+Number(value.split(':')[1])*60;
}
export function referencePercentage(seconds) {
  return MONTHLY_DEDICATION_REFERENCE.find(([hours])=>hours*3600===seconds)?.[1] ?? null;
}
export function verifyPreparte(data, period, site) {
  const invalid=()=>{throw Error('No se pudo verificar el preparte. Actualizá la consulta.');};
  const number=n=>Number.isSafeInteger(n)&&n>=0;
  if (!data?.ok || data.version!=='attendance-preparte.v1' || data.period!==period || data.site?.key!==site ||
    data.nominalReadAllowed!==true || data.sourceComplete!==true || data.coverageCertified!==false ||
    data.payrollCalculated!==false || data.payrollPosted!==false || !/^[a-f0-9-]{36}$/.test(data.snapshotId||'') ||
    !/^[a-f0-9]{64}$/.test(data.evidenceHash||'') || !Array.isArray(data.rows) || data.rows.length>2000 || data.summary?.people!==data.rows.length || !number(data.observations)) invalid();
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(data.period) || typeof data.site.label!=='string' || data.site.label.length>500 ||
    !['generatedAt','timezone','rulesVersion'].every(key=>typeof data[key]==='string'&&data[key].length<=100) ||
    !Number.isFinite(Date.parse(data.generatedAt)) || data.lastReceiptAt!==null&&!Number.isFinite(Date.parse(data.lastReceiptAt)) ||
    !number(data.summary.readyForReview) || !number(data.summary.withIncidents)) invalid();
  const ids=new Set();
  for (const row of data.rows) {
    if (!/^[a-f0-9]{64}$/.test(row.evidenceHash||'') || !/^[a-f0-9]{64}$/.test(row.key||'') || ids.has(row.key) || typeof row.name!=='string' || row.name.length>500 ||
      !(row.legajo===null || /^(?:0|[1-9]\d{0,19})$/.test(row.legajo)) || !number(row.daysObserved) || row.daysObserved>31 ||
      !number(row.daysToReview) || row.daysToReview>row.daysObserved || !number(row.extraIntervals) ||
      ![row.ordinarySeconds,row.extraSeconds].every(n=>n===null||number(n)&&n<=31*86400) ||
      !Array.isArray(row.issues) || row.issues.some(s=>typeof s!=='string'||s.length>200) || typeof row.canPropose!=='boolean') invalid();
    if (row.canPropose && (!row.legajo || row.issues.length || row.daysToReview || row.extraSeconds===null || !row.extraIntervals || data.observations)) invalid();
    ids.add(row.key);
  }
  if(data.summary.readyForReview!==data.rows.filter(row=>row.canPropose).length || data.summary.withIncidents!==data.rows.filter(row=>!row.canPropose).length) invalid();
  return data;
}
export function reviewPreparteSelections(data, decisions, { documentReference, confirmed } = {}) {
  const issues=[],rows=[];
  const issue=(key,field,message)=>issues.push(Object.freeze({key,field,message}));
  try { verifyPreparte(data,data?.period,data?.site?.key); }
  catch { return Object.freeze({valid:false,selected:0,issues:Object.freeze([Object.freeze({key:null,field:'source',message:'Consultá nuevamente un preparte completo y vigente antes de revisar.'})]),rows:Object.freeze([])}); }
  const reference=typeof documentReference==='string'?documentReference.trim():'';
  if (reference.length<5 || reference.length>160 || /[<>\x00-\x1f\x7f]/.test(reference)) issue(null,'reference','Indicá el documento que respalda horas, topes y porcentajes.');
  if (confirmed!==true) issue(null,'reviewed','Confirmá la revisión de las filas seleccionadas contra la documentación de Personal.');
  if (!(decisions instanceof Map)) {
    issue(null,'source','Decisiones de preparte inválidas.');
    return Object.freeze({valid:false,selected:0,issues:Object.freeze(issues),rows:Object.freeze([])});
  }
  const known=new Set(data.rows.map(row=>row.key));
  if ([...decisions.keys()].some(key=>!known.has(key))) issue(null,'source','Una decisión pertenece a otro corte. Volvé a consultar.');
  let selected=0;
  for (const source of data.rows) {
    const value=decisions.get(source.key); if (!value?.selected) continue;
    selected++;
    const prefix='Legajo '+(source.legajo||'sin vínculo')+': ';
    if (value.selected!==true) { issue(source.key,'selected',prefix+'la selección no es válida.');continue; }
    if (!source.canPropose) { issue(source.key,'selected',prefix+'resolvé primero las incidencias de origen.');continue; }
    const initial=issues.length;
    let seconds=null;
    try { seconds=reviewedSeconds(value.hours); }
    catch(error) { issue(source.key,'hours',prefix+error.message); }
    if (seconds!==null && (!seconds || seconds>source.extraSeconds)) issue(source.key,'hours',prefix+'las horas reconocidas deben ser positivas y no superar el tiempo extra reconstruido.');
    const validCap=typeof value.cap==='string' && /^(?:0|[1-9]\d?|100)$/.test(value.cap);
    const validPercent=typeof value.percent==='string' && /^(?:[3-9]|[1-8]\d|9[0-5]|100)$/.test(value.percent);
    if (!validCap) issue(source.key,'cap',prefix+'indicá un tope declarado de 0 a 100.');
    if (!validPercent) issue(source.key,'percent',prefix+'indicá un porcentaje de 3 a 95, o 100 para Full Time.');
    const percent=Number(value.percent),cap=Number(value.cap),table=seconds===null?null:referencePercentage(seconds);
    if (validPercent && validCap && percent>cap) issue(source.key,'percent',prefix+'el porcentaje supera el tope declarado.');
    if (validPercent && seconds!==null && percent===100 && table!==100) issue(source.key,'percent',prefix+'Full Time requiere la referencia exacta de 120 horas mensuales reconocidas. Una excepción debe tramitarse por separado.');
    else if (validPercent && table!==null && percent>table) issue(source.key,'percent',prefix+'el porcentaje supera la referencia de horas informada.');
    if (issues.length!==initial) continue;
    const observation=`Preparte ${data.period}; punto ${data.site.key}; evidencia personal ${source.evidenceHash}; extra observado ${preparteDuration(source.extraSeconds)}; reconocido ${value.hours}; tope declarado ${cap}%; propuesto ${percent}%; ${table===null?'valoración documental, sin interpolación':'referencia exacta de tabla '+table+'%'}; pendiente de revisión independiente.`;
    rows.push(Object.freeze([source.legajo,percent===100?'95':'44','','',String(percent),'','',reference,observation,'NO']));
  }
  if (!selected || selected>500) issue(null,'selected','Seleccioná entre 1 y 500 legajos revisados.');
  return Object.freeze({valid:issues.length===0,selected,issues:Object.freeze(issues),rows:Object.freeze(issues.length?[]:rows)});
}
export function preparteNoveltyRows(data, decisions, options = {}) {
  const review=reviewPreparteSelections(data,decisions,options);
  if (!review.valid) throw Error(review.issues[0].message);
  // Preserve the existing mutable sheet-input API, detached from the review.
  return review.rows.map(row=>[...row]);
}
