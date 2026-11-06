import {createHash} from 'node:crypto';
// No payroll mutations or credentials. The scope comes exclusively from an authenticated
// owner request and is verified AGAIN by the dedicated SQL function, in its transaction.
const HASH = /^[0-9a-f]{64}$/, UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const MAX_BODY_BYTES=512;
const ERRORS = Object.freeze({
  DISABLED:[404,'Recurso no disponible.'], METHOD:[405,'Método no admitido.'],
  INPUT:[400,'La solicitud de prueba no es válida.'], MEDIA:[415,'Se requiere un formulario JSON.'],
  LIMIT:[413,'El formulario supera el límite.'], ORIGIN:[403,'El origen de la solicitud no es válido.'],
  FORBIDDEN:[403,'La homologación requiere al propietario verificado en su municipio habilitado.'],
  SCOPE:[409,'Cambió la ventana o la cuenta. Actualizá y revisá antes de volver a enviar.'],
  INACTIVE:[409,'La ventana de prueba no está activa.'], BUSY:[409,'La solicitud está ocupada. Volvé a consultar.'],
  UNAVAILABLE:[503,'No se pudo verificar la homologación en este momento.'],
  SESSION:[401,'Tu sesión no está vigente.'],
});
const fail = key => {const [status,message]=ERRORS[key];throw Object.assign(new Error(message),{internalQaKey:key,status});};
const plain = obj => obj !== null && typeof obj==='object' && !Array.isArray(obj) && [null,Object.prototype].includes(Object.getPrototypeOf(obj));
const keysAre = (obj, keys) => plain(obj) && Object.keys(obj).sort().join('|')===[...keys].sort().join('|');
function safeError(e) {
  if (e?.internalQaKey && Object.hasOwn(ERRORS,e.internalQaKey)) return e.internalQaKey;
  const code=String(e?.code||''), msg=String(e?.message||'');
  const names=new Set([code,...msg.match(/\b(?:QA|OWNER_ADOPTION|EMPLOYMENT_ADOPTION|ACTION|NATIVE_EMPLOYEE|TENANT_IAM|OWN_RUN)_[A-Z0-9_]+\b/g)||[]]);
  const includes=(...namesToFind)=>namesToFind.some(name=>names.has(name));
  if (includes('QA_SCOPE_CHANGED','QA_TRIAL_CHANGED','QA_PRACTICE_STALE','QA_PRACTICE_STATE')) return 'SCOPE';
  if (includes('QA_NOT_ENABLED')) return 'DISABLED';
  if (includes('QA_WINDOW_INACTIVE')) return 'INACTIVE';
  if (includes('OWNER_ADOPTION_AUTHORITY_BUSY','EMPLOYMENT_ADOPTION_BUSY','ACTION_SESSION_BUSY','55P03','40P01','40001')) return 'BUSY';
  if (includes('OWNER_ADOPTION_AUTHORITY_REQUIRED','OWNER_ADOPTION_FORBIDDEN','EMPLOYMENT_ADOPTION_FORBIDDEN','EMPLOYMENT_ADOPTION_ACTOR_REQUIRED','NATIVE_EMPLOYEE_FORBIDDEN','NATIVE_EMPLOYEE_BINDING_INVALID','TENANT_IAM_SOD_CONFLICT','ACTION_SOURCE_BINDING_REQUIRED','ACTION_RELEASE_NOT_CERTIFIED','QA_FORBIDDEN','ACTION_TENANT_AUTHORITY_REQUIRED','ACTION_FORBIDDEN') || /_FORBIDDEN$/.test(code)) return 'FORBIDDEN';
  if (includes('ACTION_SESSION_INVALID','NATIVE_EMPLOYEE_SESSION_INVALID','OWNER_ADOPTION_SESSION_INVALID','EMPLOYMENT_ADOPTION_IDENTITY_CHANGED')) return 'SESSION';
  if (includes('QA_INPUT_INVALID','QA_PRACTICE_INPUT','NATIVE_EMPLOYMENT_CATALOG_INPUT_INVALID','SCHOOL_CERTIFICATE_BODY_INVALID')) return 'INPUT';
  if (includes('SCHOOL_CERTIFICATE_ORIGIN_INVALID')) return 'ORIGIN';
  if (includes('NATIVE_EMPLOYMENT_CATALOG_LIMIT','SCHOOL_CERTIFICATE_BODY_LIMIT') || e?.status===413) return 'LIMIT';
  return 'UNAVAILABLE';
}
function queryOf(req) {
  const q=req.query??{};
  if(!plain(q)||Object.values(q).some(v=>typeof v!=='string'))fail('INPUT');
  if(typeof req.url==='string'){
    let entries;try {entries=[...new URL(req.url,'http://localhost').searchParams];}catch{fail('INPUT');}
    if(entries.length!==Object.keys(q).length || new Set(entries.map(([k])=>k)).size!==entries.length
       || entries.some(([k,v])=>!Object.hasOwn(q,k)||q[k]!==v))fail('INPUT');
  }
  if(!['status','workspace','start','stop','trial','practice'].includes(q.op))fail('INPUT');
  if(!(keysAre(q,['op']) || (q.op==='workspace'&&keysAre(q,['op','period']))))fail('INPUT');
  if(q.period!==undefined && !(q.period.length===7 && /^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(q.period)))fail('INPUT');
  return q;
}
function lastMonth(now=new Date()){
  const d=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-1,1));return d.toISOString().slice(0,7);
}
const selectSql='SELECT developer_homologation.operate_v1($1::jsonb,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text) AS result';
async function dbCall(sql,ctx,op,tag=null,caseId=null,status=null,period=null,sha=null){
  const rows=await sql.query(selectSql,[JSON.stringify(ctx),op,tag,caseId,status,period,sha]);
  const d=(Array.isArray(rows)?rows:rows?.rows)?.[0]?.result;
  if(!plain(d)||typeof d.active!=='boolean'||typeof d.scopeToken!=='string'||!HASH.test(d.scopeToken)
    ||(d.active?(typeof d.expiresAt!=='string'||!Number.isFinite(Date.parse(d.expiresAt))):d.expiresAt!==null)) fail('UNAVAILABLE');
  return d;
}
export function createDeveloperHomologationHandler(d) {
  return async function handler(req,res){
    d.http.headers(res);
    try{
      const env=d.env??process.env;
      if(env.MUNICONTROL_DEVELOPER_HOMOLOGATION!=='enabled' || !UUID.test(env.MUNICONTROL_HOMOLOGATION_TENANT_ID||''))fail('DISABLED');
      const q=queryOf(req), post=['start','stop','trial'].includes(q.op)||(q.op==='practice'&&req.method==='POST');
      if(req.method!==(post?'POST':'GET')){res.setHeader('Allow',post?'POST':'GET');fail('METHOD');}
      let tag=null;
      if(post){
        d.http.assertOrigin(req,env);
        if(d.http.header(req,'content-type').split(';')[0].trim().toLowerCase()!=='application/json')fail('MEDIA');
        d.http.checkLength(req,MAX_BODY_BYTES);
        tag=d.http.header(req,'x-homologation-scope');
        if(typeof tag!=='string'||!HASH.test(tag))fail('SCOPE');
      }
      const access=await d.requireAccess(req,res,{env,requiredCapabilities:d.requiredCapabilities,capabilityMode:'all',requireDataPlaneReady:true,requireCertifiedDataBinding:true,allowLegacy:false});
      if(!access)return;
      const ctx=d.assertOwner(access,d.sessionFor(access,env));
      if(ctx.tenantId!==env.MUNICONTROL_HOMOLOGATION_TENANT_ID)fail('FORBIDDEN');
      let body;
      if(post){
        body=await d.readBody(req,{maxBytes:MAX_BODY_BYTES});
        if(q.op==='practice' && (!plain(body)||!['draft','approve','reject','reset'].includes(body.step)||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0||body.expectedRevision>2147483647||
            (body.step==='draft'?(typeof body.amount!=='string'||body.amount.length>30):body.amount!==null)))fail('INPUT');
        if(!keysAre(body,q.op==='start'?['reviewed']:q.op==='trial'?['caseId']:q.op==='practice'?['step','expectedRevision','amount']:[]) ||
          (q.op==='start'&&body.reviewed!==true) ||
          (q.op==='trial'&&(typeof body.caseId!=='string'||!d.cases.some(c=>c.id===body.caseId))))fail('INPUT');
      }
      const sql=await d.getSql(env);
      let data, trial;
      if(q.op==='practice'){
        data=await d.practice(sql,ctx,tag,post?body.step:'read',post?body.expectedRevision:null,post?body.amount:null);
        if(!plain(data)||data.active!==true||!HASH.test(data.scopeToken)||!Number.isFinite(Date.parse(data.expiresAt))||!plain(data.practice))fail('UNAVAILABLE');
      }else if(q.op==='trial'){
        // Validate scope before CPU-only trial and check it again atomically on receipt.
        // The application controls result.status; the request cannot supply it.
        const state=await dbCall(sql,ctx,'status');
        if(state.scopeToken!==tag)fail('SCOPE');
        if(!state.active)fail('INACTIVE');
        trial=await d.runTrial(body.caseId);
        if(!plain(trial)||trial.id!==body.caseId||!['passed','blocked','failed'].includes(trial.status))fail('UNAVAILABLE');
        const proof=createHash('sha256').update(JSON.stringify(trial)).digest('hex');
        data=await dbCall(sql,ctx,'trial',tag,body.caseId,trial.status,null,proof);
        if(typeof data.receiptId!=='string'||!UUID.test(data.receiptId))fail('UNAVAILABLE');
      }else data=await dbCall(sql,ctx,q.op,tag,null,null,q.op==='workspace'?q.period??lastMonth():null);
      if((q.op==='start'||q.op==='trial'||q.op==='workspace')&&!data.active)fail('INACTIVE');
      const base={ok:true,active:data.active,expiresAt:data.expiresAt,scopeToken:data.scopeToken,
        operatorLabel:typeof access.principal?.user?.displayName==='string' && access.principal.user.displayName.trim() ? access.principal.user.displayName.trim().slice(0,120) : (typeof ctx.actorEmail==='string' ? ctx.actorEmail.slice(0,254) : 'Propietario autenticado')};
      if(q.op==='practice')Object.assign(base,{practice:data.practice});
      if(q.op==='workspace')Object.assign(base,{cases:d.cases,readiness:data.readiness??null});
      if(q.op==='trial')Object.assign(base,{result:trial,receiptId:data.receiptId});
      return res.status(200).json(base);
    }catch(e){const key=safeError(e),[status,error]=ERRORS[key];return res.status(status).json({ok:false,code:'HOMOLOGATION_'+key,error});}
  };
}
