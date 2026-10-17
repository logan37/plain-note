// Syncs the generated icon into Android mipmaps after `tauri android init`.
// `src-tauri/gen/` is gitignored, so re-run `npm run icons` when the icon changes.
import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const sourcePng = join(root, 'src-tauri', 'icons', 'icon.png');
const androidRes = join(root, 'src-tauri', 'gen', 'android', 'app', 'src', 'main', 'res');

if (!existsSync(sourcePng)) {
  console.error(`missing ${sourcePng} — run make-icons first`);
  process.exit(1);
}

if (!existsSync(androidRes)) {
  console.log('skip android icon sync (run `npx tauri android init` first)');
  process.exit(0);
}

const tauriBin = join(
  root,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'tauri.cmd' : 'tauri',
);
const iconArg = relative(root, sourcePng);

const result = existsSync(tauriBin)
  ? spawnSync(tauriBin, ['icon', iconArg], { cwd: root, stdio: 'inherit', shell: true })
  : spawnSync('npx', ['tauri', 'icon', iconArg], { cwd: root, stdio: 'inherit', shell: true });

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`failed to sync icons via tauri icon (exit ${result.status})`);
  process.exit(result.status ?? 1);
}

console.log('synced Android/desktop icons via `tauri icon`');
