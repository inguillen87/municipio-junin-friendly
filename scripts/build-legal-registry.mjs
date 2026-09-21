import { publicBuildResolution } from './lib/public-build-resolution.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';import {build} from 'esbuild';
export async function buildLegalRegistry(root,output){
 const source='src/islands/legal-registry-entry.tsx';
 const result=await build({ ...publicBuildResolution,absWorkingDir:root,entryPoints:{'legal-registry':source},outdir:path.join(output,'assets/islands'),entryNames:'[name]-[hash]',
  bundle:true,minify:true,external:['/assets/vendor/pdf.min.mjs','/assets/legal-documentary-panel.js'],jsx:'automatic',format:'esm',platform:'browser',target:['es2020'],sourcemap:false,legalComments:'linked',metafile:true,logLevel:'warning',define:{'process.env.NODE_ENV':'"production"'}});
 const entry=Object.entries(result.metafile.outputs).find(([,m])=>m.entryPoint?.replaceAll('\\','/')===source)?.[0];assert.ok(entry,'Legal registry entry missing');
 const absolute=path.resolve(root,entry),size=gzipSync(await fs.readFile(absolute)).length;assert.ok(size<100000,'Legal registry exceeds 100KB gzip budget');
 const href='/'+path.relative(output,absolute).split(path.sep).join('/'),file=path.join(output,'juridica-registro.html'),html=await fs.readFile(file,'utf8');
 const marker='__MC_LEGAL_REGISTRY_BUNDLE__';assert.equal(html.split(marker).length,2,'One legal registry bundle marker required');
 await fs.appendFile(path.join(output,"assets/legal-registry.css"),await fs.readFile(path.join(root,"assets/legal-article-workspace.css")));
 await fs.appendFile(path.join(output,"assets/legal-registry.css"),await fs.readFile(path.join(root,"assets/legal-documentary-panel.css")));
 for(const asset of ['internal-legal-followups.html','internal-legal-coordination.html','internal-legal-matters.html','assets/legal-followups-model.js','assets/legal-followup-review.js','assets/legal-followups-ui.js','assets/legal-followups.css','assets/legal-agenda-model.js','assets/legal-agenda-ui.js','assets/legal-coordination-model.js','assets/legal-coordination-ui.js','assets/legal-coordination.css','assets/legal-matters-model.js','assets/legal-matters-ui.js','assets/legal-matters.css','internal-legal-expedients.html','assets/legal-expedients-model.js','assets/legal-expedients-ui.js','assets/legal-expedients.css'])await fs.copyFile(path.join(root,asset),path.join(output,asset));
 await fs.writeFile(file,html.replace(marker,href));console.log(`React/TSX legal registry: ${size} bytes gzip. Scoped native API; no external AI calls.`);return{href,gzipBytes:size};
}
