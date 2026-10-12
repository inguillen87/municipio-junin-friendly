import {useEffect,useRef,useState} from 'react';
export default function NativeSalarySourceScaleLoader(props){
 const [Component,setComponent]=useState(null),[loading,setLoading]=useState(false),[failed,setFailed]=useState(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 async function open(){if(Component||loading||props.disabled)return;setLoading(true);setFailed(false);try{const module=await import('./NativeSalarySourceScales.jsx');if(alive.current)setComponent(()=>module.default);}catch{if(alive.current)setFailed(true);}finally{if(alive.current)setLoading(false);}}
 return <details data-salary-source-scales-loader onToggle={event=>{if(event.currentTarget.open)open();}}><summary style={{minHeight:44,display:'flex',alignItems:'center'}}>Preparar bases desde referencia de categorías</summary>{Component?<Component {...props}/>:<><p role="status">{loading?'Abriendo preparación de bases…':failed?'No se pudo abrir la preparación. Tu borrador se conserva.':'Abrí la herramienta para leer la referencia y declarar los códigos propios.'}</p><button type="button" disabled={props.disabled||loading} onClick={open}>{failed?'Reintentar preparación de bases':'Abrir preparación de bases'}</button></>}</details>;
}
