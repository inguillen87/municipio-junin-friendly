// Entirely synthetic: no municipal identifiers, accounts, captures or credentials.
import {createHash} from 'node:crypto';
export const hash=value=>createHash('sha256').update(value).digest('hex');
export const V3_DAY='2026-11-14';
export const V3_CONTRACT='11111111-1111-4111-8111-111111111111';
export const V3_OTHER_CONTRACT='22222222-2222-4222-8222-222222222222';
export const V3_REVISION='33333333-3333-5333-8333-333333333333';
export const V3_RELEASE='a'.repeat(40);
export const V3_PRINCIPAL={
  user:{email:'attendance-v3-qa@example.test'},
  tenant:{source:'membership',id:'44444444-4444-4444-8444-444444444444',
    membershipId:'55555555-5555-4555-8555-555555555555',certifiedReleaseSha:V3_RELEASE},
};
export const V3_SESSION={id:'66666666-6666-4666-8666-666666666666',email:V3_PRINCIPAL.user.email,version:1,releaseSha:V3_RELEASE};
export const V3_OPTIONS={source:'continuous',site:'qa-site',day:V3_DAY,page:'1',pageSize:'25',status:'all'};

export function v3Events({stream='primary',device='device-one',contractId=V3_CONTRACT,legajo='9001',identityState='mapped',nominal=true,ordinal=1}={}) {
  return [[0,'07:00:00'],[1,'13:00:00']].map(([code,time],index)=>({
    eventRef:hash(stream+':'+device+':'+code),deviceKey:hash(device),
    source:{kind:'receipt',id:'77777777-7777-4777-8777-777777777777',ordinal:ordinal+index},
    model:'K20/ID',personKey:hash('synthetic-person'),streamKey:hash(stream+':'+device),
    personLabel:nominal?'Persona sintética de prueba':'Persona AABB0011',legajo:nominal?legajo:null,
    identityState,contractId:nominal&&identityState==='mapped'?contractId:null,
    occurredAt:V3_DAY+'T'+time+'-03:00',localTimestamp:V3_DAY+' '+time,code,issues:[],
  }));
}

export function v3Source({nominal=true,events=v3Events({nominal})}={}) {
  return {
    version:'clock-workday-source.v3',generatedAt:'2026-11-15T01:00:00Z',sourceMode:'continuous',
    revision:V3_REVISION,rulesVersion:'declared-intervals.v2',site:{key:'qa-site',label:'Punto sintético'},
    timezone:'America/Argentina/Mendoza',nominalReadAllowed:nominal,
    filters:{from:V3_DAY,to:V3_DAY,anchoredToLatest:false},
    context:{from:'2026-11-13',to:'2026-11-15',recordCount:events.length,eventCount:events.length,observationCount:0},
    collection:{status:events.length?'continuous_receipts':'no_data',sourceComplete:true,captureCount:0,
      receiptCount:events.length?1:0,batchCount:events.length?1:0,lastReceiptAt:events.length?'2026-11-14T17:00:00Z':null,
      periodCoverageCertified:false,automaticCollectorVerified:false},
    events,observations:[],
  };
}
