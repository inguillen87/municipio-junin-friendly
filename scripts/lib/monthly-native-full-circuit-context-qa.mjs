// Actual canonical190 IAM + the enclosing monthly runner's guarded transactions.
// This file creates no database process or independent SQL transport.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {ownerProgramQaAccess,ownerProgramQaAccessSql} from './municipal-owner-program-qa.mjs';
import {monthlyFixedQaRpc} from './own-monthly-day-fixed-composition-qa.mjs';
import {noeliaNativeEmployeeStatement,noeliaCircuitRosterRead,noeliaCircuitDirectoryRead} from './noelia-payroll-circuit-qa.mjs';
import {createNativeBankQaSql} from './native-employee-bank-tail-qa.mjs';
import {createNativeAccountingQaSql} from './native-employee-accounting-tail-qa.mjs';
import {createOwnNoveltyHandler} from '../../api/internal-own-payroll-novelties.js';
import {createOwnBankAccountsHandler} from '../../api/internal-own-bank-accounts.js';
import {createOwnAccountingHandler} from '../../api/internal-own-payroll-accounting.js';
import {createOwnImputationHandler} from '../../api/internal-own-payroll-imputation.js';
import {createOwnJournalHandler} from '../../api/internal-own-payroll-journal.js';
import {createEmploymentCatalogHandler} from '../../api/internal-employment-catalog.js';
import {createInternalDataHandler} from '../../api/internal-data.js';
import {createNoeliaCircuitBrowser} from './noelia-payroll-circuit-browser.mjs';

const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
const noveltyFacades=new Map([
 ['SELECT public.own_novelty_bootstrap_v1($1::jsonb) AS result',1],
 ['SELECT public.own_novelty_detail_v1($1::jsonb,$2::uuid) AS result',2],
 ['SELECT public.own_novelty_attempt_v1($1::jsonb,$2::uuid) AS result',2],
 ['SELECT public.own_novelty_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result',3]
]);
export async function bindMonthlyNativeFullCircuitContext({qa,tailPlan,sourceCommit,read,json,nativeJson,handlers,env,output,check,setRawActor}){
 for(const value of [read,json,nativeJson,setRawActor])assert.equal(typeof value,'function');
 const rawMaker=qa.actor,rawChecker=qa.checker;
 const identity=raw=>{const access=ownerProgramQaAccess(json([ownerProgramQaAccessSql(qa.schema,raw)],{readOnly:true}),raw);return{principal:access.principal,session:{...access.session,releaseSha:raw.releaseSha}};};
 const maker=identity(rawMaker),checker=identity(rawChecker);let current=maker;
 const rawActor=wrapped=>{const id=wrapped?.principal?.tenant?.membershipId,raw=id===rawMaker.membershipId?rawMaker:id===rawChecker.membershipId?rawChecker:null;assert.ok(raw,'JOINT_FOREIGN_ACTOR');assert.equal(wrapped.principal.tenant.id,raw.tenantId);assert.equal(wrapped.principal.user.email,raw.actorEmail);assert.equal(wrapped.session.id,raw.actorSessionId);assert.equal(wrapped.session.version,raw.actorSessionVersion);assert.equal(wrapped.session.releaseSha,raw.releaseSha);return raw;};
 const setCurrent=wrapped=>{const raw=rawActor(wrapped);current=wrapped;setRawActor(raw);};
 const getCurrent=()=>current;
 const connections=[];
 const db={connections,run(sql,runtime=false,options={}){assert.equal(typeof sql,'string');const packet=nativeJson(sql,{...options,runtime});assert.equal(packet.connection.backendPid>0,true);assert.equal(packet.connection.database,'own_payroll_run_qa');assert.equal(packet.connection.role,runtime?'municontrol_actions_runtime_app':'postgres');assert.equal(packet.connection.isolation,runtime?'read committed':'repeatable read');assert.equal(packet.connection.readOnly,options.readOnly?'on':'off');connections.push(packet.connection);return packet.result;},async query(text,values){
  const native=noeliaNativeEmployeeStatement(text,values,qa.schema);if(native)return[{result:db.run(native,true)}];
  const roster=noeliaCircuitRosterRead(text,values,qa.schema);if(roster)return db.run(roster,true,{allowArray:true});
  const directory=noeliaCircuitDirectoryRead(text,values,qa.schema);if(directory){const result=db.run(directory.sql,directory.runtime,{allowArray:directory.rows});return directory.rows?result:[{result}];}
  if(noveltyFacades.has(text)){assert.ok(Array.isArray(values)&&values.length===noveltyFacades.get(text)&&values.every(value=>typeof value==='string'));const sql=text.replace('public.',qa.schema+'.').replace(/\$(\d+)\b/g,(_,n)=>literal(values[Number(n)-1]));return[{result:db.run(sql,true)}];}
  return[{result:db.run(qa.normalized(monthlyFixedQaRpc(text,values,qa.schema)),true)}];
 }};
 assert.equal(tailPlan.schema,qa.schema);assert.equal(tailPlan.sourceCommit,sourceCommit);assert.equal(typeof tailPlan.normalized,'function');
 const facadeQa={schema:qa.schema,normalized:tailPlan.normalized,ids:qa.qa192.ids,monthlyNativeTailInstallation:tailPlan};
 const authorize=()=>{const raw=rawActor(current);return ownerProgramQaAccess(json([ownerProgramQaAccessSql(qa.schema,raw)],{readOnly:true}),raw);};
 const deps={env,requireAccess:authorize,sessionFor:()=>current.session,getSql:()=>db};
 const oldHandlers={...handlers},directoryFailures=[],oldEnv={...env};
 const binding=maker.principal.tenant.sourceBindings.find(value=>value.verified===true);assert.ok(binding);env.FRIENDLY_GRH_SOURCE_DATABASE=binding.database;env.FRIENDLY_GRH_COMPANY_ID=String(binding.companyId);
 handlers.novelty=createOwnNoveltyHandler(deps);
 handlers.catalog=createEmploymentCatalogHandler(deps);
 handlers.directory=createInternalDataHandler({env,requireCompatibleInternalAccess:authorize,actionMutationSession:()=>current.session,getInternalSql:()=>db,getActionCenterSql:()=>db,reportReadFailure:error=>directoryFailures.push(error)});
 handlers.bankAccounts=createOwnBankAccountsHandler({...deps,getSql:()=>createNativeBankQaSql(db,facadeQa)});
 const accountingDb=createNativeAccountingQaSql(db,facadeQa);
 for(const[k,create]of[['accounting',createOwnAccountingHandler],['imputation',createOwnImputationHandler],['journal',createOwnJournalHandler]])handlers[k]=create({...deps,getSql:()=>accountingDb});
 setCurrent(maker);
 const browserQa=await createNoeliaCircuitBrowser({handlers,env,getCurrent,qa:facadeQa,output,check,browserName:'chromium'});
 const routes={novelty:'/api/internal-own-payroll-novelties',program:'/api/internal-own-payroll-program',run:'/api/internal-own-payroll-run',liquidation:'/api/internal-own-payroll-liquidation',close:'/api/internal-own-payroll-close',receipt:'/api/internal-own-payroll-receipts',monthly:'/api/internal-own-monthly-day-declaration'};
 const api=async(kind,query=null,body=null,key,expected=200)=>{assert.ok(Object.hasOwn(routes,kind));const url=new URL(routes[kind],browserQa.origin);if(query)for(const[k,v]of Object.entries(query))url.searchParams.set(k,v);const response=await fetch(url,{method:body?'POST':'GET',headers:body?{Origin:browserQa.origin,'Content-Type':'application/json','Idempotency-Key':key??randomUUID()}:{},...(body?{body:JSON.stringify({operation:kind==='run'?'calculate':'command',payload:body})}:{})});const value=await response.json();assert.ok((Array.isArray(expected)?expected:[expected]).includes(response.status),JSON.stringify(value));if(response.status>=400)return value;assert.equal(value.ok,true);return value.data;};
 return{qa:facadeQa,db,maker,checker,getCurrent,setCurrent,rawActor,rawMaker,rawChecker,browserQa,api,origin:browserQa.origin,directoryFailures,handlers,env,async close(){try{await browserQa.close();assert.deepEqual(directoryFailures,[]);}finally{for(const key of Object.keys(handlers))if(!Object.hasOwn(oldHandlers,key))delete handlers[key];Object.assign(handlers,oldHandlers);for(const key of Object.keys(env))if(!Object.hasOwn(oldEnv,key))delete env[key];Object.assign(env,oldEnv);setRawActor(rawMaker);}}};
}
