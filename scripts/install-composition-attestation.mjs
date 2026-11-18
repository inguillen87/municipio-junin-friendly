// Preimágenes reales para la composición. Offline: no se conecta a ninguna base ni ejecuta SQL.
//   --query            imprime la consulta de sólo lectura que Codex ejecuta contra el destino autorizado
//   --merge <archivo>  vuelca su resultado (JSON) en la atestación con reviewed:false e informa lo no resuelto
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {COMPOSITION_ORDER,compositionPaths} from './lib/install-composition-source.mjs';
import {attestationQuery,mergeAttestation} from './lib/install-composition-attestation.mjs';

const url=path=>new URL('../'+path,import.meta.url);
const derived=Object.fromEntries(COMPOSITION_ORDER.map(name=>[name,JSON.parse(readFileSync(url(compositionPaths(name).outputManifest),'utf8'))]));
const [mode,file]=process.argv.slice(2);
if(mode==='--query'){process.stdout.write(attestationQuery(Object.values(derived)));}
else if(mode==='--merge'){
 assert.ok(file,'Indicá el archivo JSON con el resultado de la consulta.');
 const path='scripts/candidates/install-composition-attestation-v1.json';
 const {attestation,unresolved}=mergeAttestation(JSON.parse(readFileSync(url(path),'utf8')),JSON.parse(readFileSync(file,'utf8')),derived);
 writeFileSync(url(path),JSON.stringify(attestation,null,2)+'\n','utf8');
 process.stdout.write(JSON.stringify({ok:unresolved.length===0,reviewed:false,unresolved},null,2)+'\n');
 if(unresolved.length)process.exitCode=2;
}else{process.stderr.write('Usá --query o --merge <archivo>.\n');process.exitCode=1;}
