import React,{useEffect,useRef,useState} from 'react';
import {openReadingSource} from '../../assets/document-reader-source.js';
import {readRasterPage} from '../../assets/document-ocr-client.js';
import {applyOcrPage,extractiveDigest,digestText,READER_LIMITS} from '../../assets/document-reader-model.js';
export function DocumentReaderPanel({onClose,onRecheck}:any){
 const [source,setSource]=useState<any>(null),[pages,setPages]=useState<any[]>([]),[page,setPage]=useState(1),[busy,setBusy]=useState(''),[status,setStatus]=useState(''),[summary,setSummary]=useState<any>(null),[view,setView]=useState('source'),[rasterReady,setRasterReady]=useState(false);
 const live=useRef<any>(null),ocrStarting=useRef(false),generation=useRef(0),controller=useRef<AbortController|null>(null),ocrControl=useRef<AbortController|null>(null),canvas=useRef<HTMLCanvasElement>(null),raster=useRef<any>(null),fileInput=useRef<HTMLInputElement>(null);
 function reset(){ocrStarting.current=false;generation.current++;controller.current?.abort();ocrControl.current?.abort();void live.current?.destroy();live.current=null;raster.current=null;setRasterReady(false);setSource(null);setPages([]);setSummary(null);setBusy('');setStatus('');setPage(1);setView('source');if(canvas.current)canvas.current.width=canvas.current.height=0;if(fileInput.current)fileInput.current.value='';}
 useEffect(()=>()=>{generation.current++;controller.current?.abort();ocrControl.current?.abort();void live.current?.destroy();},[]);
 async function choose(file:File|undefined){
  reset();if(!file)return;const g=generation.current,c=new AbortController();controller.current=c;setBusy('load');setStatus('Comprobando el archivo en este navegador…');const timer=setTimeout(()=>c.abort(),30000);
  try{await onRecheck();const s=await openReadingSource(file,{signal:c.signal,onProgress:(m:string)=>{if(g===generation.current)setStatus(m);}});if(g!==generation.current){void s.destroy();return;}live.current=s;setSource(s);setPages(s.pages);setStatus('Original disponible. El archivo no se subió al servidor.');}
  catch(e:any){if(g===generation.current)setStatus(e.name==='AbortError'?'Lectura cancelada o tiempo agotado.':e.message);}
  finally{clearTimeout(timer);if(g===generation.current)setBusy('');}
 }
 useEffect(()=>{let active=true;raster.current=null;setRasterReady(false);if(!source)return;setBusy('render');
  void source.render(page,1500).then((image:any)=>{if(!active)return;const c=canvas.current;if(!c)return;c.width=image.width;c.height=image.height;c.getContext('2d')!.drawImage(image,0,0);raster.current=image;setRasterReady(true);setBusy('');}).catch(()=>{if(active){setStatus('No se pudo representar esta página. No se inició el OCR.');setBusy('');}});
  return()=>{active=false;if(canvas.current)canvas.current.width=canvas.current.height=0;};
 },[source,page]);
 async function recognize(){
  if(!source||busy||ocrStarting.current||!raster.current||pages[page-1]?.method==='native')return;ocrStarting.current=true;const g=generation.current,n=page,c=new AbortController();ocrControl.current=c;setBusy('ocr');setStatus('Cargando OCR en español. La primera lectura descarga los componentes, no sube tu documento.');
  try{const result=await readRasterPage(raster.current,{sha256:source.sha256,page:n,signal:c.signal,onProgress:(v:number)=>{if(g===generation.current)setStatus('OCR de la página '+n+' · '+v+' %');}});if(g!==generation.current)return;setPages(p=>applyOcrPage(p,n,result,source.sha256,live.current?.sha256));setSummary(null);setStatus('OCR terminado. Revisá especialmente cifras, signos, nombres y negaciones antes de utilizarlo.');}
  catch(e:any){if(g===generation.current)setStatus(e.name==='AbortError'?'OCR cancelado. El original se conserva.':e.message);}
  finally{if(g===generation.current){ocrStarting.current=false;setBusy('');}}
 }
 function summarize(){try{setSummary(extractiveDigest(pages,{sha256:source.sha256}));setView('summary');setStatus('Extractos preparados localmente. Abrí su página para leer el contexto.');}catch(e:any){setStatus(e.message);}}
 function download(){const text=digestText(summary,source.name),url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='lectura-documental.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 const selected=pages[page-1];
 return <section className="mc-reader" aria-labelledby="reader-title">
  <header className="reader-head"><div><p className="reader-eyebrow">MUNICONTROL · LECTURA DOCUMENTAL</p><h2 id="reader-title">De un archivo a una lectura con fuentes</h2><p>PDF, leyes, informes y documentos escaneados. El original permanece en tu dispositivo.</p></div><button type="button" onClick={()=>{reset();onClose();}} aria-label="Cerrar lector documental">Cerrar ×</button></header>
  <details className="reader-options" key={source?.sha256||"empty"} open={!source}><summary>{source?"Cambiar archivo y consultar privacidad":"Archivo y privacidad"}</summary><div className="reader-privacy"><strong>OCR local · Sin costo de API por página</strong><span>No se sube el archivo, no se guarda en Neon y no se envía a un modelo externo. La lectura se descarta al cerrar.</span></div>
  <div className="reader-upload"><label>Seleccionar documento<input ref={fileInput} type="file" accept=".pdf,.png,.jpg,.jpeg" disabled={!!busy} onChange={e=>void choose(e.target.files?.[0])}/></label><p>Hasta 8 MiB y 30 páginas. Para OCR: una página a la vez, texto impreso en español.</p></div></details>
  <p className="reader-status" role="status" aria-live="polite">{status}</p>
  {busy==='ocr'&&<button type="button" onClick={()=>ocrControl.current?.abort()}>Cancelar OCR</button>}
  {source&&<><div className="reader-file"><strong>{source.name}</strong><button type="button" onClick={reset}>Quitar documento</button><span>{pages.length} {pages.length===1?'página':'páginas'} · {pages.filter(p=>p.method==='ocr'&&!p.reviewed).length} OCR por revisar</span><details><summary>Identificación del original</summary><code>SHA-256 {source.sha256}</code></details></div>
   <nav className="reader-tabs" aria-label="Tarea documental"><button type="button" aria-pressed={view==='source'} onClick={()=>setView('source')}>Original y texto</button><button type="button" disabled={!!busy} onClick={summarize} aria-pressed={view==='summary'}>Preparar extractos con páginas</button></nav>
   <div hidden={view!=='source'} className="reader-source"><div className="reader-visual"><div className="reader-paging"><button type="button" disabled={page===1||!!busy} onClick={()=>setPage(v=>v-1)}>Anterior</button><label>Página<select value={page} disabled={!!busy} onChange={e=>setPage(Number(e.target.value))}>{pages.map(p=><option key={p.number} value={p.number}>{p.number}</option>)}</select></label><span>de {pages.length}</span><button type="button" disabled={page===pages.length||!!busy} onClick={()=>setPage(v=>v+1)}>Siguiente</button></div><div className="reader-canvas" tabIndex={0} aria-label="Original de la página"><canvas ref={canvas} role="img" aria-label={'Página '+page+' del documento seleccionado'}/></div></div>
    <div className="reader-transcription"><span className="reader-method">{selected?.method==='native'?'Texto nativo del PDF':selected?.method==='ocr'?'Texto detectado por OCR · requiere revisión':'Sin texto extraíble'}</span>
     {selected?.method==='native'?<pre>{selected.text}</pre>:<><p>El OCR puede confundir números, signos y palabras. No calcula importes ni determina la vigencia de una norma.</p><button className="reader-primary" type="button" disabled={!!busy||!rasterReady} onClick={()=>void recognize()}>{selected?.method==='ocr'?'Repetir OCR de esta página':'Leer esta página con OCR'}</button>
      {selected?.method==='ocr'&&<><p className="reader-small">Indicador del motor: {Math.round(selected.confidence)} / 100. No equivale a exactitud garantizada.</p><label>Texto a revisar<textarea value={selected.text} maxLength={READER_LIMITS.pageChars} rows={12} onChange={e=>{const value=e.target.value;setPages(old=>old.map(p=>p.number===page?{...p,text:value,reviewed:false}:p));setSummary(null);}}/></label><label className="reader-check"><input type="checkbox" checked={selected.reviewed} onChange={e=>{const checked=e.target.checked;setPages(old=>old.map(p=>p.number===page?{...p,reviewed:checked}:p));setSummary(null);}}/>Revisé este texto contra la imagen original.</label></>}
     </>}
    </div>
   </div>
   {view==='summary'&&summary&&<section className="reader-summary"><div className="reader-summary-heading"><div><h3>Extractos seleccionados automáticamente</h3><p>No es un resumen generativo ni un dictamen. Conserva fragmentos literales con acceso a su página.</p></div><button type="button" disabled={!summary.quotes.length} onClick={download}>Descargar lectura · TXT</button></div>
    <p className="reader-small">Páginas representadas: {summary.representedPages.join(', ')||'ninguna'} de {pages.length}. Páginas sin texto utilizable o con OCR pendiente: {summary.excludedPages.join(', ')||'ninguna'}. Otros pasajes pueden ser relevantes.</p>
    {!summary.quotes.length&&<p>No hay fragmentos utilizables todavía. Revisá la capa de texto o el OCR de las páginas necesarias.</p>}
    {summary.quotes.map((q:any,i:number)=><article key={i}><button type="button" className="reader-citation" onClick={()=>{setView('source');setPage(q.page);}}>Página {q.page} · Ver en el original</button><span className="reader-small">{q.method==='ocr'?'OCR revisado':'Texto nativo'}{q.partialParagraph?' · Fragmento de un párrafo más largo':''}</span><blockquote>{q.text}</blockquote></article>)}
   </section>}
  </>}
  <footer className="reader-footer">La revisión local no guarda una certificación ni modifica el registro jurídico, las liquidaciones o la firma del original.</footer>
 </section>;
}
