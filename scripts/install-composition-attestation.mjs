// Preimágenes reales para la composición. Offline: no se conecta a ninguna base ni ejecuta SQL.
//   --query                              imprime la consulta de sólo lectura que Codex ejecuta contra el destino autorizado
//   --merge <archivo> [--source <name>]  vuelca su resultado (JSON) en la atestación con reviewed:false e informa lo no resuelto
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {COMPOSITION_ORDER,compositionPaths} from './lib/install-composition-source.mjs';
import {attestationQuery,mergeAttestation} from './lib/install-composition-attestation.mjs';

const url=path=>new URL('../'+path,import.meta.url);
const derived=Object.fromEntries(COMPOSITION_ORDER.map(name=>[name,JSON.parse(readFileSync(url(compositionPaths(name).outputManifest),'utf8'))]));
const args=process.argv.slice(2),mode=args[0];
if(mode==='--query'&&args.length===1){process.stdout.write(attestationQuery(Object.values(derived)));}
else if(mode==='--merge'){
 const file=args[1];
 assert.ok(file,'Indicá el archivo JSON con el resultado de la consulta.');
 let onlySources=null;
 if(args.length===4&&args[2]==='--source'){
  assert.ok(COMPOSITION_ORDER.includes(args[3]),'Fuente desconocida: '+args[3]);
  onlySources=[args[3]];
 }else{
  assert.equal(args.length,2,'Usá --merge <archivo> [--source <name>].');
 }
 const path='scripts/candidates/install-composition-attestation-v1.json';
 const {attestation,unresolved}=mergeAttestation(JSON.parse(readFileSync(url(path),'utf8')),JSON.parse(readFileSync(file,'utf8')),derived,{onlySources});
 writeFileSync(url(path),JSON.stringify(attestation,null,2)+'\n','utf8');
 process.stdout.write(JSON.stringify({ok:unresolved.length===0,reviewed:false,sources:onlySources??COMPOSITION_ORDER,unresolved},null,2)+'\n');
 if(unresolved.length)process.exitCode=2;
}else{process.stderr.write('Usá --query o --merge <archivo> [--source <name>].\n');process.exitCode=1;}
