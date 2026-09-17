import React,{useEffect,useMemo,useRef,useState} from 'react';
import {articleReference,compareLegalVersions,comparisonRecord,exactTextDiff} from '../../assets/legal-version-comparison.js';
import {LEGAL_KINDS} from '../../assets/legal-registry-model.js';
type Snapshot=Parameters<typeof compareLegalVersions>[0];
type Comparison=ReturnType<typeof compareLegalVersions>;
type Props={record:Snapshot;loadVersion:(id:string,version:number,signal:AbortSignal)=>Promise<Snapshot>;onDenied:()=>void;onClose:()=>void};
const labels={added:'Incorporado',removed:'No figura en la versión final',changed:'Modificado',unchanged:'Sin cambios'};
const format=(key:string,value:string)=>value?key==='stage'?(value==='proyecto'?'Proyecto':'Acto registrado'):key.endsWith('Date')?value.split('-').reverse().join('/'):value:'Sin informar';
function ComparedText({before,after,side}:{before:string;after:string;side:'before'|'after'}){
 const diff=useMemo(()=>exactTextDiff(before,after),[before,after]);
 return <><p className="lc-transcription">{diff.parts.filter(p=>p.kind!==(side==='before'?'added':'removed')).map((part,i)=>part.kind==='same'?<React.Fragment key={i}>{part.text}</React.Fragment>:side==='before'?<del key={i}>{part.text}</del>:<ins key={i}>{part.text}</ins>)}</p>{diff.mode==='bounded'&&<small>Texto extenso: el resaltado agrupa diferencias en bloques. El texto se conserva íntegro.</small>}</>;
}
export function LegalVersionComparison({record,loadVersion,onDenied,onClose}:Props){
 const top=record.currentVersion,initial=record.version<top?record.version:top-1;
 const[from,setFrom]=useState(initial),[to,setTo]=useState(record.version<top?top:record.version);
 const[result,setResult]=useState<Comparison|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(false);
 const[notice,setNotice]=useState('Seleccioná dos versiones guardadas y consultá sus diferencias.'),[filter,setFilter]=useState('changes');
 const alive=useRef(true),epoch=useRef(0),controller=useRef<AbortController|null>(null);
 const abort=()=>{epoch.current++;controller.current?.abort();controller.current=null;};
 useEffect(()=>{alive.current=true;document.getElementById('lcTitle')?.focus();const clear=()=>{alive.current=false;abort();};window.addEventListener('pagehide',clear);return()=>{clear();window.removeEventListener('pagehide',clear);};},[]);
 function selection(side:'from'|'to',value:string){abort();setBusy(false);setResult(null);setError(false);setNotice('Selección modificada. Consultá nuevamente para comparar esas versiones.');(side==='from'?setFrom:setTo)(Number(value));}
 async function compare(){
  if(busy)return;if(!Number.isInteger(from)||!Number.isInteger(to)||from<1||from>=to||to>top){setError(true);setNotice('La versión inicial debe ser anterior a la versión final.');return;}
  abort();const token=epoch.current,ctrl=new AbortController();controller.current=ctrl;const timer=setTimeout(()=>ctrl.abort(),25000);
  setBusy(true);setError(false);setResult(null);setNotice('Consultando ambas versiones con tus permisos actuales…');
  try{const [a,b]=await Promise.all([loadVersion(record.id,from,ctrl.signal),loadVersion(record.id,to,ctrl.signal)]);
   if(!alive.current||token!==epoch.current||ctrl.signal.aborted)return;
   comparisonRecord(a,record.id,from);comparisonRecord(b,record.id,to);const comparison=compareLegalVersions(a,b);setResult(comparison);setFilter('changes');setNotice('Comparación documental completada. No determina vigencia ni efectos jurídicos.');
  }catch(e:any){ctrl.abort();if(!alive.current||token!==epoch.current)return;if([401,403].includes(e.status)){onDenied();return;}setError(true);setNotice(e.name==='AbortError'?'La consulta excedió el tiempo disponible. Volvé a comparar.':e.name==='TypeError'?'No se pudo consultar el registro. Revisá la conexión.':e.message||'No fue posible comparar las versiones.');}
  finally{clearTimeout(timer);if(alive.current&&token===epoch.current){controller.current=null;setBusy(false);}}
 }
 const shown=result?.articles.filter(a=>filter==='all'||(filter==='changes'?a.status!=='unchanged':a.status===filter))||[];
 return <section className="lr-card lc-workspace" aria-labelledby="lcTitle">
  <header className="lr-section-heading"><div><p className="lr-eyebrow">HISTORIAL DOCUMENTAL</p><h2 id="lcTitle" tabIndex={-1}>Comparar versiones</h2><p>{LEGAL_KINDS[record.kind]} {record.number}/{record.year} · {record.issuer}</p></div><button className="button" type="button" onClick={()=>{abort();onClose();}}>Volver a la ficha</button></header>
  <p>Identificá cambios en los datos registrados, las transcripciones y el PDF. No compara automáticamente el texto interno del PDF ni interpreta consecuencias jurídicas.</p>
  <form className="lc-selection" onSubmit={e=>{e.preventDefault();void compare();}}>
   <label>Versión inicial<select name="compareFrom" value={from} onChange={e=>selection('from',e.target.value)}>{record.history.map(h=><option key={h.version} value={h.version}>Versión {h.version}</option>)}</select></label>
   <label>Versión final<select name="compareTo" value={to} onChange={e=>selection('to',e.target.value)}>{record.history.map(h=><option key={h.version} value={h.version}>Versión {h.version}</option>)}</select></label>
   <button className="button primary" disabled={busy} type="submit">{busy?'Consultando…':'Comparar seleccionadas'}</button>
  </form>
  <div className={'lr-notice '+(error?'lr-error':'')} role="status" aria-live="polite">{notice}</div>
  {result&&<div className="lc-results">
   <div className="lc-version-bar"><strong>Versión {result.before.version} → Versión {result.after.version}</strong><span>Identificadores documentales, no versiones de vigencia jurídica.</span></div>
   <div className="lc-stats" aria-label="Resumen de diferencias"><div><strong>{result.changedFields}</strong><span>Datos de ficha modificados</span></div><div><strong>{result.counts.changed}</strong><span>Artículos modificados</span></div><div><strong>{result.counts.added} / {result.counts.removed}</strong><span>Incorporados / no presentes</span></div><div><strong>{result.document.contentChanged?'Cambió':'Sin cambios'}</strong><span>Archivo PDF</span></div></div>
   {!result.hasChanges&&<div className="lr-notice">No hay diferencias en la ficha, las transcripciones ni el archivo entre estas versiones. Revisá el motivo y el responsable de cada registro.</div>}
   <section aria-labelledby="lcTrace"><h3 id="lcTrace">Responsables y fundamento</h3><div className="lc-pair">{[result.before,result.after].map(r=><article key={r.version}><h4>Versión {r.version}</h4><p>{r.metadata.title}</p><p>{r.reason}</p><small>{r.recordedBy} · {new Date(r.recordedAt).toLocaleString('es-AR')}</small><a href={'/juridica?norma='+r.id+'&version='+r.version}>Abrir esta versión documental</a></article>)}</div></section>
   <section aria-labelledby="lcFields"><h3 id="lcFields">Datos de la ficha</h3>{result.changedFields?result.fields.filter(f=>f.changed).map(f=><article className="lc-field-change" key={f.key}><h4>{f.label}</h4><div className="lc-pair"><div><span>Antes · v{result.before.version}</span><p>{format(f.key,f.before)}</p></div><div><span>Después · v{result.after.version}</span><p>{format(f.key,f.after)}</p></div></div></article>):<p>No se modificaron los datos de la ficha.</p>}</section>
   <section aria-labelledby="lcDocument"><h3 id="lcDocument">Documento fuente</h3><p>{result.document.contentChanged?'Las huellas SHA-256 son distintas: los archivos no son idénticos. Esto no demuestra por sí solo que cambió una disposición normativa.':'La huella SHA-256 es la misma: se conserva el contenido del archivo.'}{result.document.filenameChanged?' Cambió el nombre del archivo.':''}</p><div className="lc-pair">{[result.before,result.after].map(r=><article key={r.version}><h4>PDF · versión {r.version}</h4><p>{r.document.filename} · {r.document.pages} páginas · {r.document.bytes} bytes</p><code>{r.document.sha256}</code></article>)}</div></section>
   <section aria-labelledby="lcArticles"><div className="lr-section-heading"><h3 id="lcArticles">Cambios por artículo</h3><label>Mostrar artículos<select name="compareFilter" value={filter} onChange={e=>setFilter(e.target.value)}><option value="changes">Con cambios</option><option value="all">Todos</option><option value="changed">Modificados</option><option value="added">Incorporados</option><option value="removed">No presentes en la final</option><option value="unchanged">Sin cambios</option></select></label></div>
    <p>Las etiquetas se relacionan por coincidencia exacta, salvo mayúsculas. Un artículo renombrado aparece como no presente e incorporado: no se supone que sea equivalente ni que esté derogado.</p>
    {result.orderChanged&&<div className="lr-notice">Cambió el orden relativo de artículos que figuran en ambas versiones. Ese orden no se interpreta como cambio normativo.</div>}
    <p className="lr-subtle">{shown.length} artículos en esta vista. El resaltado indica texto retirado o incorporado en la transcripción, no en el PDF.</p>
    {!shown.length&&<div className="lr-empty">No hay artículos para el filtro seleccionado.</div>}
    <div className="lc-articles">{shown.map(a=><details key={a.key} open={a.status!=='unchanged'} className={'lc-article lc-'+a.status}>
     <summary><strong>{a.after?.label||a.before.label}</strong><span>{labels[a.status]}</span></summary>
     <div className="lc-pair">{(['before','after'] as const).map(side=>{
      const item=a[side],r=result[side],index=side==='before'?a.beforeIndex:a.afterIndex;
      if(!item)return <div key={side} className="lc-missing"><h4>{side==='before'?'Antes':'Después'} · versión {r.version}</h4><p>No figura un artículo con esa etiqueta en esta versión.</p></div>;
      const ref=articleReference(r,index);
      return <div key={side}><h4>{side==='before'?'Antes':'Después'} · versión {r.version}</h4><p className="lr-tag">{item.label} · Página {item.page} · Posición {index+1}</p>
       {a.before&&a.after?<ComparedText before={a.before.text} after={a.after.text} side={side}/>:<p className="lc-transcription">{item.text}</p>}
       <details className="lc-citation"><summary>Referencia de esta versión</summary><p>{ref.text}</p><a href={ref.href}>Abrir artículo en la versión {r.version}</a></details></div>;
     })}</div>
    </details>)}</div>
   </section>
   <footer className="lr-notice">Comparación de versiones del registro: no acredita sanción, modificación, derogación ni validez jurídica. Los PDF originales y la revisión competente siguen siendo la referencia.</footer>
  </div>}
 </section>;
}
