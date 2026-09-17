import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createFirmarWorkspaceClient} from '../../assets/firmar-workspace-client.js';
import {WORKSPACE_FILTERS,WORKSPACE_STATES} from '../../assets/firmar-workspace-model.js';
import {FirmarSourceReview} from './firmar-source-review';
type Prepared={id:string;version:number;title:string;pages:number;sha256:string};
type SigningArgs={document:Prepared;bytes:Uint8Array;onBack:()=>void;onAccessLost:()=>void};
type Props={sessionValid:boolean;sessionKey:string;renderSigning:(args:SigningArgs)=>React.ReactNode;client?:ReturnType<typeof createFirmarWorkspaceClient>;loadPdf?:any};
const initial={filter:'all',search:'',page:1,pageSize:10};
const when=(s:string)=>new Intl.DateTimeFormat('es-AR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Argentina/Mendoza'}).format(new Date(s));
/** An actual per-signer queue, not task shortcuts or fake pending counters. */
export function FirmarPersonalWorkspace(props:Props){
 const client=useMemo(()=>props.client??createFirmarWorkspaceClient(),[props.client]);
 const [query,setQuery]=useState(initial),[draft,setDraft]=useState(''),[reload,setReload]=useState(0),[result,setResult]=useState<any>(null),[error,setError]=useState<any>(null),[loading,setLoading]=useState(true),[selected,setSelected]=useState<any>(null),[source,setSource]=useState<any>(null),[sourceLoading,setSourceLoading]=useState(false),[sourceError,setSourceError]=useState<any>(null),[pages,setPages]=useState(0),[ready,setReady]=useState(false),[signing,setSigning]=useState(false),[lostKey,setLostKey]=useState<string|null>(null);
 const heading=useRef<HTMLHeadingElement>(null),sourceHeading=useRef<HTMLHeadingElement>(null),currentKey=useRef(props.sessionKey),sourceRequest=useRef<AbortController|null>(null),triggerId=useRef<string|null>(null);
 currentKey.current=props.sessionKey;const valid=props.sessionValid&&props.sessionKey.length>0&&lostKey!==props.sessionKey;
 const accessLost=(e?:any)=>{if(!e||[401,403].includes(e.status)){setLostKey(props.sessionKey);sourceRequest.current?.abort();setResult(null);setSelected(null);setSource(null);setSigning(false);}};
 useEffect(()=>{setQuery(initial);setDraft('');setSelected(null);setSource(null);setSourceError(null);setSigning(false);setPages(0);setReady(false);},[props.sessionKey]);
 useEffect(()=>{
  const key=props.sessionKey;let active=true;const c=new AbortController();setLoading(true);setError(null);setResult(null);
  if(!valid)return()=>{active=false;c.abort();};
  void client.list(query,{signal:c.signal}).then(data=>{if(active&&currentKey.current===key){setResult({key,data});setLoading(false);}}).catch(e=>{if(active&&currentKey.current===key&&e.name!=='AbortError'){accessLost(e);setError({key,error:e});setLoading(false);}});
  return()=>{active=false;c.abort();};
 },[client,query,reload,valid,props.sessionKey]);
 useEffect(()=>()=>{sourceRequest.current?.abort();},[props.sessionKey,props.sessionValid]);
 function back(){sourceRequest.current?.abort();setSelected(null);setSource(null);setSourceError(null);setSigning(false);setPages(0);setReady(false);setReload(v=>v+1);setTimeout(()=>heading.current?.focus(),0);}
 async function open(row:any){
  sourceRequest.current?.abort();const c=new AbortController(),key=props.sessionKey;sourceRequest.current=c;triggerId.current=row.requestId;setSelected({key,row});setSource(null);setSourceLoading(true);setSourceError(null);setSigning(false);setPages(0);setReady(false);
  try{const bytes=await client.source({requestId:row.requestId,version:row.version,sha256:row.sourceSha256},{signal:c.signal});if(!c.signal.aborted&&currentKey.current===key){setSource({key,requestId:row.requestId,bytes});setSourceLoading(false);setTimeout(()=>sourceHeading.current?.focus(),0);}}
  catch(e:any){if(!c.signal.aborted&&currentKey.current===key&&e.name!=='AbortError'){accessLost(e);setSourceLoading(false);setSourceError({key,error:e});}}
 }
 const data=valid&&result?.key===props.sessionKey?result.data:null,row=valid&&selected?.key===props.sessionKey?selected.row:null,bytes=valid&&source?.key===props.sessionKey&&source?.requestId===row?.requestId?source.bytes:null;
 const sourceFailure=sourceError?.key===props.sessionKey?sourceError.error:null,currentError=error?.key===props.sessionKey?error.error:null;
 if(!valid)return <section className="fd-workspace" role="alert"><h2>Tu sesión cambió</h2><p>La bandeja y el PDF anteriores ya no se muestran. Volvé a ingresar para recuperar tus documentos.</p></section>;
 if(row&&signing&&bytes)return <div className="fd-workspace">{props.renderSigning({document:{id:row.requestId,version:row.version,title:row.title,pages,sha256:row.sourceSha256},bytes,onBack:back,onAccessLost:()=>accessLost()})}</div>;
 if(row)return <section className="fd-workspace" aria-labelledby="fd-source-heading">
  <button type="button" className="fd-back" onClick={back}>← Volver a mis documentos</button>
  <header><p className="fd-eyebrow">DOCUMENTOS Y FIRMAS · ORIGINAL PREPARADO</p><h2 id="fd-source-heading" tabIndex={-1} ref={sourceHeading}>{row.title}</h2><p>Versión {row.version} · Preparado {when(row.createdAt)} · Referencia {row.requestId.slice(0,8)}</p></header>
  <div className="fd-workspace-note">Estás revisando el PDF que se enviaría a firma. Su recepción posterior no significa validación ni emisión oficial.</div>
  {sourceLoading&&<p role="status">Recuperando y comprobando los bytes del documento…</p>}
  {sourceFailure&&<div role="alert"><p>{sourceFailure.message}</p>{!['FIRMAR_VERSION_CONFLICT','FIRMAR_REQUEST_CANCELLED','FIRMAR_RATE_LIMITED'].includes(sourceFailure.code)&&<button type="button" onClick={()=>void open(row)}>Volver a consultar el original</button>}</div>}
  {bytes&&<FirmarSourceReview key={row.requestId+row.sourceSha256} bytes={bytes} sourceKey={row.requestId+':'+row.sourceSha256} sessionValid={valid} onReady={n=>{setPages(n);setReady(true);}} onUnavailable={()=>setReady(false)} loadPdf={props.loadPdf}/>}
  {bytes&&<footer className="fd-workspace-review-actions"><div><strong>{ready?'Original comprobado y disponible para revisión':'Vista previa aún no disponible'}</strong><p>No afirmamos que hayas leído todas las páginas: revisá el contenido antes de autorizar tu firma.</p></div>
   {data?.signingReady?<button type="button" className="fd-primary" disabled={!ready||!pages} onClick={()=>{if(ready&&pages)setSigning(true);}}>Continuar con este documento</button>:<p>La firma integrada está pendiente de habilitación institucional.</p>}
  </footer>}
 </section>;
 return <section className="fd-workspace" aria-labelledby="fd-workspace-title">
  <header className="fd-workspace-head"><div><p className="fd-eyebrow">PORTAFIRMAS PERSONAL · PILOTO</p><h2 id="fd-workspace-title" ref={heading} tabIndex={-1}>Mis documentos para firmar</h2><p>Revisá tus solicitudes y retomá el mismo documento. Abrir la bandeja no inicia ninguna firma.</p></div><button type="button" onClick={()=>setReload(v=>v+1)} disabled={loading}>Actualizar bandeja</button></header>
  <p className="fd-workspace-note">Sólo se muestran documentos asignados a tu cuenta y con facultad vigente. «Recibido» no significa «Firma válida».</p>
  <form className="fd-workspace-search" onSubmit={e=>{e.preventDefault();setQuery(v=>({...v,search:draft.trim(),page:1}));}}><label>Buscar documento<input value={draft} onChange={e=>setDraft(e.target.value)} maxLength={120} placeholder="Título o tipo de documento"/></label><button type="submit" disabled={loading}>Aplicar búsqueda</button>{(query.search||draft)&&<button type="button" onClick={()=>{setDraft('');setQuery(v=>({...v,search:'',page:1}));}}>Limpiar búsqueda</button>}</form>
  <nav className="fd-workspace-filters" aria-label="Estado de las solicitudes">{Object.entries(WORKSPACE_FILTERS).map(([filter,label])=><button type="button" key={filter} aria-pressed={query.filter===filter} onClick={()=>setQuery(v=>({...v,filter,page:1}))} disabled={loading}>{label}{data&&<span aria-label="solicitudes">{data.counts[filter]}</span>}</button>)}</nav>
  <p className="fd-applied">{query.search?'Búsqueda aplicada: «'+query.search+'»':'Sin búsqueda de texto'}{draft.trim()!==query.search?' · Tenés una búsqueda sin aplicar.':''}</p>
  {loading?<div className="fd-workspace-loading" role="status">Consultando tus solicitudes autorizadas…</div>:currentError?<div role="alert" className="fd-workspace-error"><h3>No pudimos consultar la bandeja</h3><p>{currentError.message}</p><p>No se muestra un conteo anterior como si estuviera actualizado.</p></div>:data&&<>
   <p className="fd-workspace-count" role="status">{data.pagination.total} {data.pagination.total===1?'solicitud':'solicitudes'} · Consulta {when(data.checkedAt)}</p>
   {data.documents.length===0?<div className="fd-workspace-empty"><h3>{data.counts.all===0&&!query.search?'No hay solicitudes disponibles para tu cuenta':'No hay resultados en este corte'}</h3><p>Las solicitudes aparecerán después de preparar el documento y asignar su firma por el circuito autorizado. No se muestran ejemplos como pendientes reales.</p></div>:<div className="fd-workspace-cards">{data.documents.map((d:any)=><article key={d.requestId} className="fd-workspace-card"><div className={'fd-state fd-state-'+d.state}>{WORKSPACE_STATES[d.state]}</div><h3>{d.title}</h3><p>Versión {d.version} · {Math.ceil(d.sourceBytes/1024)} KiB</p><p>Preparado {when(d.createdAt)}</p><small>Referencia {d.requestId.slice(0,8)}</small>{d.canReview?<button type="button" id={'fd-open-'+d.requestId} onClick={()=>void open(d)} aria-label={'Revisar '+d.title}>Abrir original preparado</button>:<p>Sin nueva autorización de firma.</p>}</article>)}</div>}
   <footer className="fd-workspace-pagination"><button type="button" onClick={()=>setQuery(v=>({...v,page:v.page-1}))} disabled={query.page<=1}>Anterior</button><span>Página {query.page}{data.pagination.pages?' de '+data.pagination.pages:''}</span><button type="button" onClick={()=>setQuery(v=>({...v,page:v.page+1}))} disabled={query.page>=data.pagination.pages}>Siguiente</button></footer>
  </>}
 </section>;
}
