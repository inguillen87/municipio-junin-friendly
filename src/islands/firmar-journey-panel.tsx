import React, {useEffect, useRef, useState} from 'react';
import {createFirmarJourney} from '../../assets/firmar-journey.js';
export type PreparedSigningDocument={id:string;version:number;title:string;pages:number;sha256:string};
type JourneyStatus={state:string;label:string;requestId:string|null;attemptId:string|null;sameTabUrl?:string|null;documentSha256?:string|null;canRecover?:boolean;canRetry?:boolean;authorizationOpen?:boolean};
type Attempt={requestId:string;attemptId:string;expiresAt:string;authorizationUrl?:string|null};
type Props={
 document:PreparedSigningDocument;
 /** The host must persist, authorize and bind the request before this becomes true. */
 integrationReady:boolean;
 begin:(args:{requestId:string;expectedVersion:number;signal:AbortSignal})=>Promise<unknown>;
 readStatus:(args:{requestId:string;attemptId:string;signal:AbortSignal})=>Promise<unknown>;
 recoverAttempt?:(args:{requestId:string;signal:AbortSignal})=>Promise<unknown>;
 resumeAttempt?:Attempt;
 preview:React.ReactNode;
 onOpenVerifiedDocument?:()=>void;
 sessionValid?:boolean;
};
const initial:JourneyStatus={state:'review',label:'Revisá el PDF que vas a firmar',requestId:null,attemptId:null};
export function FirmarJourneyPanel(props:Props){
 const documentKey=[props.document.id,props.document.version,props.document.sha256,props.integrationReady,props.sessionValid!==false].join(':');
 const [rendered,setRendered]=useState<{key:string;value:JourneyStatus}>({key:documentKey,value:initial});
 const [reviewedKey,setReviewedKey]=useState<string|null>(null);
 const state=rendered.key===documentKey?rendered.value:initial,reviewed=reviewedKey===documentKey;
 const ref=useRef<ReturnType<typeof createFirmarJourney>|null>(null),latest=useRef(props);
 latest.current=props;
 useEffect(()=>{
  let mounted=true;setRendered({key:documentKey,value:initial});setReviewedKey(null);
  if(!props.integrationReady||props.sessionValid===false)return;
  const journey=createFirmarJourney({origin:location.origin,begin:(args:any)=>latest.current.begin(args),readStatus:(args:any)=>latest.current.readStatus(args),
   ...(props.recoverAttempt?{recoverAttempt:(args:any)=>latest.current.recoverAttempt!(args)}:{}),
   onChange:(value:JourneyStatus)=>{if(mounted)setRendered({key:documentKey,value});},isVisible:()=>document.visibilityState!=='hidden',
   openWindow:()=>window.open('about:blank','_blank','popup,width=580,height=790')});
  ref.current=journey;
  const message=(e:MessageEvent)=>journey.notice(e),focus=()=>journey.refresh(),visible=()=>{if(document.visibilityState==='visible')journey.refresh();};
  window.addEventListener('message',message);window.addEventListener('focus',focus);document.addEventListener('visibilitychange',visible);
  let channel:BroadcastChannel|null=null;
  try{if(typeof BroadcastChannel==='function')channel=new BroadcastChannel('municontrol-firmar-return');}catch{/* Explicit refresh remains available. */}
  if(channel)channel.onmessage=e=>journey.notice({origin:location.origin,data:e.data});
  if(latest.current.resumeAttempt){
   try{if(latest.current.resumeAttempt.requestId!==props.document.id)throw Error('different request');journey.resume(latest.current.resumeAttempt);}
   catch{setRendered({key:documentKey,value:{...initial,state:'failed',canRetry:false,label:'No se pudo recuperar este intento. Volvé a la bandeja para consultar su estado.'}});}
  }
  return()=>{mounted=false;journey.dispose();ref.current=null;channel?.close();window.removeEventListener('message',message);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',visible);};
 },[documentKey,props.integrationReady,props.sessionValid]);
 async function start(){if(!reviewed||!props.integrationReady||props.sessionValid===false||ref.current?.busy)return;try{await ref.current?.start({requestId:props.document.id,expectedVersion:props.document.version});}catch{setRendered({key:documentKey,value:{...initial,state:'failed',canRetry:false,label:'No se pudo confirmar el inicio. Consultá tu solicitud antes de repetir.'}});}}
 const activeStep=['review','preparing','failed'].includes(state.state)?0:['awaiting_authorization','awaiting_receipt','outcome_unknown','paused','checking'].includes(state.state)?1:2;
 const verified=state.state==='verified',lost=state.state==='session_lost'||props.sessionValid===false;
 const canStart=['review','failed'].includes(state.state)&&state.canRetry!==false&&props.integrationReady&&!ref.current?.busy;
 return <section className="mc-firmar" aria-labelledby="mc-firmar-title">
  <header className="mc-firmar-head"><div><p className="mc-firmar-eyebrow">DOCUMENTOS Y FIRMAS</p><h2 id="mc-firmar-title" tabIndex={-1}>Tu firma. Sin mover archivos.</h2>
   <p>Revisá en MuniControl, autorizá en FirmAR y continuá con el resultado en esta misma solicitud.</p></div>
   <span className="mc-firmar-badge">Firma remota · Sólo PDF</span></header>
  <ol className="mc-firmar-steps" aria-label="Pasos de la firma">{['Revisar','Autorizar firma','Recuperar resultado'].map((label,i)=><li key={label} aria-current={i===activeStep?'step':undefined}><span aria-hidden="true">{i+1}</span>{label}</li>)}</ol>
  {lost?<div role="alert" className="mc-firmar-notice">Tu sesión cambió. Volvé a ingresar para consultar la solicitud guardada. No se muestra el documento anterior.</div>:<>
   <div className="mc-firmar-grid"><div className="mc-firmar-preview" aria-label="Vista previa del PDF aprobado">{props.preview}</div>
    <aside className="mc-firmar-task" aria-label="Acción sobre el documento" aria-busy={['preparing','checking'].includes(state.state)}>
     <p className="mc-firmar-eyebrow">DOCUMENTO SELECCIONADO</p><h3>{props.document.title}</h3>
     <p className="mc-firmar-context">Versión {props.document.version} · {props.document.pages} {props.document.pages===1?'página':'páginas'}</p>
     <div className="mc-firmar-status" role="status" aria-live="polite"><strong>{state.label}</strong></div>
     {!props.integrationReady&&<div className="mc-firmar-notice"><strong>Conexión institucional pendiente</strong><p>La firma integrada se habilitará después del alta de la aplicación y sus pruebas. Tener el certificado personal no activa esta conexión automáticamente.</p></div>}
     {canStart&&<><label className="mc-firmar-confirm"><input type="checkbox" checked={reviewed} onChange={e=>setReviewedKey(e.target.checked?documentKey:null)}/>Revisé esta versión y quiero solicitar mi firma personal.</label>
      <button className="mc-firmar-primary" disabled={!reviewed} onClick={()=>void start()}>Firmar PDF</button><p className="mc-firmar-hint">Se abrirá la ventana oficial de FirmAR. El PDF viaja automáticamente y MuniControl permanece abierto.</p></>}
     {state.state==='preparing'&&<p className="mc-firmar-hint">Guardamos el contexto antes de abrir la autorización. No repitas el envío.</p>}
     {props.integrationReady&&state.sameTabUrl&&<div className="mc-firmar-notice"><strong>Continuá el mismo intento</strong><p>La ventana se cerró o fue bloqueada. No hace falta volver a enviar el PDF.</p><button onClick={()=>ref.current?.focusAuthorization()}>Reabrir autorización oficial</button><p><a className="mc-firmar-primary" href={state.sameTabUrl} rel="noreferrer">Continuar y volver automáticamente</a></p><small>Esta alternativa usa la pestaña actual y luego vuelve a tu solicitud.</small></div>}
     {props.integrationReady&&state.state==='awaiting_authorization'&&!state.sameTabUrl&&state.authorizationOpen&&<button onClick={()=>ref.current?.focusAuthorization()}>Volver a la ventana de firma</button>}
     {props.integrationReady&&state.canRecover&&<><button className="mc-firmar-primary" onClick={()=>void ref.current?.recover()}>Recuperar el intento guardado</button><p className="mc-firmar-hint">Consultamos la solicitud original. No se vuelve a enviar el documento al firmador.</p></>}
     {props.integrationReady&&state.attemptId&&['awaiting_authorization','awaiting_receipt','received_unverified','validation_pending','paused','outcome_unknown','checking'].includes(state.state)&&<><button onClick={()=>ref.current?.refresh()}>Actualizar estado de esta solicitud</button><p className="mc-firmar-hint">No descargues ni vuelvas a subir el PDF. La devolución del servicio y la verificación son pasos separados.</p></>}
     {verified&&<><p className="mc-firmar-notice">La firma superó los controles informados por el servidor. Esto no aprueba el cálculo ni sustituye la emisión administrativa.</p>{props.onOpenVerifiedDocument&&<button className="mc-firmar-primary" onClick={props.onOpenVerifiedDocument}>Ver documento verificado</button>}</>}
     <details className="mc-firmar-evidence"><summary>Qué se firma y cómo se conserva</summary><p>Se firma el PDF de esta versión. El archivo devuelto tendrá otra huella al incorporar la firma. El original recibido se conserva; no se vuelve a generar al descargarlo.</p><p className="mc-firmar-hash">Huella del PDF preparado: {props.document.sha256}</p></details>
    </aside></div>
   <footer className="mc-firmar-footer">MuniControl no solicita contraseña, PIN ni códigos de FirmAR. La autorización personal ocurre en el servicio oficial; el documento y el seguimiento permanecen vinculados a esta solicitud.</footer>
  </>}
 </section>;
}
