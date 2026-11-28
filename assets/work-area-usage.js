// Cuántas veces usa cada persona cada acceso del menú, para mostrarle primero «Lo que más usás».
// Decisión del propietario (24/11/2026): el menú se ordena según el uso de cada empleado. Sólo se guardan contadores
// por acceso (archivo, sección o tarea) en este navegador, separados por usuario; nada de personas ni liquidaciones.
// Si el navegador no permite guardar, el menú sigue igual sin la sección.
const store=()=>{try{return globalThis.localStorage??null;}catch{return null;}};
const key=user=>'mc.work.usage.v1:'+String(user||'local').slice(0,80);
export function readWorkUsage(user){const s=store();if(!s)return {};try{const v=JSON.parse(s.getItem(key(user))||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch{return {};}}
export function countWorkUse(user,access){if(typeof access!=='string'||!access||access.length>200)return;const s=store();if(!s)return;const u=readWorkUsage(user);u[access]=Math.min((Number(u[access])||0)+1,1e6);
 const keys=Object.keys(u);if(keys.length>200)for(const k of keys.sort((a,b)=>u[a]-u[b]).slice(0,keys.length-200))delete u[k];try{s.setItem(key(user),JSON.stringify(u));}catch{}}
