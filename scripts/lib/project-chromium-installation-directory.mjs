import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

export function prepareProjectChromiumDirectory({root,releaseGate,version}) {
 assert.ok(path.isAbsolute(root),'CHROMIUM_ROOT_REQUIRED');
 assert.equal(typeof releaseGate,'boolean');
 assert.match(version,/^\d+\.\d+\.\d+\.\d+$/,'CHROMIUM_VERSION_REQUIRED');
 const parent=path.join(root,'verification');
 const directory=path.join(parent,(releaseGate?'release':'patched')+'-chromium-'+version);
 assert.equal(path.dirname(directory),parent);
 fs.mkdirSync(parent,{recursive:true});
 // Keep the original exclusive child creation: never reuse or overwrite a
 // previous browser installation or its evidence.
 fs.mkdirSync(directory);
 return directory;
}
