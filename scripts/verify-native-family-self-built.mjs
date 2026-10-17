// Exact packaging check: canonical rendered HTML and byte-identical assets.
// This is neither browser nor SQL acceptance.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import{createHash}from'node:crypto';import{fileURLToPath}from'node:url';
import{createFriendlyBuiltPageRecipe}from'./lib/friendly-built-page-recipe.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
export const NATIVE_FAMILY_BUILT_FILES=Object.freeze(['centro-acciones.html','assets/native-family-request-client.js','assets/native-family-request-model.js','assets/native-family-request-panel.js','assets/native-family-request.css']);
export function inspectNativeFamilyBuilt({readBytes,sourceCommit=null}){
 const observed=new Map(),read=file=>{const bytes=readBytes(file);assert.ok(Buffer.isBuffer(bytes));if(observed.has(file))assert.ok(bytes.equals(observed.get(file)),'FAMILY195_PACKAGING_INPUT_CHANGED:'+file);else observed.set(file,Buffer.from(bytes));return bytes;};
 const recipe=createFriendlyBuiltPageRecipe({readBytes:read});
 const files=NATIVE_FAMILY_BUILT_FILES.map(file=>{const a=file.endsWith('.html')?recipe.forFile(file):read(file),b=read('public/'+file);assert.ok(a.equals(b),'FAMILY195_BUILT_BYTES_CHANGED:'+file);return{file,sha256:hash(a),comparison:file.endsWith('.html')?'exact canonical build recipe':'exact original asset'};});
 const html=read('public/centro-acciones.html').toString('utf8');assert.match(html,/native-family-request-panel\.js/);assert.match(html,/native-family-request\.css/);const routing=JSON.parse(read('vercel.json'));assert.ok(JSON.stringify(routing).includes('internal-native-family-requests'));
 const recipeBookend=recipe.assertSourceBookend();for(const[file,expected]of observed){const actual=readBytes(file);assert.ok(Buffer.isBuffer(actual)&&actual.equals(expected),'FAMILY195_PACKAGING_INPUT_CHANGED:'+file);}
 const sourceHashes=Object.fromEntries([...observed].filter(([file])=>!file.startsWith('public/')).map(([file,bytes])=>[file,hash(bytes)])),builtHashes=Object.fromEntries([...observed].filter(([file])=>file.startsWith('public/')).map(([file,bytes])=>[file,hash(bytes)]));
 return{passed:true,files,sourceHashes,builtHashes,recipe:{identityVersion:recipe.identityVersion,sourceHashes:recipe.sourceHashes(),bookend:recipeBookend},sourceCommit,comparison:'byte-exact; HTML reconstructed with the canonical builder recipe; no normalization',sqlExecuted:false,browserExecuted:false,municipalAcceptance:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=path.resolve(import.meta.dirname,'..'),output=path.join(root,'verification/native-family-built');assert.ok(!fs.existsSync(output));const result=inspectNativeFamilyBuilt({readBytes:file=>fs.readFileSync(path.join(root,file)),sourceCommit:process.env.GITHUB_SHA??null});fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:true,files:result.files.length,recipeSources:Object.keys(result.recipe.sourceHashes).length}));
}
