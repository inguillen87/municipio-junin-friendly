import {useEffect,useRef,useState} from 'react';
import {catalogMonth,verifyCatalogResponse,CATALOG_BLOCK_REASONS} from '../../lib/payroll-catalog-contract.js';
import {AGREEMENT_LABELS,parameterMoney} from '../../lib/payroll-parameter-contract.js';
import {parameterAttempt} from './payroll-parameter-client.js';
import {catalogRequest} from './payroll-catalog-client.js';
import {catalogArtifact} from './payroll-catalog-export.js';
const style=`
[data-payroll-catalog] .pc-heading{display:flex;gap:18px;justify-content:space-between;align-items:start;flex-wrap:wrap}
[data-payroll-catalog] .pc-values{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px;margin:16px 0}
[data-payroll-catalog] .pc-value{padding:16px;border:1px solid #cadfdc;border-radius:10px;background:#f4faf7;min-width:0;overflow-wrap:anywhere}
[data-payroll-catalog] .pc-value strong{display:block;font-size:22px;margin:5px 0}
[data-payroll-catalog] .pc-reference{margin-top:8px;font-size:12px;color:#375761}
[data-payroll-catalog] .pc-impact{padding:16px;border:1px solid #d5c192;border-radius:10px;background:#fffaf0;margin-top:18px}
[data-payroll-catalog] .pc-impact-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;padding:10px 0;border-bottom:1px solid #e7ddc6}
[data-payroll-catalog] .pc-impact-row small{margin-bottom:4px}
@media(max-width:600px){[data-payroll-catalog] .pc-impact-row{grid-template-columns:1fr}}
`;
export default function PayrollCatalog({proposal,onDenied,request=catalogRequest}) {
  const [period,setPeriod]=useState(()=>catalogMonth()),[revision,setRevision]=useState(''),[data,setData]=useState(null);
  const [preview,setPreview]=useState(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[bad,setBad]=useState(false);
  const [confirm,setConfirm]=useState(false),[pending,setPending]=useState(null),[denied,setDenied]=useState(false);
  const live=useRef(true),lock=useRef(false),dialog=useRef(null),generation=useRef(0),deny=useRef(onDenied);
  deny.current=onDenied;
  useEffect(()=>{live.current=true;const logout=()=>{live.current=false;setData(null);setPreview(null);setPending(null);setConfirm(false);setDenied(true);};
    document.getElementById('logoutButton')?.addEventListener('click',logout);
    return()=>{live.current=false;document.getElementById('logoutButton')?.removeEventListener('click',logout);};},[]);
  useEffect(()=>{generation.current++;setPreview(null);setConfirm(false);},[proposal?.id,proposal?.version,proposal?.status]);
  useEffect(()=>{if(confirm)dialog.current?.showModal();else dialog.current?.close();},[confirm]);
  function tell(text,error=false){if(live.current){setNotice(text);setBad(error);}}
  async function act(fn){if(lock.current)return;lock.current=true;setBusy(true);try{await fn();}catch(e){
    if(live.current){tell(e.message||'La operación no se completó.',true);if(e.status===409){setPreview(null);setConfirm(false);}
      if([401,403].includes(e.status)){setDenied(true);setData(null);setPreview(null);setPending(null);setConfirm(false);deny.current?.(e);}}
  }finally{lock.current=false;if(live.current)setBusy(false);}}
  const blocked=busy||pending!==null||denied;
  async function query(){await act(async()=>{
    setData(null);const result=verifyCatalogResponse(await request({resource:'catalog',period,revision}));
    if(!live.current)return;setData(result);tell(`Consulta del período ${result.catalog.period} · revisión ${result.catalog.revision}.`);
  });}
  async function inspect(){await act(async()=>{
    const g=generation.current;setPreview(null);
    const result=verifyCatalogResponse(await request({resource:'preview',id:proposal.id,version:String(proposal.version)}));
    if(!live.current||g!==generation.current)return;
    setPreview(result.preview);tell(result.preview.canActivate?'Revisá los valores anteriores y nuevos antes de activar.':CATALOG_BLOCK_REASONS[result.preview.blockedReason]);
  });}
  function accept(result){
    verifyCatalogResponse(result);if(!live.current)return;
    if(!result.activation)throw Error('La activación no tiene un comprobante verificable.');
    setData(result);setPeriod(result.catalog.period);setRevision(String(result.catalog.revision));setPending(null);setPreview(null);setConfirm(false);
    tell(`Valores activados desde ${result.activation.validFrom} · revisión ${result.activation.revision}. No se recalcularon sueldos.`);
  }
  async function send(attempt){
    setPending(attempt);setConfirm(false);
    let result;try{result=await request({},attempt);}catch(e){if(e.status<500)setPending(null);throw e;}
    accept(result);
  }
  async function activate(){await act(async()=>{
    if(!preview?.canActivate)throw Error('Se requiere una revisión de impacto habilitada.');
    await send(parameterAttempt('activate',{proposalId:preview.proposalId,proposalVersion:preview.proposalVersion,catalogRevision:preview.catalogRevision}));
  });}
  async function recover(){await act(async()=>{
    try{accept(await request({resource:'attempt',key:pending.key}));}
    catch(e){if(e.code==='PAYROLL_CATALOG_ATTEMPT_NOT_FOUND')tell('Todavía no hay acuse. Podés consultar nuevamente o reenviar el mismo intento.',true);else throw e;}
  });}
  async function download(format){await act(async()=>{
    const old=data.catalog,result=verifyCatalogResponse(await request({resource:'catalog',period:old.period,revision:String(old.revision)}));
    if(!live.current)return;
    if(result.catalog.revision!==old.revision||JSON.stringify(result.catalog.rows)!==JSON.stringify(old.rows))throw Error('La consulta no coincide con la revisión mostrada. Volvé a consultar antes de descargar.');
    const artifact=catalogArtifact(result,format,new Date().toISOString()),url=URL.createObjectURL(new Blob([artifact.content],{type:artifact.type})),a=document.createElement('a');
    a.href=url;a.download=artifact.filename;a.rel='noopener';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
    tell(`Documento generado desde la revisión ${old.revision}, reconsultada en Neon.`);
  });}
  const c=data?.catalog;
  return <section className="pp-panel" data-payroll-catalog="v1" aria-label="Catálogo salarial vigente">
    <style>{style}</style>
    <div className="pc-heading"><div><p className="pp-eyebrow">Datos propios · vigencias e histórico</p><h3>Valores vigentes por período</h3>
      <p>Consultá los auxiliares activados para cada convenio. Una propuesta aprobada se incorpora a este catálogo sólo después de activar sus valores.</p></div></div>
    <form className="pp-filter" onSubmit={e=>{e.preventDefault();query();}}>
      <label>Período del catálogo<input type="month" required value={period} disabled={blocked} onChange={e=>{setPeriod(e.target.value);setData(null);}}/></label>
      <label>Revisión histórica<input type="number" min="0" max="2147483647" step="1" value={revision} placeholder="Última disponible" disabled={blocked} onChange={e=>{setRevision(e.target.value);setData(null);}}/><small>Dejá vacío para consultar la última revisión.</small></label>
      <button type="submit" disabled={blocked}>Consultar valores vigentes</button>
    </form>
    {notice&&<div className="pp-status" role="status" data-error={bad} aria-live="polite">{notice}</div>}
    {pending&&<div className="pc-impact"><h4>Activación sin confirmación</h4><p>Conservamos el mismo intento. No se presupone que falló ni se crea otro cambio.</p><small>Intento: {pending.key}</small>
      <div className="pp-actions"><button disabled={busy||denied} onClick={recover}>Consultar activación pendiente</button><button disabled={busy||denied} onClick={()=>act(()=>send(pending))}>Reenviar activación original</button></div></div>}
    {c&&<><p><strong>Período {c.period} · revisión {c.revision}</strong><small>{c.rows.length} valores activados. Cada auxiliar conserva su propia fecha de vigencia.</small></p>
      {!c.rows.length?<p>No hay auxiliares activados para este período y revisión. Prepará la propuesta, obtené su aprobación y revisá su activación; no se sustituyen faltantes por cero.</p>:
        <div className="pc-values">{c.rows.map(r=><article className="pc-value" key={`${r.agreementId}:${r.auxiliaryId}`}><small>{r.agreementId} · {AGREEMENT_LABELS[r.agreementId]}</small><span>Auxiliar {r.auxiliaryId} · clase {r.baseClass}</span><strong>{parameterMoney(r.newValueCents)}</strong><small>Desde {r.validFrom} · alta en revisión {r.activationRevision}</small><details className="pc-reference"><summary>Ver respaldo y trazabilidad</summary><p>{r.sourceReference}</p><small>Propuesta {r.proposalId} · versión {r.proposalVersion}</small><small>Activación {r.activationId}</small></details></article>)}</div>}
      <div className="pp-actions">{['xlsx','pdf','csv'].map(ext=><button key={ext} disabled={blocked} onClick={()=>download(ext)}>Exportar catálogo {ext==='xlsx'?'Excel':ext.toUpperCase()}</button>)}</div></>}
    {proposal?.status==='approved'&&<div className="pc-impact"><h4>Activar la propuesta aprobada seleccionada</h4><p>Desde {proposal.draft.validFrom} · {proposal.draft.sourceReference}</p>
      <button disabled={blocked} onClick={inspect}>Revisar impacto de activación</button>
      {preview&&<><p>Catálogo previo: revisión {preview.catalogRevision}. Los cambios afectan sólo a los convenios indicados.</p>
        {preview.changes.map(r=><div className="pc-impact-row" key={r.agreementId}><div><small>Convenio y auxiliar</small>{r.agreementId} · {AGREEMENT_LABELS[r.agreementId]} · {r.auxiliaryId}</div><div><small>Antes, en {preview.validFrom}</small>{r.previousValueCents===null?'Sin valor activado':parameterMoney(r.previousValueCents)}</div><div><small>Nuevo valor</small><strong>{parameterMoney(r.newValueCents)}</strong></div></div>)}
        {preview.canActivate?<div className="pp-actions"><button className="pp-primary" disabled={blocked} onClick={()=>setConfirm(true)}>Activar valores desde {preview.validFrom}</button></div>:<p>{CATALOG_BLOCK_REASONS[preview.blockedReason]}</p>}
      </>}
    </div>}
    <p className="pp-scope">Activar incorpora los auxiliares al catálogo propio. No calcula ni confirma una nómina. Cada cálculo debe conservar la revisión que utilizó; una actualización posterior no reemplaza el histórico.</p>
    <dialog ref={dialog} aria-labelledby="pc-activate-title" onCancel={()=>{if(!busy)setConfirm(false);}}><h3 id="pc-activate-title">Confirmar activación de auxiliares</h3>
      {preview&&<><p>Vigencia: {preview.validFrom} · propuesta versión {preview.proposalVersion} · catálogo previo {preview.catalogRevision}.</p><p>{preview.sourceReference}</p><p>Se guardará una nueva revisión inmutable. Los registros anteriores no se sobrescriben.</p></>}
      <div className="pp-actions"><button disabled={busy} onClick={()=>setConfirm(false)}>Volver sin activar</button><button className="pp-primary" disabled={busy||!preview?.canActivate} onClick={activate}>Confirmar activación</button></div>
    </dialog>
  </section>;
}
