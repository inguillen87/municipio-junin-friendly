import {useEffect,useRef,useState} from 'react';
import {catalogMonth,verifyCatalogResponse,CATALOG_BLOCK_REASONS} from '../../lib/payroll-catalog-contract.js';
import {AGREEMENT_LABELS,parameterMoney,PARAMETER_CONTRACT,PARAMETER_SOURCE_SHA} from '../../lib/payroll-parameter-contract.js';
import {catalogScope,catalogActivationReview,sameCatalogActivationReview,catalogActivationAttempt,assertCatalogActivationReceipt} from '../../lib/payroll-catalog-review.js';
import {parameterRequest,ParameterRequestError} from './payroll-parameter-client.js';
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
[data-payroll-catalog] .pc-confirm-check{display:flex;align-items:center;gap:10px;min-height:44px;margin:18px 0}
[data-payroll-catalog] dialog{max-width:760px}
@media(max-width:600px){[data-payroll-catalog] .pc-impact-row{grid-template-columns:1fr}}
`;
function Impact({preview}) {return <div>{preview.changes.map(r=><div className="pc-impact-row" key={r.agreementId}>
  <div><small>Convenio y auxiliar</small>{r.agreementId} · {AGREEMENT_LABELS[r.agreementId]}<small>Auxiliar {r.auxiliaryId} · clase {r.baseClass} · concepto {r.referenceConceptId===null?'Sin concepto de referencia':r.referenceConceptId}</small></div>
  <div><small>Antes, en {preview.validFrom}</small>{r.previousValueCents===null?'Sin valor activado':parameterMoney(r.previousValueCents)}<small>{r.previousValueCents===null?'No se reemplaza por cero':`Desde ${r.previousValidFrom} · revisión ${r.previousActivationRevision}`}</small></div>
  <div><small>Nuevo valor</small><strong>{parameterMoney(r.newValueCents)}</strong></div>
</div>)}</div>;}
export default function PayrollCatalog({proposal,revoked=false,onDenied,request=catalogRequest,parameterRead=parameterRequest}) {
  const [period,setPeriod]=useState(()=>catalogMonth()),[revision,setRevision]=useState(''),[data,setData]=useState(null);
  const [preview,setPreview]=useState(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[bad,setBad]=useState(false);
  const [confirm,setConfirm]=useState(false),[checked,setChecked]=useState(false),[review,setReview]=useState(null),[pending,setPending]=useState(null),[denied,setDenied]=useState(false);
  const live=useRef(true),lock=useRef(false),dialog=useRef(null),generation=useRef(0),deny=useRef(onDenied),attemptRef=useRef(null);
  deny.current=onDenied;
  function withdraw(){generation.current++;setData(null);setPreview(null);setReview(null);setConfirm(false);setChecked(false);setDenied(true);}
  useEffect(()=>{live.current=true;const logout=()=>{withdraw();live.current=false;};
    const hide=()=>{if(document.hidden)withdraw();};const pagehide=()=>withdraw();
    document.getElementById('logoutButton')?.addEventListener('click',logout);
    document.addEventListener('visibilitychange',hide);window.addEventListener('pagehide',pagehide);
    return()=>{live.current=false;generation.current++;document.getElementById('logoutButton')?.removeEventListener('click',logout);document.removeEventListener('visibilitychange',hide);window.removeEventListener('pagehide',pagehide);};},[]);
  useEffect(()=>{if(revoked)withdraw();},[revoked]);
  useEffect(()=>{generation.current++;setPreview(null);setReview(null);setConfirm(false);setChecked(false);},[proposal?.id,proposal?.version,proposal?.status,proposal?.draft]);
  useEffect(()=>{if(confirm)dialog.current?.showModal();else dialog.current?.close();},[confirm]);
  function current(g){return live.current&&!document.hidden&&g===generation.current;}
  function insist(g){if(!current(g))throw new ParameterRequestError('La revisión ya no está disponible.',409,'CATALOG_VIEW_WITHDRAWN');}
  function tell(text,error=false){if(live.current){setNotice(text);setBad(error);}}
  async function act(fn){if(!live.current||document.hidden||lock.current)return;lock.current=true;setBusy(true);try{await fn();}catch(e){
    if(live.current&&e.code!=='CATALOG_VIEW_WITHDRAWN'){tell(e.message||'La operación no se completó.',true);setPreview(null);setReview(null);setConfirm(false);setChecked(false);
      if([401,403].includes(e.status)){withdraw();deny.current?.(e);}}
  }finally{lock.current=false;if(live.current)setBusy(false);}}
  const blocked=busy||pending!==null||denied;
  async function authority(g,expectedScope=null,approve=false){
    const result=await parameterRead({resource:'bootstrap'});insist(g);
    if(result.limits?.contractVersion!==PARAMETER_CONTRACT||result.limits?.sourceSha256!==PARAMETER_SOURCE_SHA)throw Error('La versión de parámetros no coincide. Volvé a consultar.');
    const scope=catalogScope(result.principal),caps=result.principal.capabilities;
    if(!caps.includes('payroll.parameter.read')||(approve&&(!caps.includes('payroll.parameter.approve')||result.principal.employmentLinked!==true)))throw new ParameterRequestError('Tu perfil ya no permite esta operación del catálogo.',403,'PAYROLL_CATALOG_ACCESS_REVOKED');
    if(expectedScope&&scope!==expectedScope)throw new ParameterRequestError('Cambió el municipio, la membresía o la fuente certificada. El intento original se conserva y no se reenvía.',409,'PAYROLL_CATALOG_SCOPE_CHANGED');
    return scope;
  }
  async function checkAccess(){await act(async()=>{const g=generation.current;await authority(g,attemptRef.current?.scopeKey);insist(g);setDenied(false);tell('Acceso al catálogo comprobado. Volvé a consultar o recuperá el intento original.');});}
  async function query(){await act(async()=>{
    const g=generation.current;setData(null);await authority(g);const result=verifyCatalogResponse(await request({resource:'catalog',period,revision}));
    insist(g);setData(result);tell(`Consulta del período ${result.catalog.period} · revisión ${result.catalog.revision}.`);
  });}
  async function inspect(){await act(async()=>{
    const g=generation.current;setPreview(null);setReview(null);setChecked(false);const scope=await authority(g);
    const saved=await parameterRead({resource:'detail',id:proposal.id});insist(g);
    const result=verifyCatalogResponse(await request({resource:'preview',id:proposal.id,version:String(proposal.version)}));
    insist(g);if(result.preview.canActivate)setReview(catalogActivationReview(result,saved.proposal,scope));
    setPreview(result.preview);tell(result.preview.canActivate?'Revisá los valores anteriores y nuevos antes de activar.':CATALOG_BLOCK_REASONS[result.preview.blockedReason]);
  });}
  function accept(result,attempt,g){
    insist(g);assertCatalogActivationReceipt(result,attempt);
    attemptRef.current=null;
    setData(result);setPeriod(result.catalog.period);setRevision(String(result.catalog.revision));setPending(null);setPreview(null);setConfirm(false);
    setReview(null);setChecked(false);
    tell(`Valores activados desde ${result.activation.validFrom} · revisión ${result.activation.revision}. No se recalcularon sueldos.`);
  }
  async function send(attempt,g){
    insist(g);attemptRef.current=attempt;setPending(attempt);setConfirm(false);
    const result=await request({},attempt);insist(g);
    await authority(g,attempt.scopeKey);accept(result,attempt,g);
  }
  async function activate(){await act(async()=>{
    if(!review||!checked||attemptRef.current)throw Error('Se requiere una revisión completa confirmada, sin otro intento pendiente.');
    const original=review,g=generation.current;await authority(g,original.scopeKey,true);
    const saved=await parameterRead({resource:'detail',id:original.preview.proposalId});insist(g);
    const fresh=await request({resource:'preview',id:original.preview.proposalId,version:String(original.preview.proposalVersion)});insist(g);
    if(!sameCatalogActivationReview(original,fresh,saved.proposal))throw Error('Cambió la propuesta o el catálogo. Revisá nuevamente todos los valores antes de activar.');
    await send(catalogActivationAttempt(original,crypto.randomUUID()),g);
  });}
  async function recover(){await act(async()=>{
    const attempt=attemptRef.current,g=generation.current;await authority(g,attempt.scopeKey);
    try{const result=await request({resource:'attempt',key:attempt.key});insist(g);await authority(g,attempt.scopeKey);accept(result,attempt,g);}
    catch(e){if(e.code==='PAYROLL_CATALOG_ATTEMPT_NOT_FOUND')tell('Todavía no hay acuse. Podés consultar nuevamente o reenviar el mismo intento.',true);else throw e;}
  });}
  async function resend(){await act(async()=>{const attempt=attemptRef.current,g=generation.current;await authority(g,attempt.scopeKey,true);await send(attempt,g);});}
  async function download(format){await act(async()=>{
    const g=generation.current;await authority(g);
    const old=data.catalog,result=verifyCatalogResponse(await request({resource:'catalog',period:old.period,revision:String(old.revision)}));
    insist(g);
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
    {denied&&<div className="pc-impact"><p>Se retiró la vista del catálogo. Comprobá el acceso antes de volver a consultar o recuperar una activación.</p><button disabled={busy} onClick={checkAccess}>Comprobar acceso al catálogo</button></div>}
    {pending&&<div className="pc-impact"><h4>Activación sin confirmación</h4><p>Conservamos el mismo intento en esta pestaña. No se presupone que falló ni se crea otro cambio. Consultá su confirmación antes de cerrar la página.</p><small>Intento: {pending.key}</small>
      <div className="pp-actions"><button disabled={busy||denied} onClick={recover}>Consultar activación pendiente</button><button disabled={busy||denied} onClick={resend}>Reenviar activación original</button></div></div>}
    {c&&<><p><strong>Período {c.period} · revisión {c.revision}</strong><small>{c.rows.length} valores activados. Cada auxiliar conserva su propia fecha de vigencia.</small></p>
      {!c.rows.length?<p>No hay auxiliares activados para este período y revisión. Prepará la propuesta, obtené su aprobación y revisá su activación; no se sustituyen faltantes por cero.</p>:
        <div className="pc-values">{c.rows.map(r=><article className="pc-value" key={`${r.agreementId}:${r.auxiliaryId}`}><small>{r.agreementId} · {AGREEMENT_LABELS[r.agreementId]}</small><span>Auxiliar {r.auxiliaryId} · clase {r.baseClass}</span><strong>{parameterMoney(r.newValueCents)}</strong><small>Desde {r.validFrom} · alta en revisión {r.activationRevision}</small><details className="pc-reference"><summary>Ver respaldo y trazabilidad</summary><p>{r.sourceReference}</p><small>Propuesta {r.proposalId} · versión {r.proposalVersion}</small><small>Activación {r.activationId}</small></details></article>)}</div>}
      <div className="pp-actions">{['xlsx','pdf','csv'].map(ext=><button key={ext} disabled={blocked} onClick={()=>download(ext)}>Exportar catálogo {ext==='xlsx'?'Excel':ext.toUpperCase()}</button>)}</div></>}
    {!denied&&proposal?.status==='approved'&&<div className="pc-impact"><h4>Activar la propuesta aprobada seleccionada</h4><p>Desde {proposal.draft.validFrom} · {proposal.draft.sourceReference}</p>
      <button disabled={blocked} onClick={inspect}>Revisar impacto de activación</button>
      {preview&&<><p>Catálogo previo: revisión {preview.catalogRevision}. Los cambios afectan sólo a los convenios indicados.</p>
        <Impact preview={preview}/>
        {preview.canActivate?<div className="pp-actions"><button className="pp-primary" disabled={blocked||!review} onClick={()=>{setChecked(false);setConfirm(true);}}>Activar valores desde {preview.validFrom}</button></div>:<p>{CATALOG_BLOCK_REASONS[preview.blockedReason]}</p>}
      </>}
    </div>}
    <p className="pp-scope">Activar incorpora los auxiliares al catálogo propio. No calcula ni confirma una nómina. Cada cálculo debe conservar la revisión que utilizó; una actualización posterior no reemplaza el histórico.</p>
    <dialog ref={dialog} aria-labelledby="pc-activate-title" onCancel={e=>{if(busy)e.preventDefault();else{setConfirm(false);setChecked(false);}}}><h3 id="pc-activate-title">Confirmar activación de auxiliares</h3>
      {review&&<><p>Vigencia: {review.preview.validFrom} · propuesta versión {review.preview.proposalVersion} · catálogo previo {review.preview.catalogRevision}.</p><p>{review.preview.sourceReference}</p><p>Básico de la escala: {parameterMoney(review.proposal.draft.baseAmountCents)} · {review.proposal.draft.rounding==='nearest_cent'?'Redondeo al centavo más próximo':'Truncamiento al centavo'}.</p><Impact preview={review.preview}/><p>Se guardará una nueva revisión inmutable. Los registros anteriores no se sobrescriben.</p><label className="pc-confirm-check"><input type="checkbox" checked={checked} disabled={busy} onChange={e=>setChecked(e.target.checked)}/>Revisé todos los convenios, valores y la vigencia</label></>}
      <div className="pp-actions"><button disabled={busy} onClick={()=>setConfirm(false)}>Volver sin activar</button><button className="pp-primary" disabled={busy||blocked||!review||!checked} onClick={activate}>Confirmar activación</button></div>
    </dialog>
  </section>;
}
