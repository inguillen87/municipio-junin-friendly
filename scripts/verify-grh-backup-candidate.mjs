import {createReadStream} from 'node:fs';import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';import {createGunzip} from 'node:zlib';import {Transform,Writable} from 'node:stream';import {pipeline} from 'node:stream/promises';
import {getGrhSourceProfile} from './lib/grh-source-profile.mjs';
import {readAndVerifySources,prepareCuratedImport} from './import-rrhh-neon.mjs';
import {preflightGrhCore} from './import-grh-core-canonical.mjs';
const hash=()=>createHash('sha256');
export async function verifyGzipSource(file,expected){
 if(typeof file!=='string'||!path.isAbsolute(file)||!expected||!Number.isSafeInteger(expected.gzipBytes)||expected.gzipBytes<1||!Number.isSafeInteger(expected.logicalBytes)||expected.logicalBytes<1||!['gzipSha256','sha256'].every(k=>/^[a-f0-9]{64}$/i.test(expected[k])))throw Error('GRH_CANDIDATE_INPUT');
 const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==expected.gzipBytes)throw Error('GRH_CANDIDATE_SOURCE');
 let compressed=0,logical=0;const gz=hash(),sql=hash();
 const measure=new Transform({transform(chunk,_encoding,callback){compressed+=chunk.length;if(compressed>expected.gzipBytes)return callback(Error('GRH_CANDIDATE_SIZE'));gz.update(chunk);callback(null,chunk);}});
 const target=new Writable({write(chunk,_encoding,callback){logical+=chunk.length;if(logical>expected.logicalBytes)return callback(Error('GRH_CANDIDATE_SIZE'));sql.update(chunk);callback();}});
 await pipeline(createReadStream(file),measure,createGunzip(),target);
 const gzipSha256=gz.digest('hex'),sourceSha256=sql.digest('hex');
 if(compressed!==expected.gzipBytes||logical!==expected.logicalBytes||gzipSha256!==expected.gzipSha256.toLowerCase()||sourceSha256!==expected.sha256.toLowerCase())throw Error('GRH_CANDIDATE_HASH');
 return {compressedBytes:compressed,logicalBytes:logical,gzipSha256,sourceSha256};
}
export async function verifyGrhBackupCandidate({source,curated,core,profileId}){
 const profile=getGrhSourceProfile(profileId);
 for(const directory of [curated,core])if(typeof directory!=='string'||!path.isAbsolute(directory)||path.resolve(directory)===path.parse(directory).root)throw Error('GRH_CANDIDATE_DIRECTORY');
 const bytes=await verifyGzipSource(source,profile.source);
 const curatedSource=await readAndVerifySources(pathToFileURL(path.resolve(curated)+path.sep),{profileId});prepareCuratedImport(curatedSource);
 const coreSource=await preflightGrhCore({dataDir:pathToFileURL(path.resolve(core)+path.sep),profileId});
 return {version:'grh-backup-candidate-check.v1',checkedAt:new Date().toISOString(),profileId,sourceCutoff:profile.source.cutoff,cutoffTimezone:'not_reported',...bytes,curatedVerified:true,coreVerified:true,coreCounts:Object.fromEntries(Object.entries(coreSource.artifacts).map(([k,v])=>[k,v.records])),databaseConnections:0,databaseWrites:0,productionSourceChanged:false};
}
export async function main(argv=process.argv.slice(2)){
 const allowed=new Set(['--source','--curated','--core','--profile','--out']),args=new Map();
 for(let i=0;i<argv.length;i+=2){if(!allowed.has(argv[i])||args.has(argv[i])||!argv[i+1]||argv[i+1].startsWith('--'))throw Error('GRH_CANDIDATE_ARGUMENTS');args.set(argv[i],argv[i+1]);}
 const report=await verifyGrhBackupCandidate({source:args.get('--source'),curated:args.get('--curated'),core:args.get('--core'),profileId:args.get('--profile')});
 if(args.has('--out')){if(!path.isAbsolute(args.get('--out')))throw Error('GRH_CANDIDATE_OUTPUT');await fs.writeFile(args.get('--out'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});}
 console.log(JSON.stringify(report));return report;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)main().catch(()=>{console.error('GRH candidate verification failed. No database was opened or modified.');process.exitCode=1;});
