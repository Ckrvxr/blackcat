const SAFE_REF = /^[A-Za-z0-9._-]+$/;
const SAFE_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export function createUserscriptMetadata({version, releaseRef}) {
    if (!SAFE_VERSION.test(version)) {
        throw new TypeError('version must be a valid semver version');
    }
    if (typeof releaseRef !== 'string' || !SAFE_REF.test(releaseRef)) {
        throw new TypeError('releaseRef may contain only letters, digits, dots, underscores, and hyphens');
    }

    const base = `https://raw.githubusercontent.com/Ckrvxr/blackcat/${releaseRef}/dist`;
    return [
        '// ==UserScript==',
        '// @name         Blackcat: Dark Reader UserScript Ported Version',
        '// @namespace    https://github.com/Ckrvxr/blackcat',
        '// @version      ' + version,
        '// @description  Unified Dark Mode support for any sites',
        '// @match        *://*/*',
        '// @run-at       document-start',
        '// @grant        GM_getValue',
        '// @grant        GM_setValue',
        '// @grant        GM_registerMenuCommand',
        '// @grant        GM_unregisterMenuCommand',
        '// @grant        GM_addValueChangeListener',
        `// @updateURL    ${base}/blackcat.user.js`,
        `// @downloadURL  ${base}/blackcat.user.js`,
        '// ==/UserScript==',
    ].join('\n');
}
