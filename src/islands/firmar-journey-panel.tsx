import React, {useEffect, useRef, useState} from 'react';
import {createFirmarJourney} from '../../assets/firmar-journey.js';

export type PreparedSigningDocument={id:string;version:number;title:string;pages:number;sha256:string};
type JourneyStatus={state:string;label:string;requestId:string|null;attemptId:string|null;sameTabUrl?:string|null;documentSha256?:string|null};
type Attempt={requestId:string;attemptId:string;expiresAt:string};
type Props={
 document:PreparedSigningDocument;
 /** Host must persist/authorize the request and bind a verified signing identity before enabling. */
 integrationReady:boolean;
 begin:(args:{requestId:string;expectedVersion:number;signal:AbortSignal})=>Promise<unknown>;
 readStatus:(args:{requestId:string;attemptId:string;signal:AbortSignal})=>Promise<unknown>;
 resumeAttempt?:Attempt;
 preview:React.ReactNode;
 onOpenVerifiedDocument?:()=>void;
 sessionValid?:boolean;
};
const initial:JourneyStatus={state:'review',label:'Revisá el PDF que vas a firmar',requestId:null,attemptId:null};
export function FirmarJourneyPanel(props:Props){
 const [state,setState]=useState<JourneyStatus>(initial),[reviewed,setReviewed]=useState(false);
 const ref=useRef<ReturnType<typeof createFirmarJourney>|null>(null),latest=useRef(props),heading=useRef<HTMLHeadingElement>(null);
 latest.current=props;
 useEffect(()=>{
  let mounted=true;setState(initial);setReviewed(false);
  const journey=createFirmarJourney({origin:location.origin,begin:(args:any)=>latest.current.begin(args),readStatus:(args:any)=>latest.current.readStatus(args),
   onChange:(value:JourneyStatus)=>{if(mounted)setState(value);},isVisible:()=>document.visibilityState!=='hidden',
   openWindow:()=>window.open('about:blank','_blank','popup,width=580,height=790')});
  ref.current=journey;
  const message=(e:MessageEvent)=>journey.notice(e),focus=()=>journey.refresh(),visible=()=>{if(document.visibilityState==='visible')journey.refresh();};
  window.addEventListener('message',message);window.addEventListener('focus',focus);document.addEventListener('visibilitychange',visible);
  // BroadcastChannel is same-origin. Messages only cause an authorized server refresh.
  const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('municontrol-firmar-return'):null;
  if(channel)channel.onmessage=e=>journey.notice({origin:location.origin,data:e.data});
  if(latest.current.resumeAttempt)journey.resume(latest.current.resumeAttempt);
  return()=>{mounted=false;journey.dispose();ref.current=null;channel?.close();window.removeEventListener('message',message);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',visible);};
 },[props.document.id,props.document.version]);
 useEffect(()=>{if(props.sessionValid===false){ref.current?.sessionLost();setReviewed(false);}},[props.sessionValid]);
 async function start(){if(!reviewed||!props.integrationReady||props.sessionValid===false||ref.current?.busy)return;try{await ref.current?.start({requestId:props.document.id,expectedVersion:props.document.version});}catch{setState({...initial,state:'failed',label:'No se pudo iniciar. Tu solicitud permanece guardada.'});}}
 const activeStep=['review','preparing','failed'].includes(state.state)?0:['awaiting_authorization','awaiting_receipt','outcome_unknown','paused','checking'].includes(state.state)?1:2;
 const verified=state.state==='verified',lost=state.state==='session_lost';
 const canStart=['review','failed'].includes(state.state)&&props.integrationReady;
 return <section className="mc-firmar" aria-labelledby="mc-firmar-title">
  <header className="mc-firmar-head"><div><p className="mc-firmar-eyebrow">DOCUMENTOS Y FIRMAS</p><h2 id="mc-firmar-title" ref={heading} tabIndex={-1}>Tu firma. Sin mover archivos.</h2>
   <p>Revisá en MuniControl, autorizá en FirmAR y continuá con el resultado en esta misma solicitud.</p></div>
   <span className="mc-firmar-badge">Firma remota · Sólo PDF</span></header>
  <ol className="mc-firmar-steps" aria-label="Pasos de la firma">{['Revisar','Autorizar firma','Recuperar resultado'].map((label,i)=><li key={label} aria-current={i===activeStep?'step':undefined}><span aria-hidden="true">{i+1}</span>{label}</li>)}</ol>
  {lost?<div role="alert" className="mc-firmar-notice">Tu sesión cambió. Volvé a ingresar para consultar la solicitud guardada. No se muestra el documento anterior.</div>:<>
   <div className="mc-firmar-grid"><div className="mc-firmar-preview" aria-label="Vista previa del PDF aprobado">{props.preview}</div>
    <aside className="mc-firmar-task" aria-label="Acción sobre el documento">
     <p className="mc-firmar-eyebrow">DOCUMENTO SELECCIONADO</p><h3>{props.document.title}</h3>
     <p className="mc-firmar-context">Versión {props.document.version} · {props.document.pages} {props.document.pages===1?'página':'páginas'}</p>
     <div className="mc-firmar-status" role="status" aria-live="polite"><strong>{state.label}</strong></div>
     {!props.integrationReady&&<div className="mc-firmar-notice"><strong>Conexión institucional pendiente</strong><p>La firma integrada se habilitará después del alta de la aplicación y sus pruebas. Tener el certificado personal no activa esta conexión automáticamente.</p></div>}
     {canStart&&<><label className="mc-firmar-confirm"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>Revisé esta versión y quiero solicitar mi firma personal.</label>
      <button className="mc-firmar-primary" disabled={!reviewed} onClick={()=>void start()}>Firmar PDF</button><p className="mc-firmar-hint">Se abrirá la ventana oficial de FirmAR. El PDF viaja automáticamente y MuniControl permanece abierto.</p></>}
     {state.state==='preparing'&&<p className="mc-firmar-hint">Guardamos el contexto antes de abrir la autorización. No repitas el envío.</p>}
     {state.sameTabUrl&&<a className="mc-firmar-primary" href={state.sameTabUrl} rel="noreferrer">Continuar y volver automáticamente</a>}
     {state.state==='awaiting_authorization'&&!state.sameTabUrl&&<button onClick={()=>ref.current?.focusAuthorization()}>Volver a la ventana de firma</button>}
     {['awaiting_authorization','awaiting_receipt','received_unverified','validation_pending','paused','outcome_unknown','checking'].includes(state.state)&&<><button onClick={()=>ref.current?.refresh()}>Actualizar estado de esta solicitud</button><p className="mc-firmar-hint">No descargues ni vuelvas a subir el PDF. La devolución del servicio y la verificación son pasos separados.</p></>}
     {verified&&<><p className="mc-firmar-notice">La firma superó los controles informados por el servidor. Esto no aprueba el cálculo ni sustituye la emisión administrativa.</p>{props.onOpenVerifiedDocument&&<button className="mc-firmar-primary" onClick={props.onOpenVerifiedDocument}>Ver documento verificado</button>}</>}
     <details className="mc-firmar-evidence"><summary>Qué se firma y cómo se conserva</summary><p>Se firma el PDF de esta versión. El archivo devuelto tendrá otra huella al incorporar la firma. El original recibido se conserva; no se vuelve a generar al descargarlo.</p><p className="mc-firmar-hash">Huella del PDF preparado: {props.document.sha256}</p></details>
    </aside></div>
   <footer className="mc-firmar-footer">MuniControl no solicita contraseña, PIN ni códigos de FirmAR. La autorización personal ocurre en el servicio oficial; el documento y el seguimiento permanecen vinculados a esta solicitud.</footer>
  </>}
 </section>;
}
