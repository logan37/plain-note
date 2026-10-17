# Plain Note

A tiny, fast, encrypted notes app — like Google Keep, but leaner, easier to search, and it syncs
through **your own** cloud folder instead of ours.

- **First line is the title.** The first line of every note renders as a bold title on the card and
  in the editor; the rest is the body.
- **Encrypted on device.** Notes are sealed with AES-256-GCM using a key derived from your passphrase
  with PBKDF2-SHA256 (310k iterations). The key never leaves the device.
- **Bring your own storage.** Pick any folder (Dropbox, Google Drive, OneDrive, iCloud, Syncthing, a
  NAS…). Plain Note writes encrypted `.enc` files into it; your provider syncs them for you.
- **Built for searching.** Instant, ranked search across titles, bodies and `#tags`, with match
  highlighting.
- **Organise lightly.** Tags, pinning and favourites.
- **Lightweight.** React + Vite, no UI framework, one small runtime dependency (`idb`).
  Android builds ship a single arm64 APK (no universal multi-ABI blob, no PWA worker).
- **Runs as a PWA, a Windows app, and an Android app** (Tauri 2).

---

## Quick start (web / PWA)

```bash
npm install
npm run icons      # generates icons into public/ and src-tauri/icons/
npm run dev        # http://localhost:5173
```

Production build and preview:

```bash
npm run build
npm run preview
```

Install it as an app from Chrome/Edge ("Install app") to get an offline-capable PWA.

## Sync model

```
your-cloud-folder/
├── plainnote.vault        # plaintext header: KDF params + salt (no secrets)
└── notes/
    ├── <note-id>.enc      # AES-256-GCM(iv ‖ ciphertext) of one note
    └── …
```

- The same passphrase on every device derives the same key from the vault salt.
- Sync is **last-write-wins by `updatedAt`**; deletions are kept as tombstones for 30 days so they
  propagate everywhere, then purged.
- Linking a folder that already belongs to a different vault offers a **Join folder vault** action,
  which re-keys this device to that vault.
- Browsers without the File System Access API (Firefox/Safari) can still move data with
  **Export encrypted vault / Import vault file**.

## Verify

```bash
npm run typecheck
npm run build
```

---

## Desktop (Windows) and Android via Tauri

Tauri produces a small native binary and shares the exact same frontend.

Prerequisites (not bundled):

- [Rust](https://rustup.rs) (1.77.2+)
- Windows: WebView2 (preinstalled on Windows 11) and the MSVC build tools
- Android: JDK 17+, Android SDK + NDK, and `ANDROID_HOME`/`NDK_HOME` set

Commands:

```bash
npm run tauri dev                 # live desktop window
npm run tauri build               # MSI + NSIS installers in src-tauri/target/release/bundle

# Android (keep the APK lean — one ABI, release, no PWA worker)
npx tauri android init            # once
npm run icons                     # regenerate icons + sync into Android mipmaps
npm run android:dev               # arm64 device/emulator
npm run android:build             # arm64 release APK (~split-per-abi)
```

`android:build` runs `tauri android build --apk --split-per-abi --target aarch64`.
Install the **arm64-v8a** APK on a real phone. A universal APK that bundles every ABI
is several times larger and is not what you want for a lightweight notes app.

Debug APKs are also much larger (unstripped native libs) — always prefer release for size checks.

The `src-tauri/capabilities/default.json` grants the filesystem plugin access to `$HOME`,
`$DOCUMENT`, `$DOWNLOAD`, `$DESKTOP`, `$APPDATA` and `$LOCALDATA` so the folder picker can read and
write your sync folder. Narrow those paths if you want a tighter scope.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + K` | Focus search |
| `Ctrl/Cmd + N` | New note |
| `Esc` | Clear search / close editor |

Search supports `#tag` tokens, e.g. `invoice #work march`.

## Project layout

```
src/
├─ App.tsx                 # routing between onboarding / unlock / workspace
├─ components/             # UI (cards, editor, settings, auth screens)
├─ lib/
│  ├─ crypto.ts            # PBKDF2 + AES-256-GCM helpers (WebCrypto)
│  ├─ db.ts                # IndexedDB (encrypted blobs at rest)
│  ├─ vault.ts             # vault lifecycle + note CRUD
│  ├─ search.ts            # query parsing, ranking, filtering
│  ├─ text.ts              # first-line-title, highlighting, tag normalising
│  ├─ portable.ts          # encrypted vault export/import, Markdown export
│  └─ sync/
│     ├─ platform.ts       # File System Access (browser) / Tauri fs backends
│     └─ engine.ts         # pull/merge/push with tombstones
└─ state/vaultStore.tsx    # React context store wiring it all together
```

## Security notes

- The passphrase is never stored. "Stay unlocked for 30 days" stores the raw derived key in
  `localStorage` on that device only — skip it on shared machines.
- IndexedDB holds only ciphertext; notes are decrypted into memory while unlocked and wiped on lock.
- A forgotten passphrase cannot be recovered. Keep an **Export encrypted vault** copy somewhere safe.

## License

MIT
