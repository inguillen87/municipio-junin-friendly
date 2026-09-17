// Read-only signer workspace. Authority and immutable source are checked in PostgreSQL.
import {createHash,randomUUID} from 'node:crypto';
import {normalizeWorkspaceQuery,checkWorkspaceData,exact,UUID,SHA,FIRMAR_PDF_LIMIT,sourceSelection} from '../assets/firmar-workspace-model.js';
const ORIGIN='https://municipio-junin-friendly.vercel.app',PATH='/api/internal-firmar-workspace';
const errors={FIRMAR_SESSION_INVALID:[401,'Tu sesión cambió. Volvé a ingresar.'],FIRMAR_AUTHORITY_REQUIRED:[403,'Tu autorización para este documento no está vigente.'],FIRMAR_NOT_FOUND:[404,'No se encontró un documento disponible para tu cuenta.'],FIRMAR_REQUEST_CANCELLED:[409,'La solicitud está cancelada. Volvé a la bandeja.'],FIRMAR_VERSION_CONFLICT:[409,'El documento no coincide con la versión seleccionada. Actualizá la bandeja.'],FIRMAR_BUSY:[409,'La solicitud se está actualizando. Volvé a consultar sin reenviar el PDF.'],FIRMAR_RATE_LIMITED:[429,'Esperá antes de actualizar. Tus documentos permanecen guardados.'],FIRMAR_WORKSPACE_DISABLED:[503,'El portafirmas está pendiente de habilitación del piloto.'],FIRMAR_INPUT_INVALID:[400,'La consulta no tiene el formato esperado.'],FIRMAR_ORIGIN_DENIED:[403,'Abrí esta función desde MuniControl.'],FIRMAR_WORKSPACE_UNAVAILABLE:[503,'No se pudo consultar el portafirmas. No se modificó ningún documento.']};
export class FirmarWorkspaceError extends Error{constructor(code){super(code);this.name='FirmarWorkspaceError';this.code=Object.hasOwn(errors,code)?code:'FIRMAR_WORKSPACE_UNAVAILABLE';this.status=errors[this.code][0];}}
const fail=c=>{throw new FirmarWorkspaceError(c);};
export function workspaceContext(access){
 const t=access?.principal?.tenant,u=access?.principal?.user,s=access?.session;
 if(access?.mode!=='managed'||t?.source!=='membership'||!s||s.email!==u?.email||typeof u.email!=='string'||u.email!==u.email.trim().toLowerCase()||u.email.length>254||!/^\S+@\S+\.\S+$/.test(u.email)||![t.id,t.membershipId,s.id].every(v=>UUID.test(v||''))||!Number.isSafeInteger(s.version)||s.version<1)fail('FIRMAR_SESSION_INVALID');
 return {actorEmail:u.email,actorSessionId:s.id,actorSessionVersion:s.version,membershipId:t.membershipId,tenantId:t.id};
}
export function createFirmarWorkspaceRepository(sql){
 if(typeof sql?.query!=='function')throw TypeError('SQL client required');
 const call=async(statement,args)=>{try{const r=await sql.query(statement,args);return(Array.isArray(r)?r:r?.rows)?.[0]?.result;}catch(e){const c=String(e?.message||'');fail(Object.hasOwn(errors,c)?c:'FIRMAR_WORKSPACE_UNAVAILABLE');}};
 return Object.freeze({
  async list(context,query){const q=normalizeWorkspaceQuery(query);return checkWorkspaceData(await call('SELECT public.firmar_workspace_list_v1($1::jsonb,$2::jsonb) AS result',[JSON.stringify(context),JSON.stringify(q)]),q,{configuration:false});},
  async source(context,selection){
   sourceSelection(selection);const x=await call('SELECT public.firmar_workspace_source_v1($1::jsonb,$2::uuid,$3::integer,$4::text) AS result',[JSON.stringify(context),selection.requestId,selection.version,selection.sha256]);
   if(!exact(x,['requestId','version','sourceSha256','pdfBase64'])||x.requestId!==selection.requestId||x.version!==selection.version||x.sourceSha256!==selection.sha256||typeof x.pdfBase64!=='string'||x.pdfBase64.length>Math.ceil(FIRMAR_PDF_LIMIT/3)*4)fail('FIRMAR_WORKSPACE_UNAVAILABLE');
   const pdf=Buffer.from(x.pdfBase64,'base64');if(pdf.length<10||pdf.length>FIRMAR_PDF_LIMIT||pdf.toString('base64')!==x.pdfBase64||!/^%PDF-(?:1\.[0-9]|2\.0)/.test(pdf.subarray(0,8).toString('ascii'))||createHash('sha256').update(pdf).digest('hex')!==selection.sha256)fail('FIRMAR_WORKSPACE_UNAVAILABLE');return pdf;
  }
 });
}
function header(req,k){const found=Object.entries(req.headers||{}).filter(([name])=>name.toLowerCase()===k);if(found.length>1||found.some(([,v])=>typeof v!=='string')||Array.isArray(req.rawHeaders)&&req.rawHeaders.filter((x,i)=>i%2===0&&String(x).toLowerCase()===k).length>1)fail('FIRMAR_INPUT_INVALID');return found[0]?.[1]??'';}
export function createFirmarWorkspaceHandler({env={},authorize,repositoryFor,takeBudget,signingReady=()=>false}={}){
 if(![authorize,repositoryFor,takeBudget,signingReady].every(x=>typeof x==='function'))throw TypeError('Session, repository and rate budget required');
 return async(req,res)=>{const trace=randomUUID();for(const [k,v]of Object.entries({'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache','Vary':'Cookie, Origin','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin','X-Frame-Options':'DENY','Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'none'",'X-Request-Id':trace}))res.setHeader(k,v);
  try{
   if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,code:'METHOD_NOT_ALLOWED',officialEmissionEnabled:false});}
   if(env.FIRMAR_HTTP_PILOT_ENABLED!=='true'||env.FIRMAR_ENVIRONMENT!=='test'||env.FIRMAR_APP_ORIGIN!==ORIGIN||!UUID.test(env.FIRMAR_TENANT_ID||''))fail('FIRMAR_WORKSPACE_DISABLED');
   const origin=header(req,'origin'),site=header(req,'sec-fetch-site');
   if(header(req,'x-municontrol-intent')!=='signing-v1'||origin&&origin!==ORIGIN||site&&site!=='same-origin')fail('FIRMAR_ORIGIN_DENIED');
   if(req.body!==undefined||header(req,'range')||header(req,'content-encoding')||header(req,'transfer-encoding')||header(req,'content-length')&&header(req,'content-length')!=='0')fail('FIRMAR_INPUT_INVALID');
   if(typeof req.url!=='string'||req.url.length>1024||!req.url.startsWith('/')||req.url.startsWith('//')||/[\x00-\x20\x7f#\\]/.test(req.url))fail('FIRMAR_INPUT_INVALID');
   const u=new URL(req.url,ORIGIN),entries=[...u.searchParams];if(u.pathname!==PATH||new Set(entries.map(([k])=>k)).size!==entries.length)fail('FIRMAR_INPUT_INVALID');const q=Object.fromEntries(entries);
   if(req.query!==undefined&&(!exact(req.query,Object.keys(q))||Object.keys(q).some(k=>q[k]!==req.query[k])))fail('FIRMAR_INPUT_INVALID');
   let selection,query;
   if(q.operation==='list'&&exact(q,['operation','filter','search','page','pageSize'])){try{query=normalizeWorkspaceQuery({filter:q.filter,search:q.search,page:q.page,pageSize:q.pageSize});}catch{fail('FIRMAR_INPUT_INVALID');}}
   else if(q.operation==='source'&&exact(q,['operation','requestId','version','sha256'])&&q.version==='1'){try{selection=sourceSelection({requestId:q.requestId,version:1,sha256:q.sha256});}catch{fail('FIRMAR_INPUT_INVALID');}}
   else fail('FIRMAR_INPUT_INVALID');
   const access=await authorize(req,res);if(!access)return;const context=workspaceContext(access);if(context.tenantId!==env.FIRMAR_TENANT_ID)fail('FIRMAR_AUTHORITY_REQUIRED');
   const budget=await takeBudget(context.tenantId+':'+context.membershipId);if(!budget||typeof budget.allowed!=='boolean')fail('FIRMAR_WORKSPACE_UNAVAILABLE');if(!budget.allowed)fail('FIRMAR_RATE_LIMITED');
   const repo=await repositoryFor();
   if(query){const result=await repo.list(context,query);checkWorkspaceData(result,query,{configuration:false});const data={...result,signingReady:signingReady()===true};return res.status(200).json({ok:true,data});}
   const bytes=await repo.source(context,selection);
   if(!Buffer.isBuffer(bytes)||bytes.length<10||bytes.length>FIRMAR_PDF_LIMIT||createHash('sha256').update(bytes).digest('hex')!==selection.sha256)fail('FIRMAR_WORKSPACE_UNAVAILABLE');
   res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Length',String(bytes.length));res.setHeader('Content-Disposition','attachment; filename="documento-preparado.pdf"');
   res.setHeader('X-MuniControl-Source-Sha256',selection.sha256);res.setHeader('X-MuniControl-Source-Version','1');res.setHeader('X-MuniControl-Request-Id',selection.requestId);
   res.statusCode=200;return res.end(bytes);
  }catch(e){const code=e instanceof FirmarWorkspaceError?e.code:'FIRMAR_WORKSPACE_UNAVAILABLE',[status,message]=errors[code];if(status===429)res.setHeader('Retry-After','60');return res.status(status).json({ok:false,code,error:message,traceId:trace,officialEmissionEnabled:false});}
 };
}
