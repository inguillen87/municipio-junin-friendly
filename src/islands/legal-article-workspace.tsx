import React,{useEffect,useMemo,useRef,useState} from 'react';
import {articleQuery,articleReference,filterArticles,selectedArticleText,sameArticleVersion} from '../../assets/legal-article-workspace.js';
const PAGE_SIZE=10;
function MatchText({text,ranges}:any){let at=0;const parts:any[]=[];for(const [start,end] of ranges){parts.push(text.slice(at,start),<mark key={start}>{text.slice(start,end)}</mark>);at=end;}parts.push(text.slice(at));return <>{parts}</>;}
export function LegalArticleWorkspace({record,loadRecord,onDenied,disabled}:any){
 const [draft,setDraft]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(()=>{const index=Number(/^#articulo-([1-9][0-9]{0,2})$/.exec(location.hash)?.[1])-1;return Number.isInteger(index)&&index>=0&&record.metadata.articles[index]?Math.floor(index/PAGE_SIZE)+1:1;}),[selected,setSelected]=useState<number[]>([]),[message,setMessage]=useState(''),[exporting,setExporting]=useState(false);
 const alive=useRef(true),lock=useRef(false),controller=useRef<AbortController|null>(null),heading=useRef<HTMLHeadingElement>(null);
 const rows=useMemo(()=>filterArticles(record,query),[record,query]),pages=Math.ceil(rows.length/PAGE_SIZE),visible=rows.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);
 const occurrences=rows.reduce((n:any,r:any)=>n+r.matches,0),key=record.id+':'+record.version+':'+record.document.sha256;
 useEffect(()=>{alive.current=true;const hidden=()=>{if(document.hidden){controller.current?.abort();}};document.addEventListener('visibilitychange',hidden);
  return()=>{alive.current=false;controller.current?.abort();document.removeEventListener('visibilitychange',hidden);};},[]);
 useEffect(()=>{const match=/^#articulo-([1-9][0-9]{0,2})$/.exec(location.hash),index=match?Number(match[1])-1:-1;
  if(index>=0&&record.metadata.articles[index]){setQuery('');setDraft('');setPage(Math.floor(index/PAGE_SIZE)+1);const t=setTimeout(()=>{if(!alive.current)return;const el=document.getElementById('articulo-'+(index+1));el?.scrollIntoView({block:'start'});el?.querySelector<HTMLElement>('h4')?.focus();},0);return()=>clearTimeout(t);}},[key]);
 function toggle(index:number){if(exporting||disabled)return;setSelected(old=>{if(old.includes(index))return old.filter(n=>n!==index);if(old.length>=30){setMessage('La selección admite hasta treinta artículos. Quitá uno antes de agregar otro.');return old;}return [...old,index];});}
 function changePage(n:number){setPage(n);setTimeout(()=>heading.current?.focus(),0);}
 async function exportSelection(){
  if(lock.current||disabled||!selected.length)return;lock.current=true;setExporting(true);setMessage('Revalidando el acceso y la versión antes de preparar la selección…');const c=new AbortController();controller.current=c;const timer=setTimeout(()=>c.abort(),25000);
  try{const fresh=await loadRecord(record.id,record.version,c.signal);if(!alive.current)return;if(c.signal.aborted)throw new DOMException('Cancelado','AbortError');
   if(!sameArticleVersion(record,fresh))throw Error('La ficha o su última versión cambió. Actualizá la ficha antes de descargar esta selección.');
   const text=selectedArticleText(fresh,selected),url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='seleccion-normativa-v'+record.version+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setMessage('Selección descargada con textos, páginas, versión y huella del PDF. No es un documento certificado.');
  }catch(e:any){if(!alive.current)return;if([401,403].includes(e.status))onDenied();else setMessage(e.name==='AbortError'?'Descarga cancelada; la selección se conserva mientras esta ficha siga abierta.':e.message||'No se pudo preparar la descarga.');}
  finally{clearTimeout(timer);lock.current=false;if(alive.current)setExporting(false);}
 }
 return <section className="lr-articles law-workspace" aria-labelledby="lawArticlesTitle">
  <header className="law-heading"><div><p className="law-eyebrow">CONSULTA Y PREPARACIÓN DE REFERENCIAS</p><h3 id="lawArticlesTitle" ref={heading} tabIndex={-1}>Artículos incorporados</h3><p>Encontrá un pasaje, verificá su página y prepará una selección para tu trabajo. Las transcripciones no reemplazan al PDF original.</p></div><span className="law-version">Versión {record.version}{record.version<record.currentVersion?' · Histórica':' · Última consultada'}</span></header>
  {record.version<record.currentVersion&&<p className="law-historical">Estás consultando una versión documental anterior. La última informada es la {record.currentVersion}. Esto no determina la vigencia jurídica.</p>}
  {record.metadata.articles.length>0?<>
   <form className="law-search" onSubmit={e=>{e.preventDefault();try{setQuery(articleQuery(draft));setPage(1);setMessage('');}catch(e:any){setMessage(e.message);}}}>
    <label>Buscar dentro de esta norma<input name="articleQuery" value={draft} maxLength={160} disabled={exporting||disabled} placeholder="Palabra, frase, artículo o cifra" onChange={e=>setDraft(e.target.value)}/></label>
    <button className="button" disabled={exporting||disabled} type="submit">Buscar en artículos</button><button className="button" type="button" disabled={exporting||disabled} onClick={()=>{setQuery('');setDraft('');setPage(1);setMessage('');}}>Limpiar búsqueda</button>
   </form>
   <p className="law-result-count" role="status">{rows.length} de {record.metadata.articles.length} artículos{query?' · '+occurrences+' coincidencias de «'+query+'»':' · Sin filtro aplicado'}.{draft.trim()!==query?' Tenés una búsqueda sin aplicar.':''}</p>
   <div className="law-selection"><div><strong>{selected.length} artículos seleccionados</strong><span>La selección pertenece a esta versión, aunque cambies de página o filtro.</span></div><div className="law-actions"><button className="button" type="button" disabled={!selected.length||exporting||disabled} onClick={()=>{setSelected([]);setMessage('Selección descartada. La norma no se modificó.');}}>Limpiar selección</button><button className="button primary" type="button" disabled={!selected.length||exporting||disabled} onClick={()=>void exportSelection()}>Descargar selección · TXT</button></div>
    {selected.length>0&&<details className="law-selected"><summary>Revisar artículos seleccionados</summary><ol>{[...selected].sort((a,b)=>a-b).map(index=><li key={index}>{record.metadata.articles[index].label} · página {record.metadata.articles[index].page}</li>)}</ol></details>}
   </div>
   <p className="law-message" role="status" aria-live="polite">{message}</p>
   {!rows.length&&<div className="lr-empty"><h4>No hay coincidencias en los artículos de esta versión</h4><p>Se busca el texto literal, sin distinguir mayúsculas ni acentos en vocales. No se busca dentro del PDF ni en otras normas.</p></div>}
   {visible.map(({article:a,index,label,body}:any)=><article key={index} id={'articulo-'+(index+1)} className={selected.includes(index)?'law-article selected':'law-article'}>
    <div className="law-article-heading"><div><h4 tabIndex={-1}><MatchText text={a.label} ranges={label.ranges}/></h4><span className="lr-tag">PDF · página {a.page}</span></div><label className="law-choose"><input type="checkbox" checked={selected.includes(index)} disabled={exporting||disabled||selected.length>=30&&!selected.includes(index)} onChange={()=>toggle(index)} aria-label={'Seleccionar '+a.label}/>Incluir en la selección</label></div>
    <p className="law-article-text"><MatchText text={a.text} ranges={body.ranges}/></p>{(label.truncated||body.truncated)&&<small>Se resaltan hasta 120 coincidencias por campo; el conteo considera todas.</small>}
    <details><summary>Referencia para citar</summary><p>{articleReference(record,index).text}</p><a href={articleReference(record,index).path}>Abrir referencia a este artículo</a><p className="law-source-note">Enlace interno a esta versión; no concede acceso ni certifica la transcripción.</p></details>
   </article>)}
   {pages>1&&<nav className="law-pagination" aria-label="Páginas de artículos"><button className="button" disabled={page<=1||exporting||disabled} type="button" onClick={()=>changePage(page-1)}>Artículos anteriores</button><span>Página {page} de {pages}</span><button className="button" disabled={page>=pages||exporting||disabled} type="button" onClick={()=>changePage(page+1)}>Artículos siguientes</button></nav>}
  </>:<div className="lr-empty"><p>No se transcribieron artículos en esta versión. El documento original está disponible para su consulta.</p></div>}
 </section>;
}
