import {isWithinTimeWindow, normalizeSettings, resolveSiteEnabled} from './settings.mjs';

const SETTINGS_KEY = 'blackcat.settings.v1';
const STYLE_ID = 'blackcat-prepaint';
const READY_EVENT = 'blackcat:theme-ready';
const INSTALLED_EVENT = 'blackcat:prepaint-installed';
const FALLBACK_TIMEOUT_MS = 3_000;

function isTopFrame() {
    try {
        return window.self === window.top;
    } catch {
        return false;
    }
}

function shouldPrepaint() {
    try {
        const settings = globalThis.GM_getValue?.(SETTINGS_KEY, null);
        if (settings && typeof settings.then === 'function') {
            settings.catch?.(() => {});
            return true;
        }
        const normalized = normalizeSettings(settings);
        if (!normalized.enabled || !resolveSiteEnabled(normalized, location.href)) return false;

        const {mode, behavior, activation, deactivation} = normalized.automation;
        if (behavior !== 'OnOff') return true;
        if (mode === 'system') return globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.matches === true;
        if (mode === 'time') return isWithinTimeWindow(activation, deactivation);
        if (mode === 'location') return false;
        return true;
    } catch {
        return true;
    }
}

function installPrepaint() {
    if (!isTopFrame() || !shouldPrepaint() || document.getElementById(STYLE_ID)) return;

    let style;
    let observer;
    let timeout;
    const remove = () => {
        observer?.disconnect();
        clearTimeout(timeout);
        document.removeEventListener(READY_EVENT, remove);
        style?.remove();
    };
    const addStyle = () => {
        if (!document.documentElement || style) return Boolean(style);
        style = document.createElement('style');
        style.id = STYLE_ID;
        style.className = 'darkreader darkreader--blackcat-prepaint';
        style.textContent = 'html,body{background-color:#181a1b!important;color:#e8e6e3!important;color-scheme:dark!important}';
        (document.head || document.documentElement).append(style);
        observer?.disconnect();
        observer = undefined;
        document.dispatchEvent(new Event(INSTALLED_EVENT));
        return true;
    };

    document.addEventListener(READY_EVENT, remove, {once: true});
    timeout = setTimeout(remove, FALLBACK_TIMEOUT_MS);
    if (!addStyle()) {
        observer = new MutationObserver(addStyle);
        observer.observe(document, {childList: true, subtree: true});
    }
}

installPrepaint();
