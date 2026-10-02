import {nativeSelfView} from './native-self-model.js';
import {mountNativeLeave} from './native-leave.js';

const capsFor=auth=>auth?.authenticated===true&&Array.isArray(auth.access?.tenantCapabilities)?auth.access.tenantCapabilities:[];
const ownRead=caps=>['actions.read','leave.request.self.read'].every(cap=>caps.includes(cap));
const actorFor=auth=>JSON.stringify([auth.user?.email?.trim().toLowerCase(),auth.access?.tenant?.id,auth.access?.tenant?.membershipId,auth.access?.tenant?.roleKey]);
const error=(message,status=503)=>Object.assign(Error(message),{status});

// All data lives only in this page. Each refresh resolves the authenticated
// account's contract again; no URL, client-selected identity or storage is used.
export async function mountNativeSelf(host,{auth}={}){
 if(!host||!ownRead(capsFor(auth)))return null;
 let epoch=0,abort=null,child=null,actor=actorFor(auth),contract=null,closed=false;
 const title=document.createElement('h2'),status=document.createElement('p'),help=document.createElement('details'),content=document.createElement('div');
 const helpTitle=document.createElement('summary'),helpText=document.createElement('p');helpTitle.textContent='Cómo solicitar una licencia';helpText.textContent='Prepará un borrador con motivo y fechas. Revisá sus datos y envialo a Personal. Podés seguir las decisiones en el historial o cancelar una solicitud pendiente con un fundamento. Si falta saldo aprobado, Personal debe revisar el respaldo antes del envío.';help.append(helpTitle,helpText);
 title.textContent='Mis licencias';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 host.replaceChildren(title,status,help,content);host.hidden=false;
 const control={ownOnly:false,refresh,close};
 const valid=seq=>!closed&&seq===epoch&&host.isConnected&&!document.hidden;
 const clear=()=>{child?.close();child=null;content.replaceChildren();title.textContent='Mis licencias';};
 async function read(url){const response=await fetch(url,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal:AbortSignal.any([abort.signal,AbortSignal.timeout(25000)])});let body;try{body=await response.json();}catch{throw error('No se pudo verificar la respuesta.');}if(!response.ok)throw error(body?.error||'Tu acceso cambió. Volvé a ingresar.',response.status);return body;}
 async function refresh(){
  if(closed)return;const seq=++epoch;abort?.abort();abort=new AbortController();clear();status.textContent='Comprobando el contrato de tu cuenta…';
  try{
   const current=await read('/api/internal-auth');if(!valid(seq))return;
   const caps=capsFor(current);if(typeof current.user?.email!=='string'||!ownRead(caps)||actorFor(current)!==actor)throw error('Cambió la cuenta o sus permisos. Volvé a abrir el Centro de acciones.',403);
   control.ownOnly=!caps.includes('workforce.employee.read');
   const response=await read('/api/internal-native-self?resource=bootstrap');if(!valid(seq))return;
   if(response?.ok!==true)throw error('No se pudo verificar el contrato de tu cuenta.');
   const view=nativeSelfView(response.data);
   if(view.state==='reference'){control.ownOnly=false;host.hidden=true;return;}
   if(view.state==='unlinked'){status.textContent='Administración debe vincular tu cuenta con tu contrato antes de preparar solicitudes.';return;}
   if(contract&&contract!==view.subject.contractId)throw error('Cambió el contrato vinculado. Volvé a abrir el Centro de acciones.',403);
   contract=view.subject.contractId;
   title.textContent='Mis licencias · legajo '+view.subject.legajo;
   status.textContent='Tu contrato está registrado en MuniControl. Podés preparar y seguir tus solicitudes; Personal revisa los saldos y las decisiones.';
   const panel=document.createElement('div');content.append(panel);child=mountNativeLeave(panel,{contractId:contract,selfService:true});
  }catch(failure){if(!valid(seq)||failure.name==='AbortError')return;clear();status.textContent=failure.message||'No se pudo abrir la consulta. Volvé a comprobar tu acceso.';if([401,403].includes(failure.status)){control.ownOnly=true;close(status.textContent);}else throw failure;}
 }
 function revoke(event){const raw=event.detail?.tenantCapabilities,caps=raw instanceof Set?[...raw]:raw;if(!Array.isArray(caps)||!ownRead(caps))close();}
 function hidden(){if(document.hidden)close();}
 function close(message='Se retiraron los datos. Volvé a abrir el Centro de acciones para comprobar acceso.'){
  if(typeof message!=='string')message='Se retiraron los datos. Volvé a abrir el Centro de acciones para comprobar acceso.';
  if(closed)return;closed=true;epoch++;abort?.abort();clear();status.textContent=message;
  document.removeEventListener('visibilitychange',hidden);document.removeEventListener('municontrol:capabilities-ready',revoke);window.removeEventListener('pagehide',close);document.getElementById('logoutButton')?.removeEventListener('click',close);
 }
 document.addEventListener('visibilitychange',hidden);document.addEventListener('municontrol:capabilities-ready',revoke);window.addEventListener('pagehide',close);document.getElementById('logoutButton')?.addEventListener('click',close);
 try{await refresh();return control;}catch(failure){close();throw failure;}
}
