# Blackcat Dark Reader Userscript

Blackcat adapts Dark Reader's page-rendering engines for userscript managers. The project is MIT-licensed; the installed userscript is a small settings/manager adapter, while the Dark Reader engine is delivered as a separate static asset under its upstream license.

**Status: beta.** The current build bundles all four upstream rendering engines (dynamic, CSS filter, SVG filter, static), upstream site-fix databases, persistent per-site enablement and theme overrides, system/time/location automation with turn-off/dimmed-scheme behavior, and a settings panel. Extension DevTools editors/custom theme presets and browser-specific PDF/restricted-page behavior are not ported yet. Language defaults to the browser locale (Simplified Chinese for `zh-*`, English otherwise) and can be overridden in the settings panel. Cross-origin stylesheet/image analysis uses normal page `fetch` and is therefore subject to page CORS; the script deliberately does not request blanket `GM_xmlhttpRequest` access. Real-browser testing has confirmed Chromium with Tampermonkey; Tampermonkey for Safari and Violentmonkey still need verification.

## Build

Requirements: Node.js 22+ and pnpm 10.22.0.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test:artifact
pnpm verify:reproducible
```

`pnpm build` fetches Dark Reader only if the exact pinned source checkout is not already present. `upstream.json` records the source commit and version; an existing checkout with a different revision or local modifications makes the build fail. Build dependencies are pinned in `package.json` and `pnpm-lock.yaml`; lifecycle scripts are disabled through `.npmrc`.

The repository's own adapter/build code is covered by `LICENSE`; the upstream engine's separate MIT notice is shipped as `dist/DARK-READER-LICENSE.txt`.

The generated assets are:

- `dist/blackcat.user.js` — installable userscript and settings adapter.
- `dist/engine.js` — minified Dark Reader engine loaded by `@require`.
- `dist/upstream.json` and `dist/DARK-READER-LICENSE.txt` — provenance and upstream license.

For a tagged release, build with the tag that will contain the resulting assets, verify those tag-pinned assets, then commit `dist/` and create the tag on that commit:

```sh
pnpm check
pnpm build -- --ref=v0.1.0
pnpm test:artifact
pnpm verify:reproducible -- --ref=v0.1.0
```

The install script pins both `@require` and update URLs to the same ref. The default `main` ref is intended for development only. Do not install the development build before its assets are published.

## Install

After a release is published, open `dist/blackcat.user.js` from GitHub in Tampermonkey or Violentmonkey and confirm installation. Its metadata loads `dist/engine.js` from jsDelivr at the same immutable tag. It requires only userscript storage/menu APIs; it does not request broad cross-origin `GM_xmlhttpRequest` access.

## Settings

Open **More settings** from the existing userscript menu. The nonmodal window sits at the top right and can be closed with × or Escape; the page remains interactive.

- **Theme**: color mode, all four rendering engines, brightness/contrast/grayscale/sepia, system controls, dark-page detection, and collapsible advanced colors.
- **Site**: enablement and a separate theme for the current hostname. The theme tab indicates whether you are editing global or site-only values.
- **Automation**: system preference, local-time schedule, or sunrise/sunset from manually entered coordinates. Only controls relevant to the selected mode are shown.
- **General**: global enablement, default site policy, and interface language.

Valid changes apply immediately and are automatically persisted. Slider writes are serialized and coalesced so an older write cannot overwrite the final value. Invalid input is highlighted and does not change stored settings. A storage failure is shown in the window; change the option again to retry. There are no save/cancel actions. Bold option labels mark values different from factory defaults, including site-specific values. **Initialize** restores all defaults, including language and automation, and clears every saved site configuration.

For real Chromium tests, install `agent-browser` and its Chromium runtime, then run:

```sh
pnpm build
pnpm test:browser
```

The browser tests cover the actual DOM controls and generated adapter, all rendering engines, live language changes, persistence failures, initialization, and narrow-window layout. They use a localhost fixture, not an installed userscript-manager extension; Safari Tampermonkey and Violentmonkey still need separate verification.

## Reproducibility and auditing

Run `pnpm verify:reproducible` to build twice and compare SHA-256-identical outputs. The engine identifies the exact Dark Reader source commit in its banner and in `dist/upstream.json`; the upstream source and MIT license remain available from that commit. `dist/` is generated output and must be rebuilt—not hand-edited—before publication.

The GitHub repository can serve the assets through jsDelivr. Published tags must never be moved or reused; a Git tag is technically mutable, so enable tag protection/immutable releases where available and publish checksums for the generated files.
