import React,{useEffect,useState,useRef} from 'react';
import {createFirmarReturn,takeFirmarReturnState} from '../../assets/firmar-return.js';
type Props={resolveReturn:(args:{returnState:string;signal:AbortSignal})=>Promise<unknown>;onContinue:(value:{requestId:string;attemptId:string})=>void;onOpenQueue:()=>void;sessionValid:boolean};
export function FirmarReturnPanel(props:Props){
 const [state,setState]=useState<any>({state:'resolving_return'}),latest=useRef(props),ref=useRef<ReturnType<typeof createFirmarReturn>|null>(null);
 const token=useRef<string|null|undefined>(undefined);
 latest.current=props;
 useEffect(()=>{let active=true;let channel:BroadcastChannel|null=null;
  try{if(typeof BroadcastChannel==='function')channel=new BroadcastChannel('municontrol-firmar-return');}catch{}
  const c=createFirmarReturn({location:window.location,history:window.history,consumeState:()=>{if(token.current===undefined){try{token.current=takeFirmarReturnState(window.location,window.history);}catch{token.current=null;}}return token.current;},resolveReturn:(a:any)=>latest.current.resolveReturn(a),notifyHost:(n:any)=>channel?.postMessage(n),onChange:(s:any)=>{if(active){if(['return_bound','session_lost','invalid_return','return_expired'].includes(s.state))token.current=null;setState(s);}}});ref.current=c;
  // React can mount, clean up and mount effects again before a response. Defer
  // the lookup so the discarded effect cannot consume the same return twice.
  // The server resolver still must be idempotent and recheck live membership.
  queueMicrotask(()=>{if(!active)return;if(latest.current.sessionValid)void c.resume();else c.sessionLost();});
  return()=>{active=false;c.dispose();ref.current=null;channel?.close();};
 },[]);
 useEffect(()=>{if(!props.sessionValid)ref.current?.sessionLost();},[props.sessionValid]);
 const current=props.sessionValid?state:{state:'session_lost'};
 const messages:Record<string,string>={resolving_return:'Recuperando tu solicitud en MuniControl…',return_bound:'Tu solicitud está localizada. El PDF se recupera automáticamente.',return_retry:'No pudimos consultar tu solicitud. No vuelvas a firmar el documento.',return_expired:'El retorno ya no se puede recuperar desde esta ventana. Consultá tu bandeja.',invalid_return:'Este enlace no permite identificar una solicitud vigente.',session_lost:'Volvé a ingresar para consultar tu bandeja.'};
 return <section className="mc-firmar" aria-labelledby="firmar-return-heading"><p className="mc-firmar-eyebrow">DOCUMENTOS Y FIRMAS</p><h2 id="firmar-return-heading">Volviste a MuniControl</h2>
  <div className="mc-firmar-status" role="status" aria-live="polite">{messages[current.state]||messages.invalid_return}</div>
  {current.state==='return_bound'?<><p>No necesitás descargar ni adjuntar archivos. La solicitud original conserva el seguimiento.</p><button className="mc-firmar-primary" onClick={()=>props.onContinue({requestId:current.requestId,attemptId:current.attemptId})}>Continuar en mi solicitud</button><p className="mc-firmar-hint">Volver del servicio oficial no confirma por sí solo la firma: MuniControl consulta la recepción y sus controles.</p></>:current.state==='return_retry'&&current.retryAvailable?<button className="mc-firmar-primary" onClick={()=>void ref.current?.resume()}>Reintentar consulta</button>:null}
  <p><button onClick={props.onOpenQueue}>Volver a mi bandeja</button></p>
 </section>;
}
