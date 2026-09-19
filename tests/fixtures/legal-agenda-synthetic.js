// Synthetic legal tasks only; never used as production fallback.
import {createHash} from 'node:crypto';
export const AGENDA_DAY='2026-09-19';
export function agendaFixture(n=61){
 const rows=Array.from({length:n},(_,i)=>({id:`${String(i+1).padStart(8,'0')}-1111-4111-8111-111111111111`,
  normId:`${String(i%3+1).padStart(8,'0')}-2222-4222-8222-222222222222`,normVersion:1,currentNormVersion:i%2?1:2,
  version:1,title:`Revisar antecedente ${String(i+1).padStart(3,'0')}`,dueDate:['2026-09-18','2026-09-19','2026-09-20','','2026-09-18','2026-09-19'][i%6],
  status:i%6===4?'done':i%6===5?'cancelled':'open',recordedAt:'2026-09-19T00:00:00+00:00',
  norm:{kind:'ordenanza',number:String(9000+i%3),year:1990,issuer:'HCD',title:`Ordenamiento sintético ${i%3+1}`}}));
 const revision=createHash('sha256').update(JSON.stringify(rows)).digest('hex');
 return {version:'legal-followup-agenda.v1',today:AGENDA_DAY,timezone:'America/Argentina/Mendoza',observedAt:'2026-09-19T20:00:00Z',canManage:true,limit:1000,total:n,rows,revision};
}
