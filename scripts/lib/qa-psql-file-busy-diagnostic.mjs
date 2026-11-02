// QA metadata only. The file argument comes from the owned run() writer, not HTTP.
import {registryBusyDiagnostic,REGISTRY_DIAGNOSTIC_LIMITS} from './registry-busy-diagnostic.mjs';
export function qaPsqlFileBusyDiagnostic({stderr,schema,file}){
 const original=()=>registryBusyDiagnostic({stderr},schema),limits=REGISTRY_DIAGNOSTIC_LIMITS;
 if(typeof stderr!=='string'||stderr.length>limits.characters||typeof file!=='string'||!file||/[\r\n\0]/.test(file))return original();
 const lines=stderr.split(/\r?\n/);
 // Apply the original limits BEFORE removing even a known prefix.
 if(lines.length>limits.lines||lines.some(line=>line.length>limits.lineCharacters))return original();
 const prefix='psql:'+file+':';
 const normalized=lines.map(line=>{
  if(!line.startsWith(prefix))return line;
  const tail=line.slice(prefix.length),match=/^[1-9][0-9]{0,8}:\s+((?:ERROR|CONTEXT):[\s\S]*)$/.exec(tail);
  return match?match[1]:line;
 }).join('\n');
 return registryBusyDiagnostic({stderr:normalized},schema);
}
