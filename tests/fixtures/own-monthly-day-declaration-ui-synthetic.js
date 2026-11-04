// Synthetic HTTP envelopes for real UI/model tests. No SQL or municipal data.
import {MONTHLY_DAY_DECLARATION_VERSION,MONTHLY_DAY_DECLARATION_POLICY_VERSION,monthlyDayDeclarationCommand,monthlyDayDeclarationHash} from '../../assets/own-monthly-day-declaration-model.js';
import {syntheticParticipationBootstrap,participationIds} from './own-period-participation-synthetic.js';
import {roster as rosterFixture} from './native-roster-synthetic.js';
export const monthlyDayUiId=n=>'cccccccc-0000-4000-8000-'+String(n).padStart(12,'0');
export function monthlyDayUiFixture({period='2026-10',fullPeriod=true}={}){
 const original=syntheticParticipationBootstrap();original.source.subject.legajo=rosterFixture(1).rows[0].legajo;original.period=period;original.source.period=period;original.source.fullPeriod=fullPeriod;
 const generic=structuredClone(original);generic.configuration={version:'b'.repeat(64),revision:1,definition:{recognizedUnits:'7',baseUnits:'12',asOfDate:period+'-01',documentReference:'Fracción genérica exclusivamente sintética QA'},proposalId:monthlyDayUiId(80),approvalId:monthlyDayUiId(81),identityToken:original.source.subject.identityToken,sourceVersion:original.source.version};
 const state={actor:'maker',caps:['workforce.employee.read','payroll.parameter.read','payroll.parameter.prepare','payroll.parameter.approve'],boot:{...original,version:MONTHLY_DAY_DECLARATION_VERSION},generic,unavailable:null,authStatus:null};
 const hooks={},requests=[],ledger=new Map(),proposals=new Map();let counter=0,authCount=0;
 const roster=()=>{const r=rosterFixture(1),subject=state.boot.source.subject;r.version='native-roster.v2';r.counts.unknown=0;r.rows=r.rows.map(row=>({...row,contractId:subject.contractId,registrationId:subject.registrationId,legajo:subject.legajo,name:subject.employeeName,recordKind:'hire'}));return r;};
 const auth=async()=>{await hooks.auth?.(++authCount);return{ok:true,authenticated:true,sessionVersion:2,user:{id:state.actor,email:state.actor+'@example.invalid'},access:{context:'tenant',tenant:{id:roster().scope.tenantId,roleKey:'QA'},tenantCapabilities:state.caps},expiresAt:'2099-12-31T00:00:00Z'};};
 const bootstrap=()=>{const b=structuredClone(state.boot);b.permissions.canReview=state.actor==='checker';b.proposals=b.proposals.map(p=>({...p,canReview:state.actor==='checker'&&p.status==='pending'}));return b;};
 async function detail(id){const saved=proposals.get(id);if(!saved)throw Object.assign(Error('Propuesta sintética no encontrada'),{status:404});const b=bootstrap(),p=b.proposals.find(p=>p.id===id),d={version:MONTHLY_DAY_DECLARATION_VERSION,scopeVersion:saved.body.scopeVersion,proposal:p,body:structuredClone(saved.body),baseDefinition:structuredClone(saved.baseDefinition),source:structuredClone(saved.source),current:saved.body.baseVersion===b.configuration.version&&saved.body.sourceVersion===b.source.version};await hooks.detail?.(d);return d;}
 async function command(body,key){monthlyDayDeclarationCommand(body);await hooks.beforeSend?.(body,key);if(ledger.has(key)){const saved=ledger.get(key);if(JSON.stringify(saved.body)!==JSON.stringify(body))throw Object.assign(Error('La clave sintética corresponde a otro cuerpo'),{status:409});return{...structuredClone(saved),replayed:true};}
  const b=state.boot,pid=body.command==='propose'?monthlyDayUiId(++counter):body.proposalId,event=body.command==='propose'?pid:monthlyDayUiId(1000+counter),status=body.command==='propose'?'pending':body.command==='approve'?'approved':'rejected',revision=body.command==='approve'?b.configuration.revision+1:b.configuration.revision,configurationVersion=body.command==='approve'?'e'.repeat(64):body.baseVersion;
  const receipt={version:MONTHLY_DAY_DECLARATION_VERSION,eventId:event,proposalId:pid,requestKey:key,requestSha256:await monthlyDayDeclarationHash(body),body:structuredClone(body),status,revision,configurationVersion,replayed:false,payrollCalculated:false,payrollPosted:false};
  if(body.command==='propose'){b.proposals.push({id:pid,requestSha256:receipt.requestSha256,baseVersion:body.baseVersion,sourceVersion:body.sourceVersion,reason:body.reason,createdAt:period+'-16T12:00:00Z',authorLabel:'Maker exclusivamente sintético',canReview:false,status:'pending',decision:null});proposals.set(pid,{body:structuredClone(body),baseDefinition:structuredClone(b.configuration.definition),source:structuredClone(b.source)});}
  else{const p=b.proposals.find(p=>p.id===pid);p.status=status;p.canReview=false;p.decision={command:body.command,reason:body.reason,actorLabel:'Checker exclusivamente sintético',recordedAt:period+'-16T13:00:00Z',revision};if(body.command==='approve')b.configuration={version:configurationVersion,revision,definition:structuredClone(proposals.get(pid).body.definition),proposalId:pid,approvalId:event,identityToken:b.source.subject.identityToken,sourceVersion:b.source.version};}
  ledger.set(key,structuredClone(receipt));await hooks.afterCommit?.(receipt);return receipt;
 }
 async function fetch(url,options={}){
  const method=options.method??'GET',u=new URL(url,'https://monthly-day-ui.test'),request={url:u.pathname+u.search,method,body:options.body??null,key:options.headers?.['Idempotency-Key']??options.headers?.['idempotency-key']??null};requests.push(request);
  // The auth transport hook may reject or return malformed bytes, like a real read.
  if(u.pathname==='/api/internal-auth'&&hooks.authorityResponse)return await hooks.authorityResponse();
  let data,status=200;try{
   if(u.pathname==='/api/internal-auth'){if(state.authStatus)throw Object.assign(Error('Acceso sintético no disponible'),{status:state.authStatus});data=await auth();}
   else if(u.pathname==='/api/internal-data'&&u.searchParams.get('resource')==='nativeroster')data={ok:true,data:roster()};
   else if(u.pathname==='/api/internal-own-period-participation'){if(method!=='GET'||u.searchParams.get('resource')!=='bootstrap')throw Error('La prueba de días no modifica el contrato genérico157');data={ok:true,data:structuredClone(state.generic)};}
   else if(u.pathname==='/api/internal-own-monthly-day-declaration'){
    if(state.unavailable)throw Object.assign(Error('Declaración de días sintética no disponible'),{status:state.unavailable});
    if(method==='POST'){const envelope=JSON.parse(request.body);if(envelope.operation!=='command'||Object.keys(envelope).length!==2)throw Error('Operación tipada no canónica');data={ok:true,data:await command(envelope.payload,request.key)};}
    else if(u.searchParams.get('resource')==='bootstrap'){const b=bootstrap();await hooks.bootstrap?.(b);data={ok:true,data:b};}
    else if(u.searchParams.get('resource')==='detail')data={ok:true,data:await detail(u.searchParams.get('id'))};
    else if(u.searchParams.get('resource')==='attempt'){const key=u.searchParams.get('key');await hooks.attempt?.(key);if(!ledger.has(key))throw Object.assign(Error('El intento sintético no está registrado'),{status:404,code:'MONTHLY_DAY_DECLARATION_NOT_FOUND'});const r={...structuredClone(ledger.get(key)),replayed:true};await hooks.receipt?.(r);data={ok:true,data:r};}
    else throw Error('Recurso tipado no canónico');
   }else throw Error('Canal ajeno al flujo de días sintético: '+u.pathname);
  }catch(error){status=error.status??503;data={ok:false,code:error.code??'SYNTHETIC_DAY_UNAVAILABLE',error:error.message};}
  return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 }
 const definition=(recognizedDays='16',fullMonthDeclared=false)=>({recognizedDays,baseDays:'30',unit:'days',policyVersion:MONTHLY_DAY_DECLARATION_POLICY_VERSION,fullMonthDeclared,asOfDate:period+'-01',documentReference:'Constancia de días exclusivamente sintética QA'});
 return{state,hooks,requests,ledger,proposals,bootstrap,detail,fetch,roster,definition,ids:participationIds};
}
