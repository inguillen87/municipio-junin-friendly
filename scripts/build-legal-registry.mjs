import { publicBuildResolution } from './lib/public-build-resolution.mjs';
import {buildLegalWork} from './build-legal-work.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';import {build} from 'esbuild';
export async function buildLegalRegistry(root,output){
 const source='src/islands/legal-registry-entry.tsx';
 const result=await build({ ...publicBuildResolution,absWorkingDir:root,entryPoints:{'legal-registry':source},outdir:path.join(output,'assets/islands'),entryNames:'[name]-[hash]',
  bundle:true,minify:true,external:['/assets/vendor/pdf.min.mjs'],jsx:'automatic',format:'esm',platform:'browser',target:['es2020'],sourcemap:false,legalComments:'linked',metafile:true,logLevel:'warning',define:{'process.env.NODE_ENV':'"production"'}});
 const entry=Object.entries(result.metafile.outputs).find(([,m])=>m.entryPoint?.replaceAll('\\','/')===source)?.[0];assert.ok(entry,'Legal registry entry missing');
 const absolute=path.resolve(root,entry),size=gzipSync(await fs.readFile(absolute)).length;assert.ok(size<100000,'Legal registry exceeds 100KB gzip budget');
 const href='/'+path.relative(output,absolute).split(path.sep).join('/'),file=path.join(output,'juridica-registro.html'),html=await fs.readFile(file,'utf8');
 const marker='__MC_LEGAL_REGISTRY_BUNDLE__';assert.equal(html.split(marker).length,2,'One legal registry bundle marker required');
 await fs.appendFile(path.join(output,"assets/legal-registry.css"),await fs.readFile(path.join(root,"assets/legal-article-workspace.css")));
 await fs.writeFile(file,html.replace(marker,href));await buildLegalWork(root,output);console.log(`React/TSX legal registry: ${size} bytes gzip. Scoped native API; no external AI calls.`);return{href,gzipBytes:size};
}
