import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const out = resolve(root, 'dist');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const entry of ['index.html', 'src', 'public', 'sw.js']) {
  await cp(resolve(root, entry), resolve(out, entry), { recursive: true });
}
await stat(resolve(out, 'index.html'));
console.log('Built static LAST ZONE client in dist/');
