# GTA Mobile Pack

🌐 **[🇧🇷 Ler em Português](README.md)**

A browser extension (Manifest V3) for playing **GTA V** on Android phones. It bundles three things in a single package:

| Module | File | What it does |
|---|---|---|
| On-screen console | `debug-console.js` | A 🐞 button that shows and copies the browser log without needing DevTools |
| Compatibility fixes | `gta-memory64-fix.js` | Fixes `WebAssembly.Memory`, workers, BC textures and shaders using `clip_distances` |
| Virtual gamepad | `virtual-gamepad.js` | Xbox-style on-screen gamepad with an editable layout |

> **Disclaimer:** unofficial project, not affiliated with Rockstar Games or Take-Two. The pack contains no game files. It only changes how the browser behaves on the page.

---

## Requirements

- Android with a browser that supports extensions, such as **Kiwi Browser** or a Chromium build with extension support.
- A browser with **WebGPU** and **WebAssembly Memory64** enabled.
- Plenty of free memory. The game uses about 2.2 GB of WebAssembly memory, so close other tabs and background apps.

---

## Installation

1. Download the `.zip` from the [Releases](../../releases) page (or use **Code → Download ZIP**).
2. Extract the `gta-mobile-pack` folder.
3. In the browser, open `chrome://extensions` (or `kiwi://extensions`).
4. Turn on **Developer mode**.
5. Tap **Load unpacked** and select the extracted folder.
6. Open the game page and reload it.

> Whenever you update the files, tap **reload** on the extension and then reload the game page.

---

## Usage

### On-screen console (🐞)

The 🐞 button appears in a corner of the screen. Tapping it opens the log panel:

- **Copiar** (Copy): copies the whole log to the clipboard so you can paste it into an issue or chat.
- **So erros** (Errors only): toggles between showing everything and showing only errors.
- **Limpar** (Clear): clears the log on screen.
- **Fechar** (Close): closes the panel.

The console keeps the last 600 lines and also captures worker errors and rejected promises.

> The panel buttons are in Portuguese in the current version.

### Virtual gamepad

A *Standard Gamepad* (Xbox layout) with analog sticks, d-pad, A/B/X/Y, LB/RB, LT/RT, L3/R3, Back/Start and a center button. The top buttons are:

- 🎮 show or hide the gamepad;
- ⚙️ open settings;
- ⛶ fullscreen.

In settings you can adjust:

- gamepad **opacity**;
- **overall size**;
- **virtual keyboard** (on-screen key mode);
- **hide the Android keyboard** while the gamepad is active;
- **automatic fullscreen** on first tap;
- **Edit positions**: drag each button wherever you like. **Reset positions** restores the default layout.

Settings are saved in the site's `localStorage`.

> The settings labels are in Portuguese in the current version.

### Compatibility fixes

They run automatically, no action needed. What they do:

1. **Memory64:** if the browser requires `BigInt` or `Number` for memory limits, the pack converts them. If the browser supports it natively, nothing is changed.
2. **Workers:** re-injects the fix into every Worker, including nested ones, and adjusts the base URL for scripts and `fetch` inside `blob:` workers.
3. **BC textures (optional):** GPUs without `texture-compression-bc` (for example, Mali) use an uncompressed format. Textures end up empty, which is enough to get the game past loading.
4. **`clip_distances`:** if the GPU lacks the `clip-distances` feature, the pack requests it when available, or strips `clip_distances` from the WGSL shaders (no user clip planes). This prevents invalid pipelines.

---

## Configuration

At the top of `gta-memory64-fix.js` there is a `CFG` object:

| Option | Default | Description |
|---|---|---|
| `MAX_PAGES_CAP` | `65536` | Cap for the memory `maximum`, in 64 KiB pages (65536 = 4 GiB). `0` disables the cap. |
| `BC_FALLBACK` | `true` | Enables the BC texture fallback. |
| `CLIP_FALLBACK` | `true` | Enables `clip_distances` handling. |
| `BC_TINY` | `true` | BC textures become 4×4 without mipmaps, saving a lot of memory. |
| `LOG_GROW` | `true` | Logs every `memory.grow` (and failures) to the console. |
| `FORCE` | `false` | Applies the memory patch even if the browser already supports it. |
| `DEBUG` | `true` | Shows the `[GTA Fix:...]` logs. |

---

## Troubleshooting

**`memory access out of bounds - this looks like a lack of memory`**
The game used almost all available memory (its arena is around 2.2 GB). Close other tabs, restart the browser before playing, and lower texture quality and traffic/pedestrian density in the game settings.

**`clip_distances` or `structure constructor has too many inputs` errors**
Check that the extension is active and that `[GTA Fix:worker]` lines appear in the console. If they don't, the extension was not injected: reload the extension and the page. If you see `Sobrou clip_distances em ...`, open an issue with that line.

**The fix stops working after a reload**
Enable **Preserve log** in DevTools so the pack's lines aren't lost on reload. Look for `Worker #N interceptado` or `inline NAO patchado`.

**Warnings that are not from the pack and can be ignored:** `Texture ... not found`, `... doesn't exist`, parser warnings (`pausemenu.xml`, `defaulttasks.ymt.pso`), missing audio files and `NetworkAssertf FAILED` (multiplayer).

---

## Reporting a bug

Open an issue including:

1. Device model, GPU (if known), Android version and browser version.
2. Pack version (the `version` field in `manifest.json`).
3. The log copied with the 🐞 button, especially the `[GTA Fix:...]` lines and the errors right before the failure.
4. What you were doing when it crashed.

---

## Structure

```
gta-mobile-pack/
├── manifest.json          # Extension configuration (MV3)
├── debug-console.js       # On-screen 🐞 console
├── gta-memory64-fix.js    # Fixes for Memory64, workers, BC textures and clip_distances
└── virtual-gamepad.js     # Virtual gamepad
```

The scripts run in the *MAIN world* with `run_at: document_start`, i.e. before any page script. The console and the fixes apply only to the game's site (see `matches` in `manifest.json`). The virtual gamepad is configured for all pages (`<all_urls>`); to restrict it, edit `matches` in `manifest.json`.

---

## Known limitations

- The game has an internal memory limit that the pack cannot raise.
- Without `texture-compression-bc`, textures are empty.
- Without `clip-distances`, some clipping effects (glass, clouds, particles) may look slightly different.
- Behavior depends on the browser and GPU. Not every device will run it.

---

## License

Set your repository's license (for example, MIT) by adding a `LICENSE` file.
