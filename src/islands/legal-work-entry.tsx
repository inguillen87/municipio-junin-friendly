import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {WORK_STATES,blankWork,cleanWorkSave,workUuid,workDay} from '../../assets/legal-work-model.js';
import {legalWorkRequest} from '../../assets/legal-work-client.js';
const initialFilters={q:'',status:'',mine:false,page:1};
const date=(d:string)=>d?d.split('-').reverse().join('/'):'Sin fecha';
const when=(s:string)=>new Intl.DateTimeFormat('es-AR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Argentina/Mendoza'}).format(new Date(s));
function App({close}:any){
 const [boot,setBoot]=useState<any>(null),[data,setData]=useState<any>(null),[record,setRecord]=useState<any>(null);
 const [filters,setFilters]=useState(initialFilters),[typed,setTyped]=useState(initialFilters),[reload,setReload]=useState(0);
 const [draft,setDraft]=useState<any>(null),[review,setReview]=useState<any>(null),[pending,setPending]=useState<any>(null);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[message,setMessage]=useState('Verificando acceso al área…'),[denied,setDenied]=useState(false);
 const serial=useRef(0),active=useRef(true),writeLock=useRef(false),readController=useRef<AbortController|null>(null),state=useRef<any>({}),titleRef=useRef<HTMLHeadingElement>(null);
 state.current={draft,review,pending,busy,boot};
 const loseAccess=()=>{serial.current++;readController.current?.abort();setDenied(true);setBoot(null);setData(null);setRecord(null);setDraft(null);setReview(null);setPending(null);setMessage('Tu sesión o permiso cambió. Cerrá esta ventana y volvé a ingresar.');};
 function showError(e:any){if(!active.current)return;if([401,403].includes(e.status))loseAccess();else if(e.name!=='AbortError')setMessage(e.message||'No se pudo completar la operación.');}
 async function recheck(){const b=await legalWorkRequest({resource:'bootstrap'});if(state.current.boot&&state.current.boot.scope!==b.scope){loseAccess();throw Error('La sesión cambió.');}return b;}
 useEffect(()=>{active.current=true;const c=new AbortController();void legalWorkRequest({resource:'bootstrap'},{signal:c.signal}).then(b=>{
  if(!active.current)return;if(typeof b.canManage!=='boolean'||!workUuid(b.membershipId)||!workDay(b.today)||!Array.isArray(b.responsibles)||!/^[a-f0-9]{64}$/.test(b.scope))throw Error('No se pudo verificar el acceso.');setBoot(b);setMessage('');
 }).catch(showError);
 const visibility=()=>{if(!document.hidden&&state.current.boot)void recheck().catch(showError);};document.addEventListener('visibilitychange',visibility);
 return()=>{active.current=false;serial.current++;c.abort();readController.current?.abort();document.removeEventListener('visibilitychange',visibility);};},[]);
 useEffect(()=>{if(!boot||denied||record||draft)return;const c=new AbortController(),n=++serial.current;readController.current?.abort();readController.current=c;setLoading(true);setData(null);
 void legalWorkRequest({resource:'list',q:filters.q,status:filters.status,mine:String(filters.mine),page:String(filters.page)},{scope:boot.scope,signal:c.signal}).then(r=>{if(n!==serial.current||!active.current)return;if(r.page!==filters.page||r.pageSize!==20||!Number.isInteger(r.total)||!Array.isArray(r.rows))throw Error('La bandeja no pudo verificarse.');setData(r);setLoading(false);}).catch(e=>{if(n===serial.current){setLoading(false);showError(e);}});return()=>c.abort();
 },[boot,filters,reload,record,draft,denied]);
 async function open(id:string){const n=++serial.current,c=new AbortController();readController.current?.abort();readController.current=c;setBusy(true);setMessage('Consultando la ficha guardada…');
 try{const r=await legalWorkRequest({resource:'detail',id},{scope:boot.scope,signal:c.signal});if(!active.current||n!==serial.current)return;if(r.record?.id!==id||!Array.isArray(r.record.history))throw Error('La ficha recibida no corresponde al asunto.');setRecord(r.record);setDraft(null);setReview(null);setPending(null);setMessage('');setTimeout(()=>titleRef.current?.focus(),0);}catch(e){showError(e);}finally{if(active.current&&n===serial.current)setBusy(false);}}
 function back(){if(busy||pending)return;if(draft&&JSON.stringify(draft)!==JSON.stringify(blankWork(boot.membershipId))&&!confirm('Descartar este formulario sin guardar?'))return;setDraft(null);setReview(null);setRecord(null);setMessage('');setReload(v=>v+1);}
 function create(){if(!boot.canManage||busy)return;serial.current++;readController.current?.abort();setDraft(blankWork(boot.membershipId));setReview(null);setPending(null);setRecord(null);setMessage('');}
 function edit(){if(!record||!boot.canManage)return;setDraft({id:record.id,expectedVersion:record.recordVersion,metadata:{...record.metadata},note:''});setReview(null);setMessage('Cada confirmación agrega una actuación al historial; no borra la anterior.');}
 function update(key:string,value:string){if(pending||busy)return;setDraft((d:any)=>key==='note'?{...d,note:value}:{...d,metadata:{...d.metadata,[key]:value}});setReview(null);}
 function prepare(e:any){e.preventDefault();try{const value=cleanWorkSave(draft);setDraft(value);setReview(value);setMessage('Revisá los datos y el fundamento antes de confirmar. Todavía no se guardó.');}catch(e){showError(e);}}
 async function acknowledged(receipt:any,attempt:any){if(attempt.payload.id&&receipt.id!==attempt.payload.id||receipt.recordVersion!==attempt.payload.expectedVersion+1)throw Error('La confirmación no coincide con lo revisado.');setPending(null);setDraft(null);setReview(null);setRecord(null);setMessage('Actuación guardada: '+receipt.code+' · versión '+receipt.recordVersion);const r=await legalWorkRequest({resource:'detail',id:receipt.id},{scope:boot.scope});if(!active.current)return;if(r.record?.id!==receipt.id)throw Error('No se pudo recuperar la ficha guardada.');setRecord(r.record);}
 async function save(same:any=null){if(writeLock.current||!boot.canManage)return;const attempt=same??{key:crypto.randomUUID(),payload:review};if(!attempt.payload)return;writeLock.current=true;setBusy(true);setPending(attempt);setMessage('Guardando una actuación…');
 try{const b=await recheck();if(!active.current||b.scope!==boot.scope)return;const r=await legalWorkRequest(null,{scope:boot.scope,body:attempt.payload,key:attempt.key});if(active.current)await acknowledged(r,attempt);}
 catch(e:any){if(!active.current)return;if(['LW_INPUT_INVALID','LW_CONFLICT','LW_RESPONSIBLE_INVALID','LW_HISTORY_LIMIT','LW_STORAGE'].includes(e.code)){setPending(null);setReview(null);}showError(e);}
 finally{writeLock.current=false;if(active.current)setBusy(false);}}
 async function recover(){if(writeLock.current||!pending)return;writeLock.current=true;setBusy(true);try{const r=await legalWorkRequest({resource:'attempt',key:pending.key},{scope:boot.scope});if(active.current)await acknowledged(r,pending);}catch(e:any){if(e.status===404)setMessage('Todavía no hay confirmación para este intento. Podés volver a consultar o reenviar exactamente el mismo intento.');else showError(e);}finally{writeLock.current=false;if(active.current)setBusy(false);}}
 function requestClose(){const s=state.current;if(s.busy||s.pending){setMessage('Primero recuperá la confirmación del intento. Así evitamos perder el seguimiento de una actuación.');return;}if(s.draft&&!confirm('Cerrar y descartar el formulario sin guardar?'))return;close();}
 useEffect(()=>{const d=document.querySelector('#legalWorkDialog') as HTMLDialogElement;if(!d)return;const cancel=(e:Event)=>{e.preventDefault();requestClose();};d.addEventListener('cancel',cancel);return()=>d.removeEventListener('cancel',cancel);},[]);
 const responsible=(id:string)=>boot?.responsibles.find((x:any)=>x.id===id)?.name||record?.responsibleName||'Responsable no disponible';
 return <section className="lw-app">
  <header className="lw-header"><div><p>JURÍDICA · GESTIÓN DE TRABAJO</p><h2 ref={titleRef} tabIndex={-1}>{record&&!draft?record.code:'Asuntos y actuaciones'}</h2><span>Responsables, próximos pasos y seguimiento dentro de MuniControl.</span></div><button onClick={requestClose} type="button" className="lw-secondary">Cerrar ×</button></header>
  <details className="lw-scope"><summary>Trabajo compartido · No incluir actuaciones reservadas</summary><p>Acceso según permisos del Registro Normativo. El código AJ identifica seguimiento interno; no reemplaza la numeración oficial de un expediente.</p></details>
  <p role="status" aria-live="polite" className="lw-message">{message}</p>
  {denied?<div role="alert">Acceso interrumpido. No se muestran datos de la sesión anterior.</div>:!boot?<p>Consultando acceso…</p>:<>
  {!draft&&!record&&<>
   <div className="lw-toolbar"><h3>Bandeja del área</h3>{boot.canManage&&<button type="button" onClick={create} disabled={busy}>Nuevo asunto</button>}<button type="button" className="lw-secondary" onClick={()=>{setMessage('');setReload(v=>v+1);}} disabled={loading||busy}>Actualizar</button></div>
   <form className="lw-filters" onSubmit={e=>{e.preventDefault();setFilters({...typed,q:typed.q.trim(),page:1});setMessage('');}}>
    <label>Buscar por título o referencia<input value={typed.q} maxLength={100} onChange={e=>setTyped(v=>({...v,q:e.target.value}))}/></label>
    <label>Estado<select aria-label="Estado" value={typed.status} onChange={e=>setTyped(v=>({...v,status:e.target.value}))}><option value="">Todos</option>{Object.entries(WORK_STATES).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
    <label className="lw-check"><input type="checkbox" checked={typed.mine} onChange={e=>setTyped(v=>({...v,mine:e.target.checked}))}/>Asignados a mí</label><button type="submit" disabled={loading||busy}>Aplicar filtros</button>
   </form>
   {loading?<p role="status">Consultando asuntos guardados…</p>:data&&<>
    <p className="lw-caption">Resumen de la búsqueda y asignación; el filtro de estado se aplica al listado.</p>
    <div className="lw-counts">{[['open','Abiertos'],['overdue','Fecha de seguimiento superada'],['closed','Cerrados']].map(([k,l])=><div key={k}><strong>{data.counts[k]}</strong><span>{l}</span></div>)}</div>
    <p className="lw-caption">{data.total} asuntos en el listado · fecha de consulta {date(data.today)}. Las fechas son de seguimiento interno, no vencimientos jurídicos calculados.</p>
    {!data.rows.length?<div className="lw-empty"><h3>No hay asuntos para este filtro</h3><p>Registrá el primer asunto o cambiá los filtros. No se muestran ejemplos como pendientes reales.</p></div>:<div className="lw-cards">{data.rows.map((r:any)=><article key={r.id}><div className={'lw-badge '+r.metadata.status}>{WORK_STATES[r.metadata.status]}</div><small>{r.code} · versión {r.recordVersion}</small><h3>{r.metadata.title}</h3><p><strong>Responsable:</strong> {r.responsibleName}</p><p><strong>Próximo paso:</strong> {r.metadata.nextStep||'Cerrado sin paso pendiente'}</p><p className={r.overdue?'lw-overdue':''}><strong>Seguimiento:</strong> {date(r.metadata.targetDate)}</p><button type="button" className="lw-secondary" onClick={()=>void open(r.id)} disabled={busy}>Abrir asunto</button></article>)}</div>}
    <nav className="lw-pagination" aria-label="Páginas de asuntos"><button className="lw-secondary" disabled={filters.page===1||busy} onClick={()=>setFilters(v=>({...v,page:v.page-1}))}>Anterior</button><span>Página {filters.page}{data.total?' de '+Math.ceil(data.total/20):''}</span><button className="lw-secondary" disabled={filters.page*20>=data.total||busy} onClick={()=>setFilters(v=>({...v,page:v.page+1}))}>Siguiente</button></nav>
   </>}
  </>}
  {record&&!draft&&<>
   <div className="lw-toolbar"><button className="lw-secondary" type="button" onClick={back} disabled={busy}>← Volver a la bandeja</button>{boot.canManage&&record.recordVersion<100&&<button type="button" onClick={edit} disabled={busy}>Registrar actuación</button>}</div>
   <article className="lw-detail"><div className={'lw-badge '+record.metadata.status}>{WORK_STATES[record.metadata.status]}</div><h3>{record.metadata.title}</h3><dl><dt>Referencia institucional</dt><dd>{record.metadata.reference||'Sin referencia externa'}</dd><dt>Responsable</dt><dd>{record.responsibleName}</dd><dt>Seguimiento interno</dt><dd>{date(record.metadata.targetDate)}</dd><dt>Próximo paso</dt><dd>{record.metadata.nextStep||'Sin paso pendiente'}</dd><dt>Última actuación</dt><dd>{when(record.updatedAt)} · versión {record.recordVersion}</dd></dl></article>
   <h3>Historial de actuaciones</h3><p className="lw-caption">Cada cambio conserva el estado, responsable, próximo paso y fundamento de ese momento. No se borran versiones.</p>
   <div className="lw-history">{record.history.map((h:any)=><article key={h.version}><div><strong>Versión {h.version} · {WORK_STATES[h.metadata.status]}</strong><time>{when(h.recordedAt)}</time></div><p>{h.note}</p><small>{h.actor} · Responsable: {h.responsibleName}</small><details><summary>Ver datos de esta actuación</summary><dl><dt>Asunto</dt><dd>{h.metadata.title}</dd><dt>Referencia</dt><dd>{h.metadata.reference||'—'}</dd><dt>Próximo paso</dt><dd>{h.metadata.nextStep||'—'}</dd><dt>Fecha</dt><dd>{date(h.metadata.targetDate)}</dd></dl></details></article>)}</div>
  </>}
  {draft&&<>
   <div className="lw-toolbar"><h3>{draft.id?'Actuación sobre '+record.code:'Registrar un asunto interno'}</h3><button className="lw-secondary" type="button" onClick={back} disabled={busy||!!pending}>Cancelar</button></div>
   {!review&&!pending?<form onSubmit={prepare} className="lw-form">
    <label className="lw-wide">Asunto<input required minLength={5} maxLength={160} value={draft.metadata.title} onChange={e=>update('title',e.target.value)} disabled={busy}/></label>
    <label>Referencia de expediente o documento<input maxLength={100} value={draft.metadata.reference} onChange={e=>update('reference',e.target.value)} disabled={busy}/><small>Opcional. Conservá el número del registro institucional; no se crea un expediente oficial.</small></label>
    <label>Responsable<select aria-label="Responsable" required value={draft.metadata.responsibleId} onChange={e=>update('responsibleId',e.target.value)} disabled={busy}><option value="">Elegí una persona habilitada</option>{boot.responsibles.map((r:any)=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
    <label>Estado<select aria-label="Estado" value={draft.metadata.status} onChange={e=>update('status',e.target.value)} disabled={busy||!draft.id}>{Object.entries(WORK_STATES).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
    <label>Fecha de seguimiento<input type="date" min="2000-01-01" max="2099-12-31" value={draft.metadata.targetDate} onChange={e=>update('targetDate',e.target.value)} disabled={busy}/><small>Recordatorio interno. No calcula plazos legales ni envía avisos.</small></label>
    <label className="lw-wide">Próximo paso<textarea aria-label="Próximo paso" required={draft.metadata.status!=='closed'} minLength={draft.metadata.status==='closed'?0:5} maxLength={300} rows={3} value={draft.metadata.nextStep} onChange={e=>update('nextStep',e.target.value)} disabled={busy}/></label>
    <label className="lw-wide">Actuación realizada o fundamento<textarea aria-label="Actuación realizada o fundamento" required minLength={5} maxLength={1500} rows={5} value={draft.note} onChange={e=>update('note',e.target.value)} disabled={busy}/><small>Explicá qué se hizo y por qué se cambia el estado, responsable o fecha.</small></label>
    <footer className="lw-wide"><button type="submit" disabled={busy}>Revisar antes de guardar</button></footer>
   </form>:<article className="lw-review"><h3>{pending?'Confirmación del intento':'Revisar la actuación'}</h3><p>{record?.metadata.status==='closed'&&draft.metadata.status!=='closed'?'Este cambio reabre el asunto y conserva su cierre anterior.':draft.metadata.status==='closed'?'Este cambio cierra el seguimiento interno. No equivale a dictamen o resolución oficial.':'Se guardará una nueva actuación con tu usuario y fecha del servidor.'}</p><dl><dt>Asunto</dt><dd>{draft.metadata.title}</dd><dt>Referencia</dt><dd>{draft.metadata.reference||'—'}</dd><dt>Responsable</dt><dd>{responsible(draft.metadata.responsibleId)}</dd><dt>Estado</dt><dd>{WORK_STATES[draft.metadata.status]}</dd><dt>Fecha de seguimiento</dt><dd>{date(draft.metadata.targetDate)}</dd><dt>Próximo paso</dt><dd>{draft.metadata.nextStep||'—'}</dd><dt>Fundamento</dt><dd>{draft.note}</dd></dl>
    {pending?<><p className="lw-caption">Intento: <code>{pending.key}</code>. No crees otro registro mientras no se conozca su resultado.</p><div className="lw-toolbar"><button type="button" onClick={()=>void recover()} disabled={busy}>Consultar confirmación</button><button type="button" className="lw-secondary" onClick={()=>void save(pending)} disabled={busy}>Reenviar el mismo intento</button></div></>:<div className="lw-toolbar"><button type="button" className="lw-secondary" onClick={()=>setReview(null)} disabled={busy}>Volver a editar</button><button type="button" onClick={()=>void save()} disabled={busy}>Confirmar y guardar actuación</button></div>}
   </article>}
  </>}
  </>}
 </section>;
}
let root:any=null,dialog:HTMLDialogElement|null=null,focus:HTMLElement|null=null;
function close(){root?.unmount();root=null;dialog?.close();dialog?.remove();dialog=null;focus?.focus();}
export function openLegalWork(){if(dialog)return;focus=document.activeElement as HTMLElement;dialog=document.createElement('dialog');dialog.id='legalWorkDialog';dialog.className='lw-dialog';dialog.setAttribute('aria-label','Asuntos y actuaciones');document.body.append(dialog);root=createRoot(dialog);root.render(<App close={close}/>);dialog.showModal();}
window.addEventListener('pagehide',close);
