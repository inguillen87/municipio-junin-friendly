import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'public');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const file of ['login.html', 'friendly-dashboard.html', 'datos-personales.html']) {
  fs.copyFileSync(path.join(root, file), path.join(output, file));
}
console.log('Friendly static shell built.');
