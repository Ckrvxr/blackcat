import {openSettingsPanel} from '../src/settings-panel.mjs';
import {DEFAULT_SETTINGS, normalizeSettings, toThemeOptions} from '../src/settings.mjs';
import {getPanelValue} from '../src/settings-panel-state.mjs';

// Runs against real DOM controls in Chromium, not a mock DOM.
export async function runPanelBrowserTests() {
    const results = [];
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const host = () => document.querySelector('#blackcat-settings-panel');
    const root = () => host().shadowRoot;
    const control = (key) => root().querySelector(`[data-setting="${key}"]`);
    const change = async (key, value) => {
        const input = control(key);
        assert(input, `Missing setting: ${key}`);
        if (input.type === 'checkbox') input.checked = value;
        else input.value = String(value);
        input.dispatchEvent(new Event(input.type === 'range' || input.type === 'text' || input.type === 'number' || input.type === 'color' ? 'input' : 'change', {bubbles: true}));
        await Promise.resolve();
    };
    const saved = [];
    let failWrite = false;
    const initial = normalizeSettings({language: 'en', siteOverrides: {'other.com': false}, siteThemes: {'other.com': {brightness: 85}}});
    host()?.remove();
    const panel = openSettingsPanel({settings: initial, hostname: location.hostname, onChange: async (next) => {
        if (failWrite) throw new Error('test write failure');
        saved.push(next);
    }});
    assert(root().querySelectorAll('[role="tab"]').length === 4, 'Four tabs are required');
    assert(root().querySelectorAll('footer button').length === 1, 'Only initialization belongs in the footer');
    assert(!root().querySelector('.backdrop, [aria-modal="true"], button[type="submit"]'), 'The window must be nonmodal with no save/cancel flow');
    const bounds = root().querySelector('[role="dialog"]').getBoundingClientRect();
    assert(bounds.right <= innerWidth && bounds.top >= 0 && bounds.top < 40, 'The window must stay at top right');
    results.push('nonmodal floating layout and four tabs');

    for (const key of [...Object.keys(toThemeOptions(DEFAULT_SETTINGS)), 'enabled', 'enabledByDefault', 'siteEnabled', 'siteThemeOnly', 'language', 'automation.mode', 'automation.behavior', 'automation.activation', 'automation.deactivation', 'location.latitude', 'location.longitude']) {
        assert(control(key), `Existing setting was lost: ${key}`);
        assert(control(key).labels?.length > 0, `Unlabelled control: ${key}`);
    }
    results.push('all settings retained with labels');

    for (const [key, value] of [
        ['mode', 0], ['engine', 'cssFilter'], ['contrast', 120], ['grayscale', 30], ['sepia', 25],
        ['styleSystemControls', true], ['detectDarkTheme', false], ['darkSchemeBackgroundColor', '#202124'],
        ['darkSchemeTextColor', '#eeeeee'], ['lightSchemeBackgroundColor', '#cccccc'], ['lightSchemeTextColor', '#222222'],
        ['scrollbarColor', '#abc'], ['enabled', false], ['enabledByDefault', false], ['siteEnabled', false],
        ['automation.behavior', 'Scheme'], ['automation.deactivation', '08:30'],
    ]) {
        await change(key, value);
        assert(getPanelValue(saved.at(-1), location.hostname, key) === value, `Setting failed to persist: ${key}`);
        assert(control(key).closest('.field').classList.contains('changed'), `Nondefault value was not marked: ${key}`);
    }
    panel.update(initial);
    results.push('each remaining setting applies without a save button');

    const themeTab = root().querySelector('[data-tab="theme"]');
    themeTab.focus();
    themeTab.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}));
    assert(root().querySelector('[data-tab="site"]').getAttribute('aria-selected') === 'true', 'Arrow keys must move between tabs');
    root().querySelector('[data-tab="theme"]').click();
    results.push('keyboard tab navigation');

    await change('brightness', 115);
    assert(saved.at(-1).brightness === 115, 'Slider must persist without save');
    assert(control('brightness').closest('.field').classList.contains('changed'), 'Changed slider label must become bold');
    assert(getComputedStyle(control('brightness').closest('.field').querySelector('.caption')).fontWeight === '700', 'Changed caption must have bold computed style');
    await change('brightness', 100);
    assert(!control('brightness').closest('.field').classList.contains('changed'), 'Factory value must remove bold');
    assert(getComputedStyle(control('brightness')).width === getComputedStyle(control('brightness').closest('.field')).width, 'Sliders must use the full row width');
    assert(getComputedStyle(root().querySelector('[role="dialog"]')).fontFamily.includes('system-ui'), 'Page fonts must not leak into the UI');
    results.push('immediate slider writes and factory-relative bold');

    await change('siteThemeOnly', true);
    await change('brightness', 85);
    assert(saved.at(-1).brightness === 100, 'Site edits must not change global appearance');
    assert(saved.at(-1).siteThemes[location.hostname].brightness === 85, 'Site edits must persist in this site');
    await change('siteThemeOnly', false);
    assert(control('brightness').value === '100', 'Leaving site scope must restore global controls');
    assert(saved.at(-1).siteThemes['other.com'].brightness === 85, 'Other sites must remain intact');
    results.push('site scope isolation');

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

    await change('selectionColor', '#abc');
    assert(saved.at(-1).selectionColor === '#abc', 'Short hex is supported');
    const beforeColor = saved.length;
    await change('selectionColor', '#zzzzzz');
    assert(saved.length === beforeColor, 'Invalid hex must not be persisted');
    await change('selectionColor', 'auto');
    assert(!control('selectionColor').closest('.field').classList.contains('changed'), 'Automatic selection must not be bold');
    results.push('color validation without unwanted resets');

    root().querySelector('[data-tab="general"]').click();
    await change('language', 'zh-CN');
    assert(root().querySelector('[role="dialog"]').lang === 'zh-CN', 'Language must update while the panel stays open');
    assert(root().querySelector('[data-tab="general"]').textContent === '通用', 'Tab labels must translate immediately');
    assert(root().querySelector('[data-page="general"]').hidden === false, 'Language change must retain the active tab');
    results.push('live language changes');

    failWrite = true;
    await change('enabled', false);
    await Promise.resolve();
    assert(!root().querySelector('[role="status"]').hidden, 'Write errors must be visible');
    failWrite = false;
    await change('enabled', true);
    await Promise.resolve();
    assert(root().querySelector('[role="status"]').hidden, 'Successful retry should clear errors');
    results.push('storage error feedback and recovery');

    root().querySelector('[data-action="initialize"]').click();
    await Promise.resolve();
    assert(JSON.stringify(saved.at(-1)) === JSON.stringify(normalizeSettings(DEFAULT_SETTINGS)), 'Initialize must clear all global and site settings');
    assert(root().querySelectorAll('.field.changed').length === 0, 'Initialize must clear every bold marker');
    assert(host(), 'Initialization must not close the window');
    results.push('complete initialization');

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
