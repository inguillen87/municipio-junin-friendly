// Source proposal. One identity per genuine SDK client; no SDK wrapper or query here.
export const ACTION_RUNTIME_ROLE='municontrol_actions_runtime_app';
export const ACTION_RUNTIME_IDENTITY_SQL=`
          SELECT current_user AS "currentUser", session_user AS "sessionUser",
            current_setting('server_version_num')::integer/10000 AS major,
            current_setting('neon.project_id',true) AS "projectId",
            current_setting('neon.branch_id',true) AS "branchId",
            current_setting('neon.endpoint_id',true) AS "endpointId",
            current_database() AS database
        `;
const DESTINATION_KEYS=Object.freeze(['major','projectId','branchId','endpointId','database']);
const identities=new WeakMap();
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===[...keys].sort().join('|');
const destinationError=()=>Object.assign(new Error('No se verificó el destino admitido del lector histórico.'),{code:'ACTION_DATABASE_DESTINATION_REQUIRED'});
const destinationValid=v=>exact(v,DESTINATION_KEYS)&&[17,18].includes(v.major)&&DESTINATION_KEYS.slice(1).every(k=>typeof v[k]==='string'&&v[k].length>0&&v[k]===v[k].trim());
export function actionRuntimeDestinationFromTarget(target){
 if(!exact(target,[...DESTINATION_KEYS,'role'])||typeof target.role!=='string'||!target.role)throw destinationError();
 const result=Object.fromEntries(DESTINATION_KEYS.map(key=>[key,target[key]]));
 if(!destinationValid(result))throw destinationError();return Object.freeze(result);
}
export function recordActionRuntimeIdentity(sql,identity){
 if((typeof sql!=='function'&&(!sql||typeof sql!=='object'))||identity?.currentUser!==ACTION_RUNTIME_ROLE||identity?.sessionUser!==ACTION_RUNTIME_ROLE){
  throw Object.assign(new Error('Se requiere el rol runtime aislado del centro de acciones.'),{code:'ACTION_DATABASE_ROLE_REQUIRED'});
 }
 // Role-only legacy mocks remain valid when no destination is requested. A later
 // request with a destination rejects absent metadata rather than filling it in.
 identities.set(sql,Object.freeze(Object.fromEntries(['currentUser','sessionUser',...DESTINATION_KEYS].map(key=>[key,identity[key]]))));return sql;
}
export function assertActionRuntimeDestination(sql,expectedDestination=null){
 if(expectedDestination===null)return sql;
 if(!destinationValid(expectedDestination))throw destinationError();const actual=identities.get(sql);
 if(!actual||actual.currentUser!==ACTION_RUNTIME_ROLE||actual.sessionUser!==ACTION_RUNTIME_ROLE||DESTINATION_KEYS.some(key=>actual[key]!==expectedDestination[key]))throw destinationError();
 return sql;
}
