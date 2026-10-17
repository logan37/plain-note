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

## Building

```bash
npm install
npm run build            # web app (PWA) into dist/
npm run tauri build      # Windows installers (.msi, NSIS .exe) + plain-note.exe
npm run android:build    # Android APK (arm64)
```

Building for Android requires JDK 17, the Android SDK/NDK and a Rust toolchain with the
`aarch64-linux-android` target. On Windows the Tauri CLI cannot create the `jniLibs`
symlink; copy `libplain_note_lib.so` into
`src-tauri/gen/android/app/src/main/jniLibs/arm64-v8a/` and run
`gradlew.bat assembleRelease` instead.

## Releases and distribution

### Android signing

Release APKs are signed with the project key (kept out of the repo):

- keystore: `C:\Users\Logan\keystores\plain-note.keystore` (alias `plainnote`)
- password: `C:\Users\Logan\keystores\plain-note.keystore.pass`

**Back the keystore and password up.** Losing them means you can no longer publish updates
under the same app identity. Sign a built APK with:

```bash
zipalign -p 4 app-arm64-release-unsigned.apk aligned.apk
apksigner sign --ks plain-note.keystore --ks-key-alias plainnote \
  --out plain-note_0.1.0_arm64-v8a.apk aligned.apk
```

Release assets must be named `plain-note_<version>_arm64-v8a.apk` so the F-Droid
`Binaries` pattern below resolves (`%v` is the version). Publish with:

```bash
gh auth login
gh release create v0.1.0 \
  --title "Plain Note 0.1.0" --notes-file fastlane/metadata/android/en-US/changelogs/1000.txt \
  plain-note_0.1.0_arm64-v8a.apk \
  "src-tauri/target/release/bundle/nsis/Plain Note_0.1.0_x64-setup.exe" \
  "src-tauri/target/release/bundle/msi/Plain Note_0.1.0_x64_en-US.msi"
```

### F-Droid

Store listing and build metadata live in the repo:

- `fastlane/metadata/android/en-US/` - title, short/full description, changelog, feature
  graphic and phone screenshots.
- `fdroid/app.plainnote.yml` - recipe for the official F-Droid repository (source build).
- `fdroid/izzy/app.plainnote.yml` - recipe for IzzyOnDroid, which ships the signed APK from
  the GitHub release via `Binaries:`.

The Tauri source-build recipe is a starting point and has not yet been validated on an
F-Droid build server; IzzyOnDroid (which uses the prebuilt, signed APK) is the quicker route.

## License

MIT
