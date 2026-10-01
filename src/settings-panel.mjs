import {normalizeSettings} from './settings.mjs';
import {resolveLanguage, translate} from './i18n.mjs';
import {changePanelSetting, getPanelValue, isPanelSettingChanged} from './settings-panel-state.mjs';
import {MAX_SETTINGS_FILE_BYTES, parseSettingsFile, serializeSettingsFile} from './settings-file.mjs';
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
    let activeTab = 'site';
    let revision = 0;
    let storageError = false;
    let fileNotice = null;
    const controls = new Set();
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
    for (const [key, label] of [['site', 'panel.siteTab'], ['global', 'panel.theme']]) {
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
        status.hidden = !invalid && !storageError && !fileNotice;
        status.textContent = invalid ? t('panel.invalidInput') : storageError ? t('panel.saveError') : fileNotice ? t(fileNotice) : '';
    };
    const valid = (control) => {
        if (!control.validity.valid) return false;
        return control.type !== 'time' || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(control.value);
    };
    const readValue = (control) => {
        if (control.type === 'checkbox') return control.checked;
        if (control.type === 'range') return Number(control.value);
        if (control.type === 'number') return control.value === '' ? null : Number(control.value);
        return control.value;
    };
    const commit = (next, notice = null) => {
        current = next;
        fileNotice = notice;
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
        const scope = options.scope || 'global';
        const field = element('label', type === 'range' ? 'field stack' : 'field', parent);
        const caption = element('span', 'caption', field);
        message(element('span', '', caption), labelKey);
        const control = element(type === 'select' ? 'select' : 'input', '', field);
        control.dataset.setting = key;
        control.dataset.scope = scope;
        control.name = key;
        control.id = `blackcat-control-${scope}-${key.replaceAll('.', '-')}`;
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
        controls.add(control);
        const applyValue = () => {
            if (!valid(control)) {
                control.setAttribute('aria-invalid', 'true');
                control.closest('.field').classList.remove('changed');
                updateStatus();
                return;
            }
            control.removeAttribute('aria-invalid');
            commit(changePanelSetting(current, hostname, key, readValue(control), scope));
        };
        if (type === 'range') {
            const output = field.querySelector('output');
            control.addEventListener('input', () => {
                if (valid(control)) output.value = `${readValue(control)}%`;
            });
            control.addEventListener('change', applyValue);
        } else {
            const inputEvent = ['text', 'number'].includes(type) ? 'input' : 'change';
            control.addEventListener(inputEvent, applyValue);
        }
        return control;
    };
    const addCheck = (parent, key, label, options = {}) => addControl(parent, key, label, 'checkbox', options);
    const addSelect = (parent, key, label, choices, options = {}) => addControl(parent, key, label, 'select', {...options, choices});
    const hint = (parent, key) => message(element('p', 'hint', parent), key);
    const condition = (parent, value, setting = 'automation.mode') => {
        const group = element('div', '', parent);
        group.dataset.condition = value;
        group.dataset.conditionSetting = setting;
        return group;
    };
    const section = (parent, titleKey) => {
        const group = element('section', 'settings-section', parent);
        message(element('h2', 'section-title', group), titleKey);
        return group;
    };
    const addThemeControls = (parent, scope, includeDarkPageDetection = true) => {
        const scoped = {scope};
        addSelect(parent, 'engine', 'panel.engine', [['dynamicTheme', 'engine.dynamic'], ['cssFilter', 'engine.filter'], ['svgFilter', 'engine.svgFilter'], ['staticTheme', 'engine.static']], scoped);
        for (const [key, min, max] of [['brightness', 50, 150], ['contrast', 50, 150], ['grayscale', 0, 100], ['sepia', 0, 100]]) {
            addControl(parent, key, `panel.${key}`, 'range', {min, max, step: 1, ...scoped});
        }
        if (includeDarkPageDetection) addCheck(parent, 'detectDarkTheme', 'panel.detectDark', scoped);
    };

    const globalSettings = pages.get('global');
    const general = section(globalSettings, 'panel.general');
    addCheck(general, 'enabledByDefault', 'panel.enabledByDefault');
    addCheck(general, 'detectDarkTheme', 'panel.detectDark');
    const theme = section(globalSettings, 'panel.globalTheme');
    addThemeControls(theme, 'global', false);

    const site = pages.get('site');
    const siteName = element('div', 'field site-name', site);
    message(element('span', 'caption', siteName), 'panel.currentSite');
    element('span', 'site-hostname', siteName).textContent = hostname;
    const siteEnabled = addCheck(site, 'siteEnabled', 'panel.siteEnabledShort');
    const globalRequired = hint(site, 'panel.globalRequired');
    globalRequired.dataset.globalRequired = '';
    addSelect(site, 'siteStyleMode', 'panel.siteStyle', [['global', 'panel.siteStyleFollowGlobal'], ['independent', 'panel.siteStyleIndependent']]);
    const independentStyle = condition(site, 'independent', 'siteStyleMode');
    message(element('p', 'subsection-title', independentStyle), 'panel.independentStyleSettings');
    addThemeControls(independentStyle, 'site');

    const automation = section(globalSettings, 'panel.automation');
    addSelect(automation, 'automation.mode', 'panel.automationMode', [['none', 'panel.automationOff'], ['system', 'panel.automationSystem'], ['time', 'panel.automationTime'], ['location', 'panel.automationLocation']]);
    const schedule = condition(automation, 'time');
    addControl(schedule, 'automation.activation', 'panel.turnOnAt', 'time');
    addControl(schedule, 'automation.deactivation', 'panel.turnOffAt', 'time');
    hint(schedule, 'panel.timeHelp');
    const coordinates = condition(automation, 'location');
    addControl(coordinates, 'location.latitude', 'panel.latitude', 'number', {min: -90, max: 90, step: 'any'});
    addControl(coordinates, 'location.longitude', 'panel.longitude', 'number', {min: -180, max: 180, step: 'any'});
    hint(coordinates, 'panel.locationNote');

    const other = section(globalSettings, 'panel.other');
    addSelect(other, 'language', 'panel.language', [['auto', 'panel.languageAuto'], ['en', 'panel.languageEnglish'], ['zh-CN', 'panel.languageChinese']]);
    const configActions = element('div', 'config-actions', other);
    message(element('span', 'config-label', configActions), 'panel.configFile');
    const configButtons = element('div', 'config-buttons', configActions);
    const actionButton = (action, label) => {
        const button = message(element('button', 'config-button', configButtons), label);
        button.type = 'button';
        button.dataset.action = action;
        return button;
    };
    const exportButton = actionButton('export', 'panel.export');
    const importButton = actionButton('import', 'panel.import');
    const clearButton = actionButton('clear', 'panel.clear');
    const configFileInput = element('input', '', configActions);
    configFileInput.type = 'file';
    configFileInput.accept = '.json,application/json';
    configFileInput.hidden = true;
    configFileInput.tabIndex = -1;
    configFileInput.dataset.action = 'import-file';
    message(element('p', 'config-warning', other), 'panel.importWarning');
    message(element('p', 'config-warning', other), 'panel.clearWarning');

    const clearInvalidControls = () => {
        for (const control of controls) control.removeAttribute('aria-invalid');
    };
    exportButton.addEventListener('click', () => {
        let url;
        let link;
        try {
            const blob = new Blob([serializeSettingsFile(current)], {type: 'application/json'});
            if (blob.size > MAX_SETTINGS_FILE_BYTES) throw new RangeError('Configuration is too large');
            url = URL.createObjectURL(blob);
            link = document.createElement('a');
            link.href = url;
            link.download = 'blackcat-settings.json';
            link.style.position = 'fixed';
            link.style.left = '-10000px';
            (document.body || document.documentElement).append(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            fileNotice = 'panel.exportSuccess';
        } catch {
            link?.remove();
            if (url) URL.revokeObjectURL(url);
            fileNotice = 'panel.exportError';
        }
        updateStatus();
    });
    importButton.addEventListener('click', () => configFileInput.click());
    configFileInput.addEventListener('change', async () => {
        const file = configFileInput.files?.[0];
        configFileInput.value = '';
        if (!file) return;
        try {
            if (file.size > MAX_SETTINGS_FILE_BYTES) throw new RangeError('Configuration is too large');
            const imported = parseSettingsFile(await file.text());
            clearInvalidControls();
            commit(imported, 'panel.importSuccess');
        } catch {
            fileNotice = 'panel.importError';
            updateStatus();
        }
    });
    clearButton.addEventListener('click', () => {
        clearInvalidControls();
        commit(changePanelSetting(current, hostname, 'initialize'), 'panel.clearSuccess');
    });

    function refresh() {
        panel.lang = resolveLanguage(current.language);
        for (const {node, key, values} of messages) node.textContent = t(key, values);
        closeButton.setAttribute('aria-label', t('panel.close'));
        tabList.setAttribute('aria-label', t('panel.sections'));
        siteEnabled.disabled = !current.enabled;
        globalRequired.hidden = current.enabled;
        for (const control of controls) {
            if (control.getAttribute('aria-invalid') === 'true') continue;
            const {setting: key, scope} = control.dataset;
            const value = getPanelValue(current, hostname, key, scope);
            if (control.type === 'checkbox') control.checked = value;
            else control.value = value === null ? '' : String(value);
            const field = control.closest('.field');
            field.classList.toggle('changed', isPanelSettingChanged(current, hostname, key, scope));
            const output = field.querySelector('output');
            if (output) output.value = `${value}%`;
        }
        for (const group of body.querySelectorAll('[data-condition]')) {
            group.hidden = group.dataset.condition !== getPanelValue(current, hostname, group.dataset.conditionSetting);
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
            fileNotice = null;
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
