# Playing on a Chromebook

The game is a WebAssembly + WebGL2 page, so it runs in Chrome on ChromeOS with no install and no ROM.

## Requirements
- ChromeOS with a current Chrome (WebAssembly, WebGL2, Gamepad API). Almost every Chromebook from the last ~6 years qualifies.
- Hardware acceleration on (Settings > System). If WebGL2 is unavailable the page shows a message (check `chrome://gpu`).
- ~1 GB free RAM for the tab. 4 GB devices work; see low-spec mode below.

## What the page does for Chromebooks (`ports/soh/chromebook.js`, injected by `make_site.py`)
- **Low-spec mode**: automatic when `navigator.deviceMemory <= 4` (or ChromeOS with 2 cores or fewer): no MSAA, 480 px internal height.
  `?q=high` forces full quality, `?q=low` forces low-spec. An explicit `?dev=` list wins.
- **Esc conflict**: ChromeOS uses Esc to leave fullscreen. **Tab opens the SoH menu** too; in fullscreen the Keyboard Lock API passes Esc to the game (hold Esc to leave).
- **Fullscreen button** (top right).
- **Capability check**: a readable message instead of a blank page when WebGL2/WebAssembly is missing.
- Chromebook keyboards have no numpad or reliable F-keys; the default map (WASD, X, C, Z, Space, arrows, TFGH) uses none.
- USB/Bluetooth gamepads work through the Gamepad API.

## Not verified yet
Only the injected script was tested (headless Chromium with a CrOS user agent: Tab -> Escape, fullscreen button, info bar).
The full game was **not** run on real ChromeOS hardware from this session. Please check on a Chromebook:
frame rate on the title and in Hyrule Field, audio, and whether the touchscreen shell controls appear in tablet mode.
Low-spec mode uses `gMSAAValue` and `gAdvancedResolution.*` CVars; if the fork names differ it simply has no effect.
