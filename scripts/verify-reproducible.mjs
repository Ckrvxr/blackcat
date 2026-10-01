import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildArgs = process.argv.slice(2);
const files = ['dist/blackcat.user.js', 'dist/engine.js', 'dist/upstream.json', 'dist/DARK-READER-LICENSE.txt'];

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
    return new Map(files.map((file) => [
        file,
        createHash('sha256').update(readFileSync(path.join(projectRoot, file))).digest('hex'),
    ]));
}

const first = build();
const second = build();
for (const file of files) {
    if (first.get(file) !== second.get(file)) {
        throw new Error(`Non-reproducible artifact: ${file} (${first.get(file)} != ${second.get(file)})`);
    }
}
console.log('All release artifacts are byte-for-byte reproducible.');
