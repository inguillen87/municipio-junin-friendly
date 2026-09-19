import React,{useEffect,useRef,useState} from 'react';
export function LegalDocumentaryWorkspace({onDenied}:{onDenied:()=>void}){
 const host=useRef<HTMLDivElement>(null),denied=useRef(onDenied);denied.current=onDenied;
 const [failed,setFailed]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{let active=true;let dispose:(()=>void)|undefined;setFailed(false);
  import('/assets/legal-documentary-panel.js').then(module=>{if(active&&host.current)dispose=module.mountDocumentaryReview(host.current,{onDenied:()=>denied.current()});}).catch(()=>{if(active)setFailed(true);});
  return()=>{active=false;dispose?.();};
 },[retry]);
 return <section className="lr-card"><div ref={host}/>{failed&&<div role="status"><p>No se pudo cargar la revisión documental. El Registro normativo sigue disponible.</p><button className="button" onClick={()=>setRetry(n=>n+1)}>Reintentar revisión</button></div>}</section>;
}
