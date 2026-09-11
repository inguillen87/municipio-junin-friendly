/** Read-only reconstruction of declared clock intervals, never a payroll calculation. */
export const WORKDAY_RULES = Object.freeze({
  version: 'declared-intervals.v1', maxSpanSeconds: 86400,
  profile: 'zkteco-classic-0-5', payrollEligible: false,
});
export const STATE_LABELS = Object.freeze({
  0: 'Entrada', 1: 'Salida', 2: 'Salida a pausa', 3: 'Regreso de pausa',
  4: 'Entrada de tiempo extra', 5: 'Salida de tiempo extra',
});
export const ISSUE_LABELS = Object.freeze({
  missing_exit: 'Entrada sin salida en la captura',
  missing_entry: 'Salida sin entrada asociada',
  repeated_entry: 'Entrada repetida antes de cerrar el tramo',
  mixed_interval: 'Cambio de tipo sin cerrar el tramo anterior',
  pause_without_entry: 'Pausa sin un tramo abierto',
  repeated_pause: 'Salida a pausa repetida',
  return_without_pause: 'Regreso sin salida a pausa',
  pause_not_closed: 'Pausa sin regreso registrado',
  unknown_code: 'Código fuera del perfil 0–5',
  source_observation: 'Registro observado en la fuente',
  simultaneous_events: 'Marcas simultáneas: secuencia ambigua',
  span_exceeded: 'Tramo superior al límite técnico de 24 horas',
  wrong_exit: 'Salida de un tipo distinto al tramo abierto',
  identity_unlinked: 'Persona o contrato pendientes de vinculación',
  overnight_review: 'Tramo entre dos fechas: contrastar con el turno nocturno',
});
const DAY = 86400000;
const plainDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') &&
  Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
function requireValue(ok) { if (!ok) throw new Error('WORKDAY_INPUT_INVALID'); }
function localFormatter(timezone) {
  const f = new Intl.DateTimeFormat('sv-SE', {timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  return ms => f.format(new Date(ms)).replace(',','');
}
/** Events must be complete for the supplied window, not a UI page or hour-filtered subset. */
export function reconstructWorkdays(input) {
  requireValue(input && Array.isArray(input.events) && input.events.length<=25000);
  requireValue(plainDate(input.from) && plainDate(input.to) && input.to>=input.from &&
    Date.parse(input.to)-Date.parse(input.from)<=92*DAY);
  const local = localFormatter(input.timezone || 'America/Argentina/Mendoza');
  const streams = new Map(), ordinals = new Set(), rows = new Map();
  const supported = /^K20(?:\/|$)/i.test(input.model || '');
  for (const value of input.events) {
    requireValue(value && Number.isSafeInteger(value.ordinal) && value.ordinal>0 && !ordinals.has(value.ordinal));
    ordinals.add(value.ordinal);
    const ms=Date.parse(value.occurredAt);
    requireValue(Number.isFinite(ms) && ms%1000===0 && /(?:Z|[+-]\d\d:\d\d)$/.test(value.occurredAt || ''));
    requireValue(typeof value.personKey==='string' && /^[a-f0-9]{64}$/.test(value.personKey));
    requireValue(typeof value.streamKey==='string' && /^[a-f0-9]{64}$/.test(value.streamKey));
    requireValue(typeof value.personLabel==='string' && value.personLabel.length<=500 &&
      (value.legajo===null || Number.isSafeInteger(value.legajo) || typeof value.legajo==='string'));
    requireValue(['mapped','unmapped','ambiguous'].includes(value.identityState));
    requireValue(Number.isInteger(value.code) && value.code>=0 && value.code<=255);
    requireValue(Array.isArray(value.issues) && value.issues.length<=10 && value.issues.every(v=>typeof v==='string' && v.length<=80));
    const timestamp=local(ms);
    requireValue(timestamp===value.localTimestamp);
    const e={...value,ms,day:timestamp.slice(0,10),supported};
    if (!streams.has(e.streamKey)) streams.set(e.streamKey,[]);
    const prior=streams.get(e.streamKey)[0];
    requireValue(!prior||(prior.personKey===e.personKey&&prior.identityState===e.identityState&&prior.legajo===e.legajo));
    streams.get(e.streamKey).push(e);
  }
  function row(e,day=e.day) {
    const key=e.streamKey+':'+day;
    if(!rows.has(key)) rows.set(key,{key,day,personKey:e.personKey,personLabel:e.personLabel,legajo:e.legajo,
      identityState:e.identityState,ordinarySeconds:0,extraSeconds:0,pauseSeconds:0,
      intervals:[],issues:[],events:[],_seen:new Set(),_issueKeys:new Set()});
    return rows.get(key);
  }
  function remember(r,e) {
    if(!r._seen.has(e.ordinal)) {r._seen.add(e.ordinal);r.events.push({ordinal:e.ordinal,occurredAt:e.occurredAt,localTimestamp:e.localTimestamp,code:e.code,label:STATE_LABELS[e.code]||'Código '+e.code});}
  }
  function problem(r,code,events) {
    for(const e of events) remember(r,e);
    const refs=[...new Set(events.map(e=>e.ordinal))];
    const key=code+':'+refs.join(',');
    if(!r._issueKeys.has(key)){r._issueKeys.add(key);r.issues.push({code,label:ISSUE_LABELS[code],ordinals:refs});}
  }
  for(const events of streams.values()) {
    events.sort((a,b)=>a.ms-b.ms||a.ordinal-b.ordinal);
    let active=null;
    const abandon=(code,extra=[])=>{
      if(active){problem(active.row,code,[active.start,...extra]);active=null;}
    };
    for(let i=0;i<events.length;i++){
      const e=events[i];
      if(active && e.ms-active.start.ms>WORKDAY_RULES.maxSpanSeconds*1000) abandon('span_exceeded');
      // No arbitrary ordering of simultaneous events, even if different source sequences exist.
      const same=[e];while(i+1<events.length&&events[i+1].ms===e.ms)same.push(events[++i]);
      if(same.length>1){abandon('simultaneous_events',same);problem(row(e),'simultaneous_events',same);continue;}
      if(e.issues.length){abandon('source_observation',[e]);problem(row(e),'source_observation',[e]);continue;}
      if(!supported||!(e.code in STATE_LABELS)){abandon('unknown_code',[e]);problem(row(e),'unknown_code',[e]);continue;}
      if(e.code===0||e.code===4){
        if(active)abandon(active.type===e.code?'repeated_entry':'mixed_interval',[e]);
        const r=row(e);remember(r,e);active={start:e,type:e.code,row:r,pauses:[],pause:null,invalid:false};continue;
      }
      if(!active){problem(row(e),e.code===1||e.code===5?'missing_entry':'pause_without_entry',[e]);continue;}
      const r=active.row;remember(r,e);
      if(e.code===2){
        if(active.pause){problem(r,'repeated_pause',[active.pause,e]);active.invalid=true;}
        else active.pause=e;
      }else if(e.code===3){
        if(!active.pause){problem(r,'return_without_pause',[e]);active.invalid=true;}
        else {active.pauses.push({start:active.pause,end:e});active.pause=null;}
      }else if(e.code===1||e.code===5){
        if(e.code!==(active.type===0?1:5)){problem(r,'wrong_exit',[active.start,e]);active=null;continue;}
        if(active.pause){problem(r,'pause_not_closed',[active.pause,e]);active.invalid=true;}
        if(!active.invalid){
          const gross=(e.ms-active.start.ms)/1000;
          const paused=active.pauses.reduce((s,p)=>s+(p.end.ms-p.start.ms)/1000,0);
          requireValue(gross>0&&paused>=0&&paused<=gross);
          const kind=active.type===0?'ordinary':'extra';
          const interval={kind,startOrdinal:active.start.ordinal,endOrdinal:e.ordinal,
            startAt:active.start.occurredAt,endAt:e.occurredAt,startLocal:active.start.localTimestamp,endLocal:e.localTimestamp,
            elapsedSeconds:gross,pauseSeconds:paused,netSeconds:gross-paused,
            pauseOrdinals:active.pauses.flatMap(p=>[p.start.ordinal,p.end.ordinal])};
          if(active.start.day!==e.day)problem(r,'overnight_review',[active.start,e]);
          r.intervals.push(interval);r[kind==='ordinary'?'ordinarySeconds':'extraSeconds']+=interval.netSeconds;r.pauseSeconds+=paused;
        }
        active=null;
      }
    }
    abandon('missing_exit');
  }
  const output=[];
  for(const r of rows.values()){
    if(r.day<input.from||r.day>input.to)continue;
    r.events.sort((a,b)=>Date.parse(a.occurredAt)-Date.parse(b.occurredAt)||a.ordinal-b.ordinal);
    if(r.identityState!=='mapped')problem(r,'identity_unlinked',[]);
    r.eventCount=r.events.length;r.closedIntervalCount=r.intervals.length;
    r.reconstructedSeconds=r.ordinarySeconds+r.extraSeconds;
    r.status=r.issues.length?'review':r.intervals.length?'closed':'review';
    r.firstEventAt=r.events[0]?.occurredAt||null;r.lastEventAt=r.events.at(-1)?.occurredAt||null;
    r.payableSeconds=null;r.amountArs=null;r.payrollEligible=false;
    delete r._seen;delete r._issueKeys;output.push(r);
  }
  output.sort((a,b)=>b.day.localeCompare(a.day)||a.personLabel.localeCompare(b.personLabel,'es')||a.key.localeCompare(b.key));
  return {version:WORKDAY_RULES.version,rows:output,summary:summarizeWorkdays(output),
    rules:{...WORKDAY_RULES,profileSupported:supported,dayAllocation:'interval_start_date',rounding:'none'},
    coverageCertified:false};
}
export function summarizeWorkdays(rows){
  return {days:rows.length,people:new Set(rows.map(r=>r.personKey)).size,
    closedDays:rows.filter(r=>r.status==='closed').length,reviewDays:rows.filter(r=>r.status==='review').length,
    extraDays:rows.filter(r=>r.extraSeconds>0).length,unlinkedDays:rows.filter(r=>r.identityState!=='mapped').length,
    ordinarySeconds:rows.reduce((s,r)=>s+r.ordinarySeconds,0),extraSeconds:rows.reduce((s,r)=>s+r.extraSeconds,0),
    pauseSeconds:rows.reduce((s,r)=>s+r.pauseSeconds,0),
    intervalCount:rows.reduce((s,r)=>s+r.intervals.length,0),
    payableSeconds:null,amountArs:null};
}
export function filterWorkdays(rows,{search='',status='all'}={}){
  requireValue(typeof search==='string'&&search.length<=120&&!/[\x00-\x1f\x7f]/.test(search)&&['all','review','closed','extra','unlinked'].includes(status));
  const needle=search.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  return rows.filter(r=>(status==='all'||(status==='extra'?r.extraSeconds>0:status==='unlinked'?r.identityState!=='mapped':r.status===status))&&
    (!needle||(r.personLabel+' '+(r.legajo??'')).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(needle)));
}
