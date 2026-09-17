// Application wiring for the TEST-provider pilot. Session and SQL privileges are
// inherited from the municipal identity gateway; no employment/GRH binding needed.
import {createHash} from 'node:crypto';
import {requireCompatibleInternalAccess} from './internal-access-gateway.js';
import {getTenantIdentitySql,takeIdentityRateLimit} from './internal-identity-access.js';
import {createFirmarPgRepository} from './firmar-durable-repository.js';
import {createFirmarDurableService} from './firmar-durable-service.js';
import {createFirmarHttpHandlers} from './firmar-http.js';
async function restrictedSql(env){if(!env.ACTIONS_DATABASE_URL)throw Error('FIRMAR_RUNTIME_REQUIRED');return getTenantIdentitySql(env);}
export function createFirmarRuntime({env=process.env,requireAccess=requireCompatibleInternalAccess,getSql=restrictedSql,limit=takeIdentityRateLimit,providerFetch=fetch}={}){
 return createFirmarHttpHandlers({env,
  authorize:(req,res)=>requireAccess(req,res,{env,allowLegacy:false,requiredCapabilities:[],requireDataPlaneReady:false,requireCertifiedDataBinding:false}),
  serviceFor:async()=>createFirmarDurableService({repository:createFirmarPgRepository(await getSql(env)),env,fetchImpl:providerFetch}),
  takeBudget:async(scope,key)=>limit(await getSql(env),'firmar.http.'+scope,createHash('sha256').update('firmar-http-v1:'+scope+':'+key).digest('hex'),{limit:60,windowSeconds:60,blockSeconds:60})
 });
}
