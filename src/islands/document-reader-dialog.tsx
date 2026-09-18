import React,{useEffect,useRef} from 'react';
import {DocumentReaderPanel} from './document-reader-panel';
export function DocumentReaderDialog(props:any){
 const dialog=useRef<HTMLDialogElement>(null),previous=useRef<HTMLElement|null>(null),current=useRef(props);current.current=props;
 useEffect(()=>{
  previous.current=document.activeElement as HTMLElement;
  const oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog.current?.showModal();
  const leave=()=>current.current.onClose();
  const visible=()=>{if(!document.hidden)void current.current.onRecheck().catch(leave);};
  window.addEventListener('pagehide',leave);document.addEventListener('visibilitychange',visible);
  return()=>{window.removeEventListener('pagehide',leave);document.removeEventListener('visibilitychange',visible);dialog.current?.close();document.body.style.overflow=oldOverflow;previous.current?.focus();};
 },[]);
 return <dialog ref={dialog} className="reader-dialog" aria-label="Lector documental" onCancel={e=>{e.preventDefault();props.onClose();}}>
  <DocumentReaderPanel onClose={props.onClose} onRecheck={props.onRecheck}/>
 </dialog>;
}
