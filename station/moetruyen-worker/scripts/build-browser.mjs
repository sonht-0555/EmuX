import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoPath } from './repo-path.mjs';

// Run from the external toolchain after npm test has synced src/scripts.
const root = fileURLToPath(new URL('../', import.meta.url));
export async function browserBundle() {
    const result = await build({ entryPoints: [resolve(root, 'src/browser/worker-entry.js')],
        bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2020',
        minify: true, legalComments: 'none', banner: { js: '// Generated from station/moetruyen-worker/src. See NOTICE.txt. Do not edit.' } });
    return result.outputFiles[0].text;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const workspace = JSON.parse(await readFile(new URL('../workspace.json', import.meta.url), 'utf8').catch(() => '{}'));
    const output = resolve(process.env.EMUX_ROOT || workspace.repoRoot || repoPath(''), 'src/utils/imgx/worker.js');
    const bundle = await browserBundle();
    if (process.argv.includes('--check')) {
        if (await readFile(output, 'utf8') !== bundle) throw new Error('Browser decoder is stale; run scripts/build-browser.mjs');
    } else {
        await mkdir(dirname(output), { recursive: true });
        await writeFile(output, bundle);
        console.log('Built browser IMGX decoder');
    }
}
