import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import inventory from '../data/junin-attendance-inventory.v1.json' with {type:'json'};
import crosswalk from '../data/junin-clock-site-crosswalk.v1.json' with {type:'json'};
import {getReportedAttendanceInventory} from '../lib/internal-attendance-reported-inventory.js';
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function prepareClockNames(config) {
  if(config?.schema!=='municontrol-clock-fleet.v1'||!Array.isArray(config.clocks)||config.clocks.length>16)throw Error('CLOCK_NAME_CONFIG_INVALID');
  if(crosswalk.inventorySha256!==inventory.source.sha256||crosswalk.vendorNumberIsMunicipalPoint!==false)throw Error('CLOCK_NAME_SOURCE_INVALID');
  const result=structuredClone(config),changes=[];
  const seen=new Set();
  for(const clock of result.clocks){
    if(seen.has(clock.clockId))throw Error('CLOCK_NAME_DUPLICATE');seen.add(clock.clockId);
    const match=crosswalk.associations.find(a=>a.clockId===clock.clockId);
    if(!match)throw Error('CLOCK_NAME_MAPPING_REQUIRED');
    const point=match.pointCode?getReportedAttendanceInventory({tenant:{slug:"junin-mendoza"}}).data.find(s=>s.code===match.pointCode):null;
    if(match.pointCode&&!point)throw Error('CLOCK_NAME_POINT_MISSING');
    const next=point?point.code+' · '+point.name:'PM pendiente · '+match.reportedName;
    if(clock.label!==next)changes.push({clockId:clock.clockId,pointCode:match.pointCode,previousLabel:clock.label,label:next});
    clock.label=next;
  }
  return {config:result,changes};
}
export async function main(argv=process.argv.slice(2)) {
  const args=new Map();for(let i=0;i<argv.length;i+=2){if(!['--config','--expected-sha','--apply-labels'].includes(argv[i])||args.has(argv[i])||!argv[i+1])throw Error('CLOCK_NAME_ARGUMENTS');args.set(argv[i],argv[i+1]);}
  const file=args.get('--config');if(!file||!path.isAbsolute(file))throw Error('CLOCK_NAME_PATH');
  const st=await fs.lstat(file);if(!st.isFile()||st.isSymbolicLink()||st.size>65536)throw Error('CLOCK_NAME_PATH');
  const original=await fs.readFile(file),sha=digest(original),plan=prepareClockNames(JSON.parse(original.toString('utf8')));
  const applying=args.get('--apply-labels');if(applying!==undefined&&applying!=='yes')throw Error('CLOCK_NAME_ARGUMENTS');
  if(applying&&args.get('--expected-sha')!==sha)throw Error('CLOCK_NAME_SOURCE_CHANGED');
  let saved=false;
  if(applying&&plan.changes.length){
    const backup=file+'.before-names-'+sha.slice(0,16)+'.json';
    try{await fs.writeFile(backup,original,{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST'||digest(await fs.readFile(backup))!==sha)throw Error('CLOCK_NAME_BACKUP_CONFLICT');}
    const temporary=file+'.names-'+process.pid+'.tmp';
    await fs.writeFile(temporary,JSON.stringify(plan.config,null,2)+'\n',{flag:'wx',mode:0o600});
    if(digest(await fs.readFile(file))!==sha)throw Error('CLOCK_NAME_SOURCE_CHANGED');
    await fs.rename(temporary,file);
    if(JSON.stringify(JSON.parse(await fs.readFile(file,'utf8')))!==JSON.stringify(plan.config))throw Error('CLOCK_NAME_WRITE_UNCONFIRMED');
    saved=true;
  }
  const report={version:'clock-point-names.v1',sourceSha256:sha,changes:plan.changes,applied:saved,clockIdentityChanged:false,queueChanged:false,hardwareContacted:false};
  console.log(JSON.stringify(report));return report;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)main().catch(()=>{console.error('Clock naming stopped; original identities and queues were not edited.');process.exitCode=1;});
