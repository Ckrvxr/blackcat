import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve, sep, extname} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execute = promisify(execFile);
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const run = async (...args) => {
    const {stdout} = await execute('agent-browser', args, {env: process.env, timeout: 60_000, maxBuffer: 1024 * 1024});
    return stdout;
};
const server = createServer(async (request, response) => {
    try {
        const url = new URL(request.url, 'http://localhost');
        const pathname = decodeURIComponent(url.pathname);
        const path = resolve(projectRoot, `.${pathname}`);
        if (!path.startsWith(resolve(projectRoot) + sep)) throw new Error('Outside fixture root');
        const content = await readFile(path);
        // Mirror Vite's raw asset imports for the unbundled panel tests.
        const raw = extname(path) === '.svg' && url.searchParams.has('raw');
        const mime = raw ? 'text/javascript' : {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml'}[extname(path)] || 'application/octet-stream';
        response.writeHead(200, {'Content-Type': `${mime}; charset=utf-8`, 'Cache-Control': 'no-store'});
        response.end(raw ? `export default ${JSON.stringify(content.toString('utf8'))};` : content);
    } catch {
        response.writeHead(404);
        response.end('Not found');
    }
});
let browserStarted = false;
try {
    process.env.AGENT_BROWSER_SESSION = (await run('session', 'id', '--scope', 'worktree', '--prefix', 'blackcat-tests')).trim();
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    const url = `http://127.0.0.1:${server.address().port}/tests/fixtures/smoke.html`;
    for (const [module, entrypoint] of [['settings-panel.browser', 'runPanelBrowserTests'], ['userscript-panel.browser', 'runUserscriptPanelBrowserTests']]) {
        browserStarted = true;
        await run('open', `${url}?lang=zh-CN`);
        const result = JSON.parse(await run('--json', 'eval', `import('/tests/${module}.mjs').then(m=>m.${entrypoint}())`));
        if (!result.success) throw new Error(result.error || 'Browser test failed');
        console.log(`${module}:`, result.data.result);
        const errors = JSON.parse(await run('--json', 'eval', 'globalThis.blackcatRuntimeErrors'));
        if (!errors.success || errors.data.result.length) throw new Error(`Unexpected browser errors: ${JSON.stringify(errors.data?.result)}`);
    }
    // Repeat the actual layout at a narrow viewport to catch horizontal overflow.
    await run('set', 'viewport', '360', '640');
    const responsive = JSON.parse(await run('--json', 'eval', `(() => {
        const root = document.querySelector('#blackcat-settings-panel').shadowRoot;
        const panel = root.querySelector('[role="dialog"]');
        for (const name of ['site', 'global']) {
            root.querySelector('[data-tab="' + name + '"]').click();
            const bounds = panel.getBoundingClientRect();
            const page = root.querySelector('[data-page="' + name + '"]');
            if (bounds.left < 0 || bounds.right > innerWidth || bounds.bottom > innerHeight || panel.scrollWidth > panel.clientWidth || page.scrollWidth > page.clientWidth)
                throw new Error('Floating panel overflows a narrow viewport: ' + name);
        }
        return 'Narrow viewport: both tabs fit';
    })()`));
    if (!responsive.success) throw new Error(responsive.error || 'Responsive test failed');
    console.log(responsive.data.result);
} finally {
    if (browserStarted) await run('close').catch(() => {});
    await new Promise((done) => server.close(done));
}
