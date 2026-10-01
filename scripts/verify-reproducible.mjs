import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildArgs = process.argv.slice(2);
const installerPath = path.join(projectRoot, 'dist/blackcat.user.js');

function build() {
    const result = spawnSync(process.execPath, ['scripts/build.mjs', ...buildArgs], {
        cwd: projectRoot,
        encoding: 'utf8',
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.status !== 0) {
        throw new Error(`Build failed with exit code ${result.status}`);
    }
    return createHash('sha256').update(readFileSync(installerPath)).digest('hex');
}

const first = build();
const second = build();
if (first !== second) {
    throw new Error(`Non-reproducible installer: ${first} != ${second}`);
}
console.log('The install script is byte-for-byte reproducible.');
