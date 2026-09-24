// Construye y verifica en memoria; emite únicamente el resumen agregado, nunca filas nominales.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {prepareSuccessorPackage} from './lib/grh-successor-package-source.mjs';
import {successorPackageSummary,successorFault} from './lib/grh-successor-package.mjs';
export async function verifySuccessorSources(options){
  return successorPackageSummary(await prepareSuccessorPackage(options));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const {values}=parseArgs({options:{'baseline-core':{type:'string'},'candidate-core':{type:'string'},
      'baseline-curated':{type:'string'},'candidate-curated':{type:'string'},progress:{type:'boolean',default:false}},strict:true});
    const options={baselineCore:values['baseline-core'],candidateCore:values['candidate-core'],
      baselineCurated:values['baseline-curated'],candidateCurated:values['candidate-curated']};
    if(!Object.values(options).every(v=>typeof v==='string'&&path.isAbsolute(v)))successorFault('SUCCESSOR_USAGE');
    if(values.progress)options.onProgress=event=>console.error(JSON.stringify(event));
    const summary=await verifySuccessorSources(options);
    console.log(JSON.stringify(summary,null,2));
  }catch(error){
    const code=/^SUCCESSOR_[A-Z_]+$/.test(error?.code??'')?error.code:'SUCCESSOR_SOURCE_VERIFICATION_FAILED';
    console.error(code);process.exitCode=1;
  }
}
