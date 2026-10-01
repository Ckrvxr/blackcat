import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync} from 'node:fs';
import path from 'node:path';

function git(cwd, args) {
    return execFileSync('git', ['-C', cwd, ...args], {encoding: 'utf8'}).trim();
}

export function verifyUpstream(sourcePath, pin) {
    if (!existsSync(path.join(sourcePath, '.git'))) {
        throw new Error(`Dark Reader source is not a Git checkout: ${sourcePath}`);
    }
    const commit = git(sourcePath, ['rev-parse', 'HEAD']);
    if (commit !== pin.commit) {
        throw new Error(`Dark Reader checkout mismatch: expected ${pin.commit}, got ${commit}`);
    }
    if (git(sourcePath, ['status', '--porcelain'])) {
        throw new Error('Dark Reader checkout has local modifications; use a clean pinned source tree.');
    }
    const pkg = JSON.parse(readFileSync(path.join(sourcePath, 'package.json'), 'utf8'));
    if (pkg.version !== pin.version) {
        throw new Error(`Dark Reader version mismatch: expected ${pin.version}, got ${pkg.version}`);
    }
    return sourcePath;
}

export function ensureUpstream(projectRoot, pin) {
    const configured = process.env.DARKREADER_SOURCE;
    const candidates = [configured, path.join(projectRoot, '.ref', 'darkreader'), path.join(projectRoot, '.cache', 'darkreader')]
        .filter(Boolean);
    const existing = candidates.find((candidate) => existsSync(candidate));
    if (existing) {
        return verifyUpstream(path.resolve(existing), pin);
    }

    const cacheRoot = path.join(projectRoot, '.cache');
    const checkout = path.join(cacheRoot, 'darkreader');
    mkdirSync(cacheRoot, {recursive: true});
    execFileSync('git', ['clone', '--filter=blob:none', '--no-checkout', pin.repository, checkout], {stdio: 'inherit'});
    execFileSync('git', ['-C', checkout, 'checkout', '--detach', pin.commit], {stdio: 'inherit'});
    return verifyUpstream(checkout, pin);
}
