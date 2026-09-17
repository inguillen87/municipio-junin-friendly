import React,{useEffect,useRef,useState} from 'react';
import {readLegalPdfText} from '../../assets/legal-pdf-text-client.js';
import {preparePdfArticle} from '../../assets/legal-pdf-text-model.js';
export function LegalPdfAssistant({document,articles,onAdd,disabled}:any){
 const[result,setResult]=useState<any>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[page,setPage]=useState(1),[label,setLabel]=useState(''),[text,setText]=useState(''),[reviewed,setReviewed]=useState(false);
 const controller=useRef<AbortController|null>(null),generation=useRef(0);
 const stop=()=>{generation.current++;controller.current?.abort();controller.current=null;};
 useEffect(()=>{stop();setResult(null);setText('');setReviewed(false);setMessage('');setBusy(false);return stop;},[document?.sha256]);
 async function extract(){
  if(!document||disabled||busy)return;stop();const token=generation.current,c=new AbortController();controller.current=c;setBusy(true);setResult(null);setReviewed(false);setMessage('Leyendo el texto en este navegador…');
  try{const value:any=await readLegalPdfText(document,{signal:c.signal});if(token!==generation.current)return;setResult(value);setPage(1);setText(value.pages[0].text.length<=12000?value.pages[0].text:'');setMessage(value.pages.some((p:any)=>p.text.trim())?'Texto disponible. Seleccioná la página y revisá el fragmento antes de agregarlo.':'Este PDF no tiene una capa de texto extraíble. Conservá el original y transcribí manualmente; no se aplicó OCR.');}
  catch(e:any){if(token===generation.current)setMessage(e.message);}
  finally{if(token===generation.current)setBusy(false);}
 }
 function add(){try{const value=preparePdfArticle(result,document,{page,label,text,reviewed},articles);onAdd(value,document.sha256);setReviewed(false);setLabel('');setMessage('Fragmento agregado al borrador. Todavía no se guardó la norma.');}catch(e:any){setMessage(e.message);}}
 return <section className="lr-pdf-aid" aria-labelledby="lrPdfAidTitle">
  <div className="lr-section-heading"><div><span className="lr-eyebrow">ASISTENCIA DOCUMENTAL LOCAL</span><h3 id="lrPdfAidTitle">Del PDF al borrador, sin volver a escribir todo</h3><p>Leé el texto disponible por página. El original no se modifica y no se envía a servicios de inteligencia artificial.</p></div><button className="button" type="button" disabled={!document||disabled||busy} onClick={()=>void extract()}>Leer texto del PDF</button></div>
  {!document&&<p>Seleccioná un PDF en Identificación y fuente para utilizar esta ayuda. En una corrección sin PDF nuevo se conserva la transcripción existente.</p>}
  {busy&&<button className="button" type="button" onClick={()=>{stop();setBusy(false);setMessage('Lectura cancelada. El borrador y el original se conservan.');}}>Cancelar lectura</button>}
  <p className="lr-subtle" role="status" aria-live="polite">{message}</p>
  {result&&<div className="lr-pdf-work"><div><label>Página de la fuente<select aria-label="Página de la fuente" name="pdfSourcePage" value={page} disabled={disabled} onChange={e=>{const number=Number(e.target.value);setPage(number);setText(result.pages[number-1].text.length<=12000?result.pages[number-1].text:'');setReviewed(false);}}>{result.pages.map((p:any)=><option key={p.number} value={p.number}>Página {p.number}{p.text.trim()?'':' · sin texto extraíble'}</option>)}</select></label><p className="lr-subtle">{result.pageCount} páginas · Huella verificada del archivo seleccionado. El orden de lectura y los espacios pueden requerir corrección.</p><pre className="lr-pdf-source" tabIndex={0} aria-label="Texto extraído de la página">{result.pages[page-1].text||'Sin texto extraíble en esta página.'}</pre></div>
   <div><label>Identificador para este fragmento<input name="pdfArticleLabel" value={label} maxLength={60} disabled={disabled} placeholder="Ej.: Artículo 3, inciso b" onChange={e=>{setLabel(e.target.value);setReviewed(false);}}/></label><label>Fragmento a incorporar<textarea name="pdfArticleText" value={text} rows={9} maxLength={12000} disabled={disabled} onChange={e=>{setText(e.target.value);setReviewed(false);}}/></label><p className="lr-subtle">{text.length.toLocaleString('es-AR')} / 12.000 caracteres. Cuando la página es más extensa, copiá sólo el fragmento que corresponde al artículo.</p><label className="lr-pdf-confirm"><input type="checkbox" checked={reviewed} disabled={disabled} onChange={e=>setReviewed(e.target.checked)}/>Contrasté este fragmento con el PDF original.</label><button className="button primary" type="button" disabled={disabled||!reviewed||!text.trim()||!label.trim()||!result.pages[page-1].text.trim()} onClick={add}>Agregar texto revisado al borrador</button></div>
  </div>}
  <p className="lr-subtle">Esta ayuda no valida firmas, vigencia ni interpretación jurídica. El guardado sigue requiriendo Revisar y Confirmar.</p>
 </section>;
}
