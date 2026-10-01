import {existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import replace from '@rollup/plugin-replace';
import typescript from '@rollup/plugin-typescript';
import {rollup} from 'rollup';
import {build as viteBuild} from 'vite';
import ts from 'typescript';
import {minify} from 'terser';
import {ensureUpstream} from './ensure-upstream.mjs';
import {createUserscriptMetadata} from './metadata.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJSON = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const upstreamPin = JSON.parse(readFileSync(path.join(projectRoot, 'upstream.json'), 'utf8'));
const releaseRef = process.argv.slice(2).find((arg) => arg.startsWith('--ref='))?.slice('--ref='.length) || 'main';
const upstreamPath = ensureUpstream(projectRoot, upstreamPin);
const upstreamSource = path.join(upstreamPath, 'src');
const buildCache = path.join(projectRoot, '.cache', 'blackcat-build');
const configModulePath = path.join(buildCache, 'darkreader-config.ts');
const tsconfigPath = path.join(buildCache, 'tsconfig.json');
const dist = path.join(projectRoot, 'dist');
const replacementValues = {
    __DEBUG__: 'false',
    __TEST__: 'false',
    __CHROMIUM_MV2__: 'false',
    __CHROMIUM_MV3__: 'false',
    __FIREFOX_MV2__: 'false',
    __THUNDERBIRD__: 'false',
    __PLUS__: 'false',
};

function replacementPlugin() {
    return replace({preventAssignment: true, values: replacementValues});
}

function readConfig(name) {
    return readFileSync(path.join(upstreamSource, 'config', name), 'utf8');
}

function resolveFile(base) {
    const candidates = [base, ...['.ts', '.tsx', '.js', '.mjs', '.json'].map((ext) => `${base}${ext}`),
        ...['index.ts', 'index.tsx', 'index.js'].map((file) => path.join(base, file))];
    return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

function darkReaderResolver() {
    return {
        name: 'blackcat-dark-reader-resolver',
        resolveId(id, importer) {
            let target;
            if (id === '@blackcat/config') {
                target = configModulePath;
            } else if (id.startsWith('@darkreader/')) {
                target = path.join(upstreamSource, id.slice('@darkreader/'.length));
            } else if (id === '@plus/utils/theme') {
                target = path.join(projectRoot, 'src/plus-theme-stub.ts');
            } else if (id.startsWith('@plus/')) {
                target = path.join(upstreamSource, 'stubs', id.slice('@plus/'.length));
            } else if (importer?.startsWith(upstreamSource) && !id.startsWith('.') && !id.startsWith('/') && !id.startsWith('\0')) {
                target = path.join(upstreamSource, id);
            } else if (id.startsWith('.') && importer) {
                target = path.resolve(path.dirname(importer), id);
            }
            return target ? resolveFile(target) || null : null;
        },
    };
}

mkdirSync(buildCache, {recursive: true});
mkdirSync(dist, {recursive: true});
writeFileSync(configModulePath, [
    `export const detectorHints = ${JSON.stringify(readConfig('detector-hints.config'))};`,
    `export const dynamicThemeFixes = ${JSON.stringify(readConfig('dynamic-theme-fixes.config'))};`,
    `export const inversionFixes = ${JSON.stringify(readConfig('inversion-fixes.config'))};`,
    `export const staticThemes = ${JSON.stringify(readConfig('static-themes.config'))};`,
].join('\n'));
writeFileSync(tsconfigPath, JSON.stringify({
    compilerOptions: {
        target: 'ES2020',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        ignoreDeprecations: '6.0',
        baseUrl: projectRoot,
        paths: {
            '@darkreader/*': [path.join(upstreamSource, '*')],
            '@plus/utils/theme': [path.join(projectRoot, 'src/plus-theme-stub.ts')],
            '@plus/*': [path.join(upstreamSource, 'stubs', '*')],
            '@blackcat/config': [configModulePath],
        },
        lib: ['ES2022', 'DOM', 'DOM.Iterable'],
        types: ['chrome'],
        rootDir: projectRoot,
        outDir: path.join(buildCache, 'js'),
        noEmit: false,
        noEmitOnError: true,
        declaration: false,
        sourceMap: false,
        strict: false,
        skipLibCheck: true,
        allowJs: true,
        resolveJsonModule: true,
        jsx: 'react',
        jsxFactory: 'm',
    },
    include: [path.join(projectRoot, 'src/engine-entry.ts'), path.join(projectRoot, 'src/virtual.d.ts')],
}, null, 2));

const upstreamBundle = await rollup({
    input: path.join(projectRoot, 'src/engine-entry.ts'),
    plugins: [
        darkReaderResolver(),
        typescript({
            typescript: ts,
            tsconfig: tsconfigPath,
            compilerOptions: {noEmit: false, noEmitOnError: true, declaration: false, sourceMap: false},
        }),
        replacementPlugin(),
    ],
    onwarn(warning, warn) {
        if (warning.code === 'UNRESOLVED_IMPORT') {
            throw new Error(warning.message);
        }
        warn(warning);
    },
});
const engineOutput = await upstreamBundle.generate({
    format: 'iife',
    name: 'BlackcatDarkReaderEngine',
    exports: 'default',
    compact: true,
    banner: `/*! Blackcat Dark Reader engine | Dark Reader ${upstreamPin.version} | MIT | source ${upstreamPin.commit} */`,
});
const minifiedEngine = await minify(engineOutput.output.find((chunk) => chunk.type === 'chunk').code, {
    ecma: 2020,
    compress: {passes: 2},
    mangle: true,
    format: {comments: /^!/},
});
if (!minifiedEngine.code) {
    throw new Error('Terser produced no engine output');
}
writeFileSync(path.join(dist, 'engine.js'), `${minifiedEngine.code}\n`);
await upstreamBundle.close();

const selfContainedDir = path.join(buildCache, 'self-contained');
await viteBuild({
    configFile: false,
    root: projectRoot,
    publicDir: false,
    logLevel: 'warn',
    plugins: [
        darkReaderResolver(),
        replacementPlugin(),
    ],
    build: {
        lib: {
            entry: path.join(projectRoot, 'src/bundle-entry.mjs'),
            name: 'BlackcatUserscript',
            formats: ['iife'],
            fileName: 'blackcat-bundle',
        },
        target: 'es2020',
        outDir: selfContainedDir,
        emptyOutDir: true,
        cssCodeSplit: false,
        assetsInlineLimit: Number.POSITIVE_INFINITY,
        minify: false,
        sourcemap: false,
        reportCompressedSize: false,
        rollupOptions: {
            onwarn(warning, warn) {
                if (warning.code === 'UNRESOLVED_IMPORT') throw new Error(warning.message);
                warn(warning);
            },
            output: {
                inlineDynamicImports: true,
            },
        },
    },
});
const bundleFiles = readdirSync(selfContainedDir);
if (bundleFiles.length !== 1 || !bundleFiles[0].endsWith('.js')) {
    throw new Error(`Expected one self-contained Vite JavaScript output, received: ${bundleFiles.join(', ') || 'none'}`);
}
const engineBanner = `/*! Blackcat Dark Reader engine | Dark Reader ${upstreamPin.version} | MIT | source ${upstreamPin.commit} */`;
const bundleCode = `${engineBanner}\n${readFileSync(path.join(selfContainedDir, bundleFiles[0]), 'utf8')}`;
const minifiedUserscript = await minify(bundleCode, {
    ecma: 2020,
    compress: {passes: 2},
    mangle: true,
    format: {comments: /^!/},
});
if (!minifiedUserscript.code) throw new Error('Terser produced no userscript output');
writeFileSync(path.join(dist, 'blackcat.user.js'), [
    createUserscriptMetadata({version: packageJSON.version, releaseRef}),
    minifiedUserscript.code,
    '',
].join('\n'));

writeFileSync(path.join(dist, 'upstream.json'), `${JSON.stringify({
    name: upstreamPin.name,
    version: upstreamPin.version,
    repository: upstreamPin.repository,
    commit: upstreamPin.commit,
    license: upstreamPin.license,
}, null, 2)}\n`);
writeFileSync(path.join(dist, 'DARK-READER-LICENSE.txt'), readFileSync(path.join(upstreamPath, 'LICENSE')));
console.log(`Built Blackcat ${packageJSON.version} against Dark Reader ${upstreamPin.version} (${upstreamPin.commit})`);
console.log(`Install script: ${path.relative(projectRoot, path.join(dist, 'blackcat.user.js'))}`);
