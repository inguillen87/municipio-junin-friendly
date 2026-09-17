import React,{useEffect,useRef,useState} from 'react';
import {loadFirmarSourcePdf} from '../../assets/firmar-source-renderer.js';
type Props={bytes:Uint8Array;sourceKey:string;sessionValid:boolean;onReady:(pages:number)=>void;onUnavailable:()=>void;loadPdf?:typeof loadFirmarSourcePdf};
/** Receives bytes whose SHA-256 was checked by the same-origin client, not an arbitrary URL. */
export function FirmarSourceReview(props:Props){
 const [resource,setResource]=useState<any>(null),[page,setPage]=useState(1),[zoom,setZoom]=useState(1),[fitWidth,setFitWidth]=useState(700),[text,setText]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(true),[total,setTotal]=useState(0);
 const canvas=useRef<HTMLCanvasElement>(null),box=useRef<HTMLDivElement>(null),callbacks=useRef(props),renderSerial=useRef(0);callbacks.current=props;
 useEffect(()=>{const el=box.current;if(!el)return;const observer=new ResizeObserver(entries=>{const width=entries[0]?.contentRect.width;if(width>0)setFitWidth(Math.min(900,Math.max(200,width-16)));});observer.observe(el);return()=>observer.disconnect();},[]);
 useEffect(()=>{
  let active=true,pdf:any;const c=new AbortController();setResource(null);setTotal(0);setPage(1);setZoom(1);setText('');setError('');setBusy(true);callbacks.current.onUnavailable();
  if(!props.sessionValid)return()=>{active=false;c.abort();};
  const timeout=setTimeout(()=>c.abort(),20000);
  void(props.loadPdf??loadFirmarSourcePdf)(props.bytes,{signal:c.signal}).then(doc=>{pdf=doc;if(active){clearTimeout(timeout);setResource(doc);setTotal(doc.pages);}else void doc.destroy();}).catch(()=>{if(active){setError('No pudimos abrir este PDF de forma segura. Volvé a la bandeja; no se envió a firma.');setBusy(false);}});
  return()=>{active=false;clearTimeout(timeout);c.abort();void pdf?.destroy();renderSerial.current++;};
 },[props.sourceKey,props.bytes,props.sessionValid,props.loadPdf]);
 useEffect(()=>{
  if(!resource||!props.sessionValid)return;let active=true,render:any;const serial=++renderSerial.current,c=document.createElement('canvas');setBusy(true);setText('');setError('');callbacks.current.onUnavailable();
  void(async()=>{
   const p=await resource.page(page);if(!active)return;const natural=p.getViewport({scale:1}),scale=Math.max(.1,Math.min(2.5,(fitWidth/natural.width)*zoom)),viewport=p.getViewport({scale});
   if(!Number.isFinite(viewport.width)||!Number.isFinite(viewport.height)||viewport.width<1||viewport.height<1||viewport.width*viewport.height>12000000)throw Error('Límite de render');
   const ratio=Math.min(2,window.devicePixelRatio||1);if(viewport.width*viewport.height*ratio*ratio>12000000)throw Error('Límite de render');
   c.width=Math.ceil(viewport.width*ratio);c.height=Math.ceil(viewport.height*ratio);render=p.render({canvas:c,canvasContext:c.getContext('2d'),viewport,transform:ratio===1?undefined:[ratio,0,0,ratio,0,0],annotationMode:0});await render.promise;
   let extracted='';try{const content=await p.getTextContent({disableNormalization:false});let length=0;for(const item of content.items){if(typeof item.str!=='string')continue;length+=item.str.length;if(length>50000){extracted+='\n[Texto limitado para esta vista]';break;}extracted+=item.str+(item.hasEOL?'\n':' ');}}catch{/* Canvas remains authoritative; text can be unavailable. */}
   if(!active||serial!==renderSerial.current)return;const target=canvas.current;if(!target)return;target.width=c.width;target.height=c.height;target.style.width=viewport.width+'px';target.style.height=viewport.height+'px';target.getContext('2d')!.drawImage(c,0,0);clearTimeout(timeout);setText(extracted);setBusy(false);callbacks.current.onReady(resource.pages);
  })().catch(()=>{if(active&&serial===renderSerial.current){clearTimeout(timeout);const target=canvas.current;if(target)target.width=target.height=0;setError('No se pudo mostrar esta página. No continúes a la firma hasta poder revisar el documento.');setBusy(false);callbacks.current.onUnavailable();}});
  const timeout=setTimeout(()=>{if(active){active=false;render?.cancel();if(canvas.current)canvas.current.width=canvas.current.height=0;setBusy(false);setError('La página demoró demasiado. Volvé a abrir el documento.');callbacks.current.onUnavailable();}},20000);
  return()=>{active=false;clearTimeout(timeout);render?.cancel();c.width=c.height=0;};
 },[resource,page,fitWidth,zoom,props.sessionValid]);
 if(!props.sessionValid)return <p role="alert">No se muestra el documento de la sesión anterior.</p>;
 return <section className="fd-source-review" aria-label="Original preparado para firma" ref={box}>
  <div className="fd-source-toolbar" aria-label="Navegación del PDF">
   <button type="button" onClick={()=>setPage(v=>v-1)} disabled={page<=1||busy||!resource} aria-label="Página anterior">Anterior</button>
   <span>Página {page} de {total||'…'}</span>
   <button type="button" onClick={()=>setPage(v=>v+1)} disabled={!resource||page>=total||busy} aria-label="Página siguiente">Siguiente</button>
   <label>Vista<select value={zoom} onChange={e=>setZoom(Number(e.target.value))} disabled={!resource||busy}><option value="1">Ajustar al ancho</option><option value="1.25">Ampliar 125 %</option><option value="1.5">Ampliar 150 %</option></select></label>
  </div>
  <p className="fd-source-kind">PDF preparado · No es el original firmado</p>
  <div className="fd-source-viewport" tabIndex={0} aria-label="Documento: desplazamiento horizontal sólo dentro de esta vista" aria-busy={busy}>
   {busy&&<p role="status">Preparando la página…</p>}{error&&<p role="alert">{error}</p>}
   <canvas ref={canvas} role="img" aria-label={'Página '+page+' del PDF preparado'} hidden={busy||!!error}/>
  </div>
  {!busy&&!error&&<details className="fd-source-text"><summary>Leer texto disponible de esta página</summary><p>Ayuda de lectura. No sustituye la disposición y contenido visual del PDF.</p><pre>{text.trim()||'Esta página no tiene texto extraíble. Se muestra su imagen; no se inventó una transcripción.'}</pre></details>}
 </section>;
}
