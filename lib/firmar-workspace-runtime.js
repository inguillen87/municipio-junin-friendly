import {createHash} from 'node:crypto';
import {requireCompatibleInternalAccess} from './internal-access-gateway.js';
import {getTenantIdentitySql,takeIdentityRateLimit} from './internal-identity-access.js';
import {firmarDirectReadiness} from './firmar-direct-provider.js';
import {createFirmarWorkspaceHandler,createFirmarWorkspaceRepository} from './firmar-workspace.js';
async function restrictedSql(env){if(!env.ACTIONS_DATABASE_URL)throw Error('FIRMAR_RUNTIME_REQUIRED');return getTenantIdentitySql(env);}
export function createFirmarWorkspaceRuntime({env=process.env,requireAccess=requireCompatibleInternalAccess,getSql=restrictedSql,limit=takeIdentityRateLimit}={}){
 return createFirmarWorkspaceHandler({env,
  authorize:(req,res)=>requireAccess(req,res,{env,allowLegacy:false,requiredCapabilities:[],requireDataPlaneReady:false,requireCertifiedDataBinding:false}),
  repositoryFor:async()=>createFirmarWorkspaceRepository(await getSql(env)),
  takeBudget:key=>getSql(env).then(sql=>limit(sql,'firmar.workspace',createHash('sha256').update('firmar-workspace-v1:'+key).digest('hex'),{limit:60,windowSeconds:60,blockSeconds:60})),
  signingReady:()=>env.FIRMAR_ENVIRONMENT==='test'&&firmarDirectReadiness(env).configured===true
 });
}
