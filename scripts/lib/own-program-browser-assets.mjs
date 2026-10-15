// Read-only fixture module graph. Only flat, local assets may be served.
// Missing transitive imports must fail before the browser starts.
import assert from 'node:assert/strict';
export function ownProgramBrowserAssets(readAsset, entries=['own-payroll-program-model.js','own-payroll-engine.js']) {
 assert.equal(typeof readAsset,'function');assert.ok(Array.isArray(entries)&&entries.length>0);
 const assets=new Map();
 function visit(name){
  assert.match(name,/^[a-z0-9]+(?:-[a-z0-9]+)*\.js$/,'PROGRAM_BROWSER_LOCAL_ASSET_REQUIRED');
  const route='/assets/'+name;if(assets.has(route))return;
  assert.ok(assets.size<32,'PROGRAM_BROWSER_MODULE_LIMIT');
  const bytes=readAsset(name);assert.ok(Buffer.isBuffer(bytes),'PROGRAM_BROWSER_BYTES_REQUIRED');
  const source=bytes.toString('utf8');assert.ok(!/\bimport\s*\(/.test(source),'PROGRAM_BROWSER_STATIC_IMPORTS_REQUIRED');assets.set(route,bytes);
  const imports=/\bimport\s+(?:[^'";]*?\sfrom\s*)?['"]([^'"]+)['"]|\bexport\s+(?:\*|\{[^}]*\})\s+from\s*['"]([^'"]+)['"]/g;
  for(const match of source.matchAll(imports)){const specifier=match[1]??match[2];assert.ok(specifier.startsWith('./'),'PROGRAM_BROWSER_LOCAL_IMPORT_REQUIRED');visit(specifier.slice(2));}
 }
 for(const entry of entries)visit(entry);return assets;
}
