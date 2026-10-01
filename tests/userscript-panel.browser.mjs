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
    const change = (key, value) => {
        const input = control(key);
        if (input.type === 'checkbox') input.checked = value;
        else input.value = String(value);
        input.dispatchEvent(new Event(['range', 'text', 'number', 'color'].includes(input.type) ? 'input' : 'change', {bubbles: true}));
    };
    await waitFor(() => Object.keys(globalThis.blackcatCommands || {}).length === 4);
    open();
    const initialSettingsCommand = Object.entries(globalThis.blackcatCommands).find(([label]) => label.startsWith('⚙️'))[1];
    change('detectDarkTheme', false);
    await waitFor(() => globalThis.blackcatStoredSettings()?.detectDarkTheme === false);
    globalThis.blackcatStorageDelay = 80;
    change('brightness', 115);
    assert(globalThis.blackcatThemeApplications.at(-1).brightness === 115, 'Theme must change synchronously, before storage resolves');
    assert(globalThis.blackcatStoredSettings().brightness === 100, 'Test storage must still be pending');
    await waitFor(() => globalThis.blackcatStoredSettings()?.brightness === 115);
    results.push('built adapter applies changes before storage resolves');

    for (let value = 116; value <= 130; value++) change('brightness', value);
    await waitFor(() => globalThis.blackcatStoredSettings().brightness === 130);
    assert(globalThis.blackcatThemeApplications.at(-1).brightness === 130, 'Fast dragging must retain the final appearance');
    globalThis.blackcatStorageDelay = 0;
    assert(Object.entries(globalThis.blackcatCommands).find(([label]) => label.startsWith('⚙️'))[1] === initialSettingsCommand, 'Slider changes must not rebuild unchanged native menus');
    results.push('rapid slider changes retain the final persisted value without rebuilding menus');

    for (const engine of ['cssFilter', 'svgFilter', 'staticTheme', 'dynamicTheme']) {
        change('engine', engine);
        await waitFor(() => globalThis.BlackcatDarkReaderEngine.isEnabled());
        assert(globalThis.blackcatThemeApplications.at(-1).engine === engine, `Engine did not apply: ${engine}`);
    }
    await waitFor(() => globalThis.blackcatStoredSettings().engine === 'dynamicTheme');
    results.push('all four rendering engines remain usable');

    const beforeLanguage = globalThis.blackcatThemeApplications.length;
    change('language', 'zh-CN');
    assert(root().querySelector('[role="dialog"]').lang === 'zh-CN', 'Open window must translate immediately');
    assert(Object.keys(globalThis.blackcatCommands).includes('⚙️ 更多设置'), 'Menu labels must translate immediately');
    assert(Object.keys(globalThis.blackcatCommands).length === 4, 'No menu item may be added');
    assert(globalThis.blackcatThemeApplications.length === beforeLanguage, 'UI-only changes must not rebuild the rendering engine');
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
    change('automation.behavior', 'Scheme');
    assert(globalThis.blackcatThemeApplications.at(-1).mode === (systemDark ? 1 : 0), 'Automation scheme behavior must choose dark or dimmed immediately');
    change('automation.mode', 'time');
    change('automation.activation', '00:00');
    change('automation.deactivation', '00:00');
    assert(globalThis.blackcatThemeApplications.at(-1).mode === 0, 'An empty time window must choose the dimmed scheme');
    change('location.latitude', 30);
    change('location.longitude', 120);
    change('automation.mode', 'location');
    const night = globalThis.BlackcatDarkReaderEngine.isNightAtLocation(30, 120, new Date());
    assert(globalThis.blackcatThemeApplications.at(-1).mode === (night ? 1 : 0), 'Location automation must use the supplied coordinates');
    change('automation.mode', 'none');
    change('automation.behavior', 'OnOff');
    await waitFor(() => globalThis.blackcatStoredSettings().automation.mode === 'none' && globalThis.blackcatStoredSettings().automation.behavior === 'OnOff');
    results.push('system, schedule, location and dimmed automation apply immediately');

    globalThis.blackcatStorageFailure = true;
    change('enabled', false);
    assert(!globalThis.BlackcatDarkReaderEngine.isEnabled(), 'Disabling must be immediate even if storage fails');
    await waitFor(() => !root().querySelector('[role="status"]').hidden);
    globalThis.blackcatStorageFailure = false;
    change('enabled', true);
    await waitFor(() => root().querySelector('[role="status"]').hidden);
    results.push('storage failures remain visible and recoverable');

    globalThis.blackcatRemoteSettings(normalizeSettings({language: 'en', contrast: 120, detectDarkTheme: false}));
    assert(control('contrast').value === '120' && root().querySelector('[role="dialog"]').lang === 'en', 'Remote settings must refresh open controls');
    globalThis.blackcatRemoteSettings(normalizeSettings({language: 'en', siteOverrides: {'other.com': false}, siteThemes: {'other.com': {brightness: 85}}}));
    change('brightness', 125);
    root().querySelector('[data-action="initialize"]').click();
    await waitFor(() => JSON.stringify(globalThis.blackcatStoredSettings()) === JSON.stringify(normalizeSettings(DEFAULT_SETTINGS)));
    assert(root().querySelectorAll('.field.changed').length === 0, 'Initialize should clear all difference markers');
    assert(Object.keys(globalThis.blackcatCommands).length === 4, 'Initialize should preserve the four-item menu');
    results.push('remote updates and full initialization after pending changes');

    return results;
}
