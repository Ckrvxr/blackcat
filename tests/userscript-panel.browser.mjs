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
    const control = (key, scope = 'global') => root().querySelector(`[data-setting="${key}"][data-scope="${scope}"]`);
    const renderingStyles = () => [...document.querySelectorAll('style.darkreader')]
        .map((style) => style.textContent)
        .join('\n');
    const expectedMode = (engine) => engine === 'dynamicTheme' ? 'dynamic' : engine === 'staticTheme' ? 'static' : 'filter';
    const change = (key, value, scope = 'global') => {
        const input = control(key, scope);
        if (input.type === 'checkbox') input.checked = value;
        else input.value = String(value);
        const inputEvent = ['range', 'text', 'number'].includes(input.type) ? 'input' : 'change';
        input.dispatchEvent(new Event(inputEvent, {bubbles: true}));
        if (input.type === 'range') input.dispatchEvent(new Event('change', {bubbles: true}));
    };
    await waitFor(() => Object.keys(globalThis.blackcatCommands || {}).length === 3);
    const initialSystemDark = matchMedia('(prefers-color-scheme: dark)').matches;
    await waitFor(() => globalThis.BlackcatDarkReaderEngine.isEnabled() === initialSystemDark);
    assert(!document.getElementById('blackcat-prepaint'), 'Userscript must not inject a temporary background');
    results.push('system-following default initializes the engine');
    open();
    assert(control('automation.mode').value === 'system', 'Default automation should follow the system preference');
    change('automation.mode', 'none');
    await waitFor(() => globalThis.blackcatStoredSettings()?.automation.mode === 'none' && globalThis.BlackcatDarkReaderEngine.isEnabled());
    const initialSettingsCommand = Object.entries(globalThis.blackcatCommands).find(([label]) => label.startsWith('⚙️'))[1];
    change('detectDarkTheme', false);
    await waitFor(() => globalThis.blackcatStoredSettings()?.detectDarkTheme === false);
    globalThis.blackcatStorageDelay = 80;
    const originalRender = renderingStyles();
    const brightnessSlider = control('brightness');
    brightnessSlider.value = '115';
    brightnessSlider.dispatchEvent(new Event('input', {bubbles: true}));
    assert(renderingStyles() === originalRender, 'Dragging must not apply the theme before release');
    assert(globalThis.blackcatStoredSettings().brightness === 100, 'Dragging must not persist an uncommitted value');
    brightnessSlider.dispatchEvent(new Event('change', {bubbles: true}));
    assert(renderingStyles() !== originalRender, 'Theme must change synchronously on release, before storage resolves');
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
    assert(root().querySelector('.subtitle').textContent === '所有更改将即时生效并保存', 'Subtitle must explain that changes apply and save immediately');
    assert(Object.keys(globalThis.blackcatCommands).includes('⚙️ 所有设置'), 'Menu labels must translate immediately');
    assert(Object.keys(globalThis.blackcatCommands).length === 3, 'Menu must contain only site, global and settings commands');
    assert(renderingStyles() === beforeLanguage, 'UI-only changes must not rebuild the rendering engine');
    await waitFor(() => globalThis.blackcatStoredSettings().language === 'zh-CN');
    root().querySelector('[data-action="close"]').click();
    open();
    assert(control('brightness').value === '130' && control('language').value === 'zh-CN', 'Reopening must retain changes');
    results.push('live translation, unchanged menu count and reopen persistence');

    root().querySelector('[data-tab="site"]').click();
    const globalAppearance = renderingStyles();
    change('siteStyleMode', 'independent');
    await waitFor(() => globalThis.blackcatStoredSettings().siteThemeModes[location.hostname] === 'independent');
    change('brightness', 80, 'site');
    await waitFor(() => globalThis.blackcatStoredSettings().siteThemes[location.hostname]?.brightness === 80);
    assert(globalThis.blackcatStoredSettings().brightness === 130, 'Site style must leave the global value alone');
    await waitFor(() => renderingStyles() !== globalAppearance);
    const independentAppearance = renderingStyles();
    change('siteStyleMode', 'global');
    await waitFor(() => globalThis.blackcatStoredSettings().siteThemeModes[location.hostname] === 'global');
    await waitFor(() => renderingStyles() === globalAppearance);
    assert(globalThis.blackcatStoredSettings().siteThemes[location.hostname].brightness === 80, 'Following global must retain the independent style');
    change('siteStyleMode', 'independent');
    await waitFor(() => control('brightness', 'site').value === '80');
    await waitFor(() => renderingStyles() === independentAppearance);
    assert(control('brightness').value === '130', 'Global style controls must retain their own values');
    results.push('site style mode changes preserve and restore independent values');

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
    await waitFor(() => Object.keys(globalThis.blackcatCommands).length === 2);
    assert(!Object.keys(globalThis.blackcatCommands).some((label) => label.startsWith('🌐')), 'Site toggle menu must disappear when global mode is off');
    assert(control('siteEnabled').disabled && !root().querySelector('[data-global-required]').hidden, 'The open panel should explain that global mode is required');
    globalCommand()();
    await waitFor(() => globalThis.blackcatStoredSettings().enabled === true && globalThis.BlackcatDarkReaderEngine.isEnabled());
    await waitFor(() => Object.keys(globalThis.blackcatCommands).length === 3);
    assert(Object.keys(globalThis.blackcatCommands).some((label) => label.startsWith('🌐')), 'Site toggle menu should return when global mode is on');
    assert(!control('siteEnabled').disabled && root().querySelector('[data-global-required]').hidden, 'Re-enabling globally should clear the site guidance');
    results.push('global switch controls site menu visibility and site settings');

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
    root().querySelector('[data-tab="global"]').click();
    assert(root().querySelector('[data-page="global"] [data-action="clear"]'), 'Clear should be in Global settings');
    root().querySelector('[data-action="clear"]').click();
    await waitFor(() => JSON.stringify(globalThis.blackcatStoredSettings()) === JSON.stringify(normalizeSettings(DEFAULT_SETTINGS)));
    assert(root().querySelectorAll('.field.changed').length === 0, 'Clear should remove all difference markers');
    assert(Object.keys(globalThis.blackcatCommands).length === 3, 'Clear should preserve the three-item menu');
    results.push('remote updates and full clear after pending changes');

    return results;
}
