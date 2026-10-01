import {DEFAULT_SETTINGS, normalizeSettings} from '../src/settings.mjs';

export async function runUserscriptPanelBrowserTests() {
    const results = [];
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const waitFor = async (condition) => {
        const deadline = performance.now() + 5000;
        while (!condition()) {
            if (performance.now() > deadline) throw new Error('Timed out waiting for stored settings or rendering');
            await new Promise((resolve) => setTimeout(resolve, 10));
        }
    };
    const open = () => Object.entries(globalThis.blackcatCommands).find(([label]) => label.startsWith('⚙️'))[1]();
    const root = () => document.querySelector('#blackcat-settings-panel').shadowRoot;
    const control = (key) => root().querySelector(`[data-setting="${key}"]`);
    const renderingStyles = () => [...document.querySelectorAll('style.darkreader')]
        .map((style) => style.textContent)
        .join('\n');
    const expectedMode = (engine) => engine === 'dynamicTheme' ? 'dynamic' : engine === 'staticTheme' ? 'static' : 'filter';
    const change = (key, value) => {
        const input = control(key);
        if (input.type === 'checkbox') input.checked = value;
        else input.value = String(value);
        input.dispatchEvent(new Event(['range', 'text', 'number', 'color'].includes(input.type) ? 'input' : 'change', {bubbles: true}));
    };
    await waitFor(() => Object.keys(globalThis.blackcatCommands || {}).length === 3);
    await waitFor(() => globalThis.BlackcatDarkReaderEngine.isEnabled());
    assert(!document.getElementById('blackcat-prepaint'), 'Userscript must not inject a temporary background');
    results.push('self-contained engine initializes normally');
    open();
    const initialSettingsCommand = Object.entries(globalThis.blackcatCommands).find(([label]) => label.startsWith('⚙️'))[1];
    change('detectDarkTheme', false);
    await waitFor(() => globalThis.blackcatStoredSettings()?.detectDarkTheme === false);
    globalThis.blackcatStorageDelay = 80;
    const originalRender = renderingStyles();
    change('brightness', 115);
    assert(renderingStyles() !== originalRender, 'Theme must change synchronously, before storage resolves');
    assert(globalThis.blackcatStoredSettings().brightness === 100, 'Test storage must still be pending');
    await waitFor(() => globalThis.blackcatStoredSettings()?.brightness === 115);
    results.push('built adapter applies changes before storage resolves');

    const beforeDrag = renderingStyles();
    for (let value = 116; value <= 130; value++) change('brightness', value);
    await waitFor(() => globalThis.blackcatStoredSettings().brightness === 130);
    assert(renderingStyles() !== beforeDrag, 'Fast dragging must retain the final appearance');
    globalThis.blackcatStorageDelay = 0;
    assert(Object.entries(globalThis.blackcatCommands).find(([label]) => label.startsWith('⚙️'))[1] === initialSettingsCommand, 'Slider changes must not rebuild unchanged native menus');
    results.push('rapid slider changes retain the final persisted value without rebuilding menus');

    for (const engine of ['cssFilter', 'svgFilter', 'staticTheme', 'dynamicTheme']) {
        change('engine', engine);
        await waitFor(() => globalThis.blackcatStoredSettings().engine === engine);
        await waitFor(() => globalThis.BlackcatDarkReaderEngine.isEnabled());
        assert(document.documentElement.getAttribute('data-darkreader-mode') === expectedMode(engine), `Engine did not render: ${engine}`);
    }
    await waitFor(() => globalThis.blackcatStoredSettings().engine === 'dynamicTheme');
    results.push('all four rendering engines remain usable');

    const beforeLanguage = renderingStyles();
    change('language', 'zh-CN');
    assert(root().querySelector('[role="dialog"]').lang === 'zh-CN', 'Open window must translate immediately');
    assert(Object.keys(globalThis.blackcatCommands).includes('⚙️ 更多设置'), 'Menu labels must translate immediately');
    assert(Object.keys(globalThis.blackcatCommands).length === 3, 'Menu must contain only site, global and settings commands');
    assert(renderingStyles() === beforeLanguage, 'UI-only changes must not rebuild the rendering engine');
    await waitFor(() => globalThis.blackcatStoredSettings().language === 'zh-CN');
    root().querySelector('[data-action="close"]').click();
    open();
    assert(control('brightness').value === '130' && control('language').value === 'zh-CN', 'Reopening must retain changes');
    results.push('live translation, unchanged menu count and reopen persistence');

    change('siteThemeOnly', true);
    change('brightness', 80);
    await waitFor(() => globalThis.blackcatStoredSettings().siteThemes[location.hostname]?.brightness === 80);
    assert(globalThis.blackcatStoredSettings().brightness === 130, 'Site theme must leave the global value alone');
    change('siteThemeOnly', false);
    assert(control('brightness').value === '130', 'Global theme should return instantly');
    results.push('site theme changes apply and persist independently');

    change('automation.mode', 'system');
    const systemDark = matchMedia('(prefers-color-scheme: dark)').matches;
    assert(globalThis.BlackcatDarkReaderEngine.isEnabled() === systemDark, 'System automation must choose the current system state');
    change('automation.mode', 'time');
    change('automation.activation', '00:00');
    change('automation.deactivation', '00:00');
    assert(!globalThis.BlackcatDarkReaderEngine.isEnabled(), 'An empty time window must disable the dark theme');
    change('location.latitude', 30);
    change('location.longitude', 120);
    change('automation.mode', 'location');
    const night = globalThis.BlackcatDarkReaderEngine.isNightAtLocation(30, 120, new Date());
    assert(globalThis.BlackcatDarkReaderEngine.isEnabled() === night, 'Location automation must only enable or disable the dark theme');
    change('automation.mode', 'none');
    await waitFor(() => globalThis.blackcatStoredSettings().automation.mode === 'none');
    results.push('system, schedule and location automation apply immediately');

    const globalCommand = () => Object.entries(globalThis.blackcatCommands).find(([label]) => label.startsWith('🌍'))[1];
    globalCommand()();
    assert(!globalThis.BlackcatDarkReaderEngine.isEnabled(), 'The existing global menu must still disable the engine immediately');
    await waitFor(() => globalThis.blackcatStoredSettings().enabled === false);
    globalCommand()();
    await waitFor(() => globalThis.blackcatStoredSettings().enabled === true && globalThis.BlackcatDarkReaderEngine.isEnabled());
    results.push('global enablement remains available through the existing menu');

    globalThis.blackcatStorageFailure = true;
    change('language', 'en');
    await waitFor(() => !root().querySelector('[role="status"]').hidden);
    globalThis.blackcatStorageFailure = false;
    change('language', 'zh-CN');
    await waitFor(() => root().querySelector('[role="status"]').hidden && globalThis.blackcatStoredSettings().language === 'zh-CN');
    results.push('storage failures remain visible and recoverable');

    globalThis.blackcatRemoteSettings(normalizeSettings({language: 'en', contrast: 120, detectDarkTheme: false}));
    assert(control('contrast').value === '120' && root().querySelector('[role="dialog"]').lang === 'en', 'Remote settings must refresh open controls');
    globalThis.blackcatRemoteSettings(normalizeSettings({language: 'en', siteOverrides: {'other.com': false}, siteThemes: {'other.com': {brightness: 85}}}));
    change('brightness', 125);
    root().querySelector('[data-tab="other"]').click();
    assert(root().querySelector('[data-page="other"] [data-action="initialize"]'), 'Initialize should be in Other');
    root().querySelector('[data-action="initialize"]').click();
    await waitFor(() => JSON.stringify(globalThis.blackcatStoredSettings()) === JSON.stringify(normalizeSettings(DEFAULT_SETTINGS)));
    assert(root().querySelectorAll('.field.changed').length === 0, 'Initialize should clear all difference markers');
    assert(Object.keys(globalThis.blackcatCommands).length === 3, 'Initialize should preserve the three-item menu');
    results.push('remote updates and full initialization after pending changes');

    return results;
}
