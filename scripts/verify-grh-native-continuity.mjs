// Analiza un catálogo ya obtenido de forma autorizada. No conecta a ninguna base.
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';import {createHash} from 'node:crypto';
import {planNativeContinuity} from './lib/grh-successor-continuity.mjs';
import {summarizeNativeContinuity} from './lib/grh-successor-native-summary.mjs';
export function parseNativeContinuityArgs(args){
 let values;try{({values}=parseArgs({args,strict:true,allowPositionals:false,options:{catalog:{type:'string'},'expect-catalog':{type:'string'}}}));}catch{throw Error('NATIVE_CONTINUITY_ARGUMENT_INVALID');}
 if(!path.isAbsolute(values.catalog??'')||!/^[a-f0-9]{64}$/.test(values['expect-catalog']??''))throw Error('NATIVE_CONTINUITY_ARGUMENT_INVALID');
 return values;
}
export async function readNativeCatalogEvidence(file,expectedHash){
 const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024)throw Error('NATIVE_CONTINUITY_FILE_INVALID');
 const bytes=await fs.readFile(file);if(bytes.length>1024*1024||createHash('sha256').update(bytes).digest('hex')!==expectedHash)throw Error('NATIVE_CONTINUITY_CATALOG_CHANGED');
 const catalog=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 const plan=planNativeContinuity(catalog),report=summarizeNativeContinuity(plan);
 return {...report,catalogFileSha256:expectedHash,queryExecuted:false,writeStatements:0};
}
async function main(){
 const args=parseNativeContinuityArgs(process.argv.slice(2));
 console.log(JSON.stringify(await readNativeCatalogEvidence(args.catalog,args['expect-catalog']),null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{
 console.error(/^(?:NATIVE|SUCCESSOR)_CONTINUITY_[A-Z_]+$/.test(error?.code??error?.message??'')?(error.code??error.message):'NATIVE_CONTINUITY_FAILED');process.exitCode=1;
});
