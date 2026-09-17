import React,{useState} from 'react';
import {FirmarPersonalWorkspace} from './firmar-personal-workspace';
import {FirmarSourceReview} from './firmar-source-review';
import {FirmarConnectedJourney} from './firmar-connected-journey';
/** The existing official-provider journey is reused; the workspace does not add a second signer. */
function ReviewedJourney(props:any){
 // This component is reached only after the same source was displayed in the review step.
 const [ready,setReady]=useState(true);
 return <section>
  <button type="button" className="fd-back" onClick={props.onBack}>← Volver a mis documentos</button>
  {!ready&&<p role="status">Comprobando la vista del original. Podés volver a la bandeja sin reenviar el documento.</p>}
  <div inert={!ready?true:undefined}>
   <FirmarConnectedJourney document={props.document} sessionValid={props.sessionValid} onBack={props.onBack}
    preview={<FirmarSourceReview bytes={props.bytes} sourceKey={props.document.id+':'+props.document.sha256} sessionValid={props.sessionValid}
      onReady={()=>setReady(true)} onUnavailable={()=>setReady(false)}/>}/>
  </div>
 </section>;
}
export function FirmarPortafirmas(props:{sessionValid:boolean;sessionKey:string}){
 return <FirmarPersonalWorkspace {...props} renderSigning={args=><ReviewedJourney key={args.document.id+':'+props.sessionKey} {...args} sessionValid={props.sessionValid}/>}/>;
}
