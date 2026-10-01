import {DEFAULT_SETTINGS, normalizeSettings, resolveSiteEnabled, resolveThemeForSite, setSiteOverride, setSiteTheme} from './settings.mjs';
import {detectLanguage, translate} from './i18n.mjs';

const HOST_ID = 'blackcat-settings-panel';

const THEME_SETTING_KEYS = [
    'engine', 'mode', 'brightness', 'contrast', 'grayscale', 'sepia', 'textStroke', 'useFont', 'fontFamily',
    'styleSystemControls', 'detectDarkTheme', 'darkSchemeBackgroundColor', 'darkSchemeTextColor',
    'lightSchemeBackgroundColor', 'lightSchemeTextColor', 'selectionColor', 'scrollbarColor',
];
const NUMERIC_THEME_KEYS = new Set(['mode', 'brightness', 'contrast', 'grayscale', 'sepia', 'textStroke']);

export function openSettingsPanel({settings, hostname, onSave, language = detectLanguage()}) {
    const t = (key, values) => translate(key, language, values);
    const themeSettings = resolveThemeForSite(settings, location.href);
    const hasSiteTheme = Object.hasOwn(settings.siteThemes, hostname.toLowerCase());
    const existing = document.getElementById(HOST_ID);
    if (existing) {
        existing.shadowRoot?.querySelector('[role="dialog"]')?.focus();
        return;
    }

    const host = document.createElement('div');
    host.id = HOST_ID;
    const shadow = host.attachShadow({mode: 'open'});
    const style = document.createElement('style');
    style.textContent = `
        :host { all: initial; color-scheme: dark; font: 14px/1.45 system-ui, sans-serif; }
        * { box-sizing: border-box; }
        .backdrop { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; padding: 16px; background: #0009; }
        .panel { width: min(560px, 100%); max-height: min(860px, 94vh); overflow: auto; padding: 22px; color: #e8e6e3; background: #181a1b; border: 1px solid #454a4d; border-radius: 12px; box-shadow: 0 12px 48px #0009; }
        h1 { margin: 0 0 16px; font-size: 20px; }
        h2 { margin: 20px 0 8px; font-size: 14px; color: #b8c0c5; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        label { display: grid; gap: 5px; margin: 9px 0; color: #d5dadd; }
        label.check { display: flex; align-items: center; gap: 9px; }
        input, select, button { color: inherit; font: inherit; }
        input[type="text"], input[type="time"], select { min-width: 0; width: 100%; padding: 8px; border: 1px solid #596168; border-radius: 6px; background: #25292c; }
        input[type="range"] { width: 100%; accent-color: #8ab4f8; }
        input[type="color"] { width: 48px; height: 30px; padding: 2px; border: 1px solid #596168; border-radius: 5px; background: #25292c; }
        input[type="checkbox"] { width: 16px; height: 16px; accent-color: #8ab4f8; }
        output { float: right; color: #aeb8bf; font-variant-numeric: tabular-nums; }
        .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 22px; }
        button { padding: 8px 14px; border: 1px solid #596168; border-radius: 6px; background: #25292c; cursor: pointer; }
        button.primary { border-color: #8ab4f8; color: #101820; background: #8ab4f8; }
        button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid #8ab4f8; outline-offset: 2px; }
        @media (max-width: 460px) { .grid { grid-template-columns: 1fr; } .panel { padding: 16px; } }
    `;

    const backdrop = document.createElement('div');
    backdrop.className = 'backdrop';
    const panel = document.createElement('section');
    panel.className = 'panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('lang', language);
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'blackcat-title');
    panel.tabIndex = -1;

    const heading = document.createElement('h1');
    heading.id = 'blackcat-title';
    heading.textContent = t('panel.title');
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    status.hidden = true;
    panel.append(heading, status);

    const form = document.createElement('form');
    const controls = {};
    const addText = (parent, text, tag = 'h2') => {
        const element = document.createElement(tag);
        element.textContent = text;
        parent.append(element);
        return element;
    };
    const addField = (parent, labelText, control) => {
        const label = document.createElement('label');
        const caption = document.createElement('span');
        caption.textContent = labelText;
        label.append(caption, control);
        parent.append(label);
        return control;
    };
    const addCheck = (parent, labelText, key, value) => {
        const label = document.createElement('label');
        label.className = 'check';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = Boolean(value);
        const caption = document.createElement('span');
        caption.textContent = labelText;
        label.append(input, caption);
        parent.append(label);
        controls[key] = input;
        return input;
    };
    const addSelect = (parent, labelText, key, value, choices) => {
        const select = document.createElement('select');
        for (const [optionValue, optionLabel] of choices) {
            const option = document.createElement('option');
            option.value = optionValue;
            option.textContent = optionLabel;
            select.append(option);
        }
        select.value = String(value);
        controls[key] = select;
        return addField(parent, labelText, select);
    };
    const addRange = (parent, labelText, key, value, min, max, step, suffix = '') => {
        const label = document.createElement('label');
        const caption = document.createElement('span');
        const output = document.createElement('output');
        const input = document.createElement('input');
        input.type = 'range';
        input.min = String(min);
        input.max = String(max);
        input.step = String(step);
        input.value = String(value);
        output.value = `${value}${suffix}`;
        input.addEventListener('input', () => {
            output.value = `${input.value}${suffix}`;
        });
        caption.textContent = labelText;
        caption.append(output);
        label.append(caption, input);
        parent.append(label);
        controls[key] = input;
    };
    const grid = document.createElement('div');
    grid.className = 'grid';

    addText(form, t('panel.enablement'));
    addCheck(form, t('panel.enabled'), 'enabled', settings.enabled);
    addCheck(form, t('panel.enabledByDefault'), 'enabledByDefault', settings.enabledByDefault);
    addCheck(form, t('panel.siteEnabled', {hostname}), 'siteEnabled', resolveSiteEnabled(settings, location.href));
    addCheck(form, t('panel.siteTheme'), 'siteThemeOnly', hasSiteTheme);

    addText(form, t('panel.theme'));
    addSelect(grid, t('panel.engine'), 'engine', themeSettings.engine, [
        ['dynamicTheme', t('engine.dynamic')],
        ['cssFilter', t('engine.filter')],
        ['svgFilter', t('engine.svgFilter')],
        ['staticTheme', t('engine.static')],
    ]);
    addSelect(grid, t('panel.colorMode'), 'mode', themeSettings.mode, [['1', t('panel.modeDark')], ['0', t('panel.modeDimmed')]]);
    form.append(grid);
    addRange(form, t('panel.brightness'), 'brightness', themeSettings.brightness, 50, 150, 1, '%');
    addRange(form, t('panel.contrast'), 'contrast', themeSettings.contrast, 50, 150, 1, '%');
    addRange(form, t('panel.grayscale'), 'grayscale', themeSettings.grayscale, 0, 100, 1, '%');
    addRange(form, t('panel.sepia'), 'sepia', themeSettings.sepia, 0, 100, 1, '%');
    addRange(form, t('panel.textStroke'), 'textStroke', themeSettings.textStroke, 0, 1, 0.1, 'px');
    addCheck(form, t('panel.useFont'), 'useFont', themeSettings.useFont);
    const font = document.createElement('input');
    font.type = 'text';
    font.maxLength = 200;
    font.value = themeSettings.fontFamily;
    controls.fontFamily = addField(form, t('panel.fontFamily'), font);
    addCheck(form, t('panel.systemControls'), 'styleSystemControls', themeSettings.styleSystemControls);
    addCheck(form, t('panel.detectDark'), 'detectDarkTheme', themeSettings.detectDarkTheme);

    addText(form, t('panel.colors'));
    const colorGrid = document.createElement('div');
    colorGrid.className = 'grid';
    for (const [key, labelText] of [
        ['darkSchemeBackgroundColor', t('panel.darkBackground')],
        ['darkSchemeTextColor', t('panel.darkText')],
        ['lightSchemeBackgroundColor', t('panel.dimmedBackground')],
        ['lightSchemeTextColor', t('panel.dimmedText')],
    ]) {
        const input = document.createElement('input');
        input.type = 'color';
        input.value = themeSettings[key].length === 4 ? `#${[...themeSettings[key].slice(1)].map((c) => c + c).join('')}` : themeSettings[key];
        controls[key] = addField(colorGrid, labelText, input);
    }
    const selection = document.createElement('input');
    selection.type = 'text';
    selection.maxLength = 9;
    selection.value = themeSettings.selectionColor;
    controls.selectionColor = addField(colorGrid, t('panel.selectionColor'), selection);
    const scrollbar = document.createElement('input');
    scrollbar.type = 'text';
    scrollbar.maxLength = 9;
    scrollbar.value = themeSettings.scrollbarColor;
    controls.scrollbarColor = addField(colorGrid, t('panel.scrollbarColor'), scrollbar);
    form.append(colorGrid);

    addText(form, t('panel.automation'));
    addSelect(form, t('panel.automationMode'), 'automationMode', settings.automation.mode, [
        ['none', t('panel.automationOff')],
        ['system', t('panel.automationSystem')],
        ['time', t('panel.automationTime')],
        ['location', t('panel.automationLocation')],
    ]);
    addSelect(form, t('panel.automationBehavior'), 'automationBehavior', settings.automation.behavior, [
        ['OnOff', t('panel.behaviorOff')],
        ['Scheme', t('panel.behaviorDimmed')],
    ]);
    const timeGrid = document.createElement('div');
    timeGrid.className = 'grid';
    const activation = document.createElement('input');
    activation.type = 'time';
    activation.value = settings.automation.activation;
    controls.activation = addField(timeGrid, t('panel.turnOnAt'), activation);
    const deactivation = document.createElement('input');
    deactivation.type = 'time';
    deactivation.value = settings.automation.deactivation;
    controls.deactivation = addField(timeGrid, t('panel.turnOffAt'), deactivation);
    form.append(timeGrid);
    const locationNote = document.createElement('p');
    locationNote.textContent = t('panel.locationNote');
    form.append(locationNote);
    const locationGrid = document.createElement('div');
    locationGrid.className = 'grid';
    const latitude = document.createElement('input');
    latitude.type = 'number';
    latitude.min = '-90';
    latitude.max = '90';
    latitude.step = 'any';
    latitude.value = settings.location.latitude ?? '';
    controls.latitude = addField(locationGrid, t('panel.latitude'), latitude);
    const longitude = document.createElement('input');
    longitude.type = 'number';
    longitude.min = '-180';
    longitude.max = '180';
    longitude.step = 'any';
    longitude.value = settings.location.longitude ?? '';
    controls.longitude = addField(locationGrid, t('panel.longitude'), longitude);
    form.append(locationGrid);

    const actions = document.createElement('div');
    actions.className = 'actions';
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = t('panel.reset');
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = t('panel.cancel');
    const save = document.createElement('button');
    save.type = 'submit';
    save.className = 'primary';
    save.textContent = t('panel.save');
    actions.append(reset, cancel, save);
    form.append(actions);
    panel.append(form);
    backdrop.append(panel);
    shadow.append(style, backdrop);
    (document.documentElement || document.body).append(host);

    const close = () => host.remove();
    cancel.addEventListener('click', close);
    backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) close();
    });
    panel.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') close();
    });
    const loadThemeControls = (source) => {
        for (const key of THEME_SETTING_KEYS) {
            const control = controls[key];
            if (control.type === 'checkbox') {
                control.checked = source[key];
            } else {
                let value = String(source[key]);
                if (control.type === 'color' && value.length === 4) {
                    value = `#${[...value.slice(1)].map((character) => character + character).join('')}`;
                }
                control.value = value;
                control.dispatchEvent(new Event('input'));
            }
        }
    };
    controls.siteThemeOnly.addEventListener('change', () => {
        loadThemeControls(controls.siteThemeOnly.checked ? resolveThemeForSite(settings, location.href) : settings);
    });
    controls.automationMode.addEventListener('change', () => {
        const mode = controls.automationMode.value;
        controls.automationBehavior.disabled = mode === 'none';
        controls.activation.disabled = mode !== 'time';
        controls.deactivation.disabled = mode !== 'time';
        controls.latitude.disabled = mode !== 'location';
        controls.longitude.disabled = mode !== 'location';
    });
    controls.automationMode.dispatchEvent(new Event('change'));
    reset.addEventListener('click', () => {
        const defaults = normalizeSettings(DEFAULT_SETTINGS);
        for (const key of ['enabled', 'enabledByDefault', 'useFont', 'styleSystemControls', 'detectDarkTheme']) {
            controls[key].checked = defaults[key];
        }
        for (const key of ['engine', 'mode', 'brightness', 'contrast', 'grayscale', 'sepia', 'textStroke', 'fontFamily', 'darkSchemeBackgroundColor', 'darkSchemeTextColor', 'lightSchemeBackgroundColor', 'lightSchemeTextColor', 'selectionColor', 'scrollbarColor']) {
            controls[key].value = String(defaults[key]);
            controls[key].dispatchEvent(new Event('input'));
        }
        controls.mode.value = String(defaults.mode);
        controls.automationMode.value = defaults.automation.mode;
        controls.automationBehavior.value = defaults.automation.behavior;
        controls.activation.value = defaults.automation.activation;
        controls.deactivation.value = defaults.automation.deactivation;
        controls.latitude.value = '';
        controls.longitude.value = '';
        controls.siteEnabled.checked = resolveSiteEnabled(defaults, location.href);
        controls.siteThemeOnly.checked = false;
        controls.automationMode.dispatchEvent(new Event('change'));
    });
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const themeValues = {};
        for (const key of THEME_SETTING_KEYS) {
            const control = controls[key];
            themeValues[key] = control.type === 'checkbox' ? control.checked :
                NUMERIC_THEME_KEYS.has(key) ? Number(control.value) : control.value;
        }
        const base = normalizeSettings({
            ...settings,
            enabled: controls.enabled.checked,
            enabledByDefault: controls.enabledByDefault.checked,
            automation: {
                ...settings.automation,
                mode: controls.automationMode.value,
                activation: controls.activation.value,
                deactivation: controls.deactivation.value,
                behavior: controls.automationBehavior.value,
            },
            location: {
                latitude: controls.latitude.value,
                longitude: controls.longitude.value,
            },
        });
        const withTheme = controls.siteThemeOnly.checked
            ? setSiteTheme(base, hostname, true, themeValues)
            : setSiteTheme(normalizeSettings({...base, ...themeValues}), hostname, false);
        const withSiteRule = setSiteOverride(withTheme, hostname, controls.siteEnabled.checked);
        save.disabled = true;
        try {
            await onSave(withSiteRule);
            close();
        } catch {
            status.hidden = false;
            status.textContent = t('panel.saveError');
        } finally {
            save.disabled = false;
        }
    });
    panel.focus();
}
