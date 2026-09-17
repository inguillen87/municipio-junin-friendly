import {AttendanceGatewayError} from './internal-attendance-gateway.js';
import {assertClockFleet} from '../assets/clock-fleet-model.js';
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const fail=(code,status,message)=>{throw new AttendanceGatewayError(code,status,message);};
export async function getClockFleet(sql,principal,session){
 const t=principal?.tenant,email=principal?.user?.email;
 if(typeof email!=='string'||!email||email!==email.trim().toLowerCase()||t?.source!=='membership'||!uuid.test(t.id||'')||!uuid.test(t.membershipId||'')||!uuid.test(session?.id||'')||session.email!==email||!Number.isSafeInteger(session.version)||session.version<1||!/^[a-f0-9]{40}$/.test(session.releaseSha||'')||session.releaseSha!==t.certifiedReleaseSha)fail('CLOCK_FLEET_SESSION_REQUIRED',401,'Ingresá con una sesión municipal vigente.');
 try{
  const r=await sql.query('SELECT public.attendance_clock_fleet_v1($1::text,$2::uuid,$3::int,$4::text,$5::uuid,$6::uuid) AS result',[email,session.id,session.version,session.releaseSha,t.id,t.membershipId]);
  return assertClockFleet((Array.isArray(r)?r:r?.rows)?.[0]?.result);
 }catch(e){
  if(e instanceof AttendanceGatewayError)throw e;
  const message=String(e?.message||'');
  if(/SESSION_(?:INVALID|REQUIRED)|SESSION_VERSION/.test(message))fail('CLOCK_FLEET_SESSION_REQUIRED',401,'La sesión cambió. Ingresá nuevamente.');
  if(/CAPABILITY|AUTHORITY|MEMBERSHIP/.test(message))fail('CLOCK_FLEET_FORBIDDEN',403,'Tu perfil no permite consultar esta recepción.');
  fail('CLOCK_FLEET_UNAVAILABLE',503,'No se pudo verificar la recepción por equipo. No se sustituyen datos faltantes por cero.');
 }
}
