import { useRef, useState, type ChangeEvent } from 'react';
import { formatDateTime } from '../lib/format';
import { useVault } from '../state/vaultStore';
import { CheckIcon, CloudIcon, LockIcon, SyncIcon } from './icons';

interface SettingsDialogProps {
  onClose: () => void;
}

export function SettingsDialog({ onClose }: SettingsDialogProps) {
  const { settings, canSync, hasFolder, syncing, syncMessage, syncError, actions } = useVault();
  const [joinPassphrase, setJoinPassphrase] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPassphrase, setImportPassphrase] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async (task: () => Promise<void>, success?: string) => {
    setProblem(null);
    setMessage(null);
    try {
      await task();
      if (success) setMessage(success);
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const onImportFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setImportFile(file);
    setMessage(null);
    setProblem(null);
  };

  const themeOptions: Array<{ value: typeof settings.theme; label: string }> = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];

  return (
    <div
      className="modal"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Settings">
        <header className="sheet__head">
          <h2>Settings</h2>
          <button type="button" className="button button--ghost" onClick={onClose}>
            Done
          </button>
        </header>

        <div className="sheet__scroll">
          <section className="sheet__section">
            <h3>Appearance</h3>
            <div className="segmented">
              {themeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`segmented__item ${settings.theme === option.value ? 'segmented__item--active' : ''}`}
                  onClick={() => void actions.updateSettings({ theme: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className="sheet__section">
            <h3>
              <CloudIcon size={16} /> Cloud sync
            </h3>
            <p className="sheet__hint">
              Notes are encrypted on this device with AES-256-GCM, then written to a folder you
              choose. Point that folder at Dropbox, Google Drive, OneDrive, iCloud, Syncthing or any
              other provider — Plain Note never touches your account.
            </p>

            {!canSync ? (
              <p className="notice notice--warn">
                This browser cannot open folders directly. Open Plain Note in Chrome or Edge, or use
                the desktop/mobile app to enable folder sync. You can still move data with export and
                import below.
              </p>
            ) : (
              <>
                <div className="row">
                  <span className="row__label">Sync folder</span>
                  <span className="row__value">{settings.syncFolderLabel ?? 'Not set'}</span>
                </div>
                {settings.lastSyncedAt && (
                  <div className="row">
                    <span className="row__label">Last sync</span>
                    <span className="row__value">{formatDateTime(settings.lastSyncedAt)}</span>
                  </div>
                )}

                <div className="button-row">
                  {hasFolder ? (
                    <>
                      <button
                        type="button"
                        className="button button--primary"
                        disabled={syncing}
                        onClick={() => void run(async () => {
                          const result = await actions.syncNow();
                          if (result) {
                            setMessage(
                              `Synced — ${result.pulled} pulled, ${result.pushed} pushed, ${result.removed} removed.`,
                            );
                          }
                        })}
                      >
                        <SyncIcon size={15} /> {syncing ? 'Syncing…' : 'Sync now'}
                      </button>
                      <button type="button" className="button" disabled={syncing} onClick={() => void run(actions.linkFolder)}>
                        Change folder
                      </button>
                      <button type="button" className="button" disabled={syncing} onClick={() => void run(actions.unlinkFolder)}>
                        Unlink
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="button button--primary"
                      onClick={() => void run(actions.linkFolder, 'Folder linked. Run a sync to upload your notes.')}
                    >
                      <CloudIcon size={15} /> Link a sync folder
                    </button>
                  )}
                </div>

                <div className="row">
                  <label className="row__label" htmlFor="auto-sync">
                    Auto-sync
                  </label>
                  <select
                    id="auto-sync"
                    className="select"
                    value={settings.autoSyncMinutes}
                    onChange={(event) =>
                      void actions.updateSettings({ autoSyncMinutes: Number(event.target.value) })
                    }
                  >
                    <option value={0}>Off</option>
                    <option value={5}>Every 5 minutes</option>
                    <option value={15}>Every 15 minutes</option>
                    <option value={30}>Every 30 minutes</option>
                    <option value={60}>Every hour</option>
                  </select>
                </div>

                {syncMessage && <p className="notice">{syncMessage}</p>}
                {syncError && (
                  <div className="notice notice--warn">
                    <p>{syncError}</p>
                    <div className="join">
                      <input
                        className="input"
                        type="password"
                        placeholder="Vault passphrase"
                        aria-label="Passphrase for the folder vault"
                        value={joinPassphrase}
                        onChange={(event) => setJoinPassphrase(event.target.value)}
                      />
                      <button
                        type="button"
                        className="button"
                        disabled={syncing || joinPassphrase.length === 0}
                        onClick={() =>
                          void run(async () => {
                            await actions.joinFolder(joinPassphrase);
                            setJoinPassphrase('');
                          }, 'Joined the folder vault.')
                        }
                      >
                        Join folder vault
                      </button>
                    </div>
                    <p className="sheet__hint">
                      Joining replaces the notes on this device with the ones in the folder.
                    </p>
                  </div>
                )}
              </>
            )}
          </section>

          <section className="sheet__section">
            <h3>
              <LockIcon size={16} /> Data and backup
            </h3>
            <p className="sheet__hint">
              Exports stay encrypted. The passphrase is required to open them and is never stored in
              the file.
            </p>
            <div className="button-row">
              <button type="button" className="button" onClick={() => void run(actions.exportArchive, 'Encrypted vault exported.')}>
                Export encrypted vault
              </button>
              <button type="button" className="button" onClick={() => fileRef.current?.click()}>
                Import vault file
              </button>
              <button type="button" className="button" onClick={actions.exportMarkdown}>
                Export as Markdown
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={onImportFile}
            />
            {importFile && (
              <div className="join">
                <span className="row__label">{importFile.name}</span>
                <input
                  className="input"
                  type="password"
                  placeholder="Passphrase of that vault"
                  aria-label="Passphrase of the imported vault"
                  value={importPassphrase}
                  onChange={(event) => setImportPassphrase(event.target.value)}
                />
                <button
                  type="button"
                  className="button button--primary"
                  disabled={importPassphrase.length === 0}
                  onClick={() =>
                    void run(async () => {
                      const text = await importFile.text();
                      await actions.importArchive(text, importPassphrase);
                      setImportFile(null);
                      setImportPassphrase('');
                      if (fileRef.current) fileRef.current.value = '';
                    }, 'Vault imported.')
                  }
                >
                  Import
                </button>
              </div>
            )}
            {message && (
              <p className="notice notice--ok">
                <CheckIcon size={14} /> {message}
              </p>
            )}
            {problem && <p className="notice notice--warn">{problem}</p>}
          </section>

          <section className="sheet__section">
            <h3>Security</h3>
            <p className="sheet__hint">
              Locking clears the encryption key from memory. You will need your passphrase again.
            </p>
            <button
              type="button"
              className="button"
              onClick={() => {
                actions.lock();
                onClose();
              }}
            >
              <LockIcon size={15} /> Lock now
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
