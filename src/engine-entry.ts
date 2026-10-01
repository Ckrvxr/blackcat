import '@darkreader/api/chrome';
import {setFetchMethod} from '@darkreader/api/fetch';
import {DEFAULT_THEME} from '@darkreader/defaults';
import type {Theme} from '@darkreader/definitions';
import {ThemeEngine} from '@darkreader/generators/theme-engines';
import createCSSFilterStylesheet from '@darkreader/generators/css-filter';
import {getInversionFixesFor} from '@darkreader/generators/css-filter';
import {getDynamicThemeFixesFor} from '@darkreader/generators/dynamic-theme';
import {getDetectorHintsFor} from '@darkreader/generators/detector-hints';
import createStaticStylesheet from '@darkreader/generators/static-theme';
import {createSVGFilterStylesheet, getSVGFilterMatrixValue, getSVGReverseFilterMatrixValue} from '@darkreader/generators/svg-filter';
import {indexSitesFixesConfig} from '@darkreader/generators/utils/parse';
import {isNightAtLocation, nextTimeChangeAtLocation} from '@darkreader/utils/time';
import {createOrUpdateDynamicTheme, removeDynamicTheme} from '@darkreader/inject/dynamic-theme';
import {createOrUpdateStyle, removeStyle} from '@darkreader/inject/style';
import {createOrUpdateSVGFilter, removeSVGFilter} from '@darkreader/inject/svg-filter';
import {runDarkThemeDetector, stopDarkThemeDetector} from '@darkreader/inject/detector';
import {detectorHints, dynamicThemeFixes, inversionFixes, staticThemes} from '@blackcat/config';

setFetchMethod((url) => globalThis.fetch(url));

const dynamicFixesIndex = indexSitesFixesConfig(dynamicThemeFixes);
const detectorHintsIndex = indexSitesFixesConfig(detectorHints);
const inversionFixesIndex = indexSitesFixesConfig(inversionFixes);
const staticThemesIndex = indexSitesFixesConfig(staticThemes);
let enabled = false;
let applyRevision = 0;

function isTopFrame(): boolean {
    try {
        return window.self === window.top;
    } catch {
        return false;
    }
}

function removeTheme(): void {
    applyRevision++;
    stopDarkThemeDetector();
    removeDynamicTheme();
    removeSVGFilter();
    removeStyle();
    enabled = false;
}

function applyTheme(options: Partial<Theme> & {detectDarkTheme?: boolean} = {}): void {
    const {detectDarkTheme = true, ...themeOptions} = options;
    const theme = {...DEFAULT_THEME, ...themeOptions} as Theme;
    const url = window.location.href;
    const topFrame = isTopFrame();

    removeTheme();
    const currentRevision = applyRevision;
    const applyEngine = () => {
        if (currentRevision !== applyRevision) return;
        switch (theme.engine) {
            case ThemeEngine.dynamicTheme: {
                const fixes = getDynamicThemeFixesFor(url, dynamicThemeFixes, dynamicFixesIndex, true);
                createOrUpdateDynamicTheme(theme, fixes, !topFrame);
                break;
            }
            case ThemeEngine.cssFilter: {
                const css = createCSSFilterStylesheet(theme, url, topFrame, inversionFixes, inversionFixesIndex);
                createOrUpdateStyle(css, 'filter');
                break;
            }
            case ThemeEngine.svgFilter: {
                const css = createSVGFilterStylesheet(theme, url, topFrame, inversionFixes, inversionFixesIndex);
                createOrUpdateSVGFilter(getSVGFilterMatrixValue(theme), getSVGReverseFilterMatrixValue());
                createOrUpdateStyle(css, 'filter');
                break;
            }
            case ThemeEngine.staticTheme: {
                const css = createStaticStylesheet(theme, url, topFrame, staticThemes, staticThemesIndex);
                createOrUpdateStyle(css, 'static');
                break;
            }
            default:
                throw new TypeError(`Unsupported Dark Reader theme engine: ${String(theme.engine)}`);
        }
        enabled = true;
    };

    if (!detectDarkTheme) {
        applyEngine();
        return;
    }

    const hints = getDetectorHintsFor(url, detectorHints, detectorHintsIndex);
    runDarkThemeDetector((hasDarkTheme) => {
        if (!hasDarkTheme) applyEngine();
    }, hints || []);
}

const api = Object.freeze({
    upstreamVersion: '4.9.133',
    engines: Object.freeze(Object.values(ThemeEngine)),
    isNightAtLocation,
    nextTimeChangeAtLocation,
    apply: applyTheme,
    disable: removeTheme,
    isEnabled: () => enabled,
});

export default api;
