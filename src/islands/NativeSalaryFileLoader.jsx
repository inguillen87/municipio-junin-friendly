import {useEffect,useRef,useState} from 'react';

// An optional local module. A failed download keeps the complete React draft usable.
export default function NativeSalaryFileLoader(props){
 const [busy,setBusy]=useState(false),[error,setError]=useState(false),host=useRef(null),controller=useRef(null),alive=useRef(true),loading=useRef(false),attempt=useRef(0),latest=useRef(props);latest.current=props;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.destroy();};},[]);
 useEffect(()=>{controller.current?.update(props);});
 async function load(){if(controller.current||loading.current)return;loading.current=true;setBusy(true);setError(false);try{const url='/assets/native-salary-file-panel.js?attempt='+(++attempt.current),module=await import(url);if(alive.current)controller.current=module.mountSalaryFile(host.current,latest.current);}catch{if(alive.current)setError(true);}finally{loading.current=false;if(alive.current)setBusy(false);}}
 return <details data-salary-file-loader onToggle={event=>{if(event.currentTarget.open)load();}}><summary style={{minHeight:44,display:'flex',alignItems:'center'}}>Cargar conceptos y escalas desde CSV</summary><div ref={host}/>{busy&&<p role="status">Abriendo el editor CSV…</p>}{error&&<><p>No se pudo abrir el editor CSV. El borrador se conserva.</p><button type="button" onClick={load}>Reintentar editor CSV</button></>}</details>;
}
