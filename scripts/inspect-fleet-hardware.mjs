// Read-only model/firmware enrollment evidence using the explicitly supplied CommKey 0.
import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL,fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {loadFleetConfig} from '../local-agents/clock-fleet/runner.mjs';
import {readDeviceMetadata} from '../local-agents/pm10/reader/lector-fichadas.mjs';
import {readMunicipalRoute} from '../local-agents/pm10/route-guard.mjs';
import {acquireLock} from '../local-agents/pm10/store.mjs';
import {safeCode} from '../local-agents/pm10/config.mjs';
export async function main(argv=process.argv.slice(2)){
 if(argv.length!==5||argv[0]!=='--config'||argv[2]!=='--out'||argv[4]!=='--known-key-zero'||!path.isAbsolute(argv[1])||!path.isAbsolute(argv[3]))throw Error('METADATA_ARGUMENTS');
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.resolve(argv[3]);if(out===root||out.startsWith(root+path.sep))throw Error('PRIVATE_EVIDENCE_REQUIRED');
 await fs.mkdir(out,{mode:0o700});const config=await loadFleetConfig(argv[1]),summaries=[];
 for(const c of config.clocks.filter(x=>x.enabled)){
  let release;try{
   release=await acquireLock(path.join(config.stateDir,c.clockId));
   const route=await readMunicipalRoute({target:c.host});if(!route?.localLookup)throw Error('MUNICIPAL_ROUTE_REQUIRED');
   const {report}=await readDeviceMetadata({approved:true,host:c.host,port:c.port,serial:c.serial},{approved:true,commKey:Buffer.from('0'),timeoutMs:4000,totalMs:20000});
   const bytes=Buffer.from(JSON.stringify(report,null,2)),hash=createHash('sha256').update(bytes).digest('hex');
   await fs.writeFile(path.join(out,c.clockId+'.json'),bytes,{flag:'wx',mode:0o600});
   summaries.push({clockId:c.clockId,serial:c.serial,verified:report.authenticationAccepted===true&&report.metadataReadComplete===true&&report.cleanup.exitConfirmed===true,model:report.metadata.model??null,firmware:report.metadata.firmwareVersion??null,evidenceSha256:hash,error:report.error?.code??null});
  }catch(e){summaries.push({clockId:c.clockId,verified:false,error:safeCode(e)});}finally{await release?.();}
 }
 await fs.writeFile(path.join(out,'summary.json'),JSON.stringify(summaries,null,2),{flag:'wx',mode:0o600});console.log(JSON.stringify({scope:'configured_clocks_only',hardwareChanges:0,attendanceRead:false,results:summaries}));
 return summaries;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)main().catch(e=>{console.error(safeCode(e));process.exitCode=1;});
