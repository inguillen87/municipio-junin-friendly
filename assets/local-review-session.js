// Local document authorization metadata only; never receives a document, filename or source hash.
export function localReviewSession(payload,{expectedContext=null,now=Date.now()}={}){
 const deny=status=>{throw Object.assign(new Error('LOCAL_REVIEW_SESSION_REQUIRED'),{status});};
 if(payload?.ok!==true||payload.authenticated!==true||payload.sessionVersion!==2)deny(401);
 if(!Array.isArray(payload.access?.tenantCapabilities)||!payload.access.tenantCapabilities.includes('lineage.read'))deny(403);
 const user=payload.user?.id,tenant=payload.access?.tenant?.id;
 if(typeof user!=='string'||!user||user.length>256||typeof tenant!=='string'||!tenant||tenant.length>256)deny(401);
 const expiresAt=typeof payload.expiresAt==='string'?Date.parse(payload.expiresAt):NaN;
 if(!Number.isFinite(expiresAt)||!Number.isFinite(now)||expiresAt<=now)deny(401);
 const role=payload.access.tenant.roleKey,membership=payload.access.tenant.membershipId;
 if(role!=null&&typeof role!=='string'||membership!=null&&typeof membership!=='string')deny(401);
 const context=JSON.stringify([user,tenant,membership??null,role??null]);
 if(expectedContext!==null&&context!==expectedContext)deny(403);
 return Object.freeze({context,expiresAt});
}
