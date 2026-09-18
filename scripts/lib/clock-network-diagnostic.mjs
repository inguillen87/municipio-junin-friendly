// Assess explicit observations. No sockets, automatic routes, broad scanning or clock commands.
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join()===keys.toSorted().join();
const fail=()=>{throw Error('CLOCK_NETWORK_EVIDENCE_INVALID');};
export function ipv4(value){if(typeof value!=='string'||!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value))fail();const octets=value.split('.').map(Number);if(octets.some((n,i)=>n>255||String(n)!==value.split('.')[i]))fail();return octets.reduce((n,x)=>n*256+x,0);}
export function privateIpv4(value){const n=ipv4(value);return n>=ipv4('10.0.0.0')&&n<=ipv4('10.255.255.255')||n>=ipv4('172.16.0.0')&&n<=ipv4('172.31.255.255')||n>=ipv4('192.168.0.0')&&n<=ipv4('192.168.255.255');}
function network(prefix){if(typeof prefix!=='string'||prefix.split('/').length!==2)fail();const [address,bits]=prefix.split('/');if(!/^(?:[0-9]|[12][0-9]|3[0-2])$/.test(bits))fail();const n=ipv4(address),size=2**(32-Number(bits));if(n%size!==0)fail();return {start:n,end:n+size-1,bits:Number(bits)};}
export function assessClockNetwork(evidence){
 if(!exact(evidence,['schema','observedOn','timezone','sourceAddress','vpnInterfaceIndex','vpnNextHop','routes','targets','probeLimitMs','hardwareCommandsSent','routesChanged','evidenceSources'])||evidence.schema!=='clock-vpn-observation.v1'||!/^20\d{2}-\d{2}-\d{2}$/.test(evidence.observedOn)||!Number.isFinite(Date.parse(evidence.observedOn))||new Date(evidence.observedOn+'T00:00:00Z').toISOString().slice(0,10)!==evidence.observedOn||evidence.timezone!=='America/Argentina/Mendoza'||!Number.isInteger(evidence.vpnInterfaceIndex)||evidence.vpnInterfaceIndex<1||!Number.isInteger(evidence.probeLimitMs)||evidence.probeLimitMs<1000||evidence.probeLimitMs>10000||evidence.hardwareCommandsSent!==false||evidence.routesChanged!==false||!Array.isArray(evidence.targets)||!evidence.targets.length||evidence.targets.length>50||!Array.isArray(evidence.routes)||evidence.routes.length>100)fail();
 ipv4(evidence.sourceAddress);ipv4(evidence.vpnNextHop);evidence.routes.forEach(network);
 if(!Array.isArray(evidence.evidenceSources)||evidence.evidenceSources.length>10||evidence.evidenceSources.some(x=>typeof x!=='string'||x.length>200||/[\x00-\x1f\x7f]/.test(x)))fail();
 const codes=new Set(),addresses=new Set(),counts={tcpReachable:0,vpnNoTcpResponse:0,outsideVpn:0,missingAddress:0};
 const rows=evidence.targets.map(t=>{
  if(!exact(t,['code','name','ip','port','route','nextHop','interfaceIndex','test'])||!/^PM-[0-9]{2}$/.test(t.code)||codes.has(t.code)||typeof t.name!=='string'||!t.name.trim()||t.name.length>120||/[\x00-\x1f\x7f]/.test(t.name)||!Number.isInteger(t.port)||t.port<1||t.port>65535)fail();codes.add(t.code);
  if(t.test==='missing_address'){if(t.ip!==null||t.route!==null||t.nextHop!==null||t.interfaceIndex!==null)fail();counts.missingAddress++;return{...t,result:'missingAddress',privateAddress:null,applicationVerified:false};}
  const address=ipv4(t.ip),route=network(t.route);ipv4(t.nextHop);if(addresses.has(t.ip)||address<route.start||address>route.end||!Number.isInteger(t.interfaceIndex)||t.interfaceIndex<1)fail();addresses.add(t.ip);
  const onVpn=t.interfaceIndex===evidence.vpnInterfaceIndex&&t.nextHop===evidence.vpnNextHop&&evidence.routes.includes(t.route);
  if(!onVpn){if(t.test!=='not_probed_outside_vpn')fail();counts.outsideVpn++;return{...t,result:'outsideVpn',privateAddress:privateIpv4(t.ip),applicationVerified:false};}
  if(!['tcp_4370_connected','tcp_timeout','tcp_connect_failed'].includes(t.test)||t.port!==4370)fail();const result=t.test==='tcp_4370_connected'?'tcpReachable':'vpnNoTcpResponse';counts[result]++;return{...t,result,privateAddress:privateIpv4(t.ip),applicationVerified:false};
 });return {schema:'clock-vpn-assessment.v1',observedOn:evidence.observedOn,scope:'client_observation_not_router_audit',counts,rows,networkChanges:0,clockCommands:0};
}
