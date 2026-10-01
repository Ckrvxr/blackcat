export const PANEL_STYLE = `
    :host { all: initial !important; position: fixed !important; top: 16px !important; right: 16px !important;
        width: min(384px, calc(100vw - 32px)) !important; z-index: 2147483647 !important; pointer-events: none !important;
        color-scheme: dark !important; font: 14px/1.5 system-ui, -apple-system, sans-serif !important; }
    *, *::before, *::after { box-sizing: border-box; }
    [hidden] { display: none !important; }
    .panel { pointer-events: auto; display: flex; flex-direction: column; max-height: min(720px, calc(100vh - 32px));
        max-height: min(720px, calc(100dvh - 32px)); overflow: hidden; color: #e9edf2; background: #181c23;
        border: 1px solid #353d49; border-radius: 18px; box-shadow: 0 16px 56px #0006, 0 2px 8px #0004; }
    .panel:focus { outline: none; }
    header { display: flex; align-items: center; gap: 10px; padding: 18px 18px 14px; }
    .brand { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 10px; background: #2a3546; color: #b4d0ff; font-size: 18px; font-weight: 600; }
    h1 { margin: 0; font-size: 16px; font-weight: 600; letter-spacing: .1px; }
    .subtitle { margin: 0; font-size: 12px; color: #a8b4c5; }
    button, input, select { font: inherit; color: inherit; }
    button { cursor: pointer; }
    .close { margin-left: auto; width: 32px; height: 32px; padding: 0; font-size: 23px; border: 0; border-radius: 8px; background: transparent; color: #a8b4c5; }
    .close:hover { color: #fff; background: #2a303b; }
    .tabs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin: 0 18px 14px; padding: 4px; border-radius: 10px; background: #10141b; }
    .tab { min-width: 0; padding: 7px 2px; font-size: 13px; border: 0; border-radius: 7px; background: transparent; color: #a8b4c5; }
    .tab[aria-selected="true"] { background: #2a3546; color: #d8e6ff; }
    .body { min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 0 18px 12px; scrollbar-width: thin; scrollbar-color: #465163 transparent; }
    .scope, .site-name { padding: 9px 12px; border: 1px solid #303a49; border-radius: 9px; background: #202733; color: #b4d0ff; font-size: 12px; margin: 0 0 12px; overflow-wrap: anywhere; }
    .site-name { color: #e9edf2; font-size: 14px; }
    .field { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin: 0; padding: 9px 0; border-bottom: 1px solid #ffffff0d; }
    .caption { font-weight: 400; color: #dbe2ec; min-width: 0; }
    .field.changed > .caption { font-weight: 700; color: #fff; }
    .field.stack { display: grid; grid-template-columns: minmax(0, 1fr); justify-content: stretch; gap: 6px; padding: 8px 0; }
    .field.stack > .caption { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .field.stack > .caption output { font-size: 12px; font-weight: 400; color: #b4d0ff; font-variant-numeric: tabular-nums; }
    select, input[type="text"], input[type="number"], input[type="time"] { width: 156px; min-width: 0; max-width: 54%; border: 1px solid #414b5b;
        border-radius: 7px; padding: 6px 8px; background: #222936; font-size: 13px; }
    select { padding-right: 3px; }
    input[type="range"] { width: 100%; margin: 0; accent-color: #9dc2ff; cursor: pointer; }
    input[type="checkbox"] { appearance: none; flex-shrink: 0; position: relative; width: 34px; height: 20px; border: 1px solid #667184;
        margin: 0; border-radius: 12px; background: #343e4d; cursor: pointer; }
    input[type="checkbox"]::before { content: ''; position: absolute; top: 3px; left: 3px; width: 12px; height: 12px;
        border-radius: 50%; background: #c1cad6; transition: transform .12s; }
    input[type="checkbox"]:checked { background: #9dc2ff; border-color: #9dc2ff; }
    input[type="checkbox"]:checked::before { background: #17263b; transform: translateX(14px); }
    .hint { margin: 8px 0 12px; color: #a8b4c5; font-size: 12px; line-height: 1.6; }
    .other-action { display: flex; justify-content: flex-end; margin-top: 12px; padding-top: 12px; border-top: 1px solid #ffffff0d; }
    .initialize { padding: 6px 10px; border: 1px solid #414b5b; border-radius: 7px; background: transparent; font-size: 12px; color: #c4cfdf; }
    .initialize:hover { background: #29313e; color: #fff; }
    .status { margin: 0; padding: 10px 18px; font-size: 12px; color: #ffb4b4; background: #42282e; }
    :is(button, input, select):focus-visible { outline: 2px solid #9dc2ff; outline-offset: 3px; }
    [aria-invalid="true"] { border-color: #ffa8a8 !important; }
    @media (max-width: 420px) { :host { top: 8px !important; right: 8px !important; width: calc(100vw - 16px) !important; }
        .panel { max-height: calc(100dvh - 16px); border-radius: 14px; }
        header { padding-top: 14px; } }
    @media (prefers-reduced-motion: reduce) { input[type="checkbox"]::before { transition: none; } }
`;
