# Blackcat Dark Reader Userscript

Blackcat adapts Dark Reader's page-rendering engines for userscript managers. The MIT-licensed install script is self-contained: it bundles the settings adapter and all four Dark Reader engines. Dark Reader remains under its upstream MIT license.

**Status: beta.** The current build bundles all four upstream rendering engines (dynamic, CSS filter, SVG filter, static), upstream site-fix databases, persistent per-site enablement and theme overrides, system/time/location automation that turns the dark theme on or off, and a settings panel. Extension DevTools editors/custom theme presets and browser-specific PDF/restricted-page behavior are not ported yet. Language defaults to the browser locale (Simplified Chinese for `zh-*`, English otherwise) and can be overridden in the settings panel. Cross-origin stylesheet/image analysis uses normal page `fetch` and is therefore subject to page CORS; the script deliberately does not request blanket `GM_xmlhttpRequest` access. Real-browser testing has confirmed Chromium with Tampermonkey; Tampermonkey for Safari and Violentmonkey still need verification.

## Build

Requirements: Node.js 22.12+ and pnpm 10.22.0.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test:artifact
pnpm verify:reproducible
```

`pnpm build` fetches Dark Reader only if the exact pinned source checkout is not already present. Root `upstream.json` records the source commit and version; an existing checkout with a different revision or local modifications makes the build fail. Build dependencies, including Vite, are pinned in `package.json` and `pnpm-lock.yaml`; the Vite IIFE build asserts that it emits only one JavaScript file. Lifecycle scripts are disabled through `.npmrc`.

The repository's adapter/build code is covered by `LICENSE`. The install script's banner identifies Dark Reader's upstream version, MIT license, and source revision; `dist/` contains only the installable file:

- `dist/blackcat.user.js` — single-file, self-contained userscript; it has no runtime `@require` dependency.

For a tagged release, build with the tag that will contain the resulting assets, verify those tag-pinned assets, then commit `dist/` and create the tag on that commit:

```sh
pnpm check
pnpm build -- --ref=v0.1.0
pnpm test:artifact
pnpm verify:reproducible -- --ref=v0.1.0
```

The install script pins its update and download URLs to the same ref. The default `main` ref is intended for development only. Do not install the development build before its assets are published.

## Install

After a release is published, open `dist/blackcat.user.js` from GitHub in Tampermonkey or Violentmonkey and confirm installation. The adapter and rendering engine are bundled in one file, removing the external CDN `@require` and its cold install/update fetch. Since managers may cache required scripts, this does not guarantee a large per-navigation speedup. The script still requires userscript storage/menu APIs and does not request broad cross-origin `GM_xmlhttpRequest` access. `document-start` injection timing remains manager- and browser-dependent.

## Settings

Open **All settings** from the existing userscript menu. The nonmodal window sits at the top right and can be closed with × or Escape; the page remains interactive.

- **Global settings**: General (all-sites default enablement and skip-already-dark detection), global style controls (four rendering engines and brightness/contrast/grayscale/sepia), automation (system, schedule, or sunrise/sunset), interface language, and JSON configuration actions. The theme is always dark; color-palette editing is not exposed.
- **Site settings**: enablement and a choice to follow the global style or use an independent style for the current hostname. Independent settings start as a copy of the global style, then persist when switching back to global. Site enablement is unavailable while the global switch is off.

The global master switch remains in the userscript menu; when it is off, the per-site toggle menu command is hidden and the site switch is disabled with a prompt to turn the master switch on. Automation only enables or disables the dark theme, and only controls relevant to the selected mode are shown.

Valid changes apply immediately and are automatically persisted. Sliders update their readout while dragging, then apply and save the value on release. Storage writes are serialized so older writes cannot overwrite newer values. Invalid input is highlighted and does not change stored settings. A storage failure is shown in the window; change the option again to retry. There are no save/cancel actions. Bold option labels mark values different from factory defaults, including site-specific values. In Other, Export downloads a versioned JSON backup of all settings, Import validates and replaces the full current configuration, and Clear restores defaults and deletes all saved site configuration. Warnings for import and clear appear below these actions.

For real Chromium tests, install `agent-browser` and its Chromium runtime, then run:

```sh
pnpm build
pnpm test:browser
```

The browser tests cover the actual DOM controls and generated adapter, all rendering engines, live language changes, persistence failures, configuration export/import/clear, and narrow-window layout. They use a localhost fixture, not an installed userscript-manager extension; Safari Tampermonkey and Violentmonkey still need separate verification.

## Reproducibility and auditing

Run `pnpm verify:reproducible` to build twice and compare the installer byte-for-byte. Its banner identifies the Dark Reader version, MIT license, and exact source commit; root `upstream.json` pins the source. `dist/` is generated output and must be rebuilt—not hand-edited—before publication.

The GitHub repository can serve the assets through jsDelivr. Published tags must never be moved or reused; a Git tag is technically mutable, so enable tag protection/immutable releases where available and publish checksums for the generated files.
