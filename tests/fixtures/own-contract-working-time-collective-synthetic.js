import {workingTimeHash} from '../../assets/own-contract-working-time-model.js';
export const id=n=>'aaaaaaaa-0000-4000-8000-'+String(n).padStart(12,'0');
const hash=n=>String(n).padStart(64,'0');
export function collectiveFixture(count=3){
 const source=Array.from({length:count},(_,i)=>({contractId:id(i+1),registrationId:id(i+2001),legajo:'QA-'+(i+1),definition:{dailyHours:'7.50000001',monthlyHours:i===0?'0':'160.250',asOfDate:'2026-10-14',documentReference:'Constancia sintética de jornada; no fuente municipal real.'},proposalId:null}));
 const file={version:'own-contract-working-time-collective.v1',period:'2026-10',scope:'all_active',total:count,records:source};
 const boots=new Map(source.map((r,i)=>[r.contractId,{version:'own-contract-working-time.v1',contractId:r.contractId,period:file.period,scopeVersion:hash(i+101),source:{version:hash(i+201),subject:{contractId:r.contractId,registrationId:r.registrationId,legajo:r.legajo,employeeName:null,identityToken:hash(i+301),sourceCutoff:null,origin:'MUNICONTROL',registeredAt:'2026-10-01T12:00:00Z'}},configuration:{version:hash(i+401),revision:0,definition:null,proposalId:null,approvalId:null,identityToken:null},proposals:[],permissions:{canPropose:true,canReview:false},complete:true,payrollCalculated:false,payrollPosted:false} ]));
 const ledger=new Map(),proposals=new Map(),writes=[],reads=[],hooks={};let actor='maker',visible=true,keys=0,rosterReads=0;
 const roster=()=>({version:'native-roster.v2',origin:'MUNICONTROL',complete:true,today:'2026-10-16',queriedAt:'2026-10-16T12:00:00Z',scope:{tenantId:id(9001),membershipId:actor==='maker'?id(9002):id(9003),bindingId:id(9004),companyId:7},filters:{search:'',status:'all',jurisdiction:'',organization:'',sector:'',agreement:''},total:count,people:count,counts:{active:count,pending_start:0,inactive:0,state_error:0,unknown:0},facets:{organization:[],sector:[],agreement:[]},rows:source.map(r=>({contractId:r.contractId,registrationId:r.registrationId,legajo:r.legajo,name:null,dni:null,cuil:null,sexCode:null,birthDate:null,startDate:'2026-09-01',endDate:null,status:'active',jurisdictionCode:null,agreement:null,category:null,organization:null,sector:null,jobTitle:null,legalReference:null,registeredAt:'2026-10-01T12:00:00Z',recordKind:'adopted'})),snapshot:hash(999)});
 const bootstrap=contractId=>{const b=structuredClone(boots.get(contractId));b.permissions.canReview=actor==='checker';b.proposals=b.proposals.map(p=>({...p,canReview:actor==='checker'&&p.status==='pending'}));return b;};
 const io={
  async authorize(){await hooks.auth?.();return{ok:true,authenticated:true,sessionVersion:2,user:{id:actor,email:actor+'@example.invalid'},access:{context:'tenant',tenant:{id:id(9001),roleKey:'QA'},tenantCapabilities:hooks.caps??['workforce.employee.read','payroll.parameter.read','payroll.parameter.prepare','payroll.parameter.approve']},expiresAt:'2099-12-31T00:00:00Z'};},
  async readRoster(){reads.push({type:'roster'});const r=roster();await hooks.roster?.(r,++rosterReads);return r;},
  async readBootstrap(contractId){reads.push({type:'bootstrap',contractId});const b=bootstrap(contractId);await hooks.bootstrap?.(b);return b;},
  async readDetail(proposalId){reads.push({type:'detail',proposalId});const p=proposals.get(proposalId),b=bootstrap(p.body.contractId);const d={version:'own-contract-working-time.v1',scopeVersion:p.body.scopeVersion,proposal:b.proposals.find(x=>x.id===proposalId),body:structuredClone(p.body),baseDefinition:p.baseDefinition,source:b.source,current:true};await hooks.detail?.(d);return d;},
  async sendCommand(attempt){
   writes.push(structuredClone(attempt));await hooks.beforeSend?.(attempt);
   if(ledger.has(attempt.key))return {...structuredClone(ledger.get(attempt.key)),replayed:true};
   const body=attempt.body,b=boots.get(body.contractId),n=source.findIndex(r=>r.contractId===body.contractId)+1;
   const pid=body.command==='propose'?id(10000+n):body.proposalId,eventId=body.command==='propose'?pid:id(20000+n);
   const r={version:'own-contract-working-time.v1',eventId,proposalId:pid,requestKey:attempt.key,requestSha256:await workingTimeHash(body),body:structuredClone(body),status:body.command==='propose'?'pending':body.command==='approve'?'approved':'rejected',revision:body.command==='approve'?1:0,configurationVersion:body.command==='approve'?hash(70000+n):body.baseVersion,replayed:false,payrollCalculated:false,payrollPosted:false};
   if(body.command==='propose'){const p={id:pid,requestSha256:r.requestSha256,baseVersion:body.baseVersion,sourceVersion:body.sourceVersion,reason:body.reason,createdAt:'2026-10-16T12:00:00Z',authorLabel:'Maker sintético',canReview:false,status:'pending',decision:null};b.proposals.push(p);proposals.set(pid,{body:structuredClone(body),baseDefinition:structuredClone(b.configuration.definition)});}
   else{const p=b.proposals.find(x=>x.id===pid);p.status=r.status;p.canReview=false;p.decision={command:body.command,reason:body.reason,actorLabel:'Checker sintético',recordedAt:'2026-10-16T13:00:00Z',revision:r.revision};if(body.command==='approve')b.configuration={version:r.configurationVersion,revision:1,definition:structuredClone(proposals.get(pid).body.definition),proposalId:pid,approvalId:eventId,identityToken:b.source.subject.identityToken};}
   ledger.set(attempt.key,structuredClone(r));await hooks.afterSend?.(r);return r;
  },
  async readAttempt(key){reads.push({type:'attempt',key});await hooks.attempt?.(key);if(!ledger.has(key))throw Object.assign(Error('Intento sintético no encontrado'),{status:404,code:'WORKING_TIME_NOT_FOUND'});return {...structuredClone(ledger.get(key)),replayed:true};},
  newKey:()=>id(50000+(++keys)),isVisible:()=>visible,changed:()=>{}
 };
 return{file,io,boots,hooks,writes,reads,ledger,proposals,roster,bootstrap,setActor:v=>{actor=v;},setVisible:v=>{visible=v;}};
}
