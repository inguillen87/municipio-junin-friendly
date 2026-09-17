import React,{useEffect,useMemo,useRef,useState} from 'react';
import {FirmarJourneyPanel,PreparedSigningDocument} from './firmar-journey-panel';
import {createFirmarHttpClient,bindFirmarDocument} from '../../assets/firmar-http-client.js';
type Props={document:PreparedSigningDocument;preview:React.ReactNode;sessionValid:boolean;onBack:()=>void};
type Ready={key:string;state:'ready';attempt:any}|{key:string;state:'failed';code:string;message:string}|{key:string;state:'loading'};
/** Host supplies its approved PDF preview. Server independently checks request/version/hash.
 * No callback endpoint or provider credentials are called by this browser component. */
export function FirmarConnectedJourney(props:Props){
 const key=[props.document.id,props.document.version,props.document.sha256,props.sessionValid].join(':');
 const client=useMemo(()=>createFirmarHttpClient(),[]);
 const binding=useMemo(()=>bindFirmarDocument(client,props.document),[client,props.document.id,props.document.version,props.document.sha256]);
 const [state,setState]=useState<Ready>({key,state:'loading'}),[retry,setRetry]=useState(0);
 const titleRef=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{
  let active=true;const controller=new AbortController();setState({key,state:'loading'});
  if(!props.sessionValid)return()=>{active=false;controller.abort();};
  void (async()=>{
   try{
    await binding.confirmPrepared(controller.signal);
    let attempt=null;
    try{attempt=await binding.recoverAttempt({requestId:props.document.id,signal:controller.signal});}
    catch(error:any){if(error.code!=='FIRMAR_ATTEMPT_NOT_FOUND')throw error;}
    if(active)setState({key,state:'ready',attempt});
   }catch(error:any){if(active&&error.name!=='AbortError')setState({key,state:'failed',code:error.code||'FIRMAR_HTTP_UNAVAILABLE',message:error.message});}
  })();
  return()=>{active=false;controller.abort();};
 },[key,binding,retry,props.sessionValid]);
 useEffect(()=>{if(state.key===key&&state.state==='failed')titleRef.current?.focus();},[state,key]);
 const current=state.key===key?state:{key,state:'loading' as const};
 if(!props.sessionValid)return <section className="mc-firmar" role="alert"><h2>Tu sesión cambió</h2><p>No se muestra el documento anterior. Volvé a ingresar para recuperar tu solicitud.</p><button onClick={props.onBack}>Volver al documento</button></section>;
 if(current.state!=='ready')return <section className="mc-firmar" aria-busy={current.state==='loading'} aria-labelledby="signing-connection-title">
  <p className="mc-firmar-eyebrow">DOCUMENTOS Y FIRMAS · PILOTO</p>
  <h2 id="signing-connection-title" tabIndex={-1} ref={titleRef}>{current.state==='loading'?'Recuperando tu solicitud':'No pudimos abrir esta solicitud'}</h2>
  <p role={current.state==='loading'?'status':'alert'}>{current.state==='loading'?'Comprobamos la versión, tu acceso y si ya existe un intento. No se envía el PDF al firmador.':current.message}</p>
  {current.state==='failed'&&!['FIRMAR_SESSION_INVALID','FIRMAR_AUTHORITY_REQUIRED','FIRMAR_HTTP_DISABLED','FIRMAR_VERSION_CONFLICT','FIRMAR_RATE_LIMITED'].includes(current.code)&&<button onClick={()=>setRetry(v=>v+1)}>Volver a consultar, sin enviar el PDF</button>}
  <button onClick={props.onBack}>Volver al documento</button>
 </section>;
 return <div className="mc-firmar-connected">
  <aside className="mc-firmar-pilot" aria-label="Alcance del piloto"><strong>Conexión de prueba · Sin emisión oficial</strong><p>La recepción del PDF y la verificación de su firma son pasos diferentes. Este piloto conserva el resultado para revisión.</p><button onClick={props.onBack}>Volver al documento</button></aside>
  <FirmarJourneyPanel key={key} document={props.document} preview={props.preview} sessionValid={props.sessionValid} integrationReady={true}
   begin={binding.begin} readStatus={binding.readStatus} recoverAttempt={binding.recoverAttempt} resumeAttempt={current.attempt??undefined}/>
 </div>;
}

import {FirmarReturnPanel} from './firmar-return-panel';
export function FirmarConnectedReturn(props:{onContinue:(value:{requestId:string;attemptId:string})=>void;onOpenQueue:()=>void;sessionValid:boolean}){
 const client=useMemo(()=>createFirmarHttpClient(),[]);
 return <FirmarReturnPanel {...props} resolveReturn={({returnState,signal})=>client.resolveReturn({state:returnState,signal})}/>;
}
