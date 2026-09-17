// Uses the real reconstruction and new read facade; contains no municipal records.
import {createHash} from 'node:crypto';
import {continuousWorkdayFixture,workdayQuery} from './continuous-workdays-synthetic.js';
import {getAttendancePreparte} from '../../lib/internal-attendance-workdays.js';
export const PREPARTE_PRINCIPAL={user:{email:'qa@example.test'},tenant:{source:'membership',id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',membershipId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',certifiedReleaseSha:'a'.repeat(40)}};
export const PREPARTE_SESSION={id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',email:'qa@example.test',version:1,releaseSha:'a'.repeat(40)};
export async function preparteSynthetic({changed=false,newReceipt=false,evidence}={}){
  const raw=await continuousWorkdayFixture(workdayQuery({from:'2026-09-01',to:'2026-09-30'}),{rawOnly:true});
  const end=raw.events.find(e=>e.legajo==='9001'&&e.code===5);
  end.occurredAt=end.occurredAt.replace('17:00','19:'+(changed?'15':'00'));
  end.localTimestamp=end.localTimestamp.replace('17:00','19:'+(changed?'15':'00'));
  const person=raw.events.find(e=>e.legajo==='9002'),extra=raw.events.filter(e=>e.legajo==='9001'&&[4,5].includes(e.code));
  for(const source of extra){const clone=structuredClone(source);clone.personKey=person.personKey;clone.streamKey=person.streamKey;clone.personLabel=person.personLabel;clone.legajo=person.legajo;
    clone.eventRef=createHash('sha256').update('extra-second-'+source.code).digest('hex');clone.source.ordinal=3000+source.code;
    raw.events.push(clone);
  }
  raw.context.eventCount=raw.events.length;raw.context.recordCount=raw.events.length;
  if(newReceipt)raw.revision='dddddddd-dddd-5ddd-8ddd-ddddddddddde';
  return {ok:true,...await getAttendancePreparte({query:async()=>[{result:raw}]},PREPARTE_PRINCIPAL,{site:'pm-10',period:'2026-09',evidence},PREPARTE_SESSION)};
}
