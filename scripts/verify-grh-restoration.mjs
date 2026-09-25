// Verifica evidencias y bytes de un respaldo privado. No abre conexiones ni restaura datos.
import fs from 'node:fs/promises';import {createReadStream} from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {parseArgs} from 'node:util';
import {validateRestorationImage,compareRestorationImages} from './lib/grh-restoration-proof.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code});};
export function parseRestorationArgs(args){
 let values;try{({values}=parseArgs({args,strict:true,allowPositionals:false,options:{'source-image':{type:'string'},'restored-image':{type:'string'},'source-definitions':{type:'string'},'restored-definitions':{type:'string'},archive:{type:'string'},'backup-receipt':{type:'string'},'expect-archive-sha256':{type:'string'},'allow-identity-repair':{type:'boolean'}}}));}catch{fail('RESTORATION_ARGUMENT_INVALID');}
 if(!['source-image','restored-image','archive','backup-receipt'].every(k=>typeof values[k]==='string'&&path.isAbsolute(values[k]))||!/^[a-f0-9]{64}$/.test(values['expect-archive-sha256']??'')||!!values['source-definitions']!==!!values['restored-definitions']||['source-definitions','restored-definitions'].some(k=>values[k]!==undefined&&!path.isAbsolute(values[k])))fail('RESTORATION_ARGUMENT_INVALID');return values;
}
async function regularFile(file,maximum){const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>maximum)fail('RESTORATION_FILE_INVALID');return stat;}
async function jsonFile(file){await regularFile(file,8*1024*1024);try{return JSON.parse(await fs.readFile(file,'utf8'));}catch{fail('RESTORATION_FILE_INVALID');}}
export async function verifyRestorationFiles(args){
 const source=validateRestorationImage(await jsonFile(args['source-image'])),restored=validateRestorationImage(await jsonFile(args['restored-image']));
 const receipt=await jsonFile(args['backup-receipt']);if(receipt?.version!=='municontrol-current-backup.v1'||receipt.sourceImageSha256!==source.imageSha256||receipt.archiveSha256!==args['expect-archive-sha256']||receipt.sourceWrites!==0||receipt.source?.projectId!==source.metadata.project||receipt.source?.branchId!==source.metadata.branch||receipt.source?.databaseName!==source.metadata.database)fail('RESTORATION_ARCHIVE_BINDING_INVALID');
 const archive=await regularFile(args.archive,4*1024*1024*1024),digest=createHash('sha256');for await(const chunk of createReadStream(args.archive))digest.update(chunk);const sha=digest.digest('hex');if(sha!==args['expect-archive-sha256']||archive.size!==receipt.archiveBytes)fail('RESTORATION_ARCHIVE_CHANGED');
 const sourceDefinitions=args['source-definitions']?await jsonFile(args['source-definitions']):null,restoredDefinitions=args['restored-definitions']?await jsonFile(args['restored-definitions']):null;
 const comparison=compareRestorationImages(source,restored,{allowIdentityRepair:args['allow-identity-repair']===true,sourceDefinitions,restoredDefinitions});
 return {version:'municontrol-restoration-verification.v1',checkedAt:new Date().toISOString(),matched:comparison.matched,archiveSha256:sha,archiveBytes:archive.size,sourceImageSha256:source.imageSha256,restoredImageSha256:restored.imageSha256,
 objects:{tables:comparison.tables,routines:comparison.routines,views:comparison.views,indexes:comparison.indexes},rawDefinitionsIdentical:comparison.rawDefinitionsIdentical,portableDefinitionDifferences:comparison.portableDefinitionDifferences.length,localIdentityRepairs:comparison.localIdentityRepairs,findings:comparison.findings,
 sourceDatabaseBytes:comparison.sourceDatabaseBytes,restoredDatabaseBytes:comparison.restoredDatabaseBytes,productionWrites:0,credentialsRestored:false,sequenceStateVerified:false,stagingAuthorized:false,sourcePromoted:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const report=await verifyRestorationFiles(parseRestorationArgs(process.argv.slice(2)));console.log(JSON.stringify(report,null,2));if(!report.matched)process.exitCode=1;}
 catch(e){console.error(/^RESTORATION_[A-Z_]+$/.test(e?.code??'')?e.code:'RESTORATION_VERIFICATION_FAILED');process.exitCode=1;}
}
