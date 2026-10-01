import {normalizeSettings} from './settings.mjs';
import {resolveLanguage, translate} from './i18n.mjs';
import {changePanelSetting, getPanelValue, isPanelSettingChanged} from './settings-panel-state.mjs';
import {PANEL_STYLE} from './settings-panel-style.mjs';

const HOST_ID = 'blackcat-settings-panel';
let activePanel = null;

export function openSettingsPanel({settings, hostname, onChange}) {
    if (activePanel?.host.isConnected) {
        activePanel.focus();
        return activePanel;
    }
    activePanel?.close();
    hostname = hostname.toLowerCase();
    let current = normalizeSettings(settings);
    let activeTab = 'theme';
    let revision = 0;
    let storageError = false;
    const controls = new Map();
    const messages = [];
    const pages = new Map();
    const tabs = new Map();
    const t = (key, values) => translate(key, resolveLanguage(current.language), values);
    const element = (tag, className, parent) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        parent?.append(node);
        return node;
    };
    const message = (node, key, values) => {
        messages.push({node, key, values});
        node.textContent = t(key, values);
        return node;
    };
    const host = element('div');
    host.id = HOST_ID;
    const shadow = host.attachShadow({mode: 'open'});
    // The UI is already dark; exclude its stylesheet from Dark Reader recoloring.
    const style = element('style', 'darkreader darkreader--blackcat-ui', shadow);
    style.textContent = PANEL_STYLE;
    const panel = element('section', 'panel', shadow);
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-labelledby', 'blackcat-title');
    panel.tabIndex = -1;
    const header = element('header', '', panel);
    element('span', 'brand', header).textContent = 'B';
    const title = element('div', '', header);
    const heading = element('h1', '', title);
    heading.id = 'blackcat-title';
    heading.textContent = 'Blackcat';
    message(element('p', 'subtitle', title), 'panel.subtitle');
    const closeButton = element('button', 'close', header);
    closeButton.type = 'button';
    closeButton.dataset.action = 'close';
    closeButton.textContent = '×';
    const tabList = element('nav', 'tabs', panel);
    tabList.setAttribute('role', 'tablist');
    const body = element('div', 'body', panel);
    const status = element('p', 'status', panel);
    status.setAttribute('role', 'status');
    status.hidden = true;

    const selectTab = (name, focus = false) => {
        activeTab = name;
        for (const [key, tab] of tabs) {
            const selected = key === name;
            tab.setAttribute('aria-selected', String(selected));
            tab.tabIndex = selected ? 0 : -1;
            pages.get(key).hidden = !selected;
        }
        body.scrollTop = 0;
        if (focus) tabs.get(name).focus();
    };
    for (const [key, label] of [['theme', 'panel.theme'], ['site', 'panel.siteTab'], ['automation', 'panel.automation'], ['other', 'panel.other']]) {
        const tab = message(element('button', 'tab', tabList), label);
        tab.type = 'button';
        tab.dataset.tab = key;
        tab.id = `blackcat-tab-${key}`;
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-controls', `blackcat-page-${key}`);
        const page = element('div', '', body);
        page.id = `blackcat-page-${key}`;
        page.dataset.page = key;
        page.setAttribute('role', 'tabpanel');
        page.setAttribute('aria-labelledby', tab.id);
        tabs.set(key, tab);
        pages.set(key, page);
        tab.addEventListener('click', () => selectTab(key));
        tab.addEventListener('keydown', (event) => {
            const names = [...tabs.keys()];
            let index = names.indexOf(key);
            if (event.key === 'ArrowRight') index = (index + 1) % names.length;
            else if (event.key === 'ArrowLeft') index = (index + names.length - 1) % names.length;
            else if (event.key === 'Home') index = 0;
            else if (event.key === 'End') index = names.length - 1;
            else return;
            event.preventDefault();
            selectTab(names[index], true);
        });
    }

    const updateStatus = () => {
        const invalid = [...controls.values()].some((control) => control.getAttribute('aria-invalid') === 'true');
        status.hidden = !invalid && !storageError;
        status.textContent = invalid ? t('panel.invalidInput') : storageError ? t('panel.saveError') : '';
    };
    const valid = (control) => {
        const key = control.dataset.setting;
        if (!control.validity.valid) return false;
        return control.type !== 'time' || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(control.value);
    };
    const readValue = (control) => {
        if (control.type === 'checkbox') return control.checked;
        if (control.type === 'range') return Number(control.value);
        if (control.type === 'number') return control.value === '' ? null : Number(control.value);
        return control.value;
    };
    const commit = (next) => {
        current = next;
        const version = ++revision;
        refresh();
        // The adapter applies synchronously and returns its queued storage completion.
        try {
            Promise.resolve(onChange(current)).then(() => {
                if (version === revision) { storageError = false; updateStatus(); }
            }, () => {
                if (version === revision) { storageError = true; updateStatus(); }
            });
        } catch {
            storageError = true;
            updateStatus();
        }
    };
    const addControl = (parent, key, labelKey, type, options = {}) => {
        const field = element('label', type === 'range' ? 'field stack' : 'field', parent);
        const caption = element('span', 'caption', field);
        message(element('span', '', caption), labelKey);
        const control = element(type === 'select' ? 'select' : 'input', '', field);
        control.dataset.setting = key;
        control.name = key;
        control.id = `blackcat-control-${key}`;
        field.htmlFor = control.id;
        if (type === 'select') {
            for (const [value, label] of options.choices) {
                const option = message(element('option', '', control), label);
                option.value = value;
            }
        } else {
            control.type = type;
            for (const attribute of ['min', 'max', 'step', 'maxLength']) {
                if (options[attribute] !== undefined) control[attribute] = options[attribute];
            }
            if (type === 'range') element('output', '', caption);
        }
        controls.set(key, control);
        const inputEvent = ['range', 'text', 'number'].includes(type) ? 'input' : 'change';
        control.addEventListener(inputEvent, () => {
            if (!valid(control)) {
                control.setAttribute('aria-invalid', 'true');
                control.closest('.field').classList.remove('changed');
                updateStatus();
                return;
            }
            control.removeAttribute('aria-invalid');
            commit(changePanelSetting(current, hostname, key, readValue(control)));
        });
        return control;
    };
    const addCheck = (parent, key, label) => addControl(parent, key, label, 'checkbox');
    const addSelect = (parent, key, label, choices) => addControl(parent, key, label, 'select', {choices});
    const hint = (parent, key) => message(element('p', 'hint', parent), key);
    const condition = (parent, value) => {
        const group = element('div', '', parent);
        group.dataset.condition = value;
        return group;
    };

    const theme = pages.get('theme');
    const scope = element('p', 'scope', theme);
    addSelect(theme, 'engine', 'panel.engine', [['dynamicTheme', 'engine.dynamic'], ['cssFilter', 'engine.filter'], ['svgFilter', 'engine.svgFilter'], ['staticTheme', 'engine.static']]);
    for (const [key, min, max] of [['brightness', 50, 150], ['contrast', 50, 150], ['grayscale', 0, 100], ['sepia', 0, 100]]) {
        addControl(theme, key, `panel.${key}`, 'range', {min, max, step: 1});
    }
    addCheck(theme, 'styleSystemControls', 'panel.systemControls');
    addCheck(theme, 'detectDarkTheme', 'panel.detectDark');

    const site = pages.get('site');
    element('p', 'site-name', site).textContent = hostname;
    addCheck(site, 'siteEnabled', 'panel.siteEnabledShort');
    hint(site, 'panel.siteEnabledHelp');
    addCheck(site, 'siteThemeOnly', 'panel.siteThemeShort');
    hint(site, 'panel.siteThemeHelp');

    const automation = pages.get('automation');
    addSelect(automation, 'automation.mode', 'panel.automationMode', [['none', 'panel.automationOff'], ['system', 'panel.automationSystem'], ['time', 'panel.automationTime'], ['location', 'panel.automationLocation']]);
    const schedule = condition(automation, 'time');
    addControl(schedule, 'automation.activation', 'panel.turnOnAt', 'time');
    addControl(schedule, 'automation.deactivation', 'panel.turnOffAt', 'time');
    hint(schedule, 'panel.timeHelp');
    const coordinates = condition(automation, 'location');
    addControl(coordinates, 'location.latitude', 'panel.latitude', 'number', {min: -90, max: 90, step: 'any'});
    addControl(coordinates, 'location.longitude', 'panel.longitude', 'number', {min: -180, max: 180, step: 'any'});
    hint(coordinates, 'panel.locationNote');

    const other = pages.get('other');
    addSelect(other, 'language', 'panel.language', [['auto', 'panel.languageAuto'], ['en', 'panel.languageEnglish'], ['zh-CN', 'panel.languageChinese']]);
    hint(other, 'panel.defaultsHelp');
    const initializeDescription = hint(other, 'panel.initializeHelp');
    initializeDescription.id = 'blackcat-initialize-help';
    const initialize = message(element('button', 'initialize', element('div', 'other-action', other)), 'panel.reset');
    initialize.type = 'button';
    initialize.dataset.action = 'initialize';
    initialize.setAttribute('aria-describedby', initializeDescription.id);
    initialize.addEventListener('click', () => {
        for (const control of controls.values()) control.removeAttribute('aria-invalid');
        commit(changePanelSetting(current, hostname, 'initialize'));
    });

    const footer = element('footer', '', panel);
    message(element('span', 'live-note', footer), 'panel.live');

    function refresh() {
        panel.lang = resolveLanguage(current.language);
        for (const {node, key, values} of messages) node.textContent = t(key, values);
        closeButton.setAttribute('aria-label', t('panel.close'));
        tabList.setAttribute('aria-label', t('panel.sections'));
        initialize.title = t('panel.initializeHelp');
        scope.textContent = t(getPanelValue(current, hostname, 'siteThemeOnly') ? 'panel.scopeSite' : 'panel.scopeGlobal');
        for (const [key, control] of controls) {
            if (control.getAttribute('aria-invalid') === 'true') continue;
            const value = getPanelValue(current, hostname, key);
            if (control.type === 'checkbox') control.checked = value;
            else control.value = value === null ? '' : String(value);
            const field = control.closest('.field');
            field.classList.toggle('changed', isPanelSettingChanged(current, hostname, key));
            const output = field.querySelector('output');
            if (output) output.value = `${value}%`;
        }
        for (const group of body.querySelectorAll('[data-condition]')) {
            group.hidden = group.dataset.condition !== current.automation.mode;
        }
        updateStatus();
    }
    const onEscape = (event) => {
        if (event.key === 'Escape') { event.preventDefault(); close(); }
    };
    const previousFocus = document.activeElement;
    const close = () => {
        const hadFocus = Boolean(shadow.activeElement);
        document.removeEventListener('keydown', onEscape, true);
        host.remove();
        if (activePanel === api) activePanel = null;
        if (hadFocus && previousFocus?.isConnected) previousFocus.focus();
    };
    const api = {
        host,
        close,
        focus: () => panel.focus(),
        update: (next) => {
            if (!host.isConnected) return;
            const normalized = normalizeSettings(next);
            if (JSON.stringify(normalized) === JSON.stringify(current)) return;
            current = normalized;
            ++revision;
            storageError = false;
            for (const control of controls.values()) control.removeAttribute('aria-invalid');
            refresh();
        },
    };
    closeButton.addEventListener('click', close);
    panel.addEventListener('click', (event) => event.stopPropagation());
    panel.addEventListener('keydown', (event) => event.stopPropagation());
    document.addEventListener('keydown', onEscape, true);
    selectTab(activeTab);
    refresh();
    (document.documentElement || document.body).append(host);
    activePanel = api;
    panel.focus();
    return api;
}
