// A URL expresses a read intention only. Authority and all decisions remain in
// the existing authenticated queue/detail/command circuit.
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const invalid=()=>{throw Error('El enlace de revisión no es válido. Abrí nuevamente las propuestas desde Personas.');};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===[...keys].sort().join('|');
export const MUNICIPAL_ADOPTION_PENDING_HREF='/personal?adopcion=pendientes#legajos';
export function municipalAdoptionReviewHref(proposalId){if(!uuid(proposalId))invalid();return '/personal?adopcion='+proposalId.toLowerCase()+'#legajos';}
export function shortMunicipalAdoptionId(proposalId){if(!uuid(proposalId))invalid();return proposalId.slice(0,8).toLowerCase()+'…'+proposalId.slice(-8).toLowerCase();}
export function parseMunicipalAdoptionNavigation(href){
 let url;try{url=new URL(href,'https://municontrol.invalid/');}catch{invalid();}
 if(!url.searchParams.has('adopcion'))return null;
 if(!/^https?:$/.test(url.protocol)||url.username||url.password||!['/personal','/internal-dashboard.html','/internal-dashboard','/internal','/rrhh'].includes(url.pathname)||url.hash!=='#legajos')invalid();
 const entries=[...url.searchParams];if(entries.length!==1||entries[0][0]!=='adopcion')invalid();const value=entries[0][1];
 if(value==='pendientes')return Object.freeze({kind:'pending'});
 if(uuid(value))return Object.freeze({kind:'proposal',proposalId:value.toLowerCase()});invalid();
}
function verifiedIntent(value){
 if(exact(value,['kind'])&&value.kind==='pending')return value;
 if(exact(value,['kind','proposalId'])&&value.kind==='proposal'&&uuid(value.proposalId))return value;
 invalid();
}
export function resolveMunicipalAdoptionNavigation(queue,intent){
 verifiedIntent(intent);
 // The caller must first validate municipalAdoptionQueue, including its scope.
 // These bounded checks keep a malformed or duplicate navigation target closed.
 if(!queue||queue.version!=='municipal-adoption-operator.v1'||!Array.isArray(queue.rows)||queue.rows.length!==queue.total||queue.total>500)invalid();
 const ids=new Set();for(const row of queue.rows){const id=row?.proposal?.proposalId;if(!uuid(id)||ids.has(id.toLowerCase())||typeof row.independent!=='boolean'||!['pending','approved','rejected'].includes(row.proposal.status))invalid();ids.add(id.toLowerCase());}
 if(intent.kind==='proposal'){
  const row=queue.rows.find(row=>row.proposal.proposalId.toLowerCase()===intent.proposalId.toLowerCase());
  return Object.freeze(!row?{kind:'unavailable'}:!row.independent?{kind:'own',proposalId:row.proposal.proposalId}:{kind:'review',proposalId:row.proposal.proposalId});
 }
 const pending=queue.rows.filter(row=>row.proposal.status==='pending'),reviewable=pending.filter(row=>row.independent);
 if(reviewable.length===1)return Object.freeze({kind:'review',proposalId:reviewable[0].proposal.proposalId});
 return Object.freeze({kind:'list',reason:reviewable.length>1?'multiple':pending.length?'own':'none'});
}
