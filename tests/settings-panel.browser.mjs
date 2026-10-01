import {openSettingsPanel} from '../src/settings-panel.mjs';
import {DEFAULT_SETTINGS, normalizeSettings} from '../src/settings.mjs';
import {THEME_SETTING_KEYS, getPanelValue} from '../src/settings-panel-state.mjs';
import {serializeSettingsFile} from '../src/settings-file.mjs';

// Runs against real DOM controls in Chromium, not a mock DOM.
export async function runPanelBrowserTests() {
    const results = [];
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const host = () => document.querySelector('#blackcat-settings-panel');
    const root = () => host().shadowRoot;
    const control = (key, scope = 'global') => root().querySelector(`[data-setting="${key}"][data-scope="${scope}"]`);
    const change = async (key, value, scope = 'global') => {
        const input = control(key, scope);
        assert(input, `Missing setting: ${key}`);
        if (input.type === 'checkbox') input.checked = value;
        else input.value = String(value);
        const inputEvent = ['range', 'text', 'number'].includes(input.type) ? 'input' : 'change';
        input.dispatchEvent(new Event(inputEvent, {bubbles: true}));
        if (input.type === 'range') input.dispatchEvent(new Event('change', {bubbles: true}));
        await Promise.resolve();
    };
    const waitFor = async (condition) => {
        const deadline = performance.now() + 5000;
        while (!condition()) {
            if (performance.now() > deadline) throw new Error('Timed out waiting for configuration action');
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    };
    const selectImportFile = (text, name = 'settings.json') => {
        const input = root().querySelector('[data-action="import-file"]');
        const transfer = new DataTransfer();
        transfer.items.add(new File([text], name, {type: 'application/json'}));
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', {bubbles: true}));
    };
    const saved = [];
    let failWrite = false;
    const initial = normalizeSettings({language: 'en', siteOverrides: {'other.com': false}, siteThemes: {'other.com': {brightness: 85}}});
    host()?.remove();
    const panel = openSettingsPanel({settings: initial, hostname: location.hostname, onChange: async (next) => {
        if (failWrite) throw new Error('test write failure');
        saved.push(next);
    }});
    assert(root().querySelectorAll('[role="tab"]').length === 2, 'Site and global settings should be the only tabs');
    const tabList = root().querySelector('.tabs');
    const tabButtons = [...tabList.querySelectorAll('.tab')];
    const initialTabWidths = tabButtons.map((tab) => tab.getBoundingClientRect().width);
    assert(initialTabWidths.length === 2 && Math.abs(initialTabWidths[0] - initialTabWidths[1]) < 1, 'Tabs should divide the row equally when labels fit');
    const secondTabLabel = tabButtons[1].textContent;
    tabButtons[1].textContent = 'A'.repeat(100);
    const stretchedTabWidths = tabButtons.map((tab) => tab.getBoundingClientRect().width);
    assert(stretchedTabWidths[1] > stretchedTabWidths[0], 'A longer tab label should be allowed extra width');
    tabButtons[1].textContent = secondTabLabel;
    assert(root().querySelector('[data-tab="site"]').textContent === 'Site settings', 'Site settings tab should be named clearly');
    assert(root().querySelector('[data-tab="global"]').textContent === 'Global settings', 'Global settings tab should combine global controls');
    const currentSite = root().querySelector('.site-name');
    assert(currentSite.classList.contains('field') && currentSite.querySelector('.caption')?.textContent === 'Current site', 'Hostname should use the standard field-row layout');
    assert(currentSite.querySelector('.site-hostname')?.textContent === location.hostname, 'Current site row should show the hostname as its value');
    assert(root().querySelector('[data-page="global"] [data-setting="engine"]'), 'Theme controls should be inside Global settings');
    assert(root().querySelector('[data-page="global"] [data-setting="automation.mode"]'), 'Automation controls should be inside Global settings');
    assert(control('automation.mode').value === 'system', 'Automation should default to following the system preference');
    assert(root().querySelector('[data-page="global"] [data-setting="language"]'), 'Other settings should be inside Global settings');
    assert([...root().querySelectorAll('[data-page="global"] .section-title')].map((title) => title.textContent).join('|') === 'General|Style|Automation|Other', 'Merged settings should remain grouped into clear sections');
    assert([...root().querySelectorAll('[data-page="global"] .settings-section + .settings-section')].every((section) => getComputedStyle(section).borderTopWidth === '0px'), 'Section boundaries should not duplicate field dividers');
    assert(root().querySelector('[data-tab="site"]').getAttribute('aria-selected') === 'true', 'Site settings should open first');
    assert(!root().querySelector('footer, .live-note, .scope'), 'Obsolete notices must be removed');
    const configActions = root().querySelector('[data-page="global"] .config-buttons');
    const configButtons = [...configActions.querySelectorAll('button')];
    assert(configButtons.map((button) => button.dataset.action).join('|') === 'export|import|clear', 'Configuration actions should be ordered Export, Import, Clear');
    assert(getComputedStyle(configActions).borderTopWidth === '0px', 'Configuration actions should not add a divider after the language row');
    assert(root().querySelector('[data-page="global"] .config-label').textContent === 'Configuration file', 'Configuration actions need a clear label');
    assert(root().querySelector('[data-page="global"] [data-action="import-file"]')?.accept.includes('.json'), 'Import should accept JSON configuration files');
    const warningText = [...root().querySelectorAll('[data-page="global"] .config-warning')].map((warning) => warning.textContent).join('|');
    assert(warningText === '! Importing a configuration will overwrite all current settings.|! Clearing the configuration will clear all current settings.', 'Destructive actions should show warnings');
    const clearButton = root().querySelector('[data-page="global"] [data-action="clear"]');
    assert(clearButton, 'Clear should replace the previous initialize action');
    const removedTips = [
        'Choose whether this site follows the global style or uses its own settings.',
        'The global switch must also be on. This choice overrides the default site policy.',
        'Bold labels indicate values different from factory defaults.',
        'Restore all defaults and clear every saved site configuration.',
    ];
    assert(removedTips.every((tip) => !root().textContent.includes(tip)), 'Obsolete helper tips should be removed');
    assert(!clearButton.title && !clearButton.hasAttribute('aria-describedby'), 'Clear should not have obsolete helper text');
    assert(!control('enabled') && control('enabledByDefault'), 'The panel should expose the all-sites default, not the master switch');
    const globalPage = root().querySelector('[data-page="global"]');
    const generalSection = globalPage.querySelector('.settings-section');
    const styleSection = globalPage.querySelectorAll('.settings-section')[1];
    assert(generalSection.contains(control('enabledByDefault')) && generalSection.contains(control('detectDarkTheme')), 'General should group all-sites and dark-page settings');
    assert(!styleSection.contains(control('enabledByDefault')) && !styleSection.contains(control('detectDarkTheme')), 'General settings should not be mixed into Style');
    assert(globalPage.firstElementChild === generalSection && styleSection.contains(control('engine')), 'General should precede the Style section');
    assert(root().querySelector('[data-condition="independent"] [data-setting="detectDarkTheme"][data-scope="site"]'), 'Independent site styles should retain a local dark-page setting');
    assert(!root().querySelector('.global-switch'), 'The master switch should no longer sit above the tabs');
    const globalRequired = root().querySelector('[data-global-required]');
    assert(globalRequired?.hidden && !control('siteEnabled').disabled, 'Site settings should be available while global mode is on');
    await change('enabledByDefault', false);
    assert(saved.at(-1).enabledByDefault === false && getPanelValue(saved.at(-1), location.hostname, 'siteEnabled') === false, 'Disabling the all-sites default should disable sites without overrides');
    await change('enabledByDefault', true);
    assert(saved.at(-1).enabledByDefault === true && getPanelValue(saved.at(-1), location.hostname, 'siteEnabled') === true, 'Enabling the all-sites default should enable sites without overrides');
    for (const key of ['mode', 'styleSystemControls', 'darkSchemeBackgroundColor', 'darkSchemeTextColor', 'lightSchemeBackgroundColor', 'lightSchemeTextColor', 'selectionColor', 'scrollbarColor', 'automation.behavior']) {
        assert(!control(key), `Removed setting must not appear: ${key}`);
    }
    assert(!root().querySelector('.backdrop, [aria-modal="true"], button[type="submit"]'), 'The window must be nonmodal with no save/cancel flow');
    const bounds = root().querySelector('[role="dialog"]').getBoundingClientRect();
    assert(bounds.right <= innerWidth && bounds.top >= 0 && bounds.top < 40, 'The window must stay at top right');
    results.push('nonmodal floating layout and two tabs');

    for (const key of [...THEME_SETTING_KEYS, 'siteEnabled', 'siteStyleMode', 'language', 'automation.mode', 'automation.activation', 'automation.deactivation', 'location.latitude', 'location.longitude']) {
        assert(control(key), `Existing setting was lost: ${key}`);
        assert(control(key).labels?.length > 0, `Unlabelled control: ${key}`);
    }
    results.push('all settings retained with labels');

    for (const [key, value] of [
        ['engine', 'cssFilter'], ['contrast', 120], ['grayscale', 30], ['sepia', 25],
        ['detectDarkTheme', false], ['siteEnabled', false],
        ['automation.deactivation', '08:30'],
    ]) {
        await change(key, value);
        assert(getPanelValue(saved.at(-1), location.hostname, key) === value, `Setting failed to persist: ${key}`);
        assert(control(key).closest('.field').classList.contains('changed'), `Nondefault value was not marked: ${key}`);
    }
    panel.update(initial);
    results.push('each remaining setting applies without a save button');

    const siteTab = root().querySelector('[data-tab="site"]');
    siteTab.focus();
    siteTab.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}));
    assert(root().querySelector('[data-tab="global"]').getAttribute('aria-selected') === 'true', 'Arrow keys must move between tabs');
    root().querySelector('[data-tab="global"]').click();
    results.push('keyboard tab navigation');

    const sliderWritesBeforeDrag = saved.length;
    const brightnessSlider = control('brightness');
    brightnessSlider.value = '117';
    brightnessSlider.dispatchEvent(new Event('input', {bubbles: true}));
    assert(saved.length === sliderWritesBeforeDrag, 'Dragging must not apply or save the theme');
    assert(brightnessSlider.closest('.field').querySelector('output').value === '117%', 'Slider feedback should track the thumb while dragging');
    brightnessSlider.dispatchEvent(new Event('change', {bubbles: true}));
    assert(saved.at(-1).brightness === 117, 'Release must apply and save the final slider value');
    await change('brightness', 115);
    assert(saved.at(-1).brightness === 115, 'Slider must persist on release without save');
    assert(control('brightness').closest('.field').classList.contains('changed'), 'Changed slider label must become bold');
    assert(getComputedStyle(control('brightness').closest('.field').querySelector('.caption')).fontWeight === '700', 'Changed caption must have bold computed style');
    await change('brightness', 100);
    assert(!control('brightness').closest('.field').classList.contains('changed'), 'Factory value must remove bold');
    assert(getComputedStyle(control('brightness')).width === getComputedStyle(control('brightness').closest('.field')).width, 'Sliders must use the full row width');
    assert(getComputedStyle(root().querySelector('[role="dialog"]')).fontFamily.includes('system-ui'), 'Page fonts must not leak into the UI');
    results.push('release-to-apply sliders and factory-relative bold');

    root().querySelector('[data-tab="site"]').click();
    const independentSettings = root().querySelector('[data-condition="independent"]');
    assert(independentSettings.hidden, 'Independent controls should start hidden');
    assert(control('brightness', 'global').id !== control('brightness', 'site').id, 'Duplicate theme controls must have unique accessible ids');
    await change('siteStyleMode', 'independent');
    assert(!independentSettings.hidden, 'Independent controls should appear when selected');
    assert(control('brightness', 'site').value === '100', 'First independent style should copy the global values');
    await change('brightness', 85, 'site');
    assert(saved.at(-1).brightness === 100, 'Site edits must not change global appearance');
    assert(saved.at(-1).siteThemes[location.hostname].brightness === 85, 'Site edits must persist in this site');
    await change('siteStyleMode', 'global');
    assert(independentSettings.hidden, 'Independent controls should hide when following global');
    assert(saved.at(-1).siteThemes[location.hostname].brightness === 85, 'Following global must retain saved independent values');
    await change('brightness', 120);
    await change('siteStyleMode', 'independent');
    assert(control('brightness', 'site').value === '85', 'Returning to independent style should restore its saved values');
    assert(control('brightness').value === '120', 'Global style controls must remain independent');
    assert(saved.at(-1).siteThemes['other.com'].brightness === 85, 'Other sites must remain intact');
    results.push('site style mode, persistence and isolation');

    await change('automation.mode', 'time');
    assert(!control('automation.activation').closest('[data-condition]').hidden, 'Schedule should appear in time mode');
    assert(control('location.latitude').closest('[data-condition]').hidden, 'Coordinates should hide in time mode');
    await change('automation.activation', '19:30');
    assert(saved.at(-1).automation.activation === '19:30', 'Time input must persist on change');
    await change('automation.mode', 'location');
    await change('location.latitude', 30);
    await change('location.longitude', 120);
    assert(saved.at(-1).location.longitude === 120, 'Coordinates must persist');
    const writesBeforeInvalid = saved.length;
    await change('location.latitude', 999);
    assert(saved.length === writesBeforeInvalid && control('location.latitude').getAttribute('aria-invalid') === 'true', 'Invalid coordinates must not silently persist defaults');
    await change('location.latitude', '');
    assert(saved.at(-1).location.latitude === null, 'Empty coordinates should clear the location');
    results.push('conditional automation and input validation');

    root().querySelector('[data-tab="global"]').click();
    await change('language', 'zh-CN');
    assert(root().querySelector('[role="dialog"]').lang === 'zh-CN', 'Language must update while the panel stays open');
    assert(root().querySelector('[data-tab="global"]').textContent === '全局设置', 'Tab labels must translate immediately');
    assert(root().querySelector('[data-page="global"]').hidden === false, 'Language change must retain the active tab');
    results.push('live language changes');

    failWrite = true;
    await change('language', 'en');
    await Promise.resolve();
    assert(!root().querySelector('[role="status"]').hidden, 'Write errors must be visible');
    failWrite = false;
    await change('language', 'zh-CN');
    await Promise.resolve();
    assert(root().querySelector('[role="status"]').hidden, 'Successful retry should clear errors');
    results.push('storage error feedback and recovery');

    root().querySelector('[data-tab="global"]').click();
    const importedSettings = normalizeSettings({
        language: 'en', enabled: false, enabledByDefault: false, engine: 'svgFilter', brightness: 87,
        automation: {mode: 'time', activation: '20:15', deactivation: '07:30'},
        location: {latitude: 51.5, longitude: -0.12},
        siteOverrides: {'imported.example': false},
        siteThemes: {'imported.example': {brightness: 83}},
        siteThemeModes: {'imported.example': 'independent'},
    });
    selectImportFile(serializeSettingsFile(importedSettings));
    await waitFor(() => JSON.stringify(saved.at(-1)) === JSON.stringify(importedSettings));
    assert(!Object.hasOwn(saved.at(-1).siteOverrides, 'other.com') && saved.at(-1).siteOverrides['imported.example'] === false, 'Import should replace all site and global configuration');
    assert(control('engine').value === 'svgFilter' && control('language').value === 'en', 'Imported settings should refresh the open panel');
    assert(root().querySelector('[role="status"]').textContent === 'Configuration imported.', 'Successful import should be reported');

    const writesBeforeInvalidImport = saved.length;
    selectImportFile('{');
    await waitFor(() => root().querySelector('[role="status"]').textContent.includes('Could not import'));
    assert(saved.length === writesBeforeInvalidImport, 'Invalid files must not replace current configuration');

    let downloadHref = '';
    let downloadName = '';
    const originalAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
        if (this.hasAttribute('download')) {
            downloadHref = this.href;
            downloadName = this.download;
            return;
        }
        originalAnchorClick.call(this);
    };
    try {
        root().querySelector('[data-action="export"]').click();
        assert(downloadName === 'blackcat-settings.json', 'Export should download a named JSON file');
        const exported = await (await fetch(downloadHref)).json();
        assert(JSON.stringify(exported.settings) === JSON.stringify(importedSettings), 'Export should contain the complete current configuration');
    } finally {
        HTMLAnchorElement.prototype.click = originalAnchorClick;
    }

    clearButton.click();
    await waitFor(() => JSON.stringify(saved.at(-1)) === JSON.stringify(normalizeSettings(DEFAULT_SETTINGS)));
    assert(control('automation.mode').value === 'system', 'Clear should restore the follow-system automation default');
    assert(root().querySelectorAll('.field.changed').length === 0, 'Clear must remove every difference marker');
    assert(host(), 'Clear must not close the window');
    results.push('configuration export, replace-import, and clear');

    panel.update(normalizeSettings({language: 'en', contrast: 120}));
    assert(control('contrast').value === '120', 'Remote updates must refresh an open window');
    root().querySelector('[data-action="close"]').click();
    assert(!host(), 'Close button should remove the window');
    openSettingsPanel({settings: initial, hostname: location.hostname, onChange: async () => {}});
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    assert(!host(), 'Escape should close even when the page has focus');
    results.push('remote refresh and close lifecycle');
    return results;
}
