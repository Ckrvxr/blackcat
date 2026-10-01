const SAFE_REF = /^[A-Za-z0-9._-]+$/;
const SAFE_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export function createUserscriptMetadata({version, assetRef}) {
    if (!SAFE_VERSION.test(version)) {
        throw new TypeError('version must be a valid semver version');
    }
    if (!SAFE_REF.test(assetRef)) {
        throw new TypeError('assetRef may contain only letters, digits, dots, underscores, and hyphens');
    }

    const base = `https://raw.githubusercontent.com/Ckrvxr/blackcat/${assetRef}/dist`;
    const engine = `https://cdn.jsdelivr.net/gh/Ckrvxr/blackcat@${assetRef}/dist/engine.js`;
    return [
        '// ==UserScript==',
        '// @name         Blackcat Dark Reader',
        '// @namespace    https://github.com/Ckrvxr/blackcat',
        '// @version      ' + version,
        '// @description  Dark Reader page themes / 网页深色主题',
        '// @match        *://*/*',
        '// @run-at       document-start',
        '// @grant        GM_getValue',
        '// @grant        GM_setValue',
        '// @grant        GM_registerMenuCommand',
        '// @grant        GM_unregisterMenuCommand',
        '// @grant        GM_addValueChangeListener',
        `// @require      ${engine}`,
        `// @updateURL    ${base}/blackcat.user.js`,
        `// @downloadURL  ${base}/blackcat.user.js`,
        '// ==/UserScript==',
    ].join('\n');
}
